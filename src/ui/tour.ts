// Rundgang der Einstiegshilfe (0.2.15+10): beim ersten Start jeden Gegenstand
// einmal kurz zeigen. Die Texte stehen in content/rundgang.yaml; hier wird nur
// gelesen und geprüft – keine Spielregel.
import { parse } from 'yaml';
import { SHEET_IDS } from './sceneState';

/** Gegenstände, auf die der Rundgang zeigen kann. */
export const TOUR_OBJECTS = [...SHEET_IDS, 'karte', 'tuer', 'ruth'] as const;
export type TourObject = (typeof TOUR_OBJECTS)[number];

export interface TourStep {
  object: TourObject;
  text: string;
}

/** Liest content/rundgang.yaml; wirft mit verständlicher Meldung, wenn etwas nicht stimmt. */
export function parseTour(file: string, text: string): TourStep[] {
  const data = parse(text) as { schritte?: unknown } | null;
  if (!data || !Array.isArray(data.schritte)) throw new Error(`${file}: erwartet „schritte:“ mit einer Liste.`);
  return data.schritte.map((s: unknown, i) => {
    const e = s as { objekt?: unknown; text?: { de?: unknown; en?: unknown } } | null;
    if (!e || !TOUR_OBJECTS.includes(e.objekt as TourObject)) {
      throw new Error(`${file}: Schritt ${i + 1} zeigt auf „${String(e?.objekt)}“ (erlaubt: ${TOUR_OBJECTS.join(', ')}).`);
    }
    if (typeof e.text?.de !== 'string' || e.text.de.trim() === '' || typeof e.text.en !== 'string') {
      throw new Error(`${file}: Schritt ${i + 1} braucht „text“ mit de (und en, darf leer sein).`);
    }
    return { object: e.objekt as TourObject, text: e.text.de };
  });
}
