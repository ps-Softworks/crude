// Karte von Cordova: Ranches und Farmen (src/sim/ranches.ts) mit verdeckter
// Geologie. Je näher die Mitte einer Ranch am Salzdom liegt, desto
// wahrscheinlicher Öl; große Ranches haben mehr Reserven.
// Seit 0.2.15+5 kein Raster mehr: x/y ist die Mitte der Ranch in Karteneinheiten.
// Die Umrisse stehen nicht im Spielzustand (und nicht im Spielstand) – sie
// werden aus dem Seed neu erzeugt (generateWorld), wenn die Karte sie braucht.

import type { Balance, GeologyType, LandownerType, Zone } from './balance';
import { generateWorld, initialRegions } from './ranches';
import { Rng, seedFromString } from './rng';
import { regionById } from './worldMap';

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
  /** Verdeckt: der Spieler sieht das erst nach einer Bohrung. */
  geology: GeologyType;
  /** Verdeckt: förderbare Gesamtmenge in Barrel (0 bei trocken). */
  reserves: number;
  /** Wie der Landbesitzer verhandelt; bestimmt Bonus und Förderzins der Pacht mit. */
  landowner: LandownerType;
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

function rollGeology(zone: Zone, roll: number): GeologyType {
  if (roll < zone.dry) return 'dry';
  if (roll < zone.dry + zone.small) return 'small';
  return 'gusher';
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
    const neue: Parcel[] = shapes.map((r) => {
      const [x, y] = r.center;
      const zone = zoneFor(balance, regionId, x, y);
      const geology = rollGeology(zone, rng.float());
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
