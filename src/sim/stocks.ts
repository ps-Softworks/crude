// 4.8 Aktien, Aufsichtsrat, Anleihen (GDD §8) – ab Kapitel 2.
//
// Wer am Ende von Kapitel 1 an die Börse gegangen ist (state.ipo, chapter.ts),
// führt ab Kapitel 2 eine Aktiengesellschaft:
//
//   Aktienbuch .. Jacobs Aktien, die Kleinaktionäre (Streubesitz) und die Blöcke,
//                 die Thorne über Strohmänner zusammenkauft. Wer sie sind, zeigt
//                 erst die Detektei (investigate).
//   Kurs ........ Imperiumswert / Aktien × Stimmung. Die Stimmung folgt Gewinn,
//                 Dividende, Kreditklima und öffentlicher Stimmung (Weltgrößen aus
//                 4.1 über StocksWorld, mit Ersatzwerten) und ein wenig Gerüchten.
//   Aufsichtsrat  5–9 Räte mit Agenda (Dividende, Sicherheit, Kurs, Wachstum).
//                 Treue steigt, wenn die Agenda erfüllt ist, sonst fällt sie. Der
//                 unzufriedenste Rat stellt Forderungen mit Frist. Neue Aktien und
//                 große Anleihen brauchen die Mehrheit loyaler Räte.
//   Kontrolle ... eigene Anteile + der Teil des Streubesitzes, den loyale Räte
//                 mitbringen (board.weight). Thornes Aktien zählen nie für Jacob.
//                 Unter 50 % kann ein Misstrauensvotum kommen; hält der Rat nicht
//                 zu Jacob, folgt ein Stellvertreterkampf – verloren = abgesetzt.
//   Thorne ...... kauft erst, wenn mindestens thorne.minOutside der Aktien nicht bei
//                 Jacob liegen („zu viele Aktien verkauft“), dann über Strohmänner
//                 aus dem Streubesitz. Je seatPer Anteil bekommt er einen Sitz.
//   Anleihen .... große Summen zu festem Zins (Rating + Kreditklima), Kupon jede
//                 Runde – auch in Krisen –, am Ende der Laufzeit die ganze Summe.
//                 Gibt es auch für die Familienfirma.
//
// Reine Funktionen, Zufall nur über den eigenen Rng (Seed + ":aktien").
// Namen und Texte: content/stocks.yaml (stocksContent.ts), Zahlen: balance.yaml → stocks.

import type { Balance, Rating } from './balance';
import { formatDate } from './calendar';
import { debt } from './credit';
import { empireValue } from './empire';
import type { GameState } from './game';
import { producingWells } from './production';
import { Rng, seedFromString, type RngState } from './rng';

export const AGENDAS = ['dividend', 'safety', 'price', 'growth'] as const;
/** Was ein Rat will. 'spy' = Thornes Mann. */
export type Agenda = (typeof AGENDAS)[number] | 'spy';

export interface BoardMember {
  /** Kennung aus content/stocks.yaml; Thornes Leute heißen thorne-1, thorne-2 … */
  id: string;
  agenda: Agenda;
  /** 0–100; ab balance.stocks.board.loyalFrom stimmt der Rat mit Jacob. Thornes Leute: immer 0. */
  loyalty: number;
  /** Runde, in der der Rat eingezogen ist. */
  since: number;
}

export const DEMAND_KINDS = ['dividend', 'debt', 'buyback', 'wells', 'issue'] as const;
export type DemandKind = (typeof DEMAND_KINDS)[number];

/** Eine Forderung des Aufsichtsrats mit Frist. */
export interface Demand {
  member: string;
  kind: DemandKind;
  /** dividend: $ zusammen · debt: höchstens $ · buyback/issue: Aktien · wells: fördernde Quellen. */
  target: number;
  /** Zählerstand bei der Forderung (Dividenden, Rückkäufe, neue Aktien). */
  baseline: number;
  /** Letzte Runde der Frist. */
  due: number;
  accepted: boolean;
}

/** Aktien, die Thorne über einen Strohmann hält. */
export interface ShareBlock {
  shares: number;
  /** Index in die Strohmann-Namen (content/stocks.yaml → straw, modulo Länge). */
  straw: number;
  since: number;
}

export interface Bond {
  id: number;
  principal: number;
  /** Jahreszins, fest. */
  rate: number;
  issued: number;
  /** Runde, an deren Ende die Summe zurückgezahlt wird (term Kupons: Ausgaberunde bis hier). */
  maturity: number;
}

