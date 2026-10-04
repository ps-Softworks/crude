// Beteiligungen (4.5): Was Jacob im Zeitsprung I außerhalb des Salt Hill beschlossen hat,
// bleibt über den Kapitelwechsel bestehen.
//
// - Benzinanlage (Weiche „die ersten Automobile“): Ab Runde since zahlt der Trust für jeden
//   verkauften Barrel timeskip.switches.automobilePremium mehr.
// - Okara (Weiche „Öl in Okara“): Wer die Pachten hält (Jacob oder Bullard), bekommt bei einem
//   Fund ab Runde since je Quartal okaraIncome × Weltpreis-Faktor. Für Jacob zählt Okara im
//   Imperiumswert mit okaraValueQuarters Quartalseinnahmen.
// Kein Zufall hier: Ob in Okara Öl kam, steht schon im Zustand (gewürfelt im Zeitsprung).

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { worldPriceFactor } from './world';

function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

export interface Ventures {
  /** Benzinanlage: Aufschlag ab dieser Runde. */
  benzin?: { since: number };
  /** Okara: wer die Pachten hält, ob dort Öl kam, Einnahmen ab dieser Runde. */
  okara?: { holder: 'jacob' | 'bullard'; oil: boolean; since: number };
}

type Lage = Pick<GameState, 'round'> & Partial<Pick<GameState, 'ventures'>>;

/** Aufschlag je Barrel aus der Benzinanlage (0, solange es keine gibt). */
export function fuelPremium(state: Lage, balance: Balance): number {
  const b = state.ventures?.benzin;
  return b && state.round >= b.since ? balance.timeskip.switches.automobilePremium : 0;
}

/** Okara-Einnahmen dieses Quartals für holder (0, wenn Okara ihm nicht gehört oder trocken ist). */
export function okaraIncome(state: Lage & Pick<GameState, 'worldModel'>, balance: Balance, holder: 'jacob' | 'bullard'): number {
  const o = state.ventures?.okara;
  if (!o || !o.oil || o.holder !== holder || state.round < o.since) return 0;
  return Math.round(balance.timeskip.switches.okaraIncome * worldPriceFactor(state.worldModel, balance.worldModel));
}

/** Wert der Beteiligungen im Imperiumswert: Okara mit okaraValueQuarters Quartalseinnahmen. */
export function venturesValue(state: Lage & Pick<GameState, 'worldModel'>, balance: Balance): number {
  const o = state.ventures?.okara;
  if (!o || !o.oil || o.holder !== 'jacob') return 0;
  const s = balance.timeskip.switches;
  return Math.round(s.okaraIncome * worldPriceFactor(state.worldModel, balance.worldModel) * s.okaraValueQuarters);
}

/** Rundenende: Okara zahlt aus – an Jacob in die Kasse, an Bullard in seine. */
export function settleVentures(state: GameState, balance: Balance): GameState {
  const jacob = okaraIncome(state, balance, 'jacob');
  const bullard = okaraIncome(state, balance, 'bullard');
  if (jacob === 0 && bullard === 0) return state;
  return {
    ...state,
    cash: state.cash + jacob,
    rival: bullard > 0 ? { ...state.rival, cash: state.rival.cash + bullard } : state.rival,
    log: jacob > 0 ? [...state.log, `${formatDate(state)}: Die Pachten in Okara bringen ${money(jacob)}.`] : state.log,
  };
}
