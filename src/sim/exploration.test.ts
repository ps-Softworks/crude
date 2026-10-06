// Termine als Hauptwerkzeug, Etappe 1: verdeckte Geologie mit Salzrücken, Hinweise,
// Wissensstand und Prognose aus den Hinweisen (Plan 1.1, 1.2, Tests 1.5).
import { describe, expect, it } from 'vitest';
import {
  clueFactor,
  clueOdds,
  knowledgeForecast,
  knowledgeOf,
  knowledgeWidth,
  learnFromWells,
  posteriorChance,
  ride,
  rideClues,
  rideParcels,
  rollClue,
  addClues,
  type Clue,
} from './exploration';
import { zoneChance } from './forecast';
import { deeperChance } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { generateParcels, onTrend, parcelChance, regionTrends, rollGeology, type Parcel } from './geology';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const t = balance.geology.trends;

describe('Salzrücken und verdeckte Fundchance q (Plan 1.1)', () => {
  it('gleicher Seed = gleiche Linien, anderer Seed = andere', () => {
    expect(regionTrends(balance, 'rücken', 'salthill')).toEqual(regionTrends(balance, 'rücken', 'salthill'));
    expect(regionTrends(balance, 'rücken', 'salthill')).not.toEqual(regionTrends(balance, 'anders', 'salthill'));
    expect(regionTrends(balance, 'rücken', 'salthill')).toHaveLength(t.perRegion);
    expect(regionTrends(balance, 'rücken', 'portellis')).toEqual([]);
  });

  it('Ranches nah an einer Linie bekommen den Aufschlag, alle anderen den Abschlag', () => {
    const kern = balance.geology.zones.find((z) => z.name === 'kern')!;
    const [linie] = regionTrends(balance, 'rücken', 'salthill');
    const mitte: [number, number] = [(linie.a[0] + linie.b[0]) / 2, (linie.a[1] + linie.b[1]) / 2];
    expect(onTrend(balance, [linie], mitte[0], mitte[1])).toBe(true);
    // noiseRoll 0,5 = kein Rauschen.
    expect(parcelChance(balance, kern, [linie], mitte[0], mitte[1], 0.5)).toBeCloseTo(Math.min(t.qMax, kern.base + t.bonus), 10);
    expect(parcelChance(balance, kern, [linie], mitte[0] + 50, mitte[1] + 50, 0.5)).toBeCloseTo(Math.max(t.qMin, kern.base + t.offTrend), 10);
    for (let i = 0; i < 100; i++) {
      const lines = regionTrends(balance, `welt-${i}`, 'salthill');
      for (const p of generateParcels(balance, `welt-${i}`)) {
        const zone = balance.geology.zones.find((z) => z.name === p.zone)!;
        const auf = onTrend(balance, lines, p.x, p.y);
        const mittelwert = zone.base + (auf ? t.bonus : t.offTrend);
        expect(p.chance!).toBeGreaterThanOrEqual(Math.max(t.qMin, mittelwert - t.noise) - 1e-9);
        expect(p.chance!).toBeLessThanOrEqual(Math.min(t.qMax, mittelwert + t.noise) + 1e-9);
      }
    }
  });

  it('q bleibt in den Grenzen qMin–qMax', () => {
    for (let i = 0; i < 200; i++) {
      for (const p of generateParcels(balance, `grenze-${i}`)) {
        expect(p.chance!).toBeGreaterThanOrEqual(t.qMin);
        expect(p.chance!).toBeLessThanOrEqual(t.qMax);
      }
    }
  });

  it('rollGeology(q): trocken mit 1 − q, der Rest im Verhältnis small : gusher – über 10.000 Würfe auf ±2 Punkte', () => {
    const zone = balance.geology.zones.find((z) => z.name === 'ring')!;
    const q = 0.6;
    const n = 10000;
    const zahl = { dry: 0, small: 0, gusher: 0 };
    for (let i = 0; i < n; i++) zahl[rollGeology(zone, q, (i + 0.5) / n)]++;
    const klein = zone.small / (zone.small + zone.gusher);
    expect(Math.abs(zahl.dry / n - (1 - q))).toBeLessThan(0.02);
    expect(Math.abs(zahl.small / n - q * klein)).toBeLessThan(0.02);
    expect(Math.abs(zahl.gusher / n - q * (1 - klein))).toBeLessThan(0.02);
  });

  it('die Geologie folgt q: Ranches auf dem Rücken haben viel öfter Öl', () => {
    let auf = 0;
    let aufOel = 0;
    let neben = 0;
    let nebenOel = 0;
    for (let i = 0; i < 300; i++) {
      const lines = regionTrends(balance, `oel-${i}`, 'salthill');
      for (const p of generateParcels(balance, `oel-${i}`)) {
        if (p.discovery) continue;
        if (onTrend(balance, lines, p.x, p.y)) {
          auf++;
          if (p.geology !== 'dry') aufOel++;
        } else {
          neben++;
          if (p.geology !== 'dry') nebenOel++;
        }
      }
    }
    expect(aufOel / auf).toBeGreaterThan(2 * (nebenOel / neben));
  });
});