export interface StocksState {
  rng: RngState;
  /** Aktiengesellschaft? false = Familienfirma (dann nur Anleihen). */
  public: boolean;
  /** Aktien Jacobs. */
  jacob: number;
  /** Streubesitz der Kleinaktionäre. */
  float: number;
  /** Thornes Blöcke über Strohmänner. */
  blocks: ShareBlock[];
  /** Stimmung der Börse, 1 = fair. */
  sentiment: number;
  /** Kurs je Aktie in $. */
  price: number;
  priceHistory: number[];
  /** Imperiumswert bei der letzten Abrechnung (Gewinnsignal). */
  lastValue: number;
  /** Runde der letzten Dividende (zu Beginn: Startrunde, damit die Schonfrist zählt). */
  dividendRound: number;
  /** Ausgeschüttete Dividende in $ insgesamt (alle Aktionäre). */
  dividendsTotal: number;
  issuedTotal: number;
  boughtBackTotal: number;
  board: BoardMember[];
  demand: Demand | null;
  /** Runde der letzten Detektei-Prüfung (0 = nie): alles, was davor gekauft wurde, ist enttarnt. */
  revealedRound: number;
  /** Runde, in der zuletzt ein Rat umgestimmt wurde. */
  courtedRound: number;
  /** Laufender Stellvertreterkampf. */
  proxy: { until: number; press: number; pressRound: number } | null;
  /** Runde, in der Jacob abgesetzt wurde (0 = nicht). Ende „Abgesetzt“ (GDD §14) – siehe docs/phase4/4.8.md. */
  ousted: number;
  bonds: Bond[];
  nextBond: number;
  startRound: number;
}

/** Weltgrößen aus 4.1, die die Börse braucht. Ersatzwerte, solange es kein Weltmodell gibt. */
export interface StocksWorld {
  /** Kreditklima 0–100, 50 = normal, hoch = Boom. */
  credit: number;
  /** Öffentliche Stimmung 0–100. */
  mood: number;
}

export const STOCKS_WORLD_DEFAULT: StocksWorld = { credit: 50, mood: 50 };

/** Liest die Weltgrößen aus state.worldModel (4.1), sonst Ersatzwerte. */
export function stocksWorldOf(state: object): StocksWorld {
  const w = (state as { worldModel?: { credit?: unknown; mood?: unknown } }).worldModel;
  return {
    credit: typeof w?.credit === 'number' ? w.credit : STOCKS_WORLD_DEFAULT.credit,
    mood: typeof w?.mood === 'number' ? w.mood : STOCKS_WORLD_DEFAULT.mood,
  };
}

/** Kapitelnummer (4.5 setzt state.chapter); ohne Angabe Kapitel 1. */
export function chapterOf(state: object): number {
  const c = (state as { chapter?: unknown }).chapter;
  return typeof c === 'number' && Number.isFinite(c) ? c : 1;
}

/** Gibt es im aktuellen Kapitel Aktien und Anleihen? */
export function stocksUnlocked(state: object, balance: Balance): boolean {
  return chapterOf(state) >= balance.stocks.fromChapter;
}

/** Ein Rat aus content/stocks.yaml, wie die Simulation ihn braucht. */
export interface BoardSeatDef {
  id: string;
  agenda: (typeof AGENDAS)[number];
  loyalty: number;
}

export type StocksResult = { ok: true; state: GameState } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Kennzahlen

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function totalShares(s: StocksState): number {
  return s.jacob + s.float + thorneShares(s);
}

export function thorneShares(s: StocksState): number {
  return s.blocks.reduce((sum, b) => sum + b.shares, 0);
}

/** Jacobs Anteil (0–1). */
export function ownStake(s: StocksState): number {
  const total = totalShares(s);
  return total > 0 ? s.jacob / total : 1;
}

/** Thornes Anteil (0–1), ob enttarnt oder nicht. */
export function thorneStake(s: StocksState): number {
  const total = totalShares(s);
  return total > 0 ? thorneShares(s) / total : 0;
}

export function isLoyal(member: BoardMember, balance: Balance): boolean {
  return member.agenda !== 'spy' && member.loyalty >= balance.stocks.board.loyalFrom;
}

export function loyalSeats(s: StocksState, balance: Balance): number {
  return s.board.filter((m) => isLoyal(m, balance)).length;
}

export const MEMBER_MOODS = ['treu', 'dafuer', 'schwankt', 'dagegen'] as const;
/** Wie ein Rat zu Jacob steht – als Wort, nie als Zahl (GDD §16). */
export type MemberMood = (typeof MEMBER_MOODS)[number];

export function memberMood(member: BoardMember, balance: Balance): MemberMood {
  const ab = balance.stocks.board.loyalFrom;
  if (member.agenda === 'spy') return 'dagegen';
  if (member.loyalty >= ab + 25) return 'treu';
  if (member.loyalty >= ab) return 'dafuer';
  if (member.loyalty >= ab - 15) return 'schwankt';
  return 'dagegen';
}

/** Hat Jacob die Mehrheit im Aufsichtsrat? Ohne Rat (Familienfirma) immer. */
export function boardMajority(s: StocksState, balance: Balance): boolean {
  return s.board.length === 0 || loyalSeats(s, balance) * 2 > s.board.length;
}

/**
 * Kontrolle (GDD §4, §8) = eigene Anteile + Stimmen loyaler Räte: Loyale Räte
 * bringen ihren Teil (board.weight) des Streubesitzes mit. Thornes Aktien zählen
 * nie für Jacob. Im Stellvertreterkampf hilft die Presse. Familienfirma: 1.
 */
