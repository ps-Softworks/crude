// 4.3 Gesetzeskatalog (GDD §10): Gesetze als YAML (content/laws/) mit Bedingungen
// aus dem Weltzustand, Gesetzgebung als Prozess (Antrag, Debatte, Abstimmung),
// Zeitungsmeldungen, Lobby vorbereitet. Fertig-Kriterium: Ein Gesetz entsteht aus
// dem Weltzustand, nicht zu einem festen Datum – über Seeds zu unterschiedlichen
// Zeitpunkten oder gar nicht.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBalance, type LawsBalance } from './balance';
import { endRound, newGame } from './game';
import {
  advanceLaws,
  conditionMet,
  expectedYes,
  isLawsState,
  lawInForce,
  lawReport,
  lawRules,
  lawWorldEffects,
  newLaws,
  parseLawFile,
  parseLawFiles,
  type LawDef,
  type LawRoundInput,
  type LawsState,
  type LawView,
} from './laws';
import { makeNewspaper, parseNewspaperContent } from './newspaper';
import { parsePoliticsContent } from './politics';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance, readLawFiles } from './testBalance';
import { advanceWorld, isWorldState, lawsInput, newWorld, skipWorld, type WorldState } from './world';
import { CAMPAIGN_ROUNDS, percentile, ROUNDS_PER_YEAR, runWorlds } from './worldRun';

const balance = loadBalance();
const wb = balance.worldModel;
const lb = wb.laws;
const laws = balance.laws;
const kartell = laws.find((l) => l.id === 'antitrust')!;
const steuer = laws.find((l) => l.id === 'income_tax')!;
const politik = parsePoliticsContent('content/politics.yaml', readFileSync(new URL('../../content/politics.yaml', import.meta.url), 'utf8')).content!;
const zeitung = parseNewspaperContent('content/newspaper.yaml', readFileSync(new URL('../../content/newspaper.yaml', import.meta.url), 'utf8')).content!;

/** Ruhige Lage: niemand ist wütend, kein Krieg, Handelspartei regiert. */
const ruhig: LawView = { round: 1, scarcity: 1, credit: 50, mood: 55, tension: 20, nationalism: 15, tech: 10, government: 'handel', war: false, crash: false };
const keineRunde: LawRoundInput = { crashing: false, glut: false, election: null, lobby: [] };
/** Ablauf ohne Zufall: Antrag kommt sicher, Debatte genau 2 Runden, Abstimmung ohne Abweichler, Trust-Anteil ohne Rauschen. */
const sicher: LawsBalance = { ...lb, proposeChance: 1, debateRounds: { min: 2, max: 2 }, voteNoise: 0, trust: { ...lb.trust, noise: 0 } };

function start(trustShare = 0.38): LawsState {
  return { ...newLaws('test', lb, { handel: 0.38, volksbund: 0.31, provinz: 0.31 }), trustShare };
}

/** n Runden Parlament mit fester Lage; gibt alle Zustände zurück. */
function tagen(laws0: LawsState, view: LawView, catalog: readonly LawDef[], n: number, b: LawsBalance = sicher, runde: LawRoundInput = keineRunde): LawsState[] {
  const out: LawsState[] = [];
  let s = laws0;
  for (let i = 0; i < n; i++) {
    s = advanceLaws(s, { ...view, round: view.round + i }, catalog, b, i === 0 ? runde : { ...runde, lobby: [] });
    out.push(s);
  }
  return out;
}

