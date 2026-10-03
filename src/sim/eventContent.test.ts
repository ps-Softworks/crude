import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ContentLoadError, formatContentError, loadEventCatalog, parseEventFile, parseEventFiles } from './eventContent';
import { loadEvents, readEventFiles } from './testEvents';

const FIXTURE = new URL('./__fixtures__/events/', import.meta.url);

/** Ein gültiges Ereignis als YAML – Grundlage für die Fehlerfälle. */
const GUT = `- id: brief
  title: { de: "Ein Brief", en: "" }
  text: { de: "Post aus dem Osten.", en: "A letter." }
  chance: 0.5
  choices:
    - id: lesen
      label: { de: "Lesen", en: "" }
      result: { de: "Ruth schreibt.", en: "" }
`;

describe('echte Inhalte in content/events/', () => {
  it('sind fehlerfrei und enthalten die drei Testereignisse', () => {
    const ids = loadEvents().map((e) => e.id);
    expect(ids).toEqual(['pension_miete', 'serviettenhandel', 'thorne_vertrag']);
  });

  it('jeder Text hat de und den Schlüssel en', () => {
    for (const event of loadEvents()) {
      for (const text of [event.title, event.text, ...event.choices.flatMap((c) => [c.label, c.result])]) {
        expect(text.de.trim()).not.toBe('');
        expect(typeof text.en).toBe('string');
      }
    }
  });
});

describe('Prüfung mit Datei und Zeilennummer', () => {
  it('das kaputte Test-Fixture liefert verständliche Fehler mit Zeile', () => {
    const files = readEventFiles(FIXTURE.pathname);
    const { events, errors } = parseEventFiles(files);
    expect(events).toEqual([]);
    const zeilen = errors.map(formatContentError);
    expect(zeilen).toEqual([
      'src/sim/__fixtures__/events/kaputt.yaml:5: Ereignis „kaputtes_ereignis“: „title.en“ fehlt – darf leer sein (en: ""), muss aber da sein.',
      'src/sim/__fixtures__/events/kaputt.yaml:9: Ereignis „kaputtes_ereignis“: „chance“ fehlt oder liegt nicht zwischen 0 und 1.',
      'src/sim/__fixtures__/events/kaputt.yaml:14: Ereignis „kaputtes_ereignis“, Wahl „weiter“: unbekannter Eintrag „cassh“ in „effects“ (erlaubt: cash, oilStock, railTariff).',
    ]);
  });

  it('loadEventCatalog wirft bei kaputten Dateien mit allen Meldungen', () => {
    const text = readFileSync(new URL('kaputt.yaml', FIXTURE), 'utf8');
    expect(() => loadEventCatalog([{ file: 'kaputt.yaml', text }])).toThrow(ContentLoadError);
    expect(() => loadEventCatalog([{ file: 'kaputt.yaml', text }])).toThrow(/kaputt\.yaml:14: .*cassh/);
  });

  it('ein gültiges Ereignis wird gelesen, once ist ohne Angabe true', () => {
    const { events, errors } = parseEventFile('a.yaml', GUT);
    expect(errors).toEqual([]);
    expect(events[0]).toMatchObject({ id: 'brief', chance: 0.5, once: true, conditions: {} });
    expect(events[0].choices[0]).toMatchObject({ id: 'lesen', requires: {}, effects: {}, default: false });
  });

  it('YAML-Syntaxfehler kommen mit Zeile', () => {
    const { errors } = parseEventFile('a.yaml', `${GUT}  chance: [0.5\n`);
    expect(errors[0].line).toBeGreaterThanOrEqual(9);
    expect(errors[0].message).toMatch(/^YAML kaputt/);
  });

  it('die Datei muss eine Liste sein', () => {
    const { errors } = parseEventFile('a.yaml', 'id: brief\n');
    expect(errors).toEqual([{ file: 'a.yaml', line: 1, message: expect.stringMatching(/Liste von Ereignissen/) }]);
  });

  it('unbekannte Felder, fehlendes de und fremde Sprachen werden gemeldet', () => {
    const text = GUT.replace('  chance: 0.5', '  chanse: 0.5\n  chance: 0.5').replace('de: "Ein Brief", en: ""', 'en: "", fr: "Une lettre"');
    const meldungen = parseEventFile('a.yaml', text).errors.map((e) => `${e.line}: ${e.message}`);
    expect(meldungen).toContain('4: Ereignis „brief“: unbekanntes Feld „chanse“ (erlaubt: id, title, text, conditions, chance, once, choices).');
    expect(meldungen.some((m) => m.startsWith('2: ') && m.includes('unbekannte Sprache „fr“'))).toBe(true);
    expect(meldungen.some((m) => m.startsWith('2: ') && m.includes('„title.de“ fehlt'))).toBe(true);
  });

  it('Bedingungen kennen nur bekannte Namen mit Zahlen', () => {
    const text = GUT.replace('  chance: 0.5', '  conditions: { minRound: zwei, minGold: 3 }\n  chance: 0.5');
    const meldungen = parseEventFile('a.yaml', text).errors.map((e) => e.message);
    expect(meldungen).toContain('Ereignis „brief“: „conditions.minRound“ muss eine Zahl sein.');
    expect(meldungen.some((m) => m.includes('unbekannter Eintrag „minGold“'))).toBe(true);
  });

  it('ohne Wahl, mit doppelter Wahl oder zwei Standard-Wahlen ist ein Ereignis kaputt', () => {
    const ohne = GUT.slice(0, GUT.indexOf('  choices:'));
    expect(parseEventFile('a.yaml', ohne).errors[0].message).toMatch(/mindestens eine Wahl/);
    const wahl = GUT.slice(GUT.indexOf('    - id: lesen'));
    const doppelt = GUT + wahl.replace('- id: lesen', '- id: lesen');
    expect(parseEventFile('a.yaml', doppelt).errors.map((e) => e.message)).toContain('Ereignis „brief“: Die Wahl „lesen“ gibt es doppelt.');
    const zweiDefaults =
      GUT.replace('      result: { de: "Ruth schreibt.", en: "" }', '      result: { de: "Ruth schreibt.", en: "" }\n      default: true') +
      wahl.replace('- id: lesen', '- id: weg').replace('result: { de: "Ruth schreibt.", en: "" }', 'result: { de: "x", en: "" }\n      default: true');
    expect(parseEventFile('a.yaml', zweiDefaults).errors.map((e) => e.message)).toContain(
      'Ereignis „brief“: Höchstens eine Wahl darf „default: true“ haben.',
    );
  });

  it('eine ID gibt es nur einmal – auch über Dateien hinweg', () => {
    const { errors } = parseEventFiles([
      { file: 'a.yaml', text: GUT },
      { file: 'b.yaml', text: `# Kommentar\n${GUT}` },
    ]);
    expect(errors).toEqual([{ file: 'b.yaml', line: 2, message: 'Ereignis „brief“ gibt es schon in a.yaml.' }]);
    expect(parseEventFile('a.yaml', GUT + GUT).errors[0]).toMatchObject({ line: 9, message: 'Ereignis „brief“ gibt es in dieser Datei doppelt.' });
  });

  it('eine leere Datei ist kein Fehler', () => {
    expect(parseEventFile('leer.yaml', '# nur ein Kommentar\n')).toEqual({ events: [], errors: [] });
  });
});
