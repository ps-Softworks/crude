// Spielstand sichern und laden (1.13): Der Zustand ist reines JSON, also lässt
// er sich als Text in den localStorage legen. Die Zahl format sagt, welcher Bau
// das ist: passt sie nicht, wird der Spielstand nicht geraten, sondern
// verworfen. Keine Spielregeln hier, nur sichern und prüfen, ob der Zustand
// vollständig ist.

import type { GameState } from './game';

/** Bau des Spielstandformats. Nur hochzählen, wenn sich der Zustand ändert. */
export const SAVE_FORMAT = 1;

export interface SaveFile {
  format: number;
  /** Version des Spiels, die den Spielstand geschrieben hat – nur zum Nachsehen. */
  appVersion: string;
  /** Runde, in der gesichert wurde – nur zum Nachsehen. */
  savedRound: number;
  state: GameState;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string };

const KAPUTT = 'Spielstand ist beschädigt.';
const FREMDE_VERSION = 'Spielstand stammt aus einer anderen Version.';
const UNVOLLSTAENDIG = 'Spielstand ist unvollständig.';

/** Zahlen im Zustand: endlich, sonst stimmt die Rechnung nicht mehr. */
const ZAHLEN = [
  'rng',
  'round',
  'totalRounds',
  'startYear',
  'cash',
  'oilStock',
  'royaltyOil',
  'railTariff',
  'postedPrice',
  'missedPayments',
  'bankruptcyDeadline',
  'roundLogStart',
] as const;

/** Listen im Zustand. */
const LISTEN = ['parcels', 'fields', 'leases', 'options', 'wells', 'priceHistory', 'loans', 'log'] as const;

/** Nachschlagewerke im Zustand. */
const OBJEKTE = ['forecasts', 'shipped'] as const;

function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istListe(wert: unknown): wert is unknown[] {
  return Array.isArray(wert);
}

/** Ein Ding mit Feldern – aber keine Liste und kein null. */
function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Prüft, ob der Zustand vollständig und gültig ist: alle Zahlen endlich, alle
 * Listen und Nachschlagewerke da, der Rivale mit eigenem Zufall und eigener
 * Kasse, und die Runde zwischen 1 und dem Ende des Kapitels.
 */
export function validateState(value: unknown): LoadResult {
  if (!istObjekt(value) || !istText(value.seed) || !istText(value.rating)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!ZAHLEN.every((key) => istZahl(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!LISTEN.every((key) => istListe(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!OBJEKTE.every((key) => istObjekt(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };

  const rival = value.rival;
  if (!istObjekt(rival) || !istZahl(rival.rng) || !istZahl(rival.cash) || !istListe(rival.wells)) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  if (typeof value.finished !== 'boolean') return { ok: false, reason: UNVOLLSTAENDIG };
  if (value.ending !== null && value.ending !== 'kapitel' && value.ending !== 'pleite') {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const round = value.round as number;
  const totalRounds = value.totalRounds as number;
  return round >= 1 && round <= totalRounds ? { ok: true, state: value as unknown as GameState } : { ok: false, reason: UNVOLLSTAENDIG };
}

/**
 * Macht aus dem Zustand den Text für den localStorage: Bau, Spielversion,
 * Runde und der Zustand selbst. Der Zustand wird nur gelesen, nicht verändert.
 */
export function serializeGame(state: GameState, appVersion: string): string {
  const file: SaveFile = { format: SAVE_FORMAT, appVersion, savedRound: state.round, state };
  return JSON.stringify(file);
}

/**
 * Liest einen Spielstand zurück. Ein kaputter Text, ein fremdes format und ein
 * unvollständiger Zustand sind drei verschiedene Fehler, damit die Oberfläche
 * sagen kann, was los ist.
 */
export function deserializeGame(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: KAPUTT };
  }
  if (!istObjekt(parsed) || istZahl(parsed.format) === false || parsed.format !== SAVE_FORMAT) {
    return { ok: false, reason: FREMDE_VERSION };
  }
  return validateState(parsed.state);
}