// Merkzeichen, die der Zeitsprung (4.5, src/sim/timeskip.ts) setzt – eigene Datei ohne
// Abhängigkeiten, damit die Inhaltsprüfung sie kennt, ohne den ganzen Sprung zu laden.
// Ereignisse in Kapitel 2 können darauf reagieren (marked: [clara_geboren]).

export const TIMESKIP_MARKS = {
  clara: 'clara_geboren',
  benzin: 'benzin_frueh',
  okara: 'okara_pachten',
  okaraOil: 'okara_fund',
  okaraBullard: 'okara_bullard',
  panicRepaid: 'schulden_vor_panik_getilgt',
} as const;

export const TIMESKIP_SIM_MARKS: readonly string[] = Object.values(TIMESKIP_MARKS);
