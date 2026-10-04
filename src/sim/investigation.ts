// Ermittler (4.11, GDD §4 „Hitze & Schattenbuch“, §10 „Ermittlungen & Justiz“).
//
// Ab Kapitel 2 (investigation.fromChapter) ist Bundesanwalt Frank Delaney in
// Cordova. Was Jacob früher Schmutziges getan hat, steht als Merkzeichen im
// Spielstand (moss_betrogen, sheriff_bezahlt, …). balance.yaml macht daraus
// SPUREN mit einer Schwere 1–5; ihre Summe ist die HITZE. Spuren verblassen
// langsam (−1 alle fadeEvery Runden), solange niemand ermittelt – Zeugen-Spuren
// (witness) nie: Ein Mann, der redet, vergisst nicht.
//
// Ablauf (GDD §10): Ruhe → Gerücht (Hitze ≥ rumorAt) → nach rumorRounds Runden Vorermittlung (Hitze ≥ probeAt;
// Delaney sammelt Beweise, je Runde mehr, je heißer es ist) → Anklage (Beweise ≥
// chargeAt) → nach trialDelay Runden Urteil → abgeschlossen. Ist die Beweislage in
// der Vorermittlung wieder bei null und die Hitze unter probeAt, stellt Delaney ein.
// Was beim Abschluss auf dem Tisch lag, ist erledigt (closed) und zählt nicht mehr.
//
// Gegenmittel (GDD §10): Anwalt (Stufe 0–5, kostet je Runde), Spur vernichten
// (kann eine neue Spur „Vertuschung“ erzeugen), Zeugen kaufen (neue Spur!),
// Sündenbock (einmal je Fall, kostet Kraft), politischer Druck (Delaney wird für
// einige Runden versetzt – je nach Regierung; misslingt es, wird es schlimmer).
//
// Auf dem Schreibtisch erscheint Delaney über Ereignisse (content/events/k2-delaney.yaml):
// Die Simulation setzt die Merkzeichen DELANEY_MARKS, die Antworten setzen
// DELANEY_CHOICE_MARKS, die hier gelesen werden (je einmal, gemerkt in applied).
//
// Rein und deterministisch: eigener Zufall (Seed + ":delaney"). In Kapitel 1 ändert
// keine Funktion etwas – der Zustand bleibt dasselbe Objekt.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import type { ContentError } from './eventContent';
import type { EventDef } from './events';
import type { GameState } from './game';
import { LANGUAGES, type LocalizedText } from './i18n';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf, PORT_PARTIES, worldPort, type PortParty, type WorldPort } from './worldPort';

// --- Spielzahlen (balance.yaml, Abschnitt investigation) ------------------------

export interface TraceBalance {
  /** Merkzeichen aus einer früheren Entscheidung. */
  mark: string;
  /** Schwere 1–5. */
  severity: number;
  /** Ein Zeuge: verblasst nie und bringt Delaney zu Beginn der Vorermittlung Beweise. */
  witness: boolean;
}

