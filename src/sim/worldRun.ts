// Weltläufe (4.1): das Weltmodell über viele Seeds ohne Spieler. Liefert
// Verläufe (Perzentile je Spieljahr), Krisenzahlen und Extremwerte – für
// `npm run welt` (docs/weltmodell.md) und für die Grenz-Tests.

import type { WorldModelBalance } from './balance';
import type { LawDef } from './laws';
import { advanceWorld, effectiveDemand, newWorld, PARTIES, type WorldState } from './world';
import { worldHeadline } from './worldNews';

/** Runden je Spieljahr (Quartale). */
export const ROUNDS_PER_YEAR = 4;
/** Eine ganze Kampagne: Jahr 1 bis 73 (GDD §13). */
export const CAMPAIGN_ROUNDS = 73 * ROUNDS_PER_YEAR;

/** Größen, deren Verlauf aufgezeichnet wird. */
export const TRACKED = ['price', 'demand', 'capacity', 'stock', 'credit', 'leverage', 'mood', 'tension', 'tech', 'nationalism'] as const;
export type Tracked = (typeof TRACKED)[number];

export const TRACKED_LABEL: Record<Tracked, string> = {
  price: 'Weltpreis (Index)',
  demand: 'Nachfrage (Index)',
  capacity: 'Förderkapazität (Index)',
  stock: 'Lager (Quartalsbedarf)',
  credit: 'Kreditklima (0–100)',
  leverage: 'Verschuldung (0–100)',
  mood: 'Stimmung (0–100)',
  tension: 'Außenspannung (0–100)',
  tech: 'Technikstand (0–100)',
  nationalism: 'Nationalismus (0–100)',
};

export interface WorldRun {
  seed: string;
  /** Zustand am Ende jedes Spieljahres (Index 0 = Ausgangslage). */
  years: WorldState[];
  final: WorldState;
  /** Größter Preisrückgang binnen vier Runden (0,5 = −50 %). */
  maxYearDrop: number;
  /** Größter Preisanstieg binnen vier Runden (1 = +100 %). */
  maxYearRise: number;
  /** Runden in Krieg bzw. Crash. */
  warRounds: number;
  crashRounds: number;
  /** Höchstes Verhältnis Nachfrage/Kapazität und umgekehrt – zeigt, ob Angebot und Nachfrage auseinanderlaufen. */
  maxImbalance: number;
  /** Regierungsjahre je Partei. */
  governmentRounds: Record<(typeof PARTIES)[number], number>;
  /** Runden (ab 1), in denen ein Crash bzw. ein Krieg begann. */
  crashStarts: number[];
  warStarts: number[];
  /** Runden (ab 1), in denen eine Kreditkrise (Crash oder Bankpanik, 4.4) begann. */
  crisisStarts: number[];
  /** Runden, in denen die Zeitung vor der Blase warnt (worldHeadline = world_credit_bubble). */
  bubbleWarnings: number[];
  /** Gesetze (4.3): Runde des Beschlusses je Gesetz (null = in diesem Lauf nie), Anträge und Niederlagen. */
  lawPassed: Record<string, number | null>;
  lawProposals: Record<string, number>;
  lawFailures: Record<string, number>;
}

/** Eine Welt über rounds Runden ohne Spieler; laws = Gesetzeskatalog (ohne ihn tagt kein Parlament). */
export function runWorld(seed: string, wb: WorldModelBalance, rounds: number, laws: readonly LawDef[] = []): WorldRun {
  let w = newWorld(seed, wb);
  const years: WorldState[] = [w];
  const prices: number[] = [w.price];
  let warRounds = 0;
  let crashRounds = 0;
  let maxImbalance = 1;
  const governmentRounds = { handel: 0, volksbund: 0, provinz: 0 };
  const crashStarts: number[] = [];
  const warStarts: number[] = [];
  const crisisStarts: number[] = [];
  const bubbleWarnings: number[] = [];
  const lawFailures: Record<string, number> = Object.fromEntries(laws.map((l) => [l.id, 0]));
  for (let r = 1; r <= rounds; r++) {
    w = advanceWorld(w, wb, {}, laws);
    for (const n of w.laws.news) if (n.kind === 'failed') lawFailures[n.law] = (lawFailures[n.law] ?? 0) + 1;
    if (w.news.includes('crash')) crashStarts.push(r);
    if (w.news.includes('crash') || w.news.includes('panic')) crisisStarts.push(r);
    if (worldHeadline(w, wb) === 'world_credit_bubble') bubbleWarnings.push(r);
    if (w.news.includes('war')) warStarts.push(r);
    prices.push(w.price);
    if (w.war > 0) warRounds += 1;
    if (w.crash > 0) crashRounds += 1;
    governmentRounds[w.government] += 1;
    const ratio = effectiveDemand(w, wb) / (w.capacity * wb.supply.utilBase);
    maxImbalance = Math.max(maxImbalance, ratio, 1 / ratio);
    if (r % ROUNDS_PER_YEAR === 0) years.push(w);
  }
  let maxYearDrop = 0;
  let maxYearRise = 0;
  for (let i = ROUNDS_PER_YEAR; i < prices.length; i++) {
    const fenster = prices.slice(i - ROUNDS_PER_YEAR, i + 1);
    const hoch = Math.max(...fenster.slice(0, -1));
    const tief = Math.min(...fenster.slice(0, -1));
    maxYearDrop = Math.max(maxYearDrop, 1 - prices[i] / hoch);
    maxYearRise = Math.max(maxYearRise, prices[i] / tief - 1);
  }
  const lawPassed = Object.fromEntries(laws.map((l) => [l.id, w.laws.bills[l.id]?.passedRound ?? null]));
  const lawProposals = Object.fromEntries(laws.map((l) => [l.id, w.laws.bills[l.id]?.proposals ?? 0]));
  return { seed, years, final: w, maxYearDrop, maxYearRise, warRounds, crashRounds, maxImbalance, governmentRounds, crashStarts, warStarts, crisisStarts, bubbleWarnings, lawPassed, lawProposals, lawFailures };
}

