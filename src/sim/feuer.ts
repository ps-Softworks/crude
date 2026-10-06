// „Ein Feuer in der Nacht“ (GDD §14, frühes Ende ab Kapitel 1; §9.5 Eskalationsleiter).
//
// Jim Bullard ist der einzige Rivale, der bis Stufe 4 (Gewalt) geht. Seine Eskalationsstufe
// wird nicht gezählt, sondern aus dem abgeleitet, was es schon gibt:
//   Grundstufe  Kapitel 1: Fehde (bullard_fehde) = 2, Verrat am Handschlag (bullard_verraten) = 3.
//               Ab Kapitel 2 zusätzlich Bullards Groll in der Diplomatie (feuer.levels.grudge)
//               und Verrat an einer Absprache (Gedächtnis „verrat“) = 3.
//   Taten       + 1 für Sabotage des Sicherheitschefs bei Bullard (fixer_sabotage),
//               + 1 für Jacobs Gegendrohung auf den Drohbrief (feuer_gegendrohung),
//               + 1, wenn Stufe 3 nach dem Drohbrief festerRounds Runden ohne Versöhnung schwelt.
//   Versöhnung  − reconcile (bullard_versoehnt oder k2_rache_bullard_versoehnt); danach höchstens Stufe 3.
//
// Ablauf am Rundenende (settleFeuer, nach der Pleiteprüfung):
//   Stufe 3 zum ersten Mal → Merkzeichen feuer_drohung → nächste Runde der Drohbrief (content/events/feuer.yaml).
//   Stufe 4 zum ersten Mal → Merkzeichen feuer_stufe4 → nächste Runde bittet Ruth.
//   Ab graceRounds Runden danach, solange Stufe 4: je Runde attack.chance auf einen Anschlag
//   (× guardFactor mit Nachtwache oder Sheriff-Wache) → Ende „feuer“.
//   Nachtwache (feuer_wache) kostet je Runde guard.costPerRound, solange Bullard gefährlich ist (Stufe ≥ 3).
// Eigener Zufall je Runde (Seed + „:feuer:<Runde>“) – kein Zustand im Spielstand, alte Stände laden unverändert.
// Wer Bullard nie verrät, nicht sabotiert und nicht zurückdroht, kommt nie über Stufe 3 – und Stufe 3 tötet nicht.

