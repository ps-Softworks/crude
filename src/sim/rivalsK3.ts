// Rivalen in Kapitel 3 „Der Konzernherr“ (4.19, GDD §13): „Margaret Crane führt den Kampf um die
// Marke. Thorne bläht Aktien auf. Bullard verschuldet sich.“
//
// - Margaret Crane (Crane Eastern, das Gegenüber im Markensystem 4.14): Zum Kapitelbeginn ist ihre
//   Marke überall bekannter; je Runde wirbt sie in jeder Region, in der Harlan Tankstellen hat, und
//   alle buildEvery Runden baut sie eine Tankstelle in Harlans stärkster Region.
// - Thorne: kauft in der Aktiengesellschaft je Runde über Strohmänner Harlan-Aktien (mit Groll doppelt
//   so viele) – das frühe Ende „Geschluckt“ rückt näher – und bläht den Kurs seiner Golfbahn auf, bis
//   ein Börsencrash die Blase platzen lässt.
// - Bullard: beginnt das Kapitel mit Schulden, leiht, wenn die Kasse knapp wird, und zahlt Zinsen.
//   Ab distressAt ist er am Ende: Merkzeichen k3_bullard_verschuldet (Ereignisse können darauf
//   reagieren), und er kommt mit Angeboten statt mit Drohungen (Vertrauen +).
//
// Rein und deterministisch, kein Zufall. Vor Kapitel 3 gibt es state.rivalsK3 nicht – dann kommt
// derselbe Zustand zurück (Kapitel 1 und 2 rechnen hier nichts). Zahlen: balance.yaml → rivalsK3.

