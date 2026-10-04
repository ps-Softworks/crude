import { describe, expect, it } from 'vitest';
import type { Balance, GeologyType } from './balance';
import {
  abandonWell,
  accidentChance,
  advanceDrilling,
  deeperChance,
  drillDeeper,
  fishWell,
  rollOilStage,
  stageCost,
  stageOutlook,
  startDrilling,
  wellOf,
  type DrillResult,
  type Well,
} from './drilling';
import { trueChance } from './forecast';
import { endRound, newGame, type GameState } from './game';
import { buyLease, settleLeases } from './lease';
import { seedFromString } from './rng';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const PARCEL = 'salthill-01';

/** Echte Zahlen, aber Unfall- und Klemm-Chance fest auf allen Stufen. */
function withRisk(accident: number, stuck: number): Balance {
  return {
    ...balance,
    drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident, stuck })) },
  };
}
const SAFE = withRisk(0, 0);

function ok(result: DrillResult): GameState {
  if (!result.ok) throw new Error(`Erwartet ok, bekommen: ${result.reason}`);
  return result.state;
}

/** Spiel mit eigener, ungebohrter Pacht auf PARCEL und fester Geologie. */
function game(geology: GeologyType = 'small', cash = 100000, seed = 'bohren'): GameState {
  const state = newGame(seed, balance);
  return {
    ...state,
    cash,
    options: [],
    parcels: state.parcels.map((p) => (p.id === PARCEL ? { ...p, geology } : p)),
    leases: [
      { parcelId: PARCEL, holder: 'jacob', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 1, drilled: false },
    ],
  };
}

function setWell(state: GameState, patch: Partial<Well>): GameState {
  return { ...state, wells: state.wells.map((w) => (w.parcelId === PARCEL ? { ...w, ...patch } : w)) };
}

function well(state: GameState): Well {
  const w = wellOf(state, PARCEL);
  if (!w) throw new Error('Keine Bohrung');
  return w;
}

function parcel(state: GameState) {
  return state.parcels.find((p) => p.id === PARCEL)!;
}

describe('Bohrstufen', () => {
  it('Kosten und Unfallrisiko steigen mit jeder Stufe (Fertig-Kriterium a)', () => {
    for (let s = 2; s <= balance.drilling.stages.length; s++) {
      expect(stageCost(balance, s)).toBeGreaterThan(stageCost(balance, s - 1));
      expect(accidentChance(balance, s)).toBeGreaterThan(accidentChance(balance, s - 1));
    }
  });
});

describe('Ölstufe ziehen', () => {
  it('trockene Parzellen haben kein Öl', () => {
    expect(rollOilStage(balance, { ...parcel(game()), geology: 'dry' }, 0)).toBeNull();
  });

  it('teilt nach den kumulierten Anteilen aus balance.yaml (0,85 / 0,10 / 0,05)', () => {
    const p = parcel(game());
    const [a, b] = balance.drilling.stages.map((s) => s.oilShare);
    expect(rollOilStage(balance, p, 0)).toBe(1);
    expect(rollOilStage(balance, p, a - 0.001)).toBe(1);
    expect(rollOilStage(balance, p, a + 0.001)).toBe(2);
    expect(rollOilStage(balance, p, a + b - 0.001)).toBe(2);
    expect(rollOilStage(balance, p, a + b + 0.001)).toBe(3);
    expect(rollOilStage(balance, p, 0.9999)).toBe(3);
  });

  it('Frühes Öl: das meiste Öl liegt in der ersten Stufe, Stufe 1 ist sicherer als die Tiefe', () => {
    const [s1, s2, s3] = balance.drilling.stages;
    expect(s1.oilShare).toBeGreaterThanOrEqual(0.8);
    expect(s1.oilShare + s2.oilShare + s3.oilShare).toBeCloseTo(1, 10);
    expect(s1.accident + s1.stuck).toBeLessThanOrEqual(0.06);
  });
});

describe('Chance beim Tieferbohren', () => {
  const [a, b, c] = balance.drilling.stages.map((s) => s.oilShare);

  it('stimmt mit der Handrechnung überein', () => {
    const p = parcel(game());
    const q = trueChance(balance, p);
    expect(deeperChance(balance, p, 1)).toBeCloseTo((q * b) / (1 - q * a), 10);
    expect(deeperChance(balance, p, 2)).toBeCloseTo((q * c) / (1 - q * (a + b)), 10);
    expect(deeperChance(balance, p, 3)).toBe(0);
  });

  it('ist konsistent: Fund in Stufe 1 + weiter + weiter ergibt die Gesamtchance', () => {
    const p = parcel(game());
    const q = trueChance(balance, p);
    const d1 = q * a;
    const total = d1 + (1 - d1) * deeperChance(balance, p, 1) +
      (1 - d1) * (1 - deeperChance(balance, p, 1)) * deeperChance(balance, p, 2);
    expect(total).toBeCloseTo(q, 10);
  });
});

