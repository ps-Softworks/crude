// 2.11 Kapitelprüfung und Kapitelende: Prüfung (nicht bankrott und Imperiumswert
// ≥ goalValue oder ≥ goalWells fördernde Quellen), Ausgänge erreicht/verfehlt/
// verkauft/pleite, Boni, Entscheidung zur Aktiengesellschaft, Inhalte in
// content/chapter.yaml und Spielstände.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArcContent } from './arcs';
import { parseBalance } from './balance';
import {
  canGoPublic,
  chapterBonuses,
  chapterCheck,
  chapterResult,
  checkChapterMarks,
  decideIpo,
  fillText,
  ipoProceeds,
  ownShare,
  ipoConsequenceText,
  parseChapterContent,
  type ChapterContent,
} from './chapter';
import { checkBankruptcy } from './credit';
import type { Well } from './drilling';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { bondLimit } from './stocks';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const catalog = loadEvents();
const FILE = 'content/chapter.yaml';
const chapterText = readFileSync(new URL('../../content/chapter.yaml', import.meta.url), 'utf8');
const arcsText = readFileSync(new URL('../../content/arcs.yaml', import.meta.url), 'utf8');

function content(): ChapterContent {
  const { content: c, errors } = parseChapterContent(FILE, chapterText);
  if (!c) throw new Error(errors.map((e) => e.message).join('\n'));
  return c;
}

/** Fündige Quelle ohne Feld (zählt als fördernd, bringt keine Reserven). */
function quelle(i: number): Well {
  return { id: `x${i}#1`, parcelId: `x${i}`, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1 };
}

/** Spiel in der letzten Runde mit gegebener Kasse und Quellenzahl. */
function letzteRunde(cash: number, wells = 0): GameState {
  const g = newGame('kapitel', balance);
  return { ...g, round: g.totalRounds, cash, wells: Array.from({ length: wells }, (_, i) => quelle(i)) };
}

/** Kapitel regulär beendet. */
function amEnde(cash: number, wells = 0): GameState {
  const s = endRound(letzteRunde(cash, wells), balance);
  expect(s.ending).toBe('kapitel');
  return s;
}

describe('balance.yaml: chapter', () => {
  it('hat Ziel 95.000 $ oder 8 Quellen und Anteile unter 50 %', () => {
    // 0.4.20+1: vorher 50.000 $ / 5 Quellen (GDD §13) – angehoben mit der guten ersten Startoption;
    // Spielspaß K1: 70.000 $ / 6 → 95.000 $ / 8 (tiefe Funde und Karten machen Kapitel 1 reicher).
    expect(balance.chapter.goalValue).toBe(95000);
    expect(balance.chapter.goalWells).toBe(8);
    expect(balance.chapter.ipo.shares.length).toBeGreaterThan(0);
    for (const s of balance.chapter.ipo.shares) expect(s).toBeLessThan(0.5);
  });

  it('fehlender Block oder Anteil ab 50 % ist ein Fehler', () => {
    const raw = rawBalance() as any;
    expect(() => parseBalance({ ...raw, chapter: undefined })).toThrow('Block "chapter" fehlt');
    expect(() => parseBalance({ ...raw, chapter: { ...raw.chapter, ipo: { ...raw.chapter.ipo, shares: [0.5] } } })).toThrow(/Mehrheit/);
  });
});

describe('Kapitelprüfung', () => {
  it('Imperiumswert ab goalValue reicht', () => {
    const c = chapterCheck(letzteRunde(balance.chapter.goalValue), balance);
    expect(c).toMatchObject({ solvent: true, valueReached: true, wellsReached: false, passed: true });
    expect(chapterCheck(letzteRunde(balance.chapter.goalValue - 1), balance).passed).toBe(false);
  });

  it('oder goalWells fördernde Quellen', () => {
    expect(chapterCheck(letzteRunde(100, balance.chapter.goalWells), balance)).toMatchObject({ wells: balance.chapter.goalWells, wellsReached: true, passed: true });
    expect(chapterCheck(letzteRunde(100, balance.chapter.goalWells - 1), balance).passed).toBe(false);
  });

  it('trockene oder laufende Bohrungen zählen nicht als fördernd', () => {
    const s = letzteRunde(100, 5);
    s.wells[0] = { ...s.wells[0], status: 'dry' };
    s.wells[1] = { ...s.wells[1], status: 'drilling' };
    expect(chapterCheck(s, balance).wells).toBe(3);
  });

  it('Kasse im Minus heißt bankrott – auch mit genug Quellen', () => {
    const c = chapterCheck(letzteRunde(-1, balance.chapter.goalWells + 1), balance);
    expect(c.solvent).toBe(false);
    expect(c.passed).toBe(false);
  });
});