describe('Fertig-Kriterium 4.3: Gesetze entstehen aus dem Weltzustand, nicht zu einem festen Datum', () => {
  const runs = runWorlds('gesetz', 300, wb, CAMPAIGN_ROUNDS, laws);

  for (const id of ['antitrust', 'income_tax']) {
    it(`${id}: über 300 Welten zu sehr unterschiedlichen Zeitpunkten beschlossen – und in manchen nie`, () => {
      const runden = runs.map((r) => r.lawPassed[id]);
      const beschlossen = runden.filter((x): x is number => x !== null);
      const nie = runden.length - beschlossen.length;
      // Manchmal gar nicht …
      expect(nie).toBeGreaterThanOrEqual(runs.length * 0.05);
      // … meistens irgendwann (GDD §10: Gesetze sind Spielfelder, keine Seltenheit).
      expect(beschlossen.length).toBeGreaterThanOrEqual(runs.length * 0.5);
      // Kein festes Datum: viele verschiedene Runden, weit gestreut, keine Runde gehäuft.
      expect(new Set(beschlossen).size).toBeGreaterThanOrEqual(beschlossen.length * 0.4);
      expect(percentile(beschlossen, 0.9) - percentile(beschlossen, 0.1)).toBeGreaterThanOrEqual(20 * ROUNDS_PER_YEAR);
      const haeufigste = Math.max(...[...new Set(beschlossen)].map((r) => beschlossen.filter((x) => x === r).length));
      expect(haeufigste).toBeLessThanOrEqual(beschlossen.length * 0.05);
    });
  }

  it('Einkommensteuer kommt, wenn der Staat Geld braucht: Beschlüsse fallen fast immer in Krieg oder Crash', () => {
    let imNotfall = 0;
    let alle = 0;
    for (const r of runs.slice(0, 120)) {
      const runde = r.lawPassed.income_tax;
      if (runde === null) continue;
      let w = newWorld(r.seed, wb);
      for (let i = 0; i < runde; i++) w = advanceWorld(w, wb, {}, laws);
      alle += 1;
      // Krieg oder Crash in der Abstimmungsrunde oder in den 4 Runden davor (Debatte).
      let ww = newWorld(r.seed, wb);
      let notfall = false;
      for (let i = 1; i <= runde; i++) {
        ww = advanceWorld(ww, wb, {}, laws);
        if (i >= runde - 4 && (ww.war > 0 || ww.crash > 0)) notfall = true;
      }
      if (notfall) imNotfall += 1;
      expect(lawInForce(w.laws, 'income_tax')).toBe(true);
    }
    expect(alle).toBeGreaterThan(30);
    expect(imNotfall / alle).toBeGreaterThan(0.85);
  });

  it('ohne erfüllte Gründe kommt kein Gesetz: Kartellgesetz, das nur bei 99 % Marktanteil drückt, kommt in keiner Welt', () => {
    const nie: LawDef = { ...kartell, pressure: [{ when: { trustShare: { min: 0.99 } }, add: 5 }] };
    const r = runWorlds('gesetz', 60, wb, CAMPAIGN_ROUNDS, [nie]);
    expect(r.every((x) => x.lawPassed.antitrust === null && x.lawProposals.antitrust === 0)).toBe(true);
  });

  it('dieselbe Welt (Seed) bringt das Gesetz immer in derselben Runde – deterministisch', () => {
    const a = runWorlds('gesetz', 20, wb, 120, laws).map((r) => r.lawPassed);
    const b = runWorlds('gesetz', 20, wb, 120, laws).map((r) => r.lawPassed);
    expect(a).toEqual(b);
  });

  it('die Gesetze würfeln mit eigenem Zufall: Ohne beschlossenes Gesetz läuft die Welt genau wie ohne Katalog', () => {
    // 16 Runden (Kapitel 1): In diesen Seeds wird nichts beschlossen, die Weltgrößen sind dann identisch.
    for (const seed of ['ruhe-1', 'ruhe-2', 'ruhe-3']) {
      let mit = newWorld(seed, wb);
      let ohne = newWorld(seed, wb);
      for (let i = 0; i < 16; i++) {
        mit = advanceWorld(mit, wb, {}, laws);
        ohne = advanceWorld(ohne, wb);
      }
      if (laws.some((l) => lawInForce(mit.laws, l.id))) continue;
      const { laws: _a, ...weltMit } = mit;
      const { laws: _b, ...weltOhne } = ohne;
      expect(weltMit).toEqual(weltOhne);
    }
  });
});

