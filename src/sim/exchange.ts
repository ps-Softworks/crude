// Börse und Kauf auf Kredit (4.15, GDD §8, §7.2): ab Kapitel 3.
//
// Ein kleiner Aktienmarkt mit fünf Aktien (content/exchange.yaml) und einem
// Börsenfieber (0–100, 50 = normal). Das Fieber ist der Spiegel des
// Kreditklimas an der Börse:
//   – es folgt dem Kreditklima aus dem Weltmodell (4.4, Schnittstelle CreditClimate),
//   – steigende Kurse heizen es an (Momentum), über 50 schaukelt es sich auf,
//   – Jacobs Kauf auf Kredit heizt es zusätzlich an (GDD §8: „Wer so kauft,
//     heizt das Kreditklima selbst an“) und gibt über creditShift Hitze ans
//     Weltmodell der Folgerunde (exchangeWorldInput).
// Ab crash.from kann es krachen – aber nur, wenn die Zeitung vorher
// crash.minWarnings Runden in Folge gewarnt hat (exchangeWarning, mit dem
// Kreditklima vom Rundenbeginn). Es gibt nur einen Kreditcrash (GDD §7.2, §8):
// Ein Crash im Weltmodell reißt die Börse sofort mit, und ein Börsencrash
// kippt das Weltmodell in denselben Crash (crashWorld).
//
// Kauf auf Kredit: Jacob setzt Bargeld ein (stake), der Makler leiht den Rest
// bis zum gewählten Hebel (loan). Zinsen gehen jede Runde von der Kasse ab.
// Fällt das Eigenkapital (Wert − Kredit) unter margin.call × Einsatz, fordert
// der Makler Nachschuss; unter margin.liquidate × Einsatz verkauft er zwangsweise.
// Reicht der Erlös nicht für den Kredit, zahlt Jacob den Rest aus der Kasse –
// notfalls ins Minus, dann greift die Pleiteprüfung (credit.ts). So ruiniert
// ein Crash den, der auf Kredit gekauft hat.
//
// Reine Simulation mit eigenem Zufall (Seed + ":boerse"); je Runde wird immer
// gleich viel gewürfelt, damit Entscheidungen den Zufall nicht verschieben.
// In Kapitel 1 und 2 gibt es keine Börse: state.exchange bleibt undefined.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './stocks';
import type { ExchangeBalance } from './exchangeBalance';
import type { GameState } from './game';
import { Rng, seedFromString, type RngState } from './rng';
import type { WorldInput, WorldState } from './world';

// ---------------------------------------------------------------------------
// 4.4 Andockpunkt: was die Börse vom Kreditklima braucht.
// ---------------------------------------------------------------------------

/**
 * Das Kreditklima aus dem Weltmodell (4.1/4.4). Solange es kein Weltmodell im
 * Spielstand gibt, gilt NEUTRAL_CLIMATE – dann treibt die Börse ihr Fieber allein.
 */
export interface CreditClimate {
  /** Kreditklima 0–100, 50 = normal, hoch = überhitzt (viel Kredit, viel Spekulation). */
  credit: number;
  /** Runden, die ein Kreditcrash im Weltmodell noch nachwirkt (0 = keiner). */
  crash: number;
}

export const NEUTRAL_CLIMATE: CreditClimate = { credit: 50, crash: 0 };

/**
 * 4.4 Andockpunkt: liest das Kreditklima aus dem Weltmodell des Spielstands
 * (`state.worldModel`, WorldState aus 4.1). Alte Teststände ohne Weltmodell
 * bekommen NEUTRAL_CLIMATE.
 */
export function readClimate(state: { worldModel?: Pick<WorldState, 'credit' | 'crash'> }): CreditClimate {
  const w = state.worldModel;
  if (w && Number.isFinite(w.credit)) return { credit: w.credit, crash: Number.isFinite(w.crash) ? w.crash : 0 };
  return NEUTRAL_CLIMATE;
}

// 4.5 Andockpunkt: das laufende Kapitel – gemeinsamer Helfer aller Phase-4-Systeme (stocks.ts).
export { chapterOf };

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

/** Was beim letzten Rundenende an der Börse geschah – für Zeitung, Makler und Protokoll. */
export type ExchangeEvent = 'opened' | 'crash' | 'recovery' | 'call' | 'liquidated';

