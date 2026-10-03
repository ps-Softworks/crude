// Einfache Dokumentenprüfung (2.5, GDD §3): gefälschte Pachturkunden und
// geschönte Gutachten erkennen – und eine übersehene Fälschung kostet später Geld.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { parseBalance } from './balance';
import { checksLeft, deskDocument, forgeryFound, inspectField, isForged, rollDocument, type DocumentDef } from './documents';
import { parseEventFile, parseEventFiles } from './eventContent';
import { autoResolve, deskEvents, drawMail, resolveEvent, type EventChoice, type EventDef } from './events';
import { endRound, newGame, type GameState } from './game';
import { Rng, seedFromString } from './rng';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

const URKUNDE: DocumentDef = {
  title: t('Pachturkunde'),
  reference: t('dem Grundbuchauszug'),
  fields: [
    { id: 'parzelle', label: t('Parzelle'), value: t('Nr. 14'), reference: t('Nr. 14'), forged: t('Nr. 41') },
    { id: 'eigentuemer', label: t('Eigentümer'), value: t('Pike'), reference: t('Pike') },
    { id: 'datum', label: t('Datum'), value: t('2. Februar'), reference: t('2. Februar') },
  ],
};

function urkunde(extra: Partial<EventDef> = {}): EventDef {
  return {
    id: 'urkunde',
    title: t('Pike verkauft'),
    text: t('Text'),
    conditions: {},
    marked: [],
    notMarked: [],
    delay: 1,
    chance: 1,
    once: true,
    routine: false,
    appointments: 1,
    mail: 'offer',
    document: URKUNDE,
    choices: [
      wahl('kaufen', { effects: { cash: -400 }, marks: ['gekauft'], marksIfForged: ['falsch'] }),
      wahl('anzeigen', { requiresFound: true, effects: { strength: 5 } }),
      wahl('ablehnen', { default: true, appointments: 0 }),
    ],
    ...extra,
  };
}

function mitDoks(docs: Partial<Balance['events']['documents']>): Balance {
  return { ...balance, events: { ...balance.events, documents: { ...balance.events.documents, ...docs } } };
}

/** Eine Partie, in der die Urkunde im Posteingang liegt – echt oder mit gefälschter Parzelle. */
function mitUrkunde(forgery: string | null, seed = 'dok'): GameState {
  const s = newGame(seed, balance);
  return {
    ...s,
    events: { ...s.events, pending: ['urkunde'], seen: ['urkunde'], due: { urkunde: s.round + 1 }, docs: { urkunde: { forgery, checked: [] } } },
  };
}

describe('balance.yaml: Dokumentenprüfung', () => {
  it('liest Fälschungschance und Lupe', () => {
    expect(balance.events.documents.forgeryChance).toBeGreaterThan(0);
    expect(balance.events.documents.forgeryChance).toBeLessThan(1);
    expect(balance.events.documents.maxChecks).toBeGreaterThanOrEqual(1);
  });

  it('meldet einen fehlenden Block und falsche Werte', () => {
    const raw = rawBalance() as any;
    const ohne = { ...raw, events: { ...raw.events, documents: undefined } };
    expect(() => parseBalance(ohne)).toThrow(/events.documents/);
    const falsch = { ...raw, events: { ...raw.events, documents: { forgeryChance: 2, maxChecks: 2 } } };
    expect(() => parseBalance(falsch)).toThrow(/forgeryChance/);
  });
});

