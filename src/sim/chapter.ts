// Kapitelprüfung und Kapitelende (2.11, GDD §13, §14, §8 Börsengang).
//
// Kapitel 1 ist geschafft, wenn Jacob am Ende nicht bankrott ist (Kasse nicht im
// Minus) und der Imperiumswert mindestens chapter.goalValue beträgt ODER
// mindestens chapter.goalWells Quellen fördern. Boni (eigene Transportlösung,
// Silas-Frage geklärt) werden nur angezeigt. Das frühe Ende „Der kluge Mann“
// (Crane-Übernahme) und die Pleite haben keine Prüfung.
//
// Entscheidung zum Kapitelende: Wer die Prüfung geschafft hat, kann die Firma in
// eine Aktiengesellschaft umwandeln und einen der Anteile aus chapter.ipo.shares
// verkaufen – Erlös = Imperiumswert × Anteil × priceFactor. Wer sie verfehlt,
// bleibt Familienfirma. Die Entscheidung steht in state.ipo (null = noch offen,
// sonst Anteil und Erlös; Anteil 0 = Familienfirma). Reine Funktionen, kein Zufall.
// Texte: content/chapter.yaml.
//
// Kapitel 2 „Der Herausforderer“ (4.12, GDD §13): geschafft mit eigener Raffinerie ODER eigener
// Fernleitung zum Hafen, Kontrolle ≥ chapter.chapter2.goalControl (Familienfirma: immer) UND
// Imperiumswert ≥ chapter.chapter2.goalValue. Frühe Enden ab Kapitel 2 (GDD §14): „Abgesetzt“
// (Stellvertreterkampf verloren, stocks.ousted), „Geschluckt“ (Thorne hält mehr Aktien als Jacob und
// Jacobs Kontrolle liegt unter swallowedControl) und „Hinter Gittern“ (Delaney: Verurteilung zu langer
// Haft, Merkzeichen delaney_haft). Der Verkauf an Pruett (4.10) ist dort „Der kluge Mann“.

import { parseDocument } from 'yaml';
import { arcOutcome, type ArcContent } from './arcs';
import { chapterOf } from './chapterOf';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { ContentError } from './eventContent';
import { empireValue } from './empire';
import type { EventDef } from './events';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { producingWells } from './production';
import { LOGISTICS_SIM_MARKS } from './logistics';
import { ownsRefinery } from './refinery';
import { ownsHarborPipeline } from './bigPipeline';
import { control, ownStake, thorneStake } from './stocks';
import { DELANEY_MARKS } from './investigation';
import { REPUTATION_AXES, REPUTATION_WORDS, type ReputationAxis, type ReputationWord } from './reputation';

/** Wie das Kapitel ausgegangen ist, oder null, solange es läuft. */
export type ChapterResult = 'erreicht' | 'verfehlt' | 'verkauft' | 'pleite' | 'abgesetzt' | 'geschluckt' | 'haft' | null;

export interface ChapterCheck {
  /** Kasse nicht im Minus und nicht pleite. */
  solvent: boolean;
  value: number;
  wells: number;
  valueReached: boolean;
  wellsReached: boolean;
  passed: boolean;
}

/** Die Kapitelprüfung (GDD §13) zum aktuellen Stand. */
export function chapterCheck(state: GameState, balance: Balance): ChapterCheck {
  const solvent = state.ending !== 'pleite' && state.cash >= 0;
  const value = empireValue(state, balance);
  const wells = producingWells(state).length;
  const valueReached = value >= balance.chapter.goalValue;
  const wellsReached = wells >= balance.chapter.goalWells;
  return { solvent, value, wells, valueReached, wellsReached, passed: solvent && (valueReached || wellsReached) };
}

/** Kapitelprüfung Kapitel 2 (4.12, GDD §13). */
export interface Chapter2Check {
  refinery: boolean;
  harbor: boolean;
  /** Eigene Raffinerie oder Fernleitung zum Hafen. */
  transport: boolean;
  /** Kontrolle 0–1 (Familienfirma: 1). */
  control: number;
  controlReached: boolean;
  value: number;
  valueReached: boolean;
  passed: boolean;
}

/** Kontrolle über Harlan Oil (GDD §4, §8): ohne Aktienbuch oder als Familienfirma 1. */
export function companyControl(state: Pick<GameState, 'stocks'>, balance: Balance): number {
  return state.stocks ? control(state.stocks, balance) : 1;
}

