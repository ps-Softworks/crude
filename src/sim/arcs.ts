// Story-Bögen (2.9, GDD §12): Silas Brandt und Ezekiel Moss. Die Szenen selbst
// sind Ereignisse in content/events/ (k1-2-silas.yaml, k1-3-moss.yaml); sie setzen
// Merkzeichen. Hier steht nur, wie man aus den Merkzeichen abliest, wie ein Bogen
// ausgegangen ist – für den Kapitelabschluss („Was aus ihnen wurde“) und für
// spätere Kapitel. Die Texte und die Zuordnung Merkzeichen → Ausgang stehen in
// content/arcs.yaml. Reine Funktionen, kein Zufall, kein eigener Zustand.

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import type { EventDef } from './events';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { chapterOf } from './chapterOf';

/**
 * Merkzeichen, die die Simulation setzt und die ein Bogen lesen darf: Ausgang der Crane-Nachfolge
 * (DIPLO_MARKS in diplomacyCore.ts, 4.10 – wörtlich, damit arcs.ts beim Laden nichts Fremdes liest; ein Test vergleicht).
 */
export const ARC_SIM_MARKS: readonly string[] = ['k2_nachfolge_margaret', 'k2_nachfolge_pruett', 'k2_trust_zerschlagen'];

/**
 * Die Story-Bögen je Kapitel. Kapitel 1: Silas und Moss. Kapitel 2 (4.12): Noras erster Artikel,
 * Silas gegen den Aufsichtsrat, Ruths Wunsch mitzuarbeiten (content/events/k2-story-*.yaml) und die
 * Crane-Nachfolge (Merkzeichen der Diplomatie, 4.10).
 */
export const ARC_IDS = ['silas', 'moss', 'nora_k2', 'silas_k2', 'ruth_k2', 'crane_k2'] as const;
export type ArcId = (typeof ARC_IDS)[number];

/** In welchem Kapitel ein Bogen spielt – der Kapitelabschluss zeigt nur die Bögen seines Kapitels. */
export const ARC_CHAPTER: Record<ArcId, number> = { silas: 1, moss: 1, nora_k2: 2, silas_k2: 2, ruth_k2: 2, crane_k2: 2 };

/** Die Bögen eines Kapitels. */
export function arcsOfChapter(chapter: number): ArcId[] {
  return ARC_IDS.filter((id) => ARC_CHAPTER[id] === chapter);
}

export interface ArcOutcomeDef {
  id: string;
  /** Der Ausgang gilt, sobald eins dieser Merkzeichen gesetzt ist. */
  any: string[];
  title: LocalizedText;
  text: LocalizedText;
}

export interface ArcDef {
  name: LocalizedText;
  /** Von oben nach unten geprüft: der erste passende gilt. */
  outcomes: ArcOutcomeDef[];
  /** Solange kein Ausgang passt. */
  open: { title: LocalizedText; text: LocalizedText };
  /** Entwurf – die Texte werden noch überarbeitet. */
  draft: boolean;
}

export type ArcContent = Record<ArcId, ArcDef>;

/** Wie ein Bogen ausgegangen ist (ID des Ausgangs), oder null, solange er offen ist. */
export function arcOutcome(state: Pick<GameState, 'events'>, arc: ArcDef): string | null {
  const marks = state.events.marks;
  return arc.outcomes.find((o) => o.any.some((m) => marks[m] !== undefined))?.id ?? null;
}

/** Ein Bogen, wie der Kapitelabschluss ihn zeigt. */
export interface ArcSummary {
  arc: ArcId;
  name: string;
  /** ID des Ausgangs oder null = noch offen. */
  outcome: string | null;
  title: string;
  text: string;
}

/** Die Bögen des laufenden Kapitels (state.chapter, sonst Kapitel 1) mit ihrem Ausgang in der gewünschten Sprache. */
export function arcSummaries(state: Pick<GameState, 'events'> & Partial<Pick<GameState, 'chapter'>>, content: ArcContent, lang?: Lang): ArcSummary[] {
  return arcsOfChapter(chapterOf(state)).map((id) => {
    const arc = content[id];
    const outcome = arcOutcome(state, arc);
    const def = outcome === null ? arc.open : arc.outcomes.find((o) => o.id === outcome)!;
    return { arc: id, name: localize(arc.name, lang), outcome, title: localize(def.title, lang), text: localize(def.text, lang) };
  });
}

