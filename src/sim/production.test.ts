import { describe, expect, it } from 'vitest';
import type { Balance, GeologyType } from './balance';
import { advanceDrilling, type Find, type Production, type Well } from './drilling';
import { fieldOf } from './field';
import { endRound, newGame, type GameState } from './game';
import {
  advanceProduction,
  fieldWells,
  initialRate,
  pressureFactor,
  producingWells,
  recoveryFactor,
  recoverable,
  wellRate,
} from './production';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const P = balance.production;
const ANTEIL = P.initialRateShare;

/** Spiel mit so vielen fördernden Quellen auf der ersten ölführenden Parzelle. */
function spiel(quellen = 1, seed = 'foerderung', bal: Balance = balance, result: Find = 'small'): GameState {
  const state = newGame(seed, bal);
  const parcel = state.parcels.find((p) => p.fieldId !== undefined)!;
  const ids = state.fields.find((f) => f.id === parcel.fieldId)!.parcelIds.slice(0, quellen);
  return { ...state, wells: ids.map((id) => quelle(state, id, bal, result)) };
}

/** Eine Quelle, wie sie ein Fund hinterlässt. */
function quelle(state: GameState, parcelId: string, bal: Balance = balance, result: Find = 'small'): Well {
  return {
    parcelId,
    stage: 1,
    status: 'found',
    roundsLeft: 0,
    spent: 1500,
    oilStage: 1,
    result,
    production: { initialRate: initialRate(bal, state, { parcelId, result }), roundsProduced: 0, lastRate: 0, total: 0 },
    startRound: 1,
  };
}

/** Was die i-te Quelle bisher geliefert hat. */
function stand(state: GameState, i = 0): Production {
  const p = state.wells[i].production;
  if (!p) throw new Error(`Quelle ${i} fördert nicht.`);
  return p;
}

/** Das Feld, in dem die i-te Quelle liegt. */
function feld(state: GameState, i = 0) {
  const id = fieldOf(state, state.wells[i].parcelId)!.id;
  return state.fields.find((f) => f.id === id)!;
}

describe('Druck im Feld', () => {
  it('die ersten Quellen fördern ohne Druckverlust', () => {
    for (let n = 1; n <= P.freeWells; n++) {
      expect(pressureFactor(balance, n)).toBe(1);
    }
  });

  it('jede Quelle darüber kostet allen etwas', () => {
    expect(pressureFactor(balance, P.freeWells + 1)).toBe(1 - P.pressureLossPerWell);
    expect(pressureFactor(balance, P.freeWells + 2)).toBeCloseTo(1 - 2 * P.pressureLossPerWell, 10);
  });

  it('geht nie unter pressureMin, egal wie viele Quellen bohren', () => {
    expect(pressureFactor(balance, 99)).toBe(P.pressureMin);
    expect(pressureFactor(balance, 0)).toBe(1);
  });
});

describe('Ausbeute des Feldes', () => {
  it('eine Quelle fördert die ganze Reserve', () => {
    expect(recoveryFactor(balance, 1)).toBe(1);
    expect(recoveryFactor(balance, 0)).toBe(1);
  });

  it('jede weitere Quelle kostet Ausbeute', () => {
    expect(recoveryFactor(balance, 2)).toBeCloseTo(1 - P.recoveryLossPerWell, 10);
    expect(recoveryFactor(balance, 3)).toBeCloseTo(1 - 2 * P.recoveryLossPerWell, 10);
  });

  it('höchstens recoveryLossMax (Überförderung, GDD §5: bis zu 30 %)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 40, 400]) {
      expect(1 - recoveryFactor(balance, n)).toBeLessThanOrEqual(P.recoveryLossMax + 1e-9);
    }
    expect(1 - recoveryFactor(balance, 400)).toBeCloseTo(P.recoveryLossMax, 10);
  });

  it('recoverable = Reserve × Faktor, auf Barrel gerundet', () => {
    expect(recoverable(balance, 100000, 1)).toBe(100000);
    expect(recoverable(balance, 100000, 2)).toBe(Math.round(100000 * (1 - P.recoveryLossPerWell)));
    expect(recoverable(balance, 1234, 1)).toBe(1234);
    expect(recoverable(balance, 0, 4)).toBe(0);
  });
});

