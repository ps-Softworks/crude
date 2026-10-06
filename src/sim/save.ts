// Spielstand sichern und laden (1.13): Der Zustand ist reines JSON, also lässt
// er sich als Text in den localStorage legen. Die Zahl format sagt, welcher Bau
// das ist: passt sie nicht, wird der Spielstand nicht geraten, sondern
// verworfen. Keine Spielregeln hier, nur sichern und prüfen, ob der Zustand
// vollständig ist.

import { validDiplomacy } from './diplomacy'; // 4.10 Andockpunkt
import { ENDINGS, type GameState } from './game';
import { validConsequences } from './eventSystems';
import { validReputation } from './reputation';
import { newLogistics } from './logistics';
import { isWorldState, neutralWorld, withCreditForeignDefaults, withLawDefaults, withPoliticsDefaults } from './world';
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
import { isKapitel3State } from './kapitel3'; // 4.17 Andockpunkt
import { validRivalsK3 } from './rivalsK3'; // 4.19 Andockpunkt
import { validFeldzug } from './feldzug'; // 0.4.20+8
// Termine als Hauptwerkzeug, Etappe 2: Preis- und Transport-Aktionen.
import { isPricingState, newPricing } from './pricing';
import { isFreightState, newFreight } from './freight';

/** Bau des Spielstandformats. Nur hochzählen, wenn sich der Zustand ändert. 2 = mit Ereignissen (2.1), 3 = mit Terminen und Kraft (2.3), 4 = mit Posteingang (Fristen, Briefarten, 2.4), 5 = mit Dokumentenprüfung (2.5), 6 = mit Familie und Krankheit (2.7), 7 = mit Wildcattern und Übernahme-Ende (2.8), 8 = mit Wiederholungsschutz der Ereignisse (2.10a), 9 = mit Börsengang am Kapitelende (2.11), 10 = mit Lager, eigenen Fuhrwerken, Pipeline und Händler (0.2.15+2), 11 = mit befristeten Nachwirkungen der Ereignisse (0.2.15+3), 12 = Karte mit Gebieten und Ranches statt Raster, mehrere Bohrlöcher je Ranch (0.2.15+5), 13 = Bohrtürme und Pumpen (0.2.15+7), 14 = mit Weltmodell (4.1), 15 = mit öffentlichem Handeln und Wahlergebnis im Weltmodell (4.2), 16 = mit Gesetzgebung im Weltmodell (4.3), 17 = mit Kreditzyklus (Verschuldung, Bankpanik) und Ausland (Costa Negra, Qasir) im Weltmodell (4.4), 18 = mit Kapitel, Zeitsprung und Chronik (4.5; Beteiligungen `ventures` sind freiwillig – fehlen sie, gibt es keine), 19 = mit den Systemen der Kapitel 2 und 3 (4.6–4.17: refinery, bigPipelines, stocks, staff, diplomacy, investigation, research, brand, exchange, hallstead, kapitel3 – alle freiwillig, fehlen sie, ist das System noch nicht offen), 20 = Kapitel 2 spielbar (4.12): frühe Enden abgesetzt/geschluckt/haft, Ruf (reputation) und Folgen der Ereignisse (consequences) – beide freiwillig, fehlen sie, ist noch nichts geschehen; Spuren aus Ereignissen mit Beschriftung, 21 = Zeitsprung II und Kapitel 3 spielbar (4.19): Rivalen in Kapitel 3 (rivalsK3, freiwillig – fehlt er, hat Kapitel 3 noch nicht begonnen), Chronik mit Zeitsprung-Nummer 2, 22 = Termine als Hauptwerkzeug (Etappen 1–3): Wissensstand je Ranch (knowledge), Erkundung (exploration), Planungsbrett (plans), verdeckte Fundchance je Ranch (Parcel.chance, freiwillig), Preis-Aktionen (pricing), Transport-Aktionen (freight, abgesprungene Mitglieder der Transportgemeinschaft freight.poolLeft freiwillig), Ruf bei den Wildcattern (wildcatterStanding), 23 = Cranes Feldzug in Kapitel 3 (feldzug, freiwillig – fehlt er, ist die Marke noch nicht gegründet), 24 = heißes Öl unter Förderquoten (hotOil, freiwillig) und Steuergrundlage zu Rundenbeginn (taxBase, freiwillig – fehlt sie, zählt das Rundenende), 25 = Feldkauf: Wartezeit nach Bullards Ablehnung je Ranch (buyouts, freiwillig)., 26 = Forschungsrichtung je Kapitel (research.direction) und letzter Abschluss (research.done), beide freiwillig, 27 = Deals im Adressbuch (deals, freiwillig – fehlt er, läuft keiner), 28 = Netzwerk (network, freiwillig – fehlt es, kennt Jacob alle Stellen). */
export const SAVE_FORMAT = 28;

