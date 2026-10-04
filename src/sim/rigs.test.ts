// Bohrtürme und Pumpen (0.2.15+7): mehrere Türme, Kauf und Miete, Nachrüsten,
// weitere Bohrlöcher direkt auf die bekannte Tiefe, Pumpen mit Unterhalt.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { advanceDrilling, drillDeeper, drillQuote, startDrilling, wellOf, wellsOn, type DrillResult, type Well } from './drilling';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { pressureFactor, wellRate } from './production';
import {
  buyRig,
  buyVsRentRounds,
  equipmentCosts,
  freeRig,
  installPump,
  rentRig,
  returnRig,
  rigRisk,
  rigSummary,
  rigStageCost,
  rigStageRounds,
  settleRigs,
  SILAS_RIG,
  steamPayback,
  upgradeRig,
  type RigResult,
} from './rigs';
import { deserializeGame, serializeGame, SAVE_FORMAT } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const R = balance.drilling.rigs;
/** Ohne Unfälle und klemmendes Werkzeug. */
const SICHER: Balance = { ...balance, drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident: 0, stuck: 0 })) } };

function ok(r: DrillResult | RigResult): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Zwei eigene Pachten auf ölführenden Ranches, viel Geld. */
function spiel(): { state: GameState; a: string; b: string } {
  const s = newGame('tuerme', balance);
  const [a, b] = s.parcels.filter((p) => !p.discovery && p.fieldId !== undefined).map((p) => p.id);
  const pacht = (parcelId: string) => ({ parcelId, holder: 'jacob' as const, bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 8, drilled: false });
  return {
    a,
    b,
    state: {
      ...s,
      cash: 100_000,
      options: [],
      events: { ...s.events, pending: [] },
      parcels: s.parcels.map((p) => (p.id === a || p.id === b ? { ...p, slots: 3, geology: 'small' as const } : p)),
      leases: [pacht(a), pacht(b)],
    },
  };
}

function quelle(state: GameState, parcelId: string, patch: Partial<Well> = {}): GameState {
  const well: Well = {
    id: `${parcelId}#1`,
    parcelId,
    stage: 1,
    status: 'found',
    roundsLeft: 0,
    spent: 1000,
    oilStage: 1,
    startRound: 1,
    result: 'small',
    production: { initialRate: 10_000, roundsProduced: 0, lastRate: 0, total: 0 },
    ...patch,
  };
  return { ...state, leases: state.leases.map((l) => (l.parcelId === parcelId ? { ...l, drilled: true } : l)), wells: [...state.wells, well] };
}

