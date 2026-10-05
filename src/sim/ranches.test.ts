import { describe, expect, it } from 'vitest';
import { newGame } from './game';
import { generateRanches, generateWorld, initialRegions, slotsFor } from './ranches';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { parseBalance } from './balance';
import { distanceToSegment, isConvex, pointInPolygon, polygonArea, type Vec } from './worldMap';

const balance = loadBalance();
const world = balance.world;
const salthill = world.regions.find((r) => r.id === 'salthill')!;
const ranches = (seed: string) => generateRanches(world, balance.ranches, 'salthill', seed);
const SEEDS = ['harlan', 'brandt', 'moss', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('Ranches erzeugen (0.2.15+5)', () => {
  it('4.20: jedes bohrbare Gebiet lässt sich erzeugen – genug Familiennamen auch für die größten (Bitterwasser)', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `bot-${i}`);
    for (const region of world.regions.filter((r) => r.kind === 'drillable')) {
      for (const seed of seeds) expect(() => generateRanches(world, balance.ranches, region.id, seed), `${region.id} ${seed}`).not.toThrow();
    }
  });

  it('Determinismus: gleicher Seed = dieselbe Karte bis auf die letzte Stelle', () => {
    expect(ranches('harlan')).toEqual(ranches('harlan'));
    expect(ranches('harlan')).not.toEqual(ranches('brandt'));
  });

  it('jede Ranch ist gültig: Fläche > 0, konvexer Umriss im Gebiet, Mitte im Umriss', () => {
    for (const seed of SEEDS) {
      for (const r of ranches(seed)) {
        expect(r.area).toBeGreaterThan(0);
        expect(r.area).toBeCloseTo(polygonArea(r.polygon), 9);
        expect(r.polygon.length).toBeGreaterThanOrEqual(3);
        expect(isConvex(r.polygon)).toBe(true);
        expect(pointInPolygon(r.center, r.polygon)).toBe(true);
        for (const p of r.polygon) {
          // Ecken liegen im Gebiet oder auf seinem Rand.
          const amRand = salthill.outline.some((a, i) => distanceToSegment(p, a, salthill.outline[(i + 1) % salthill.outline.length]) < 1e-6);
          expect(amRand || pointInPolygon(p, salthill.outline)).toBe(true);
        }
      }
    }
  });

  it('die Ranches decken Salt Hill ganz ab, ohne sich zu überlappen', () => {
    const gebiet = polygonArea(salthill.outline);
    for (const seed of SEEDS) {
      const alle = ranches(seed);
      expect(alle.reduce((s, r) => s + r.area, 0)).toBeCloseTo(gebiet, 6);
      // Stichproben auf einem feinen Gitter: Jeder Punkt im Gebiet liegt in genau einer Ranch.
      for (let x = 12.6; x <= 27.4; x += 0.37) {
        for (let y = 5.4; y <= 16.8; y += 0.41) {
          const p: Vec = [x, y];
          if (!pointInPolygon(p, salthill.outline)) continue;
          expect(alle.filter((r) => pointInPolygon(p, r.polygon))).toHaveLength(1);
        }
      }
    }
  });

  it('Nachbarschaft ist symmetrisch, ohne Selbstbezug, und jede Ranch hat Nachbarn', () => {
    for (const seed of SEEDS) {
      const alle = ranches(seed);
      const byId = new Map(alle.map((r) => [r.id, r]));
      for (const r of alle) {
        expect(r.neighbors.length).toBeGreaterThan(0);
        expect(r.neighbors).not.toContain(r.id);
        for (const n of r.neighbors) expect(byId.get(n)!.neighbors).toContain(r.id);
      }
    }
  });

  it('Nachbarn teilen eine echte Grenze: zwei gemeinsame Ecken', () => {
    const alle = ranches('harlan');
    const byId = new Map(alle.map((r) => [r.id, r]));
    const gleich = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    for (const r of alle) {
      for (const n of r.neighbors) {
        const gemeinsam = r.polygon.filter((p) => byId.get(n)!.polygon.some((q) => gleich(p, q)));
        expect(gemeinsam.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('Größenverteilung: Kleinfarmen und große Ranches, die größte mindestens viermal so groß wie die kleinste', () => {
    for (const seed of SEEDS) {
      const flaechen = ranches(seed).map((r) => r.area);
      expect(Math.max(...flaechen)).toBeGreaterThan(4 * Math.min(...flaechen));
      expect(Math.min(...flaechen)).toBeGreaterThanOrEqual(balance.ranches.minArea * 0.999);
      const slots = ranches(seed).map((r) => r.slots);
      expect(slots.filter((s) => s === 1).length).toBeGreaterThan(0);
      expect(slots.filter((s) => s >= 3).length).toBeGreaterThan(0);
      expect(ranches(seed).length).toBeGreaterThanOrEqual(30);
    }
  });

  it('Bohrplätze nach Fläche: je slotArea einer, mindestens 1, höchstens maxSlots', () => {
    const { slotArea, maxSlots } = balance.ranches;
    expect(slotsFor(balance.ranches, 0.1)).toBe(1);
    expect(slotsFor(balance.ranches, slotArea)).toBe(1);
    expect(slotsFor(balance.ranches, 2 * slotArea)).toBe(2);
    expect(slotsFor(balance.ranches, 3.4 * slotArea)).toBe(3);
    expect(slotsFor(balance.ranches, 100 * slotArea)).toBe(maxSlots);
    for (const r of ranches('harlan')) expect(r.slots).toBe(slotsFor(balance.ranches, r.area));
  });

  it('genau eine Entdeckungsquelle, auf dem Salzdom', () => {
    for (const seed of SEEDS) {
      const funde = ranches(seed).filter((r) => r.discovery);
      expect(funde).toHaveLength(1);
      expect(pointInPolygon(salthill.geology!.center, funde[0].polygon)).toBe(true);
      expect(funde[0].name.de).toBe(salthill.discovery!.name.de);
    }
  });

  it('Namen sind eindeutig, ids in Kartenreihenfolge von Nord nach Süd', () => {
    for (const seed of SEEDS) {
      const alle = ranches(seed);
      expect(new Set(alle.map((r) => r.name.de)).size).toBe(alle.length);
      expect(alle.every((r) => r.owner !== '')).toBe(true);
      expect(alle.map((r) => r.id)).toEqual(alle.map((_, i) => `salthill-${String(i + 1).padStart(2, '0')}`));
      for (let i = 1; i < alle.length; i++) expect(alle[i].center[1]).toBeGreaterThanOrEqual(alle[i - 1].center[1]);
    }
  });

  it('Witwe Pruitt und Moss liegen an der Pipeline-Route zum Bahnhof, Pruitt näher am Bahnhof', () => {
    const bahnhof = world.landmarks.find((l) => l.id === salthill.pipelineTo)!.at!;
    const dome = salthill.geology!.center;
    const aufRoute = (poly: Vec[]) => {
      for (let t = 0; t <= 1; t += 0.005) {
        if (pointInPolygon([dome[0] + t * (bahnhof[0] - dome[0]), dome[1] + t * (bahnhof[1] - dome[1])], poly)) return true;
      }
      return false;
    };
    for (const seed of SEEDS) {
      const alle = ranches(seed);
      const pruitt = alle.find((r) => r.figure === 'pruitt')!;
      const moss = alle.find((r) => r.figure === 'moss')!;
      expect(aufRoute(pruitt.polygon)).toBe(true);
      expect(aufRoute(moss.polygon)).toBe(true);
      const abstand = (r: { center: Vec }) => Math.hypot(r.center[0] - bahnhof[0], r.center[1] - bahnhof[1]);
      expect(abstand(pruitt)).toBeLessThan(abstand(moss));
      const hale = alle.find((r) => r.figure === 'hale')!;
      expect(hale).toBeDefined();
    }
  });

  it('gesperrte Gebiete bekommen zu Spielbeginn keine Ranches', () => {
    expect(initialRegions(world)).toEqual(['salthill', 'portellis']);
    const shapes = generateWorld(world, balance.ranches, 'harlan', initialRegions(world));
    expect(new Set(shapes.map((r) => r.region))).toEqual(new Set(['salthill']));
  });
});

describe('Spielstand: Umrisse kommen aus dem Seed, nicht aus der Datei', () => {
  it('im Spielstand stehen keine Umrisse – neu erzeugt passen sie genau zu den Ranches', () => {
    const state = newGame('umriss', balance);
    const text = serializeGame(state, 'test');
    expect(text).not.toContain('polygon');
    const geladen = deserializeGame(text);
    if (!geladen.ok) throw new Error(geladen.reason);
    const shapes = generateWorld(world, balance.ranches, geladen.state.seed, geladen.state.regions);
    expect(shapes.map((r) => r.id)).toEqual(geladen.state.parcels.map((p) => p.id));
    shapes.forEach((r, i) => {
      const p = geladen.state.parcels[i];
      expect([p.x, p.y]).toEqual([r.center[0], r.center[1]]);
      expect(p.area).toBe(r.area);
      expect(p.neighbors).toEqual(r.neighbors);
      expect(p.slots).toBe(r.slots);
      expect(p.name).toBe(r.name.de);
    });
  });
});

describe('map.yaml prüfen', () => {
  const roh = () => rawBalance() as { world: { regions: Record<string, unknown>[]; figures: Record<string, unknown>[] } };

  it('ein bohrbares Gebiet muss konvex sein', () => {
    const r = roh();
    r.world.regions[0].outline = [[0, 0], [10, 0], [5, 2], [10, 10], [0, 10]];
    expect(() => parseBalance(r)).toThrow(/konvex/);
  });

  it('Figuren brauchen einen bekannten Landbesitzer und ein bohrbares Gebiet', () => {
    const r = roh();
    r.world.figures[0].landowner = 'geizig';
    expect(() => parseBalance(r)).toThrow(/unbekannter Landbesitzer/);
    const s = roh();
    s.world.figures[0].region = 'portellis';
    expect(() => parseBalance(s)).toThrow(/kein bohrbares Gebiet/);
  });

  it('ohne Karte geht es nicht', () => {
    const r: Record<string, unknown> = rawBalance();
    delete r.world;
    expect(() => parseBalance(r)).toThrow(/map.yaml/);
  });
});
