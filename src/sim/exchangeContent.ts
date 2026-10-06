// Texte der Börse (4.15): content/exchange.yaml – Namen der Aktien, Schlagzeilen
// der Börsenseite, Briefe des Maklers. Hier wird nur gelesen und zugeordnet;
// welche Schlagzeile erscheint, entscheidet exchange.ts.

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import {
  EXCHANGE_HEADLINE_IDS,
  exchangeHeadline,
  NEUTRAL_CLIMATE,
  positionEquity,
  type CreditClimate,
  type ExchangeHeadlineId,
  type ExchangeState,
} from './exchange';
import type { ExchangeBalance } from './exchangeBalance';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';

export const EXCHANGE_LETTER_IDS = ['call', 'liquidated', 'liquidated_even'] as const;
export type ExchangeLetterId = (typeof EXCHANGE_LETTER_IDS)[number];

export interface ExchangeText {
  title: LocalizedText;
  text: LocalizedText;
}

export interface ExchangeContent {
  page: LocalizedText;
  /** 0.4.20+9: Name von Jacobs eigener Firma auf dem Kurszettel. */
  own: LocalizedText;
  stocks: Record<string, { name: LocalizedText; note: LocalizedText }>;
  headlines: Record<ExchangeHeadlineId, ExchangeText>;
  letters: Record<ExchangeLetterId, ExchangeText>;
}

/** 0.4.20+9: Eine Zeile auf dem Kurszettel der Börsenseite – nur zum Anzeigen. */
export interface ExchangeQuote {
  /** Aktie aus balance.yaml (exchange.stocks) oder 'own' für Harlan Oil. */
  id: string;
  name: string;
  /** Kurs in $. */
  price: number;
  /** Änderung zur Vorrunde als Anteil (−0,1 = 10 % tiefer); 0 ohne Vorrunde. */
  change: number;
  /** Jacobs eigene Aktie (Harlan Oil). */
  own: boolean;
}

/** Die Börsenseite der Zeitung in einer Sprache. */
export interface ExchangePage {
  name: string;
  id: ExchangeHeadlineId;
  title: string;
  text: string;
  /** 0.4.20+9: Kurszettel – die gehandelten Aktien, dazu Harlan Oil, sobald die Firma an der Börse ist. */
  quotes: ExchangeQuote[];
}

/** Kurs und Kursverlauf von Jacobs Firma (state.stocks), nur wenn sie an der Börse ist. */
export interface OwnShare {
  price: number;
  /** Letzte Kurse, ältester zuerst, der aktuelle zuletzt. */
  history: readonly number[];
}

function aenderung(price: number, history: readonly number[]): number {
  const vorher = history.length >= 2 ? history[history.length - 2] : undefined;
  return vorher && vorher > 0 ? (price - vorher) / vorher : 0;
}

export function makeExchangePage(
  ex: ExchangeState,
  eb: ExchangeBalance,
  content: ExchangeContent,
  climate: CreditClimate = NEUTRAL_CLIMATE,
  lang?: Lang,
  own: OwnShare | null = null,
): ExchangePage {
  const id = exchangeHeadline(ex, eb, climate);
  const quotes: ExchangeQuote[] = eb.stocks
    .filter((s) => ex.prices[s.id] !== undefined)
    .map((s) => ({ id: s.id, name: stockName(content, s.id, lang), price: ex.prices[s.id], change: aenderung(ex.prices[s.id], ex.history[s.id] ?? []), own: false }));
  // 0.4.20+9: Harlan Oil steht mit auf dem Zettel – nur Anzeige, gehandelt wird sie im Aktien-Fenster.
  if (own) quotes.push({ id: 'own', name: localize(content.own, lang), price: own.price, change: aenderung(own.price, own.history), own: true });
  return { name: localize(content.page, lang), id, title: localize(content.headlines[id].title, lang), text: localize(content.headlines[id].text, lang), quotes };
}

/** Name einer Aktie; unbekannte ids zeigen sich selbst. */
export function stockName(content: ExchangeContent, id: string, lang?: Lang): string {
  const s = content.stocks[id];
  return s ? localize(s.name, lang) : id;
}

/** Ein Brief des Maklers, fertig in einer Sprache. */
export interface ExchangeLetter {
  id: ExchangeLetterId;
  title: string;
  text: string;
}

