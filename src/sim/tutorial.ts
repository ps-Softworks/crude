// Einstieg (2.13): Die ersten Runden führen durch Pacht, Bohrung und Verkauf.
// Ein Hinweis sagt in jedem Moment genau eine Sache, die jetzt zu tun ist, und
// zeigt auf die Parzelle, um die es geht. Alles wird aus dem Spielzustand
// abgeleitet – kein eigener Zustand, kein Zufall, also auch kein neues
// Spielstandformat. Ob die Hinweise überhaupt zu sehen sind, entscheidet der
// Spieler in der Oberfläche (abschaltbar); welche kommt, entscheidet nur diese
// Datei. Texte: content/tutorial.yaml, Zahlen: balance.yaml unter tutorial.
//
// Damit ein neuer Spieler ohne Hilfe seine erste Quelle findet, empfiehlt der
// Hinweis die Parzelle mit der besten Schätzung des Geologen (abzüglich eines
// Abschlags für teure Pachten), die er sich samt erster Bohrstufe leisten kann – und rät nur dann tiefer zu bohren, wenn die
// neue Schätzung für die nächste Stufe gut genug ist.

import { parseDocument } from 'yaml';
import { TRANSPORT_MODES, type Balance, type TransportMode } from './balance';
import { headroom, takeLoan } from './credit';
import type { DeskActionKind } from './desk';
import { drillDeeper, fishWell, stageCost, startDrilling, wellOf, type Well } from './drilling';
import type { ContentError } from './eventContent';
import { forecastMid, formatForecast } from './forecast';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { buyLease, exerciseOption, leaseTerms, optionOf, parcelLabel } from './lease';
import { capacityLeft, netPrice, sellOil } from './transport';
import { knowledgeOf, suggestRide } from './exploration';
import { bookCard } from './plans';

/** Die drei Schritte des Einstiegs. */
export const TUTORIAL_STEPS = ['lease', 'drill', 'sell'] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** Alle Hinweise, die content/tutorial.yaml liefern muss. */
export const TUTORIAL_HINT_IDS = [
  'explore',
  'lease_option',
  'lease_buy',
  'lease_none',
  'loan_lease',
  'loan_drill',
  'drill',
  'drill_no_money',
  'drill_wait',
  'deeper',
  'abandon',
  'fish',
  'fish_abandon',
  'found_wait',
  'sell',
  'sold',
] as const;
export type TutorialHintId = (typeof TUTORIAL_HINT_IDS)[number];

/** Was der Hinweis vorschlägt – genau so, wie die Oberfläche (oder ein Bot) es ausführen kann. */
export type TutorialAction =
  | { kind: DeskActionKind; parcelId: string }
  | { kind: 'sell'; mode: TransportMode; barrels: number }
  | { kind: 'loan'; amount: number }
  | { kind: 'plan'; cardId: string; parcelId: string }
  | { kind: 'endRound' };

/** Platzhalter, die in den Texten vorkommen dürfen. */
export type TutorialVars = Partial<Record<'ort' | 'kosten' | 'chance' | 'weg' | 'quelle', string>>;

/** Woher eine Prognose stammt (0.4.19+2): Wissensstufe 0–3 der Ranch – der Text dazu steht in content/tutorial.yaml unter sources. */
export const TUTORIAL_SOURCES = ['geruecht', 'ritt', 'karte', 'bericht'] as const;
export type TutorialSource = (typeof TUTORIAL_SOURCES)[number];

export interface TutorialHint {
  id: TutorialHintId;
  step: TutorialStep;
  /** Parzellen, auf die der Hinweis zeigt – die Karte hebt sie hervor. */
  parcelIds: string[];
  action: TutorialAction;
  vars: TutorialVars;
}

