// Ölpreis (GDD §7.3): Der Posted Price am Salt Hill entsteht jede Runde aus
// Angebot und Nachfrage. Reine Funktionen, deterministisch, ohne Zufall.
//   P = T · (N / A)^ε · S − k, begrenzt auf priceMin..priceMax, auf Cent gerundet.

import type { MarketBalance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';

/** Auf ganze Cent runden. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Bohrtürme der anderen Firmen am Salt Hill in dieser Runde (bis es Rivalen gibt). */
export function neighbourWells(balance: MarketBalance, round: number): number {
  const { startWells, newWellsPerRound } = balance.neighbours;
  return startWells + newWellsPerRound * (round - 1);
}

/** Förderung der Nachbarn in Barrel je Runde. */
export function neighbourSupply(balance: MarketBalance, round: number): number {
  return neighbourWells(balance, round) * balance.neighbours.ratePerWell;
}

/** Bullards Förderung je Runde: Summe der Raten seiner fündigen Quellen (ratePerWell, wo keine Rate gespeichert ist). */
export function rivalSupply(state: Pick<GameState, 'rival'>, ratePerWell: number): number {
  return state.rival.wells.filter((w) => w.status === 'found').reduce((sum, w) => sum + (w.rate ?? ratePerWell), 0);
}

/** Jacobs Förderung der letzten Runde: Summe über alle fündigen Quellen. */
export function jacobSupply(state: Pick<GameState, 'wells'>): number {
  return state.wells
    .filter((w) => w.status === 'found')
    .reduce((sum, w) => sum + (w.production?.lastRate ?? 0), 0);
}

/** Posted Price für ein Gesamtangebot in Barrel je Runde. */
export function computePrice(balance: MarketBalance, supply: number): number {
  const { basePrice, demand, elasticity, shock, regionalDiscount, priceMin, priceMax } = balance;
  const angebot = Math.max(supply, 1);
  const roh = basePrice * (demand / angebot) ** elasticity * shock - regionalDiscount;
  return cents(Math.min(priceMax, Math.max(priceMin, roh)));
}

/** Preis in deutscher Schreibweise, z. B. "0,72 $". */
function formatPrice(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} $`;
}

/**
 * Rundenende: Aus Jacobs Förderung, der Förderung der Nachbarn und Bullards
 * Förderung (rivalRatePerWell je fündiger Quelle) wird der
 * Posted Price für die nächste Runde. Große Sprünge kommen ins Protokoll.
 */
export function advanceMarket(input: GameState, marketBalance: MarketBalance, rivalRatePerWell = 0): GameState {
  const supply = jacobSupply(input) + neighbourSupply(marketBalance, input.round) + rivalSupply(input, rivalRatePerWell);
  const oldPrice = input.postedPrice;
  const newPrice = computePrice(marketBalance, supply);

  let log = input.log;
  const change = Math.abs(newPrice - oldPrice) / oldPrice;
  // Kleine Toleranz, damit genau 10 % trotz Rundung als 10 % zählen.
  if (newPrice !== oldPrice && change >= marketBalance.newsThreshold - 1e-9) {
    const text =
      newPrice < oldPrice
        ? `Der Trust senkt den Posted Price auf ${formatPrice(newPrice)} – Überangebot am Salt Hill.`
        : `Der Trust hebt den Posted Price auf ${formatPrice(newPrice)} an – das Öl wird knapp.`;
    log = [...log, `${formatDate(input)}: ${text}`];
  }

  return { ...input, postedPrice: newPrice, priceHistory: [...input.priceHistory, newPrice], log };
}
