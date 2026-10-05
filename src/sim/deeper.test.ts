// Spielspaß K1 (Tieferbohren als echte Wahl): größere Funde in der Tiefe, ehrliche Prognose
// des Geologen für die nächste Stufe und die Rechenhilfe „lohnt ab“.
import { describe, expect, it } from 'vitest';
import { parseBalance, type Balance } from './balance';
import { deeperWorth } from './bots';
import { deeperOutlook, deeperPays, deeperVerdict, type DeeperOutlook } from './deeper';
import { advanceDrilling, deepFindReserves, drillDeeper, findFactor, startDrilling, wellOf, type DrillResult, type Well } from './drilling';
import { forecastMid, makeDeeperForecast } from './forecast';
import { newGame, type GameState } from './game';
import { findValue, horizonOf } from './invest';
import { initialRate } from './production';
import { Rng } from './rng';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const PARCEL = 'salthill-01';
const SAFE: Balance = { ...balance, drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident: 0, stuck: 0 })) } };

function ok(r: DrillResult): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Eigene Pacht auf PARCEL, eigene Lagerstätte f-test mit 30.000 bbl. */
function game(geology: 'small' | 'gusher' | 'dry' = 'small', reserves = 30000): GameState {
  const state = newGame('tiefer', balance);
  return {
    ...state,
    cash: 100000,
    options: [],
    parcels: state.parcels.map((p) => (p.id === PARCEL ? { ...p, geology, reserves, fieldId: 'f-test' } : { ...p, fieldId: undefined })),
    fields: [{ id: 'f-test', parcelIds: [PARCEL], reserves, x: 0, y: 0, name: 'Test', peakWells: 0 }],
    wells: [],
    leases: [{ parcelId: PARCEL, holder: 'jacob', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 1, drilled: false }],
  };
}

function setWell(state: GameState, patch: Partial<Well>): GameState {
  return { ...state, wells: state.wells.map((w) => (w.parcelId === PARCEL ? { ...w, ...patch } : w)) };
}

/** Bohrung, die nach trockenen 300 m auf die Entscheidung wartet; Öl liegt in oilStage. */
function decision(oilStage: number | null = 2, geology: 'small' | 'gusher' | 'dry' = 'small'): GameState {
  return advanceDrilling(setWell(ok(startDrilling(game(geology), balance, PARCEL)), { oilStage }), SAFE);
}

function well(state: GameState): Well {
  return wellOf(state, PARCEL)!;
}

describe('Tiefe Funde sind größer (findFactor)', () => {
  it('balance.yaml: 1 / 2 / 3 – flach unverändert, 600 m doppelt, 900 m dreifach', () => {
    expect(balance.drilling.stages.map((s) => s.findFactor)).toEqual([1, 2, 3]);
    expect(findFactor(balance, 2)).toBe(2);
  });

  it('erster Fund in der Tiefe: Vorrat von Ranch und Feld wächst um (Faktor − 1) × Vorrat', () => {
    const s = game();
    const tief = deepFindReserves(s, balance, PARCEL, 3);
    expect(tief.parcels.find((p) => p.id === PARCEL)!.reserves).toBe(90000);
    expect(tief.fields[0].reserves).toBe(90000);
    // Flach: nichts ändert sich.
    expect(deepFindReserves(s, balance, PARCEL, 1)).toEqual({ parcels: s.parcels, fields: s.fields });
  });

  it('weitere Bohrlöcher derselben Ranch vergrößern den Vorrat nicht noch einmal', () => {
    const s = game();
    const mitQuelle = { ...s, wells: [{ id: `${PARCEL}#1`, parcelId: PARCEL, stage: 2, status: 'found' as const, roundsLeft: 0, spent: 0, oilStage: 2, startRound: 1 }] };
    expect(deepFindReserves(mitQuelle, balance, PARCEL, 2).parcels).toBe(s.parcels);
  });

  it('Fund in 600 m: doppelte Anfangsrate und doppelter Vorrat, Meldung im Protokoll', () => {
    const flach = advanceDrilling(setWell(ok(startDrilling(game(), balance, PARCEL)), { oilStage: 1 }), SAFE);
    let tief = ok(drillDeeper(decision(2), balance, PARCEL));
    tief = advanceDrilling(tief, SAFE);
    expect(well(tief)).toMatchObject({ status: 'found', stage: 2, result: 'small' });
    expect(Math.abs(well(tief).production!.initialRate - 2 * well(flach).production!.initialRate)).toBeLessThanOrEqual(1);
    expect(tief.fields[0].reserves).toBe(60000);
    expect(flach.fields[0].reserves).toBe(30000);
    expect(tief.log.at(-1)).toMatch(/In der Tiefe ist die Lagerstätte größer/);
  });

  it('die Anfangsrate folgt dem gewachsenen Vorrat (initialRate liest die Ranch)', () => {
    const s = game();
    const tief = deepFindReserves(s, balance, PARCEL, 2);
    // Bis auf Rundung (initialRate rundet auf ganze Barrel).
    expect(Math.abs(initialRate(balance, tief, { parcelId: PARCEL, result: 'small' }) - 2 * initialRate(balance, s, { parcelId: PARCEL, result: 'small' }))).toBeLessThanOrEqual(1);
  });
});