describe('Ratengang einer Quelle', () => {
  it('beginnt mit der Anfangsrate aus der Feldreserve', () => {
    const state = spiel();
    expect(stand(state, 0).initialRate).toBe(Math.round(feld(state).reserves * ANTEIL.small));
    expect(wellRate(balance, state.wells[0], 1)).toBe(stand(state, 0).initialRate);
  });

  it('die erste Runde liefert die volle Anfangsrate, danach fällt der Rückgang', () => {
    const state = spiel();
    const q0 = stand(state, 0).initialRate;
    let lauf = state;
    for (let t = 1; t <= 5; t++) {
      lauf = advanceProduction(lauf, balance);
      expect(stand(lauf, 0).lastRate).toBe(Math.round(q0 * (1 - P.decline) ** (t - 1)));
      expect(stand(lauf, 0).roundsProduced).toBe(t);
    }
  });

  it('geht mit dem Druck des Feldes runter', () => {
    const state = spiel();
    expect(wellRate(balance, state.wells[0], 2)).toBe(
      Math.round(stand(state, 0).initialRate * pressureFactor(balance, 2)),
    );
  });

  it('liefert 0, wenn die Bohrung noch nichts gefunden hat', () => {
    const state = spiel();
    const ohne = { ...state.wells[0], production: undefined };
    expect(wellRate(balance, ohne, 1)).toBe(0);
  });
});

describe('Fördernde Quellen finden', () => {
  it('nur gefundene Bohrungen fördern', () => {
    const state = newGame('nur', balance);
    expect(producingWells(state)).toEqual([]);
    expect(producingWells(spiel())).toHaveLength(1);
  });

  it('abgebrochene und trockene Bohrungen fördern nicht', () => {
    const state = spiel(2);
    const verdorben = state.wells.map((w, i) => (i === 0 ? { ...w, status: 'dry' as const } : w));
    expect(producingWells({ ...state, wells: verdorben })).toHaveLength(1);
  });

  it('das Feld sammelt alle Quellen, die darin fördern', () => {
    const state = spiel(3);
    const id = state.wells[0].parcelId;
    const fieldId = state.parcels.find((p) => p.id === id)!.fieldId!;
    expect(fieldWells(state, fieldId)).toHaveLength(3);
    expect(fieldWells(state, 'gibtsnicht')).toHaveLength(0);
  });
});

describe('Rundenende in der Förderung', () => {
  it('ohne Quellen bleibt der Zustand unangetastet', () => {
    const state = newGame('nichts', balance);
    expect(advanceProduction(state, balance)).toBe(state);
  });

  it('das Öl wandert in den Tank und wird in der Quelle gutgeschrieben', () => {
    const state = spiel();
    const first = advanceProduction(state, balance);
    expect(first.oilStock).toBe(stand(first, 0).lastRate);
    expect(stand(first, 0)).toMatchObject({ roundsProduced: 1, total: stand(first, 0).lastRate });
    expect(first.log.at(-1)).toMatch(/1 Quelle fördert .* Barrel, im Tank sind .* Barrel\./);
  });

  it('summiert sich über die Runden, der Tank bleibt die Summe aller Quellen', () => {
    let state = spiel();
    for (let i = 0; i < 5; i++) state = advanceProduction(state, balance);
    expect(state.oilStock).toBe(state.wells.reduce((s, w) => s + w.production!.total, 0));
    expect(state.wells[0].production!.total).toBeGreaterThan(state.wells[0].production!.lastRate);
  });

  it('eine zweite Quelle im selben Feld senkt die Rate der ersten', () => {
    const allein = spiel(1);
    const paar = spiel(2);
    const vorher = advanceProduction(allein, balance);
    const nachher = advanceProduction(paar, balance);
    expect(stand(nachher, 0).lastRate).toBe(stand(nachher, 1).lastRate);
    expect(stand(nachher, 0).lastRate).toBeLessThan(stand(vorher, 0).lastRate);
    expect(nachher.log.at(-1)).toMatch(/2 Quellen fördern/);
  });

  it('fördert nie mehr als die förderbare Menge des Feldes', () => {
    // Riesige Anfangsrate: die erste Runde schon über der Ausbeute des Feldes.
    const gierig: Balance = { ...balance, production: { ...P, initialRateShare: { small: 5, gusher: 5 } } };
    const state = spiel(1, 'gierig', gierig);
    const einmal = advanceProduction(state, gierig);
    expect(stand(einmal, 0).total).toBeLessThanOrEqual(recoverable(gierig, feld(state).reserves, 1));
    expect(einmal.oilStock).toBe(feld(state).reserves);
  });

  it('meldet das leere Feld genau einmal und lässt es danach ruhen', () => {
    const gierig: Balance = { ...balance, production: { ...P, initialRateShare: { small: 5, gusher: 5 } } };
    const trocken = advanceProduction(spiel(1, 'gierig', gierig), gierig);
    const gemeldet = trocken.log.filter((l) => /ist erschöpft/.test(l));
    expect(gemeldet).toHaveLength(1);
    expect(trocken.oilStock).toBe(feld(trocken).reserves);
    const danach = advanceProduction(trocken, gierig);
    expect(danach.log.filter((l) => /ist erschöpft/.test(l))).toHaveLength(1);
    expect(danach.oilStock).toBe(trocken.oilStock);
    expect(stand(danach, 0).roundsProduced).toBe(2);
  });

  it('ändert den alten Zustand nicht', () => {
    const before = spiel();
    const kopie = structuredClone(before);
    advanceProduction(before, balance);
    expect(before).toEqual(kopie);
  });

  it('zieht keinen Zufallswert: gleiche Karte, gleiche Förderung', () => {
    const a = spiel();
    const b = spiel();
    for (let i = 0; i < 4; i++) {
      const x = advanceProduction(a, balance);
      const y = advanceProduction(b, balance);
      expect(x.wells).toEqual(y.wells);
      expect(x.oilStock).toBe(y.oilStock);
    }
    expect(advanceProduction(a, balance).rng).toBe(a.rng);
  });

  it('läuft in der Rundenschleife mit und endet mit dem Kapitel', () => {
    let state = newGame('kapitel', balance);
    const produziert: number[] = [];
    for (let i = 0; i < 15; i++) {
      const vorher = state;
      state = endRound(state, balance);
      produziert.push(state.oilStock - vorher.oilStock);
    }
    expect(produziert.every((differenz) => differenz === 0)).toBe(true);
    expect(state.finished).toBe(false);
    state = endRound(state, balance);
    expect(state.finished).toBe(true);
  });
});