export interface InvestigationBalance {
  fromChapter: number;
  traces: TraceBalance[];
  /** Merkzeichen, die für Jacob sprechen (Leumund vor Gericht). */
  goodMarks: string[];
  /** Ersatz, solange es kein Weltmodell gibt (Stimmung, Regierung). */
  worldFallback: WorldPort;
  fadeEvery: number;
  jumpFade: number;
  rumorAt: number;
  /** So viele Runden bleibt es mindestens beim Gerücht, bevor Delaney ermittelt. */
  rumorRounds: number;
  probeAt: number;
  chargeAt: number;
  /** Hitze-Wörter: ab warm „warm“, ab hot „heiß“, ab glowing „glühend“ (darunter „kühl“). */
  heatWords: { warm: number; hot: number; glowing: number };
  trialDelay: number;
  cooldown: number;
  evidence: {
    perHeat: number;
    perWitness: number;
    lawyerCut: number;
    transferredDecay: number;
    hostileFactor: number;
    divertedFactor: number;
    candid: number;
    slipChance: number;
    slip: number;
  };
  trial: { base: number; perEvidence: number; perLawyer: number; perGood: number; moodWeight: number; interview: number; min: number; max: number };
  fine: { perHeat: number; candidFactor: number; heavyAt: number; heavyFactor: number };
  lawyer: { costPerLevel: number; max: number; early: number; summoned: number };
  destroy: { cost: number; cut: number; chance: number; severity: number; evidence: number };
  witness: { cost: number; evidenceCut: number; severity: number };
  scapegoat: { evidenceCut: number; strength: number };
  pressure: { cost: number; rounds: number; chance: Record<PortParty | 'none', number>; failEvidence: number; severity: number };
  crown: { evidenceCut: number };
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(obj: unknown, path: string, min = -Infinity, max = Infinity): number {
  const v = wert(obj, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

function ganz(obj: unknown, path: string, min: number, max = Infinity): number {
  const v = zahl(obj, path, min, max);
  if (!Number.isInteger(v)) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl sein`);
  return v;
}

const MARKE = /^[a-z0-9_]+$/;

/** Liest den Abschnitt investigation aus balance.yaml (4.11). */
export function parseInvestigationBalance(raw: unknown): InvestigationBalance {
  const p = 'investigation';
  const block = wert(raw, p);
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Abschnitt "investigation" fehlt');
  const tracesRaw = wert(raw, `${p}.traces`);
  if (!Array.isArray(tracesRaw) || tracesRaw.length === 0) throw new BalanceError(`balance.yaml: "${p}.traces" fehlt oder ist leer`);
  const traces: TraceBalance[] = tracesRaw.map((t, i) => {
    const mark = (t as { mark?: unknown })?.mark;
    if (typeof mark !== 'string' || !MARKE.test(mark)) throw new BalanceError(`balance.yaml: "${p}.traces" Nr. ${i + 1} braucht mark (Kleinbuchstaben, Ziffern, _)`);
    const witness = (t as { witness?: unknown }).witness ?? false;
    if (typeof witness !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.traces.${mark}.witness" muss true oder false sein`);
    return { mark, severity: ganz(t, 'severity', 1, 5), witness };
  });
  if (new Set(traces.map((t) => t.mark)).size !== traces.length) throw new BalanceError(`balance.yaml: "${p}.traces" nennt ein Merkzeichen doppelt`);
  const goodRaw = wert(raw, `${p}.goodMarks`) ?? [];
  if (!Array.isArray(goodRaw) || !goodRaw.every((m) => typeof m === 'string' && MARKE.test(m))) throw new BalanceError(`balance.yaml: "${p}.goodMarks" muss eine Liste von Merkzeichen sein`);
  const regierung = wert(raw, `${p}.worldFallback.government`) ?? null;
  if (regierung !== null && !(PORT_PARTIES as readonly unknown[]).includes(regierung)) throw new BalanceError(`balance.yaml: "${p}.worldFallback.government" muss handel, volksbund, provinz oder null sein`);
  const worte = { warm: ganz(raw, `${p}.heatWords.warm`, 1), hot: ganz(raw, `${p}.heatWords.hot`, 1), glowing: ganz(raw, `${p}.heatWords.glowing`, 1) };
  if (!(worte.warm < worte.hot && worte.hot < worte.glowing)) throw new BalanceError(`balance.yaml: "${p}.heatWords" muss aufsteigen (warm < hot < glowing)`);
  const b: InvestigationBalance = {
    fromChapter: ganz(raw, `${p}.fromChapter`, 1),
    traces,
    goodMarks: goodRaw as string[],
    worldFallback: { mood: zahl(raw, `${p}.worldFallback.mood`, 0, 100), tech: 0, government: regierung as PortParty | null },
    fadeEvery: ganz(raw, `${p}.fadeEvery`, 1),
    jumpFade: ganz(raw, `${p}.jumpFade`, 0),
    rumorAt: ganz(raw, `${p}.rumorAt`, 1),
    rumorRounds: ganz(raw, `${p}.rumorRounds`, 0),
    probeAt: ganz(raw, `${p}.probeAt`, 1),
    chargeAt: zahl(raw, `${p}.chargeAt`, 1, 100),
    heatWords: worte,
    trialDelay: ganz(raw, `${p}.trialDelay`, 1),
    cooldown: ganz(raw, `${p}.cooldown`, 0),
    evidence: {
      perHeat: zahl(raw, `${p}.evidence.perHeat`, 0),
      perWitness: zahl(raw, `${p}.evidence.perWitness`, 0),
      lawyerCut: zahl(raw, `${p}.evidence.lawyerCut`, 0),
      transferredDecay: zahl(raw, `${p}.evidence.transferredDecay`, 0),
      hostileFactor: zahl(raw, `${p}.evidence.hostileFactor`, 0),
      divertedFactor: zahl(raw, `${p}.evidence.divertedFactor`, 0),
      candid: zahl(raw, `${p}.evidence.candid`, 0),
      slipChance: zahl(raw, `${p}.evidence.slipChance`, 0, 1),
      slip: zahl(raw, `${p}.evidence.slip`, 0),
    },
    trial: {
      base: zahl(raw, `${p}.trial.base`, 0, 1),
      perEvidence: zahl(raw, `${p}.trial.perEvidence`, 0),
      perLawyer: zahl(raw, `${p}.trial.perLawyer`, 0),
      perGood: zahl(raw, `${p}.trial.perGood`, 0),
      moodWeight: zahl(raw, `${p}.trial.moodWeight`, 0),
      interview: zahl(raw, `${p}.trial.interview`, 0),
      min: zahl(raw, `${p}.trial.min`, 0, 1),
      max: zahl(raw, `${p}.trial.max`, 0, 1),
    },
    fine: {
      perHeat: zahl(raw, `${p}.fine.perHeat`, 0),
      candidFactor: zahl(raw, `${p}.fine.candidFactor`, 0),
      heavyAt: ganz(raw, `${p}.fine.heavyAt`, 1),
      heavyFactor: zahl(raw, `${p}.fine.heavyFactor`, 1),
    },
    lawyer: {
      costPerLevel: zahl(raw, `${p}.lawyer.costPerLevel`, 0),
      max: ganz(raw, `${p}.lawyer.max`, 1),
      early: ganz(raw, `${p}.lawyer.early`, 0),
      summoned: ganz(raw, `${p}.lawyer.summoned`, 0),
    },
    destroy: {
      cost: zahl(raw, `${p}.destroy.cost`, 0),
      cut: ganz(raw, `${p}.destroy.cut`, 1),
      chance: zahl(raw, `${p}.destroy.chance`, 0, 1),
      severity: ganz(raw, `${p}.destroy.severity`, 1, 5),
      evidence: zahl(raw, `${p}.destroy.evidence`, 0),
    },
    witness: {
      cost: zahl(raw, `${p}.witness.cost`, 0),
      evidenceCut: zahl(raw, `${p}.witness.evidenceCut`, 0),
      severity: ganz(raw, `${p}.witness.severity`, 1, 5),
    },
    scapegoat: { evidenceCut: zahl(raw, `${p}.scapegoat.evidenceCut`, 0), strength: zahl(raw, `${p}.scapegoat.strength`, 0) },
    pressure: {
      cost: zahl(raw, `${p}.pressure.cost`, 0),
      rounds: ganz(raw, `${p}.pressure.rounds`, 1),
      chance: {
        handel: zahl(raw, `${p}.pressure.chance.handel`, 0, 1),
        volksbund: zahl(raw, `${p}.pressure.chance.volksbund`, 0, 1),
        provinz: zahl(raw, `${p}.pressure.chance.provinz`, 0, 1),
        none: zahl(raw, `${p}.pressure.chance.none`, 0, 1),
      },
      failEvidence: zahl(raw, `${p}.pressure.failEvidence`, 0),
      severity: ganz(raw, `${p}.pressure.severity`, 1, 5),
    },
    crown: { evidenceCut: zahl(raw, `${p}.crown.evidenceCut`, 0) },
  };
  if (b.probeAt < b.rumorAt) throw new BalanceError(`balance.yaml: "${p}.probeAt" darf nicht unter "${p}.rumorAt" liegen`);
  if (b.trial.min > b.trial.max) throw new BalanceError(`balance.yaml: "${p}.trial" hat min > max`);
  if (b.lawyer.early > b.lawyer.max || b.lawyer.summoned > b.lawyer.max) throw new BalanceError(`balance.yaml: "${p}.lawyer" early/summoned über max`);
  return b;
}