describe('Balance: findFactor und Prognose für die Tiefe', () => {
  it('findFactor unter 1 oder fallend wird abgelehnt', () => {
    const raw = rawBalance() as { drilling: { stages: { findFactor: number }[] } };
    const klein = structuredClone(raw);
    klein.drilling.stages[0].findFactor = 0.5;
    expect(() => parseBalance(klein)).toThrow(/findFactor muss mindestens 1/);
    const fallend = structuredClone(raw);
    fallend.drilling.stages[2].findFactor = 1.5;
    expect(() => parseBalance(fallend)).toThrow(/findFactor darf mit der Tiefe nicht sinken/);
  });

  it('forecast.deeper muss da sein', () => {
    const raw = structuredClone(rawBalance()) as { forecast: Record<string, unknown> };
    delete raw.forecast.deeper;
    expect(() => parseBalance(raw)).toThrow(/forecast\.deeper/);
  });
});

describe('Prognose des Geologen nach einer trockenen Stufe', () => {
  it('im Schnitt genau die Chance – auch bei kleinen Werten nicht nach oben verzerrt', () => {
    for (const chance of [0.03, 0.09, 0.25]) {
      const rng = new Rng(7);
      let summe = 0;
      for (let i = 0; i < 2000; i++) summe += makeDeeperForecast(balance, PARCEL, { accuracy: 3, bias: 0 }, rng, chance).center;
      expect(summe / 2000 / 100).toBeCloseTo(chance, 2);
    }
  });

  it('enge Spanne um die Mitte, ganze Prozent, genau ein Zufallswert', () => {
    const a = new Rng(3);
    const f = makeDeeperForecast(balance, PARCEL, { accuracy: 3, bias: 0 }, a, 0.1);
    expect(f.high - f.low).toBeLessThanOrEqual(10);
    expect(Number.isInteger(f.low) && Number.isInteger(f.high)).toBe(true);
    const b = new Rng(3);
    b.float();
    expect(a.state).toBe(b.state);
  });

  it('die Verzerrung des Geologen bleibt erhalten', () => {
    const f = makeDeeperForecast(balance, PARCEL, { accuracy: 3, bias: 5 }, new Rng(1), 0.1);
    const g = makeDeeperForecast(balance, PARCEL, { accuracy: 3, bias: 0 }, new Rng(1), 0.1);
    expect(f.center - g.center).toBeCloseTo(5, 6);
  });
});

describe('Was ein Fund in der Tiefe bringt (findValue)', () => {
  it('600 m bringen mehr als 300 m, 900 m mehr als 600 m', () => {
    const s = game();
    const v1 = findValue(s, balance, PARCEL, 1, 'small', 1);
    const v2 = findValue(s, balance, PARCEL, 2, 'small', 1);
    const v3 = findValue(s, balance, PARCEL, 3, 'small', 1);
    expect(v1).toBeGreaterThan(0);
    expect(v2).toBeGreaterThan(1.5 * v1);
    expect(v3).toBeGreaterThan(v2);
    expect(findValue(s, balance, PARCEL, 2, 'gusher', 1)).toBeGreaterThan(v2);
  });

  it('hängt nicht an der verdeckten Geologie der Ranch', () => {
    expect(findValue(game('dry', 0), balance, PARCEL, 2, 'small', 1)).toBe(findValue(game('gusher', 150000), balance, PARCEL, 2, 'small', 1));
  });

  it('nichts, wenn die Quelle erst nach Kapitelende fördern würde, und nichts ohne eigene Pacht', () => {
    const s = game();
    expect(findValue(s, balance, PARCEL, 2, 'small', horizonOf(s))).toBe(0);
    expect(findValue({ ...s, leases: [] }, balance, PARCEL, 2, 'small', 1)).toBe(0);
  });

  it('später im Kapitel weniger wert', () => {
    const s = game();
    expect(findValue({ ...s, round: s.totalRounds - 2 }, balance, PARCEL, 2, 'small', 1)).toBeLessThan(findValue(s, balance, PARCEL, 2, 'small', 1));
  });
});

