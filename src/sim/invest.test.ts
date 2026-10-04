// Ausbau-Rechnung (0.2.15+7): Pumpe und weiteres Bohrloch lohnen sich bei guten
// Quellen und nicht bei schwachen – belegt mit Beispielrechnungen.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import type { Well } from './drilling';
import { newGame, type GameState } from './game';
import { horizonOf, netPerBarrel, projectField, pumpOutlook, wellOutlook } from './invest';
import { advanceProduction, initialRate } from './production';
import { loadBalance } from './testBalance';

const echt = loadBalance();
/** Für die Beispielrechnungen ein fester Preis von 1,00 $ (Elastizität 0) – der Preisdruck kommt in einem eigenen Test. */
const balance: Balance = { ...echt, market: { ...echt.market, elasticity: 0, basePrice: 1, shock: 1, regionalDiscount: 0 } };
const P = balance.production.pump;

/**
 * Feste Lage: Runde 1 von 16, Posted Price 1,00 $, Bahn 0,25 $, Förderzins 12,5 %.
 * Netto je Barrel: 1,00 − 0,25 − 1,00 · 0,125 = 0,625 $. Die Ranch liegt im
 * größten Feld, damit die Reserve die Rechnung nicht begrenzt.
 */
function lage(wells: Partial<Well>[] = [], round = 1, seed = 'ausbau'): { state: GameState; id: string; feld: string[] } {
  const s = newGame(seed, balance);
  const feld = [...s.fields].sort((a, b) => b.reserves - a.reserves)[0];
  const id = feld.parcelIds.find((pid) => !s.parcels.find((p) => p.id === pid)!.discovery)!;
  const state: GameState = {
    ...s,
    round,
    cash: 100_000,
    postedPrice: 1,
    railTariff: 0.25,
    options: [],
    parcels: s.parcels.map((p) => (p.id === id ? { ...p, slots: 6 } : p)),
    leases: [{ parcelId: id, holder: 'jacob', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 8, drilled: true }],
    wells: wells.map((patch, i) => ({
      id: `${id}#${i + 1}`,
      parcelId: id,
      stage: 1,
      status: 'found',
      roundsLeft: 0,
      spent: 1000,
      oilStage: 1,
      startRound: 1,
      result: 'small',
      production: { initialRate: 10_000, roundsProduced: 0, lastRate: 0, total: 0 },
      ...patch,
    })),
  };
  return { state, id, feld: feld.parcelIds };
}

const rate = (initialRate: number, roundsProduced = 0) => ({ production: { initialRate, roundsProduced, lastRate: 0, total: 0 } });

describe('Netto je Barrel', () => {
  it('bester Weg zu Crane minus Förderzins: 1,00 − 0,25 − 0,125 = 0,625 $', () => {
    const { state } = lage();
    expect(netPerBarrel(state, balance, 0.125)).toBe(0.625);
  });
});

describe('Vorausrechnung des Feldes', () => {
  it('die erste Runde der Vorausrechnung fördert genau so viel wie die echte Runde', () => {
    const { state, id } = lage([rate(10_000, 2), rate(6_000, 1)]);
    const feld = state.fields.find((f) => f.parcelIds.includes(id))!;
    const plaene = state.wells.map((w) => ({ initialRate: w.production!.initialRate, roundsProduced: w.production!.roundsProduced, pump: false, start: 0 }));
    const [erste] = projectField(balance, plaene, feld.reserves, feld.peakWells, 0, 3);
    expect(erste).toBe(advanceProduction(state, balance).oilStock - state.oilStock);
  });
});

describe('Pumpe: lohnt bei guten Quellen, nicht bei schwachen', () => {
  it('gute Quelle (10.000 bbl): +2.500 bbl je Runde, bezahlt nach 5 Runden', () => {
    // Beispielrechnung, je Runde: Mehrförderung = 10.000 · 0,9^t · 0,25, mal 0,625 $, minus 400 $ Unterhalt.
    //   t=0: 2.500 bbl → 1.162,50 $ · t=1: 2.250 → 1.006,25 $ · t=2: 2.025 → 865,63 $
    //   t=3: 1.823 → 739,38 $ · t=4: 1.640 → 625,00 $   Summe 4.398,75 $ ≥ 4.000 $ → nach 5 Runden.
    const { state, id } = lage([rate(10_000)]);
    const o = pumpOutlook(state, balance, id)!;
    expect(o.cost).toBe(P.cost);
    expect(o.upkeep).toBe(P.upkeep);
    expect(o.extraFirst).toBe(2_500);
    expect(o.payback).toBe(5);
    expect(o.profit).toBeGreaterThan(0);
  });

  it('starke Quelle (40.000 bbl): bezahlt nach 1 Runde', () => {
    // 40.000 · 0,25 = 10.000 bbl · 0,625 $ = 6.250 $ − 400 $ = 5.850 $ ≥ 4.000 $.
    const { state, id } = lage([rate(40_000)]);
    expect(pumpOutlook(state, balance, id)!.payback).toBe(1);
  });

  it('müde Quelle (2.000 bbl, vier Runden alt): +343 bbl ≈ 214 $ – weniger als der Unterhalt, lohnt nie', () => {
    const { state, id } = lage([rate(2_000, 4)]);
    const o = pumpOutlook(state, balance, id)!;
    expect(o.extraFirst).toBe(343); // 2.000 · 0,91^4 = 1.372 · 0,25
    expect(o.payback).toBeNull();
    expect(o.profit).toBeLessThan(0);
  });

  it('gute Quelle kurz vor Kapitelende: keine Zeit mehr, sich zu bezahlen', () => {
    const { state, id } = lage([rate(10_000)], balance.start.rounds);
    expect(horizonOf(state)).toBe(1);
    expect(pumpOutlook(state, balance, id)!.payback).toBeNull();
  });

  it('ohne Quelle oder mit Pumpe überall gibt es nichts zu rechnen', () => {
    expect(pumpOutlook(lage().state, balance, lage().id)).toBeNull();
    const { state, id } = lage([{ ...rate(10_000), pump: true }]);
    expect(pumpOutlook(state, balance, id)).toBeNull();
  });
});