export function control(s: StocksState, balance: Balance): number {
  if (!s.public) return 1;
  const total = totalShares(s);
  if (total <= 0) return 1;
  const seats = s.board.length;
  const rat = seats > 0 ? loyalSeats(s, balance) / seats : 0;
  const presse = s.proxy ? s.proxy.press * balance.stocks.vote.pressBonus : 0;
  return clamp(s.jacob / total + (s.float / total) * balance.stocks.board.weight * rat + presse, 0, 1);
}

/** Kurs je Aktie: Imperiumswert / Aktien × Stimmung, nie unter price.min. */
export function sharePrice(state: GameState, balance: Balance, s: StocksState): number {
  const total = totalShares(s);
  if (total <= 0) return balance.stocks.price.min;
  return cents(Math.max(balance.stocks.price.min, (empireValue(state, balance) / total) * s.sentiment));
}

export function marketCap(s: StocksState): number {
  return cents(s.price * totalShares(s));
}

export function bondDebt(s: Pick<StocksState, 'bonds'> | undefined): number {
  return (s?.bonds ?? []).reduce((sum, b) => sum + b.principal, 0);
}

/** Kupon aller Anleihen je Runde (Quartal). */
export function bondCoupons(s: Pick<StocksState, 'bonds'> | undefined): number {
  return cents((s?.bonds ?? []).reduce((sum, b) => sum + (b.principal * b.rate) / 4, 0));
}

/** Bankschulden + Anleihen. */
export function totalDebt(state: GameState): number {
  return debt(state) + bondDebt(state.stocks);
}

/** Jahreszins einer neuen Anleihe; null = niemand zeichnet (Rating D). */
export function bondRate(balance: Balance, rating: Rating, world: StocksWorld = STOCKS_WORLD_DEFAULT): number | null {
  if (rating === 'D') return null;
  const b = balance.stocks.bonds;
  const klima = ((50 - clamp(world.credit, 0, 100)) / 50) * b.climateSpread;
  return Math.round(Math.max(b.minRate, b.baseRate + b.spreads[rating] + klima) * 10000) / 10000;
}

function hostile(state: GameState, balance: Balance): boolean {
  return balance.stocks.thorne.hostileMarks.some((m) => state.events.marks[m] !== undefined);
}

// ---------------------------------------------------------------------------
// Start (Kapitel 2)

/**
 * Legt Aktienbuch, Aufsichtsrat und Anleihen-Konto an – zu Beginn von Kapitel 2
 * (4.5 ruft das beim Kapitelstart). Wer an die Börse ging (state.ipo.share > 0),
 * bekommt eine AG mit 5–9 Räten aus roster; die Familienfirma nur Anleihen.
 * force: ohne Kapitelprüfung (Tests, Debug-Ansicht).
 */