describe('Die Wette fürs Tieferbohren (deeperOutlook)', () => {
  it('nur bei einer Bohrung, die auf die Entscheidung wartet', () => {
    expect(deeperOutlook(game(), balance, PARCEL)).toBeNull();
    expect(deeperOutlook(decision(2), balance, PARCEL)).not.toBeNull();
  });

  it('Schwelle = (Kosten + Risiko) ÷ Wert eines Funds; Risiko aus Unfall und Klemmen', () => {
    const s = decision(2);
    const o = deeperOutlook(s, balance, PARCEL)!;
    const st = balance.drilling.stages[1];
    expect(o).toMatchObject({ stage: 2, depth: 600, cost: st.cost });
    expect(o.risk).toBe(Math.round(st.accident * balance.drilling.accidentCost + st.stuck * balance.drilling.fishingCost));
    expect(o.breakEven).toBeCloseTo((o.cost + o.risk) / o.value, 6);
    // Der Wert mischt kleine Quelle und Gusher nach der Zone.
    expect(o.value).toBeGreaterThanOrEqual(o.valueSmall);
    expect(o.value).toBeLessThanOrEqual(o.valueGusher);
  });

  it('rechnet mit der Chance des Geologen, nie mit der verdeckten Geologie', () => {
    const a = deeperOutlook(decision(2, 'small'), balance, PARCEL)!;
    const b = deeperOutlook(decision(null, 'dry'), balance, PARCEL)!;
    expect(a.value).toBe(b.value);
    expect(a.chance).toBe(Math.round(forecastMid(decision(2, 'small').forecasts[PARCEL])) / 100);
  });

  it('erwarteter Gewinn = Chance × Wert − Kosten − Risiko; lohnt, wenn er nicht negativ ist', () => {
    const s = decision(2);
    const o = deeperOutlook(s, balance, PARCEL, 0.5)!;
    expect(o.expected).toBe(Math.round(0.5 * o.value - o.cost - o.risk));
    expect(deeperPays(o)).toBe(true);
    expect(deeperPays(deeperOutlook(s, balance, PARCEL, o.breakEven * 0.5))).toBe(false);
    expect(deeperPays(null)).toBe(false);
  });

  it('auf der letzten Stufe gibt es keine Wette mehr', () => {
    let s = ok(drillDeeper(decision(3), balance, PARCEL));
    s = advanceDrilling(s, SAFE);
    expect(well(s)).toMatchObject({ status: 'decision', stage: 2 });
    expect(deeperOutlook(s, balance, PARCEL)!.depth).toBe(900);
    s = advanceDrilling(ok(drillDeeper(setWell(s, { oilStage: null }), balance, PARCEL)), SAFE);
    s = advanceDrilling(s, SAFE);
    expect(well(s).status).toBe('dry');
    expect(deeperOutlook(s, balance, PARCEL)).toBeNull();
  });
});

describe('Urteil fürs Ranch-Fenster', () => {
  const o: DeeperOutlook = { stage: 2, depth: 600, cost: 1000, risk: 0, valueSmall: 10000, valueGusher: 30000, value: 10000, breakEven: 0.1, chance: 0.1, expected: 0 };
  it('lohnt ab 1,25 × Schwelle, knapp ab 0,8 ×, sonst lohnt nicht, zu spät bei Schwelle 1', () => {
    expect(deeperVerdict({ ...o, chance: 0.13 })).toBe('lohnt');
    expect(deeperVerdict({ ...o, chance: 0.1 })).toBe('knapp');
    expect(deeperVerdict({ ...o, chance: 0.081 })).toBe('knapp');
    expect(deeperVerdict({ ...o, chance: 0.07 })).toBe('lohntNicht');
    expect(deeperVerdict({ ...o, breakEven: 1 })).toBe('zuSpaet');
    expect(deeperVerdict({ ...o, chance: null })).toBeNull();
  });
});

describe('Bots entscheiden nach Prognose × Gewinn gegen Kosten', () => {
  it('tiefer, wenn die Chance des Geologen die Schwelle × Faktor erreicht', () => {
    const s = decision(2);
    const o = deeperOutlook(s, balance, PARCEL)!;
    const chance = o.chance!;
    expect(deeperWorth(s, balance, PARCEL, chance / o.breakEven)).toBe(true);
    expect(deeperWorth(s, balance, PARCEL, (chance / o.breakEven) * 1.01)).toBe(false);
  });

  it('Charakter in balance.yaml: vorsichtig verlangt mehr als ausgewogen, gierig weniger', () => {
    const d = balance.bots.deeper;
    expect(d.cautious).toBeGreaterThan(d.balanced);
    expect(d.greedy).toBeLessThan(d.balanced);
  });
});
