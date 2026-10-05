// 4.12 Kapitel 2 „Der Herausforderer“ (GDD §13/§14): Startzustand nach Zeitsprung I, alle
// Kapitel-2-Systeme ab Runde 1, Kapitelprüfung (Raffinerie oder Hafen-Pipeline, Kontrolle ≥ 50 %,
// Imperiumswert ≥ 1 Mio. $), frühe Enden (abgesetzt, geschluckt, hinter Gittern), Story-Bögen.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arcSummaries, parseArcContent } from './arcs';
import { applyEarlyEnding, canGoPublic, chapter2Check, chapterPassed, chapterResult, companyControl, decideIpo, earlyEnding, parseChapterContent } from './chapter';
import { surveyRoute } from './bigPipeline';
import { botTurn } from './bots';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { DELANEY_MARKS } from './investigation';
import { deserializeGame, serializeGame } from './save';
import { parseStocksContent } from './stocksContent';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { chapterEnds } from './timeskipBots';
import { chapterRound, chapterRounds, chapterUnderConstruction, runTimeskip, startTimeskip, timeskipBlocked, answerSwitch, SWITCH_CHOICES } from './timeskip';
import { Rng, seedFromString } from './rng';

const balance = loadBalance();
const catalog = loadEvents();
const TEXTE = {
  stocksBoard: parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board,
};
const arcs = parseArcContent('content/arcs.yaml', readFileSync(new URL('../../content/arcs.yaml', import.meta.url), 'utf8')).content!;

/** Ein Kapitel-1-Ende des Standard-Bots, Börsengang nach Wahl, Zeitsprung mit den ersten Antworten. */
const ENDEN = chapterEnds(balance, 12, catalog);
/** Kapitel-1-Enden mit bestandener Prüfung (nur dort darf Jacob an die Börse). */
const BESTANDEN = ENDEN.filter((e) => canGoPublic(e, balance));

function kapitel2(share = 0.33, nr = 0): GameState {
  let s = share > 0 ? BESTANDEN[nr] : ENDEN[nr];
  if (share > 0 && canGoPublic(s, balance)) {
    const ipo = decideIpo(s, balance, share);
    if (!ipo.ok) throw new Error(ipo.reason);
    s = ipo.state;
  } else {
    const ipo = decideIpo(s, balance, 0);
    if (ipo.ok) s = ipo.state;
  }
  const start = startTimeskip(s, balance, { stance: 'balanced', family: 'some' });
  if (!start.ok) throw new Error(start.reason);
  s = start.state;
  for (let i = 0; i < 10; i++) {
    const step = runTimeskip(s, balance, catalog, TEXTE);
    if (step.status === 'done') return step.state;
    let a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][1], catalog, TEXTE);
    if (!a.ok) a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][0], catalog, TEXTE);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('Zu viele Weichen.');
}

/** Spielt Kapitel 2 mit dem Standard-Bot zu Ende (Antworten nach Bot-Regel, sonst Standard-Antwort). */
function durchspielen(s0: GameState): GameState {
  let s = s0;
  const rng = new Rng(seedFromString(`${s.seed}:k2-test`));
  let schutz = 0;
  while (!s.finished && schutz++ < 40) {
    s = botTurn(s, balance, 'ausgewogen', rng, catalog);
    s = endRound(s, balance, catalog);
  }
  return s;
}

describe('Kapitelstart nach Zeitsprung I', () => {
  const s = kapitel2();

  it('Kapitel 2 beginnt in Jahr 11 mit 16 Runden und ist nicht mehr „im Bau“', () => {
    expect(s.chapter).toBe(2);
    expect(chapterRound(s)).toBe(1);
    expect(chapterRounds(s)).toBe(16);
    expect(chapterUnderConstruction(s)).toBe(false);
    expect(s.log.some((l) => l.includes('Der Herausforderer'))).toBe(true);
    expect(s.log.some((l) => l.includes('im Bau'))).toBe(false);
    // 4.19: Am Ende von Kapitel 2 geht es in den Zeitsprung II.
    expect(timeskipBlocked({ ...s, ending: 'kapitel' }, balance)).toBeUndefined();
  });

  it('Quellen, Kasse, Aktiengesellschaft und Familie kommen aus Kapitel 1 und dem Sprung', () => {
    expect(s.wells.some((w) => w.status === 'found')).toBe(true);
    expect(Number.isFinite(s.cash)).toBe(true);
    expect(s.stocks?.public).toBe(true);
    expect(s.stocks!.jacob).toBe(Math.round(balance.stocks.totalShares * (1 - s.ipo!.share)));
    expect(s.family.ruth).toBeGreaterThanOrEqual(0);
  });

  it('alle Kapitel-2-Systeme sind ab der ersten Runde da', () => {
    expect(s.refinery).toBeDefined();
    expect(s.bigPipelines).toBeDefined();
    expect(s.staff).toBeDefined();
    expect(s.diplomacy).toBeDefined();
    expect(s.investigation).toBeDefined();
    expect(s.research).toBeDefined();
    expect(s.stocks!.board.some((m) => m.id === 'vandermeer')).toBe(true);
    // Kapitel-3-Systeme noch nicht.
    expect(s.brand).toBeUndefined();
    expect(s.exchange).toBeUndefined();
  });

  it('die Familienfirma bekommt ein Aktienbuch nur für Anleihen (Kontrolle 100 %)', () => {
    const f = kapitel2(0);
    expect(f.stocks?.public).toBe(false);
    expect(companyControl(f, balance)).toBe(1);
  });
});