// --- Merkzeichen ------------------------------------------------------------------

/** Merkzeichen, die die Simulation setzt – Ereignisse in content/events/k2-delaney.yaml reagieren darauf. */
export const DELANEY_MARKS = {
  /** Kapitel 2 hat begonnen, Delaney ist im Amt. */
  arrived: 'delaney_im_amt',
  rumor: 'delaney_geruecht',
  probe: 'delaney_vorermittlung',
  charge: 'delaney_anklage',
  dropped: 'delaney_eingestellt',
  acquitted: 'delaney_freispruch',
  convicted: 'delaney_verurteilt',
  /** Schwere Strafe: Zwangsverkauf (4.x: noch ohne Wirkung auf die Pachten, siehe docs/phase4/4.11.md). */
  forcedSale: 'delaney_zwangsverkauf',
  /** Jacob hat einen Sündenbock geopfert. */
  scapegoat: 'delaney_suendenbock',
} as const;
export const DELANEY_SIM_MARKS: readonly string[] = Object.values(DELANEY_MARKS);

/** Merkzeichen aus den Antworten auf Delaneys Ereignisse, die die Simulation liest. */
export const DELANEY_CHOICE_MARKS = {
  /** Früh einen Anwalt auf Abruf genommen: Anwalt ab lawyer.early, sobald Delaney ermittelt. */
  earlyLawyer: 'delaney_anwalt_frueh',
  /** Nora ein Interview gegeben: vor Gericht besser (trial.interview) – mit dem Risiko eines Versprechers. */
  interview: 'delaney_interview',
  /** Nora Material über den Crane Trust gegeben: Delaney schaut auch dorthin (evidence.divertedFactor). */
  noraCrane: 'delaney_nora_crane',
  /** Delaney offen geantwortet: sofort mehr Beweise, aber mildere Strafe. */
  candid: 'delaney_offen',
  /** Auf den Anwalt verwiesen: Anwalt ab lawyer.summoned. */
  lawyer: 'delaney_anwalt',
  /** Delaney hinausgeworfen: Er gräbt verbissener (evidence.hostileFactor). */
  hostile: 'delaney_feind',
  /** Kronzeuge gegen den Crane Trust: viel weniger Beweise gegen Jacob (4.10: Crane wird zum Feind). */
  crown: 'delaney_kronzeuge',
  /** Vergleich angeboten (Geld in der Antwort): Der Fall ist erledigt. */
  settle: 'delaney_vergleich',
  /** Vor Gericht kämpfen mit dem besten Anwalt der Stadt: eine Anwaltsstufe mehr im Prozess. */
  fight: 'delaney_prozess',
} as const;
export const DELANEY_READ_MARKS: readonly string[] = Object.values(DELANEY_CHOICE_MARKS);

// --- Zustand -------------------------------------------------------------------

export const INVESTIGATION_STAGES = ['ruhe', 'geruecht', 'vorermittlung', 'anklage', 'abgeschlossen'] as const;
export type InvestigationStage = (typeof INVESTIGATION_STAGES)[number];

