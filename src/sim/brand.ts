// Marke und Tankstellen (4.14, GDD §6 Vertrieb, §13 Kapitel 3).
//
// Ab Kapitel 3 kann Jacob eine eigene Marke gründen und in jeder Absatzregion
// Tankstellen bauen. Jede Region hat eine Benzinnachfrage (wächst mit der
// Automobilisierung); sie verteilt sich auf Jacobs Marke, Margaret Cranes Marke
// (Crane Eastern) und die freien Tankstellen – nach ihrer Anziehung:
//
//   Anziehung = Tankstellen^stationExponent × (awarenessBase + Bekanntheit/100)
//               × Preisfaktor (billig/normal/teuer) × Ruf (nur Jacob)
//   Marktanteil = eigene Anziehung / Summe aller Anziehungen
//   Absatz = Nachfrage × Marktanteil, höchstens Tankstellen × capacity
//   Gewinn = Absatz × Marge (im Preiskampf × priceWar.marginFactor) − Unterhalt
//
// Bekanntheit wächst mit den Schildern an der Straße (Wurzel der Tankstellen) und
// mit Werbung (Plakate, Radio, Gratis-Straßenkarten) und verblasst jede Runde ein
// Stück. Der Markenwert hängt am Ruf in der Öffentlichkeit: Ein Skandal senkt den
// Absatz sofort (Ruf geht direkt in die Anziehung) und kostet Bekanntheit.
//
// Margaret Crane antwortet mit eigenem Zufall (Seed + ":marke"): Wird Jacob in
// einer Region stark oder verkauft billig, beginnt sie einen Preiskampf; liegt
// ihr Anteil unter ihrem Ziel, baut sie neue Tankstellen.
//
// Freischaltung: Kapitel ≥ brand.unlockChapter (3). In Kapitel 1 und 2 ist
// alles hier unsichtbar – settleBrand gibt den Zustand unverändert zurück und
// zieht keinen Zufall. Kapitel, Ruf, Kreditcrash und eigenes Benzin kommen über
// die schmale Schnittstelle BrandWorld; brandWorldFrom liest sie aus dem
// Spielzustand, solange es die Systeme (4.1 Weltmodell, 4.5 Kapitel, Ruf,
// 4.13 Raffinerie) noch nicht gibt, mit Ersatzwerten.
//
// Reine Funktionen: Zustand rein, neuer Zustand raus. Kein React, kein DOM.

import { formatDate } from './calendar';
import type { GameState } from './game';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf } from './stocks'; // gemeinsamer Kapitel-Helfer (state.chapter aus 4.5)

// ---------------------------------------------------------------------------
// Spielzahlen (content/balance.yaml, Block „brand“)

export const PRICE_POLICIES = ['billig', 'normal', 'teuer'] as const;
/** Preis an der Zapfsäule. */
export type PricePolicy = (typeof PRICE_POLICIES)[number];

export interface BrandRegionBalance {
  id: string;
  /** Benzinnachfrage in bbl je Runde zu Kapitelbeginn. */
  demand: number;
  /** Faktor auf die Baukosten (Ostküste teuer, Cordova billig). */
  costFactor: number;
  /** Freie Tankstellen in der Region (zählen wie Stationen ohne Marke). */
  independents: number;
  /** Margaret Cranes Tankstellen und Bekanntheit zu Beginn. */
  craneStations: number;
  craneAwareness: number;
  /** Ab diesem Kapitel ist die Region offen (Sierra Alta später). */
  fromChapter: number;
}

export interface BrandCampaignBalance {
  id: string;
  cost: number;
  /** So viele Runden wirkt die Kampagne (die Startrunde mitgezählt). */
  rounds: number;
  /** Bekanntheit je Runde. */
  gain: number;
}

export interface BrandBalance {
  unlockChapter: number;
  foundCost: number;
  station: { cost: number; buildRounds: number; buildMax: number; upkeep: number; resale: number; capacity: number; maxPerRegion: number };
  share: { stationExponent: number; awarenessBase: number; reputationWeight: number; independentAwareness: number };
  prices: Record<PricePolicy, { attract: number; margin: number }>;
  priceWar: { marginFactor: number };
  awareness: { decay: number; perStation: number; scandalLoss: number };
  campaigns: BrandCampaignBalance[];
  demand: { growth: number; crashDrop: number };
  supply: { boughtCost: number };
  crane: {
    reactShare: number;
    warChance: number;
    warRounds: number;
    cooldown: number;
    expandChance: number;
    expandStations: number;
    targetShare: number;
    adGain: number;
  };
  value: { profitMultiple: number; assetShare: number };
  /** 0.4.20+6: Eine Region zählt, wenn Jacobs Marktanteil dort mindestens presenceShare ist (vorher: feste Zahl Tankstellen). */
  goal: { regions: number; share: number; presenceShare: number };
  antitrust: { regional: number; national: number };
  regions: BrandRegionBalance[];
}

