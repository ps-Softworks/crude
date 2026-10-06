// Pleitefrist mit Auswegen (GDD §8 „Bankrott“): Bargeld unter null ohne Kreditrahmen startet eine Frist von
// bankruptcy.graceRounds Runden (credit.ts, checkBankruptcy – merkt sich dabei das Rating vor der Krise in
// state.insolvency). In der Frist gibt es drei Auswege, erst danach ist Jacob pleite:
//
// (a) Notverkauf: Pachten an Bullard zu 40–60 % des Werts (sale.ts, andere Bieter setzen die Untergrenze),
//     eigene Türme billiger (sale.ts), Tankstellen im Vertrieb (brand.ts, sellStation).
// (b) Umschuldung: nur mit Rating C oder besser vor der Krise, einmal je Krise. Ein Anwalt (Honorar
//     restructure.lawyerFee + lawyerShare × Schuld; mit eigenem Anwalt – Ermittlung ab Kapitel 2 – × ownLawyer)
//     fasst alle Bank- und Notkredite und das Loch in der Kasse zu einem Bankkredit zusammen: Zins = Bankzins ohne
//     Sicherheit beim Rating vor der Krise + rateAdd, die ersten deferRounds Runden kommen die Zinsen auf die Schuld.
// (c) Rettung durch die Herren aus Hallstead (Mr. Vale, Kapitel 1 und 2; in Kapitel 3 rettet das Konsortium
//     selbst, konsortium.ts): Vale deckt das Loch plus ein Polster (max(cushion, cushionShare × Loch)), Jacob
//     schuldet ihm repay × diese Summe zu rate – und das Merkzeichen vale_rettung: Einige Runden später fordert
//     Vale einen Gefallen ein (content/events/vale-rettung.yaml). Nur einmal je Spiel.
import { RATINGS, type Balance, type Rating } from './balance';
import { formatDate } from './calendar';
import { bankRateAdd, debt, loanRate, type Loan } from './credit';
import type { GameState } from './game';
import { brandOf } from './brand';
import { VALE_RESCUE_MARK } from './insolvencyMarks';
import { rigSaleBlocker, rigSalePrice, saleBlocker, saleQuote, sellLease, sellRig, type SaleQuote } from './sale';

export interface InsolvencyBalance {
  restructure: {
    /** Schlechtestes Rating vor der Krise, mit dem die Bank noch umschuldet. */
    minRating: Rating;
    lawyerFee: number;
    lawyerShare: number;
    /** Faktor aufs Honorar, wenn Jacob schon einen Anwalt hat (Ermittlung, ab Kapitel 2). */
    ownLawyer: number;
    rateAdd: number;
    deferRounds: number;
  };
  rescue: {
    cushion: number;
    cushionShare: number;
    repay: number;
    rate: number;
  };
}

/** Was checkBankruptcy beim Start der Frist festhält (fehlt: keine Frist). */
export interface InsolvencyState {
  /** Runde, in der die Frist begann. */
  since: number;
  /** Rating zu Beginn der Runde, in der die Kasse ins Minus fiel. */
  ratingBefore: Rating;
  /** In dieser Krise schon umgeschuldet. */
  restructured?: boolean;
}

export { VALE_RESCUE_MARK } from './insolvencyMarks';

export type InsolvencyResult = { ok: true; state: GameState } | { ok: false; reason: string };

function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Läuft die Pleitefrist? */
export function insolvencyActive(state: Pick<GameState, 'bankruptcyDeadline' | 'finished'>): boolean {
  return !state.finished && state.bankruptcyDeadline > 0;
}

/** Runden bis zum Ablauf der Frist (0 = sie läuft in dieser Runde ab). */
export function insolvencyRoundsLeft(state: Pick<GameState, 'bankruptcyDeadline' | 'round'>): number {
  return Math.max(0, state.bankruptcyDeadline - state.round);
}

/** Das Loch in der Kasse. */
export function cashGap(state: Pick<GameState, 'cash'>): number {
  return Math.max(0, cents(-state.cash));
}

// --- (a) Notverkauf ------------------------------------------------------------------------------

export interface EmergencySales {
  leases: SaleQuote[];
  rigs: { rigId: string; price: number }[];
  /** Tankstellen, die im Vertrieb verkauft werden können (Kapitel 3). */
  stations: number;
  /** Summe aller Gebote. */
  total: number;
}

