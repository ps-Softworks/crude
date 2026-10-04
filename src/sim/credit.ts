// Bankkredit und Bankrott (GDD §8, §12, §15): Die Bank gibt Geld bis zu einem
// Rahmen, der mit jeder fördernden Quelle wächst, weil eine Quelle als Pfand
// dient. Der Jahreszins steht nach dem Rating; mit Pfand zahlt Jacob zwei
// Punkte weniger, ohne Sicherheit drei mehr (GDD §12). Am Rundenende werden die
// Zinsen gezahlt. Reicht die Kasse nicht, leiht Jacob zuerst das billigere Geld
// bei der Bank, dann gibt der Geldverleiher einen Notkredit: sofort, ohne
// Sicherheit, aber zu 40 % pro Jahr. Bleibt die Kasse trotzdem negativ, läuft
// eine Frist von bankruptcy.graceRounds Runden. Läuft sie ab, ist Jacob pleite.

import { RATINGS, type Balance, type Rating } from './balance';
import { formatDate } from './calendar';
import type { Well } from './drilling';
import type { GameState } from './game';
import { parcelLabel } from './lease';
import { producingWells } from './production';
import { worldRateAdd } from './world';
// 4.16 Andockpunkt: eigene Bank in Hallstead.
import { bankRateDiscount } from './holdings';

/** Woher das Geld kommt: von der Bank oder als Notkredit vom Geldverleiher. */
export type LoanSource = 'bank' | 'lender';

/** Ein einzelner Kredit. Jeder Kredit behält seinen Zins, bis er getilgt ist. */
export interface Loan {
  /** Laufende Nummer, damit die Reihenfolge der Kredite eindeutig bleibt. */
  id: number;
  source: LoanSource;
  /** Ausstehender Betrag in $. */
  principal: number;
  /** Jahreszins, der für diesen Kredit vereinbart wurde. */
  rate: number;
  /** Runde, in der der Kredit aufgenommen wurde. */
  takenRound: number;
  /** Parzelle der fördernden Quelle, die als Pfand dient; null ohne Pfand. */
  collateral: string | null;
}

export type LoanResult = { ok: true; state: GameState; loan: Loan } | { ok: false; reason: string };

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

