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
import { craneCut, markRound, RIVAL_MARKS } from './trust';
import { lawReport, type LawReport } from './laws';
import { electionReport, loudestAct, type ElectionReport, type PoliticsContent } from './politics';
import { PUBLIC_ACTS, worldPriceFactor } from './world';
import { MAJOR_WORLD_HEADLINES, worldHeadline, WORLD_HEADLINES } from './worldNews';
// Termine als Hauptwerkzeug, Etappe 2: Gerüchte, Förderbremse, Noras Vorwarnungen.
import { marketMods, soldThisRound } from './pricing';
import { chapterOf } from './chapterOf';
// 0.4.20+9: Varianten je Schlagzeile, neue Meldungen (Fernleitung, Delaney, Benzinpreiskampf), Börsenseite.
import { seedFromString } from './rng';
import { readClimate } from './exchange';
import { makeExchangePage, type ExchangeContent, type ExchangePage } from './exchangeContent';

/** Meldungen über Jacobs öffentliches Handeln (4.2): eine je Tat, Schlüssel public_<tat>. */
export const PUBLIC_HEADLINES = PUBLIC_ACTS.map((a) => `public_${a}` as const);

/** 0.4.20+9: Meldungen zu Delaneys Ermittlung (4.11), je Stufe bzw. Ausgang eine. */
export const DELANEY_HEADLINES = [
  'delaney_rumor',
  'delaney_probe',
  'delaney_charge',
  'delaney_dropped',
  'delaney_settled',
  'delaney_acquitted',
  'delaney_convicted',
] as const;

/** 0.4.20+29: Meldungen zur Forschung (4.11): Abschluss der Werkstatt, mit oder ohne Patent. */
export const RESEARCH_HEADLINES = ['research_patent', 'research_done'] as const;

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
  // 0.4.20+38: Preismeldung gegen die Aussicht der Titelseite – „noch“ statt Widerspruch.
  'price_cut_turn',
  'price_raise_turn',
  'crane_cut',
  'rival_find',
  'jacob_gusher',
  'jacob_find',
  'classifieds',
  // Etappe 2: Gerüchte, ihre Entlarvung, Förderbremse geplatzt, Kartellverfahren.
  'rumour_dry',
  'rumour_bullard',
  'rumour_exposed',
  'cartel_collapse',
  'cartel_court',
  // 0.4.20+9: Fernleitung (4.7) fertig oder gesprengt.
  'pipeline_built',
  'pipeline_damaged',
  // 0.4.20+9: Delaneys Ermittlung (4.11) – neue Stufe oder Ausgang.
  ...DELANEY_HEADLINES,
  ...RESEARCH_HEADLINES,
  // 0.4.20+9: Benzinpreiskampf mit Margaret Crane (4.14) beginnt oder endet.
  'brand_price_war',
  'brand_price_war_end',
  ...PUBLIC_HEADLINES,
  ...WORLD_HEADLINES,
] as const;
export type HeadlineId = (typeof HEADLINE_IDS)[number];

export interface HeadlineVariant {
  title: LocalizedText;
  text: LocalizedText;
}

export interface HeadlineText extends HeadlineVariant {
  /** 0.4.20+9: weitere Fassungen derselben Meldung – die Zeitung wechselt, statt sich zu wiederholen. */
  variants?: HeadlineVariant[];
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
  /** Wahlergebnis (4.2), nur in der Ausgabe direkt nach einer Wahl. */
  election: ElectionReport | null;
  /** Aus dem Parlament (4.3): Antrag, Debatte oder Abstimmung der letzten Runde – höchstens eine Meldung. */
  law: LawReport | null;
  /** 0.4.20+9: Börsenseite (4.15) – nur mit Börse und wenn die Texte der Börse mitgegeben werden. */
  exchange?: ExchangePage | null;
}