export interface TutorialContent {
  title: LocalizedText;
  steps: Record<TutorialStep, LocalizedText>;
  hints: Record<TutorialHintId, LocalizedText>;
  /** Wer die Prognose stellt – je Wissensstufe (Platzhalter {quelle}). */
  sources: Record<TutorialSource, LocalizedText>;
}

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function labelOf(state: GameState, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return parcel ? parcelLabel(parcel) : parcelId;
}

/** Was der Spieler beim Geologen liest: die Mitte der angezeigten Bandbreite in %. */
export function shownChance(state: Pick<GameState, 'forecasts'>, parcelId: string): number {
  const f = state.forecasts[parcelId];
  return f ? forecastMid(f) : 0;
}

function chanceText(state: GameState, parcelId: string): string {
  const f = state.forecasts[parcelId];
  return f ? formatForecast(f) : '–';
}

/** Wissensstufe der Ranch als Quelle der Prognose (Ritt, Karte des Geologen, Bohrbericht). */
function sourceOf(state: GameState, parcelId: string): TutorialSource {
  return TUTORIAL_SOURCES[Math.max(0, Math.min(3, knowledgeOf(state, parcelId).level))];
}

/**
 * Laufen die Hinweise noch? Nein, wenn das Kapitel vorbei ist, wenn die Runde
 * nach tutorial.lastRound liegt oder wenn eine eigene Quelle schon
 * tutorial.endAfterProducedRounds Runden gefördert hat – dann war die erste
 * Verkaufsrunde schon da.
 */
export function tutorialActive(state: GameState, balance: Balance): boolean {
  if (state.finished || state.round > balance.tutorial.lastRound) return false;
  return !state.wells.some(
    (w) => w.status === 'found' && (w.production?.roundsProduced ?? 0) >= balance.tutorial.endAfterProducedRounds,
  );
}

/**
 * Wie der Einstieg eine Parzelle bewertet: Schätzung des Geologen (Mitte, in %)
 * minus Kosten, je tutorial.dollarsPerPoint $ ein Prozentpunkt. So rät er nicht
 * zu einer teuren Pacht, die kaum besser aussieht – das gesparte Geld reicht
 * für eine weitere Bohrung (Frühes Öl, 0.4.4+).
 */
export function recommendScore(state: Pick<GameState, 'forecasts'>, balance: Balance, parcelId: string, cost: number): number {
  return shownChance(state, parcelId) - cost / balance.tutorial.dollarsPerPoint;
}

/**
 * Die Parzelle, die der Einstieg empfiehlt: eigene Optionen (Bonus) und freie
 * Parzellen (Pachtbonus), die sich zusammen mit der ersten Bohrstufe bezahlen
 * lassen – davon die beste Wertung (recommendScore), bei Gleichstand die
 * billigere, dann die Option, dann nach Name.
 */
export function recommendedParcel(
  state: GameState,
  balance: Balance,
  budget = state.cash,
): { parcelId: string; kind: 'exercise' | 'lease'; cost: number } | null {
  // Der Probelauf rechnet mit dem Budget als Kasse – so passt auch, was erst mit Kredit geht.
  const probe = budget === state.cash ? state : { ...state, cash: budget };
  const drill = stageCost(balance, 1);
  const kandidaten: { parcelId: string; kind: 'exercise' | 'lease'; cost: number }[] = [];
  for (const parcel of state.parcels) {
    if (parcel.discovery) continue;
    const option = optionOf(state, parcel.id);
    if (option?.holder === 'jacob') {
      if (exerciseOption(probe, balance, parcel.id).ok && option.bonus + drill <= budget) {
        kandidaten.push({ parcelId: parcel.id, kind: 'exercise', cost: option.bonus });
      }
      continue;
    }
    if (option) continue;
    const bonus = leaseTerms(state, balance, parcel.id).bonus;
    if (bonus + drill <= budget && buyLease(probe, balance, parcel.id).ok) {
      kandidaten.push({ parcelId: parcel.id, kind: 'lease', cost: bonus });
    }
  }
  kandidaten.sort(
    (a, b) =>
      recommendScore(state, balance, b.parcelId, b.cost) - recommendScore(state, balance, a.parcelId, a.cost) ||
      a.cost - b.cost ||
      (a.kind === b.kind ? 0 : a.kind === 'exercise' ? -1 : 1) ||
      a.parcelId.localeCompare(b.parcelId),
  );
  return kandidaten[0] ?? null;
}