/** Ein Kauf: Aktien, eigener Einsatz und Maklerkredit. */
export interface Position {
  id: number;
  stock: string;
  shares: number;
  /** Eigenes Geld, das Jacob eingesetzt (und nachgeschossen) hat, in $. */
  stake: number;
  /** Maklerkredit in $ (0 = ohne Kredit gekauft). */
  loan: number;
  /** Runde des Kaufs. */
  round: number;
  /** Der Makler fordert Nachschuss. */
  called: boolean;
}

export interface ExchangeState {
  rng: RngState;
  /** Runde, in der die Börse für Jacob aufging. */
  opened: number;
  /** Börsenindex (Start balance.exchange.startIndex). */
  index: number;
  /** Börsenfieber 0–100, 50 = normal. Nie als Zahl sichtbar – nur über die Zeitung. */
  fever: number;
  /** Runden in Folge, in denen die Zeitung gewarnt hat. */
  warned: number;
  /** Runden, die der Börsencrash noch nachwirkt (0 = keiner). */
  crash: number;
  /** Crashs seit Öffnung. */
  crashes: number;
  /** Crash-Zähler des Weltmodells beim letzten Rundenende – ein neuer Weltcrash reißt die Börse mit. */
  lastClimateCrash: number;
  /** Kurs je Aktie in $. */
  prices: Record<string, number>;
  /** Letzte Kurse je Aktie, ältester zuerst, der aktuelle zuletzt. */
  history: Record<string, number[]>;
  positions: Position[];
  nextId: number;
  /** Was beim letzten Rundenende geschah. */
  events: ExchangeEvent[];
  /** Aktien, die beim letzten Rundenende zwangsverkauft wurden, mit dem Betrag, den Jacob nachzahlen musste. */
  liquidated: { stock: string; shortfall: number }[];
  /** 4.4 Andockpunkt: Impuls fürs Kreditklima aus der letzten Runde (Punkte; + heizt, − kühlt). */
  creditShift: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Gleichverteilt in [−1, 1) aus einer Zufallszahl in [0, 1). */
function sym(u: number): number {
  return u * 2 - 1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

/** Die Börse bei Öffnung: Startkurse, Fieber aus dem eigenen Zufall. */
export function newExchange(seed: string, round: number, eb: ExchangeBalance): ExchangeState {
  const rng = new Rng(seedFromString(`${seed}:boerse`));
  const fever = eb.fever.start.min + rng.float() * (eb.fever.start.max - eb.fever.start.min);
  const prices: Record<string, number> = {};
  const history: Record<string, number[]> = {};
  for (const s of eb.stocks) {
    prices[s.id] = s.start;
    history[s.id] = [s.start];
  }
  return {
    rng: rng.state,
    opened: round,
    index: eb.startIndex,
    fever,
    warned: 0,
    crash: 0,
    crashes: 0,
    lastClimateCrash: 0,
    prices,
    history,
    positions: [],
    nextId: 1,
    events: ['opened'],
    liquidated: [],
    creditShift: 0,
  };
}

/** Gibt es die Börse in diesem Spielstand (ab Kapitel 3 oder im Debug geöffnet)? */
export function exchangeOpen(state: Pick<GameState, 'exchange'>): boolean {
  return state.exchange !== undefined;
}

/** Öffnet die Börse sofort (Kapitelstart oder Debug). Ist sie schon offen, bleibt alles, wie es ist. */
export function openExchange(state: GameState, balance: Balance): GameState {
  if (state.exchange) return state;
  return {
    ...state,
    exchange: newExchange(state.seed, state.round, balance.exchange),
    log: [...state.log, `${formatDate(state)}: Ein Makler aus Hallstead bietet Jacob ein Konto an der Börse an.`],
  };
}

// ---------------------------------------------------------------------------
// Ansichten (keine Änderung am Zustand)
// ---------------------------------------------------------------------------

/** Kurswert eines Kaufs in $. */
export function positionValue(ex: Pick<ExchangeState, 'prices'>, p: Position): number {
  return p.shares * (ex.prices[p.stock] ?? 0);
}

/** Eigenkapital eines Kaufs: Wert minus Maklerkredit (kann negativ sein). */
export function positionEquity(ex: Pick<ExchangeState, 'prices'>, p: Position): number {
  return positionValue(ex, p) - p.loan;
}

/** Hebel eines Kaufs zum aktuellen Kurs (Wert / Eigenkapital); ohne Eigenkapital unendlich. */
export function positionLeverage(ex: Pick<ExchangeState, 'prices'>, p: Position): number {
  const equity = positionEquity(ex, p);
  return equity > 0 ? positionValue(ex, p) / equity : Infinity;
}

/** Summe aller Maklerkredite. */
export function marginDebt(state: Pick<GameState, 'exchange'>): number {
  return state.exchange?.positions.reduce((s, p) => s + p.loan, 0) ?? 0;
}

/** Eigenkapital im Depot (Kurswert minus Maklerkredite) – für Imperiumswert und Hauptbuch. */
export function exchangeEquity(state: Pick<GameState, 'exchange'>): number {
  const ex = state.exchange;
  return ex ? ex.positions.reduce((s, p) => s + positionEquity(ex, p), 0) : 0;
}

/** Maklerzins pro Jahr: Grundzins plus Kreditklima (GDD §8: Zins nach Klima). */
export function marginRate(eb: ExchangeBalance, climate: CreditClimate): number {
  return Math.max(0, eb.margin.rate + (eb.margin.rateClimate * (climate.credit - 50)) / 50);
}

/** Wie stark Jacobs geliehenes Geld anheizt: 0 (nichts geliehen) bis 1 (heatScale oder mehr). */
export function marginHeat(state: Pick<GameState, 'exchange'>, eb: ExchangeBalance): number {
  return clamp(marginDebt(state) / eb.margin.heatScale, 0, 1);
}

/**
 * Warnt die Zeitung in dieser Runde? Ja, wenn das Börsenfieber warnFrom
 * erreicht oder das Kreditklima (4.4) warnCredit. Genau diese Runden zählen
 * für crash.minWarnings – ohne Warnung kein Crash aus dem Börsenfieber.
 */
export function exchangeWarning(ex: Pick<ExchangeState, 'fever' | 'crash'>, eb: ExchangeBalance, climate: CreditClimate = NEUTRAL_CLIMATE): boolean {
  if (ex.crash > 0) return false;
  return ex.fever >= eb.warnFrom || climate.credit >= eb.warnCredit;
}

/** Schlagzeile der Börsenseite. Die Zeitung nennt nie das Fieber, nur ihre Zeichen. */
export const EXCHANGE_HEADLINE_IDS = ['opened', 'quiet', 'boom', 'gloom', 'warning', 'alarm', 'crash', 'slump', 'recovery'] as const;
export type ExchangeHeadlineId = (typeof EXCHANGE_HEADLINE_IDS)[number];

/** Diese Schlagzeilen sind Warnungen vor dem Crash. */
export const WARNING_HEADLINES: readonly ExchangeHeadlineId[] = ['warning', 'alarm'];

/** Welche Schlagzeile die Börsenseite zu Beginn dieser Runde trägt. */
export function exchangeHeadline(ex: ExchangeState, eb: ExchangeBalance, climate: CreditClimate = NEUTRAL_CLIMATE): ExchangeHeadlineId {
  if (ex.events.includes('crash')) return 'crash';
  if (ex.crash > 0) return 'slump';
  if (ex.events.includes('recovery')) return 'recovery';
  if (exchangeWarning(ex, eb, climate)) return ex.fever >= eb.alarmFrom || climate.crash > 0 ? 'alarm' : 'warning';
  if (ex.events.includes('opened')) return 'opened';
  if (ex.fever >= eb.boomFrom) return 'boom';
  if (ex.fever <= eb.gloomTo) return 'gloom';
  return 'quiet';
}

/** Änderung eines Kurses seit der letzten Runde (Anteil, z. B. −0,4). */
export function priceChange(ex: ExchangeState, stock: string): number {
  const h = ex.history[stock] ?? [];
  if (h.length < 2) return 0;
  const vorher = h[h.length - 2];
  return vorher > 0 ? (h[h.length - 1] - vorher) / vorher : 0;
}

// ---------------------------------------------------------------------------
// Handlungen
// ---------------------------------------------------------------------------

export type ExchangeResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Größter Einsatz, den Jacob jetzt setzen kann (ganze Dollar). */
export function maxStake(state: GameState): number {
  return state.exchange && !state.finished ? Math.max(0, Math.floor(state.cash)) : 0;
}

/**
 * Kauft Aktien: stake $ eigenes Geld, der Makler leiht (leverage − 1) × stake
 * dazu. Die Gebühr geht vom Kaufvolumen ab.
 */
export function buyStock(state: GameState, balance: Balance, stock: string, stake: number, leverage: number): ExchangeResult {
  const eb = balance.exchange;
  const ex = state.exchange;
  if (!ex) return { ok: false, reason: 'Jacob hat noch kein Konto an der Börse.' };
  if (state.finished) return { ok: false, reason: 'Das Spiel ist vorbei.' };
  const price = ex.prices[stock];
  if (price === undefined) return { ok: false, reason: 'Diese Aktie wird hier nicht gehandelt.' };
  if (!eb.margin.leverages.includes(leverage)) return { ok: false, reason: `Der Makler leiht nur mit Hebel ${eb.margin.leverages.join(', ')}.` };
  if (!Number.isFinite(stake) || stake < eb.margin.minBuy) return { ok: false, reason: `Unter ${money(eb.margin.minBuy)} nimmt der Makler keinen Auftrag an.` };
  if (stake > state.cash) return { ok: false, reason: 'So viel Bargeld hat Jacob nicht.' };
  const volume = stake * leverage;
  const shares = (volume * (1 - eb.margin.fee)) / price;
  const position: Position = { id: ex.nextId, stock, shares, stake, loan: volume - stake, round: state.round, called: false };
  const kredit = position.loan > 0 ? ` – ${money(position.loan)} davon leiht der Makler` : '';
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - stake),
      exchange: { ...ex, positions: [...ex.positions, position], nextId: ex.nextId + 1 },
      log: [...state.log, `${formatDate(state)}: Jacob kauft Aktien für ${money(volume)}${kredit}.`],
    },
  };
}

