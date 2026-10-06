import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './game';
import { brandOf, settleBrand } from './brand';
import { creditLimit } from './credit';
import { drillQuote } from './drilling';
import { quotaInForce, setHotOil, settleBreakup, settleHotOil, settleIncomeTax, taxableProfit } from './lawEffects';
import { lawRule } from './laws';
import { fixedCosts, settleStorage, spillOver, storageCapacity } from './logistics';
import { pipelineWorldOf } from './bigPipeline';
import { quotaFactor } from './production';
import { wageIndex } from './staff';
import type { Balance } from './balance';
import { loadBalance } from './testBalance';
import { newWorld } from './world';

const balance = loadBalance();
const steuer = balance.laws.find((l) => l.id === 'income_tax')!;

/** Spielstand mit beschlossenem Gesetz (oder ohne). */
function mitGesetz(ids: string[], cash = 10_000): GameState {
  const g = newGame('steuer', balance);
  const w = g.worldModel ?? newWorld('steuer', balance.worldModel);
  const bills = { ...w.laws.bills };
  for (const id of ids) bills[id] = { stage: 'passed', pressure: 0, voteIn: 0, cooldown: 0, proposals: 1, passedRound: 1, lastVote: 0.6, weakened: false, lobbyVote: 0 };
  return { ...g, cash, worldModel: { ...w, laws: { ...w.laws, bills } } };
}

describe('Einkommensteuer (0.4.20+17)', () => {
  it('steht mit 5 % im Gesetz', () => {
    expect(steuer.effects.rules.incomeTax).toBe(0.05);
  });

  it('nimmt den Steuersatz vom Gewinn der Runde – nicht bei Verlust, ohne Gesetz gar nicht', () => {
    const vorher = mitGesetz(['income_tax'], 10_000);
    const nachher = { ...vorher, cash: 14_000 };
    expect(taxableProfit(vorher, nachher)).toBe(4_000);
    const r = settleIncomeTax(vorher, nachher, balance);
    expect(r.cash).toBe(14_000 - 4_000 * 0.05);
    expect(r.log.at(-1)).toContain('Einkommensteuer');
    expect(settleIncomeTax(vorher, { ...vorher, cash: 9_000 }, balance).cash).toBe(9_000);
    const frei = mitGesetz([], 10_000);
    expect(settleIncomeTax(frei, { ...frei, cash: 14_000 }, balance).cash).toBe(14_000);
  });

  it('geliehenes Geld ist kein Gewinn', () => {
    const vorher = mitGesetz(['income_tax'], 10_000);
    const nachher: GameState = { ...vorher, cash: 14_000, loans: [...vorher.loans, { ...(vorher.loans[0] ?? {}), principal: 4_000 } as GameState['loans'][number]] };
    expect(taxableProfit(vorher, nachher)).toBeLessThanOrEqual(0.01);
  });
});

const regel = (id: string, k: string) => (balance.laws.find((l) => l.id === id)!.effects.rules as Record<string, number>)[k];

