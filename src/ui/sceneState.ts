// Szenenzustand (0.2.15+9): Was gerade zu sehen ist – Schreibtisch oder Karte,
// welches Fenster offen ist (mit Reiter und Rücksprung), welche Ranch gewählt ist.
// Ab 0.2.15+10 auch: wer im Raum steht (Besucher oder Szene) und was in dieser
// Runde schon angesehen wurde (für „neu“) – gemerkt über ein Neuladen hinweg.
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
  /** Rundenbericht nach der Glocke: was über Nacht geschah (0.2.15+11). */
  'bericht',
  /** Wer vor der Tür wartet, wenn es mehrere sind (0.2.15+11). */
  'wartende',
  /** 4.17 Andockpunkt: Siegelmappe – Seismik, Mr. Vale, Projekte, Hallstead (erst ab Kapitel 3 auf dem Tisch). */
  'konzern',
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
  /** Dieses Ereignis liegt beim Öffnen vorn (0.2.15+11). */
  focus?: string;
  /** Geht dieses Fenster zu, schlägt sich danach jenes auf (Rundenbericht → Zeitung). */
  then?: SheetId;
}

export interface SceneState {
  view: View;
  sheet: OpenSheet | null;
  /** Gewählte Ranch auf der Karte – ihr Fenster ist offen. */
  ranch: string | null;
  /** Besucher im Raum oder Szene im Vollbild: die id des Ereignisses. */
  visitor: string | null;
  /** Runde, auf die sich `seen` bezieht. */
  round: number;
  /** Was in dieser Runde schon angesehen wurde, z. B. 'zeitung'. */
  seen: string[];
}

export type SceneAction =
  | { type: 'open'; sheet: SheetId; tab?: string; back?: SheetBack; focus?: string }
  | { type: 'close' }
  | { type: 'back' }
  | { type: 'tab'; tab: string }
  | { type: 'view'; view: View }
  | { type: 'ranch'; id: string | null }
  /** Akte/Quellen „Auf Karte zeigen“: Karte auf, Ranch gewählt, Fenster zu. */
  | { type: 'showOnMap'; id: string }
  /** Besucher herein (id) oder wieder hinaus (null). Herein zählt als gesehen. */
  | { type: 'visitor'; id: string | null }
  /** Diese Dinge gelten ab jetzt als gesehen (z. B. Briefe beim Öffnen der Post). */
  | { type: 'seen'; keys: readonly string[] }
  | { type: 'escape' }
  /** Die Runde des Spiels hat sich geändert (oder das Spiel ist neu geladen). report: der Rundenbericht kommt zuerst. */
  | { type: 'round'; round: number; autoNewspaper: boolean; report?: boolean }
  | { type: 'reset' };

export const initialScene: SceneState = { view: 'desk', sheet: null, ranch: null, visitor: null, round: 0, seen: [] };

function merke(seen: string[], key: string): string[] {
  return seen.includes(key) ? seen : [...seen, key];
}

function oeffne(state: SceneState, sheet: OpenSheet): SceneState {
  return { ...state, sheet, seen: merke(state.seen, sheet.id) };
}

/** Fenster zu – oder, wenn es ein „danach“ hat (Rundenbericht), das nächste auf. */
function schliesse(state: SceneState): SceneState {
  const then = state.sheet?.then;
  if (then && !state.seen.includes(then)) return oeffne(state, { id: then });
  return { ...state, sheet: null };
}

/**
 * Esc-Reihenfolge (Bauplan Abschnitt 3): erst der Besucher (er wartet draußen,
 * das Ereignis bleibt offen), dann das Fenster, dann das Ranch-Fenster, dann
 * zurück zum Schreibtisch. Den Kartenzoom erledigt die Karte selbst, bevor das
 * Esc hier ankommt.
 */
export function escape(state: SceneState): SceneState {
  if (state.visitor !== null) return { ...state, visitor: null };
  if (state.sheet !== null) return schliesse(state);
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
        ...(action.focus !== undefined ? { focus: action.focus } : {}),
      });
    case 'close':
      return schliesse(state);
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
      if (action.id === null) return { ...state, visitor: null };
      // Wer jemanden hereinbittet, braucht keinen Besuch von selbst mehr in dieser Runde.
      return { ...state, visitor: action.id, sheet: null, seen: merke(merke(state.seen, `ev:${action.id}`), AUTO_BESUCH) };
    case 'seen': {
      const neu = action.keys.filter((k) => !state.seen.includes(k));
      return neu.length === 0 ? state : { ...state, seen: [...state.seen, ...neu] };
    }
    case 'escape':
      return escape(state);
    case 'round': {
      if (action.round === state.round) return state;
      const neu: SceneState = { ...state, round: action.round, seen: [] };
      // Rundenbeginn: höchstens der Rundenbericht und die Zeitung schlagen sich von
      // selbst auf – erst der Bericht, dann die Zeitung – und nur, wenn gerade nichts anderes offen ist.
      if (neu.sheet !== null || neu.visitor !== null) return neu;
      if (action.report) return oeffne(neu, { id: 'bericht', ...(action.autoNewspaper ? { then: 'zeitung' as const } : {}) });
      return action.autoNewspaper ? oeffne(neu, { id: 'zeitung' }) : neu;
    }
    case 'reset':
      return { ...initialScene };
  }
}

