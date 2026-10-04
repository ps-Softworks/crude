import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, type Balance } from './balance';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import {
  adjustMix,
  advanceRefinery,
  buildRefinery,
  crudeVsRefined,
  demandFactor,
  expandRefinery,
  isRefineryState,
  newRefinery,
  normalizeMix,
  ownsRefinery,
  planRun,
  plannedCrude,
  productDemand,
  productPrice,
  PRODUCTS,
  refineryAssets,
  refineryCapacity,
  refineryFeedCost,
  refineryStatus,
  refineryTech,
  refineryUnlockedFor,
  refineryWorld,
  setRefineryIntake,
  setRefineryMix,
  unlockRefinery,
  type RefineryResult,
  type RefineryWorld,
} from './refinery';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const R = balance.refinery;
const bounds = refineryTech(balance, 1).mix;

function ok(r: RefineryResult): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Spiel mit freigeschalteter Raffinerie und genug Geld. */
function kapitel2(extra: Partial<GameState> = {}, seed = 'raffinerie'): GameState {
  return unlockRefinery({ ...newGame(seed, balance), cash: 1_000_000, ...extra }, balance);
}

/** Spiel mit fertiger Raffinerie (Stufe level). */
function fertig(level = 1, extra: Partial<GameState> = {}): GameState {
  const s = kapitel2(extra);
  return { ...s, refinery: { ...s.refinery!, level } };
}

const welt: RefineryWorld = { year: R.products.kerosene.trend.refYear, tech: R.worldDefaults.tech, tension: R.worldDefaults.tension, war: false, demand: 1 };

describe('Raffinerie: Spielzahlen (balance.yaml)', () => {
  it('lädt den Block refinery mit Stufe I Destillation', () => {
    expect(R.techs[0].label).toBe('Destillation');
    expect(R.unlockChapter).toBe(2);
    expect(PRODUCTS.every((p) => R.products[p].basePrice > 0)).toBe(true);
  });

  it('Benzin ist bei Stufe I Nebenprodukt um 20 % (GDD §6)', () => {
    expect(bounds.gasoline.max).toBeLessThanOrEqual(0.2);
    expect(bounds.gasoline.min).toBeGreaterThan(0);
  });

  it('meldet einen kaputten Block als BalanceError', () => {
    const raw = rawBalance() as Record<string, any>;
    expect(() => parseBalance({ ...raw, refinery: undefined })).toThrow(BalanceError);
    const kaputt = structuredClone(raw);
    kaputt.refinery.techs[0].mix.kerosene.min = 0.9;
    expect(() => parseBalance(kaputt)).toThrow(/mix/);
    const mixFalsch = structuredClone(raw);
    mixFalsch.refinery.startMix.kerosene = 0.9;
    expect(() => parseBalance(mixFalsch)).toThrow(/startMix/);
  });
});

describe('Raffinerie: Freischalten (Kapitel 2)', () => {
  it('ist in Kapitel 1 unsichtbar: kein Zustand, endRound unverändert', () => {
    const s = newGame('k1', balance);
    expect(s.refinery).toBeUndefined();
    expect(refineryStatus(s)).toBe('locked');
    expect(advanceRefinery(s, balance)).toBe(s);
    expect(buildRefinery(s, balance).ok).toBe(false);
    expect(refineryUnlockedFor(1, balance)).toBe(false);
    expect(refineryUnlockedFor(2, balance)).toBe(true);
  });

  it('ändert den Weltzufall nicht: gleicher Seed, gleiche Runde mit und ohne Freischaltung', () => {
    const ohne = endRound(newGame('gleich', balance), balance);
    const mit = endRound(unlockRefinery(newGame('gleich', balance), balance), balance);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.postedPrice).toBe(ohne.postedPrice);
    expect(mit.cash).toBe(ohne.cash);
  });

  it('unlockRefinery ist idempotent und startet mit gültigem Mix', () => {
    const s = kapitel2();
    expect(unlockRefinery(s, balance)).toBe(s);
    expect(refineryStatus(s)).toBe('none');
    expect(PRODUCTS.reduce((a, p) => a + s.refinery!.mix[p], 0)).toBeCloseTo(1, 6);
  });
});

