// Hallstead (4.16): gemeinsamer Zustand für Nebeninvestments (holdings.ts) und
// den Lobbyisten (lobby.ts), dazu das Kapitel-Tor und zwei kleine Schnittstellen
// nach außen, die mit Ersatzwerten auskommen, solange es die Systeme dahinter
// noch nicht gibt:
//   - WorldView: die Weltgrößen aus dem Weltmodell (4.1/4.2), gelesen aus
//     state.worldModel, falls vorhanden – sonst eine ruhige Durchschnittswelt.
//   - chapterOf: die Kapitelnummer (4.5) – gemeinsamer Helfer aus stocks.ts (state.chapter, sonst 1).
//
// Der Zustand liegt optional in state.hallstead und entsteht erst, wenn Jacob
// zum ersten Mal etwas in Hallstead tut. Kapitel 1 bleibt dadurch unberührt:
// kein Feld, kein Zufall, kein Spielstand-Unterschied.
// Reine Logik, kein React, Zufall nur über den eigenen Rng (Seed + ":hallstead").

import type { Balance } from './balance';
import type { GameState } from './game';
import { HOLDING_KINDS, PARTY_IDS, type HoldingKind, type PartyId } from './hallsteadBalance';
import { seedFromString, type RngState } from './rng';
import { chapterOf } from './stocks';

export interface Position {
  /** Heutiger Marktwert in $. */
  value: number;
  /** Was Jacob insgesamt hineingesteckt hat, in $. */
  invested: number;
  /** Runde des ersten Kaufs. */
  since: number;
}

/** Was beim letzten Rundenende in Hallstead geschah – für das Telegramm im Fenster. */
export type HallsteadNews =
  | { key: 'crash'; kind: HoldingKind; amount: number }
  | { key: 'shock'; kind: HoldingKind; amount: number }
  | { key: 'yield'; amount: number }
  | { key: 'donationWon'; party: PartyId; favors: number }
  | { key: 'donationLost'; party: PartyId; amount: number }
  | { key: 'lobbyFavors'; favors: number }
  | { key: 'lobbyDrunk' }
  | { key: 'salary'; amount: number };

export interface HoldingsState {
  positions: Partial<Record<HoldingKind, Position>>;
  /** Lief beim letzten Rundenende ein Crash? (Der Einbruch kommt nur zu Beginn.) */
  crashSeen: boolean;
  /** Nachfrage beim letzten Rundenende – für das Wachstum. */
  demandSeen: number;
  /** Glaubwürdigkeit der eigenen Zeitung, 0–100. */
  credibility: number;
  /** Runde der letzten Kampagne; 0 = noch keine. */
  campaignRound: number;
}

export interface Donation {
  party: PartyId;
  amount: number;
  /** Am Ende dieser Runde wird gewählt. */
  electionRound: number;
}

export interface LobbyState {
  /** Der Lobbyist in Hallstead (id aus balance.hallstead.lobby.candidates) oder niemand. */
  lobbyist: { id: string; since: number } | null;
  /** Gefallen, die Hallstead Jacob schuldet. Dezimal; ausgegeben werden ganze. */
  favors: number;
  /** Druck je Gesetz, −100 (verhindern) bis +100 (fordern). */
  pressure: Record<string, number>;
  /** Verwässerung je Gesetz, 0 bis maxWater (Anteil weniger Wirkung). */
  water: Record<string, number>;
  donations: Donation[];
  /** Hitze aus Umschlägen (Andockpunkt Ermittler 4.11). */
  heat: number;
}

export interface HallsteadState {
  rng: RngState;
  /** Nur Debug: Hallstead schon vor Kapitel 3 offen. */
  debugUnlock: boolean;
  holdings: HoldingsState;
  lobby: LobbyState;
  /** Telegramm des letzten Rundenendes. */
  news: HallsteadNews[];
}

/** Ergebnis einer Handlung: neuer Zustand oder warum es nicht geht (Schlüssel in content/hallstead.yaml → reasons). */
export type HallsteadReason =
  | 'locked'
  | 'cash'
  | 'owned'
  | 'notOwned'
  | 'noLobbyist'
  | 'hasLobbyist'
  | 'unknown'
  | 'favors'
  | 'refuses'
  | 'already'
  | 'amount'
  | 'maxed';
export type HallsteadResult = { ok: true; state: GameState } | { ok: false; reason: HallsteadReason };

export function newHallstead(seed: string, balance: Balance): HallsteadState {
  return {
    rng: seedFromString(`${seed}:hallstead`),
    debugUnlock: false,
    holdings: { positions: {}, crashSeen: false, demandSeen: 0, credibility: balance.hallstead.newspaper.credibilityStart, campaignRound: 0 },
    lobby: { lobbyist: null, favors: 0, pressure: {}, water: {}, donations: [], heat: 0 },
    news: [],
  };
}

/**
 * Der Hallstead-Zustand – oder ein frischer, wenn Jacob noch nie dort war. Ein
 * frischer Zustand übernimmt die Welt von heute (Crash, Nachfrage): Ein Crash, der
 * schon läuft, „beginnt“ nicht noch einmal, sonst träfe der einmalige Einbruch
 * ausgerechnet den Kauf im Tief.
 */