/**
 * Ältere Formate, die mit Ersatzwerten noch geladen werden. Vor Format 12 keins
 * mehr: Die Rasterparzellen der alten Stände passen nicht auf die neue Karte.
 * Format 12 bekommt Silas' Turm (0.2.15+7), Format 12 und 13 eine ruhige Durchschnittswelt (4.1), Format 14 leere Listen für öffentliches Handeln und keine gemerkte Wahl (4.2),
 * bis Format 17 Kapitel 1 ohne Zeitsprung (4.5). Format 19 lädt unverändert: Ruf und Folgen fehlen dort noch (= nichts geschehen).
 * Format 20 lädt unverändert: Die Rivalen in Kapitel 3 fehlen dort (Kapitel 3 war noch nicht spielbar).
 * Bis Format 21 (Termine als Hauptwerkzeug): Wissensstufe 2 auf jeder Ranch mit Prognose, kein Geologe und ein
 * leeres Planungsbrett, keine Preis- und Transport-Aktionen und ein unbeschriebener Ruf bei den Wildcattern.
 * Format 22 lädt unverändert: Cranes Feldzug fehlt dort (= noch nicht begonnen).
 * Die Umrisse der Ranches stehen nie im Spielstand – sie kommen aus dem Seed.
 */
const ALTE_FORMATE: number[] = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

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
  'chapter',
  'chapterStart',
  'neighbourOffset',
  'wildcatterStanding',
] as const;

/** Listen im Zustand. */
const LISTEN = ['regions', 'parcels', 'fields', 'leases', 'options', 'wells', 'rigs', 'priceHistory', 'loans', 'log', 'timeskips'] as const;