/**
 * Der Posted Price, den der Trust am Ende dieser Runde festlegen wird – wenn
 * nichts Unerwartetes passiert (seit Etappe 2: und Jacob verkauft, was er fördert). Gerechnet wie im Marktschritt von endRound:
 * Jacobs Förderung dieser Runde (fündige Quellen, auch gerade fertig gewordene),
 * die Nachbarn dieser Runde und Bullards fündige Quellen (auch neue Funde der
 * letzten Runde – die gehen jetzt erstmals in den Markt).
 */
export function expectedPrice(state: GameState, balance: Balance, jacobSales?: number): number {
  const gefoerdert = advanceProduction(state, balance);
  if (!state.pricing) {
    const supply =
      jacobSupply(gefoerdert) +
      neighbourSupply(balance.market, state.round, state.neighbourOffset ?? 0) +
      rivalSupply(state, balance.rivals.bullard.ratePerWell);
    return computePrice(balance.market, supply, worldPriceFactor(state.worldModel, balance.worldModel));
  }
  // Etappe 2: Der Markt rechnet in Kapitel 1 mit Jacobs Verkauf – die Zeitung nimmt an, dass er
  // verkauft, was er fördert (oder schon mehr verkauft hat); jacobSales setzt den Verkauf fest.
  // Förderbremse und Gerüchte zählen mit.
  const jacob = chapterOf(state) > 1 ? jacobSupply(gefoerdert) : (jacobSales ?? Math.max(soldThisRound(state), jacobSupply(gefoerdert)));
  const mods = marketMods(gefoerdert, balance, jacob);
  const shock = mods.shock !== 1 ? { ...balance.market, shock: balance.market.shock * mods.shock } : balance.market;
  return computePrice(shock, mods.supply, worldPriceFactor(state.worldModel, balance.worldModel));
}

/** Welche Aussicht die Titelseite zeigt (Schwellen in balance.yaml, newspaper). */
export function marketOutlook(state: GameState, balance: Balance): Outlook {
  // Etappe 2: Nach einem aufgeflogenen Gerücht schreibt Nora nichts mehr für Jacob – keine Vorwarnungen.
  if (state.pricing?.noraBurned) return 'steady';
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
    // 0.4.20+38: Die Titelseite sagt die nächste Runde voraus, die Kurzmeldung berichtet die letzte. Zeigen beide in
    // verschiedene Richtungen, nimmt die Zeitung die Wende-Fassung („Noch zahlt der Trust mehr – doch …“).
    const aussicht = marketOutlook(state, balance);
    if (change <= -balance.market.newsThreshold + 1e-9) ids.push(aussicht === 'rise' ? 'price_cut_turn' : 'price_cut');
    else if (change >= balance.market.newsThreshold - 1e-9) ids.push(aussicht === 'fall' || aussicht === 'crash' ? 'price_raise_turn' : 'price_raise');
  }
  // Cranes Abschlag (2.8) gilt ab dieser Runde.
  const abschlag = markRound(state, RIVAL_MARKS.craneCut);
  if (abschlag !== undefined && abschlag + 1 === state.round && craneCut(state, balance) > 0) ids.push('crane_cut');
  // Neue Funde der letzten Runde: Jacobs Quelle hat noch nicht gefördert,
  // Bullards Quelle steht noch auf ihrer Anfangsrate.
  const neu = state.wells.filter((w) => w.status === 'found' && (w.production?.roundsProduced ?? 0) === 0);
  if (neu.some((w) => w.result === 'gusher')) ids.push('jacob_gusher');
  else if (neu.length > 0) ids.push('jacob_find');
  const ratePerWell = balance.rivals.bullard.ratePerWell;
  if (state.rival.wells.some((w) => w.status === 'found' && w.rate === ratePerWell)) {
    ids.push('rival_find');
  }
  // Etappe 2: Gerüchte, Entlarvung, geplatzte Förderbremse, Kartellverfahren der letzten Runde.
  const p = state.pricing;
  if (p) {
    const letzte = state.round - 1;
    if (p.rumours.exposedRound === letzte && letzte > 0) ids.unshift('rumour_exposed');
    else if (p.rumours.shock?.round === letzte) ids.push(p.rumours.kind === 'riesenfund' ? 'rumour_bullard' : 'rumour_dry');
    if (p.courtRound === letzte && letzte > 0) ids.unshift('cartel_court');
    else if (p.collapseRound === letzte && letzte > 0) ids.push('cartel_collapse');
  }
  // 0.4.20+9: Fernleitung, Delaney und Benzinpreiskampf der letzten Runde.
  const leitung = pipelineHeadline(state);
  if (leitung) ids.push(leitung);
  const delaney = delaneyHeadline(state);
  if (delaney) ids.push(delaney);
  const forschung = researchHeadline(state);
  if (forschung) ids.push(forschung);
  const preiskampf = brandHeadline(state);
  if (preiskampf) ids.push(preiskampf);
  // Öffentliches Handeln (4.2): Worüber man über Jacob redet – die lauteste Tat der letzten Runde.
  const tat = loudestAct(state.worldModel);
  if (tat) ids.push(`public_${tat}`);
  // Weltmodell (4.1): höchstens eine Meldung aus der Welt – was geschah, sonst ein Frühwarnzeichen.
  // Große Ereignisse (Crash, Krieg, Verstaatlichung, Riesenfund) stehen ganz vorn, alles andere hinten an.
  const welt = worldHeadline(state.worldModel, balance.worldModel);
  if (welt && MAJOR_WORLD_HEADLINES.includes(welt)) ids.unshift(welt);
  else if (welt) ids.push(welt);
  if (ids.length === 0) ids.push('classifieds');
  return ids.slice(0, balance.newspaper.maxItems);
}

