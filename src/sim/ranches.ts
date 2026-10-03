// Ranches und Farmen (0.2.15+5): Bohrbares Land ist kein Raster mehr, sondern
// in unregelmäßige Grundstücke zerlegt. Je Seed und Gebiet gleich:
//   1. Hofstellen streuen: ein Gitter, jeder Punkt zufällig verschoben (jittered),
//      jede Hofstelle bekommt eine Größenklasse (Kleinfarm … große Ranch);
//   2. gewichtete Voronoi-Zerlegung (Power-Diagramm) am Gebietsrand geschnitten –
//      größeres Gewicht = größeres Grundstück; jedes Grundstück ist ein konvexes Vieleck;
//   3. ein paar Runden Lloyd-Glättung (Hofstelle auf die Mitte ihres Grundstücks);
//   4. zu kleine Reste fallen weg, ihr Land geht an die Nachbarn;
//   5. Nachbarn = gemeinsame Kante, Bohrplätze nach Fläche, Namen aus content/map.yaml.
// Der Zufall kommt aus seed + ':karte:' + Gebiet – unabhängig von Jacobs Zufall.

import type { RanchBalance } from './balance';
import type { LocalizedText } from './i18n';
import { Rng, seedFromString } from './rng';
import {
  clipHalfPlane,
  distanceToSegment,
  landmarkById,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  regionById,
  segmentHitsPolygon,
  type Vec,
  type WorldMap,
} from './worldMap';

export interface RanchShape {
  id: string;
  region: string;
  name: LocalizedText;
  /** Wem das Land gehört (Name). */
  owner: string;
  /** Figur aus den Ereignissen (moss, pruitt, hale …), falls es ihre Ranch ist. */
  figure?: string;
  /** Feste Landbesitzer-Art der Figur; sonst wird sie gewürfelt. */
  landowner?: string;
  /** Entdeckungsquelle des Gebiets (Salt Hill). */
  discovery: boolean;
  polygon: Vec[];
  center: Vec;
  area: number;
  /** So viele Bohrlöcher passen auf das Land. */
  slots: number;
  /** Ranches mit gemeinsamer Kante, nach id sortiert. */
  neighbors: string[];
}

interface Site {
  p: Vec;
  w: number;
  fixed: boolean;
}

/** Halbraum, in dem Hofstelle i näher liegt als j (Power-Abstand |x−p|² − w). */
function bisector(a: Site, b: Site): [number, number, number] {
  const A = 2 * (b.p[0] - a.p[0]);
  const B = 2 * (b.p[1] - a.p[1]);
  const C = b.p[0] ** 2 + b.p[1] ** 2 - a.p[0] ** 2 - a.p[1] ** 2 + a.w - b.w;
  return [A, B, C];
}

function cells(outline: readonly Vec[], sites: readonly Site[]): Vec[][] {
  return sites.map((site, i) => {
    let poly: Vec[] = [...outline];
    for (let j = 0; j < sites.length && poly.length > 0; j++) {
      if (j === i) continue;
      const [a, b, c] = bisector(site, sites[j]);
      poly = clipHalfPlane(poly, a, b, c);
    }
    return poly;
  });
}

/** Punkte von poly, die auf der Grenzlinie zwischen a und b liegen. */
function onLine(poly: readonly Vec[], a: Site, b: Site): Vec[] {
  const [A, B, C] = bisector(a, b);
  const n = Math.hypot(A, B);
  if (n === 0) return [];
  return poly.filter((p) => Math.abs(A * p[0] + B * p[1] - C) / n < 1e-7);
}

function sharesEdge(points: readonly Vec[], minLength: number): boolean {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) >= minLength) return true;
    }
  }
  return false;
}

/** Bohrplätze aus der Fläche: je slotArea einer, mindestens 1, höchstens maxSlots. */
export function slotsFor(balance: RanchBalance, area: number): number {
  return Math.min(balance.maxSlots, Math.max(1, Math.round(area / balance.slotArea)));
}

function fill(pattern: LocalizedText, name: string): LocalizedText {
  return { de: pattern.de.replace('{name}', name), en: (pattern.en || pattern.de).replace('{name}', name) };
}

/**
 * Erzeugt die Ranches eines bohrbaren Gebiets. Gleicher Seed, gleiches Gebiet =
 * dieselben Ranches bis auf die letzte Nachkommastelle.
 */