describe('Chance in der nächsten Tiefe (Frühes Öl)', () => {
  /** Prognose fest setzen, damit die Rechnung nachvollziehbar ist. */
  function mitPrognose(state: GameState, low: number, high: number): GameState {
    return { ...state, forecasts: { ...state.forecasts, [PARCEL]: { parcelId: PARCEL, low, high, center: (low + high) / 2 } } };
  }

  it('vor der ersten Stufe: Mitte der Prognose × Anteil der ersten Stufe, auf 300 m', () => {
    const state = mitPrognose(game(), 50, 80);
    const share = balance.drilling.stages[0].oilShare;
    expect(stageOutlook(state, balance, PARCEL)).toEqual({ stage: 1, depth: 300, chance: Math.round(65 * share) });
    // Weniger als die Gesamtchance – genau das soll der Spieler sehen.
    expect(stageOutlook(state, balance, PARCEL)!.chance).toBeLessThan(65);
  });

  it('rechnet nur aus der angezeigten Prognose, nie aus der wahren Geologie', () => {
    const trocken = mitPrognose(game('dry'), 50, 80);
    const gusher = mitPrognose(game('gusher'), 50, 80);
    expect(stageOutlook(trocken, balance, PARCEL)).toEqual(stageOutlook(gusher, balance, PARCEL));
  });

  it('nach einer trockenen Stufe: die neue Prognose gilt schon für die nächste Stufe', () => {
    let state = ok(startDrilling(game('dry'), SAFE, PARCEL));
    state = advanceDrilling(state, SAFE);
    expect(well(state).status).toBe('decision');
    const f = state.forecasts[PARCEL];
    expect(stageOutlook(state, SAFE, PARCEL)).toEqual({ stage: 2, depth: 600, chance: Math.round((f.low + f.high) / 2) });
    // Während Stufe 2 läuft, bleibt es bei derselben Aussage.
    state = ok(drillDeeper(state, SAFE, PARCEL));
    expect(stageOutlook(state, SAFE, PARCEL)).toMatchObject({ stage: 2, depth: 600 });
  });

  it('nichts mehr zu sagen: nach einem Fund, nach dem Aufgeben, ohne Prognose', () => {
    let state = ok(startDrilling(game('small'), SAFE, PARCEL));
    state = setWell(state, { oilStage: 1 });
    state = advanceDrilling(state, SAFE);
    expect(well(state).status).toBe('found');
    expect(stageOutlook(state, SAFE, PARCEL)).toBeNull();

    let leer = ok(startDrilling(game('dry'), SAFE, PARCEL));
    leer = advanceDrilling(leer, SAFE);
    leer = ok(abandonWell(leer, SAFE, PARCEL));
    expect(stageOutlook(leer, SAFE, PARCEL)).toBeNull();

    const ohne = { ...game(), forecasts: {} };
    expect(stageOutlook(ohne, balance, PARCEL)).toBeNull();
  });
});

describe('Frühes Öl: erste Bohrung auf gut geschätztem Land', () => {
  it('auf Ranches mit ≥ 60 % Prognose trifft die erste Bohrung (300 m, ohne klemmendes Werkzeug) in mindestens der Hälfte der Fälle', () => {
    const s1 = balance.drilling.stages[0];
    let felder = 0;
    let treffer = 0;
    for (let i = 0; i < 150; i++) {
      const state = newGame(`frueh-${i}`, balance);
      for (const p of state.parcels) {
        const f = state.forecasts[p.id];
        if (p.discovery || !f || (f.low + f.high) / 2 < 60) continue;
        felder++;
        // Unfälle wiederholen nur die Stufe; verloren ist sie nur, wenn das Werkzeug klemmt.
        if (p.geology !== 'dry') treffer += s1.oilShare * (1 - s1.stuck);
      }
    }
    expect(felder).toBeGreaterThan(500);
    expect(treffer / felder).toBeGreaterThanOrEqual(0.5);
  });
});

