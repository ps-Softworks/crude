// Lagerstätten (GDD §5): Das Öl liegt nicht auf einzelnen Ranches, sondern in
// Feldern, die mehrere Ranches umfassen. Wer im selben Feld bohrt, teilt sich
// die Förderung – ob er will oder nicht. Deshalb bremst jede neue Quelle die
// alten aus (siehe production.ts).
// Welche Ranches zu einem Feld gehören, ergibt sich allein aus der Geologie:
// Ranches mit Öl und gemeinsamer Grenze (neighbors) werden verbunden. Kein Zufall.

import type { GameState } from './game';
import type { Parcel } from './geology';

export interface Field {
  id: string;
  /** Alle Ranches dieses Feldes, von Nord nach Süd und dann von West nach Ost. */
  parcelIds: string[];
  /** Förderbare Gesamtmenge des Feldes in Barrel (Summe der Ranches). */
  reserves: number;
  /** Mittelpunkt des Feldes auf der Karte (Mittel der Ranch-Mitten). */
  x: number;
  y: number;
  /** Name für Log und Karte: nach der Ranch mit den meisten Reserven. */
  name: string;
  /** Höchstzahl gleichzeitig fördernder Quellen bisher (für den Ausbeuteverlust). */
  peakWells: number;
}

/** Kurzname eines Feldes für Log und Meldungen. */
export function fieldLabel(field: Pick<Field, 'name'>): string {
  return `Feld bei ${field.name}`;
}

/** Liegt unter dieser Ranch Öl? Nur dann gehört sie zu einem Feld. */
function hasOil(parcel: Parcel): boolean {
  return parcel.reserves > 0;
}

/**
 * Verbindet alle ölführenden Ranches mit gemeinsamer Grenze zu Feldern.
 * Gescannt wird in Listenreihenfolge (Nord nach Süd), das erste Feld liegt also
 * ganz oben. Ohne Zufall – gleiche Karte, gleiche Felder.
 */
export function buildFields(parcels: readonly Parcel[]): Field[] {
  const byId = new Map(parcels.map((p) => [p.id, p]));
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
      for (const id of parcel.neighbors) {
        const nachbar = byId.get(id);
        if (nachbar && hasOil(nachbar) && !besucht.has(nachbar.id)) {
          besucht.add(nachbar.id);
          offen.push(nachbar);
        }
      }
    }
    gruppe.sort((a, b) => a.y - b.y || a.x - b.x);
    const mittel = (wert: (p: Parcel) => number) => gruppe.reduce((sum, p) => sum + wert(p), 0) / gruppe.length;
    const groesste = gruppe.reduce((best, p) => (p.reserves > best.reserves ? p : best), gruppe[0]);
    fields.push({
      id: `f-${fields.length}`,
      parcelIds: gruppe.map((p) => p.id),
      reserves: gruppe.reduce((sum, p) => sum + p.reserves, 0),
      x: mittel((p) => p.x),
      y: mittel((p) => p.y),
      name: groesste.name,
      peakWells: 0,
    });
  }
  return fields;
}

/** Ranches mit den Feld-IDs der Lagerstätte versehen. Trockene bleiben ohne. */
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

/** Das Feld, in dem eine Ranch liegt – undefined, wenn dort kein Öl liegt. */
export function fieldOf(state: Pick<GameState, 'fields' | 'parcels'>, parcelId: string): Field | undefined {
  const fieldId = state.parcels.find((p) => p.id === parcelId)?.fieldId;
  return fieldId === undefined ? undefined : state.fields.find((f) => f.id === fieldId);
}