describe('Raffinerie: Bauen und Ausbauen', () => {
  it('Bau kostet buildCost und dauert buildRounds Runden', () => {
    let s = ok(buildRefinery(kapitel2(), balance));
    expect(s.cash).toBe(1_000_000 - R.buildCost);
    expect(refineryStatus(s)).toBe('building');
    expect(refineryCapacity(s, balance)).toBe(0);
    for (let i = 0; i < R.buildRounds - 1; i++) s = advanceRefinery(s, balance);
    expect(ownsRefinery(s)).toBe(false);
    s = advanceRefinery(s, balance);
    expect(ownsRefinery(s)).toBe(true);
    expect(refineryCapacity(s, balance)).toBe(R.unitCapacity);
    expect(buildRefinery(s, balance).ok).toBe(false);
  });

  it('ohne Geld kein Bau', () => {
    const r = buildRefinery(kapitel2({ cash: R.buildCost - 1 }), balance);
    expect(r.ok).toBe(false);
  });

  it('Ausbau erst mit fertiger Anlage, alte Stufe läuft weiter, höchstens maxLevel', () => {
    expect(expandRefinery(kapitel2(), balance).ok).toBe(false);
    let s = ok(expandRefinery(fertig(1), balance));
    expect(refineryStatus(s)).toBe('expanding');
    expect(refineryCapacity(s, balance)).toBe(R.unitCapacity);
    expect(expandRefinery(s, balance).ok).toBe(false);
    for (let i = 0; i < R.expandRounds; i++) s = advanceRefinery(s, balance);
    expect(s.refinery!.level).toBe(2);
    expect(expandRefinery(fertig(R.maxLevel), balance).ok).toBe(false);
  });

  it('Buchwert zählt im Imperiumswert', () => {
    const ohne = kapitel2();
    const mit = ok(buildRefinery(ohne, balance));
    expect(refineryAssets(mit, balance)).toBeCloseTo(R.assetShare * R.buildCost, 2);
    expect(empireValue(mit, balance)).toBeCloseTo(empireValue(ohne, balance) - R.buildCost + R.assetShare * R.buildCost, 2);
    expect(refineryAssets(newGame('x', balance), balance)).toBe(0);
  });
});

describe('Raffinerie: Produktmix', () => {
  it('ein gültiger Mix bleibt, wie er ist', () => {
    expect(normalizeMix(R.startMix, bounds)).toEqual(R.startMix);
  });

  it('jeder Wunsch landet in den Grenzen und summiert sich zu 1', () => {
    const wuensche = [{ kerosene: 1 }, { gasoline: 5 }, {}, { fuelOil: 0.9, lubricant: 0.9 }, { kerosene: -3, fuelOil: Number.NaN }];
    for (const w of wuensche) {
      const m = normalizeMix(w, bounds);
      expect(PRODUCTS.reduce((a, p) => a + m[p], 0)).toBeCloseTo(1, 6);
      for (const p of PRODUCTS) {
        expect(m[p]).toBeGreaterThanOrEqual(bounds[p].min - 1e-9);
        expect(m[p]).toBeLessThanOrEqual(bounds[p].max + 1e-9);
      }
    }
  });

  it('mehr Kerosin wünschen gibt mehr Kerosin', () => {
    const viel = normalizeMix({ ...R.startMix, kerosene: 0.9 }, bounds);
    expect(viel.kerosene).toBeGreaterThan(R.startMix.kerosene);
    expect(viel.kerosene).toBeLessThanOrEqual(bounds.kerosene.max);
  });

  it('adjustMix: der bewegte Regler bekommt seinen Wert, die anderen teilen sich den Rest', () => {
    const m = adjustMix(R.startMix, 'fuelOil', 0.3, bounds);
    expect(m.fuelOil).toBeCloseTo(0.3, 3);
    expect(PRODUCTS.reduce((a, p) => a + m[p], 0)).toBeCloseTo(1, 6);
    expect(m.kerosene).toBeLessThan(R.startMix.kerosene);
    // Über die Grenze hinaus: bis zur Grenze.
    expect(adjustMix(R.startMix, 'gasoline', 0.9, bounds).gasoline).toBeCloseTo(bounds.gasoline.max, 3);
    expect(adjustMix(R.startMix, 'kerosene', 0, bounds).kerosene).toBeCloseTo(bounds.kerosene.min, 3);
  });

  it('setRefineryMix speichert den begrenzten Mix, setRefineryIntake rundet auf 5 %', () => {
    const s = ok(setRefineryMix(kapitel2(), balance, { kerosene: 1, gasoline: 1 }));
    expect(s.refinery!.mix.gasoline).toBeLessThanOrEqual(bounds.gasoline.max);
    expect(ok(setRefineryIntake(s, 0.33)).refinery!.intake).toBe(0.35);
    expect(ok(setRefineryIntake(s, 7)).refinery!.intake).toBe(1);
    expect(setRefineryIntake(newGame('k1', balance), 0.5).ok).toBe(false);
  });
});

