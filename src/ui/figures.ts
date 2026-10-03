// Figuren (2.12): welche Silhouette für welche Person steht. Die Zuordnung kommt
// aus content/figures.yaml, die Formen zeichnet Silhouette.tsx. Reine Darstellung,
// keine Spielregel.
import { parse } from 'yaml';

export const SILHOUETTES = ['hut', 'frau', 'kind', 'muetze', 'strohhut', 'zylinder', 'kopf'] as const;
export type SilhouetteKind = (typeof SILHOUETTES)[number];

export type Figures = Readonly<Record<string, SilhouetteKind>>;

/** Liest die Zuordnung Person → Silhouette; wirft bei unbekannten Silhouetten. */
export function parseFigures(file: string, text: string): Figures {
  const data: unknown = parse(text);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: erwartet eine Liste „person: silhouette“.`);
  }
  const result: Record<string, SilhouetteKind> = {};
  for (const [id, kind] of Object.entries(data)) {
    if (!SILHOUETTES.includes(kind as SilhouetteKind)) {
      throw new Error(`${file}: ${id} hat die unbekannte Silhouette „${String(kind)}“ (erlaubt: ${SILHOUETTES.join(', ')}).`);
    }
    result[id] = kind as SilhouetteKind;
  }
  return result;
}

/** Die Silhouette einer Person; wer fehlt, bekommt den schlichten Kopf. */
export function figureOf(figures: Figures, id: string): SilhouetteKind {
  return figures[id] ?? 'kopf';
}
