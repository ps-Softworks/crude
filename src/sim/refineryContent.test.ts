import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from './refineryBalance';
import { parseRefineryContent, REFINERY_TEXT_KEYS, refineryText } from './refineryContent';

const FILE = 'content/refinery.yaml';
const text = readFileSync(new URL('../../content/refinery.yaml', import.meta.url), 'utf8');

describe('Raffinerie: Texte (content/refinery.yaml)', () => {
  it('hat alle Texte und Produkte mit de/en', () => {
    const { content, errors } = parseRefineryContent(FILE, text);
    expect(errors).toEqual([]);
    for (const k of REFINERY_TEXT_KEYS) {
      expect(content!.texts[k].de.length).toBeGreaterThan(0);
      expect(content!.texts[k].en.length).toBeGreaterThan(0);
    }
    for (const p of PRODUCTS) expect(content!.products[p].name.en.length).toBeGreaterThan(0);
  });

  it('füllt Platzhalter, unbekannte bleiben stehen', () => {
    const { content } = parseRefineryContent(FILE, text);
    expect(refineryText(content!, 'hints.planned', { crude: '5.000' })).toContain('5.000');
    expect(refineryText(content!, 'hints.planned', { crude: '5.000' }, 'en')).toContain('end of the round');
    expect(refineryText(content!, 'actions.build')).toContain('{cost}');
  });

  it('meldet fehlende Texte, fremde Sprachen und unbekannte Produkte', () => {
    const { content, errors } = parseRefineryContent(FILE, 'object: { de: Raffinerie, fr: Raffinerie }\nproducts:\n  diesel: { name: { de: Diesel } }\n');
    expect(content).toBeNull();
    const alle = errors.map((e) => e.message).join('\n');
    expect(alle).toMatch(/unbekannte Sprache fr/);
    expect(alle).toMatch(/sheetTitle/);
    expect(alle).toMatch(/Unbekannte Produkte: diesel/);
  });

  it('meldet kaputtes YAML mit Zeile', () => {
    const { errors } = parseRefineryContent(FILE, 'object:\n  de: [kaputt\n');
    expect(errors[0].message).toMatch(/YAML kaputt/);
  });
});
