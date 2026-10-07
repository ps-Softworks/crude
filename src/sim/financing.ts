// Geldquellen (GDD §8 – „jede Geldquelle hat einen Haken“), als Karten im Adressbuch:
//
//   Privatinvestoren (A2, ab Kapitel 1): Witwe Lavinia Sloane, Doktor Haskell, Rancher Amos Whitcomb. Jeder gibt eine
//     Einlage (wächst mit dem Kapitel), bekommt rounds Runden lang share vom Gewinn der Runde und am Ende die Einlage
//     zurück. Jeder hat einen Wunsch (Sloane: Rücklage in der Kasse, Haskell: keine Bankschulden über der Einlage,
//     Whitcomb: kein neues Bohrloch neben seiner Weide). Gebrochen → Beschwerdebrief, Beziehung sinkt. Reicht die Kasse
//     am Ende nicht für die Einlage, ist ihr Geld verloren → persönliches Drama (Ereignis), Beziehung auf 0.
//   Farm-out (A3, Stelle „Andere Ölleute“): Ein Partner (Bullard, in Fehde ein Wildcatter) bohrt mit eigenem Turm und
//     auf eigene Kosten auf einer ungebohrten Pacht Jacobs (erste Stufe). Fündig → er holt rounds Runden lang share der
//     Förderung dieser Quelle aus dem Tank. Mit cheat je Runde nimmt er mehr (cheatExtra), als ihm zusteht; die Karte
//     „Abrechnung prüfen“ deckt es auf: Nachzahlung, Bruch. Wer grundlos prüft, kränkt ihn ein wenig.
//   Konsortium (A5, ab Kapitel 2): Mr. Vale leiht zinslos eine große Summe (einmal je Partie, fällig nach rounds Runden).
//     Nach favorAfter Runden will er einen Gefallen (Ereignis vale_gefallen). Wer ablehnt, muss sofort zurückzahlen,
//     und die Stelle ist verärgert. Das Geld zählt in Kapitel 3 als Vales Geld (vale_geld, Vertrauen beim Konsortium).
//   Regierung (A6, ab Kapitel 2, nur in Krieg und Krise): billiger Staatskredit mit Preisbindung (Jacob liefert je Runde
//     Öl zum Preis bei Abschluss × (1 − discount)) und Staatsauftrag (Liefermenge zum Festpreis × (1 + premium)) unter
//     staatlicher Aufsicht (Hitze für Delaney, stateOversightHeat).
//
// Die Einlagen und Darlehen zählen als Schulden (financingDebt: Steuer, Imperiumswert). Abrechnung am Rundenende in
// settleFinancing (game.ts, direkt vor der Einkommensteuer – der Gewinnanteil mindert den Gewinn der Runde).
// Zufall nur für den Farm-out-Betrug (Seed + Quelle + Runde). Zahlen in balance.yaml financing (PLATZHALTER).
import type { Balance } from './balance';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import { debt } from './credit';
import { setMark } from './diplomacyCore';
import { startDrilling, wellsOn } from './drilling';
import {
  FINANCING_READ_MARKS,
  INVESTORS,
  investorCompensateMark,
  investorPayoutMark,
  investorUpsetMark,
  VALE_FAVOR_DUE,
  VALE_FAVOR_REFUSED,
  type InvestorId,
} from './financingMarks';
import type { GameState } from './game';
import { taxableProfit } from './lawEffects';
import { shiftRelation } from './network';
import type { PlanHandler, PlanOption } from './planHandler';
import { Rng, seedFromString } from './rng';
import { worldInCrisis } from './world';

export { INVESTORS, FINANCING_READ_MARKS, type InvestorId };

export type InvestorWish = 'reserve' | 'debt' | 'land';

export interface InvestorBalance {
  /** Stelle im Adressbuch (network.contacts). */
  contact: string;
  /** Einlagen zur Wahl je Kapitel (Index 0 = Kapitel 1; leer = gibt in diesem Kapitel nichts). */
  sizes: number[][];
  rounds: number;
  /** Anteil am Gewinn der Runde. */
  share: number;
  wish: InvestorWish;
  /** reserve: Kasse mindestens value × Einlage; debt: Bankschulden höchstens value × Einlage; land: ohne Bedeutung. */
  value: number;
}

export interface FinancingBalance {
  investors: Record<InvestorId, InvestorBalance>;
  farmout: {
    share: number;
    rounds: number;
    /** Chance je Runde, dass der Partner mehr nimmt (bullard / ein Wildcatter). */
    cheat: { bullard: number; wildcatter: number };
    /** So viel der Förderung nimmt er beim Betrug zusätzlich. */
    cheatExtra: number;
    /** Beziehung zu den Ölleuten: ertappt −caught, grundlos geprüft −clean. */
    caught: number;
    clean: number;
  };
  vale: { contact: string; sizes: number[][]; rounds: number; favorAfter: number };
  state: {
    contact: string;
    /** Außenspannung, ab der der Staat auch ohne Krieg/Krise Geld und Aufträge gibt. */
    tensionFrom: number;
    loan: { sizes: number[][]; rate: number; rounds: number; deliverPerDollar: number; discount: number; shortfall: number };
    order: { sizes: number[][]; rounds: number; premium: number; shortfall: number; heat: number };
  };
}

export interface InvestorDeal {
  id: InvestorId;
  amount: number;
  share: number;
  from: number;
  /** Letzte Runde; an ihrem Ende kommt die Einlage zurück. */
  until: number;
  /** Bisher ausgezahlte Gewinnanteile. */
  paid: number;
  /** Wunsch gebrochen (nur einmal je Abmachung). */
  broken: boolean;
  /** Whitcomb: seine Weide. */
  ranch?: string;
}