export function startStocks(state: GameState, balance: Balance, roster: readonly BoardSeatDef[], opts: { force?: boolean } = {}): GameState {
  if (state.stocks) return state;
  if (!opts.force && !stocksUnlocked(state, balance)) return state;
  const B = balance.stocks;
  const sold = state.ipo?.share ?? 0;
  const isPublic = sold > 0;
  const jacob = Math.round(B.totalShares * (1 - sold));
  const sitze = isPublic ? Math.min(roster.length, clamp(B.board.seatsBase + Math.round(sold * B.board.seatsPerShare), B.board.seatsMin, B.board.seatsMax)) : 0;
  const board: BoardMember[] = roster.slice(0, sitze).map((r) => ({ id: r.id, agenda: r.agenda, loyalty: clamp(r.loyalty, 0, 100), since: state.round }));
  const value = empireValue(state, balance);
  const s: StocksState = {
    rng: seedFromString(`${state.seed}:aktien`),
    public: isPublic,
    jacob,
    float: B.totalShares - jacob,
    blocks: [],
    sentiment: 1,
    price: 0,
    priceHistory: [],
    lastValue: value,
    dividendRound: state.round,
    dividendsTotal: 0,
    issuedTotal: 0,
    boughtBackTotal: 0,
    board,
    demand: null,
    revealedRound: 0,
    courtedRound: 0,
    proxy: null,
    ousted: 0,
    bonds: [],
    nextBond: 1,
    startRound: state.round,
  };
  s.price = sharePrice(state, balance, s);
  s.priceHistory = [s.price];
  const text = isPublic
    ? `Harlan Oil ist eine Aktiengesellschaft: Jacob hält ${pct(jacob / B.totalShares)} der Aktien, der Aufsichtsrat hat ${sitze} Sitze.`
    : 'Harlan Oil bleibt in der Familie – Anleihen kann die Firma trotzdem ausgeben.';
  return { ...state, stocks: s, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

// ---------------------------------------------------------------------------
// Aktionen am Schreibtisch

function aktiv(state: GameState): { ok: true; s: StocksState } | { ok: false; reason: string } {
  const s = state.stocks;
  if (!s) return { ok: false, reason: 'Aktien gibt es erst in Kapitel 2.' };
  if (state.finished) return { ok: false, reason: 'Das Spiel ist vorbei.' };
  if (s.ousted > 0) return { ok: false, reason: 'Jacob führt die Firma nicht mehr.' };
  return { ok: true, s };
}

function ag(state: GameState): { ok: true; s: StocksState } | { ok: false; reason: string } {
  const a = aktiv(state);
  if (!a.ok) return a;
  if (!a.s.public) return { ok: false, reason: 'Eine Familienfirma hat keine Aktien.' };
  return a;
}

function mit(state: GameState, s: StocksState, cash: number, text: string): GameState {
  return { ...state, cash: cents(cash), stocks: s, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

/** Dividende beschließen (rateIndex in stocks.dividend.rates). Jacobs eigener Anteil bleibt in der Familie – aus der Kasse geht nur der Teil der anderen Aktionäre. */
export function dividendCost(state: GameState, balance: Balance, rateIndex: number): { amount: number; cost: number } | null {
  const s = state.stocks;
  const rate = balance.stocks.dividend.rates[rateIndex];
  if (!s || rate === undefined) return null;
  const amount = Math.round(marketCap(s) * rate);
  return { amount, cost: Math.round(amount * (1 - ownStake(s))) };
}

export function payDividend(state: GameState, balance: Balance, rateIndex: number): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (s.dividendRound === state.round && s.dividendsTotal > 0) return { ok: false, reason: 'Diese Runde ist schon eine Dividende beschlossen.' };
  const d = dividendCost(state, balance, rateIndex);
  if (!d) return { ok: false, reason: 'Diese Dividende gibt es nicht.' };
  if (d.amount <= 0) return { ok: false, reason: 'Bei diesem Kurs gibt es nichts auszuschütten.' };
  if (state.cash < d.cost) return { ok: false, reason: 'Dafür reicht die Kasse nicht.' };
  const neu: StocksState = { ...s, dividendRound: state.round, dividendsTotal: s.dividendsTotal + d.amount };
  return { ok: true, state: mit(state, neu, state.cash - d.cost, `Harlan Oil schüttet ${money(d.amount)} Dividende aus; an fremde Aktionäre gehen ${money(d.cost)}.`) };
}

/** Höchstens so viele neue Aktien auf einmal. */
export function maxIssue(s: StocksState, balance: Balance): number {
  return Math.floor(totalShares(s) * balance.stocks.issue.maxShare);
}

/** Erlös für count neue Aktien. */
export function issueProceeds(s: StocksState, balance: Balance, count: number): number {
  return Math.round(count * s.price * (1 - balance.stocks.issue.discount));
}

/** Neue Aktien ausgeben (GDD §8: braucht die Mehrheit im Aufsichtsrat). Verwässert Jacobs Anteil. */
export function issueShares(state: GameState, balance: Balance, count: number): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (!Number.isInteger(count) || count < 1) return { ok: false, reason: 'Mindestens eine Aktie.' };
  if (count > maxIssue(s, balance)) return { ok: false, reason: `Mehr als ${maxIssue(s, balance)} neue Aktien auf einmal nimmt der Markt nicht.` };
  if (!boardMajority(s, balance)) return { ok: false, reason: 'Der Aufsichtsrat stimmt dagegen – Jacob fehlt die Mehrheit.' };
  const erloes = issueProceeds(s, balance, count);
  const total = totalShares(s) + count;
  const neu: StocksState = {
    ...s,
    float: s.float + count,
    issuedTotal: s.issuedTotal + count,
    sentiment: clamp(s.sentiment - (balance.stocks.issue.dilutionPenalty * count) / total, balance.stocks.price.sentimentMin, balance.stocks.price.sentimentMax),
  };
  return {
    ok: true,
    state: mit(state, neu, state.cash + erloes, `Harlan Oil gibt ${count} neue Aktien aus und nimmt ${money(erloes)} ein. Jacob hält jetzt ${pct(ownStake(neu))}.`),
  };
}

export function buybackCost(s: StocksState, balance: Balance, count: number): number {
  return Math.round(count * s.price * (1 + balance.stocks.buyback.premium));
}

/** Aktien von den Kleinaktionären zurückkaufen und einziehen – Jacobs Anteil steigt. Strohmänner verkaufen nicht. */
export function buyBack(state: GameState, balance: Balance, count: number): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (!Number.isInteger(count) || count < 1) return { ok: false, reason: 'Mindestens eine Aktie.' };
  if (count > s.float) return { ok: false, reason: `Die Kleinaktionäre haben nur noch ${s.float} Aktien.` };
  const kosten = buybackCost(s, balance, count);
  if (state.cash < kosten) return { ok: false, reason: 'Dafür reicht die Kasse nicht.' };
  const total = totalShares(s);
  const neu: StocksState = {
    ...s,
    float: s.float - count,
    boughtBackTotal: s.boughtBackTotal + count,
    sentiment: clamp(s.sentiment + (balance.stocks.buyback.bonus * count) / total, balance.stocks.price.sentimentMin, balance.stocks.price.sentimentMax),
  };
  return { ok: true, state: mit(state, neu, state.cash - kosten, `Harlan Oil kauft ${count} Aktien für ${money(kosten)} zurück. Jacob hält jetzt ${pct(ownStake(neu))}.`) };
}

/** Einen Rat umstimmen: Essen, Gefälligkeiten. Einmal je Runde; Thornes Leute sind nicht zu haben. */
export function courtMember(state: GameState, balance: Balance, memberId: string): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  const m = s.board.find((x) => x.id === memberId);
  if (!m) return { ok: false, reason: 'Diesen Rat gibt es nicht.' };
  if (m.agenda === 'spy') return { ok: false, reason: 'Er hört höflich zu – und berichtet alles weiter.' };
  if (s.courtedRound === state.round) return { ok: false, reason: 'Diese Runde hat Jacob schon einen Rat zum Essen ausgeführt.' };
  const kosten = balance.stocks.board.courtCost;
  if (state.cash < kosten) return { ok: false, reason: 'Dafür reicht die Kasse nicht.' };
  const neu: StocksState = {
    ...s,
    courtedRound: state.round,
    board: s.board.map((x) => (x.id === memberId ? { ...x, loyalty: Math.min(100, x.loyalty + balance.stocks.board.courtGain) } : x)),
  };
  return { ok: true, state: mit(state, neu, state.cash - kosten, `Jacob führt einen Rat zum Essen aus (${money(kosten)}).`) };
}