/** Die Kapitelprüfung von Kapitel 2 zum aktuellen Stand. */
export function chapter2Check(state: GameState, balance: Balance): Chapter2Check {
  const b = balance.chapter.chapter2;
  const refinery = ownsRefinery(state);
  const harbor = ownsHarborPipeline(state);
  const kontrolle = companyControl(state, balance);
  const value = empireValue(state, balance);
  const controlReached = kontrolle >= b.goalControl - 1e-9;
  const valueReached = value >= b.goalValue;
  return { refinery, harbor, transport: refinery || harbor, control: kontrolle, controlReached, value, valueReached, passed: (refinery || harbor) && controlReached && valueReached };
}

/** Hat Jacob die Prüfung seines Kapitels bestanden (Kapitel 1 oder 2)? */
export function chapterPassed(state: GameState, balance: Balance): boolean {
  return chapterOf(state) >= 2 ? chapter2Check(state, balance).passed : chapterCheck(state, balance).passed;
}

/** Ausgang des Kapitels: erst am Ende (ending gesetzt), vorher null. */
export function chapterResult(state: GameState, balance: Balance): ChapterResult {
  switch (state.ending) {
    case null:
      return null;
    case 'kapitel':
      return chapterPassed(state, balance) ? 'erreicht' : 'verfehlt';
    default:
      return state.ending;
  }
}

/** Frühe Enden ab Kapitel 2 (GDD §14), die nicht schon ihr System auslöst. */
export type EarlyEnding = 'abgesetzt' | 'geschluckt' | 'haft';

/**
 * Prüft nach der Rundenabrechnung, ob Kapitel 2 vorzeitig endet: abgesetzt (stocks.ousted),
 * hinter Gittern (Merkzeichen delaney_haft) oder geschluckt (Thorne hält mehr Aktien als Jacob
 * und Jacobs Kontrolle liegt unter swallowedControl). In Kapitel 1 nie.
 */
export function earlyEnding(state: GameState, balance: Balance): EarlyEnding | null {
  if (chapterOf(state) < 2) return null;
  if (state.events.marks[DELANEY_MARKS.prison] !== undefined) return 'haft';
  const s = state.stocks;
  if (s && s.ousted > 0) return 'abgesetzt';
  if (s && s.public && s.ousted === 0 && thorneStake(s) > ownStake(s) && control(s, balance) < balance.chapter.chapter2.swallowedControl) return 'geschluckt';
  return null;
}

const EARLY_LOG: Record<EarlyEnding, string> = {
  abgesetzt: 'Der Aufsichtsrat hat Jacob Harlan abgesetzt. Ein anderer sitzt jetzt an seinem Schreibtisch.',
  geschluckt: 'Augustus Thorne hält mehr Aktien von Harlan Oil als Jacob. Die Firma gehört jetzt zu Thorne Rail.',
  haft: 'Jacob Harlan muss ins Bundesgefängnis. Die Firma führt ein Verwalter.',
};

/** Beendet die Partie mit einem frühen Ende, wenn eins eingetreten ist (4.12 Andockpunkt am Rundenende). */
export function applyEarlyEnding(state: GameState, balance: Balance): GameState {
  if (state.finished) return state;
  const ende = earlyEnding(state, balance);
  if (!ende) return state;
  return { ...state, finished: true, ending: ende, log: [...state.log, `${formatDate(state)}: ${EARLY_LOG[ende]}`] };
}

/** Boni der Kapitelprüfung – nur zur Anzeige. */
export interface ChapterBonuses {
  transport: boolean;
  silas: boolean;
}

export function chapterBonuses(state: Pick<GameState, 'events'>, content: ChapterContent, arcs: ArcContent): ChapterBonuses {
  const marks = state.events.marks;
  return {
    transport: content.bonus.transport.any.some((m) => marks[m] !== undefined),
    silas: arcOutcome(state, arcs.silas) !== null,
  };
}

/** Darf Jacob jetzt über den Börsengang entscheiden? Nur am Kapitelende, nur einmal, nur mit bestandener Prüfung. */
export function canGoPublic(state: GameState, balance: Balance): boolean {
  // Kapitel 2 ist noch Platzhalter (4.5): Aktien gibt es nur am Ende von Kapitel 1.
  return chapterOf(state) === 1 && state.ending === 'kapitel' && state.ipo === null && chapterCheck(state, balance).passed;
}

/** Erlös für einen verkauften Anteil in ganzen $ (nie unter 0). */
export function ipoProceeds(state: GameState, balance: Balance, share: number): number {
  return Math.max(0, Math.round(empireValue(state, balance) * share * balance.chapter.ipo.priceFactor));
}

