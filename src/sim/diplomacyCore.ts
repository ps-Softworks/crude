// Rivalen-Diplomatie (4.10, GDD §9.3–§9.6, §13 Kapitel 2) – der gemeinsame Kern:
// Zustand, Beziehungen, Gedächtnis, Merkzeichen und die Schnittstelle zur Welt.
// Die Teile stehen in eigenen Dateien:
//   diplomacySuccession.ts  Margaret Crane gegen Harold Pruett, Zerschlagung des Trusts
//   diplomacyPacts.ts       Absprachen (Preis, Gebiet, Lieferung, Kreuzbeteiligung), Angebote, Verrat
//   diplomacyTakeovers.ts   Übernahmen kleiner Firmen, Pruetts Krisenkäufe, Kaufangebot an Jacob
//   diplomacyGuild.ts       Delgados Produzentenverband
//   diplomacy.ts            Start, Rundenschritt, Ansicht für die Oberfläche, Spielstand-Prüfung
//
// Reine Funktionen, deterministisch. Eigener Zufall (seed + ':diplomatie'), damit
// Karte, Ereignisse und Rivalen mit und ohne Diplomatie dieselben Würfel ziehen.
// Wirkungen auf Preis und Pachtkosten laufen über die befristeten Nachwirkungen der
// Ereignisse (events.timed, Quelle „diplomatie“) – so braucht trust.ts/lease.ts
// keine Änderung: jacobPrice und leaseTerms rechnen sie schon mit.

import type { Balance, RivalPersonality } from './balance';
import { DIPLO_RIVALS, type DiploRival, type PactKind } from './diplomacyBalance';
import type { TimedEffect } from './events';
import type { GameState } from './game';
import type { RngState } from './rng';

export { DIPLO_RIVALS, PACT_KINDS, type DiploRival, type PactKind } from './diplomacyBalance';

/** Vertrauen (−100…+100) und Groll (0…100) getrennt – man kann zugleich vertraut und gehasst sein (GDD §9.3). */
export interface Relation {
  trust: number;
  grudge: number;
}

/** Gedächtnis (GDD §9.3): konkrete Ereignisse. Verrat verfällt nie. */
export type MemoryKind = 'gefallen' | 'beleidigung' | 'verrat';
export interface Memory {
  rival: DiploRival;
  kind: MemoryKind;
  round: number;
}

export type Heir = 'margaret' | 'pruett';
export const HEIRS: readonly Heir[] = ['margaret', 'pruett'];
export type SuccessionOutcome = Heir | 'zerschlagen';

export interface SuccessionState {
  /** Margarets Anteil im Aufsichtsrat (0–1); der Rest steht hinter Pruett. */
  share: number;
  /** Letzte Runde des Ringens: an ihrem Ende fällt die Entscheidung. */
  endRound: number;
  /** Wie oft Jacob sich hinter einen Erben gestellt hat (Zusage beim Besuch zählt mit). */
  backed: Record<Heir, number>;
  /** Runde der letzten öffentlichen Unterstützung (einmal je Runde); 0 = nie. */
  lastBack: number;
  /** Druck zur Zerschlagung (ab 1 wird der Trust zerschlagen). */
  breakup: number;
  /** Wie oft Jacob die Zerschlagung angeschoben (+) bzw. gebremst (−) hat. */
  pushedFor: number;
  pushedAgainst: number;
  /** Runde des letzten Anschiebens/Bremsens; 0 = nie. */
  lastPush: number;
  outcome: SuccessionOutcome | null;
  /** Runde der Entscheidung; 0 = offen. */
  decidedRound: number;
}

/** Eine laufende Absprache. */
export interface Pact {
  id: string;
  rival: DiploRival;
  kind: PactKind;
  startRound: number;
  /** Letzte Runde, in der sie gilt. */
  endRound: number;
  /** Spur im Schattenbuch schon geschrieben (Kartellgesetz). */
  traced: boolean;
}

/** Angebot eines Rivalen an Jacob; buyout = Pruett will Jacobs Firma kaufen. */
export type OfferKind = PactKind | 'buyout';
export interface Offer {
  id: string;
  rival: DiploRival;
  kind: OfferKind;
  /** Runde, in der das Angebot gemacht wurde (es liegt ab der nächsten auf dem Tisch). */
  round: number;
  /** Letzte Runde, in der Jacob annehmen kann. */
  expires: number;
  /** Kaufpreis (nur buyout). */
  price?: number;
}

