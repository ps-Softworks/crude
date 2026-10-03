// Karte der Provinz Cordova (0.2.15+5): Gebiete, Landmarken und Figuren aus
// content/map.yaml, dazu die Geometrie-Helfer für Umrisse (Fläche, Mitte,
// Punkt im Umriss, Abschneiden an einer Geraden). Reine Rechnung, kein Zufall.

import type { LocalizedText } from './i18n';

export type Vec = readonly [number, number];
export type Polygon = readonly Vec[];

export type RegionKind = 'drillable' | 'town';

export interface Region {
  id: string;
  name: LocalizedText;
  kind: RegionKind;
  /** false = sichtbar, aber gesperrt; Freischaltung über Ereignisse (unlocks). */
  unlocked: boolean;
  /** Name neu von Claude, noch nicht in der Weltbibel bestätigt. */
  draft: boolean;
  /** Nur bohrbare Gebiete: Geologie-Profil und Mitte des Salzdoms. */
  geology?: { profile: string; center: Vec };
  /** Nur bohrbare Gebiete: Landmarke, zu der die Pipeline-Route führt. */
  pipelineTo?: string;
  /** Bekannter Fund in diesem Gebiet (Salt Hill): Name und Besitzer der Entdeckungsquelle. */
  discovery?: { name: LocalizedText; owner: string };
  outline: Polygon;
}

export type LandmarkKind = 'sea' | 'river' | 'road' | 'rail' | 'station' | 'harbor';

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  name: LocalizedText;
  draft: boolean;
  /** Fläche (Meer). */
  outline?: Polygon;
  /** Linie (Fluss, Straße, Bahn). */
  points?: Polygon;
  /** Punkt (Bahnhof, Hafen). */
  at?: Vec;
}

export type FigurePlace = 'station' | 'route' | 'largest';

/** Figur aus den Ereignissen, die eine echte Ranch bekommt. */
export interface FigureRanch {
  id: string;
  region: string;
  place: FigurePlace;
  name: LocalizedText;
  owner: string;
  landowner: string;
}

export interface RanchNames {
  smallBelow: number;
  largeFrom: number;
  patterns: { small: LocalizedText; medium: LocalizedText; large: LocalizedText };
  families: string[];
}

export interface WorldMap {
  size: { width: number; height: number };
  regions: Region[];
  landmarks: Landmark[];
  figures: FigureRanch[];
  ranchNames: RanchNames;
}

export class MapError extends Error {}

// ---------------------------------------------------------------- Geometrie

/** Fläche mit Vorzeichen (Gaußsche Trapezformel). */
function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea(poly));
}

