// Tastenkürzel am Schreibtisch (0.2.15+9), als Daten. Ein Buchstabe öffnet ein
// Fenster, E läutet die Glocke, K geht zur Karte. Kürzel greifen nur auf dem
// Schreibtisch, nur ohne offenes Fenster und nie, solange ein Eingabefeld oder
// ein Regler den Fokus hat (die Regler im Kassenbuch brauchen die Pfeiltasten).

import type { SheetId } from './sceneState';

export type KeyAction =
  | { kind: 'open'; sheet: SheetId; tab?: string }
  | { kind: 'map' }
  | { kind: 'visitor' }
  | { kind: 'help' }
  | { kind: 'debug' };

export interface Shortcut {
  /** Taste, wie sie in KeyboardEvent.key steht (Kleinbuchstabe bzw. Zeichen). */
  key: string;
  shift?: boolean;
  action: KeyAction;
  /** Für die Tastenhilfe. */
  label: string;
  /** Nur mit sichtbarem Debug-Bereich. */
  debugOnly?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { key: 'z', action: { kind: 'open', sheet: 'zeitung' }, label: 'Zeitung' },
  { key: 'b', action: { kind: 'open', sheet: 'post' }, label: 'Briefe' },
  { key: 'n', action: { kind: 'open', sheet: 'vorfaelle' }, label: 'Vorfälle' },
  { key: 't', action: { kind: 'open', sheet: 'termine' }, label: 'Termine' },
  { key: 'g', action: { kind: 'open', sheet: 'kassenbuch' }, label: 'Kassenbuch' },
  { key: 'a', action: { kind: 'open', sheet: 'akte' }, label: 'Bohrturm-Akte' },
  { key: 'f', action: { kind: 'open', sheet: 'fracht' }, label: 'Fracht' },
  { key: 'v', action: { kind: 'open', sheet: 'fracht', tab: 'verkauf' }, label: 'Verkauf' },
  { key: 'k', action: { kind: 'map' }, label: 'Karte' },
  { key: 'h', action: { kind: 'open', sheet: 'familie' }, label: 'Familie' },
  { key: 'p', action: { kind: 'open', sheet: 'protokoll' }, label: 'Protokoll' },
  { key: 'w', action: { kind: 'visitor' }, label: 'Besucher hereinbitten' },
  { key: 'e', action: { kind: 'open', sheet: 'glocke' }, label: 'Runde beenden' },
  { key: '?', action: { kind: 'help' }, label: 'Tastenhilfe' },
  { key: 'd', shift: true, action: { kind: 'debug' }, label: 'Debug', debugOnly: true },
];

/** Das Kürzel als Text für Namensschilder, z. B. „B“ oder „⇧D“. */
export function keyLabel(s: Pick<Shortcut, 'key' | 'shift'>): string {
  return `${s.shift ? '⇧' : ''}${s.key.toUpperCase()}`;
}

/** Das Kürzel, das ein Fenster öffnet (ohne Reiter), für Namensschilder. */
export function keyForSheet(sheet: SheetId): string | undefined {
  const s = SHORTCUTS.find((x) => x.action.kind === 'open' && x.action.sheet === sheet && x.action.tab === undefined);
  return s ? keyLabel(s) : undefined;
}

/** Das Nötigste aus einem KeyboardEvent – so lässt es sich ohne Browser testen. */
export interface KeyInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Das Element mit dem Fokus. */
  target?: { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null;
}

/** Liest ein KeyboardEvent aus (seine Felder sind Getter, ein {...e} kopiert sie nicht). */
export function keyInput(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }): KeyInput {
  return { key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as KeyInput['target'] };
}

/** Tippt der Spieler gerade in ein Feld oder bedient einen Regler? Dann greift kein Kürzel. */
export function isTypingTarget(target: KeyInput['target']): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target.type ?? 'text').toLowerCase();
    // Knöpfe und Haken sind keine Eingabefelder, Regler und Zahlenfelder schon.
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type);
  }
  const role = target.getAttribute?.('role');
  return role === 'slider' || role === 'textbox' || role === 'spinbutton';
}

export interface KeyContext {
  view: 'desk' | 'map';
  sheetOpen: boolean;
  /** Besucher-Dialog offen (ab Etappe 2). */
  visitorOpen?: boolean;
  debugTools: boolean;
}

/** Welche Aktion eine Taste auslöst – oder null. Esc und 1–4 laufen anderswo. */
export function keyToAction(input: KeyInput, ctx: KeyContext): KeyAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (ctx.view !== 'desk' || ctx.sheetOpen || ctx.visitorOpen) return null;
  if (isTypingTarget(input.target)) return null;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  const shortcut = SHORTCUTS.find((s) => {
    if (s.key !== key) return false;
    if (s.debugOnly && !ctx.debugTools) return false;
    // „?“ braucht auf vielen Tastaturen die Umschalttaste – dort zählt sie nicht.
    if (s.key === '?') return true;
    return !!s.shift === !!input.shiftKey;
  });
  return shortcut ? shortcut.action : null;
}

/** Antwort-Taste 1–4 im Brief, Vorfall oder Termin: der Index der Antwort, sonst null. */
export function choiceIndex(input: KeyInput): number | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (isTypingTarget(input.target)) return null;
  const n = Number(input.key);
  return Number.isInteger(n) && n >= 1 && n <= 4 && input.key.length === 1 ? n - 1 : null;
}