/**
 * Etappe 1: Ranch für einen Ritt übers Land, wenn die beste bezahlbare Empfehlung
 * unter tutorial.exploreBelow liegt (oder es keine gibt) und der Ritt ohne Überstunden
 * in die Runde passt – sonst null.
 */
function exploreSuggestion(state: GameState, balance: Balance, ziel: { parcelId: string } | null): string | null {
  if (ziel && shownChance(state, ziel.parcelId) >= balance.tutorial.exploreBelow) return null;
  const termine = balance.plans.cards.ritt?.appointments ?? 0;
  if (state.sick > 0 || state.agenda.used + termine > state.agenda.budget) return null;
  const ziel2 = suggestRide(state, balance, state.cash + headroom(state, balance) - stageCost(balance, 1));
  return ziel2 && bookCard(state, balance, [], 'ritt', ziel2).ok ? ziel2 : null;
}

/**
 * Kredit, der fehlendes Geld deckt: mindestens der kleinste Bankkredit, auf
 * tutorial.loanRounding aufgerundet. null, wenn die Bank ihn nicht gibt.
 */
function loanFor(state: GameState, balance: Balance, need: number): number | null {
  const step = balance.tutorial.loanRounding;
  const amount = Math.max(balance.credit.minLoan, Math.ceil(need / step) * step);
  return takeLoan(state, balance, amount).ok ? amount : null;
}

/** Das Transportmittel, bei dem je Barrel am meisten übrig bleibt und das noch Platz hat. */
function bestSale(state: GameState, balance: Balance): { mode: TransportMode; barrels: number } | null {
  const tank = Math.floor(state.oilStock);
  if (tank < 1) return null;
  const modes = TRANSPORT_MODES.filter((m) => netPrice(state, balance, m) > 0 && capacityLeft(state, balance, m) >= 1).sort(
    (a, b) => netPrice(state, balance, b) - netPrice(state, balance, a),
  );
  for (const mode of modes) {
    const barrels = Math.min(tank, capacityLeft(state, balance, mode));
    if (sellOil(state, balance, mode, barrels).ok) return { mode, barrels };
  }
  return null;
}

function hint(
  id: TutorialHintId,
  step: TutorialStep,
  action: TutorialAction,
  parcelIds: string[] = [],
  vars: TutorialVars = {},
): TutorialHint {
  return { id, step, action, parcelIds, vars };
}

/** Rat für eine Bohrung, die auf Jacob wartet: tiefer, bergen oder aufgeben. */
function wellHint(state: GameState, balance: Balance, well: Well): TutorialHint {
  const ort = labelOf(state, well.parcelId);
  const ids = [well.parcelId];
  if (well.status === 'stuck') {
    const kosten = money(balance.drilling.fishingCost);
    return fishWell(state, balance, well.parcelId).ok
      ? hint('fish', 'drill', { kind: 'fish', parcelId: well.parcelId }, ids, { ort, kosten })
      : hint('fish_abandon', 'drill', { kind: 'abandon', parcelId: well.parcelId }, ids, { ort });
  }
  const tiefer =
    well.stage < balance.drilling.stages.length &&
    shownChance(state, well.parcelId) >= balance.tutorial.deeperMinChance &&
    drillDeeper(state, balance, well.parcelId).ok;
  if (tiefer) {
    const kosten = money(stageCost(balance, well.stage + 1));
    return hint('deeper', 'drill', { kind: 'deeper', parcelId: well.parcelId }, ids, {
      ort,
      kosten,
      chance: chanceText(state, well.parcelId),
    });
  }
  return hint('abandon', 'drill', { kind: 'abandon', parcelId: well.parcelId }, ids, { ort });
}