/** Nachschlagewerke im Zustand. */
const OBJEKTE = ['forecasts', 'shipped', 'knowledge'] as const;

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
  // Kapitel (Phase 4): darf fehlen (= Kapitel 1), sonst eine Zahl.
  if (value.chapter !== undefined && !istZahl(value.chapter)) return { ok: false, reason: KAPUTT };
  // Verlauf (0.4.20+42): freiwillig, sonst eine Liste von Einträgen mit Zahlen.
  if (value.history !== undefined && !(istListe(value.history) && value.history.every((e) => istObjekt(e) && ['r', 'k', 'cash', 'debt', 'value', 'out', 'price'].every((k) => istZahl(e[k]))))) return { ok: false, reason: KAPUTT };
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
  // Erkundung und Planungsbrett (Etappe 1).
  if (!Object.values(value.knowledge as Record<string, unknown>).every((k) => istObjekt(k) && istZahl(k.level) && istListe(k.clues))) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const ex = value.exploration;
  if (!istObjekt(ex) || !istObjekt(ex.record) || !istZahl(ex.record.hits) || !istZahl(ex.record.misses)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (ex.geologist !== undefined && !(istObjekt(ex.geologist) && istText(ex.geologist.id) && istZahl(ex.geologist.accuracy) && istZahl(ex.geologist.bias) && istZahl(ex.geologist.wage))) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  const plans = value.plans;
  if (!istObjekt(plans) || !istZahl(plans.round) || !istListe(plans.booked) || !istListe(plans.report)) return { ok: false, reason: UNVOLLSTAENDIG };
  // Preis- und Transport-Aktionen (Etappe 2).
  if (!isPricingState(value.pricing) || !isFreightState(value.freight)) return { ok: false, reason: UNVOLLSTAENDIG };
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
  if (value.ending !== null && !(ENDINGS as readonly unknown[]).includes(value.ending)) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  // 4.12: Ruf und Folgen der Ereignisse sind freiwillig – wenn da, müssen sie stimmen.
  if (!validReputation(value.reputation) || !validConsequences(value.consequences)) return { ok: false, reason: UNVOLLSTAENDIG };
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
  // Kapitel und Zeitsprung (4.5).
  const chapter = value.chapter as number;
  if (!Number.isInteger(chapter) || chapter < 1 || (value.chapterStart as number) < 1) return { ok: false, reason: UNVOLLSTAENDIG };
  const jump = value.jump;
  if (jump !== null && !(istObjekt(jump) && istObjekt(jump.directives) && istText(jump.directives.stance) && istText(jump.directives.family) && istObjekt(jump.answers))) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  if (
    !(value.timeskips as unknown[]).every(
      (t) => istObjekt(t) && istZahl(t.number) && istListe(t.entries) && istListe(t.switches) && istObjekt(t.before) && istObjekt(t.after) && typeof t.read === 'boolean',
    )
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  // Beteiligungen (4.5) sind freiwillig: Fehlen sie, gibt es keine.
  const v = value.ventures;
  if (
    v !== undefined &&
    !(
      istObjekt(v) &&
      (v.benzin === undefined || (istObjekt(v.benzin) && istZahl(v.benzin.since))) &&
      (v.okara === undefined ||
        (istObjekt(v.okara) && (v.okara.holder === 'jacob' || v.okara.holder === 'bullard') && typeof v.okara.oil === 'boolean' && istZahl(v.okara.since)))
    )
  ) {
    return { ok: false, reason: UNVOLLSTAENDIG };
  }
  // Feldkauf (0.4.20+27): Wartezeit je Ranch – freiwillig, wenn da: Ranch-Kennung → Runde.
  if (value.buyouts !== undefined && (!istObjekt(value.buyouts) || !Object.values(value.buyouts).every(istZahl))) return { ok: false, reason: UNVOLLSTAENDIG };
  // Pleitefrist mit Auswegen (insolvency.ts): freiwillig, wenn da: Beginn und Rating vor der Krise.
  if (value.insolvency !== undefined && (!istObjekt(value.insolvency) || !istZahl(value.insolvency.since) || !['A', 'B', 'C', 'D'].includes(value.insolvency.ratingBefore as string))) return { ok: false, reason: UNVOLLSTAENDIG };
  // Zweiter Anlauf (secondChance.ts): freiwillig, wenn da: Runde des Neuanfangs.
  if (value.secondChance !== undefined && (!istObjekt(value.secondChance) || !istZahl(value.secondChance.round))) return { ok: false, reason: UNVOLLSTAENDIG };
  // 0.4.20+31: Deals im Adressbuch.
  if (value.deals !== undefined) {
    const d = value.deals;
    if (!istObjekt(d) || !istObjekt(d.cooldown) || !Object.values(d.cooldown).every(istZahl) || !istZahl(d.deferRound) || !istZahl(d.bulkRound) || !istZahl(d.guardRound)) return { ok: false, reason: UNVOLLSTAENDIG };
    if (d.pledgedRig !== null && !istText(d.pledgedRig)) return { ok: false, reason: KAPUTT };
    for (const k of ['railFixed', 'railQuota', 'advance', 'lent'] as const) if (d[k] !== null && !istObjekt(d[k])) return { ok: false, reason: KAPUTT };
  }
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
  // 4.17 Andockpunkt: Kapitel 3 ist freiwillig – fehlt in älteren Ständen und in Kapitel 1.
  if (value.kapitel3 !== undefined && !isKapitel3State(value.kapitel3)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!validRivalsK3(value.rivalsK3)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (!validFeldzug(value.feldzug)) return { ok: false, reason: UNVOLLSTAENDIG };
  if (value.hotOil !== undefined && typeof value.hotOil !== 'boolean') return { ok: false, reason: UNVOLLSTAENDIG };
  if (value.taxBase !== undefined && (typeof value.taxBase !== 'object' || value.taxBase === null || !istZahl((value.taxBase as { cash?: unknown }).cash) || !istZahl((value.taxBase as { debt?: unknown }).debt))) return { ok: false, reason: UNVOLLSTAENDIG };
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
  // Ersatzwerte (4.3): Weltzustände bis Format 15 kennen keine Gesetze – noch nichts beschlossen.
  if (state.worldModel !== undefined && istText(state.seed)) state = { ...state, worldModel: withLawDefaults(state.worldModel, state.seed) };
  // Ersatzwerte (4.4): Weltzustände bis Format 16 kennen keine Verschuldung, keine Bankpanik und kein Ausland.
  if (state.worldModel !== undefined) state = { ...state, worldModel: withCreditForeignDefaults(state.worldModel) };
  // Ersatzwerte (4.5): Spielstände bis Format 17 sind in Kapitel 1, ohne Zeitsprung und Chronik.
  if (state.chapter === undefined) state = { ...state, chapter: 1 };
  if (state.chapterStart === undefined) state = { ...state, chapterStart: 1 };
  if (state.neighbourOffset === undefined) state = { ...state, neighbourOffset: 0 };
  if (state.jump === undefined) state = { ...state, jump: null };
  if (state.timeskips === undefined) state = { ...state, timeskips: [] };
  // Ersatzwerte (Etappe 1): Spielstände bis Format 21 hatten Prognosen für jede Ranch – sie gelten
  // als kartiert (Stufe 2, ohne einzelne Hinweise); fehlt q, gilt das Wissen der Zone (trueChance).
  if (state.knowledge === undefined && istObjekt(state.forecasts)) {
    const knowledge: Record<string, unknown> = {};
    for (const id of Object.keys(state.forecasts)) knowledge[id] = { level: 2, clues: [] };
    state = { ...state, knowledge };
  }
  if (state.exploration === undefined) state = { ...state, exploration: { record: { hits: 0, misses: 0 } } };
  if (state.plans === undefined && istZahl(state.round)) state = { ...state, plans: { round: state.round, booked: [], report: [] } };
  // Ersatzwerte (Etappe 2): Spielstände bis Format 21 kennen keine Preis- und Transport-Aktionen – nichts läuft, der Ruf ist unbeschrieben.
  if (state.pricing === undefined) state = { ...state, pricing: newPricing() };
  if (state.freight === undefined) state = { ...state, freight: newFreight() };
  if (state.wildcatterStanding === undefined) state = { ...state, wildcatterStanding: 0 };
  return validateState(state);
}