/**
 * Inhaltsprüfung: Jedes Merkzeichen eines Ausgangs muss von einer Wahl in
 * content/events/ gesetzt werden – sonst ist es fast sicher ein Tippfehler.
 */
export function checkArcMarks(file: string, content: ArcContent, catalog: readonly EventDef[], simMarks: Iterable<string> = ARC_SIM_MARKS): ContentError[] {
  const gesetzt = new Set([...simMarks, ...catalog.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])]))]);
  const errors: ContentError[] = [];
  for (const id of ARC_IDS) {
    for (const o of content[id].outcomes) {
      for (const m of o.any) {
        if (!gesetzt.has(m)) errors.push({ file, line: 1, message: `Bogen „${id}“, Ausgang „${o.id}“: Das Merkzeichen „${m}“ setzt keine Wahl – Tippfehler?` });
      }
    }
  }
  return errors;
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ID_MUSTER = /^[a-z0-9_]+$/;

/** Liest content/arcs.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseArcContent(file: string, text: string): { content: ArcContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler(`Die Datei braucht die Bögen ${ARC_IDS.join(', ')}.`);
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

  function titelUndText(value: unknown, wo: string): { title: LocalizedText; text: LocalizedText } | null {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht title und text.`);
      return null;
    }
    const title = sprachtext(value.title, `${wo}.title`);
    const body = sprachtext(value.text, `${wo}.text`);
    return title && body ? { title, text: body } : null;
  }

  const unbekannt = Object.keys(raw).filter((k) => !(ARC_IDS as readonly string[]).includes(k));
  if (unbekannt.length > 0) fehler(`Unbekannte(r) Bogen: ${unbekannt.join(', ')}. Erlaubt: ${ARC_IDS.join(', ')}.`);
  const content: Partial<ArcContent> = {};
  for (const id of ARC_IDS) {
    const b = raw[id];
    if (!istObjekt(b)) {
      fehler(`Bogen „${id}“ fehlt.`);
      continue;
    }
    const name = sprachtext(b.name, `${id}.name`);
    const open = titelUndText(b.open, `${id}.open`);
    if (b.draft !== undefined && typeof b.draft !== 'boolean') fehler(`${id}.draft: muss true oder false sein.`);
    const outcomes: ArcOutcomeDef[] = [];
    if (!Array.isArray(b.outcomes) || b.outcomes.length < 2) {
      fehler(`${id}.outcomes: Ein Bogen braucht mindestens zwei Ausgänge.`);
    } else {
      b.outcomes.forEach((o: unknown, i: number) => {
        const wo = `${id}.outcomes[${i}]`;
        if (!istObjekt(o)) {
          fehler(`${wo}: braucht id, any, title und text.`);
          return;
        }
        if (typeof o.id !== 'string' || !ID_MUSTER.test(o.id)) fehler(`${wo}: „id“ fehlt oder enthält mehr als Kleinbuchstaben, Ziffern und _.`);
        else if (outcomes.some((x) => x.id === o.id)) fehler(`${wo}: Den Ausgang „${o.id}“ gibt es doppelt.`);
        const any = o.any;
        if (!Array.isArray(any) || any.length === 0 || any.some((m) => typeof m !== 'string' || !ID_MUSTER.test(m))) {
          fehler(`${wo}: „any“ muss eine Liste von Merkzeichen sein, z. B. any: [silas_fair].`);
          return;
        }
        const tt = titelUndText(o, wo);
        if (tt && typeof o.id === 'string') outcomes.push({ id: o.id, any: any as string[], ...tt });
      });
    }
    if (name && open) content[id] = { name, outcomes, open, draft: b.draft === true };
  }
  if (errors.length > 0) return { content: null, errors };
  return { content: content as ArcContent, errors };
}