/** Eine Ranch der Karte mit Nachbarn im selben Gebiet. */
function ranchMitNachbarn(state: GameState): Parcel {
  // Ohne die Startquelle (0.4.20+19): deren Prognose steht fest auf „Öl sicher“.
  return state.parcels.find((p) => !p.discovery && !p.sure && p.neighbors.filter((id) => state.parcels.some((q) => q.id === id && !q.discovery && !q.sure)).length >= 2 && !state.knowledge[p.id] && !p.neighbors.some((id) => state.parcels.find((q) => q.id === id)?.sure))!;
}

describe('Hinweise rechnen als Quote (Plan 1.2)', () => {
  const state = newGame('quote', balance);

  it('Faktor gesehen = P(s|Öl)/P(s|trocken), nicht gesehen = (1−P(s|Öl))/(1−P(s|trocken))', () => {
    const o = balance.exploration.clues.sickerstelle;
    expect(clueFactor(balance, { kind: 'sickerstelle', seen: true })).toBeCloseTo(o.oil / o.dry, 10);
    expect(clueFactor(balance, { kind: 'sickerstelle', seen: false })).toBeCloseTo((1 - o.oil) / (1 - o.dry), 10);
    // Wünschelrute: reiner Zufall, Faktor 1.
    expect(clueFactor(balance, { kind: 'rute', seen: true })).toBeCloseTo(1, 10);
    // Kartierung wird mit der Genauigkeit schärfer.
    expect(clueFactor(balance, { kind: 'kartierung', seen: true, accuracy: 5 })).toBeGreaterThan(clueFactor(balance, { kind: 'kartierung', seen: true, accuracy: 1 }));
  });

  it('ein Hinweis auf der Ranch multipliziert die Quote, auf dem Nachbarn mit Faktor hoch neighbourPower', () => {
    const p = ranchMitNachbarn(state);
    const n = state.parcels.find((q) => p.neighbors.includes(q.id) && !q.discovery && !q.sure && q.region === p.region)!;
    const quote = (x: number) => x / (1 - x);
    const clue: Clue = { kind: 'brunnen', source: 'farmer', round: 1, seen: true };
    const f = clueFactor(balance, clue);
    const nachP = addClues(state, balance, p.id, [clue]);
    const vorP = posteriorChance(state, balance, p.id);
    const vorN = posteriorChance(state, balance, n.id);
    expect(vorP).toBeCloseTo(Math.min(t.qMax, Math.max(t.qMin, posteriorChance({ ...state, knowledge: {} }, balance, p.id))), 10);
    const erwartetP = quote(vorP) * f;
    expect(quote(posteriorChance(nachP, balance, p.id))).toBeCloseTo(Math.min(quote(t.qMax), erwartetP), 6);
    expect(quote(posteriorChance(nachP, balance, n.id))).toBeCloseTo(Math.min(quote(t.qMax), quote(vorN) * f ** balance.exploration.neighbourPower), 6);
  });

  it('ohne Hinweise gilt das öffentliche Wissen der Zone, und die Chance bleibt zwischen qMin und qMax', () => {
    const p = ranchMitNachbarn(state);
    expect(posteriorChance({ ...state, knowledge: {} }, balance, p.id)).toBeCloseTo(zoneChance(balance, p), 10);
    const viel: Clue[] = (['sickerstelle', 'salzwasser', 'formation', 'brunnen', 'bohrbericht'] as const).map((kind) => ({ kind, source: 'ritt', round: 1, seen: true }));
    const nichts: Clue[] = viel.map((c) => ({ ...c, seen: false }));
    expect(posteriorChance(addClues(state, balance, p.id, viel), balance, p.id)).toBeLessThanOrEqual(t.qMax);
    expect(posteriorChance(addClues(state, balance, p.id, nichts), balance, p.id)).toBeGreaterThanOrEqual(t.qMin);
    expect(posteriorChance(addClues(state, balance, p.id, viel), balance, p.id)).toBeGreaterThan(0);
  });
});

