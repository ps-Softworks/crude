import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlossary, searchGlossary, sortedGlossary } from './glossary';

const echt = parseGlossary('content/glossar.yaml', readFileSync(new URL('../../content/glossar.yaml', import.meta.url), 'utf8'));

describe('Glossar: content/glossar.yaml', () => {
  it('ist fehlerfrei und hat mindestens 30 Begriffe in beiden Sprachen', () => {
    expect(echt.errors).toEqual([]);
    expect(echt.content!.entries.length).toBeGreaterThanOrEqual(30);
    for (const e of echt.content!.entries) {
      expect(e.term.de && e.term.en && e.text.de && e.text.en).toBeTruthy();
    }
  });

  it('enthält die geforderten Begriffe', () => {
    const ids = echt.content!.entries.map((e) => e.id);
    for (const id of ['posted_price', 'wildcatter', 'gusher', 'pacht', 'pachtoption', 'foerderzins', 'trust', 'barrel', 'bohrturm', 'seilschlag', 'pipeline', 'raffinerie', 'kerosin', 'rating', 'imperiumswert', 'konsortium', 'aufsichtsrat', 'anleihe', 'margin', 'fernleitung', 'wegerecht', 'transportpflicht', 'kartellgesetz', 'foerderquote', 'heisses_oel', 'seismik', 'cracken', 'zeitsprung']) {
      expect(ids, id).toContain(id);
    }
  });

  it('jede Stelle der Oberfläche mit <Begriff id="…"> verweist auf einen Eintrag', () => {
    const ids = new Set(echt.content!.entries.map((e) => e.id));
    const gefunden: string[] = [];
    const lies = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const pfad = join(dir, name);
        if (statSync(pfad).isDirectory()) lies(pfad);
        else if (name.endsWith('.tsx')) for (const m of readFileSync(pfad, 'utf8').matchAll(/<Begriff id="([a-z0-9_]+)"/g)) gefunden.push(m[1]);
      }
    };
    lies(new URL('../ui', import.meta.url).pathname);
    expect(gefunden.length).toBeGreaterThanOrEqual(5);
    for (const id of gefunden) expect(ids.has(id), id).toBe(true);
  });
});

describe('Glossar: Prüfung', () => {
  const gut = `
begriffe:
  - id: a
    term: { de: Anker, en: Anchor }
    text: { de: Hält das Schiff., en: Holds the ship. }
    see: [b]
  - id: b
    term: { de: Ärmel, en: Sleeve }
    text: { de: Steckt am Rock., en: Sits on the coat. }
`;
  it('liest einen guten Text und sortiert alphabetisch (Ä wie A)', () => {
    const r = parseGlossary('x.yaml', gut);
    expect(r.errors).toEqual([]);
    expect(sortedGlossary(r.content!).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('meldet doppelte Kennungen, fehlendes Englisch, unbekannte Verweise und zu lange Texte', () => {
    const doppelt = parseGlossary('x.yaml', gut.replace('id: b', 'id: a'));
    expect(doppelt.errors.some((e) => /doppelt/.test(e.message))).toBe(true);
    const ohneEn = parseGlossary('x.yaml', gut.replace(', en: Anchor', ''));
    expect(ohneEn.errors.some((e) => /\(en\) fehlt/.test(e.message))).toBe(true);
    const verweis = parseGlossary('x.yaml', gut.replace('see: [b]', 'see: [zzz]'));
    expect(verweis.errors.some((e) => /unbekannter Begriff/.test(e.message))).toBe(true);
    const lang = parseGlossary('x.yaml', gut.replace('Hält das Schiff.', 'Eins. Zwei. Drei. Vier.'));
    expect(lang.errors.some((e) => /Sätze/.test(e.message))).toBe(true);
    expect(parseGlossary('x.yaml', 'foo: 1').content).toBeNull();
  });

  it('Suche findet im Begriff und in der Erklärung', () => {
    const e = parseGlossary('x.yaml', gut).content!.entries;
    expect(searchGlossary(e, 'anker').map((x) => x.id)).toEqual(['a']);
    expect(searchGlossary(e, 'rock').map((x) => x.id)).toEqual(['b']);
    expect(searchGlossary(e, '  ')).toHaveLength(2);
    expect(searchGlossary(e, 'nichts')).toEqual([]);
  });
});