import { parseDocument } from 'yaml';
import { BalanceError, type Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { betrayedBy } from './diplomacyCore';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { Rng, seedFromString } from './rng';
import { RIVAL_MARKS } from './trust';
import { STAFF_MARKS } from './staff';

/** Merkzeichen: die ersten beiden setzt die Simulation, die anderen eine Antwort in content/events/feuer.yaml. */
export const FEUER_MARKS = {
  /** Stufe 3 erreicht – der Drohbrief kommt. */
  threat: 'feuer_drohung',
  /** Stufe 4 erreicht – Ruth bittet; danach drohen Anschläge. */
  violence: 'feuer_stufe4',
  /** Jacob hat Bullard entschädigt. */
  reconciled: 'bullard_versoehnt',
  /** Versöhnung nach Bullards Rache in der Diplomatie (k2-diplomatie.yaml). */
  reconciledK2: 'k2_rache_bullard_versoehnt',
  /** Nachtwache angeheuert. */
  guard: 'feuer_wache',
  /** Jacob hat zurückgedroht. */
  counterThreat: 'feuer_gegendrohung',
  /** Ruth (und die Kinder) wohnen bei ihrer Schwester in Port Ellis. */
  familyAway: 'feuer_familie_fort',
} as const;

/** Merkzeichen, die die Simulation selbst setzt (Inhaltsprüfung). */
export const FEUER_SIM_MARKS: readonly string[] = [FEUER_MARKS.threat, FEUER_MARKS.violence];
/** Merkzeichen, die die Simulation liest (für npm run check:events). */
export const FEUER_READ_MARKS: readonly string[] = [FEUER_MARKS.reconciled, FEUER_MARKS.guard, FEUER_MARKS.counterThreat, FEUER_MARKS.familyAway];

export interface FeuerBalance {
  levels: {
    /** Bullards Groll (Diplomatie, 0–100) ab Kapitel 2: ab diesen Werten Stufe 1, 2, 3. */
    grudge: [number, number, number];
  };
  /** Versöhnung senkt die Stufe um so viel. */
  reconcile: number;
  /** So viele Runden nach dem Drohbrief ohne Versöhnung schwelt Stufe 3 zu Stufe 4. */
  festerRounds: number;
  /** Anschläge frühestens so viele Runden nach Stufe 4 (Ruth hat gewarnt). */
  graceRounds: number;
  attack: { chance: number; guardFactor: number };
  guard: { costPerRound: number };
  /** Bots: so viele $ ist ihnen eine Stufe weniger Bullard wert (Antworten auf Drohbrief und Ruths Bitte). */
  bots: Record<'cautious' | 'balanced' | 'greedy' | 'cheat', number>;
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(raw: unknown, path: string, min = 0, max = Infinity): number {
  const v = wert(raw, `feuer.${path}`);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "feuer.${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "feuer.${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

function ganz(raw: unknown, path: string, min: number): number {
  const v = zahl(raw, path, min);
  if (!Number.isInteger(v)) throw new BalanceError(`balance.yaml: "feuer.${path}" muss eine ganze Zahl ab ${min} sein`);
  return v;
}

export function parseFeuerBalance(raw: unknown): FeuerBalance {
  if (!wert(raw, 'feuer')) throw new BalanceError('balance.yaml: Block "feuer" fehlt');
  const g = wert(raw, 'feuer.levels.grudge');
  if (!Array.isArray(g) || g.length !== 3 || g.some((x) => typeof x !== 'number') || !(g[0] < g[1] && g[1] < g[2])) {
    throw new BalanceError('balance.yaml: "feuer.levels.grudge" braucht drei steigende Zahlen (Groll für Stufe 1, 2, 3)');
  }
  return {
    levels: { grudge: [g[0], g[1], g[2]] },
    reconcile: ganz(raw, 'reconcile', 1),
    festerRounds: ganz(raw, 'festerRounds', 1),
    graceRounds: ganz(raw, 'graceRounds', 0),
    attack: { chance: zahl(raw, 'attack.chance', 0, 1), guardFactor: zahl(raw, 'attack.guardFactor', 0, 1) },
    guard: { costPerRound: zahl(raw, 'guard.costPerRound') },
    bots: { cautious: zahl(raw, 'bots.cautious'), balanced: zahl(raw, 'bots.balanced'), greedy: zahl(raw, 'bots.greedy'), cheat: zahl(raw, 'bots.cheat') },
  };
}

type Lage = Pick<GameState, 'round' | 'events'> & Partial<Pick<GameState, 'diplomacy' | 'chapter' | 'deals'>>;

function mark(state: Pick<GameState, 'events'>, m: string): number | undefined {
  return state.events.marks[m];
}

/** Hat Jacob sich mit Bullard versöhnt (Drohbrief, Ruths Bitte oder Diplomatie)? */
export function reconciled(state: Pick<GameState, 'events'>): boolean {
  return mark(state, FEUER_MARKS.reconciled) !== undefined || mark(state, FEUER_MARKS.reconciledK2) !== undefined;
}

/** Grundstufe aus Fehde, Verrat und (ab Kapitel 2) Bullards Groll. */
function baseLevel(state: Lage, balance: Balance): number {
  let stufe = 0;
  if (mark(state, RIVAL_MARKS.bullardFeud) !== undefined) stufe = 2;
  if (mark(state, RIVAL_MARKS.bullardBetrayed) !== undefined) stufe = 3;
  const d = state.diplomacy;
  if (d) {
    const groll = d.relations.bullard.grudge;
    const [g1, g2, g3] = balance.feuer.levels.grudge;
    const ausGroll = groll >= g3 ? 3 : groll >= g2 ? 2 : groll >= g1 ? 1 : 0;
    stufe = Math.max(stufe, ausGroll, betrayedBy(d, 'bullard') ? 3 : 0);
  }
  return stufe;
}

/**
 * Bullards Eskalationsstufe 0–4 (GDD §9.5): 0 Wettbewerb … 3 Kriminell (Drohungen), 4 Gewalt (Brandstiftung).
 */
export function escalationLevel(state: Lage, balance: Balance): number {
  const b = balance.feuer;
  let stufe = baseLevel(state, balance);
  if (mark(state, STAFF_MARKS.sabotaged) !== undefined) stufe++;
  if (mark(state, FEUER_MARKS.counterThreat) !== undefined) stufe++;
  const versoehnt = reconciled(state);
  const drohung = mark(state, FEUER_MARKS.threat);
  if (!versoehnt && drohung !== undefined && stufe >= 3 && state.round >= drohung + b.festerRounds) stufe++;
  if (versoehnt) stufe = Math.min(3, stufe - b.reconcile);
  return Math.max(0, Math.min(4, stufe));
}

/** Steht diese Runde eine Wache: Nachtwache (solange Bullard gefährlich ist) oder Sheriff Tatums Mann (Deal „Wache“)? */
export function guarded(state: Lage, balance: Balance): boolean {
  const nacht = mark(state, FEUER_MARKS.guard) !== undefined && escalationLevel(state, balance) >= 3;
  return nacht || state.deals?.guardRound === state.round;
}

/** Chance auf einen Anschlag am Ende dieser Runde (0, solange Stufe 4 nicht erreicht oder die Schonfrist läuft). */
export function attackChance(state: Lage, balance: Balance): number {
  const b = balance.feuer;
  const vier = mark(state, FEUER_MARKS.violence);
  if (vier === undefined || escalationLevel(state, balance) < 4) return 0;
  if (state.round < vier + b.graceRounds) return 0;
  return b.attack.chance * (guarded(state, balance) ? b.attack.guardFactor : 1);
}

/**
 * Um wie viele Stufen eine Antwort Bullard beruhigt (Lesehilfe für die Bots, keine Regel): Versöhnung bis zu
 * reconcile Stufen, Nachtwache wiegt wie eine Stufe (sofern noch keine steht), Gegendrohung −1, sonst 0.
 */
export function deescalationSteps(state: Lage, balance: Balance, marks: readonly string[]): number {
  const stufe = escalationLevel(state, balance);
  let schritte = 0;
  if (marks.includes(FEUER_MARKS.reconciled) && !reconciled(state)) schritte += Math.min(stufe, balance.feuer.reconcile);
  if (marks.includes(FEUER_MARKS.guard) && mark(state, FEUER_MARKS.guard) === undefined) schritte += 1;
  if (marks.includes(FEUER_MARKS.counterThreat)) schritte -= 1;
  return schritte;
}

/** Der Wurf dieser Runde – eigener Strom je Runde, ändert keinen anderen Zufall. */
export function attackRoll(state: Pick<GameState, 'seed' | 'round'>): number {
  return new Rng(seedFromString(`${state.seed}:feuer:${state.round}`)).float();
}

function setze(state: GameState, m: string): GameState {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [m]: state.round } } };
}

function mitLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

/**
 * Am Rundenende (nach der Pleiteprüfung): Wachlohn, Warnungen setzen, Anschlag würfeln.
 * Endet die Partie, steht ending „feuer“.
 */
export function settleFeuer(state: GameState, balance: Balance): GameState {
  if (state.finished) return state;
  const b = balance.feuer;
  let s = state;
  const stufe = escalationLevel(s, balance);
  if (mark(s, FEUER_MARKS.guard) !== undefined && stufe >= 3 && b.guard.costPerRound > 0) {
    s = mitLog({ ...s, cash: s.cash - b.guard.costPerRound }, `Lohn für die Nachtwache: ${b.guard.costPerRound.toLocaleString('de-DE')} $.`);
  }
  if (stufe >= 3 && mark(s, FEUER_MARKS.threat) === undefined) return setze(s, FEUER_MARKS.threat);
  if (stufe >= 4 && mark(s, FEUER_MARKS.violence) === undefined) {
    // Die Drohung kam nie (Sprung von 2 auf 4): Ruths Bitte ist dann die Warnung.
    return setze(s, FEUER_MARKS.violence);
  }
  const chance = attackChance(s, balance);
  if (chance <= 0 || attackRoll(s) >= chance) return s;
  const text =
    chapterOf(s) >= 2
      ? 'In der Nacht brennt das Haus der Harlans. Jacob Harlan kommt nicht mehr heraus. Niemand hat Bullards Männer gesehen.'
      : 'In der Nacht brennen Bohrturm und Holzhaus der Harlans. Jacob Harlan kommt nicht mehr heraus. Niemand hat Bullards Männer gesehen.';
  return { ...mitLog(s, text), finished: true, ending: 'feuer' };
}

// ---------------------------------------------------------------------------
// Texte: content/feuer.yaml

export interface FeuerContent {
  draft: boolean;
  title: LocalizedText;
  /** Haupttext je Kapitel (k1, k2, k3). */
  text: Record<'k1' | 'k2' | 'k3', LocalizedText>;
  fate: {
    heading: LocalizedText;
    ruth: LocalizedText;
    ruthAway: LocalizedText;
    thomas: LocalizedText;
    thomasAway: LocalizedText;
    company: LocalizedText;
  };
  restart: LocalizedText;
}

const FATE_KEYS = ['heading', 'ruth', 'ruthAway', 'thomas', 'thomasAway', 'company'] as const;

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/feuer.yaml; fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseFeuerContent(file: string, text: string): { content: FeuerContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht title, text, fate und restart.');
    return { content: null, errors };
  }
  const leer: LocalizedText = { de: '', en: '' };
  function sprachtext(value: unknown, wo: string): LocalizedText {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return leer;
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: deutscher Text fehlt.`);
      return leer;
    }
    if (typeof value.en !== 'string' || value.en.trim() === '') fehler(`${wo}: englischer Text fehlt.`);
    return { de: value.de.trim(), en: typeof value.en === 'string' ? value.en.trim() : '' };
  }
  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');
  const t = istObjekt(raw.text) ? raw.text : {};
  if (!istObjekt(raw.text)) fehler('text: braucht k1, k2 und k3.');
  const f = istObjekt(raw.fate) ? raw.fate : {};
  if (!istObjekt(raw.fate)) fehler(`fate: braucht ${FATE_KEYS.join(', ')}.`);
  const fate = Object.fromEntries(FATE_KEYS.map((k) => [k, sprachtext(f[k], `fate.${k}`)])) as FeuerContent['fate'];
  const content: FeuerContent = {
    draft: raw.draft === true,
    title: sprachtext(raw.title, 'title'),
    text: { k1: sprachtext(t.k1, 'text.k1'), k2: sprachtext(t.k2, 'text.k2'), k3: sprachtext(t.k3, 'text.k3') },
    fate,
    restart: sprachtext(raw.restart, 'restart'),
  };
  return errors.length > 0 ? { content: null, errors } : { content, errors };
}

/** Was der Bildschirm zum Ende zeigt (Lesehilfe, keine Regel). */
export interface FeuerView {
  title: string;
  text: string;
  fateHeading: string;
  /** „Was aus ihnen wurde“: Ruth, Thomas (wenn geboren), die Firma. */
  fates: string[];
  restart: string;
}

export function feuerView(state: Pick<GameState, 'events' | 'family'> & Partial<Pick<GameState, 'chapter'>>, content: FeuerContent, lang?: Lang): FeuerView {
  const k = chapterOf(state);
  const fort = mark(state, FEUER_MARKS.familyAway) !== undefined;
  const fates = [localize(fort ? content.fate.ruthAway : content.fate.ruth, lang)];
  if (state.family.thomasBorn > 0) fates.push(localize(fort ? content.fate.thomasAway : content.fate.thomas, lang));
  fates.push(localize(content.fate.company, lang));
  return {
    title: localize(content.title, lang),
    text: localize(k >= 3 ? content.text.k3 : k === 2 ? content.text.k2 : content.text.k1, lang),
    fateHeading: localize(content.fate.heading, lang),
    fates,
    restart: localize(content.restart, lang),
  };
}
