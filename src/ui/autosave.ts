// Autosave (1.13): Der Spielstand liegt im localStorage des Browsers (in der
// Desktop-Fassung ab 2.14 als Datei im Benutzerordner, siehe storage.ts). Nach jeder
// Runde wird er überschrieben, beim nächsten Besuch kommt das Spiel genau dort
// weiter, wo es zuletzt war. Der localStorage kann blockiert sein (privates
// Fenster, voller Speicher) – dann läuft das Spiel ohne Speichern weiter.

import { deserializeGame, serializeGame, type LoadResult } from '../sim/save';
import type { GameState } from '../sim/game';
import { saveStore } from './storage';

const KEY = 'crude.autosave';

/**
 * Der gespeicherte Spielstand, oder null – wenn nichts da ist oder er nicht
 * taugt. Der Grund steht dann in der Konsole, damit man sieht, warum.
 */
export function loadAutosave(): GameState | null {
  try {
    const text = saveStore().read(KEY);
    if (text === null) return null;
    const geladen: LoadResult = deserializeGame(text);
    if (!geladen.ok) {
      console.warn('Autosave wird nicht geladen: ' + geladen.reason);
      return null;
    }
    return geladen.state;
  } catch {
    return null;
  }
}

/** Schreibt den Zustand als neuen Spielstand; ein Fehler kostet nur den Spielstand. */
export function writeAutosave(state: GameState): void {
  try {
    saveStore().write(KEY, serializeGame(state, __APP_VERSION__));
  } catch {
    /* Kein Speicher, kein Autosave – das Spiel läuft trotzdem. */
  }
}

/** Spielstand weg: der nächste Besuch startet eine neue Welt. */
export function clearAutosave(): void {
  try {
    saveStore().remove(KEY);
  } catch {
    /* Dann eben nicht. */
  }
}