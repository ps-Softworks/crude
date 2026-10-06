// Weitere Großhändler (0.4.20+43, Nachtplan Teil 2): Neben Crane und dem Händler in Port Ellis kaufen
// weitere Abnehmer Rohöl – jeder an einem anderen Ort, mit eigenem Aufschlag, eigener Menge je Runde und
// eigener Zusatzfracht (weiter Weg). Jacob muss sie erst kennen: Jeder Abnehmer gehört zu einer Stelle im
// Adressbuch (contact, src/sim/network.ts). Verkäufe an sie ärgern Crane wie Verkäufe an den Händler (Groll).
//
// Preis je Barrel:   (Posted Price + premium) × Beziehungsfaktor der Stelle   – oder der Vertragspreis
// Menge je Runde:    capacity[Kapitel]                                         – oder die Vertragsmenge
// Fracht:            Tarif des Wegs + freight je Barrel
// Liefervertrag:     Karte vertrag_<id> bei der Stelle: Menge je Runde zum heutigen Preis × (1 + premium),
//                    rounds Runden; was fehlt, kostet penalty je Barrel und Beziehung.
// Ausfall (Export):  Mit defaultChance je Runde zahlt der Abnehmer die Lieferungen der Runde nicht.
//
// Rein und deterministisch; Zufall nur für den Ausfall (Seed + Abnehmer + Runde).
import type { Balance } from './balance';
import type { PlanHandler } from './planHandler';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { isKnown, noteContact, relationFactor, shiftRelation } from './network';
import { Rng, seedFromString } from './rng';

export interface BuyerContractBalance {
  /** Mengen je Runde zur Wahl. */
  sizes: number[];
  rounds: number;
  /** Festpreis = heutiger Preis × (1 + premium). */
  premium: number;
  /** $ je fehlendem Barrel. */
  penalty: number;
}

export interface BuyerBalance {
  /** Stelle im Adressbuch (network.contacts). */
  contact: string;
  /** Aufschlag auf den Posted Price in $ je Barrel. */
  premium: number;
  /** Menge je Runde je Kapitel (Index 0 = Kapitel 1; 0 = kauft in diesem Kapitel nicht). */
  capacity: number[];
  /** Zusatzfracht in $ je Barrel (weiter Weg). */
  freight: number;
  contract: BuyerContractBalance;
  /** Chance je Runde, dass er die Lieferungen der Runde nicht bezahlt (Export). */
  defaultChance: number;
}

export interface BuyerContract {
  qty: number;
  price: number;
  from: number;
  until: number;
}

export interface BuyersState {
  /** Diese Runde an jeden Abnehmer verkaufte Barrel und Erlös (für Ausfall und Vertrag). */
  sold: Record<string, { barrels: number; value: number }>;
  contracts: Record<string, BuyerContract>;
}

/** Abnehmer mit eigener Vertragskarte – die Kennungen sind fest, ihre Zahlen stehen in balance.yaml buyers. */
export const EXTRA_BUYERS = ['cordova', 'okara', 'hallstead', 'eastern', 'aldmark'] as const;
export type ExtraBuyer = (typeof EXTRA_BUYERS)[number];

export function isExtraBuyer(id: string): id is ExtraBuyer {
  return (EXTRA_BUYERS as readonly string[]).includes(id);
}

// --- balance.yaml ---------------------------------------------------------------------

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function zahl(o: unknown, path: string, wo: string, min = 0, max = Infinity): number {
  const v = path.split('.').reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), o);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new BalanceError(`balance.yaml: "${wo}.${path}" fehlt oder liegt nicht zwischen ${min} und ${max}`);
  return v;
}

function zahlen(o: unknown, path: string, wo: string): number[] {
  const v = path.split('.').reduce<unknown>((x, k) => (obj(x) ? x[k] : undefined), o);
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) {
    throw new BalanceError(`balance.yaml: "${wo}.${path}" muss eine Liste nicht-negativer Zahlen sein`);
  }
  return v as number[];
}

export function parseBuyersBalance(raw: unknown): Record<ExtraBuyer, BuyerBalance> {
  const block = obj(raw) ? raw.buyers : undefined;
  if (!obj(block)) throw new BalanceError('balance.yaml: "buyers" fehlt');
  const falsch = Object.keys(block).filter((k) => !isExtraBuyer(k));
  if (falsch.length > 0) throw new BalanceError(`balance.yaml: buyers: unbekannt ${falsch.join(', ')}. Erlaubt: ${EXTRA_BUYERS.join(', ')}`);
  const out: Partial<Record<ExtraBuyer, BuyerBalance>> = {};
  for (const id of EXTRA_BUYERS) {
    const b = block[id];
    const wo = `buyers.${id}`;
    if (!obj(b)) throw new BalanceError(`balance.yaml: "${wo}" fehlt`);
    if (typeof b.contact !== 'string') throw new BalanceError(`balance.yaml: "${wo}.contact" fehlt`);
    out[id] = {
      contact: b.contact,
      premium: zahl(b, 'premium', wo, -1, 5),
      capacity: zahlen(b, 'capacity', wo),
      freight: zahl(b, 'freight', wo, 0, 5),
      contract: {
        sizes: zahlen(b, 'contract.sizes', wo),
        rounds: zahl(b, 'contract.rounds', wo, 1),
        premium: zahl(b, 'contract.premium', wo, -1, 1),
        penalty: zahl(b, 'contract.penalty', wo, 0, 10),
      },
      defaultChance: b.defaultChance === undefined ? 0 : zahl(b, 'defaultChance', wo, 0, 1),
    };
  }
  return out as Record<ExtraBuyer, BuyerBalance>;
}