describe('Anfangsrate', () => {
  /** Bohrung ohne Unfallrisiko, die in dieser Runde ihren Fund meldet. */
  function fund(state: GameState, parcelId: string): Well {
    const sicher: Balance = {
      ...balance,
      drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident: 0, stuck: 0 })) },
    };
    const gebohrt: GameState = {
      ...state,
      wells: [{ parcelId, stage: 1, status: 'drilling', roundsLeft: 1, spent: 1500, oilStage: 1, startRound: 1 }],
    };
    const well = advanceDrilling(gebohrt, sicher).wells[0];
    if (well.status !== 'found') throw new Error('Die Bohrung hat nichts gefunden.');
    return well;
  }

  it('hängt an der Feldreserve, nicht nur an der Parzelle', () => {
    const state = spiel();
    const rate = initialRate(balance, state, { parcelId: state.wells[0].parcelId, result: 'small' });
    expect(rate).toBe(Math.round(feld(state).reserves * ANTEIL.small));
    expect(rate).toBeGreaterThan(0);
  });

  it('ein Gusher nimmt seinen eigenen, kleineren Anteil', () => {
    const klein = spiel(1, 'klein', balance, 'small');
    const gusher = spiel(1, 'klein', balance, 'gusher');
    expect(ANTEIL.gusher).toBeLessThan(ANTEIL.small);
    expect(stand(gusher, 0).initialRate).toBe(
      initialRate(balance, gusher, { parcelId: gusher.wells[0].parcelId, result: 'gusher' }),
    );
    expect(stand(gusher, 0).initialRate).toBeLessThan(stand(klein, 0).initialRate);
  });

  it('der echte Fund richtet sich nach der Art: kleine Quelle und Gusher', () => {
    const state = newGame('fund', balance);
    const id = (geology: GeologyType) =>
      state.parcels.find((p) => p.fieldId !== undefined && p.geology === geology)!.id;
    const klein = fund(state, id('small'));
    const gusher = fund(state, id('gusher'));
    expect(klein.result).toBe('small');
    expect(gusher.result).toBe('gusher');
    expect(klein.production!.initialRate).toBe(Math.round(fieldOf(state, klein.parcelId)!.reserves * ANTEIL.small));
    expect(gusher.production!.initialRate).toBe(Math.round(fieldOf(state, gusher.parcelId)!.reserves * ANTEIL.gusher));
  });

  it('ist 0, wo kein Öl ist', () => {
    const state = newGame('trocken', balance);
    const trocken = state.parcels.find((p) => p.reserves === 0)!;
    expect(initialRate(balance, state, { parcelId: trocken.id, result: 'small' })).toBe(0);
  });
});