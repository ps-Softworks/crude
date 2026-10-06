// Karte von Cordova: Ranches und Farmen (src/sim/ranches.ts) mit verdeckter
// Geologie. Je näher die Mitte einer Ranch am Salzdom liegt, desto
// wahrscheinlicher Öl; große Ranches haben mehr Reserven.
// Seit 0.2.15+5 kein Raster mehr: x/y ist die Mitte der Ranch in Karteneinheiten.
// Die Umrisse stehen nicht im Spielzustand (und nicht im Spielstand) – sie
// werden aus dem Seed neu erzeugt (generateWorld), wenn die Karte sie braucht.
//
// Termine als Hauptwerkzeug (Etappe 1): Jede Ranch hat eine verdeckte Fundchance q
// (Parcel.chance). Sie kommt aus dem Grundwert der Zone, dazu Salzrücken (Trends):
// je Gebiet ein paar Linien, an denen das Öl sitzt. Wer nah an einer Linie liegt,
// bekommt einen Aufschlag, alle anderen einen Abschlag; dazu etwas Rauschen.
// Danach wird die Geologie mit q gewürfelt (rollGeology). Die Linien stehen wie die
// Umrisse nicht im Spielstand, sie kommen aus dem Seed (regionTrends).

import type { Balance, GeologyType, LandownerType, Zone } from './balance';
import { generateWorld, initialRegions } from './ranches';
import { Rng, seedFromString } from './rng';
import { distanceToSegment, regionById, type Vec } from './worldMap';

export interface Parcel {
  id: string;
  /** Gebiet aus content/map.yaml. */
  region: string;
  /** Name der Ranch, z. B. „Moss-Farm“ (deutsch) … */
  name: string;
  /** … und englisch. */
  nameEn: string;
  /** Wem das Land gehört (Name). */
  owner: string;
  /** Figur aus den Ereignissen, falls es ihre Ranch ist (moss, pruitt, hale …). */
  figure?: string;
  /** Mitte der Ranch in Karteneinheiten. */
  x: number;
  y: number;
  /** Fläche in Karteneinheiten². */
  area: number;
  /** So viele Bohrlöcher passen auf die Ranch. */
  slots: number;
  /** Ranches mit gemeinsamer Grenze. */
  neighbors: string[];
  zone: string;
  /**
   * Verdeckt: wahre Fundchance q (0–1), aus Zone, Salzrücken und Rauschen (Etappe 1).
   * Fehlt sie (alter Spielstand, Test-Ranch), gilt der Grundwert der Zone.
   */
  chance?: number;
  /** Verdeckt: der Spieler sieht das erst nach einer Bohrung. */
  geology: GeologyType;
  /** Verdeckt: förderbare Gesamtmenge in Barrel (0 bei trocken). */
  reserves: number;
  /** Wie der Landbesitzer verhandelt; bestimmt Bonus und Förderzins der Pacht mit. */
  landowner: LandownerType;
  /**
   * Startquelle (0.4.20+21): sicheres Öl in Stufe 1, eigene Lagerstätte, erstes Loch ohne Unfall
   * und Klemmen. Die Prognose zeigt „Öl sicher“. Nur auf der ersten Startoption.
   */
  sure?: boolean;
  /** Bekannter Fund (Salt Hill): Quelle des Booms, nicht pachtbar. */
  discovery: boolean;
  /** Lagerstätte, in der die Ranch liegt. Wird ab 1.7 gesetzt. */
  fieldId?: string;
}

/** Abstand eines Punkts zur Mitte des Salzdoms seines Gebiets. */
export function distanceToDome(balance: Balance, region: string, x: number, y: number): number {
  const center = regionById(balance.world, region)?.geology?.center;
  if (!center) throw new Error(`Gebiet "${region}" hat keine Geologie.`);
  return Math.hypot(x - center[0], y - center[1]);
}

export function zoneFor(balance: Balance, region: string, x: number, y: number): Zone {
  const d = distanceToDome(balance, region, x, y);
  const zones = balance.geology.zones;
  return zones.find((z) => d <= z.maxDistance) ?? zones[zones.length - 1];
}

/** Zieht einen Landbesitzer nach den Gewichten aus balance.yaml. */
function rollLandowner(balance: Balance, roll: number): LandownerType {
  const owners = balance.lease.landowners;
  const total = owners.reduce((sum, o) => sum + o.weight, 0);
  let threshold = roll * total;
  for (const owner of owners) {
    threshold -= owner.weight;
    if (threshold < 0) return owner.name;
  }
  return owners[owners.length - 1].name;
}

/**
 * Würfelt die Geologie zur wahren Fundchance q: trocken mit Wahrscheinlichkeit 1 − q,
 * der Rest teilt sich im Verhältnis small : gusher der Zone auf. roll in [0, 1).
 */
export function rollGeology(zone: Pick<Zone, 'small' | 'gusher'>, q: number, roll: number): GeologyType {
  const trocken = 1 - q;
  if (roll < trocken) return 'dry';
  const anteilKlein = zone.small / (zone.small + zone.gusher);
  return roll < trocken + q * anteilKlein ? 'small' : 'gusher';
}

/** Ein Salzrücken: eine Strecke in Karteneinheiten, an der entlang das Öl sitzt. */
export interface TrendLine {
  a: Vec;
  b: Vec;
}

