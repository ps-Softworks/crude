// Spielzustand und Rundenschleife. Alles hier ist reine Logik:
// Funktionen bekommen einen Zustand und geben einen neuen zurück.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { makeForecasts, type Forecast } from './forecast';
import { generateParcels, type Parcel } from './geology';
import { parcelLabel, settleLeases, startOptions, type Lease, type LeaseOption } from './lease';
import { Rng, seedFromString, type RngState } from './rng';

export { SEASONS, dateOf, formatDate, type Season } from './calendar';

export interface GameState {
  seed: string;
  rng: RngState;
  /** Aktuelle Runde, beginnt bei 1. */
  round: number;
  totalRounds: number;
  startYear: number;
  cash: number;
  parcels: Parcel[];
  leases: Lease[];
  options: LeaseOption[];
  /** Geologen-Prognose je Parzelle; für die Entdeckungsquelle gibt es keine. */
  forecasts: Record<string, Forecast>;
  finished: boolean;
  log: string[];
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
    leases: [],
    options: [],
    forecasts: {},
    finished: false,
    log: [],
  };
  // Erst die Startoptionen, dann die Prognosen: so bleiben Karte und Startoptionen
  // bei gleichem Seed so, wie sie es vor der Prognose waren.
  state.options = startOptions(state, balance, rng);
  state.forecasts = makeForecasts(balance, parcels, balance.forecast.geologist, rng);
  state.rng = rng.state;
  const date = formatDate(state);
  state.log = [`${date}: Jacob Harlan kommt in Port Ellis an.`];
  if (state.options.length > 0) {
    const labels = state.options.map((o) => parcelLabel(state.parcels.find((p) => p.id === o.parcelId)!));
    state.log.push(`${date}: Jacob hat freie Pachtoptionen auf den Parzellen ${labels.join(' und ')}.`);
  }
  return state;
}

/**
 * Schließt die aktuelle Runde ab: erst die Pacht-Abrechnung (Verfall,
 * Verzögerungszins), dann die nächste Runde. Nach der letzten Runde ist das Kapitel beendet.
 */
export function endRound(input: GameState, balance: Balance): GameState {
  if (input.finished) return input;
  const state = settleLeases(input, balance);
  if (state.round >= state.totalRounds) {
    return { ...state, finished: true, log: [...state.log, `${formatDate(state)}: Kapitel 1 ist zu Ende.`] };
  }
  const next = { ...state, round: state.round + 1 };
  return { ...next, log: [...state.log, `${formatDate(next)}: Eine neue Runde beginnt.`] };
}
