// Texte für Marke und Tankstellen (4.14): content/brand.yaml lesen und prüfen.
// Die Simulation (src/sim/brand.ts) liefert nur Kennungen und Zahlen – Namen der
// Regionen und Werbungen, Zustandswörter, Nachrichten und Absagen stehen hier.
// Dazu die Querprüfung gegen balance.yaml: Jede Region und jede Werbung braucht
// einen Namen, und keine Kennung in der Textdatei darf ins Leere zeigen.

import { parseDocument } from 'yaml';
import { AWARENESS_WORDS, PRICE_POLICIES, type BrandBalance, type BrandNews, type BrandRefusal, type AwarenessWord, type PricePolicy } from './brand';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';

const NEWS_KINDS = ['opened', 'priceWarStart', 'priceWarEnd', 'craneExpand', 'campaignEnd', 'scandal'] as const satisfies readonly BrandNews['kind'][];
const REFUSALS = [
  'locked',
  'founded',
  'notFounded',
  'cash',
  'region',
  'count',
  'full',
  'noStation',
  'campaign',
  'running',
  'samePrice',
  'name',
  'pact',
] as const satisfies readonly BrandRefusal[];
const UI_KEYS = [
  'tabNetwork',
  'tabAds',
  'tabCrane',
  'region',
  'stations',
  'share',
  'awareness',
  'price',
  'building',
  'build',
  'sell',
  'closed',
  'national',
  'profit',
  'value',
  'goal',
  'goalRating',
  'antitrust',
  'campaignRun',
  'campaignStart',
  'craneIntro',
  'craneRow',
  'priceWar',
  'news',
  'noNews',
  'newsBadge',
  'deskNoBrand',
  // 0.4.20+8: Cranes Feldzug (src/sim/feldzug.ts), Reiter Crane.
  'feldzugThreat',
  'feldzugWar',
  'feldzugBank',
  'feldzugHeld',
  'feldzugPact',
  'feldzugLost',
  'feldzugChapterEnd',
  'feldzugPactButton',
  'feldzugOffer',
  'feldzugLoanButton',
  'feldzugLoan',
  'feldzugRepay',
  'chestVoll',
  'chestHalb',
  'chestKnapp',
] as const;
export type BrandUiKey = (typeof UI_KEYS)[number];

export interface BrandContent {
  draft: boolean;
  object: { name: LocalizedText; title: LocalizedText };
  names: Record<string, LocalizedText>;
  regions: Record<string, LocalizedText>;
  campaigns: Record<string, { name: LocalizedText; text: LocalizedText }>;
  prices: Record<PricePolicy, LocalizedText>;
  words: Record<AwarenessWord, LocalizedText>;
  intro: { title: LocalizedText; text: LocalizedText; choose: LocalizedText; found: LocalizedText };
  ui: Record<BrandUiKey, LocalizedText>;
  news: Record<BrandNews['kind'], LocalizedText>;
  refusals: Record<BrandRefusal, LocalizedText>;
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/brand.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseBrandContent(file: string, text: string): { content: BrandContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht object, names, regions, campaigns, prices, words, intro, ui, news und refusals.');
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
  function block(key: string): Record<string, unknown> {
    const v = raw && istObjekt(raw) ? raw[key] : undefined;
    if (!istObjekt(v)) {
      fehler(`Block „${key}“ fehlt.`);
      return {};
    }
    return v;
  }
  /** Fester Satz von Schlüsseln: alle müssen da sein, fremde sind ein Tippfehler. */
  function fest<K extends string>(key: string, ids: readonly K[]): Record<K, LocalizedText> {
    const b = block(key);
    const fremd = Object.keys(b).filter((k) => !(ids as readonly string[]).includes(k));
    if (fremd.length > 0) fehler(`${key}: unbekannt ${fremd.join(', ')} – erlaubt: ${ids.join(', ')}.`);
    return Object.fromEntries(ids.map((id) => [id, sprachtext(b[id], `${key}.${id}`)])) as Record<K, LocalizedText>;
  }
  /** Freie Kennungen (Regionen, Namen): mindestens eine, jede mit Text. */
  function frei(key: string): Record<string, LocalizedText> {
    const b = block(key);
    const out: Record<string, LocalizedText> = {};
    for (const [id, v] of Object.entries(b)) {
      if (!/^[a-z0-9_]+$/.test(id)) fehler(`${key}: Kennung „${id}“ – nur a–z, 0–9 und _.`);
      out[id] = sprachtext(v, `${key}.${id}`);
    }
    if (Object.keys(out).length === 0) fehler(`${key}: braucht mindestens einen Eintrag.`);
    return out;
  }

  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');
  const o = block('object');
  const object = { name: sprachtext(o.name, 'object.name'), title: sprachtext(o.title, 'object.title') };
  const names = frei('names');
  const regions = frei('regions');
  const cb = block('campaigns');
  const campaigns: BrandContent['campaigns'] = {};
  for (const [id, v] of Object.entries(cb)) {
    const x = istObjekt(v) ? v : {};
    if (!istObjekt(v)) fehler(`campaigns.${id}: braucht name und text.`);
    campaigns[id] = { name: sprachtext(x.name, `campaigns.${id}.name`), text: sprachtext(x.text, `campaigns.${id}.text`) };
  }
  if (Object.keys(campaigns).length === 0) fehler('campaigns: braucht mindestens einen Eintrag.');
  const prices = fest('prices', PRICE_POLICIES);
  const words = fest('words', AWARENESS_WORDS);
  const i = block('intro');
  const intro = {
    title: sprachtext(i.title, 'intro.title'),
    text: sprachtext(i.text, 'intro.text'),
    choose: sprachtext(i.choose, 'intro.choose'),
    found: sprachtext(i.found, 'intro.found'),
  };
  const ui = fest('ui', UI_KEYS);
  const news = fest('news', NEWS_KINDS);
  const refusals = fest('refusals', REFUSALS);
  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, object, names, regions, campaigns, prices, words, intro, ui, news, refusals }, errors };
}