/** Auf ganze Cent. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Zinsen auf vier Stellen runden, damit 0,07 − 0,02 nicht als 0,05000000000000001 dasteht. */
function rateOf(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function labelOf(state: Pick<GameState, 'parcels'>, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return parcel ? parcelLabel(parcel) : parcelId;
}

/** Wie viel Jacob dem Geldverleiher schuldet. */
function lenderDebt(state: Pick<GameState, 'loans'>): number {
  return state.loans.filter((l) => l.source === 'lender').reduce((s, l) => s + l.principal, 0);
}

/** Alle Schulden in $, Bank und Geldverleiher zusammen. */
export function debt(state: Pick<GameState, 'loans'>): number {
  return cents(state.loans.reduce((sum, loan) => sum + loan.principal, 0));
}

/** Bankrahmen: limitBase plus limitPerWell für jede fördernde Quelle. */
export function creditLimit(state: Pick<GameState, 'wells'>, balance: Balance): number {
  const { limitBase, limitPerWell } = balance.credit;
  return limitBase + limitPerWell * producingWells(state).length;
}

/** Wie viel die Bank noch gibt: Rahmen minus das, was er ihr schon schuldet. */
export function headroom(state: Pick<GameState, 'loans' | 'wells'>, balance: Balance): number {
  const offen = state.loans.filter((l) => l.source === 'bank').reduce((sum, l) => sum + l.principal, 0);
  return Math.max(0, creditLimit(state, balance) - offen);
}

/** Fördernde Quellen, die noch nicht als Pfand verpfändet sind. */
export function freeCollateral(state: Pick<GameState, 'loans' | 'wells'>): Well[] {
  const verpfändet = new Set(state.loans.flatMap((l) => (l.collateral === null ? [] : [l.collateral])));
  return producingWells(state).filter((w) => !verpfändet.has(w.parcelId));
}

/**
 * Jahreszins, den ein neuer Kredit bekäme: Grundzins nach Rating, mit Pfand
 * zwei Punkte weniger, ohne Sicherheit drei mehr. climate ist der Aufschlag
 * aus dem Kreditklima des Weltmodells (4.1, worldRateAdd), auch negativ.
 */
export function loanRate(balance: Balance, rating: Rating, secured: boolean, climate = 0): number {
  const { collateralDiscount, unsecuredAdd, rates } = balance.credit;
  const roh = (secured ? rates[rating] - collateralDiscount : rates[rating] + unsecuredAdd) + climate;
  return rateOf(Math.max(0, roh));
}

/** Zins für ein Quartal: ein Viertel des Jahreszinses auf die Restschuld. */
export function quarterInterest(loan: Pick<Loan, 'principal' | 'rate'>): number {
  return cents((loan.principal * loan.rate) / 4);
}

/** Das teurere Geld zuerst: höherer Zins vor niedrigerem, bei gleichem Zins der ältere Kredit. */
function teuersteZuerst(loans: readonly Loan[]): Loan[] {
  return [...loans].sort((a, b) => b.rate - a.rate || a.takenRound - b.takenRound || a.id - b.id);
}

function lastId(loans: readonly Loan[]): number {
  return loans.reduce((max, loan) => Math.max(max, loan.id), 0);
}

/**
 * Das Rating folgt der Verschuldung (Anteil der Schulden am Bankrahmen) und der
 * Zahlungshistorie (Runden, für die der Geldverleiher einspringen musste). In
 * Kapitel 1 gibt es kein A: ohne Cashflow-Historie und ohne Ruf bleibt es beim
 * Startrating – das Rating kann nur schlechter werden.
 */
function ratingOf(state: Pick<GameState, 'loans' | 'wells' | 'missedPayments'>, balance: Balance): Rating {
  const { startRating, usageC, usageD, missedC, missedD } = balance.credit;
  const rahmen = creditLimit(state, balance);
  const anteil = rahmen > 0 ? debt(state) / rahmen : 0;
  let rating: Rating = anteil <= usageC ? 'B' : anteil <= usageD ? 'C' : 'D';
  if (state.missedPayments >= missedD) rating = 'D';
  else if (state.missedPayments >= missedC && rating === 'B') rating = 'C';
  // Schlechter als das Startrating geht es nie, besser erst mit Cashflow und Ruf.
  const schlechter = RATINGS.indexOf(rating) > RATINGS.indexOf(startRating) ? rating : startRating;
  return schlechter;
}

/** Warum ein Kredit gerade nicht geht. */
function loanBlocked(state: GameState, balance: Balance, amount: number): string | undefined {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (state.rating === 'D') return 'Rating D: In dieser Lage gibt die Bank keinen neuen Kredit.';
  if (!Number.isInteger(amount) || amount <= 0) return 'Der Betrag muss eine ganze Zahl über 0 sein.';
  const { minLoan } = balance.credit;
  if (amount < minLoan) return `Der kleinste Kredit bei der Bank ist ${money(minLoan)}.`;
  const frei = headroom(state, balance);
  if (amount > frei) return `Mehr gibt die Bank nicht: Im Rahmen sind noch ${money(frei)}.`;
  return undefined;
}

/**
 * Zinsaufschlag für einen neuen Bankkredit (auch negativ): Kreditklima des
 * Weltmodells (4.1) minus den Rabatt der eigenen Bank in Hallstead (4.16).
 */
export function bankRateAdd(state: Pick<GameState, 'worldModel' | 'hallstead'>, balance: Balance): number {
  // 4.16 Andockpunkt: bankRateDiscount (0, solange Jacob keine eigene Bank hat).
  return worldRateAdd(state.worldModel, balance.worldModel) - bankRateDiscount(state, balance);
}

/**
 * Kredit bei der Bank aufnehmen. Das Geld kommt sofort in die Kasse. Eine
 * fördernde Quelle, die noch nicht verpfändet ist, dient als Pfand und senkt den
 * Zins; sonst zahlt Jacob den Aufschlag für die fehlende Sicherheit.
 */
export function takeLoan(state: GameState, balance: Balance, amount: number): LoanResult {
  const blocked = loanBlocked(state, balance, amount);
  if (blocked) return { ok: false, reason: blocked };
  const pfand = freeCollateral(state)[0];
  const zins = loanRate(balance, state.rating, pfand !== undefined, bankRateAdd(state, balance));
  const loan: Loan = {
    id: lastId(state.loans) + 1,
    source: 'bank',
    principal: amount,
    rate: zins,
    takenRound: state.round,
    collateral: pfand?.parcelId ?? null,
  };
  const sicherheit = pfand ? `, Pfand ist die Quelle auf ${labelOf(state, pfand.parcelId)}` : ', ohne Pfand';
  return {
    ok: true,
    loan,
    state: {
      ...state,
      cash: state.cash + amount,
      loans: [...state.loans, loan],
      log: [...state.log, `${formatDate(state)}: ${money(amount)} bei der Bank geliehen (${percent(zins)} pro Jahr${sicherheit}).`],
    },
  };
}

/** Höchstens so viel kann Jacob jetzt tilgen: was in der Kasse ist, aber nicht mehr als die Schulden (auf den Cent). */
export function repayMax(state: Pick<GameState, 'loans' | 'cash' | 'finished'>): number {
  if (state.finished) return 0;
  return cents(Math.max(0, Math.min(state.cash, debt(state))));
}

/**
 * Schulden aus der Kasse tilgen. Erst das teurere Geld – Notkredite des
 * Geldverleihers vor den Bankkrediten. Ein ganz getilgter Kredit verschwindet
 * und gibt sein Pfand frei. Beträge gehen auf den Cent genau, weil Notkredite
 * und Zinsen Cent-Beträge haben: Wer genug in der Kasse hat, kann immer alles
 * tilgen.
 */
export function repay(state: GameState, _balance: Balance, amount: number): LoanResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  if (state.loans.length === 0) return { ok: false, reason: 'Du schuldest niemandem Geld.' };
  if (!Number.isFinite(amount) || cents(amount) <= 0) return { ok: false, reason: 'Der Betrag muss über 0 sein.' };
  const betrag = cents(amount);
  const schuld = cents(debt(state));
  if (betrag > schuld) return { ok: false, reason: `So viel schuldest du nicht: ${money(schuld)}.` };
  if (betrag > cents(state.cash)) return { ok: false, reason: `Nicht genug Geld: In der Kasse sind ${money(state.cash)}.` };

  let rest = betrag;
  /** Was von jedem Kredit übrig bleibt; null heißt: ganz getilgt. */
  const neu = new Map<number, number | null>();
  let erstes: Loan | undefined;
  for (const loan of teuersteZuerst(state.loans)) {
    const teil = cents(Math.min(loan.principal, rest));
    if (teil <= 0) continue;
    rest = cents(rest - teil);
    erstes ??= loan;
    const uebrig = cents(loan.principal - teil);
    neu.set(loan.id, uebrig > 0 ? uebrig : null);
  }
  // Die Liste behält ihre Reihenfolge; ein ganz getilgter Kredit fällt weg.
  const loans = state.loans.flatMap((loan) => {
    if (!neu.has(loan.id)) return [loan];
    const uebrig = neu.get(loan.id)!;
    return uebrig === null ? [] : [{ ...loan, principal: uebrig }];
  });
  const getilgt = erstes!;
  return {
    ok: true,
    loan: { ...getilgt, principal: neu.get(getilgt.id) ?? 0 },
    state: {
      ...state,
      cash: cents(state.cash - betrag),
      loans,
      log: [...state.log, `${formatDate(state)}: ${money(betrag)} getilgt – zuerst das teurere Geld (${percent(getilgt.rate)} pro Jahr).`],
    },
  };
}