describe('Fälschung würfeln', () => {
  it('ohne Dokument: nichts, und es wird kein Zufall gezogen', () => {
    const rng = new Rng(seedFromString('x'));
    const vorher = rng.state;
    expect(rollDocument({}, balance, rng)).toBeNull();
    expect(rng.state).toBe(vorher);
  });

  it('Chance 0 ist immer echt, Chance 1 fälscht ein Feld mit „forged“', () => {
    const rng = new Rng(seedFromString('x'));
    expect(rollDocument({ document: URKUNDE }, mitDoks({ forgeryChance: 0 }), rng)).toEqual({ forgery: null, checked: [] });
    expect(rollDocument({ document: URKUNDE }, mitDoks({ forgeryChance: 1 }), rng)).toEqual({ forgery: 'parzelle', checked: [] });
  });

  it('die Chance am Dokument geht vor balance.yaml', () => {
    const rng = new Rng(seedFromString('x'));
    expect(rollDocument({ document: { ...URKUNDE, forgeryChance: 0 } }, mitDoks({ forgeryChance: 1 }), rng)?.forgery).toBeNull();
  });

  it('ohne fälschbares Feld ist ein Dokument immer echt', () => {
    const echt = { ...URKUNDE, fields: URKUNDE.fields.map(({ forged: _f, ...f }) => f) };
    expect(rollDocument({ document: echt }, mitDoks({ forgeryChance: 1 }), new Rng(seedFromString('x')))?.forgery).toBeNull();
  });

  it('mit der Standard-Chance ist ungefähr jedes zweite Dokument gefälscht (über 400 Würfe)', () => {
    const rng = new Rng(seedFromString('viele'));
    let falsch = 0;
    for (let i = 0; i < 400; i++) if (rollDocument({ document: URKUNDE }, balance, rng)?.forgery) falsch++;
    const erwartet = 400 * balance.events.documents.forgeryChance;
    expect(Math.abs(falsch - erwartet)).toBeLessThan(60);
  });

  it('ein Brief mit Dokument bekommt beim Eintreffen seinen Zustand', () => {
    const s = newGame('post', balance);
    const nach = drawMail(s, mitDoks({ forgeryChance: 1 }), [urkunde()]);
    expect(nach.events.pending).toContain('urkunde');
    expect(nach.events.docs.urkunde).toEqual({ forgery: 'parzelle', checked: [] });
  });
});

describe('Lupe', () => {
  it('findet die Fälschung im richtigen Feld und schreibt es ins Protokoll', () => {
    const s = mitUrkunde('parzelle');
    const r = inspectField(s, balance, [urkunde()], 'urkunde', 'parzelle');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(forgeryFound(r.state, 'urkunde')).toBe(true);
    expect(r.state.log.at(-1)).toMatch(/Fälschung entdeckt – Pachturkunde: Parzelle/);
  });

  it('ein richtiges Feld bleibt ohne Befund und ohne Protokoll', () => {
    const s = mitUrkunde('parzelle');
    const r = inspectField(s, balance, [urkunde()], 'urkunde', 'datum');
    expect(r.ok && forgeryFound(r.state, 'urkunde')).toBe(false);
    expect(r.ok && r.state.log.length).toBe(s.log.length);
  });

  it('bei einem echten Dokument findet die Lupe nichts', () => {
    let s = mitUrkunde(null);
    const r = inspectField(s, balance, [urkunde()], 'urkunde', 'parzelle');
    expect(r.ok).toBe(true);
    if (r.ok) s = r.state;
    expect(forgeryFound(s, 'urkunde')).toBe(false);
    expect(isForged(s, 'urkunde')).toBe(false);
  });

  it('geht nur maxChecks-mal je Dokument, jedes Feld einmal', () => {
    const b = mitDoks({ maxChecks: 1 });
    const s = mitUrkunde('parzelle');
    expect(checksLeft(s, b, 'urkunde')).toBe(1);
    const r = inspectField(s, b, [urkunde()], 'urkunde', 'datum');
    if (!r.ok) throw new Error(r.reason);
    expect(checksLeft(r.state, b, 'urkunde')).toBe(0);
    expect(inspectField(r.state, b, [urkunde()], 'urkunde', 'parzelle')).toMatchObject({ ok: false, reason: expect.stringMatching(/Lupe/) });
    expect(inspectField(r.state, balance, [urkunde()], 'urkunde', 'datum')).toMatchObject({ ok: false, reason: expect.stringMatching(/schon geprüft/) });
  });

  it('kein Dokument, falsches Feld oder nicht auf dem Schreibtisch: abgelehnt', () => {
    const s = mitUrkunde('parzelle');
    expect(inspectField(s, balance, [urkunde()], 'urkunde', 'gibtsnicht').ok).toBe(false);
    expect(inspectField(s, balance, [urkunde({ document: undefined })], 'urkunde', 'parzelle').ok).toBe(false);
    const weg = { ...s, events: { ...s.events, pending: [] } };
    expect(inspectField(weg, balance, [urkunde()], 'urkunde', 'parzelle').ok).toBe(false);
  });

  it('kostet keinen Termin', () => {
    const s = mitUrkunde('parzelle');
    const r = inspectField(s, balance, [urkunde()], 'urkunde', 'parzelle');
    expect(r.ok && r.state.agenda).toEqual(s.agenda);
  });
});

