// 4.5 Zeitsprünge (GDD §2/§13): Direktiven, Weichen, vereinfachte Simulation der
// Jahre 5–10, Chronik, Kapitel 2 als Platzhalter, Spielstand über den Kapitelwechsel.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBalance, type Balance } from './balance';
import { canGoPublic, decideIpo } from './chapter';
import { debt, takeLoan } from './credit';
import { applyAction } from './desk';
import { conditionsMet } from './events';
import { endRound, formatDate, newGame, type GameState } from './game';
import { neighbourWells } from './market';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import {
  answerSwitch,
  CHRONICLE_KINDS,
  chapterRound,
  chapterRounds,
  gameYear,
  jacobAge,
  markChronicleRead,
  parseTimeskipContent,
  runTimeskip,
  startTimeskip,
  SWITCH_CHOICES,
  SWITCH_IDS,
  timeskipBlocked,
  TIMESKIP_MARKS,
  unreadChronicle,
  type Directives,
  type SwitchId,
  type TimeskipRecord,
} from './timeskip';
import { wildcatterWells } from './wildcatters';

const balance = loadBalance();
const catalog = loadEvents();
const APP = '0.4.5';
const STANDARD: Directives = { stance: 'balanced', family: 'some' };

/** Kapitel 1 ohne eigene Züge zu Ende spielen. */
function kapitelEnde(seed: string, b: Balance = balance, vorher: (s: GameState) => GameState = (s) => s): GameState {
  let s = vorher(newGame(seed, b, catalog));
  while (!s.finished) s = endRound(s, b, catalog);
  return s;
}

type Antworten = (id: SwitchId, i: number) => string;
const ERSTE: Antworten = (id) => SWITCH_CHOICES[id][0];
const ZWEITE: Antworten = (id) => SWITCH_CHOICES[id][1];