/** 0.4.20+49: Anteil des Partners – gekürzt, wenn Jacob das Tieferbohren selbst bezahlt hat. */
export function farmoutShare(f: Pick<FarmOut, 'share' | 'paid'>, spent: number): number {
  if (f.paid === undefined || spent <= 0) return f.share;
  return f.share * Math.min(1, f.paid / spent);
}

export interface FarmOut {
  wellId: string;
  parcelId: string;
  partner: 'bullard' | 'wildcatter';
  share: number;
  /** Turm des Partners (weg, sobald die Bohrung fertig ist). */
  rigId: string | null;
  from: number;
  until: number;
  /** Zu viel genommenes Öl in $ (Posted Price der Runde), das eine Prüfung zurückholt. */
  owed: number;
  /** Ertappt: betrügt nicht mehr. */
  caught: boolean;
  /** 0.4.20+49: Was der Partner bezahlt hat (erste Stufe). Bohrt Jacob auf eigene Kosten tiefer, sinkt der Anteil im
   * Verhältnis paid ÷ gesamte Bohrkosten. Fehlt (alter Stand) = voller Anteil. */
  paid?: number;
}

export interface DeliveryDeal {
  amount: number;
  rate: number;
  qty: number;
  price: number;
  from: number;
  until: number;
}

export interface FinancingState {
  investors: InvestorDeal[];
  farmouts: FarmOut[];
  /** Vales Darlehen; favorRound = ab dann will er seinen Gefallen. */
  vale: { amount: number; from: number; until: number; favorRound: number } | null;
  /** Vale gibt nur einmal. */
  valeUsed: boolean;
  /** Staatskredit (amount, rate) mit Lieferpflicht; Staatsauftrag nur Lieferung (amount = rate = 0). */
  stateLoan: DeliveryDeal | null;
  stateOrder: DeliveryDeal | null;
  /** Verlorene Einlagen je Investor (für die Entschädigung im Drama). */
  lost: Partial<Record<InvestorId, number>>;
  /** Merkzeichen-Antworten, die schon gewirkt haben. */
  done: string[];
}

// --- balance.yaml ---------------------------------------------------------------------

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function zahl(o: unknown, path: string, min = 0, max = Infinity): number {
  const v = path.split('.').reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), o);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new BalanceError(`balance.yaml: "financing.${path}" fehlt oder liegt nicht zwischen ${min} und ${max}`);
  return v;
}

function text(o: unknown, path: string): string {
  const v = path.split('.').reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), o);
  if (typeof v !== 'string' || v === '') throw new BalanceError(`balance.yaml: "financing.${path}" fehlt`);
  return v;
}

function stufen(o: unknown, path: string): number[][] {
  const v = path.split('.').reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), o);
  if (!Array.isArray(v) || v.length === 0 || v.some((k) => !Array.isArray(k) || k.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0))) {
    throw new BalanceError(`balance.yaml: "financing.${path}" muss je Kapitel eine Liste von Beträgen sein (leer = keine)`);
  }
  return v as number[][];
}

const WISHES: readonly InvestorWish[] = ['reserve', 'debt', 'land'];

export function parseFinancingBalance(raw: unknown): FinancingBalance {
  const f = obj(raw) ? raw.financing : undefined;
  if (!obj(f)) throw new BalanceError('balance.yaml: "financing" fehlt');
  const investors: Partial<Record<InvestorId, InvestorBalance>> = {};
  for (const id of INVESTORS) {
    const w = text(f, `investors.${id}.wish`);
    if (!(WISHES as readonly string[]).includes(w)) throw new BalanceError(`balance.yaml: "financing.investors.${id}.wish" muss ${WISHES.join('/')} sein`);
    investors[id] = {
      contact: text(f, `investors.${id}.contact`),
      sizes: stufen(f, `investors.${id}.sizes`),
      rounds: zahl(f, `investors.${id}.rounds`, 1),
      share: zahl(f, `investors.${id}.share`, 0, 1),
      wish: w as InvestorWish,
      value: zahl(f, `investors.${id}.value`, 0),
    };
  }
  return {
    investors: investors as Record<InvestorId, InvestorBalance>,
    farmout: {
      share: zahl(f, 'farmout.share', 0, 1),
      rounds: zahl(f, 'farmout.rounds', 1),
      cheat: { bullard: zahl(f, 'farmout.cheat.bullard', 0, 1), wildcatter: zahl(f, 'farmout.cheat.wildcatter', 0, 1) },
      cheatExtra: zahl(f, 'farmout.cheatExtra', 0, 1),
      caught: zahl(f, 'farmout.caught', 0, 100),
      clean: zahl(f, 'farmout.clean', 0, 100),
    },
    vale: { contact: text(f, 'vale.contact'), sizes: stufen(f, 'vale.sizes'), rounds: zahl(f, 'vale.rounds', 1), favorAfter: zahl(f, 'vale.favorAfter', 1) },
    state: {
      contact: text(f, 'state.contact'),
      tensionFrom: zahl(f, 'state.tensionFrom', 0, 100),
      loan: {
        sizes: stufen(f, 'state.loan.sizes'),
        rate: zahl(f, 'state.loan.rate', 0, 1),
        rounds: zahl(f, 'state.loan.rounds', 1),
        deliverPerDollar: zahl(f, 'state.loan.deliverPerDollar', 0, 10),
        discount: zahl(f, 'state.loan.discount', 0, 1),
        shortfall: zahl(f, 'state.loan.shortfall', 0, 10),
      },
      order: {
        sizes: stufen(f, 'state.order.sizes'),
        rounds: zahl(f, 'state.order.rounds', 1),
        premium: zahl(f, 'state.order.premium', 0, 1),
        shortfall: zahl(f, 'state.order.shortfall', 0, 10),
        heat: zahl(f, 'state.order.heat', 0, 100),
      },
    },
  };
}

