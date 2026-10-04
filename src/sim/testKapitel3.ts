// Nur für Tests: Spielstände in Kapitel 3 (4.17) und eine Runde nur für Kapitel 3.
import type { Balance } from './balance';
import { newGame, type GameState } from './game';
import type { Kapitel3Result } from './kapitel3';
import { advanceKapitel3 } from './kapitel3Runde';

/** Neue Partie, die so tut, als stünde sie in Kapitel 3 (state.chapter kommt mit 4.5). */
export function k3Game(seed: string, balance: Balance, extra: Partial<GameState> & Record<string, unknown> = {}): GameState {
  return { ...newGame(seed, balance), cash: 1_000_000, chapter: 3, ...extra } as GameState;
}

/** Nur die Kapitel-3-Abrechnung, dann die nächste Runde. */
export function k3Round(state: GameState, balance: Balance): GameState {
  const s = advanceKapitel3(state, balance);
  return { ...s, round: s.round + 1 };
}

export function k3Rounds(state: GameState, balance: Balance, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = k3Round(s, balance);
  return s;
}

export function ok(r: Kapitel3Result): GameState {
  if (!r.ok) throw new Error(`Aktion abgelehnt: ${r.reason}`);
  return r.state;
}

/** Balance mit geänderten Kapitel-3-Zahlen. */
export function withK3(balance: Balance, patch: (k: Balance['kapitel3']) => Balance['kapitel3']): Balance {
  return { ...balance, kapitel3: patch(balance.kapitel3) };
}