export const VERDICTS = ['eingestellt', 'freispruch', 'vergleich', 'geldstrafe', 'schwere_strafe'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Neue Spuren aus Kapitel 2 – Gegenmittel hinterlassen selbst Spuren. */
export const EXTRA_KINDS = ['vertuschung', 'zeugenkauf', 'einflussnahme'] as const;

/** Spuren aus der Rivalen-Diplomatie (4.10: Kartell- und Gebietsabsprachen unter dem Kartellgesetz) – Schlüssel für den Text. // 4.10/4.11 Andockpunkt */
export const DIPLOMACY_TRACE_KIND = 'absprache';
export type ExtraKind = (typeof EXTRA_KINDS)[number];

export interface ExtraTrace {
  id: string;
  kind: ExtraKind;
  severity: number;
  round: number;
}

export interface InvestigationState {
  rng: RngState;
  stage: InvestigationStage;
  /** Runde, in der die Stufe begann. */
  since: number;
  /** Delaneys Beweislage 0–100. */
  evidence: number;
  /** Anwaltsstufe 0–lawyer.max; kostet je Runde. */
  lawyer: number;
  /** Ruhige Runden seit dem letzten Verblassen. */
  fadeClock: number;
  /** Verblasst je Spur (Stufen). */
  faded: Record<string, number>;
  /** Vernichtet oder gekauft je Spur (Stufen). */
  cut: Record<string, number>;
  extra: ExtraTrace[];
  /** Erledigte Spuren (Urteil, Vergleich, Einstellung). */
  closed: string[];
  /** Antwort-Merkzeichen, die schon gewirkt haben. */
  applied: string[];
  /** In diesem Fall schon einen Sündenbock geopfert / Druck gemacht. */
  scapegoat: boolean;
  pressure: boolean;
  /** Delaney ist bis zu dieser Runde versetzt (0 = nicht). */
  transferredUntil: number;
  /** Nora hat einen Versprecher im Interview notiert: Delaney bekommt ihn zur Vorermittlung. */
  slip: boolean;
  /** Ausgang des letzten Falls. */
  verdict: Verdict | null;
  /** Abgeschlossene Fälle. */
  cases: number;
  /** Nur Debug: schon vor Kapitel 2 freigeschaltet (Vorschau im Debug-Reiter). */
  preview?: boolean;
}

/** Der Spielzustand mit dem Feld dieses Moduls (4.11 Andockpunkt in GameState). */
type MitErmittlung = GameState & { investigation?: InvestigationState };

export function investigationUnlocked(state: object, balance: Pick<Balance, 'investigation'>): boolean {
  if ((state as { investigation?: { preview?: boolean } }).investigation?.preview === true) return true;
  return chapterOf(state) >= balance.investigation.fromChapter;
}

/** Nur Debug: Ermittler schon vor Kapitel 2 einschalten (Vorschau, bis 4.5 Kapitel 2 startet). */
export function previewInvestigation(state: GameState, balance: Balance): GameState {
  const s = state as MitErmittlung;
  if (s.investigation || state.finished) return state;
  return { ...state, investigation: { ...newInvestigation(state, balance), preview: true } } as GameState;
}

/** Neuer Ermittlungszustand zu Beginn von Kapitel 2: Die Spuren aus dem Zeitsprung verblassen um jumpFade. */
export function newInvestigation(state: GameState, balance: Balance): InvestigationState {
  const b = balance.investigation;
  const faded: Record<string, number> = {};
  for (const t of b.traces) if (!t.witness && b.jumpFade > 0) faded[t.mark] = b.jumpFade;
  return {
    rng: seedFromString(`${state.seed}:delaney`),
    stage: 'ruhe',
    since: state.round,
    evidence: 0,
    lawyer: 0,
    fadeClock: 0,
    faded,
    cut: {},
    extra: [],
    closed: [],
    applied: [],
    scapegoat: false,
    pressure: false,
    transferredUntil: 0,
    slip: false,
    verdict: null,
    cases: 0,
  };
}

// --- Spuren und Hitze ------------------------------------------------------------

export interface TraceView {
  id: string;
  /** Merkzeichen (frühere Spur) oder Art (neue Spur aus Kapitel 2) – Schlüssel für den Text. */
  key: string;
  severity: number;
  /** Schwere jetzt (nach Verblassen und Vernichten). */
  current: number;
  witness: boolean;
  closed: boolean;
}

/** Alle Spuren, die Jacob hat: frühere Merkzeichen und neue Spuren aus Kapitel 2. */
export function traces(state: GameState, balance: Balance): TraceView[] {
  const inv = (state as MitErmittlung).investigation;
  const marks = state.events.marks;
  const faded = inv?.faded ?? {};
  const cut = inv?.cut ?? {};
  const closed = inv?.closed ?? [];
  const alte = balance.investigation.traces
    .filter((t) => marks[t.mark] !== undefined)
    .map((t) => ({ id: t.mark, key: t.mark, severity: t.severity, witness: t.witness, fade: t.witness ? 0 : (faded[t.mark] ?? 0) }));
  const neue = (inv?.extra ?? []).map((e) => ({ id: e.id, key: e.kind, severity: e.severity, witness: false, fade: faded[e.id] ?? 0 }));
  // Absprachen mit Rivalen (4.10, state.diplomacy.traces) – hier verblassen sie, hier kann man sie vernichten.
  const absprachen = (state.diplomacy?.traces ?? []).map((d, i) => {
    const id = `${DIPLOMACY_TRACE_KIND}_${i + 1}`;
    return { id, key: DIPLOMACY_TRACE_KIND, severity: d.severity, witness: false, fade: faded[id] ?? 0 };
  });
  return [...alte, ...neue, ...absprachen].map((t) => ({
    id: t.id,
    key: t.key,
    severity: t.severity,
    current: closed.includes(t.id) ? 0 : Math.max(0, t.severity - t.fade - (cut[t.id] ?? 0)),
    witness: t.witness,
    closed: closed.includes(t.id),
  }));
}

/** Hitze: Summe der Spuren, die noch zählen. */
export function heat(state: GameState, balance: Balance): number {
  return traces(state, balance).reduce((s, t) => s + t.current, 0);
}

export type HeatWord = 'kuehl' | 'warm' | 'heiss' | 'gluehend';

/** Die Hitze als Wort – der Spieler sieht keine Zahl. */
export function heatWord(h: number, balance: Pick<Balance, 'investigation'>): HeatWord {
  const { warm, hot: heiss, glowing: gluehend } = balance.investigation.heatWords;
  return h >= gluehend ? 'gluehend' : h >= heiss ? 'heiss' : h >= warm ? 'warm' : 'kuehl';
}

// --- Rundenabrechnung -----------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function setMark(marks: Record<string, number>, mark: string, round: number): Record<string, number> {
  return marks[mark] !== undefined ? marks : { ...marks, [mark]: round };
}

function zeile(state: GameState, text: string): string {
  return `${formatDate(state)}: ${text}`;
}

/** Spuren, die im laufenden Fall noch nicht erledigt sind und etwas wiegen. */
function offeneSpuren(state: GameState, balance: Balance): TraceView[] {
  return traces(state, balance).filter((t) => !t.closed && t.current > 0);
}

/** Verurteilungschance im Prozess (0–1). Exportiert für die Anzeige im Schattenbuch und für Tests. */
export function convictionChance(state: GameState, balance: Balance): number {
  const inv = (state as MitErmittlung).investigation;
  if (!inv) return 0;
  const t = balance.investigation.trial;
  const marks = state.events.marks;
  const welt = worldPort(state, balance.investigation.worldFallback);
  const anwalt = inv.lawyer + (marks[DELANEY_CHOICE_MARKS.fight] !== undefined ? 1 : 0);
  const leumund = balance.investigation.goodMarks.filter((m) => marks[m] !== undefined).length;
  const interview = marks[DELANEY_CHOICE_MARKS.interview] !== undefined ? t.interview : 0;
  const p = t.base + t.perEvidence * inv.evidence - t.perLawyer * anwalt - t.perGood * leumund + t.moodWeight * (50 - welt.mood) - interview;
  return clamp(p, t.min, t.max);
}

/** Geldstrafe bei Verurteilung, aus der Hitze der offenen Spuren. */
export function fineFor(state: GameState, balance: Balance): { amount: number; heavy: boolean } {
  const f = balance.investigation.fine;
  const h = offeneSpuren(state, balance).reduce((s, t) => s + t.current, 0);
  const heavy = h >= f.heavyAt;
  const offen = state.events.marks[DELANEY_CHOICE_MARKS.candid] !== undefined ? f.candidFactor : 1;
  return { amount: Math.round(h * f.perHeat * (heavy ? f.heavyFactor : 1) * offen), heavy };
}

/** Schließt den laufenden Fall ab: offene Spuren gelten als erledigt, der Anwalt wird entlassen (kostet nichts mehr). */
function abschliessen(state: MitErmittlung, inv: InvestigationState, verdict: Verdict, balance: Balance): InvestigationState {
  const erledigt = offeneSpuren(state, balance).map((t) => t.id);
  return {
    ...inv,
    stage: 'abgeschlossen',
    since: state.round,
    evidence: 0,
    lawyer: 0,
    closed: [...inv.closed, ...erledigt.filter((id) => !inv.closed.includes(id))],
    verdict,
    cases: inv.cases + 1,
    scapegoat: false,
    pressure: false,
    transferredUntil: 0,
  };
}