/** Zinsen, die am Rundenende für alle Kredite zusammen fällig werden. */
export function quarterInterestTotal(state: Pick<GameState, 'loans'>): number {
  return cents(state.loans.reduce((sum, loan) => sum + quarterInterest(loan), 0));
}

/**
 * Ein Schieberegler für einen Geldbetrag: von min bis max in Schritten von
 * step. Die letzte Stellung ist immer genau max – auch wenn max kein
 * Vielfaches von step ist (etwa Schulden mit Cent-Beträgen).
 */
export interface AmountSlider {
  min: number;
  max: number;
  step: number;
}

/** Wie viele Stellungen der Regler hat (mindestens eine). */
export function sliderPositions(slider: AmountSlider): number {
  if (slider.max <= slider.min) return 1;
  return Math.ceil(cents(slider.max - slider.min) / slider.step) + 1;
}

/** Betrag an einer Reglerstellung (0 = ganz links); die letzte Stellung ist genau max. */
export function sliderAmount(slider: AmountSlider, position: number): number {
  const letzte = sliderPositions(slider) - 1;
  const p = Math.max(0, Math.min(letzte, Math.round(position)));
  if (p === letzte) return slider.max;
  return cents(Math.min(slider.max, slider.min + p * slider.step));
}

/**
 * Regler „Kredit aufnehmen“: vom kleinsten Kredit bis zum freien Bankrahmen.
 * null, wenn die Bank gerade keinen Kredit gibt (Rating D, Rahmen voll,
 * Kapitel beendet).
 */
