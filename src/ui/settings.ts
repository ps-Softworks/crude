// Einstellungen (Menü ☰ → Einstellungen): Textgröße, Ton, Vollbild, weniger Animation,
// farbenblind-freundliche Karte. Eine Vorliebe des Spielers, kein Teil des Spielstands –
// gemerkt über `readPref`/`writePref` (localStorage bzw. Desktop-Hülle) unter `crude.einstellungen`.
// Reine Logik (Standardwerte, Prüfen gespeicherter Werte, CSS-Klassen) ohne React; unten der
// kleine gemeinsame Speicher, den Oberfläche und Ton lesen.

import { readPref, writePref } from './storage';

export const SETTINGS_PREF = 'crude.einstellungen';

export const TEXT_SIZES = ['normal', 'gross', 'sehrgross'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABEL: Record<TextSize, string> = { normal: 'Normal', gross: 'Groß', sehrgross: 'Sehr groß' };

export interface Settings {
  textSize: TextSize;
  soundOn: boolean;
  /** 0 bis 1. */
  volume: number;
  /** Zusätzlich zu prefers-reduced-motion des Systems. */
  reduceMotion: boolean;
  /** Karte mit farbenblind-sicherer Palette (Okabe-Ito) und Mustern. */
  colorblindMap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  textSize: 'normal',
  soundOn: true,
  volume: 0.5,
  reduceMotion: false,
  colorblindMap: false,
};

/** Liest gespeicherten Text; was fehlt oder nicht passt, bekommt den Standardwert. */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
  const d = data as Record<string, unknown>;
  const d0 = DEFAULT_SETTINGS;
  return {
    textSize: TEXT_SIZES.includes(d.textSize as TextSize) ? (d.textSize as TextSize) : d0.textSize,
    soundOn: typeof d.soundOn === 'boolean' ? d.soundOn : d0.soundOn,
    volume: typeof d.volume === 'number' && Number.isFinite(d.volume) ? Math.min(1, Math.max(0, d.volume)) : d0.volume,
    reduceMotion: typeof d.reduceMotion === 'boolean' ? d.reduceMotion : d0.reduceMotion,
    colorblindMap: typeof d.colorblindMap === 'boolean' ? d.colorblindMap : d0.colorblindMap,
  };
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify(s);
}

/** CSS-Klassen am Wurzelelement, die aus den Einstellungen folgen. */
export function settingsClasses(s: Settings): string[] {
  const klassen: string[] = [];
  if (s.textSize !== 'normal') klassen.push(`text-${s.textSize}`);
  if (s.reduceMotion) klassen.push('wenig-bewegung');
  if (s.colorblindMap) klassen.push('karte-cb');
  return klassen;
}

/** Alle Klassen, die `settingsClasses` je setzen kann (zum Aufräumen). */
export const ALL_SETTINGS_CLASSES = ['text-gross', 'text-sehrgross', 'wenig-bewegung', 'karte-cb'] as const;

/** Soll Bewegung sparsam sein? Systemwunsch oder eigener Schalter. */
export function motionReduced(s: Pick<Settings, 'reduceMotion'>, systemPrefers: boolean): boolean {
  return s.reduceMotion || systemPrefers;
}

// ---------------------------------------------------------------- Gemeinsamer Speicher

let current: Settings | null = null;
const listeners = new Set<() => void>();

/** Setzt die Klassen auf ein Wurzelelement (austauschbar, damit es sich ohne Browser prüfen lässt). */
export function applyClasses(root: { classList: Pick<DOMTokenList, 'add' | 'remove'> }, s: Settings): void {
  root.classList.remove(...ALL_SETTINGS_CLASSES);
  const klassen = settingsClasses(s);
  if (klassen.length > 0) root.classList.add(...klassen);
}

function anwenden(s: Settings): void {
  try {
    if (typeof document !== 'undefined') applyClasses(document.documentElement, s);
  } catch {
    /* Kein Dokument – dann gibt es auch nichts einzufärben. */
  }
}

export function getSettings(): Settings {
  if (!current) {
    current = parseSettings(readPref(SETTINGS_PREF));
    anwenden(current);
  }
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = parseSettings(serializeSettings({ ...getSettings(), ...patch }));
  anwenden(current);
  writePref(SETTINGS_PREF, serializeSettings(current));
  listeners.forEach((l) => l());
}

export function subscribeSettings(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Nur für Tests: Speicher zurücksetzen. */
export function resetSettingsForTest(): void {
  current = null;
}

/** Wünscht das System weniger Bewegung? */
export function systemReducesMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Für die Übergänge: weniger Bewegung wegen System oder Einstellung. */
export function reducedMotion(): boolean {
  return motionReduced(getSettings(), systemReducesMotion());
}