describe('Bedingungen aus dem Weltzustand', () => {
  const lage = { trustShare: 0.45, seats: { handel: 0.3, volksbund: 0.4, provinz: 0.3 } };

  it('Bereiche für Weltgrößen, Trust-Anteil und Sitze; Regierung, Krieg, Crash', () => {
    expect(conditionMet({ trustShare: { min: 0.4 } }, ruhig, lage)).toBe(true);
    expect(conditionMet({ trustShare: { min: 0.5 } }, ruhig, lage)).toBe(false);
    expect(conditionMet({ mood: { max: 45 } }, ruhig, lage)).toBe(false);
    expect(conditionMet({ mood: { max: 45 } }, { ...ruhig, mood: 40 }, lage)).toBe(true);
    expect(conditionMet({ scarcity: { min: 1.2 } }, { ...ruhig, scarcity: 1.3 }, lage)).toBe(true);
    expect(conditionMet({ credit: { min: 40, max: 60 } }, ruhig, lage)).toBe(true);
    expect(conditionMet({ tension: { min: 60 } }, ruhig, lage)).toBe(false);
    expect(conditionMet({ volksbund: { min: 0.38 } }, ruhig, lage)).toBe(true);
    expect(conditionMet({ handel: { min: 0.38 } }, ruhig, lage)).toBe(false);
    expect(conditionMet({ government: ['volksbund'] }, ruhig, lage)).toBe(false);
    expect(conditionMet({ government: ['volksbund', 'handel'] }, ruhig, lage)).toBe(true);
    expect(conditionMet({ war: true }, ruhig, lage)).toBe(false);
    expect(conditionMet({ war: true }, { ...ruhig, war: true }, lage)).toBe(true);
    expect(conditionMet({ crash: false }, ruhig, lage)).toBe(true);
    // Alle Punkte einer Bedingung müssen stimmen.
    expect(conditionMet({ trustShare: { min: 0.4 }, war: true }, ruhig, lage)).toBe(false);
  });

  it('Druck sammelt sich, solange Gründe stimmen (Gleichgewicht = Punkte ÷ (1 − decay)), und verfliegt danach', () => {
    const def: LawDef = { ...kartell, threshold: 999, pressure: [{ when: { war: true }, add: 1.5 }] };
    const krieg = tagen(start(), { ...ruhig, war: true }, [def], 80);
    expect(krieg.at(-1)!.bills.antitrust.pressure).toBeCloseTo(1.5 / (1 - lb.decay), 3);
    const frieden = tagen(krieg.at(-1)!, ruhig, [def], 30);
    expect(frieden.at(-1)!.bills.antitrust.pressure).toBeLessThan(0.1);
  });

  it('negative Gründe bremsen, der Druck fällt nie unter 0', () => {
    const def: LawDef = { ...kartell, pressure: [{ when: { government: ['handel'] }, add: -2 }] };
    expect(tagen(start(), ruhig, [def], 5).at(-1)!.bills.antitrust.pressure).toBe(0);
  });

  it('Kartellgesetz: Trust über 40 %, schlechte Stimmung und Volksbund an der Regierung bringen es über die Schwelle – ruhige Zeiten nicht', () => {
    const gleichgewicht = (view: LawView, trust: number) => {
      const s = tagen(start(trust), view, [{ ...kartell, threshold: 999 }], 60, { ...sicher, trust: { ...sicher.trust, revert: 0 } });
      return s.at(-1)!.bills.antitrust.pressure;
    };
    expect(gleichgewicht(ruhig, 0.35)).toBeLessThan(kartell.threshold);
    expect(gleichgewicht({ ...ruhig, government: 'volksbund', mood: 40 }, 0.45)).toBeGreaterThan(kartell.threshold);
    expect(gleichgewicht({ ...ruhig, government: 'provinz' }, 0.52)).toBeGreaterThan(kartell.threshold);
  });

  it('Einkommensteuer: Krieg oder Crash bringen sie über die Schwelle – Frieden nicht', () => {
    const gleichgewicht = (view: LawView) => tagen(start(), view, [{ ...steuer, threshold: 999 }], 60).at(-1)!.bills.income_tax.pressure;
    expect(gleichgewicht({ ...ruhig, government: 'provinz' })).toBeLessThan(steuer.threshold);
    expect(gleichgewicht({ ...ruhig, government: 'provinz', war: true })).toBeGreaterThan(steuer.threshold);
    expect(gleichgewicht({ ...ruhig, government: 'volksbund', crash: true })).toBeGreaterThan(steuer.threshold);
  });
});