/** Viele Welten: Seeds `${prefix}-0` … `${prefix}-${count-1}`. */
export function runWorlds(prefix: string, count: number, wb: WorldModelBalance, rounds: number, laws: readonly LawDef[] = []): WorldRun[] {
  return Array.from({ length: count }, (_, i) => runWorld(`${prefix}-${i}`, wb, rounds, laws));
}

/** Perzentil (0–1) einer Liste, linear zwischen den Nachbarn. */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Band {
  p10: number;
  p50: number;
  p90: number;
}

/** Verlauf einer Größe: Perzentile je Spieljahr über alle Läufe. */
export function yearBands(runs: readonly WorldRun[], key: Tracked): Band[] {
  const jahre = Math.min(...runs.map((r) => r.years.length));
  return Array.from({ length: jahre }, (_, y) => {
    const werte = runs.map((r) => r.years[y][key]);
    return { p10: percentile(werte, 0.1), p50: percentile(werte, 0.5), p90: percentile(werte, 0.9) };
  });
}

/** Kleinster und größter Wert einer Größe über alle Läufe und alle Jahre. */
export function extremes(runs: readonly WorldRun[], key: Tracked): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const r of runs) {
    for (const y of r.years) {
      min = Math.min(min, y[key]);
      max = Math.max(max, y[key]);
    }
  }
  return { min, max };
}

export interface CrisisStats {
  /** Durchschnitt je Lauf. */
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** Anteil der Läufe innerhalb des Zielbereichs. */
  inTarget: number;
}

/** Krisen je Lauf (GDD §15: Zielbereich je Kampagne). */
export function crisisStats(runs: readonly WorldRun[], pick: (r: WorldRun) => number, target: [number, number]): CrisisStats {
  const werte = runs.map(pick);
  const mean = werte.reduce((s, x) => s + x, 0) / Math.max(1, werte.length);
  const inTarget = werte.filter((x) => x >= target[0] && x <= target[1]).length / Math.max(1, werte.length);
  return { mean, p10: percentile(werte, 0.1), p50: percentile(werte, 0.5), p90: percentile(werte, 0.9), inTarget };
}

/** Zielbereiche aus GDD §15 je Kampagne (73 Jahre), ohne Eingreifen des Spielers. */
export const CAMPAIGN_TARGETS = {
  /** Kreditkrisen = Crashs + Bankpaniken (4.4). */
  crashes: [2, 4] as [number, number],
  gluts: [1, 3] as [number, number],
  wars: [0, 2] as [number, number],
};

/** Spieljahr (ab 0) einer Runde (ab 1). */
export function yearOfRound(round: number): number {
  return Math.floor((round - 1) / ROUNDS_PER_YEAR);
}

/**
 * Wann Krisen kommen: je Fenster von `years` Spieljahren, wie viele Krisen eine
 * Welt dort im Schnitt hat (rate) und welcher Anteil der Welten dort seine
 * erste Krise hat (first). Klumpen die Krisen in einem Fenster, lernt der Spieler
 * ihren Zeitpunkt auswendig (GDD §7.2).
 */
export function crisisWindows(runs: readonly WorldRun[], pick: (r: WorldRun) => readonly number[], years: number, totalYears = 73): { rate: number[]; first: number[] } {
  const n = Math.ceil(totalYears / years);
  const rate = new Array<number>(n).fill(0);
  const first = new Array<number>(n).fill(0);
  for (const r of runs) {
    const starts = pick(r).filter((x) => yearOfRound(x) < totalYears);
    for (const x of starts) rate[Math.floor(yearOfRound(x) / years)] += 1 / runs.length;
    if (starts.length > 0) first[Math.floor(yearOfRound(starts[0]) / years)] += 1 / runs.length;
  }
  return { rate, first };
}

/** Kreditkrisen einer Welt (4.4, GDD §15 „Kreditkrisen“): große Crashs und Bankpaniken zusammen. */
export function creditCrises(w: Pick<WorldState, 'counts'>): number {
  return w.counts.crashes + (w.counts.panics ?? 0);
}
