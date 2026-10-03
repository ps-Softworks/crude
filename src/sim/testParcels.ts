// Nur für Tests: kleine Ranches von Hand, ohne Karte und Zufall.
import type { Parcel } from './geology';

/** Eine Ranch mit vernünftigen Standardwerten; alles Nötige per patch. */
export function fakeParcel(id: string, patch: Partial<Parcel> = {}): Parcel {
  return {
    id,
    region: 'test',
    name: `Ranch ${id}`,
    nameEn: `Ranch ${id}`,
    owner: 'Familie Test',
    x: 0,
    y: 0,
    area: 1.5,
    slots: 1,
    neighbors: [],
    zone: 'test',
    geology: 'dry',
    reserves: 0,
    landowner: 'neutral',
    discovery: false,
    ...patch,
  };
}

/**
 * Kleines Testraster wie früher: 'o' = Öl, '.' = trocken, eine Zeile je Kartenreihe.
 * Jedes Feld ist eine Ranch p-x-y; Nachbarn sind die 8 umliegenden Felder (auch über Eck).
 */
export function gridParcels(karte: string[]): Parcel[] {
  const h = karte.length;
  return karte.flatMap((zeile, y) =>
    [...zeile].map((zeichen, x) => {
      const neighbors: string[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && ny >= 0 && ny < h && nx >= 0 && nx < karte[ny].length) neighbors.push(`p-${nx}-${ny}`);
        }
      }
      return fakeParcel(`p-${x}-${y}`, {
        x,
        y,
        neighbors,
        geology: zeichen === 'o' ? 'small' : 'dry',
        reserves: zeichen === 'o' ? 1000 : 0,
      });
    }),
  );
}