/** Schwerpunkt der Fläche; bei entarteten Umrissen der Mittelwert der Ecken. */
export function polygonCentroid(poly: Polygon): Vec {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) {
    const n = Math.max(1, poly.length);
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Liegt der Punkt im Umriss? (Strahl-Methode; Punkte auf dem Rand zählen zufällig.) */
export function pointInPolygon(p: Vec, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Ist der Umriss konvex (alle Knicke in dieselbe Richtung)? */
export function isConvex(poly: Polygon): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const [cx, cy] = poly[(i + 2) % poly.length];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-12) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Schneidet einen konvexen Umriss an der Geraden a·x + b·y = c ab und behält
 * die Seite a·x + b·y ≤ c (Sutherland-Hodgman mit einer Kante).
 */
export function clipHalfPlane(poly: Polygon, a: number, b: number, c: number): Vec[] {
  const out: Vec[] = [];
  const side = (p: Vec) => a * p[0] + b * p[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** Abstand eines Punkts von der Strecke a–b. */
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Schneidet die Strecke a–b den konvexen Umriss? */
export function segmentHitsPolygon(a: Vec, b: Vec, poly: Polygon): boolean {
  // Die Strecke als dünnen Halbraum-Schnitt prüfen: Teile der Strecke in kleine Schritte.
  const schritte = 200;
  for (let i = 0; i <= schritte; i++) {
    const t = i / schritte;
    if (pointInPolygon([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], poly)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- Einlesen

function fehler(text: string): never {
  throw new MapError(`map.yaml: ${text}`);
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fehler(`"${path}" fehlt oder ist kein Block`);
  return value as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.trim() === '') fehler(`"${path}.${key}" fehlt oder ist kein Text`);
  return v;
}

function zahl(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fehler(`"${path}" fehlt oder ist keine Zahl`);
  return v;
}

function vec(v: unknown, path: string): Vec {
  if (!Array.isArray(v) || v.length !== 2) fehler(`"${path}" muss ein Punkt [x, y] sein`);
  return [zahl(v[0], `${path}.0`), zahl(v[1], `${path}.1`)];
}

function punkte(v: unknown, path: string, min: number): Vec[] {
  if (!Array.isArray(v) || v.length < min) fehler(`"${path}" braucht mindestens ${min} Punkte`);
  return v.map((p, i) => vec(p, `${path}.${i}`));
}

function lokal(v: unknown, path: string): LocalizedText {
  const o = obj(v, path);
  const de = str(o, 'de', path);
  const en = typeof o.en === 'string' ? o.en : '';
  return { de, en };
}

function parseRegion(raw: unknown, i: number): Region {
  const path = `regions.${i}`;
  const o = obj(raw, path);
  const id = str(o, 'id', path);
  const kind = o.kind;
  if (kind !== 'drillable' && kind !== 'town') fehler(`"${path}.kind" muss drillable oder town sein`);
  if (typeof o.unlocked !== 'boolean') fehler(`"${path}.unlocked" muss true oder false sein`);
  const outline = punkte(o.outline, `${path}.outline`, 3);
  const region: Region = { id, name: lokal(o.name, `${path}.name`), kind, unlocked: o.unlocked, draft: o.draft === true, outline };
  if (kind === 'drillable') {
    if (!isConvex(outline)) fehler(`"${path}.outline" muss konvex sein (bohrbares Gebiet "${id}")`);
    const g = obj(o.geology, `${path}.geology`);
    const center = vec(g.center, `${path}.geology.center`);
    region.geology = { profile: str(g, 'profile', `${path}.geology`), center };
    if (o.pipelineTo !== undefined) region.pipelineTo = str(o, 'pipelineTo', path);
    if (o.discovery !== undefined) {
      const d = obj(o.discovery, `${path}.discovery`);
      if (!pointInPolygon(center, outline)) fehler(`"${path}.geology.center" liegt nicht im Gebiet "${id}"`);
      region.discovery = { name: lokal(d.name, `${path}.discovery.name`), owner: str(d, 'owner', `${path}.discovery`) };
    }
  }
  return region;
}

const LANDMARK_KINDS: readonly LandmarkKind[] = ['sea', 'river', 'road', 'rail', 'station', 'harbor'];

function parseLandmark(raw: unknown, i: number): Landmark {
  const path = `landmarks.${i}`;
  const o = obj(raw, path);
  const kind = o.kind as LandmarkKind;
  if (!LANDMARK_KINDS.includes(kind)) fehler(`"${path}.kind" muss eins von ${LANDMARK_KINDS.join(', ')} sein`);
  const mark: Landmark = { id: str(o, 'id', path), kind, name: lokal(o.name, `${path}.name`), draft: o.draft === true };
  if (kind === 'sea') mark.outline = punkte(o.outline, `${path}.outline`, 3);
  else if (kind === 'station' || kind === 'harbor') mark.at = vec(o.at, `${path}.at`);
  else mark.points = punkte(o.points, `${path}.points`, 2);
  return mark;
}

const PLACES: readonly FigurePlace[] = ['station', 'route', 'largest'];

/**
 * Liest content/map.yaml. Prüft, dass ids eindeutig sind, bohrbare Gebiete
 * konvex sind und Figuren auf ein bohrbares Gebiet mit Pipeline-Route zeigen.
 * landowners: erlaubte Landbesitzer-Arten aus balance.yaml.
 */
export function parseWorldMap(raw: unknown, landowners: readonly string[]): WorldMap {
  const o = obj(raw, '(Datei)');
  const size = obj(o.size, 'size');
  const width = zahl(size.width, 'size.width');
  const height = zahl(size.height, 'size.height');
  if (!Array.isArray(o.regions) || o.regions.length === 0) fehler('"regions" fehlt oder ist leer');
  const regions = o.regions.map(parseRegion);
  const landmarks = Array.isArray(o.landmarks) ? o.landmarks.map(parseLandmark) : [];
  const ids = [...regions.map((r) => r.id), ...landmarks.map((l) => l.id)];
  const doppelt = ids.find((id, i) => ids.indexOf(id) !== i);
  if (doppelt) fehler(`id "${doppelt}" kommt doppelt vor`);
  for (const r of regions) {
    if (r.pipelineTo && !landmarks.some((l) => l.id === r.pipelineTo && l.at)) {
      fehler(`Gebiet "${r.id}": pipelineTo "${r.pipelineTo}" ist kein Bahnhof oder Hafen`);
    }
  }
  if (!regions.some((r) => r.kind === 'drillable' && r.unlocked)) fehler('mindestens ein bohrbares Gebiet muss offen sein');

  const figures = (Array.isArray(o.figures) ? o.figures : []).map((rawF, i): FigureRanch => {
    const path = `figures.${i}`;
    const f = obj(rawF, path);
    const region = str(f, 'region', path);
    const reg = regions.find((r) => r.id === region);
    if (!reg || reg.kind !== 'drillable') fehler(`"${path}.region" ist kein bohrbares Gebiet`);
    const place = f.place as FigurePlace;
    if (!PLACES.includes(place)) fehler(`"${path}.place" muss eins von ${PLACES.join(', ')} sein`);
    if (place !== 'largest' && !reg.pipelineTo) fehler(`"${path}": Gebiet "${region}" hat keine Pipeline-Route`);
    const landowner = str(f, 'landowner', path);
    if (!landowners.includes(landowner)) fehler(`"${path}.landowner": unbekannter Landbesitzer "${landowner}"`);
    return { id: str(f, 'id', path), region, place, name: lokal(f.name, `${path}.name`), owner: str(f, 'owner', path), landowner };
  });
  const figIds = figures.map((f) => f.id);
  const figDoppelt = figIds.find((id, i) => figIds.indexOf(id) !== i);
  if (figDoppelt) fehler(`Figur "${figDoppelt}" kommt doppelt vor`);

  const rn = obj(o.ranchNames, 'ranchNames');
  const pat = obj(rn.patterns, 'ranchNames.patterns');
  const families = rn.families;
  if (!Array.isArray(families) || families.length === 0 || !families.every((n) => typeof n === 'string' && n.trim() !== '')) {
    fehler('"ranchNames.families" muss eine Liste von Namen sein');
  }
  if (new Set(families).size !== families.length) fehler('"ranchNames.families" enthält einen Namen doppelt');
  const patterns = {
    small: lokal(pat.small, 'ranchNames.patterns.small'),
    medium: lokal(pat.medium, 'ranchNames.patterns.medium'),
    large: lokal(pat.large, 'ranchNames.patterns.large'),
  };
  for (const [k, p] of Object.entries(patterns)) {
    if (!p.de.includes('{name}')) fehler(`"ranchNames.patterns.${k}.de" braucht {name}`);
  }
  const ranchNames: RanchNames = {
    smallBelow: zahl(rn.smallBelow, 'ranchNames.smallBelow'),
    largeFrom: zahl(rn.largeFrom, 'ranchNames.largeFrom'),
    patterns,
    families: families as string[],
  };
  if (ranchNames.smallBelow > ranchNames.largeFrom) fehler('"ranchNames.smallBelow" ist größer als "largeFrom"');
  return { size: { width, height }, regions, landmarks, figures, ranchNames };
}

export function regionById(world: WorldMap, id: string): Region | undefined {
  return world.regions.find((r) => r.id === id);
}

export function landmarkById(world: WorldMap, id: string): Landmark | undefined {
  return world.landmarks.find((l) => l.id === id);
}
