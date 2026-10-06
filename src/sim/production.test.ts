import { describe, expect, it } from 'vitest';
import type { Balance, GeologyType } from './balance';
import { advanceDrilling, type Find, type Production, type Well } from './drilling';
import { fieldOf } from './field';
import { endRound, newGame, type GameState } from './game';
import {
  advanceProduction,
  fieldStatus,
  fieldWells,
  initialRate,
  pressureFactor,
  producingWells,
  recoveryFactor,
  recoverable,
  wellRate,
} from './production';
import { areaFactor } from './geology';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const P = balance.production;
const ANTEIL = P.initialRateShare;

/** Spiel mit so vielen fördernden Quellen auf der ersten ölführenden Parzelle. */
function spiel(quellen = 1, seed = 'foerderung', bal: Balance = balance, result: Find = 'small'): GameState {
  const state = newGame(seed, bal);
  const parcel = state.parcels.find((p) => p.fieldId !== undefined && !p.sure)!;
  const ids = state.fields.find((f) => f.id === parcel.fieldId)!.parcelIds.slice(0, quellen);
  return { ...state, wells: ids.map((id) => quelle(state, id, bal, result)) };
}

/** Eine Quelle, wie sie ein Fund hinterlässt. */
function quelle(state: GameState, parcelId: string, bal: Balance = balance, result: Find = 'small'): Well {
  return {
    id: `${parcelId}#1`,
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

/** Die Parzelle der i-ten Quelle. */
function parzelle(state: GameState, i = 0) {
  return state.parcels.find((p) => p.id === state.wells[i].parcelId)!;
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
  it('bis freeWells Quellen kommt die ganze Reserve heraus', () => {
    for (let n = 0; n <= P.freeWells; n++) expect(recoveryFactor(balance, n)).toBe(1);
  });

  it('jede Quelle darüber kostet Ausbeute', () => {
    expect(recoveryFactor(balance, P.freeWells + 1)).toBeCloseTo(1 - P.recoveryLossPerWell, 10);
    expect(recoveryFactor(balance, P.freeWells + 2)).toBeCloseTo(1 - 2 * P.recoveryLossPerWell, 10);
  });

  it('höchstens recoveryLossMax (Überförderung, GDD §5: bis zu 30 %)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 40, 400]) {
      expect(1 - recoveryFactor(balance, n)).toBeLessThanOrEqual(P.recoveryLossMax + 1e-9);
    }
    expect(1 - recoveryFactor(balance, 400)).toBeCloseTo(P.recoveryLossMax, 10);
  });

  it('recoverable = Reserve × Faktor, auf Barrel gerundet', () => {
    expect(recoverable(balance, 100000, 1)).toBe(100000);
    expect(recoverable(balance, 100000, P.freeWells + 1)).toBe(Math.round(100000 * (1 - P.recoveryLossPerWell)));
    expect(recoverable(balance, 1234, 1)).toBe(1234);
    expect(recoverable(balance, 0, 4)).toBe(0);
  });
});

