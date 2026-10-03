// Ereignis-System (2.1): Ereignisse stehen als YAML in content/events/ – mit
// Bedingungen, wann sie kommen dürfen, einer Chance je Runde und Wahlmöglichkeiten
// mit Effekten. Hier stehen die Regeln: welche Ereignisse auf den Schreibtisch
// kommen, was eine Wahl bewirkt und was passiert, wenn Jacob nicht antwortet.
//
// Ereignisse würfeln mit einem eigenen Zufall (events.rng), abgeleitet vom Seed.
// Der Weltzufall (state.rng) bleibt unberührt – Karte, Bohrungen und Markt sind
// mit und ohne Ereignisse gleich.

import { spendAppointments, timeReason, overtimeFor } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { DEFAULT_LANG, localize, type Lang, type LocalizedText } from './i18n';
import { Rng, seedFromString, type RngState } from './rng';

/** Bedingungen: jede ist eine Untergrenze (min…) oder Obergrenze (max…). */
export const CONDITION_KEYS = [
  'minRound',
  'maxRound',
  'minCash',
  'maxCash',
  'minOilStock',
  'minProducingWells',
  'maxProducingWells',
  'minLeases',
  'minStrength',
  'maxStrength',
] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];
export type Conditions = Partial<Record<ConditionKey, number>>;

/** Effekte: Zahlen, die auf den Zustand addiert werden (negativ = abziehen). */
export const EFFECT_KEYS = ['cash', 'oilStock', 'railTariff', 'strength'] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type Effects = Partial<Record<EffectKey, number>>;

export interface EventChoice {
  id: string;
  /** Was auf dem Knopf steht. */
  label: LocalizedText;
  /** Was danach ins Protokoll kommt. */
  result: LocalizedText;
  /** Ohne diese Bedingungen ist die Wahl gesperrt (z. B. genug Geld). */
  requires: Conditions;
  effects: Effects;
  /** Diese Wahl gilt, wenn Jacob die Runde beendet, ohne zu antworten. */
  default: boolean;
  /** Merkzeichen, die diese Wahl setzt – für Nachwirkungen in späteren Ereignissen (2.2). */
  marks: string[];
  /** Termine, die diese Wahl kostet (2.3); fehlt die Angabe, gilt die des Ereignisses. */
  appointments?: number;
}

export interface EventDef {
  id: string;
  title: LocalizedText;
  text: LocalizedText;
  /** Nur wenn alle Bedingungen stimmen, kann das Ereignis kommen. */
  conditions: Conditions;
  /** Chance je Runde (0–1), sobald die Bedingungen stimmen. */
  chance: number;
  /** Kommt höchstens einmal je Partie. */
  once: boolean;
  /** Nachwirkung (2.2): Kommt nur, wenn alle diese Merkzeichen gesetzt sind … */
  marked: string[];
  /** … und keins von diesen. */
  notMarked: string[];
  /** Frühestens so viele Runden, nachdem das letzte nötige Merkzeichen gesetzt wurde. */
  delay: number;
  /**
   * Fester Termin (2.3): wird nicht gewürfelt, sondern steht jede Runde im
   * Terminkalender, solange die Bedingungen stimmen – einmal je Runde. Bleibt er
   * liegen, passiert nichts.
   */
  routine: boolean;
  /** Termine, die eine Antwort kostet (2.3), sofern die Wahl nichts anderes sagt. */
  appointments: number;
  choices: EventChoice[];
}

export interface EventsState {
  /** Eigener Zufall der Ereignisse. */
  rng: RngState;
  /** Ereignisse auf dem Schreibtisch, die auf eine Antwort warten (IDs). */
  pending: string[];
  /** Ereignisse, die in dieser Partie schon gekommen sind (IDs). */
  seen: string[];
  /** Gesetzte Merkzeichen (2.2) mit der Runde, in der sie gesetzt wurden. Verdeckt – nicht im Protokoll. */
  marks: Record<string, number>;
}