// --- Regeln -------------------------------------------------------------------------------

type Lage = Partial<Pick<GameState, 'network' | 'chapter' | 'round' | 'buyers'>> & Pick<GameState, 'postedPrice'>;

export function emptyBuyers(): BuyersState {
  return { sold: {}, contracts: {} };
}

function cents(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Menge je Runde im aktuellen Kapitel (ohne Vertrag). */
export function baseCapacity(state: Pick<Lage, 'chapter'>, balance: Pick<Balance, 'buyers'>, id: ExtraBuyer): number {
  const c = balance.buyers[id].capacity;
  return c[Math.min(c.length, Math.max(1, state.chapter ?? 1)) - 1];
}

/** Laufender Vertrag mit dem Abnehmer in dieser Runde – oder null. */
export function buyerContract(state: Pick<Lage, 'buyers' | 'round'>, id: string): BuyerContract | null {
  const c = state.buyers?.contracts[id];
  return c && state.round !== undefined && state.round >= c.from && state.round <= c.until ? c : null;
}

/** Kauft dieser Abnehmer gerade (Stelle bekannt, Kapitel passt oder Vertrag läuft)? */
export function buyerOpen(state: Lage, balance: Pick<Balance, 'buyers'>, id: ExtraBuyer): boolean {
  if (!isKnown(state, balance.buyers[id].contact)) return false;
  return baseCapacity(state, balance, id) > 0 || buyerContract(state, id) !== null;
}

/** Die zusätzlichen Abnehmer, an die Jacob gerade verkaufen kann. */
export function openBuyers(state: Lage, balance: Pick<Balance, 'buyers'>): ExtraBuyer[] {
  return EXTRA_BUYERS.filter((id) => buyerOpen(state, balance, id));
}

/** Preis je Barrel beim Abnehmer (Vertrag oder Posted Price + Aufschlag, × Beziehung). */
export function extraBuyerPrice(state: Lage, balance: Pick<Balance, 'buyers' | 'network'>, id: ExtraBuyer): number {
  const v = buyerContract(state, id);
  if (v) return v.price;
  const b = balance.buyers[id];
  return cents((state.postedPrice + b.premium) * relationFactor(state, balance, b.contact));
}

/** Wie viel er in dieser Runde noch nimmt. */
export function extraBuyerCapacityLeft(state: Lage, balance: Pick<Balance, 'buyers'>, id: ExtraBuyer): number {
  if (!isKnown(state, balance.buyers[id].contact)) return 0;
  const v = buyerContract(state, id);
  const menge = Math.max(v ? v.qty : 0, baseCapacity(state, balance, id));
  return Math.max(0, menge - (state.buyers?.sold[id]?.barrels ?? 0));
}

/** Nach einem Verkauf: Menge und Erlös merken; das erste Geschäft der Runde pflegt die Beziehung. */
export function recordBuyerSale(state: GameState, balance: Balance, id: ExtraBuyer, barrels: number, value: number): GameState {
  const b = state.buyers ?? emptyBuyers();
  const vorher = b.sold[id];
  const s: GameState = { ...state, buyers: { ...b, sold: { ...b.sold, [id]: { barrels: (vorher?.barrels ?? 0) + barrels, value: cents((vorher?.value ?? 0) + value) } } } };
  return vorher ? s : noteContact(s, balance, balance.buyers[id].contact);
}

export type BuyerResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Vertrag schließen (Karte vertrag_<id>): Menge je Runde, Festpreis heute × (1 + premium). */
export function signBuyerContract(state: GameState, balance: Balance, id: ExtraBuyer, qty: number): BuyerResult {
  const b = balance.buyers[id];
  if (!isKnown(state, b.contact)) return { ok: false, reason: 'Diesen Abnehmer kennt Jacob nicht.' };
  if (buyerContract(state, id)) return { ok: false, reason: 'Es läuft schon ein Vertrag.' };
  if (!b.contract.sizes.includes(qty)) return { ok: false, reason: 'Diese Menge bietet er nicht an.' };
  const price = cents(extraBuyerPrice(state, balance, id) * (1 + b.contract.premium));
  const c: BuyerContract = { qty, price, from: state.round, until: state.round + b.contract.rounds - 1 };
  const bs = state.buyers ?? emptyBuyers();
  return {
    ok: true,
    state: {
      ...state,
      buyers: { ...bs, contracts: { ...bs.contracts, [id]: c } },
      log: [...state.log, `${formatDate(state)}: Liefervertrag – ${qty.toLocaleString('de-DE')} bbl je Runde zu ${price.toFixed(2).replace('.', ',')} $ bis Runde ${c.until}.`],
    },
  };
}

/** Möglichkeiten der Vertragskarte. */
export function contractOptions(state: GameState, balance: Balance, id: ExtraBuyer) {
  const b = balance.buyers[id];
  const preis = cents(extraBuyerPrice(state, balance, id) * (1 + b.contract.premium));
  const laeuft = buyerContract(state, id);
  return b.contract.sizes.map((n) => ({
    id: String(n),
    label: `${n.toLocaleString('de-DE')} bbl je Runde · ${preis.toFixed(2).replace('.', ',')} $ fest · ${b.contract.rounds} Runden`,
    reason: laeuft ? 'Es läuft schon ein Vertrag.' : null,
  }));
}

/**
 * Rundenende: Ausfall beim Export, fehlende Vertragsmenge kostet Strafe und Beziehung, abgelaufene
 * Verträge fallen weg; die Verkaufsliste der Runde wird geleert.
 */
export function settleBuyers(state: GameState, balance: Balance): GameState {
  const b = state.buyers;
  if (!b) return state;
  let s = state;
  const log: string[] = [];
  const datum = formatDate(state);
  for (const id of EXTRA_BUYERS) {
    const bal = balance.buyers[id];
    const verkauft = b.sold[id];
    if (verkauft && verkauft.value > 0 && bal.defaultChance > 0) {
      const rng = new Rng(seedFromString(`${state.seed}:abnehmer:${id}:${state.round}`));
      if (rng.float() < bal.defaultChance) {
        s = { ...s, cash: cents(s.cash - verkauft.value) };
        log.push(`${datum}: Die Zahlung für ${verkauft.barrels.toLocaleString('de-DE')} bbl bleibt aus – ${verkauft.value.toLocaleString('de-DE')} $ verloren.`);
      }
    }
    const v = buyerContract(state, id);
    if (v) {
      const fehlt = Math.max(0, v.qty - (verkauft?.barrels ?? 0));
      if (fehlt > 0) {
        const strafe = cents(fehlt * bal.contract.penalty);
        s = shiftRelation({ ...s, cash: cents(s.cash - strafe) }, bal.contact, -Math.round(balance.network.relation.breach / 2));
        log.push(`${datum}: Liefervertrag verfehlt – ${fehlt.toLocaleString('de-DE')} bbl fehlen, ${strafe.toLocaleString('de-DE')} $ Vertragsstrafe.`);
      }
    }
  }
  const contracts: Record<string, BuyerContract> = Object.fromEntries(Object.entries(b.contracts).filter(([, c]) => c.until > state.round));
  return { ...s, buyers: { sold: {}, contracts }, log: log.length > 0 ? [...s.log, ...log] : s.log };
}

/** Im Kapitel 2/3 von Bedeutung: Kapitel, ab dem der Abnehmer kauft (für Texte). */
export function buyerFromChapter(balance: Pick<Balance, 'buyers'>, id: ExtraBuyer): number {
  const i = balance.buyers[id].capacity.findIndex((c) => c > 0);
  return i < 0 ? 99 : i + 1;
}


// --- Karten: Liefervertrag je Abnehmer (vertrag_<id>) --------------------------------------


function vertragHandler(id: ExtraBuyer): PlanHandler {
  return {
    visible(state, balance) {
      return buyerOpen(state, balance, id) || buyerContract(state, id) !== null;
    },
    lock(state) {
      return buyerContract(state, id) ? 'Es läuft schon ein Vertrag.' : null;
    },
    options(state, balance) {
      return contractOptions(state, balance, id);
    },
    detail(_state, balance) {
      const b = balance.buyers[id];
      return `Fester Preis über ${b.contract.rounds} Runden – fehlt Öl, kostet jedes Barrel ${b.contract.penalty.toFixed(2).replace('.', ',')} $ Strafe.${b.freight > 0 ? ` Weiter Weg: ${b.freight.toFixed(2).replace('.', ',')} $ Zusatzfracht je Barrel.` : ''}`;
    },
    apply(state, balance, target) {
      const r = signBuyerContract(state, balance, id, Number(target ?? balance.buyers[id].contract.sizes[0]));
      return r.ok ? r.state : { ...state, log: [...state.log, `${formatDate(state)}: ${r.reason}`] };
    },
  };
}

/** Handler der Vertragskarten, Name = vertrag_<id>. */
export const BUYER_HANDLERS: Record<string, PlanHandler> = Object.fromEntries(EXTRA_BUYERS.map((id) => [`vertrag_${id}`, vertragHandler(id)]));