describe('Antworten nach der Prüfung', () => {
  it('„requiresFound“ ist gesperrt, bis die Lupe die Fälschung findet', () => {
    const s = mitUrkunde('parzelle');
    expect(resolveEvent(s, balance, [urkunde()], 'urkunde', 'anzeigen')).toMatchObject({ ok: false, reason: expect.stringMatching(/Lupe/) });
    const anzeige = deskEvents(s, balance, [urkunde()])[0].choices.find((c) => c.id === 'anzeigen');
    expect(anzeige?.ok).toBe(false);
    const gefunden = inspectField(s, balance, [urkunde()], 'urkunde', 'parzelle');
    if (!gefunden.ok) throw new Error(gefunden.reason);
    expect(resolveEvent(gefunden.state, balance, [urkunde()], 'urkunde', 'anzeigen').ok).toBe(true);
  });

  it('bei einem echten Dokument bleibt „requiresFound“ gesperrt', () => {
    const s = mitUrkunde(null);
    expect(resolveEvent(s, balance, [urkunde()], 'urkunde', 'anzeigen').ok).toBe(false);
  });

  it('wer eine Fälschung kauft, setzt die verdeckten Merkzeichen; bei einer echten nicht', () => {
    const falsch = resolveEvent(mitUrkunde('parzelle'), balance, [urkunde()], 'urkunde', 'kaufen');
    const echt = resolveEvent(mitUrkunde(null), balance, [urkunde()], 'urkunde', 'kaufen');
    if (!falsch.ok || !echt.ok) throw new Error('kaufen geht nicht');
    expect(Object.keys(falsch.state.events.marks).sort()).toEqual(['falsch', 'gekauft']);
    expect(Object.keys(echt.state.events.marks)).toEqual(['gekauft']);
    expect(falsch.state.events.docs).toEqual({});
    // Das Protokoll verrät nichts.
    expect(falsch.state.log.at(-1)).not.toMatch(/falsch|Fälschung/);
  });

  it('ohne Antwort gilt die Standard-Wahl, nie eine gesperrte „requiresFound“-Wahl, und das Dokument ist weg', () => {
    const ev = urkunde({ choices: [wahl('anzeigen', { requiresFound: true, default: true }), wahl('ablehnen')] });
    const s = { ...mitUrkunde('parzelle'), events: { ...mitUrkunde('parzelle').events, due: {} } };
    const nach = autoResolve(s, [ev]);
    expect(nach.events.pending).toEqual([]);
    expect(nach.events.docs).toEqual({});
    expect(nach.log.at(-1)).toMatch(/Ergebnis ablehnen/);
  });
});

describe('Schreibtisch zeigt das Dokument', () => {
  it('mit dem gefälschten Wert, dem Vergleichswert und dem Befund der Lupe', () => {
    let s = mitUrkunde('parzelle');
    const leer = deskDocument(s, balance, urkunde());
    expect(leer?.fields[0]).toEqual({ id: 'parzelle', label: 'Parzelle', value: 'Nr. 41', reference: 'Nr. 14', verdict: 'unchecked' });
    for (const f of ['parzelle', 'datum']) {
      const r = inspectField(s, balance, [urkunde()], 'urkunde', f);
      if (r.ok) s = r.state;
    }
    const doc = deskEvents(s, balance, [urkunde()])[0].document;
    expect(doc?.fields.map((f) => f.verdict)).toEqual(['forged', 'unchecked', 'ok']);
    expect(doc?.checksLeft).toBe(balance.events.documents.maxChecks - 2);
  });

  it('ein echtes Dokument zeigt überall den echten Wert', () => {
    const doc = deskDocument(mitUrkunde(null), balance, urkunde());
    expect(doc?.fields.map((f) => f.value)).toEqual(['Nr. 14', 'Pike', '2. Februar']);
  });
});

