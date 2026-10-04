import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContentLoadError, formatContentError, loadEventCatalog, parseEventFile, parseEventFiles } from './eventContent';
import { resolveEvent } from './events';
import { newGame } from './game';
import { loadBalance } from './testBalance';
import { EVENTS_DIR, loadEvents, readEventFiles } from './testEvents';

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
  it('sind fehlerfrei und enthalten die Probe-Ereignisse, festen Termine und Alltagsereignisse 1–67 für Kapitel 1 (2.2–2.10b)', () => {
    // 4.10 Andockpunkt: Ereignisse späterer Kapitel (k2_…) prüfen ihre eigenen Tests.
    const ids = loadEvents()
      .map((e) => e.id)
      .filter((id) => !id.startsWith('k2_'));
    expect(ids).toEqual(['thomas_geburt', 'ruth_buecher', 'silas_schnaps', 'silas_abrechnung', 'silas_nachtschicht', 'silas_abschied', 'silas_saloon', 'moss_schulden', 'moss_wagenweg', 'moss_dank', 'moss_versteigerung', 'moss_spekulant', 'moss_daniel_dank', 'moss_daniel_zorn', 'nora_brand', 'vale_umschlag', 'ruth_sorge', 'arzt_besuch', 'panne_meissel', 'panne_kessel', 'panne_gestaenge', 'trupp_lohn', 'trupp_schlaegerei', 'trupp_unfall', 'quelle_salzwasser', 'quelle_gas', 'brand_nachbar', 'rutengaenger', 'fuhre_aufschlag', 'fuhre_schlamm', 'faesser_angebot', 'tank_leck', 'pension_miete', 'saloon_serviette', 'spekulant_angebot', 'bezirk_steuer', 'geruecht_fund', 'geruecht_tanks', 'geruecht_tarif', 'prediger', 'sheriff_schutz', 'nora_interview', 'poker', 'kumpel', 'fieber', 'thomas_nacht', 'thomas_wort', 'ruth_geburtstag', 'bank_kredit', 'bank_tilgung', 'wucher_kredit', 'wucher_faellig', 'wechsel_angebot', 'wechsel_geplatzt', 'crane_vorkauf', 'crane_pruefer', 'bullard_ausbruch', 'bullard_seil', 'bullard_rache_folge', 'thorne_waggons', 'tilly_tank', 'pickett_pleite', 'trupp_sonntag', 'streik', 'kerrigan_husten', 'kerrigan_zusammenbruch', 'eli_zurueck', 'eli_mutter', 'crabb_lager', 'mateo_papiere', 'blitz_tank', 'sturm_golf', 'torpedo', 'kind_grube', 'diebe_tank', 'diebe_gefasst', 'ruth_anteil', 'ruth_schwester', 'haus_kaufen', 'thomas_krupp', 'thomas_taufe', 'courier_anzeige', 'nora_artikel', 'wahl_spende', 'liga_petition', 'richter_schreiber', 'wahl_stimmen', 'fuhrleute_streik', 'fuhrleute_bestochen', 'wegerecht_moss', 'wegerecht_moss_freund', 'wegerecht_moss_versoehnt', 'wegerecht_moss_feind', 'wegerecht_bahndamm', 'dok_pike_urkunde', 'dok_pike_echt_folge', 'dok_pike_falsch_folge', 'dok_hale_gutachten', 'dok_hale_echt_folge', 'dok_hale_falsch_folge', 'post_seil', 'post_oelkauf', 'post_mietstall', 'post_witwe', 'post_kurier', 'post_geologe', 'post_mutter', 'post_drohung', 'bullard_saloon', 'bullard_verrat', 'bullard_kredit', 'bullard_rueckzahlung', 'bullard_treue', 'thorne_frachtvertrag', 'crane_abschlag', 'crane_uebernahme', 'termin_ruth', 'termin_familie', 'termin_sonntag', 'termin_lohnbohren', 'termin_rundgang', 'termin_port_ellis']);
  });

  it('jedes Probe-Ereignis hat 1–4 Wahlen (GDD §3: 2–4 Antworten) und eine Standard-Wahl ohne Sperre', () => {
    for (const event of loadEvents()) {
      expect(event.choices.length).toBeGreaterThanOrEqual(1);
      expect(event.choices.length).toBeLessThanOrEqual(4);
      const standard = event.choices.find((c) => c.default) ?? event.choices[0];
      expect(standard.requires).toEqual({});
      expect(standard.requiresFound).toBeFalsy();
    }
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
      'src/sim/__fixtures__/events/kaputt.yaml:14: Ereignis „kaputtes_ereignis“, Wahl „weiter“: unbekannter Eintrag „cassh“ in „effects“ (erlaubt: cash, oilStock, railTariff, strength, ruth, thomas, teams, teamsIdle, price, production, leaseCost).',
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
    expect(meldungen).toContain('4: Ereignis „brief“: unbekanntes Feld „chanse“ (erlaubt: id, title, text, conditions, marked, notMarked, delay, chance, once, routine, appointments, choices, mail, deadline, document, certain, rival, cooldown, group, draft, ranch, visitor, tableau).');
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

  it('Auftritt (0.2.15+10): visitor und tableau werden gelesen, aber nicht bei Briefen, Terminen oder beidem zugleich', () => {
    const besuch = parseEventFile('a.yaml', GUT.replace('  chance: 0.5', '  chance: 0.5\n  visitor: silas'));
    expect(besuch.errors).toEqual([]);
    expect(besuch.events[0]).toMatchObject({ id: 'brief', visitor: 'silas' });
    expect(besuch.events[0].tableau).toBeUndefined();
    const szene = parseEventFile('a.yaml', GUT.replace('  chance: 0.5', '  chance: 0.5\n  tableau: true'));
    expect(szene.events[0]).toMatchObject({ tableau: true });
    const meldungen = (zusatz: string) => parseEventFile('a.yaml', GUT.replace('  chance: 0.5', `  chance: 0.5\n${zusatz}`)).errors.map((e) => e.message);
    expect(meldungen('  visitor: Silas Crabb')).toContain('Ereignis „brief“: „visitor“ muss die id einer Figur aus content/figures.yaml sein (z. B. silas).');
    expect(meldungen('  tableau: ja')).toContain('Ereignis „brief“: „tableau“ muss true oder false sein.');
    expect(meldungen('  mail: info\n  visitor: silas')).toContain('Ereignis „brief“: Briefe (mail) und feste Termine (routine) haben keinen Auftritt (visitor, tableau).');
    expect(meldungen('  routine: true\n  tableau: true')).toContain('Ereignis „brief“: Briefe (mail) und feste Termine (routine) haben keinen Auftritt (visitor, tableau).');
    expect(meldungen('  visitor: silas\n  tableau: true')).toContain('Ereignis „brief“: Entweder „visitor“ oder „tableau“ – nicht beides.');
  });

  it('eine leere Datei ist kein Fehler', () => {
    expect(parseEventFile('leer.yaml', '# nur ein Kommentar\n')).toEqual({ events: [], errors: [] });
  });
});

