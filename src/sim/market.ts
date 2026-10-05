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
export function neighbourWells(balance: MarketBalance, round: number, offset = 0): number {
  const { startWells, newWellsPerRound } = balance.neighbours;
  return startWells + newWellsPerRound * (round - 1) + offset;
}

/** Förderung der Nachbarn in Barrel je Runde. */
export function neighbourSupply(balance: MarketBalance, round: number, offset = 0): number {
  return Math.max(0, neighbourWells(balance, round, offset)) * balance.neighbours.ratePerWell;
}

/** Bullards Förderung je Runde: Summe der Raten seiner fündigen Quellen (ratePerWell, wo keine Rate gespeichert ist). */
export function rivalSupply(state: Pick<GameState, 'rival'>, ratePerWell: number): number {
  return state.rival.wells.filter((w) => w.status === 'found').reduce((sum, w) => sum + (w.rate ?? ratePerWell), 0);
}

/** Gesamtangebot am Salt Hill in dieser Runde: Jacob, Nachbarn, Bullard. */
export function saltHillSupply(state: Pick<GameState, 'wells' | 'rival' | 'round'> & Partial<Pick<GameState, 'neighbourOffset'>>, balance: MarketBalance, rivalRatePerWell: number): number {
  return jacobSupply(state) + neighbourSupply(balance, state.round, state.neighbourOffset ?? 0) + rivalSupply(state, rivalRatePerWell);
}

/** Jacobs Förderung der letzten Runde: Summe über alle fündigen Quellen. */
export function jacobSupply(state: Pick<GameState, 'wells'>): number {
  return state.wells
    .filter((w) => w.status === 'found')
    .reduce((sum, w) => sum + (w.production?.lastRate ?? 0), 0);
}

/**
 * Posted Price für ein Gesamtangebot in Barrel je Runde. trend ist der Faktor
 * des Weltmodells auf den Trendpreis T (4.1, worldPriceFactor); 1 = ohne Welt.
 */
export function computePrice(balance: MarketBalance, supply: number, trend = 1): number {
  const { basePrice, demand, elasticity, shock, regionalDiscount, priceMin, priceMax } = balance;
  const angebot = Math.max(supply, 1);
  const roh = basePrice * trend * (demand / angebot) ** elasticity * shock - regionalDiscount;
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
 * trend: Faktor des Weltmodells auf den Trendpreis (4.1).
 */
export function advanceMarket(
  input: GameState,
  marketBalance: MarketBalance,
  rivalRatePerWell = 0,
  trend = 1,
  // Termine als Hauptwerkzeug, Etappe 2 (src/sim/pricing.ts marketMods): Angebot mit Verkauf statt
  // Förderung, Förderbremse und Gerüchteschock. Ohne Angabe wie bisher.
  mods?: { supply: number; shock: number },
): GameState {
  const supply = mods ? mods.supply : saltHillSupply(input, marketBalance, rivalRatePerWell);
  const oldPrice = input.postedPrice;
  const newPrice = computePrice(mods && mods.shock !== 1 ? { ...marketBalance, shock: marketBalance.shock * mods.shock } : marketBalance, supply, trend);

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
