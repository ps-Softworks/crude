// Spielzahlen für Erkundung und Planungsbrett (Termine als Hauptwerkzeug, Etappe 1).
// Eigene Abschnitte „exploration“ und „plans“ in content/balance.yaml. Der Leser
// hier ist eigenständig, damit balance.ts nur zwei Zeilen dafür braucht.
// Texte der Karten stehen in content/plans.yaml, die Regeln in src/sim/exploration.ts
// und src/sim/plans.ts.

import { BalanceError } from './balance';

/** Hinweisarten (Plan 1.2): was man auf einer Ranch beobachten kann. */
export const CLUE_KINDS = ['sickerstelle', 'salzwasser', 'formation', 'brunnen', 'kartierung', 'bohrbericht', 'rute'] as const;
export type ClueKind = (typeof CLUE_KINDS)[number];

/** Wie verlässlich ein Hinweis ist: Chance, ihn zu sehen, wenn Öl da ist bzw. wenn nicht. */
export interface ClueOdds {
  oil: number;
  dry: number;
  /** Nur Kartierung: so viel mehr je Punkt Genauigkeit des Geologen. */
  oilPerAccuracy?: number;
  dryPerAccuracy?: number;
}

/** Ein Geologe, den Jacob einstellen kann. */
export interface GeologistOffer {
  /** Genauigkeit 1–5. */
  accuracy: number;
  /** Verzerrung in Prozentpunkten: fest (bias) oder zufällig zwischen −biasMax und +biasMax. */
  bias?: number;
  biasMax?: number;
  /** Lohn je Runde in $. */
  wage: number;
}

export const GEOLOGIST_IDS = ['standard', 'hallstead', 'hale'] as const;
export type GeologistId = (typeof GEOLOGIST_IDS)[number];

export interface ExplorationBalance {
  /** Hinweise auf Nachbarranches wirken mit Faktor^neighbourPower. */
  neighbourPower: number;
  /** Bandbreite der Prognose je Wissensstufe in Prozentpunkten. */
  width: {
    rode: number;
    /** Kartiert: base − perAccuracy × Genauigkeit (Genauigkeit 3 → 25, 5 → 15). */
    mappedBase: number;
    mappedPerAccuracy: number;
    report: number;
  };
  /** Rauschen der Prognosemitte als Anteil der Bandbreite (± noiseShare · Breite). */
  noiseShare: number;
  /** Gieriger Farmer: so oft erzählt er von Öl, das er nie gesehen hat. */
  greedyLie: number;
  /** Freundliche Farmer (Landbesitzer-Arten) geben beim Gespräch Nachlass auf den Pachtbonus. */
  friendlyOwners: string[];
  friendlyDiscount: number;
  /** Bohrbericht kaufen: Preis bei trockener bzw. fündiger Bohrung. */
  reportCost: { dry: number; found: number };
  /** Bullards Bohrtagebuch: so viele Ranches höchstens, so oft erwischt. */
  diary: { ranches: number; caught: number };
  clues: Record<ClueKind, ClueOdds>;
  geologists: Record<GeologistId, GeologistOffer>;
}

/** Reiter des Planungsbretts. */
export const PLAN_TABS = ['land', 'markt', 'fracht', 'leute'] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

/** Wann eine Karte wirkt: sofort beim Buchen oder am Rundenende (mit Wurf der Gegenseite). */
export type PlanTiming = 'sofort' | 'rundenende';
/** Worauf eine Karte zielt: eine Ranch, nichts oder eine von mehreren Möglichkeiten (Etappe 2, z. B. Laufzeit und Menge eines Vertrags). */
export type PlanTarget = 'ranch' | 'none' | 'option';

/** Bedingungen, ob eine Karte überhaupt auf der Hand ist (sonst unsichtbar). */
export interface PlanRequires {
  marked?: string[];
  notMarked?: string[];
  minRound?: number;
  maxChapter?: number;
}

export interface PlanCardBalance {
  tab: PlanTab;
  appointments: number;
  cash: number;
  /** Kraft: negativ kostet, positiv gibt. */
  strength: number;
  target: PlanTarget;
  timing: PlanTiming;
  /** Regel in src/sim/plans.ts (HANDLERS) – oder event für einen festen Termin. */
  handler?: string;
  /** Fester Termin aus content/events/ (routine), den diese Karte ersetzt. */
  event?: string;
  requires: PlanRequires;
}

export interface PlansBalance {
  cards: Record<string, PlanCardBalance>;
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const value = wert(obj, path);
  if (typeof value !== 'number' || Number.isNaN(value)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  return value;
}

function anteil(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0 || value > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return value;
}

function nichtNegativ(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return value;
}

function texte(obj: unknown, path: string): string[] {
  const value = wert(obj, path);
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) throw new BalanceError(`balance.yaml: "${path}" muss eine Liste von Texten sein`);
  return value as string[];
}