export function loanSlider(state: GameState, balance: Balance): AmountSlider | null {
  const { minLoan, sliderStep } = balance.credit;
  if (loanBlocked(state, balance, minLoan)) return null;
  return { min: minLoan, max: Math.floor(headroom(state, balance)), step: sliderStep };
}

/**
 * Regler „Tilgen“: von einem Schritt (oder weniger, wenn nicht mehr geht) bis
 * min(Kasse, Schulden). Die Endstellung tilgt alles, was die Kasse hergibt –
 * reicht sie, sind die Schulden danach genau 0. null ohne Schulden oder Geld.
 */
export function repaySlider(state: GameState, balance: Balance): AmountSlider | null {
  if (state.loans.length === 0) return null;
  const max = repayMax(state);
  if (max <= 0) return null;
  const step = balance.credit.sliderStep;
  return { min: Math.min(step, max), max, step };
}

/**
 * Rundenende: Für jeden Kredit wird ein Quartalszins fällig. Reicht die Kasse
 * nicht, leiht Jacob zuerst das billigere Geld: einen Bankkredit über den
 * Fehlbetrag (mindestens minLoan), solange Rahmen und Rating das hergeben. Sonst
 * springt der Geldverleiher mit einem Notkredit ein – bis zu seinem Limit. Was
 * auch er nicht mehr gibt, bleibt offen: Die Kasse ist negativ, und die
 * Pleitefrist beginnt. Jede Runde, in der der Geldverleiher einspringen musste
 * oder Zinsen offen bleiben, ist eine Fehlzahlung für das Rating; ein sauber
 * bezahltes Quartal nimmt einen alten Strich wieder weg.
 */
