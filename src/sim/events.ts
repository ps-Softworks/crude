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
import { recordAct } from './politics';
import { openRegions, unlockRegion } from './regions';
import type { PublicAct } from './world';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf } from './stocks'; // gemeinsamer Kapitel-Helfer aller Phase-4-Systeme (state.chapter, sonst 1)

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
  // Kapitel (Phase 4, Inhalte für Kapitel 2/3): Ereignisse späterer Kapitel tragen
  // minChapter/maxChapter, damit sie nie in Kapitel 1 erscheinen. Fehlt state.chapter, gilt Kapitel 1.
  'minChapter',
  'maxChapter',
] as const;
export type ConditionKey = (typeof CONDITION_KEYS)[number];
export type Conditions = Partial<Record<ConditionKey, number>>;

/** Effekte: Zahlen, die auf den Zustand addiert werden (negativ = abziehen). */
export const EFFECT_KEYS = ['cash', 'oilStock', 'railTariff', 'strength', 'ruth', 'thomas', 'teams', 'teamsIdle', 'price', 'production', 'leaseCost'] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type Effects = Partial<Record<EffectKey, number>>;

/**
 * Befristete Nachwirkungen (0.2.15+3): gelten balance.events.timedRounds Runden,
 * die Antwortrunde mitgezählt.
 *   price       $ je Barrel, die der Crane Trust Jacob mehr (+) oder weniger (−) zahlt
 *   production  Anteil der eigenen Förderung mehr (+0,1 = 10 %) oder weniger
 *   leaseCost   Anteil am Pachtbonus mehr (+0,2 = 20 % teurer) oder weniger
 */
export const TIMED_KEYS = ['price', 'production', 'leaseCost'] as const;
export type TimedKey = (typeof TIMED_KEYS)[number];

export interface TimedEffect {
  key: TimedKey;
  value: number;
  /** Letzte Runde, in der die Wirkung gilt. */
  until: number;
  /** Ereignis, aus dem sie stammt: dasselbe Ereignis ersetzt seine eigene Wirkung, statt sie zu stapeln. */
  source: string;
}

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
  /** Gebiete (0.2.15+5): Diese Wahl schaltet Gebiete aus content/map.yaml frei. */
  unlocks?: string[];
  /** Öffentliches Handeln (4.2): Darüber redet das Land – verschiebt am Rundenende Stimmung und Parteien. */
  public?: PublicAct[];
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
  /** Karte (0.2.15+5): Figur aus content/map.yaml, um deren Ranch es geht (z. B. moss). */
  ranch?: string;
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
  /**
   * Wiederholungsschutz (2.10a): frühestens so viele Runden nach dem letzten
   * Eintreffen (des Ereignisses oder einer Variante seiner Gruppe) wieder. Fehlt er,
   * gilt events.repeatCooldown für wiederkehrende Ereignisse und Gruppen, sonst 0.
   */
  cooldown?: number;
  /** Variantengruppe (2.10a): Ereignisse derselben Gruppe halten gemeinsam Abstand. */
  group?: string;
  /** Entwurf (2.10a): Schlüsselszene, die Philipp noch überarbeiten soll. Ändert nichts am Spiel. */
  draft?: boolean;
  /** Auftritt (0.2.15+10): Figur aus content/figures.yaml, die am Schreibtisch vorspricht. Nur Darstellung. */
  visitor?: string;
  /** Auftritt (0.2.15+10): kommt als Vollbild-Szene (Geburt, Brand …). Nur Darstellung. */
  tableau?: boolean;
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
  /**
   * Wiederholungsschutz (2.10a): Runde, in der ein Ereignis (Schlüssel = ID) bzw.
   * eine Variante einer Gruppe (Schlüssel = groupKey) zuletzt eintraf.
   */
  lastSeen: Record<string, number>;
  /** Befristete Nachwirkungen (0.2.15+3). Abgelaufene fliegen beim nächsten Eintrag raus. */
  timed: TimedEffect[];
}

export function newEventsState(seed: string): EventsState {
  return { rng: seedFromString(`${seed}:ereignisse`), pending: [], seen: [], marks: {}, due: {}, lastMail: {}, docs: {}, lastSeen: {}, timed: [] };
}

