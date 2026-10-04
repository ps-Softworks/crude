// Kapitel 3 – Der Konzernherr (4.17, GDD §13): gemeinsamer Kern für Seismik
// (seismik.ts), Mr. Vale und das Konsortium (konsortium.ts), Konsortialprojekte
// (projekte.ts) und den Stand in Hallstead (stand.ts). Die Rundenabrechnung steht
// in kapitel3Runde.ts.
//
// Freischaltung: Alles ruht, bis das Kapitel balance.kapitel3.fromChapter (3)
// erreicht ist. Solange gibt es state.kapitel3 nicht – Kapitel 1 sieht, rechnet
// und speichert nichts davon. Ab Kapitel 3 entsteht der Zustand beim ersten
// Rundenende oder der ersten Aktion (ensureKapitel3).
//
// Schmale Schnittstellen statt Warten auf andere Bausteine:
//   - Kapitelnummer: state.chapter (kommt mit 4.5); fehlt sie, gilt Kapitel 1.
//   - Weltgrößen: state.worldModel (4.1) mit tech/credit/tension/mood 0–100; was
//     fehlt, kommt aus balance.kapitel3.world (Ersatzwerte).
//   - Technikstufe: state.research?.stage (4.11, falls es so heißt) zählt mit,
//     sonst nur der Technikstand der Welt.
//
// Eigener Zufall (Seed + ":kapitel3"), damit Karte, Ereignisse, Rivalen und
// Weltmodell mit und ohne Kapitel 3 dieselben Würfel ziehen.
// Texte (Gründe, Notizen, Briefe) stehen in content/kapitel3.yaml – hier nur Schlüssel.

import type { Balance } from './balance';
import type { GameState } from './game';
import type { Kapitel3Balance, Kapitel3World } from './kapitel3Balance';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf } from './stocks';

export type { Kapitel3Balance, Kapitel3World };

/** Warum eine Aktion nicht geht – der Text dazu steht in content/kapitel3.yaml unter „reasons“. */
export const KAPITEL3_REASONS = [
  'gesperrt',
  'kapitel_ende',
  'geld',
  'technik',
  'lizenz_fehlt',
  'lizenz_da',
  'kein_trupp',
  'max_trupps',
  'parzelle',
  'schon_vermessen',
  'laeuft_schon',
  'keine_einladung',
  'schon_entschieden',
  'kein_gefallen',
  'falsche_wahl',
  'keine_rettung',
  'kein_angebot',
  'anteil',
  'rang',
  'nur_mitglieder',
  'verstossen',
  'kein_sohn',
  'schon_verheiratet',
  'gebrochen',
  'aufgenommen',
  'ansehen',
  'spenden_ausgereizt',
] as const;
export type Kapitel3Reason = (typeof KAPITEL3_REASONS)[number];

export type Kapitel3Result = { ok: true; state: GameState } | { ok: false; reason: Kapitel3Reason };

/** Was geschah – Texte unter „notes“ in content/kapitel3.yaml, {name} wird aus vars ersetzt. */
export const KAPITEL3_NOTES = [
  'freigeschaltet',
  'seismik_lizenz',
  'seismik_trupp',
  'seismik_auftrag',
  'seismik_bericht',
  'einladung',
  'einladung_verfallen',
  'beitritt',
  'absage',
  'doppelspiel',
  'kartellgewinn',
  'insidergewinn',
  'gefallen',
  'gefallen_erfuellt',
  'gefallen_verweigert',
  'gefallen_vorgetaeuscht',
  'gefallen_verfallen',
  'verstossen',
  'aufgeflogen',
  'preisdruck',
  'rettung',
  'projekt_angebot',
  'projekt_verfallen',
  'projekt_gezeichnet',
  'projekt_verzoegert',
  'projekt_fertig',
  'projekt_gescheitert',
  'projekt_ertrag',
  'spende',
  'heirat',
  'ordnung_gebrochen',
  'club',
] as const;
export type Kapitel3NoteKey = (typeof KAPITEL3_NOTES)[number];

