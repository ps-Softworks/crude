// Verlauf (0.4.20+42): Am Ende jeder Runde merkt sich die Simulation einen kleinen Eintrag
// (Kasse, Schulden, Imperiumswert, Förderung, Ölpreis) – daraus zeichnet das Kassenbuch seine
// Diagramme und der Kapitelbildschirm seine Statistik. Keine Spielregel; der Zustand liest ihn nie.

import type { Balance } from './balance';
import { empireValue } from './empire';
import type { GameState } from './game';
import { chapterOf } from './chapterOf';
import { totalDebt } from './stocks';

/** Ein Punkt im Verlauf – kurze Namen, damit der Spielstand klein bleibt. */
export interface HistoryEntry {
  /** Runde (fortlaufend über alle Kapitel). */
  r: number;
  /** Kapitel. */
  k: number;
  cash: number;
  debt: number;
  /** Imperiumswert in $. */
  value: number;
  /** Förderung der Runde in bbl. */
  out: number;
  /** Posted Price am Rundenende in $/bbl. */
  price: number;
}

/** Mehr als so viele Einträge hält der Spielstand nicht (älteste fallen weg). */
export const HISTORY_MAX = 400;

/** Hängt den Eintrag dieser Runde an; ein zweiter Eintrag derselben Runde ersetzt den ersten. */
export function appendHistory(state: GameState, balance: Balance, produced: number): GameState {
  const eintrag: HistoryEntry = {
    r: state.round,
    k: chapterOf(state),
    cash: Math.round(state.cash),
    debt: Math.round(totalDebt(state)),
    value: Math.round(empireValue(state, balance)),
    out: Math.max(0, Math.round(produced)),
    price: Math.round(state.postedPrice * 100) / 100,
  };
  const alt = (state.history ?? []).filter((e) => e.r !== eintrag.r);
  return { ...state, history: [...alt, eintrag].slice(-HISTORY_MAX) };
}

/** Kennzahlen für den Kapitel-/Kampagnenbildschirm. */
export interface HistoryStats {
  rounds: number;
  bestValue: number;
  bestRound: number;
  totalOutput: number;
  /** Tiefster Kassenstand. */
  lowestCash: number;
  /** Höchste Schulden. */
  peakDebt: number;
}

export function historyStats(history: readonly HistoryEntry[] | undefined): HistoryStats | null {
  if (!history || history.length === 0) return null;
  let best = history[0];
  let lowest = history[0].cash;
  let peak = 0;
  let total = 0;
  for (const e of history) {
    if (e.value > best.value) best = e;
    lowest = Math.min(lowest, e.cash);
    peak = Math.max(peak, e.debt);
    total += e.out;
  }
  return { rounds: history.length, bestValue: best.value, bestRound: best.r, totalOutput: total, lowestCash: lowest, peakDebt: peak };
}