describe('Bohrtürme (0.2.15+7)', () => {
  it('Jacob startet mit Silas geliehenem Seilschlag-Turm, ohne Nachrüstung', () => {
    const s = newGame('tuerme', balance);
    expect(s.rigs).toEqual([{ id: SILAS_RIG, kind: 'lent', readyRound: 1, steam: false, rods: false }]);
  });

  it('ein Turm = eine Bohrung zugleich; mit einem Mietturm laufen zwei', () => {
    const { state, a, b } = spiel();
    const eine = ok(startDrilling(state, SICHER, a));
    expect(wellOf(eine, a)!.rigId).toBe(SILAS_RIG);
    const zweite = startDrilling(eine, SICHER, b);
    expect(zweite.ok).toBe(false);
    if (!zweite.ok) expect(zweite.reason).toMatch(/Bohrturm ist noch bei einer anderen Bohrung/);

    const gemietet = ok(rentRig(eine, SICHER));
    expect(gemietet.rigs).toHaveLength(2);
    const beide = ok(startDrilling(gemietet, SICHER, b));
    expect(wellOf(beide, b)!.rigId).toBe('turm-2');
    expect(freeRig(beide)).toBeUndefined();
  });

  it('rigSummary zählt bohrend, wartend, frei und unterwegs – frei wie freeRig (0.2.15+11)', () => {
    const { state, a, b } = spiel();
    expect(rigSummary(state)).toEqual({ drilling: 0, waiting: 0, idle: 1, delivering: 0 });
    const eine = ok(startDrilling(state, SICHER, a));
    expect(rigSummary(eine)).toEqual({ drilling: 1, waiting: 0, idle: 0, delivering: 0 });
    // Trocken in dieser Stufe: Der Turm bohrt nicht, er wartet auf Jacob – und ist nicht frei.
    const trocken = { ...eine, wells: eine.wells.map((w) => ({ ...w, status: 'decision' as const })) };
    expect(rigSummary(trocken)).toEqual({ drilling: 0, waiting: 1, idle: 0, delivering: 0 });
    expect(freeRig(trocken)).toBeUndefined();
    const gekauft = ok(buyRig({ ...eine, cash: 1_000_000 }, balance));
    const neu = rigSummary(gekauft);
    expect(neu.drilling).toBe(1);
    expect(neu.idle + neu.delivering).toBe(1);
    expect(neu.idle).toBe(freeRig(gekauft) ? 1 : 0);
    void b;
  });

  it('Miete kostet am Rundenende, Rückgabe nur, wenn der Turm nicht bohrt', () => {
    const { state, a } = spiel();
    const gemietet = ok(rentRig(state, balance));
    expect(gemietet.cash).toBe(state.cash); // Miete erst am Rundenende
    expect(equipmentCosts(gemietet, balance).rent).toBe(R.rent.costPerRound);
    expect(settleRigs(gemietet, balance).cash).toBe(state.cash - R.rent.costPerRound);

    // Silas' Turm zuerst belegen, dann bohrt der Mietturm.
    const bohrt = ok(startDrilling(ok(startDrilling(gemietet, SICHER, a)), SICHER, spiel().b));
    expect(returnRig(bohrt, balance, 'turm-2').ok).toBe(false);
    expect(returnRig(gemietet, balance, SILAS_RIG).ok).toBe(false);
    const zurueck = ok(returnRig(gemietet, balance, 'turm-2'));
    expect(zurueck.rigs.map((r) => r.id)).toEqual([SILAS_RIG]);
  });

  it('Kauf: sofort bezahlt, einsatzbereit nach der Lieferzeit, zählt zum Imperiumswert', () => {
    const { state, a, b } = spiel();
    const gekauft = ok(buyRig(ok(startDrilling(state, SICHER, a)), balance));
    expect(gekauft.rigs.at(-1)).toMatchObject({ kind: 'owned', readyRound: state.round + R.buy.deliveryRounds });
    if (R.buy.deliveryRounds > 0) {
      const r = startDrilling(gekauft, SICHER, b);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/neue Turm kommt in/);
    }
    // Wert: Kasse sinkt um den Preis, der Turm zählt mit assetShare.
    const ohne = ok(startDrilling(state, SICHER, a));
    expect(empireValue(gekauft, balance)).toBeCloseTo(empireValue(ohne, balance) - R.buy.cost + R.buy.cost * R.assetShare, 2);
    // Nach der Lieferung bohrt er.
    const spaeter = { ...gekauft, round: gekauft.round + R.buy.deliveryRounds };
    expect(ok(startDrilling(spaeter, SICHER, b)).wells.at(-1)!.rigId).toBe('turm-2');
  });

  it('höchstens drilling.rigs.max Türme', () => {
    let s = spiel().state;
    for (let i = 1; i < R.max; i++) s = ok(rentRig(s, balance));
    const r = buyRig(s, balance);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(`Mehr als ${R.max} Türme`);
  });

  it('Dampfmaschine: jede Stufe billiger und schneller (mindestens eine Runde); nicht an Miettürmen', () => {
    const st3 = balance.drilling.stages[2];
    const dampf = { id: 'x', kind: 'owned' as const, readyRound: 1, steam: true, rods: false };
    expect(rigStageCost(balance, dampf, st3)).toBe(Math.round(st3.cost * R.steam.costFactor));
    expect(rigStageRounds(balance, dampf, st3)).toBe(Math.max(1, st3.rounds - R.steam.roundsLess));
    expect(rigStageRounds(balance, dampf, balance.drilling.stages[0])).toBe(1);

    const { state, a } = spiel();
    const umgebaut = ok(upgradeRig(state, balance, SILAS_RIG, 'steam'));
    expect(umgebaut.cash).toBe(state.cash - R.steam.cost);
    expect(upgradeRig(umgebaut, balance, SILAS_RIG, 'steam').ok).toBe(false);
    const gebohrt = ok(startDrilling(umgebaut, SICHER, a));
    expect(gebohrt.cash).toBe(umgebaut.cash - Math.round(balance.drilling.stages[0].cost * R.steam.costFactor));
    // Tiefer bohren rechnet ebenfalls mit der Dampfmaschine.
    const entscheiden = { ...gebohrt, wells: gebohrt.wells.map((w) => ({ ...w, status: 'decision' as const })) };
    const tiefer = ok(drillDeeper(entscheiden, SICHER, a));
    expect(entscheiden.cash - tiefer.cash).toBe(Math.round(balance.drilling.stages[1].cost * R.steam.costFactor));

    const miete = ok(rentRig(state, balance));
    expect(upgradeRig(miete, balance, 'turm-2', 'rods').ok).toBe(false);
  });

  it('Amortisation der Dampfmaschine: Ersparnis je erster Stufe und Zahl der Stufen', () => {
    const st1 = balance.drilling.stages[0];
    const spart = st1.cost - Math.round(st1.cost * R.steam.costFactor);
    expect(steamPayback(balance)).toEqual({ savingPerStage: spart, stages: Math.ceil(R.steam.cost / spart) });
    expect(buyVsRentRounds(balance)).toBe(Math.ceil((R.buy.cost * (1 - R.assetShare)) / R.rent.costPerRound));
  });

  it('Stahlgestänge senkt Unfall- und Klemm-Chance des Turms, an dem die Bohrung steht', () => {
    const st = balance.drilling.stages[0];
    expect(rigRisk(balance, { id: 'x', kind: 'owned', readyRound: 1, steam: false, rods: true }, st)).toEqual({
      accident: st.accident * R.rods.riskFactor,
      stuck: st.stuck * R.rods.riskFactor,
    });
    // Immer Unfall – außer das Gestänge fängt ihn ganz ab.
    const immerUnfall: Balance = {
      ...balance,
      drilling: {
        ...balance.drilling,
        rigs: { ...R, rods: { ...R.rods, riskFactor: 0 } },
        stages: balance.drilling.stages.map((s) => ({ ...s, accident: 1, stuck: 0 })),
      },
    };
    const { state, a } = spiel();
    const ohne = advanceDrilling(ok(startDrilling(state, immerUnfall, a)), immerUnfall);
    expect(ohne.log.at(-1)).toMatch(/Unfall/);
    const mit = advanceDrilling(ok(startDrilling(ok(upgradeRig(state, immerUnfall, SILAS_RIG, 'rods')), immerUnfall, a)), immerUnfall);
    expect(mit.log.at(-1)).not.toMatch(/Unfall/);
  });
});

