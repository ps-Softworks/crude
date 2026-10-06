// Merkzeichen der Geldquellen (financing.ts) – eigene Datei ohne Abhängigkeiten, damit die Inhaltsprüfung
// (eventContent.ts, eventRelevance.ts) sie lesen kann, ohne die ganze Simulation zu laden.

export const INVESTORS = ['sloane', 'haskell', 'whitcomb'] as const;
export type InvestorId = (typeof INVESTORS)[number];

/** Die Simulation setzt sie: Wunsch gebrochen (Beschwerdebrief), Geld verloren (Drama), Vale will seinen Gefallen. */
export function investorUpsetMark(id: InvestorId): string {
  return `${id}_verstimmt`;
}
export function investorRuinedMark(id: InvestorId): string {
  return `${id}_ruiniert`;
}
/** Antworten, die die Simulation liest: vorzeitig auszahlen, aus eigener Tasche entschädigen. */
export function investorPayoutMark(id: InvestorId): string {
  return `${id}_auszahlen`;
}
export function investorCompensateMark(id: InvestorId): string {
  return `${id}_entschaedigt`;
}

export const VALE_FAVOR_DUE = 'vale_gefallen_faellig';
export const VALE_FAVOR_REFUSED = 'vale_gefallen_verweigert';

export const FINANCING_SIM_MARKS: readonly string[] = [...INVESTORS.flatMap((id) => [investorUpsetMark(id), investorRuinedMark(id)]), VALE_FAVOR_DUE];
export const FINANCING_READ_MARKS: readonly string[] = [...INVESTORS.flatMap((id) => [investorPayoutMark(id), investorCompensateMark(id)]), VALE_FAVOR_REFUSED];