export function newEventsState(seed: string): EventsState {
  return { rng: seedFromString(`${seed}:ereignisse`), pending: [], seen: [], marks: {} };
}

/**
 * Nachwirkung (2.2): Sind alle nötigen Merkzeichen gesetzt, keins der
 * verbotenen, und ist seit dem letzten nötigen genug Zeit vergangen?
 */
export function marksMet(state: Pick<GameState, 'round' | 'events'>, event: Pick<EventDef, 'marked' | 'notMarked' | 'delay'>): boolean {
  const marks = state.events.marks;
  if (event.notMarked.some((m) => marks[m] !== undefined)) return false;
  if (event.marked.length === 0) return true;
  if (event.marked.some((m) => marks[m] === undefined)) return false;
  const zuletzt = Math.max(...event.marked.map((m) => marks[m]));
  return state.round >= zuletzt + event.delay;
}

type Lage = Pick<GameState, 'round' | 'cash' | 'oilStock' | 'wells' | 'leases' | 'strength'>;

/** Der Wert im Zustand, den eine Bedingung prüft. */
function wertFuer(state: Lage, key: ConditionKey): number {
  switch (key) {
    case 'minRound':
    case 'maxRound':
      return state.round;
    case 'minCash':
    case 'maxCash':
      return state.cash;
    case 'minOilStock':
      return state.oilStock;
    case 'minProducingWells':
    case 'maxProducingWells':
      return state.wells.filter((w) => w.status === 'found').length;
    case 'minLeases':
      return state.leases.filter((l) => l.holder === 'jacob').length;
    case 'minStrength':
    case 'maxStrength':
      return state.strength;
  }
}

function erfuellt(state: Lage, key: ConditionKey, grenze: number): boolean {
  const wert = wertFuer(state, key);
  return key.startsWith('min') ? wert >= grenze : wert <= grenze;
}

/** Stimmen alle Bedingungen? Keine Bedingung = immer. */
export function conditionsMet(state: Lage, conditions: Conditions): boolean {
  return CONDITION_KEYS.every((key) => conditions[key] === undefined || erfuellt(state, key, conditions[key]!));
}

function grund(key: ConditionKey, grenze: number): string {
  switch (key) {
    case 'minCash':
      return `Dafür fehlt das Geld (${grenze.toLocaleString('de-DE')} $ nötig).`;
    case 'minOilStock':
      return `Dafür fehlt Öl im Tank (${grenze.toLocaleString('de-DE')} bbl nötig).`;
    case 'minProducingWells':
      return 'Dafür braucht es eine fördernde Quelle.';
    case 'minLeases':
      return 'Dafür braucht es eine eigene Pacht.';
    case 'minStrength':
      return 'Dafür fehlt Jacob die Kraft.';
    default:
      return 'Das geht gerade nicht.';
  }
}

/** Warum eine Wahl gesperrt ist, oder null, wenn sie geht. */
export function unmetReason(state: Lage, conditions: Conditions): string | null {
  const key = CONDITION_KEYS.find((k) => conditions[k] !== undefined && !erfuellt(state, k, conditions[k]!));
  return key === undefined ? null : grund(key, conditions[key]!);
}

/** Cent-genau runden, wie beim Bahntarif. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Effekte auf den Zustand anwenden. Öl und Tarif fallen nie unter null, Kraft bleibt zwischen 0 und dem Höchstwert. */
export function applyEffects(state: GameState, effects: Effects): GameState {
  let { cash, oilStock, royaltyOil, railTariff, strength } = state;
  if (effects.cash !== undefined) cash += effects.cash;
  if (effects.oilStock !== undefined) {
    oilStock = Math.max(0, oilStock + effects.oilStock);
    // Das Öl der Landbesitzer kann nicht mehr sein als das im Tank.
    royaltyOil = Math.min(royaltyOil, oilStock);
  }
  if (effects.railTariff !== undefined) railTariff = Math.max(0, cents(railTariff + effects.railTariff));
  if (effects.strength !== undefined) strength = Math.min(state.strengthMax, Math.max(0, strength + effects.strength));
  return { ...state, cash, oilStock, royaltyOil, railTariff, strength };
}

