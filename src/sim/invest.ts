// Ausbau einer Quelle (0.2.15+7): Lohnt sich ein weiteres Bohrloch oder eine
// Pumpe? Die Rechnung spielt Jacobs Förderung bis zum Kapitelende zweimal durch –
// einmal wie sie ist, einmal mit der Investition – mit denselben Regeln wie die
// Förderung (Rückgang, Felddruck, förderbare Menge) und wie der Markt (mehr
// Angebot am Salt Hill = tieferer Posted Price für ALLE Barrel Jacobs). Der
// Unterschied im Erlös nach Fracht und Förderzins, minus Kosten und Unterhalt,
// ergibt Gewinn und Amortisation. Gute Quellen tragen die festen Kosten schnell,
// schwache nie; zu viele Löcher auf einem Feld drücken den Druck aller Quellen,
// und zu viel Öl drückt den Preis – beides kann eine Investition ins Minus drehen.
// Reine Rechnung, ohne Zufall und ohne den Zustand zu ändern.

import { TRANSPORT_MODES, type Balance } from './balance';
import { drillQuote, freeSlots, wellsOn, type Well } from './drilling';
import { fieldOf } from './field';
import type { GameState } from './game';
import { leaseOf } from './lease';
import { fieldWells, initialRate, recoverable, wellRate } from './production';
import { pumpTarget } from './rigs';
import { computePrice, neighbourSupply, rivalSupply } from './market';
import { worldPriceFactor } from './world';
import { buyerPrice, modeUnavailable, netPrice, tariff } from './transport';

export interface Outlook {
  /** Einmalige Kosten in $. */
  cost: number;
  /** Laufende Kosten je Runde in $ (Pumpe). */
  upkeep: number;
  /** Runden, bis die Investition wirkt (Bohrdauer). */
  delay: number;
  /** Mehrförderung in der ersten Runde, in der sie wirkt (bbl). */
  extraFirst: number;
  /** Mehrförderung bis Kapitelende (bbl); kann negativ sein, wenn der Druck aller Quellen sinkt. */
  extraTotal: number;
  /** Was ein Barrel heute nach Fracht und Förderzins in die Kasse bringt ($). */
  netPerBarrel: number;
  /** Um so viel $ je Barrel drückt die Mehrförderung den Preis in der ersten Runde, in der sie wirkt. */
  priceDrop: number;
  /** Gewinn bis Kapitelende nach Kosten und Unterhalt ($). */
  profit: number;
  /** Runden ab jetzt, bis die Kosten wieder drin sind; null = nicht bis Kapitelende. */
  payback: number | null;
  /** Gerechnete Runden (bis Kapitelende). */
  horizon: number;
}