export function settleLoans(input: GameState, balance: Balance): GameState {
  const date = formatDate(input);
  const { emergency, minLoan } = balance.credit;
  const faellig = quarterInterestTotal(input);
  const bezahlt = Math.min(Math.max(input.cash, 0), faellig);
  let state: GameState = { ...input, cash: cents(input.cash - faellig), log: [...input.log] };
  if (bezahlt > 0) {
    const n = input.loans.length;
    state.log.push(`${date}: Zinsen ${money(bezahlt)} für ${n} ${n === 1 ? 'Kredit' : 'Kredite'} gezahlt.`);
  }

  let versaeumt = false;
  if (state.cash < 0) {
    // 1. Das billigere Geld: ein Bankkredit über den Fehlbetrag.
    const bank = takeLoan(state, balance, Math.max(minLoan, Math.ceil(-state.cash)));
    if (bank.ok) state = bank.state;
  }
  if (state.cash < 0) {
    // 2. Der Geldverleiher: sofort, ohne Sicherheit, zu seinem Wucherzins.
    const hilfe = cents(Math.min(-state.cash, Math.max(0, emergency.limit - lenderDebt(state))));
    versaeumt = true;
    if (hilfe > 0) {
      const loan: Loan = {
        id: lastId(state.loans) + 1,
        source: 'lender',
        principal: hilfe,
        rate: emergency.rate,
        takenRound: input.round,
        collateral: null,
      };
      state = {
        ...state,
        cash: cents(state.cash + hilfe),
        loans: [...state.loans, loan],
        log: [...state.log, `${date}: Der Geldverleiher gibt einen Notkredit über ${money(hilfe)} zu ${percent(emergency.rate)} pro Jahr.`],
      };
    }
  }
  if (state.cash < 0) {
    state.log.push(`${date}: ${money(-state.cash)} bleiben offen – niemand leiht Jacob mehr Geld.`);
  }

  const sauber = !versaeumt && input.loans.length > 0;
  const missedPayments = Math.max(0, input.missedPayments + (versaeumt ? 1 : 0) - (sauber ? 1 : 0));
  return { ...state, missedPayments, rating: ratingOf({ ...state, missedPayments }, balance) };
}

/**
 * Pleiteprüfung nach der Abrechnung. Die Kasse ist hier nur noch negativ, wenn
 * weder Bank noch Geldverleiher etwas gegeben haben (settleLoans leiht vorher
 * automatisch) – „Bargeld unter null ohne Kreditrahmen“ (GDD §8). Dann startet
 * eine Frist von graceRounds Runden. Ist die Kasse bei ihrem Ablauf immer noch
 * negativ, ist Jacob pleite. In der letzten Runde des Kapitels gibt es keine
 * Frist mehr: Wer das Kapitel im Minus beendet, ist bankrott (Kapitelprüfung).
 */
export function checkBankruptcy(input: GameState, balance: Balance): GameState {
  if (input.finished || input.ending !== null) return input;
  const date = formatDate(input);
  if (input.cash >= 0) {
    if (input.bankruptcyDeadline === 0) return input;
    return {
      ...input,
      bankruptcyDeadline: 0,
      log: [...input.log, `${date}: Die Kasse stimmt wieder – die Bank lässt die Frist fallen.`],
    };
  }

  const pleite = (grund: string): GameState => ({
    ...input,
    finished: true,
    ending: 'pleite',
    log: [...input.log, `${date}: ${grund} Jacob Harlan ist pleite – die Bank nimmt die Firma in Zwangsverwaltung.`],
  });
  if (input.round >= input.totalRounds) {
    return pleite(`Das Kapitel endet mit ${money(-input.cash)} im Minus.`);
  }
  const { graceRounds } = balance.bankruptcy;
  if (input.bankruptcyDeadline === 0) {
    return {
      ...input,
      bankruptcyDeadline: input.round + graceRounds,
      log: [
        ...input.log,
        `${date}: Die Kasse ist ${money(-input.cash)} im Minus und niemand leiht mehr. Die Bank gibt ${graceRounds} Runden Frist.`,
      ],
    };
  }
  if (input.round >= input.bankruptcyDeadline) {
    return pleite('Die Frist ist abgelaufen.');
  }
  return input;
}
