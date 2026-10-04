// Figuren (2.12): welche Silhouette für welche Person steht. Die Zuordnung kommt
// aus content/figures.yaml, die Formen zeichnet Silhouette.tsx. Reine Darstellung,
// keine Spielregel. Ab 0.2.15+10 kann eine Figur auch ihren Namen tragen
// („silas: { form: muetze, name: Silas }“) – für Besucher am Schreibtisch.
import { parse } from 'yaml';

export const SILHOUETTES = ['hut', 'frau', 'kind', 'muetze', 'strohhut', 'zylinder', 'kopf'] as const;
export type SilhouetteKind = (typeof SILHOUETTES)[number];

export type Figures = Readonly<Record<string, SilhouetteKind>>;

export interface FigureCatalog {
  forms: Figures;
  /** Anzeigename, wo einer steht (sonst fehlt der Eintrag). */
  names: Readonly<Record<string, string>>;
}

function form(file: string, id: string, kind: unknown): SilhouetteKind {
  if (!SILHOUETTES.includes(kind as SilhouetteKind)) {
    throw new Error(`${file}: ${id} hat die unbekannte Silhouette „${String(kind)}“ (erlaubt: ${SILHOUETTES.join(', ')}).`);
  }
  return kind as SilhouetteKind;
}

/** Liest Silhouetten und Namen; wirft bei unbekannten Silhouetten oder kaputten Einträgen. */
export function parseFigureCatalog(file: string, text: string): FigureCatalog {
  const data: unknown = parse(text);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: erwartet eine Liste „person: silhouette“.`);
  }
  const forms: Record<string, SilhouetteKind> = {};
  const names: Record<string, string> = {};
  for (const [id, wert] of Object.entries(data)) {
    if (wert !== null && typeof wert === 'object' && !Array.isArray(wert)) {
      const eintrag = wert as Record<string, unknown>;
      const fremd = Object.keys(eintrag).filter((k) => k !== 'form' && k !== 'name');
      if (fremd.length > 0) throw new Error(`${file}: ${id} hat unbekannte Felder (${fremd.join(', ')}; erlaubt: form, name).`);
      forms[id] = form(file, id, eintrag.form);
      if (eintrag.name !== undefined) {
        if (typeof eintrag.name !== 'string' || eintrag.name.trim() === '') throw new Error(`${file}: ${id} braucht einen Namen als Text.`);
        names[id] = eintrag.name;
      }
    } else {
      forms[id] = form(file, id, wert);
    }
  }
  return { forms, names };
}

/** Liest die Zuordnung Person → Silhouette; wirft bei unbekannten Silhouetten. */
export function parseFigures(file: string, text: string): Figures {
  return parseFigureCatalog(file, text).forms;
}

/** Die Silhouette einer Person; wer fehlt, bekommt den schlichten Kopf. */
export function figureOf(figures: Figures, id: string): SilhouetteKind {
  return figures[id] ?? 'kopf';
}