describe('Ausgänge des Kapitels', () => {
  it('vor dem Ende gibt es keinen Ausgang', () => {
    expect(chapterResult(newGame('x', balance), balance)).toBeNull();
  });

  it('erreicht: Kapitelende mit bestandener Prüfung, steht im Protokoll', () => {
    const s = amEnde(balance.chapter.goalValue + 10000);
    expect(chapterResult(s, balance)).toBe('erreicht');
    expect(s.log.at(-1)).toMatch(/Kapitel 1 ist zu Ende\. Das Ziel ist erreicht\./);
  });

  it('verfehlt: Kapitelende ohne bestandene Prüfung', () => {
    const s = amEnde(1000);
    expect(chapterResult(s, balance)).toBe('verfehlt');
    expect(s.log.at(-1)).toMatch(/Das Ziel ist verfehlt\./);
  });

  it('verkauft: Crane-Übernahme angenommen ist das frühe Ende „Der kluge Mann“', () => {
    const g = newGame('crane', balance);
    const s = endRound({ ...g, round: 5, events: { ...g.events, marks: { crane_verkauft: 5 } } }, balance);
    expect(s.ending).toBe('verkauft');
    expect(chapterResult(s, balance)).toBe('verkauft');
  });

  it('pleite ist kein Kapitelende mit Prüfung', () => {
    const s = checkBankruptcy({ ...newGame('pleite', balance), cash: -500, round: balance.start.rounds }, balance);
    expect(chapterResult(s, balance)).toBe('pleite');
  });

  it('ganze Partie ohne Eingriff endet nach der letzten Runde mit erreicht oder verfehlt', () => {
    let s = newGame('ganz', balance, catalog);
    while (!s.finished) s = endRound(s, balance, catalog);
    expect(['erreicht', 'verfehlt', 'pleite']).toContain(chapterResult(s, balance));
  });
});

describe('Boni', () => {
  const arcs = parseArcContent('content/arcs.yaml', arcsText).content!;
  const mitMarks = (marks: Record<string, number>) => ({ events: { ...newGame('bonus', balance).events, marks } });

  it('ohne Merkzeichen kein Bonus', () => {
    expect(chapterBonuses(mitMarks({}), content(), arcs)).toEqual({ transport: false, silas: false });
  });

  it('die eigene Pipeline zählt als Transportlösung, ein Silas-Ausgang als geklärt', () => {
    const silasMark = arcs.silas.outcomes[0].any[0];
    expect(chapterBonuses(mitMarks({ pipeline_gebaut: 3, [silasMark]: 8 }), content(), arcs)).toEqual({ transport: true, silas: true });
  });
});

describe('Aktiengesellschaft', () => {
  const anteil = balance.chapter.ipo.shares[0];

  it('nur am Kapitelende mit bestandener Prüfung', () => {
    expect(canGoPublic(letzteRunde(balance.chapter.goalValue + 10000), balance)).toBe(false);
    expect(canGoPublic(amEnde(balance.chapter.goalValue + 10000), balance)).toBe(true);
    expect(canGoPublic(amEnde(1000), balance)).toBe(false);
    expect(decideIpo(letzteRunde(balance.chapter.goalValue + 10000), balance, anteil).ok).toBe(false);
    expect(decideIpo(amEnde(1000), balance, anteil).ok).toBe(false);
  });

  it('Erlös = Imperiumswert × Anteil × priceFactor, kommt in die Kasse', () => {
    const s = amEnde(balance.chapter.goalValue + 10000);
    const erwartet = Math.round(empireValue(s, balance) * anteil * balance.chapter.ipo.priceFactor);
    expect(ipoProceeds(s, balance, anteil)).toBe(erwartet);
    const r = decideIpo(s, balance, anteil);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(s.cash + erwartet);
    expect(r.state.ipo).toEqual({ share: anteil, proceeds: erwartet });
    expect(ownShare(r.state)).toBeCloseTo(1 - anteil, 10);
    expect(r.state.log.at(-1)).toContain('an Anleger');
  });

  it('nur einmal und nur angebotene Anteile', () => {
    const s = amEnde(balance.chapter.goalValue + 10000);
    expect(decideIpo(s, balance, 0.6).ok).toBe(false);
    const r = decideIpo(s, balance, anteil);
    if (!r.ok) throw new Error(r.reason);
    expect(decideIpo(r.state, balance, anteil).ok).toBe(false);
    expect(canGoPublic(r.state, balance)).toBe(false);
  });

  it('Familienfirma bleiben geht immer am Kapitelende, auch nach verfehlter Prüfung', () => {
    for (const s of [amEnde(balance.chapter.goalValue + 10000), amEnde(1000)]) {
      const r = decideIpo(s, balance, 0);
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.ipo).toEqual({ share: 0, proceeds: 0 });
      expect(r.state.cash).toBe(s.cash);
      expect(ownShare(r.state)).toBe(1);
    }
  });
});