describe('Hinweise sind fest (Plan 1.2)', () => {
  it('zweimal reiten ergibt dieselben Hinweise, und der Weltzufall bleibt unverändert', () => {
    const state = newGame('fest', balance);
    const p = ranchMitNachbarn(state);
    const einmal = ride(state, balance, p.id);
    const zweimal = ride(einmal, balance, p.id);
    expect(zweimal.knowledge).toEqual(einmal.knowledge);
    expect(einmal.rng).toBe(state.rng);
    expect(einmal.events.rng).toBe(state.events.rng);
    // Ein neues Spiel mit demselben Seed sieht in einer späteren Runde dasselbe.
    const spaeter = { ...newGame('fest', balance), round: 5 };
    expect(rideClues(spaeter, balance, p).map((c) => c.seen)).toEqual(rideClues(state, balance, p).map((c) => c.seen));
  });

  it('Neuladen ändert nichts: nach Sichern und Laden kommt derselbe Hinweis', () => {
    const state = newGame('neuladen', balance);
    const p = ranchMitNachbarn(state);
    const geladen = deserializeGame(serializeGame(state, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(ride(geladen.state, balance, p.id).knowledge).toEqual(ride(state, balance, p.id).knowledge);
  });

  it('ein Ritt deckt die Ranch und zwei Nachbarn ab: Stufe 1, drei Hinweise je Ranch', () => {
    const state = newGame('ritt', balance);
    const p = ranchMitNachbarn(state);
    const ziele = rideParcels(state, p.id);
    expect(ziele).toHaveLength(3);
    expect(ziele[0].id).toBe(p.id);
    const nach = ride(state, balance, p.id);
    for (const z of ziele) {
      expect(knowledgeOf(nach, z.id).level).toBeGreaterThanOrEqual(1);
      expect(knowledgeOf(nach, z.id).clues.map((c) => c.kind).sort()).toEqual(['formation', 'salzwasser', 'sickerstelle']);
      expect(nach.forecasts[z.id]).toBeDefined();
    }
  });

  it('Hinweise sehen öfter Öl, wo Öl ist – und die Prognose ist ehrlich (Mitte ≈ echte Fundquote)', () => {
    let oel = 0;
    let oelGesehen = 0;
    let trocken = 0;
    let trockenGesehen = 0;
    for (let i = 0; i < 200; i++) {
      const s = newGame(`ehrlich-${i}`, balance);
      for (const p of s.parcels.filter((x) => !x.discovery)) {
        const c = rollClue(s, balance, p, 'sickerstelle', 'ritt');
        if (p.geology === 'dry') {
          trocken++;
          if (c.seen) trockenGesehen++;
        } else {
          oel++;
          if (c.seen) oelGesehen++;
        }
      }
    }
    const o = clueOdds(balance, { kind: 'sickerstelle' });
    expect(Math.abs(oelGesehen / oel - o.oil)).toBeLessThan(0.03);
    expect(Math.abs(trockenGesehen / trocken - o.dry)).toBeLessThan(0.03);
  });
});

describe('Wissensstufe und Bandbreite (Plan 1.2)', () => {
  it('Stufe 0 ohne Zahl, beritten 40, kartiert 25 (Genauigkeit 5: 15), Bohrbericht 10 Punkte', () => {
    const w = balance.exploration.width;
    expect(knowledgeWidth(balance, { level: 1, clues: [] })).toBe(w.rode);
    const karte = (accuracy: number): Clue => ({ kind: 'kartierung', source: 'geologe', round: 1, seen: true, accuracy });
    expect(knowledgeWidth(balance, { level: 2, clues: [karte(3)] })).toBe(25);
    expect(knowledgeWidth(balance, { level: 2, clues: [karte(5)] })).toBe(15);
    expect(knowledgeWidth(balance, { level: 2, clues: [karte(5)] })).toBeLessThan(knowledgeWidth(balance, { level: 2, clues: [karte(3)] }));
    expect(knowledgeWidth(balance, { level: 3, clues: [] })).toBe(w.report);
    const state = newGame('stufe', balance);
    const p = ranchMitNachbarn(state);
    expect(knowledgeForecast(state, balance, p.id)).toBeNull();
    const f = knowledgeForecast(ride(state, balance, p.id), balance, p.id)!;
    expect(f.high - f.low).toBeLessThanOrEqual(w.rode + balance.forecast.rounding);
  });

  it('der gierige Farmer erzählt in etwa 30 % der Fälle von Öl, das es nicht gab', () => {
    let ehrlichNein = 0;
    let gelogen = 0;
    for (let i = 0; i < 300; i++) {
      const s = newGame(`farmer-${i}`, balance);
      for (const p of s.parcels.filter((x) => !x.discovery)) {
        const ehrlich = rollClue(s, balance, p, 'brunnen', 'farmer');
        const gierig = rollClue(s, balance, p, 'brunnen', 'farmer', { lie: balance.exploration.greedyLie });
        if (!ehrlich.seen) {
          ehrlichNein++;
          if (gierig.seen) gelogen++;
        } else expect(gierig.seen).toBe(true);
      }
    }
    expect(Math.abs(gelogen / ehrlichNein - balance.exploration.greedyLie)).toBeLessThan(0.03);
  });

  it('nach einer eigenen Bohrung kennt Jacob die Ranch: Bohrbericht (Stufe 3), der auf die Nachbarn wirkt', () => {
    const state = newGame('eigene', balance);
    const p = ranchMitNachbarn(state);
    const fund: GameState = {
      ...state,
      wells: [{ id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1, result: 'small' }],
    };
    const gelernt = learnFromWells(fund, balance);
    expect(knowledgeOf(gelernt, p.id).level).toBe(3);
    expect(knowledgeOf(gelernt, p.id).clues).toEqual([{ kind: 'bohrbericht', source: 'bohrung', round: 1, seen: true }]);
    const n = rideParcels(state, p.id)[1];
    expect(posteriorChance(gelernt, balance, n.id)).toBeGreaterThan(posteriorChance(state, balance, n.id));
    // Zweimal lernen ändert nichts mehr.
    expect(learnFromWells(gelernt, balance)).toBe(gelernt);
  });

  it('im echten Spiel: wer bohrt, lernt am Rundenende dazu', () => {
    let state = newGame('runde', balance);
    const option = state.options[0].parcelId;
    state = { ...state, wells: [{ id: `${option}#1`, parcelId: option, stage: 1, status: 'dry', roundsLeft: 0, spent: 0, oilStage: null, startRound: 1 }] };
    const nach = endRound(state, balance);
    expect(knowledgeOf(nach, option).clues.some((c) => c.source === 'bohrung' && !c.seen)).toBe(true);
  });

  it('nach einer trockenen Stufe rechnet der Geologe mit der Chance nach den Hinweisen, nicht mit dem verdeckten q', () => {
    const state = newGame('tiefer', balance);
    const p = ranchMitNachbarn(state);
    const nach = ride(state, balance, p.id);
    const chance = posteriorChance(nach, balance, p.id);
    const st = balance.drilling.stages;
    expect(deeperChance(balance, p, 1, chance)).toBeCloseTo((chance * st[1].oilShare) / (1 - chance * st[0].oilShare), 10);
    expect(deeperChance(balance, p, 1)).toBeCloseTo((p.chance! * st[1].oilShare) / (1 - p.chance! * st[0].oilShare), 10);
  });
});

describe('Prognose bleibt im Rahmen der Geologie (0.4.19+2)', () => {
  it('kein Band reicht über qMax hinaus – auch nicht bei lauter guten Hinweisen', () => {
    const oben = Math.ceil((t.qMax * 100) / balance.forecast.rounding) * balance.forecast.rounding;
    const unten = Math.floor((t.qMin * 100) / balance.forecast.rounding) * balance.forecast.rounding;
    for (const seed of ['band-a', 'band-b', 'band-c']) {
      let s = newGame(seed, balance);
      for (const p of s.parcels.filter((q) => !q.discovery)) {
        const gut: Clue[] = (['sickerstelle', 'formation'] as const).map((kind) => ({ kind, source: 'ritt', round: 1, seen: true }) as Clue);
        const schlecht: Clue[] = (['sickerstelle', 'formation'] as const).map((kind) => ({ kind, source: 'ritt', round: 1, seen: false }) as Clue);
        s = addClues(s, balance, p.id, p.id.endsWith('1') ? schlecht : gut);
      }
      // Die Startquelle (0.4.20+19) zeigt bewusst „Öl sicher“ (100 %).
      for (const p of s.parcels.filter((q) => !q.discovery && !q.sure)) {
        const f = knowledgeForecast(s, balance, p.id)!;
        expect(f.high).toBeLessThanOrEqual(oben);
        expect(f.low).toBeGreaterThanOrEqual(unten);
        expect(f.low).toBeLessThan(f.high);
      }
    }
  });
});