/** Fehler im Block „brand“ von balance.yaml (eigene Klasse, damit brand.ts nicht balance.ts importieren muss). */
export class BrandBalanceError extends Error {}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(raw: unknown, path: string, min = -Infinity, max = Infinity): number {
  const v = wert(raw, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BrandBalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BrandBalanceError(`balance.yaml: "${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

function ganz(raw: unknown, path: string, min: number): number {
  const v = zahl(raw, path, min);
  if (!Number.isInteger(v)) throw new BrandBalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab ${min} sein`);
  return v;
}

function liste(raw: unknown, path: string): unknown[] {
  const v = wert(raw, path);
  if (!Array.isArray(v) || v.length === 0) throw new BrandBalanceError(`balance.yaml: "${path}" fehlt oder ist leer`);
  return v;
}

function kennung(raw: unknown, path: string): string {
  const v = wert(raw, path);
  if (typeof v !== 'string' || !/^[a-z0-9_]+$/.test(v)) throw new BrandBalanceError(`balance.yaml: "${path}" muss eine Kennung aus a–z, 0–9 und _ sein`);
  return v;
}

/** Liest den Block „brand“ aus den rohen Daten von balance.yaml. */
export function parseBrandBalance(raw: unknown): BrandBalance {
  if (!wert(raw, 'brand') || typeof wert(raw, 'brand') !== 'object') throw new BrandBalanceError('balance.yaml: Block "brand" fehlt');
  const p = 'brand';
  const prices = Object.fromEntries(
    PRICE_POLICIES.map((id) => [id, { attract: zahl(raw, `${p}.prices.${id}.attract`, 0), margin: zahl(raw, `${p}.prices.${id}.margin`) }]),
  ) as BrandBalance['prices'];
  if (!(prices.billig.attract >= prices.normal.attract && prices.normal.attract >= prices.teuer.attract)) {
    throw new BrandBalanceError('balance.yaml: "brand.prices" – billig muss mindestens so anziehend sein wie normal, normal mindestens wie teuer');
  }
  if (!(prices.billig.margin <= prices.normal.margin && prices.normal.margin <= prices.teuer.margin)) {
    throw new BrandBalanceError('balance.yaml: "brand.prices" – die Marge muss von billig über normal zu teuer steigen');
  }
  const campaigns = liste(raw, `${p}.campaigns`).map((_, i) => ({
    id: kennung(raw, `${p}.campaigns.${i}.id`),
    cost: zahl(raw, `${p}.campaigns.${i}.cost`, 0),
    rounds: ganz(raw, `${p}.campaigns.${i}.rounds`, 1),
    gain: zahl(raw, `${p}.campaigns.${i}.gain`, 0, 100),
  }));
  const regions = liste(raw, `${p}.regions`).map((_, i) => {
    const q = `${p}.regions.${i}`;
    return {
      id: kennung(raw, `${q}.id`),
      demand: zahl(raw, `${q}.demand`, 0),
      costFactor: zahl(raw, `${q}.costFactor`, 0.01),
      independents: zahl(raw, `${q}.independents`, 0),
      craneStations: ganz(raw, `${q}.craneStations`, 0),
      craneAwareness: zahl(raw, `${q}.craneAwareness`, 0, 100),
      fromChapter: ganz(raw, `${q}.fromChapter`, 1),
    };
  });
  for (const [what, ids] of [
    ['regions', regions.map((r) => r.id)],
    ['campaigns', campaigns.map((c) => c.id)],
  ] as const) {
    const doppelt = ids.find((id, i) => ids.indexOf(id) !== i);
    if (doppelt) throw new BrandBalanceError(`balance.yaml: "brand.${what}" – die Kennung "${doppelt}" steht zweimal da`);
  }
  const b: BrandBalance = {
    unlockChapter: ganz(raw, `${p}.unlockChapter`, 1),
    foundCost: zahl(raw, `${p}.foundCost`, 0),
    station: {
      cost: zahl(raw, `${p}.station.cost`, 0),
      buildRounds: ganz(raw, `${p}.station.buildRounds`, 1),
      buildMax: ganz(raw, `${p}.station.buildMax`, 1),
      upkeep: zahl(raw, `${p}.station.upkeep`, 0),
      resale: zahl(raw, `${p}.station.resale`, 0, 1),
      capacity: zahl(raw, `${p}.station.capacity`, 1),
      maxPerRegion: ganz(raw, `${p}.station.maxPerRegion`, 1),
    },
    share: {
      stationExponent: zahl(raw, `${p}.share.stationExponent`, 0.1, 1.5),
      awarenessBase: zahl(raw, `${p}.share.awarenessBase`, 0, 1),
      reputationWeight: zahl(raw, `${p}.share.reputationWeight`, 0, 0.9),
      independentAwareness: zahl(raw, `${p}.share.independentAwareness`, 0, 1),
    },
    prices,
    priceWar: { marginFactor: zahl(raw, `${p}.priceWar.marginFactor`, 0, 1) },
    awareness: {
      decay: zahl(raw, `${p}.awareness.decay`, 0, 1),
      perStation: zahl(raw, `${p}.awareness.perStation`, 0),
      scandalLoss: zahl(raw, `${p}.awareness.scandalLoss`, 0, 100),
    },
    campaigns,
    demand: { growth: zahl(raw, `${p}.demand.growth`, -0.5, 0.5), crashDrop: zahl(raw, `${p}.demand.crashDrop`, 0, 1) },
    supply: { boughtCost: zahl(raw, `${p}.supply.boughtCost`, 0) },
    crane: {
      reactShare: zahl(raw, `${p}.crane.reactShare`, 0, 1),
      warChance: zahl(raw, `${p}.crane.warChance`, 0, 1),
      warRounds: ganz(raw, `${p}.crane.warRounds`, 1),
      cooldown: ganz(raw, `${p}.crane.cooldown`, 0),
      expandChance: zahl(raw, `${p}.crane.expandChance`, 0, 1),
      expandStations: ganz(raw, `${p}.crane.expandStations`, 1),
      targetShare: zahl(raw, `${p}.crane.targetShare`, 0, 1),
      adGain: zahl(raw, `${p}.crane.adGain`, 0, 100),
    },
    value: { profitMultiple: zahl(raw, `${p}.value.profitMultiple`, 0), assetShare: zahl(raw, `${p}.value.assetShare`, 0, 1) },
    goal: { regions: ganz(raw, `${p}.goal.regions`, 1), share: zahl(raw, `${p}.goal.share`, 0, 1), presenceShare: zahl(raw, `${p}.goal.presenceShare`, 0, 1) },
    antitrust: { regional: zahl(raw, `${p}.antitrust.regional`, 0, 1), national: zahl(raw, `${p}.antitrust.national`, 0, 1) },
    regions,
  };
  if (b.goal.regions > regions.length) throw new BrandBalanceError('balance.yaml: "brand.goal.regions" verlangt mehr Regionen, als es gibt');
  if (regions.some((r) => r.craneStations > b.station.maxPerRegion)) {
    throw new BrandBalanceError('balance.yaml: "brand.regions" – Crane hat irgendwo mehr Tankstellen als station.maxPerRegion erlaubt');
  }
  if (!regions.some((r) => r.fromChapter <= b.unlockChapter)) {
    throw new BrandBalanceError('balance.yaml: "brand.regions" – im Kapitel der Freischaltung ist keine Region offen');
  }
  return b;
}

/** Nur was brand.ts aus den Spielzahlen braucht – so bleibt die Abhängigkeit schmal. */
export interface WithBrand {
  brand: BrandBalance;
}

// ---------------------------------------------------------------------------
// Schnittstelle zur Welt (Ersatzwerte, bis 4.1/4.5/Ruf/4.13 da sind)

/**
 * Was die Marke von außen braucht. Alle Werte haben Ersatzwerte, damit die Marke
 * ohne Weltmodell läuft und testbar ist.
 */
export interface BrandWorld {
  /** Laufendes Kapitel (4.5). Ersatz: 1. */
  chapter: number;
  /** Ruf in der Öffentlichkeit −100 … +100 (GDD §4, Ruf-Achse „Öffentlichkeit“). Ersatz: 0 (neutral). */
  reputation: number;
  /** Läuft gerade ein Kreditcrash (Weltmodell 4.1, state.worldModel.crash > 0)? Ersatz: nein. */
  crash: boolean;
  /** Zusatzfaktor auf die Benzinnachfrage aus dem Weltmodell (Automobilisierung). Ersatz: 1. */
  motorization: number;
  /** Benzin aus eigener Raffinerie in bbl je Runde (4.13). null = kein Raffinerie-Modul: Benzin reicht immer. */
  ownGasoline: number | null;
  /** 0.4.20+8: Cranes Feldzug – Faktor auf Jacobs Marge in Regionen mit seinen Tankstellen (state.feldzug.dumping). Ersatz: 1. */
  dumping: number;
}

export const DEFAULT_BRAND_WORLD: BrandWorld = { chapter: 1, reputation: 0, crash: false, motorization: 1, ownGasoline: null, dumping: 1 };

/** Felder, die andere Systeme später in den Spielzustand legen. Alles optional. */
interface FremdeFelder {
  brand?: { previewChapter?: unknown } | null;
  /** Weltmodell aus 4.1 (auf main: GameState.worldModel: WorldState). */
  worldModel?: { crash?: unknown } | null;
  reputation?: { public?: unknown } | null;
  /** 0.4.20+8: Cranes Feldzug (src/sim/feldzug.ts). */
  feldzug?: { phase?: unknown; dumping?: unknown; pact?: unknown } | null;
}

function endlich(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * 4.x Andockpunkt: liest Kapitel (gemeinsamer Helfer chapterOf, state.chapter aus 4.5), Kreditcrash (4.1:
 * state.worldModel.crash, Runden Nachwirkung) und Ruf (state.reputation.public) aus dem Spielzustand,
 * wenn es sie gibt – sonst Ersatzwerte. overrides gewinnt (Tests, Debug).
 */
export function brandWorldFrom(state: object, overrides: Partial<BrandWorld> = {}): BrandWorld {
  const s = state as FremdeFelder;
  const vorab = s.brand && endlich(s.brand.previewChapter) ? s.brand.previewChapter : 1;
  const chapter = Math.max(chapterOf(state), vorab);
  const crash = s.worldModel && endlich(s.worldModel.crash) ? s.worldModel.crash > 0 : DEFAULT_BRAND_WORLD.crash;
  const reputation = s.reputation && endlich(s.reputation.public) ? Math.max(-100, Math.min(100, s.reputation.public)) : DEFAULT_BRAND_WORLD.reputation;
  const dumping = s.feldzug && s.feldzug.phase === 'krieg' && endlich(s.feldzug.dumping) ? s.feldzug.dumping : 1;
  return { ...DEFAULT_BRAND_WORLD, chapter, crash, reputation, dumping, ...overrides };
}

/** Ist das System in diesem Kapitel freigeschaltet? */
export function brandUnlocked(world: Pick<BrandWorld, 'chapter'>, balance: WithBrand): boolean {
  return world.chapter >= balance.brand.unlockChapter;
}

/** Ist die Region in diesem Kapitel offen? Unbekannte Regionen nie. */
export function brandRegionOpen(world: Pick<BrandWorld, 'chapter'>, balance: WithBrand, regionId: string): boolean {
  const r = balance.brand.regions.find((x) => x.id === regionId);
  return r !== undefined && brandUnlocked(world, balance) && world.chapter >= r.fromChapter;
}

// ---------------------------------------------------------------------------
// Zustand

export interface BrandRegionResult {
  demand: number;
  sales: number;
  craneSales: number;
  share: number;
  craneShare: number;
  /** Jacobs Gewinn in dieser Region (Marge − Unterhalt), in $. */
  profit: number;
  /** Lief ein Preiskampf? */
  priceWar: boolean;
}

export interface BrandRegionState {
  /** Fertige Tankstellen. */
  stations: number;
  /** Tankstellen im Bau: Anzahl und Runde, ab der sie verkaufen. */
  building: { count: number; ready: number }[];
  /** Bekanntheit 0–100. */
  awareness: number;
  /**
   * Der Teil der Bekanntheit, den nur die Werbung gebracht hat (verblasst wie die
   * Bekanntheit). Der Markenwert zählt ihn nicht – sonst hebt gekaufte Werbung den
   * Imperiumswert sofort über ihre Kosten.
   */
  adAwareness: number;
  price: PricePolicy;
  /** Laufende Werbung: Art und letzte Runde, in der sie wirkt. */
  campaigns: { kind: string; until: number }[];
  crane: { stations: number; awareness: number; price: PricePolicy; warRounds: number; cooldown: number };
  /** Ergebnis der letzten Abrechnung, oder null. */
  last: BrandRegionResult | null;
}

/** Was bei der letzten Abrechnung geschah – die Oberfläche macht Sätze daraus (content/brand.yaml). */
export type BrandNews =
  | { kind: 'opened'; region: string; count: number }
  | { kind: 'priceWarStart'; region: string }
  | { kind: 'priceWarEnd'; region: string }
  | { kind: 'craneExpand'; region: string; count: number }
  | { kind: 'campaignEnd'; region: string; campaign: string }
  | { kind: 'scandal'; severity: number; /** Runde, in der der Skandal kam. */ round?: number };

export interface BrandState {
  rng: RngState;
  founded: boolean;
  /** Name der Marke (Kennung aus content/brand.yaml), null vor der Gründung. */
  nameId: string | null;
  foundedRound: number;
  /** Automobilisierung seit Kapitelbeginn: Faktor auf die Nachfrage (Start 1). */
  motor: number;
  regions: Record<string, BrandRegionState>;
  news: BrandNews[];
  /** Gewinn der letzten Abrechnung über alle Regionen, in $. */
  lastProfit: number;
  /** Nur Debug (Integration): Kapitel, als das die Marke vorab gilt, solange es Kapitel 3 noch nicht gibt. */
  previewChapter?: number;
}

type BrandGame = Pick<GameState, 'seed' | 'round' | 'cash' | 'log' | 'startYear'> & { brand?: BrandState };

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ausgangslage zu Beginn von Kapitel 3: Crane ist schon da, Jacob noch nicht. */
export function newBrand(seed: string, balance: WithBrand): BrandState {
  const regions: Record<string, BrandRegionState> = {};
  for (const r of balance.brand.regions) {
    regions[r.id] = {
      stations: 0,
      building: [],
      awareness: 0,
      adAwareness: 0,
      price: 'normal',
      campaigns: [],
      crane: { stations: r.craneStations, awareness: r.craneAwareness, price: 'normal', warRounds: 0, cooldown: 0 },
      last: null,
    };
  }
  return { rng: seedFromString(`${seed}:marke`), founded: false, nameId: null, foundedRound: 0, motor: 1, regions, news: [], lastProfit: 0 };
}

/**
 * Debug (Integration): Marke und Tankstellen schon vor Kapitel 3 ansehen. Legt die Ausgangslage
 * an und merkt sich das Freischaltkapitel; ohne Aufruf ändert sich nichts.
 */
export function previewBrand<S extends BrandGame>(state: S, balance: WithBrand): S {
  if (brandUnlocked(brandWorldFrom(state), balance)) return state;
  return { ...state, brand: { ...brandOf(state, balance), previewChapter: balance.brand.unlockChapter } };
}

/** Der Markenzustand – vor der ersten Abrechnung in Kapitel 3 die Ausgangslage. */
export function brandOf(state: Pick<BrandGame, 'seed' | 'brand'>, balance: WithBrand): BrandState {
  return state.brand ?? newBrand(state.seed, balance);
}

function regionState(brand: BrandState, regionId: string): BrandRegionState | undefined {
  return brand.regions[regionId];
}

function withRegion(brand: BrandState, regionId: string, change: (r: BrandRegionState) => BrandRegionState): BrandState {
  return { ...brand, regions: { ...brand.regions, [regionId]: change(brand.regions[regionId]) } };
}

function stationsBuilding(r: BrandRegionState): number {
  return r.building.reduce((s, b) => s + b.count, 0);
}

/** Baukosten einer Tankstelle in der Region. */
export function stationCost(balance: WithBrand, regionId: string): number {
  const r = balance.brand.regions.find((x) => x.id === regionId);
  return cents(balance.brand.station.cost * (r?.costFactor ?? 1));
}

// ---------------------------------------------------------------------------
// Markt einer Region

export interface RegionMarket extends BrandRegionResult {
  /** Anziehung der drei Anbieter (für Vorschau und Tests). */
  attract: { jacob: number; crane: number; independents: number };
  /** Marge je bbl, die Jacob gerade bekommt. */
  margin: number;
}

function anziehung(stations: number, awareness: number, policy: PricePolicy, b: BrandBalance, factor = 1): number {
  if (stations <= 0) return 0;
  return stations ** b.share.stationExponent * (b.share.awarenessBase + awareness / 100) * b.prices[policy].attract * factor;
}

/** Faktor des Rufs auf Jacobs Anziehung (nie unter 0,1). */
export function reputationFactor(balance: WithBrand, reputation: number): number {
  return Math.max(0.1, 1 + (clamp(reputation, -100, 100) / 100) * balance.brand.share.reputationWeight);
}

/** Nachfrage in einer Region in dieser Runde (bbl Benzin). */
export function regionDemand(balance: WithBrand, regionId: string, motor: number, world: BrandWorld): number {
  const r = balance.brand.regions.find((x) => x.id === regionId);
  if (!r) return 0;
  return r.demand * motor * world.motorization * (world.crash ? 1 - balance.brand.demand.crashDrop : 1);
}

/**
 * Wer in einer Region wie viel verkauft – reine Rechnung, ohne Zustand zu ändern.
 * Unterhalt zählt für fertige Tankstellen; ohne zugekauftes Benzin (ownGasoline null).
 */
export function regionMarket(brand: BrandState, balance: WithBrand, regionId: string, world: BrandWorld): RegionMarket {
  const b = balance.brand;
  const rb = b.regions.find((x) => x.id === regionId);
  const rs = regionState(brand, regionId);
  const leer: RegionMarket = {
    demand: 0,
    sales: 0,
    craneSales: 0,
    share: 0,
    craneShare: 0,
    profit: 0,
    priceWar: false,
    attract: { jacob: 0, crane: 0, independents: 0 },
    margin: 0,
  };
  if (!rb || !rs || !brandRegionOpen(world, balance, regionId)) return leer;
  const demand = regionDemand(balance, regionId, brand.motor, world);
  const jacob = brand.founded ? anziehung(rs.stations, rs.awareness, rs.price, b, reputationFactor(balance, world.reputation)) : 0;
  const crane = anziehung(rs.crane.stations, rs.crane.awareness, rs.crane.price, b);
  const independents = anziehung(rb.independents, b.share.independentAwareness * 100, 'normal', b);
  const summe = jacob + crane + independents;
  const share = summe > 0 ? jacob / summe : 0;
  const craneShare = summe > 0 ? crane / summe : 0;
  const sales = Math.min(demand * share, rs.stations * b.station.capacity);
  const craneSales = Math.min(demand * craneShare, rs.crane.stations * b.station.capacity);
  const priceWar = brand.founded && rs.stations > 0 && rs.price === 'billig' && rs.crane.price === 'billig';
  // 0.4.20+8: In Cranes Feldzug drückt ihr Dumping Jacobs Marge überall, wo er Tankstellen hat.
  const margin = b.prices[rs.price].margin * (priceWar ? b.priceWar.marginFactor : 1) * (rs.stations > 0 ? world.dumping : 1);
  const profit = cents(sales * margin - rs.stations * b.station.upkeep);
  return { demand, sales, craneSales, share, craneShare, profit, priceWar, attract: { jacob, crane, independents }, margin };
}

// ---------------------------------------------------------------------------
// Aktionen des Spielers

/** Warum eine Aktion nicht geht – die Oberfläche hat die Sätze dazu (content/brand.yaml, refusals). */
export type BrandRefusal =
  | 'locked'
  | 'founded'
  | 'notFounded'
  | 'cash'
  | 'region'
  | 'count'
  | 'full'
  | 'noStation'
  | 'campaign'
  | 'running'
  | 'samePrice'
  | 'name'
  | 'pact';

export type BrandResult<S> = { ok: true; state: S } | { ok: false; reason: BrandRefusal };

function logged<S extends BrandGame>(state: S, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

function dollars(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

/** Marke gründen: Name wählen, foundCost zahlen. */
export function foundBrand<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld, nameId: string, displayName = nameId): BrandResult<S> {
  if (!brandUnlocked(world, balance)) return { ok: false, reason: 'locked' };
  const brand = brandOf(state, balance);
  if (brand.founded) return { ok: false, reason: 'founded' };
  if (!/^[a-z0-9_]+$/.test(nameId)) return { ok: false, reason: 'name' };
  const kosten = balance.brand.foundCost;
  if (state.cash < kosten) return { ok: false, reason: 'cash' };
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - kosten),
      brand: { ...brand, founded: true, nameId, foundedRound: state.round },
      log: logged(state, `Jacob gründet die Marke „${displayName}“ (${dollars(kosten)} $). Die ersten Schilder werden gemalt.`),
    },
  };
}

