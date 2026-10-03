// Mehrere Bohrlöcher je Ranch (0.2.15+5): Auf fündigem Land darf Jacob weitere
// Bohrlöcher setzen, bis alle Bohrplätze der Ranch belegt sind.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { advanceDrilling, freeSlots, startDrilling, wellOf, wellsOn, type DrillResult } from './drilling';
import { newGame, type GameState } from './game';
import { advanceProduction, initialRate } from './production';
import { areaFactor } from './geology';
import { loadBalance } from './testBalance';

const balance = loadBalance();
/** Ohne Unfälle und klemmendes Werkzeug. */
const SICHER: Balance = { ...balance, drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident: 0, stuck: 0 })) } };

function ok(r: DrillResult): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Eigene Pacht auf einer ölführenden Ranch mit drei Bohrplätzen. */
function spiel(slots = 3, geology: 'small' | 'dry' = 'small'): { state: GameState; id: string } {
  const s = newGame('mehrere-loecher', balance);
  const ranch = s.parcels.find((p) => !p.discovery && p.fieldId !== undefined)!;
  return {
    id: ranch.id,
    state: {
      ...s,
      cash: 100_000,
      options: [],
      parcels: s.parcels.map((p) => (p.id === ranch.id ? { ...p, slots, geology } : p)),
      leases: [{ parcelId: ranch.id, holder: 'jacob', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 4, drilled: false }],
    },
  };
}

/** Bohrt bis zum Ende der laufenden Bohrung (tiefer, solange es nötig ist). */
function bisFertig(state: GameState, id: string): GameState {
  for (let i = 0; i < 10; i++) {
    state = advanceDrilling(state, SICHER);
    const w = wellOf(state, id)!;
    if (w.status === 'found' || w.status === 'dry') return state;
    if (w.status === 'decision') {
      const stufe = SICHER.drilling.stages[w.stage];
      state = { ...state, wells: state.wells.map((x) => (x.id === w.id ? { ...x, stage: w.stage + 1, status: 'drilling', roundsLeft: stufe.rounds } : x)) };
    }
  }
  return state;
}

describe('Mehrere Bohrlöcher je Ranch', () => {
  it('nach dem Fund: weitere Bohrlöcher mit eigener id, bis alle Bohrplätze belegt sind', () => {
    let { state, id } = spiel(3);
    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    expect(wellOf(state, id)!.status).toBe('found');
    expect(freeSlots(state, id)).toBe(2);

    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    expect(wellsOn(state, id).map((w) => w.id)).toEqual([`${id}#1`, `${id}#2`, `${id}#3`]);
    expect(wellsOn(state, id).every((w) => w.status === 'found')).toBe(true);
    expect(freeSlots(state, id)).toBe(0);
    const voll = startDrilling(state, SICHER, id);
    expect(voll.ok).toBe(false);
    if (!voll.ok) expect(voll.reason).toMatch(/Alle 3 Bohrplätze/);
  });

  it('weitere Bohrlöcher treffen das Öl in derselben Tiefe wie die erste Quelle', () => {
    let { state, id } = spiel(2);
    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    const erste = wellOf(state, id)!;
    const zweite = ok(startDrilling(state, SICHER, id)).wells.at(-1)!;
    expect(zweite.oilStage).toBe(erste.stage);
  });

  it('kein zweites Loch, solange das erste noch bohrt, und nicht auf trockenem Land', () => {
    const { state, id } = spiel(3);
    const laeuft = ok(startDrilling(state, SICHER, id));
    expect(startDrilling(laeuft, SICHER, id).ok).toBe(false);

    const trocken = spiel(3, 'dry');
    const fertig = bisFertig(ok(startDrilling(trocken.state, SICHER, trocken.id)), trocken.id);
    expect(wellOf(fertig, trocken.id)!.status).toBe('dry');
    const r = startDrilling(fertig, SICHER, trocken.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/nur, wo schon Öl gefunden wurde/);
  });

  it('jedes Bohrloch startet mit der Reserve je Standardfläche und fördert für sich', () => {
    let { state, id } = spiel(2);
    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    state = bisFertig(ok(startDrilling(state, SICHER, id)), id);
    const ranch = state.parcels.find((p) => p.id === id)!;
    const [a, b] = wellsOn(state, id);
    const erwartet = initialRate(balance, state, { parcelId: id, result: 'small' });
    expect(erwartet).toBe(Math.round((ranch.reserves / areaFactor(balance, ranch)) * balance.production.initialRateShare.small));
    expect(a.production!.initialRate).toBe(erwartet);
    expect(b.production!.initialRate).toBe(erwartet);
    const danach = advanceProduction(state, balance);
    const [a2, b2] = wellsOn(danach, id);
    expect(a2.production!.lastRate).toBeGreaterThan(0);
    expect(b2.production!.lastRate).toBe(a2.production!.lastRate);
    // Zwei Quellen fördern mehr als eine.
    const nurEine = advanceProduction({ ...state, wells: state.wells.filter((w) => w.id !== b.id) }, balance);
    expect(danach.oilStock).toBeGreaterThan(nurEine.oilStock);
  });
});
