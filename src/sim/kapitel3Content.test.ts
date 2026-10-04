// Texte für Kapitel 3 (4.17): content/kapitel3.yaml ist vollständig, zweisprachig
// angelegt und passt zu balance.yaml.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { KAPITEL3_NOTES, KAPITEL3_REASONS } from './kapitel3';
import { checkKapitel3Content, fillText, parseKapitel3Content } from './kapitel3Content';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const FILE = 'content/kapitel3.yaml';
const text = readFileSync(new URL('../../content/kapitel3.yaml', import.meta.url), 'utf8');

describe('content/kapitel3.yaml', () => {
  it('ist vollständig und passt zu balance.yaml', () => {
    const { content, errors } = parseKapitel3Content(FILE, text);
    expect(errors).toEqual([]);
    expect(content).not.toBeNull();
    expect(checkKapitel3Content(FILE, content!, balance)).toEqual([]);
    for (const r of KAPITEL3_REASONS) expect(content!.reasons[r].de).not.toBe('');
    for (const n of KAPITEL3_NOTES) expect(content!.notes[n].de).not.toBe('');
  });

  it('jeder Text hat auch Englisch', () => {
    const leer: string[] = [];
    const walk = (v: unknown, wo: string) => {
      if (v && typeof v === 'object' && 'de' in v) {
        if (!(v as { en?: string }).en) leer.push(wo);
      } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${wo}.${k}`);
    };
    walk(parse(text), '');
    expect(leer).toEqual([]);
  });

  it('fehlender Grund und unbekannter Eintrag sind Fehler', () => {
    const raw = parse(text);
    delete raw.reasons.geld;
    raw.notes.quatsch = { de: 'x', en: 'x' };
    const { content, errors } = parseKapitel3Content(FILE, stringify(raw));
    expect(content).toBeNull();
    expect(errors.map((e) => e.message).join('\n')).toMatch(/reasons.geld/);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/unbekannte Einträge quatsch/);
  });

  it('Gefallen und Projekte müssen zu balance.yaml passen', () => {
    const raw = parse(text);
    delete raw.konsortium.favors.drosseln;
    raw.projekte.list.mondbasis = { title: { de: 'x', en: 'x' }, text: { de: 'x', en: 'x' } };
    const { content } = parseKapitel3Content(FILE, stringify(raw));
    const fehler = checkKapitel3Content(FILE, content!, balance).map((e) => e.message);
    expect(fehler.some((m) => m.includes('drosseln'))).toBe(true);
    expect(fehler.some((m) => m.includes('mondbasis'))).toBe(true);
  });

  it('kaputtes YAML meldet die Zeile', () => {
    const { errors } = parseKapitel3Content(FILE, 'reasons:\n  geld: [\n');
    expect(errors[0].message).toMatch(/YAML kaputt/);
  });

  it('Platzhalter werden ersetzt, fehlende bleiben sichtbar', () => {
    expect(fillText({ de: 'Auf {ranch} für {betrag}', en: 'On {ranch}' }, { ranch: 'Moss-Farm' })).toBe('Auf Moss-Farm für {betrag}');
    expect(fillText({ de: 'Auf {ranch}', en: 'On {ranch}' }, { ranch: 'Moss' }, 'en')).toBe('On Moss');
  });
});