export interface Kapitel3Note {
  round: number;
  key: Kapitel3NoteKey;
  /** Platzhalter im Text, z. B. { ranch: 'moss', betrag: 6000 }. Ranches als id, Geld als Zahl. */
  vars?: Record<string, string | number>;
}

/** Ein Spezialtrupp unterwegs. */
export interface Survey {
  parcelId: string;
  /** Ab dieser Runde liegt der Bericht auf dem Tisch. */
  readyRound: number;
}

/** Bericht der Reflexionsseismik für eine Ranch (GDD §5: Prognose als Bandbreite). */
export interface SeismikReport {
  parcelId: string;
  /** Runde, ab der der Bericht da ist. */
  round: number;
  /** Fundchance in Prozent, schmaler als beim Geologen. */
  low: number;
  high: number;
  /** Größenklassen (Index in balance.kapitel3.seismik.sizeClasses), null = keine Struktur erkennbar. */
  sizeLow: number | null;
  sizeHigh: number | null;
}

export interface SeismikState {
  license: boolean;
  crews: number;
  surveys: Survey[];
  reports: Record<string, SeismikReport>;
}

/** Jacobs Weg mit dem Konsortium (GDD §12): Mitglied, abgelehnt, ausspielen – oder hinausgeworfen. */
export type KonsortiumPath = 'mitglied' | 'abgelehnt' | 'doppelspiel' | 'verstossen';

export interface PendingFavor {
  id: string;
  round: number;
  /** Letzte Runde, in der Jacob antworten kann. */
  deadline: number;
}

export interface KonsortiumState {
  /** Runde, in der Vales Einladung kam; 0 = noch nicht. */
  invitedRound: number;
  /** Letzte Runde für die Antwort. */
  inviteDeadline: number;
  /** null = noch nicht entschieden (oder noch nicht eingeladen). */
  path: KonsortiumPath | null;
  /** Vales Vertrauen 0–100. */
  trust: number;
  /** Macht des Konsortiums 0–100 – ein Akteur im Weltmodell. */
  power: number;
  favor: PendingFavor | null;
  /** Runde des letzten Gefallens (oder des Beitritts). */
  lastFavorRound: number;
  /** Seit dieser Runde im Doppelspiel (0 = nicht). */
  doubleSince: number;
  /** Aufgestaute Entdeckungsgefahr aus vorgetäuschten Gefallen. */
  suspicion: number;
  /** Bis zu dieser Runde drückt das Konsortium Jacobs Preise (nach dem Rauswurf). */
  pressureUntil: number;
  rescueUsed: boolean;
  /** Nach einer Rettung hält Vale die Hand an den Förderquoten. */
  controlled: boolean;
  favorsDone: number;
  favorsRefused: number;
}

export type StakeStatus = 'bau' | 'laeuft' | 'gescheitert';

export interface ProjectOffer {
  id: string;
  round: number;
  /** Letzte Runde, in der Jacob zeichnen kann. */
  until: number;
}

export interface ProjectStake {
  id: string;
  share: number;
  /** Eingezahlt in $. */
  paid: number;
  joinedRound: number;
  /** Ab dieser Runde läuft das Projekt (falls es nicht scheitert). */
  readyRound: number;
  status: StakeStatus;
  /** Bisheriger Ertrag in $. */
  earned: number;
}

export interface ProjekteState {
  offers: ProjectOffer[];
  stakes: ProjectStake[];
  /** Schon angebotene Projekte – jedes kommt nur einmal. */
  seen: string[];
  lastOfferRound: number;
}

export interface StandState {
  /** Ansehen in Hallstead 0–100, nie als Zahl sichtbar. */
  ansehen: number;
  donations: number;
  married: boolean;
  /** Die alte Ordnung mit Geld gebrochen. */
  broken: boolean;
  /** Aufnahme in den Hallstead Union Club. */
  admitted: boolean;
}