/**
 * Der Hinweis für jetzt, oder null, wenn der Einstieg vorbei ist. Die erste
 * passende Regel gewinnt:
 * 1. Eine Bohrung wartet auf Jacob (klemmt oder ist in dieser Stufe trocken).
 * 2. Öl im Tank, das heute noch verkauft werden kann.
 * 3. Der Turm bohrt – Runde beenden.
 * 4. Eine eigene Quelle gibt es schon: verkauft (diese Runde) oder warten.
 * 5. Eine eigene, ungebohrte Pacht: bohren – fehlt Geld, erst ein Kredit.
 * 6. Sieht nichts Bezahlbares gut aus: erst übers Land reiten (Etappe 1).
 * 7. Sonst: die empfohlene Parzelle pachten oder die Option einlösen – fehlt
 *    Geld für Pacht und erste Bohrstufe, erst ein Kredit bei der Bank.
 */
export function tutorialHint(state: GameState, balance: Balance): TutorialHint | null {
  if (!tutorialActive(state, balance)) return null;
  const end: TutorialAction = { kind: 'endRound' };

  const wartet = state.wells.find((w) => w.status === 'decision' || w.status === 'stuck');
  if (wartet) return wellHint(state, balance, wartet);

  const verkauf = bestSale(state, balance);
  if (verkauf) {
    return hint('sell', 'sell', { kind: 'sell', ...verkauf }, [], { weg: balance.transport[verkauf.mode].label });
  }

  const bohrt = state.wells.find((w) => w.status === 'drilling');
  if (bohrt) return hint('drill_wait', 'drill', end, [bohrt.parcelId]);

  const quelle = state.wells.find((w) => w.status === 'found');
  if (quelle) {
    const verkauft = TRANSPORT_MODES.some((m) => state.shipped[m] > 0);
    return verkauft
      ? hint('sold', 'sell', end)
      : hint('found_wait', 'drill', end, [quelle.parcelId], { ort: labelOf(state, quelle.parcelId) });
  }

  const ungebohrt = state.leases
    .filter((l) => l.holder === 'jacob' && !l.drilled && !wellOf(state, l.parcelId))
    .map((l) => l.parcelId)
    .sort((a, b) => shownChance(state, b) - shownChance(state, a) || a.localeCompare(b));
  if (ungebohrt.length > 0) {
    const kosten = money(stageCost(balance, 1));
    const bereit = ungebohrt.find((id) => startDrilling(state, balance, id).ok);
    if (bereit) return hint('drill', 'drill', { kind: 'drill', parcelId: bereit }, [bereit], { ort: labelOf(state, bereit), kosten });
    // Kein Geld für die Bohrung: Kredit, sonst verfällt die Pacht ungenutzt.
    const ort = labelOf(state, ungebohrt[0]);
    const kredit = loanFor(state, balance, stageCost(balance, 1) - state.cash);
    if (kredit !== null) {
      return hint('loan_drill', 'drill', { kind: 'loan', amount: kredit }, [ungebohrt[0]], { ort, kosten: money(kredit) });
    }
    return hint('drill_no_money', 'drill', end, [ungebohrt[0]], { ort, kosten });
  }

  const ziel = recommendedParcel(state, balance);
  // Etappe 1: Sieht nichts Bezahlbares gut aus, erst übers Land reiten – solange es ohne Überstunden geht.
  const ritt = exploreSuggestion(state, balance, ziel);
  if (ritt) return hint('explore', 'lease', { kind: 'plan', cardId: 'ritt', parcelId: ritt }, [ritt], { ort: labelOf(state, ritt) });
  if (!ziel) {
    // Mit Kredit ginge es: erst Geld bei der Bank holen, dann pachten.
    const mitKredit = recommendedParcel(state, balance, state.cash + headroom(state, balance));
    const kredit = mitKredit ? loanFor(state, balance, mitKredit.cost + stageCost(balance, 1) - state.cash) : null;
    if (mitKredit && kredit !== null) {
      return hint('loan_lease', 'lease', { kind: 'loan', amount: kredit }, [mitKredit.parcelId], {
        ort: labelOf(state, mitKredit.parcelId),
        kosten: money(kredit),
      });
    }
    return hint('lease_none', 'lease', end);
  }
  const vars = { ort: labelOf(state, ziel.parcelId), kosten: money(ziel.cost), chance: chanceText(state, ziel.parcelId), quelle: sourceOf(state, ziel.parcelId) };
  return ziel.kind === 'exercise'
    ? hint('lease_option', 'lease', { kind: 'exercise', parcelId: ziel.parcelId }, [ziel.parcelId], vars)
    : hint('lease_buy', 'lease', { kind: 'lease', parcelId: ziel.parcelId }, [ziel.parcelId], vars);
}

