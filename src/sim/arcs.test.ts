// 2.9 Story-Bögen Silas und Moss: Ausgänge aus Merkzeichen, die Inhalte in
// content/arcs.yaml und das Fertig-Kriterium – beide Bögen haben je nach
// Entscheidung mindestens zwei verschiedene Ausgänge, über ganze Partien gespielt.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARC_IDS, arcOutcome, arcSummaries, checkArcMarks, parseArcContent, type ArcContent, type ArcId } from './arcs';
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
    expect(fehlt.errors.map((e) => e.message)).toEqual(['silas.outcomes: Ein Bogen braucht mindestens zwei Ausgänge.', 'Bogen „moss“ fehlt.']);
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

  it('Silas: fair, ausgekauft, versöhnt, Kronzeuge – und jede Szene des Wegs kommt', () => {
    for (const seed of SEEDS) {
      const fair = partie(seed, { silas_schnaps: 'decken', silas_abrechnung: 'fair', silas_nachtschicht: 'einladen' });
      const aus = partie(seed, { silas_abrechnung: 'auskaufen', silas_abschied: 'hingehen' });
      const spaet = partie(seed, { silas_abrechnung: 'betruegen', silas_saloon: 'nachzahlen' });
      const ohne = partie(seed, {});
      expect([fair, aus, spaet, ohne].map((s) => ausgang(s, 'silas'))).toEqual(['freund', 'ausgekauft', 'versoehnt', 'kronzeuge']);
      expect(fair.events.marks.silas_freund).toBeDefined();
      expect(aus.events.marks.silas_abschied_gut).toBeDefined();
      for (const s of [fair, aus, spaet, ohne]) expect(s.events.seen).toContain('silas_abrechnung');
      expect(ohne.events.seen).toContain('silas_saloon');
      expect(fair.events.seen).not.toContain('silas_saloon');
    }
  });

  it('Moss: Freund, Feind (Betrug oder Druck) und Farm verloren – Daniel kommt je nach Weg', () => {
    for (const seed of SEEDS) {
      const fair = partie(seed, { moss_schulden: 'leihen', moss_daniel_dank: 'fahrkarte' });
      const spaetFair = partie(seed, { moss_versteigerung: 'doch_helfen' });
      const betrug = partie(seed, { moss_schulden: 'papier', moss_wagenweg: 'wegegeld' });
      const druck = partie(seed, { moss_versteigerung: 'ersteigern', moss_spekulant: 'verkaufen' });
      const ohne = partie(seed, {});
      expect([fair, spaetFair, betrug, druck, ohne].map((s) => ausgang(s, 'moss'))).toEqual(['freund', 'freund', 'feind', 'feind', 'verloren']);
      expect(fair.events.seen).toEqual(expect.arrayContaining(['moss_dank', 'moss_daniel_dank']));
      expect(fair.events.marks.daniel_gefoerdert).toBeDefined();
      expect(spaetFair.events.seen).toEqual(expect.arrayContaining(['moss_versteigerung', 'moss_dank', 'moss_daniel_dank']));
      expect(betrug.events.seen).toEqual(expect.arrayContaining(['moss_wagenweg', 'moss_daniel_zorn']));
      expect(druck.events.seen).toEqual(expect.arrayContaining(['moss_spekulant', 'moss_daniel_zorn']));
      expect(ohne.events.seen).not.toContain('moss_daniel_zorn');
      expect(ohne.events.seen).not.toContain('moss_daniel_dank');
    }
  });

  it('die Bögen ändern die Welt nicht: Karte und Markt sind dieselben wie ohne Ereignisse', () => {
    const mit = newGame('welt', balance, catalog);
    const ohne = newGame('welt', balance);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.parcels).toEqual(ohne.parcels);
  });
});