export interface Kapitel3State {
  rng: RngState;
  /** Runde, in der Kapitel 3 für dieses System begann. */
  startRound: number;
  /** Nur Debug: zur Probe freigeschaltet, obwohl das Kapitel noch nicht stimmt. */
  preview: boolean;
  notes: Kapitel3Note[];
  seismik: SeismikState;
  konsortium: KonsortiumState;
  projekte: ProjekteState;
  stand: StandState;
}

/** Höchstens so viele Notizen bleiben im Spielstand. */
export const MAX_NOTES = 40;

/** Kapitel des Spielstands: state.chapter (4.5); fehlt es, Kapitel 1. */
// Integration: Kapitelnummer über den gemeinsamen Helfer aller Phase-4-Systeme (stocks.ts, state.chapter aus 4.5).
export { chapterOf };

/** Ist Kapitel 3 für dieses System offen? (Kapitel oder Debug-Probe.) */
export function kapitel3Unlocked(state: GameState, balance: Balance): boolean {
  return chapterOf(state) >= balance.kapitel3.fromChapter || state.kapitel3?.preview === true;
}

/** Weltgrößen aus dem Weltmodell (4.1), sonst die Ersatzwerte aus balance.yaml. */
export function worldOf(state: GameState, balance: Balance): Kapitel3World {
  const w = (state as { worldModel?: Partial<Record<keyof Kapitel3World, unknown>> }).worldModel;
  const pick = (key: keyof Kapitel3World): number => {
    const v = w?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : balance.kapitel3.world[key];
  };
  return { tech: pick('tech'), credit: pick('credit'), tension: pick('tension'), mood: pick('mood') };
}

export function newKapitel3(state: GameState, balance: Balance, preview = false): Kapitel3State {
  const k = balance.kapitel3;
  const marks = state.events?.marks ?? {};
  // Kapitel 1 (k1-5-vale-umschlag): Wer das Geld „eines Freundes“ behielt, dem traut Vale mehr.
  const trust = k.konsortium.trustStart + (marks.vale_geld !== undefined ? k.konsortium.trustValeGeld : 0) + (marks.vale_abgelehnt !== undefined ? k.konsortium.trustValeAbgelehnt : 0);
  return {
    rng: seedFromString(`${state.seed}:kapitel3`),
    startRound: state.round,
    preview,
    notes: [],
    seismik: { license: false, crews: k.seismik.crews, surveys: [], reports: {} },
    konsortium: {
      invitedRound: 0,
      inviteDeadline: 0,
      path: null,
      trust: clamp(trust, 0, 100),
      power: k.konsortium.powerStart,
      favor: null,
      lastFavorRound: 0,
      doubleSince: 0,
      suspicion: 0,
      pressureUntil: 0,
      rescueUsed: false,
      controlled: false,
      favorsDone: 0,
      favorsRefused: 0,
    },
    projekte: { offers: [], stakes: [], seen: [], lastOfferRound: state.round - 1 },
    stand: { ansehen: k.stand.start, donations: 0, married: false, broken: false, admitted: false },
  };
}

/**
 * Der Kapitel-3-Zustand zum Lesen: der gespeicherte oder – solange noch keiner
 * entstanden ist – ein frischer. null, solange Kapitel 3 nicht offen ist.
 */
export function kapitel3Of(state: GameState, balance: Balance): Kapitel3State | null {
  if (!kapitel3Unlocked(state, balance)) return null;
  return state.kapitel3 ?? newKapitel3(state, balance);
}

/** Legt den Zustand an, falls er fehlt (mit Notiz). Ohne Freischaltung bleibt alles, wie es ist. */
export function ensureKapitel3(state: GameState, balance: Balance): GameState {
  if (state.kapitel3 || !kapitel3Unlocked(state, balance)) return state;
  const k3 = newKapitel3(state, balance);
  return { ...state, kapitel3: { ...k3, notes: [{ round: state.round, key: 'freigeschaltet' }] } };
}