/** Tankstellen in Auftrag geben: count Stück in der Region, fertig nach buildRounds Runden. */
export function buildStations<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld, regionId: string, count: number): BrandResult<S> {
  if (!brandUnlocked(world, balance)) return { ok: false, reason: 'locked' };
  const brand = brandOf(state, balance);
  if (!brand.founded) return { ok: false, reason: 'notFounded' };
  if (!brandRegionOpen(world, balance, regionId)) return { ok: false, reason: 'region' };
  // 0.4.20+8: Nach der Preisabsprache mit Crane baut Harlan bis Kapitelende nicht weiter.
  if ((state as FremdeFelder).feldzug?.pact === true) return { ok: false, reason: 'pact' };
  const st = balance.brand.station;
  if (!Number.isInteger(count) || count < 1 || count > st.buildMax) return { ok: false, reason: 'count' };
  const r = brand.regions[regionId];
  if (r.stations + stationsBuilding(r) + count > st.maxPerRegion) return { ok: false, reason: 'full' };
  const kosten = cents(stationCost(balance, regionId) * count);
  if (state.cash < kosten) return { ok: false, reason: 'cash' };
  const ready = state.round + st.buildRounds;
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - kosten),
      brand: withRegion(brand, regionId, (x) => ({ ...x, building: [...x.building, { count, ready }] })),
      log: logged(state, `${count === 1 ? 'Eine Tankstelle' : `${count} Tankstellen`} in Auftrag gegeben (${dollars(kosten)} $).`),
    },
  };
}

