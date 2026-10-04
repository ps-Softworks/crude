// Nebeninvestments (4.16, GDD §8): Beteiligungen außerhalb von Öl, die gegen
// einen Ölpreis-Crash absichern – jede mit eigenem Risiko.
//
// Regeln (Zahlen in balance.yaml → hallstead.holdings):
// - Kaufen: ein Anteil kostet price (Land, Eisenbahn, Auto: beliebig oft
//   nachkaufen; Zeitung und Bank gibt es nur einmal – single).
// - Verkaufen: immer alles, zum Wert minus sellFee.
// - Rundenende, für jede Beteiligung:
//     Wert × (1 + drift + creditBeta·(Kreditklima − 50) + demandBeta·Nachfragewachstum ± noise)
//   Beginnt ein Crash, bricht der Wert einmal um crashDrop ein. Ein Schlag (shock)
//   trifft mit chance: das Feld unter dem Land versiegt, bei der Bank ein Bankrun
//   (crashOnly: nur während eines Crashs). Danach zahlt jede Beteiligung yield ×
//   Wert in die Kasse (negativ: die Zeitung kostet Zuschuss).
// - Eigene Zeitung: Eine Kampagne je Runde kostet campaignCost Glaubwürdigkeit
//   und bringt Gefallen und Stimmung im Verhältnis zur Glaubwürdigkeit; jede
//   Runde ohne Kampagne erholt sie sich um recovery.
// - Eigene Bank: Bankzins bankRateDiscount Punkte billiger (Andockpunkt Kredit).
// Zufall nur über den Hallstead-Rng, Würfel in fester Reihenfolge (HOLDING_KINDS).

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { HOLDING_KINDS, type HoldingKind } from './hallsteadBalance';
import {
  hallsteadOf,
  hallsteadUnlocked,
  worldView,
  type HallsteadNews,
  type HallsteadResult,
  type HallsteadState,
  type Position,
} from './hallsteadState';
import { Rng } from './rng';

/** Kurznamen fürs Protokoll (die Kladde ist wie überall deutsch; Fenstertexte stehen in content/hallstead.yaml). */
const LOG_NAMES: Record<HoldingKind, string> = {
  land: 'Land in Boomtowns',
  bahn: 'Eisenbahnaktien',
  auto: 'Autoaktien',
  zeitung: 'eigene Zeitung',
  bank: 'eigene Bank',
};

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mit(state: GameState, h: HallsteadState, cashDelta = 0): GameState {
  return { ...state, hallstead: h, cash: cents(state.cash + cashDelta) };
}

/** Was ein Kauf jetzt kostet (ein Anteil bzw. die ganze Firma). */
export function holdingPrice(balance: Balance, kind: HoldingKind): number {
  return balance.hallstead.holdings.kinds[kind].price;
}

/** Kauft einen Anteil (oder die Zeitung/Bank im Ganzen). */
export function buyHolding(state: GameState, balance: Balance, kind: HoldingKind): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const kb = balance.hallstead.holdings.kinds[kind];
  const h = hallsteadOf(state, balance);
  const alt = h.holdings.positions[kind];
  if (kb.single && alt) return { ok: false, reason: 'owned' };
  if (state.cash < kb.price) return { ok: false, reason: 'cash' };
  const pos: Position = alt
    ? { ...alt, value: cents(alt.value + kb.price), invested: cents(alt.invested + kb.price) }
    : { value: kb.price, invested: kb.price, since: state.round };
  const holdings = { ...h.holdings, positions: { ...h.holdings.positions, [kind]: pos } };
  const name = kb.single ? LOG_NAMES[kind] : `einen Anteil ${LOG_NAMES[kind]}`;
  return {
    ok: true,
    state: { ...mit(state, { ...h, holdings }, -kb.price), log: [...state.log, `${formatDate(state)}: Jacob kauft ${name} für ${Math.round(kb.price)} $.`] },
  };
}

/** Was ein Verkauf jetzt brächte (Wert minus Gebühr). */
export function saleProceeds(state: GameState, balance: Balance, kind: HoldingKind): number {
  const pos = state.hallstead?.holdings.positions[kind];
  return pos ? cents(pos.value * (1 - balance.hallstead.holdings.sellFee)) : 0;
}

/** Verkauft die ganze Beteiligung. */
export function sellHolding(state: GameState, balance: Balance, kind: HoldingKind): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const h = hallsteadOf(state, balance);
  if (!h.holdings.positions[kind]) return { ok: false, reason: 'notOwned' };
  const erloes = saleProceeds(state, balance, kind);
  const positions = { ...h.holdings.positions };
  delete positions[kind];
  return {
    ok: true,
    state: {
      ...mit(state, { ...h, holdings: { ...h.holdings, positions } }, erloes),
      log: [...state.log, `${formatDate(state)}: Jacob verkauft seine Beteiligung (${LOG_NAMES[kind]}) für ${Math.round(erloes)} $.`],
    },
  };
}