/** Die Detektei durchleuchtet das Aktienbuch: Strohmänner und Thornes Leute im Rat fliegen auf. */
export function investigate(state: GameState, balance: Balance): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (s.revealedRound === state.round) return { ok: false, reason: 'Die Detektei arbeitet schon daran.' };
  const kosten = balance.stocks.thorne.investigateCost;
  if (state.cash < kosten) return { ok: false, reason: 'Dafür reicht die Kasse nicht.' };
  const neu: StocksState = { ...s, revealedRound: state.round };
  const fund =
    s.blocks.length > 0
      ? `Hinter ${s.blocks.length === 1 ? 'einem Käufer' : `${s.blocks.length} Käufen`} steckt Augustus Thorne – zusammen ${pct(thorneStake(s))} der Aktien.`
      : 'Im Aktienbuch steht niemand, der nicht ist, wer er vorgibt.';
  return { ok: true, state: mit(state, neu, state.cash - kosten, `Die Detektei prüft das Aktienbuch (${money(kosten)}). ${fund}`) };
}

/** Ist dieser Block (oder dieser Rat) enttarnt? */
export function revealed(s: StocksState, since: number): boolean {
  return s.revealedRound > 0 && since <= s.revealedRound;
}

/** Forderung zusagen. */
export function acceptDemand(state: GameState): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (!s.demand) return { ok: false, reason: 'Es liegt keine Forderung vor.' };
  if (s.demand.accepted) return { ok: false, reason: 'Schon zugesagt.' };
  return { ok: true, state: mit(state, { ...s, demand: { ...s.demand, accepted: true } }, state.cash, 'Jacob sagt dem Aufsichtsrat zu, die Forderung zu erfüllen.') };
}

/** Forderung ablehnen: Der Rat ist verärgert. */
export function rejectDemand(state: GameState, balance: Balance): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (!s.demand) return { ok: false, reason: 'Es liegt keine Forderung vor.' };
  const wer = s.demand.member;
  const neu: StocksState = { ...s, demand: null, board: treue(s.board, wer, -balance.stocks.demands.rejectLoss) };
  return { ok: true, state: mit(state, neu, state.cash, 'Jacob lehnt die Forderung des Aufsichtsrats ab.') };
}

/** Kleinaktionäre über die Presse mobilisieren – nur im Stellvertreterkampf, einmal je Runde. */
export function pressCampaign(state: GameState, balance: Balance): StocksResult {
  const a = ag(state);
  if (!a.ok) return a;
  const { s } = a;
  if (!s.proxy) return { ok: false, reason: 'Es läuft kein Stellvertreterkampf.' };
  if (s.proxy.pressRound === state.round) return { ok: false, reason: 'Diese Runde stehen die Anzeigen schon in allen Blättern.' };
  const kosten = balance.stocks.vote.pressCost;
  if (state.cash < kosten) return { ok: false, reason: 'Dafür reicht die Kasse nicht.' };
  const neu: StocksState = { ...s, proxy: { ...s.proxy, press: s.proxy.press + 1, pressRound: state.round } };
  return { ok: true, state: mit(state, neu, state.cash - kosten, `Jacob wirbt in den Zeitungen um die Stimmen der Kleinaktionäre (${money(kosten)}).`) };
}