/** Verkauft einen Kauf ganz: Erlös minus Gebühr, davon zuerst der Maklerkredit. Der Rest (auch ein Minus) geht an die Kasse. */
export function sellPosition(state: GameState, balance: Balance, id: number): ExchangeResult {
  const ex = state.exchange;
  if (!ex) return { ok: false, reason: 'Jacob hat noch kein Konto an der Börse.' };
  if (state.finished) return { ok: false, reason: 'Das Spiel ist vorbei.' };
  const p = ex.positions.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'Diesen Kauf gibt es nicht mehr.' };
  const erloes = positionValue(ex, p) * (1 - balance.exchange.margin.fee);
  const netto = erloes - p.loan;
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash + netto),
      exchange: { ...ex, positions: ex.positions.filter((x) => x.id !== id) },
      log: [...state.log, `${formatDate(state)}: Jacob verkauft Aktien für ${money(erloes)}${p.loan > 0 ? `, ${money(p.loan)} gehen an den Makler` : ''}.`],
    },
  };
}

/** Schießt Geld nach: tilgt den Maklerkredit eines Kaufs und erhöht den Einsatz. */
export function topUpPosition(state: GameState, balance: Balance, id: number, amount: number): ExchangeResult {
  const ex = state.exchange;
  if (!ex) return { ok: false, reason: 'Jacob hat noch kein Konto an der Börse.' };
  if (state.finished) return { ok: false, reason: 'Das Spiel ist vorbei.' };
  const p = ex.positions.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'Diesen Kauf gibt es nicht mehr.' };
  if (p.loan <= 0) return { ok: false, reason: 'Für diesen Kauf schuldet Jacob dem Makler nichts.' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'Wie viel soll nachgeschossen werden?' };
  if (amount > state.cash) return { ok: false, reason: 'So viel Bargeld hat Jacob nicht.' };
  const betrag = Math.min(amount, p.loan);
  const neu: Position = { ...p, loan: round2(p.loan - betrag), stake: p.stake + betrag };
  neu.called = positionEquity(ex, neu) < balance.exchange.margin.call * neu.stake;
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - betrag),
      exchange: { ...ex, positions: ex.positions.map((x) => (x.id === id ? neu : x)) },
      log: [...state.log, `${formatDate(state)}: Jacob schießt dem Makler ${money(betrag)} nach.`],
    },
  };
}

