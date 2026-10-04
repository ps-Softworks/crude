// Spielstand sichern und laden (1.13): Der Zustand ist reines JSON, also lässt
// er sich als Text in den localStorage legen. Die Zahl format sagt, welcher Bau
// das ist: passt sie nicht, wird der Spielstand nicht geraten, sondern
// verworfen. Keine Spielregeln hier, nur sichern und prüfen, ob der Zustand
// vollständig ist.

import { validDiplomacy } from './diplomacy'; // 4.10 Andockpunkt
import type { GameState } from './game';
import { newLogistics } from './logistics';
import { isWorldState, neutralWorld, withPoliticsDefaults } from './world';
// 4.6 Andockpunkt: Raffinerie.
import { isRefineryState } from './refinery';
// 4.7 Andockpunkt: Fernleitungen (fehlen in Kapitel 1 – dann ist nichts zu prüfen).
import { validBigPipelines } from './bigPipeline';
import { isStocksState } from './stocks'; // 4.8 Andockpunkt
import { isStaffState } from './staff'; // 4.9 Andockpunkt: Personal
// 4.11 Andockpunkt: Ermittler und Forschung prüfen ihren Teil selbst.
import { validInvestigation } from './investigation';
import { validResearch } from './research';
// 4.14 Andockpunkt: Marke und Tankstellen.
import { isBrandState } from './brand';
// 4.15 Andockpunkt: Börse (optional, erst ab Kapitel 3 im Spielstand).
import { validExchange } from './exchange';
// 4.16 Andockpunkt
import { validHallstead } from './hallsteadState';

/** Bau des Spielstandformats. Nur hochzählen, wenn sich der Zustand ändert. 2 = mit Ereignissen (2.1), 3 = mit Terminen und Kraft (2.3), 4 = mit Posteingang (Fristen, Briefarten, 2.4), 5 = mit Dokumentenprüfung (2.5), 6 = mit Familie und Krankheit (2.7), 7 = mit Wildcattern und Übernahme-Ende (2.8), 8 = mit Wiederholungsschutz der Ereignisse (2.10a), 9 = mit Börsengang am Kapitelende (2.11), 10 = mit Lager, eigenen Fuhrwerken, Pipeline und Händler (0.2.15+2), 11 = mit befristeten Nachwirkungen der Ereignisse (0.2.15+3), 12 = Karte mit Gebieten und Ranches statt Raster, mehrere Bohrlöcher je Ranch (0.2.15+5), 13 = Bohrtürme und Pumpen (0.2.15+7), 14 = mit Weltmodell (4.1), 15 = mit öffentlichem Handeln und Wahlergebnis im Weltmodell (4.2). */
export const SAVE_FORMAT = 15;

/**
 * Ältere Formate, die mit Ersatzwerten noch geladen werden. Vor Format 12 keins
 * mehr: Die Rasterparzellen der alten Stände passen nicht auf die neue Karte.
 * Format 12 bekommt Silas' Turm (0.2.15+7), Format 12 und 13 eine ruhige Durchschnittswelt (4.1), Format 14 leere Listen für öffentliches Handeln und keine gemerkte Wahl (4.2).
 * Die Umrisse der Ranches stehen nie im Spielstand – sie kommen aus dem Seed.
 */
const ALTE_FORMATE: number[] = [12, 13, 14];

export interface SaveFile {
  format: number;
  /** Version des Spiels, die den Spielstand geschrieben hat – nur zum Nachsehen. */
  appVersion: string;
  /** Runde, in der gesichert wurde – nur zum Nachsehen. */
  savedRound: number;
  state: GameState;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string };

const KAPUTT = 'Spielstand ist beschädigt.';
const FREMDE_VERSION = 'Spielstand stammt aus einer anderen Version.';
const UNVOLLSTAENDIG = 'Spielstand ist unvollständig.';