describe('Raffinerie: Preise und Absatz', () => {
  it('mehr Angebot drückt den Preis, begrenzt durch floor und ceiling', () => {
    const p = R.products.kerosene;
    const wenig = productPrice('kerosene', 100, R.crudeRef, welt, balance);
    const normal = productPrice('kerosene', p.demand, R.crudeRef, welt, balance);
    const viel = productPrice('kerosene', p.demand * 100, R.crudeRef, welt, balance);
    expect(normal).toBeCloseTo(p.basePrice, 2);
    expect(wenig).toBeCloseTo(p.basePrice * p.ceiling, 2);
    expect(viel).toBeCloseTo(p.basePrice * p.floor, 2);
  });

  it('der Preis folgt dem Rohölpreis zum Anteil crudeLink', () => {
    const p = R.products.fuelOil;
    const basis = productPrice('fuelOil', p.demand, R.crudeRef, welt, balance);
    const doppelt = productPrice('fuelOil', p.demand, 2 * R.crudeRef, welt, balance);
    expect(doppelt / basis).toBeCloseTo(1 + p.crudeLink, 2);
  });

  it('Nachfrage wandelt sich: Benzin wächst mit den Jahren, Kerosin schrumpft, Heizöl im Krieg', () => {
    const spaeter = { ...welt, year: welt.year + 8 };
    expect(demandFactor('kerosene', welt, balance)).toBeCloseTo(1, 6);
    expect(demandFactor('gasoline', spaeter, balance)).toBeGreaterThan(1.5);
    expect(demandFactor('kerosene', spaeter, balance)).toBeLessThan(1);
    expect(productDemand('fuelOil', { ...welt, war: true, tension: 90 }, balance)).toBeGreaterThan(productDemand('fuelOil', welt, balance));
    // Untergrenze: Die Nachfrage verschwindet nie ganz.
    expect(demandFactor('kerosene', { ...welt, year: welt.year + 100 }, balance)).toBeCloseTo(R.products.kerosene.trend.min, 6);
  });

  it('liest Weltgrößen aus state.world (4.1), sonst Ersatzwerte', () => {
    const s = newGame('welt', balance);
    const ersatz = refineryWorld(s, balance);
    expect(ersatz).toMatchObject({ tech: R.worldDefaults.tech, tension: R.worldDefaults.tension, war: false, demand: R.worldDefaults.demand });
    const mitWelt = refineryWorld({ ...s, world: { tech: 70, tension: 80, war: 3, demand: 1.2 } } as GameState, balance);
    expect(mitWelt).toMatchObject({ tech: 70, tension: 80, war: true, demand: 1.2 });
  });
});