export type IpoResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Entscheidung zum Kapitelende: share = 0 heißt Familienfirma bleiben, sonst
 * einer der Anteile aus chapter.ipo.shares. Der Erlös geht in die Kasse.
 */
export function decideIpo(state: GameState, balance: Balance, share: number): IpoResult {
  if (state.ending !== 'kapitel' || chapterOf(state) !== 1) return { ok: false, reason: 'Das geht erst am Ende des Kapitels.' };
  if (state.ipo !== null) return { ok: false, reason: 'Die Entscheidung ist schon gefallen.' };
  if (share === 0) {
    return { ok: true, state: { ...state, ipo: { share: 0, proceeds: 0 }, log: [...state.log, `${formatDate(state)}: Die Firma bleibt in der Familie.`] } };
  }
  if (!chapterCheck(state, balance).passed) return { ok: false, reason: 'Für eine so kleine Firma interessiert sich kein Anleger.' };
  if (!balance.chapter.ipo.shares.includes(share)) return { ok: false, reason: 'Diesen Anteil bietet der Bankier nicht an.' };
  const preis = ipoProceeds(state, balance, share);
  return {
    ok: true,
    state: {
      ...state,
      ipo: { share, proceeds: preis },
      cash: state.cash + preis,
      log: [
        ...state.log,
        `${formatDate(state)}: Jacob verkauft ${Math.round(share * 100)} % seiner Firma an Anleger und bekommt ${preis.toLocaleString('de-DE')} $.`,
      ],
    },
  };
}

/** Anteil, den Jacob selbst hält (1 = alles). */
export function ownShare(state: Pick<GameState, 'ipo'>): number {
  return 1 - (state.ipo?.share ?? 0);
}

// ---------------------------------------------------------------------------
// Inhalte: content/chapter.yaml

const ENDING_IDS = ['erreicht', 'verfehlt', 'verkauft'] as const;
type EndingId = (typeof ENDING_IDS)[number];
/** Ausgänge von Kapitel 2 (4.12): Prüfung, Verkauf an Pruett und die frühen Enden (GDD §14). */
export const CHAPTER2_ENDING_IDS = ['erreicht', 'verfehlt', 'verkauft', 'abgesetzt', 'geschluckt', 'haft'] as const;
export type Chapter2EndingId = (typeof CHAPTER2_ENDING_IDS)[number];

export interface ChapterContent {
  draft: boolean;
  endings: Record<EndingId, { title: LocalizedText; text: LocalizedText }>;
  goals: { solvent: LocalizedText; value: LocalizedText; wells: LocalizedText };
  bonus: { transport: { any: string[]; label: LocalizedText }; silas: { label: LocalizedText } };
  ipo: {
    title: LocalizedText;
    text: LocalizedText;
    sell: LocalizedText;
    keep: LocalizedText;
    sold: LocalizedText;
    kept: LocalizedText;
    blocked: LocalizedText;
  };
  /** Kapitel 2 (4.12): Ausgänge, Prüfung, Ausblick auf Kapitel 3. */
  chapter2: {
    endings: Record<Chapter2EndingId, { title: LocalizedText; text: LocalizedText }>;
    goals: { transport: LocalizedText; control: LocalizedText; value: LocalizedText };
    /** Ruf (GDD §4): Achsen und Wörter. */
    reputation: { title: LocalizedText; axes: Record<ReputationAxis, LocalizedText>; words: Record<ReputationWord, LocalizedText> };
    next: { title: LocalizedText; text: LocalizedText };
  };
}

/** Setzt Platzhalter wie {anteil} in einen Text ein. */
export function fillText(text: LocalizedText, values: Record<string, string>, lang?: Lang): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => values[key] ?? ganz);
}

