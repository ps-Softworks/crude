// Imperiumswert (GDD §4): die Hauptkennzahl, an der Jacobs Firma gemessen wird.
//
//   Wert = Kasse + (Öl im Tank − Förderzins-Öl) · Posted Price
//        + reserveFactor · Posted Price · eigene Reserven − Schulden
//
// Reserven im Boden zählen nur vorsichtig (reserveFactor). Eigene Reserven sind,
// was Jacobs fördernde Quellen bei gleichbleibendem Rückgang noch aus dem Boden
// holen (Rate der nächsten Runde / Rückgang) – höchstens so viel, wie im Feld
// noch förderbar ist. Das ganze Feld zählt nicht: Am Salt Hill hängen Dutzende
// Parzellen zusammen, die Jacob nicht gehören. Wer pleite ist, hat 0.

import type { Balance } from './balance';
import { debt } from './credit';
import type { GameState } from './game';
import { fieldStatus, fieldWells, wellRate } from './production';

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
  const tank = (state.oilStock - state.royaltyOil) * state.postedPrice;
  const imBoden = state.fields.reduce((sum, field) => sum + ownReserves(state, balance, field.id), 0);
  const reserven = balance.empire.reserveFactor * state.postedPrice * imBoden;
  return cents(state.cash + tank + reserven - debt(state));
}