function laeuft(inv: InvestigationState): boolean {
  return inv.stage === 'vorermittlung' || inv.stage === 'anklage';
}

/** Antworten auf Delaneys Ereignisse wirken je einmal. */
function antwortenAnwenden(state: MitErmittlung, inv: InvestigationState, balance: Balance, rng: Rng): { inv: InvestigationState; log: string[] } {
  const b = balance.investigation;
  const marks = state.events.marks;
  const C = DELANEY_CHOICE_MARKS;
  const log: string[] = [];
  let out = inv;
  const neu = (m: string) => marks[m] !== undefined && !out.applied.includes(m);
  const erledigt = (m: string) => {
    out = { ...out, applied: [...out.applied, m] };
  };
  // Der Anwalt auf Abruf wird erst tätig (und kostet je Runde), wenn Delaney ermittelt.
  if (neu(C.earlyLawyer) && laeuft(out)) {
    out = { ...out, lawyer: Math.max(out.lawyer, b.lawyer.early) };
    erledigt(C.earlyLawyer);
  }
  if (neu(C.lawyer)) {
    out = { ...out, lawyer: Math.max(out.lawyer, b.lawyer.summoned) };
    erledigt(C.lawyer);
  }
  if (neu(C.interview)) {
    // Risiko eines Versprechers (GDD §10): Nora schreibt alles mit.
    const versprecher = rng.float() < b.evidence.slipChance;
    out = { ...out, slip: out.slip || versprecher };
    if (versprecher) log.push('Nora Whitlock hat sich einen Satz aus dem Interview unterstrichen.');
    erledigt(C.interview);
  }
  if (neu(C.candid)) {
    out = { ...out, evidence: clamp(out.evidence + b.evidence.candid, 0, 100) };
    erledigt(C.candid);
  }
  if (neu(C.crown)) {
    out = { ...out, evidence: clamp(out.evidence - b.crown.evidenceCut, 0, 100) };
    log.push('Delaney hat jetzt Akten über den Crane Trust – und weniger Zeit für Jacob.');
    erledigt(C.crown);
  }
  for (const m of [C.noraCrane, C.hostile, C.fight]) if (neu(m)) erledigt(m);
  if (neu(C.settle)) {
    erledigt(C.settle);
    if (out.stage === 'anklage' || out.stage === 'vorermittlung') {
      out = abschliessen(state, out, 'vergleich', balance);
      log.push('Jacob und das Justizministerium einigen sich. Die Akte Harlan wird geschlossen.');
    }
  }
  return { inv: out, log };
}

/**
 * Rundenabrechnung der Ermittlungen (4.11). In Kapitel 1 unverändert dasselbe Objekt.
 * Reihenfolge: Antworten wirken → Anwalt kostet → Stufe rückt vor (Hitze, Beweise, Urteil) →
 * in ruhigen Stufen verblassen die Spuren.
 */
