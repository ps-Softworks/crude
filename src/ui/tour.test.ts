// 0.2.15+10: Der Rundgang zeigt nur auf Gegenstände, die es gibt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTour } from './tour';

const text = readFileSync(new URL('../../content/rundgang.yaml', import.meta.url), 'utf8');

describe('Rundgang der Einstiegshilfe', () => {
  it('zeigt jeden wichtigen Gegenstand genau einmal', () => {
    const schritte = parseTour('content/rundgang.yaml', text);
    const ziele = schritte.map((s) => s.object);
    for (const id of ['ruth', 'karte', 'post', 'tuer', 'kassenbuch', 'fracht', 'glocke']) expect(ziele, id).toContain(id);
    expect(new Set(ziele).size).toBe(ziele.length);
  });

  it('lehnt unbekannte Gegenstände und fehlende Texte ab', () => {
    expect(() => parseTour('x.yaml', 'schritte:\n  - objekt: sofa\n    text: { de: "x", en: "" }')).toThrow(/sofa/);
    expect(() => parseTour('x.yaml', 'schritte:\n  - objekt: post\n    text: { en: "" }')).toThrow(/braucht „text“/);
    expect(() => parseTour('x.yaml', 'nix: 1')).toThrow(/schritte/);
  });
});
