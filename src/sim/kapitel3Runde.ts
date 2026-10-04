// Rundenabrechnung für Kapitel 3 (4.17). Wird in endRound (game.ts, 4.17
// Andockpunkt) nach den Zinsen und vor Transport und Pleiteprüfung aufgerufen:
// Kartellgewinn, Preisdruck und Projekterträge zählen so schon für die Pleiteprüfung.
// Reihenfolge: Seismik-Berichte, Konsortium, Projekte, Stand. Vor Kapitel 3 bleibt
// der Zustand unverändert – Kapitel 1 rechnet hier nichts.

import type { Balance } from './balance';
import type { GameState } from './game';
import { ensureKapitel3, kapitel3Unlocked } from './kapitel3';
import { settleKonsortium } from './konsortium';
import { settleProjekte } from './projekte';
import { settleSurveys } from './seismik';
import { settleStand } from './stand';

export function advanceKapitel3(input: GameState, balance: Balance): GameState {
  if (input.finished || !kapitel3Unlocked(input, balance)) return input;
  const state = ensureKapitel3(input, balance);
  let k3 = settleSurveys(state, balance, state.kapitel3!);
  const [k3a, cashA] = settleKonsortium(state, balance, k3);
  const [k3b, cashB] = settleProjekte(state, balance, k3a);
  k3 = settleStand(k3b, balance);
  return { ...state, cash: state.cash + cashA + cashB, kapitel3: k3 };
}