export function advanceInvestigation(input: GameState, balance: Balance): GameState {
  if (!investigationUnlocked(input, balance) || input.finished) return input;
  const b = balance.investigation;
  const start = input as MitErmittlung;
  let marks = input.events.marks;
  const log: string[] = [];
  let inv = start.investigation;
  if (!inv) {
    inv = newInvestigation(input, balance);
    marks = setMark(marks, DELANEY_MARKS.arrived, input.round);
    log.push(zeile(input, 'Das Justizministerium hat einen neuen Bundesanwalt nach Cordova geschickt: Frank Delaney.'));
  }
  const rng = new Rng(inv.rng);
  let state: MitErmittlung = { ...start, events: { ...input.events, marks }, investigation: inv };

  const antworten = antwortenAnwenden(state, inv, balance, rng);
  inv = antworten.inv;
  for (const l of antworten.log) log.push(zeile(input, l));

  let cash = input.cash;
  if (inv.lawyer > 0) {
    const kosten = inv.lawyer * b.lawyer.costPerLevel;
    cash = Math.round((cash - kosten) * 100) / 100;
  }

  state = { ...state, investigation: inv };
  const h = heat(state, balance);
  const runde = input.round;
  const versetzt = inv.transferredUntil >= runde;
  const C = DELANEY_CHOICE_MARKS;

  switch (inv.stage) {
    case 'ruhe':
      if (h >= b.rumorAt) {
        inv = { ...inv, stage: 'geruecht', since: runde };
        marks = setMark(marks, DELANEY_MARKS.rumor, runde);
        log.push(zeile(input, 'In Cordova wird über Jacob Harlan geredet. Delaney hört zu.'));
      }
      break;
    case 'geruecht':
      if (h >= b.probeAt && !versetzt && runde - inv.since >= b.rumorRounds) {
        const zeugen = offeneSpuren(state, balance).filter((t) => t.witness).length;
        const anfang = zeugen * b.evidence.perWitness + (inv.slip ? b.evidence.slip : 0);
        inv = { ...inv, stage: 'vorermittlung', since: runde, evidence: clamp(anfang, 0, 100), slip: false };
        // Anwalt auf Abruf (Antwort auf Delaneys Ankunft): Er kommt, sobald ermittelt wird.
        if (marks[C.earlyLawyer] !== undefined && !inv.applied.includes(C.earlyLawyer)) {
          inv = { ...inv, lawyer: Math.max(inv.lawyer, b.lawyer.early), applied: [...inv.applied, C.earlyLawyer] };
        }
        marks = setMark(marks, DELANEY_MARKS.probe, runde);
        log.push(zeile(input, 'Bundesanwalt Delaney eröffnet eine Vorermittlung gegen Jacob Harlan.'));
      } else if (h < b.rumorAt) {
        inv = { ...inv, stage: 'ruhe', since: runde };
      }
      break;
    case 'vorermittlung': {
      if (versetzt) {
        inv = { ...inv, evidence: clamp(inv.evidence - b.evidence.transferredDecay, 0, 100) };
        break;
      }
      let faktor = 1;
      if (marks[C.hostile] !== undefined) faktor *= b.evidence.hostileFactor;
      if (marks[C.noraCrane] !== undefined) faktor *= b.evidence.divertedFactor;
      let zuwachs = b.evidence.perHeat * h * faktor - b.evidence.lawyerCut * inv.lawyer;
      // Ist die Hitze unter die Schwelle der Vorermittlung gefallen (Spuren vernichtet),
      // verlieren die Beweise an Wert – sonst bliebe der Fall bei Zuwachs 0 ewig offen.
      if (h < b.probeAt) zuwachs = Math.min(zuwachs, -b.evidence.transferredDecay);
      const beweise = clamp(inv.evidence + zuwachs, 0, 100);
      inv = { ...inv, evidence: Math.round(beweise * 10) / 10 };
      if (inv.evidence >= b.chargeAt) {
        inv = { ...inv, stage: 'anklage', since: runde };
        marks = setMark(marks, DELANEY_MARKS.charge, runde);
        log.push(zeile(input, 'Delaney erhebt Anklage. Das Bundesgericht in Cordova lädt Jacob Harlan vor.'));
      } else if (inv.evidence <= 0 && (h < b.probeAt || zuwachs <= 0)) {
        // Keine Beweise und kein Weiterkommen (zu wenig Hitze oder ein Anwalt, der alles abfängt): Delaney gibt auf.
        inv = abschliessen(state, inv, 'eingestellt', balance);
        marks = setMark(marks, DELANEY_MARKS.dropped, runde);
        log.push(zeile(input, 'Delaney stellt die Vorermittlung ein. Für diesmal.'));
      }
      break;
    }
    case 'anklage': {
      if (versetzt || runde - inv.since < b.trialDelay) break;
      const chance = convictionChance({ ...state, investigation: inv }, balance);
      const schuldig = rng.float() < chance;
      if (!schuldig) {
        inv = abschliessen(state, inv, 'freispruch', balance);
        marks = setMark(marks, DELANEY_MARKS.acquitted, runde);
        log.push(zeile(input, 'Die Geschworenen sprechen Jacob Harlan frei. Delaney packt seine Akten – nicht für immer.'));
      } else {
        const strafe = fineFor({ ...state, investigation: inv }, balance);
        cash = Math.round((cash - strafe.amount) * 100) / 100;
        inv = abschliessen(state, inv, strafe.heavy ? 'schwere_strafe' : 'geldstrafe', balance);
        marks = setMark(marks, DELANEY_MARKS.convicted, runde);
        if (strafe.heavy) marks = setMark(marks, DELANEY_MARKS.forcedSale, runde);
        log.push(
          zeile(
            input,
            strafe.heavy
              ? `Schuldig. Das Gericht verhängt ${strafe.amount.toLocaleString('de-DE')} $ Strafe und ordnet einen Zwangsverkauf an.`
              : `Schuldig. Das Gericht verhängt ${strafe.amount.toLocaleString('de-DE')} $ Strafe.`,
          ),
        );
      }
      break;
    }
    case 'abgeschlossen':
      if (runde - inv.since >= b.cooldown) inv = { ...inv, stage: 'ruhe', since: runde };
      break;
  }

  // Verblassen (GDD §4): nur solange niemand ermittelt.
  if (inv.stage === 'ruhe' || inv.stage === 'geruecht' || inv.stage === 'abgeschlossen') {
    const uhr = inv.fadeClock + 1;
    if (uhr >= b.fadeEvery) {
      const faded = { ...inv.faded };
      for (const t of traces({ ...state, investigation: inv }, balance)) if (!t.witness) faded[t.id] = (faded[t.id] ?? 0) + 1;
      inv = { ...inv, faded, fadeClock: 0 };
    } else inv = { ...inv, fadeClock: uhr };
  }

  if ((start.investigation?.lawyer ?? 0) > 0 && inv.lawyer === 0 && inv.stage === 'abgeschlossen') {
    log.push(zeile(input, 'Der Fall ist erledigt. Ashby & Lowe schicken die letzte Rechnung – der Anwalt kostet nichts mehr.'));
  }

  inv = { ...inv, rng: rng.state };
  return {
    ...start,
    cash,
    events: { ...input.events, marks },
    investigation: inv,
    log: log.length > 0 ? [...input.log, ...log] : input.log,
  } as GameState;
}

// --- Gegenmittel (aus dem Schattenbuch) -------------------------------------------

export type InvestigationResult = { ok: true; state: GameState } | { ok: false; reason: string };

function bereit(state: GameState, balance: Balance): { inv: InvestigationState } | { reason: string } {
  if (!investigationUnlocked(state, balance)) return { reason: 'Das gibt es erst ab Kapitel 2.' };
  if (state.finished) return { reason: 'Das Kapitel ist beendet.' };
  const inv = (state as MitErmittlung).investigation;
  return inv ? { inv } : { reason: 'Noch ermittelt niemand.' };
}

function mit(state: GameState, inv: InvestigationState, extra: Partial<GameState> = {}, text?: string): GameState {
  const log = text ? [...state.log, zeile(state, text)] : state.log;
  return { ...state, ...extra, investigation: inv, log } as GameState;
}

/** Anwalt auf Stufe 0–lawyer.max setzen; er kostet am Rundenende lawyer.costPerLevel je Stufe. */
export function setLawyer(state: GameState, balance: Balance, level: number): InvestigationResult {
  const r = bereit(state, balance);
  if ('reason' in r) return { ok: false, reason: r.reason };
  if (!Number.isInteger(level) || level < 0 || level > balance.investigation.lawyer.max) {
    return { ok: false, reason: `Anwälte gibt es von Stufe 0 bis ${balance.investigation.lawyer.max}.` };
  }
  if (level === r.inv.lawyer) return { ok: false, reason: 'So ist es schon.' };
  const text = level === 0 ? 'Jacob entlässt seinen Anwalt.' : `Jacob nimmt einen Anwalt der Stufe ${level}.`;
  return { ok: true, state: mit(state, { ...r.inv, lawyer: level }, {}, text) };
}

function nextExtraId(inv: InvestigationState, kind: ExtraKind): string {
  return `${kind}_${inv.extra.filter((e) => e.kind === kind).length + 1}`;
}