export function parseExplorationBalance(raw: unknown): ExplorationBalance {
  const p = 'exploration';
  if (wert(raw, p) === undefined) throw new BalanceError('balance.yaml: Block "exploration" fehlt');
  const clues = {} as Record<ClueKind, ClueOdds>;
  for (const kind of CLUE_KINDS) {
    const q = `${p}.clues.${kind}`;
    const odds: ClueOdds = { oil: anteil(raw, `${q}.oil`), dry: anteil(raw, `${q}.dry`) };
    if (wert(raw, `${q}.oilPerAccuracy`) !== undefined) odds.oilPerAccuracy = zahl(raw, `${q}.oilPerAccuracy`);
    if (wert(raw, `${q}.dryPerAccuracy`) !== undefined) odds.dryPerAccuracy = zahl(raw, `${q}.dryPerAccuracy`);
    clues[kind] = odds;
  }
  const geologists = {} as Record<GeologistId, GeologistOffer>;
  for (const id of GEOLOGIST_IDS) {
    const q = `${p}.geologists.${id}`;
    const accuracy = zahl(raw, `${q}.accuracy`);
    if (!Number.isInteger(accuracy) || accuracy < 1 || accuracy > 5) throw new BalanceError(`balance.yaml: "${q}.accuracy" muss eine ganze Zahl von 1 bis 5 sein`);
    const g: GeologistOffer = { accuracy, wage: nichtNegativ(raw, `${q}.wage`) };
    if (wert(raw, `${q}.bias`) !== undefined) g.bias = zahl(raw, `${q}.bias`);
    if (wert(raw, `${q}.biasMax`) !== undefined) g.biasMax = nichtNegativ(raw, `${q}.biasMax`);
    geologists[id] = g;
  }
  return {
    neighbourPower: anteil(raw, `${p}.neighbourPower`),
    width: {
      rode: nichtNegativ(raw, `${p}.width.rode`),
      mappedBase: nichtNegativ(raw, `${p}.width.mappedBase`),
      mappedPerAccuracy: nichtNegativ(raw, `${p}.width.mappedPerAccuracy`),
      report: nichtNegativ(raw, `${p}.width.report`),
    },
    noiseShare: anteil(raw, `${p}.noiseShare`),
    greedyLie: anteil(raw, `${p}.greedyLie`),
    friendlyOwners: texte(raw, `${p}.friendlyOwners`),
    friendlyDiscount: anteil(raw, `${p}.friendlyDiscount`),
    reportCost: { dry: nichtNegativ(raw, `${p}.reportCost.dry`), found: nichtNegativ(raw, `${p}.reportCost.found`) },
    diary: { ranches: nichtNegativ(raw, `${p}.diary.ranches`), caught: anteil(raw, `${p}.diary.caught`) },
    clues,
    geologists,
  };
}

const TABS: readonly string[] = PLAN_TABS;

export function parsePlansBalance(raw: unknown): PlansBalance {
  const block = wert(raw, 'plans.cards');
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw new BalanceError('balance.yaml: Block "plans.cards" fehlt');
  const cards: Record<string, PlanCardBalance> = {};
  for (const id of Object.keys(block)) {
    const q = `plans.cards.${id}`;
    const tab = wert(raw, `${q}.tab`);
    if (typeof tab !== 'string' || !TABS.includes(tab)) throw new BalanceError(`balance.yaml: "${q}.tab" muss ${PLAN_TABS.join(', ')} sein`);
    const target = wert(raw, `${q}.target`) ?? 'none';
    if (target !== 'ranch' && target !== 'none' && target !== 'option') throw new BalanceError(`balance.yaml: "${q}.target" muss ranch, none oder option sein`);
    const timing = wert(raw, `${q}.timing`) ?? 'sofort';
    if (timing !== 'sofort' && timing !== 'rundenende') throw new BalanceError(`balance.yaml: "${q}.timing" muss sofort oder rundenende sein`);
    const handler = wert(raw, `${q}.handler`);
    const event = wert(raw, `${q}.event`);
    if ((handler === undefined) === (event === undefined)) throw new BalanceError(`balance.yaml: "${q}" braucht genau eins von handler oder event`);
    if (handler !== undefined && typeof handler !== 'string') throw new BalanceError(`balance.yaml: "${q}.handler" muss ein Text sein`);
    if (event !== undefined && typeof event !== 'string') throw new BalanceError(`balance.yaml: "${q}.event" muss ein Text sein`);
    const appointments = wert(raw, `${q}.appointments`) === undefined && event !== undefined ? 0 : nichtNegativ(raw, `${q}.appointments`);
    const req = (wert(raw, `${q}.requires`) ?? {}) as Record<string, unknown>;
    const requires: PlanRequires = {};
    if (req.marked !== undefined) requires.marked = texte(raw, `${q}.requires.marked`);
    if (req.notMarked !== undefined) requires.notMarked = texte(raw, `${q}.requires.notMarked`);
    if (req.minRound !== undefined) requires.minRound = zahl(raw, `${q}.requires.minRound`);
    if (req.maxChapter !== undefined) requires.maxChapter = zahl(raw, `${q}.requires.maxChapter`);
    cards[id] = {
      tab: tab as PlanTab,
      appointments,
      cash: wert(raw, `${q}.cash`) === undefined ? 0 : nichtNegativ(raw, `${q}.cash`),
      strength: wert(raw, `${q}.strength`) === undefined ? 0 : zahl(raw, `${q}.strength`),
      target,
      timing,
      requires,
      ...(typeof handler === 'string' ? { handler } : {}),
      ...(typeof event === 'string' ? { event } : {}),
    };
  }
  return { cards };
}