/** Ein fertiger Hinweis in einer Sprache. */
export interface TutorialView {
  title: string;
  /** Nummer des Schritts, ab 1. */
  stepNumber: number;
  stepCount: number;
  stepLabel: string;
  text: string;
}

/** Setzt die Platzhalter ein; unbekannte bleiben sichtbar stehen, damit man sie bemerkt. */
export function fillVars(text: string, vars: TutorialVars): string {
  return text.replace(/\{(\w+)\}/g, (ganz, name: string) => vars[name as keyof TutorialVars] ?? ganz);
}

export function viewTutorial(hintValue: TutorialHint, content: TutorialContent, lang?: Lang): TutorialView {
  return {
    title: localize(content.title, lang),
    stepNumber: TUTORIAL_STEPS.indexOf(hintValue.step) + 1,
    stepCount: TUTORIAL_STEPS.length,
    stepLabel: localize(content.steps[hintValue.step], lang),
    text: fillVars(localize(content.hints[hintValue.id], lang), {
      ...hintValue.vars,
      ...(hintValue.vars.quelle ? { quelle: localize(content.sources[hintValue.vars.quelle as TutorialSource] ?? content.sources.ritt, lang) } : {}),
    }),
  };
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ERLAUBTE_PLATZHALTER = ['ort', 'kosten', 'chance', 'weg', 'quelle'];

/** Liest content/tutorial.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseTutorialContent(file: string, text: string): { content: TutorialContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „title“, „steps“ und „hints“.');
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
    for (const t of [value.de, typeof value.en === 'string' ? value.en : '']) {
      for (const [, name] of t.matchAll(/\{(\w+)\}/g)) {
        if (!ERLAUBTE_PLATZHALTER.includes(name)) fehler(`${wo}: unbekannter Platzhalter {${name}}.`);
      }
    }
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  }

  function gruppe<K extends string>(key: string, ids: readonly K[]): Record<K, LocalizedText> | null {
    const block = (raw as Record<string, unknown>)[key];
    if (!istObjekt(block)) {
      fehler(`„${key}“ fehlt.`);
      return null;
    }
    const unbekannt = Object.keys(block).filter((k) => !(ids as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${key}: unbekannt ${unbekannt.join(', ')}. Erlaubt: ${ids.join(', ')}.`);
    const out: Partial<Record<K, LocalizedText>> = {};
    for (const id of ids) {
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
  const steps = gruppe('steps', TUTORIAL_STEPS);
  const hints = gruppe('hints', TUTORIAL_HINT_IDS);
  const sources = gruppe('sources', TUTORIAL_SOURCES);
  if (errors.length > 0 || !title || !steps || !hints || !sources) return { content: null, errors };
  return { content: { title, steps, hints, sources }, errors };
}
