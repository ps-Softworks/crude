// Preis-Aktionen (Termine als Hauptwerkzeug, Etappe 2): Jacob kann den Ölpreis am Salt
// Hill selbst bewegen – mit Terminen auf dem Planungsbrett (Reiter Markt).
//
//   Markt-Kern    Der Preis rechnet mit dem, was Jacob VERKAUFT, nicht mit dem, was er
//                 fördert. Öl im Tank zurückhalten hebt den Preis, späteres Ausschütten
//                 drückt ihn wieder (nur Kapitel 1; danach bleibt es bei der Förderung).
//   Förderbremse  Pakt mit den Wildcattern: Die Mitglieder drosseln 20 %, Jacob auch (oder
//                 nur 10 % mit der Organisatoren-Klausel). Jede Runde kann ein Mitglied heimlich
//                 voll fördern; bricht mehr als ein Drittel, platzt der Pakt. Bullard kann
//                 mitmachen oder draußen voll auffahren. Steigt der Preis zu hoch, schlägt Crane zurück.
//   Liefervertrag Fester Preis beim Händler in Port Ellis gegen feste Menge.
//   Gerücht       Ein Schock auf den Preis der Folgerunde – mit Risiko, aufzufliegen.
//   Crane         Mit Druckmitteln feilschen: Abschlag streichen oder ein Angebot, das Verrat ist.
//
// Ein gemeinsamer Ruf bei den Wildcattern (wildcatterStanding) gilt für Förderbremse und
// Transportgemeinschaft (src/sim/freight.ts). Zufall: je Runde ein eigener Strang aus dem
// Seed (`${seed}:preis:${runde}:…`) – der Weltzufall bleibt unberührt, Neuladen würfelt nicht neu.
// Zahlen: balance.yaml priceActions, Karten: plans.cards, Texte: content/plans.yaml.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { applyEffects } from './events';
import type { GameState } from './game';
import { lawInForce } from './laws';
import { computePrice, jacobSupply, neighbourSupply, rivalSupply } from './market';
import type { PlanHandler, PlanOption } from './planHandler';
import { Rng, seedFromString } from './rng';
import { worldPriceFactor } from './world';

/** Merkzeichen, die die Preis-Aktionen setzen – Ereignisse können darauf reagieren. */
export const PRICING_MARKS = {
  /** Jacob hat eine Förderbremse gegründet. */
  cartel: 'foerderbremse',
  /** Die Förderbremse ist geplatzt. */
  collapse: 'kartell_geplatzt',
  /** Ein Mitglied fördert heimlich voll (Brief „Pickett fördert nachts heimlich voll“). Die Simulation löscht es wieder. */
  suspect: 'kartell_verdacht',
  /** Jacob hat die Wildcatter für Crane verraten. */
  betrayal: 'kartell_verraten',
  /** Bullard hat die Förderbremse gebrochen. */
  bullardBreak: 'bullard_kartellbruch',
  /** Liefervertrag mit dem Händler. */
  contract: 'liefervertrag',
  /** Der Händler ist im Kreditcrash pleitegegangen. */
  traderBust: 'haendler_pleite',
  /** Ein Gerücht ist aufgeflogen. */
  exposed: 'geruecht_aufgeflogen',
  /** Crane hat Jacob abblitzen lassen. */
  supplicant: 'crane_bittsteller',
  /** Jacob hat mit Crane einen Handel geschlossen. */
  craneDeal: 'crane_handel',
} as const;

export const PRICING_SIM_MARKS: readonly string[] = Object.values(PRICING_MARKS);

/** Antworten aus content/events/, die die Preis-Aktionen lesen: Der Verdächtige ist zur Rede gestellt. */
export const PRICING_READ_MARKS: readonly string[] = ['kartell_ermahnt'];

/** Merkzeichen anderer Systeme, die die Preis-Aktionen lesen (wie in trust.ts). */
const M = {
  alliance: 'delgado_verband',
  pact: 'bullard_handschlag',
  feud: 'bullard_fehde',
  betrayed: 'bullard_verraten',
} as const;

export interface CartelState {
  /** Gründungsrunde. */
  since: number;
  /** Letzte Runde mit Drossel. */
  until: number;
  /** Wildcatter-Firmen im Pakt (Namen). */
  members: string[];
  /** Jacobs eigene Drossel: 0,2 ehrlich, 0,1 mit Organisatoren-Klausel. */
  jacobCut: number;
  organizer: boolean;
  /** Letzte Runde, in der Jacob den Pakt gehalten hat (Gründung zählt). */
  heldRound: number;
  /** Bullard drinnen (drosselt mit) oder draußen. */
  bullard: 'in' | 'out';
  bullardAsked: boolean;
  /** Runde, in der Bullard draußen voll aufgefahren ist (0 = nie). */
  bullardFullRound: number;
  /** Runde, in der Bullard drinnen gebrochen hat (0 = nie). */
  bullardBreakRound: number;
  /** Wer in der laufenden Runde heimlich voll fördert, und welcher Anteil der Kartellquellen das ist. */
  cheaters: string[];
  cheatShare: number;
  /** Zur Rede gestellt: betrügen nicht mehr. */
  confronted: string[];
  /** Verdächtiger aus dem Brief, oder null. */
  suspect: string | null;
}

export interface ContractState {
  buyer: 'haendler' | 'crane';
  /** Menge je Runde (beim Crane-Vertrag ohne Pflicht). */
  qty: number;
  price: number;
  /** Erste und letzte Lieferrunde. */
  from: number;
  until: number;
  /** Mehrerlös gegenüber Crane bisher (Lieferungen × Preisvorteil − Strafen − Cranes Groll). */
  gain: number;
}

export interface PricingState {
  /** Was Jacob in der Runde verkauft hat, deren Preis zuletzt entstand (bbl). */
  sold: number;
  cartel: CartelState | null;
  /** Bis zu dieser Runde will niemand einen Pakt (nach Zusammenbruch oder Verfahren). */
  cartelBanUntil: number;
  /** Runde des letzten Zusammenbruchs bzw. Kartellverfahrens (0 = nie) – für Markt und Zeitung. */
  collapseRound: number;
  courtRound: number;
  /** Zähler für Akte und Messung: gegründete und geplatzte Pakte. */
  founded: number;
  collapsed: number;
  contract: ContractState | null;
  /** Nach einem geplatzten Pakt während des Vertrags verlängert der Händler nie. */
  traderNever: boolean;
  /** Mehrerlös der beendeten Verträge (je Vertrag). */
  contractResults: number[];
  rumours: { count: number; lastRound: number; kind: 'versiegen' | 'riesenfund' | null; shock: { round: number; value: number } | null; exposedRound: number };
  /** Nora schreibt nichts mehr für Jacob: keine Vorwarnungen im Courier. */
  noraBurned: boolean;
  /** Bis zu dieser Runde pachtet Bullard nichts (Gerücht „Riesenfund“). */
  bullardShyUntil: number;
  /** Cranes Aufschlag nach einem Handel. */
  craneDeal: { bonus: number; until: number } | null;
  /** Cranes Abschlag als Antwort auf einen zu hohen Preis, ein Gerücht oder eine Abfuhr. */
  cranePunish: { from: number; until: number; value: number } | null;
  /** Abschläge und Groll aus Runden bis hierher sind gestrichen (Crane feilschen, 0 = nie). */
  clearedRound: number;
  /** Wirkung der Förderbremse bzw. des Gerüchts auf den letzten Preis (cartel: Förderbremse lief, share: Kartellanteil, first: Gründungsrunde). */
  effect: { round: number; price: number; without: number; cartel: boolean; share: number; first: boolean; jacobCut: number } | null;
}