/** Eine fertige Tankstelle verkaufen: resale der Baukosten zurück. */
export function sellStation<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld, regionId: string): BrandResult<S> {
  if (!brandUnlocked(world, balance)) return { ok: false, reason: 'locked' };
  const brand = brandOf(state, balance);
  if (!brand.founded) return { ok: false, reason: 'notFounded' };
  const r = regionState(brand, regionId);
  if (!r) return { ok: false, reason: 'region' };
  if (r.stations < 1) return { ok: false, reason: 'noStation' };
  const erloes = cents(stationCost(balance, regionId) * balance.brand.station.resale);
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash + erloes),
      brand: withRegion(brand, regionId, (x) => ({ ...x, stations: x.stations - 1 })),
      log: logged(state, `Eine Tankstelle verkauft (${dollars(erloes)} $).`),
    },
  };
}

/** Preis an der Zapfsäule in einer Region setzen. */
export function setPricePolicy<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld, regionId: string, policy: PricePolicy): BrandResult<S> {
  if (!brandUnlocked(world, balance)) return { ok: false, reason: 'locked' };
  const brand = brandOf(state, balance);
  if (!brand.founded) return { ok: false, reason: 'notFounded' };
  if (!brandRegionOpen(world, balance, regionId)) return { ok: false, reason: 'region' };
  if (!PRICE_POLICIES.includes(policy)) return { ok: false, reason: 'samePrice' };
  const r = brand.regions[regionId];
  if (r.price === policy) return { ok: false, reason: 'samePrice' };
  return { ok: true, state: { ...state, brand: withRegion(brand, regionId, (x) => ({ ...x, price: policy })) } };
}