/**
 * 0.4.20+9: Fernleitung (4.7) – die Briefe der letzten Runde sagen, ob eine Leitung fertig
 * wurde oder Saboteure sie gesprengt haben. Fertig geht vor.
 */
export function pipelineHeadline(state: Pick<GameState, 'round' | 'bigPipelines'>): HeadlineId | null {
  const letzte = state.round - 1;
  const briefe = state.bigPipelines?.letters.filter((l) => l.round === letzte) ?? [];
  if (briefe.some((l) => l.kind === 'ready')) return 'pipeline_built';
  if (briefe.some((l) => l.kind === 'sabotage')) return 'pipeline_damaged';
  return null;
}

/**
 * 0.4.20+9: Delaneys Ermittlung (4.11) – hat in der letzten Runde eine neue Stufe begonnen
 * (Gerücht, Vorermittlung, Anklage) oder ist der Fall abgeschlossen worden, meldet es die
 * Zeitung. Gelesen wird die Stufe mit ihrer Anfangsrunde (since), nicht die Merkzeichen
 * delaney_*: Die gelten nur beim ersten Fall, die Stufe auch bei jedem weiteren.
 * Zurück zur Ruhe (Gerücht verflogen, Abkühlzeit vorbei) ist keine Meldung wert.
 */
export function delaneyHeadline(state: Pick<GameState, 'round' | 'investigation'>): HeadlineId | null {
  const inv = state.investigation;
  if (!inv || inv.since !== state.round - 1 || inv.since <= 0) return null;
  switch (inv.stage) {
    case 'geruecht':
      return 'delaney_rumor';
    case 'vorermittlung':
      return 'delaney_probe';
    case 'anklage':
      return 'delaney_charge';
    case 'abgeschlossen':
      if (inv.verdict === 'eingestellt') return 'delaney_dropped';
      if (inv.verdict === 'vergleich') return 'delaney_settled';
      if (inv.verdict === 'freispruch') return 'delaney_acquitted';
      if (inv.verdict === 'geldstrafe' || inv.verdict === 'schwere_strafe') return 'delaney_convicted';
      return null;
    default:
      return null;
  }
}

/** 0.4.20+29: Forschung (4.11) – hat die Werkstatt in der letzten Runde eine Technik fertig, meldet es die Zeitung (Patent geht vor). */
export function researchHeadline(state: Pick<GameState, 'round' | 'research'>): HeadlineId | null {
  const d = state.research?.done;
  if (!d || d.round !== state.round - 1) return null;
  return d.patent ? 'research_patent' : 'research_done';
}

