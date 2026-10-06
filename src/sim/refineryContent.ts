// Texte der Raffinerie (4.6) aus content/refinery.yaml: Gegenstand, Fenster,
// Produkte. Hier wird nur gelesen und geprüft – keine Spielregel. Jeder Text
// kommt als { de, en }; Deutsch ist Pflicht, Englisch darf leer sein.

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { PRODUCTS, type Product } from './refineryBalance';

/** Alle Pfade, die content/refinery.yaml haben muss (Produkte kommen dazu). */
export const REFINERY_TEXT_KEYS = [
  'object',
  'sheetTitle',
  'tabs.plant',
  'tabs.mix',
  'tabs.compare',
  'intro',
  'status.none',
  'status.building',
  'status.running',
  'status.expanding',
  'status.damaged',
  'status.short.none',
  'status.short.building',
  'status.short.running',
  'status.short.expanding',
  'status.short.damaged',
  'actions.build',
  'actions.expand',
  'actions.intake',
  'actions.apply',
  'hints.intake',
  'hints.feedLimited',
  'hints.lessIntake',
  'hints.mix',
  'hints.planned',
  'hints.noCrude',
  'hints.compare',
  'hints.refineBetter',
  'hints.sellBetter',
  'hints.lastRun',
  'hints.bestGain',
  'hints.bestLoss',
  'hints.expandPays',
  'hints.expandNot',
  'hints.stations',
  'hints.expandNoOil',
  'hints.unlockDebug',
  'columns.product',
  'columns.share',
  'columns.output',
  'columns.demand',
  'columns.price',
  'columns.sellCrude',
  'columns.refine',
] as const;
export type RefineryTextKey = (typeof REFINERY_TEXT_KEYS)[number];

export interface RefineryContent {
  texts: Record<RefineryTextKey, LocalizedText>;
  products: Record<Product, { name: LocalizedText; text: LocalizedText }>;
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (istObjekt(o) ? o[k] : undefined), obj);
}

/** Liest content/refinery.yaml; Fehler mit Datei und (wo möglich) Zeile. */
export function parseRefineryContent(file: string, text: string): { content: RefineryContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();

  function sprachtext(path: string): LocalizedText | null {
    const v = get(raw, path);
    if (!istObjekt(v)) {
      fehler(`${path}: fehlt oder braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return null;
    }
    const unbekannt = Object.keys(v).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${path}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof v.de !== 'string' || v.de.trim() === '') {
      fehler(`${path}: deutscher Text fehlt.`);
      return null;
    }
    if (v.en !== undefined && typeof v.en !== 'string') fehler(`${path}: englischer Text muss Text sein.`);
    return { de: v.de, en: typeof v.en === 'string' ? v.en : '' };
  }

  const texts = {} as Record<RefineryTextKey, LocalizedText>;
  for (const key of REFINERY_TEXT_KEYS) {
    const t = sprachtext(key);
    if (t) texts[key] = t;
  }
  const products = {} as RefineryContent['products'];
  for (const p of PRODUCTS) {
    const name = sprachtext(`products.${p}.name`);
    const beschreibung = sprachtext(`products.${p}.text`);
    if (name && beschreibung) products[p] = { name, text: beschreibung };
  }
  const prods = get(raw, 'products');
  if (istObjekt(prods)) {
    const fremd = Object.keys(prods).filter((k) => !(PRODUCTS as readonly string[]).includes(k));
    if (fremd.length > 0) fehler(`Unbekannte Produkte: ${fremd.join(', ')}. Erlaubt: ${PRODUCTS.join(', ')}.`);
  }
  return { content: errors.length === 0 ? { texts, products } : null, errors };
}

/** Text in der Sprache, Platzhalter wie {cost} gefüllt. */
export function refineryText(content: RefineryContent, key: RefineryTextKey, values: Record<string, string> = {}, lang?: Lang): string {
  return localize(content.texts[key], lang).replace(/\{(\w+)\}/g, (ganz, k: string) => values[k] ?? ganz);
}