/** Den ganzen Sprung durchspielen; Weichen nach der Regel beantworten. */
function springen(s0: GameState, directives = STANDARD, antworten: Antworten = ERSTE, b: Balance = balance): { state: GameState; record: TimeskipRecord } {
  let s = s0;
  if (canGoPublic(s, b)) {
    const ipo = decideIpo(s, b, 0);
    if (!ipo.ok) throw new Error(ipo.reason);
    s = ipo.state;
  }
  const start = startTimeskip(s, b, directives);
  if (!start.ok) throw new Error(start.reason);
  s = start.state;
  for (let i = 0; i < 10; i++) {
    const step = runTimeskip(s, b, catalog);
    if (step.status === 'done') return { state: step.state, record: step.record };
    const a = answerSwitch(s, b, step.id, antworten(step.id, i), catalog);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('Zu viele Weichen.');
}

/** Ein Kapitel-1-Stand mit Pacht, Bohrung und Kredit in Runde 1 (andere Entscheidungen). */
function mitEntscheidungen(s: GameState): GameState {
  let state = { ...s, cash: s.cash + 20000 };
  const frei = state.parcels.filter((p) => !p.discovery && !state.options.some((o) => o.parcelId === p.id)).slice(0, 2);
  for (const p of frei) {
    const lease = applyAction(state, balance, p.id, 'lease');
    if (lease.ok) state = lease.state;
  }
  const drill = applyAction(state, balance, frei[0].id, 'drill');
  if (drill.ok) state = drill.state;
  return state;
}

describe('Inhalte: content/timeskip.yaml', () => {
  it('ist vollständig: alle Weichen mit beiden Antworten, alle Chronik-Einträge, Kapitel-2-Texte', () => {
    const { content, errors } = parseTimeskipContent('content/timeskip.yaml', readFileSync(new URL('../../content/timeskip.yaml', import.meta.url), 'utf8'));
    expect(errors).toEqual([]);
    expect(content).not.toBeNull();
    for (const id of SWITCH_IDS) for (const c of SWITCH_CHOICES[id]) expect(content!.switches[id].choices[c].de).not.toBe('');
    for (const k of CHRONICLE_KINDS) expect(content!.chronicle.entries[k].de).not.toBe('');
    expect(content!.chapter2.badge.de).toMatch(/im Bau/);
    expect(content!.chronicle.one.wells_found?.de).toMatch(/eine neue Quelle/);
  });

  it('meldet fehlende Texte und unbekannte Chronik-Einträge', () => {
    const { content, errors } = parseTimeskipContent('x.yaml', 'start: {}\nchronicle: { entries: { quatsch: { de: a } } }');
    expect(content).toBeNull();
    expect(errors.some((e) => e.message.includes('start.title'))).toBe(true);
    expect(errors.some((e) => e.message.includes('quatsch'))).toBe(true);
    expect(errors.some((e) => e.message.includes('switches'))).toBe(true);
  });
});

describe('Zahlen: balance.yaml → timeskip', () => {
  it('liest den Block und lehnt halbe Jahre ab', () => {
    expect(balance.timeskip.rounds).toBe(24);
    expect(balance.timeskip.switches.automobileYear).toBe(7);
    const raw = rawBalance();
    expect(() => parseBalance({ ...raw, timeskip: { ...(raw.timeskip as object), rounds: 22 } })).toThrow(/Vielfaches von 4/);
    expect(() => parseBalance({ ...raw, timeskip: undefined })).toThrow(/timeskip/);
  });
});

describe('Start des Sprungs', () => {
  it('geht erst am Kapitelende und erst nach der Entscheidung zur Aktiengesellschaft', () => {
    const mitten = newGame('sprung-start', balance, catalog);
    expect(timeskipBlocked(mitten, balance)).toMatch(/Ende des Kapitels/);
    expect(startTimeskip(mitten, balance, STANDARD).ok).toBe(false);
    const ende = { ...kapitelEnde('sprung-start'), cash: 200000 };
    expect(canGoPublic(ende, balance)).toBe(true);
    expect(timeskipBlocked(ende, balance)).toMatch(/Aktiengesellschaft/);
    const familie = decideIpo(ende, balance, 0);
    expect(familie.ok).toBe(true);
    const los = startTimeskip(familie.ok ? familie.state : ende, balance, STANDARD);
    expect(los.ok).toBe(true);
    expect(los.ok && los.state.jump).toEqual({ directives: STANDARD, answers: {} });
  });

  it('kennt nur echte Direktiven und Antworten; eine Weiche muss gerade anstehen', () => {
    const ende = kapitelEnde('sprung-falsch');
    expect(startTimeskip(ende, balance, { stance: 'wild' as never, family: 'some' }).ok).toBe(false);
    const s = startTimeskip(ende, balance, STANDARD);
    if (!s.ok) throw new Error(s.reason);
    const step = runTimeskip(s.state, balance, catalog);
    expect(step.status).toBe('switch');
    if (step.status !== 'switch') return;
    expect(answerSwitch(s.state, balance, step.id, 'vielleicht', catalog).ok).toBe(false);
    const andere = SWITCH_IDS.find((id) => id !== step.id)!;
    expect(answerSwitch(s.state, balance, andere, SWITCH_CHOICES[andere][0], catalog).ok).toBe(false);
    expect(answerSwitch(s.state, balance, step.id, SWITCH_CHOICES[step.id][0], catalog).ok).toBe(true);
  });
});

describe('Fertig-Kriterium: dieselbe Welt nur bei denselben Entscheidungen', () => {
  it('gleicher Seed und gleiche Entscheidungen → genau dieselbe Welt', () => {
    const a = springen(kapitelEnde('sprung-gleich', balance, mitEntscheidungen));
    const b = springen(kapitelEnde('sprung-gleich', balance, mitEntscheidungen));
    expect(b.state).toEqual(a.state);
    expect(serializeGame(b.state, APP)).toBe(serializeGame(a.state, APP));
  });

  it('gleicher Seed, andere Entscheidungen in Kapitel 1 → verschiedene Welten', () => {
    const ohne = springen(kapitelEnde('sprung-anders'));
    const mit = springen(kapitelEnde('sprung-anders', balance, mitEntscheidungen));
    expect(mit.state.worldModel).not.toEqual(ohne.state.worldModel);
    expect(mit.state.wells).not.toEqual(ohne.state.wells);
    expect(mit.record.after).not.toEqual(ohne.record.after);
  });

  it('gleicher Seed, andere Direktiven vor dem Sprung → verschiedene Welten', () => {
    const ende = kapitelEnde('sprung-direktive', balance, mitEntscheidungen);
    const mutig = springen(ende, { stance: 'aggressive', family: 'little' });
    const vorsichtig = springen(ende, { stance: 'cautious', family: 'much' });
    expect(mutig.state.worldModel).not.toEqual(vorsichtig.state.worldModel);
    expect(mutig.state.cash).not.toBe(vorsichtig.state.cash);
    expect(vorsichtig.state.family.ruth).toBeGreaterThan(mutig.state.family.ruth);
  });

  it('gleicher Seed, andere Antworten auf die Weichen → verschiedene Welten', () => {
    const ende = kapitelEnde('sprung-weiche', balance, mitEntscheidungen);
    const ja = springen(ende, STANDARD, ERSTE);
    const nein = springen(ende, STANDARD, ZWEITE);
    expect(ja.record.switches.length).toBeGreaterThan(0);
    expect(ja.state).not.toEqual(nein.state);
  });
});

describe('Kapitel 2 beginnt (Platzhalter)', () => {
  it('Jahr 11, Jacob 35, 16 Runden, frische Termine, Chronik ungelesen', () => {
    const { state, record } = springen(kapitelEnde('sprung-k2', balance, mitEntscheidungen));
    expect(state.chapter).toBe(2);
    expect(gameYear(state.round)).toBe(11);
    expect(jacobAge(state)).toBe(35);
    expect(formatDate(state)).toBe(`Frühjahr ${balance.start.year + 10}`);
    expect(chapterRound(state)).toBe(1);
    expect(chapterRounds(state)).toBe(balance.timeskip.nextChapterRounds);
    expect(state.finished).toBe(false);
    expect(state.ending).toBeNull();
    expect(state.jump).toBeNull();
    expect(state.agenda.used).toBe(0);
    expect(state.strength).toBe(state.strengthMax);
    expect(state.priceHistory.length).toBe(16 + balance.timeskip.rounds + 1);
    expect(record.fromYear).toBe(5);
    expect(record.toYear).toBe(10);
    expect(unreadChronicle(state)).toEqual(record);
    // Jede Zeile der Chronik gehört zu einem Jahr des Sprungs.
    expect(record.entries.every((e) => e.year >= 5 && e.year <= 10)).toBe(true);
    expect(unreadChronicle(markChronicleRead(state))).toBeNull();
    expect(state.log[state.log.length - 1]).not.toMatch(/undefined/);
  });

  it('der Weltzustand ist 24 Quartale weiter, keine Zahl ist kaputt', () => {
    const ende = kapitelEnde('sprung-welt');
    const { state } = springen(ende);
    expect(state.worldModel.round).toBe(ende.worldModel.round + balance.timeskip.rounds);
    expect(JSON.stringify(state)).not.toMatch(/NaN|Infinity|null,null/);
    expect(serializeGame(state, APP)).not.toMatch(/NaN|Infinity/);
  });

  it('die Wildcatter besitzen nach dem Sprung genau die Nachbarquellen, die der Markt rechnet', () => {
    const { state } = springen(kapitelEnde('sprung-nachbarn'));
    expect(wildcatterWells(state)).toBe(Math.max(0, Math.floor(neighbourWells(balance.market, state.round, state.neighbourOffset))));
    const weiter = endRound(state, balance, catalog);
    expect(wildcatterWells(weiter)).toBe(Math.max(0, Math.floor(neighbourWells(balance.market, weiter.round, weiter.neighbourOffset))));
  });

  it('Kapitel 2 läuft mit den Kapitel-1-Systemen bis zu seinem Ende – ohne Aktien und ohne weiteren Sprung', () => {
    let { state } = springen(kapitelEnde('sprung-weiter', balance, mitEntscheidungen));
    for (let i = 0; i < 40 && !state.finished; i++) state = endRound(state, balance, catalog);
    expect(state.finished).toBe(true);
    if (state.ending === 'kapitel') {
      expect(state.round).toBe(state.totalRounds);
      expect(canGoPublic(state, balance)).toBe(false);
      expect(decideIpo(state, balance, 0).ok).toBe(false);
      expect(timeskipBlocked(state, balance)).toMatch(/im Bau/);
      expect(state.log[state.log.length - 1]).toMatch(/Kapitel 2 ist zu Ende/);
    }
  });

  it('Ereignis-Bedingungen minRound/maxRound zählen ab dem Kapitelbeginn', () => {
    const { state } = springen(kapitelEnde('sprung-ereignis'));
    expect(conditionsMet(state, { maxRound: 2 })).toBe(true);
    expect(conditionsMet(state, { minRound: 3 })).toBe(false);
  });
});

describe('Spielstand übersteht den Kapitelwechsel', () => {
  it('mitten im Sprung (Direktiven und Weichen) und danach: laden ergibt dasselbe Spiel', () => {
    const ende = kapitelEnde('sprung-speichern', balance, mitEntscheidungen);
    const s = startTimeskip(ende, balance, STANDARD);
    if (!s.ok) throw new Error(s.reason);
    const geladen = deserializeGame(serializeGame(s.state, APP));
    expect(geladen.ok && geladen.state).toEqual(s.state);
    const fertig = springen(ende);
    const k2 = deserializeGame(serializeGame(fertig.state, APP));
    expect(k2.ok).toBe(true);
    if (!k2.ok) return;
    expect(k2.state).toEqual(fertig.state);
    let a = fertig.state;
    let b = k2.state;
    for (let i = 0; i < 5; i++) {
      a = endRound(a, balance, catalog);
      b = endRound(b, balance, catalog);
    }
    expect(b).toEqual(a);
  });

  it('ein Spielstand aus Format 17 lädt als Kapitel 1 ohne Zeitsprung', () => {
    const s = newGame('sprung-alt', balance);
    const alt: Record<string, unknown> = { ...s };
    for (const k of ['chapter', 'chapterStart', 'neighbourOffset', 'jump', 'timeskips']) delete alt[k];
    const geladen = deserializeGame(JSON.stringify({ format: 17, appVersion: '0.4.4', savedRound: 1, state: alt }));
    expect(geladen.ok).toBe(true);
    expect(geladen.ok && geladen.state).toEqual(s);
  });

  it('ein kaputter Sprung im Spielstand wird abgelehnt', () => {
    const s = { ...newGame('sprung-kaputt', balance), jump: { directives: {} } };
    expect(deserializeGame(JSON.stringify({ format: 18, appVersion: APP, savedRound: 1, state: s })).ok).toBe(false);
  });
});

describe('Weichen', () => {
  it('die ersten Automobile kommen in jedem Sprung im Jahr 7; Einsteigen kostet und setzt benzin_frueh', () => {
    const ende = kapitelEnde('sprung-auto', balance, mitEntscheidungen);
    const ja = springen(ende, STANDARD, (id) => (id === 'automobile' ? 'invest' : SWITCH_CHOICES[id][1]));
    const nein = springen(ende, STANDARD, (id) => (id === 'automobile' ? 'ignore' : SWITCH_CHOICES[id][1]));
    expect(ja.record.switches).toContain('automobile');
    expect(ja.record.entries.find((e) => e.kind === 'automobile_invest')?.year).toBe(7);
    expect(ja.state.events.marks[TIMESKIP_MARKS.benzin]).toBeDefined();
    expect(nein.state.events.marks[TIMESKIP_MARKS.benzin]).toBeUndefined();
  });

  it('Okara kommt nur mit seiner Chance; ohne Pacht sichert Bullard sie sich', () => {
    const raw = rawBalance();
    const mit = (chance: number) => parseBalance({ ...raw, timeskip: { ...(raw.timeskip as Record<string, unknown>), switches: { ...((raw.timeskip as Record<string, unknown>).switches as object), okaraChance: chance } } });
    const nie = mit(0);
    const immer = mit(1);
    const e0 = kapitelEnde('sprung-okara', nie);
    expect(springen(e0, STANDARD, ERSTE, nie).record.switches).not.toContain('okara');
    const e1 = kapitelEnde('sprung-okara', immer);
    const pass = springen(e1, STANDARD, (id) => (id === 'okara' ? 'pass' : SWITCH_CHOICES[id][1]), immer);
    expect(pass.record.switches).toContain('okara');
    expect(pass.state.events.marks[TIMESKIP_MARKS.okaraBullard]).toBeDefined();
    const lease = springen(e1, STANDARD, (id) => (id === 'okara' ? 'lease' : SWITCH_CHOICES[id][1]), immer);
    expect(lease.state.events.marks[TIMESKIP_MARKS.okara]).toBeDefined();
    expect(lease.record.entries.some((e) => e.kind === 'okara_found' || e.kind === 'okara_dry')).toBe(true);
  });

  it('Clara: ohne Chance keine Geburt; mit sicherer Chance kommt sie zur Welt (Merkzeichen, Familie)', () => {
    const raw = rawBalance();
    const ts = raw.timeskip as Record<string, unknown>;
    const fam = ts.family as Record<string, unknown>;
    const mit = (c: number) => parseBalance({ ...raw, timeskip: { ...ts, family: { ...fam, claraChance: { little: c, some: c, much: c } } } });
    const nie = mit(0);
    const keine = springen(kapitelEnde('sprung-clara', nie), STANDARD, ERSTE, nie);
    expect(keine.record.switches).not.toContain('clara');
    expect(keine.state.family.claraBorn ?? 0).toBe(0);
    const immer = mit(1);
    const ende = kapitelEnde('sprung-clara', immer);
    const daheim = springen(ende, STANDARD, (id) => (id === 'clara' ? 'home' : SWITCH_CHOICES[id][1]), immer);
    const weg = springen(ende, STANDARD, (id) => (id === 'clara' ? 'business' : SWITCH_CHOICES[id][1]), immer);
    for (const r of [daheim, weg]) {
      expect(r.record.switches).toContain('clara');
      expect(r.state.family.claraBorn).toBeGreaterThan(16);
      expect(r.state.events.marks[TIMESKIP_MARKS.clara]).toBeDefined();
      expect(r.record.entries.some((e) => e.kind === 'clara_born')).toBe(true);
    }
    expect(daheim.state.family.clara!).toBeGreaterThan(weg.state.family.clara!);
    expect(daheim.state.family.ruth).toBeGreaterThan(weg.state.family.ruth);
  });

  it('Bankenpanik kommt nur bei überhitztem Kreditklima', () => {
    const raw = rawBalance();
    const wm = raw.worldModel as Record<string, unknown>;
    const credit = wm.credit as Record<string, unknown>;
    // Ohne Auslöser kippt nichts – die Überhitzung bleibt bestehen.
    const ruhig = parseBalance({ ...raw, worldModel: { ...wm, credit: { ...credit, crashChance: 0, crashSlope: 0, priceTrigger: 1 } } });
    const heiss = kapitelEnde('sprung-panik', ruhig);
    const ueberhitzt = { ...heiss, worldModel: { ...heiss.worldModel, credit: 75, leverage: 90, crash: 0, panic: 0 } };
    expect(springen(ueberhitzt, STANDARD, ERSTE, ruhig).record.switches).toContain('bank_panic');
    // Ohne Verschuldung (sie baut sich nie auf) wird das Klima nie überhitzt.
    const lev = credit.leverage as Record<string, unknown>;
    const nie = parseBalance({ ...raw, worldModel: { ...wm, credit: { ...credit, leverage: { ...lev, build: 0 } } } });
    const kalt = kapitelEnde('sprung-panik', nie);
    expect(springen({ ...kalt, worldModel: { ...kalt.worldModel, leverage: 25 } }, STANDARD, ERSTE, nie).record.switches).not.toContain('bank_panic');
  });

  it('„Schulden zurückzahlen“ in der Bankenpanik tilgt sofort und setzt das Merkzeichen', () => {
    const raw = rawBalance();
    const wm = raw.worldModel as Record<string, unknown>;
    const credit = wm.credit as Record<string, unknown>;
    const ruhig = parseBalance({ ...raw, worldModel: { ...wm, credit: { ...credit, crashChance: 0, crashSlope: 0, priceTrigger: 1 } } });
    const ende = kapitelEnde('sprung-tilgen', ruhig, mitEntscheidungen);
    const geliehen = takeLoan({ ...ende, finished: false }, ruhig, 1000);
    const basis = { ...(geliehen.ok ? geliehen.state : ende), finished: true, cash: 50000, worldModel: { ...ende.worldModel, credit: 75, leverage: 90, crash: 0, panic: 0 } };
    expect(debt(basis)).toBeGreaterThan(0);
    const tilgen = springen(basis, STANDARD, (id) => (id === 'bank_panic' ? 'repay' : SWITCH_CHOICES[id][1]), ruhig);
    expect(tilgen.state.events.marks[TIMESKIP_MARKS.panicRepaid]).toBeDefined();
    expect(tilgen.record.entries.find((e) => e.kind === 'panic_repay')?.amount).toBeGreaterThan(0);
  });
});

describe('Direktiven wirken', () => {
  it('vorsichtig tilgt mehr Schulden als wagemutig; wagemutig bohrt mehr', () => {
    let vorsichtigSchulden = 0;
    let mutigSchulden = 0;
    let vorsichtigBohr = 0;
    let mutigBohr = 0;
    for (let i = 0; i < 6; i++) {
      const ende = kapitelEnde(`sprung-haltung-${i}`, balance, mitEntscheidungen);
      const v = springen(ende, { stance: 'cautious', family: 'some' }, ZWEITE);
      const m = springen(ende, { stance: 'aggressive', family: 'some' }, ZWEITE);
      vorsichtigSchulden += v.record.after.debt;
      mutigSchulden += m.record.after.debt;
      vorsichtigBohr += v.state.wells.length - ende.wells.length;
      mutigBohr += m.state.wells.length - ende.wells.length;
    }
    expect(vorsichtigSchulden).toBeLessThanOrEqual(mutigSchulden);
    expect(mutigBohr).toBeGreaterThan(vorsichtigBohr);
  });

  it('viel Familienzeit hält Ruth näher als „die Firma zuerst“', () => {
    const ende = kapitelEnde('sprung-familie');
    const viel = springen(ende, { stance: 'balanced', family: 'much' }, ZWEITE);
    const wenig = springen(ende, { stance: 'balanced', family: 'little' }, ZWEITE);
    expect(viel.state.family.ruth).toBeGreaterThan(wenig.state.family.ruth);
  });
});
