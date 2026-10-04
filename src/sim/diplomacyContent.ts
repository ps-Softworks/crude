// Texte der Rivalen-Diplomatie (4.10): content/diplomacy.yaml lesen und prüfen.
// Wie bei chapter.yaml: Fehlt etwas, kommt es mit Datei und Zeile 1 als Fehler zurück
// (content ist dann null). Die Oberfläche lädt die Datei über src/ui/diplomacyContent.ts,
// npm run check:content prüft sie mit.

import { parseDocument } from 'yaml';
import type { DiploReason, OfferKind, RelationMood } from './diplomacyCore';
import { DIPLO_RIVALS, type DiploRival } from './diplomacyBalance';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import type { BreakupTalk } from './diplomacySuccession';

export const DIPLO_TABS = ['revier', 'nachfolge', 'absprachen', 'uebernahmen', 'verband'] as const;
export type DiploTab = (typeof DIPLO_TABS)[number];

const MOODS: readonly RelationMood[] = ['verraten', 'feind', 'kuehl', 'neutral', 'wohlgesonnen', 'freund'];
const RESPECT = ['hoch', 'mittel', 'niedrig'] as const;
export type RespectWord = (typeof RESPECT)[number];
const KINDS: readonly OfferKind[] = ['price', 'territory', 'supply', 'cross', 'buyout'];
const TALK: readonly BreakupTalk[] = ['ruhig', 'geruechte', 'drohend'];
const OUTCOMES = ['margaret', 'pruett', 'zerschlagen'] as const;
const REASONS: readonly DiploReason[] = [
  'inaktiv',
  'ende',
  'entschieden',
  'schon',
  'geld',
  'zeit',
  'unbekannt',
  'art',
  'verraten',
  'laeuft',
  'vergeben',
  'nicht_gegruendet',
  'mitglied',
  'kein_mitglied',
  'ausgeschlossen',
  'gesetz',
];

/** Alle Einzeltexte unter „texts“. */
export const DIPLO_TEXT_KEYS = [
  'pin_offers',
  'pin_running',
  'succession_running',
  'succession_hint',
  'back_margaret',
  'back_pruett',
  'push_for',
  'push_against',
  'relations_title',
  'relation_line',
  'offers_title',
  'offers_none',
  'offer_line',
  'offer_left',
  'accept',
  'accept_buyout',
  'decline',
  'pacts_title',
  'pacts_none',
  'pact_line',
  'pact_illegal',
  'break',
  'break_confirm',
  'propose_title',
  'propose_none',
  'accepted',
  'refused',
  'effects',
  'heat',
  'takeovers_intro',
  'takeovers_none',
  'firm_line',
  'firm_jacob',
  'firm_pruett',
  'buy',
  'guild_not_founded',
  'guild_status',
  'guild_member',
  'guild_expelled',
  'guild_join',
  'guild_leave',
  'debug_start',
] as const;
export type DiploTextKey = (typeof DIPLO_TEXT_KEYS)[number];

export interface DiplomacyContent {
  draft: boolean;
  tabs: Record<DiploTab, LocalizedText>;
  rivals: Record<DiploRival, { name: LocalizedText; firm: LocalizedText }>;
  moods: Record<RelationMood, LocalizedText>;
  respect: Record<RespectWord, LocalizedText>;
  kinds: Record<OfferKind, { label: LocalizedText; text: LocalizedText }>;
  talk: Record<BreakupTalk, LocalizedText>;
  outcome: Record<(typeof OUTCOMES)[number], LocalizedText>;
  texts: Record<DiploTextKey, LocalizedText>;
  reasons: Record<DiploReason, LocalizedText>;
}

/** Wort für den Branchen-Respekt (0–100). */
export function respectWord(respect: number): RespectWord {
  return respect >= 65 ? 'hoch' : respect >= 35 ? 'mittel' : 'niedrig';
}

/** Setzt Platzhalter wie {name} in einen Text ein. */
export function diploText(text: LocalizedText, values: Record<string, string | number> = {}, lang?: Lang): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => (values[key] !== undefined ? String(values[key]) : ganz));
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/diplomacy.yaml. */
export function parseDiplomacyContent(file: string, text: string): { content: DiplomacyContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht tabs, rivals, moods, respect, kinds, talk, outcome, texts und reasons.');
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
  function gruppe<K extends string>(key: string, keys: readonly K[]): Record<K, LocalizedText> {
    const block = istObjekt(raw) ? raw[key] : undefined;
    const out = {} as Record<K, LocalizedText>;
    if (!istObjekt(block)) {
      fehler(`Block „${key}“ fehlt.`);
      for (const k of keys) out[k] = leer;
      return out;
    }
    for (const k of keys) out[k] = sprachtext(block[k], `${key}.${k}`);
    const extra = Object.keys(block).filter((k) => !(keys as readonly string[]).includes(k));
    if (extra.length > 0) fehler(`${key}: unbekannte Schlüssel ${extra.join(', ')}.`);
    return out;
  }
  function paare<K extends string, F extends string>(key: string, keys: readonly K[], felder: readonly F[]): Record<K, Record<F, LocalizedText>> {
    const block = raw && istObjekt(raw) ? raw[key] : undefined;
    const out = {} as Record<K, Record<F, LocalizedText>>;
    for (const k of keys) {
      const e = istObjekt(block) && istObjekt(block[k]) ? block[k] : null;
      if (!e) fehler(`${key}.${k} fehlt.`);
      out[k] = {} as Record<F, LocalizedText>;
      for (const f of felder) out[k][f] = e ? sprachtext(e[f], `${key}.${k}.${f}`) : leer;
    }
    return out;
  }

  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');
  const content: DiplomacyContent = {
    draft: raw.draft === true,
    tabs: gruppe('tabs', DIPLO_TABS),
    rivals: paare('rivals', DIPLO_RIVALS, ['name', 'firm'] as const),
    moods: gruppe('moods', MOODS),
    respect: gruppe('respect', RESPECT),
    kinds: paare('kinds', KINDS, ['label', 'text'] as const),
    talk: gruppe('talk', TALK),
    outcome: gruppe('outcome', OUTCOMES),
    texts: gruppe('texts', DIPLO_TEXT_KEYS),
    reasons: gruppe('reasons', REASONS),
  };
  return errors.length > 0 ? { content: null, errors } : { content, errors };
}
