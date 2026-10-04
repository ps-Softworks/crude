// Schnittstelle zu Weltmodell und Kapiteln für Ermittler und Forschung (4.11).
//
// Block A (4.1 Weltmodell, 4.5 Zeitsprünge/Kapitel 2) entsteht parallel. Damit
// 4.11 nicht darauf warten muss, liest dieses Modul nur ganz schmal, was es
// braucht – und nimmt Ersatzwerte (aus balance.yaml), solange es das noch nicht gibt:
//   chapter          Kapitelnummer im Spielzustand (fehlt sie: Kapitel 1)
//   worldModel.mood       öffentliche Stimmung 0–100 (Geschworene)
//   worldModel.tech       Technikstand aller Firmen 0–100 (Patente und Lizenzen)
//   worldModel.government regierende Partei: handel | volksbund | provinz (Delaney versetzen)
//
// Block A (4.1, main 9d1d837) legt das Weltmodell unter state.worldModel ab (WorldState
// in world.ts, Felder mood/tech/government). Gelesen wird zuerst worldModel, ersatzweise
// ein älteres state.world, sonst gelten die Ersatzwerte.
//
// 4.11 Andockpunkt: Bei der Zusammenführung können chapterOf und worldPort direkt
// auf die echten Felder von GameState zeigen (state.chapter, state.worldModel).

/** Parteien der Föderation (GDD §7.1) – gleiche Namen wie im Weltmodell 4.1. */
export const PORT_PARTIES = ['handel', 'volksbund', 'provinz'] as const;
export type PortParty = (typeof PORT_PARTIES)[number];

/** Was Ermittler und Forschung von der Welt wissen müssen. */
export interface WorldPort {
  /** Öffentliche Stimmung 0–100 (50 = neutral; niedrig = schlecht für reiche Angeklagte). */
  mood: number;
  /** Technikstand aller Firmen 0–100. */
  tech: number;
  /** Regierende Partei, oder null, solange es kein Weltmodell gibt. */
  government: PortParty | null;
}

function zahl(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Kapitel des Spielzustands; ohne Feld chapter (Kapitel 1 bis 4.5) gilt 1. */
export function chapterOf(state: object): number {
  const c = (state as { chapter?: unknown }).chapter;
  return zahl(c) && c >= 1 ? Math.floor(c) : 1;
}

/** Liest Stimmung, Technikstand und Regierung aus state.worldModel (Block A, 4.1), ersatzweise state.world – fehlt etwas, gilt der Ersatzwert. */
export function worldPort(state: object, fallback: WorldPort): WorldPort {
  const s = state as { worldModel?: unknown; world?: unknown };
  const w = typeof s.worldModel === 'object' && s.worldModel !== null ? s.worldModel : s.world;
  if (typeof w !== 'object' || w === null) return fallback;
  const welt = w as { mood?: unknown; tech?: unknown; government?: unknown };
  const regierung = welt.government;
  return {
    mood: zahl(welt.mood) ? Math.min(100, Math.max(0, welt.mood)) : fallback.mood,
    tech: zahl(welt.tech) ? Math.min(100, Math.max(0, welt.tech)) : fallback.tech,
    government: typeof regierung === 'string' && (PORT_PARTIES as readonly string[]).includes(regierung) ? (regierung as PortParty) : fallback.government,
  };
}