/**
 * Briefe des Maklers zu Beginn der Runde: Zwangsverkäufe der letzten Runde und
 * offene Nachschussforderungen (mit dem Betrag, der den Kauf wieder über die
 * Grenze hebt). money formatiert Geld (kommt aus der Oberfläche).
 */
export function exchangeLetters(
  ex: ExchangeState,
  eb: ExchangeBalance,
  content: ExchangeContent,
  money: (value: number) => string,
  lang?: Lang,
): ExchangeLetter[] {
  const fill = (id: ExchangeLetterId, aktie: string, betrag: number): ExchangeLetter => ({
    id,
    title: localize(content.letters[id].title, lang),
    text: localize(content.letters[id].text, lang).replaceAll('{aktie}', stockName(content, aktie, lang)).replaceAll('{betrag}', money(betrag)),
  });
  const out: ExchangeLetter[] = ex.liquidated.map((l) => fill(l.shortfall > 0 ? 'liquidated' : 'liquidated_even', l.stock, l.shortfall));
  for (const p of ex.positions) {
    const betrag = p.called ? topUpNeeded(ex, eb, p) : 0;
    if (betrag > 0) out.push(fill('call', p.stock, betrag));
  }
  return out;
}

/** So viel Nachschuss hebt das Eigenkapital eines Kaufs wieder auf margin.call × Einsatz. */
export function topUpNeeded(ex: ExchangeState, eb: ExchangeBalance, p: ExchangeState['positions'][number]): number {
  // Nachschuss x: Eigenkapital + x ≥ call × (Einsatz + x)  →  x ≥ (call × Einsatz − Eigenkapital) / (1 − call)
  const c = eb.margin.call;
  const x = (c * p.stake - positionEquity(ex, p)) / Math.max(1e-9, 1 - c);
  return Math.max(0, Math.min(p.loan, Math.ceil(x)));
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Liest content/exchange.yaml. stockIds sind die Aktien aus balance.yaml – jede
 * braucht einen Namen, und es darf keine Texte für unbekannte Aktien geben.
 */
export function parseExchangeContent(
  file: string,
  text: string,
  stockIds: readonly string[],
): { content: ExchangeContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „page“, „own“, „stocks“, „headlines“ und „letters“.');
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

  function titelUndText<T extends string>(block: unknown, name: string, ids: readonly T[]): Record<T, ExchangeText> | null {
    if (!istObjekt(block)) {
      fehler(`„${name}“ fehlt.`);
      return null;
    }
    const unbekannt = Object.keys(block).filter((k) => !(ids as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${name}: unbekannt ${unbekannt.join(', ')}. Erlaubt: ${ids.join(', ')}.`);
    const out: Partial<Record<T, ExchangeText>> = {};
    for (const id of ids) {
      const e = block[id];
      if (!istObjekt(e)) {
        fehler(`${name}: „${id}“ fehlt.`);
        continue;
      }
      const title = sprachtext(e.title, `${name}.${id}.title`);
      const body = sprachtext(e.text, `${name}.${id}.text`);
      if (title && body) out[id] = { title, text: body };
    }
    return out as Record<T, ExchangeText>;
  }

  const page = sprachtext(raw.page, 'page');
  const own = sprachtext(raw.own, 'own');
  const stocks: ExchangeContent['stocks'] = {};
  if (!istObjekt(raw.stocks)) fehler('„stocks“ fehlt.');
  else {
    const fremd = Object.keys(raw.stocks).filter((k) => !stockIds.includes(k));
    if (fremd.length > 0) fehler(`stocks: ${fremd.join(', ')} gibt es in balance.yaml (exchange.stocks) nicht.`);
    for (const id of stockIds) {
      const s = raw.stocks[id];
      if (!istObjekt(s)) {
        fehler(`stocks: Aktie „${id}“ aus balance.yaml hat keinen Text.`);
        continue;
      }
      const name = sprachtext(s.name, `stocks.${id}.name`);
      const note = sprachtext(s.note, `stocks.${id}.note`);
      if (name && note) stocks[id] = { name, note };
    }
  }
  const headlines = titelUndText(raw.headlines, 'headlines', EXCHANGE_HEADLINE_IDS);
  const letters = titelUndText(raw.letters, 'letters', EXCHANGE_LETTER_IDS);
  if (errors.length > 0 || !page || !own || !headlines || !letters) return { content: null, errors };
  return { content: { page, own, stocks, headlines, letters }, errors };
}