export function newPricing(): PricingState {
  return {
    sold: 0,
    cartel: null,
    cartelBanUntil: 0,
    collapseRound: 0,
    courtRound: 0,
    founded: 0,
    collapsed: 0,
    contract: null,
    traderNever: false,
    contractResults: [],
    rumours: { count: 0, lastRound: 0, kind: null, shock: null, exposedRound: 0 },
    noraBurned: false,
    bullardShyUntil: 0,
    craneDeal: null,
    cranePunish: null,
    clearedRound: 0,
    effect: null,
  };
}

type Lage = Pick<GameState, 'round'> & Partial<Pick<GameState, 'pricing' | 'events'>>;

function pricingOf(state: Partial<Pick<GameState, 'pricing'>>): PricingState {
  return state.pricing ?? newPricing();
}

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function dollar(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} $`;
}

function money(v: number): string {
  return `${Math.round(v).toLocaleString('de-DE')} $`;
}

function bbl(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

function prozent(v: number): string {
  return `${Math.round(v * 100)} %`;
}

function runden(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

function rng(state: Pick<GameState, 'seed' | 'round'>, tag: string): Rng {
  return new Rng(seedFromString(`${state.seed}:preis:${state.round}:${tag}`));
}

function hasMark(state: Partial<Pick<GameState, 'events'>>, mark: string): boolean {
  return state.events?.marks?.[mark] !== undefined;
}

function setMark(state: GameState, mark: string): GameState {
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

function dropMark(state: GameState, mark: string): GameState {
  if (state.events.marks[mark] === undefined) return state;
  const marks = { ...state.events.marks };
  delete marks[mark];
  return { ...state, events: { ...state.events, marks } };
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

function withPricing(state: GameState, patch: Partial<PricingState>): GameState {
  return { ...state, pricing: { ...pricingOf(state), ...patch } };
}

/** Bullard in Fehde (oder verraten)? */
export function bullardFeud(state: Partial<Pick<GameState, 'events'>>): boolean {
  return hasMark(state, M.feud) || hasMark(state, M.betrayed);
}

// --- Ruf bei den Wildcattern ------------------------------------------------------

/** Jacobs Ruf bei den kleinen Wildcattern (−0,3 bis +0,3). */
export function wildcatterStanding(state: Partial<Pick<GameState, 'wildcatterStanding'>>): number {
  return state.wildcatterStanding ?? 0;
}

/** Verschiebt den Ruf, begrenzt auf priceActions.standing.min–max. */
export function shiftStanding(state: GameState, balance: Balance, delta: number): GameState {
  const s = balance.priceActions.standing;
  return { ...state, wildcatterStanding: Math.round(clamp(wildcatterStanding(state) + delta, s.min, s.max) * 1000) / 1000 };
}

// --- Markt-Kern (2.1) -------------------------------------------------------------

/** Läuft die Förderbremse in dieser Runde (Drossel wirkt)? */
export function cartelActive(state: Lage, round = state.round): boolean {
  const c = pricingOf(state).cartel;
  return c !== null && round >= c.since && round <= c.until;
}

function firmWells(state: Pick<GameState, 'wildcatters'>, names: readonly string[]): number {
  return state.wildcatters.firms.filter((f) => names.includes(f.name)).reduce((s, f) => s + f.wells, 0);
}

/** Anteil der Nachbarquellen, die im Pakt sind (0–1). */
export function cartelShare(state: Pick<GameState, 'wildcatters'> & Partial<Pick<GameState, 'pricing'>>): number {
  const c = pricingOf(state).cartel;
  const alle = state.wildcatters.firms.reduce((s, f) => s + f.wells, 0);
  return c && alle > 0 ? firmWells(state, c.members) / alle : 0;
}

/** Jacobs eigene Förderung in dieser Runde: × (1 − Drossel), solange er im Pakt ist (production.ts). */
export function throttleFactor(state: Lage): number {
  const c = pricingOf(state).cartel;
  return c && cartelActive(state) ? 1 - c.jacobCut : 1;
}

/** Was Jacob in dieser Runde bisher verkauft hat (alle Wege). */
export function soldThisRound(state: Pick<GameState, 'shipped'>): number {
  return Object.values(state.shipped).reduce((s, v) => s + v, 0);
}

export interface MarketMods {
  /** Angebot A am Salt Hill (bbl je Runde). */
  supply: number;
  /** Schockfaktor S (1 = kein Gerücht). */
  shock: number;
  /** Angebot ohne Förderbremse und ohne Gerücht – zum Vergleich. */
  plain: number;
}

/**
 * Angebot und Schock für den Preis dieser Runde (Plan 2.1):
 *   A = Jacobs Verkauf + Nachbarn · (1 − Kartellanteil · Drossel · (1 − Betrugsanteil)) · (Zusammenbruch ? 1,1 : 1)
 *     + Bullard · (im Pakt und ehrlich ? 1 − Drossel : beim Bruch 1,5 : 1)
 *   S = 1 + Gerüchteschock dieser Runde.
 * Jacob zählt in Kapitel 1 mit seinem Verkauf (jacob = Verkauf; Vorgabe: soldThisRound),
 * ab Kapitel 2 weiter mit seiner Förderung.
 */
export function marketMods(state: GameState, balance: Balance, jacob = chapterOf(state) > 1 ? jacobSupply(state) : soldThisRound(state)): MarketMods {
  const p = pricingOf(state);
  const cb = balance.priceActions.cartel;
  const nachbarn = neighbourSupply(balance.market, state.round, state.neighbourOffset ?? 0);
  const bullard = rivalSupply(state, balance.rivals.bullard.ratePerWell);
  let nFaktor = 1;
  let bFaktor = 1;
  const c = p.cartel;
  if (c && cartelActive(state)) {
    nFaktor = 1 - cartelShare(state) * cb.cut * (1 - c.cheatShare);
    if (c.bullard === 'in') bFaktor = c.bullardBreakRound === state.round ? cb.bullard.breakFactor : 1 - cb.cut;
  }
  if (p.collapseRound === state.round) nFaktor *= 1 + cb.collapseBoost;
  const shock = 1 + (p.rumours.shock?.round === state.round ? p.rumours.shock.value : 0);
  return { supply: jacob + nachbarn * nFaktor + bullard * bFaktor, shock, plain: jacob + nachbarn + bullard };
}

/**
 * Zurückhalten (Plan 2.1, Regler im Frachtfenster): Was kostet es, keep Barrel im Tank zu lassen,
 * und welchen Preis setzt der Trust am Rundenende, wenn Jacob den Rest verkauft – gegen „alles
 * verkaufen“? Lagerkosten mit Schwund und Brandrisiko wie in logistics.storageOutlook.
 */
export function holdOutlook(state: GameState, balance: Balance, keep: number): { cost: number; price: number; priceAll: number } {
  const st = balance.transport.storage;
  const tank = Math.max(0, Math.floor(state.oilStock));
  const behalten = clamp(Math.round(keep), 0, tank);
  const trend = worldTrend(state, balance);
  const preis = (jacob: number) => {
    const m = marketMods(state, balance, jacob);
    return computePrice(m.shock !== 1 ? { ...balance.market, shock: balance.market.shock * m.shock } : balance.market, m.supply, trend);
  };
  const schonVerkauft = soldThisRound(state);
  return {
    cost: cents(behalten * (st.costPerBarrel + (st.shrink + st.fireChance * st.fireLoss) * state.postedPrice)),
    price: preis(schonVerkauft + tank - behalten),
    priceAll: preis(schonVerkauft + tank),
  };
}

/** Faktor des Weltmodells auf den Trendpreis (wie game.ts beim Markt). */
function worldTrend(state: GameState, balance: Balance): number {
  return worldPriceFactor(state.worldModel, balance.worldModel);
}

/** Jacobs Anteil am Salt-Hill-Angebot der letzten Runde (Verkauf ÷ Angebot). */
export function marketShare(state: GameState, balance: Balance): number {
  const verkauft = pricingOf(state).sold;
  const rest = neighbourSupply(balance.market, state.round, state.neighbourOffset ?? 0) + rivalSupply(state, balance.rivals.bullard.ratePerWell);
  return verkauft > 0 ? verkauft / (verkauft + rest) : 0;
}

// --- Cranes Abschlag und Aufschlag (gelesen von trust.ts) --------------------------

/** Cranes Abschlag aus den Preis-Aktionen in dieser Runde ($ je bbl). */
export function punishCut(state: Lage): number {
  const k = pricingOf(state).cranePunish;
  return k && state.round >= k.from && state.round <= k.until && k.from > pricingOf(state).clearedRound ? k.value : 0;
}

/** Cranes Aufschlag nach einem Handel ($ je bbl). */
export function dealBonus(state: Lage): number {
  const d = pricingOf(state).craneDeal;
  return d && state.round <= d.until ? d.bonus : 0;
}

/** Laufender Liefervertrag dieser Art in dieser Runde, oder null. */
export function activeContract(state: Lage, buyer: ContractState['buyer'], round = state.round): ContractState | null {
  const c = pricingOf(state).contract;
  return c && c.buyer === buyer && round >= c.from && round <= c.until ? c : null;
}

/** Cranes Groll wegen des Händlervertrags: Laufzeit + grudgeAfter Runden (gestrichen, wenn Crane ihn erlassen hat). */
export function contractGrudge(state: Lage, balance: Balance): number {
  const c = pricingOf(state).contract;
  if (!c || c.buyer !== 'haendler' || c.from <= pricingOf(state).clearedRound) return 0;
  return state.round >= c.from && state.round <= c.until + balance.priceActions.contract.grudgeAfter ? balance.transport.trader.grudgeCut : 0;
}

/** Abschläge und Groll, die vor oder in dieser Runde begannen, sind gestrichen? */
export function cutCleared(state: Partial<Pick<GameState, 'pricing'>>, startRound: number): boolean {
  return startRound <= pricingOf(state).clearedRound;
}

/** Cranes neuer Abschlag (rivals.crane.priceCut, mit Verband die Hälfte) ab der nächsten Runde. */
function punish(state: GameState, balance: Balance, extra = 0): GameState {
  const cr = balance.rivals.crane;
  const value = cents(cr.priceCut * (hasMark(state, M.alliance) ? cr.allianceFactor : 1));
  return withPricing(state, { cranePunish: { from: state.round + 1, until: state.round + cr.cutRounds + extra, value } });
}

// --- Förderbremse ------------------------------------------------------------------

/** Beitrittschance je Wildcatter-Firma. */
export function joinChance(state: GameState, balance: Balance): number {
  const j = balance.priceActions.cartel.join;
  return clamp(j.base + wildcatterStanding(state) + (hasMark(state, M.alliance) ? j.alliance : 0), j.min, j.max);
}

function producing(state: GameState): boolean {
  return state.wells.some((w) => w.status === 'found');
}

/** Gründet die Förderbremse: Jede Firma würfelt ihren Beitritt (Strang :preis). */
export function foundCartel(state: GameState, balance: Balance, organizer: boolean): GameState {
  const cb = balance.priceActions.cartel;
  const p = pricingOf(state);
  if (p.cartel || p.cartelBanUntil >= state.round) return log(state, 'Zur Förderbremse kommt keiner – die Wildcatter trauen dem Frieden nicht.');
  const r = rng(state, 'bremse');
  const chance = joinChance(state, balance);
  const members = state.wildcatters.firms.filter(() => r.float() < chance).map((f) => f.name);
  if (members.length === 0) return log(state, 'Abend im Saloon: Jacob zahlt die Runde, aber keiner der Wildcatter schlägt ein. Die Förderbremse kommt nicht zustande.');
  const cartel: CartelState = {
    since: state.round,
    until: state.round + cb.rounds - 1,
    members,
    jacobCut: organizer ? cb.organizerCut : cb.cut,
    organizer,
    heldRound: state.round,
    bullard: 'out',
    bullardAsked: false,
    bullardFullRound: 0,
    bullardBreakRound: 0,
    cheaters: [],
    cheatShare: 0,
    confronted: [],
    suspect: null,
  };
  const n = withPricing(state, { cartel, founded: p.founded + 1 });
  const anteil = cartelShare(n);
  const klausel = organizer ? ` Jacob selbst drosselt nur ${prozent(cb.organizerCut)} – als Organisator.` : ` Jacob drosselt selbst ${prozent(cb.cut)}.`;
  return setMark(
    log(n, `Förderbremse gegründet: ${members.join(', ')} drosseln ${prozent(cb.cut)} für ${runden(cb.rounds)} – ${prozent(anteil)} der Nachbarquellen.${klausel}`),
    PRICING_MARKS.cartel,
  );
}

function endCartel(state: GameState, text: string): GameState {
  return dropMark(dropMark(log(withPricing(state, { cartel: null }), text), PRICING_MARKS.suspect), PRICING_READ_MARKS[0]);
}

/** Zusammenbruch: Nachbarn fördern eine Runde mehr, niemand will einen neuen Pakt, Ruf sinkt. */
function collapse(state: GameState, balance: Balance, text: string): GameState {
  const cb = balance.priceActions.cartel;
  const p = pricingOf(state);
  const n = withPricing(state, { cartelBanUntil: state.round + cb.banRounds, collapseRound: state.round, collapsed: p.collapsed + 1, traderNever: p.traderNever || activeContract(state, 'haendler') !== null });
  return setMark(shiftStanding(endCartel(n, text), balance, balance.priceActions.standing.collapse), PRICING_MARKS.collapse);
}

/** Betrugschance eines Mitglieds in dieser Runde. */
export function cheatChance(state: GameState, balance: Balance, member: string): number {
  const c = pricingOf(state).cartel;
  if (!c || c.confronted.includes(member)) return 0;
  const ch = balance.priceActions.cartel.cheat;
  const bullardVoll = c.bullardFullRound === state.round - 1 || c.bullardBreakRound === state.round - 1;
  return clamp(
    ch.base +
      ch.perRound * (state.round - c.since) +
      (c.heldRound < state.round ? ch.unheld : 0) +
      (c.organizer ? balance.priceActions.cartel.organizerCheat : 0) +
      (bullardVoll ? ch.bullardFull : 0),
    0,
    1,
  );
}

/**
 * Rundenende der Förderbremse (vor dem Markt): Kartellverfahren, Betrug, Bullard.
 * In der Gründungsrunde betrügt noch niemand.
 */
function settleCartel(input: GameState, balance: Balance): GameState {
  let state = input;
  const cb = balance.priceActions.cartel;
  const c = pricingOf(state).cartel;
  if (!c || !cartelActive(state) || state.round === c.since) return state;
  // Kartellgesetz (4.3): Absprachen sind verboten.
  if (lawInForce(state.worldModel?.laws, 'antitrust') && rng(state, 'verfahren').float() < cb.antitrust.chance) {
    const n = withPricing({ ...state, cash: cents(state.cash - cb.antitrust.fine) }, { courtRound: state.round, cartelBanUntil: state.round + cb.banRounds });
    return endCartel(n, `Kartellverfahren! Der Staatsanwalt aus Hallstead löst die Förderbremse auf. Jacob zahlt ${money(cb.antitrust.fine)} Strafe, der Courier berichtet.`);
  }
  // Antwort auf den Brief „kartell_verdacht“: Jacob ist hingeritten – der Verdächtige betrügt nicht mehr.
  const ermahnt = state.events.marks[PRICING_READ_MARKS[0]];
  if (ermahnt !== undefined && c.suspect) {
    const marks = { ...state.events.marks };
    delete marks[PRICING_READ_MARKS[0]];
    delete marks[PRICING_MARKS.suspect];
    state = { ...state, events: { ...state.events, marks }, pricing: { ...pricingOf(state), cartel: { ...c, confronted: [...c.confronted, c.suspect], suspect: null } } };
    return settleCartel(state, balance);
  }
  // Der Brief zum Verdacht kommt einmal; danach bleibt nur die Karte „Zur Rede stellen“.
  const verdacht = state.events.marks[PRICING_MARKS.suspect];
  if (verdacht !== undefined && state.round >= verdacht + 2) state = dropMark(state, PRICING_MARKS.suspect);
  const r = rng(state, 'betrug');
  const cheaters = c.members.filter((m) => r.float() < cheatChance(state, balance, m));
  const gesamt = firmWells(state, c.members);
  const cheatShare = gesamt > 0 ? firmWells(state, cheaters) / gesamt : 0;
  let n = withPricing(state, { cartel: { ...c, cheaters, cheatShare } });
  if (cheatShare > cb.breakShare) {
    return collapse(n, balance, `Die Förderbremse platzt: ${cheaters.join(', ')} ${cheaters.length === 1 ? 'fördert' : 'fördern'} nachts heimlich voll, die anderen ziehen nach. Die Tanks am Salt Hill laufen über.`);
  }
  if (cheaters.length > 0 && c.suspect === null) {
    n = setMark(withPricing(n, { cartel: { ...pricingOf(n).cartel!, suspect: cheaters[0] } }), PRICING_MARKS.suspect);
  }
  if (cheaters.length > 0) n = log(n, `Gerede am Salt Hill: Nachts brennen bei ${cheaters.length === 1 ? 'einem der Wildcatter' : `${cheaters.length} Wildcattern`} die Lampen am Bohrturm. Die Förderbremse hält noch.`);
  // Bullard: drinnen bricht er vielleicht, draußen fährt er vielleicht voll auf.
  const b = rng(state, 'bullard').float();
  const cn = pricingOf(n).cartel!;
  if (cn.bullard === 'in' && b < cb.bullard.break) {
    n = setMark(log(withPricing(n, { cartel: { ...cn, bullardBreakRound: state.round, bullard: 'out' } }), 'Bullard bricht die Förderbremse und fördert, was die Pumpen hergeben.'), PRICING_MARKS.bullardBreak);
  } else if (cn.bullard === 'out' && b < cb.bullard.full) {
    n = log(withPricing(n, { cartel: { ...cn, bullardFullRound: state.round } }), 'Bullard lacht über die Förderbremse und fährt seine Pumpen voll auf. Die Mitglieder werden unruhig.');
  }
  return n;
}

/** Nach dem Markt: Läuft die Förderbremse ab, endet sie – hat sie lange genug gehalten, steigt der Ruf. */
function expireCartel(state: GameState, balance: Balance): GameState {
  const c = pricingOf(state).cartel;
  if (!c || state.round < c.until) return state;
  const s = balance.priceActions.standing;
  const n = endCartel(state, `Die Förderbremse läuft aus. ${c.until - c.since + 1 >= s.heldRounds ? 'Sie hat gehalten – die Wildcatter reden gut über Jacob.' : ''}`.trim());
  return c.until - c.since + 1 >= s.heldRounds ? shiftStanding(n, balance, s.held) : n;
}

// --- Liefervertrag -------------------------------------------------------------------

/** Festpreis eines Händlervertrags: Posted Price + premium − perRound · Laufzeit. */
export function contractPrice(state: Pick<GameState, 'postedPrice'>, balance: Balance, rounds: number): number {
  const k = balance.priceActions.contract;
  return cents(state.postedPrice + k.premium - k.perRound * rounds);
}

/** Mögliche Mengen je Runde: minQty … min(maxQty, Förderung der Vorrunde). */
export function contractQuantities(state: GameState, balance: Balance): number[] {
  const k = balance.priceActions.contract;
  const hoch = Math.min(k.maxQty, jacobSupply(state));
  const out: number[] = [];
  for (let q = k.minQty; q <= hoch; q += k.qtyStep) out.push(q);
  return out;
}

function contractLock(state: GameState, balance: Balance): string | null {
  const p = pricingOf(state);
  if (p.contract && state.round <= p.contract.until) return 'Es läuft schon ein Liefervertrag.';
  if (p.traderNever) return 'Seit die Förderbremse geplatzt ist, will der Händler keinen Vertrag mehr mit Jacob.';
  if (hasMark(state, PRICING_MARKS.traderBust) && p.contract === null && state.events.marks[PRICING_MARKS.traderBust] >= state.round - 1) return 'Der Händler ist pleite – sein Kontor ist versiegelt.';
  if (contractQuantities(state, balance).length === 0) return `Der Händler will mindestens ${bbl(balance.priceActions.contract.minQty)} bbl je Runde – so viel hat Jacob zuletzt nicht gefördert.`;
  return null;
}

/**
 * Lieferungen dieser Runde abrechnen (vor dem Markt): Fehlmenge kostet, Cranes Groll auf
 * die übrigen Verkäufe zählt gegen den Vertrag. Im Kreditcrash kann der Händler pleitegehen –
 * die laufende Runde bleibt unbezahlt. Nach der letzten Runde endet der Vertrag.
 */
function settleContract(state: GameState, balance: Balance): GameState {
  const k = balance.priceActions.contract;
  const p = pricingOf(state);
  const c = p.contract;
  if (!c) return state;
  let n = state;
  let gain = c.gain;
  const haendler = state.logistics.traderSold;
  if (c.buyer === 'haendler' && state.round >= c.from && state.round <= c.until) {
    const fehlt = Math.max(0, c.qty - haendler);
    const strafe = cents(fehlt * k.shortfall);
    const crane = Math.max(0, soldThisRound(state) - haendler);
    gain += haendler * (c.price - state.postedPrice) - strafe - crane * contractGrudge(state, balance);
    if (strafe > 0) n = log({ ...n, cash: cents(n.cash - strafe) }, `Liefervertrag: ${bbl(fehlt)} bbl zu wenig an den Händler – ${money(strafe)} Vertragsstrafe.`);
    // Kreditcrash (4.4): Der Händler kann pleitegehen.
    const krise = (state.worldModel?.news ?? []).some((x) => x === 'panic' || x === 'crash');
    if (krise && rng(state, 'haendler').float() < k.failChance) {
      const offen = cents(haendler * c.price);
      gain -= offen;
      n = setMark(log({ ...n, cash: cents(n.cash - offen) }, `Der Händler in Port Ellis ist pleite. Die Lieferungen dieser Runde (${money(offen)}) zahlt niemand mehr. Der Vertrag ist erloschen.`), PRICING_MARKS.traderBust);
      return withPricing(n, { contract: null, contractResults: [...p.contractResults, cents(gain)] });
    }
  } else if (c.buyer === 'crane' && state.round >= c.from && state.round <= c.until) {
    gain += Math.max(0, soldThisRound(state) - haendler) * (c.price - state.postedPrice);
  }
  if (state.round >= c.until) {
    n = log(n, c.buyer === 'haendler' ? 'Der Liefervertrag mit dem Händler ist erfüllt.' : 'Der Abnahmevertrag mit Crane läuft aus.');
    return withPricing(n, { contract: null, contractResults: [...p.contractResults, cents(gain)] });
  }
  return withPricing(n, { contract: { ...c, gain } });
}

// --- Gerücht -------------------------------------------------------------------------

export type RumourKind = 'versiegen' | 'riesenfund';

function rumourLock(state: GameState, balance: Balance): string | null {
  const r = pricingOf(state).rumours;
  const warten = r.lastRound > 0 ? r.lastRound + balance.priceActions.rumour.cooldown - state.round : 0;
  if (warten > 0) return `Ein neues Gerücht glaubt erst in ${runden(warten)} wieder jemand.`;
  return null;
}

/** Chance, dass das nächste Gerücht auffliegt. */
export function exposeChance(state: Partial<Pick<GameState, 'pricing'>>, balance: Balance): number {
  const e = balance.priceActions.rumour.exposed;
  return clamp(e.base + e.perRumour * pricingOf(state).rumours.count, 0, 1);
}

/** Stärke des nächsten Gerüchts (mit Abnutzung). */
export function rumourShock(state: Partial<Pick<GameState, 'pricing'>>, balance: Balance, kind: RumourKind): number {
  const rb = balance.priceActions.rumour;
  const roh = kind === 'versiegen' ? rb.dry.shock : rb.bullard.shock;
  return Math.round(roh * rb.wear ** pricingOf(state).rumours.count * 10000) / 10000;
}

/** Streut ein Gerücht (Rundenende): Schock auf den Preis dieser Runde – oder es fliegt auf. */
export function spreadRumour(state: GameState, balance: Balance, kind: RumourKind): GameState {
  const rb = balance.priceActions.rumour;
  const p = pricingOf(state);
  if (kind === 'versiegen' && state.oilStock < rb.dry.minTank) {
    return withPricing(log(state, 'Das Gerücht verpufft: Wer Jacobs Fässer jeden Tag zum Bahnhof rollen sieht, glaubt nicht an versiegende Quellen.'), {
      rumours: { ...p.rumours, lastRound: state.round },
    });
  }
  const auf = rng(state, 'geruecht').float() < exposeChance(state, balance);
  const value = rumourShock(state, balance, kind);
  const rumours = { count: p.rumours.count + 1, lastRound: state.round, kind, shock: auf ? null : { round: state.round, value }, exposedRound: auf ? state.round : p.rumours.exposedRound };
  let n = withPricing(state, { rumours });
  if (!auf) {
    n = log(
      n,
      kind === 'versiegen'
        ? 'Im Courier steht, am Salt Hill versiegen die ersten Quellen. Die Händler werden nervös – der Preis zieht an.'
        : 'Im Saloon erzählt man sich von einem Riesenfund bei Bullard. Der Preis bröckelt, die Farmer werden billiger, und Bullard wartet ab.',
    );
    if (kind === 'riesenfund') {
      n = applyEffects(withPricing(n, { bullardShyUntil: state.round + rb.bullard.rounds }), { leaseCost: rb.bullard.leaseCost }, 'geruecht_riesenfund', rb.bullard.rounds);
    }
    return n;
  }
  // Aufgeflogen: Nora verbrannt, Schlagzeile, Crane schlägt zurück, Ruf sinkt (beim Bullard-Gerücht: Fehde).
  n = punish(withPricing(n, { noraBurned: true }), balance);
  n = shiftStanding(setMark(n, PRICING_MARKS.exposed), balance, balance.priceActions.standing.exposed);
  if (kind === 'riesenfund') n = setMark(n, M.feud);
  return log(
    n,
    `Das Gerücht fliegt auf: Der Courier druckt, von wem es kam. Nora Brand schreibt nichts mehr für Jacob, Crane zahlt ihm weniger${kind === 'riesenfund' ? ', und Bullard schwört Rache' : ''}.`,
  );
}

/** Bullard pachtet nach dem Gerücht „Riesenfund“ eine Weile nichts (rival.ts). */
export function bullardShy(state: Lage): boolean {
  return pricingOf(state).bullardShyUntil >= state.round;
}

// --- Crane feilschen ---------------------------------------------------------------

export interface CranePoint {
  key: keyof Balance['priceActions']['crane']['points'];
  label: string;
  points: number;
  ok: boolean;
}

/** Druckmittel gegen Crane: was Jacob in der Hand hat. */
export function cranePoints(state: GameState, balance: Balance): CranePoint[] {
  const cr = balance.priceActions.crane;
  const lg = state.logistics;
  const pipeline = lg.pipeline === 'building' || lg.pipeline === 'ready' || lg.pipeline === 'damaged';
  const debatte = state.worldModel?.laws?.bills?.antitrust?.stage === 'debate';
  const punkte: Omit<CranePoint, 'points'>[] = [
    { key: 'contract', label: 'Liefervertrag mit dem Händler', ok: activeContract(state, 'haendler') !== null || activeContract(state, 'haendler', state.round + 1) !== null },
    { key: 'freight', label: `eigene Wege (${cr.freightTeams} Gespanne oder Pipeline)`, ok: lg.teams >= cr.freightTeams || pipeline },
    { key: 'cartel', label: 'Förderbremse läuft', ok: cartelActive(state) },
    { key: 'alliance', label: 'Delgados Verband', ok: hasMark(state, M.alliance) },
    { key: 'share', label: `Marktanteil ab ${prozent(cr.shareMin)}`, ok: marketShare(state, balance) >= cr.shareMin },
    { key: 'antitrust', label: 'Kartellgesetz in der Debatte', ok: debatte },
    { key: 'tank', label: `Tank ab ${bbl(cr.tankMin)} bbl`, ok: state.oilStock >= cr.tankMin },
  ];
  return punkte.map((x) => ({ ...x, points: cr.points[x.key] }));
}

export function cranePressure(state: GameState, balance: Balance): number {
  return cranePoints(state, balance).reduce((s, p) => s + (p.ok ? p.points : 0), 0);
}

/**
 * Mit Crane feilschen (Rundenende), Ergebnis nach Punkten:
 *   1: Abfuhr – Bittsteller, der Abschlag kommt sofort und länger.
 *   2: laufender Abschlag und Groll gestrichen.
 *   ≥ 3 (nur mit „angebot“): zusätzlich Aufschlag – gegen Austritt aus Pakt oder Händlervertrag (Verrat).
 *   ≥ 4 (nur mit „angebot“): dazu ein fester Abnahmevertrag; Jacob verliert Delgados Verband.
 */
export function haggleCrane(state: GameState, balance: Balance, offer: boolean): GameState {
  const cr = balance.priceActions.crane;
  const punkte = cranePressure(state, balance);
  if (punkte <= 0) return log(state, 'Crane lässt Jacob nicht einmal ins Kontor.');
  if (punkte === 1) {
    return setMark(log(punish(state, balance, cr.rebuffExtra), 'Crane hört sich Jacob an und lacht. „Bittsteller bekommen bei mir den Abschlag.“'), PRICING_MARKS.supplicant);
  }
  let n = withPricing(state, { clearedRound: state.round, cranePunish: null });
  n = log(n, 'Crane rechnet nach und streicht Abschlag und Groll – Jacob hat zu viel in der Hand.');
  if (punkte < 3 || !offer) return n;
  // Ab 3 Punkten: Aufschlag – aber nur gegen Austritt.
  const p = pricingOf(n);
  if (p.cartel) {
    n = setMark(shiftStanding(endCartel(withPricing(n, { cartelBanUntil: state.round + balance.priceActions.cartel.banRounds }), 'Jacob steigt aus der Förderbremse aus – für Cranes Geld. Die Wildcatter nennen es Verrat.'), balance, balance.priceActions.standing.betrayal), PRICING_MARKS.betrayal);
  } else if (activeContract(n, 'haendler') || activeContract(n, 'haendler', state.round + 1)) {
    n = shiftStanding(log(withPricing(n, { contract: null, contractResults: [...p.contractResults, cents(p.contract?.gain ?? 0)] }), 'Jacob kündigt dem Händler in Port Ellis – Crane zahlt besser. Am Salt Hill nennt man es Verrat.'), balance, balance.priceActions.standing.betrayal);
    n = setMark(n, PRICING_MARKS.betrayal);
  }
  n = withPricing(n, { craneDeal: { bonus: cr.deal.bonus, until: state.round + cr.deal.rounds } });
  n = setMark(log(n, `Handschlag mit Crane: ${dollar(cr.deal.bonus)} je Barrel mehr für ${runden(cr.deal.rounds)}.`), PRICING_MARKS.craneDeal);
  if (punkte >= 4 && pricingOf(n).contract === null) {
    const contract: ContractState = { buyer: 'crane', qty: 0, price: cents(state.postedPrice + cr.contract.premium), from: state.round + 1, until: state.round + cr.contract.rounds, gain: 0 };
    n = dropMark(withPricing(n, { contract }), M.alliance);
    n = log(n, `Dazu ein fester Abnahmevertrag: Crane kauft ${runden(cr.contract.rounds)} lang zu ${dollar(contract.price)}. Delgados Verband will Jacob nicht mehr sehen.`);
  }
  return n;
}

// --- Rundenende ------------------------------------------------------------------------

/**
 * Rundenende vor dem Markt: Verkauf merken, Liefervertrag abrechnen, Förderbremse (Verfahren,
 * Betrug, Bullard). Läuft nach den Karten des Planungsbretts (settlePlans), damit eine neue
 * Förderbremse schon den Preis dieser Runde trifft.
 */
export function settlePricing(state: GameState, balance: Balance): GameState {
  const n = withPricing(state, { sold: soldThisRound(state) });
  return settleCartel(settleContract(n, balance), balance);
}

/**
 * Rundenende nach dem Markt: Wirkung auf den Preis festhalten, Crane schlägt bei zu hohem Preis
 * zurück, abgelaufene Förderbremse und Handel enden. price = neuer Posted Price, mods = was der
 * Markt gerechnet hat, trend = Faktor des Weltmodells.
 */
export function settlePricingAfterMarket(state: GameState, balance: Balance, mods: MarketMods, trend: number): GameState {
  const p = pricingOf(state);
  let n = state;
  const lief = cartelActive(state) || mods.shock !== 1;
  if (lief) {
    const without = computePrice(balance.market, mods.plain, trend);
    const c = p.cartel;
    const bremse = cartelActive(state);
    n = withPricing(n, {
      effect: { round: state.round, price: state.postedPrice, without, cartel: bremse, share: bremse ? cartelShare(state) : 0, first: bremse && c !== null && c.since === state.round, jacobCut: bremse && c ? c.jacobCut : 0 },
    });
    const plus = state.postedPrice / without - 1;
    if (cartelActive(state) && Math.abs(plus) >= 0.005) n = log(n, `Die Förderbremse hebt den Preis um ${prozent(plus)} (ohne sie: ${dollar(without)}).`);
    // Crane schlägt zurück, wenn der Preis zu hoch steigt.
    const zuHoch = state.postedPrice > balance.priceActions.cartel.craneTrigger * balance.market.basePrice * trend;
    if (cartelActive(state) && zuHoch && punishCut({ ...n, round: state.round + 1 }) === 0) {
      n = log(punish(n, balance), 'Crane mag keine Absprachen, die ihm den Preis diktieren: Er zahlt Jacob ab der nächsten Runde weniger.');
    }
  } else if (p.effect) n = withPricing(n, { effect: null });
  n = expireCartel(n, balance);
  const d = pricingOf(n).craneDeal;
  if (d && state.round >= d.until) n = withPricing(n, { craneDeal: null });
  return n;
}

// --- Karten des Planungsbretts (Reiter Markt) ---------------------------------------------

const KEIN_PAKT = 'Es läuft keine Förderbremse.';

function cartelLock(state: GameState, _balance: Balance): string | null {
  const p = pricingOf(state);
  if (p.cartel) return 'Die Förderbremse läuft schon.';
  if (p.cartelBanUntil >= state.round) return `Nach dem letzten Pakt will erst ab Runde ${p.cartelBanUntil - (state.chapterStart ?? 1) + 2} wieder jemand davon hören.`;
  if (!producing(state)) return 'Ohne eigene fördernde Quelle hat Jacob nichts, was er drosseln könnte.';
  if (state.wildcatters.firms.length === 0) return 'Es gibt keine Wildcatter, die mitmachen könnten.';
  return null;
}

export const PRICE_HANDLERS: Record<string, PlanHandler> = {
  foerderbremse: {
    lock: (s, b) => cartelLock(s, b),
    options: (_s, b) => {
      const cb = b.priceActions.cartel;
      return [
        { id: 'ehrlich', label: `Ehrlich mitdrosseln (Jacob ${prozent(cb.cut)})`, reason: null },
        { id: 'klausel', label: `Organisatoren-Klausel (Jacob nur ${prozent(cb.organizerCut)}, alle betrügen leichter)`, reason: null },
      ];
    },
    detail: (s, b) => `Jede Firma schlägt mit etwa ${prozent(joinChance(s, b))} ein (Ruf bei den Wildcattern ${standingWord(s)}).`,
    apply: (s, b, t) => (cartelLock(s, b) && pricingOf(s).cartel ? log(s, 'Die Förderbremse läuft schon.') : foundCartel(s, b, t === 'klausel')),
  },
  pakt_halten: {
    visible: (s) => cartelActive(s) && pricingOf(s).cartel!.since < s.round,
    lock: (s) => (pricingOf(s).cartel?.heldRound === s.round ? 'Der Pakt ist für diese Runde schon gehalten.' : null),
    apply: (s) => {
      const c = pricingOf(s).cartel;
      if (!c) return log(s, KEIN_PAKT);
      return log(withPricing(s, { cartel: { ...c, heldRound: s.round } }), 'Jacob reitet die Bohrstellen der Wildcatter ab und hält den Pakt zusammen.');
    },
  },
  pakt_verlaengern: {
    visible: (s) => cartelActive(s) && pricingOf(s).cartel!.until - s.round <= 1,
    apply: (s, b) => {
      const c = pricingOf(s).cartel;
      if (!c) return log(s, KEIN_PAKT);
      const until = c.until + b.priceActions.cartel.rounds;
      return log(withPricing(s, { cartel: { ...c, until } }), `Die Förderbremse ist verlängert – noch einmal ${runden(b.priceActions.cartel.rounds)}.`);
    },
  },
  bullard_einladen: {
    visible: (s) => cartelActive(s) && !pricingOf(s).cartel!.bullardAsked,
    detail: (s, b) => `Bullard kommt mit etwa ${prozent(bullardJoinChance(s, b))}.`,
    apply: (s, b) => {
      const c = pricingOf(s).cartel;
      if (!c) return log(s, KEIN_PAKT);
      const drin = rng(s, 'bullard_einladen').float() < bullardJoinChance(s, b);
      return log(
        withPricing(s, { cartel: { ...c, bullardAsked: true, bullard: drin ? 'in' : 'out' } }),
        drin ? 'Bullard schlägt ein: Er drosselt mit. „Aber wehe, einer von euch Hungerleidern bricht.“' : 'Bullard lacht Jacob aus. Er bleibt draußen – und wird fördern, was er kann.',
      );
    },
  },
  zur_rede: {
    visible: (s) => cartelActive(s) && pricingOf(s).cartel!.suspect !== null,
    detail: (s) => `Verdacht: ${pricingOf(s).cartel?.suspect ?? ''}.`,
    apply: (s) => {
      const c = pricingOf(s).cartel;
      if (!c || !c.suspect) return log(s, KEIN_PAKT);
      const n = withPricing(s, { cartel: { ...c, confronted: [...c.confronted, c.suspect], suspect: null } });
      return dropMark(log(n, `Jacob stellt ${c.suspect} zur Rede. Ab jetzt bleibt dessen Pumpe nachts still.`), PRICING_MARKS.suspect);
    },
  },
  liefervertrag: {
    lock: (s, b) => contractLock(s, b),
    options: (s, b) =>
      b.priceActions.contract.rounds.flatMap((r) =>
        contractQuantities(s, b).map((q): PlanOption => ({ id: `${r}x${q}`, label: `${runden(r)} · ${bbl(q)} bbl je Runde zu ${dollar(contractPrice(s, b, r))}`, reason: null })),
      ),
    detail: (_s, b) => `Fehlmenge kostet ${dollar(b.priceActions.contract.shortfall)} je bbl; Crane grollt die Laufzeit und ${runden(b.priceActions.contract.grudgeAfter)} danach.`,
    apply: (s, b, t) => {
      const grund = contractLock(s, b);
      const [r, q] = (t ?? '').split('x').map(Number);
      if (grund || !r || !q) return log(s, `Kein Liefervertrag: ${grund ?? 'unklare Bedingungen'}`);
      const contract: ContractState = { buyer: 'haendler', qty: q, price: contractPrice(s, b, r), from: s.round + 1, until: s.round + r, gain: 0 };
      return setMark(log(withPricing(s, { contract }), `Liefervertrag mit dem Händler: ${bbl(q)} bbl je Runde zu ${dollar(contract.price)}, ${runden(r)} ab der nächsten Runde.`), PRICING_MARKS.contract);
    },
  },
  geruecht: {
    lock: (s, b) => rumourLock(s, b),
    options: (s, b) => [
      {
        id: 'versiegen',
        label: `„Am Salt Hill versiegen die Quellen“ (Preis +${prozent(rumourShock(s, b, 'versiegen'))})`,
        reason: s.oilStock < b.priceActions.rumour.dry.minTank ? `Glaubt nur, wer volle Tanks sieht (ab ${bbl(b.priceActions.rumour.dry.minTank)} bbl).` : null,
      },
      { id: 'riesenfund', label: `„Riesenfund bei Bullard“ (Preis ${prozent(rumourShock(s, b, 'riesenfund'))}, Pachten billiger)`, reason: null },
    ],
    detail: (s, b) => `Fliegt mit etwa ${prozent(exposeChance(s, b))} auf.`,
    apply: (s, b, t) => (rumourLock(s, b) ? log(s, rumourLock(s, b)!) : spreadRumour(s, b, t === 'riesenfund' ? 'riesenfund' : 'versiegen')),
  },
  crane_feilschen: {
    lock: (s, b) => (cranePressure(s, b) === 0 ? 'Kein Druckmittel gegen Crane.' : null),
    options: () => [
      { id: 'abschlag', label: 'Nur Abschlag und Groll vom Tisch', reason: null },
      { id: 'angebot', label: 'Auch sein Angebot annehmen – selbst wenn es Verrat ist', reason: null },
    ],
    detail: (s, b) => {
      const punkte = cranePoints(s, b).filter((p) => p.ok);
      return `Druckmittel: ${punkte.length > 0 ? punkte.map((p) => p.label).join(', ') : 'keins'} (${cranePressure(s, b)} Punkte).`;
    },
    apply: (s, b, t) => haggleCrane(s, b, t === 'angebot'),
  },
};

/** Chance, dass Bullard der Förderbremse beitritt (Handschlag, neutral, Fehde). */
export function bullardJoinChance(state: GameState, balance: Balance): number {
  const bb = balance.priceActions.cartel.bullard;
  if (bullardFeud(state)) return bb.feud;
  return hasMark(state, M.pact) ? bb.handshake : bb.neutral;
}

/** Ruf in Worten. */
export function standingWord(state: Partial<Pick<GameState, 'wildcatterStanding'>>): string {
  const s = wildcatterStanding(state);
  if (s <= -0.2) return 'verbrannt';
  if (s < -0.05) return 'angekratzt';
  if (s < 0.05) return 'unbeschrieben';
  if (s < 0.2) return 'gut';
  return 'hervorragend';
}

// --- Ansicht ----------------------------------------------------------------------------------

export interface PricingView {
  standing: number;
  standingWord: string;
  cartel: {
    members: string[];
    share: number;
    roundsLeft: number;
    jacobCut: number;
    bullard: 'in' | 'out' | 'nicht gefragt';
    /** Gerede über Betrug in dieser Runde. */
    gossip: string | null;
    held: boolean;
  } | null;
  banRounds: number;
  contract: { buyer: ContractState['buyer']; qty: number; price: number; roundsLeft: number; started: boolean } | null;
  rumours: number;
  noraBurned: boolean;
  /** Was die Förderbremse bzw. das Gerücht am letzten Preis gemacht hat (Anteil, z. B. 0,12). */
  lastEffect: number | null;
  craneDeal: number;
  cranePunish: number;
}

/** Was Pinnwand und Markt-Reiter über die Preis-Aktionen zeigen – die Oberfläche rechnet nichts. */
export function pricingView(state: GameState): PricingView {
  const p = pricingOf(state);
  const c = p.cartel;
  return {
    standing: wildcatterStanding(state),
    standingWord: standingWord(state),
    cartel: c
      ? {
          members: c.members,
          share: cartelShare(state),
          roundsLeft: Math.max(0, c.until - state.round + 1),
          jacobCut: c.jacobCut,
          bullard: c.bullardAsked ? c.bullard : 'nicht gefragt',
          gossip: c.cheaters.length > 0 ? 'Nachts brennen an manchen Bohrtürmen der Mitglieder die Lampen.' : c.suspect ? `Man munkelt über ${c.suspect}.` : null,
          held: c.heldRound === state.round || c.since === state.round,
        }
      : null,
    banRounds: Math.max(0, p.cartelBanUntil - state.round + 1),
    contract: p.contract ? { buyer: p.contract.buyer, qty: p.contract.qty, price: p.contract.price, roundsLeft: Math.max(0, p.contract.until - state.round + 1), started: state.round >= p.contract.from } : null,
    rumours: p.rumours.count,
    noraBurned: p.noraBurned,
    lastEffect: p.effect && p.effect.round === state.round - 1 && p.effect.without > 0 ? p.effect.price / p.effect.without - 1 : null,
    craneDeal: dealBonus(state),
    cranePunish: punishCut(state),
  };
}

/** Prüft einen Preis-Zustand aus dem Spielstand. */
export function isPricingState(value: unknown): value is PricingState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const zahlen = ['sold', 'cartelBanUntil', 'collapseRound', 'courtRound', 'founded', 'collapsed', 'bullardShyUntil', 'clearedRound'];
  if (!zahlen.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k] as number))) return false;
  if (typeof v.traderNever !== 'boolean' || typeof v.noraBurned !== 'boolean' || !Array.isArray(v.contractResults)) return false;
  const r = v.rumours as Record<string, unknown> | undefined;
  if (!r || typeof r.count !== 'number' || typeof r.lastRound !== 'number' || typeof r.exposedRound !== 'number') return false;
  const c = v.cartel as Record<string, unknown> | null;
  if (c !== null && (typeof c !== 'object' || typeof c.since !== 'number' || typeof c.until !== 'number' || !Array.isArray(c.members) || !Array.isArray(c.cheaters) || !Array.isArray(c.confronted))) return false;
  const k = v.contract as Record<string, unknown> | null;
  if (k !== null && (typeof k !== 'object' || typeof k.qty !== 'number' || typeof k.price !== 'number' || typeof k.from !== 'number' || typeof k.until !== 'number')) return false;
  return true;
}
