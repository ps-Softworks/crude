// Transport und Verkauf (GDD §6): Das Öl aus dem Tank geht über einen von vier
// Wegen zum Käufer – gemietetes Fuhrwerk, Thornes Bahn, eigene Fuhrwerke oder die
// eigene Pipeline (0.2.15+2, Anlagen in logistics.ts). Käufer ist der Crane Trust
// (Posted Price minus Abschlag) oder der unabhängige Händler in Port Ellis
// (Aufschlag, begrenzte Menge – Crane merkt es sich). Die Bahn gehört Augustus
// Thorne: Wer sie nutzt, gibt ihm die Gelegenheit, den Tarif zu erhöhen; Verträge
// mit ihm (Exklusiv, Mengenrabatt) ändern Tarif und Pflichten.

import type { Balance, Buyer, TransportMode } from './balance';
import { afterSale, bulkExtra, saleAdjust } from './deals';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { LOGISTICS_MARKS, pipelineWorks, teamCapacity, teamsIdle, withMark } from './logistics';
import { Rng } from './rng';
import { timedEffect } from './events';
// 4.7 Andockpunkt: Fernleitungen geben den Wegen „Pipeline“ (Hafen) und „Bahn“ (Bahnhof) Kapazität dazu.
import { bigPipelineCapacity, harborTrunkRunning } from './bigPipeline';
// Termine als Hauptwerkzeug, Etappe 2: Liefervertrag (Händler), Brennans Fuhrleute, Fremdöl der Transportgemeinschaft.
import { activeContract } from './pricing';
import { brennanActive, poolDiscount, poolPipelineShare } from './freight';
// Etappe 3: billigerer Exklusivvertrag aus dem Brief.
import { cheapExclusive } from './letters';
import {
  exclusiveActive,
  hikeChance as thorneHikeChance,
  jacobPrice,
  railFrozen,
  volumeDealActive,
  volumeObligation,
} from './trust';

/** Auf ganze Cent runden. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dollars(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Was eine Verkaufsrechnung vom Zustand braucht. */
type Verkaufslage = Pick<GameState, 'railTariff' | 'postedPrice' | 'round'> & Partial<Pick<GameState, 'events' | 'logistics' | 'pricing' | 'freight' | 'ventures' | 'wildcatters' | 'rival' | 'deals'>>;

/** Strafe je Barrel, die Thorne während eines Exklusivvertrags für andere Wege verlangt. */
export function exclusiveSurcharge(state: Verkaufslage, balance: Balance, mode: TransportMode): number {
  if (mode === 'rail' || !exclusiveActive(state, balance)) return 0;
  // Etappe 3: Brief „Exklusiv jetzt billiger“ – derselbe Vertrag mit kleinerer Strafe.
  return cheapExclusive(state) ? balance.letters.cheapExclusivePenalty : balance.transport.thorne.exclusivePenalty;
}

/**
 * Fracht in $ je Barrel: Fuhrwerk, eigene Fuhrwerke und Pipeline fest, Bahn nach
 * Thornes aktuellem Tarif (mit Mengenrabatt und Rabatt der Transportgemeinschaft weniger). Während eines
 * Exklusivvertrags kommt auf jeden anderen Weg Thornes Strafe dazu.
 */
export function tariff(state: Verkaufslage, balance: Balance, mode: TransportMode): number {
  const t = balance.transport;
  const basis =
    mode === 'rail'
      ? Math.max(0, state.railTariff - (volumeDealActive(state, balance) ? t.thorne.volumeDiscount : 0) - poolDiscount(state, balance))
      : mode === 'wagon' && brennanActive(state)
        ? balance.freight.brennan.costPerBarrel
        : t[mode].costPerBarrel;
  return cents(basis + exclusiveSurcharge(state, balance, mode));
}