import { BalanceError, type Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { changeRelation } from './diplomacyCore';
import type { GameState } from './game';

/** Merkzeichen, die dieses System setzt (Inhaltsprüfung: Ereignisse dürfen sie lesen). */
export const RIVALS_K3_MARKS = { bullardBroke: 'k3_bullard_verschuldet' } as const;
export const RIVALS_K3_SIM_MARKS: readonly string[] = Object.values(RIVALS_K3_MARKS);

export interface RivalsK3State {
  /** Bullards Schulden in $. */
  bullardDebt: number;
  /** So viele Harlan-Aktien hat Thorne in Kapitel 3 schon über Strohmänner gekauft. */
  thorneBought: number;
  /** Faktor, um den Thorne den Kurs seiner Golfbahn aufgebläht hat (1 = nicht). */
  thorneBubble: number;
  /** Tankstellen, die Margaret in Kapitel 3 neben Harlans gebaut hat. */
  margaretBuilt: number;
}

export interface RivalsK3Balance {
  margaret: { startAwareness: number; push: number; buildEvery: number };
  thorne: { stakePerRound: number; grudgeFrom: number; bubble: number; crashDrop: number; stock: string };
  bullard: { startDebt: number; borrowBelow: number; borrow: number; rate: number; distressAt: number; distressTrust: number };
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(raw: unknown, path: string, min = 0, max = Infinity): number {
  const v = wert(raw, `rivalsK3.${path}`);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "rivalsK3.${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "rivalsK3.${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

/** Liest den Block rivalsK3 aus balance.yaml. */
export function parseRivalsK3Balance(raw: unknown): RivalsK3Balance {
  if (!wert(raw, 'rivalsK3')) throw new BalanceError('balance.yaml: Block "rivalsK3" fehlt');
  const stock = wert(raw, 'rivalsK3.thorne.stock');
  if (typeof stock !== 'string' || stock === '') throw new BalanceError('balance.yaml: "rivalsK3.thorne.stock" muss eine Aktie aus exchange.stocks nennen');
  return {
    margaret: { startAwareness: zahl(raw, 'margaret.startAwareness', 0, 100), push: zahl(raw, 'margaret.push', 0, 100), buildEvery: Math.max(1, Math.round(zahl(raw, 'margaret.buildEvery', 1))) },
    thorne: { stakePerRound: zahl(raw, 'thorne.stakePerRound', 0, 10), grudgeFrom: zahl(raw, 'thorne.grudgeFrom', 0, 100), bubble: zahl(raw, 'thorne.bubble', 0, 1), crashDrop: zahl(raw, 'thorne.crashDrop', 0, 1), stock },
    bullard: {
      startDebt: zahl(raw, 'bullard.startDebt'),
      borrowBelow: zahl(raw, 'bullard.borrowBelow'),
      borrow: zahl(raw, 'bullard.borrow'),
      rate: zahl(raw, 'bullard.rate', 0, 1),
      distressAt: zahl(raw, 'bullard.distressAt'),
      distressTrust: zahl(raw, 'bullard.distressTrust', 0, 100),
    },
  };
}

function rund(v: number): number {
  return Math.round(v * 100) / 100;
}

function mitLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

/**
 * Kapitelstart Kapitel 3 (nach Zeitsprung II): Ausgangslage der Rivalen. Margarets Marke ist überall
 * bekannter, Bullard hat Schulden. Mehrfach aufrufen schadet nicht; vor Kapitel 3 unverändert.
 */
export function startRivalsK3(state: GameState, balance: Balance): GameState {
  if (chapterOf(state) < 3 || state.rivalsK3) return state;
  const b = balance.rivalsK3;
  let out: GameState = { ...state, rivalsK3: { bullardDebt: b.bullard.startDebt, thorneBought: 0, thorneBubble: 1, margaretBuilt: 0 } };
  if (out.brand) {
    const regions = Object.fromEntries(
      Object.entries(out.brand.regions).map(([id, r]) => [id, { ...r, crane: { ...r.crane, awareness: Math.min(100, r.crane.awareness + b.margaret.startAwareness) } }]),
    );
    out = { ...out, brand: { ...out.brand, regions } };
  }
  return mitLog(out, 'Margaret Crane führt jetzt Crane Eastern – mit Tankstellen von Cordova bis an die Ostküste. Bullard bohrt auf Pump, und Thorne lässt seine Aktien steigen.');
}

/** Margaret Crane: wirbt, wo Harlan Tankstellen hat, und baut neben Harlans stärkster Region. */
function margaret(state: GameState, balance: Balance, k: RivalsK3State): [GameState, RivalsK3State] {
  const brand = state.brand;
  if (!brand?.founded) return [state, k];
  const b = balance.rivalsK3.margaret;
  const regions = { ...brand.regions };
  let staerkste: string | null = null;
  for (const [id, r] of Object.entries(regions)) {
    if (r.stations <= 0) continue;
    regions[id] = { ...r, crane: { ...r.crane, awareness: Math.min(100, rund(r.crane.awareness + b.push)) } };
    if (staerkste === null || (r.last?.share ?? 0) > (regions[staerkste].last?.share ?? 0)) staerkste = id;
  }
  let out: GameState = { ...state, brand: { ...brand, regions } };
  let neu = k;
  const runde = state.round - state.chapterStart + 1;
  if (staerkste && runde % b.buildEvery === 0) {
    const r = regions[staerkste];
    out = { ...out, brand: { ...out.brand!, regions: { ...regions, [staerkste]: { ...r, crane: { ...r.crane, stations: r.crane.stations + 1 } } } } };
    neu = { ...neu, margaretBuilt: neu.margaretBuilt + 1 };
    out = mitLog(out, 'Margaret Crane baut eine neue Tankstelle von Crane Eastern – gegenüber von Harlans bester.');
  }
  return [out, neu];
}

/** Thorne: kauft über Strohmänner Harlan-Aktien und bläht den Kurs seiner Golfbahn auf. */
function thorne(state: GameState, balance: Balance, k: RivalsK3State): [GameState, RivalsK3State] {
  const b = balance.rivalsK3.thorne;
  let out = state;
  let neu = k;
  const st = out.stocks;
  if (st && st.public && st.ousted === 0 && st.float > 0) {
    const total = st.jacob + st.float + st.blocks.reduce((x, bl) => x + bl.shares, 0);
    const groll = out.diplomacy?.relations?.thorne?.grudge ?? 0;
    const menge = Math.min(st.float, Math.round(((total * b.stakePerRound) / 100) * (groll >= b.grudgeFrom ? 2 : 1)));
    if (menge > 0) {
      const block = { shares: menge, straw: (state.round * 11 + st.blocks.length) % 100, since: state.round };
      out = { ...out, stocks: { ...st, float: st.float - menge, blocks: [...st.blocks, block] } };
      neu = { ...neu, thorneBought: neu.thorneBought + menge };
    }
  }
  const ex = out.exchange;
  const kurs = ex?.prices[b.stock];
  if (ex && kurs !== undefined) {
    const verlauf = ex.history[b.stock] ?? [];
    let neuKurs: number;
    let blase: number;
    if (ex.events.includes('crash') && neu.thorneBubble > 1) {
      neuKurs = Math.max(balance.exchange.minPrice, rund(kurs * b.crashDrop));
      blase = 1;
      out = mitLog(out, 'Die Aktie der Thorne-Golfbahn bricht ein – Thornes Kurspflege hält dem Crash nicht stand.');
    } else if (ex.crash > 0) {
      neuKurs = kurs;
      blase = neu.thorneBubble;
    } else {
      neuKurs = rund(kurs * (1 + b.bubble));
      blase = rund(neu.thorneBubble * (1 + b.bubble));
    }
    const history = { ...ex.history, [b.stock]: verlauf.length > 0 ? [...verlauf.slice(0, -1), neuKurs] : [neuKurs] };
    out = { ...out, exchange: { ...ex, prices: { ...ex.prices, [b.stock]: neuKurs }, history } };
    neu = { ...neu, thorneBubble: blase };
  }
  return [out, neu];
}

/** Bullard: leiht, wenn die Kasse knapp wird, zahlt Zinsen; ab distressAt ist er am Ende. */
function bullard(state: GameState, balance: Balance, k: RivalsK3State): [GameState, RivalsK3State] {
  const b = balance.rivalsK3.bullard;
  let cash = state.rival.cash;
  let schulden = k.bullardDebt;
  if (cash < b.borrowBelow) {
    cash += b.borrow;
    schulden += b.borrow;
  }
  const zins = rund(schulden * b.rate);
  if (cash >= zins) cash -= zins;
  else schulden += zins - Math.max(0, cash);
  cash = Math.max(0, cash);
  let out: GameState = { ...state, rival: { ...state.rival, cash: rund(cash) } };
  const mark = RIVALS_K3_MARKS.bullardBroke;
  if (schulden >= b.distressAt && out.events.marks[mark] === undefined) {
    out = { ...out, events: { ...out.events, marks: { ...out.events.marks, [mark]: out.round } } };
    if (out.diplomacy) out = { ...out, diplomacy: changeRelation(out.diplomacy, 'bullard', { trust: b.distressTrust, grudge: 0 }) };
    out = mitLog(out, 'Bullard steht bei den Banken in der Kreide. Er kommt jetzt mit Angeboten statt mit Drohungen.');
  }
  return [out, { ...k, bullardDebt: rund(schulden) }];
}

/** Rundenende (4.19 Andockpunkt in endRound, nach Kapitel 3 und vor dem Transport). Vor Kapitel 3 unverändert. */
export function settleRivalsK3(state: GameState, balance: Balance): GameState {
  if (state.finished || !state.rivalsK3 || chapterOf(state) < 3) return state;
  let k = state.rivalsK3;
  let out = state;
  [out, k] = margaret(out, balance, k);
  [out, k] = thorne(out, balance, k);
  [out, k] = bullard(out, balance, k);
  return { ...out, rivalsK3: k };
}

/** Prüft state.rivalsK3 beim Laden (darf fehlen). */
export function validRivalsK3(v: unknown): boolean {
  if (v === undefined) return true;
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return ['bullardDebt', 'thorneBought', 'thorneBubble', 'margaretBuilt'].every((key) => typeof o[key] === 'number' && Number.isFinite(o[key] as number));
}