/** Nachwirkung eines Bruchs oder einer Rache: befristet auf Preis oder Pachtkosten. */
export interface Aftermath {
  key: 'price' | 'leaseCost';
  value: number;
  /** Erste und letzte Runde, in der sie gilt. */
  from: number;
  until: number;
}

/** Eine übernommene kleine Firma (Name wie in state.wildcatters). */
export interface Firm {
  name: string;
  owner: 'jacob' | 'pruett';
  round: number;
}

export interface GuildState {
  /** Runde der Gründung; 0 = noch nicht gegründet. */
  founded: number;
  members: number;
  member: boolean;
  joinedRound: number;
  expelled: boolean;
  /** Runde, in der Delgado Jacob „zu groß“ fand; 0 = noch nie. */
  warned: number;
}

/** Spur für das Schattenbuch (GDD §4 Hitze). Die Spuren verblassen erst mit 4.11. */
export interface Trace {
  source: string;
  severity: number;
  round: number;
}

export interface DiplomacyState {
  /** Kapitel, in dem die Diplomatie begann. */
  chapter: number;
  startRound: number;
  rng: RngState;
  relations: Record<DiploRival, Relation>;
  /** Branchen-Respekt 0–100: wie sehr die Rivalen Jacobs Wort trauen. */
  respect: number;
  memory: Memory[];
  succession: SuccessionState;
  pacts: Pact[];
  offers: Offer[];
  /** Laufende Nummer für Absprachen und Angebote. */
  nextId: number;
  aftermath: Aftermath[];
  firms: Firm[];
  guild: GuildState;
  traces: Trace[];
  /** Merkzeichen, deren Folgen schon verarbeitet sind. */
  handled: string[];
}

/** Der Zustand, sobald die Diplomatie läuft. */
export type DiploGame = GameState & { diplomacy: DiplomacyState };

export function hasDiplomacy(state: GameState): state is DiploGame {
  return state.diplomacy !== undefined && state.diplomacy !== null;
}

/**
 * Merkzeichen der Diplomatie. „sim“ setzt die Simulation, „wahl“ eine Antwort in
 * content/events/k2-diplomatie.yaml – die Simulation liest sie und verarbeitet jede
 * genau einmal.
 */
export const DIPLO_MARKS = {
  /** sim: Die Diplomatie hat begonnen (Kapitel 2). */
  started: 'k2_diplomatie',
  /** wahl: Abschiedsbesuch bei Cornelius Crane. */
  farewell: 'k2_crane_abschied',
  /** wahl: Zusage an Margaret bzw. Pruett beim Besuch. */
  backMargaret: 'k2_rueckhalt_margaret',
  backPruett: 'k2_rueckhalt_pruett',
  /** sim: Ausgang der Nachfolge. */
  heirMargaret: 'k2_nachfolge_margaret',
  heirPruett: 'k2_nachfolge_pruett',
  breakup: 'k2_trust_zerschlagen',
  /** wahl: Glückwunsch an die neue Führung. */
  congrats: 'k2_gratuliert',
  /** sim: Delgado gründet den Verband. */
  guildFounded: 'k2_verband_gegruendet',
  /** wahl: beitreten / ablehnen. */
  guildJoin: 'k2_verband_beitritt',
  guildDecline: 'k2_verband_abgelehnt',
  /** sim: Jacob ist für Delgado zu groß geworden. */
  guildTooBig: 'k2_verband_zu_gross',
  /** wahl: freiwillig austreten / sich wehren (Ausschluss). */
  guildLeave: 'k2_verband_austritt',
  guildFight: 'k2_verband_streit',
  /** wahl: öffentliche Entschuldigung nach einem Verrat. */
  apology: 'k2_entschuldigt',
  /** wahl: Jacob macht einen Bruch durch einen Rivalen öffentlich. */
  exposed: 'k2_angeprangert',
  /** sim: Jacob hat zum ersten Mal eine Absprache gebrochen. */
  betrayer: 'k2_verrat',
  /** sim: Ein Rivale hat zum ersten Mal eine Absprache mit Jacob gebrochen. */
  betrayed: 'k2_hintergangen',
} as const;

/** Merkzeichen, die die Simulation selbst setzt (für die Inhaltsprüfung). */
export const DIPLOMACY_SIM_MARKS: readonly string[] = [
  DIPLO_MARKS.started,
  DIPLO_MARKS.heirMargaret,
  DIPLO_MARKS.heirPruett,
  DIPLO_MARKS.breakup,
  DIPLO_MARKS.guildFounded,
  DIPLO_MARKS.guildTooBig,
  DIPLO_MARKS.betrayer,
  DIPLO_MARKS.betrayed,
];