describe('Preisdruck: mehr Öl senkt den Posted Price für alle Barrel Jacobs', () => {
  it('mit dem echten Markt drückt die Mehrförderung den Preis – der Gewinn ist kleiner als bei festem Preis', () => {
    const { state, id } = lage([rate(40_000)]);
    const mitMarkt = pumpOutlook(state, echt, id)!;
    expect(mitMarkt.priceDrop).toBeGreaterThan(0);
    expect(pumpOutlook(state, balance, id)!.priceDrop).toBe(0);
  });

  it('ist der Markt satt (Jacob fördert anderswo schon riesig), lohnt nicht einmal die Pumpe an einer starken Quelle', () => {
    // Ein Seed mit mehr als einem Feld (seit „Frühes Öl“ hängt der Salt Hill oft zu einem Feld zusammen).
    const { state, id, feld } = lage([rate(40_000)], 1, 'ausbau-3');
    const anderswo = state.fields.find((f) => !f.parcelIds.some((pid) => feld.includes(pid)))!;
    const riesig: Well[] = Array.from({ length: 3 }, (_, i) => ({
      id: `${anderswo.parcelIds[0]}#${i + 1}`,
      parcelId: anderswo.parcelIds[0],
      stage: 1,
      status: 'found',
      roundsLeft: 0,
      spent: 1000,
      oilStage: 1,
      startRound: 1,
      result: 'gusher',
      production: { initialRate: 200_000, roundsProduced: 0, lastRate: 0, total: 0 },
    }));
    const satt = { ...state, fields: state.fields.map((f) => (f.id === anderswo.id ? { ...f, reserves: 50_000_000 } : f)), wells: [...state.wells, ...riesig] };
    expect(pumpOutlook(state, echt, id)!.payback).not.toBeNull();
    expect(pumpOutlook(satt, echt, id)!.payback).toBeNull();
  });
});

describe('Weiteres Bohrloch: lohnt bei guter Quelle im leeren Feld, nicht im vollen', () => {
  it('gute Ranch, einzige Quelle im Feld: bezahlt nach 2 Runden (eine bohren, eine fördern)', () => {
    const { state, id } = lage([rate(10_000)]);
    const o = wellOutlook(state, balance, id)!;
    const neu = initialRate(balance, state, { parcelId: id, result: 'small' });
    expect(o.cost).toBe(balance.drilling.stages[0].cost);
    expect(o.delay).toBe(balance.drilling.stages[0].rounds);
    expect(o.extraFirst).toBe(neu);
    // Sobald die neue Quelle fördert, ist das Bohrloch bezahlt, wenn sie mehr als die Kosten bringt.
    expect(neu * o.netPerBarrel).toBeGreaterThan(o.cost);
    expect(o.payback).toBe(o.delay + 1);
  });

  it('volles Feld (4 starke Quellen): das 5. Loch drückt den Druck aller – unterm Strich weniger Öl, lohnt nicht', () => {
    // Abwägung Felddruck (1.7): Mit 5 Quellen fällt der Druck auf 85 %. Die vier alten
    // verlieren je 15 % von 30.000 bbl = 18.000 bbl, das neue Loch bringt nur 85 % seiner Anfangsrate.
    const { state, id } = lage([rate(30_000), rate(30_000), rate(30_000), rate(30_000)]);
    const o = wellOutlook(state, balance, id)!;
    const neu = initialRate(balance, state, { parcelId: id, result: 'small' });
    expect(neu * 0.85).toBeLessThan(4 * 30_000 * 0.15);
    expect(o.extraFirst).toBeLessThan(0);
    expect(o.payback).toBeNull();
  });

  it('kein weiteres Loch ohne Quelle, ohne freie Plätze oder ohne eigene Pacht', () => {
    expect(wellOutlook(lage().state, balance, lage().id)).toBeNull();
    const { state, id } = lage([rate(10_000)]);
    expect(wellOutlook({ ...state, parcels: state.parcels.map((p) => (p.id === id ? { ...p, slots: 1 } : p)) }, balance, id)).toBeNull();
    expect(wellOutlook({ ...state, leases: [] }, balance, id)).toBeNull();
  });
});