/** Höchstmenge je Runde: eigene Fuhrwerke je Gespann (0, wenn sie stillstehen), Pipeline nur, wenn sie läuft. */
export function modeCapacity(state: Partial<Pick<GameState, 'logistics' | 'round' | 'bigPipelines' | 'events' | 'freight'>>, balance: Balance, mode: TransportMode): number {
  const t = balance.transport;
  const lg = state.logistics;
  // 4.12: befristete Systemwirkung pipelineThroughput – mehr (weniger) Durchsatz in den eigenen Leitungen.
  const durchsatz = state.round !== undefined && state.events ? Math.max(0, 1 + timedEffect({ round: state.round, events: state.events }, 'pipelineThroughput')) : 1;
  switch (mode) {
    case 'wagon':
      // Etappe 2: Brennans Fuhrleute ersetzen die Mietfuhrwerke, solange sein Vertrag läuft.
      return state.round !== undefined && brennanActive({ round: state.round, freight: state.freight }) ? balance.freight.brennan.capacity : t.wagon.capacity;
    case 'rail':
      // 4.7 Andockpunkt: plus Fernleitungen zum Bahnhof – ihr Öl fährt mit Thornes Bahn, zu seinem Tarif.
      return t.rail.capacity + Math.round(bigPipelineCapacity(state, balance, 'rail') * durchsatz);
    case 'teams':
      // 0.4.20+9: Tanklaster (Forschung, ab Kapitel 2) – jedes Gespann schafft mehr.
      return !lg || teamsIdle({ round: state.round ?? 0, logistics: lg }) ? 0 : lg.teams * teamCapacity(state, balance);
    case 'pipeline':
      // 4.7 Andockpunkt: plus laufende Fernleitungen zum Hafen (Kapitel 2+; in Kapitel 1 immer 0).
      // Etappe 2: Mit gemeinsamer Pipeline der Transportgemeinschaft belegt deren Öl einen Teil.
      return Math.round(((lg && pipelineWorks({ logistics: lg }) ? Math.round(t.pipeline.capacity * (1 - poolPipelineShare(state, balance))) : 0) + bigPipelineCapacity(state, balance, 'pipeline')) * durchsatz);
  }
}

/** Wie viele Barrel dieses Transportmittel in dieser Runde noch schafft. */
export function capacityLeft(state: Pick<GameState, 'shipped'> & Partial<Pick<GameState, 'logistics' | 'round' | 'bigPipelines' | 'freight'>>, balance: Balance, mode: TransportMode): number {
  return Math.max(0, modeCapacity(state, balance, mode) - (state.shipped[mode] ?? 0));
}

/** Warum ein Weg gar nicht geht (keine Gespanne, keine Pipeline), oder null. */
export function modeUnavailable(state: Pick<GameState, 'round' | 'logistics'> & Partial<Pick<GameState, 'bigPipelines'>>, mode: TransportMode): string | null {
  const lg = state.logistics;
  if (mode === 'teams') {
    if (lg.teams === 0) return 'Jacob hat keine eigenen Fuhrwerke.';
    if (teamsIdle(state)) return 'Die eigenen Fuhrwerke stehen still.';
  }
  // 4.7 Andockpunkt: Eine laufende Fernleitung zum Hafen reicht für den Weg „Pipeline“.
  if (mode === 'pipeline' && !harborTrunkRunning(state)) {
    if (lg.pipeline === 'damaged') return 'Die Pipeline wird repariert.';
    if (lg.pipeline !== 'ready') return 'Es gibt noch keine Pipeline.';
  }
  return null;
}

/**
 * Preis je Barrel beim Käufer: Crane zahlt Posted Price minus Abschlag/Groll, der Händler Posted
 * Price plus Aufschlag – mit Liefervertrag (Etappe 2) den festen Vertragspreis.
 */
export function buyerPrice(state: Verkaufslage, balance: Balance, buyer: Buyer = 'crane'): number {
  if (buyer === 'crane') return jacobPrice(state, balance);
  const vertrag = activeContract(state, 'haendler');
  return vertrag ? vertrag.price : cents(state.postedPrice + balance.transport.trader.premium);
}