/** Eine Anleihe ausgeben: principal aus bonds.sizes, term aus bonds.terms. Große brauchen bei einer AG die Mehrheit. */
export function issueBond(state: GameState, balance: Balance, principal: number, term: number, world: StocksWorld = stocksWorldOf(state)): StocksResult {
  const a = aktiv(state);
  if (!a.ok) return a;
  const { s } = a;
  const B = balance.stocks.bonds;
  if (!B.sizes.includes(principal)) return { ok: false, reason: 'Diese Summe bietet das Bankhaus nicht an.' };
  if (!B.terms.includes(term)) return { ok: false, reason: 'Diese Laufzeit gibt es nicht.' };
  const rate = bondRate(balance, state.rating, world);
  if (rate === null) return { ok: false, reason: 'Mit Rating D zeichnet niemand eine Anleihe.' };
  if (s.public && principal > balance.stocks.board.bigDecision * Math.max(0, empireValue(state, balance)) && !boardMajority(s, balance)) {
    return { ok: false, reason: 'Eine so große Anleihe braucht die Mehrheit im Aufsichtsrat.' };
  }
  const erloes = Math.round(principal * (1 - B.fee));
  const bond: Bond = { id: s.nextBond, principal, rate, issued: state.round, maturity: state.round + term - 1 };
  const neu: StocksState = { ...s, bonds: [...s.bonds, bond], nextBond: s.nextBond + 1 };
  return {
    ok: true,
    state: mit(state, neu, state.cash + erloes, `Harlan Oil gibt eine Anleihe über ${money(principal)} zu ${(rate * 100).toLocaleString('de-DE')} % aus (fällig nach Runde ${bond.maturity}); in die Kasse kommen ${money(erloes)}.`),
  };
}

// ---------------------------------------------------------------------------
// Rundenende

function treue(board: BoardMember[], id: string, delta: number): BoardMember[] {
  return board.map((m) => (m.id === id && m.agenda !== 'spy' ? { ...m, loyalty: clamp(m.loyalty + delta, 0, 100) } : m));
}

function erfuellt(state: GameState, s: StocksState, d: Demand): boolean {
  switch (d.kind) {
    case 'dividend':
      return s.dividendsTotal - d.baseline >= d.target;
    case 'debt':
      return totalDebt(state) <= d.target;
    case 'buyback':
      return s.boughtBackTotal - d.baseline >= d.target;
    case 'wells':
      return producingWells(state).length >= d.target;
    case 'issue':
      return s.issuedTotal - d.baseline >= d.target;
  }
}

/** Neue Forderung des unzufriedensten Rats – oder null, wenn er nichts Sinnvolles verlangen kann. */
function neueForderung(state: GameState, balance: Balance, s: StocksState): Demand | null {
  if (s.board.length === 0) return null;
  const D = balance.stocks.demands;
  const wer = s.board.reduce((a, b) => (b.loyalty < a.loyalty ? b : a));
  const due = state.round + D.dueRounds;
  const total = totalShares(s);
  switch (wer.agenda) {
    case 'dividend': {
      const target = Math.round(marketCap(s) * D.dividendShare);
      return target > 0 ? { member: wer.id, kind: 'dividend', target, baseline: s.dividendsTotal, due, accepted: false } : null;
    }
    case 'safety': {
      const schuld = totalDebt(state);
      return schuld > 0 ? { member: wer.id, kind: 'debt', target: Math.round(schuld * (1 - D.debtCut)), baseline: 0, due, accepted: false } : null;
    }
    case 'price': {
      const target = Math.min(s.float, Math.max(1, Math.round(total * D.buybackShare)));
      return target > 0 ? { member: wer.id, kind: 'buyback', target, baseline: s.boughtBackTotal, due, accepted: false } : null;
    }
    case 'growth':
      return { member: wer.id, kind: 'wells', target: producingWells(state).length + 1, baseline: 0, due, accepted: false };
    case 'spy':
      return { member: wer.id, kind: 'issue', target: Math.max(1, Math.round(total * D.issueShare)), baseline: s.issuedTotal, due, accepted: false };
  }
}

/**
 * Abrechnung am Rundenende (vor den Bankzinsen, damit ein Kupon, den die Kasse
 * nicht trägt, über Bank und Geldverleiher läuft): Anleihen (Kupon, Fälligkeit),
 * dann – nur bei einer AG – Kurs, Treue der Räte, Thornes Käufe und Sitze,
 * Forderungen, Misstrauensvotum und Stellvertreterkampf.
 */