describe('Gesetzgebung als Prozess: Antrag, Debatte, Abstimmung', () => {
  /** Ein Gesetz, das sofort über der Schwelle ist; Zustimmung = Sitze × votes. */
  const test: LawDef = { ...kartell, id: 'antitrust', threshold: 1, pressure: [{ when: { war: false }, add: 5 }], swing: [] };

  it('Antrag erst über der Schwelle (und mit proposeChance), dann Debatte, Abstimmung nach debateRounds', () => {
    const unter = tagen(start(), ruhig, [{ ...test, threshold: 1000 }], 5);
    expect(unter.every((s) => s.bills.antitrust.stage === 'idle' && s.news.length === 0)).toBe(true);
    const [r1, r2, r3] = tagen(start(), ruhig, [test], 3, sicher);
    expect(r1.news).toEqual([{ law: 'antitrust', kind: 'proposed' }]);
    expect(r1.bills.antitrust).toMatchObject({ stage: 'debate', voteIn: 2, proposals: 1 });
    expect(r2.news).toHaveLength(1);
    expect(r2.news[0]).toMatchObject({ law: 'antitrust', kind: 'debate' });
    expect(r3.news[0].kind).toMatch(/passed|failed/);
  });

  it('ohne Glück kein Antrag: proposeChance 0 hält das Gesetz draußen', () => {
    expect(tagen(start(), ruhig, [test], 20, { ...sicher, proposeChance: 0 }).every((s) => s.bills.antitrust.stage === 'idle')).toBe(true);
  });

  it('Mehrheit der Sitze × Haltung: angenommen über 50 %, das Gesetz gilt ab der Abstimmungsrunde', () => {
    const volksbundStark = { ...start(), seats: { handel: 0.25, volksbund: 0.45, provinz: 0.3 } };
    const erwartet = 0.25 * test.votes.handel + 0.45 * test.votes.volksbund + 0.3 * test.votes.provinz;
    expect(erwartet).toBeGreaterThan(0.5);
    const s = tagen(volksbundStark, ruhig, [test], 3).at(-1)!;
    expect(s.news[0]).toMatchObject({ kind: 'passed' });
    expect(s.news[0].yes).toBeCloseTo(erwartet, 6);
    expect(s.bills.antitrust).toMatchObject({ stage: 'passed', passedRound: ruhig.round + 2 });
    expect(lawInForce(s, 'antitrust')).toBe(true);
    // Beschlossen bleibt beschlossen: keine weiteren Meldungen.
    expect(tagen(s, ruhig, [test], 10).every((x) => x.news.length === 0 && x.bills.antitrust.stage === 'passed')).toBe(true);
  });

  it('abgelehnt: Ruhe für cooldown Runden, Druck × failPressure; danach kann es neu eingebracht werden', () => {
    const handelStark = { ...start(), seats: { handel: 0.55, volksbund: 0.25, provinz: 0.2 } };
    const verlauf = tagen(handelStark, ruhig, [test], 3 + lb.cooldown + 1);
    const abgelehnt = verlauf[2];
    expect(abgelehnt.news[0]).toMatchObject({ kind: 'failed' });
    expect(abgelehnt.news[0].yes!).toBeLessThan(0.5);
    expect(abgelehnt.bills.antitrust.stage).toBe('idle');
    expect(abgelehnt.bills.antitrust.cooldown).toBe(lb.cooldown);
    const vorher = verlauf[1].bills.antitrust.pressure * lb.decay + 5;
    expect(abgelehnt.bills.antitrust.pressure).toBeCloseTo(vorher * lb.failPressure, 6);
    expect(verlauf.slice(3, 3 + lb.cooldown).every((s) => s.bills.antitrust.stage === 'idle')).toBe(true);
    expect(verlauf.at(-1)!.news).toEqual([{ law: 'antitrust', kind: 'proposed' }]);
    expect(verlauf.at(-1)!.bills.antitrust.proposals).toBe(2);
  });

  it('die Lage am Abstimmungstag zählt (swing): Krieg bringt der Einkommensteuer Stimmen', () => {
    const lage = { trustShare: 0.38, seats: { handel: 0.38, volksbund: 0.31, provinz: 0.31 } };
    const frieden = expectedYes(steuer, ruhig, lage);
    const krieg = expectedYes(steuer, { ...ruhig, war: true }, lage);
    expect(krieg - frieden).toBeCloseTo(0.1, 6);
    expect(frieden).toBeLessThan(0.5);
    expect(krieg).toBeGreaterThan(0.5);
  });

  it('Debatte: Die Zeitung sagt vorher, wie es aussieht (sicher, knapp, keine Mehrheit)', () => {
    const ausblick = (seats: LawsState['seats']) => tagen({ ...start(), seats }, ruhig, [test], 2)[1].news[0].outlook;
    expect(ausblick({ handel: 0.2, volksbund: 0.5, provinz: 0.3 })).toBe('likely');
    expect(ausblick({ handel: 0.6, volksbund: 0.2, provinz: 0.2 })).toBe('unlikely');
    // 0.38/0.31/0.31 → 0.038 + 0.2635 + 0.155 = 0.4565: näher als closeVote an 50 %.
    expect(ausblick({ handel: 0.38, volksbund: 0.31, provinz: 0.31 })).toBe('close');
  });

  it('höchstens maxOpen Anträge gleichzeitig im Parlament', () => {
    const zweites: LawDef = { ...test, id: 'zweites' };
    const [r1] = tagen(start(), ruhig, [test, zweites], 1);
    expect(r1.news.filter((n) => n.kind === 'proposed')).toHaveLength(lb.maxOpen);
    expect(r1.bills.zweites.stage).toBe('idle');
  });

  it('nach einer Wahl sitzen die neuen Abgeordneten im Parlament', () => {
    const neu = { handel: 0.2, volksbund: 0.5, provinz: 0.3 };
    const [s] = tagen(start(), ruhig, [], 1, sicher, { ...keineRunde, election: neu });
    expect(s.seats).toEqual(neu);
    // Im Weltmodell: Wahltag → Sitze = Wahlergebnis.
    const w = advanceWorld({ ...newWorld('sitze', wb), electionIn: 1 }, wb, {}, laws);
    expect(w.laws.seats).toEqual(w.lastElection!.shares);
  });

  it('Zufall je Gesetz: Jede Runde zieht gleich viele Zahlen, ein Antrag verschiebt keinen fremden Würfel', () => {
    const a = tagen(start(), ruhig, [test], 1, { ...lb, proposeChance: 1 })[0].rng;
    const b = tagen(start(), ruhig, [{ ...test, threshold: 1000 }], 1, { ...lb, proposeChance: 1 })[0].rng;
    expect(a).toBe(b);
  });
});