/** Wie viel der Käufer in dieser Runde noch nimmt (Crane: alles; Händler mit Liefervertrag: die Vertragsmenge). */
export function buyerCapacityLeft(state: Partial<Pick<GameState, 'logistics' | 'round' | 'pricing' | 'deals'>>, balance: Balance, buyer: Buyer): number {
  if (buyer === 'crane') return Infinity;
  const vertrag = state.round !== undefined ? activeContract({ round: state.round, pricing: state.pricing }, 'haendler') : null;
  // 0.4.20+31: Großabnahme – in dieser Runde nimmt der Händler mehr (deals.ts).
  return Math.max(0, (vertrag ? vertrag.qty : balance.transport.trader.capacity) + bulkExtra(state, balance) - (state.logistics?.traderSold ?? 0));
}

/** Was je Barrel nach Fracht übrig bleibt (vor Förderzins). */
export function netPrice(state: Verkaufslage, balance: Balance, mode: TransportMode, buyer: Buyer = 'crane'): number {
  return cents(buyerPrice(state, balance, buyer) - tariff(state, balance, mode));
}

export interface SaleQuote {
  barrels: number;
  /** Erlös beim Käufer. */
  gross: number;
  /** Fracht (mit Thornes Strafe während eines Exklusivvertrags). */
  transportCost: number;
  /** Anteil der Landbesitzer (Förderzins) in $. */
  royalty: number;
  /** Was in Jacobs Kasse landet. */
  net: number;
}

/** Barrel Förderzins-Öl, die in einer Lieferung stecken (anteilig am Tank). */
function royaltyBarrels(state: Pick<GameState, 'oilStock' | 'royaltyOil'>, barrels: number): number {
  return state.oilStock > 0 ? (barrels * state.royaltyOil) / state.oilStock : 0;
}

/** Rechnet einen Verkauf durch, ohne etwas zu ändern. */
export function quoteSale(
  state: Verkaufslage & Pick<GameState, 'oilStock' | 'royaltyOil'>,
  balance: Balance,
  mode: TransportMode,
  barrels: number,
  buyer: Buyer = 'crane',
): SaleQuote {
  const price = buyerPrice(state, balance, buyer);
  const fracht = tariff(state, balance, mode);
  // 0.4.20+31: Frachtkontingent (schon bezahlte Bahnfracht) und Cranes Vorschuss (schon bezahltes Öl) – deals.ts.
  const deal = saleAdjust(state, mode, buyer, barrels, price, fracht);
  const gross = cents(barrels * price - deal.prepaid);
  const transportCost = cents(barrels * fracht - deal.freight);
  const royalty = cents(royaltyBarrels(state, barrels) * price);
  return { barrels, gross, transportCost, royalty, net: cents(gross - transportCost - royalty) };
}

export type SaleResult = { ok: true; state: GameState; quote: SaleQuote } | { ok: false; reason: string };

const PER: Record<TransportMode, string> = {
  wagon: 'per Fuhrwerk',
  rail: 'per Bahn',
  teams: 'mit eigenen Fuhrwerken',
  pipeline: 'durch die Pipeline',
};

