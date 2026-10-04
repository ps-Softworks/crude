// Imperiumswert (GDD §4): die Hauptkennzahl, an der Jacobs Firma gemessen wird.
//
//   Wert = Kasse + (Öl im Tank − Förderzins-Öl) · Posted Price
//        + reserveFactor · Posted Price · eigene Reserven + Anlagen + Beteiligungen − Schulden
//
// Nach dem Verkauf an den Crane Trust zählt nur noch der Kaufpreis.
// Reserven im Boden zählen nur vorsichtig (reserveFactor). Eigene Reserven sind,
// was Jacobs fördernde Quellen bei gleichbleibendem Rückgang noch aus dem Boden
// holen (Rate der nächsten Runde / Rückgang) – höchstens so viel, wie im Feld
// noch förderbar ist. Das ganze Feld zählt nicht: Am Salt Hill hängen Dutzende
// Parzellen zusammen, die Jacob nicht gehören. Wer pleite ist, hat 0.

import type { Balance } from './balance';
import { debt } from './credit';
import { logisticsAssets } from './logistics';
import type { GameState } from './game';
import { fieldStatus, fieldWells, wellRate } from './production';
import { rigAssets } from './rigs';
import { venturesValue } from './ventures';

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Barrel, die Jacobs Quellen auf einem Feld noch fördern können. */
export function ownReserves(state: GameState, balance: Balance, fieldId: string): number {
  const field = state.fields.find((f) => f.id === fieldId);
  if (!field) return 0;
  const quellen = fieldWells(state, fieldId);
  if (quellen.length === 0) return 0;
  const { decline } = balance.production;
  const kuenftig = quellen.reduce((sum, w) => sum + wellRate(balance, w, quellen.length), 0) / Math.max(decline, 0.01);
  return Math.round(Math.min(kuenftig, fieldStatus(state, balance, field).remaining));
}

/** Der Imperiumswert in $, auf Cent gerundet. */
export function empireValue(state: GameState, balance: Balance): number {
  if (state.ending === 'pleite') return 0;
  // An den Crane Trust verkauft (2.8): Die Firma ist zu Geld geworden.
  if (state.ending === 'verkauft') return state.cash;
  const tank = (state.oilStock - state.royaltyOil) * state.postedPrice;
  const imBoden = state.fields.reduce((sum, field) => sum + ownReserves(state, balance, field.id), 0);
  const reserven = balance.empire.reserveFactor * state.postedPrice * imBoden;
  // Tanks, Gespanne und Pipeline (0.2.15+2) sowie gekaufte Türme (0.2.15+7) zählen mit ihrem Buchwert,
  // Okara (4.5) mit einigen Quartalseinnahmen.
  return cents(state.cash + tank + reserven + logisticsAssets(state, balance) + rigAssets(state, balance) + venturesValue(state, balance) - debt(state));
}
