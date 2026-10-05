// Merkzeichen, die die Zeitsprünge (4.5, 4.19, src/sim/timeskip.ts) setzen – eigene Datei ohne
// Abhängigkeiten, damit die Inhaltsprüfung sie kennt, ohne den ganzen Sprung zu laden.
// Ereignisse in Kapitel 2 und 3 können darauf reagieren (marked: [clara_geboren], marked: [zs2_grady_reserveland]).

export const TIMESKIP_MARKS = {
  clara: 'clara_geboren',
  benzin: 'benzin_frueh',
  okara: 'okara_pachten',
  okaraOil: 'okara_fund',
  okaraBullard: 'okara_bullard',
  panicRepaid: 'schulden_vor_panik_getilgt',
  // Zeitsprung II (Story-Bibel §2)
  warExport: 'zs2_export_krieg',
  navy: 'zs2_marine_vertrag',
  grady: 'zs2_grady_reserveland',
  gradyRefused: 'zs2_grady_abgelehnt',
  college: 'zs2_thomas_college',
  noCollege: 'zs2_thomas_kein_college',
} as const;

export const TIMESKIP_SIM_MARKS: readonly string[] = Object.values(TIMESKIP_MARKS);