/** Merkzeichen in `seen`: In dieser Runde kam schon ein Besucher (von selbst oder gerufen). */
export const AUTO_BESUCH = 'auto-besuch';

/**
 * Gegen eine Flut von Fenstern (Bauplan Abschnitt 4): Pro Runde schlägt sich erst
 * die Zeitung auf; ist sie zu, kommt höchstens der Erste von der Wartebank von
 * selbst herein – eine Szene (Geburt, Brand …) vor einem Besucher. Alles andere
 * wartet still. Gibt die id zurück, die jetzt hereinkommt, sonst null.
 */
export function autoVisitor(
  state: SceneState,
  input: {
    /** Szenen und Besucher dieser Runde, in ihrer Reihenfolge. */
    tableaus: readonly string[];
    visitors: readonly string[];
    autoNewspaper: boolean;
    /** Es gibt eine Ausgabe (am Kapitelende nicht). */
    newspaper: boolean;
    /** Gerade läuft etwas anderes (Rundenwechsel, Rundgang, Kapitelende). */
    busy: boolean;
  },
): string | null {
  if (input.busy || state.view !== 'desk' || state.sheet !== null || state.visitor !== null) return null;
  if (state.seen.includes(AUTO_BESUCH)) return null;
  if (input.autoNewspaper && input.newspaper && !state.seen.includes('zeitung')) return null;
  return input.tableaus[0] ?? input.visitors[0] ?? null;
}

/** Was über ein Neuladen hinweg gemerkt wird: die „gesehen“-Liste dieser Runde. */
export function storeScene(state: SceneState, key: string): string {
  return JSON.stringify({ key, round: state.round, seen: state.seen });
}

/**
 * Der Szenenzustand nach dem Neuladen: gehört das Gemerkte zu dieser Partie und
 * Runde (`key`), gilt es weiter – sonst fängt die Runde frisch an (und die Zeitung
 * schlägt sich auf). Kaputtes oder fehlendes Gemerktes ist kein Fehler.
 */
export function restoreScene(text: string | null, key: string): SceneState {
  if (!text) return initialScene;
  try {
    const d = JSON.parse(text) as { key?: unknown; round?: unknown; seen?: unknown };
    if (d.key !== key || typeof d.round !== 'number' || !Array.isArray(d.seen)) return initialScene;
    return { ...initialScene, round: d.round, seen: d.seen.filter((x): x is string => typeof x === 'string') };
  } catch {
    return initialScene;
  }
}

/** Ist in dieser Runde schon hineingeschaut worden? */
export function seen(state: SceneState, key: string): boolean {
  return state.seen.includes(key);
}

/** Wohin Ruths Zettel führt. */
export type RuthTarget = { kind: 'ranch'; parcelId: string } | { kind: 'sheet'; sheet: SheetId; tab?: string } | { kind: 'tuer' };

/**
 * Das Ziel von Ruths Zettel: zuerst das, worauf der Einstieg zeigt, sonst die
 * Ranch des nächsten Schritts, sonst das erste Offene vom Tisch, sonst die Glocke.
 * Hier wird nichts entschieden, nur der Hinweis aus src/sim einem Ort zugeordnet.
 */
export function ruthTarget(input: {
  tutorial: { kind: string; parcelId?: string } | null;
  stepParcelIds: readonly string[];
  /** Ziele aus „Noch offen“ (openItems), in ihrer Reihenfolge; eine Ranch für verfallendes Land (0.2.15+12). */
  openTargets: readonly (SheetId | 'tuer' | { parcelId: string })[];
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
  const offen = input.openTargets[0];
  if (offen === 'tuer') return { kind: 'tuer' };
  if (typeof offen === 'object') return { kind: 'ranch', parcelId: offen.parcelId };
  return { kind: 'sheet', sheet: offen ?? 'glocke' };
}

/** Welcher Gegenstand am Schreibtisch für dieses Ziel leuchtet. */
export function targetObject(target: RuthTarget | null): SheetId | 'karte' | 'tuer' | null {
  if (!target) return null;
  if (target.kind === 'tuer') return 'tuer';
  return target.kind === 'ranch' ? 'karte' : target.sheet;
}