// ---------------------------------------------------------------------------
// Rundenende
// ---------------------------------------------------------------------------

/** Zufallszahlen je Runde ohne die Aktien: Index, Fieber, Crash-Wurf, Crash-Tiefe, Crash-Dauer. */
const FESTE_WUERFE = 5;

/**
 * 4.15 Andockpunkt in endRound: Öffnet die Börse, sobald das Kapitel
 * balance.exchange.unlockChapter erreicht ist, und schreibt sie danach jede
 * Runde fort. In Kapitel 1 und 2 kommt der Zustand unverändert zurück (dasselbe Objekt).
 *
 * Zwei Klimastände: `shown` ist das Kreditklima vom Rundenbeginn – das stand in
 * der Zeitung und am Maklerschalter, danach zählen Warnungen und Zins. Das
 * fortgeschriebene Klima (readClimate(state), endRound ruft nach dem Weltmodell)
 * treibt das Fieber und reißt die Börse bei einem neuen Weltcrash mit.
 * Kracht die Börse aus eigenem Fieber, kracht auch die Welt (crashWorld) –
 * es gibt nur einen Kreditcrash (GDD §7.2, §8).
 */
export function settleExchange(state: GameState, balance: Balance, shown: CreditClimate = readClimate(state)): GameState {
  if (state.finished) return state;
  if (!state.exchange) {
    return chapterOf(state) >= balance.exchange.unlockChapter ? openExchange(state, balance) : state;
  }
  return crashWorld(advanceExchange(state, balance, readClimate(state), shown), balance);
}