describe('Bohrung beginnen', () => {
  it('geht nicht ohne eigene Pacht', () => {
    const state = { ...game(), leases: [] };
    const r = startDrilling(state, balance, PARCEL);
    expect(r.ok).toBe(false);
  });

  it('geht nicht ohne genug Geld', () => {
    const r = startDrilling(game('small', stageCost(balance, 1) - 1), balance, PARCEL);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Nicht genug Geld/);
  });

  it('geht nicht, wenn der Turm belegt ist', () => {
    let state = game();
    state = { ...state, leases: [...state.leases, { ...state.leases[0], parcelId: 'salthill-02' }] };
    state = ok(startDrilling(state, balance, PARCEL));
    const r = startDrilling(state, balance, 'salthill-02');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Bohrturm/);
  });

  it('zieht die Kosten ab, markiert die Pacht als gebohrt und sie verfällt nicht mehr', () => {
    const before = game();
    const state = ok(startDrilling(before, balance, PARCEL));
    expect(state.cash).toBe(before.cash - stageCost(balance, 1));
    expect(state.leases[0].drilled).toBe(true);
    expect(well(state)).toMatchObject({ stage: 1, status: 'drilling', roundsLeft: 1, spent: 1000 });
    expect(state.rng).not.toBe(before.rng);
    // Laufzeit wäre jetzt vorbei – gebohrt verfällt sie trotzdem nicht.
    expect(settleLeases(state, balance).leases).toHaveLength(1);
  });

  it('zieht auch bei trockenem Land genau einen Zufallswert', () => {
    const a = ok(startDrilling(game('dry'), balance, PARCEL));
    const b = ok(startDrilling(game('small'), balance, PARCEL));
    expect(a.rng).toBe(b.rng);
    expect(well(a).oilStage).toBeNull();
  });
});

describe('Rundenende beim Bohren', () => {
  const started = (geology: GeologyType = 'small') => ok(startDrilling(game(geology), balance, PARCEL));

  it('Unfall: Entschädigung, die Stufe wird wiederholt', () => {
    const before = started();
    const state = advanceDrilling(before, withRisk(1, 0));
    expect(state.cash).toBe(before.cash - balance.drilling.accidentCost);
    expect(well(state)).toMatchObject({ stage: 1, status: 'drilling', roundsLeft: 1 });
    expect(state.log.at(-1)).toMatch(/Unfall auf dem Bohrturm/);
  });

  it('Unfall nimmt höchstens das, was in der Kasse ist', () => {
    const before = { ...started(), cash: 50 };
    expect(advanceDrilling(before, withRisk(1, 0)).cash).toBe(0);
  });

  it('klemmendes Werkzeug: bergen oder aufgeben', () => {
    const stuck = advanceDrilling(started(), withRisk(0, 1));
    expect(well(stuck).status).toBe('stuck');
    expect(drillDeeper(stuck, balance, PARCEL).ok).toBe(false);

    const fished = ok(fishWell(stuck, balance, PARCEL));
    expect(fished.cash).toBe(stuck.cash - balance.drilling.fishingCost);
    expect(well(fished)).toMatchObject({ status: 'drilling', roundsLeft: 1, spent: 1000 + 300 });

    const given = ok(abandonWell(stuck, balance, PARCEL));
    expect(well(given).status).toBe('dry');
  });

  it('Öl in der aktuellen Stufe: Fund', () => {
    const state = advanceDrilling(setWell(started(), { oilStage: 1 }), SAFE);
    expect(well(state)).toMatchObject({ status: 'found', result: 'small' });
  });

  it('Gusher bekommt eine eigene Schlagzeile', () => {
    const state = advanceDrilling(setWell(started('gusher'), { oilStage: 1 }), SAFE);
    expect(well(state).result).toBe('gusher');
    expect(state.log.at(-1)).toMatch(/GUSHER/);
  });

  it('nichts gefunden: Entscheidung mit neuer Prognose', () => {
    const before = setWell(started(), { oilStage: 2 });
    const state = advanceDrilling(before, SAFE);
    expect(well(state).status).toBe('decision');
    expect(state.forecasts[PARCEL]).not.toEqual(before.forecasts[PARCEL]);
  });

  it('nichts gefunden auf der letzten Stufe: trocken', () => {
    const state = advanceDrilling(setWell(started(), { oilStage: null, stage: 3, roundsLeft: 1 }), SAFE);
    expect(well(state).status).toBe('dry');
  });

  it('zieht pro Stufenabschluss immer genau zwei Zufallswerte', () => {
    const a = advanceDrilling(setWell(started(), { oilStage: 1 }), SAFE);
    const b = advanceDrilling(setWell(started(), { oilStage: 1 }), withRisk(1, 0));
    expect(a.rng).toBe(b.rng);
  });
});