describe('Inhalte: Dokumente im YAML', () => {
  const kopf = `- id: brief
  mail: offer
  title: { de: "Brief", en: "" }
  text: { de: "Text", en: "" }
  chance: 0.5
`;

  it('liest document, requiresFound und marksIfForged', () => {
    const text = `${kopf}  document:
    title: { de: Urkunde, en: Deed }
    reference: { de: Grundbuch, en: Register }
    forgeryChance: 0.3
    fields:
      - id: parzelle
        label: { de: Parzelle, en: Parcel }
        value: { de: "14", en: "14" }
        reference: { de: "14", en: "14" }
        forged: { de: "41", en: "41" }
  choices:
    - id: kaufen
      label: { de: "Kaufen", en: "" }
      result: { de: "Gekauft.", en: "" }
      marksIfForged: [betrogen]
    - id: anzeigen
      label: { de: "Anzeigen", en: "" }
      result: { de: "Angezeigt.", en: "" }
      requiresFound: true
`;
    const { events, errors } = parseEventFile('a.yaml', text);
    expect(errors).toEqual([]);
    expect(events[0].document?.forgeryChance).toBe(0.3);
    expect(events[0].document?.fields[0].forged).toEqual({ de: '41', en: '41' });
    expect(events[0].choices[0].marksIfForged).toEqual(['betrogen']);
    expect(events[0].choices[1].requiresFound).toBe(true);
  });

  it('meldet Fehler im Dokument mit Zeile', () => {
    const text = `${kopf}  document:
    title: { de: Urkunde, en: Deed }
    reference: { de: Grundbuch, en: Register }
    forgeryChance: 3
    fields:
      - id: parzelle
        label: { de: Parzelle, en: Parcel }
        value: { de: "14", en: "14" }
        stempel: ja
      - id: parzelle
        label: { de: Parzelle, en: Parcel }
        value: { de: "14", en: "14" }
  choices:
    - id: lesen
      label: { de: "Lesen", en: "" }
      result: { de: "Gelesen.", en: "" }
`;
    const meldungen = parseEventFile('a.yaml', text).errors.map((e) => `${e.line}: ${e.message}`);
    expect(meldungen.some((m) => m.startsWith('9: ') && m.includes('forgeryChance'))).toBe(true);
    expect(meldungen.some((m) => m.startsWith('14: ') && m.includes('unbekanntes Feld „stempel“'))).toBe(true);
    expect(meldungen.some((m) => m.includes('gibt es doppelt'))).toBe(true);
  });

  it('requiresFound ohne Dokument ist ein Fehler', () => {
    const text = `${kopf}  choices:
    - id: anzeigen
      label: { de: "Anzeigen", en: "" }
      result: { de: "Angezeigt.", en: "" }
      requiresFound: true
`;
    expect(parseEventFile('a.yaml', text).errors[0].message).toMatch(/nur bei einem Ereignis mit „document“/);
  });

  it('ein Merkzeichen aus marksIfForged zählt als gesetzt', () => {
    const text = `${kopf}  document:
    title: { de: Urkunde, en: "" }
    reference: { de: Grundbuch, en: "" }
    fields:
      - id: a
        label: { de: A, en: "" }
        value: { de: "1", en: "" }
        forged: { de: "2", en: "" }
  choices:
    - id: kaufen
      label: { de: "Kaufen", en: "" }
      result: { de: "Gekauft.", en: "" }
      marksIfForged: [betrogen]
- id: folge
  title: { de: "Folge", en: "" }
  text: { de: "Text", en: "" }
  marked: [betrogen]
  chance: 1
  choices:
    - id: zahlen
      label: { de: "Zahlen", en: "" }
      result: { de: "Bezahlt.", en: "" }
`;
    expect(parseEventFiles([{ file: 'a.yaml', text }]).errors).toEqual([]);
  });

  it('die echten Inhalte haben eine Pachturkunde und ein Gutachten, jeweils mit teurer Folge', () => {
    const alle = loadEvents();
    const mitDok = alle.filter((e) => e.document);
    expect(mitDok.map((e) => e.id)).toEqual(['dok_pike_urkunde', 'dok_hale_gutachten']);
    for (const e of mitDok) {
      expect(e.document!.fields.some((f) => f.forged)).toBe(true);
      expect(e.choices.some((c) => c.requiresFound)).toBe(true);
      const falsch = e.choices.flatMap((c) => c.marksIfForged ?? []);
      expect(falsch.length).toBeGreaterThan(0);
      // Jede Folge einer übersehenen Fälschung kostet in jeder Wahl Geld.
      const folgen = alle.filter((f) => f.marked.some((m) => falsch.includes(m)));
      expect(folgen.length).toBeGreaterThan(0);
      for (const f of folgen) for (const c of f.choices) expect(c.effects.cash ?? 0).toBeLessThan(0);
    }
  });
});

