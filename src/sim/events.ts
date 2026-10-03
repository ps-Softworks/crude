// Ereignis-System (2.1): Ereignisse stehen als YAML in content/events/ – mit
// Bedingungen, wann sie kommen dürfen, einer Chance je Runde und Wahlmöglichkeiten
// mit Effekten. Hier stehen die Regeln: welche Ereignisse auf den Schreibtisch
// kommen, was eine Wahl bewirkt und was passiert, wenn Jacob nicht antwortet.
//
// Ereignisse würfeln mit einem eigenen Zufall (events.rng), abgeleitet vom Seed.
// Der Weltzufall (state.rng) bleibt unberührt – Karte, Bohrungen und Markt sind
// mit und ohne Ereignisse gleich.

import { sharpReason, spendAppointments, timeReason, overtimeFor } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import { deskDocument, forgeryFound, isForged, rollDocument, type DeskDocument, type DocState, type DocumentDef } from './documents';
import { applyFamilyEffects } from './family';
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
export const EFFECT_KEYS = ['cash', 'oilStock', 'railTariff', 'strength', 'ruth', 'thomas'] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type Effects = Partial<Record<EffectKey, number>>;

/**
 * Posteingang (2.4, GDD §3): die vier Briefarten. Ein Ereignis mit mail ist ein
 * Brief – er kommt mit der Post, hat eine Frist und zählt für die Briefarten-Garantie.
 * Ereignisse ohne mail sind Besuche und Vorfälle am Schreibtisch wie bisher.
 */
export const MAIL_KINDS = ['offer', 'demand', 'info', 'personal'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

/** Rivalen (2.8, GDD §9.2): Wer hinter einem Ereignis steckt. */
export const RIVAL_IDS = ['crane', 'thorne', 'bullard'] as const;
export type RivalId = (typeof RIVAL_IDS)[number];

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
  /** Dokumentenprüfung (2.5): Diese Wahl geht nur, wenn Jacob die Fälschung gefunden hat. */
  requiresFound?: boolean;
  /** Dokumentenprüfung (2.5): Merkzeichen, die nur gesetzt werden, wenn das Dokument gefälscht war – die verdeckte Folge. */
  marksIfForged?: string[];
  /** Beste Antwort (2.7): fehlt, solange Jacob erschöpft ist (Kraft unter agenda.errorsBelow). */
  sharp?: boolean;
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
  /** Briefart (2.4): Angebot, Forderung, Information oder Persönliches. Fehlt sie, ist es kein Brief. */
  mail?: MailKind;
  /**
   * Frist in Runden (2.4): so lange bleibt ein Brief im Posteingang, bevor die
   * Standard-Wahl gilt. Fehlt sie, gilt events.mail.deadlineRounds; andere Ereignisse 1.
   */
  deadline?: number;
  /** Dokumentenprüfung (2.5): ein Dokument zum Prüfen, z. B. eine Pachturkunde. */
  document?: DocumentDef;
  /**
   * Sicher (2.8): kommt ohne Würfeln, sobald Bedingungen und Merkzeichen stimmen,
   * und zählt nicht gegen events.maxPerRound bzw. events.mail.maxPerRound. Für
   * Züge der Rivalen, die in jeder Partie kommen müssen.
   */
  certain?: boolean;
  /** Rivale hinter dem Ereignis (2.8). */
  rival?: RivalId;
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
  /** Frist (2.4): letzte Runde, in der ein offenes Ereignis noch beantwortet werden kann. Fehlt der Eintrag: diese Runde. */
  due: Record<string, number>;
  /** Runde, in der zuletzt ein Brief dieser Art kam (2.4) – für die Briefarten-Garantie. */
  lastMail: Partial<Record<MailKind, number>>;
  /** Dokumente der offenen Ereignisse (2.5): echt oder gefälscht, was die Lupe schon geprüft hat. */
  docs: Record<string, DocState>;
}

