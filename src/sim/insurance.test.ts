import { describe, expect, it } from 'vitest';
import { DEAL_HANDLERS, dealsOf, insuranceClaim, insurancePremium, insuredAssets, recentClaims } from './deals';
import { advanceDrilling, type Well } from './drilling';
import { newGame, type GameState } from './game';
import { bookCard } from './plans';
import { buyRig } from './rigs';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const katalog = loadEvents();
const b = balance.deals;

function start(seed: string, patch: Partial<GameState> = {}): GameState {
  return { ...newGame(seed, balance, katalog), ...patch };
}

function buche(s: GameState, card: string, target?: string): GameState {
  const r = bookCard(s, balance, katalog, card, target);
  if (!r.ok) throw new Error(`${card}: ${r.reason}`);
  return r.state;
}

describe('Versicherung ab Kapitel 1 (GDD §8: Feuer, Blowout, Turmschaden, Unfallgeschichte)', () => {
  it('die Karte liegt schon in Kapitel 1 auf der Hand; Prämie mit kleinerem Grundbetrag', () => {
    const s0 = start('vers-k1', { cash: 5000 });
    expect(DEAL_HANDLERS.versicherung.lock!(s0, balance)).toBeNull();
    const s = buche(s0, 'versicherung', '4');
    expect(dealsOf(s).insurance!.until).toBe(s0.round + 3);
    const tanks = s0.logistics.tanks * balance.transport.storage.tankCost;
    expect(insurancePremium(s0, balance)).toBe(Math.round(b.insurance.firstChapterBase + b.insurance.share * tanks));
    expect(insurancePremium({ ...s0, chapter: 2 }, balance)).toBe(Math.round(b.insurance.base + b.insurance.share * tanks));
  });

  it('eigene Türme zählen zum Anlagenwert', () => {
    const ohne = start('vers-turm', { cash: 10000 });
    const r = buyRig(ohne, balance);
    if (!r.ok) throw new Error(r.reason);
    expect(insuredAssets(r.state, balance) - insuredAssets(ohne, balance)).toBe(balance.drilling.rigs.buy.cost);
  });

  it('Unfallgeschichte: jeder versicherte Schaden der letzten Runden macht neue Verträge teurer', () => {
    const s = buche(start('vers-hist', { cash: 5000 }), 'versicherung', '4');
    const vorher = insurancePremium(s, balance);
    const nach = insuranceClaim(s, balance, 500, 'Test');
    expect(nach.cash).toBeCloseTo(s.cash + 500 * b.insurance.cover, 2);
    expect(recentClaims(nach, balance)).toBe(1);
    expect(insurancePremium(nach, balance)).toBe(Math.round(vorher * (1 + b.insurance.history.raise)));
    expect(recentClaims({ ...nach, round: nach.round + b.insurance.history.rounds }, balance)).toBe(0);
    // Ohne Vertrag zahlt niemand, und die Geschichte bleibt leer.
    const ohne = start('vers-hist');
    expect(insuranceClaim(ohne, balance, 500, 'Test')).toBe(ohne);
  });

  it('Bohrunfall (Blowout): die Versicherung zahlt cover der Entschädigung', () => {
    const s0 = buche(start('vers-unfall', { cash: 5000 }), 'versicherung', '4');
    const parcel = s0.parcels.find((p) => !p.discovery && !p.sure)!;
    const well: Well = { id: `${parcel.id}#1`, parcelId: parcel.id, stage: 1, status: 'drilling', roundsLeft: 1, spent: 0, oilStage: null, startRound: 1 };
    // Jede Stufe endet sicher mit einem Unfall.
    const unfall = { ...balance, drilling: { ...balance.drilling, stages: balance.drilling.stages.map((x) => ({ ...x, accident: 1 })) } };
    const ohne = advanceDrilling({ ...start('vers-unfall', { cash: 5000 }), wells: [well] }, unfall);
    expect(ohne.cash).toBe(5000 - balance.drilling.accidentCost);
    const mit = advanceDrilling({ ...s0, wells: [well] }, unfall);
    expect(mit.cash - s0.cash).toBeCloseTo(-balance.drilling.accidentCost * (1 - b.insurance.cover), 2);
    expect(dealsOf(mit).claims).toEqual([s0.round]);
  });
});
