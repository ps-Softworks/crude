// Spielzustand und Rundenschleife. Alles hier ist reine Logik:
// Funktionen bekommen einen Zustand und geben einen neuen zurück.

import type { Balance, TransportMode } from './balance';
import { formatDate } from './calendar';
import { advanceDrilling, type Well } from './drilling';
import { assignFields, buildFields, type Field } from './field';
import { makeForecasts, type Forecast } from './forecast';
import { generateParcels, type Parcel } from './geology';
import { parcelLabel, settleLeases, startOptions, type Lease, type LeaseOption } from './lease';
import { advanceProduction } from './production';
import { Rng, seedFromString, type RngState } from './rng';
import { advanceTransport } from './transport';

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
  /** Lagerstätten: verbundene ölführende Parzellen mit ihren Reserven. */
  fields: Field[];
  /** Öl in den Tanks in Barrel (Jacobs Anteil plus Förderzins-Öl). */
  oilStock: number;
  /** Barrel im Tank, die den Landbesitzern gehören (Förderzins); beim Verkauf ausgezahlt. */
  royaltyOil: number;
  /** Aktueller Bahntarif in $ je Barrel – Thorne kann ihn erhöhen. */
  railTariff: number;
  /** In dieser Runde verschickte Barrel je Transportmittel. */
  shipped: Record<TransportMode, number>;
  leases: Lease[];
  options: LeaseOption[];
  /** Geologen-Prognose je Parzelle; für die Entdeckungsquelle gibt es keine. */
  forecasts: Record<string, Forecast>;
  /** Bohrungen, auch abgeschlossene. */
  wells: Well[];
  finished: boolean;
  log: string[];
}

export function newGame(seed: string, balance: Balance): GameState {
  const rng = new Rng(seedFromString(seed));
  const geologie = generateParcels(balance, rng);
  const fields = buildFields(geologie);
  const parcels = assignFields(geologie, fields);
  const state: GameState = {
    seed,
    rng: rng.state,
    round: 1,
    totalRounds: balance.start.rounds,
    startYear: balance.start.year,
    cash: balance.start.cash,
    parcels,
    fields,
    oilStock: 0,
    royaltyOil: 0,
    railTariff: balance.transport.rail.costPerBarrel,
    shipped: { wagon: 0, rail: 0 },
    leases: [],
    options: [],
    forecasts: {},
    wells: [],
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
 * Schließt die aktuelle Runde ab: erst die Förderung, dann die Bohrungen, dann die
 * Pacht-Abrechnung (Verfall, Verzögerungszins), dann der Transport (Thorne und
 * der Bahntarif, Kapazitäten wieder frei), dann die nächste Runde. Die
 * Förderung kommt zuerst, damit eine Quelle, die gerade ihren Abschlussbohrung
 * hinter sich hat, erst in der nächsten Runde Öl liefert. Nach der letzten Runde
 * ist das Kapitel beendet.
 */
export function endRound(input: GameState, balance: Balance): GameState {
  if (input.finished) return input;
  const state = advanceTransport(
    settleLeases(advanceDrilling(advanceProduction(input, balance), balance), balance),
    balance,
  );
  if (state.round >= state.totalRounds) {
    return { ...state, finished: true, log: [...state.log, `${formatDate(state)}: Kapitel 1 ist zu Ende.`] };
  }
  const next = { ...state, round: state.round + 1 };
  return { ...next, log: [...state.log, `${formatDate(next)}: Eine neue Runde beginnt.`] };
}
