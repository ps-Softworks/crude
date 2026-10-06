// Nutzen einer Fernleitung (Kapitel 2): Was bringt sie bei heutiger Förderung je Runde?
// Reine Lese-Hilfe für die Anzeige – keine Regel, kein Zufall. Das Öl der Förderung wird
// auf die Wege verteilt, billigster Weg zuerst, jeweils bis zur Kapazität des Wegs.
// Mit der Leitung wächst die Kapazität des Wegs (Hafen: „Pipeline“, Bahnhof: „Bahn“).
// Was nirgends mehr Platz hat, bleibt liegen und bringt nichts.

import type { Balance, TransportMode } from './balance';
import type { GameState } from './game';
import { crudeSupply } from './refinery';
import { buyerPrice, modeCapacity, tariff } from './transport';

const MODES: readonly TransportMode[] = ['wagon', 'rail', 'teams', 'pipeline'];

export interface TrunkSavings {
  /** Förderung je Runde, mit der gerechnet wurde (bbl). */
  supply: number;
  /** Erlös nach Fracht je Runde ohne / mit der neuen Leitung. */
  before: number;
  after: number;
  /** Mehr Erlös je Runde, vor Unterhalt. */
  gain: number;
  /** Streckenunterhalt der neuen Leitung je Runde. */
  upkeep: number;
  /** Ersparnis je Runde nach Unterhalt (kann negativ sein). */
  net: number;
  /** Barrel je Runde, die heute liegen bleiben und mit der Leitung verkauft würden. */
  stuck: number;
  /** Barrel je Runde, die wegen der Leitung auf einen billigeren Weg wechseln. */
  moved: number;
  /** Runden, bis die Kosten wieder drin sind; null, wenn sie sich nicht bezahlt macht. */
  payback: number | null;
}

/** Erlös nach Fracht, wenn die Förderung billigster-Weg-zuerst verteilt wird; plus liegen gebliebene Menge. */
function allocate(state: GameState, balance: Balance, supply: number, extra: Partial<Record<TransportMode, number>>) {
  const price = buyerPrice(state, balance);
  const perMode: Record<TransportMode, number> = { wagon: 0, rail: 0, teams: 0, pipeline: 0 };
  const order = MODES.map((m) => ({ m, cost: tariff(state, balance, m), cap: modeCapacity(state, balance, m) + (extra[m] ?? 0) })).sort((a, b) => a.cost - b.cost);
  let rest = supply;
  let revenue = 0;
  for (const { m, cost, cap } of order) {
    const n = Math.max(0, Math.min(rest, cap));
    perMode[m] = n;
    revenue += n * (price - cost);
    rest -= n;
  }
  return { revenue, stuck: rest, perMode };
}

/**
 * Was eine fertige Leitung bei heutiger Förderung je Runde bringt.
 * bypassesRail: true = Leitung zum Hafen (Weg „Pipeline“), false = zum Bahnhof (mehr „Bahn“).
 * length: Länge in Karteneinheiten (für den Unterhalt). cost: Gesamtkosten, die noch zu zahlen sind.
 * supply: Förderung je Runde; ohne Angabe die heutige (crudeSupply).
 */
export function trunkSavings(state: GameState, balance: Balance, opts: { bypassesRail: boolean; length: number; cost: number; supply?: number }): TrunkSavings {
  const supply = opts.supply ?? crudeSupply(state, balance);
  const mode: TransportMode = opts.bypassesRail ? 'pipeline' : 'rail';
  const base = allocate(state, balance, supply, {});
  const mit = allocate(state, balance, supply, { [mode]: balance.bigPipelines.capacity });
  const gain = Math.max(0, mit.revenue - base.revenue);
  const upkeep = Math.round(opts.length * balance.bigPipelines.upkeepPerUnit);
  const net = gain - upkeep;
  const stuck = Math.max(0, base.stuck - mit.stuck);
  const moved = Math.max(0, mit.perMode[mode] - base.perMode[mode] - stuck);
  return {
    supply,
    before: Math.round(base.revenue),
    after: Math.round(mit.revenue),
    gain: Math.round(gain),
    upkeep,
    net: Math.round(net),
    stuck: Math.round(stuck),
    moved: Math.round(moved),
    payback: net > 0 ? Math.max(1, Math.ceil(opts.cost / net)) : null,
  };
}
