// Transport und Verkauf (GDD §6): Das Öl aus dem Tank geht per Fuhrwerk oder
// per Bahn zum Crane Trust und wird zum Posted Price verkauft. Die Bahn gehört
// Augustus Thorne: Sie ist billiger, aber wer sie nutzt, gibt Thorne die
// Gelegenheit, den Tarif zu erhöhen.

import type { Balance, TransportMode } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { Rng } from './rng';
import { hikeChance as thorneHikeChance, jacobPrice, railFrozen } from './trust';

/** Auf ganze Cent runden. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dollars(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fracht in $ je Barrel: Fuhrwerk fest, Bahn nach Thornes aktuellem Tarif. */
export function tariff(state: Pick<GameState, 'railTariff'>, balance: Balance, mode: TransportMode): number {
  return mode === 'rail' ? state.railTariff : balance.transport.wagon.costPerBarrel;
}

/** Wie viele Barrel dieses Transportmittel in dieser Runde noch schafft. */
export function capacityLeft(state: Pick<GameState, 'shipped'>, balance: Balance, mode: TransportMode): number {
  return Math.max(0, balance.transport[mode].capacity - state.shipped[mode]);
}

/** Wer Öl verkauft, braucht Preis, Runde und (für Cranes Abschlag, 2.8) die Merkzeichen. */
type Verkaufslage = Pick<GameState, 'railTariff' | 'postedPrice' | 'round'> & Partial<Pick<GameState, 'events'>>;

/** Was je Barrel nach Fracht übrig bleibt (vor Förderzins): Preis des Trusts (Posted Price minus Abschlag, 2.8) minus Fracht. */
export function netPrice(state: Verkaufslage, balance: Balance, mode: TransportMode): number {
  return cents(jacobPrice(state, balance) - tariff(state, balance, mode));
}

export interface SaleQuote {
  barrels: number;
  /** Erlös zum Posted Price. */
  gross: number;
  /** Fracht. */
  transportCost: number;
  /** Anteil der Landbesitzer (Förderzins) in $. */
  royalty: number;
  /** Was in Jacobs Kasse landet. */
  net: number;
}

/** Barrel Förderzins-Öl, die in einer Lieferung stecken (anteilig am Tank). */
function royaltyBarrels(state: Pick<GameState, 'oilStock' | 'royaltyOil'>, barrels: number): number {
  return state.oilStock > 0 ? (barrels * state.royaltyOil) / state.oilStock : 0;
}

/** Rechnet einen Verkauf durch, ohne etwas zu ändern. Der Trust zahlt den Posted Price minus Cranes Abschlag (2.8). */
export function quoteSale(
  state: Verkaufslage & Pick<GameState, 'oilStock' | 'royaltyOil'>,
  balance: Balance,
  mode: TransportMode,
  barrels: number,
): SaleQuote {
  const price = jacobPrice(state, balance);
  const gross = cents(barrels * price);
  const transportCost = cents(barrels * tariff(state, balance, mode));
  const royalty = cents(royaltyBarrels(state, barrels) * price);
  return { barrels, gross, transportCost, royalty, net: cents(gross - transportCost - royalty) };
}

export type SaleResult = { ok: true; state: GameState; quote: SaleQuote } | { ok: false; reason: string };

/** Verkauft Öl aus dem Tank über das gewählte Transportmittel. */
export function sellOil(
  state: GameState,
  balance: Balance,
  mode: TransportMode,
  barrels: number,
): SaleResult {
  const label = balance.transport[mode].label;
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  if (!Number.isInteger(barrels) || barrels <= 0) {
    return { ok: false, reason: 'Die Menge muss eine ganze Zahl über 0 sein.' };
  }
  if (barrels > Math.floor(state.oilStock)) {
    return { ok: false, reason: `So viel Öl ist nicht im Tank (${Math.floor(state.oilStock)} Barrel).` };
  }
  const frei = capacityLeft(state, balance, mode);
  if (barrels > frei) {
    return { ok: false, reason: `${label}: in dieser Runde nur noch ${frei} Barrel frei.` };
  }
  const quote = quoteSale(state, balance, mode, barrels);
  const per = mode === 'rail' ? 'per Bahn' : 'per Fuhrwerk';
  return {
    ok: true,
    quote,
    state: {
      ...state,
      oilStock: state.oilStock - barrels,
      royaltyOil: Math.max(0, state.royaltyOil - royaltyBarrels(state, barrels)),
      cash: cents(state.cash + quote.net),
      shipped: { ...state.shipped, [mode]: state.shipped[mode] + barrels },
      log: [
        ...state.log,
        `${formatDate(state)}: ${barrels.toLocaleString('de-DE')} Barrel ${per} verkauft – ${dollars(quote.net)} $ nach Fracht und Förderzins.`,
      ],
    },
  };
}

/**
 * Rundenende: Hat Jacob per Bahn verschickt, erhöht Thorne vielleicht den Tarif
 * (bis höchstens maxTariff). Ohne Bahnfracht wird kein Zufall gezogen. Danach
 * sind beide Transportmittel wieder frei.
 * 2.8: Mit Frachtvertrag erhöht Thorne nicht (der Zufall wird trotzdem gezogen,
 * damit der Weltzufall mit und ohne Vertrag gleich bleibt); nach einer Absage
 * erhöht er öfter.
 */
export function advanceTransport(input: GameState, balance: Balance): GameState {
  const { hikeStep, maxTariff } = balance.transport.thorne;
  let { railTariff, rng: rngState, log } = input;
  if (input.shipped.rail > 0 && railTariff < maxTariff) {
    const rng = new Rng(rngState);
    const roll = rng.float();
    if (!railFrozen(input, balance) && roll < thorneHikeChance(input, balance)) {
      railTariff = cents(Math.min(maxTariff, railTariff + hikeStep));
      log = [...log, `${formatDate(input)}: Thorne erhöht den Bahntarif auf ${dollars(railTariff)} $ je Barrel.`];
    }
    rngState = rng.state;
  }
  return { ...input, railTariff, rng: rngState, log, shipped: { wagon: 0, rail: 0 } };
}