/** Eine Spur vernichten: kostet destroy.cost, mindert die Schwere – und kann selbst eine Spur hinterlassen. */
export function destroyTrace(state: GameState, balance: Balance, traceId: string): InvestigationResult {
  const r = bereit(state, balance);
  if ('reason' in r) return { ok: false, reason: r.reason };
  const d = balance.investigation.destroy;
  const spur = traces(state, balance).find((t) => t.id === traceId);
  if (!spur || spur.current <= 0) return { ok: false, reason: 'Davon ist nichts mehr zu finden.' };
  if (spur.witness) return { ok: false, reason: 'Einen Zeugen verbrennt man nicht wie Papier.' };
  if (state.cash < d.cost) return { ok: false, reason: `Dafür fehlt das Geld (${d.cost.toLocaleString('de-DE')} $ nötig).` };
  const rng = new Rng(r.inv.rng);
  const erwischt = rng.float() < d.chance;
  let inv: InvestigationState = { ...r.inv, cut: { ...r.inv.cut, [traceId]: (r.inv.cut[traceId] ?? 0) + d.cut } };
  if (erwischt) {
    inv = {
      ...inv,
      extra: [...inv.extra, { id: nextExtraId(inv, 'vertuschung'), kind: 'vertuschung', severity: d.severity, round: state.round }],
      evidence: laeuft(inv) ? clamp(inv.evidence + d.evidence, 0, 100) : inv.evidence,
    };
  }
  inv = { ...inv, rng: rng.state };
  const text = erwischt ? 'Papiere brennen im Ofen. Jemand hat gesehen, wer sie hineingeworfen hat.' : 'Papiere brennen im Ofen.';
  return { ok: true, state: mit(state, inv, { cash: Math.round((state.cash - d.cost) * 100) / 100 }, text) };
}

/** Einen Zeugen kaufen: Die Zeugen-Spur ist weg, Delaney verliert Beweise – aber der Kauf ist eine neue Spur. */
export function buyWitness(state: GameState, balance: Balance, traceId: string): InvestigationResult {
  const r = bereit(state, balance);
  if ('reason' in r) return { ok: false, reason: r.reason };
  const w = balance.investigation.witness;
  const spur = traces(state, balance).find((t) => t.id === traceId);
  if (!spur || !spur.witness || spur.current <= 0) return { ok: false, reason: 'Hier gibt es keinen Zeugen zu kaufen.' };
  if (state.cash < w.cost) return { ok: false, reason: `Dafür fehlt das Geld (${w.cost.toLocaleString('de-DE')} $ nötig).` };
  const inv: InvestigationState = {
    ...r.inv,
    cut: { ...r.inv.cut, [traceId]: (r.inv.cut[traceId] ?? 0) + spur.current },
    evidence: clamp(r.inv.evidence - w.evidenceCut, 0, 100),
    extra: [...r.inv.extra, { id: nextExtraId(r.inv, 'zeugenkauf'), kind: 'zeugenkauf', severity: w.severity, round: state.round }],
  };
  return { ok: true, state: mit(state, inv, { cash: Math.round((state.cash - w.cost) * 100) / 100 }, 'Ein Zeuge erinnert sich plötzlich an nichts mehr.') };
}

/** Einen Sündenbock opfern: einmal je Fall, nur während Delaney ermittelt; kostet Kraft. */
export function sacrificeScapegoat(state: GameState, balance: Balance): InvestigationResult {
  const r = bereit(state, balance);
  if ('reason' in r) return { ok: false, reason: r.reason };
  if (!laeuft(r.inv)) return { ok: false, reason: 'Noch sucht niemand einen Schuldigen.' };
  if (r.inv.scapegoat) return { ok: false, reason: 'In diesem Fall hat schon einer den Kopf hingehalten.' };
  const s = balance.investigation.scapegoat;
  const inv: InvestigationState = { ...r.inv, scapegoat: true, evidence: clamp(r.inv.evidence - s.evidenceCut, 0, 100) };
  const marks = setMark(state.events.marks, DELANEY_MARKS.scapegoat, state.round);
  return {
    ok: true,
    state: mit(
      state,
      inv,
      { strength: Math.max(0, state.strength - s.strength), events: { ...state.events, marks } },
      'Ein Vormann nimmt alles auf sich. Jacob kann ihm danach nicht mehr in die Augen sehen.',
    ),
  };
}

/** Chance, dass politischer Druck Delaney versetzt – hängt von der Regierung ab (Weltmodell 4.1). */
export function pressureChance(state: GameState, balance: Balance): number {
  const welt = worldPort(state, balance.investigation.worldFallback);
  return balance.investigation.pressure.chance[welt.government ?? 'none'];
}

/** Politischen Druck machen: Delaney wird für pressure.rounds Runden versetzt – oder es geht schief. */
export function applyPressure(state: GameState, balance: Balance): InvestigationResult {
  const r = bereit(state, balance);
  if ('reason' in r) return { ok: false, reason: r.reason };
  if (!laeuft(r.inv)) return { ok: false, reason: 'Gegen wen denn? Noch ermittelt niemand.' };
  if (r.inv.pressure) return { ok: false, reason: 'In diesem Fall hat Jacob seine Freunde schon bemüht.' };
  const p = balance.investigation.pressure;
  if (state.cash < p.cost) return { ok: false, reason: `Dafür fehlt das Geld (${p.cost.toLocaleString('de-DE')} $ nötig).` };
  const rng = new Rng(r.inv.rng);
  const klappt = rng.float() < pressureChance(state, balance);
  let inv: InvestigationState = { ...r.inv, pressure: true, rng: rng.state };
  if (klappt) inv = { ...inv, transferredUntil: state.round + p.rounds - 1 };
  else {
    inv = {
      ...inv,
      evidence: clamp(inv.evidence + p.failEvidence, 0, 100),
      extra: [...inv.extra, { id: nextExtraId(inv, 'einflussnahme'), kind: 'einflussnahme', severity: p.severity, round: state.round }],
    };
  }
  const text = klappt
    ? 'Aus Hallstead kommt ein Telegramm: Delaney wird für eine Weile an einen anderen Fall gesetzt.'
    : 'Delaney erfährt, wer in Hallstead für Jacob telefoniert hat. Er notiert sich jeden Namen.';
  return { ok: true, state: mit(state, inv, { cash: Math.round((state.cash - p.cost) * 100) / 100 }, text) };
}