/** Wirkt diese Kampagne in der Region noch in dieser Runde? */
export function campaignActive(r: Pick<BrandRegionState, 'campaigns'>, kind: string, round: number): boolean {
  return r.campaigns.some((c) => c.kind === kind && c.until >= round);
}

/** Werbung starten (Plakate, Radio, Straßenkarten): wirkt ab dieser Runde rounds Runden lang. */
export function startCampaign<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld, regionId: string, kind: string): BrandResult<S> {
  if (!brandUnlocked(world, balance)) return { ok: false, reason: 'locked' };
  const brand = brandOf(state, balance);
  if (!brand.founded) return { ok: false, reason: 'notFounded' };
  if (!brandRegionOpen(world, balance, regionId)) return { ok: false, reason: 'region' };
  const c = balance.brand.campaigns.find((x) => x.id === kind);
  if (!c) return { ok: false, reason: 'campaign' };
  const r = brand.regions[regionId];
  if (r.stations + stationsBuilding(r) === 0) return { ok: false, reason: 'noStation' };
  if (campaignActive(r, kind, state.round)) return { ok: false, reason: 'running' };
  if (state.cash < c.cost) return { ok: false, reason: 'cash' };
  const until = state.round + c.rounds - 1;
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - c.cost),
      brand: withRegion(brand, regionId, (x) => ({ ...x, campaigns: [...x.campaigns.filter((k) => k.until >= state.round), { kind, until }] })),
      log: logged(state, `Werbung bezahlt (${dollars(c.cost)} $).`),
    },
  };
}