export function hallsteadOf(state: GameState, balance: Balance): HallsteadState {
  if (state.hallstead) return state.hallstead;
  const frisch = newHallstead(state.seed, balance);
  const welt = worldView(state, balance);
  return { ...frisch, holdings: { ...frisch.holdings, crashSeen: welt.crash, demandSeen: welt.demand } };
}

// --- Kapitel (Andockpunkt 4.5) ---

/** Kapitelnummer: gemeinsamer Helfer aller Phase-4-Systeme (stocks.ts, state.chapter aus 4.5), sonst Kapitel 1. */
export { chapterOf };

/** Ist Hallstead offen? Ab balance.hallstead.unlockChapter oder per Debug. */
export function hallsteadUnlocked(state: GameState, balance: Balance): boolean {
  return chapterOf(state) >= balance.hallstead.unlockChapter || state.hallstead?.debugUnlock === true;
}

/** Nur Debug: Hallstead jetzt öffnen. */
export function debugUnlockHallstead(state: GameState, balance: Balance): GameState {
  return { ...state, hallstead: { ...hallsteadOf(state, balance), debugUnlock: true } };
}

// --- Weltgrößen (Andockpunkt 4.1/4.2) ---

/** Was Hallstead von der Welt wissen muss. Feldnamen wie in WorldState (4.1). */
export interface WorldView {
  /** Kreditklima 0–100, 50 = normal. */
  credit: number;
  /** Läuft gerade ein Crash? */
  crash: boolean;
  /** Grundnachfrage, Index (Start 1). */
  demand: number;
  /** Öffentliche Stimmung 0–100. */
  mood: number;
  /** Regierende Partei. */
  government: PartyId;
  /** Runden bis zur nächsten Wahl (≥ 1). */
  electionIn: number;
}

/** Durchschnittswelt ohne Weltmodell: ruhiges Kreditklima, Handelspartei regiert, feste Wahltermine. */
export function fallbackWorld(round: number, balance: Balance): WorldView {
  const every = balance.hallstead.fallbackElectionEvery;
  return { credit: 50, crash: false, demand: 1, mood: 50, government: 'handel', electionIn: every - ((Math.max(1, round) - 1) % every) };
}

function zahl(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Die Weltgrößen für Hallstead. Gibt es state.worldModel (4.1), kommen die Werte
 * von dort (crash: Runden, die ein Crash nachwirkt, > 0 = Crash), sonst die
 * Durchschnittswelt. Jedes fehlende Feld fällt einzeln auf den Ersatzwert zurück.
 */
export function worldView(state: GameState, balance: Balance): WorldView {
  const fb = fallbackWorld(state.round, balance);
  // Über unknown gelesen: Alte Teststände haben kein Weltmodell, und jedes Feld wird einzeln geprüft.
  const w = (state as unknown as { worldModel?: Record<string, unknown> }).worldModel;
  if (!w || typeof w !== 'object') return fb;
  const crash = zahl(w.crash);
  const gov = w.government;
  const electionIn = zahl(w.electionIn);
  return {
    credit: zahl(w.credit) ?? fb.credit,
    crash: crash !== undefined ? crash > 0 : fb.crash,
    demand: zahl(w.demand) ?? fb.demand,
    mood: zahl(w.mood) ?? fb.mood,
    government: (PARTY_IDS as readonly unknown[]).includes(gov) ? (gov as PartyId) : fb.government,
    electionIn: electionIn !== undefined ? Math.max(1, Math.round(electionIn)) : fb.electionIn,
  };
}

// --- Spielstand (Andockpunkt save.ts) ---

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Ist ein gespeicherter Hallstead-Zustand vollständig? (undefined gilt: Jacob war noch nie dort.) */
export function validHallstead(value: unknown): boolean {
  if (value === undefined) return true;
  if (!istObjekt(value) || !istZahl(value.rng) || typeof value.debugUnlock !== 'boolean' || !Array.isArray(value.news)) return false;
  const h = value.holdings;
  if (!istObjekt(h) || !istObjekt(h.positions) || typeof h.crashSeen !== 'boolean' || !istZahl(h.demandSeen) || !istZahl(h.credibility) || !istZahl(h.campaignRound)) {
    return false;
  }
  for (const [k, p] of Object.entries(h.positions)) {
    if (!(HOLDING_KINDS as readonly string[]).includes(k)) return false;
    if (!istObjekt(p) || !istZahl(p.value) || !istZahl(p.invested) || !istZahl(p.since)) return false;
  }
  const l = value.lobby;
  if (!istObjekt(l) || !istZahl(l.favors) || !istZahl(l.heat) || !istObjekt(l.pressure) || !istObjekt(l.water) || !Array.isArray(l.donations)) return false;
  if (!Object.values(l.pressure).every(istZahl) || !Object.values(l.water).every(istZahl)) return false;
  if (l.lobbyist !== null && !(istObjekt(l.lobbyist) && typeof l.lobbyist.id === 'string' && istZahl(l.lobbyist.since))) return false;
  return l.donations.every(
    (d) => istObjekt(d) && (PARTY_IDS as readonly unknown[]).includes(d.party) && istZahl(d.amount) && istZahl(d.electionRound),
  );
}