describe('Tiefer bohren', () => {
  it('Stufe +1, Kosten und Dauer der neuen Stufe', () => {
    let state = advanceDrilling(setWell(ok(startDrilling(game(), balance, PARCEL)), { oilStage: null }), SAFE);
    const cash = state.cash;
    state = ok(drillDeeper(state, balance, PARCEL));
    expect(well(state)).toMatchObject({ stage: 2, status: 'drilling', roundsLeft: 1, spent: 1000 + 1100 });
    expect(state.cash).toBe(cash - 1100);

    state = advanceDrilling(state, SAFE);
    state = ok(drillDeeper(state, balance, PARCEL));
    expect(well(state)).toMatchObject({ stage: 3, roundsLeft: 2, spent: 1000 + 1100 + 1400 });
    state = advanceDrilling(state, SAFE);
    expect(well(state)).toMatchObject({ status: 'drilling', roundsLeft: 1 });
    state = advanceDrilling(state, SAFE);
    expect(well(state).status).toBe('dry');
    expect(drillDeeper(state, balance, PARCEL).ok).toBe(false);
  });

  it('geht nicht ohne genug Geld', () => {
    const state = advanceDrilling(setWell(ok(startDrilling(game('small', 2000), balance, PARCEL)), { oilStage: null }), SAFE);
    expect(drillDeeper(state, balance, PARCEL).ok).toBe(false);
  });
});

describe('Determinismus', () => {
  it('gleicher Seed und gleiche Aktionen ergeben den gleichen Zustand', () => {
    const play = () => {
      let state = ok(startDrilling(game('small', 100000, 'det'), balance, PARCEL));
      for (let i = 0; i < 6; i++) {
        state = endRound(state, balance);
        const w = well(state);
        if (w.status === 'decision') state = ok(drillDeeper(state, balance, PARCEL));
        if (w.status === 'stuck') state = ok(fishWell(state, balance, PARCEL));
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});

describe('Fertig-Kriterium: tiefer bohren ist spürbar riskanter', () => {
  it('Monte Carlo über 500 Seeds: mehr Unfälle auf Stufe 3, höhere Kosten', () => {
    const attempts = [0, 0, 0, 0];
    const accidents = [0, 0, 0, 0];
    let costStage1 = 0;
    let costStage3 = 0;
    for (let i = 0; i < 500; i++) {
      // Trocken: die Bohrung geht sicher bis Stufe 3.
      let state = { ...game('dry'), rng: seedFromString(`mc-${i}`) };
      const startCash = state.cash;
      state = ok(startDrilling(state, balance, PARCEL));
      for (let guard = 0; guard < 100; guard++) {
        const w = well(state);
        if (w.status === 'dry') break;
        if (w.status === 'decision') {
          if (w.stage === 1) costStage1 += startCash - state.cash;
          state = ok(drillDeeper(state, balance, PARCEL));
          continue;
        }
        if (w.status === 'stuck') {
          state = ok(fishWell(state, balance, PARCEL));
          continue;
        }
        const resolving = w.roundsLeft === 1;
        const cash = state.cash;
        state = advanceDrilling(state, balance);
        if (resolving) {
          attempts[w.stage]++;
          if (cash - state.cash === balance.drilling.accidentCost) accidents[w.stage]++;
        }
      }
      expect(well(state).stage).toBe(3);
      costStage3 += startCash - state.cash;
    }
    const rate1 = accidents[1] / attempts[1];
    const rate3 = accidents[3] / attempts[3];
    expect(rate3).toBeGreaterThan(rate1);
    expect(costStage3 / 500).toBeGreaterThan(costStage1 / 500);
  });

  it('Integration: Pacht, bohren, Runde beenden, tiefer bohren', () => {
    let state = newGame('integration', balance);
    state = { ...state, cash: 100000, options: [] };
    const id = state.parcels.find((p) => !p.discovery && p.geology === 'dry')!.id;
    state = ok(buyLease(state, balance, id));
    state = ok(startDrilling(state, balance, id));
    for (let i = 0; i < 10 && wellOf(state, id)!.status !== 'decision'; i++) {
      if (wellOf(state, id)!.status === 'stuck') state = ok(fishWell(state, balance, id));
      state = endRound(state, balance);
    }
    expect(wellOf(state, id)!.status).toBe('decision');
    state = ok(drillDeeper(state, balance, id));
    expect(wellOf(state, id)!.stage).toBe(2);
  });
});