describe('Raffinerie: eine Runde', () => {
  it('verarbeitet Öl aus dem Tank bis zur Kapazität × Anteil, verkauft die Produkte', () => {
    const s = fertig(1, { oilStock: 60_000, royaltyOil: 6_000 });
    expect(plannedCrude(s, balance)).toBe(R.unitCapacity);
    const plan = planRun(s, balance, R.unitCapacity);
    const n = advanceRefinery(s, balance);
    expect(n.oilStock).toBe(60_000 - R.unitCapacity);
    expect(n.royaltyOil).toBeCloseTo(6_000 - R.unitCapacity * 0.1, 6);
    expect(n.cash).toBeCloseTo(s.cash + plan.net, 2);
    expect(n.refinery!.last).toEqual(plan);
    const ausbeute = PRODUCTS.reduce((a, p) => a + plan.output[p], 0);
    expect(ausbeute).toBeCloseTo(R.unitCapacity * (1 - R.techs[0].loss), -1);
    expect(plan.royalty).toBeCloseTo(R.unitCapacity * 0.1 * s.postedPrice, 2);
    expect(plan.upkeep).toBe(R.upkeepPerLevel);
  });

  it('nimmt nie mehr, als im Tank ist, und mit Anteil 0 gar nichts – Fixkosten laufen trotzdem', () => {
    const wenig = fertig(1, { oilStock: 1234.6 });
    expect(plannedCrude(wenig, balance)).toBe(1234);
    const aus = ok(setRefineryIntake(fertig(1, { oilStock: 50_000 }), 0));
    const n = advanceRefinery(aus, balance);
    expect(n.oilStock).toBe(50_000);
    expect(n.cash).toBe(aus.cash - R.upkeepPerLevel);
  });

  it('mit eigener Pipeline ist die Zufuhr billiger', () => {
    const s = fertig(1);
    expect(refineryFeedCost(s, balance)).toBe(R.feedCost);
    expect(refineryFeedCost({ logistics: { ...s.logistics, pipeline: 'ready' } }, balance)).toBe(R.feedCostPipeline);
  });

  it('saures Rohöl bringt weniger und kostet mehr', () => {
    const s = fertig(1, { oilStock: 50_000 });
    const suess = planRun(s, balance, 20_000, { sourShare: 0 });
    const sauer = planRun(s, balance, 20_000, { sourShare: 1 });
    expect(sauer.operating).toBeGreaterThan(suess.operating);
    expect(PRODUCTS.reduce((a, p) => a + sauer.output[p], 0)).toBeLessThan(PRODUCTS.reduce((a, p) => a + suess.output[p], 0));
  });

  it('der Mix verändert den Erlös: zu viel von einem Produkt drückt dessen Preis', () => {
    const s = fertig(2, { oilStock: 100_000 });
    const keroViel = ok(setRefineryMix(s, balance, { kerosene: 1 }));
    const keroWenig = ok(setRefineryMix(s, balance, { fuelOil: 1, lubricant: 1 }));
    const a = planRun(keroViel, balance, 50_000);
    const b = planRun(keroWenig, balance, 50_000);
    expect(a.prices.kerosene).toBeLessThan(b.prices.kerosene);
    expect(a.revenue).not.toBe(b.revenue);
  });

  it('Brand: nur wenn die Anlage lief, kostet Reparatur und legt sie still', () => {
    const immer: Balance = { ...balance, refinery: { ...R, fire: { ...R.fire, chance: 1 } } };
    const s = fertig(1, { oilStock: 50_000 });
    const n = advanceRefinery(s, immer);
    expect(n.refinery!.fires).toBe(1);
    expect(refineryStatus(n)).toBe('damaged');
    expect(refineryCapacity(n, immer)).toBe(0);
    expect(n.cash).toBeCloseTo(s.cash + n.refinery!.last!.net - R.fire.repairCost, 2);
    // Stillstand: kein Öl verarbeitet, nach repairRounds wieder in Betrieb.
    let r = n;
    for (let i = 0; i < R.fire.repairRounds; i++) {
      const vorher = r.oilStock;
      r = advanceRefinery(r, immer);
      expect(r.oilStock).toBe(vorher);
    }
    expect(refineryStatus(r)).toBe('running');
    // Leer gelaufen: kein Brand.
    expect(advanceRefinery(fertig(1, { oilStock: 0 }), immer).refinery!.fires).toBe(0);
  });

  it('ist deterministisch', () => {
    const s = fertig(1, { oilStock: 80_000 });
    expect(advanceRefinery(s, balance)).toEqual(advanceRefinery(s, balance));
  });

  it('läuft in endRound vor der Förderung: Öl der neuen Förderung bleibt im Tank', () => {
    const s = fertig(1, { oilStock: 10_000, royaltyOil: 0 });
    const n = endRound(s, balance);
    expect(n.refinery!.last!.crude).toBe(10_000);
    expect(n.refinery!.last!.round).toBe(s.round);
  });
});

describe('Raffinerie: Abwägung Rohöl verkaufen oder raffinieren', () => {
  it('vergleicht netto je Barrel und nennt den besten Weg', () => {
    const s = fertig(1, { oilStock: 20_000 });
    const v = crudeVsRefined(s, balance, welt);
    expect(v.crudeMode).not.toBeNull();
    expect(v.crude).toBe(20_000);
    expect(v.advantage).toBeCloseTo(v.refinedNet - v.crudeNet, 2);
    // Mit den Startzahlen lohnt das Raffinieren bei normalem Rohölpreis.
    expect(v.advantage).toBeGreaterThan(0);
  });

  it('bei sehr hohem Rohölpreis und Überangebot an Produkten kann Rohöl besser sein', () => {
    const s = fertig(R.maxLevel, { oilStock: 500_000, postedPrice: balance.market.priceMax * 3 });
    const v = crudeVsRefined(s, balance, welt);
    expect(v.advantage).toBeLessThan(0);
  });
});

describe('Raffinerie: Spielstand', () => {
  it('wird gesichert und geladen; kaputte Raffinerie wird abgelehnt', () => {
    const s = advanceRefinery(fertig(1, { oilStock: 30_000 }), balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok && geladen.state.refinery).toEqual(s.refinery);
    const kaputt = JSON.parse(serializeGame(s, 'test'));
    kaputt.state.refinery.mix = { kerosene: 1 };
    expect(deserializeGame(JSON.stringify(kaputt)).ok).toBe(false);
  });

  it('Spielstände ohne Raffinerie (Kapitel 1) laden wie bisher', () => {
    const s = newGame('alt', balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok && geladen.state.refinery).toBeUndefined();
    expect(isRefineryState(newRefinery('x', balance))).toBe(true);
    expect(isRefineryState({})).toBe(false);
  });
});