describe('Nachwirkung im YAML (2.2)', () => {
  const MIT_MARKE = `- id: anlass
  title: { de: "A", en: "" }
  text: { de: "A", en: "" }
  chance: 1
  choices:
    - id: ja
      label: { de: "Ja", en: "" }
      result: { de: "Ja", en: "" }
      marks: [gemerkt]
- id: folge
  title: { de: "F", en: "" }
  text: { de: "F", en: "" }
  marked: [gemerkt]
  notMarked: [nie]
  delay: 3
  chance: 1
  choices:
    - id: ok
      label: { de: "Ok", en: "" }
      result: { de: "Ok", en: "" }
`;

  it('liest marks, marked, notMarked und delay; delay ist ohne Angabe 1', () => {
    const { events, errors } = parseEventFiles([{ file: 'a.yaml', text: MIT_MARKE.replace('notMarked: [nie]', 'notMarked: [gemerkt]') }]);
    expect(errors).toEqual([]);
    expect(events[0]).toMatchObject({ marked: [], notMarked: [], delay: 1 });
    expect(events[0].choices[0].marks).toEqual(['gemerkt']);
    expect(events[1]).toMatchObject({ marked: ['gemerkt'], notMarked: ['gemerkt'], delay: 3 });
  });

  it('ein Merkzeichen, das keine Wahl setzt, ist ein Fehler mit Zeile', () => {
    const { errors } = parseEventFiles([{ file: 'a.yaml', text: MIT_MARKE }]);
    expect(errors.map(formatContentError)).toEqual([
      'a.yaml:14: Ereignis „folge“: Das Merkzeichen „nie“ setzt keine Wahl (marks: [nie]) – Tippfehler?',
    ]);
  });

  it('kaputte Merkzeichen und delay werden gemeldet', () => {
    const kaputt = MIT_MARKE.replace('notMarked: [nie]', 'notMarked: [Gross Schreibung]').replace('delay: 3', 'delay: -1').replace('marks: [gemerkt]', 'marks: gemerkt');
    const meldungen = parseEventFile('a.yaml', kaputt).errors.map((e) => e.message);
    expect(meldungen).toEqual([
      'Ereignis „anlass“, Wahl „ja“: „marks“ muss eine Liste sein, z. B. marks: [moss_betrogen].',
      'Ereignis „folge“: Merkzeichen in „notMarked“ dürfen nur Kleinbuchstaben, Ziffern und _ enthalten.',
      'Ereignis „folge“: „delay“ muss eine ganze Zahl ab 0 sein (Runden nach dem Merkzeichen).',
    ]);
  });
});