/** Eine Quelle in der Vorausrechnung. start = Rundenindex, ab dem sie fördert (0 = Ende dieser Runde). */
interface Plan {
  initialRate: number;
  roundsProduced: number;
  pump: boolean;
  start: number;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Runden mit Förderung bis Kapitelende, die laufende mitgezählt. */
export function horizonOf(state: Pick<GameState, 'round' | 'totalRounds'>): number {
  return Math.max(0, state.totalRounds - state.round + 1);
}

/**
 * Was ein Barrel heute netto bringt: bester verfügbarer Weg zu Crane (Posted
 * Price minus Abschlag minus Fracht), minus Förderzins des Landbesitzers.
 */
export function netPerBarrel(state: GameState, balance: Balance, royalty: number): number {
  const wege = TRANSPORT_MODES.filter((m) => modeUnavailable(state, m) === null).map((m) => netPrice(state, balance, m));
  const fracht = wege.length > 0 ? Math.max(...wege) : 0;
  return Math.max(0, fracht - buyerPrice(state, balance) * royalty);
}

/**
 * Förderung der Quellen eines Feldes je Runde bis zum Horizont – mit denselben
 * Regeln wie advanceProduction: Rückgang, Druck nach Zahl der Quellen, nie mehr
 * als die förderbare Menge (die bei Überförderung schrumpft).
 */
export function projectField(
  balance: Balance,
  plans: readonly Plan[],
  reserves: number,
  peakWells: number,
  produced: number,
  horizon: number,
): number[] {
  const out: number[] = [];
  let peak = peakWells;
  let bisher = produced;
  for (let i = 0; i < horizon; i++) {
    const aktiv = plans.filter((p) => p.start <= i);
    const n = aktiv.length;
    peak = Math.max(peak, n);
    const rest = Math.max(0, recoverable(balance, reserves, peak) - bisher);
    const gewollt = aktiv.reduce(
      (s, p) => s + wellRate(balance, { pump: p.pump, production: { initialRate: p.initialRate, roundsProduced: p.roundsProduced + (i - p.start), lastRate: 0, total: 0 } }, n),
      0,
    );
    const bekommen = Math.min(gewollt, rest);
    bisher += bekommen;
    out.push(bekommen);
  }
  return out;
}

function planOf(well: Well): Plan {
  return { initialRate: well.production!.initialRate, roundsProduced: well.production!.roundsProduced, pump: !!well.pump, start: 0 };
}

/**
 * Netto je Barrel bei einem anderen Posted Price: Cranes Abschlag und die Fracht
 * bleiben, wie sie heute sind; der Förderzins geht vom Käuferpreis ab.
 */
function netAt(state: GameState, balance: Balance, royalty: number, price: number): number {
  const abschlag = state.postedPrice - buyerPrice(state, balance);
  const kaeufer = Math.max(0, price - abschlag);
  const wege = TRANSPORT_MODES.filter((m) => modeUnavailable(state, m) === null).map((m) => tariff(state, balance, m));
  const fracht = wege.length > 0 ? Math.min(...wege) : 0;
  return Math.max(0, kaeufer * (1 - royalty) - fracht);
}

/** Posted Price je Runde für Jacobs Förderung, die Nachbarn (die jede Runde mehr werden) und Bullard; der Welttrend bleibt, wie er heute ist. */
function pricesFor(state: GameState, balance: Balance, jacob: readonly number[]): number[] {
  const bullard = rivalSupply(state, balance.rivals.bullard.ratePerWell);
  const trend = worldPriceFactor(state.worldModel, balance.worldModel);
  return jacob.map((bbl, i) => computePrice(balance.market, bbl + neighbourSupply(balance.market, state.round + i, state.neighbourOffset ?? 0) + bullard, trend));
}

/**
 * Kennzahlen aus zwei Vorausrechnungen: Erlös mit und ohne Investition (alle
 * Barrel Jacobs, jeweils zum Preis, den das Angebot ergibt), minus Kosten und
 * Unterhalt. upkeep fällt ab delay an, solange die Investition fördert (aktiv).
 */
function outlookOf(
  state: GameState,
  balance: Balance,
  royalty: number,
  ohne: readonly number[],
  mit: readonly number[],
  aktiv: readonly boolean[],
  cost: number,
  upkeep: number,
  delay: number,
): Outlook {
  const preisOhne = pricesFor(state, balance, ohne);
  const preisMit = pricesFor(state, balance, mit);
  let kasse = -cost;
  let payback: number | null = null;
  for (let i = 0; i < ohne.length; i++) {
    const erloes = mit[i] * netAt(state, balance, royalty, preisMit[i]) - ohne[i] * netAt(state, balance, royalty, preisOhne[i]);
    kasse += erloes - (upkeep > 0 && i >= delay && aktiv[i] ? upkeep : 0);
    if (payback === null && kasse >= 0 && i >= delay) payback = i + 1;
  }
  const extra = mit.map((m, i) => m - ohne[i]);
  return {
    cost,
    upkeep,
    delay,
    extraFirst: extra[delay] ?? 0,
    extraTotal: extra.reduce((s, x) => s + x, 0),
    netPerBarrel: netPerBarrel(state, balance, royalty),
    priceDrop: cents((preisOhne[delay] ?? 0) - (preisMit[delay] ?? 0)),
    profit: cents(kasse),
    payback,
    horizon: ohne.length,
  };
}

/** Jacobs Förderung je Runde auf allen anderen Feldern (ohne fieldId) – sie bekommt den gedrückten Preis mit ab. */
function otherFields(state: GameState, balance: Balance, fieldId: string, horizon: number): number[] {
  const summe = new Array<number>(horizon).fill(0);
  for (const field of state.fields) {
    if (field.id === fieldId) continue;
    const quellen = fieldWells(state, field.id).filter((w) => w.production);
    if (quellen.length === 0) continue;
    const produced = quellen.reduce((s, w) => s + (w.production?.total ?? 0), 0);
    projectField(balance, quellen.map(planOf), field.reserves, field.peakWells, produced, horizon).forEach((b, i) => (summe[i] += b));
  }
  return summe;
}

/** Feld-Daten für die Vorausrechnung: Quellen, Reserve, Höchststand, schon gefördert. */
function feldLage(state: GameState, parcelId: string) {
  const field = fieldOf(state, parcelId);
  if (!field) return null;
  const quellen = fieldWells(state, field.id).filter((w) => w.production);
  return {
    id: field.id,
    quellen,
    reserves: field.reserves,
    peak: field.peakWells,
    produced: quellen.reduce((s, w) => s + (w.production?.total ?? 0), 0),
  };
}

/**
 * Lohnt ein weiteres Bohrloch auf dieser Ranch? null, wenn hier keins geht
 * (keine Quelle, keine freien Bohrplätze, keine eigene Pacht).
 * Kosten und Dauer wie startDrilling (gleich auf die Tiefe der Quelle).
 */
export function wellOutlook(state: GameState, balance: Balance, parcelId: string): Outlook | null {
  const lease = leaseOf(state, parcelId);
  if (!lease || lease.holder !== 'jacob' || freeSlots(state, parcelId) === 0) return null;
  const quelle = wellsOn(state, parcelId).find((w) => w.status === 'found' && w.result);
  const lage = feldLage(state, parcelId);
  if (!quelle || !lage) return null;
  const q = drillQuote(state, balance, parcelId);
  const horizon = horizonOf(state);
  const basis = lage.quellen.map(planOf);
  const neu: Plan = { initialRate: initialRate(balance, state, { parcelId, result: quelle.result! }), roundsProduced: 0, pump: false, start: q.rounds };
  const rest = otherFields(state, balance, lage.id, horizon);
  const ohne = projectField(balance, basis, lage.reserves, lage.peak, lage.produced, horizon).map((b, i) => b + rest[i]);
  const mit = projectField(balance, [...basis, neu], lage.reserves, lage.peak, lage.produced, horizon).map((b, i) => b + rest[i]);
  return outlookOf(state, balance, lease.royalty, ohne, mit, mit.map(() => false), q.cost, 0, Math.min(q.rounds, horizon));
}

/**
 * Lohnt eine Pumpe an der stärksten Quelle dieser Ranch, die noch keine hat?
 * null, wenn es keine solche Quelle gibt.
 */
export function pumpOutlook(state: GameState, balance: Balance, parcelId: string): Outlook | null {
  const ziel = pumpTarget(state, parcelId);
  const lage = feldLage(state, parcelId);
  const lease = leaseOf(state, parcelId);
  if (!ziel || !lage || !lease) return null;
  const horizon = horizonOf(state);
  const basis = lage.quellen.map(planOf);
  const gepumpt = lage.quellen.map((w) => (w.id === ziel.id ? { ...planOf(w), pump: true } : planOf(w)));
  const rest = otherFields(state, balance, lage.id, horizon);
  const feldMit = projectField(balance, gepumpt, lage.reserves, lage.peak, lage.produced, horizon);
  const ohne = projectField(balance, basis, lage.reserves, lage.peak, lage.produced, horizon).map((b, i) => b + rest[i]);
  const mit = feldMit.map((b, i) => b + rest[i]);
  const p = balance.production.pump;
  return outlookOf(state, balance, lease.royalty, ohne, mit, feldMit.map((b) => b > 0), p.cost, p.upkeep, 0);
}

/** Lohnt es sich bis Kapitelende? (Kosten und Unterhalt wieder drin.) */
export function paysOff(outlook: Outlook | null): boolean {
  return outlook !== null && outlook.payback !== null;
}