describe('Weitere Bohrlöcher gehen direkt auf die bekannte Tiefe (0.2.15+7)', () => {
  it('Quelle in Stufe 2: das zweite Loch kostet Stufe 1+2, dauert beide Stufen und fragt nicht nach', () => {
    const { state, a } = spiel();
    const mitQuelle = quelle(state, a, { stage: 2, oilStage: 2 });
    const [s1, s2] = balance.drilling.stages;
    expect(drillQuote(mitQuelle, balance, a)).toMatchObject({ stage: 2, cost: s1.cost + s2.cost, rounds: s1.rounds + s2.rounds });
    let s = ok(startDrilling(mitQuelle, SICHER, a));
    expect(s.cash).toBe(mitQuelle.cash - s1.cost - s2.cost);
    for (let i = 0; i < s1.rounds + s2.rounds; i++) s = advanceDrilling(s, SICHER);
    expect(wellsOn(s, a).map((w) => w.status)).toEqual(['found', 'found']);
  });
});

describe('Pumpen (0.2.15+7)', () => {
  it('heben die Rate um rateFactor und fangen einen Teil des Druckverlusts auf', () => {
    const p = balance.production.pump;
    const w = { production: { initialRate: 10_000, roundsProduced: 0, lastRate: 0, total: 0 } };
    expect(wellRate(balance, { ...w, pump: true }, 1)).toBe(Math.round(10_000 * p.rateFactor));
    const n = balance.production.freeWells + 2;
    const druck = pressureFactor(balance, n);
    expect(wellRate(balance, w, n)).toBe(Math.round(10_000 * druck));
    expect(wellRate(balance, { ...w, pump: true }, n)).toBe(Math.round(10_000 * (1 - (1 - druck) * (1 - p.pressureKeep)) * p.rateFactor));
  });

  it('nachrüsten kostet, kommt an die stärkste Quelle ohne Pumpe und kostet Unterhalt, solange sie fördert', () => {
    const { state, a } = spiel();
    const zwei = quelle(quelle(state, a), a, { id: `${a}#2`, production: { initialRate: 20_000, roundsProduced: 0, lastRate: 0, total: 0 } });
    const gepumpt = ok(installPump(zwei, balance, a));
    expect(gepumpt.cash).toBe(zwei.cash - balance.production.pump.cost);
    expect(gepumpt.wells.find((w) => w.pump)!.id).toBe(`${a}#2`);
    expect(equipmentCosts(gepumpt, balance).pumps).toBe(balance.production.pump.upkeep);
    const beide = ok(installPump(gepumpt, balance, a));
    expect(installPump(beide, balance, a).ok).toBe(false);
    // Versiegte Quelle: kein Unterhalt mehr.
    const leer = { ...beide, wells: beide.wells.map((w) => ({ ...w, production: { ...w.production!, roundsProduced: 5, lastRate: 0 } })) };
    expect(equipmentCosts(leer, balance).pumps).toBe(0);
    // Ohne Quelle keine Pumpe.
    expect(installPump(state, balance, a).ok).toBe(false);
  });

  it('die Runde zieht Miete und Pumpenunterhalt ab', () => {
    const { state, a } = spiel();
    const s = ok(rentRig(ok(installPump(quelle(state, a), balance, a)), balance));
    const vorher = endRound({ ...quelle(state, a), cash: s.cash }, balance);
    const nachher = endRound(s, balance);
    // Die gepumpte Quelle bringt mehr Öl in den Tank …
    expect(nachher.oilStock).toBeGreaterThan(vorher.oilStock);
    // … und die Kasse zahlt Miete und Unterhalt.
    expect(nachher.log.some((l) => l.includes('Turmmiete') && l.includes('Pumpen'))).toBe(true);
  });
});