/**
 * 4.4 Andockpunkt: Ein Börsencrash ist ein Kreditcrash der ganzen Welt. Ist die
 * Börse in dieser Runde gekracht und das Weltmodell noch nicht im Crash, kippt
 * es jetzt genauso, wie advanceWorld es täte (Kreditklima × credit.after, halbe
 * Neubohrungen, Nachricht 'crash'); die Dauer folgt dem Börsencrash, begrenzt
 * auf credit.rounds. Danach drücken Nachfrage, Bankzins und Stimmung wie bei
 * jedem Weltcrash. Ohne Weltmodell (alte Teststände) bleibt alles, wie es ist.
 */
export function crashWorld(state: GameState, balance: Balance): GameState {
  const ex = state.exchange;
  const w = state.worldModel;
  if (!ex || !w || !ex.events.includes('crash') || w.crash > 0) return state;
  const c = balance.worldModel.credit;
  const crash = clamp(ex.crash, Math.round(c.rounds.min), Math.round(c.rounds.max));
  const worldModel: WorldState = {
    ...w,
    credit: w.credit * c.after,
    crash,
    pipeline: w.pipeline.map((x) => x * 0.5),
    news: w.news.includes('crash') ? w.news : [...w.news, 'crash'],
    counts: { ...w.counts, crashes: w.counts.crashes + 1 },
  };
  return { ...state, worldModel, exchange: { ...ex, lastClimateCrash: crash } };
}

/**
 * 4.4 Andockpunkt für advanceWorldInGame: Jacobs Kauf auf Kredit heizt das
 * Kreditklima der Folgerunde an (creditShift der letzten Börsenrunde). Ohne
 * Börse kommt der Input unverändert zurück (dasselbe Objekt).
 */
export function exchangeWorldInput(state: Pick<GameState, 'exchange'>, input: WorldInput): WorldInput {
  const shift = state.exchange?.creditShift ?? 0;
  return shift === 0 ? input : { ...input, creditShift: (input.creditShift ?? 0) + shift };
}

/**
 * Eine Runde an der Börse: Warnungen zählen, Crash prüfen, Kurse bewegen,
 * Fieber fortschreiben, Zinsen und Dividenden buchen, Nachschuss fordern oder
 * zwangsverkaufen. Reihenfolge und Zahl der Würfel sind fest.
 */
