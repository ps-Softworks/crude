// Karte von Cordova: ein Raster aus Parzellen mit verdeckter Geologie.
// Je näher an Salt Hill, desto wahrscheinlicher Öl.

import type { Balance, GeologyType, LandownerType, Zone } from './balance';
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
  /** Wem das Land gehört; bestimmt Bonus und Förderzins der Pacht mit. */
  landowner: LandownerType;
  /** Bekannter Fund (Salt Hill): Quelle des Booms, nicht pachtbar. */
  discovery: boolean;
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
      const discovery = x === balance.map.saltHill.x && y === balance.map.saltHill.y;
      parcels.push({ id: `p-${x}-${y}`, x, y, zone: zone.name, geology, reserves, landowner: 'neutral', discovery });
    }
  }
  // Besitzer erst nach der ganzen Geologie würfeln, damit die Geologie
  // für einen Seed gleich bleibt, egal wie viele Besitzer-Würfe dazukommen.
  for (const parcel of parcels) {
    parcel.landowner = rollLandowner(balance, rng.float());
  }
  return parcels;
}
