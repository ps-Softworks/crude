// Spielzustand und Rundenschleife. Alles hier ist reine Logik:
// Funktionen bekommen einen Zustand und geben einen neuen zurück.

import type { Balance } from './balance';
import { generateParcels, type Parcel } from './geology';
import { Rng, seedFromString, type RngState } from './rng';

export const SEASONS = ['Frühjahr', 'Sommer', 'Herbst', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export interface GameState {
  seed: string;
  rng: RngState;
  /** Aktuelle Runde, beginnt bei 1. */
  round: number;
  totalRounds: number;
  startYear: number;
  cash: number;
  parcels: Parcel[];
  finished: boolean;
  log: string[];
}

export function dateOf(state: Pick<GameState, 'round' | 'startYear'>): { season: Season; year: number } {
  const index = state.round - 1;
  return { season: SEASONS[index % 4], year: state.startYear + Math.floor(index / 4) };
}

export function formatDate(state: Pick<GameState, 'round' | 'startYear'>): string {
  const { season, year } = dateOf(state);
  return `${season} ${year}`;
}

export function newGame(seed: string, balance: Balance): GameState {
  const rng = new Rng(seedFromString(seed));
  const parcels = generateParcels(balance, rng);
  const state: GameState = {
    seed,
    rng: rng.state,
    round: 1,
    totalRounds: balance.start.rounds,
    startYear: balance.start.year,
    cash: balance.start.cash,
    parcels,
    finished: false,
    log: [],
  };
  state.log = [`${formatDate(state)}: Jacob Harlan kommt in Port Ellis an.`];
  return state;
}

/** Schließt die aktuelle Runde ab. Nach der letzten Runde ist das Kapitel beendet. */
export function endRound(state: GameState): GameState {
  if (state.finished) return state;
  if (state.round >= state.totalRounds) {
    return { ...state, finished: true, log: [...state.log, `${formatDate(state)}: Kapitel 1 ist zu Ende.`] };
  }
  const next = { ...state, round: state.round + 1 };
  return { ...next, log: [...state.log, `${formatDate(next)}: Eine neue Runde beginnt.`] };
}