/** Kurzansicht für Schattenbuch und Zeitung. */
export interface InvestigationView {
  unlocked: boolean;
  stage: InvestigationStage;
  heat: number;
  word: HeatWord;
  evidence: number;
  lawyer: number;
  transferred: boolean;
  verdict: Verdict | null;
  traces: TraceView[];
  conviction: number;
}

export function investigationView(state: GameState, balance: Balance): InvestigationView {
  const inv = (state as MitErmittlung).investigation;
  const h = heat(state, balance);
  return {
    unlocked: investigationUnlocked(state, balance),
    stage: inv?.stage ?? 'ruhe',
    heat: h,
    word: heatWord(h, balance),
    evidence: inv?.evidence ?? 0,
    lawyer: inv?.lawyer ?? 0,
    transferred: !!inv && inv.transferredUntil >= state.round,
    verdict: inv?.verdict ?? null,
    traces: traces(state, balance),
    conviction: convictionChance(state, balance),
  };
}

// --- Spielstand -----------------------------------------------------------------

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function zahlenWerk(v: unknown): boolean {
  return istObjekt(v) && Object.values(v).every(istZahl);
}
function textListe(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Prüft den Ermittlungszustand eines geladenen Spielstands (4.11 Andockpunkt in save.ts). */
export function validInvestigation(v: unknown): boolean {
  if (!istObjekt(v)) return false;
  if (!['rng', 'since', 'evidence', 'lawyer', 'fadeClock', 'transferredUntil', 'cases'].every((k) => istZahl(v[k]))) return false;
  if (!(INVESTIGATION_STAGES as readonly unknown[]).includes(v.stage)) return false;
  if (v.verdict !== null && !(VERDICTS as readonly unknown[]).includes(v.verdict)) return false;
  if (!zahlenWerk(v.faded) || !zahlenWerk(v.cut) || !textListe(v.closed) || !textListe(v.applied)) return false;
  if (typeof v.scapegoat !== 'boolean' || typeof v.pressure !== 'boolean' || typeof v.slip !== 'boolean') return false;
  if (v.preview !== undefined && typeof v.preview !== 'boolean') return false;
  return (
    Array.isArray(v.extra) &&
    v.extra.every((e) => istObjekt(e) && typeof e.id === 'string' && (EXTRA_KINDS as readonly unknown[]).includes(e.kind) && istZahl(e.severity) && istZahl(e.round))
  );
}

// --- Texte (content/investigation.yaml) ---------------------------------------------

export interface InvestigationContent {
  /** Je Spur (Merkzeichen oder Art einer neuen Spur) ein Satz fürs Schattenbuch. */
  traces: Record<string, LocalizedText>;
  stages: Record<InvestigationStage, LocalizedText>;
  heat: Record<HeatWord, LocalizedText>;
  verdicts: Record<Verdict, LocalizedText>;
}

const HEAT_WORDS: readonly HeatWord[] = ['kuehl', 'warm', 'heiss', 'gluehend'];

/** Liest content/investigation.yaml; Fehler kommen mit Datei und Zeile 1 zurück. */
export function parseInvestigationContent(file: string, text: string): { content: InvestigationContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw = doc.toJS() as Record<string, unknown> | null;
  const sprachtext = (value: unknown, wo: string): LocalizedText | null => {
    if (!istObjekt(value) || typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: braucht einen deutschen Text (de) und optional en.`);
      return null;
    }
    const fremd = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (fremd.length > 0) fehler(`${wo}: unbekannte Sprache ${fremd.join(', ')}.`);
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  };
  const block = <K extends string>(name: string, keys: readonly K[] | null): Record<K, LocalizedText> | null => {
    const b = raw?.[name];
    if (!istObjekt(b)) {
      fehler(`„${name}“ fehlt.`);
      return null;
    }
    const out: Record<string, LocalizedText> = {};
    for (const [k, v] of Object.entries(b)) {
      if (keys && !(keys as readonly string[]).includes(k)) fehler(`${name}.${k}: unbekannt. Erlaubt: ${keys.join(', ')}.`);
      const t = sprachtext(v, `${name}.${k}`);
      if (t) out[k] = t;
    }
    if (keys) for (const k of keys) if (!(k in b)) fehler(`${name}.${k} fehlt.`);
    return out as Record<K, LocalizedText>;
  };
  const tracesT = block('traces', null);
  const stages = block('stages', INVESTIGATION_STAGES);
  const heatT = block('heat', HEAT_WORDS);
  const verdicts = block('verdicts', VERDICTS);
  if (errors.length > 0 || !tracesT || !stages || !heatT || !verdicts) return { content: null, errors };
  return { content: { traces: tracesT, stages, heat: heatT, verdicts }, errors };
}

/**
 * Inhaltsprüfung (npm run check:content): Jede Spur aus balance.yaml und jede Art
 * neuer Spuren braucht einen Text, und jedes Spuren-Merkzeichen muss eine Wahl setzen.
 */
export function checkInvestigationContent(file: string, content: InvestigationContent, balance: Balance, catalog: readonly EventDef[]): ContentError[] {
  const errors: ContentError[] = [];
  const gesetzt = new Set(catalog.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])])));
  for (const t of balance.investigation.traces) {
    if (!content.traces[t.mark]) errors.push({ file, line: 1, message: `traces.${t.mark}: Text fehlt (Spur aus balance.yaml).` });
    if (!gesetzt.has(t.mark)) errors.push({ file: 'content/balance.yaml', line: 1, message: `investigation.traces: Das Merkzeichen „${t.mark}“ setzt keine Wahl – Tippfehler?` });
  }
  for (const k of [...EXTRA_KINDS, DIPLOMACY_TRACE_KIND]) if (!content.traces[k]) errors.push({ file, line: 1, message: `traces.${k}: Text fehlt (neue Spur aus Kapitel 2).` });
  for (const m of balance.investigation.goodMarks) {
    if (!gesetzt.has(m)) errors.push({ file: 'content/balance.yaml', line: 1, message: `investigation.goodMarks: Das Merkzeichen „${m}“ setzt keine Wahl – Tippfehler?` });
  }
  return errors;
}
