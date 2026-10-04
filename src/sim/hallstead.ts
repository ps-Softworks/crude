// Hallstead (4.16): Rundenende für Nebeninvestments und Lobbyist, und was andere
// Systeme davon wissen dürfen. Einstieg für game.ts (Andockpunkt endRound).
//
// Reihenfolge am Rundenende: erst die Beteiligungen (Werte, Erträge), dann die
// Lobby (Gehalt, Gefallen, Wahlausgang). Beide würfeln aus demselben eigenen
// Rng, in fester Reihenfolge. Ohne Hallstead-Zustand (Kapitel 1, oder Jacob war
// noch nie dort) bleibt der Zustand unverändert – dasselbe Objekt.

import type { Balance } from './balance';
import type { GameState } from './game';
import { hallsteadUnlocked } from './hallsteadState';
import { campaignMoodShift, holdingsValue, settleHoldings } from './holdings';
import { settleLobby } from './lobby';

export function settleHallstead(state: GameState, balance: Balance): GameState {
  const h0 = state.hallstead;
  if (!h0 || !hallsteadUnlocked(state, balance)) return state;
  const a = settleHoldings(state, balance, h0);
  const b = settleLobby(a.state, balance, a.h);
  return { ...b.state, hallstead: { ...b.h, news: [...a.news, ...b.news] } };
}

/** Buchwert in Hallstead für den Imperiumswert (Andockpunkt empire.ts). */
export function hallsteadAssets(state: Pick<GameState, 'hallstead'>): number {
  return holdingsValue(state);
}

/**
 * Was Hallstead in die Welt gibt (Andockpunkt Weltmodell 4.1, Form wie WorldInput):
 * die Kampagne der eigenen Zeitung hebt die Stimmung.
 */
export function hallsteadWorldInput(state: GameState, balance: Balance): { moodShift: number } {
  return { moodShift: campaignMoodShift(state, balance) };
}

export { hallsteadUnlocked } from './hallsteadState';
