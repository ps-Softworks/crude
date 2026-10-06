// Drei Speicherplätze (0.4.20+42) neben dem Autosave. Reine Logik über dem SaveStore aus
// storage.ts: Schlüssel, Kurzangaben (Runde, Kapitel, Datum, Kasse) und die Liste fürs Menü.
// Der Autosave (autosave.ts, Schlüssel `crude.autosave`) bleibt unberührt.

import { formatDate } from '../sim/calendar';
import type { GameState } from '../sim/game';
import { deserializeGame, serializeGame, type LoadResult } from '../sim/save';
import { chapterRound, chapterRounds } from '../sim/timeskip';
import { chapterOf } from '../sim/chapterOf';
import type { SaveStore } from './storage';

export const SLOT_COUNT = 3;

/** Schlüssel des Platzes (1…3); nur Buchstaben, Ziffern, Punkt – passt auch zur Desktop-Hülle. */
export function slotKey(slot: number): string {
  return `crude.slot.${slot}`;
}

/** Schlüssel der Kurzangaben zum Platz. */
export function slotMetaKey(slot: number): string {
  return `crude.slot.${slot}.meta`;
}

/** Was die Liste zu einem belegten Platz zeigt. */
export interface SlotInfo {
  slot: number;
  /** Runde im Kapitel und Rundenzahl des Kapitels. */
  round: number;
  rounds: number;
  chapter: number;
  /** Spieldatum (z. B. „Winter 1895“). */
  date: string;
  cash: number;
  /** Zeitpunkt des Speicherns (ms seit 1970) – fehlt bei Plätzen ohne Kurzangaben. */
  savedAt: number | null;
}

export function makeSlotInfo(slot: number, state: GameState, savedAt: number | null): SlotInfo {
  return {
    slot,
    round: chapterRound(state),
    rounds: chapterRounds(state),
    chapter: chapterOf(state),
    date: formatDate(state),
    cash: state.cash,
    savedAt,
  };
}

function gueltigeInfo(v: unknown, slot: number): SlotInfo | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (!zahl(o.round) || !zahl(o.rounds) || !zahl(o.chapter) || typeof o.date !== 'string' || !zahl(o.cash)) return null;
  return { slot, round: o.round, rounds: o.rounds, chapter: o.chapter, date: o.date, cash: o.cash, savedAt: zahl(o.savedAt) ? o.savedAt : null };
}

/** Speichert den Zustand auf einen Platz (überschreibt). Fehler des Speichers gehen an den Aufrufer. */
export function writeSlot(store: SaveStore, slot: number, state: GameState, appVersion: string, now: number): SlotInfo {
  checkSlot(slot);
  const info = makeSlotInfo(slot, state, now);
  store.write(slotKey(slot), serializeGame(state, appVersion));
  try {
    store.write(slotMetaKey(slot), JSON.stringify(info));
  } catch {
    /* Ohne Kurzangaben zeigt die Liste sie aus dem Spielstand selbst. */
  }
  return info;
}

/** Lädt einen Platz; ein leerer oder kaputter Platz meldet den Grund. */
export function readSlot(store: SaveStore, slot: number): LoadResult {
  checkSlot(slot);
  const text = store.read(slotKey(slot));
  if (text === null) return { ok: false, reason: 'Dieser Platz ist leer.' };
  return deserializeGame(text);
}

/** Die Kurzangaben aller Plätze (null = leer oder nicht lesbar). */
export function listSlots(store: SaveStore): (SlotInfo | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const slot = i + 1;
    try {
      const text = store.read(slotKey(slot));
      if (text === null) return null;
      const meta = store.read(slotMetaKey(slot));
      if (meta !== null) {
        try {
          const info = gueltigeInfo(JSON.parse(meta), slot);
          if (info) return info;
        } catch {
          /* Kurzangaben kaputt – dann aus dem Spielstand. */
        }
      }
      const geladen = deserializeGame(text);
      return geladen.ok ? makeSlotInfo(slot, geladen.state, null) : null;
    } catch {
      return null;
    }
  });
}

/** Leert einen Platz. */
export function clearSlot(store: SaveStore, slot: number): void {
  checkSlot(slot);
  store.remove(slotKey(slot));
  store.remove(slotMetaKey(slot));
}

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new Error(`Speicherplatz ${slot} gibt es nicht.`);
}
