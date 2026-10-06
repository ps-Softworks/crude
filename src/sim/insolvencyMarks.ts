// Merkzeichen der Pleitefrist (insolvency.ts) – eigene Datei, damit eventContent.ts sie ohne Zirkel-Import kennt.

/** Vale hat Jacob in der Pleitefrist gerettet – einmal je Spiel; einige Runden später fordert er seinen Gefallen. */
export const VALE_RESCUE_MARK = 'vale_rettung';

export const INSOLVENCY_SIM_MARKS: readonly string[] = [VALE_RESCUE_MARK];