/**
 * Skandal (GDD §6): kostet in jeder Region scandalLoss × Schwere (1–5) Bekanntheit.
 * Der sofortige Absatzeinbruch kommt über den Ruf (reputationFactor), den das
 * Ruf-System senkt. Ohne gegründete Marke passiert nichts. Andockpunkt für
 * Ereignis-Wirkungen (z. B. effects: { brandScandal: 3 }).
 */
export function applyBrandScandal<S extends BrandGame>(state: S, balance: WithBrand, severity: number): S {
  const brand = state.brand;
  if (!brand || !brand.founded) return state;
  const schwere = clamp(Math.round(severity), 1, 5);
  const verlust = balance.brand.awareness.scandalLoss * schwere;
  const regions = Object.fromEntries(
    Object.entries(brand.regions).map(([id, r]) => {
      const awareness = Math.max(0, r.awareness - verlust);
      // Der Werbeanteil schrumpft im selben Verhältnis wie die Bekanntheit.
      const adAwareness = r.awareness > 0 ? r.adAwareness * (awareness / r.awareness) : 0;
      return [id, { ...r, awareness, adAwareness }];
    }),
  );
  // round: settleBrand übernimmt die Meldung in die nächste Abrechnung, damit sie nicht verloren geht.
  return {
    ...state,
    brand: { ...brand, regions, news: [...brand.news, { kind: 'scandal', severity: schwere, round: state.round }] },
    log: logged(state, 'Skandal: Die Kunden meiden unsere Tankstellen.'),
  };
}

// ---------------------------------------------------------------------------
// Abrechnung am Rundenende

/**
 * Rundenende (4.14): In Kapitel < unlockChapter unverändert (kein Zufall).
 * Sonst, je offene Region in fester Reihenfolge: fertige Tankstellen öffnen,
 * Absatz und Gewinn, Bekanntheit, Margaret Cranes Antwort (zwei Würfe je
 * Region, immer gleich viele), abgelaufene Werbung. Danach wächst die
 * Automobilisierung, der Gewinn geht in die Kasse.
 */