function finde(catalog: readonly EventDef[], id: string): EventDef | undefined {
  return catalog.find((e) => e.id === id);
}

/** Termine, die eine Wahl kostet (2.3). */
export function choiceCost(event: Pick<EventDef, 'appointments'>, choice: Pick<EventChoice, 'appointments'>): number {
  return choice.appointments ?? event.appointments;
}

/** Steht dieser feste Termin gerade im Kalender? Bedingungen und Merkzeichen stimmen, diese Runde noch nicht wahrgenommen. */
export function routineOffered(state: GameState, event: EventDef): boolean {
  return (
    event.routine &&
    !state.finished &&
    !state.agenda.done.includes(event.id) &&
    conditionsMet(state, event.conditions) &&
    marksMet(state, event)
  );
}

/** Warum eine Wahl gerade nicht geht – Bedingung oder Zeit –, oder null. */
export function choiceReason(state: GameState, balance: Balance, event: EventDef, choice: EventChoice): string | null {
  return unmetReason(state, choice.requires) ?? timeReason(state, balance, choiceCost(event, choice));
}

/**
 * Würfelt die Ereignisse der laufenden Runde: Jedes Ereignis, dessen
 * Bedingungen stimmen, das nicht schon wartet und (bei once) noch nicht kam,
 * kommt mit seiner Chance – in der Reihenfolge des Katalogs, höchstens
 * balance.events.maxPerRound neue je Runde. Nur Ereignisse, die in Frage kommen,
 * ziehen eine Zufallszahl.
 */
export function drawEvents(state: GameState, balance: Balance, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): GameState {
  if (state.finished || catalog.length === 0) return state;
  const rng = new Rng(state.events.rng);
  const pending = [...state.events.pending];
  const seen = [...state.events.seen];
  const log = [...state.log];
  let neu = 0;
  for (const event of catalog) {
    if (neu >= balance.events.maxPerRound) break;
    // Feste Termine (2.3) werden nicht gewürfelt.
    if (event.routine) continue;
    if (pending.includes(event.id)) continue;
    if (event.once && seen.includes(event.id)) continue;
    if (!conditionsMet(state, event.conditions)) continue;
    if (!marksMet(state, event)) continue;
    if (rng.float() >= event.chance) continue;
    pending.push(event.id);
    if (!seen.includes(event.id)) seen.push(event.id);
    log.push(`${formatDate(state)}: Auf dem Schreibtisch: ${localize(event.title, lang)}.`);
    neu++;
  }
  return { ...state, log, events: { ...state.events, rng: rng.state, pending, seen } };
}

export type EventResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Jacob antwortet auf ein Ereignis oder nimmt einen festen Termin wahr: Die
 * Wahl muss möglich sein und es müssen genug Termine frei sein (2.3). Dann
 * werden die Termine belegt (Überstunden kosten Kraft), die Effekte wirken,
 * das Ergebnis kommt ins Protokoll und das Ereignis ist erledigt.
 */
export function resolveEvent(
  state: GameState,
  balance: Balance,
  catalog: readonly EventDef[],
  eventId: string,
  choiceId: string,
  lang: Lang = DEFAULT_LANG,
): EventResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist zu Ende.' };
  const event = finde(catalog, eventId);
  const daDa = event && (event.routine ? routineOffered(state, event) : state.events.pending.includes(eventId));
  if (!event || !daDa) return { ok: false, reason: 'Dieses Ereignis liegt nicht auf dem Schreibtisch.' };
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Diese Antwort gibt es nicht.' };
  const reason = unmetReason(state, choice.requires);
  if (reason) return { ok: false, reason };
  const belegt = spendAppointments(state, balance, choiceCost(event, choice));
  if (!belegt.ok) return belegt;
  return { ok: true, state: erledigen(belegt.state, event, choice, lang, '') };
}