/** Summe der laufenden Nachwirkungen einer Art in dieser Runde (0.2.15+3); 0, wenn keine läuft. */
export function timedEffect(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, key: TimedKey): number {
  const liste = state.events?.timed ?? [];
  let sum = 0;
  for (const t of liste) if (t.key === key && t.until >= state.round) sum += t.value;
  return Math.round(sum * 10000) / 10000;
}

/** Runden, die die längste laufende Nachwirkung dieser Art noch gilt (diese mitgezählt); 0 = keine. */
export function timedRoundsLeft(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, key: TimedKey): number {
  const liste = (state.events?.timed ?? []).filter((t) => t.key === key && t.until >= state.round);
  return liste.length === 0 ? 0 : Math.max(...liste.map((t) => t.until)) - state.round + 1;
}

/** Trägt die befristeten Wirkungen einer Antwort ein (0.2.15+3). */
function addTimed(state: GameState, effects: Effects, source: string, rounds: number): GameState {
  const neu = TIMED_KEYS.filter((k) => effects[k] !== undefined && effects[k] !== 0);
  if (neu.length === 0) return state;
  const until = state.round + rounds - 1;
  const behalten = (state.events.timed ?? []).filter((t) => t.until >= state.round && !(t.source === source && neu.includes(t.key)));
  const timed = [...behalten, ...neu.map((key) => ({ key, value: effects[key]!, until, source }))];
  return { ...state, events: { ...state.events, timed } };
}

/** Schlüssel einer Variantengruppe in lastSeen – mit @, damit er nie einer Ereignis-ID gleicht. */
export function groupKey(group: string): string {
  return `@${group}`;
}

/** Wiederholungsschutz (2.10a): Abstand in Runden, den ein Ereignis halten muss. */
export function cooldownOf(event: Pick<EventDef, 'cooldown' | 'once' | 'group'>, balance: Balance): number {
  if (event.cooldown !== undefined) return event.cooldown;
  return !event.once || event.group ? balance.events.repeatCooldown : 0;
}

/**
 * Wiederholungsschutz (2.10a): Ist der Abstand zum letzten Eintreffen des
 * Ereignisses und jeder Variante seiner Gruppe groß genug? Kam es in Runde r,
 * darf es mit cooldown c frühestens in Runde r + c wieder kommen.
 */
export function cooledDown(state: Pick<GameState, 'round' | 'events'>, event: Pick<EventDef, 'id' | 'cooldown' | 'once' | 'group'>, balance: Balance): boolean {
  const abstand = cooldownOf(event, balance);
  if (abstand <= 0) return true;
  const last = state.events.lastSeen;
  const keys = event.group ? [event.id, groupKey(event.group)] : [event.id];
  return keys.every((k) => last[k] === undefined || state.round - last[k] >= abstand);
}