/** Merkzeichen aus Antworten, die die Simulation liest (für die Wirkungsprüfung). */
export const DIPLOMACY_READ_MARKS: readonly string[] = [
  DIPLO_MARKS.farewell,
  DIPLO_MARKS.backMargaret,
  DIPLO_MARKS.backPruett,
  DIPLO_MARKS.congrats,
  DIPLO_MARKS.guildJoin,
  DIPLO_MARKS.guildDecline,
  DIPLO_MARKS.guildLeave,
  DIPLO_MARKS.guildFight,
  DIPLO_MARKS.apology,
  DIPLO_MARKS.exposed,
];

/** Namen für das Protokoll (das Protokoll ist bisher deutsch; die Oberfläche nimmt content/diplomacy.yaml). */
export const LOG_NAMES: Record<DiploRival, string> = {
  margaret: 'Margaret Crane',
  pruett: 'Harold Pruett',
  bullard: 'Bullard',
  thorne: 'Thorne',
  delgado: 'Rosa Delgado',
};

// ---------------------------------------------------------------------------
// Welt (4.1–4.4): Schnittstelle mit Ersatzwerten, bis Block A da ist.

/** Was die Diplomatie von der Welt wissen muss. */
export interface DiplomacyWorld {
  /** Öffentliche Stimmung 0–100, 50 = normal; darunter Unmut (Volksbund wird stark). */
  mood: number;
  /** Kreditklima 0–100, 50 = normal; darunter Krise. */
  credit: number;
  /** Regierungspartei (handel, volksbund, provinz). */
  government: string;
  /** Gilt ein Kartellgesetz (4.3)? */
  antitrustLaw: boolean;
}

export const FALLBACK_WORLD: DiplomacyWorld = { mood: 50, credit: 50, government: 'handel', antitrustLaw: false };

