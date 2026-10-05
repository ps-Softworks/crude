// 2.9 Story-Bögen Silas und Moss: Ausgänge aus Merkzeichen, die Inhalte in
// content/arcs.yaml und das Fertig-Kriterium – beide Bögen haben je nach
// Entscheidung mindestens zwei verschiedene Ausgänge, über ganze Partien gespielt.

import { readFileSync } from 'node:fs';
import { KONSORTIUM_MARKS } from './kapitel3Runde';
import { describe, expect, it } from 'vitest';
import { ARC_IDS, ARC_SIM_MARKS, arcOutcome, arcsOfChapter, arcSummaries, checkArcMarks, parseArcContent, type ArcContent, type ArcId } from './arcs';
import { DIPLO_MARKS } from './diplomacyCore';
import { resolveEvent } from './events';
import { endRound, newGame, type GameState } from './game';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const catalog = loadEvents();
const ARCS_FILE = 'content/arcs.yaml';
const arcsText = readFileSync(new URL('../../content/arcs.yaml', import.meta.url), 'utf8');

function arcs(): ArcContent {
  const { content, errors } = parseArcContent(ARCS_FILE, arcsText);
  if (!content) throw new Error(errors.map((e) => e.message).join('\n'));
  return content;
}

function mitMarks(marks: Record<string, number>): Pick<GameState, 'events'> {
  return { events: { ...newGame('bogen', balance).events, marks } };
}

describe('content/arcs.yaml', () => {
  it('ist fehlerfrei, hat beide Bögen mit je mindestens zwei Ausgängen und ist als Entwurf markiert', () => {
    const content = arcs();
    for (const id of ARC_IDS) {
      expect(content[id].outcomes.length).toBeGreaterThanOrEqual(2);
      expect(content[id].draft).toBe(true);
    }
  });

  it('jedes Merkzeichen eines Ausgangs setzt eine Wahl in content/events/', () => {
    expect(checkArcMarks(ARCS_FILE, arcs(), catalog)).toEqual([]);
  });

  it('meldet Tippfehler in Merkzeichen', () => {
    const content = arcs();
    const kaputt: ArcContent = { ...content, silas: { ...content.silas, outcomes: [...content.silas.outcomes, { ...content.silas.outcomes[0], id: 'x', any: ['silas_tippfeler'] }] } };
    expect(checkArcMarks(ARCS_FILE, kaputt, catalog).map((e) => e.message)).toEqual([
      'Bogen „silas“, Ausgang „x“: Das Merkzeichen „silas_tippfeler“ setzt keine Wahl – Tippfehler?',
    ]);
  });

  it('meldet fehlende Bögen, zu wenige Ausgänge und kaputte Merkzeichen-Listen', () => {
    const fehlt = parseArcContent(ARCS_FILE, 'silas:\n  name: { de: Silas, en: "" }\n  open: { title: { de: a, en: "" }, text: { de: b, en: "" } }\n  outcomes:\n    - id: a\n      any: [x]\n      title: { de: a, en: "" }\n      text: { de: a, en: "" }\n');
    expect(fehlt.content).toBeNull();
    expect(fehlt.errors.map((e) => e.message)).toEqual([
      'silas.outcomes: Ein Bogen braucht mindestens zwei Ausgänge.',
      'Bogen „moss“ fehlt.',
      'Bogen „nora_k2“ fehlt.',
      'Bogen „silas_k2“ fehlt.',
      'Bogen „ruth_k2“ fehlt.',
      'Bogen „crane_k2“ fehlt.',
      'Bogen „daniel_k3“ fehlt.',
      'Bogen „thomas_k3“ fehlt.',
      'Bogen „ruth_k3“ fehlt.',
      'Bogen „vale_k3“ fehlt.',
    ]);
    const anyKaputt = parseArcContent(ARCS_FILE, arcsText.replace('any: [silas_fair]', 'any: silas_fair'));
    expect(anyKaputt.errors.map((e) => e.message)).toEqual(['silas.outcomes[2]: „any“ muss eine Liste von Merkzeichen sein, z. B. any: [silas_fair].']);
    expect(parseArcContent(ARCS_FILE, `${arcsText}\nruth: {}\n`).errors[0].message).toMatch(/Unbekannte\(r\) Bogen: ruth/);
  });
});

