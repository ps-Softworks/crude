// Gemeinsamer Kapitel-Helfer (Integration Phase 4): Alle Systeme und die Ereignisse lesen das
// Kapitel über chapterOf – eigene Datei ohne Abhängigkeiten, damit jeder sie laden kann.

/** Kapitelnummer (4.5 setzt state.chapter); fehlt sie oder ist kaputt, gilt Kapitel 1. */
export function chapterOf(state: object): number {
  const c = (state as { chapter?: unknown }).chapter;
  return typeof c === 'number' && Number.isFinite(c) && c >= 1 ? Math.floor(c) : 1;
}
