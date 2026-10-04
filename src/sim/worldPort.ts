// Schnittstelle zu Weltmodell und Kapiteln für Ermittler und Forschung (4.11).
//
// Liest das gemeinsame Weltmodell von main (4.1/4.2, state.worldModel, WorldState in
// world.ts) – nur die Felder, die Ermittler und Forschung brauchen:
//   worldModel.mood       öffentliche Stimmung 0–100 (Geschworene)
//   worldModel.tech       Technikstand aller Firmen 0–100 (Patente und Lizenzen)
//   worldModel.government regierende Partei: handel | volksbund | provinz (Delaney versetzen)
// Fehlt ein Feld (Teilzustände in Tests), gelten die Ersatzwerte aus balance.yaml.
// Die Kapitelnummer liest der gemeinsame Helfer chapterOf (stocks.ts, state.chapter aus 4.5).

import { PARTIES, type Party, type WorldState } from './world';

export { chapterOf } from './stocks';

/** Parteien der Föderation (GDD §7.1) – dieselben wie im Weltmodell (world.ts). */
export const PORT_PARTIES = PARTIES;
export type PortParty = Party;

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

/** Liest Stimmung, Technikstand und Regierung aus state.worldModel (4.1) – fehlt etwas, gilt der Ersatzwert. */
export function worldPort(state: { worldModel?: Partial<Pick<WorldState, 'mood' | 'tech' | 'government'>> }, fallback: WorldPort): WorldPort {
  const welt = state.worldModel;
  if (typeof welt !== 'object' || welt === null) return fallback;
  const regierung: unknown = welt.government;
  return {
    mood: zahl(welt.mood) ? Math.min(100, Math.max(0, welt.mood)) : fallback.mood,
    tech: zahl(welt.tech) ? Math.min(100, Math.max(0, welt.tech)) : fallback.tech,
    government: typeof regierung === 'string' && (PARTIES as readonly string[]).includes(regierung) ? (regierung as Party) : fallback.government,
  };
}