describe('Wirkung beschlossener Gesetze', () => {
  function beschlossen(base: WorldState, ids: string[]): WorldState {
    const bills = { ...base.laws.bills };
    for (const id of ids) bills[id] = { stage: 'passed', pressure: 0, voteIn: 0, cooldown: 0, proposals: 1, passedRound: 1, lastVote: 0.6, weakened: false, lobbyVote: 0 };
    return { ...base, laws: { ...base.laws, bills } };
  }

  it('Einkommensteuer drückt das Kreditklima jede Runde (creditShift), das Kartellgesetz hebt die Stimmung', () => {
    const w = newWorld('wirkung', wb);
    expect(lawsInput(beschlossen(w, ['income_tax']).laws, laws)).toEqual({ creditShift: steuer.effects.world.creditShift, moodShift: steuer.effects.world.moodShift });
    const mit = skipWorld(beschlossen(w, ['income_tax']), wb, 20, {}, laws);
    const ohne = skipWorld(w, wb, 20, {}, [{ ...steuer, threshold: 1e9 }]);
    expect(mit.credit).toBeLessThan(ohne.credit);
    const kMit = skipWorld(beschlossen(w, ['antitrust']), wb, 20, {}, laws);
    const kOhne = skipWorld(w, wb, 20, {}, [{ ...kartell, threshold: 1e9 }]);
    expect(kMit.mood).toBeGreaterThan(kOhne.mood);
  });

  it('Kartellgesetz drückt den Marktanteil des Trusts (trustShift)', () => {
    const w = newWorld('trust', wb);
    expect(lawWorldEffects(beschlossen(w, ['antitrust']).laws, laws).trustShift).toBe(kartell.effects.world.trustShift);
    const mit = skipWorld(beschlossen(w, ['antitrust']), wb, 40, {}, laws);
    const ohne = skipWorld(w, wb, 40, {}, [{ ...kartell, threshold: 1e9 }]);
    expect(mit.laws.trustShare).toBeLessThan(ohne.laws.trustShare - 0.05);
  });

  it('Regeln für spätere Kapitel: Steuersatz, Kartellverbot, Zerschlagung; ohne Gesetz keine', () => {
    const w = newWorld('regeln', wb);
    expect(lawRules(w.laws, laws)).toEqual({});
    expect(lawRules(beschlossen(w, ['income_tax', 'antitrust']).laws, laws)).toEqual({ incomeTax: 0.07, cartelBan: 1, breakupFrom: 0.5 });
  });

  it('Marktanteil des Trusts: Crash-Runden und Ölschwemmen treiben ihn hoch (Pleitefirmen werden aufgekauft)', () => {
    const [ruhe] = tagen(start(0.38), ruhig, [], 1);
    const [crash] = tagen(start(0.38), ruhig, [], 1, sicher, { ...keineRunde, crashing: true });
    const [schwemme] = tagen(start(0.38), ruhig, [], 1, sicher, { ...keineRunde, glut: true });
    expect(crash.trustShare - ruhe.trustShare).toBeCloseTo(lb.trust.crash, 9);
    expect(schwemme.trustShare - ruhe.trustShare).toBeCloseTo(lb.trust.glut, 9);
  });
});