export function settleStocks(input: GameState, balance: Balance, world: StocksWorld = stocksWorldOf(input)): GameState {
  const s0 = input.stocks;
  if (!s0 || s0.ousted > 0) return input;
  const datum = formatDate(input);
  const log: string[] = [];
  let cash = input.cash;

  // Anleihen: Kupon jede Runde, auch in Krisen; am Ende die ganze Summe.
  const kupon = bondCoupons(s0);
  if (kupon > 0) {
    cash -= kupon;
    log.push(`${datum}: Zinsen auf Anleihen: ${money(kupon)}.`);
  }
  const faellig = s0.bonds.filter((b) => b.maturity <= input.round);
  for (const b of faellig) {
    cash -= b.principal;
    log.push(`${datum}: Anleihe Nr. ${b.id} ist fällig – Harlan Oil zahlt ${money(b.principal)} zurück.`);
  }
  let s: StocksState = { ...s0, bonds: s0.bonds.filter((b) => b.maturity > input.round) };
  let state: GameState = { ...input, cash: cents(cash), stocks: s };
  if (!s.public) return { ...state, log: [...state.log, ...log] };

  const B = balance.stocks;
  const rng = new Rng(s.rng);
  const value = empireValue(state, balance);
  const vorher = s.price;

  // Kurs: Stimmung nach Gewinn, Dividende, Kreditklima, öffentlicher Stimmung, Gerüchten; zieht zurück zur 1.
  const gewinn = clamp((value - s.lastValue) / Math.max(Math.abs(s.lastValue), 1), -0.2, 0.2);
  let sentiment = s.sentiment + gewinn * B.price.profitWeight;
  if (s.dividendRound === state.round && s.dividendsTotal > 0) sentiment += B.dividend.bonus;
  else if (state.round - s.dividendRound >= B.dividend.graceRounds) sentiment -= B.dividend.missPenalty;
  sentiment += ((clamp(world.credit, 0, 100) - 50) / 50) * B.price.creditWeight;
  sentiment += ((clamp(world.mood, 0, 100) - 50) / 50) * B.price.moodWeight;
  sentiment += (rng.float() * 2 - 1) * B.price.noise;
  sentiment += (1 - sentiment) * B.price.reversion;
  s = { ...s, sentiment: clamp(sentiment, B.price.sentimentMin, B.price.sentimentMax) };
  s = { ...s, price: sharePrice(state, balance, s) };
  s = { ...s, priceHistory: [...s.priceHistory, s.price] };

  // Treue der Räte: erfüllte Agenda +gain, verletzte −loss.
  const schuldQuote = value > 0 ? totalDebt(state) / value : Infinity;
  const zufrieden: Record<Agenda, boolean> = {
    dividend: state.round - s.dividendRound < B.dividend.graceRounds,
    safety: schuldQuote <= B.board.maxDebtRatio,
    price: s.price >= vorher,
    growth: value > s.lastValue,
    spy: false,
  };
  s = {
    ...s,
    board: s.board.map((m) => (m.agenda === 'spy' ? m : { ...m, loyalty: clamp(m.loyalty + (zufrieden[m.agenda] ? B.board.gain : -B.board.loss), 0, 100) })),
  };

  // Thorne: kauft über Strohmänner, sobald genug Aktien nicht bei Jacob liegen.
  const total = totalShares(s);
  const draussen = total > 0 ? (total - s.jacob) / total : 0;
  if (draussen >= B.thorne.minOutside && thorneStake(s) < B.thorne.maxStake && rng.float() < B.thorne.buyChance) {
    const faktor = (hostile(state, balance) ? B.thorne.hostileFactor : 1) * (s.sentiment < B.thorne.cheapBelow ? 2 : 1);
    const frei = s.float - Math.ceil(total * B.thorne.floatKeep);
    const deckel = Math.floor(total * B.thorne.maxStake) - thorneShares(s);
    const menge = Math.min(Math.round(total * B.thorne.buyShare * faktor), frei, deckel);
    if (menge > 0) {
      s = { ...s, float: s.float - menge, blocks: [...s.blocks, { shares: menge, straw: rng.int(0, 99), since: state.round }] };
      log.push(`${datum}: Aktienbuch: Ein neuer Käufer übernimmt ${menge} Aktien von Kleinaktionären.`);
    }
  }
  // Thornes Sitze: je seatPer Anteil ein Mann im Rat – erst ein freier Sitz, dann der des untreuesten Rats.
  const gewollt = Math.min(B.thorne.maxSeats, Math.floor(thorneStake(s) / B.thorne.seatPer + 1e-9));
  let seine = s.board.filter((m) => m.agenda === 'spy').length;
  while (seine < gewollt) {
    seine++;
    const mann: BoardMember = { id: `thorne-${seine}`, agenda: 'spy', loyalty: 0, since: state.round };
    const andere = s.board.filter((m) => m.agenda !== 'spy');
    if (s.board.length < B.board.seatsMax || andere.length === 0) {
      s = { ...s, board: [...s.board, mann] };
      log.push(`${datum}: Ein neuer Rat zieht in den Aufsichtsrat ein – er vertritt eine Treuhandgesellschaft.`);
    } else {
      const raus = andere.reduce((a, b) => (b.loyalty < a.loyalty ? b : a));
      s = { ...s, board: s.board.map((m) => (m.id === raus.id ? mann : m)), demand: s.demand?.member === raus.id ? null : s.demand };
      log.push(`${datum}: Ein Rat verkauft seinen Sitz im Aufsichtsrat an eine Treuhandgesellschaft.`);
    }
  }

  // Forderungen: offene prüfen, dann vielleicht eine neue.
  state = { ...state, stocks: s };
  if (s.demand) {
    const d = s.demand;
    if (erfuellt(state, s, d)) {
      s = { ...s, demand: null, board: treue(s.board, d.member, B.demands.fulfillGain) };
      log.push(`${datum}: Der Aufsichtsrat ist zufrieden: Die Forderung ist erfüllt.`);
    } else if (state.round >= d.due) {
      s = { ...s, demand: null, board: treue(s.board, d.member, -(d.accepted ? B.demands.failLoss : B.demands.rejectLoss)) };
      log.push(`${datum}: Die Frist des Aufsichtsrats ist verstrichen${d.accepted ? ' – Jacob hat sein Wort nicht gehalten' : ''}.`);
    }
  } else if (rng.float() < B.demands.chance) {
    const d = neueForderung(state, balance, s);
    if (d) {
      s = { ...s, demand: d };
      log.push(`${datum}: Der Aufsichtsrat stellt eine Forderung (Frist bis Runde ${d.due}).`);
    }
  }

  // Misstrauensvotum und Stellvertreterkampf (nur unter 50 % Kontrolle).
  if (s.proxy) {
    if (state.round >= s.proxy.until) {
      if (control(s, balance) >= 0.5) {
        s = { ...s, proxy: null };
        log.push(`${datum}: Stellvertreterkampf gewonnen – Jacob bleibt an der Spitze von Harlan Oil.`);
      } else {
        s = { ...s, proxy: null, ousted: state.round };
        log.push(`${datum}: Stellvertreterkampf verloren – der Aufsichtsrat setzt Jacob ab.`);
      }
    }
  } else if (control(s, balance) < 0.5) {
    const hist = s.priceHistory;
    const frueher = hist[Math.max(0, hist.length - 1 - B.vote.lookback)];
    const absturz = frueher > 0 && (frueher - s.price) / frueher >= B.vote.dropFrom;
    if (absturz || world.mood < B.vote.moodBelow) {
      if (boardMajority(s, balance)) {
        log.push(`${datum}: Misstrauensantrag im Aufsichtsrat – er scheitert, die Mehrheit hält zu Jacob.`);
      } else {
        s = { ...s, proxy: { until: state.round + B.vote.proxyRounds, press: 0, pressRound: 0 } };
        log.push(`${datum}: Misstrauensvotum: Der Aufsichtsrat will Jacob absetzen. Stellvertreterkampf bis Runde ${state.round + B.vote.proxyRounds}.`);
      }
    }
  }

  s = { ...s, lastValue: value, rng: rng.state };
  return { ...state, stocks: s, log: [...state.log, ...log] };
}