describe('Kapitelprüfung Kapitel 2 (GDD §13)', () => {
  const basis = kapitel2();
  const mit = (s: GameState, opts: { raffinerie?: boolean; hafen?: boolean; wert?: number }) => {
    let x = s;
    if (opts.raffinerie) x = { ...x, refinery: { ...x.refinery!, level: 1 } };
    if (opts.hafen) {
      const p = x.bigPipelines!;
      x = { ...x, bigPipelines: { ...p, projects: [...p.projects, { id: 'flx', origin: 'a', destination: 'hafen', fromSmall: false, points: [], length: 10, bypassesRail: true, rights: [], status: 'ready', roundsLeft: 0, guards: false, surveyedRound: 1, readyRound: 1 }] } };
    }
    if (opts.wert !== undefined) x = { ...x, cash: x.cash + (opts.wert - empireValue(x, balance)) };
    return x;
  };

  it('Raffinerie oder Hafen-Pipeline, Kontrolle und Imperiumswert müssen alle stimmen', () => {
    const ziel = balance.chapter.chapter2.goalValue;
    expect(chapter2Check(mit(basis, { raffinerie: true, wert: ziel }), balance).passed).toBe(true);
    expect(chapter2Check(mit(basis, { hafen: true, wert: ziel }), balance).passed).toBe(true);
    expect(chapter2Check(mit(basis, { wert: ziel }), balance).transport).toBe(false);
    expect(chapter2Check(mit(basis, { raffinerie: true, wert: ziel - 1000 }), balance).passed).toBe(false);
  });

  it('Kontrolle unter 50 % verfehlt die Prüfung', () => {
    const ziel = balance.chapter.chapter2.goalValue;
    const s = mit(basis, { raffinerie: true, wert: ziel });
    const verwaessert = { ...s, stocks: { ...s.stocks!, jacob: 300, float: s.stocks!.float + s.stocks!.jacob - 300, board: s.stocks!.board.map((m) => ({ ...m, loyalty: 0 })) } };
    const c = chapter2Check(verwaessert, balance);
    expect(c.controlReached).toBe(false);
    expect(c.passed).toBe(false);
  });

  it('am Ende von Kapitel 2 steht das Ergebnis im Protokoll; chapterResult liest die Prüfung von Kapitel 2', () => {
    const ziel = balance.chapter.chapter2.goalValue;
    const s = { ...mit(basis, { raffinerie: true, wert: ziel * 3 }), round: basis.totalRounds };
    const ende = endRound(s, balance, catalog);
    expect(ende.ending).toBe('kapitel');
    expect(ende.log.some((l) => l.includes('Kapitel 2 ist zu Ende'))).toBe(true);
    expect(chapterResult(ende, balance)).toBe(chapterPassed(ende, balance) ? 'erreicht' : 'verfehlt');
  });

  it('kein Börsengang am Ende von Kapitel 2, aber der Zeitsprung II (4.19); nach einem frühen Ende keiner', () => {
    const ende = { ...basis, finished: true, ending: 'kapitel' as const };
    expect(canGoPublic(ende, balance)).toBe(false);
    expect(timeskipBlocked(ende, balance)).toBeUndefined();
    expect(timeskipBlocked({ ...ende, ending: 'abgesetzt' as const }, balance)).toBeDefined();
  });
});

