// Tester-Build (1.16): Einstellungen aus content/tester.yaml prüfen und
// entscheiden, was die Oberfläche für Tester zeigt. Reine Funktionen ohne
// DOM, damit sie sich testen lassen.

export interface TesterConfig {
  /** Adresse des Fragebogens; null = kein „Feedback geben“-Knopf. */
  feedbackUrl: string | null;
}

/**
 * Liest die rohe YAML-Struktur. Eine leere, fehlende oder unbrauchbare
 * Adresse (nicht http/https) ergibt null – dann bleibt der Knopf weg, statt
 * auf eine kaputte Seite zu zeigen.
 */
export function parseTesterConfig(raw: unknown): TesterConfig {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).feedbackUrl : undefined;
  if (typeof value !== 'string') return { feedbackUrl: null };
  const url = value.trim();
  if (url === '') return { feedbackUrl: null };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { feedbackUrl: null };
  } catch {
    return { feedbackUrl: null };
  }
  return { feedbackUrl: url };
}

/**
 * Debug-Werkzeuge (verdeckte Geologie, Seed, Spielstand löschen) gibt es beim
 * Entwickeln immer, im fertigen Build nur mit ?debug=1 in der Adresse.
 */
export function debugToolsVisible(dev: boolean, search: string): boolean {
  return dev || new URLSearchParams(search).get('debug') === '1';
}
