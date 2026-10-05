// Rundgang der Einstiegshilfe (0.2.15+10): beim ersten Start jeden Gegenstand
// einmal kurz zeigen. Die Texte stehen in content/rundgang.yaml; hier wird nur
// gelesen und geprüft – keine Spielregel. 0.4.20+2/+3: eigene Rundgänge für Kapitel 2 und 3
// (content/rundgang-k2.yaml, rundgang-k3.yaml) mit eigenem Merker – sie zeigen die neuen Gegenstände.
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

/** Merker im Browser: Rundgang gesehen (Kapitel 1 behält seinen alten Schlüssel). */
export const TOUR_PREF = 'crude.rundgang';
export const TOUR_PREF_K2 = 'crude.rundgang.k2';
export const TOUR_PREF_K3 = 'crude.rundgang.k3';

/** Welcher Rundgang gehört zum Kapitel: Kapitel 1, 2 und ab 3 je ein eigener. */
export function tourFor<T>(chapter: number, tours: { k1: T; k2: T; k3: T }): { steps: T; pref: string; chapter: 1 | 2 | 3 } {
  if (chapter >= 3) return { steps: tours.k3, pref: TOUR_PREF_K3, chapter: 3 };
  return chapter === 2 ? { steps: tours.k2, pref: TOUR_PREF_K2, chapter: 2 } : { steps: tours.k1, pref: TOUR_PREF, chapter: 1 };
}

/** Kommt der Rundgang von selbst? Kapitel 1 nur mit eingeschalteter Einstiegshilfe; die Rundgänge ab Kapitel 2 immer einmal. */
export function tourAutoStart(chapter: number, tutorialOn: boolean, seen: boolean): boolean {
  if (seen) return false;
  return chapter >= 2 || tutorialOn;
}

/** Nur Schritte, deren Gegenstand gerade auf dem Tisch liegt (z. B. keine Werkstatt ohne Forschung). */
export function presentSteps(steps: readonly TourStep[], present: (object: TourObject) => boolean): TourStep[] {
  return steps.filter((s) => present(s.object));
}