describe('Wirkung der neuen Gesetze (0.4.20+18)', () => {
  it('höhere Einkommensteuer legt drauf, der Steuerabzug stellt einen Teil steuerfrei', () => {
    const vorher = mitGesetz(['income_tax', 'income_tax_raise', 'depletion_allowance'], 10_000);
    const r = settleIncomeTax(vorher, { ...vorher, cash: 20_000 }, balance);
    const satz = regel('income_tax', 'incomeTax') + regel('income_tax_raise', 'incomeTaxAdd');
    expect(r.cash).toBeCloseTo(20_000 - 10_000 * (1 - regel('depletion_allowance', 'depletionAllowance')) * satz, 2);
    // Ohne Einkommensteuer wirken Erhöhung und Abzug nicht.
    const ohne = mitGesetz(['income_tax_raise', 'depletion_allowance'], 10_000);
    expect(settleIncomeTax(ohne, { ...ohne, cash: 20_000 }, balance).cash).toBe(20_000);
  });

  it('Bankaufsicht kürzt den Bankrahmen, Gewerkschaftsgesetz hebt Löhne, Umweltgesetze verteuern Bohren', () => {
    const frei = mitGesetz([]);
    expect(creditLimit(mitGesetz(['bank_supervision']), balance)).toBeLessThan(creditLimit(frei, balance));
    expect(wageIndex(mitGesetz(['labour_act']), balance)).toBeCloseTo(wageIndex(frei, balance) * (1 + regel('labour_act', 'wageRise')), 9);
    const mitGespann = (g: GameState): GameState => ({ ...g, logistics: { ...g.logistics, teams: 2 } });
    expect(fixedCosts(mitGespann(mitGesetz(['labour_act'])), balance).wages).toBeCloseTo(fixedCosts(mitGespann(frei), balance).wages * (1 + regel('labour_act', 'wageRise')), 6);
    const parzelle = frei.parcels[0].id;
    expect(drillQuote(mitGesetz(['environment']), balance, parzelle).cost).toBe(Math.round(drillQuote(frei, balance, parzelle).cost * (1 + regel('environment', 'drillCostRise'))));
  });

  it('Umweltgesetze: Lagern teurer, Bußgeld je ausgelaufenem Barrel', () => {
    const lager = (g: GameState): GameState => ({ ...g, oilStock: 1_000 });
    const frei = settleStorage(lager(mitGesetz([], 50_000)), balance);
    const auflagen = settleStorage(lager(mitGesetz(['environment'], 50_000)), balance);
    expect(auflagen.cash).toBeLessThan(frei.cash);
    const voll = (g: GameState): GameState => ({ ...g, oilStock: storageCapacity(g, balance) + 1_000 });
    const auslauf = spillOver(voll(mitGesetz(['environment'], 50_000)), balance);
    expect(auslauf.cash).toBeCloseTo(50_000 - 1_000 * regel('environment', 'spillFine'), 2);
    expect(spillOver(voll(mitGesetz([], 50_000)), balance).cash).toBe(50_000);
  });

  it('Transportpflicht öffnet die Fernleitungen (commonCarrier)', () => {
    expect(pipelineWorldOf(mitGesetz([]), balance).commonCarrier).toBe(false);
    expect(pipelineWorldOf(mitGesetz(['transport_duty']), balance).commonCarrier).toBe(true);
  });

  it('Förderquoten: Quote einhalten drosselt, heißes Öl fördert voll – findet der Inspektor es, kostet es je Barrel', () => {
    const q = mitGesetz(['production_quota']);
    expect(quotaInForce(q, balance)).toBe(true);
    expect(quotaFactor(q, balance)).toBe(regel('production_quota', 'quotaShare'));
    expect(quotaFactor(mitGesetz([]), balance)).toBe(1);
    const heiss = setHotOil(q, balance, true);
    expect(heiss.hotOil).toBe(true);
    expect(quotaFactor(heiss, balance)).toBe(1);
    expect(setHotOil(mitGesetz([]), balance, true).hotOil).toBeUndefined();
    // Über viele Runden: mal erwischt, mal nicht; erwischt = Überförderung × Bußgeld.
    let erwischt = 0;
    for (let runde = 1; runde <= 200; runde++) {
      const s = { ...heiss, round: runde, cash: 10_000 };
      const r = settleHotOil(s, balance, 1_000);
      if (r.cash < 10_000) {
        erwischt += 1;
        expect(r.cash).toBeCloseTo(10_000 - 1_000 * (1 - regel('production_quota', 'quotaShare')) * regel('production_quota', 'quotaFine'), 2);
      }
    }
    expect(erwischt / 200).toBeGreaterThan(regel('production_quota', 'quotaCatch') - 0.1);
    expect(erwischt / 200).toBeLessThan(regel('production_quota', 'quotaCatch') + 0.1);
    // Wer die Quote einhält, zahlt nie.
    expect(settleHotOil({ ...q, cash: 10_000 }, balance, 1_000).cash).toBe(10_000);
  });

  it('Kartellgesetz: über der Zerschlagungsschwelle verkauft Jacob die Hälfte der Tankstellen in seiner stärksten Region', () => {
    const streng: Balance = {
      ...balance,
      laws: balance.laws.map((l) => (l.id === 'antitrust' ? { ...l, effects: { ...l.effects, rules: { ...l.effects.rules, breakupFrom: 0.001 } } } : l)),
    };
    const g = { ...mitGesetz(['antitrust'], 50_000), chapter: 3 } as GameState;
    const b = brandOf(g, streng);
    const mitNetz = settleBrand({ ...g, brand: { ...b, founded: true, regions: { ...b.regions, cordova: { ...b.regions.cordova, stations: 8 } } } }, streng);
    const r = settleBreakup(mitNetz, streng);
    expect(r.brand!.regions.cordova.stations).toBe(4);
    expect(r.cash).toBeGreaterThan(mitNetz.cash);
    expect(settleBreakup(mitNetz, balance).brand!.regions.cordova.stations).toBe(8);
  });

  it('lawRule liest die Regel geltender Gesetze, sonst den Ersatzwert', () => {
    expect(lawRule(mitGesetz([]), balance.laws, 'creditLimit', 1)).toBe(1);
    expect(lawRule(mitGesetz(['bank_supervision']), balance.laws, 'creditLimit', 1)).toBe(regel('bank_supervision', 'creditLimit'));
    expect(lawRule({}, balance.laws, 'wageRise')).toBe(0);
  });
});
