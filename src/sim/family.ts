// Familie (2.7, GDD §12 und §4): Ruth und Thomas. Jede Beziehung läuft von 0
// bis 100 und ist für den Spieler nur als Zustandswort sichtbar (zufrieden,
// vernachlässigt, verbittert, entfremdet) – mit einem Satz aus content/family.yaml.
//
// Regeln:
// - Familienzeit sind Antworten, deren Effekt Ruth oder einem Kind guttut (ruth/thomas/clara > 0).
// - Clara (4.5, geboren im Zeitsprung I) zählt wie Thomas: eigener Effekt clara, Vernachlässigung,
//   Zustandswort im Protokoll und im Schnitt der Familie.
// - Am Rundenende gibt Familienzeit Kraft: strengthFrom bis strengthTo, je nach Beziehung.
// - Eine Runde ohne Familienzeit kostet jede Beziehung family.neglect – außer
//   Jacob liegt krank zu Hause, dann ist er ja da.
// - Thomas kommt zu Beginn von Runde family.thomasBirthRound zur Welt. Die Geburt
//   setzt das Merkzeichen thomas_geboren, damit Ereignisse darauf reagieren können.
// Kein Zufall hier.

import { parseDocument } from 'yaml';
import { strengthLevel, type StrengthLevel, STRENGTH_LEVELS } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { DEFAULT_LANG, LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';

export interface FamilyState {
  /** Beziehung zu Ruth, 0–100. */
  ruth: number;
  /** Beziehung zu Thomas, 0–100; zählt erst ab der Geburt. */
  thomas: number;
  /** Runde der Geburt von Thomas; 0 = noch nicht geboren. */
  thomasBorn: number;
  /** Familienzeit in der laufenden Runde (Antworten, die Ruth oder Thomas guttun). */
  time: number;
  /** Beziehung zu Clara, 0–100 (4.5: geboren im Zeitsprung I); fehlt, solange sie nicht geboren ist. */
  clara?: number;
  /** Runde der Geburt von Clara; fehlt oder 0 = nicht geboren. */
  claraBorn?: number;
}

/** Merkzeichen, die die Simulation selbst setzt (nicht eine Wahl) – für die Inhaltsprüfung. */
export const SIM_MARKS = ['thomas_geboren'] as const;

/** Zustandswörter der Familie (GDD §12). */
export const BOND_WORDS = ['content', 'neglected', 'bitter', 'estranged'] as const;
export type BondWord = (typeof BOND_WORDS)[number];

export const FAMILY_MEMBERS = ['ruth', 'thomas', 'clara'] as const;
export type FamilyMember = (typeof FAMILY_MEMBERS)[number];

export function newFamily(balance: Balance): FamilyState {
  return { ruth: balance.family.ruthStart, thomas: 0, thomasBorn: 0, time: 0 };
}

export function thomasBorn(state: Pick<GameState, 'family'>): boolean {
  return state.family.thomasBorn > 0;
}

function klemmen(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Beziehung als Zustandswort. */
export function bondWord(value: number, balance: Balance): BondWord {
  const f = balance.family;
  if (value >= f.contentFrom) return 'content';
  if (value >= f.neglectedFrom) return 'neglected';
  if (value >= f.bitterFrom) return 'bitter';
  return 'estranged';
}

export function claraBorn(state: Pick<GameState, 'family'>): boolean {
  return (state.family.claraBorn ?? 0) > 0;
}

/**
 * Effekte ruth/thomas/clara einer Antwort: Beziehung ändern (0–100, Kinder erst ab
 * der Geburt) und Familienzeit zählen, wenn es der Familie guttut.
 */
export function applyFamilyEffects(state: GameState, ruth: number | undefined, thomas: number | undefined, clara?: number): GameState {
  if (ruth === undefined && thomas === undefined && clara === undefined) return state;
  const geboren = thomasBorn(state);
  const mitClara = claraBorn(state);
  const f = state.family;
  const gut = (ruth ?? 0) > 0 || (geboren && (thomas ?? 0) > 0) || (mitClara && (clara ?? 0) > 0);
  return {
    ...state,
    family: {
      ...f,
      ruth: ruth === undefined ? f.ruth : klemmen(f.ruth + ruth),
      thomas: thomas === undefined || !geboren ? f.thomas : klemmen(f.thomas + thomas),
      ...(clara !== undefined && mitClara ? { clara: klemmen((f.clara ?? 0) + clara) } : {}),
      time: gut ? f.time + 1 : f.time,
    },
  };
}

/** Wie gut es in der Familie gerade steht: der Schnitt aus Ruth und den Kindern, die schon geboren sind. */
export function familyBond(state: Pick<GameState, 'family'>): number {
  const werte = [state.family.ruth];
  if (thomasBorn(state)) werte.push(state.family.thomas);
  if (claraBorn(state)) werte.push(state.family.clara ?? 0);
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

/** Kraft, die Familienzeit am Rundenende gibt (GDD §4: +3 bis +8, je nach Beziehung). */
export function familyStrength(state: Pick<GameState, 'family'>, balance: Balance): number {
  const { strengthFrom, strengthTo } = balance.family;
  return Math.round(strengthFrom + ((strengthTo - strengthFrom) * familyBond(state)) / 100);
}

const NAMEN: Record<FamilyMember, string> = { ruth: 'Ruth', thomas: 'Thomas', clara: 'Clara' };
const WORT: Record<BondWord, string> = {
  content: 'zufrieden',
  neglected: 'vernachlässigt',
  bitter: 'verbittert',
  estranged: 'entfremdet',
};

/**
 * Rundenende (vor den Terminen): Familienzeit gibt Kraft, ohne Familienzeit
 * leiden die Beziehungen – nicht, solange Jacob krank zu Hause liegt. Ändert
 * sich ein Zustandswort, steht es im Protokoll.
 */
export function settleFamily(state: GameState, balance: Balance): GameState {
  const f = state.family;
  const date = formatDate(state);
  const log = [...state.log];
  let { strength } = state;
  let { ruth, thomas } = f;
  let clara = f.clara;
  if (f.time > 0) {
    const plus = familyStrength(state, balance);
    strength = Math.min(state.strengthMax, strength + plus);
    if (strength > state.strength) log.push(`${date}: Die Zeit mit der Familie gibt Jacob Kraft.`);
  } else if (state.sick === 0) {
    ruth = klemmen(ruth - balance.family.neglect);
    if (thomasBorn(state)) thomas = klemmen(thomas - balance.family.neglect);
    if (claraBorn(state)) clara = klemmen((f.clara ?? 0) - balance.family.neglect);
  }
  const geboren = thomasBorn(state);
  const mitClara = claraBorn(state);
  for (const [wer, vorher, nachher] of [
    ['ruth', f.ruth, ruth],
    ['thomas', f.thomas, thomas],
    ['clara', f.clara ?? 0, clara ?? 0],
  ] as const) {
    if (wer === 'thomas' && !geboren) continue;
    if (wer === 'clara' && !mitClara) continue;
    const alt = bondWord(vorher, balance);
    const neu = bondWord(nachher, balance);
    if (alt !== neu) log.push(`${date}: ${NAMEN[wer]} wirkt jetzt ${WORT[neu]}.`);
  }
  return { ...state, strength, log, family: { ...f, ruth, thomas, ...(clara === undefined ? {} : { clara }), time: 0 } };
}

/**
 * Rundenbeginn: Ist die Runde der Geburt erreicht, kommt Thomas zur Welt. Das
 * Merkzeichen thomas_geboren lässt Ereignisse darauf reagieren (Geburt, Abende zu dritt).
 */
export function checkBirth(state: GameState, balance: Balance): GameState {
  if (thomasBorn(state) || state.round < balance.family.thomasBirthRound) return state;
  const marks = state.events.marks.thomas_geboren === undefined ? { ...state.events.marks, thomas_geboren: state.round } : state.events.marks;
  return {
    ...state,
    family: { ...state.family, thomas: balance.family.thomasStart, thomasBorn: state.round },
    events: { ...state.events, marks },
    log: [...state.log, `${formatDate(state)}: Thomas Harlan kommt zur Welt.`],
  };
}

// ---------------------------------------------------------------------------
// Texte (content/family.yaml)

export interface FamilyContent {
  /** Zustandswörter in allen Sprachen. */
  words: Record<BondWord, LocalizedText>;
  /** Ein Satz je Familienmitglied und Zustandswort. */
  ruth: Record<BondWord, LocalizedText>;
  thomas: Record<BondWord, LocalizedText>;
  /** Clara (4.5, geboren im Zeitsprung I); fehlt der Block, steht sie nicht im Familienfenster. */
  clara?: Record<BondWord, LocalizedText>;
  /** Was die Familie über Jacobs Zustand sagt – je Kraftstufe (Kraft selbst ist nie sichtbar). */
  jacob: Record<StrengthLevel, LocalizedText>;
}

export interface FamilyMemberView {
  id: FamilyMember;
  name: string;
  word: BondWord;
  wordText: string;
  text: string;
}

export interface FamilyView {
  members: FamilyMemberView[];
  /** Was zu Hause über Jacob gesagt wird. */
  jacob: string;
  /** Jacob liegt krank im Bett. */
  sick: boolean;
}

/** Der Familienbildschirm (GDD §12): jedes Familienmitglied mit Zustandswort und einem Satz. */
export function familyView(state: GameState, balance: Balance, content: FamilyContent, lang: Lang = DEFAULT_LANG): FamilyView {
  const mitglied = (id: FamilyMember, value: number): FamilyMemberView => {
    const word = bondWord(value, balance);
    const saetze = content[id] ?? content.thomas;
    return { id, name: NAMEN[id], word, wordText: localize(content.words[word], lang), text: localize(saetze[word], lang) };
  };
  const members = [mitglied('ruth', state.family.ruth)];
  if (thomasBorn(state)) members.push(mitglied('thomas', state.family.thomas));
  if ((state.family.claraBorn ?? 0) > 0 && content.clara) members.push(mitglied('clara', state.family.clara ?? 0));
  return { members, jacob: localize(content.jacob[strengthLevel(state, balance)], lang), sick: state.sick > 0 };
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/family.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseFamilyContent(file: string, text: string): { content: FamilyContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „words“, „ruth“, „thomas“ und „jacob“.');
    return { content: null, errors };
  }

  function sprachtext(value: unknown, wo: string): LocalizedText | null {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return null;
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: deutscher Text fehlt.`);
      return null;
    }
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  }

  function block<K extends string>(key: string, ids: readonly K[]): Record<K, LocalizedText> | null {
    const value = raw && istObjekt(raw) ? raw[key] : undefined;
    if (!istObjekt(value)) {
      fehler(`„${key}“ fehlt.`);
      return null;
    }
    const unbekannt = Object.keys(value).filter((k) => !(ids as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`„${key}“: unbekannte Einträge ${unbekannt.join(', ')}. Erlaubt: ${ids.join(', ')}.`);
    const out: Partial<Record<K, LocalizedText>> = {};
    for (const id of ids) {
      const t = sprachtext(value[id], `${key}.${id}`);
      if (t) out[id] = t;
    }
    return out as Record<K, LocalizedText>;
  }

  const words = block('words', BOND_WORDS);
  const ruth = block('ruth', BOND_WORDS);
  const thomas = block('thomas', BOND_WORDS);
  const jacob = block('jacob', STRENGTH_LEVELS);
  // Clara (4.5) ist freiwillig: Erst ab Kapitel 2 kann es sie geben.
  const clara = raw.clara === undefined ? null : block('clara', BOND_WORDS);
  if (errors.length > 0 || !words || !ruth || !thomas || !jacob) return { content: null, errors };
  return { content: { words, ruth, thomas, jacob, ...(clara ? { clara } : {}) }, errors };
}
