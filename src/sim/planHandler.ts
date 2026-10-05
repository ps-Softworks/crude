// Regel einer Karte des Planungsbretts (Termine als Hauptwerkzeug). Eigene Datei, damit
// die Regeln der Etappe 2 (src/sim/pricing.ts, src/sim/freight.ts) sie benutzen können,
// ohne src/sim/plans.ts zu importieren (plans.ts sammelt alle Regeln ein).

import type { Balance } from './balance';
import type { GameState } from './game';

/** Eine Möglichkeit einer Karte mit target „option“ (z. B. „4 Runden · 3.000 bbl“). */
export interface PlanOption {
  id: string;
  label: string;
  /** Warum diese Möglichkeit gerade nicht geht, oder null. */
  reason: string | null;
}

/** Regel einer Karte: Sichtbarkeit, Sperrgrund, Kosten, Möglichkeiten, Hinweise und Wirkung. */
export interface PlanHandler {
  /** Liegt die Karte überhaupt auf der Hand? (z. B. „Pakt halten“ nur, solange ein Pakt läuft) */
  visible?(state: GameState, balance: Balance): boolean;
  lock?(state: GameState, balance: Balance, target?: string): string | null;
  cost?(state: GameState, balance: Balance, target?: string): number;
  /** Möglichkeiten einer Karte mit target „option“. */
  options?(state: GameState, balance: Balance): PlanOption[];
  /** Lage in einem Satz, z. B. die Druckmittel gegen Thorne. */
  detail?(state: GameState, balance: Balance): string | null;
  /** Warnung, die nicht sperrt (z. B. Brennan bei laufendem Exklusivvertrag). */
  warning?(state: GameState, balance: Balance): string | null;
  apply(state: GameState, balance: Balance, target?: string): GameState;
}