/** Was im Kassenbuch auf Jacob wartet: Stellvertreterkampf vor unbeantworteter Forderung. */
export function stocksAttention(state: Pick<GameState, 'stocks'>): 'proxy' | 'demand' | null {
  const s = state.stocks;
  if (!s || s.ousted > 0) return null;
  if (s.proxy) return 'proxy';
  if (s.demand && !s.demand.accepted) return 'demand';
  return null;
}

// ---------------------------------------------------------------------------
// Spielstand

function zahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Prüft state.stocks beim Laden (save.ts). */
export function isStocksState(v: unknown): v is StocksState {
  if (!obj(v)) return false;
  const zahlen = ['rng', 'jacob', 'float', 'sentiment', 'price', 'lastValue', 'dividendRound', 'dividendsTotal', 'issuedTotal', 'boughtBackTotal', 'revealedRound', 'courtedRound', 'ousted', 'nextBond', 'startRound'];
  if (!zahlen.every((k) => zahl(v[k])) || typeof v.public !== 'boolean') return false;
  if (!Array.isArray(v.priceHistory) || !v.priceHistory.every(zahl)) return false;
  if (!Array.isArray(v.blocks) || !v.blocks.every((b) => obj(b) && zahl(b.shares) && zahl(b.straw) && zahl(b.since))) return false;
  const agenden: readonly string[] = [...AGENDAS, 'spy'];
  if (!Array.isArray(v.board) || !v.board.every((m) => obj(m) && typeof m.id === 'string' && agenden.includes(m.agenda as string) && zahl(m.loyalty) && zahl(m.since))) return false;
  if (!Array.isArray(v.bonds) || !v.bonds.every((b) => obj(b) && ['id', 'principal', 'rate', 'issued', 'maturity'].every((k) => zahl(b[k])))) return false;
  const d = v.demand;
  if (d !== null && !(obj(d) && typeof d.member === 'string' && (DEMAND_KINDS as readonly string[]).includes(d.kind as string) && zahl(d.target) && zahl(d.baseline) && zahl(d.due) && typeof d.accepted === 'boolean')) return false;
  const p = v.proxy;
  if (p !== null && !(obj(p) && zahl(p.until) && zahl(p.press) && zahl(p.pressRound))) return false;
  return true;
}