describe('Spielstand mit Türmen (Format 13)', () => {
  it('Türme und Pumpen überstehen Sichern und Laden', () => {
    const { state, a } = spiel();
    const s = ok(upgradeRig(ok(rentRig(ok(installPump(quelle(state, a), balance, a)), balance)), balance, SILAS_RIG, 'steam'));
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) {
      expect(geladen.state.rigs).toEqual(s.rigs);
      expect(geladen.state.wells[0].pump).toBe(true);
    }
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(13);
  });

  it('Format 12 ohne Türme lädt mit Silas geliehenem Turm', () => {
    const s = spiel().state;
    const alt = { ...s } as Partial<GameState>;
    delete alt.rigs;
    const geladen = deserializeGame(JSON.stringify({ format: 12, appVersion: 'alt', savedRound: 1, state: alt }));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect(geladen.state.rigs).toEqual([{ id: SILAS_RIG, kind: 'lent', readyRound: 1, steam: false, rods: false }]);
  });

  it('kaputte Türme werden abgelehnt', () => {
    const s = spiel().state;
    const kaputt = { ...s, rigs: [{ id: 'silas', kind: 'geklaut', readyRound: 1, steam: false, rods: false }] };
    expect(deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: 'x', savedRound: 1, state: kaputt })).ok).toBe(false);
  });
});