describe('Ausgang eines Bogens', () => {
  const content = arcs();

  it('ist offen, solange kein Merkzeichen des Bogens gesetzt ist', () => {
    expect(arcOutcome(mitMarks({ silas_gedeckt: 2 }), content.silas)).toBeNull();
    expect(arcSummaries(mitMarks({}), content).map((s) => [s.arc, s.outcome, s.title])).toEqual([
      ['silas', null, 'Noch offen'],
      ['moss', null, 'Noch offen'],
    ]);
  });

  it('der erste passende Ausgang gilt: Kronzeuge vor „betrogen“, Feind vor allem anderen', () => {
    expect(arcOutcome(mitMarks({ silas_betrogen: 8 }), content.silas)).toBe('verbittert');
    expect(arcOutcome(mitMarks({ silas_betrogen: 8, silas_kronzeuge: 10 }), content.silas)).toBe('kronzeuge');
    expect(arcOutcome(mitMarks({ silas_betrogen: 8, silas_versoehnt: 10 }), content.silas)).toBe('versoehnt');
    expect(arcOutcome(mitMarks({ moss_abgewiesen: 5, moss_vertrieben: 7, moss_feind: 7 }), content.moss)).toBe('feind');
    expect(arcOutcome(mitMarks({ moss_abgewiesen: 5, moss_fair: 7 }), content.moss)).toBe('freund');
  });

  it('der Kapitelabschluss zeigt nur die Bögen seines Kapitels (4.12)', () => {
    expect(arcsOfChapter(1)).toEqual(['silas', 'moss']);
    expect(arcsOfChapter(2)).toEqual(['nora_k2', 'silas_k2', 'ruth_k2', 'crane_k2']);
    const k2 = { ...mitMarks({ silas_fair: 1, silas_geschuetzt: 44, ruth_finanzen: 45, k2_nachfolge_pruett: 50 }), chapter: 2 };
    expect(arcSummaries(k2, content).map((s) => [s.arc, s.outcome])).toEqual([
      ['nora_k2', null],
      ['silas_k2', 'geschuetzt'],
      ['ruth_k2', 'finanzen'],
      ['crane_k2', 'pruett'],
    ]);
  });

  it('die Ausgänge der Crane-Nachfolge sind Merkzeichen der Diplomatie (dieselben Namen)', () => {
    expect(ARC_SIM_MARKS.slice(0, 3)).toEqual([DIPLO_MARKS.heirMargaret, DIPLO_MARKS.heirPruett, DIPLO_MARKS.breakup]);
    // 4.19: Jacobs Weg mit dem Konsortium setzt die Rundenabrechnung von Kapitel 3 (dieselben Namen).
    expect(ARC_SIM_MARKS.slice(3)).toEqual(Object.values(KONSORTIUM_MARKS));
  });

  it('Texte kommen in der gewünschten Sprache', () => {
    const [silas] = arcSummaries(mitMarks({ silas_fair: 8 }), content, 'en');
    expect(silas).toMatchObject({ name: 'Silas Brandt', outcome: 'freund', title: 'Partner' });
  });
});

/**
 * Spielt eine ganze Partie mit den echten Ereignissen. Auf Szenen der Bögen
 * antwortet Jacob nach plan (Ereignis → Wahl), alles andere bleibt liegen
 * (Standard-Wahl). Genug Geld, damit jede Wahl bezahlbar ist.
 */
function partie(seed: string, plan: Record<string, string>): GameState {
  let state = newGame(seed, balance, catalog);
  while (!state.finished) {
    state = { ...state, cash: Math.max(state.cash, 5000) };
    for (const id of state.events.pending) {
      const wahl = plan[id];
      if (!wahl) continue;
      const r = resolveEvent(state, balance, catalog, id, wahl);
      if (!r.ok) throw new Error(`${id}/${wahl}: ${r.reason}`);
      state = r.state;
    }
    state = endRound(state, balance, catalog);
  }
  return state;
}

function ausgang(state: GameState, arc: ArcId): string | null {
  return arcOutcome(state, arcs()[arc]);
}

describe('Fertig-Kriterium 2.9: beide Bögen gehen je nach Entscheidung verschieden aus', () => {
  const SEEDS = ['bogen-1', 'bogen-2', 'bogen-3'];

  // Spielspaß K1 (Weichen statt Alltagspost): Seil, Nachtschicht, Abschied, Moss' Dank, Wagenweg, Spekulant und
  // Daniels Abschied sind gestrichen – die Folgen stehen jetzt direkt an den Antworten (Turm, Land, Pachten).
  it('Silas: fair, ausgekauft, versöhnt, Kronzeuge – und jede Szene des Wegs kommt', () => {
    for (const seed of SEEDS) {
      const fair = partie(seed, { silas_abrechnung: 'fair' });
      const aus = partie(seed, { silas_abrechnung: 'auskaufen' });
      const spaet = partie(seed, { silas_abrechnung: 'betruegen', silas_saloon: 'nachzahlen' });
      const ohne = partie(seed, {});
      expect([fair, aus, spaet, ohne].map((s) => ausgang(s, 'silas'))).toEqual(['freund', 'ausgekauft', 'versoehnt', 'kronzeuge']);
      // Fair: Silas zieht Stahlgestänge ein; ausgekauft: der Turm hat eine Dampfmaschine.
      expect(fair.rigs.find((r) => r.id === 'silas')?.rods).toBe(true);
      expect(aus.rigs.find((r) => r.id === 'silas')?.steam).toBe(true);
      for (const s of [fair, aus, spaet, ohne]) expect(s.events.seen).toContain('silas_abrechnung');
      expect(ohne.events.seen).toContain('silas_saloon');
      expect(fair.events.seen).not.toContain('silas_saloon');
    }
  });

  it('Moss: Freund, Feind (Betrug oder Druck) und Farm verloren – die Moss-Farm geht je nach Weg an Jacob', () => {
    for (const seed of SEEDS) {
      const fair = partie(seed, { moss_schulden: 'leihen' });
      const spaetFair = partie(seed, { moss_versteigerung: 'doch_helfen' });
      const betrug = partie(seed, { moss_schulden: 'papier' });
      const druck = partie(seed, { moss_versteigerung: 'ersteigern' });
      const ohne = partie(seed, {});
      expect([fair, spaetFair, betrug, druck, ohne].map((s) => ausgang(s, 'moss'))).toEqual(['freund', 'freund', 'feind', 'feind', 'verloren']);
      expect(spaetFair.events.seen).toContain('moss_versteigerung');
      expect(ohne.events.seen).toContain('moss_versteigerung');
      expect(fair.events.seen).not.toContain('moss_versteigerung');
    }
  });

  it('die Bögen ändern die Welt nicht: Karte und Markt sind dieselben wie ohne Ereignisse', () => {
    const mit = newGame('welt', balance, catalog);
    const ohne = newGame('welt', balance);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.parcels).toEqual(ohne.parcels);
  });
});