describe('Ratengang einer Quelle', () => {
  it('beginnt mit der Anfangsrate aus der Reserve je Standardfläche der eigenen Ranch', () => {
    const state = spiel();
    expect(stand(state, 0).initialRate).toBe(Math.round((parzelle(state).reserves / areaFactor(balance, parzelle(state))) * ANTEIL.small));
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
    const n = P.freeWells + 1;
    expect(wellRate(balance, state.wells[0], n)).toBe(
      Math.round(stand(state, 0).initialRate * pressureFactor(balance, n)),
    );
    expect(wellRate(balance, state.wells[0], n)).toBeLessThan(stand(state, 0).initialRate);
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

  it('bis freeWells Quellen im selben Feld stören sich nicht', () => {
    const allein = advanceProduction(spiel(1), balance);
    const voll = advanceProduction(spiel(P.freeWells), balance);
    expect(stand(voll, 0).lastRate).toBe(stand(allein, 0).lastRate);
    expect(voll.log.some((l) => /sinkt der Druck/.test(l))).toBe(false);
    expect(voll.log.at(-1)).toMatch(new RegExp(`${P.freeWells} Quellen fördern`));
  });

  it('Quellen auf verschiedenen Feldern beeinflussen sich nicht', () => {
    // Eine Karte mit mindestens zwei Feldern, das erste groß genug für freeWells + 1 Quellen.
    const seed = Array.from({ length: 50 }, (_, i) => `felder-${i}`).find((s) => {
      const g = newGame(s, balance);
      const erstes = g.fields.find((f) => f.id === g.parcels.find((p) => p.fieldId !== undefined && !p.sure)!.fieldId)!;
      return g.fields.length >= 2 && erstes.parcelIds.length > P.freeWells;
    })!;
    const state = spiel(P.freeWells + 1, seed);
    const fremdesFeld = state.fields.find((f) => f.id !== feld(state).id)!;
    const fremd = quelle(state, fremdesFeld.parcelIds[0]);
    const allein = advanceProduction({ ...state, wells: [fremd] }, balance);
    const mitVollemFeld = advanceProduction({ ...state, wells: [...state.wells, fremd] }, balance);
    expect(mitVollemFeld.wells.at(-1)!.production!.lastRate).toBe(allein.wells[0].production!.lastRate);
  });

  it('fördert nie mehr als die förderbare Menge des Feldes', () => {
    // Riesige Anfangsrate: die erste Runde schon über der Ausbeute des Feldes.
    const gierig: Balance = { ...balance, production: { ...P, initialRateShare: { small: 1000, gusher: 1000 } } };
    const state = spiel(1, 'gierig', gierig);
    const einmal = advanceProduction(state, gierig);
    expect(stand(einmal, 0).total).toBeLessThanOrEqual(recoverable(gierig, feld(state).reserves, 1));
    expect(stand(einmal, 0).lastRate).toBeLessThan(stand(state, 0).initialRate);
    expect(einmal.oilStock).toBe(feld(state).reserves);
  });

  it('meldet das leere Feld genau einmal und lässt es danach ruhen', () => {
    const gierig: Balance = { ...balance, production: { ...P, initialRateShare: { small: 1000, gusher: 1000 } } };
    const trocken = advanceProduction(spiel(1, 'gierig', gierig), gierig);
    const gemeldet = trocken.log.filter((l) => /ist erschöpft/.test(l));
    expect(gemeldet).toHaveLength(1);
    expect(trocken.oilStock).toBe(feld(trocken).reserves);
    const danach = advanceProduction(trocken, gierig);
    expect(danach.log.filter((l) => /ist erschöpft/.test(l))).toHaveLength(1);
    expect(danach.oilStock).toBe(trocken.oilStock);
    expect(stand(danach, 0).roundsProduced).toBe(2);
  });

  it('fieldStatus zeigt Restmenge = förderbar minus gefördert', () => {
    const state = advanceProduction(spiel(2), balance);
    const lage = fieldStatus(state, balance, feld(state));
    expect(lage.wells).toBe(2);
    expect(lage.pressure).toBe(1);
    expect(lage.recoverable).toBe(feld(state).reserves);
    expect(lage.remaining).toBe(lage.recoverable - state.oilStock);
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
      wells: [{ id: `${parcelId}#1`, parcelId, stage: 1, status: 'drilling', roundsLeft: 1, spent: 1500, oilStage: 1, startRound: 1 }],
    };
    const well = advanceDrilling(gebohrt, sicher).wells[0];
    if (well.status !== 'found') throw new Error('Die Bohrung hat nichts gefunden.');
    return well;
  }

  it('hängt an der Reserve der eigenen Ranch je Standardfläche', () => {
    const state = spiel();
    const rate = initialRate(balance, state, { parcelId: state.wells[0].parcelId, result: 'small' });
    expect(rate).toBe(Math.round((parzelle(state).reserves / areaFactor(balance, parzelle(state))) * ANTEIL.small));
    expect(rate).toBeGreaterThan(0);
  });

  it('ein Gusher nimmt seinen eigenen, größeren Anteil (mehr Druck)', () => {
    const klein = spiel(1, 'klein', balance, 'small');
    const gusher = spiel(1, 'klein', balance, 'gusher');
    expect(ANTEIL.gusher).toBeGreaterThan(ANTEIL.small);
    expect(stand(gusher, 0).initialRate).toBe(
      initialRate(balance, gusher, { parcelId: gusher.wells[0].parcelId, result: 'gusher' }),
    );
    expect(stand(gusher, 0).initialRate).toBeGreaterThan(stand(klein, 0).initialRate);
  });

  it('der echte Fund richtet sich nach der Art: kleine Quelle und Gusher', () => {
    const state = newGame('fund', balance);
    const id = (geology: GeologyType) =>
      state.parcels.find((p) => p.fieldId !== undefined && p.geology === geology)!.id;
    const klein = fund(state, id('small'));
    const gusher = fund(state, id('gusher'));
    expect(klein.result).toBe('small');
    expect(gusher.result).toBe('gusher');
    const reserve = (id: string) => {
      const p = state.parcels.find((x) => x.id === id)!;
      return p.reserves / areaFactor(balance, p);
    };
    expect(klein.production!.initialRate).toBe(Math.round(reserve(klein.parcelId) * ANTEIL.small));
    expect(gusher.production!.initialRate).toBe(Math.round(reserve(gusher.parcelId) * ANTEIL.gusher));
  });

  it('ist 0, wo kein Öl ist', () => {
    const state = newGame('trocken', balance);
    const trocken = state.parcels.find((p) => p.reserves === 0)!;
    expect(initialRate(balance, state, { parcelId: trocken.id, result: 'small' })).toBe(0);
  });
});
describe('Fertig-Kriterium 1.7: die fünfte Quelle schwächt die anderen sichtbar', () => {
  /**
   * Größtes Feld der Karte mit riesiger Reserve, damit nur der Druck zählt;
   * vier Quellen fördern schon, die fünfte steht bereit.
   */
  function grossesFeld(): { start: GameState; fuenfte: Well } {
    const state = newGame('druck', balance);
    const gross = [...state.fields].sort((a, b) => b.parcelIds.length - a.parcelIds.length)[0];
    expect(gross.parcelIds.length).toBeGreaterThan(P.freeWells);
    const fields = state.fields.map((f) => (f.id === gross.id ? { ...f, reserves: 1e12 } : f));
    const wells = gross.parcelIds.slice(0, P.freeWells + 1).map((id) => quelle(state, id));
    return { start: { ...state, fields, wells: wells.slice(0, P.freeWells) }, fuenfte: wells[P.freeWells] };
  }

  it('vier Quellen fördern ungestört, die fünfte drückt alle', () => {
    expect(P.freeWells).toBe(4);
    const { start, fuenfte } = grossesFeld();

    const runde1 = advanceProduction(start, balance);
    expect(runde1.log.some((l) => /sinkt der Druck/.test(l))).toBe(false);
    expect(feld(runde1).peakWells).toBe(4);
    const ausbeuteVorher = recoverable(balance, feld(runde1).reserves, feld(runde1).peakWells);

    // Gegenprobe: ohne fünfte Quelle fällt die Rate nur um den normalen Rückgang.
    const ohne = advanceProduction(runde1, balance);
    const mit = advanceProduction({ ...runde1, wells: [...runde1.wells, fuenfte] }, balance);
    for (let i = 0; i < P.freeWells; i++) {
      const vorher = stand(runde1, i).lastRate;
      expect(stand(ohne, i).lastRate).toBe(Math.round(stand(runde1, i).initialRate * (1 - P.decline)));
      expect(stand(mit, i).lastRate).toBeLessThan(Math.floor(vorher * (1 - P.decline)));
      expect(stand(mit, i).lastRate / stand(ohne, i).lastRate).toBeCloseTo(1 - P.pressureLossPerWell, 2);
    }
    expect(feld(mit).peakWells).toBe(5);
    expect(fieldStatus(mit, balance, feld(mit))).toMatchObject({ wells: 5, pressure: 1 - P.pressureLossPerWell });
    expect(recoverable(balance, feld(mit).reserves, feld(mit).peakWells)).toBeLessThan(ausbeuteVorher);
    expect(mit.log.filter((l) => /sinkt der Druck – zu viele Quellen/.test(l))).toHaveLength(1);

    // Die Drucklogzeile kommt nur einmal, nicht jede Runde.
    const weiter = advanceProduction(mit, balance);
    expect(weiter.log.filter((l) => /sinkt der Druck/.test(l))).toHaveLength(1);
  });
});

describe('Förderzins-Öl (1.8)', () => {
  it('royaltyOil wächst um Förderung × Förderzins der Pacht', () => {
    const state = spiel(2);
    const [a, b] = state.wells.map((w) => w.parcelId);
    const pacht = (parcelId: string, royalty: number) => ({
      parcelId,
      holder: 'jacob' as const,
      bonus: 0,
      royalty,
      startRound: 1,
      expiresAfterRound: 99,
      drilled: true,
    });
    const vorher = { ...state, leases: [pacht(a, 0.125), pacht(b, 0.2)] };
    const nach = advanceProduction(vorher, balance);
    const erwartet = stand(nach, 0).lastRate * 0.125 + stand(nach, 1).lastRate * 0.2;
    expect(erwartet).toBeGreaterThan(0);
    expect(nach.royaltyOil).toBeCloseTo(erwartet, 10);
  });

  it('ohne Pacht gibt es kein Förderzins-Öl', () => {
    const nach = advanceProduction(spiel(1), balance);
    expect(nach.oilStock).toBeGreaterThan(0);
    expect(nach.royaltyOil).toBe(0);
  });
});