/** Querprüfung gegen balance.yaml: jede Region und Werbung mit Namen, keine verwaisten Kennungen. */
export function checkBrandRefs(file: string, content: BrandContent, balance: { brand: BrandBalance }): ContentError[] {
  const fehler: ContentError[] = [];
  const add = (message: string) => fehler.push({ file, line: 1, message });
  const regionen = balance.brand.regions.map((r) => r.id);
  const werbung = balance.brand.campaigns.map((c) => c.id);
  for (const id of regionen) if (!content.regions[id]) add(`regions: Region „${id}“ aus balance.yaml hat keinen Namen.`);
  for (const id of Object.keys(content.regions)) if (!regionen.includes(id)) add(`regions: „${id}“ gibt es in balance.yaml (brand.regions) nicht – Tippfehler?`);
  for (const id of werbung) if (!content.campaigns[id]) add(`campaigns: Werbung „${id}“ aus balance.yaml hat keinen Namen.`);
  for (const id of Object.keys(content.campaigns)) if (!werbung.includes(id)) add(`campaigns: „${id}“ gibt es in balance.yaml (brand.campaigns) nicht – Tippfehler?`);
  return fehler;
}

/** Setzt Platzhalter wie {region} in einen Text ein. */
export function brandText(text: LocalizedText, values: Record<string, string | number> = {}, lang?: Lang): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => (values[key] !== undefined ? String(values[key]) : ganz));
}

/** Name einer Region oder Werbung – unbekannte Kennungen bleiben als Kennung stehen. */
export function regionName(content: BrandContent, id: string, lang?: Lang): string {
  return content.regions[id] ? localize(content.regions[id], lang) : id;
}

export function campaignName(content: BrandContent, id: string, lang?: Lang): string {
  return content.campaigns[id] ? localize(content.campaigns[id].name, lang) : id;
}

/** Ein Satz für eine Nachricht der letzten Abrechnung. */
export function brandNewsText(content: BrandContent, n: BrandNews, lang?: Lang): string {
  const values: Record<string, string | number> = {};
  if ('region' in n) values.region = regionName(content, n.region, lang);
  if ('count' in n) values.anzahl = n.count;
  if ('campaign' in n) values.kampagne = campaignName(content, n.campaign, lang);
  return brandText(content.news[n.kind], values, lang);
}
