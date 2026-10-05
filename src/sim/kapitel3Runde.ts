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
import { seismikClues, settleSurveys } from './seismik';
import { settleStand } from './stand';

/** Merkzeichen für Jacobs Weg mit dem Konsortium (4.19): Der Bogen „Mr. Vale“ (content/arcs.yaml) liest sie. */
export const KONSORTIUM_MARKS = {
  mitglied: 'k3_konsortium_mitglied',
  abgelehnt: 'k3_konsortium_abgelehnt',
  doppelspiel: 'k3_konsortium_doppelspiel',
  verstossen: 'k3_konsortium_verstossen',
} as const;

/** Setzt das Merkzeichen zum heutigen Weg mit dem Konsortium (einmal je Weg). */
export function syncKonsortiumMarks(state: GameState): GameState {
  const pfad = state.kapitel3?.konsortium.path;
  if (!pfad) return state;
  const mark = KONSORTIUM_MARKS[pfad];
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

export function advanceKapitel3(input: GameState, balance: Balance, texts?: Kapitel3Content, lang?: Lang): GameState {
  if (input.finished || !kapitel3Unlocked(input, balance)) return input;
  const vorher = new Set(input.kapitel3?.notes ?? []);
  const state = ensureKapitel3(input, balance);
  let k3 = settleSurveys(state, balance, state.kapitel3!);
  const [k3a, cashA] = settleKonsortium(state, balance, k3);
  const [k3b, cashB] = settleProjekte(state, balance, k3a);
  k3 = settleStand(k3b, balance);
  const neu = k3.notes.filter((n) => !vorher.has(n));
  // Seismik schärft die Erkundung: neue Berichte gehen als Hinweis ins Wissen der Ranch.
  const mitWissen = seismikClues({ ...state, cash: state.cash + cashA + cashB, kapitel3: k3 }, balance);
  return syncKonsortiumMarks(logKapitel3Notes(mitWissen, neu, texts, lang));
}
