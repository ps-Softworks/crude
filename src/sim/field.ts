// Lagerstätten (GDD §5): Das Öl liegt nicht auf einzelnen Parzellen, sondern in
// Feldern, die mehrere Parzellen umfassen. Wer im selben Feld bohrt, teilt sich
// die Förderung – ob er will oder nicht. Deshalb bremst jede neue Quelle die
// alten aus (siehe production.ts).
// Welche Parzellen zu einem Feld gehören, ergibt sich allein aus der Geologie:
// benachbarte Parzellen mit Öl werden verbunden, auch über Eck. Kein Zufall.

import type { GameState } from './game';
import type { Parcel } from './geology';

export interface Field {
  id: string;
  /** Alle Parzellen dieses Feldes, von West nach Ost und dann von Nord nach Süd. */
  parcelIds: string[];
  /** Förderbare Gesamtmenge des Feldes in Barrel (Summe der Parzellen). */
  reserves: number;
  /** Mittelpunkt des Feldes auf der Karte, gerundet. */
  x: number;
  y: number;
  /** Höchstzahl gleichzeitig fördernder Quellen bisher (für den Ausbeuteverlust). */
  peakWells: number;
}

/** Kurzname eines Feldes für Log und Meldungen, wie auf der Karte (ab 1 gezählt). */
export function fieldLabel(field: Field): string {
  return `Feld ${field.x + 1}/${field.y + 1}`;
}

function parcelKey(parcel: Pick<Parcel, 'x' | 'y'>): string {
  return `${parcel.x}:${parcel.y}`;
}

/** Fördert diese Parzelle Öl? Nur dann gehört sie zu einem Feld. */
function hasOil(parcel: Parcel): boolean {
  return parcel.reserves > 0;
}

/**
 * Verbindet alle ölführenden Parzellen, die sich (auch über Eck) berühren, zu
 * Feldern. Gescannt wird in Kartenreihenfolge, das erste Feld liegt also ganz
 * oben links. Ohne Zufall – gleiche Karte, gleiche Felder.
 */
export function buildFields(parcels: readonly Parcel[]): Field[] {
  const at = new Map(parcels.map((p) => [parcelKey(p), p]));
  const besucht = new Set<string>();
  const fields: Field[] = [];

  for (const start of parcels) {
    if (!hasOil(start) || besucht.has(start.id)) continue;
    const gruppe: Parcel[] = [];
    const offen: Parcel[] = [start];
    besucht.add(start.id);
    while (offen.length > 0) {
      const parcel = offen.pop()!;
      gruppe.push(parcel);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nachbar = at.get(`${parcel.x + dx}:${parcel.y + dy}`);
          if (nachbar && hasOil(nachbar) && !besucht.has(nachbar.id)) {
            besucht.add(nachbar.id);
            offen.push(nachbar);
          }
        }
      }
    }
    gruppe.sort((a, b) => a.y - b.y || a.x - b.x);
    const mittel = (wert: (p: Parcel) => number) =>
      Math.round(gruppe.reduce((sum, p) => sum + wert(p), 0) / gruppe.length);
    fields.push({
      id: `f-${fields.length}`,
      parcelIds: gruppe.map((p) => p.id),
      reserves: gruppe.reduce((sum, p) => sum + p.reserves, 0),
      x: mittel((p) => p.x),
      y: mittel((p) => p.y),
      peakWells: 0,
    });
  }
  return fields;
}

/** Parzellen mit den Feld-IDs der Lagerstätte versehen. Trockene bleiben ohne. */
export function assignFields(parcels: readonly Parcel[], fields: readonly Field[]): Parcel[] {
  const feldVonParzelle = new Map(fields.flatMap((f) => f.parcelIds.map((id) => [id, f.id] as const)));
  return parcels.map((p) => {
    const fieldId = feldVonParzelle.get(p.id);
    if (fieldId !== undefined) return { ...p, fieldId };
    const ohneFeld = { ...p };
    delete ohneFeld.fieldId;
    return ohneFeld;
  });
}

/** Das Feld, in dem eine Parzelle liegt – undefined, wenn dort kein Öl liegt. */
export function fieldOf(state: Pick<GameState, 'fields' | 'parcels'>, parcelId: string): Field | undefined {
  const fieldId = state.parcels.find((p) => p.id === parcelId)?.fieldId;
  return fieldId === undefined ? undefined : state.fields.find((f) => f.id === fieldId);
}