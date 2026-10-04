// 0.2.15+10: Besucher und Szenen – die Besetzung in content/events passt zu
// content/figures.yaml, und Briefe oder feste Termine treten nie als Person auf.
import { describe, expect, it } from 'vitest';
import { loadEvents } from '../sim/testEvents';
import { figureCatalog } from './figureCatalog.node';
import { parseFigureCatalog } from './figures';
import { appearancesOf, resultText, visitorErrors, waitingText } from './visitors';

const events = loadEvents();

describe('Besucher am Schreibtisch', () => {
  it('jede Figur aus „visitor“ steht mit Namen in content/figures.yaml', () => {
    expect(visitorErrors(events, figureCatalog)).toEqual([]);
  });

  it('nur Ereignisse ohne Brief und ohne festen Termin haben einen Auftritt', () => {
    for (const e of events.filter((x) => x.visitor || x.tableau)) {
      expect(e.mail, e.id).toBeUndefined();
      expect(e.routine, e.id).toBe(false);
    }
  });

  it('besetzt die Story-Bögen und die vier großen Szenen', () => {
    const a = appearancesOf(events, figureCatalog);
    expect(a.silas_schnaps).toEqual({ kind: 'visitor', figure: 'silas', name: 'Silas' });
    expect(a.moss_schulden).toMatchObject({ kind: 'visitor', figure: 'moss', name: 'Ezekiel Moss' });
    expect(a.ruth_buecher).toMatchObject({ kind: 'visitor', figure: 'ruth' });
    for (const id of ['thomas_geburt', 'brand_nachbar', 'blitz_tank', 'sturm_golf']) expect(a[id], id).toEqual({ kind: 'tableau' });
    // Ein Brief bleibt ein Brief, ein Zettel ein Zettel.
    expect(a.post_seil).toBeUndefined();
    expect(a.panne_meissel).toBeUndefined();
  });

  it('meldet fehlende Figuren und Namen', () => {
    const ohneNamen = parseFigureCatalog('x.yaml', 'silas: muetze');
    const silas = events.filter((e) => e.id === 'silas_schnaps');
    expect(visitorErrors(silas, ohneNamen)[0]).toMatch(/braucht in content\/figures.yaml einen Namen/);
    expect(visitorErrors(silas, parseFigureCatalog('x.yaml', 'ruth: frau'))[0]).toMatch(/fehlt in content\/figures.yaml/);
    expect(visitorErrors([{ ...silas[0], mail: 'info' }], figureCatalog)).toContain('Ereignis „silas_schnaps“: Briefe und feste Termine haben keinen Auftritt.');
  });

  it('liest Figuren mit und ohne Namen und lehnt Fremdes ab', () => {
    const c = parseFigureCatalog('x.yaml', 'ruth: frau\nsilas: { form: muetze, name: Silas }');
    expect(c.forms).toEqual({ ruth: 'frau', silas: 'muetze' });
    expect(c.names).toEqual({ silas: 'Silas' });
    expect(() => parseFigureCatalog('x.yaml', 'silas: { form: muetze, alter: 50 }')).toThrow(/unbekannte Felder/);
    expect(() => parseFigureCatalog('x.yaml', 'silas: { form: helm }')).toThrow(/unbekannte Silhouette/);
  });

  it('holt den Nachsatz aus dem „result“ der gewählten Antwort', () => {
    const e = events.find((x) => x.id === 'silas_schnaps')!;
    expect(resultText(events, e.id, e.choices[0].id)).toBe(e.choices[0].result.de);
    expect(resultText(events, e.id, 'gibt_es_nicht')).toBeNull();
  });

  it('schreibt an die Tür, wer wartet', () => {
    expect(waitingText([])).toBe('Niemand wartet');
    expect(waitingText(['Silas'])).toBe('Silas wartet');
    expect(waitingText(['Silas', 'Ruth'])).toBe('Silas und ein weiterer warten');
    expect(waitingText(['Silas', 'Ruth', 'Moss'])).toBe('Silas und 2 weitere warten');
  });
});
