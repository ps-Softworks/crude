// Hallstead (4.16): Rundenende für Nebeninvestments und Lobbyist, und was andere
// Systeme davon wissen dürfen. Einstieg für game.ts (Andockpunkt endRound).
//
// Reihenfolge am Rundenende: erst die Beteiligungen (Werte, Erträge), dann die
// Lobby (Gehalt, Gefallen, Wahlausgang). Beide würfeln aus demselben eigenen
// Rng, in fester Reihenfolge. Ohne Hallstead-Zustand (Kapitel 1, oder Jacob war
// noch nie dort) bleibt der Zustand unverändert – dasselbe Objekt.

import type { Balance } from './balance';
import type { GameState } from './game';
import { empireValue } from './empire';
import { hallsteadOf, hallsteadUnlocked } from './hallsteadState';
import { campaignMoodShift, holdingsValue, settleHoldings } from './holdings';
import { politicalWeight, politicsUnlocked, settleLobby } from './lobby';

export function settleHallstead(state: GameState, balance: Balance): GameState {
  // 0.4.20+17 Provinzpolitik: In Kapitel 2 rechnet nur die Politik ab (Gefallen, Spenden, Druck), Hallstead selbst erst ab Kapitel 3.
  if (!hallsteadUnlocked(state, balance)) {
    if (!politicsUnlocked(state, balance)) return state;
    const p = settleLobby(state, balance, hallsteadOf(state, balance), politicalWeight(empireValue(state, balance), balance));
    return { ...p.state, hallstead: { ...p.h, news: p.news } };
  }
  const h0 = state.hallstead;
  if (!h0) return state;
  const a = settleHoldings(state, balance, h0);
  const b = settleLobby(a.state, balance, a.h, politicalWeight(empireValue(state, balance), balance));
  return { ...b.state, hallstead: { ...b.h, news: [...a.news, ...b.news] } };
}

/** Buchwert in Hallstead für den Imperiumswert (Andockpunkt empire.ts). */
export function hallsteadAssets(state: Pick<GameState, 'hallstead'>): number {
  return holdingsValue(state);
}

/**
 * Was Hallstead in die Welt gibt (Andockpunkt Weltmodell 4.1, Form wie WorldInput):
 * die Kampagne der eigenen Zeitung hebt die Stimmung – einmalig in der Runde der Kampagne
 * (WorldInput.moodKick seit 4.2; moodShift ist dort ein dauerhafter Eingriff).
 */
export function hallsteadWorldInput(state: GameState, balance: Balance): { moodKick: number } {
  return { moodKick: campaignMoodShift(state, balance) };
}

export { hallsteadUnlocked } from './hallsteadState';
