// Rundenabrechnung für Kapitel 3 (4.17). Wird in endRound (game.ts, 4.17
// Andockpunkt) nach den Zinsen und vor Transport und Pleiteprüfung aufgerufen:
// Kartellgewinn, Preisdruck und Projekterträge zählen so schon für die Pleiteprüfung.
// Reihenfolge: Seismik-Berichte, Konsortium, Projekte, Stand. Vor Kapitel 3 bleibt
// der Zustand unverändert – Kapitel 1 rechnet hier nichts.
// Was dabei geschieht (jede neue Notiz), steht danach auch in state.log – im
// Rundenbericht und in der Kladde –, sofern die Texte aus content/kapitel3.yaml
// mitgegeben werden (endRound, 4.17 Andockpunkt).

import type { Balance } from './balance';
import type { GameState } from './game';
import type { Lang } from './i18n';
import { ensureKapitel3, kapitel3Unlocked } from './kapitel3';
import type { Kapitel3Content } from './kapitel3Content';
import { logKapitel3Notes } from './kapitel3Log';
import { settleKonsortium } from './konsortium';
import { settleProjekte } from './projekte';
import { settleSurveys } from './seismik';
import { settleStand } from './stand';

export function advanceKapitel3(input: GameState, balance: Balance, texts?: Kapitel3Content, lang?: Lang): GameState {
  if (input.finished || !kapitel3Unlocked(input, balance)) return input;
  const vorher = new Set(input.kapitel3?.notes ?? []);
  const state = ensureKapitel3(input, balance);
  let k3 = settleSurveys(state, balance, state.kapitel3!);
  const [k3a, cashA] = settleKonsortium(state, balance, k3);
  const [k3b, cashB] = settleProjekte(state, balance, k3a);
  k3 = settleStand(k3b, balance);
  const neu = k3.notes.filter((n) => !vorher.has(n));
  return logKapitel3Notes({ ...state, cash: state.cash + cashA + cashB, kapitel3: k3 }, neu, texts, lang);
}
