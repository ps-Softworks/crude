// Imperiumswert (GDD §4): die Hauptkennzahl, an der Jacobs Firma gemessen wird.
//
//   Wert = Kasse + (Öl im Tank − Förderzins-Öl) · Posted Price
//        + reserveFactor · Posted Price · noch förderbare Barrel − Schulden
//
// Reserven im Boden zählen nur vorsichtig (reserveFactor), und nur auf Feldern,
// auf denen Jacob mindestens eine fördernde Quelle hat. Wer pleite ist, hat 0.

import type { Balance } from './balance';
import { debt } from './credit';
import type { GameState } from './game';
import { fieldStatus } from './production';

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Der Imperiumswert in $, auf Cent gerundet. */
export function empireValue(state: GameState, balance: Balance): number {
  if (state.ending === 'pleite') return 0;
  const tank = (state.oilStock - state.royaltyOil) * state.postedPrice;
  const imBoden = state.fields.reduce((sum, field) => {
    const lage = fieldStatus(state, balance, field);
    return lage.wells > 0 ? sum + lage.remaining : sum;
  }, 0);
  const reserven = balance.empire.reserveFactor * state.postedPrice * imBoden;
  return cents(state.cash + tank + reserven - debt(state));
}