describe('Fertig, wenn: eine übersehene Fälschung später spürbar Geld kostet', () => {
  const inhalte = loadEvents().filter((e) => e.id.startsWith('dok_pike'));
  const pike = inhalte.find((e) => e.id === 'dok_pike_urkunde')!;

  /** Pikes Brief liegt im Posteingang; Jacob prüft nicht und kauft, oder lehnt ab. Danach 8 Runden. */
  function partie(forgery: string | null, wahlId: string): GameState {
    const s = newGame('faelschung', balance, inhalte);
    let state: GameState = {
      ...s,
      events: { ...s.events, pending: [pike.id], seen: [pike.id], due: { [pike.id]: s.round + 2 }, docs: { [pike.id]: { forgery, checked: [] } } },
    };
    const r = resolveEvent(state, balance, inhalte, pike.id, wahlId);
    if (!r.ok) throw new Error(r.reason);
    state = r.state;
    for (let i = 0; i < 8; i++) state = endRound(state, balance, inhalte);
    return state;
  }

  it('gefälschte Urkunde gekauft: das Gericht schreibt, und am Ende fehlen 400 $ plus Prozess', () => {
    const ohne = partie('parzelle', 'ablehnen');
    const falsch = partie('parzelle', 'kaufen');
    const echt = partie(null, 'kaufen');
    expect(falsch.log.some((l) => l.includes('Das Bezirksgericht schreibt'))).toBe(true);
    expect(echt.log.some((l) => l.includes('Das Bezirksgericht schreibt'))).toBe(false);
    // Ohne Antwort gilt der Prozess: 450 $ zusätzlich zu den 400 $ für die wertlose Urkunde.
    expect(ohne.cash - falsch.cash).toBe(850);
    // Die echte Urkunde bringt dagegen Gewinn.
    expect(echt.cash - ohne.cash).toBe(350);
  });
});

describe('Spielstand mit Dokumenten', () => {
  it('Format 5 und neuer sichern Dokumente und laden sie zurück', () => {
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(5);
    const s = mitUrkunde('parzelle');
    const geladen = deserializeGame(serializeGame(s, '0.2.5'));
    expect(geladen.ok && geladen.state.events.docs).toEqual({ urkunde: { forgery: 'parzelle', checked: [] } });
  });

  it('Spielstände aus Format 4 laden ohne Dokumente', () => {
    const s = newGame('alt', balance);
    const { docs: _docs, ...alt } = s.events;
    const geladen = deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.2.4', savedRound: 1, state: { ...s, events: alt } }));
    expect(geladen.ok && geladen.state.events.docs).toEqual({});
  });

  it('kaputte Dokumente werden abgelehnt', () => {
    const s = mitUrkunde('parzelle');
    const kaputt = { ...s, events: { ...s.events, docs: { urkunde: { forgery: 3, checked: [] } } } };
    expect(deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: 'x', savedRound: 1, state: kaputt })).ok).toBe(false);
  });
});
