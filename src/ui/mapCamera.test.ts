// Kamera der Karte (0.2.15+6): Zoom und Verschieben bleiben in den Grenzen.
import { describe, expect, it } from 'vitest';
import { boundsOf, clampView, fitBounds, maxWidth, overview, panBy, sameView, tween, zoomAt, type Limits } from './mapCamera';

const L: Limits = { world: { width: 40, height: 30 }, aspect: 0.75, minW: 3.5, margin: 1.5 };

describe('Kamera der Karte', () => {
  it('Übersicht zeigt die ganze Provinz', () => {
    expect(overview(L)).toEqual({ x: 0, y: 0, w: 40, h: 30 });
    expect(maxWidth(L)).toBe(40);
  });

  it('fitBounds zeigt das Gebiet ganz, mit Rand und richtigem Seitenverhältnis', () => {
    const v = fitBounds(boundsOf([[13, 5], [27, 5], [27, 17], [13, 17]]), L, 0.05);
    expect(v.h / v.w).toBeCloseTo(0.75);
    expect(v.x).toBeLessThanOrEqual(13);
    expect(v.x + v.w).toBeGreaterThanOrEqual(27);
    expect(v.y).toBeLessThanOrEqual(5);
    expect(v.y + v.h).toBeGreaterThanOrEqual(17);
  });

  it('zoomt nicht tiefer als minW und nicht weiter hinaus als die ganze Karte', () => {
    const tief = zoomAt(overview(L), 0.001, [20, 15], L);
    expect(tief.w).toBeCloseTo(3.5);
    const weit = zoomAt(tief, 1000, [20, 15], L);
    expect(sameView(weit, overview(L))).toBe(true);
  });

  it('der Punkt unter der Maus bleibt beim Zoomen an seiner Stelle', () => {
    const v = { x: 10, y: 5, w: 20, h: 15 };
    const p: [number, number] = [14, 8];
    const z = zoomAt(v, 0.5, p, L);
    expect((p[0] - z.x) / z.w).toBeCloseTo((p[0] - v.x) / v.w);
    expect((p[1] - z.y) / z.h).toBeCloseTo((p[1] - v.y) / v.h);
  });

  it('Verschieben hört am Kartenrand (plus Rand) auf', () => {
    const v = { x: 10, y: 5, w: 10, h: 7.5 };
    const links = panBy(v, -100, -100, L);
    expect(links.x).toBe(-1.5);
    expect(links.y).toBe(-1.5);
    const rechts = panBy(v, 100, 100, L);
    expect(rechts.x + rechts.w).toBeCloseTo(41.5);
    expect(rechts.y + rechts.h).toBeCloseTo(31.5);
  });

  it('clampView zentriert, wenn der Ausschnitt die ganze Karte zeigt', () => {
    expect(clampView({ x: 30, y: 30, w: 80, h: 60 }, L)).toEqual(overview(L));
  });

  it('Kamerafahrt beginnt am Start und endet genau am Ziel', () => {
    const a = { x: 0, y: 0, w: 40, h: 30 };
    const b = { x: 12, y: 4, w: 16, h: 12 };
    expect(tween(a, b, 0)).toEqual(a);
    expect(tween(a, b, 1)).toEqual(b);
    const mitte = tween(a, b, 0.5);
    expect(mitte.w).toBeCloseTo(28);
  });
});