/** lastSeen nach dem Eintreffen eines Ereignisses (2.10a). */
function merken(lastSeen: Record<string, number>, event: Pick<EventDef, 'id' | 'group'>, round: number): Record<string, number> {
  const out = { ...lastSeen, [event.id]: round };
  if (event.group) out[groupKey(event.group)] = round;
  return out;
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

/**
 * Zeitsprung (Phase 4): Merkzeichen gehen ins nächste Kapitel mit, gelten dort aber als „vor
 * Kapitelbeginn“ gesetzt (Runde 0). Ohne das zählte delay ab der Runde des alten Kapitels (bis 16),
 * obwohl die Runden im neuen Kapitel wieder bei 1 beginnen – ein spätes Kapitel-1-Merkzeichen
 * schöbe eine Kapitel-2-Szene weit nach hinten. Der Kapitelwechsel (Block A) ruft das auf.
 */
export function marksIntoNextChapter(events: EventsState): EventsState {
  return { ...events, marks: Object.fromEntries(Object.keys(events.marks).map((m) => [m, 0])) };
}

type Lage = Pick<GameState, 'round' | 'cash' | 'oilStock' | 'wells' | 'leases' | 'strength'> & Partial<Pick<GameState, 'chapter'>>;

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
    case 'minChapter':
    case 'maxChapter':
      return chapterOf(state);
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
export function applyEffects(state: GameState, effects: Effects, source = '', timedRounds = 1): GameState {
  return addTimed(applyFamilyEffects(applyWorldEffects(state, effects), effects.ruth, effects.thomas), effects, source, timedRounds);
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
  // Eigene Fuhrwerke (0.2.15+2): teams ändert die Zahl der Gespanne (nie unter 0),
  // teamsIdle n lässt sie bis einschließlich Runde (jetzt + n) stillstehen.
  let logistics = state.logistics;
  if (effects.teams !== undefined) logistics = { ...logistics, teams: Math.max(0, logistics.teams + effects.teams) };
  if (effects.teamsIdle !== undefined && effects.teamsIdle > 0) {
    logistics = { ...logistics, teamsIdleUntil: Math.max(logistics.teamsIdleUntil, state.round + effects.teamsIdle) };
  }
  return { ...state, cash, oilStock, royaltyOil, railTariff, strength, logistics };
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
 * Die Standardantwort (2.4): Was gilt, wenn die Frist ohne Antwort abläuft – die
 * Wahl mit default: true, sonst die erste; ist sie gesperrt, die erste mögliche.
 * undefined, wenn keine geht (dann verfällt das Ereignis ohne Effekt).
 */
export function defaultChoice(state: GameState, event: EventDef): EventChoice | undefined {
  return [event.choices.find((c) => c.default) ?? event.choices[0], ...event.choices].find((c) => c && waehlbar(state, event, c));
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
  let lastSeen = state.events.lastSeen;
  const log = [...state.log];
  let neu = 0;
  // Sichere Ereignisse (2.8) zuerst: ohne Würfel, ohne Platz in maxPerRound.
  const sicher = catalog.filter((e) => e.certain && !e.routine && !e.mail);
  // Gewürfelte Ereignisse (2.10b) in zufälliger Reihenfolge: Sonst gewinnen bei maxPerRound
  // immer die Dateien vorn im Alphabet, und späte Ereignisse kämen kaum je vor.
  const gewuerfelt = rng.shuffle(catalog.filter((e) => !e.certain && !e.routine && !e.mail));
  for (const event of [...sicher, ...gewuerfelt]) {
    if (!event.certain && neu >= balance.events.maxPerRound) break;
    // Feste Termine (2.3) werden nicht gewürfelt, Briefe kommen mit der Post (2.4).
    if (event.routine || event.mail) continue;
    if (pending.includes(event.id)) continue;
    if (event.once && seen.includes(event.id)) continue;
    if (!conditionsMet(state, event.conditions)) continue;
    if (!marksMet(state, event)) continue;
    // Wiederholungsschutz (2.10a): gilt auch für Varianten, die in dieser Runde schon kamen.
    if (!cooledDown({ round: state.round, events: { ...state.events, lastSeen } }, event, balance)) continue;
    if (!event.certain && rng.float() >= event.chance) continue;
    pending.push(event.id);
    lastSeen = merken(lastSeen, event, state.round);
    if (!seen.includes(event.id)) seen.push(event.id);
    due[event.id] = state.round + deadlineOf(event, balance) - 1;
    const doc = rollDocument(event, balance, rng);
    if (doc) docs[event.id] = doc;
    log.push(`${formatDate(state)}: Auf dem Schreibtisch: ${localize(event.title, lang)}.`);
    if (!event.certain) neu++;
  }
  return drawMail({ ...state, log, events: { ...state.events, rng: rng.state, pending, seen, due, docs, lastSeen } }, balance, catalog, lang);
}

/** Kann dieser Brief jetzt kommen? Bedingungen, Merkzeichen, nicht schon im Posteingang, bei once noch nie gekommen, Abstand (2.10a). */
function briefMoeglich(state: GameState, event: EventDef, balance: Balance): boolean {
  return (
    cooledDown(state, event, balance) &&
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
        lastSeen: merken(ev.lastSeen, event, out.round),
        docs: doc ? { ...ev.docs, [event.id]: doc } : ev.docs,
      },
    };
    if (!event.certain) neu++;
  };
  // Sichere Briefe (2.8) zuerst: ohne Würfel, ohne Platz in maxPerRound.
  for (const event of catalog) {
    if (event.certain && briefMoeglich(out, event, balance)) zustellen(event);
  }
  for (const kind of dueMailKinds(out, balance)) {
    if (neu >= balance.events.mail.maxPerRound) break;
    const moeglich = catalog.filter((e) => e.mail === kind && briefMoeglich(out, e, balance));
    if (moeglich.length > 0) zustellen(rng.pick(moeglich));
  }
  for (const event of catalog) {
    if (neu >= balance.events.mail.maxPerRound) break;
    if (event.certain || !briefMoeglich(out, event, balance)) continue;
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
  return { ok: true, state: openRegions(erledigen(belegt.state, event, choice, lang, '', balance.events.timedRounds), balance) };
}

// 4.9 Andockpunkt: Personal (src/sim/staffRound.ts) erledigt Briefe nach Richtlinie –
// ohne Jacobs Termine und unabhängig von seiner Erschöpfung (sharp gilt nicht).
/** Ist eine Wahl ohne Blick auf Termine und Kraft möglich? Bedingungen und Dokumentenprüfung. */
export function choicePossible(state: GameState, event: EventDef, choice: EventChoice): boolean {
  return waehlbar(state, event, choice);
}

/** Jemand aus dem Personal beantwortet ein offenes Ereignis; vorsatz steht vor dem Eintrag im Protokoll. */
export function resolveDelegated(
  state: GameState,
  balance: Balance,
  catalog: readonly EventDef[],
  eventId: string,
  choiceId: string,
  vorsatz: string,
  lang: Lang = DEFAULT_LANG,
): EventResult {
  const event = finde(catalog, eventId);
  if (!event || event.routine || !state.events.pending.includes(eventId)) return { ok: false, reason: 'Dieses Ereignis liegt nicht auf dem Schreibtisch.' };
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice || !waehlbar(state, event, choice)) return { ok: false, reason: 'Diese Antwort geht gerade nicht.' };
  return { ok: true, state: openRegions(erledigen(state, event, choice, lang, vorsatz, balance.events.timedRounds), balance) };
}