describe('Lobby (vorbereitet für Kapitel 2)', () => {
  const test: LawDef = { ...kartell, threshold: 1000, swing: [] };

  it('fordern bringt Druck, verhindern kostet Zustimmung, verzögern verlängert die Debatte, verwässern ändert die Regeln', () => {
    // Unter der Provinzliga ohne andere Gründe: Der Druck kommt allein aus der Lobby.
    const provinz: LawView = { ...ruhig, government: 'provinz' };
    const [gefordert] = tagen(start(), provinz, [test], 1, sicher, { ...keineRunde, lobby: [{ law: 'antitrust', action: 'demand' }] });
    const [ohne] = tagen(start(), provinz, [test], 1);
    expect(gefordert.bills.antitrust.pressure - ohne.bills.antitrust.pressure).toBeCloseTo(lb.lobby.demand * lb.decay, 9);

    const imParlament: LawsState = { ...start(), bills: { antitrust: { stage: 'debate', pressure: 0, voteIn: 2, cooldown: 0, proposals: 1, passedRound: null, lastVote: null, weakened: false, lobbyVote: 0 } } };
    const blockiert = tagen(imParlament, ruhig, [test], 2, sicher, { ...keineRunde, lobby: [{ law: 'antitrust', action: 'block' }] }).at(-1)!;
    const frei = tagen(imParlament, ruhig, [test], 2).at(-1)!;
    expect(frei.bills.antitrust.lastVote! - blockiert.bills.antitrust.lastVote!).toBeCloseTo(lb.lobby.block, 9);

    const verzoegert = tagen(imParlament, ruhig, [test], 1, sicher, { ...keineRunde, lobby: [{ law: 'antitrust', action: 'delay' }] })[0];
    expect(verzoegert.bills.antitrust.voteIn).toBe(1 + lb.lobby.delay);

    const verwaessert = tagen(imParlament, ruhig, [test], 1, sicher, { ...keineRunde, lobby: [{ law: 'antitrust', action: 'weaken' }] })[0];
    expect(verwaessert.bills.antitrust.weakened).toBe(true);
    const gilt = { ...verwaessert, bills: { antitrust: { ...verwaessert.bills.antitrust, stage: 'passed' as const } } };
    expect(lawRules(gilt, [test])).toEqual({ cartelBan: 1, breakupFrom: 0.7 });
  });

  it('Züge, die ein Gesetz nicht anbietet, und unbekannte Gesetze bewirken nichts', () => {
    const ohneLobby: LawDef = { ...test, lobby: {} };
    const [a] = tagen(start(), ruhig, [ohneLobby], 1, sicher, { ...keineRunde, lobby: [{ law: 'antitrust', action: 'demand' }, { law: 'gibtsnicht', action: 'demand' }] });
    const [b] = tagen(start(), ruhig, [ohneLobby], 1);
    expect(a).toEqual(b);
  });

  it('im Weltmodell: Lobby kommt über WorldInput, im Zeitsprung nur in der ersten Runde', () => {
    const w = newWorld('lobby', wb);
    const mit = advanceWorld(w, wb, { lobby: [{ law: 'antitrust', action: 'demand' }] }, [test]);
    const ohne = advanceWorld(w, wb, {}, [test]);
    expect(mit.laws.bills.antitrust.pressure - ohne.laws.bills.antitrust.pressure).toBeCloseTo(lb.lobby.demand * lb.decay, 9);
    const sprung = skipWorld(w, wb, 3, { lobby: [{ law: 'antitrust', action: 'demand' }] }, [test]);
    const sprungOhne = skipWorld(w, wb, 3, {}, [test]);
    expect(sprung.laws.bills.antitrust.pressure - sprungOhne.laws.bills.antitrust.pressure).toBeCloseTo(lb.lobby.demand * lb.decay ** 3, 9);
  });
});