export function generateRanches(world: WorldMap, balance: RanchBalance, regionId: string, seed: string): RanchShape[] {
  const region = regionById(world, regionId);
  if (!region || region.kind !== 'drillable' || !region.geology) throw new Error(`Gebiet "${regionId}" ist nicht bohrbar.`);
  const rng = new Rng(seedFromString(`${seed}:karte:${regionId}`));
  const outline = region.outline;
  const s = balance.spacing;
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sizeTotal = balance.sizes.reduce((sum, c) => sum + c.share, 0);
  const dome = region.geology.center;

  // 1. Hofstellen: Gitter mit Versatz; jeder Gitterpunkt verbraucht genau drei Zufallszahlen.
  let sites: Site[] = [];
  for (let gy = 0; minY + gy * s < maxY; gy++) {
    for (let gx = 0; minX + gx * s < maxX; gx++) {
      const p: Vec = [minX + (gx + 0.5 + (rng.float() - 0.5) * balance.jitter) * s, minY + (gy + 0.5 + (rng.float() - 0.5) * balance.jitter) * s];
      let roll = rng.float() * sizeTotal;
      let w = balance.sizes[balance.sizes.length - 1].weight;
      for (const c of balance.sizes) {
        roll -= c.share;
        if (roll < 0) {
          w = c.weight;
          break;
        }
      }
      if (pointInPolygon(p, outline)) sites.push({ p, w: w * s * s, fixed: false });
    }
  }
  // Die Entdeckungsquelle sitzt genau auf dem Salzdom. Ihre Nachbarn bekommen kein
  // größeres Gewicht als sie selbst, damit sie nicht zwischen großen Ranches verschwindet.
  if (region.discovery) {
    const w = balance.sizes[Math.min(1, balance.sizes.length - 1)].weight * s * s;
    sites = sites
      .filter((site) => Math.hypot(site.p[0] - dome[0], site.p[1] - dome[1]) >= 0.75 * s)
      .map((site) => (Math.hypot(site.p[0] - dome[0], site.p[1] - dome[1]) < 2 * s ? { ...site, w: Math.min(site.w, w) } : site));
    sites.push({ p: dome, w, fixed: true });
  }

  // 2.–4. Zerlegen, glätten, zu kleine Reste entfernen.
  let polys = cells(outline, sites);
  for (let k = 0; k < balance.relax; k++) {
    sites = sites
      .map((site, i) => ({ site, poly: polys[i] }))
      .filter(({ poly }) => poly.length >= 3)
      .map(({ site, poly }) => (site.fixed ? site : { ...site, p: polygonCentroid(poly) }));
    polys = cells(outline, sites);
  }
  for (;;) {
    const flaechen = polys.map((poly) => (poly.length >= 3 ? polygonArea(poly) : 0));
    let kleinste = -1;
    flaechen.forEach((a, i) => {
      if (!sites[i].fixed && a < balance.minArea && (kleinste < 0 || a < flaechen[kleinste])) kleinste = i;
    });
    if (kleinste < 0) break;
    sites = sites.filter((_, i) => i !== kleinste);
    polys = cells(outline, sites);
  }

  // 5. Reihenfolge von Nord nach Süd, dann West nach Ost.
  const roh = sites
    .map((site, i) => ({ site, poly: polys[i], center: polygonCentroid(polys[i]), area: polygonArea(polys[i]) }))
    .sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]);
  const ids = roh.map((_, i) => `${regionId}-${String(i + 1).padStart(2, '0')}`);
  const neighbors: string[][] = roh.map(() => []);
  for (let i = 0; i < roh.length; i++) {
    for (let j = i + 1; j < roh.length; j++) {
      const a = onLine(roh[i].poly, roh[i].site, roh[j].site);
      const b = onLine(roh[j].poly, roh[j].site, roh[i].site);
      if (sharesEdge(a, balance.minEdge) && sharesEdge(b, balance.minEdge)) {
        neighbors[i].push(ids[j]);
        neighbors[j].push(ids[i]);
      }
    }
  }

  const ranches: RanchShape[] = roh.map((r, i) => ({
    id: ids[i],
    region: regionId,
    name: { de: '', en: '' },
    owner: '',
    discovery: r.site.fixed,
    polygon: r.poly.map((p) => [p[0], p[1]] as Vec),
    center: r.center,
    area: r.area,
    slots: slotsFor(balance, r.area),
    neighbors: [...neighbors[i]].sort(),
  }));

  // Namen: Entdeckungsquelle, dann die Figuren, dann die Familien aus der Namensliste.
  for (const r of ranches) {
    if (r.discovery && region.discovery) {
      r.name = region.discovery.name;
      r.owner = region.discovery.owner;
    }
  }
  const frei = () => ranches.filter((r) => !r.discovery && r.owner === '');
  const ziel = region.pipelineTo ? landmarkById(world, region.pipelineTo)?.at : undefined;
  const route = ziel
    ? frei()
        .filter((r) => segmentHitsPolygon(dome, ziel, r.polygon))
        .sort((a, b) => distanceToSegment(a.center, ziel, ziel) - distanceToSegment(b.center, ziel, ziel))
    : [];
  for (const figur of world.figures.filter((f) => f.region === regionId)) {
    const kandidaten =
      figur.place === 'largest'
        ? [...frei()].sort((a, b) => b.area - a.area)
        : route.filter((r) => r.owner === '');
    // „route“ ist die nächste freie Ranch an der Route nach der am Bahnhof.
    const ranch = kandidaten[0] ?? [...frei()].sort((a, b) => b.area - a.area)[0];
    if (!ranch) throw new Error(`Für die Figur "${figur.id}" ist keine Ranch mehr frei.`);
    ranch.name = figur.name;
    ranch.owner = figur.owner;
    ranch.figure = figur.id;
    ranch.landowner = figur.landowner;
  }
  const rest = frei();
  const { families, patterns, smallBelow, largeFrom } = world.ranchNames;
  const vergeben = new Set(world.figures.map((f) => f.owner.split(' ').pop()!));
  const namen = rng.shuffle(families.filter((n) => !vergeben.has(n)));
  if (namen.length < rest.length) throw new Error(`map.yaml: zu wenige Familiennamen für ${rest.length} Ranches in "${regionId}".`);
  rest.forEach((r, i) => {
    const pattern = r.area < smallBelow ? patterns.small : r.area >= largeFrom ? patterns.large : patterns.medium;
    r.name = fill(pattern, namen[i]);
    r.owner = `Familie ${namen[i]}`;
  });
  return ranches;
}

/** Alle Ranches der offenen bohrbaren Gebiete, in Gebietsreihenfolge aus map.yaml. */
export function generateWorld(world: WorldMap, balance: RanchBalance, seed: string, unlocked: readonly string[]): RanchShape[] {
  return world.regions
    .filter((r) => r.kind === 'drillable' && unlocked.includes(r.id))
    .flatMap((r) => generateRanches(world, balance, r.id, seed));
}

/** Offene Gebiete zu Spielbeginn (unlocked: true in map.yaml). */
export function initialRegions(world: WorldMap): string[] {
  return world.regions.filter((r) => r.unlocked).map((r) => r.id);
}