describe('Frühe Enden ab Kapitel 2 (GDD §14)', () => {
  const basis = kapitel2();

  it('Abgesetzt: verlorener Stellvertreterkampf beendet die Partie', () => {
    const s = { ...basis, stocks: { ...basis.stocks!, ousted: basis.round } };
    expect(earlyEnding(s, balance)).toBe('abgesetzt');
    const e = applyEarlyEnding(s, balance);
    expect(e).toMatchObject({ finished: true, ending: 'abgesetzt' });
    expect(chapterResult(e, balance)).toBe('abgesetzt');
  });

  it('Hinter Gittern: Verurteilung zu langer Haft', () => {
    const s = { ...basis, events: { ...basis.events, marks: { ...basis.events.marks, [DELANEY_MARKS.prison]: basis.round } } };
    expect(earlyEnding(s, balance)).toBe('haft');
  });

  it('Geschluckt: Thorne hält mehr Aktien als Jacob und Jacobs Kontrolle liegt unter der Schwelle', () => {
    const st = basis.stocks!;
    const s = { ...basis, stocks: { ...st, jacob: 300, float: 200, blocks: [{ shares: 500, straw: 1, since: basis.round }], board: st.board.map((m) => ({ ...m, loyalty: 0 })) } };
    expect(earlyEnding(s, balance)).toBe('geschluckt');
    expect(earlyEnding({ ...s, stocks: { ...s.stocks!, blocks: [{ shares: 200, straw: 1, since: 1 }], float: 500 } }, balance)).toBeNull();
  });

  it('in Kapitel 1 gibt es diese Enden nicht', () => {
    const k1 = newGame('k1', balance);
    expect(earlyEnding({ ...k1, events: { ...k1.events, marks: { [DELANEY_MARKS.prison]: 1 } } }, balance)).toBeNull();
  });

  it('endRound beendet die Partie, sobald der Rat Jacob absetzt', () => {
    const s = { ...basis, stocks: { ...basis.stocks!, ousted: basis.round } };
    const n = endRound(s, balance, catalog);
    expect(n.ending).toBe('abgesetzt');
    expect(n.finished).toBe(true);
  });

  it('ein Stand mit frühem Ende, Ruf und Folgen übersteht Speichern und Laden', () => {
    const s = { ...basis, finished: true, ending: 'haft' as const, reputation: { public: -20 }, consequences: { transportFee: 300, ratingShift: -1, appointmentsNext: 0, heirValues: { thomas: { business: 1, moral: 0, loyalty: 2, ambition: 0 } } } };
    const r = deserializeGame(serializeGame(s, '0.4.12'));
    expect(r.ok && r.state).toEqual(s);
  });
});

describe('Story-Bögen und Thornes Klausel', () => {
  it('der Kapitelabschluss von Kapitel 2 zeigt Nora, Silas, Ruth und den Crane Trust', () => {
    const s = kapitel2();
    expect(arcSummaries(s, arcs).map((a) => a.arc)).toEqual(['nora_k2', 'silas_k2', 'ruth_k2', 'crane_k2']);
  });

  it('Seite neun (k2_thorne_klausel) sperrt jede eigene Fernleitung zum Hafen', () => {
    const s = kapitel2();
    const mitKlausel = { ...s, cash: 1e6, events: { ...s.events, marks: { ...s.events.marks, k2_thorne_klausel: s.round } } };
    const origin = s.regions[0];
    const ziel = balance.bigPipelines.destinations.find((d) => d.bypassesRail)!.id;
    const r = surveyRoute(mitKlausel, balance, { origin, destination: ziel } as never);
    if (r.ok) throw new Error('Die Klausel hätte die Trasse sperren müssen.');
    expect(r.reason).toMatch(/Seite neun|Thorne/);
  });

  it('Texte für alle Ausgänge von Kapitel 2 stehen in content/chapter.yaml', () => {
    const c = parseChapterContent('content/chapter.yaml', readFileSync(new URL('../../content/chapter.yaml', import.meta.url), 'utf8'));
    expect(c.errors).toEqual([]);
    for (const id of ['erreicht', 'verfehlt', 'verkauft', 'abgesetzt', 'geschluckt', 'haft'] as const) expect(c.content!.chapter2.endings[id].title.de).not.toBe('');
  });
});

describe('Kapitel 2 ist von Anfang bis Ende spielbar', () => {
  it('der Standard-Bot spielt drei Kapitel 2 zu Ende – mit Prüfung oder frühem Ende, ohne Absturz, und jeder Stand lädt wieder', () => {
    for (const nr of [0, 1, 2]) {
      const start = kapitel2(0.33, nr);
      const ende = durchspielen(start);
      expect(ende.finished).toBe(true);
      expect(['kapitel', 'pleite', 'verkauft', 'abgesetzt', 'geschluckt', 'haft']).toContain(ende.ending);
      expect(Number.isFinite(ende.cash)).toBe(true);
      const r = deserializeGame(serializeGame(ende, '0.4.12'));
      expect(r.ok).toBe(true);
      // In Kapitel 2 kamen Ereignisse aus den Kapitel-2-Dateien.
      expect(ende.events.seen.some((id) => id.startsWith('k2_'))).toBe(true);
    }
  });
});