export function settleBrand<S extends BrandGame>(state: S, balance: WithBrand, world: BrandWorld = brandWorldFrom(state)): S {
  if (!brandUnlocked(world, balance)) return state;
  const b = balance.brand;
  const start = brandOf(state, balance);
  const rng = new Rng(start.rng);
  // Was seit der letzten Abrechnung dazukam (Skandal während der Runde), bleibt stehen.
  const news: BrandNews[] = start.news.filter((n) => n.kind === 'scandal' && n.round !== undefined && n.round >= state.round);
  let brand: BrandState = { ...start, regions: { ...start.regions } };
  let gewinn = 0;
  let absatz = 0;
  let zukauf = 0;

  for (const rb of b.regions) {
    const offen = brandRegionOpen(world, balance, rb.id);
    let r = brand.regions[rb.id] ?? newBrand(state.seed, balance).regions[rb.id];
    if (!offen) {
      brand.regions[rb.id] = r;
      continue;
    }
    // 1. Fertige Tankstellen öffnen – sie verkaufen schon in dieser Abrechnung.
    const fertig = r.building.filter((x) => x.ready <= state.round).reduce((s, x) => s + x.count, 0);
    if (fertig > 0) {
      r = { ...r, stations: r.stations + fertig, building: r.building.filter((x) => x.ready > state.round) };
      news.push({ kind: 'opened', region: rb.id, count: fertig });
    }
    brand.regions[rb.id] = r;

    // 2. Absatz und Gewinn.
    const markt = regionMarket(brand, balance, rb.id, world);
    gewinn += markt.profit;
    absatz += markt.sales;

    // 3. Bekanntheit: verblasst, Schilder und Werbung frischen auf.
    const werbung = r.campaigns
      .filter((c) => c.until >= state.round)
      .reduce((s, c) => s + (b.campaigns.find((x) => x.id === c.kind)?.gain ?? 0), 0);
    const awareness = brand.founded
      ? clamp(r.awareness * (1 - b.awareness.decay) + b.awareness.perStation * Math.sqrt(r.stations) + werbung, 0, 100)
      : r.awareness;
    // Werbeanteil: verblasst genauso, nie mehr als die ganze Bekanntheit.
    const adAwareness = brand.founded ? clamp(r.adAwareness * (1 - b.awareness.decay) + werbung, 0, awareness) : r.adAwareness;
    const crane = { ...r.crane };
    crane.awareness = clamp(crane.awareness * (1 - b.awareness.decay) + b.awareness.perStation * Math.sqrt(crane.stations) + b.crane.adGain, 0, 100);

    // 4. Margaret Crane antwortet: zwei Würfe je Region, immer.
    const uKrieg = rng.float();
    const uBau = rng.float();
    const jacobDa = brand.founded && r.stations > 0;
    if (crane.warRounds > 0) {
      crane.warRounds -= 1;
      if (crane.warRounds === 0) {
        crane.price = 'normal';
        crane.cooldown = b.crane.cooldown;
        news.push({ kind: 'priceWarEnd', region: rb.id });
      }
    } else if (crane.cooldown > 0) {
      crane.cooldown -= 1;
    } else if (jacobDa && (markt.share >= b.crane.reactShare || r.price === 'billig') && uKrieg < b.crane.warChance) {
      crane.price = 'billig';
      crane.warRounds = b.crane.warRounds;
      news.push({ kind: 'priceWarStart', region: rb.id });
    }
    if (markt.craneShare < b.crane.targetShare && uBau < b.crane.expandChance && crane.stations < b.station.maxPerRegion) {
      const neu = Math.min(b.crane.expandStations, b.station.maxPerRegion - crane.stations);
      crane.stations += neu;
      if (jacobDa) news.push({ kind: 'craneExpand', region: rb.id, count: neu });
    }

    // 5. Abgelaufene Werbung.
    for (const c of r.campaigns) if (c.until === state.round) news.push({ kind: 'campaignEnd', region: rb.id, campaign: c.kind });
    const campaigns = r.campaigns.filter((c) => c.until > state.round);

    const last: BrandRegionResult = {
      demand: markt.demand,
      sales: markt.sales,
      craneSales: markt.craneSales,
      share: markt.share,
      craneShare: markt.craneShare,
      profit: markt.profit,
      priceWar: markt.priceWar,
    };
    brand.regions[rb.id] = { ...r, awareness, adAwareness, crane, campaigns, last };
  }

  // Eigenes Benzin (4.13): Was die Raffinerie nicht liefert, wird zugekauft.
  if (world.ownGasoline !== null && absatz > world.ownGasoline) {
    zukauf = absatz - world.ownGasoline;
    gewinn -= zukauf * b.supply.boughtCost;
  }
  gewinn = cents(gewinn);
  brand = { ...brand, rng: rng.state, motor: brand.motor * (1 + b.demand.growth), news, lastProfit: gewinn };
  let log = state.log;
  if (brand.founded && (absatz > 0 || gewinn !== 0)) {
    log = logged(
      { ...state, log },
      `Tankstellen: ${Math.floor(absatz).toLocaleString('de-DE')} bbl Benzin verkauft, ${gewinn < 0 ? 'Verlust' : 'Gewinn'} ${dollars(Math.abs(gewinn))} $${zukauf > 0 ? ` (davon ${Math.floor(zukauf).toLocaleString('de-DE')} bbl zugekauft)` : ''}.`,
    );
  }
  // Margaret Cranes Züge gehören ins Protokoll – nicht nur ins Fenster „Vertrieb“.
  for (const satz of craneLogLines(news)) log = logged({ ...state, log }, satz);
  return { ...state, cash: cents(state.cash + gewinn), brand, log };
}

/**
 * Protokollsätze zu Margaret Cranes Zügen (Preiskampf, Ausbau). Wie die übrigen
 * Protokollzeilen deutsch und ohne Regionsnamen (die stehen in content/brand.yaml);
 * die Einzelheiten zeigt das Fenster „Vertrieb“.
 */
export function craneLogLines(news: readonly BrandNews[]): string[] {
  const anzahl = (kind: BrandNews['kind']) => news.filter((n) => n.kind === kind).length;
  const regionen = (n: number) => (n === 1 ? 'einer Region' : `${n} Regionen`);
  const saetze: string[] = [];
  const start = anzahl('priceWarStart');
  const ende = anzahl('priceWarEnd');
  const neu = news.reduce((s, n) => s + (n.kind === 'craneExpand' ? n.count : 0), 0);
  if (start > 0) saetze.push(`Margaret Crane beginnt in ${regionen(start)} einen Preiskampf an der Zapfsäule.`);
  if (ende > 0) saetze.push(`Margaret Crane beendet den Preiskampf in ${regionen(ende)}.`);
  if (neu > 0) saetze.push(`Crane Eastern baut ${neu} neue Tankstelle${neu === 1 ? '' : 'n'} neben unseren.`);
  return saetze;
}

// ---------------------------------------------------------------------------
// Kennzahlen

/** Nationaler Marktanteil aus der letzten Abrechnung: Jacobs Absatz / Nachfrage aller offenen Regionen. */
export function nationalShare(brand: BrandState | undefined): { jacob: number; crane: number } {
  if (!brand) return { jacob: 0, crane: 0 };
  const res = Object.values(brand.regions)
    .map((r) => r.last)
    .filter((x): x is BrandRegionResult => x !== null);
  const nachfrage = res.reduce((s, x) => s + x.demand, 0);
  if (nachfrage <= 0) return { jacob: 0, crane: 0 };
  return { jacob: res.reduce((s, x) => s + x.sales, 0) / nachfrage, crane: res.reduce((s, x) => s + x.craneSales, 0) / nachfrage };
}

/**
 * Markenwert in $ (GDD §6): was das Netz je Runde verdient (Absatz × Marge −
 * Unterhalt, nie unter 0) × profitMultiple, über alle offenen Regionen. Gerechnet
 * mit der Bekanntheit ohne den Werbeanteil (adAwareness): gekaufte Werbung bringt
 * Absatz und Gewinn in die Kasse, aber keinen Buchwert. Der Ruf wirkt sofort über
 * die Anziehung (regionMarket).
 */