export function advanceExchange(state: GameState, balance: Balance, climate: CreditClimate, shown: CreditClimate = climate): GameState {
  const eb = balance.exchange;
  const ex = state.exchange!;
  const date = formatDate(state);
  const log = [...state.log];
  const rng = new Rng(ex.rng);
  const u = Array.from({ length: FESTE_WUERFE + eb.stocks.length }, () => rng.float());
  const events: ExchangeEvent[] = [];

  // 1. Hat die Zeitung dieser Runde gewarnt? Das zählt, bevor gewürfelt wird –
  // mit dem Klima vom Rundenbeginn (shown), denn nur diese Zeitung hat Jacob gelesen.
  const warned = exchangeWarning(ex, eb, shown) ? ex.warned + 1 : 0;
  // Hitze aus Jacobs Kauf auf Kredit (Stand vor den Zwangsverkäufen dieser Runde).
  const heat = marginHeat(state, eb);

  // 2. Crash? Läuft einer, wirkt er nach. Sonst: Weltcrash (4.4) reißt mit, oder das Fieber kippt.
  let crash = ex.crash;
  let crashes = ex.crashes;
  let fever = ex.fever;
  let marketMove: number;
  let crashed = false;
  if (crash > 0) {
    marketMove = -eb.crash.tail;
    crash -= 1;
    if (crash === 0) events.push('recovery');
  } else {
    const weltcrash = climate.crash > 0 && ex.lastClimateCrash === 0;
    const span = Math.max(1, 100 - eb.crash.from);
    const chance = fever >= eb.crash.from ? Math.min(1, eb.crash.chance + (eb.crash.slope * (fever - eb.crash.from)) / span) : 0;
    const fieberkrach = warned >= eb.crash.minWarnings && u[2] < chance;
    if (weltcrash || fieberkrach) {
      crashed = true;
      marketMove = -(eb.crash.drop.min + u[3] * (eb.crash.drop.max - eb.crash.drop.min));
      const lo = eb.crash.rounds.min;
      const hi = eb.crash.rounds.max;
      crash = Math.min(hi, lo + Math.floor(u[4] * (hi - lo + 1)));
      crashes += 1;
      fever *= eb.crash.after;
      events.push('crash');
      log.push(`${date}: Krach an der Börse in Hallstead – die Kurse stürzen, die Makler rufen ihre Kredite zurück.`);
    } else {
      marketMove = eb.market.drift + (eb.market.boom * (fever - 50)) / 50 + eb.market.noise * sym(u[0]);
    }
  }

  // 3. Kurse: jede Aktie folgt dem Markt mit ihrem Beta, dazu eigene Schwankung.
  const prices: Record<string, number> = {};
  const history: Record<string, number[]> = {};
  eb.stocks.forEach((s, i) => {
    const sector = eb.sectors[s.sector];
    const alt = ex.prices[s.id] ?? s.start;
    const move = sector.beta * marketMove + sector.idio * sym(u[FESTE_WUERFE + i]);
    const neu = round2(Math.max(eb.minPrice, alt * (1 + move)));
    prices[s.id] = neu;
    history[s.id] = [...(ex.history[s.id] ?? []), neu].slice(-eb.history);
  });
  const index = Math.max(1, ex.index * (1 + marketMove));

  // 4. Fieber: zurück zur 50, über 50 schaukelt es sich auf, Kreditklima, Momentum, Jacobs Kredit, Zufall.
  if (!crashed) {
    const aufschaukeln = crash > 0 ? 0 : eb.fever.speculation * Math.max(0, fever - 50);
    fever +=
      eb.fever.revert * (50 - fever) +
      aufschaukeln +
      eb.fever.climate * (climate.credit - 50) +
      eb.fever.momentum * marketMove +
      eb.fever.margin * heat +
      eb.fever.noise * sym(u[1]);
  }
  fever = clamp(fever, 0, 100);

  // 5. Depot: Zinsen, Dividenden, Nachschuss oder Zwangsverkauf.
  const neuEx: ExchangeState = { ...ex, prices, history };
  // Der Zins, der am Maklerschalter aushing (Klima vom Rundenbeginn).
  const rate = marginRate(eb, shown);
  let cash = state.cash;
  const positions: Position[] = [];
  const liquidated: { stock: string; shortfall: number }[] = [];
  let zinsen = 0;
  let dividende = 0;
  for (const p of ex.positions) {
    const zins = (p.loan * rate) / 4;
    zinsen += zins;
    dividende += positionValue(neuEx, p) * eb.sectors[eb.stocks.find((s) => s.id === p.stock)?.sector ?? 'rail'].dividend;
    const equity = positionEquity(neuEx, p);
    if (p.loan > 0 && equity < eb.margin.liquidate * p.stake) {
      // Zwangsverkauf: Erlös minus Gebühr deckt den Kredit; fehlt etwas, zahlt Jacob aus der Kasse.
      const erloes = positionValue(neuEx, p) * (1 - eb.margin.fee);
      const netto = erloes - p.loan;
      cash += netto;
      liquidated.push({ stock: p.stock, shortfall: Math.max(0, -netto) });
      continue;
    }
    const called = p.loan > 0 && equity < eb.margin.call * p.stake;
    if (called && !p.called) events.push('call');
    positions.push({ ...p, called });
  }
  cash = cash - zinsen + dividende;
  if (zinsen > 0) log.push(`${date}: Der Makler bucht ${money(zinsen)} Zinsen ab.`);
  if (dividende >= 1) log.push(`${date}: Jacobs Aktien zahlen ${money(dividende)} Dividende.`);
  if (liquidated.length > 0) {
    events.push('liquidated');
    const fehlt = liquidated.reduce((s, l) => s + l.shortfall, 0);
    log.push(
      `${date}: Der Makler verkauft Jacobs Aktien zwangsweise${fehlt > 0 ? ` – der Erlös deckt den Kredit nicht, ${money(fehlt)} gehen aus der Kasse` : ''}.`,
    );
  }
  if (events.includes('call')) log.push(`${date}: Telegramm vom Makler: Jacob soll Geld nachschießen, sonst wird verkauft.`);
  if (events.includes('recovery')) log.push(`${date}: An der Börse kehrt Ruhe ein.`);

  // 6. 4.4 Andockpunkt: Hitze ans Kreditklima der Folgerunde (exchangeWorldInput).
  // Abkühlen muss die Börse es nicht: Ein Börsencrash ist ein Weltcrash (crashWorld).
  const creditShift = eb.margin.creditShift * heat;

  return {
    ...state,
    cash: round2(cash),
    log,
    exchange: {
      ...neuEx,
      rng: rng.state,
      index,
      fever,
      warned: crashed ? 0 : warned,
      crash,
      crashes,
      lastClimateCrash: climate.crash,
      positions,
      events,
      liquidated,
      creditShift,
    },
  };
}

