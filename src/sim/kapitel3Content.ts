// Texte für Kapitel 3 (4.17) aus content/kapitel3.yaml: Gründe, Notizen, Vales
// Brief, Gefallen, Projekte, Ränge in Hallstead. Jeder Text als { de, en };
// Deutsch Pflicht, Englisch darf leer sein. Geprüft wird gegen eine feste Form
// (SCHEMA) und gegen balance.yaml (Gefallen, Projekte, Größenklassen).

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { KAPITEL3_NOTES, KAPITEL3_REASONS, type Kapitel3NoteKey, type Kapitel3Reason, type KonsortiumPath, type StakeStatus } from './kapitel3';
import type { FavorChoice, InvitationChoice } from './konsortium';
import type { StandStatus } from './stand';

type T = LocalizedText;
interface TitleText {
  title: T;
  text: T;
}

export const KAPITEL3_TABS = ['seismik', 'konsortium', 'projekte', 'stand', 'notizen'] as const;
export type Kapitel3Tab = (typeof KAPITEL3_TABS)[number];

export interface Kapitel3Content {
  desk: { name: T; title: T; tabs: Record<Kapitel3Tab, T>; preview: T; locked: T };
  reasons: Record<Kapitel3Reason, T>;
  notes: Record<Kapitel3NoteKey, T>;
  seismik: {
    intro: T;
    stage: T;
    license: T;
    licenseFree: T;
    licenseFavors: T;
    crew: T;
    order: T;
    label: T;
    pending: T;
    none: T;
    chance: T;
    trap: T;
    trapRange: T;
    showOnMap: T;
    howTo: T;
    sizes: Record<string, T>;
  };
  konsortium: {
    letter: TitleText;
    choices: Record<InvitationChoice, { label: T; hint: T }>;
    paths: Record<'offen' | KonsortiumPath, T>;
    controlled: T;
    trust: Record<'niedrig' | 'mittel' | 'hoch', T>;
    favorChoices: Record<FavorChoice, T>;
    favors: Record<string, TitleText>;
    rescue: { title: T; text: T; accept: T };
  };
  projekte: { intro: T; share: T; decline: T; status: Record<StakeStatus, T>; list: Record<string, TitleText> };
  stand: {
    intro: T;
    ranks: Record<StandStatus, { word: T; line: T }>;
    ways: Record<'donation' | 'marriage' | 'breakOrder' | 'club', { title: T; text: T; action: T }>;
  };
}

/** Form der Datei: 'T' = Sprachtext, Objekt = feste Schlüssel, { $any } = beliebige Schlüssel (gegen balance.yaml geprüft). */
type Schema = 'T' | { [key: string]: Schema } | { $any: Schema };

const TT: Schema = { title: 'T', text: 'T' };
const keys = (ids: readonly string[], each: Schema): Record<string, Schema> => Object.fromEntries(ids.map((id) => [id, each]));

const SCHEMA: Schema = {
  desk: { name: 'T', title: 'T', tabs: keys(KAPITEL3_TABS, 'T'), preview: 'T', locked: 'T' },
  reasons: keys(KAPITEL3_REASONS, 'T'),
  notes: keys(KAPITEL3_NOTES, 'T'),
  seismik: {
    ...keys(['intro', 'stage', 'license', 'licenseFree', 'licenseFavors', 'crew', 'order', 'label', 'pending', 'none', 'chance', 'trap', 'trapRange', 'showOnMap', 'howTo'], 'T'),
    sizes: { $any: 'T' },
  },
  konsortium: {
    letter: TT,
    choices: keys(['annehmen', 'ablehnen', 'ausspielen'], { label: 'T', hint: 'T' }),
    paths: keys(['offen', 'mitglied', 'abgelehnt', 'doppelspiel', 'verstossen'], 'T'),
    controlled: 'T',
    trust: keys(['niedrig', 'mittel', 'hoch'], 'T'),
    favorChoices: keys(['erfuellen', 'verweigern', 'vortaeuschen'], 'T'),
    favors: { $any: TT },
    rescue: { title: 'T', text: 'T', accept: 'T' },
  },
  projekte: { intro: 'T', share: 'T', decline: 'T', status: keys(['bau', 'laeuft', 'gescheitert'], 'T'), list: { $any: TT } },
  stand: {
    intro: 'T',
    ranks: keys(['emporkoemmling', 'geduldet', 'anerkannt', 'aufgenommen', 'gefuerchtet'], { word: 'T', line: 'T' }),
    ways: keys(['donation', 'marriage', 'breakOrder', 'club'], { title: 'T', text: 'T', action: 'T' }),
  },
};

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseKapitel3Content(file: string, text: string): { content: Kapitel3Content | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }

  function sprachtext(value: unknown, wo: string): T | null {
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

  function walk(value: unknown, schema: Schema, wo: string): unknown {
    if (schema === 'T') return sprachtext(value, wo);
    if (!istObjekt(value)) {
      fehler(`„${wo}“ fehlt oder ist kein Block.`);
      return null;
    }
    if ('$any' in schema) {
      const each = (schema as { $any: Schema }).$any;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, each, `${wo}.${k}`)]));
    }
    const erlaubt = Object.keys(schema);
    const unbekannt = Object.keys(value).filter((k) => !erlaubt.includes(k));
    if (unbekannt.length > 0) fehler(`„${wo}“: unbekannte Einträge ${unbekannt.join(', ')}.`);
    return Object.fromEntries(erlaubt.map((k) => [k, walk(value[k], (schema as Record<string, Schema>)[k], wo ? `${wo}.${k}` : k)]));
  }

  const raw: unknown = doc.toJS();
  const content = walk(raw, SCHEMA, '') as Kapitel3Content;
  return { content: errors.length === 0 ? content : null, errors };
}

/** Passen die Texte zu balance.yaml? Jeder Gefallen, jedes Projekt, jede Größenklasse braucht genau einen Text. */
export function checkKapitel3Content(file: string, content: Kapitel3Content, balance: Balance): ContentError[] {
  const errors: ContentError[] = [];
  const vergleiche = (wo: string, texte: Record<string, unknown>, ids: string[]) => {
    for (const id of ids) if (!(id in texte)) errors.push({ file, line: 1, message: `${wo}: Text für „${id}“ fehlt (steht in balance.yaml).` });
    for (const id of Object.keys(texte)) if (!ids.includes(id)) errors.push({ file, line: 1, message: `${wo}: „${id}“ gibt es in balance.yaml nicht.` });
  };
  const k = balance.kapitel3;
  vergleiche('konsortium.favors', content.konsortium.favors, k.konsortium.favors.map((f) => f.id));
  vergleiche('projekte.list', content.projekte.list, k.projekte.list.map((p) => p.id));
  vergleiche('seismik.sizes', content.seismik.sizes, k.seismik.sizeClasses.map((c) => c.id));
  return errors;
}

/** Text mit Platzhaltern {name}; fehlende Werte bleiben stehen, damit man sie sieht. */
export function fillText(text: LocalizedText, vars: Record<string, string> = {}, lang: Lang = 'de'): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}