describe('Vorlage (2.2)', () => {
  it('das kommentierte Beispiel docs/ereignis-beispiel.yaml ist gültig', () => {
    const text = readFileSync(new URL('../../docs/ereignis-beispiel.yaml', import.meta.url), 'utf8');
    const { events, errors } = parseEventFiles([{ file: 'docs/ereignis-beispiel.yaml', text }]);
    expect(errors).toEqual([]);
    expect(events.map((e) => e.id)).toEqual(['beispiel_salzwasser', 'beispiel_klage']);
  });
});

describe('Fertig-Kriterium 2.2: ein neues Ereignis kommt nur durch eine YAML-Datei ins Spiel', () => {
  const balance = loadBalance();
  const NEU = `- id: neu_aus_datei
  title: { de: "Ein Telegramm", en: "A Telegram" }
  text: { de: "Ruths Mutter kommt zu Besuch.", en: "" }
  chance: 1
  choices:
    - id: abholen
      label: { de: "Am Bahnhof abholen (20 $)", en: "" }
      result: { de: "Die Schwiegermutter ist da.", en: "" }
      effects: { cash: -20 }
      marks: [schwiegermutter_da]
      default: true
`;

  it('Ordner kopieren, Datei dazulegen: das Ereignis wird geladen, gewürfelt und wirkt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crude-events-'));
    try {
      for (const { file, text } of readEventFiles(EVENTS_DIR)) writeFileSync(join(dir, file.split('/').at(-1)!), text);
      const vorher = loadEventCatalog(readEventFiles(dir));
      expect(vorher.map((e) => e.id)).not.toContain('neu_aus_datei');

      writeFileSync(join(dir, 'zz-neu.yaml'), NEU);
      const katalog = loadEventCatalog(readEventFiles(dir));
      expect(katalog.map((e) => e.id)).toEqual([...vorher.map((e) => e.id), 'neu_aus_datei']);

      // Nur das neue Ereignis kann in Runde 1 kommen (alle Probe-Ereignisse brauchen Runde 2+);
      // Briefe (2.4) kommen getrennt mit der Post.
      const state = newGame('neu', balance, katalog);
      expect(state.events.pending.filter((id) => !katalog.find((e) => e.id === id)?.mail)).toEqual(['neu_aus_datei']);
      const r = resolveEvent(state, balance, katalog, 'neu_aus_datei', 'abholen');
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.cash).toBe(state.cash - 20);
      expect(r.state.events.marks).toEqual({ schwiegermutter_da: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