/**
 * 0.4.20+9: Benzinpreiskampf (4.14) – liest nur die Nachrichten der letzten Markenabrechnung
 * (state.brand.news). Ein neuer Preiskampf geht vor seinem Ende in einer anderen Region.
 */
export function brandHeadline(state: Pick<GameState, 'brand'>): HeadlineId | null {
  const news = state.brand?.news ?? [];
  if (news.some((n) => n.kind === 'priceWarStart')) return 'brand_price_war';
  if (news.some((n) => n.kind === 'priceWarEnd')) return 'brand_price_war_end';
  return null;
}

/**
 * 0.4.20+9: Welche Fassung einer Schlagzeile in Runde round erscheint (0 = die Grundfassung).
 * Deterministisch aus Seed, Schlagzeile und Runde; von Runde zu Runde springt die Fassung
 * immer weiter (um 1 bis count−1), sodass dieselbe Meldung nie zweimal hintereinander
 * gleich klingt. Gerechnet wird ab Runde 1, damit jede Ausgabe ihre Vorgängerin kennt.
 */
export function headlineVariant(seed: string, id: string, round: number, count: number): number {
  if (count <= 1) return 0;
  let v = seedFromString(`${seed}:zeitung:${id}`) % count;
  for (let r = 1; r <= round; r++) v = (v + 1 + (seedFromString(`${seed}:zeitung:${id}:${r}`) % (count - 1))) % count;
  return v;
}

const FRONT: Record<Outlook, HeadlineId> = {
  crash: 'outlook_crash',
  fall: 'outlook_fall',
  steady: 'outlook_steady',
  rise: 'outlook_rise',
};

/**
 * Die Zeitung zu Beginn der laufenden Runde. Mit den Texten der Börse (exchange) baut sie
 * auch die Börsenseite (0.4.20+9) – die Oberfläche zeigt nur noch an.
 */
export function makeNewspaper(
  state: GameState,
  balance: Balance,
  content: NewspaperContent,
  lang?: Lang,
  politics?: PoliticsContent,
  exchange?: ExchangeContent,
): Newspaper {
  const headline = (id: HeadlineId): Headline => {
    const h = content.headlines[id];
    const fassungen: HeadlineVariant[] = [h, ...(h.variants ?? [])];
    const f = fassungen[headlineVariant(state.seed, id, state.round, fassungen.length)];
    return { id, title: localize(f.title, lang), text: localize(f.text, lang) };
  };
  const s = state.stocks;
  const eigene = s?.public ? { price: s.price, history: s.priceHistory } : null;
  return {
    name: localize(content.name, lang),
    front: headline(FRONT[marketOutlook(state, balance)]),
    items: newsItems(state, balance).map(headline),
    election: politics ? electionReport(state.worldModel, politics, lang) : null,
    law: politics ? lawReport(state.worldModel?.laws, balance.laws, politics, lang) : null,
    exchange: exchange && state.exchange ? makeExchangePage(state.exchange, balance.exchange, exchange, readClimate(state), lang, eigene) : null,
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
    // 0.4.20+9: weitere Fassungen (variants), je mit title und text.
    const variants: HeadlineVariant[] = [];
    if (eintrag.variants !== undefined) {
      if (!Array.isArray(eintrag.variants)) fehler(`${id}.variants: muss eine Liste sein.`);
      else
        eintrag.variants.forEach((v: unknown, i: number) => {
          const vt = istObjekt(v) ? sprachtext(v.title, `${id}.variants[${i + 1}].title`) : null;
          const vb = istObjekt(v) ? sprachtext(v.text, `${id}.variants[${i + 1}].text`) : null;
          if (!istObjekt(v)) fehler(`${id}.variants[${i + 1}]: braucht title und text.`);
          if (vt && vb) variants.push({ title: vt, text: vb });
        });
    }
    if (title && body) headlines[id] = variants.length > 0 ? { title, text: body, variants } : { title, text: body };
  }
  if (errors.length > 0 || !name) return { content: null, errors };
  return { content: { name, headlines: headlines as Record<HeadlineId, HeadlineText> }, errors };
}