export function newEventsState(seed: string): EventsState {
  return { rng: seedFromString(`${seed}:ereignisse`), pending: [], seen: [], marks: {}, due: {}, lastMail: {}, docs: {} };
}

/** Frist eines Ereignisses in Runden (2.4): Briefe nach balance.yaml, alles andere eine Runde. */
export function deadlineOf(event: Pick<EventDef, 'mail' | 'deadline'>, balance: Balance): number {
  return event.deadline ?? (event.mail ? balance.events.mail.deadlineRounds : 1);
}

/** Letzte Runde, in der ein offenes Ereignis noch beantwortet werden kann (2.4). */
export function dueRound(state: Pick<GameState, 'round' | 'events'>, eventId: string): number {
  return state.events.due[eventId] ?? state.round;
}

/** Rotes Siegel (2.4): Läuft die Frist in dieser Runde ab? */
export function isUrgent(state: Pick<GameState, 'round' | 'events'>, eventId: string): boolean {
  return dueRound(state, eventId) <= state.round;
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

/**
 * Effekte auf den Zustand anwenden. Öl und Tarif fallen nie unter null, Kraft
 * bleibt zwischen 0 und dem Höchstwert. ruth/thomas ändern die Beziehung (2.7);
 * was der Familie guttut, zählt als Familienzeit.
 */
export function applyEffects(state: GameState, effects: Effects): GameState {
  return applyFamilyEffects(applyWorldEffects(state, effects), effects.ruth, effects.thomas);
}

function applyWorldEffects(state: GameState, effects: Effects): GameState {
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
  return (
    foundReason(state, event, choice) ??
    (choice.sharp ? sharpReason(state, balance) : null) ??
    unmetReason(state, choice.requires) ??
    timeReason(state, balance, choiceCost(event, choice))
  );
}

/** Dokumentenprüfung (2.5): gesperrt, solange keine Fälschung gefunden ist. */
function foundReason(state: Pick<GameState, 'events'>, event: EventDef, choice: EventChoice): string | null {
  return choice.requiresFound && !forgeryFound(state, event.id) ? 'Dafür muss die Lupe erst eine Fälschung finden.' : null;
}

/** Ist eine Wahl ohne Blick auf die Termine möglich? Bedingungen und Dokumentenprüfung. */
function waehlbar(state: GameState, event: EventDef, choice: EventChoice): boolean {
  return foundReason(state, event, choice) === null && unmetReason(state, choice.requires) === null;
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
  const due = { ...state.events.due };
  const docs = { ...state.events.docs };
  const log = [...state.log];
  let neu = 0;
  // Sichere Ereignisse (2.8) zuerst: ohne Würfel, ohne Platz in maxPerRound.
  const sicher = catalog.filter((e) => e.certain && !e.routine && !e.mail);
  for (const event of [...sicher, ...catalog.filter((e) => !e.certain)]) {
    if (!event.certain && neu >= balance.events.maxPerRound) break;
    // Feste Termine (2.3) werden nicht gewürfelt, Briefe kommen mit der Post (2.4).
    if (event.routine || event.mail) continue;
    if (pending.includes(event.id)) continue;
    if (event.once && seen.includes(event.id)) continue;
    if (!conditionsMet(state, event.conditions)) continue;
    if (!marksMet(state, event)) continue;
    if (!event.certain && rng.float() >= event.chance) continue;
    pending.push(event.id);
    if (!seen.includes(event.id)) seen.push(event.id);
    due[event.id] = state.round + deadlineOf(event, balance) - 1;
    const doc = rollDocument(event, balance, rng);
    if (doc) docs[event.id] = doc;
    log.push(`${formatDate(state)}: Auf dem Schreibtisch: ${localize(event.title, lang)}.`);
    if (!event.certain) neu++;
  }
  return drawMail({ ...state, log, events: { ...state.events, rng: rng.state, pending, seen, due, docs } }, balance, catalog, lang);
}

/** Kann dieser Brief jetzt kommen? Bedingungen, Merkzeichen, nicht schon im Posteingang, bei once noch nie gekommen. */
function briefMoeglich(state: GameState, event: EventDef): boolean {
  return (
    event.mail !== undefined &&
    !event.routine &&
    !state.events.pending.includes(event.id) &&
    !(event.once && state.events.seen.includes(event.id)) &&
    conditionsMet(state, event.conditions) &&
    marksMet(state, event)
  );
}

/** Briefarten, für die die Post fällig ist: länger als events.mail.guaranteeRounds keine – die am längsten wartende zuerst. */
export function dueMailKinds(state: Pick<GameState, 'round' | 'events'>, balance: Balance): MailKind[] {
  const zuletzt = (k: MailKind) => state.events.lastMail[k] ?? 0;
  return MAIL_KINDS.filter((k) => state.round - zuletzt(k) >= balance.events.mail.guaranteeRounds).sort(
    (a, b) => zuletzt(a) - zuletzt(b),
  );
}

/**
 * Posteingang (2.4): Höchstens events.mail.maxPerRound neue Briefe je Runde.
 * Zuerst die Garantie: Kam von einer Briefart seit guaranteeRounds Runden keiner,
 * bringt die Post einen davon (zufällig unter denen, die gerade kommen können).
 * Danach würfeln die übrigen Briefe mit ihrer Chance, in der Reihenfolge des
 * Katalogs. Jeder Brief bekommt seine Frist.
 */
export function drawMail(state: GameState, balance: Balance, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): GameState {
  if (state.finished || !catalog.some((e) => e.mail)) return state;
  const rng = new Rng(state.events.rng);
  let out = state;
  let neu = 0;
  const zustellen = (event: EventDef) => {
    const ev = out.events;
    const doc = rollDocument(event, balance, rng);
    out = {
      ...out,
      log: [...out.log, `${formatDate(out)}: Im Posteingang: ${localize(event.title, lang)}.`],
      events: {
        ...ev,
        pending: [...ev.pending, event.id],
        seen: ev.seen.includes(event.id) ? ev.seen : [...ev.seen, event.id],
        due: { ...ev.due, [event.id]: out.round + deadlineOf(event, balance) - 1 },
        lastMail: { ...ev.lastMail, [event.mail!]: out.round },
        docs: doc ? { ...ev.docs, [event.id]: doc } : ev.docs,
      },
    };
    if (!event.certain) neu++;
  };
  // Sichere Briefe (2.8) zuerst: ohne Würfel, ohne Platz in maxPerRound.
  for (const event of catalog) {
    if (event.certain && briefMoeglich(out, event)) zustellen(event);
  }
  for (const kind of dueMailKinds(out, balance)) {
    if (neu >= balance.events.mail.maxPerRound) break;
    const moeglich = catalog.filter((e) => e.mail === kind && briefMoeglich(out, e));
    if (moeglich.length > 0) zustellen(rng.pick(moeglich));
  }
  for (const event of catalog) {
    if (neu >= balance.events.mail.maxPerRound) break;
    if (event.certain || !briefMoeglich(out, event)) continue;
    if (rng.float() >= event.chance) continue;
    zustellen(event);
  }
  return { ...out, events: { ...out.events, rng: rng.state } };
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
  const reason = foundReason(state, event, choice) ?? (choice.sharp ? sharpReason(state, balance) : null) ?? unmetReason(state, choice.requires);
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
  // Dokumentenprüfung (2.5): War das Dokument gefälscht, keimt die verdeckte Folge.
  const gesetzt = isForged(state, event.id) ? [...choice.marks, ...(choice.marksIfForged ?? [])] : choice.marks;
  for (const m of gesetzt) if (marks[m] === undefined) marks[m] = state.round;
  return {
    ...nach,
    log: [...nach.log, `${formatDate(state)}: ${vorsatz}${localize(event.title, lang)} – ${localize(choice.result, lang)}`],
    events: {
      ...nach.events,
      pending: nach.events.pending.filter((id) => id !== event.id),
      marks,
      due: ohne(nach.events.due, event.id),
      docs: ohneDoc(nach.events.docs, event.id),
    },
    agenda,
  };
}

function ohneDoc(docs: Record<string, DocState>, id: string): Record<string, DocState> {
  if (!(id in docs)) return docs;
  const rest = { ...docs };
  delete rest[id];
  return rest;
}

function ohne(due: Record<string, number>, id: string): Record<string, number> {
  const rest = { ...due };
  delete rest[id];
  return rest;
}

/**
 * Am Rundenende bleibt nichts liegen, dessen Frist abläuft (2.4: Briefe mit
 * längerer Frist warten weiter im Posteingang): Für jedes offene Ereignis gilt die
 * Standard-Wahl (default: true, sonst die erste). Ist sie gesperrt, die erste
 * mögliche. Geht gar keine oder fehlt das Ereignis im Katalog, verfällt es ohne Effekt.
 * Die Standard-Wahl kostet keine Termine – sie ist ja gerade das, was ohne Jacob passiert.
 */
export function autoResolve(state: GameState, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): GameState {
  let out = state;
  for (const id of state.events.pending) {
    const event = finde(catalog, id);
    // Frist läuft noch: der Brief bleibt liegen.
    if (event && dueRound(out, id) > out.round) continue;
    const choice = event
      ? [event.choices.find((c) => c.default) ?? event.choices[0], ...event.choices].find(
          (c) => c && waehlbar(out, event, c),
        )
      : undefined;
    if (event && choice) {
      out = erledigen(out, event, choice, lang, 'Ohne Antwort: ');
    } else {
      out = {
        ...out,
        events: {
          ...out.events,
          pending: out.events.pending.filter((p) => p !== id),
          due: ohne(out.events.due, id),
          docs: ohneDoc(out.events.docs, id),
        },
      };
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
  /** Briefart (2.4), wenn es ein Brief ist. */
  mail?: MailKind;
  /** Runden bis zum Ablauf der Frist, diese mitgezählt (2.4). */
  roundsLeft: number;
  /** Rotes Siegel: die Frist läuft in dieser Runde ab (2.4). */
  urgent: boolean;
  /** Dokument zum Prüfen (2.5). */
  document?: DeskDocument;
}

function zeigen(state: GameState, balance: Balance, event: EventDef, lang: Lang): DeskEvent {
  const document = deskDocument(state, balance, event, lang);
  return {
    ...(document ? { document } : {}),
    id: event.id,
    title: localize(event.title, lang),
    text: localize(event.text, lang),
    ...(event.mail ? { mail: event.mail } : {}),
    roundsLeft: event.routine ? 1 : dueRound(state, event.id) - state.round + 1,
    urgent: !event.routine && isUrgent(state, event.id),
    choices: event.choices.map((c) => {
      const cost = choiceCost(event, c);
      const reason = choiceReason(state, balance, event, c);
      const basis = { id: c.id, label: localize(c.label, lang), cost, overtime: overtimeFor(state, cost) };
      return reason ? { ...basis, ok: false, reason } : { ...basis, ok: true };
    }),
  };
}

/** Die offenen Ereignisse (Besuche und Briefe) mit Texten in der gewünschten Sprache, Kosten in Terminen und gesperrten Wahlen. */
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

/** Nur die Briefe im Posteingang (2.4), dringende zuerst. */
export function deskMail(state: GameState, balance: Balance, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG): DeskEvent[] {
  return deskEvents(state, balance, catalog, lang)
    .filter((e) => e.mail)
    .sort((a, b) => a.roundsLeft - b.roundsLeft);
}