/** Was Jacob jetzt verkaufen könnte – mit den Geboten (in der Frist schon als Notverkauf). */
export function emergencySales(state: GameState, balance: Balance): EmergencySales {
  const leases = state.leases
    .filter((l) => l.holder === 'jacob' && saleBlocker(state, balance, l.parcelId) === null)
    .map((l) => saleQuote(state, balance, l.parcelId))
    .filter((q): q is SaleQuote => q !== null && q.offer > 0);
  const rigs = state.rigs.filter((r) => rigSaleBlocker(state, r.id) === null).map((r) => ({ rigId: r.id, price: rigSalePrice(state, balance, r.id) }));
  const stations = state.brand ? Object.values(brandOf(state, balance).regions).reduce((s, r) => s + r.stations, 0) : 0;
  const total = leases.reduce((s, q) => s + q.offer, 0) + rigs.reduce((s, r) => s + r.price, 0);
  return { leases, rigs, stations, total };
}

// --- (b) Umschuldung -----------------------------------------------------------------------------

export interface RestructureQuote {
  /** Honorar des Anwalts (kommt auf die neue Schuld). */
  fee: number;
  /** Neue Schuld: alte Bank- und Notkredite + Loch in der Kasse + Honorar. */
  principal: number;
  rate: number;
  /** Bis einschließlich dieser Runde keine Zinsen aus der Kasse. */
  deferUntil: number;
  ownLawyer: boolean;
}

function umzuschulden(state: GameState): Loan[] {
  return state.loans.filter((l) => l.source === 'bank' || l.source === 'lender');
}

/** Warum Jacob gerade nicht umschulden kann – oder null. */
export function restructureBlocker(state: GameState, balance: Balance): string | null {
  if (!insolvencyActive(state)) return 'Umschulden geht nur, wenn die Pleite droht.';
  const ins = state.insolvency;
  if (ins?.restructured) return 'In dieser Krise wurde schon umgeschuldet.';
  const vorher = ins?.ratingBefore ?? state.rating;
  if (RATINGS.indexOf(vorher) > RATINGS.indexOf(balance.insolvency.restructure.minRating)) {
    return `Vor der Krise stand Jacob bei Rating ${vorher} – mit schlechter als ${balance.insolvency.restructure.minRating} schuldet keine Bank um.`;
  }
  if (umzuschulden(state).length === 0 && cashGap(state) <= 0) return 'Es gibt nichts umzuschulden.';
  return null;
}

/** Bedingungen der Umschuldung (auch, wenn sie gerade gesperrt ist – für die Anzeige). */
export function restructureQuote(state: GameState, balance: Balance): RestructureQuote {
  const r = balance.insolvency.restructure;
  const alt = umzuschulden(state);
  const schuld = alt.reduce((s, l) => s + l.principal, 0) + cashGap(state);
  const ownLawyer = (state.investigation?.lawyer ?? 0) > 0;
  const fee = Math.round((r.lawyerFee + r.lawyerShare * schuld) * (ownLawyer ? r.ownLawyer : 1));
  // Zins: was die Bank ohne Sicherheit beim Rating vor der Krise nähme, plus Aufschlag – teurer als Bankgeld, billiger als der Geldverleiher.
  const basis = loanRate(balance, state.insolvency?.ratingBefore ?? state.rating, false, bankRateAdd(state, balance));
  return {
    fee,
    principal: cents(schuld + fee),
    rate: Math.round((basis + r.rateAdd) * 10000) / 10000,
    deferUntil: state.round + r.deferRounds,
    ownLawyer,
  };
}

/** Umschulden: Bank- und Notkredite und das Loch werden ein Bankkredit; die Kasse steht wieder auf null. */
export function restructureDebt(state: GameState, balance: Balance): InsolvencyResult {
  const blocker = restructureBlocker(state, balance);
  if (blocker) return { ok: false, reason: blocker };
  const q = restructureQuote(state, balance);
  const id = state.loans.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  const loan: Loan = { id, source: 'bank', principal: q.principal, rate: q.rate, takenRound: state.round, collateral: null, deferUntil: q.deferUntil };
  const rest = state.loans.filter((l) => l.source !== 'bank' && l.source !== 'lender');
  const anwalt = q.ownLawyer ? 'Jacobs Anwalt' : 'Ein Anwalt aus Port Ellis';
  return {
    ok: true,
    state: {
      ...state,
      cash: Math.max(0, state.cash),
      loans: [...rest, loan],
      insolvency: { since: state.insolvency?.since ?? state.round, ratingBefore: state.insolvency?.ratingBefore ?? state.rating, restructured: true },
      log: [
        ...state.log,
        `${formatDate(state)}: ${anwalt} handelt eine Umschuldung aus (Honorar ${money(q.fee)}): ${money(q.principal)} zu ${(q.rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} % pro Jahr, Zinsen bis Runde ${q.deferUntil} auf die Schuld.`,
      ],
    },
  };
}