function erledigen(state: GameState, event: EventDef, choice: EventChoice, lang: Lang, vorsatz: string, timedRounds: number): GameState {
  // Gebiete (0.2.15+5): nur den Schalter umlegen – die Ranches kommen mit openRegions.
  const offen = (choice.unlocks ?? []).reduce(unlockRegion, state);
  // Öffentliches Handeln (4.2): wirkt am Rundenende im Weltmodell.
  const bekannt = (choice.public ?? []).reduce(recordAct, offen);
  const nach = applyEffects(bekannt, choice.effects, event.id, timedRounds);
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
 * timedRounds: Dauer befristeter Nachwirkungen (balance.events.timedRounds).
 */
export function autoResolve(state: GameState, catalog: readonly EventDef[], lang: Lang = DEFAULT_LANG, timedRounds = 1): GameState {
  let out = state;
  for (const id of state.events.pending) {
    const event = finde(catalog, id);
    // Frist läuft noch: der Brief bleibt liegen.
    if (event && dueRound(out, id) > out.round) continue;
    const choice = event ? defaultChoice(out, event) : undefined;
    if (event && choice) {
      out = erledigen(out, event, choice, lang, 'Ohne Antwort: ', timedRounds);
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
  /** Diese Antwort gilt, wenn die Frist ohne Antwort abläuft (nach jetzigem Stand; feste Termine haben keine). */
  fallback?: true;
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
  // Feste Termine haben keine Standardantwort – bleiben sie liegen, passiert nichts.
  const standard = event.routine ? undefined : defaultChoice(state, event)?.id;
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
      const basis = { id: c.id, label: localize(c.label, lang), cost, overtime: overtimeFor(state, cost), ...(c.id === standard ? { fallback: true as const } : {}) };
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
