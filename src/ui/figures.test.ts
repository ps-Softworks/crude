// 2.12: Jede Person, die das Spiel zeigt, hat eine Silhouette – Tippfehler in
// content/figures.yaml fallen hier auf, nicht erst im Spiel.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { figureOf, parseFigures, SILHOUETTES } from './figures';

const text = readFileSync(new URL('../../content/figures.yaml', import.meta.url), 'utf8');

describe('Figuren und Silhouetten', () => {
  it('ordnet Jacob, Familie und die Story-Bögen eine eigene Silhouette zu', () => {
    const figures = parseFigures('content/figures.yaml', text);
    for (const id of ['jacob', 'ruth', 'thomas', 'silas', 'moss']) {
      expect(figures[id], id).toBeDefined();
      expect(SILHOUETTES).toContain(figures[id]);
    }
  });

  it('lehnt unbekannte Silhouetten ab', () => {
    expect(() => parseFigures('x.yaml', 'ruth: portraet')).toThrow(/unbekannte Silhouette/);
    expect(() => parseFigures('x.yaml', '- ruth')).toThrow();
  });

  it('gibt Unbekannten den schlichten Kopf', () => {
    expect(figureOf(parseFigures('x.yaml', 'ruth: frau'), 'fremder')).toBe('kopf');
  });
});