export function brandValue(brand: BrandState | undefined, balance: WithBrand, world: BrandWorld): number {
  if (!brand || !brand.founded) return 0;
  const ohneWerbung: BrandState = {
    ...brand,
    regions: Object.fromEntries(
      Object.entries(brand.regions).map(([id, r]) => [id, { ...r, awareness: Math.max(0, r.awareness - r.adAwareness) }]),
    ),
  };
  const summe = balance.brand.regions
    .filter((rb) => brandRegionOpen(world, balance, rb.id))
    .reduce((s, rb) => s + Math.max(0, regionMarket(ohneWerbung, balance, rb.id, world).profit), 0);
  return cents(summe * balance.brand.value.profitMultiple);
}

/**
 * 4.14 Andockpunkt Imperiumswert: Tankstellen (Buchwert, auch im Bau) plus
 * Markenwert. Ohne Marke 0 – Kapitel 1 bleibt unberührt.
 */
export function brandAssets(state: Pick<BrandGame, 'brand'> & object, balance: WithBrand): number {
  const brand = state.brand;
  if (!brand || !brand.founded) return 0;
  const world = brandWorldFrom(state);
  const buch = Object.entries(brand.regions).reduce(
    (s, [id, r]) => s + (r.stations + stationsBuilding(r)) * stationCost(balance, id) * balance.brand.value.assetShare,
    0,
  );
  return cents(buch + brandValue(brand, balance, world));
}

export interface BrandGoal {
  /** Regionen, in denen die Marke mindestens presenceShare Marktanteil hält (letzte Abrechnung). */
  regions: number;
  share: number;
  regionsReached: boolean;
  shareReached: boolean;
  reached: boolean;
}

/**
 * Kapitelprüfung Kapitel 3 (GDD §13): Marke in ≥ goal.regions Regionen oder ≥ goal.share nationaler Marktanteil.
 * 0.4.20+6: Vertreten ist die Marke in einer Region erst mit goal.presenceShare Marktanteil (letzte Abrechnung) –
 * Crane baut dagegen aus und führt Preiskämpfe, der „Kampf um die Marke“ entscheidet. Vorher zählte eine feste
 * Zahl Tankstellen, und wer genug Geld hatte, bestand immer.
 */
export function regionPresent(r: Pick<BrandRegionState, 'stations' | 'last'>, balance: WithBrand): boolean {
  return r.stations > 0 && (r.last?.share ?? 0) >= balance.brand.goal.presenceShare;
}

export function brandGoal(brand: BrandState | undefined, balance: WithBrand): BrandGoal {
  const g = balance.brand.goal;
  const regions = brand?.founded ? Object.values(brand.regions).filter((r) => regionPresent(r, balance)).length : 0;
  const share = brand?.founded ? nationalShare(brand).jacob : 0;
  const regionsReached = regions >= g.regions;
  const shareReached = share >= g.share;
  return { regions, share, regionsReached, shareReached, reached: regionsReached || shareReached };
}

/** Kartellrisiko (GDD §15) für 4.3 Gesetze: Regionen über der regionalen Schwelle und ob der nationale Anteil zu hoch ist. */
export function brandAntitrust(brand: BrandState | undefined, balance: WithBrand): { regions: string[]; national: boolean } {
  if (!brand?.founded) return { regions: [], national: false };
  const a = balance.brand.antitrust;
  const regions = balance.brand.regions.map((r) => r.id).filter((id) => (brand.regions[id]?.last?.share ?? 0) >= a.regional);
  return { regions, national: nationalShare(brand).jacob >= a.national };
}

export const AWARENESS_WORDS = ['unbekannt', 'bekannt', 'beliebt', 'ueberall'] as const;
export type AwarenessWord = (typeof AWARENESS_WORDS)[number];

/** Bekanntheit nie als Zahl, sondern als Wort (wie Ruf und Familie). */
export function awarenessWord(awareness: number): AwarenessWord {
  if (awareness < 10) return 'unbekannt';
  if (awareness < 35) return 'bekannt';
  if (awareness < 65) return 'beliebt';
  return 'ueberall';
}

/** Tankstellen im Bau in einer Region. */
export function buildingCount(brand: BrandState, regionId: string): number {
  const r = brand.regions[regionId];
  return r ? stationsBuilding(r) : 0;
}

// ---------------------------------------------------------------------------
// Spielstand

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const istPreis = (v: unknown): boolean => PRICE_POLICIES.includes(v as PricePolicy);

/** Prüft für das Laden, ob ein Markenzustand vollständig ist (4.14 Andockpunkt in save.ts). */
export function isBrandState(value: unknown): value is BrandState {
  if (!istObjekt(value)) return false;
  if (!['rng', 'foundedRound', 'motor', 'lastProfit'].every((k) => endlich(value[k]))) return false;
  if (value.previewChapter !== undefined && !endlich(value.previewChapter)) return false;
  if (typeof value.founded !== 'boolean' || !(value.nameId === null || typeof value.nameId === 'string')) return false;
  if (!Array.isArray(value.news) || !value.news.every((n) => istObjekt(n) && typeof n.kind === 'string')) return false;
  if (!istObjekt(value.regions)) return false;
  return Object.values(value.regions).every((r) => {
    if (!istObjekt(r) || !endlich(r.stations) || !endlich(r.awareness) || !endlich(r.adAwareness) || !istPreis(r.price)) return false;
    if (!Array.isArray(r.building) || !r.building.every((x) => istObjekt(x) && endlich(x.count) && endlich(x.ready))) return false;
    if (!Array.isArray(r.campaigns) || !r.campaigns.every((x) => istObjekt(x) && typeof x.kind === 'string' && endlich(x.until))) return false;
    const c = r.crane;
    if (!istObjekt(c) || !['stations', 'awareness', 'warRounds', 'cooldown'].every((k) => endlich(c[k])) || !istPreis(c.price)) return false;
    return r.last === null || (istObjekt(r.last) && ['demand', 'sales', 'craneSales', 'share', 'craneShare', 'profit'].every((k) => endlich((r.last as Record<string, unknown>)[k])));
  });
}