function zahlOder(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Gilt ein Kartellgesetz? // 4.3 Andockpunkt
 * Bis der Gesetzeskatalog da ist: state.laws als Liste mit „kartellgesetz“ oder als
 * Nachschlagewerk { kartellgesetz: wahr }, sonst das Merkzeichen gesetz_kartell.
 */
export function antitrustInForce(state: Partial<Pick<GameState, 'events'>>): boolean {
  const laws = (state as { laws?: unknown }).laws;
  if (Array.isArray(laws) && laws.includes('kartellgesetz')) return true;
  if (laws && typeof laws === 'object' && !Array.isArray(laws)) {
    const k = (laws as Record<string, unknown>).kartellgesetz;
    if (k === true || (typeof k === 'number' && k > 0) || (typeof k === 'object' && k !== null && (k as { active?: unknown }).active === true)) return true;
  }
  return state.events?.marks?.gesetz_kartell !== undefined;
}

/**
 * Die Weltgrößen, die die Diplomatie braucht. // 4.1 Andockpunkt
 * Liest state.worldModel (Block A: mood, credit, government), fehlt es: Ersatzwerte.
 */
export function diplomacyWorld(state: Partial<Pick<GameState, 'events'>>): DiplomacyWorld {
  const w = (state as { worldModel?: Record<string, unknown> }).worldModel;
  return {
    mood: zahlOder(w?.mood, FALLBACK_WORLD.mood),
    credit: zahlOder(w?.credit, FALLBACK_WORLD.credit),
    government: typeof w?.government === 'string' ? w.government : FALLBACK_WORLD.government,
    antitrustLaw: antitrustInForce(state),
  };
}

// ---------------------------------------------------------------------------
// Beziehungen

export function personality(balance: Balance, rival: DiploRival): RivalPersonality {
  return rival === 'bullard' ? balance.rivals.bullard.personality : balance.diplomacy.rivals[rival].personality!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Auf zwei Nachkommastellen (Punkte, Anteile). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Vertrauen und Groll ändern (Grenzen −100…100 bzw. 0…100). */
export function changeRelation(d: DiplomacyState, rival: DiploRival, delta: Partial<Relation>): DiplomacyState {
  const r = d.relations[rival];
  const next: Relation = {
    trust: round2(clamp(r.trust + (delta.trust ?? 0), -100, 100)),
    grudge: round2(clamp(r.grudge + (delta.grudge ?? 0), 0, 100)),
  };
  return { ...d, relations: { ...d.relations, [rival]: next } };
}

export function remember(d: DiplomacyState, rival: DiploRival, kind: MemoryKind, round: number): DiplomacyState {
  return { ...d, memory: [...d.memory, { rival, kind, round }] };
}

/** Hat Jacob diesen Rivalen je verraten? Das vergisst er nie. */
export function betrayedBy(d: Pick<DiplomacyState, 'memory'>, rival: DiploRival): boolean {
  return d.memory.some((m) => m.rival === rival && m.kind === 'verrat');
}

/** Wie der Rivale zu Jacob steht – als Wort für die Oberfläche. */
export type RelationMood = 'verraten' | 'feind' | 'kuehl' | 'neutral' | 'wohlgesonnen' | 'freund';

export function relationMood(d: DiplomacyState, rival: DiploRival): RelationMood {
  const r = d.relations[rival];
  if (betrayedBy(d, rival)) return 'verraten';
  if (r.grudge >= 60) return 'feind';
  if (r.trust <= -20 || r.grudge >= 30) return 'kuehl';
  if (r.trust >= 50) return 'freund';
  if (r.trust >= 20) return 'wohlgesonnen';
  return 'neutral';
}

/**
 * Am Rundenende: Vertrauen wandert um trustDrift Richtung 0, Groll verblasst um
 * grudgeDecay × (6 − Nachtragen) / 5. Verrat verfällt nie: Wer verraten wurde, fasst
 * kein Vertrauen über 0, und sein Groll fällt nicht unter betrayalGrudge / 2.
 */
export function driftRelations(d: DiplomacyState, balance: Balance): DiplomacyState {
  const b = balance.diplomacy.relations;
  const relations = { ...d.relations };
  for (const rival of DIPLO_RIVALS) {
    const r = relations[rival];
    const verraten = betrayedBy(d, rival);
    let trust = r.trust > 0 ? Math.max(0, r.trust - b.trustDrift) : Math.min(0, r.trust + b.trustDrift);
    if (verraten) trust = Math.min(trust, 0);
    const decay = (b.grudgeDecay * (6 - personality(balance, rival).grudge)) / 5;
    let grudge = Math.max(0, r.grudge - decay);
    if (verraten) grudge = Math.max(grudge, b.betrayalGrudge / 2);
    relations[rival] = { trust: round2(trust), grudge: round2(grudge) };
  }
  return { ...d, relations };
}

// ---------------------------------------------------------------------------
// Merkzeichen

export function markSet(state: Pick<GameState, 'events'>, mark: string): boolean {
  return state.events.marks[mark] !== undefined;
}

/** Setzt ein Merkzeichen (behält die Runde, in der es zuerst gesetzt wurde). */
export function setMark<T extends GameState>(state: T, mark: string): T {
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

// ---------------------------------------------------------------------------
// Nachwirkungen über events.timed

/** Quelle der Diplomatie in events.timed. */
export const TIMED_SOURCE = 'diplomatie';

/**
 * Trägt die Wirkung der Diplomatie auf Preis und Pachtkosten für eine Runde in
 * events.timed ein (Quelle „diplomatie“, ersetzt die alte). Wert 0 = kein Eintrag.
 */
export function writeTimed<T extends GameState>(state: T, effects: { price: number; leaseCost: number }, round: number): T {
  const rest = (state.events.timed ?? []).filter((t) => t.source !== TIMED_SOURCE && t.until >= state.round);
  const neu: TimedEffect[] = [];
  if (effects.price !== 0) neu.push({ key: 'price', value: effects.price, until: round, source: TIMED_SOURCE });
  if (effects.leaseCost !== 0) neu.push({ key: 'leaseCost', value: effects.leaseCost, until: round, source: TIMED_SOURCE });
  return { ...state, events: { ...state.events, timed: [...rest, ...neu] } };
}

/** Neue laufende Nummer für Absprachen und Angebote. */
export function takeId(d: DiplomacyState, prefix: string): [string, DiplomacyState] {
  return [`${prefix}${d.nextId}`, { ...d, nextId: d.nextId + 1 }];
}

export type DiploReason =
  | 'inaktiv'
  | 'ende'
  | 'entschieden'
  | 'schon'
  | 'geld'
  | 'zeit'
  | 'unbekannt'
  | 'art'
  | 'verraten'
  | 'laeuft'
  | 'vergeben'
  | 'nicht_gegruendet'
  | 'mitglied'
  | 'kein_mitglied'
  | 'ausgeschlossen'
  | 'gesetz';

export type DiploResult = { ok: true; state: GameState } | { ok: false; reason: DiploReason };
