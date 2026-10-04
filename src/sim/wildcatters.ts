// Kleine Wildcatter (2.8, GDD §9.2): 6–8 kleine Firmen im Hintergrund. Ihnen
// gehören die Nachbarquellen am Salt Hill, die der Markt schon immer mitrechnet
// (market.neighbours) – die Wildcatter geben ihnen nur Namen. Darum ändern sie
// weder den Preis noch Jacobs Welt: eigener Zufall (seed + ':wildcatter'), und die
// Summe ihrer Quellen ist immer genau neighbourWells der laufenden Runde (ab Kapitel 2 mit
// neighbourOffset, 4.5: Nach dem Zeitsprung sind es so viele, wie der Sprung übrig ließ).

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { neighbourWells } from './market';
import { Rng, seedFromString, type RngState } from './rng';

export interface Wildcatter {
  name: string;
  /** Fördernde Quellen am Salt Hill. */
  wells: number;
}

export interface WildcattersState {
  /** Eigener Zufall der Wildcatter. */
  rng: RngState;
  firms: Wildcatter[];
}

/** Nachbarquellen als ganze Zahl (der Markt darf Bruchteile haben). */
function wellsIn(balance: Balance, round: number, offset = 0): number {
  return Math.max(0, Math.floor(neighbourWells(balance.market, round, offset)));
}

/** Verteilt so viele Quellen zufällig auf die Firmen und meldet, wer wie viele bekam. */
function verteilen(firms: Wildcatter[], count: number, rng: Rng): Map<number, number> {
  const neu = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const idx = rng.int(0, firms.length - 1);
    firms[idx] = { ...firms[idx], wells: firms[idx].wells + 1 };
    neu.set(idx, (neu.get(idx) ?? 0) + 1);
  }
  return neu;
}

/**
 * Die Wildcatter zu Spielbeginn: min…max Firmen mit Namen aus balance.yaml (ohne
 * Wiederholung), jede mit mindestens einer Quelle, falls genug Quellen da sind;
 * der Rest der Nachbarquellen aus Runde 1 wird zufällig verteilt.
 */
export function newWildcatters(seed: string, balance: Balance): WildcattersState {
  const { min, max, names } = balance.rivals.wildcatters;
  const rng = new Rng(seedFromString(`${seed}:wildcatter`));
  const anzahl = rng.int(min, max);
  const pool = [...names];
  const firms: Wildcatter[] = [];
  for (let i = 0; i < anzahl && pool.length > 0; i++) {
    const [name] = pool.splice(rng.int(0, pool.length - 1), 1);
    firms.push({ name, wells: 0 });
  }
  const gesamt = wellsIn(balance, 1);
  const grund = Math.min(1, Math.floor(gesamt / Math.max(1, firms.length)));
  for (let i = 0; i < firms.length; i++) firms[i] = { ...firms[i], wells: grund };
  verteilen(firms, gesamt - grund * firms.length, rng);
  return { rng: rng.state, firms };
}

/**
 * Zu Beginn einer neuen Runde: Die neuen Nachbarquellen dieser Runde gehen an
 * zufällige Wildcatter; jede neue Quelle kommt ins Protokoll. Ohne Firmen (alter
 * Spielstand) passiert nichts.
 */
export function advanceWildcatters(state: GameState, balance: Balance): GameState {
  const { firms: alt } = state.wildcatters;
  if (alt.length === 0) return state;
  const fehlt = wellsIn(balance, state.round, state.neighbourOffset ?? 0) - alt.reduce((s, f) => s + f.wells, 0);
  if (fehlt <= 0) return state;
  const rng = new Rng(state.wildcatters.rng);
  const firms = [...alt];
  const neu = verteilen(firms, fehlt, rng);
  const date = formatDate(state);
  const log = [...state.log];
  for (const [idx, n] of [...neu.entries()].sort((a, b) => a[0] - b[0])) {
    log.push(
      n === 1
        ? `${date}: ${firms[idx].name} bringt am Salt Hill eine neue Quelle in Förderung.`
        : `${date}: ${firms[idx].name} bringt am Salt Hill ${n} neue Quellen in Förderung.`,
    );
  }
  return { ...state, log, wildcatters: { rng: rng.state, firms } };
}

/** Quellen aller Wildcatter zusammen. */
export function wildcatterWells(state: Pick<GameState, 'wildcatters'>): number {
  return state.wildcatters.firms.reduce((s, f) => s + f.wells, 0);
}
