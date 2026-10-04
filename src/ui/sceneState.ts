// Szenenzustand (0.2.15+9): Was gerade zu sehen ist – Schreibtisch oder Karte,
// welches Fenster offen ist (mit Reiter und Rücksprung), welche Ranch gewählt ist.
// Reine Logik ohne React und ohne Spielregeln: Hier wird nur geblättert, nie gespielt.

/** Die Fenster, die man am Schreibtisch öffnen kann. */
export const SHEET_IDS = [
  'zeitung',
  'post',
  'vorfaelle',
  'termine',
  'kassenbuch',
  'akte',
  'fracht',
  'familie',
  'protokoll',
  'konkurrenz',
  'menu',
  'glocke',
] as const;
export type SheetId = (typeof SHEET_IDS)[number];

export type View = 'desk' | 'map';

/** Wohin „‹ zurück“ führt. */
export interface SheetBack {
  sheet: SheetId;
  tab?: string;
}

export interface OpenSheet {
  id: SheetId;
  /** Gewählter Reiter; ohne Angabe gilt der zuletzt benutzte. */
  tab?: string;
  back?: SheetBack;
}

export interface SceneState {
  view: View;
  sheet: OpenSheet | null;
  /** Gewählte Ranch auf der Karte – ihr Fenster ist offen. */
  ranch: string | null;
  /** Besucher im Raum (ab Etappe 2): die id des Ereignisses. */
  visitor: string | null;
  /** Runde, auf die sich `seen` bezieht. */
  round: number;
  /** Was in dieser Runde schon angesehen wurde, z. B. 'zeitung'. */
  seen: string[];
}

export type SceneAction =
  | { type: 'open'; sheet: SheetId; tab?: string; back?: SheetBack }
  | { type: 'close' }
  | { type: 'back' }
  | { type: 'tab'; tab: string }
  | { type: 'view'; view: View }
  | { type: 'ranch'; id: string | null }
  /** Akte/Quellen „Auf Karte zeigen“: Karte auf, Ranch gewählt, Fenster zu. */
  | { type: 'showOnMap'; id: string }
  | { type: 'visitor'; id: string | null }
  | { type: 'escape' }
  /** Die Runde des Spiels hat sich geändert (oder das Spiel ist neu geladen). */
  | { type: 'round'; round: number; autoNewspaper: boolean }
  | { type: 'reset' };

export const initialScene: SceneState = { view: 'desk', sheet: null, ranch: null, visitor: null, round: 0, seen: [] };

function merke(seen: string[], key: string): string[] {
  return seen.includes(key) ? seen : [...seen, key];
}

function oeffne(state: SceneState, sheet: OpenSheet): SceneState {
  return { ...state, sheet, seen: merke(state.seen, sheet.id) };
}

/**
 * Esc-Reihenfolge (Bauplan Abschnitt 3): erst der Besucher (er wartet draußen,
 * das Ereignis bleibt offen), dann das Fenster, dann das Ranch-Fenster, dann
 * zurück zum Schreibtisch. Den Kartenzoom erledigt die Karte selbst, bevor das
 * Esc hier ankommt.
 */
export function escape(state: SceneState): SceneState {
  if (state.visitor !== null) return { ...state, visitor: null };
  if (state.sheet !== null) return { ...state, sheet: null };
  if (state.view === 'map' && state.ranch !== null) return { ...state, ranch: null };
  if (state.view === 'map') return { ...state, view: 'desk' };
  return state;
}

export function sceneReducer(state: SceneState, action: SceneAction): SceneState {
  switch (action.type) {
    case 'open':
      return oeffne(state, {
        id: action.sheet,
        ...(action.tab !== undefined ? { tab: action.tab } : {}),
        ...(action.back ? { back: action.back } : {}),
      });
    case 'close':
      return { ...state, sheet: null };
    case 'back': {
      const back = state.sheet?.back;
      if (!back) return { ...state, sheet: null };
      return oeffne(state, { id: back.sheet, ...(back.tab !== undefined ? { tab: back.tab } : {}) });
    }
    case 'tab':
      return state.sheet ? { ...state, sheet: { ...state.sheet, tab: action.tab } } : state;
    case 'view':
      // Wer die Ansicht wechselt, lässt Fenster und Ranch-Fenster hinter sich.
      return { ...state, view: action.view, sheet: null, ranch: action.view === 'map' ? state.ranch : null };
    case 'ranch':
      return { ...state, ranch: action.id };
    case 'showOnMap':
      return { ...state, view: 'map', sheet: null, ranch: action.id };
    case 'visitor':
      return { ...state, visitor: action.id };
    case 'escape':
      return escape(state);
    case 'round': {
      if (action.round === state.round) return state;
      const neu: SceneState = { ...state, round: action.round, seen: [] };
      // Rundenbeginn: höchstens die Zeitung schlägt sich von selbst auf – und nur,
      // wenn gerade nichts anderes offen ist.
      return action.autoNewspaper && neu.sheet === null && neu.visitor === null ? oeffne(neu, { id: 'zeitung' }) : neu;
    }
    case 'reset':
      return { ...initialScene };
  }
}

/** Ist in dieser Runde schon hineingeschaut worden? */
export function seen(state: SceneState, key: string): boolean {
  return state.seen.includes(key);
}

/** Wohin Ruths Zettel führt. */
export type RuthTarget = { kind: 'ranch'; parcelId: string } | { kind: 'sheet'; sheet: SheetId; tab?: string };

/**
 * Das Ziel von Ruths Zettel: zuerst das, worauf der Einstieg zeigt, sonst die
 * Ranch des nächsten Schritts, sonst das erste Offene vom Tisch, sonst die Glocke.
 * Hier wird nichts entschieden, nur der Hinweis aus src/sim einem Ort zugeordnet.
 */
export function ruthTarget(input: {
  tutorial: { kind: string; parcelId?: string } | null;
  stepParcelIds: readonly string[];
  /** Ziele aus „Noch offen“ (openItems), in ihrer Reihenfolge. */
  openTargets: readonly (SheetId | 'tuer')[];
  finished: boolean;
}): RuthTarget | null {
  const t = input.tutorial;
  if (t) {
    if (t.kind === 'sell') return { kind: 'sheet', sheet: 'fracht', tab: 'verkauf' };
    if (t.kind === 'loan') return { kind: 'sheet', sheet: 'kassenbuch' };
    if (t.kind === 'endRound') return { kind: 'sheet', sheet: 'glocke' };
    if (t.parcelId) return { kind: 'ranch', parcelId: t.parcelId };
  }
  if (input.stepParcelIds.length > 0) return { kind: 'ranch', parcelId: input.stepParcelIds[0] };
  if (input.finished) return null;
  const offen = input.openTargets.find((x): x is SheetId => x !== 'tuer');
  return { kind: 'sheet', sheet: offen ?? 'glocke' };
}

/** Welcher Gegenstand am Schreibtisch für dieses Ziel leuchtet. */
export function targetObject(target: RuthTarget | null): SheetId | 'karte' | null {
  if (!target) return null;
  return target.kind === 'ranch' ? 'karte' : target.sheet;
}