// --- (c) Rettung durch Mr. Vale ------------------------------------------------------------------

export interface ValeRescueQuote {
  /** Was Vale in die Kasse legt: Loch + Polster. */
  cash: number;
  /** Was Jacob ihm danach schuldet. */
  owed: number;
  rate: number;
}

/** Warum Vale gerade nicht rettet – oder null. In Kapitel 3 rettet das Konsortium selbst (konsortium.ts). */
export function valeRescueBlocker(state: GameState): string | null {
  if (!insolvencyActive(state)) return 'Mr. Vale kommt nur, wenn die Pleite droht.';
  if (state.kapitel3) return 'In Kapitel 3 spricht das Konsortium selbst – die Siegelmappe.';
  if (state.events.marks[VALE_RESCUE_MARK] !== undefined) return 'Mr. Vale hat Jacob schon einmal gerettet. Ein zweites Mal kommt er nicht.';
  return null;
}

export function valeRescueQuote(state: GameState, balance: Balance): ValeRescueQuote {
  const r = balance.insolvency.rescue;
  const loch = cashGap(state);
  const cash = Math.round(loch + Math.max(r.cushion, loch * r.cushionShare));
  return { cash, owed: Math.round(cash * r.repay), rate: r.rate };
}

/** Vales Geld annehmen: Kasse gedeckt, Schuld bei Vale, Merkzeichen für seinen späteren Gefallen. */
export function acceptValeRescue(state: GameState, balance: Balance): InsolvencyResult {
  const blocker = valeRescueBlocker(state);
  if (blocker) return { ok: false, reason: blocker };
  const q = valeRescueQuote(state, balance);
  const id = state.loans.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  const loan: Loan = { id, source: 'vale', principal: q.owed, rate: q.rate, takenRound: state.round, collateral: null };
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash + q.cash),
      loans: [...state.loans, loan],
      events: { ...state.events, marks: { ...state.events.marks, [VALE_RESCUE_MARK]: state.round } },
      log: [
        ...state.log,
        `${formatDate(state)}: Die Herren aus Hallstead zahlen ${money(q.cash)}. Jacob schuldet Mr. Vale ${money(q.owed)} – und einen Gefallen.`,
      ],
    },
  };
}

// --- Bots ----------------------------------------------------------------------------------------

/**
 * Bot-Regel in der Pleitefrist: erst Notverkauf (ungebohrtes Land zuerst, dann die schwächsten Quellen, dann
 * Türme), bis die Kasse wieder stimmt; reicht das nicht und läuft die Frist in dieser Runde ab, nimmt er Vales
 * Rettung. Ohne Frist: unverändert.
 */
export function insolvencyBotTurn(input: GameState, balance: Balance): GameState {
  if (!insolvencyActive(input) || input.cash >= 0) return input;
  let state = input;
  const angebote = emergencySales(state, balance).leases.sort((a, b) => a.rate - b.rate || a.offer - b.offer);
  for (const q of angebote) {
    if (state.cash >= 0) break;
    const r = sellLease(state, balance, q.parcelId);
    if (r.ok) state = r.state;
  }
  for (const rig of emergencySales(state, balance).rigs) {
    if (state.cash >= 0) break;
    const r = sellRig(state, balance, rig.rigId);
    if (r.ok) state = r.state;
  }
  if (state.cash < 0 && insolvencyRoundsLeft(state) === 0) {
    const r = acceptValeRescue(state, balance);
    if (r.ok) state = r.state;
  }
  return state;
}

/** Gesamtschuld nach der Rettung (für Anzeigen). */
export function valeDebt(state: Pick<GameState, 'loans'>): number {
  return debt({ loans: state.loans.filter((l) => l.source === 'vale') });
}
