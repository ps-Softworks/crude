// Nur für Tests: Spielstände in Kapitel 3 (4.17) und eine Runde nur für Kapitel 3.
import { readFileSync } from 'node:fs';
import type { Balance } from './balance';
import { newGame, type GameState } from './game';
import type { Kapitel3Result } from './kapitel3';
import { parseKapitel3Content, type Kapitel3Content } from './kapitel3Content';
import { advanceKapitel3 } from './kapitel3Runde';

/** Die echten Texte aus content/kapitel3.yaml. */
export function loadKapitel3Texts(): Kapitel3Content {
  const text = readFileSync(new URL('../../content/kapitel3.yaml', import.meta.url), 'utf8');
  const { content, errors } = parseKapitel3Content('content/kapitel3.yaml', text);
  if (!content) throw new Error(errors.map((e) => e.message).join('\n'));
  return content;
}

/**
 * Technikstand der Welt in Testpartien: so viel hat eine langsame Welt (4.1) zu
 * Beginn von Kapitel 3 (Runde ~81) – nach der Weltkurve allein erst Stufe II.
 */
export const K3_TECH = 22;

/**
 * Setzt den Technikstand im Weltmodell ausdrücklich – mit und ohne 4.1 im Spielstand
 * (vorhandene Weltgrößen bleiben, nur tech wird überschrieben).
 */
export function withTech(state: GameState, tech: number): GameState {
  const welt = (state as { worldModel?: object }).worldModel;
  return { ...state, worldModel: { ...welt, tech } } as GameState;
}

/** Neue Partie, die so tut, als stünde sie in Kapitel 3 (state.chapter kommt mit 4.5). */
export function k3Game(seed: string, balance: Balance, extra: Partial<GameState> & Record<string, unknown> = {}): GameState {
  return { ...withTech(newGame(seed, balance), K3_TECH), cash: 1_000_000, chapter: 3, ...extra } as GameState;
}

/** Nur die Kapitel-3-Abrechnung, dann die nächste Runde. */
export function k3Round(state: GameState, balance: Balance, texts?: Kapitel3Content): GameState {
  const s = advanceKapitel3(state, balance, texts);
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