describe('Zeitung: Meldungen aus dem Parlament', () => {
  it('beschlossen vor abgelehnt vor Antrag vor Debatte; Abstimmung mit Ja/Nein in Prozent', () => {
    const news: LawsState['news'] = [
      { law: 'income_tax', kind: 'proposed' },
      { law: 'antitrust', kind: 'passed', yes: 0.537 },
    ];
    const r = lawReport({ news }, laws, politik)!;
    expect(r.law).toBe('antitrust');
    expect(r.title).toBe(kartell.news.passed.title.de);
    expect(r.vote).toMatchObject({ yes: 54, no: 46 });
    const antrag = lawReport({ news: [news[0]] }, laws, politik)!;
    expect(antrag.title).toBe(steuer.news.proposed.title.de);
    expect(antrag.vote).toBeNull();
    expect(lawReport({ news: [] }, laws, politik)).toBeNull();
  });

  it('Debatte: Text des Gesetzes und die Aussicht aus content/politics.yaml', () => {
    const r = lawReport({ news: [{ law: 'antitrust', kind: 'debate', outlook: 'close' }] }, laws, politik)!;
    expect(r.text).toBe(`${kartell.news.debate.text.de} ${politik.laws.outlook.close.de}`);
    expect(lawReport({ news: [{ law: 'antitrust', kind: 'debate', outlook: 'close' }] }, laws, politik, 'en')!.text).toContain(kartell.news.debate.text.en);
  });

  it('die Zeitung im Spiel druckt die Meldung der letzten Runde', () => {
    const g = newGame('zeitung-gesetz', balance);
    const mit = { ...g, worldModel: { ...g.worldModel, laws: { ...g.worldModel.laws, news: [{ law: 'income_tax', kind: 'failed' as const, yes: 0.44 }] } } };
    const z = makeNewspaper(mit, balance, zeitung, undefined, politik);
    expect(z.law).toMatchObject({ law: 'income_tax', kind: 'failed', vote: { yes: 44, no: 56 } });
    expect(makeNewspaper(g, balance, zeitung, undefined, politik).law).toBeNull();
  });
});

