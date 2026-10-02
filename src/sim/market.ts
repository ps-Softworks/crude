// Marktberechnung (GDD §6): Posted Price aus Angebot und Nachfrage.
// Reine Funktionen, deterministisch, testbar.

import type { MarketBalance } from './balance';
import type { GameState } from './game';
import { formatDate } from './calendar';

/** Auf ganze Cent runden. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Nachbarangebot in dieser Runde. */
export function neighbourSupply(balance: MarketBalance, round: number): number {
  const { startWells, newWellsPerRound, ratePerWell } = balance.neighbours;
  const wells = startWells + newWellsPerRound * (round - 1);
  return wells * ratePerWell;
}

/** Jacobs Angebot: Summe der lastRate aller fördernden Quellen. */
export function jacobSupply(state: Pick<GameState, 'wells'>): number {
  return state.wells
    .filter((w) => w.status === 'found' && w.production)
    .reduce((sum, w) => sum + (w.production?.lastRate ?? 0), 0);
}

/** Berechnet den Posted Price für eine Runde. */
export function computePrice(
  balance: MarketBalance,
  round: number,
  jacobSupply: number,
): number {
  const neighbour = neighbourSupply(balance, round);
  const totalSupply = neighbour + jacobSupply;
  const A = Math.max(totalSupply, 1);
  const { basePrice, demand, elasticity, shock, regionalDiscount, priceMin, priceMax } = balance;

  const ratio = demand / A;
  const price = basePrice * Math.pow(ratio, elasticity) * shock - regionalDiscount;
  const clamped = Math.max(priceMin, Math.min(priceMax, price));
  return cents(clamped);
}

/** Liefert das Nachbarangebot und Jacobs Angebot zurück (für Tests/Logging). */
export function supplies(
  balance: MarketBalance,
  round: number,
  state: Pick<GameState, 'wells'>,
): { neighbour: number; jacob: number } {
  return { neighbour: neighbourSupply(balance, round), jacob: jacobSupply(state) };
}

/** Rundenende: Posted Price berechnen, History anhängen, Log bei großer Änderung. */
export function advanceMarket(
  input: GameState,
  balance: MarketBalance,
): GameState {
  const { round, postedPrice: oldPrice, priceHistory, log } = input;
  const jacob = jacobSupply(input);
  const newPrice = computePrice(balance, round, jacob);
  const history = [...priceHistory, newPrice];

  let newLog = log;
  if (oldPrice > 0) {
    const change = Math.abs(newPrice - oldPrice) / oldPrice;
    if (change >= balance.newsThreshold) {
      const direction = newPrice > oldPrice ? 'steigt' : 'fällt';
      newLog = [...log, `${formatDate(input)}: Der Posted Price ${direction} auf ${newPrice.toFixed(2)} $ je Barrel.`];
    }
  }

  return { ...input, postedPrice: newPrice, priceHistory: history, log: newLog };
}