/**
 * Die Salzrücken eines Gebiets, fest aus dem Seed (seed + ':trends:' + Gebiet).
 * Jede Linie läuft durch einen Punkt in offsetMin–offsetMax Abstand vom Salzdom,
 * in zufälliger Richtung, halfLength zu beiden Seiten. Gebiete ohne Geologie: keine.
 */
export function regionTrends(balance: Balance, seed: string, regionId: string): TrendLine[] {
  const center = regionById(balance.world, regionId)?.geology?.center;
  if (!center) return [];
  const t = balance.geology.trends;
  const rng = new Rng(seedFromString(`${seed}:trends:${regionId}`));
  const lines: TrendLine[] = [];
  for (let i = 0; i < t.perRegion; i++) {
    const phi = rng.float() * 2 * Math.PI;
    const d = t.offsetMin + rng.float() * (t.offsetMax - t.offsetMin);
    const theta = rng.float() * Math.PI;
    const px = center[0] + d * Math.cos(phi);
    const py = center[1] + d * Math.sin(phi);
    const dx = t.halfLength * Math.cos(theta);
    const dy = t.halfLength * Math.sin(theta);
    lines.push({ a: [px - dx, py - dy], b: [px + dx, py + dy] });
  }
  return lines;
}

/** Abstand eines Punkts zur nächsten Trendlinie (Infinity ohne Linien). */
export function trendDistance(lines: readonly TrendLine[], x: number, y: number): number {
  return lines.reduce((min, l) => Math.min(min, distanceToSegment([x, y], l.a, l.b)), Infinity);
}

/** Liegt der Punkt auf einem Salzrücken (Abstand ≤ trends.radius)? */
export function onTrend(balance: Balance, lines: readonly TrendLine[], x: number, y: number): boolean {
  return trendDistance(lines, x, y) <= balance.geology.trends.radius;
}

/**
 * Wahre Fundchance q: Grundwert der Zone + (auf einem Salzrücken ? bonus : offTrend)
 * + Rauschen ±noise (noiseRoll in [0, 1)), begrenzt auf qMin–qMax.
 */
export function parcelChance(balance: Balance, zone: Pick<Zone, 'base'>, lines: readonly TrendLine[], x: number, y: number, noiseRoll: number): number {
  const t = balance.geology.trends;
  const trend = onTrend(balance, lines, x, y) ? t.bonus : t.offTrend;
  const q = zone.base + trend + (noiseRoll * 2 - 1) * t.noise;
  return Math.min(t.qMax, Math.max(t.qMin, q));
}

/** Flächenfaktor: so viele „Standardflächen“ (ranches.slotArea) hat die Ranch. */
export function areaFactor(balance: Balance, parcel: Pick<Parcel, 'area'>): number {
  return parcel.area / balance.ranches.slotArea;
}

/**
 * Ranches der offenen Gebiete mit Geologie. Je Gebiet eigener Zufall
 * (seed + ':geologie:' + Gebiet), damit ein später freigeschaltetes Gebiet die
 * schon bekannten Ranches nicht verändert.
 */
export function generateParcels(balance: Balance, seed: string, regions: readonly string[] = initialRegions(balance.world)): Parcel[] {
  const parcels: Parcel[] = [];
  for (const regionId of regions) {
    const shapes = generateWorld(balance.world, balance.ranches, seed, [regionId]);
    if (shapes.length === 0) continue;
    const rng = new Rng(seedFromString(`${seed}:geologie:${regionId}`));
    // Eigener Strang für das Rauschen von q, damit Geologie- und Besitzer-Würfe gleich viele bleiben.
    const rauschen = new Rng(seedFromString(`${seed}:fundchance:${regionId}`));
    const trends = regionTrends(balance, seed, regionId);
    const neue: Parcel[] = shapes.map((r) => {
      const [x, y] = r.center;
      const zone = zoneFor(balance, regionId, x, y);
      const chance = parcelChance(balance, zone, trends, x, y, rauschen.float());
      const geology = rollGeology(zone, chance, rng.float());
      const range = geology === 'dry' ? undefined : balance.geology.reserves[geology];
      const roh = range ? rng.int(range.min, range.max) : 0;
      const parcel: Parcel = {
        id: r.id,
        region: regionId,
        name: r.name.de,
        nameEn: r.name.en || r.name.de,
        owner: r.owner,
        x,
        y,
        area: r.area,
        slots: r.slots,
        neighbors: r.neighbors,
        zone: zone.name,
        chance,
        geology,
        reserves: Math.round(roh * areaFactor(balance, r)),
        landowner: 'neutral',
        discovery: r.discovery,
      };
      if (r.figure) parcel.figure = r.figure;
      return parcel;
    });
    // Besitzer erst nach der ganzen Geologie würfeln, damit die Geologie
    // für einen Seed gleich bleibt, egal wie viele Besitzer-Würfe dazukommen.
    // Figuren haben eine feste Art – der Wurf wird trotzdem verbraucht.
    neue.forEach((parcel, i) => {
      const roll = rollLandowner(balance, rng.float());
      parcel.landowner = (shapes[i].landowner as LandownerType | undefined) ?? roll;
    });
    parcels.push(...neue);
  }
  return parcels;
}

/** Die Ranch einer Figur aus den Ereignissen (z. B. "moss"), falls sie auf der Karte liegt. */
export function ranchOfFigure(state: { parcels: readonly Parcel[] }, figure: string): Parcel | undefined {
  return state.parcels.find((p) => p.figure === figure);
}
