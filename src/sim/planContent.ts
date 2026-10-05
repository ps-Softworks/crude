// Texte des Planungsbretts und der Erkundung (content/plans.yaml, Etappe 1):
// Titel, Text und Risiko je Karte, Hinweise, Quellen, Wissensstufen und was man über
// eine Zone hört. Hier wird nur gelesen und geprüft – Regeln stehen in
// src/sim/plans.ts und src/sim/exploration.ts.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import { CLUE_SOURCES, type ClueSource } from './exploration';
import { LANGUAGES, type LocalizedText } from './i18n';
import { CLUE_KINDS, GEOLOGIST_IDS, PLAN_TABS, type ClueKind, type GeologistId, type PlanTab } from './plansBalance';

export const KNOWLEDGE_LEVEL_KEYS = ['geruecht', 'beritten', 'kartiert', 'bericht'] as const;
export type KnowledgeLevelKey = (typeof KNOWLEDGE_LEVEL_KEYS)[number];

export interface PlanCardText {
  title: LocalizedText;
  text: LocalizedText;
  risk?: LocalizedText;
}

export interface PlanContent {
  title: LocalizedText;
  tabs: Record<PlanTab, LocalizedText>;
  cards: Record<string, PlanCardText>;
  clues: Record<ClueKind, { seen: LocalizedText; unseen: LocalizedText }>;
  sources: Record<ClueSource, LocalizedText>;
  geologists: Record<GeologistId, LocalizedText>;
  levels: Record<KnowledgeLevelKey, LocalizedText>;
  zones: Record<string, LocalizedText>;
  report: { title: LocalizedText; empty: LocalizedText };
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePlanContent(file: string, text: string): { content: PlanContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „title“, „tabs“, „cards“, „clues“, „sources“, „geologists“, „levels“, „zones“ und „report“.');
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
    if (typeof value.en !== 'string' || value.en.trim() === '') fehler(`${wo}: englischer Text fehlt.`);
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  }

  function gruppe<K extends string>(block: unknown, key: string, ids: readonly K[] | null): Record<K, LocalizedText> | null {
    if (!istObjekt(block)) {
      fehler(`„${key}“ fehlt.`);
      return null;
    }
    const keys = ids ?? (Object.keys(block) as K[]);
    if (ids) {
      const unbekannt = Object.keys(block).filter((k) => !(ids as readonly string[]).includes(k));
      if (unbekannt.length > 0) fehler(`${key}: unbekannt ${unbekannt.join(', ')}. Erlaubt: ${ids.join(', ')}.`);
    }
    const out: Partial<Record<K, LocalizedText>> = {};
    for (const id of keys) {
      if (block[id] === undefined) {
        fehler(`${key}.${id} fehlt.`);
        continue;
      }
      const t = sprachtext(block[id], `${key}.${id}`);
      if (t) out[id] = t;
    }
    return out as Record<K, LocalizedText>;
  }

  const title = sprachtext(raw.title, 'title');
  const tabs = gruppe(raw.tabs, 'tabs', PLAN_TABS);
  const sources = gruppe(raw.sources, 'sources', CLUE_SOURCES);
  const levels = gruppe(raw.levels, 'levels', KNOWLEDGE_LEVEL_KEYS);
  const geologists = gruppe(raw.geologists, 'geologists', GEOLOGIST_IDS);
  const zones = gruppe(raw.zones, 'zones', null);
  const cards: Record<string, PlanCardText> = {};
  if (!istObjekt(raw.cards)) fehler('„cards“ fehlt.');
  else {
    for (const [id, c] of Object.entries(raw.cards)) {
      if (!istObjekt(c)) {
        fehler(`cards.${id}: braucht title und text.`);
        continue;
      }
      const unbekannt = Object.keys(c).filter((k) => !['title', 'text', 'risk'].includes(k));
      if (unbekannt.length > 0) fehler(`cards.${id}: unbekannt ${unbekannt.join(', ')}. Erlaubt: title, text, risk.`);
      const t = sprachtext(c.title, `cards.${id}.title`);
      const x = sprachtext(c.text, `cards.${id}.text`);
      const r = c.risk === undefined ? undefined : sprachtext(c.risk, `cards.${id}.risk`);
      if (t && x) cards[id] = { title: t, text: x, ...(r ? { risk: r } : {}) };
    }
  }
  const clues: Partial<Record<ClueKind, { seen: LocalizedText; unseen: LocalizedText }>> = {};
  if (!istObjekt(raw.clues)) fehler('„clues“ fehlt.');
  else {
    const unbekannt = Object.keys(raw.clues).filter((k) => !(CLUE_KINDS as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`clues: unbekannt ${unbekannt.join(', ')}. Erlaubt: ${CLUE_KINDS.join(', ')}.`);
    for (const kind of CLUE_KINDS) {
      const c = raw.clues[kind];
      if (!istObjekt(c)) {
        fehler(`clues.${kind} fehlt (braucht seen und unseen).`);
        continue;
      }
      const seen = sprachtext(c.seen, `clues.${kind}.seen`);
      const unseen = sprachtext(c.unseen, `clues.${kind}.unseen`);
      if (seen && unseen) clues[kind] = { seen, unseen };
    }
  }
  let report: PlanContent['report'] | null = null;
  if (!istObjekt(raw.report)) fehler('„report“ fehlt.');
  else {
    const t = sprachtext(raw.report.title, 'report.title');
    const e = sprachtext(raw.report.empty, 'report.empty');
    if (t && e) report = { title: t, empty: e };
  }
  if (errors.length > 0 || !title || !tabs || !sources || !geologists || !levels || !zones || !report) return { content: null, errors };
  return {
    content: { title, tabs, cards, clues: clues as PlanContent['clues'], sources, geologists, levels, zones, report },
    errors,
  };
}

/** Passt content/plans.yaml zu balance.yaml? Jede eigene Karte braucht Texte, jede Zone ihr Wort. */
export function checkPlanContent(file: string, content: PlanContent, balance: Balance): ContentError[] {
  const errors: ContentError[] = [];
  for (const id of Object.keys(balance.plans.cards)) {
    if (!content.cards[id]) errors.push({ file, line: 1, message: `cards.${id} fehlt (Karte aus balance.yaml plans.cards).` });
  }
  for (const id of Object.keys(content.cards)) {
    if (!balance.plans.cards[id]) errors.push({ file, line: 1, message: `cards.${id}: Diese Karte gibt es in balance.yaml plans.cards nicht.` });
  }
  for (const z of balance.geology.zones) {
    if (!content.zones[z.name]) errors.push({ file, line: 1, message: `zones.${z.name} fehlt (Zone aus balance.yaml geology.zones).` });
  }
  return errors;
}