describe('content/chapter.yaml', () => {
  it('ist fehlerfrei, als Entwurf markiert und hat deutsche und englische Texte', () => {
    const c = content();
    expect(c.draft).toBe(true);
    for (const id of ['erreicht', 'verfehlt', 'verkauft'] as const) {
      expect(c.endings[id].title.de).not.toBe('');
      expect(c.endings[id].text.en).not.toBe('');
    }
  });

  it('die Merkzeichen des Transport-Bonus setzt eine Wahl', () => {
    expect(checkChapterMarks(FILE, content(), catalog)).toEqual([]);
    const falsch = { ...content(), bonus: { ...content().bonus, transport: { ...content().bonus.transport, any: ['gibtsnicht'] } } };
    expect(checkChapterMarks(FILE, falsch, catalog)).toHaveLength(1);
  });

  it('meldet fehlende Blöcke und kaputtes YAML', () => {
    expect(parseChapterContent(FILE, 'draft: true\n').content).toBeNull();
    expect(parseChapterContent(FILE, 'endings: [\n').errors[0].message).toMatch(/YAML kaputt/);
  });

  it('Platzhalter werden eingesetzt', () => {
    expect(fillText(content().ipo.sell, { anteil: '20 %', preis: '1.000 $' })).toBe('20 % verkaufen – 1.000 $');
    expect(fillText({ de: 'a {x}', en: 'b {x}' }, { x: '1' }, 'en')).toBe('b 1');
  });
});

describe('Spielstand', () => {
  it('ab Format 9 sichert der Spielstand die Entscheidung mit', () => {
    const r = decideIpo(amEnde(balance.chapter.goalValue + 10000), balance, 0);
    if (!r.ok) throw new Error(r.reason);
    const geladen = deserializeGame(serializeGame(r.state, 'test'));
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(9);
    expect(geladen.ok && geladen.state.ipo).toEqual({ share: 0, proceeds: 0 });
  });

  it('ältere Spielstände ohne Börsengang laden mit „noch nicht entschieden“', () => {
    const { ipo: _, ...alt } = newGame('alt', balance);
    const geladen = deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.2.10', savedRound: 1, state: alt }));
    expect(geladen.ok && geladen.state.ipo).toBeNull();
  });

  it('kaputte Entscheidung wird abgelehnt', () => {
    const s = { ...newGame('kaputt', balance), ipo: { share: 2, proceeds: 0 } };
    expect(deserializeGame(JSON.stringify({ format: 9, appVersion: 'x', savedRound: 1, state: s })).ok).toBe(false);
  });
});

describe('Börsengang-Brief: Folgen je Wahl', () => {
  it('nennt Sitze, Fristen, Thorne-Schwelle und Kontrollgrenze aus balance.yaml', () => {
    const c = content().ipo;
    const g = letzteRunde(100000, 8);
    const B = balance.stocks;
    for (const share of balance.chapter.ipo.shares) {
      const text = ipoConsequenceText(g, balance, c, share, 'de');
      const sitze = Math.min(B.board.seatsMax, Math.max(B.board.seatsMin, B.board.seatsBase + Math.round(share * B.board.seatsPerShare)));
      expect(text).toContain(`${sitze} Sitze`);
      expect(text).toContain(`${B.demands.dueRounds} Runden Frist`);
      expect(text).toContain(`Nach ${B.dividend.graceRounds} Runden ohne Dividende`);
      expect(text).toContain(`${Math.round(B.thorne.minOutside * 100)} %`);
      expect(text).toContain(`${Math.round(share * 100)} %`);
      expect(text).toContain(share >= B.thorne.minOutside ? 'kann über Strohmänner einsteigen' : 'erst einsteigen');
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).toContain(`bis zu ${bondLimit(g, balance).toLocaleString('de-DE')} $`);
    }
    expect(ipoConsequenceText(g, balance, c, 0, 'de')).toContain('keine Anleger');
    expect(ipoConsequenceText(g, balance, c, 0, 'de')).toContain('keine Anleihen');
  });

  it('später Börsengang: Text nennt den späten Preis (lateFactor), nicht den vom Kapitelende', () => {
    const c = content().ipo;
    const g = letzteRunde(100000, 8);
    const share = balance.chapter.ipo.shares[0];
    const spaet = ipoConsequenceText(g, balance, c, share, 'de', true);
    expect(spaet).toContain(`${Math.round(empireValue(g, balance) * share * balance.chapter.ipo.lateFactor).toLocaleString('de-DE')} $`);
    expect(spaet).not.toMatch(/\{\w+\}/);
    expect(spaet).not.toBe(ipoConsequenceText(g, balance, c, share, 'de'));
    expect(c.lateTitle.de).toBeTruthy();
    expect(c.lateText.en).toBeTruthy();
  });
});