// ---------------------------------------------------------------------------
// Spielstand
// ---------------------------------------------------------------------------

function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const EVENTS: readonly string[] = ['opened', 'crash', 'recovery', 'call', 'liquidated'];

/** 4.15 Andockpunkt für save.ts: Ist state.exchange vollständig? (undefined = keine Börse, auch gültig.) */
export function validExchange(value: unknown): boolean {
  if (value === undefined) return true;
  if (!istObjekt(value)) return false;
  if (!['rng', 'opened', 'index', 'fever', 'warned', 'crash', 'crashes', 'lastClimateCrash', 'nextId', 'creditShift'].every((k) => istZahl(value[k]))) return false;
  if (!istObjekt(value.prices) || !Object.values(value.prices).every(istZahl)) return false;
  if (!istObjekt(value.history) || !Object.values(value.history).every((h) => Array.isArray(h) && h.every(istZahl))) return false;
  if (!Array.isArray(value.events) || !value.events.every((e) => typeof e === 'string' && EVENTS.includes(e))) return false;
  if (!Array.isArray(value.liquidated) || !value.liquidated.every((l) => istObjekt(l) && typeof l.stock === 'string' && istZahl(l.shortfall))) return false;
  return (
    Array.isArray(value.positions) &&
    value.positions.every(
      (p) =>
        istObjekt(p) &&
        istZahl(p.id) &&
        typeof p.stock === 'string' &&
        istZahl(p.shares) &&
        istZahl(p.stake) &&
        istZahl(p.loan) &&
        istZahl(p.round) &&
        typeof p.called === 'boolean',
    )
  );
}