/** Verkauft Öl aus dem Tank über den gewählten Weg an den gewählten Käufer. */
export function sellOil(
  state: GameState,
  balance: Balance,
  mode: TransportMode,
  barrels: number,
  buyer: Buyer = 'crane',
): SaleResult {
  const label = balance.transport[mode].label;
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  if (!Number.isInteger(barrels) || barrels <= 0) {
    return { ok: false, reason: 'Die Menge muss eine ganze Zahl über 0 sein.' };
  }
  if (barrels > Math.floor(state.oilStock)) {
    return { ok: false, reason: `So viel Öl ist nicht im Tank (${Math.floor(state.oilStock)} Barrel).` };
  }
  const fehlt = modeUnavailable(state, mode);
  if (fehlt) return { ok: false, reason: fehlt };
  const frei = capacityLeft(state, balance, mode);
  if (barrels > frei) {
    return { ok: false, reason: `${label}: in dieser Runde nur noch ${frei} Barrel frei.` };
  }
  const nimmt = buyerCapacityLeft(state, balance, buyer);
  if (barrels > nimmt) {
    return { ok: false, reason: `Der Händler nimmt in dieser Runde nur noch ${nimmt} Barrel.` };
  }
  const quote = quoteSale(state, balance, mode, barrels, buyer);
  const an = buyer === 'trader' ? ' an den Händler' : '';
  const strafe = exclusiveSurcharge(state, balance, mode) > 0 ? ' (mit Thornes Strafe)' : '';
  const logistics =
    buyer === 'trader'
      ? { ...state.logistics, traderSold: state.logistics.traderSold + barrels, traderLast: state.round }
      : state.logistics;
  const deal = saleAdjust(state, mode, buyer, barrels, buyerPrice(state, balance, buyer), tariff(state, balance, mode));
  const out: GameState = {
    ...afterSale(state, deal.quota, deal.owed),
    oilStock: state.oilStock - barrels,
    royaltyOil: Math.max(0, state.royaltyOil - royaltyBarrels(state, barrels)),
    cash: cents(state.cash + quote.net),
    shipped: { ...state.shipped, [mode]: (state.shipped[mode] ?? 0) + barrels },
    logistics,
    log: [
      ...state.log,
      `${formatDate(state)}: ${barrels.toLocaleString('de-DE')} Barrel ${PER[mode]}${an} verkauft${strafe} – ${dollars(quote.net)} $ nach Fracht und Förderzins.`,
    ],
  };
  return { ok: true, quote, state: buyer === 'trader' ? withMark(out, LOGISTICS_MARKS.trader) : out };
}

/** Leere Frachtliste für eine neue Runde. */
export function noShipments(): Record<TransportMode, number> {
  return { wagon: 0, rail: 0, teams: 0, pipeline: 0 };
}

/**
 * Rundenende: Hat Jacob per Bahn verschickt, erhöht Thorne vielleicht den Tarif
 * (bis höchstens maxTariff). Ohne Bahnfracht wird kein Zufall gezogen.
 * 2.8: Mit Frachtvertrag erhöht Thorne nicht (der Zufall wird trotzdem gezogen,
 * damit der Weltzufall mit und ohne Vertrag gleich bleibt); nach einer Absage
 * erhöht er öfter.
 * 0.2.15+2: Mit Mengenrabatt kostet jeder Barrel unter der Mindestabnahme
 * shortfallPenalty. Danach sind alle Wege und der Händler wieder frei.
 */
export function advanceTransport(input: GameState, balance: Balance): GameState {
  const { hikeStep, maxTariff, shortfallPenalty } = balance.transport.thorne;
  let { railTariff, rng: rngState, log, cash } = input;
  if (input.shipped.rail > 0 && railTariff < maxTariff) {
    const rng = new Rng(rngState);
    const roll = rng.float();
    if (!railFrozen(input, balance) && roll < thorneHikeChance(input, balance)) {
      railTariff = cents(Math.min(maxTariff, railTariff + hikeStep));
      log = [...log, `${formatDate(input)}: Thorne erhöht den Bahntarif auf ${dollars(railTariff)} $ je Barrel.`];
    }
    rngState = rng.state;
  }
  const pflicht = volumeObligation(input, balance);
  const fehlt = Math.max(0, pflicht - input.shipped.rail);
  if (fehlt > 0) {
    const strafe = cents(fehlt * shortfallPenalty);
    cash = cents(cash - strafe);
    log = [
      ...log,
      `${formatDate(input)}: Mindestabnahme verfehlt – ${fehlt.toLocaleString('de-DE')} Barrel zu wenig per Bahn. Thorne verlangt ${dollars(strafe)} $ Strafe.`,
    ];
  }
  return {
    ...input,
    railTariff,
    rng: rngState,
    log,
    cash,
    shipped: noShipments(),
    logistics: { ...input.logistics, traderSold: 0 },
  };
}