/** Zahlen im Zustand: endlich, sonst stimmt die Rechnung nicht mehr. */
const ZAHLEN = [
  'rng',
  'round',
  'totalRounds',
  'startYear',
  'cash',
  'oilStock',
  'royaltyOil',
  'railTariff',
  'postedPrice',
  'missedPayments',
  'bankruptcyDeadline',
  'roundLogStart',
  'strength',
  'strengthMax',
  'sick',
] as const;

/** Listen im Zustand. */
const LISTEN = ['regions', 'parcels', 'fields', 'leases', 'options', 'wells', 'rigs', 'priceHistory', 'loans', 'log'] as const;

/** Nachschlagewerke im Zustand. */
const OBJEKTE = ['forecasts', 'shipped'] as const;

function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert);
}

function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}

function istListe(wert: unknown): wert is unknown[] {
  return Array.isArray(wert);
}

/** Ein Ding mit Feldern – aber keine Liste und kein null. */
function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Prüft, ob der Zustand vollständig und gültig ist: alle Zahlen endlich, alle
 * Listen und Nachschlagewerke da, der Rivale mit eigenem Zufall und eigener
 * Kasse, und die Runde zwischen 1 und dem Ende des Kapitels.
 */
export function validateState(value: unknown): LoadResult {
  if (!istObjekt(value) || !istText(value.seed) || !istText(value.rating)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!ZAHLEN.every((key) => istZahl(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!LISTEN.every((key) => istListe(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!OBJEKTE.every((key) => istObjekt(value[key]))) return { ok: false, reason: UNVOLLSTAENDIG };

  const rival = value.rival;
  if (!istObjekt(rival) || !istZahl(rival.rng) || !istZahl(rival.cash) || !istListe(rival.wells)) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const events = value.events;
  if (
    !istObjekt(events) ||
    !istZahl(events.rng) ||
    !istListe(events.pending) ||
    !istListe(events.seen) ||
    !istObjekt(events.marks) ||
    !Object.values(events.marks).every(istZahl) ||
    !istObjekt(events.due) ||
    !Object.values(events.due).every(istZahl) ||
    !istObjekt(events.lastMail) ||
    !Object.values(events.lastMail).every(istZahl) ||
    !istObjekt(events.lastSeen) ||
    !Object.values(events.lastSeen).every(istZahl) ||
    !istListe(events.timed) ||
    !events.timed.every((t) => istObjekt(t) && istText(t.key) && istZahl(t.value) && istZahl(t.until) && istText(t.source)) ||
    !istObjekt(events.docs) ||
    !Object.values(events.docs).every((d) => istObjekt(d) && (d.forgery === null || istText(d.forgery)) && istListe(d.checked))
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const agenda = value.agenda;
  if (!istObjekt(agenda) || !istZahl(agenda.budget) || !istZahl(agenda.used) || !istListe(agenda.done)) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const family = value.family;
  if (!istObjekt(family) || !istZahl(family.ruth) || !istZahl(family.thomas) || !istZahl(family.thomasBorn) || !istZahl(family.time)) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const wildcatters = value.wildcatters;
  if (
    !istObjekt(wildcatters) ||
    !istZahl(wildcatters.rng) ||
    !istListe(wildcatters.firms) ||
    !wildcatters.firms.every((f) => istObjekt(f) && istText(f.name) && istZahl(f.wells))
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  if (typeof value.finished !== 'boolean') return { ok: false, reason: UNVOLLSTAENDIG };
  const ipo = value.ipo;
  if (ipo !== null && !(istObjekt(ipo) && istZahl(ipo.share) && ipo.share >= 0 && ipo.share < 1 && istZahl(ipo.proceeds))) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  if (value.ending !== null && value.ending !== 'kapitel' && value.ending !== 'pleite' && value.ending !== 'verkauft') {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const lg = value.logistics;
  const PIPELINE = ['none', 'surveyed', 'building', 'ready', 'damaged'];
  if (
    !istObjekt(lg) ||
    !['rng', 'tanks', 'tanksBuilding', 'teams', 'teamsIdleUntil', 'pipelineRounds', 'traderSold', 'traderLast', 'threatRound'].every((k) => istZahl(lg[k])) ||
    !PIPELINE.includes(lg.pipeline as string) ||
    typeof lg.guards !== 'boolean'
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  if (!istObjekt(value.shipped) || !['wagon', 'rail', 'teams', 'pipeline'].every((k) => istZahl((value.shipped as Record<string, unknown>)[k]))) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const RIG_KINDS = ['lent', 'owned', 'rented'];
  if (
    !(value.rigs as unknown[]).every(
      (r) => istObjekt(r) && istText(r.id) && RIG_KINDS.includes(r.kind as string) && istZahl(r.readyRound) && typeof r.steam === 'boolean' && typeof r.rods === 'boolean',
    )
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  // 4.16 Andockpunkt: Hallstead ist optional (fehlt in Kapitel 1); wenn da, muss es vollständig sein.
  if (!validHallstead(value.hallstead)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!isWorldState(value.worldModel)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.6 Andockpunkt: Die Raffinerie ist optional (fehlt in Kapitel 1); wenn sie da ist, muss sie stimmen.
  if (value.refinery !== undefined && !isRefineryState(value.refinery)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.7 Andockpunkt: Fernleitungen, falls freigeschaltet.
  if (!validBigPipelines(value.bigPipelines)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.8 Andockpunkt: Aktien, Aufsichtsrat, Anleihen (ab Kapitel 2, sonst fehlt das Feld).
  if (value.stocks !== undefined && !isStocksState(value.stocks)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.9 Andockpunkt: Personal ist freiwillig (Kapitel 1 ohne) – wenn da, muss es vollständig sein.
  if (value.staff !== undefined && !isStaffState(value.staff)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.10 Andockpunkt: Rivalen-Diplomatie fehlt in Kapitel 1 (und in älteren Ständen) – dann nichts zu prüfen.
  if (value.diplomacy !== undefined && !validDiplomacy(value.diplomacy)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.11 Andockpunkt: Ermittlung und Forschung gibt es erst ab Kapitel 2 – fehlen sie, ist das in Ordnung.
  if (value.investigation !== undefined && !validInvestigation(value.investigation)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (value.research !== undefined && !validResearch(value.research)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.14 Andockpunkt: Marke und Tankstellen – fehlt vor Kapitel 3 (und in älteren Ständen) ganz.
  if (value.brand !== undefined && !isBrandState(value.brand)) return { ok: false, reason: UNVOLLSTAENDIG };
  // 4.15 Andockpunkt: Börse – fehlt sie, ist das gültig (Kapitel 1 und 2).
  if (!validExchange(value.exchange)) return { ok: false, reason: UNVOLLSTAENDIG };
  const round = value.round as number;
  const totalRounds = value.totalRounds as number;
  return round >= 1 && round <= totalRounds ? { ok: true, state: value as unknown as GameState } : { ok: false, reason: UNVOLLSTAENDIG };
}

/**
 * Macht aus dem Zustand den Text für den localStorage: Bau, Spielversion,
 * Runde und der Zustand selbst. Der Zustand wird nur gelesen, nicht verändert.
 */
export function serializeGame(state: GameState, appVersion: string): string {
  const file: SaveFile = { format: SAVE_FORMAT, appVersion, savedRound: state.round, state };
  return JSON.stringify(file);
}

/**
 * Liest einen Spielstand zurück. Ein kaputter Text, ein fremdes format und ein
 * unvollständiger Zustand sind drei verschiedene Fehler, damit die Oberfläche
 * sagen kann, was los ist.
 */
export function deserializeGame(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: KAPUTT };
  }
  if (!istObjekt(parsed) || !istZahl(parsed.format) || (parsed.format !== SAVE_FORMAT && !ALTE_FORMATE.includes(parsed.format))) {
    return { ok: false, reason: FREMDE_VERSION };
  }
  if (!istObjekt(parsed.state)) return validateState(parsed.state);
  let state: Record<string, unknown> = parsed.state;
  // Ersatzwert (2.2): Spielstände aus 0.2.1 kennen noch keine Merkzeichen.
  if (istObjekt(state.events) && state.events.marks === undefined) {
    state = { ...state, events: { ...state.events, marks: {} } };
  }
  // Ersatzwerte (2.4): Spielstände aus Format 2 und 3 kennen noch keine Fristen
  // und Briefarten – offene Ereignisse laufen in dieser Runde ab, die Garantie zählt ab Runde 0.
  if (istObjekt(state.events) && (state.events.due === undefined || state.events.lastMail === undefined)) {
    state = { ...state, events: { ...state.events, due: state.events.due ?? {}, lastMail: state.events.lastMail ?? {} } };
  }
  // Ersatzwert (2.5): Spielstände bis Format 4 kennen keine Dokumente – offene Briefe gelten als echt.
  if (istObjekt(state.events) && state.events.docs === undefined) {
    state = { ...state, events: { ...state.events, docs: {} } };
  }
  // Ersatzwert (2.10a): Spielstände bis Format 7 kennen keinen Wiederholungsschutz –
  // was schon kam, darf ab sofort wieder kommen (once gilt weiter über seen).
  if (istObjekt(state.events) && state.events.lastSeen === undefined) {
    state = { ...state, events: { ...state.events, lastSeen: {} } };
  }
  // Ersatzwert (0.2.15+3): Spielstände bis Format 10 kennen keine befristeten Nachwirkungen.
  if (istObjekt(state.events) && state.events.timed === undefined) {
    state = { ...state, events: { ...state.events, timed: [] } };
  }
  // Ersatzwerte (2.7): Spielstände bis Format 5 kennen keine Familie und keine
  // Krankheit – Jacob ist gesund, Ruth zufrieden (70 wie in balance.yaml).
  // Thomas kommt zu Beginn der nächsten Runde zur Welt, falls seine Runde schon vorbei ist.
  if (state.sick === undefined) state = { ...state, sick: 0 };
  if (state.family === undefined) state = { ...state, family: { ruth: 70, thomas: 0, thomasBorn: 0, time: 0 } };
  // Ersatzwert (2.8): Spielstände bis Format 6 kennen keine Wildcatter – die
  // Nachbarquellen bleiben namenlos (der Markt rechnet sie trotzdem mit).
  if (state.wildcatters === undefined) state = { ...state, wildcatters: { rng: 0, firms: [] } };
  // Ersatzwert (2.11): Spielstände bis Format 8 kennen keinen Börsengang – noch nicht entschieden.
  if (state.ipo === undefined) state = { ...state, ipo: null };
  // Ersatzwerte (0.2.15+2): Spielstände bis Format 9 kennen kein Lager, keine eigenen
  // Fuhrwerke, keine Pipeline – Jacob fängt damit bei null an.
  if (state.logistics === undefined && istText(state.seed)) state = { ...state, logistics: newLogistics(state.seed) };
  if (istObjekt(state.shipped) && (state.shipped.teams === undefined || state.shipped.pipeline === undefined)) {
    state = { ...state, shipped: { teams: 0, pipeline: 0, ...state.shipped } };
  }
  // Ersatzwert (0.2.15+7): Spielstände bis Format 12 kennen keine Türme – Jacob hat Silas' geliehenen.
  if (state.rigs === undefined) state = { ...state, rigs: [{ id: 'silas', kind: 'lent', readyRound: 1, steam: false, rods: false }] };
  // Ersatzwert (4.1): Spielstände bis Format 13 kennen kein Weltmodell – eine ruhige Durchschnittswelt aus dem Seed.
  if (state.worldModel === undefined && istText(state.seed)) state = { ...state, worldModel: neutralWorld(state.seed) };
  // Ersatzwerte (4.2): Weltzustände aus Format 14 kennen kein öffentliches Handeln und keine gemerkte Wahl.
  if (state.worldModel !== undefined) state = { ...state, worldModel: withPoliticsDefaults(state.worldModel) };
  return validateState(state);
}