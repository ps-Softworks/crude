// Zeitung (2.6, GDD §7.2): Schlagzeilen aus dem Spielzustand. Die Zeitung ist
// eine reine Ansicht – sie ändert den Zustand nicht und braucht keinen Zufall.
// Die Titelseite ist ein Frühwarnzeichen: Sie schätzt den Posted Price, den der
// Trust am Ende der laufenden Runde festlegt, und zeigt nur eine Schlagzeile
// („Volle Tanks am Hafen“), nie die Zahl. Die Texte stehen in content/newspaper.yaml.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { computePrice, jacobSupply, neighbourSupply, rivalSupply } from './market';
import { advanceProduction } from './production';

/** Aussicht für den Ölpreis bis zum Rundenende. */
export type Outlook = 'crash' | 'fall' | 'steady' | 'rise';

/** Alle Schlagzeilen, die content/newspaper.yaml liefern muss. */
export const HEADLINE_IDS = [
  'outlook_crash',
  'outlook_fall',
  'outlook_rise',
  'outlook_steady',
  'price_cut',
  'price_raise',
  'rival_find',
  'jacob_gusher',
  'jacob_find',
  'classifieds',
] as const;
export type HeadlineId = (typeof HEADLINE_IDS)[number];

export interface HeadlineText {
  title: LocalizedText;
  text: LocalizedText;
}

export interface NewspaperContent {
  name: LocalizedText;
  headlines: Record<HeadlineId, HeadlineText>;
}

/** Eine fertige Schlagzeile in einer Sprache. */
export interface Headline {
  id: HeadlineId;
  title: string;
  text: string;
}

export interface Newspaper {
  name: string;
  /** Titelseite: immer die Aussicht für den Ölpreis. */
  front: Headline;
  /** Kurzmeldungen zur letzten Runde, höchstens newspaper.maxItems. */
  items: Headline[];
}

/**
 * Der Posted Price, den der Trust am Ende dieser Runde festlegen wird – wenn
 * nichts Unerwartetes passiert. Gerechnet wie im Marktschritt von endRound:
 * Jacobs Förderung dieser Runde (fündige Quellen, auch gerade fertig gewordene),
 * die Nachbarn dieser Runde und Bullards fündige Quellen (auch neue Funde der
 * letzten Runde – die gehen jetzt erstmals in den Markt).
 */
export function expectedPrice(state: GameState, balance: Balance): number {
  const gefoerdert = advanceProduction(state, balance);
  const supply =
    jacobSupply(gefoerdert) +
    neighbourSupply(balance.market, state.round) +
    rivalSupply(state, balance.rivals.bullard.ratePerWell);
  return computePrice(balance.market, supply);
}

/** Welche Aussicht die Titelseite zeigt (Schwellen in balance.yaml, newspaper). */
export function marketOutlook(state: GameState, balance: Balance): Outlook {
  const { fallFrom, crashFrom, riseFrom } = balance.newspaper;
  const change = (expectedPrice(state, balance) - state.postedPrice) / state.postedPrice;
  // Kleine Toleranz, damit genau die Schwelle trotz Rundung zählt.
  const eps = 1e-9;
  if (change <= -crashFrom + eps) return 'crash';
  if (change <= -fallFrom + eps) return 'fall';
  if (change >= riseFrom - eps) return 'rise';
  return 'steady';
}

/** Kurzmeldungen zur letzten Runde, in fester Reihenfolge nach Wichtigkeit. */
export function newsItems(state: GameState, balance: Balance): HeadlineId[] {
  const ids: HeadlineId[] = [];
  const history = state.priceHistory;
  if (history.length >= 2) {
    const vorher = history[history.length - 2];
    const jetzt = history[history.length - 1];
    const change = (jetzt - vorher) / vorher;
    if (change <= -balance.market.newsThreshold + 1e-9) ids.push('price_cut');
    else if (change >= balance.market.newsThreshold - 1e-9) ids.push('price_raise');
  }
  // Neue Funde der letzten Runde: Jacobs Quelle hat noch nicht gefördert,
  // Bullards Quelle steht noch auf ihrer Anfangsrate.
  const neu = state.wells.filter((w) => w.status === 'found' && (w.production?.roundsProduced ?? 0) === 0);
  if (neu.some((w) => w.result === 'gusher')) ids.push('jacob_gusher');
  else if (neu.length > 0) ids.push('jacob_find');
  const ratePerWell = balance.rivals.bullard.ratePerWell;
  if (state.rival.wells.some((w) => w.status === 'found' && w.rate === ratePerWell)) {
    ids.push('rival_find');
  }
  if (ids.length === 0) ids.push('classifieds');
  return ids.slice(0, balance.newspaper.maxItems);
}

const FRONT: Record<Outlook, HeadlineId> = {
  crash: 'outlook_crash',
  fall: 'outlook_fall',
  steady: 'outlook_steady',
  rise: 'outlook_rise',
};

/** Die Zeitung zu Beginn der laufenden Runde. */
export function makeNewspaper(state: GameState, balance: Balance, content: NewspaperContent, lang?: Lang): Newspaper {
  const headline = (id: HeadlineId): Headline => ({
    id,
    title: localize(content.headlines[id].title, lang),
    text: localize(content.headlines[id].text, lang),
  });
  return {
    name: localize(content.name, lang),
    front: headline(FRONT[marketOutlook(state, balance)]),
    items: newsItems(state, balance).map(headline),
  };
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/newspaper.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseNewspaperContent(
  file: string,
  text: string,
): { content: NewspaperContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „name“ und „headlines“.');
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

  const name = sprachtext(raw.name, 'name');
  const headlinesRaw = raw.headlines;
  if (!istObjekt(headlinesRaw)) {
    fehler('„headlines“ fehlt.');
    return { content: null, errors };
  }
  const unbekannt = Object.keys(headlinesRaw).filter((k) => !(HEADLINE_IDS as readonly string[]).includes(k));
  if (unbekannt.length > 0) fehler(`Unbekannte Schlagzeile(n): ${unbekannt.join(', ')}. Erlaubt: ${HEADLINE_IDS.join(', ')}.`);
  const headlines: Partial<Record<HeadlineId, HeadlineText>> = {};
  for (const id of HEADLINE_IDS) {
    const eintrag = headlinesRaw[id];
    if (!istObjekt(eintrag)) {
      fehler(`Schlagzeile „${id}“ fehlt.`);
      continue;
    }
    const title = sprachtext(eintrag.title, `${id}.title`);
    const body = sprachtext(eintrag.text, `${id}.text`);
    if (title && body) headlines[id] = { title, text: body };
  }
  if (errors.length > 0 || !name) return { content: null, errors };
  return { content: { name, headlines: headlines as Record<HeadlineId, HeadlineText> }, errors };
}