/** Inhaltsprüfung: Die Merkzeichen des Transport-Bonus muss eine Wahl in content/events/ oder die Simulation (Pipeline, 0.2.15+2) setzen. */
export function checkChapterMarks(file: string, content: ChapterContent, catalog: readonly EventDef[]): ContentError[] {
  const gesetzt = new Set<string>([...LOGISTICS_SIM_MARKS, ...catalog.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])]))]);
  return content.bonus.transport.any
    .filter((m) => !gesetzt.has(m))
    .map((m) => ({ file, line: 1, message: `bonus.transport: Das Merkzeichen „${m}“ setzt keine Wahl – Tippfehler?` }));
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/chapter.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseChapterContent(file: string, text: string): { content: ChapterContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht endings, goals, bonus und ipo.');
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
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: value.de.trim(), en: typeof value.en === 'string' ? value.en.trim() : '' };
  }
  const block = (key: string): Record<string, unknown> => {
    const v = raw[key];
    if (!istObjekt(v)) {
      fehler(`Block „${key}“ fehlt.`);
      return {};
    }
    return v;
  };

  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');
  const e = block('endings');
  const endings = {} as ChapterContent['endings'];
  for (const id of ENDING_IDS) {
    const x = istObjekt(e[id]) ? e[id] : {};
    if (!istObjekt(e[id])) fehler(`endings.${id} fehlt.`);
    endings[id] = { title: sprachtext(x.title, `endings.${id}.title`), text: sprachtext(x.text, `endings.${id}.text`) };
  }
  const g = block('goals');
  const goals = { solvent: sprachtext(g.solvent, 'goals.solvent'), value: sprachtext(g.value, 'goals.value'), wells: sprachtext(g.wells, 'goals.wells') };
  const b = block('bonus');
  const t = istObjekt(b.transport) ? b.transport : {};
  const s = istObjekt(b.silas) ? b.silas : {};
  const any = t.any;
  if (!Array.isArray(any) || any.length === 0 || any.some((m) => typeof m !== 'string' || !/^[a-z0-9_]+$/.test(m))) {
    fehler('bonus.transport.any: muss eine Liste von Merkzeichen sein, z. B. any: [thorne_vertrag].');
  }
  const bonus = {
    transport: { any: Array.isArray(any) ? (any.filter((m) => typeof m === 'string') as string[]) : [], label: sprachtext(t.label, 'bonus.transport.label') },
    silas: { label: sprachtext(s.label, 'bonus.silas.label') },
  };
  const i = block('ipo');
  const ipo = {
    title: sprachtext(i.title, 'ipo.title'),
    text: sprachtext(i.text, 'ipo.text'),
    sell: sprachtext(i.sell, 'ipo.sell'),
    keep: sprachtext(i.keep, 'ipo.keep'),
    sold: sprachtext(i.sold, 'ipo.sold'),
    kept: sprachtext(i.kept, 'ipo.kept'),
    blocked: sprachtext(i.blocked, 'ipo.blocked'),
  };
  const k2 = block('chapter2');
  const k2e = istObjekt(k2.endings) ? k2.endings : {};
  if (!istObjekt(k2.endings)) fehler('chapter2.endings fehlt.');
  const endings2 = {} as ChapterContent['chapter2']['endings'];
  for (const id of CHAPTER2_ENDING_IDS) {
    const x = istObjekt(k2e[id]) ? k2e[id] : {};
    if (!istObjekt(k2e[id])) fehler(`chapter2.endings.${id} fehlt.`);
    endings2[id] = { title: sprachtext(x.title, `chapter2.endings.${id}.title`), text: sprachtext(x.text, `chapter2.endings.${id}.text`) };
  }
  const k2g = istObjekt(k2.goals) ? k2.goals : {};
  if (!istObjekt(k2.goals)) fehler('chapter2.goals fehlt.');
  const k2n = istObjekt(k2.next) ? k2.next : {};
  if (!istObjekt(k2.next)) fehler('chapter2.next fehlt.');
  const k2r = istObjekt(k2.reputation) ? k2.reputation : {};
  if (!istObjekt(k2.reputation)) fehler('chapter2.reputation fehlt.');
  const k2ra = istObjekt(k2r.axes) ? k2r.axes : {};
  const k2rw = istObjekt(k2r.words) ? k2r.words : {};
  const axes = {} as Record<ReputationAxis, LocalizedText>;
  for (const a of REPUTATION_AXES) axes[a] = sprachtext(k2ra[a], `chapter2.reputation.axes.${a}`);
  const words = {} as Record<ReputationWord, LocalizedText>;
  for (const w of REPUTATION_WORDS) words[w] = sprachtext(k2rw[w], `chapter2.reputation.words.${w}`);
  const chapter2 = {
    endings: endings2,
    reputation: { title: sprachtext(k2r.title, 'chapter2.reputation.title'), axes, words },
    goals: { transport: sprachtext(k2g.transport, 'chapter2.goals.transport'), control: sprachtext(k2g.control, 'chapter2.goals.control'), value: sprachtext(k2g.value, 'chapter2.goals.value') },
    next: { title: sprachtext(k2n.title, 'chapter2.next.title'), text: sprachtext(k2n.text, 'chapter2.next.text') },
  };
  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, endings, goals, bonus, ipo, chapter2 }, errors };
}