/** Kampagne der eigenen Zeitung: einmal je Runde. */
export function runCampaign(state: GameState, balance: Balance): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const h = hallsteadOf(state, balance);
  if (!h.holdings.positions.zeitung) return { ok: false, reason: 'notOwned' };
  if (h.holdings.campaignRound === state.round) return { ok: false, reason: 'already' };
  const nb = balance.hallstead.newspaper;
  const wirkung = h.holdings.credibility / 100;
  const favors = Math.min(balance.hallstead.lobby.maxFavors, h.lobby.favors + nb.favorsPerCampaign * wirkung);
  const credibility = clamp(h.holdings.credibility - nb.campaignCost, 0, 100);
  const neu: HallsteadState = {
    ...h,
    holdings: { ...h.holdings, credibility, campaignRound: state.round },
    lobby: { ...h.lobby, favors },
  };
  return { ok: true, state: { ...mit(state, neu), log: [...state.log, `${formatDate(state)}: Jacobs Zeitung fährt eine Kampagne.`] } };
}

/**
 * Stimmungsschub der Kampagne dieser Runde (Andockpunkt Weltmodell 4.1: WorldInput.moodShift).
 * Die Glaubwürdigkeit ist schon um die Kampagne gesunken – gerechnet wird mit der davor.
 */
export function campaignMoodShift(state: GameState, balance: Balance): number {
  const h = state.hallstead;
  if (!h || h.holdings.campaignRound !== state.round) return 0;
  const vorher = clamp(h.holdings.credibility + balance.hallstead.newspaper.campaignCost, 0, 100);
  return (balance.hallstead.newspaper.moodPerCampaign * vorher) / 100;
}

/** Zinspunkte, um die der Bankzins sinkt (eigene Bank; Andockpunkt credit.ts). */
export function bankRateDiscount(state: GameState, balance: Balance): number {
  return state.hallstead?.holdings.positions.bank ? balance.hallstead.bankRateDiscount : 0;
}

/** Wert aller Beteiligungen in $ (für den Imperiumswert). */
export function holdingsValue(state: Pick<GameState, 'hallstead'>): number {
  const pos = state.hallstead?.holdings.positions;
  if (!pos) return 0;
  return cents(Object.values(pos).reduce((s, p) => s + (p?.value ?? 0), 0));
}

/**
 * Rundenende für die Beteiligungen: Werte bewegen, Crash und Schläge, Erträge
 * in die Kasse, Glaubwürdigkeit der Zeitung erholt sich. Liefert neuen Zustand
 * und die Meldungen fürs Telegramm.
 */
export function settleHoldings(state: GameState, balance: Balance, h: HallsteadState): { state: GameState; h: HallsteadState; news: HallsteadNews[] } {
  const welt = worldView(state, balance);
  const rng = new Rng(h.rng);
  const news: HallsteadNews[] = [];
  const crashBeginnt = welt.crash && !h.holdings.crashSeen;
  const wachstum = h.holdings.demandSeen > 0 ? welt.demand / h.holdings.demandSeen - 1 : 0;
  const positions: Partial<Record<HoldingKind, Position>> = {};
  let ertrag = 0;
  const log: string[] = [];
  for (const kind of HOLDING_KINDS) {
    const pos = h.holdings.positions[kind];
    if (!pos) continue;
    const kb = balance.hallstead.holdings.kinds[kind];
    // Zwei Würfel je Beteiligung, immer gezogen: so bleibt die Folge gleich, egal was passiert.
    const uNoise = rng.float();
    const uShock = rng.float();
    const r = kb.drift + kb.creditBeta * (welt.credit - 50) + kb.demandBeta * wachstum + kb.noise * (2 * uNoise - 1);
    let value = Math.max(0, pos.value * (1 + r));
    if (crashBeginnt && kb.crashDrop > 0) {
      const verlust = value * kb.crashDrop;
      value -= verlust;
      news.push({ key: 'crash', kind, amount: cents(verlust) });
    }
    if (kb.shock.chance > 0 && (!kb.shock.crashOnly || welt.crash) && uShock < kb.shock.chance) {
      const verlust = value * kb.shock.drop;
      value -= verlust;
      news.push({ key: 'shock', kind, amount: cents(verlust) });
      log.push(kind === 'bank' ? 'Bankrun bei Jacobs Bank.' : `Schwerer Schlag für Jacobs Beteiligung (${LOG_NAMES[kind]}).`);
    }
    value = cents(value);
    ertrag += value * kb.yield;
    positions[kind] = { ...pos, value };
  }
  ertrag = cents(ertrag);
  if (ertrag !== 0) news.push({ key: 'yield', amount: ertrag });
  const nb = balance.hallstead.newspaper;
  const credibility = h.holdings.campaignRound === state.round ? h.holdings.credibility : clamp(h.holdings.credibility + nb.recovery, 0, 100);
  const neu: HallsteadState = {
    ...h,
    rng: rng.state,
    holdings: { ...h.holdings, positions, crashSeen: welt.crash, demandSeen: welt.demand, credibility },
  };
  if (ertrag !== 0) log.push(`Beteiligungen: ${ertrag > 0 ? 'Ertrag' : 'Zuschuss'} ${Math.abs(Math.round(ertrag))} $.`);
  const datum = formatDate(state);
  return {
    state: { ...state, cash: cents(state.cash + ertrag), log: [...state.log, ...log.map((l) => `${datum}: ${l}`)] },
    h: neu,
    news,
  };
}
