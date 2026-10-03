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

import { parseDocument } from 'yaml';
import { arcOutcome, type ArcContent } from './arcs';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { ContentError } from './eventContent';
import { empireValue } from './empire';
import type { EventDef } from './events';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { producingWells } from './production';

/** Wie Kapitel 1 ausgegangen ist, oder null, solange es läuft. */
export type ChapterResult = 'erreicht' | 'verfehlt' | 'verkauft' | 'pleite' | null;

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

/** Ausgang des Kapitels: erst am Ende (ending gesetzt), vorher null. */
export function chapterResult(state: GameState, balance: Balance): ChapterResult {
  switch (state.ending) {
    case null:
      return null;
    case 'pleite':
      return 'pleite';
    case 'verkauft':
      return 'verkauft';
    case 'kapitel':
      return chapterCheck(state, balance).passed ? 'erreicht' : 'verfehlt';
  }
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
  return state.ending === 'kapitel' && state.ipo === null && chapterCheck(state, balance).passed;
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
  if (state.ending !== 'kapitel') return { ok: false, reason: 'Das geht erst am Ende des Kapitels.' };
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
}

/** Setzt Platzhalter wie {anteil} in einen Text ein. */
export function fillText(text: LocalizedText, values: Record<string, string>, lang?: Lang): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => values[key] ?? ganz);
}

/** Inhaltsprüfung: Die Merkzeichen des Transport-Bonus muss eine Wahl in content/events/ setzen. */
export function checkChapterMarks(file: string, content: ChapterContent, catalog: readonly EventDef[]): ContentError[] {
  const gesetzt = new Set(catalog.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])])));
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
  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, endings, goals, bonus, ipo }, errors };
}