// --- Hilfen ---------------------------------------------------------------------------

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function money(v: number): string {
  return `${Math.round(v).toLocaleString('de-DE')} $`;
}

function bbl(v: number): string {
  return `${Math.round(v).toLocaleString('de-DE')} bbl`;
}

function percent(v: number): string {
  return `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

function price(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} $`;
}

/** Runde im Kapitel, wie der Schreibtisch sie zeigt (Runden zählen über Kapitel hinweg weiter). */
function rk(state: Pick<GameState, 'chapterStart'>, round: number): number {
  return round - (state.chapterStart ?? 1) + 1;
}

function log(state: GameState, line: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${line}`] };
}

export function newFinancing(): FinancingState {
  return { investors: [], farmouts: [], vale: null, valeUsed: false, stateLoan: null, stateOrder: null, lost: {}, done: [] };
}

export function financingOf(state: Partial<Pick<GameState, 'financing'>>): FinancingState {
  return state.financing ?? newFinancing();
}

function withFin(state: GameState, patch: Partial<FinancingState>): GameState {
  return { ...state, financing: { ...financingOf(state), ...patch } };
}

/** Beträge im aktuellen Kapitel (leer = gibt es hier nicht). */
export function sizesIn(state: Partial<Pick<GameState, 'chapter'>>, sizes: number[][]): number[] {
  const k = Math.max(1, state.chapter ?? 1);
  return sizes[Math.min(sizes.length, k) - 1] ?? [];
}

/** Einlagen und Darlehen, die Jacob noch zurückzahlen muss – zählen wie Schulden (Steuer, Imperiumswert). */
export function financingDebt(state: Partial<Pick<GameState, 'financing'>>): number {
  const f = state.financing;
  if (!f) return 0;
  return cents(f.investors.reduce((s, d) => s + d.amount, 0) + (f.vale?.amount ?? 0) + (f.stateLoan?.amount ?? 0));
}

/** Krieg oder Krise im Weltmodell – oder die Außenspannung hoch genug: nur dann gibt der Staat Geld und Aufträge. */
export function stateOpen(state: Pick<GameState, 'worldModel'>, balance: Pick<Balance, 'financing'>): boolean {
  const w = state.worldModel;
  return worldInCrisis(w) || (w?.tension ?? 0) >= balance.financing.state.tensionFrom;
}

/** Hitze für Delaney: Unter staatlicher Aufsicht (Staatsauftrag läuft) sehen Prüfer in Jacobs Bücher. */
export function stateOversightHeat(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'financing'>>, balance: Pick<Balance, 'financing'>): number {
  const o = state.financing?.stateOrder;
  return o && o.until >= state.round ? balance.financing.state.order.heat : 0;
}

/** Whitcombs Weide: die erste fremde Ranch neben Jacobs Pachten (sonst die erste fremde überhaupt). */
export function whitcombRanch(state: Pick<GameState, 'parcels' | 'leases'>): string | null {
  const eigen = new Set(state.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId));
  const frei = state.parcels.filter((p) => !p.discovery && !eigen.has(p.id) && !state.leases.some((l) => l.parcelId === p.id));
  const nachbar = frei.filter((p) => p.neighbors.some((n) => eigen.has(n))).sort((a, b) => a.id.localeCompare(b.id));
  return (nachbar[0] ?? [...frei].sort((a, b) => a.id.localeCompare(b.id))[0])?.id ?? null;
}

/** Wo Whitcomb kein neues Bohrloch sehen will: seine Weide und ihre Nachbarn. */
export function whitcombZone(state: Pick<GameState, 'parcels'>, ranch: string): string[] {
  const p = state.parcels.find((x) => x.id === ranch);
  return p ? [p.id, ...p.neighbors] : [ranch];
}

function ranchName(state: Pick<GameState, 'parcels'>, id: string): string {
  return state.parcels.find((p) => p.id === id)?.name ?? id;
}

/** Ist der Wunsch des Investors gerade gebrochen? */
export function wishBroken(state: GameState, balance: Pick<Balance, 'financing'>, d: InvestorDeal): boolean {
  const b = balance.financing.investors[d.id];
  if (b.wish === 'reserve') return state.cash < b.value * d.amount;
  if (b.wish === 'debt') return debt(state) > b.value * d.amount;
  if (!d.ranch) return false;
  const zone = new Set(whitcombZone(state, d.ranch));
  return state.wells.some((w) => w.startRound >= d.from && zone.has(w.parcelId));
}

function wishText(state: GameState, balance: Pick<Balance, 'financing'>, id: InvestorId, amount: number | null, ranch: string | null): string {
  const b = balance.financing.investors[id];
  if (b.wish === 'reserve') return amount === null ? `will eine Rücklage: Kasse nie unter ${percent(b.value)} der Einlage` : `will eine Rücklage: Kasse nie unter ${money(b.value * amount)}`;
  if (b.wish === 'debt') return amount === null ? `will keine Bankschulden über ${percent(b.value)} der Einlage` : `will keine Bankschulden über ${money(b.value * amount)}`;
  return ranch ? `will kein neues Bohrloch auf ${ranchName(state, ranch)} und den Nachbarranches` : 'will kein neues Bohrloch neben seiner Weide';
}

// --- Karten: Privatinvestoren ------------------------------------------------------------

function laufend(state: GameState, id: InvestorId): InvestorDeal | undefined {
  return financingOf(state).investors.find((d) => d.id === id);
}

function investorCard(id: InvestorId): PlanHandler {
  return {
    lock(state, balance) {
      if (laufend(state, id)) return 'Ihre Einlage läuft noch.';
      if (financingOf(state).lost[id] !== undefined) return 'Nach dem verlorenen Geld gibt es kein zweites Mal.';
      if (sizesIn(state, balance.financing.investors[id].sizes).length === 0) return 'Gerade hat sie kein Geld anzulegen.';
      return null;
    },
    options(state, balance): PlanOption[] {
      const b = balance.financing.investors[id];
      return sizesIn(state, b.sizes).map((n) => ({ id: String(n), label: `${money(n)} · ${percent(b.share)} vom Gewinn · ${b.rounds} Runden`, reason: null }));
    },
    detail(state, balance) {
      const b = balance.financing.investors[id];
      const ranch = b.wish === 'land' ? whitcombRanch(state) : null;
      return `Kein Zins, dafür ${percent(b.share)} vom Gewinn jeder Runde; nach ${b.rounds} Runden kommt die Einlage zurück. Wunsch: ${wishText(state, balance, id, null, ranch)}. Reicht die Kasse am Ende nicht, ist ihr Geld verloren.`;
    },
    apply(state, balance, target) {
      const b = balance.financing.investors[id];
      const n = Number(target ?? sizesIn(state, b.sizes)[0]);
      if (!sizesIn(state, b.sizes).includes(n) || laufend(state, id)) return log(state, 'Aus der Einlage wird nichts.');
      const ranch = b.wish === 'land' ? whitcombRanch(state) : null;
      const d: InvestorDeal = { id, amount: n, share: b.share, from: state.round, until: state.round + b.rounds - 1, paid: 0, broken: false };
      if (ranch) d.ranch = ranch;
      const f = financingOf(state);
      return log(withFin({ ...state, cash: cents(state.cash + n) }, { investors: [...f.investors, d] }), `Neue Einlage: ${money(n)} für ${b.rounds} Runden, ${percent(b.share)} vom Gewinn – ${wishText(state, balance, id, n, ranch)}.`);
    },
  };
}

// --- Karten: Farm-out -------------------------------------------------------------------

/** Ungebohrte eigene Pachten. */
export function farmoutParcels(state: GameState): string[] {
  return state.leases.filter((l) => l.holder === 'jacob' && !l.drilled && wellsOn(state, l.parcelId).length === 0).map((l) => l.parcelId);
}

/** Wer bohrt: Bullard – außer in der Fehde, dann ein Wildcatter. */
export function farmoutPartner(state: Pick<GameState, 'events'>): 'bullard' | 'wildcatter' {
  return state.events.marks.bullard_fehde !== undefined ? 'wildcatter' : 'bullard';
}

const PARTNER: Record<FarmOut['partner'], string> = { bullard: 'Bullard', wildcatter: 'Hollis Dade' };

function partnerRig(state: GameState) {
  return { id: `partner-${state.round}-${financingOf(state).farmouts.length + 1}`, kind: 'rented' as const, readyRound: state.round, steam: false, rods: false };
}

const farmout: PlanHandler = {
  lock(state) {
    if (financingOf(state).farmouts.some((f) => f.until >= state.round && !f.caught && f.rigId !== null)) return 'Der Partner bohrt schon für Jacob.';
    if (farmoutParcels(state).length === 0) return 'Keine ungebohrte eigene Pacht.';
    return null;
  },
  options(state, balance) {
    const fo = balance.financing.farmout;
    return farmoutParcels(state).map((id) => ({ id, label: `${ranchName(state, id)} · ${PARTNER[farmoutPartner(state)]} bohrt, bekommt ${percent(fo.share)} der Förderung`, reason: null }));
  },
  detail(state, balance) {
    const fo = balance.financing.farmout;
    return `${PARTNER[farmoutPartner(state)]} bringt seinen Turm und zahlt die erste Bohrstufe. Ist sie fündig, holt er ${fo.rounds} Runden lang ${percent(fo.share)} der Förderung dieser Quelle ab. Tiefer bohren zahlt Jacob – dann sinkt der Anteil des Partners im Verhältnis der Kosten. Ob er ehrlich abrechnet, zeigt nur eine Prüfung.`;
  },
  apply(state, balance, target) {
    const fo = balance.financing.farmout;
    if (!target || !farmoutParcels(state).includes(target)) return log(state, 'Aus dem Farm-out wird nichts.');
    const rig = partnerRig(state);
    // Der Partner bohrt mit seinem Turm und seinem Geld: startDrilling sieht nur diesen Turm und genug Kasse.
    const nurPartner: GameState = { ...state, rigs: [rig] };
    const kosten = 1e9;
    const r = startDrilling({ ...nurPartner, cash: state.cash + kosten }, balance, target);
    if (!r.ok) return log(state, `Der Partner kann nicht bohren: ${r.reason}`);
    const well = r.state.wells[r.state.wells.length - 1];
    const partner = farmoutPartner(state);
    const fout: FarmOut = { wellId: well.id, parcelId: target, partner, share: fo.share, rigId: rig.id, from: state.round, until: state.round + fo.rounds, owed: 0, caught: false, paid: well.spent };
    const f = financingOf(state);
    const s: GameState = { ...r.state, cash: state.cash, rigs: [...state.rigs, rig], log: r.state.log.slice(0, -1) };
    return log(withFin(s, { farmouts: [...f.farmouts, fout] }), `Farm-out: ${PARTNER[partner]} bohrt mit eigenem Turm auf ${ranchName(state, target)} und zahlt die Bohrung (${money(well.spent)}). Fündig, gehören ihm ${percent(fo.share)} der Förderung.`);
  },
};

const farmoutPruefen: PlanHandler = {
  visible(state) {
    return financingOf(state).farmouts.length > 0;
  },
  lock(state) {
    return financingOf(state).farmouts.length === 0 ? 'Kein Farm-out läuft.' : null;
  },
  detail(state) {
    const n = financingOf(state).farmouts.length;
    return `Ein Buchprüfer vergleicht Förderbuch und Abholscheine von ${n === 1 ? 'einem Farm-out' : `${n} Farm-outs`}. Findet er nichts, ist der Partner gekränkt.`;
  },
  apply(state, balance) {
    const fo = balance.financing.farmout;
    const f = financingOf(state);
    const nachzahlung = cents(f.farmouts.reduce((s, x) => s + x.owed, 0));
    if (nachzahlung > 0) {
      const s = withFin({ ...state, cash: cents(state.cash + nachzahlung) }, { farmouts: f.farmouts.map((x) => (x.owed > 0 ? { ...x, owed: 0, caught: true } : x)) });
      return log(shiftRelation(s, 'oelleute', -fo.caught), `Die Prüfung zeigt: Der Partner hat mehr Öl abgeholt, als ihm zusteht. Er zahlt ${money(nachzahlung)} nach – und redet nicht mehr mit Jacob.`);
    }
    return log(shiftRelation(state, 'oelleute', -fo.clean), 'Die Prüfung findet nichts. Der Partner fühlt sich beleidigt.');
  },
};

// --- Karten: Konsortium und Regierung ------------------------------------------------------

const valeDarlehen: PlanHandler = {
  lock(state, balance) {
    const f = financingOf(state);
    if (f.vale) return 'Vales Darlehen läuft noch.';
    if (f.valeUsed) return 'Mr. Vale gibt nur einmal.';
    if (sizesIn(state, balance.financing.vale.sizes).length === 0) return 'Mr. Vale ist nicht zu sprechen.';
    return null;
  },
  options(state, balance) {
    const v = balance.financing.vale;
    return sizesIn(state, v.sizes).map((n) => ({ id: String(n), label: `${money(n)} zinslos, zurück in ${v.rounds} Runden`, reason: null }));
  },
  detail(_state, balance) {
    const v = balance.financing.vale;
    return `Kein Zins, keine Sicherheit. Nach etwa ${v.favorAfter} Runden bittet Mr. Vale um einen Gefallen – wer ablehnt, zahlt sofort alles zurück.`;
  },
  apply(state, balance, target) {
    const v = balance.financing.vale;
    const n = Number(target ?? sizesIn(state, v.sizes)[0]);
    if (!sizesIn(state, v.sizes).includes(n)) return state;
    const s = withFin({ ...state, cash: cents(state.cash + n) }, { vale: { amount: n, from: state.round, until: state.round + v.rounds - 1, favorRound: state.round + v.favorAfter }, valeUsed: true });
    return log(setMark(s, 'vale_geld'), `Mr. Vale leiht Jacob ${money(n)} – ohne Zins, ohne Unterschrift. „Unter Freunden“, sagt er.`);
  },
};

const staatKredit: PlanHandler = {
  lock(state, balance) {
    if (!stateOpen(state, balance)) return 'Der Staat leiht nur in Krieg und Krise.';
    if (financingOf(state).stateLoan) return 'Der Staatskredit läuft noch.';
    if (sizesIn(state, balance.financing.state.loan.sizes).length === 0) return 'Gerade gibt es keinen Staatskredit.';
    return null;
  },
  options(state, balance) {
    const l = balance.financing.state.loan;
    const preis = cents(state.postedPrice * (1 - l.discount));
    return sizesIn(state, l.sizes).map((n) => ({ id: String(n), label: `${money(n)} zu ${percent(l.rate)} · liefert ${bbl(n * l.deliverPerDollar)} je Runde zu ${price(preis)}`, reason: null }));
  },
  detail(_state, balance) {
    const l = balance.financing.state.loan;
    return `Billiges Geld für ${l.rounds} Runden, dafür Preisbindung: Jacob liefert dem Staat jede Runde Öl zum Preis von heute minus ${percent(l.discount)}. Fehlt Öl, kostet jedes Barrel ${price(l.shortfall)}.`;
  },
  apply(state, balance, target) {
    const l = balance.financing.state.loan;
    const n = Number(target ?? sizesIn(state, l.sizes)[0]);
    if (!sizesIn(state, l.sizes).includes(n)) return state;
    const d: DeliveryDeal = { amount: n, rate: l.rate, qty: Math.round(n * l.deliverPerDollar), price: cents(state.postedPrice * (1 - l.discount)), from: state.round, until: state.round + l.rounds - 1 };
    return log(withFin({ ...state, cash: cents(state.cash + n) }, { stateLoan: d }), `Staatskredit: ${money(n)} zu ${percent(l.rate)}. Dafür ${bbl(d.qty)} je Runde zu ${price(d.price)} an den Staat, bis Runde ${rk(state, d.until)}.`);
  },
};

const staatAuftrag: PlanHandler = {
  lock(state, balance) {
    if (!stateOpen(state, balance)) return 'Aufträge vergibt der Staat nur in Krieg und Krise.';
    if (financingOf(state).stateOrder) return 'Der Staatsauftrag läuft noch.';
    if (sizesIn(state, balance.financing.state.order.sizes).length === 0) return 'Gerade gibt es keinen Auftrag.';
    return null;
  },
  options(state, balance) {
    const o = balance.financing.state.order;
    const preis = cents(state.postedPrice * (1 + o.premium));
    return sizesIn(state, o.sizes).map((n) => ({ id: String(n), label: `${bbl(n)} je Runde zu ${price(preis)} · ${o.rounds} Runden`, reason: null }));
  },
  detail(_state, balance) {
    const o = balance.financing.state.order;
    return `Fester Preis ${percent(o.premium)} über heute. Dafür sitzen Prüfer des Ministeriums in Jacobs Büro – was sie sehen, hört auch der Bundesanwalt. Fehlt Öl, kostet jedes Barrel ${price(o.shortfall)}.`;
  },
  apply(state, balance, target) {
    const o = balance.financing.state.order;
    const n = Number(target ?? sizesIn(state, o.sizes)[0]);
    if (!sizesIn(state, o.sizes).includes(n)) return state;
    const d: DeliveryDeal = { amount: 0, rate: 0, qty: n, price: cents(state.postedPrice * (1 + o.premium)), from: state.round, until: state.round + o.rounds - 1 };
    return log(withFin(state, { stateOrder: d }), `Staatsauftrag: ${bbl(n)} je Runde zu ${price(d.price)} bis Runde ${rk(state, d.until)} – unter Aufsicht des Ministeriums.`);
  },
};

export const FINANCING_HANDLERS: Record<string, PlanHandler> = {
  investor_sloane: investorCard('sloane'),
  investor_haskell: investorCard('haskell'),
  investor_whitcomb: investorCard('whitcomb'),
  farmout,
  farmout_pruefen: farmoutPruefen,
  vale_darlehen: valeDarlehen,
  staat_kredit: staatKredit,
  staat_auftrag: staatAuftrag,
};

/** Stellen, deren Karten die Bots nicht spielen – ihre Empfehlungen nehmen sie nicht an (kostet sonst Termine). */
export function financingContacts(balance: Pick<Balance, 'financing'>): string[] {
  const f = balance.financing;
  return [...INVESTORS.map((id) => f.investors[id].contact), f.vale.contact, f.state.contact];
}

// --- Rundenende ---------------------------------------------------------------------------

function erledigt(s: GameState, key: string): boolean {
  return financingOf(s).done.includes(key);
}

function abhaken(s: GameState, key: string): GameState {
  return withFin(s, { done: [...financingOf(s).done, key] });
}

/** Öl aus Jacobs Anteil im Tank nehmen (nicht aus dem Förderzins-Öl der Landbesitzer). */
function nimmOel(s: GameState, menge: number): [GameState, number] {
  const frei = Math.max(0, s.oilStock - s.royaltyOil);
  const n = Math.max(0, Math.min(Math.round(menge), Math.floor(frei)));
  return [{ ...s, oilStock: s.oilStock - n }, n];
}

function liefern(s0: GameState, d: DeliveryDeal, shortfall: number, wer: string): GameState {
  const [s, n] = nimmOel(s0, d.qty);
  const fehlt = d.qty - n;
  const erloes = cents(n * d.price);
  const strafe = cents(fehlt * shortfall);
  const zeile = fehlt > 0 ? `${wer}: ${bbl(n)} geliefert (${money(erloes)}), ${bbl(fehlt)} fehlen – ${money(strafe)} Strafe.` : `${wer}: ${bbl(n)} geliefert, ${money(erloes)}.`;
  return log({ ...s, cash: cents(s.cash + erloes - strafe) }, zeile);
}

function investorenAbrechnen(before: GameState, input: GameState, balance: Balance): GameState {
  let s = input;
  const f0 = financingOf(s);
  if (f0.investors.length === 0 && Object.keys(f0.lost).length === 0) return s;
  // Gewinnanteile: vom Gewinn der Runde (wie die Steuer, ohne geliehenes Geld).
  const gewinn = taxableProfit(before, s);
  const deals: InvestorDeal[] = [];
  for (const d0 of f0.investors) {
    let d = d0;
    const bal = balance.financing.investors[d.id];
    const contact = bal.contact;
    if (gewinn > 0 && s.round >= d.from && s.round <= d.until) {
      const anteil = cents(gewinn * d.share);
      s = { ...s, cash: cents(s.cash - anteil) };
      d = { ...d, paid: cents(d.paid + anteil) };
      s = log(s, `Gewinnanteil der Einlage: ${money(anteil)} (${percent(d.share)} von ${money(gewinn)}).`);
    }
    if (!d.broken && wishBroken(s, balance, d)) {
      d = { ...d, broken: true };
      s = shiftRelation(s, contact, -balance.network.relation.breach);
      s = setMark(s, investorUpsetMark(d.id));
      s = log(s, `Die Abmachung ist gebrochen: Der Geldgeber ${wishText(s, balance, d.id, d.amount, d.ranch ?? null)}. Ein Brief ist unterwegs.`);
    }
    // Vorzeitig auszahlen (Antwort auf den Beschwerdebrief).
    const aus = investorPayoutMark(d.id);
    if (s.events.marks[aus] !== undefined && !erledigt(s, `${aus}@${d.from}`)) {
      s = abhaken(s, `${aus}@${d.from}`);
      if (s.cash >= d.amount) {
        s = log(shiftRelation({ ...s, cash: cents(s.cash - d.amount) }, contact, Math.round(balance.network.relation.breach / 2)), `Jacob zahlt die Einlage vorzeitig zurück: ${money(d.amount)}.`);
        continue;
      }
      s = log(s, `Für die Rückzahlung (${money(d.amount)}) reicht die Kasse nicht – die Einlage läuft weiter.`);
    }
    if (s.round >= d.until) {
      if (s.cash >= d.amount) {
        s = { ...s, cash: cents(s.cash - d.amount) };
        if (!d.broken) s = shiftRelation(s, contact, balance.network.relation.use);
        s = log(s, `Die Einlage geht zurück: ${money(d.amount)}; an Gewinnanteilen flossen ${money(d.paid)}.`);
      } else {
        // 0.4.20+49 (Frage bot trainer): Kein geschenktes Geld – was die Kasse nicht hergibt, wird zur Schuld zum Zins
        // des Geldverleihers. Der Geldgeber ist trotzdem tief verärgert und gibt kein zweites Mal (lost = 0, kein Drama).
        const bar = Math.max(0, Math.min(s.cash, d.amount));
        const rest = cents(d.amount - bar);
        const id = s.loans.reduce((m, l) => Math.max(m, l.id), 0) + 1;
        s = { ...s, cash: cents(s.cash - bar), loans: [...s.loans, { id, source: 'lender', principal: rest, rate: balance.credit.emergency.rate, takenRound: s.round, collateral: null }] };
        s = shiftRelation(s, contact, -50);
        s = withFin(s, { lost: { ...financingOf(s).lost, [d.id]: 0 } });
        s = log(s, `Die Kasse reicht nicht für die Einlage (${money(d.amount)}): ${money(bar)} gehen zurück, ${money(rest)} werden zur Schuld zum Zins des Geldverleihers.`);
      }
      continue;
    }
    deals.push(d);
  }
  s = withFin(s, { investors: deals });
  // Drama: Jacob entschädigt aus eigener Tasche (die Hälfte der verlorenen Einlage).
  for (const id of INVESTORS) {
    const m = investorCompensateMark(id);
    const verloren = financingOf(s).lost[id];
    if (verloren === undefined || s.events.marks[m] === undefined || erledigt(s, m)) continue;
    const zahlung = cents(verloren / 2);
    s = abhaken(s, m);
    s = shiftRelation({ ...s, cash: cents(s.cash - zahlung) }, balance.financing.investors[id].contact, balance.network.relation.reconcileTo);
    s = log(s, `Jacob gibt aus eigener Tasche ${money(zahlung)} – die Hälfte des verlorenen Geldes.`);
  }
  return s;
}

function farmoutsAbrechnen(input: GameState, balance: Balance): GameState {
  let s = input;
  const fo = balance.financing.farmout;
  const liste: FarmOut[] = [];
  for (const f0 of financingOf(s).farmouts) {
    let f = f0;
    // Der Turm des Partners: keine Miete für Jacob; weg, sobald die Bohrung fertig ist.
    if (f.rigId !== null) {
      const rigId = f.rigId;
      if (s.rigs.some((r) => r.id === rigId)) s = { ...s, cash: cents(s.cash + balance.drilling.rigs.rent.costPerRound) };
      const well = s.wells.find((w) => w.id === f.wellId);
      if (!well || !['drilling', 'decision', 'stuck'].includes(well.status)) {
        s = { ...s, rigs: s.rigs.filter((r) => r.id !== rigId) };
        f = { ...f, rigId: null };
      }
    }
    const well = s.wells.find((w) => w.id === f.wellId);
    if (!well || well.status === 'dry') {
      s = log(s, `Farm-out auf ${ranchName(s, f.parcelId)}: kein Öl – ${PARTNER[f.partner]} trägt die Bohrkosten.`);
      continue;
    }
    if (well.status === 'found' && (well.production?.lastRate ?? 0) > 0) {
      const rate = well.production!.lastRate;
      const anteil = farmoutShare(f, well.spent);
      const ehrlich = rate * anteil;
      const chance = f.caught ? 0 : fo.cheat[f.partner];
      const betrug = chance > 0 && new Rng(seedFromString(`${s.seed}:farmout:${f.wellId}:${s.round}`)).float() < chance;
      const [s2, n] = nimmOel(s, betrug ? rate * (anteil + fo.cheatExtra) : ehrlich);
      s = s2;
      const zuviel = Math.max(0, n - Math.round(ehrlich));
      if (zuviel > 0) f = { ...f, owed: cents(f.owed + zuviel * s.postedPrice) };
      // Im Protokoll steht, was der Partner meldet – nicht, was er wirklich abholt.
      s = log(s, `Farm-out auf ${ranchName(s, f.parcelId)}: ${PARTNER[f.partner]} holt seinen Anteil ab (${bbl(Math.min(n, Math.round(ehrlich)))}, ${percent(anteil)}).`);
    }
    if (s.round >= f.until && f.rigId === null) {
      s = log(s, `Das Farm-out auf ${ranchName(s, f.parcelId)} ist ausgelaufen – die Quelle gehört wieder ganz Jacob.`);
      if (f.owed > 0) liste.push({ ...f, until: s.round, rigId: null, share: 0 });
      continue;
    }
    liste.push(f);
  }
  // Ausgelaufene mit offener Nachforderung bleiben prüfbar (share 0), bis sie geprüft sind.
  return withFin(s, { farmouts: liste.filter((f) => f.share > 0 || f.owed > 0) });
}

function valeAbrechnen(input: GameState, balance: Balance): GameState {
  let s = input;
  const v = financingOf(s).vale;
  if (!v) return s;
  if (s.events.marks[VALE_FAVOR_REFUSED] !== undefined && !erledigt(s, VALE_FAVOR_REFUSED)) {
    s = abhaken(s, VALE_FAVOR_REFUSED);
    s = withFin({ ...s, cash: cents(s.cash - v.amount) }, { vale: null });
    s = shiftRelation(s, balance.financing.vale.contact, -100);
    return log(s, `Jacob hat Mr. Vale abgewiesen. Am nächsten Morgen ist das Darlehen fällig: ${money(v.amount)}, sofort.`);
  }
  if (s.round >= v.favorRound && s.events.marks[VALE_FAVOR_DUE] === undefined) s = setMark(s, VALE_FAVOR_DUE);
  if (s.round >= v.until) {
    s = withFin({ ...s, cash: cents(s.cash - v.amount) }, { vale: null });
    s = log(s, `Mr. Vales Darlehen ist zurückgezahlt: ${money(v.amount)}.`);
  }
  return s;
}

function staatAbrechnen(input: GameState, balance: Balance): GameState {
  let s = input;
  const st = balance.financing.state;
  const l = financingOf(s).stateLoan;
  if (l) {
    const zins = cents((l.amount * l.rate) / 4);
    s = { ...s, cash: cents(s.cash - zins) };
    s = liefern(s, l, st.loan.shortfall, 'Lieferpflicht aus dem Staatskredit');
    if (s.round >= l.until) s = log(withFin({ ...s, cash: cents(s.cash - l.amount) }, { stateLoan: null }), `Der Staatskredit ist getilgt: ${money(l.amount)}.`);
  }
  const o = financingOf(s).stateOrder;
  if (o) {
    s = liefern(s, o, st.order.shortfall, 'Staatsauftrag');
    if (s.round >= o.until) s = log(withFin(s, { stateOrder: null }), 'Der Staatsauftrag ist erfüllt – die Prüfer des Ministeriums packen ihre Akten.');
  }
  return s;
}

/**
 * Rundenende der Geldquellen (game.ts, vor der Einkommensteuer): Gewinnanteile und Wünsche der Investoren, Ende der
 * Einlagen, Farm-out (Turm, Abholung, Betrug), Vales Darlehen und Gefallen, Lieferungen an den Staat.
 * before = Stand zu Beginn des Rundenendes (für den Gewinn der Runde).
 */
export function settleFinancing(before: GameState, state: GameState, balance: Balance): GameState {
  if (!state.financing) return state;
  return staatAbrechnen(valeAbrechnen(farmoutsAbrechnen(investorenAbrechnen(before, state, balance), balance), balance), balance);
}

/** Laufende Abmachungen in je einem Satz – für das Adressbuch (reine Lesehilfe). */
export function financingRunning(state: GameState): string[] {
  const f = state.financing;
  if (!f) return [];
  const out: string[] = [];
  for (const d of f.investors) out.push(`Einlage ${money(d.amount)} bis Runde ${rk(state, d.until)} (${percent(d.share)} vom Gewinn)${d.broken ? ' – Wunsch gebrochen' : ''}`);
  for (const x of f.farmouts) if (x.share > 0) out.push(`Farm-out auf ${ranchName(state, x.parcelId)} mit ${PARTNER[x.partner]} bis Runde ${rk(state, x.until)}`);
  if (f.vale) out.push(`Mr. Vales Darlehen ${money(f.vale.amount)}, fällig Ende Runde ${rk(state, f.vale.until)}`);
  if (f.stateLoan) out.push(`Staatskredit ${money(f.stateLoan.amount)} bis Runde ${rk(state, f.stateLoan.until)}, ${bbl(f.stateLoan.qty)} je Runde an den Staat`);
  if (f.stateOrder) out.push(`Staatsauftrag ${bbl(f.stateOrder.qty)} je Runde bis Runde ${rk(state, f.stateOrder.until)} – unter Aufsicht`);
  return out;
}

/** Prüft state.financing beim Laden (darf fehlen). */
export function validFinancing(v: unknown): boolean {
  if (v === undefined) return true;
  if (!obj(v)) return false;
  const z = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (!Array.isArray(v.investors) || !v.investors.every((d) => obj(d) && (INVESTORS as readonly unknown[]).includes(d.id) && z(d.amount) && z(d.share) && z(d.from) && z(d.until) && z(d.paid) && typeof d.broken === 'boolean')) return false;
  if (!Array.isArray(v.farmouts) || !v.farmouts.every((x) => obj(x) && typeof x.wellId === 'string' && typeof x.parcelId === 'string' && (x.partner === 'bullard' || x.partner === 'wildcatter') && z(x.share) && z(x.owed) && z(x.until))) return false;
  if (v.vale !== null && !(obj(v.vale) && z(v.vale.amount) && z(v.vale.until) && z(v.vale.favorRound))) return false;
  for (const k of ['stateLoan', 'stateOrder'] as const) if (v[k] !== null && !(obj(v[k]) && z((v[k] as Record<string, unknown>).qty) && z((v[k] as Record<string, unknown>).until))) return false;
  return typeof v.valeUsed === 'boolean' && obj(v.lost) && Array.isArray(v.done);
}