function erledigen(state: GameState, event: EventDef, choice: EventChoice, lang: Lang, vorsatz: string): GameState {
  const nach = applyEffects(state, choice.effects);
  const agenda = event.routine ? { ...nach.agenda, done: [...nach.agenda.done, event.id] } : nach.agenda;
  // Merkzeichen behalten die Runde, in der sie zuerst gesetzt wurden.
  const marks = { ...nach.events.marks };
  for (const m of choice.marks) if (marks[m] === undefined) marks[m] = state.round;
  return {
    ...nach,
    log: [...nach.log, `${formatDate(state)}: ${vorsatz}${localize(event.title, lang)} – ${localize(choice.result, lang)}`],
    events: { ...nach.events, pending: nach.events.pending.filter((id) => id !== event.id), marks },
    agenda,
  };
}

/**
 * Am Rundenende bleibt nichts liegen: Für jedes offene Ereignis gilt die
 * Standard-Wahl (default: true, sonst die erste). Ist sie gesperrt, die erste
 * mögliche. Geht gar keine oder fehlt das Ereignis im Katalog, verfällt es ohne Effekt.
 * Die Standard-Wahl kostet keine Termine – sie ist ja gerade das, was ohne Jacob passiert.
 */
export function autoResolve(state: GameState, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): GameState {
  let out = state;
  for (const id of state.events.pending) {
    const event = finde(catalog, id);
    const choice = event
      ? [event.choices.find((c) => c.default) ?? event.choices[0], ...event.choices].find(
          (c) => c && unmetReason(out, c.requires) === null,
        )
      : undefined;
    if (event && choice) {
      out = erledigen(out, event, choice, lang, 'Ohne Antwort: ');
    } else {
      out = { ...out, events: { ...out.events, pending: out.events.pending.filter((p) => p !== id) } };
    }
  }
  return out;
}

/** Eine Antwort, wie der Schreibtisch sie zeigt. */
export interface DeskChoice {
  id: string;
  label: string;
  /** Termine, die sie kostet (2.3). */
  cost: number;
  /** Wie viele davon Überstunden wären. */
  overtime: number;
  ok: boolean;
  reason?: string;
}

/** Ein offenes Ereignis oder ein fester Termin, wie der Schreibtisch es zeigt. */
export interface DeskEvent {
  id: string;
  title: string;
  text: string;
  choices: DeskChoice[];
}

function zeigen(state: GameState, balance: Balance, event: EventDef, lang: Lang): DeskEvent {
  return {
    id: event.id,
    title: localize(event.title, lang),
    text: localize(event.text, lang),
    choices: event.choices.map((c) => {
      const cost = choiceCost(event, c);
      const reason = choiceReason(state, balance, event, c);
      const basis = { id: c.id, label: localize(c.label, lang), cost, overtime: overtimeFor(state, cost) };
      return reason ? { ...basis, ok: false, reason } : { ...basis, ok: true };
    }),
  };
}

/** Die offenen Ereignisse mit Texten in der gewünschten Sprache, Kosten in Terminen und gesperrten Wahlen. */
export function deskEvents(state: GameState, balance: Balance, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): DeskEvent[] {
  return state.events.pending.flatMap((id) => {
    const event = finde(catalog, id);
    return event ? [zeigen(state, balance, event, lang)] : [];
  });
}

/** Die festen Termine, die in dieser Runde noch im Kalender stehen (2.3). */
export function deskRoutines(state: GameState, balance: Balance, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): DeskEvent[] {
  return catalog.filter((e) => routineOffered(state, e)).map((e) => zeigen(state, balance, e, lang));
}