/** Debug: Kapitel 3 zur Probe öffnen, auch wenn das Spiel noch in Kapitel 1 steht. */
export function previewKapitel3(state: GameState, balance: Balance): GameState {
  if (state.kapitel3) return state;
  const k3 = newKapitel3(state, balance, true);
  return { ...state, kapitel3: { ...k3, notes: [{ round: state.round, key: 'freigeschaltet' }] } };
}

/** Runde innerhalb von Kapitel 3 (1 = erste Runde). */
export function kapitelRound(k3: Pick<Kapitel3State, 'startRound'>, round: number): number {
  return round - k3.startRound + 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Notiz anhängen; die ältesten fallen heraus. */
export function note(k3: Kapitel3State, entry: Kapitel3Note): Kapitel3State {
  const notes = [...k3.notes, entry];
  return { ...k3, notes: notes.length > MAX_NOTES ? notes.slice(notes.length - MAX_NOTES) : notes };
}

/** Mit dem Zufall von Kapitel 3 würfeln: f bekommt die Rng, der neue Zustand merkt sich den Stand. */
export function withRng<T>(k3: Kapitel3State, f: (rng: Rng) => T): [T, Kapitel3State] {
  const rng = new Rng(k3.rng);
  const value = f(rng);
  return [value, { ...k3, rng: rng.state }];
}

/** Gemeinsamer Vorlauf jeder Aktion: freigeschaltet, Kapitel läuft, Zustand da. */
export function begin(state: GameState, balance: Balance): { ok: true; state: GameState; k3: Kapitel3State } | { ok: false; reason: Kapitel3Reason } {
  if (!kapitel3Unlocked(state, balance)) return { ok: false, reason: 'gesperrt' };
  if (state.finished) return { ok: false, reason: 'kapitel_ende' };
  const s = ensureKapitel3(state, balance);
  return { ok: true, state: s, k3: s.kapitel3! };
}

/** Prüft, ob ein gespeicherter Kapitel-3-Zustand vollständig ist (für save.ts). */
export function isKapitel3State(value: unknown): value is Kapitel3State {
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const zahl = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!obj(value) || !zahl(value.rng) || !zahl(value.startRound) || typeof value.preview !== 'boolean' || !Array.isArray(value.notes)) return false;
  const s = value.seismik;
  if (!obj(s) || typeof s.license !== 'boolean' || !zahl(s.crews) || !Array.isArray(s.surveys) || !obj(s.reports)) return false;
  if (!s.surveys.every((x) => obj(x) && typeof x.parcelId === 'string' && zahl(x.readyRound))) return false;
  const k = value.konsortium;
  const PATHS = [null, 'mitglied', 'abgelehnt', 'doppelspiel', 'verstossen'];
  if (
    !obj(k) ||
    !['invitedRound', 'inviteDeadline', 'trust', 'power', 'lastFavorRound', 'doubleSince', 'suspicion', 'pressureUntil', 'favorsDone', 'favorsRefused'].every((x) => zahl(k[x])) ||
    !PATHS.includes(k.path as string | null) ||
    typeof k.rescueUsed !== 'boolean' ||
    typeof k.controlled !== 'boolean' ||
    !(k.favor === null || (obj(k.favor) && typeof k.favor.id === 'string' && zahl(k.favor.round) && zahl(k.favor.deadline)))
  ) {
    return false;
  }
  const p = value.projekte;
  if (!obj(p) || !Array.isArray(p.offers) || !Array.isArray(p.stakes) || !Array.isArray(p.seen) || !zahl(p.lastOfferRound)) return false;
  if (!p.stakes.every((x) => obj(x) && typeof x.id === 'string' && ['bau', 'laeuft', 'gescheitert'].includes(x.status as string) && zahl(x.share) && zahl(x.readyRound))) return false;
  const st = value.stand;
  if (!obj(st) || !zahl(st.ansehen) || !zahl(st.donations) || ![st.married, st.broken, st.admitted].every((b) => typeof b === 'boolean')) return false;
  return true;
}
