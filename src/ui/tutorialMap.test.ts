import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTutorialContent } from '../sim/tutorial';
import { parseMapHints, withMapHints } from './tutorialMap';

const text = readFileSync(new URL('../../content/tutorial.yaml', import.meta.url), 'utf8');

describe('Einstieg auf der Karte (0.2.15+11)', () => {
  it('die Kartenfassungen nennen keinen Weg zur Wandkarte', () => {
    const map = parseMapHints('content/tutorial.yaml', text);
    expect(Object.keys(map).length).toBeGreaterThan(0);
    for (const t of Object.values(map)) expect(t!.de).not.toMatch(/Wandkarte/);
  });

  it('ersetzt nur, wo es eine Kartenfassung gibt', () => {
    const { content } = parseTutorialContent('content/tutorial.yaml', text);
    const map = parseMapHints('content/tutorial.yaml', text);
    const karte = withMapHints(content!, map);
    expect(karte.hints.drill).toEqual(map.drill);
    expect(karte.hints.sell).toEqual(content!.hints.sell);
  });

  it('meldet unbekannte Hinweise und fehlenden Text verständlich', () => {
    expect(() => parseMapHints('x.yaml', 'onMap:\n  gibtsnicht: { de: a }\n')).toThrow(/onMap.gibtsnicht gibt es nicht/);
    expect(() => parseMapHints('x.yaml', 'onMap:\n  drill: { en: a }\n')).toThrow(/deutschen Text/);
    expect(parseMapHints('x.yaml', 'title: x\n')).toEqual({});
  });
});