describe('Spiel, Spielstand und Inhalte', () => {
  it('endRound lässt das Parlament mit dem Katalog aus content/laws/ tagen', () => {
    const g = newGame('parlament', balance);
    const n = endRound(g, balance);
    expect(Object.keys(n.worldModel.laws.bills).sort()).toEqual(laws.map((l) => l.id).sort());
  });

  it('Spielstand: Gesetze überstehen Speichern und Laden', () => {
    const g = newGame('speichern-gesetz', balance);
    const w = skipWorld(g.worldModel, wb, 30, {}, laws);
    const r = deserializeGame(serializeGame({ ...g, worldModel: w }, 'test'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.worldModel.laws).toEqual(w.laws);
  });

  it('Spielstand Format 15 (ohne Gesetze) lädt mit Ersatzwerten: nichts beschlossen', () => {
    const g = newGame('alt15', balance);
    const { laws: _l, ...alteWelt } = g.worldModel;
    const r = deserializeGame(JSON.stringify({ format: 15, appVersion: '0.4.2', savedRound: 1, state: { ...g, worldModel: alteWelt } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.worldModel.laws.bills).toEqual({});
      expect(r.state.worldModel.laws.seats).toEqual(g.worldModel.parties);
      expect(isWorldState(r.state.worldModel)).toBe(true);
    }
  });

  it('isLawsState lehnt kaputte Zustände ab', () => {
    const s = newWorld('pruefen', wb).laws;
    expect(isLawsState(s)).toBe(true);
    expect(isLawsState({ ...s, trustShare: 'viel' })).toBe(false);
    expect(isLawsState({ ...s, bills: { antitrust: { stage: 'irgendwas' } } })).toBe(false);
    expect(isLawsState({ ...s, news: [{ law: 'antitrust', kind: 'gerücht' }] })).toBe(false);
  });

  it('content/laws/: Kartellgesetz und Einkommensteuer, fehlerfrei, mit allen Meldungen und englischem Text', () => {
    const { laws: alle, errors } = parseLawFiles(readLawFiles());
    expect(errors).toEqual([]);
    expect(alle.map((l) => l.id).sort()).toEqual(['antitrust', 'income_tax']);
    for (const l of alle) {
      for (const k of ['proposed', 'debate', 'passed', 'failed'] as const) {
        expect(l.news[k].title.en).not.toBe('');
        expect(l.news[k].text.en).not.toBe('');
      }
      expect(l.pressure.length).toBeGreaterThan(0);
    }
  });

  it('Prüfprogramm: Fehler mit Zeile – unbekannte Bedingung, falsche Zustimmung, fehlende Meldung, doppelte id', () => {
    const text = readFileSync(new URL('../../content/laws/kartellgesetz.yaml', import.meta.url), 'utf8');
    const zeileVon = (t: string, muster: string) => t.split('\n').findIndex((z) => z.includes(muster)) + 1;

    const falscheBedingung = text.replace('{ trustShare: { min: 0.5 } }', '{ marktmacht: { min: 0.5 } }');
    const r1 = parseLawFile('k.yaml', falscheBedingung);
    expect(r1.law).toBeNull();
    expect(r1.errors[0].message).toMatch(/marktmacht/);
    expect(r1.errors[0].line).toBe(zeileVon(falscheBedingung, 'marktmacht'));

    const r2 = parseLawFile('k.yaml', text.replace('votes: { handel: 0.1,', 'votes: { handel: 1.4,'));
    expect(r2.errors.map((e) => e.message).join(' ')).toMatch(/votes\.handel/);

    const r3 = parseLawFile('k.yaml', text.replace(/  failed:\n(    .*\n)+/, ''));
    expect(r3.errors.map((e) => e.message).join(' ')).toMatch(/news\.failed/);

    const r4 = parseLawFile('k.yaml', text.replace('government: volksbund', 'government: royalisten'));
    expect(r4.errors.map((e) => e.message).join(' ')).toMatch(/government/);

    const r5 = parseLawFile('k.yaml', text.replace('cartelBan: 1           #', 'kartellverbot: 1           #'));
    expect(r5.errors.map((e) => e.message).join(' ')).toMatch(/kartellverbot/);

    const r6 = parseLawFile('k.yaml', text.replace('demand: { label', 'bestechen: { label'));
    expect(r6.errors.map((e) => e.message).join(' ')).toMatch(/bestechen/);

    const doppelt = parseLawFiles([
      { file: 'a.yaml', text },
      { file: 'b.yaml', text },
    ]);
    expect(doppelt.laws).toHaveLength(1);
    expect(doppelt.errors[0].message).toMatch(/gibt es schon/);
  });

  it('balance.yaml: fehlende Ablaufzahl ist ein Fehler', () => {
    const raw = rawBalance() as { worldModel: { laws: Record<string, unknown> } };
    const ohne = structuredClone(raw);
    delete ohne.worldModel.laws.decay;
    expect(() => parseBalance(ohne)).toThrow(/worldModel\.laws\.decay/);
    const halbeRunde = structuredClone(raw);
    halbeRunde.worldModel.laws.debateRounds = { min: 1.5, max: 3 };
    expect(() => parseBalance(halbeRunde)).toThrow(/debateRounds/);
  });
});
