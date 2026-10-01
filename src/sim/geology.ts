// Karte von Cordova: ein Raster aus Parzellen mit verdeckter Geologie.
// Je näher an Salt Hill, desto wahrscheinlicher Öl.

import type { Balance, GeologyType, Zone } from './balance';
import type { Rng } from './rng';

export interface Parcel {
  id: string;
  x: number;
  y: number;
  zone: string;
  /** Verdeckt: der Spieler sieht das erst nach einer Bohrung. */
  geology: GeologyType;
  /** Verdeckt: förderbare Gesamtmenge in Barrel (0 bei trocken). */
  reserves: number;
}

export function distanceToSaltHill(balance: Balance, x: number, y: number): number {
  const { saltHill } = balance.map;
  return Math.hypot(x - saltHill.x, y - saltHill.y);
}

export function zoneFor(balance: Balance, x: number, y: number): Zone {
  const d = distanceToSaltHill(balance, x, y);
  const zones = balance.geology.zones;
  return zones.find((z) => d <= z.maxDistance) ?? zones[zones.length - 1];
}

function rollGeology(zone: Zone, roll: number): GeologyType {
  if (roll < zone.dry) return 'dry';
  if (roll < zone.dry + zone.small) return 'small';
  return 'gusher';
}

export function generateParcels(balance: Balance, rng: Rng): Parcel[] {
  const parcels: Parcel[] = [];
  for (let y = 0; y < balance.map.height; y++) {
    for (let x = 0; x < balance.map.width; x++) {
      const zone = zoneFor(balance, x, y);
      const geology = rollGeology(zone, rng.float());
      const reserves =
        geology === 'dry'
          ? 0
          : rng.int(balance.geology.reserves[geology].min, balance.geology.reserves[geology].max);
      parcels.push({ id: `p-${x}-${y}`, x, y, zone: zone.name, geology, reserves });
    }
  }
  return parcels;
}
