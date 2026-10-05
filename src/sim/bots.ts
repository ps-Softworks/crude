// Bot-Läufe (GDD §17, Schritt 1.14): Die Simulation spielt ganze Partien ohne
// Grafik, mit vier Strategien – vorsichtig, gierig, ausgewogen, zufällig. Daraus
// entstehen Bankrottquote und mittlerer Imperiumswert je Strategie für die Balance.
// Seit 2.15 spielen die Bots mit den echten Ereignissen (Briefe, feste Termine,
// Rivalen) und beantworten sie nach ihrer Strategie; dazu kommen Kennzahlen, die
// gegen die Zielwerte aus GDD §15 geprüft werden (bots.targets in balance.yaml).
//
// Die Bots benutzen nur die öffentlichen Funktionen der Simulation, so wie der
// Schreibtisch. Ihr eigener Zufall kommt aus einem eigenen Rng – state.rng
// gehört der Welt und wird nie angefasst; Math.random kommt nicht vor.
// Die Zahlen stehen in content/balance.yaml unter bots.

import { TRANSPORT_MODES, type Balance, type BotEventWeights, type BotInvest, type BotTargetId, type BotTransport, type Buyer, type TransportMode } from './balance';
import { overtimeFor } from './agenda';
import { creditLimit, debt, headroom, takeLoan } from './credit';
import { applyAction, parcelActions, type DeskActionKind } from './desk';
import { drillQuote, stageCost, wellOf, wellsOn, type Well } from './drilling';
import { pumpOutlook, wellOutlook, type Outlook } from './invest';
import { buyRig, freeRig, rentRig, returnRig, rigWell, upgradeRig, type RigResult } from './rigs';
import { chapterCheck } from './chapter';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { generateParcels } from './geology';
import { leaseOf, leaseTerms, locationFor, optionOf } from './lease';
import { Rng, seedFromString } from './rng';
import {
  buildPipeline,
  buildTank,
  dismissTeam,
  fixedCosts,
  hireTeam,
  LOGISTICS_MARKS,
  missingRights,
  sabotageChance,
  setGuards,
  storageCapacity,
  surveyPipeline,
  traderGain,
} from './logistics';
import { jacobSupply } from './market';
import { buyerCapacityLeft, capacityLeft, modeCapacity, modeUnavailable, netPrice, quoteSale, sellOil, tariff } from './transport';
import { craneCut, exclusiveActive, grudgeCut, RIVAL_MARKS, volumeObligation } from './trust';
import { tutorialHint } from './tutorial';
import { advanceWorld, newWorld } from './world';
import { choiceCost, choiceReason, resolveEvent, routineOffered, type EventChoice, type EventDef } from './events';
// Termine als Hauptwerkzeug (Etappe 1): Erkundung über das Planungsbrett.
import { knowledgeOf, suggestRide } from './exploration';
import { bookCard, exploreAppointments } from './plans';
// Etappe 2: Preis- und Transport-Aktionen über das Planungsbrett.
import { activeContract, cartelActive, cranePressure, type PricingState } from './pricing';
import { brennanActive, freightPressure, thorneResistance } from './freight';

export type Strategy = 'vorsichtig' | 'gierig' | 'ausgewogen' | 'zufaellig';
export const STRATEGIES: readonly Strategy[] = ['vorsichtig', 'gierig', 'ausgewogen', 'zufaellig'];

/** Führt eine Aktion aus; bei ok:false bleibt alles, wie es war. */
function act(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind): GameState {
  const r = applyAction(state, balance, parcelId, kind);
  return r.ok ? r.state : state;
}

// --- Transport (0.2.15+2, Charakter je Strategie seit 0.2.15+4) ----------------------

/** Ein Transportweg in der Buchführung der Bot-Läufe; der Händler ist ein Käufer und zählt zusätzlich. */
export type RouteKey = TransportMode | 'trader';
export const ROUTE_KEYS: readonly RouteKey[] = [...TRANSPORT_MODES, 'trader'];

/**
 * Was ein Weg in einer Partie gebracht hat: verkaufte Barrel, Erlös nach Fracht und
 * Förderzins (net) und was der Weg sonst gekostet hat (costs): Anschaffung, soweit
 * sie nicht im Imperiumswert weiterzählt, Löhne, Unterhalt, Reparatur, Strafen,
 * Wegerechte; beim Händler Cranes Groll auf die übrigen Verkäufe.
 */
export interface RouteStats {
  barrels: number;
  net: number;
  costs: number;
}
export type TransportLedger = Record<RouteKey, RouteStats>;

export function newLedger(): TransportLedger {
  return Object.fromEntries(ROUTE_KEYS.map((k) => [k, { barrels: 0, net: 0, costs: 0 }])) as TransportLedger;
}

function addLedger(into: TransportLedger, from: TransportLedger): void {
  for (const k of ROUTE_KEYS) {
    into[k].barrels += from[k].barrels;
    into[k].net += from[k].net;
    into[k].costs += from[k].costs;
  }
}

/** Ø Gewinn je Barrel eines Wegs: (Erlös − Kosten) ÷ Barrel; null ohne Verkäufe. */
export function profitPerBarrel(r: RouteStats): number | null {
  return r.barrels > 0 ? (r.net - r.costs) / r.barrels : null;
}

/** Barrel, die Jacobs Quellen je Runde fördern (letzte Förderung). */
function production(state: GameState): number {
  return state.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
}

function roundsLeft(state: GameState): number {
  return Math.max(0, state.totalRounds - state.round + 1);
}

/**
 * Verkauft Öl aus dem Tank: Weg und Käufer mit dem höchsten Nettopreis zuerst,
 * jeweils bis zur freien Kapazität. share = Anteil des Tanks (1 = alles).
 * Ein Weg, bei dem nach Fracht nichts übrig bleibt, wird nicht benutzt. An den
 * Händler nur mit trader = true. Jeder Verkauf landet in der Buchführung.
 */
function sell(state: GameState, balance: Balance, share: number, ledger: TransportLedger, trader = false, margin = true): GameState {
  let rest = Math.floor(Math.floor(state.oilStock) * share);
  // Etappe 2: Ein Liefervertrag mit dem Händler wird zuerst erfüllt (Fehlmenge kostet Strafe).
  const vertrag = activeContract(state, 'haendler') !== null;
  const buyers: Buyer[] = trader || vertrag ? ['trader', 'crane'] : ['crane'];
  const wege = TRANSPORT_MODES.flatMap((mode) => buyers.map((buyer) => ({ mode, buyer })));
  wege.sort((a, b) => (vertrag ? Number(b.buyer === 'trader') - Number(a.buyer === 'trader') : 0) || netPrice(state, balance, b.mode, b.buyer) - netPrice(state, balance, a.mode, a.buyer));
  // Etappe 2: Läuft Thornes Bluff-Prüfung, bleibt der Bahnanteil unter der Grenze – wenn es sich lohnt.
  let bahnFrei = bluffRailCap(state, balance, rest);
  for (const { mode, buyer } of wege) {
    if (rest <= 0) break;
    // margin: Nach Fracht und Förderzins muss etwas übrig bleiben – sonst bleibt das Öl lieber im
    // Tank. Ohne margin (gierig: Menge vor Marge) reicht, dass der Preis die Fracht deckt.
    const pflicht = vertrag && buyer === 'trader';
    if (netPrice(state, balance, mode, buyer) <= 0 || (margin && !pflicht && quoteSale(state, balance, mode, 1, buyer).net <= 0)) continue;
    const menge = Math.min(rest, capacityLeft(state, balance, mode), buyerCapacityLeft(state, balance, buyer), Math.floor(state.oilStock), mode === 'rail' ? bahnFrei : Infinity);
    if (menge <= 0) continue;
    if (mode === 'rail') bahnFrei -= menge;
    const groll = buyer === 'crane' ? grudgeCut(state, balance) : 0;
    const r = sellOil(state, balance, mode, menge, buyer);
    if (r.ok) {
      state = r.state;
      rest -= menge;
      ledger[mode].barrels += menge;
      ledger[mode].net += r.quote.net;
      if (buyer === 'trader') {
        ledger.trader.barrels += menge;
        ledger.trader.net += r.quote.net;
      }
      // Cranes Groll nach einem Händlerverkauf geht auf das Konto des Händlers.
      ledger.trader.costs += groll * menge;
    }
  }
  return state;
}

/**
 * Bluff-Prüfung (Etappe 2): Hing Thornes Zugeständnis an Ausweichwegen oder Pipeline, darf in den
 * Folgerunden höchstens bluff.railShare per Bahn gehen. Der Bot hält sich daran, wenn Wege, die je
 * Barrel höchstens Thornes Aufschlag mehr kosten, die Menge schaffen; sonst nimmt er das Risiko
 * (Infinity = keine Grenze).
 */
function bluffRailCap(state: GameState, balance: Balance, total: number): number {
  const bc = state.freight?.bluffCheck;
  if (!bc || state.round < bc.from || state.round > bc.until || total <= 0) return Infinity;
  const f = balance.freight.bluff;
  const erlaubt = Math.max(0, Math.floor(f.railShare * (bc.total + total) - bc.rail) - 1);
  const bahn = Math.min(total, capacityLeft(state, balance, 'rail'));
  const verschieben = bahn - erlaubt;
  if (verschieben <= 0) return Infinity;
  const andere = TRANSPORT_MODES.filter((m) => m !== 'rail' && modeUnavailable(state, m) === null).map((m) => ({ cap: capacityLeft(state, balance, m), t: tariff(state, balance, m) }));
  // Je Barrel abgewogen: Ein Umweg lohnt nur, wenn er höchstens so viel mehr kostet wie Thornes Aufschlag
  // je Barrel (bluff.penalty). Schaffen die Wege, die das erfüllen, die Menge nicht, riskiert der Bot den Bluff.
  const bahnTarif = tariff(state, balance, 'rail');
  const platz = andere.filter((w) => w.t <= bahnTarif + f.penalty).reduce((s, w) => s + w.cap, 0);
  return platz >= verschieben ? erlaubt : Infinity;
}

/** Wie ein Bot bezahlt: Rücklage, die bleiben muss, und wie viel er dafür höchstens leihen darf. */
interface Purse {
  reserve: number;
  borrowable: (state: GameState) => number;
}

function purseFor(balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>): Purse {
  switch (strategy) {
    case 'vorsichtig':
      return { reserve: balance.bots.cautious.cashReserve, borrowable: () => 0 };
    case 'gierig':
      return { reserve: 0, borrowable: (s) => headroom(s, balance) };
    case 'ausgewogen':
      return { reserve: balance.bots.balanced.cashReserve, borrowable: (s) => balancedBorrowable(s, balance) };
  }
}

/** Sorgt dafür, dass cost bezahlbar ist (leiht notfalls im Rahmen); null, wenn nicht. */
function afford(state: GameState, balance: Balance, purse: Purse, cost: number): GameState | null {
  if (state.cash - cost >= purse.reserve) return state;
  const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + purse.reserve - state.cash));
  if (amount > purse.borrowable(state)) return null;
  const loan = takeLoan(state, balance, amount);
  return loan.ok ? loan.state : null;
}

/** Läuft der Händler für diesen Bot? „calc“: nur, wenn der Aufschlag Cranes Groll auf den Rest überwiegt. */
function useTrader(state: GameState, balance: Balance, cfg: BotTransport, share: number): boolean {
  if (cfg.trader === 'never') return false;
  if (cfg.trader === 'always') return true;
  return traderGain(balance, Math.floor(state.oilStock * share)) > 0;
}

/** Timing: Ist der Preis zuletzt gestiegen, bleibt holdShare des Tanks liegen. */
function sellShare(state: GameState, cfg: BotTransport): number {
  const h = state.priceHistory;
  const steigt = h.length >= 2 && h[h.length - 1] > h[h.length - 2];
  return steigt ? 1 - cfg.holdShare : 1;
}

/**
 * Kosten je Barrel für ein zusätzliches eigenes Gespann bei voller Auslastung –
 * Fracht, Lohn und der Teil der Anschaffung, der beim Verkauf verloren geht.
 */
function teamCostPerBarrel(state: GameState, balance: Balance): number {
  const t = balance.transport.teams;
  return tariff(state, balance, 'teams') + (t.wagePerRound + (t.hireCost * (1 - t.resale)) / Math.max(1, roundsLeft(state))) / t.capacity;
}

/** Barrel je Runde, die nach Pipeline und eigenen Gespannen noch für ein weiteres Gespann übrig sind. */
function teamSlice(state: GameState, balance: Balance): number {
  const pipe = modeCapacity(state, balance, 'pipeline');
  return production(state) - pipe - state.logistics.teams * balance.transport.teams.capacity;
}

/**
 * Lohnt die Pipeline? Erwartete Ersparnis gegenüber der Bahn über die Runden
 * nach dem Bau (mit Rückgang der Förderung) gegen Vermessung, Wegerechte und
 * den Teil der Baukosten, der nicht im Imperiumswert weiterzählt.
 */
export function pipelineWorth(state: GameState, balance: Balance, payback: number): boolean {
  if (payback <= 0) return false;
  const t = balance.transport;
  const p = t.pipeline;
  const lg = state.logistics;
  if (lg.pipeline !== 'none' && lg.pipeline !== 'surveyed') return false;
  const warten = p.buildRounds + (lg.pipeline === 'none' ? 1 : 0);
  let barrel = 0;
  for (let k = warten; k < roundsLeft(state); k++) barrel += Math.min(p.capacity, production(state) * (1 - balance.production.decline) ** k);
  const nutzbar = Math.max(0, roundsLeft(state) - warten);
  const ersparnis = barrel * (tariff(state, balance, 'rail') - tariff(state, balance, 'pipeline')) - nutzbar * (p.upkeepPerRound + p.sabotageChance * p.repairCost);
  const rechte = missingRights(state, balance).length > 0 ? balance.bots.rightsEstimate : 0;
  const kosten = (lg.pipeline === 'none' ? p.surveyCost : 0) + rechte + p.buildCost * (1 - t.assetShare);
  return ersparnis >= payback * kosten;
}

/**
 * Wegerechte: Liegt ein Brief eines Landbesitzers auf dem Tisch, nimmt der Bot die
 * billigste Antwort, die das fehlende Recht bringt – wenn er sie bezahlen kann.
 */
function buyRights(state: GameState, balance: Balance, catalog: readonly EventDef[], purse: Purse, ledger: TransportLedger): GameState {
  for (const event of openItems(state, catalog)) {
    const fehlt = missingRights(state, balance);
    const passend = event.choices
      .filter((c) => c.marks.some((m) => fehlt.includes(m)))
      .sort((a, b) => (a.effects.cash ?? 0) < (b.effects.cash ?? 0) ? 1 : -1);
    for (const choice of passend) {
      const kosten = -(choice.effects.cash ?? 0);
      const bezahlt = afford(state, balance, purse, kosten);
      if (!bezahlt || choiceReason(bezahlt, balance, event, choice) !== null) continue;
      const r = resolveEvent(bezahlt, balance, catalog, event.id, choice.id);
      if (!r.ok) continue;
      ledger.pipeline.costs += kosten;
      state = r.state;
      break;
    }
  }
  return state;
}

/**
 * Thornes Frachtvertrag: Wert der Antworten gegenüber „ablehnen“ in $ über die
 * Vertragszeit. Abgelehnt erhöht Thorne doppelt so oft; mit Mengenrabatt halb so
 * oft wie abgelehnt, dazu Rabatt minus Strafe für fehlende Menge; exklusiv gar
 * nicht, dafür kostet alles, was nicht auf die Bahn passt, Strafe.
 */
export function thorneOfferValue(state: GameState, balance: Balance, kind: 'exclusive' | 'volume'): number {
  const th = balance.transport.thorne;
  const runden = Math.min(balance.rivals.thorne.contractRounds, roundsLeft(state));
  const menge = production(state);
  const bahn = Math.min(menge, balance.transport.rail.capacity);
  const h = th.hikeChance;
  const abgelehnt = Math.min(1, h * balance.rivals.thorne.refusedHikeFactor);
  const stufen = (runden * (runden + 1)) / 2;
  if (kind === 'volume') {
    return runden * (bahn * th.volumeDiscount - Math.max(0, th.minVolume - bahn) * th.shortfallPenalty) + (abgelehnt - h) * th.hikeStep * bahn * stufen;
  }
  return -150 - runden * Math.max(0, menge - bahn) * th.exclusivePenalty + abgelehnt * th.hikeStep * bahn * stufen;
}

function answerThorne(state: GameState, balance: Balance, catalog: readonly EventDef[], cfg: BotTransport, purse: Purse, ledger: TransportLedger): GameState {
  if (cfg.thorne === 'refuse') return state;
  for (const event of openItems(state, catalog)) {
    const exklusiv = event.choices.find((c) => c.marks.includes(RIVAL_MARKS.thorneExclusive));
    const rabatt = event.choices.find((c) => c.marks.includes(RIVAL_MARKS.thorneVolume));
    if (!exklusiv && !rabatt) continue;
    // Ohne eigene Förderung wartet der Bot ab, bis die Frist abläuft.
    if (production(state) <= 0) continue;
    let wahl: EventChoice | undefined;
    if (cfg.thorne === 'exclusive') wahl = exklusiv;
    else if (cfg.thorne === 'volume') wahl = production(state) >= balance.transport.thorne.minVolume ? rabatt : undefined;
    else {
      const werte = [
        { c: exklusiv, v: exklusiv ? thorneOfferValue(state, balance, 'exclusive') : -Infinity },
        { c: rabatt, v: rabatt ? thorneOfferValue(state, balance, 'volume') : -Infinity },
      ].sort((a, b) => b.v - a.v);
      wahl = werte[0].v > 0 ? werte[0].c : undefined;
    }
    if (!wahl) continue;
    const kosten = -(wahl.effects.cash ?? 0);
    if (state.cash - kosten < purse.reserve || choiceReason(state, balance, event, wahl) !== null) continue;
    const r = resolveEvent(state, balance, catalog, event.id, wahl.id);
    if (!r.ok) continue;
    ledger.rail.costs += kosten;
    state = r.state;
  }
  return state;
}

/**
 * Lager und Wege für einen planenden Bot (0.2.15+4), jeder nach seinem Charakter
 * (bots.transport in balance.yaml): verkaufen (mit Timing und Händler), Gespanne,
 * Tanks, Pipeline mit Wegerechten, Wachleute, Drohung gegenüber Thorne.
 */
function transportTurn(
  state: GameState,
  balance: Balance,
  strategy: Exclude<Strategy, 'zufaellig'>,
  catalog: readonly EventDef[],
  ledger: TransportLedger,
): GameState {
  const cfg = balance.bots.transport[strategyKey(strategy)];
  const purse = purseFor(balance, strategy);
  const { teams, storage, pipeline } = balance.transport;
  state = answerThorne(state, balance, catalog, cfg, purse, ledger);

  // Pipeline: vermessen, Wegerechte kaufen, bauen – nur, wenn sie sich lohnt.
  const lg0 = state.logistics;
  if (lg0.pipeline === 'none' && pipelineWorth(state, balance, cfg.pipelinePayback)) {
    const bezahlt = afford(state, balance, purse, pipeline.surveyCost);
    const r = bezahlt && surveyPipeline(bezahlt, balance);
    if (r && r.ok) {
      state = r.state;
      ledger.pipeline.costs += pipeline.surveyCost;
    }
  }
  if (state.logistics.pipeline === 'surveyed' && pipelineWorth(state, balance, cfg.pipelinePayback)) {
    state = buyRights(state, balance, catalog, purse, ledger);
    if (missingRights(state, balance).length === 0) {
      const bezahlt = afford(state, balance, purse, pipeline.buildCost);
      const r = bezahlt && buildPipeline(bezahlt, balance);
      if (r && r.ok) {
        state = r.state;
        ledger.pipeline.costs += pipeline.buildCost * (1 - balance.transport.assetShare);
      }
    }
  }
  // Wachleute
  if (state.logistics.pipeline === 'ready' && cfg.guards !== 'never') {
    const feinde = sabotageChance({ ...state, logistics: { ...state.logistics, guards: false } }, balance) > pipeline.sabotageChance;
    const wollen = cfg.guards === 'always' || feinde;
    if (wollen !== state.logistics.guards) {
      const r = setGuards(state, wollen);
      if (r.ok) state = r.state;
    }
  }
  // Gespanne, die billiger sind als die Bahn – vor dem Verkauf, damit sie gleich fahren.
  if (cfg.teams === 'cheaper') {
    while (
      state.logistics.teams < teams.maxTeams &&
      teamSlice(state, balance) >= teams.capacity &&
      teamCostPerBarrel(state, balance) < tariff(state, balance, 'rail')
    ) {
      const bezahlt = afford(state, balance, purse, teams.hireCost);
      const r = bezahlt && hireTeam(bezahlt, balance);
      if (!r || !r.ok) break;
      state = r.state;
      ledger.teams.costs += teams.hireCost * (1 - teams.resale);
    }
    // Fördert Jacob kaum noch, gibt er überzählige Gespanne ab.
    while (state.logistics.teams > 0 && teamSlice(state, balance) < -teams.capacity * 0.5) {
      const r = dismissTeam(state, balance);
      if (!r.ok) break;
      state = r.state;
    }
  }

  // Etappe 2: Ist das Gerücht „Quellen versiegen“ gebucht, bleibt genug im Tank, damit man es glaubt.
  const halten = rumourHold(state, balance);
  const anteil = halten > 0 && state.oilStock > 0 ? Math.min(sellShare(state, cfg), Math.max(0, (state.oilStock - halten) / state.oilStock)) : sellShare(state, cfg);
  state = sell(state, balance, anteil, ledger, useTrader(state, balance, cfg, anteil), cfg.margin);

  // Bleibt nach dem Verkauf Öl liegen, weil alle Wege voll sind: ein Gespann mehr.
  if (cfg.teams !== 'never') {
    while (anteil === 1 && Math.floor(state.oilStock) > 0 && TRANSPORT_MODES.every((m) => capacityLeft(state, balance, m) === 0 || netPrice(state, balance, m) <= 0)) {
      if (state.logistics.teams >= teams.maxTeams) break;
      const bezahlt = afford(state, balance, purse, teams.hireCost);
      const r = bezahlt && hireTeam(bezahlt, balance);
      if (!r || !r.ok) break;
      ledger.teams.costs += teams.hireCost * (1 - teams.resale);
      state = sell(r.state, balance, 1, ledger, useTrader(r.state, balance, cfg, 1), cfg.margin);
    }
  }
  // Würde die nächste Förderung überlaufen, baut er Tanks.
  if (cfg.tanks) {
    const naechste = jacobSupply(state);
    for (let i = 0; i < storage.maxTanks && state.oilStock + naechste > storageCapacity(state, balance) + state.logistics.tanksBuilding * storage.tankCapacity; i++) {
      if (state.logistics.tanks + state.logistics.tanksBuilding >= storage.maxTanks) break;
      const bezahlt = afford(state, balance, purse, storage.tankCost);
      const r = bezahlt && buildTank(bezahlt, balance);
      if (!r || !r.ok) break;
      state = r.state;
    }
  }
  return state;
}

/** Barrel, die für ein gebuchtes Gerücht „Quellen versiegen“ im Tank bleiben müssen (sonst 0). */
function rumourHold(state: GameState, balance: Balance): number {
  const gebucht = state.plans?.round === state.round && state.plans.booked.some((b) => b.cardId === 'geruecht' && b.target === 'versiegen' && !b.done);
  return gebucht ? balance.priceActions.rumour.dry.minTank + 1 : 0;
}

// --- Preis- und Transport-Aktionen (Etappe 2) ----------------------------------------

/**
 * Preis- und Fracht-Karten nach bots.plans (Etappe 2): bei Thorne vorsprechen, wenn der Druck den
 * Widerstand übersteigt; Förderbremse ab vollem Tank, halten, verlängern, Bullard einladen, Betrüger
 * zur Rede stellen; Liefervertrag über 4 Runden; Gerücht bei vollem Tank; mit Crane feilschen, wenn er
 * Abschlag zahlt; Brennan, wenn die Bahn teurer ist; Transportgemeinschaft gründen und halten.
 * Die Feinarbeit je Charakter ist Etappe 4.
 */
function planTurn(state: GameState, balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>, catalog: readonly EventDef[]): GameState {
  const cfg = balance.botPlans[strategyKey(strategy)];
  if (!Object.values(cfg).some(Boolean) || state.chapter > 1) return state;
  const purse = purseFor(balance, strategy);
  const buchen = (s: GameState, id: string, target?: string): GameState => {
    const r = bookCard(s, balance, catalog, id, target);
    return r.ok ? r.state : s;
  };
  const leisten = (s: GameState, cash: number) => s.cash - cash >= purse.reserve;
  const prod = production(state);
  const ende = state.round >= state.totalRounds - 1;
  const pa = balance.priceActions;
  if (cfg.thorne && prod > 0 && (state.freight?.railLast ?? 0) > 0 && state.railTariff > balance.transport.thorne.minTariff + 0.001 && state.strength >= 40 && leisten(state, 30)) {
    // Ab Stufe 1 bei normaler Laune; bei hohem Tarif lohnt der Sondertarif mehr als jede Senkung.
    const sonder = state.railTariff - balance.freight.cuts[2] > balance.freight.special.tariff;
    if (!exclusiveActive(state, balance) && freightPressure(state, balance) - thorneResistance(state, balance) >= 1) state = buchen(state, 'thorne_vorsprechen', sonder ? 'sondertarif' : 'senkung');
  }
  // Gemeinschaft nur, wenn Jacob selbst schon nennenswert per Bahn fährt (sonst bringt das Bündeln keinen Druck);
  // halten nur, solange sie groß genug ist, dass ihr Zerfall Druckmittel kosten würde.
  if (cfg.pool && prod > 0) {
    if ((state.freight?.pool.length ?? 0) === 0) {
      // Steht die eigene Pipeline noch aus, baut er sie lieber mit der Gemeinschaft (billiger, dazu Durchleitungsgebühr).
      const ohnePipeline = state.logistics.pipeline === 'none' || state.logistics.pipeline === 'surveyed';
      if ((state.freight?.railLast ?? 0) >= balance.freight.bundle[0] / 2 && leisten(state, 100) && !ende) state = buchen(state, 'transportgemeinschaft', ohnePipeline ? 'pipeline' : 'ohne');
    } else if (state.freight.pool.length >= 3) state = buchen(state, 'gemeinschaft_halten');
  }
  // Brennan nur, wenn Öl übrig bleibt, das sonst teuer per Mietfuhrwerk ginge (Bahn, Gespanne und Pipeline voll),
  // oder die Bahn deutlich teurer ist als Brennan – und nach Gespannen und Pipeline genug für die Mindestmenge bleibt.
  const fuerBrennan = prod - modeCapacity(state, balance, 'teams') - modeCapacity(state, balance, 'pipeline');
  const ueberlauf = fuerBrennan - modeCapacity(state, balance, 'rail');
  const bahnTeuer = tariff(state, balance, 'rail') >= balance.freight.brennan.costPerBarrel + 0.1;
  if (cfg.brennan && !brennanActive(state) && fuerBrennan >= balance.freight.brennan.minimum * 1.5 && (ueberlauf >= balance.freight.brennan.minimum || bahnTeuer) && !exclusiveActive(state, balance) && leisten(state, 150) && !ende) {
    state = buchen(state, 'brennan');
  }
  if (cfg.cartel && prod > 0) {
    const p: PricingState = state.pricing;
    if (!p.cartel) {
      // Plan Etappe 4: gründen bei vollem Tank (ab 5.000 bbl) – dann trifft der höhere Preis auch das gelagerte Öl.
      // Mit der Organisatoren-Klausel: Ehrlich 20 % zu drosseln kostet Jacob etwa so viel, wie der höhere Preis bringt
      // (das Öl bleibt im Boden und zählt am Kapitelende nur noch × 0,4); nur der vorsichtige Bot drosselt ehrlich.
      if (state.oilStock >= pa.rumour.dry.minTank && leisten(state, 100) && !ende) state = buchen(state, 'foerderbremse', strategy === 'vorsichtig' ? 'ehrlich' : 'klausel');
    } else if (cartelActive(state)) {
      state = buchen(state, 'zur_rede');
      if (state.events.marks[RIVAL_MARKS.bullardPact] !== undefined) state = buchen(state, 'bullard_einladen');
      state = buchen(state, 'pakt_halten');
      // Verlängern nur, solange keiner betrügt – sonst lieber auslaufen lassen, bevor der Pakt platzt.
      if (!ende && state.pricing.cartel && state.pricing.cartel.cheaters.length === 0 && state.pricing.cartel.suspect === null) state = buchen(state, 'pakt_verlaengern');
    }
  }
  if (cfg.contract && !state.pricing.contract && prod >= pa.contract.minQty + pa.contract.qtyStep && !ende) {
    const q = Math.min(pa.contract.maxQty, Math.max(pa.contract.minQty, Math.floor((0.6 * prod) / pa.contract.qtyStep) * pa.contract.qtyStep));
    state = buchen(state, 'liefervertrag', `${pa.contract.rounds[0]}x${q}`);
  }
  if (cfg.rumour && state.oilStock >= pa.rumour.dry.minTank * 1.5 && state.pricing.rumours.count < 2 && leisten(state, 150)) state = buchen(state, 'geruecht', 'versiegen');
  if (cfg.crane && craneCut(state, balance) > 0 && cranePressure(state, balance) >= 2) state = buchen(state, 'crane_feilschen', 'abschlag');
  return state;
}

function strategyKey(strategy: Exclude<Strategy, 'zufaellig'>): 'cautious' | 'greedy' | 'balanced' {
  return strategy === 'vorsichtig' ? 'cautious' : strategy === 'gierig' ? 'greedy' : 'balanced';
}

/** Zufällig: mit logisticsChance je Runde eine zufällige Anschaffung oder Drohung, die gerade geht. */
function randomLogistics(state: GameState, balance: Balance, rng: Rng, ledger: TransportLedger): GameState {
  if (rng.float() >= balance.bots.random.logisticsChance) return state;
  const t = balance.transport;
  // Etappe 2: Die alte Drohung gegenüber Thorne gibt es nicht mehr; Verhandlungen laufen über das Planungsbrett.
  const wahl = rng.pick(['tank', 'team', 'survey', 'build', 'guards'] as const);
  const kosten: Record<typeof wahl, [RouteKey, number] | null> = {
    tank: null,
    team: ['teams', t.teams.hireCost * (1 - t.teams.resale)],
    survey: ['pipeline', t.pipeline.surveyCost],
    build: ['pipeline', t.pipeline.buildCost * (1 - t.assetShare)],
    guards: null,
  };
  const r =
    wahl === 'tank'
      ? buildTank(state, balance)
      : wahl === 'team'
        ? hireTeam(state, balance)
        : wahl === 'survey'
          ? surveyPipeline(state, balance)
          : wahl === 'build'
            ? buildPipeline(state, balance)
            : setGuards(state, !state.logistics.guards);
  if (!r.ok) return state;
  const k = kosten[wahl];
  if (k) ledger[k[0]].costs += k[1];
  return r.state;
}

/** Fundchance laut Geologe als Anteil 0–1 (die Prognose rechnet in Prozent; die Mitte ist ungekappt und kann negativ sein). */
function chance(state: GameState, parcelId: string): number {
  const f = state.forecasts[parcelId];
  return f ? Math.min(100, Math.max(0, f.center)) / 100 : 0;
}

/** Freie Parzellen (weder gepachtet noch mit Option), beste Prognose zuerst. */
function freeParcels(state: GameState, minChance: number): string[] {
  return state.parcels
    .filter((p) => !p.discovery && !leaseOf(state, p.id) && !optionOf(state, p.id))
    .filter((p) => chance(state, p.id) >= minChance)
    .sort((a, b) => chance(state, b.id) - chance(state, a.id) || a.id.localeCompare(b.id))
    .map((p) => p.id);
}

function jacobsLeases(state: GameState): string[] {
  return state.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId);
}

function jacobsOptions(state: GameState): { parcelId: string; bonus: number }[] {
  return state.options.filter((o) => o.holder === 'jacob');
}

/** Auf dieser Ranch läuft gerade eine Bohrung. */
function busy(state: GameState, parcelId: string): boolean {
  return wellsOn(state, parcelId).some((w) => w.status === 'drilling' || w.status === 'decision' || w.status === 'stuck');
}

/**
 * Ausbau (0.2.15+7), was sich laut src/sim/invest.ts in höchstens maxPayback
 * Runden bezahlt macht – der größte Gewinn zuerst. Weitere Bohrlöcher nur auf
 * Ranches ohne laufende Bohrung; Pumpen an jeder Quelle ohne Pumpe.
 */
function goodInvestments(state: GameState, balance: Balance, kind: 'drill' | 'pump', maxPayback: number): string[] {
  if (maxPayback <= 0) return [];
  const rechne = (id: string): Outlook | null => (kind === 'drill' ? (busy(state, id) ? null : wellOutlook(state, balance, id)) : pumpOutlook(state, balance, id));
  return jacobsLeases(state)
    .map((id) => ({ id, o: rechne(id) }))
    // maxPayback = Infinity (Gegenprobe „alles ausbauen“, 0.2.15+8): auch was sich bis Kapitelende nie bezahlt macht.
    .filter((x): x is { id: string; o: Outlook } => x.o !== null && (maxPayback === Infinity || (x.o.payback !== null && x.o.payback <= maxPayback)))
    .sort((a, b) => b.o.profit - a.o.profit || a.id.localeCompare(b.id))
    .map((x) => x.id);
}

/** Bezahlt eine Ausbau-Aktion aus der Kasse (mit Kredit im Rahmen des Bots); sonst bleibt alles, wie es ist. */
function invest(state: GameState, balance: Balance, purse: Purse, cost: number, run: (s: GameState) => RigResult | { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  const bezahlbar = afford(state, balance, purse, cost);
  if (!bezahlbar) return state;
  const r = run(bezahlbar);
  return r.ok ? r.state : state;
}

/**
 * Türme nach Charakter (bots.invest): Erst nachrüsten (nur aus der Kasse über der
 * Rücklage), dann – wenn mehr Bohrarbeit wartet als Türme frei sind – einen Turm
 * mieten oder kaufen. Danach bohren die Bots ihre Pachten, dann folgt investWells.
 */
function investRigs(state: GameState, balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>, purse: Purse): GameState {
  const cfg = balance.bots.invest[strategyKey(strategy)];
  const R = balance.drilling.rigs;
  // Erst wenn eine Quelle Geld bringt – vorher zählt jeder Dollar für Pacht und Bohrung.
  if (production(state) === 0 && !state.wells.some((w) => w.status === 'found')) return state;
  // Nachrüsten nur aus der Kasse und nur, wenn danach noch zwei Bohrungen bezahlbar bleiben.
  const polster = purse.reserve + 2 * stageCost(balance, 1);
  for (const upgrade of ['steam', 'rods'] as const) {
    if (!cfg[upgrade]) continue;
    for (const rig of state.rigs.filter((r) => r.kind !== 'rented' && !r[upgrade])) {
      if (state.cash - R[upgrade].cost < polster) break;
      const r = upgradeRig(state, balance, rig.id, upgrade);
      if (r.ok) state = r.state;
    }
  }
  // Ein Turm mehr nur für Bohrlöcher, die sich laut Rechnung bezahlen, und wenn alle Türme belegt sind.
  const bohrloecher = goodInvestments(state, balance, 'drill', cfg.wellPayback);
  const frei = state.rigs.filter((r) => r.readyRound <= state.round && !rigWell(state, r.id)).length;
  if (bohrloecher.length + undrilled(state).length > frei && bohrloecher.length > 0 && state.rigs.length < cfg.rigs) {
    if (cfg.rent) state = invest(state, balance, purse, R.rent.costPerRound, (s) => rentRig(s, balance));
    else if (state.cash - R.buy.cost >= polster) {
      const r = buyRig(state, balance);
      if (r.ok) state = r.state;
    }
  }
  return state;
}

/** Zweiter Teil des Ausbaus, nach den neuen Pachten: weitere Bohrlöcher, Pumpen, leere Miettürme zurück. */
function investWells(state: GameState, balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>, purse: Purse): GameState {
  const cfg = balance.bots.invest[strategyKey(strategy)];
  for (const parcelId of goodInvestments(state, balance, 'drill', cfg.wellPayback)) {
    if (!freeRig(state)) break;
    state = invest(state, balance, purse, drillQuote(state, balance, parcelId).cost, (s) => applyAction(s, balance, parcelId, 'drill'));
  }
  for (const parcelId of goodInvestments(state, balance, 'pump', cfg.pumpPayback)) {
    state = invest(state, balance, purse, balance.production.pump.cost, (s) => applyAction(s, balance, parcelId, 'pump'));
  }
  // Ein Mietturm ohne Arbeit kostet nur – zurück damit.
  if (undrilled(state).length === 0) {
    for (const rig of state.rigs.filter((r) => r.kind === 'rented' && !rigWell(state, r.id))) {
      const r = returnRig(state, balance, rig.id);
      if (r.ok) state = r.state;
    }
  }
  return state;
}

/** Offene Bohrungen, an denen Jacob entscheiden muss. */
function openWells(state: GameState) {
  return state.wells.filter((w) => w.status === 'decision' || w.status === 'stuck');
}

// --- vorsichtig ---------------------------------------------------------------

function cautiousTurn(state: GameState, balance: Balance, catalog: readonly EventDef[], ledger: TransportLedger): GameState {
  const { minChance, cashReserve, maxStage } = balance.bots.cautious;
  state = transportTurn(state, balance, 'vorsichtig', catalog, ledger);
  for (const well of openWells(state)) {
    const next = well.stage + 1;
    const leistbar = next <= maxStage && next <= balance.drilling.stages.length && state.cash - stageCost(balance, next) >= cashReserve;
    const kind: DeskActionKind = well.status === 'decision' && leistbar ? 'deeper' : 'abandon';
    state = act(state, balance, well.parcelId, kind);
  }
  for (const option of jacobsOptions(state)) {
    if (state.cash - option.bonus >= cashReserve) state = act(state, balance, option.parcelId, 'exercise');
  }
  state = investRigs(state, balance, 'vorsichtig', purseFor(balance, 'vorsichtig'));
  for (const parcelId of jacobsLeases(state)) {
    if (!wellOf(state, parcelId) && state.cash - stageCost(balance, 1) >= cashReserve) {
      state = act(state, balance, parcelId, 'drill');
    }
  }
  // Ausbau (0.2.15+7): nur aus eigener Kasse und nur, was sich schnell bezahlt.
  state = investWells(state, balance, 'vorsichtig', purseFor(balance, 'vorsichtig'));
  // Eine Option nur, wenn danach auch der Bonus noch bezahlbar ist – sonst verfällt
  // sie ungenutzt. Die beste Prognose, die sich das leisten kann.
  const best = freeParcels(state, minChance).find((id) => {
    const t = leaseTerms(state, balance, id);
    return state.cash - t.optionFee - t.bonus >= cashReserve;
  });
  if (best !== undefined) state = act(state, balance, best, 'option');
  return state;
}

// --- gierig -------------------------------------------------------------------

/**
 * Versucht die Aktion; fehlt Geld, leiht der Bot den fehlenden Betrag bei der
 * Bank (mindestens minLoan, höchstens headroom) und versucht es noch einmal.
 * keep: so viel Bargeld soll danach noch in der Kasse liegen.
 * Klappt es auch dann nicht, bleibt der Zustand ohne Kredit.
 */
function withLoan(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind, cost: number, keep = 0): GameState {
  if (state.cash - cost >= keep) {
    const first = applyAction(state, balance, parcelId, kind);
    if (first.ok) return first.state;
    if (state.cash >= cost) return state;
  }
  const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + keep - state.cash));
  if (amount > headroom(state, balance)) return state;
  const loan = takeLoan(state, balance, amount);
  if (!loan.ok) return state;
  const second = applyAction(loan.state, balance, parcelId, kind);
  return second.ok ? second.state : state;
}

/** Eigene Pachten ohne Bohrung. */
function undrilled(state: GameState): string[] {
  return jacobsLeases(state).filter((id) => !wellOf(state, id));
}

/**
 * Verzögerungszins, der am Rundenende fällig wird. Der gierige Bot behält ihn als
 * Bargeld – fehlt er, verfällt die Pacht sofort.
 */
function rentDue(state: GameState, balance: Balance): number {
  return undrilled(state).length * balance.lease.delayRental;
}

function greedyTurn(state: GameState, balance: Balance, catalog: readonly EventDef[], ledger: TransportLedger): GameState {
  state = transportTurn(state, balance, 'gierig', catalog, ledger);
  for (const well of openWells(state)) {
    if (well.status === 'stuck' || well.stage < balance.drilling.stages.length) {
      const vorher = state;
      state =
        well.status === 'stuck'
          ? withLoan(state, balance, well.parcelId, 'fish', balance.drilling.fishingCost, rentDue(state, balance))
          : withLoan(state, balance, well.parcelId, 'deeper', stageCost(balance, well.stage + 1), rentDue(state, balance));
      // Reicht auch der Kredit nicht, gibt der Bot auf – sonst bliebe der Turm
      // für den Rest des Kapitels an dieser Bohrung hängen.
      if (state === vorher) state = act(state, balance, well.parcelId, 'abandon');
    } else {
      // Tiefer geht es mit dem Turm nicht – dann bleibt nur aufgeben.
      state = act(state, balance, well.parcelId, 'abandon');
    }
  }
  for (const option of jacobsOptions(state)) {
    state = withLoan(state, balance, option.parcelId, 'exercise', option.bonus, rentDue(state, balance) + balance.lease.delayRental);
  }
  state = investRigs(state, balance, 'gierig', { reserve: rentDue(state, balance), borrowable: (s) => headroom(s, balance) });
  for (const parcelId of jacobsLeases(state)) {
    if (!wellOf(state, parcelId)) {
      state = withLoan(state, balance, parcelId, 'drill', stageCost(balance, 1), rentDue(state, balance) - balance.lease.delayRental);
    }
  }
  // Ausbau (0.2.15+7): auch auf Kredit, Menge vor Marge.
  state = investWells(state, balance, 'gierig', { reserve: rentDue(state, balance), borrowable: (s) => headroom(s, balance) });
  // Pachten, solange Kasse und Bankrahmen reichen – die beste Prognose zuerst,
  // die sich noch bezahlen lässt. Für jede ungebohrte Pacht bleibt Geld für die
  // erste Bohrstufe übrig; sonst verfiele die Pacht ungebohrt.
  for (;;) {
    const ungebohrt = undrilled(state).length;
    if (ungebohrt >= balance.bots.greedy.maxUndrilled) break;
    const geld = state.cash + headroom(state, balance) - (ungebohrt + 1) * stageCost(balance, 1);
    const best = freeParcels(state, balance.bots.greedy.minChance).find((id) => leaseTerms(state, balance, id).bonus <= geld);
    if (best === undefined) break;
    const bonus = leaseTerms(state, balance, best).bonus;
    // Bargeld für den Verzögerungszins behalten – ohne ihn verfällt die Pacht sofort.
    const next = withLoan(state, balance, best, 'lease', bonus, rentDue(state, balance) + balance.lease.delayRental);
    if (next === state) break;
    state = next;
  }
  return state;
}

// --- ausgewogen (2.15, Standard-Bot) -------------------------------------------

/**
 * So viel darf der ausgewogene Bot noch leihen: höchstens maxDebtShare des
 * Bankrahmens insgesamt, und nie mehr, als die Bank gerade gibt.
 */
export function balancedBorrowable(state: GameState, balance: Balance): number {
  const anteil = balancedEmergency(state) ? balance.bots.balanced.emergencyDebtShare : balance.bots.balanced.maxDebtShare;
  const grenze = anteil * creditLimit(state, balance) - debt(state);
  return Math.max(0, Math.min(headroom(state, balance), Math.floor(grenze)));
}

/**
 * Notfallregel: Ohne fördernde Quelle und ohne Land, auf dem noch etwas passiert,
 * kommt kein Geld mehr herein – dann leiht der Standard-Bot bis emergencyDebtShare des
 * Bankrahmens für den nächsten Versuch, statt nach zwei trockenen Löchern bis zum Kapitelende zu warten.
 */
export function balancedEmergency(state: GameState): boolean {
  if (roundsLeft(state) <= 2) return false;
  // Erst nach mindestens einem trockenen Loch – am Anfang reicht die Startkasse.
  if (!state.wells.some((w) => w.status === 'dry')) return false;
  if (state.wells.some((w) => w.status !== 'dry')) return false;
  return undrilled(state).length === 0 && jacobsOptions(state).length === 0;
}

/** Zahlt eine Aktion; fehlt Geld bis zur Rücklage, leiht er den Rest – aber nur im eigenen Rahmen. */
function balancedPay(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind, cost: number, keep = 0): GameState {
  const cashReserve = balance.bots.balanced.cashReserve + keep;
  if (state.cash - cost >= cashReserve) return act(state, balance, parcelId, kind);
  const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + cashReserve - state.cash));
  if (amount > balancedBorrowable(state, balance)) return state;
  const loan = takeLoan(state, balance, amount);
  if (!loan.ok) return state;
  const r = applyAction(loan.state, balance, parcelId, kind);
  return r.ok ? r.state : state;
}

function balancedTurn(state: GameState, balance: Balance, catalog: readonly EventDef[], ledger: TransportLedger): GameState {
  const { minChance, cashReserve, maxStage, maxUndrilled } = balance.bots.balanced;
  state = transportTurn(state, balance, 'ausgewogen', catalog, ledger);
  for (const well of openWells(state)) {
    const vorher = state;
    const next = well.stage + 1;
    if (well.status === 'stuck') state = balancedPay(state, balance, well.parcelId, 'fish', balance.drilling.fishingCost);
    else if (next <= maxStage && next <= balance.drilling.stages.length) {
      state = balancedPay(state, balance, well.parcelId, 'deeper', stageCost(balance, next));
    }
    if (state === vorher) state = act(state, balance, well.parcelId, 'abandon');
  }
  for (const option of jacobsOptions(state)) state = balancedPay(state, balance, option.parcelId, 'exercise', option.bonus);
  state = investRigs(state, balance, 'ausgewogen', purseFor(balance, 'ausgewogen'));
  // Nach einem trockenen Loch und ohne fördernde Quelle zählt nur der nächste Fund: Dann bohrt er auch ohne Rücklage.
  // In den letzten beiden Runden nicht mehr: Wer dann ins Minus rutscht, ist am Kapitelende pleite.
  const ohneQuelle = roundsLeft(state) > 2 && state.wells.some((w) => w.status === 'dry') && !state.wells.some((w) => w.status === 'found');
  for (const parcelId of undrilled(state)) {
    state = balancedPay(state, balance, parcelId, 'drill', stageCost(balance, 1), ohneQuelle ? -balance.bots.balanced.cashReserve : 0);
  }
  // Ausbau (0.2.15+7): was sich laut Rechnung bezahlt macht, im eigenen Kreditrahmen.
  state = investWells(state, balance, 'ausgewogen', purseFor(balance, 'ausgewogen'));
  // Neues Land nur, wenn danach auch die erste Bohrstufe und die Rücklage bezahlbar bleiben.
  if (undrilled(state).length + jacobsOptions(state).length < maxUndrilled) {
    const geld = state.cash + balancedBorrowable(state, balance) - cashReserve - stageCost(balance, 1);
    const best = freeParcels(state, minChance).find((id) => leaseTerms(state, balance, id).bonus <= geld);
    if (best !== undefined) {
      const bonus = leaseTerms(state, balance, best).bonus;
      // Im Notfall das Geld für die erste Bohrstufe gleich mitleihen: Nach dem Kredit kann das
      // Rating auf D fallen, dann gäbe die Bank nächste Runde nichts mehr, und die Pacht verfiele.
      state = balancedEmergency(state) ? balancedPay(state, balance, best, 'lease', bonus, stageCost(balance, 1)) : balancedPay(state, balance, best, 'lease', bonus);
    }
  }
  return state;
}

// --- Erkundung (Etappe 1) ---------------------------------------------------------

/**
 * So viel Geld hätte der Bot für einen Pachtbonus übrig – fürs Erkunden zählt nicht,
 * ob er gerade noch ungebohrtes Land hält: Er schaut sich schon nach dem nächsten um.
 */
function landBudget(state: GameState, balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>): number {
  const stufe1 = stageCost(balance, 1);
  switch (strategy) {
    case 'ausgewogen':
      return state.cash + balancedBorrowable(state, balance) - balance.bots.balanced.cashReserve - stufe1;
    case 'vorsichtig':
      return state.cash - balance.bots.cautious.cashReserve - stufe1;
    case 'gierig':
      return state.cash + headroom(state, balance) - (undrilled(state).length + 1) * stufe1;
  }
}

/**
 * Erkunden vor dem Pachten (Etappe 1): Kennt der Bot weniger als known bezahlbare
 * freie Ranches mit mindestens bots.explore.until Fundchance, reitet er übers
 * Land – höchstens rides Mal je Runde, vor den Briefen (die Zeit ist sonst weg).
 */
function exploreTurn(state: GameState, balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>, catalog: readonly EventDef[]): GameState {
  const { rides, until, known } = balance.bots.explore[strategyKey(strategy)];
  for (let i = 0; i < rides; i++) {
    // Auch wer gerade knapp bei Kasse ist, sieht sich um: Reiten kostet nur Zeit, und das Geld kommt wieder.
    const budget = Math.max(landBudget(state, balance, strategy), balance.start.cash);
    if (freeParcels(state, until).filter((id) => leaseTerms(state, balance, id).bonus <= budget).length >= known) break;
    const ziel = suggestRide(state, balance, budget);
    if (ziel === null) break;
    const r = bookCard(state, balance, catalog, 'ritt', ziel);
    if (!r.ok) break;
    state = r.state;
  }
  return state;
}

// --- Ereignisse (2.15) -----------------------------------------------------------

/** Wie der Bot eine Antwort bewertet; reserve = Bargeld, das danach bleiben muss. */
export interface EventPolicy extends BotEventWeights {
  reserve: number;
}

export function eventPolicy(balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>): EventPolicy {
  switch (strategy) {
    case 'vorsichtig':
      return { ...balance.bots.events.cautious, reserve: balance.bots.cautious.cashReserve };
    case 'gierig':
      return { ...balance.bots.events.greedy, reserve: 0 };
    case 'ausgewogen':
      return { ...balance.bots.events.balanced, reserve: balance.bots.balanced.cashReserve };
  }
}

/** Den Verkauf an Crane (frühes Ende) wählt kein Bot: die Bot-Läufe messen das ganze Kapitel. */
function endsGame(choice: EventChoice): boolean {
  return choice.marks.includes(RIVAL_MARKS.craneSold);
}

/** Barrel, die Jacob bis Kapitelende noch fördert (grob): letzte Förderung × Restrunden. Für den Bahntarif. */
function barrelsAhead(state: GameState): number {
  const jeRunde = state.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
  return jeRunde * Math.max(0, state.totalRounds - state.round + 1);
}

/** Wert der Effekte in $ – ohne Termine. Kraft zählt nur, soweit sie unter dem Höchstwert Platz hat. */
/**
 * Befristete Nachwirkungen (0.2.15+3) grob in $: Preis und Förderung auf die
 * Förderung der nächsten timedRounds Runden, Pacht auf relevance.refLeaseSpend.
 */
function timedValue(state: GameState, balance: Balance, e: EventChoice['effects']): number {
  const runden = Math.min(balance.events.timedRounds, Math.max(0, state.totalRounds - state.round + 1));
  const jeRunde = state.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
  return (
    (e.price ?? 0) * jeRunde * runden +
    (e.production ?? 0) * jeRunde * runden * state.postedPrice -
    (e.leaseCost ?? 0) * balance.events.relevance.refLeaseSpend
  );
}

function effectValue(state: GameState, balance: Balance, choice: EventChoice, policy: EventPolicy, extraStrength = 0): number {
  const e = choice.effects;
  const kraft = (e.strength ?? 0) + extraStrength;
  const wirksam = kraft > 0 ? Math.min(kraft, state.strengthMax - state.strength) : kraft;
  return (
    (e.cash ?? 0) +
    (e.oilStock ?? 0) * state.postedPrice +
    wirksam * policy.strength +
    ((e.ruth ?? 0) + (e.thomas ?? 0) + (e.clara ?? 0)) * policy.family -
    (e.railTariff ?? 0) * barrelsAhead(state) +
    timedValue(state, balance, e)
  );
}

/**
 * Wert einer Antwort, die der Bot jetzt geben könnte, oder null, wenn sie nicht
 * geht oder er sie nicht will (Verkauf an Crane, Überstunden zu müde, Rücklage).
 */
export function choiceValue(state: GameState, balance: Balance, event: EventDef, choice: EventChoice, policy: EventPolicy): number | null {
  if (endsGame(choice) || choiceReason(state, balance, event, choice) !== null) return null;
  const cost = choiceCost(event, choice);
  const over = overtimeFor(state, cost);
  if (over > 0 && state.strength < policy.overtimeFrom) return null;
  const cash = choice.effects.cash ?? 0;
  if (cash < 0 && state.cash + cash < policy.reserve) return null;
  return effectValue(state, balance, choice, policy, -over * balance.agenda.overtimeCost) - cost * policy.appointment;
}

/** Was ohne Antwort passiert: die Standard-Wahl wie in autoResolve, ohne Termine. Feste Termine: nichts. */
function baseline(state: GameState, balance: Balance, event: EventDef, policy: EventPolicy): number {
  if (event.routine) return 0;
  const standard = event.choices.find((c) => c.default) ?? event.choices[0];
  return standard ? effectValue(state, balance, standard, policy) : 0;
}

/** Alles, worauf Jacob gerade antworten kann: offene Ereignisse und feste Termine. */
function openItems(state: GameState, catalog: readonly EventDef[]): EventDef[] {
  const offen = state.events.pending.flatMap((id) => catalog.filter((e) => e.id === id));
  return [...offen, ...catalog.filter((e) => routineOffered(state, e))];
}

/**
 * Beantwortet Ereignisse und nimmt feste Termine wahr: immer die Antwort mit dem
 * größten Gewinn gegenüber „liegen lassen“, bis keine mehr etwas bringt oder die
 * Zeit fehlt. Was liegen bleibt, bekommt am Rundenende die Standard-Wahl.
 */
export function answerEvents(state: GameState, balance: Balance, catalog: readonly EventDef[], policy: EventPolicy): GameState {
  for (let i = 0; i < 30; i++) {
    let best: { event: EventDef; choice: EventChoice; gain: number } | null = null;
    for (const event of openItems(state, catalog)) {
      const basis = baseline(state, balance, event, policy);
      for (const choice of event.choices) {
        const wert = choiceValue(state, balance, event, choice, policy);
        if (wert === null) continue;
        const gain = wert - basis;
        if (gain > (best?.gain ?? 0)) best = { event, choice, gain };
      }
    }
    if (!best) break;
    const r = resolveEvent(state, balance, catalog, best.event.id, best.choice.id);
    if (!r.ok) break;
    state = r.state;
  }
  return state;
}

/** Zufall: Jedes offene Ereignis und jeder feste Termin wird mit halber Chance zufällig beantwortet. */
function randomAnswers(state: GameState, balance: Balance, catalog: readonly EventDef[], rng: Rng): GameState {
  for (const event of openItems(state, catalog)) {
    if (rng.float() >= 0.5) continue;
    const moeglich = event.choices.filter((c) => !endsGame(c) && choiceReason(state, balance, event, c) === null);
    if (moeglich.length === 0) continue;
    const r = resolveEvent(state, balance, catalog, event.id, rng.pick(moeglich).id);
    if (r.ok) state = r.state;
  }
  return state;
}

// --- zufällig -----------------------------------------------------------------

/** Alle Aktionen, die gerade gehen, über alle Parzellen. */
export function okActions(state: GameState, balance: Balance): { parcelId: string; kind: DeskActionKind }[] {
  return state.parcels.flatMap((p) =>
    parcelActions(state, balance, p.id)
      .filter((a) => a.ok)
      .map((a) => ({ parcelId: p.id, kind: a.kind })),
  );
}

function randomTurn(state: GameState, balance: Balance, rng: Rng, ledger: TransportLedger): GameState {
  state = randomLogistics(sell(state, balance, rng.float(), ledger, rng.float() < 0.5), balance, rng, ledger);
  for (let i = 0; i < balance.bots.random.actionsPerRound; i++) {
    const moeglich = okActions(state, balance);
    if (moeglich.length === 0) break;
    const wahl = rng.pick(moeglich);
    state = act(state, balance, wahl.parcelId, wahl.kind);
  }
  return state;
}

/**
 * Eine Runde Aktionen nach der Strategie – ohne endRound. Mit Katalog (2.15)
 * beantwortet der Bot zuerst Ereignisse und nimmt feste Termine wahr.
 */
export function botTurn(
  state: GameState,
  balance: Balance,
  strategy: Strategy,
  rng: Rng,
  catalog: readonly EventDef[] = [],
  ledger: TransportLedger = newLedger(),
): GameState {
  if (state.finished) return state;
  // Erkundung (Etappe 1): Die planenden Bots reiten übers Land, bevor die Briefe die Zeit fressen.
  if (strategy !== 'zufaellig') state = exploreTurn(state, balance, strategy, catalog);
  // Etappe 2: Preis- und Fracht-Karten nach bots.plans – ebenfalls vor den Briefen.
  if (strategy !== 'zufaellig') state = planTurn(state, balance, strategy, catalog);
  if (catalog.length > 0) {
    state = strategy === 'zufaellig' ? randomAnswers(state, balance, catalog, rng) : answerEvents(state, balance, catalog, eventPolicy(balance, strategy));
  }
  switch (strategy) {
    case 'vorsichtig':
      return cautiousTurn(state, balance, catalog, ledger);
    case 'gierig':
      return greedyTurn(state, balance, catalog, ledger);
    case 'ausgewogen':
      return balancedTurn(state, balance, catalog, ledger);
    case 'zufaellig':
      return randomTurn(state, balance, rng, ledger);
  }
}

export interface GameResult {
  bankrupt: boolean;
  /** Kapitelprüfung (2.11) bestanden. */
  goal: boolean;
  empire: number;
  rounds: number;
  /** Termine zu Rundenbeginn, über alle gespielten Runden summiert (krank = 0). */
  appointments: number;
  /** Runden, die Jacob krank war. */
  sickRounds: number;
  /** Buchführung je Transportweg (0.2.15+4). */
  transport: TransportLedger;
  /** Lief in dieser Partie eine Pipeline? */
  pipeline: boolean;
  /** Ausbau (0.2.15+8): höchste Zahl Türme zugleich, Pumpen, Ranches mit Quelle und davon ausgebaute. */
  build: BuildStats;
  /** Erkundung (Etappe 1): Termine dafür, gewählte Pachten, Prognosen zum Nachprüfen. */
  explore: ExploreStats;
  /** Preis- und Transport-Aktionen (Etappe 2). */
  plans: PlanStats;
  state: GameState;
}

/** Preis- und Transport-Aktionen einer Partie (Etappe 2) – für die Abnahme. */
export interface PlanStats {
  /** Gegründete und geplatzte Förderbremsen. */
  cartels: number;
  collapses: number;
  /** Je Runde mit Förderbremse: Kartellanteil, Preisplus gegenüber „ohne“ (Anteil), Gründungsrunde? */
  effects: { share: number; uplift: number; first: boolean }[];
  /**
   * Mehrerlös je Förderbremse ($): Preisplus × verkaufte Barrel der Folgerunde − Bewirtung − Wert des
   * Öls, das Jacob selbst gedrosselt hat (zum Preis der Runde, abzüglich dessen, was es im Boden noch zählt).
   */
  pactValues: number[];
  /** Mehrerlös je beendetem Liefervertrag ($, negativ = Verlust). */
  contracts: number[];
  /** Besuche bei Thorne, Tarifsenkung insgesamt, riskierte und erwischte Bluffs. */
  visits: number;
  tariffCut: number;
  bluffsRisked: number;
  bluffsCaught: number;
  /** Höchster Posted Price der Partie. */
  maxPrice: number;
}

function newPlanStats(): PlanStats {
  return { cartels: 0, collapses: 0, effects: [], pactValues: [], contracts: [], visits: 0, tariffCut: 0, bluffsRisked: 0, bluffsCaught: 0, maxPrice: 0 };
}

/** Nach jeder Runde: Wirkung der Förderbremse und ihr Mehrerlös (Preisplus wirkt auf die Verkäufe der Folgerunde). */
function recordPlans(stats: PlanStats, vorher: GameState, nachher: GameState, offen: { dp: number; pakt: number } | null, balance: Balance): { dp: number; pakt: number } | null {
  const p = nachher.pricing;
  if (!p) return null;
  if (offen && stats.pactValues[offen.pakt] !== undefined) stats.pactValues[offen.pakt] += offen.dp * p.sold;
  while (stats.pactValues.length < p.founded) stats.pactValues.push(-(balance.plans.cards.foerderbremse?.cash ?? 0));
  const e = p.effect;
  if (e && e.round === vorher.round && e.cartel && e.without > 0) {
    stats.effects.push({ share: e.share, uplift: e.price / e.without - 1, first: e.first });
    // Gedrosseltes eigenes Öl: Förderung dieser Runde × Drossel ÷ (1 − Drossel).
    const gefoerdert = nachher.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
    const gedrosselt = e.jacobCut < 1 ? (gefoerdert * e.jacobCut) / (1 - e.jacobCut) : 0;
    if (stats.pactValues[p.founded - 1] !== undefined) stats.pactValues[p.founded - 1] -= gedrosselt * e.price * (1 - balance.empire.reserveFactor);
    return { dp: e.price - e.without, pakt: p.founded - 1 };
  }
  return null;
}

/** Eine selbst gewählte Pacht (nicht aus einer Option) – fürs Nachprüfen der Erkundung. */
export interface LeaseChoice {
  /** Wusste Jacob etwas über die Ranch (Wissensstufe ab 1)? */
  known: boolean;
  /** Liegt dort wirklich Öl? */
  oil: boolean;
  /** Ölanteil aller freien Ranches in diesem Moment – so oft hätte eine blinde Wahl getroffen. */
  blind: number;
  /** Mitte der Prognose, die Jacob sah (null ohne Prognose). */
  shown: number | null;
}

/** Erkundung einer Partie (Etappe 1). */
export interface ExploreStats {
  /** Termine in Erkundungs-Karten in den Runden 1–6 (Summe). */
  appointmentsEarly: number;
  /** Davon gezählte Runden (gesund und gespielt). */
  roundsEarly: number;
  leases: LeaseChoice[];
  /** Prognosen aller bekannten, noch nicht selbst gebohrten Ranches zu Beginn von Runde 7: Mitte und Wahrheit. */
  forecasts: { shown: number; oil: boolean }[];
}

/** Erkundungs-Kennzahlen einer Runde: Termine, neue selbst gewählte Pachten. */
function recordExplore(stats: ExploreStats, vorher: GameState, nachher: GameState, balance: Balance): void {
  if (vorher.round <= 6) {
    stats.appointmentsEarly += exploreAppointments(nachher, balance);
    stats.roundsEarly++;
  }
  const frei = vorher.parcels.filter((p) => !p.discovery && !leaseOf(vorher, p.id) && !optionOf(vorher, p.id));
  const blind = frei.length > 0 ? frei.filter((p) => p.geology !== 'dry').length / frei.length : 0;
  for (const l of nachher.leases) {
    if (l.holder !== 'jacob' || leaseOf(vorher, l.parcelId) || optionOf(vorher, l.parcelId)?.holder === 'jacob') continue;
    const p = nachher.parcels.find((x) => x.id === l.parcelId)!;
    const f = nachher.forecasts[p.id];
    stats.leases.push({ known: knowledgeOf(nachher, p.id).level >= 1, oil: p.geology !== 'dry', blind, shown: f ? (f.low + f.high) / 2 : null });
  }
}

/** Prognosen zum Nachprüfen: jede bekannte Ranch mit Prognose, auf der Jacob noch nicht gebohrt hat. */
function forecastSnapshot(state: GameState): { shown: number; oil: boolean }[] {
  const gebohrt = new Set(state.wells.map((w) => w.parcelId));
  return state.parcels
    .filter((p) => !p.discovery && !gebohrt.has(p.id) && knowledgeOf(state, p.id).level >= 1 && state.forecasts[p.id])
    .map((p) => ({ shown: (state.forecasts[p.id].low + state.forecasts[p.id].high) / 2, oil: p.geology !== 'dry' }));
}

/** Ausbau einer Partie (0.2.15+8). */
export interface BuildStats {
  /** Höchste Zahl Türme zugleich (Silas' Turm mitgezählt). */
  rigs: number;
  /** Quellen mit Pumpe am Ende. */
  pumps: number;
  /** Fündige Bohrlöcher über das erste je Ranch hinaus. */
  extraWells: number;
  /** Ranches mit mindestens einer fündigen Quelle. */
  producing: number;
  /** Davon ausgebaut: Pumpe oder mehr als ein fündiges Bohrloch. */
  expanded: number;
}

/** Zählt den Ausbau am Ende einer Partie; rigs = höchste Turmzahl, die die Partie gesehen hat. */
export function buildStats(state: GameState, rigs = state.rigs.length): BuildStats {
  const funde = state.wells.filter((w) => w.status === 'found');
  const ranches = new Map<string, Well[]>();
  for (const w of funde) ranches.set(w.parcelId, [...(ranches.get(w.parcelId) ?? []), w]);
  const ausgebaut = [...ranches.values()].filter((ws) => ws.length > 1 || ws.some((w) => w.pump)).length;
  return {
    rigs,
    pumps: funde.filter((w) => w.pump).length,
    extraWells: funde.length - ranches.size,
    producing: ranches.size,
    expanded: ausgebaut,
  };
}

/**
 * Spielt eine ganze Partie bis zum Ende des Kapitels oder bis zur Pleite. Mit
 * Katalog (2.15) kommen Ereignisse, Briefe und feste Termine dazu.
 */
export function playGame(seed: string, balance: Balance, strategy: Strategy, catalog: readonly EventDef[] = []): GameResult {
  let state = newGame(seed, balance, catalog);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  let rounds = 0;
  let appointments = 0;
  let sickRounds = 0;
  const ledger = newLedger();
  let maxRigs = state.rigs.length;
  const explore: ExploreStats = { appointmentsEarly: 0, roundsEarly: 0, leases: [], forecasts: [] };
  const plans = newPlanStats();
  let offen: { dp: number; pakt: number } | null = null;
  while (!state.finished) {
    if (rounds >= state.totalRounds + 5) {
      throw new Error(`Partie ${seed} (${strategy}) endet nicht nach ${rounds} Runden.`);
    }
    if (state.sick > 0) sickRounds++;
    else appointments += state.agenda.budget;
    if (state.round === 7) explore.forecasts = forecastSnapshot(state);
    const gezogen = botTurn(state, balance, strategy, rng, catalog, ledger);
    recordExplore(explore, state, gezogen, balance);
    maxRigs = Math.max(maxRigs, gezogen.rigs.length);
    state = endRound(gezogen, balance, catalog);
    bookRound(gezogen, state, balance, ledger);
    offen = recordPlans(plans, gezogen, state, offen, balance);
    rounds++;
  }
  const bankrupt = state.ending === 'pleite';
  plans.cartels = state.pricing?.founded ?? 0;
  plans.collapses = state.pricing?.collapsed ?? 0;
  plans.contracts = [...(state.pricing?.contractResults ?? []), ...(state.pricing?.contract ? [state.pricing.contract.gain] : [])];
  plans.visits = state.freight?.visits ?? 0;
  plans.tariffCut = state.freight?.cutTotal ?? 0;
  plans.bluffsRisked = state.freight?.bluffsRisked ?? 0;
  plans.bluffsCaught = state.freight?.bluffsCaught ?? 0;
  plans.maxPrice = Math.max(...state.priceHistory);
  return {
    bankrupt,
    goal: !bankrupt && chapterCheck(state, balance).passed,
    empire: empireValue(state, balance),
    rounds,
    appointments,
    sickRounds,
    transport: ledger,
    pipeline: state.events.marks[LOGISTICS_MARKS.built] !== undefined,
    build: buildStats(state, maxRigs),
    explore,
    plans,
    state,
  };
}

/**
 * Buchführung am Rundenende: Löhne gehen auf die eigenen Fuhrwerke, Streckenwärter
 * und Wachleute auf die Pipeline, Thornes Strafe für fehlende Mindestmenge auf die
 * Bahn, eine Reparatur nach Sabotage auf die Pipeline.
 */
export function bookRound(vorher: GameState, nachher: GameState, balance: Balance, ledger: TransportLedger): void {
  const fix = fixedCosts(vorher, balance);
  ledger.teams.costs += fix.wages;
  ledger.pipeline.costs += fix.upkeep + fix.guards;
  ledger.rail.costs += Math.max(0, volumeObligation(vorher, balance) - vorher.shipped.rail) * balance.transport.thorne.shortfallPenalty;
  if (vorher.logistics.pipeline === 'ready' && nachher.logistics.pipeline === 'damaged') ledger.pipeline.costs += balance.transport.pipeline.repairCost;
}

// --- Einstieg (2.13) ------------------------------------------------------------

/**
 * Ein Zug nach den Tutorial-Hinweisen: tut genau, was der Hinweis sagt, bis er
 * „Runde beenden“ sagt, eine Aktion scheitert oder der Einstieg vorbei ist.
 * Höchstens maxSteps Schritte, damit ein Fehler im Hinweis nicht hängen bleibt.
 */
export function hintTurn(state: GameState, balance: Balance, maxSteps = 20): GameState {
  for (let i = 0; i < maxSteps; i++) {
    const hint = tutorialHint(state, balance);
    if (!hint || hint.action.kind === 'endRound') return state;
    const action = hint.action;
    const r =
      action.kind === 'sell'
        ? sellOil(state, balance, action.mode, action.barrels)
        : action.kind === 'loan'
          ? takeLoan(state, balance, action.amount)
          : action.kind === 'plan'
            ? bookCard(state, balance, [], action.cardId, action.parcelId)
            : applyAction(state, balance, action.parcelId, action.kind);
    if (!r.ok) return state;
    state = r.state;
  }
  return state;
}

export interface HintGame {
  /** Hat der Bot im Einstieg eine eigene Quelle gefunden? */
  found: boolean;
  /** Runde, in der die erste Quelle fündig wurde (am Ende dieser Runde), sonst null. */
  foundRound: number | null;
  /** Hat er in dieser Zeit Öl verkauft? */
  sold: boolean;
  state: GameState;
}

/**
 * Ein neuer Spieler, der nur den Hinweisen folgt: spielt, solange der Einstieg
 * läuft (höchstens bis zum Kapitelende), und meldet, ob er eine Quelle gefunden hat.
 * Ereignisse bekommen ihre Standardantwort – der Bot liest keine Briefe.
 */
export function playByHints(seed: string, balance: Balance, catalog: readonly EventDef[] = []): HintGame {
  let state = newGame(seed, balance, catalog);
  let foundRound: number | null = null;
  let sold = false;
  while (!state.finished && tutorialHint(state, balance) !== null) {
    state = hintTurn(state, balance);
    if (TRANSPORT_MODES.some((m) => state.shipped[m] > 0)) sold = true;
    const runde = state.round;
    state = endRound(state, balance, catalog);
    if (foundRound === null && state.wells.some((w) => w.status === 'found')) foundRound = runde;
  }
  return { found: foundRound !== null, foundRound, sold, state };
}

export interface BotRow {
  strategy: Strategy;
  games: number;
  bankruptRate: number;
  /** Anteil der Partien, in denen die Kapitelprüfung (2.11) bestanden ist. */
  goalRate: number;
  meanEmpire: number;
  /**
   * Anteil der Seeds, in denen diese Strategie den höchsten Imperiumswert hat (Gleichstand wird geteilt).
   * Seit 2.15 nur, wenn der Beste mindestens die Startkasse erreicht – sonst hat niemand gewonnen.
   */
  winRate: number;
  /** Ø Kasse des Rivalen Bullard am Ende der Partie. */
  rivalCash: number;
  /** Ø fündige Quellen Bullards am Ende der Partie. */
  rivalWells: number;
  /** Ø Termine je Runde (2.15; krank = 0 Termine). */
  meanAppointments: number;
  /** Anteil der Runden, die Jacob krank war. */
  sickShare: number;
  /** Jacobs Funde (2.15): Anfangsraten in Barrel je Runde und gemessener Rückgang je Quelle. */
  finds: FindStats;
  /** Buchführung je Transportweg über alle Partien (0.2.15+4). */
  transport: TransportLedger;
  /** Partien mit laufender Pipeline. */
  pipelineGames: number;
  /** Partien mit Kapitelziel – und davon mit Pipeline. */
  goalGames: number;
  pipelineGoalGames: number;
  /** Ausbau über alle Partien summiert (0.2.15+8). */
  build: BuildStats;
  /** Je Seed (in Reihenfolge): Imperiumswert und Pleite – für die Gegenprobe „alles ausbauen“. */
  seeds: { empire: number; bankrupt: boolean }[];
  /** Kreditzyklus (4.4): Partien auf Seeds mit bzw. ohne Kreditkrise im Kapitel – und wie viele davon pleite. */
  crisis: { games: number; bankrupt: number };
  calm: { games: number; bankrupt: number };
}

/**
 * Kommt in der Welt dieses Seeds während des Kapitels eine Kreditkrise (Bankpanik
 * oder Crash, 4.4)? Gemessen an der Welt allein (ohne Jacobs Handeln), damit eine
 * frühe Pleite die Einteilung nicht verzerrt – sonst sähe, wer früh aufgibt, keine Panik mehr.
 */
export function creditCrisisInChapter(seed: string, balance: Balance): boolean {
  let w = newWorld(seed, balance.worldModel);
  for (let r = 0; r < balance.start.rounds; r++) {
    w = advanceWorld(w, balance.worldModel, {}, balance.laws);
    if (w.news.includes('panic') || w.news.includes('crash')) return true;
  }
  return false;
}

/**
 * Wer gewinnt einen Seed? Die Strategie mit dem höchsten Imperiumswert. Eine
 * Pleite zählt immer als letzter Platz – auch hinter einem Imperiumswert unter
 * null, denn wer pleite ist, hat das Kapitel verloren. Bei Gleichstand teilen
 * sich die Besten den Sieg. Gibt je Strategie den Sieganteil 0–1 zurück.
 * minEmpire (2.15): Bleibt auch der Beste unter diesem Imperiumswert (in den
 * Bot-Läufen: die Startkasse), hat niemand gewonnen – wer am wenigsten verliert,
 * ist kein Sieger. Die Karte bleibt dann ohne Sieger (leere Map).
 */
export function seedWinners(
  results: readonly { strategy: Strategy; bankrupt: boolean; empire: number }[],
  minEmpire = -Infinity,
): Map<Strategy, number> {
  const rang = (r: { bankrupt: boolean; empire: number }) => (r.bankrupt ? -Infinity : r.empire);
  const bester = Math.max(...results.map(rang));
  if (bester === -Infinity || bester < minEmpire) return new Map();
  const sieger = results.filter((r) => rang(r) === bester);
  return new Map(sieger.map((r) => [r.strategy, 1 / sieger.length]));
}

/** Summen über Jacobs Funde – zum Zusammenlegen über Strategien. */
export interface FindStats {
  small: number[];
  gusher: number[];
  /** Gemessener Rückgang je Runde, eine Zahl je Quelle mit mindestens zwei Förderrunden. */
  declines: number[];
}

/**
 * Gemessener Rückgang einer Quelle je Runde: aus Anfangsrate und letzter Förderung
 * über die Förderrunden dazwischen – Druckverlust im Feld eingeschlossen. null, wenn
 * die Quelle noch keine zwei Runden gefördert hat.
 */
export function measuredDecline(production: { initialRate: number; roundsProduced: number; lastRate: number }): number | null {
  const { initialRate, roundsProduced, lastRate } = production;
  if (roundsProduced < 2 || initialRate <= 0 || lastRate <= 0) return null;
  return 1 - (lastRate / initialRate) ** (1 / (roundsProduced - 1));
}

function findStats(state: GameState): FindStats {
  const out: FindStats = { small: [], gusher: [], declines: [] };
  for (const w of state.wells) {
    if (w.status !== 'found' || !w.production || !w.result) continue;
    (w.result === 'gusher' ? out.gusher : out.small).push(w.production.initialRate);
    const d = measuredDecline(w.production);
    if (d !== null) out.declines.push(d);
  }
  return out;
}

/**
 * Spielt games Partien je Strategie, für jede Strategie mit denselben Seeds.
 * catalog: Ereignisse aus content/events/ (2.15); ohne Katalog spielen die Bots ohne Ereignisse.
 */
export function runBots(balance: Balance, games = balance.bots.games, catalog: readonly EventDef[] = []): BotRow[] {
  const summe = new Map(
    STRATEGIES.map((s) => [
      s,
      {
        pleiten: 0,
        ziel: 0,
        wert: 0,
        siege: 0,
        bKasse: 0,
        bQuellen: 0,
        termine: 0,
        runden: 0,
        krank: 0,
        finds: { small: [], gusher: [], declines: [] } as FindStats,
        transport: newLedger(),
        pipeline: 0,
        pipelineZiel: 0,
        build: { rigs: 0, pumps: 0, extraWells: 0, producing: 0, expanded: 0 } as BuildStats,
        seeds: [] as { empire: number; bankrupt: boolean }[],
        crisis: { games: 0, bankrupt: 0 },
        calm: { games: 0, bankrupt: 0 },
      },
    ]),
  );
  for (let i = 0; i < games; i++) {
    const seed = `${balance.bots.seedPrefix}-${i}`;
    const krise = creditCrisisInChapter(seed, balance);
    const results = STRATEGIES.map((strategy) => {
      const r = playGame(seed, balance, strategy, catalog);
      const s = summe.get(strategy)!;
      const gruppe = krise ? s.crisis : s.calm;
      gruppe.games++;
      if (r.bankrupt) gruppe.bankrupt++;
      if (r.bankrupt) s.pleiten++;
      if (r.goal) s.ziel++;
      s.wert += r.empire;
      s.bKasse += r.state.rival.cash;
      s.bQuellen += r.state.rival.wells.filter((w) => w.status === 'found').length;
      s.termine += r.appointments;
      s.runden += r.rounds;
      s.krank += r.sickRounds;
      const f = findStats(r.state);
      s.finds.small.push(...f.small);
      s.finds.gusher.push(...f.gusher);
      s.finds.declines.push(...f.declines);
      addLedger(s.transport, r.transport);
      if (r.pipeline) s.pipeline++;
      if (r.pipeline && r.goal) s.pipelineZiel++;
      for (const k of Object.keys(s.build) as (keyof BuildStats)[]) s.build[k] += r.build[k];
      s.seeds.push({ empire: r.empire, bankrupt: r.bankrupt });
      return { strategy, bankrupt: r.bankrupt, empire: r.empire };
    });
    for (const [strategy, anteil] of seedWinners(results, balance.start.cash)) summe.get(strategy)!.siege += anteil;
  }
  return STRATEGIES.map((strategy) => {
    const s = summe.get(strategy)!;
    const anteil = (x: number) => (games > 0 ? x / games : 0);
    return {
      strategy,
      games,
      bankruptRate: anteil(s.pleiten),
      goalRate: anteil(s.ziel),
      meanEmpire: anteil(s.wert),
      winRate: anteil(s.siege),
      rivalCash: anteil(s.bKasse),
      rivalWells: anteil(s.bQuellen),
      meanAppointments: s.runden > 0 ? s.termine / s.runden : 0,
      sickShare: s.runden > 0 ? s.krank / s.runden : 0,
      finds: s.finds,
      transport: s.transport,
      pipelineGames: s.pipeline,
      goalGames: s.ziel,
      pipelineGoalGames: s.pipelineZiel,
      build: s.build,
      seeds: s.seeds,
      crisis: s.crisis,
      calm: s.calm,
    };
  });
}

/** Kennzahl Kreditzyklus (4.4): Pleitequote je Strategie in Welten mit und ohne Kreditkrise im Kapitel. */
export function crisisTable(rows: readonly BotRow[]): string {
  const quote = (g: { games: number; bankrupt: number }) => (g.games > 0 ? prozent(g.bankrupt / g.games) : '–');
  const kopf = '| Strategie | Seeds mit Kreditkrise | Bankrottquote dort | Seeds ohne | Bankrottquote dort |\n| --- | ---: | ---: | ---: | ---: |';
  const zeilen = rows.map((r) => `| ${r.strategy} | ${r.crisis.games.toLocaleString('de-DE')} | ${quote(r.crisis)} | ${r.calm.games.toLocaleString('de-DE')} | ${quote(r.calm)} |`);
  return [kopf, ...zeilen].join('\n');
}

// --- Gegenproben Ausbau (0.2.15+8) ---------------------------------------------

/** Ergebnis des Standard-Bots mit anderem Ausbau-Charakter, je Seed verglichen mit dem echten. */
export interface InvestVariant {
  games: number;
  meanEmpire: number;
  bankruptRate: number;
  build: BuildStats;
  /** Anteil der Seeds (mit unterschiedlichem Ausgang), in denen die Variante besser abschneidet als der Standard-Bot. */
  beatsStandard: number;
}

/** Ausbau-Charakter der Gegenproben: „nie ausbauen“ (nur Silas' Turm, keine Pumpe, kein weiteres Loch) und „alles ausbauen“. */
export function investVariant(balance: Balance, kind: 'none' | 'all'): BotInvest {
  return kind === 'none'
    ? { pumpPayback: 0, wellPayback: 0, rigs: 1, rent: false, steam: false, rods: false }
    : { pumpPayback: Infinity, wellPayback: Infinity, rigs: balance.drilling.rigs.max, rent: true, steam: true, rods: true };
}

/**
 * Spielt den Standard-Bot (ausgewogen) auf denselben Seeds mit einem anderen
 * Ausbau-Charakter und vergleicht je Seed mit standard (Pleite = letzter Platz).
 */
export function runInvestVariant(balance: Balance, invest: BotInvest, standard: BotRow, catalog: readonly EventDef[] = []): InvestVariant {
  const b: Balance = { ...balance, bots: { ...balance.bots, invest: { ...balance.bots.invest, balanced: invest } } };
  const games = standard.seeds.length;
  const build: BuildStats = { rigs: 0, pumps: 0, extraWells: 0, producing: 0, expanded: 0 };
  let wert = 0;
  let pleiten = 0;
  let besser = 0;
  let anders = 0;
  const rang = (r: { empire: number; bankrupt: boolean }) => (r.bankrupt ? -Infinity : r.empire);
  for (let i = 0; i < games; i++) {
    const r = playGame(`${balance.bots.seedPrefix}-${i}`, b, 'ausgewogen', catalog);
    wert += r.empire;
    if (r.bankrupt) pleiten++;
    for (const k of Object.keys(build) as (keyof BuildStats)[]) build[k] += r.build[k];
    const a = rang(r);
    const s = rang(standard.seeds[i]);
    if (a !== s) {
      anders++;
      if (a > s) besser++;
    }
  }
  return {
    games,
    meanEmpire: games > 0 ? wert / games : 0,
    bankruptRate: games > 0 ? pleiten / games : 0,
    build,
    beatsStandard: anders > 0 ? besser / anders : 0,
  };
}

/**
 * Blinde Wildcat-Bohrung (GDD §15: „etwa 1 von 5 bis 1 von 10“): Wer ohne
 * Geologen irgendeine Parzelle in Randlage (weit weg vom bekannten Fund) bis zur
 * Zieltiefe (Stufe 1) bohrt – wie oft trifft er Öl? Erwartungswert über alle
 * Randlage-Parzellen der Karten der Bot-Seeds; nur die Geologie zählt, kein Bot.
 */
export function blindWildcatChance(balance: Balance, games = balance.bots.games): number {
  const rand = balance.lease.locations[balance.lease.locations.length - 1];
  const stufe1 = balance.drilling.stages[0].oilShare;
  let summe = 0;
  let n = 0;
  for (let i = 0; i < games; i++) {
    const parcels = generateParcels(balance, `${balance.bots.seedPrefix}-${i}`);
    const funde = parcels.filter((p) => p.discovery);
    for (const p of parcels) {
      if (p.discovery || locationFor(balance, parcels, funde, p).name !== rand.name) continue;
      summe += p.geology === 'dry' ? 0 : stufe1;
      n++;
    }
  }
  return n > 0 ? summe / n : 0;
}

/** Eine Zeile der Zielwert-Tabelle (2.15). */
export interface TargetRow {
  id: BotTargetId;
  /** Was gemessen wird. */
  label: string;
  /** Wo der Zielwert herkommt und wie er im GDD steht. */
  goal: string;
  value: number;
  min: number;
  max: number;
  ok: boolean;
  unit: 'prozent' | 'faktor' | 'zahl';
}

const TARGET_TEXT: Record<BotTargetId, { label: string; goal: string; unit: TargetRow['unit'] }> = {
  winRate: { label: 'Höchste Siegquote einer Strategie', goal: 'GDD §17: keine Einzelstrategie gewinnt in mehr als 40 %', unit: 'prozent' },
  standardBankrupt: { label: 'Pleitequote Standard-Bot (ausgewogen)', goal: 'Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %)', unit: 'prozent' },
  greedyBankrupt: { label: 'Pleitequote gierig', goal: 'GDD §15: wer im Boom zu viele Schulden macht, stirbt (4.20: in der Kreditkrise kündigt die Bank)', unit: 'prozent' },
  cautiousBehind: { label: 'Ø Imperium vorsichtig ÷ bester Ø der Mutigeren', goal: 'GDD §15: wer nie Schulden macht, wird überholt (unter 1)', unit: 'faktor' },
  standardGoal: { label: 'Kapitelziel Standard-Bot (ausgewogen)', goal: 'Kapitelprüfung erreichbar, aber nicht geschenkt', unit: 'prozent' },
  smallRateInRange: { label: 'Kleine Funde mit 50–500 bbl/Tag', goal: 'GDD §15: Anfangsrate 50–500 bbl/Tag', unit: 'prozent' },
  gusherFactor: { label: 'Ø Anfangsrate Gusher ÷ kleiner Fund', goal: 'GDD §15: Gusher deutlich mehr', unit: 'faktor' },
  decline: { label: 'Gemessener Rückgang je Quartal', goal: 'GDD §15: 8–15 %', unit: 'prozent' },
  wildcatHit: { label: 'Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m)', goal: 'GDD §15: etwa 1 von 5 bis 1 von 10', unit: 'prozent' },
  appointments: { label: 'Ø Termine je Runde (Standard-Bot)', goal: 'GDD §15: 5 je Quartal', unit: 'zahl' },
  routeShare: { label: 'Höchster Anteil eines Transportwegs an allen verkauften Barrel', goal: 'GDD §6: kein Weg dominiert, jeder hat seinen Preis', unit: 'prozent' },
  pipelineSuccess: { label: 'Partien mit Kapitelziel, in denen eine Pipeline läuft', goal: 'Pipeline ist eine Wahl, kein Pflichtweg', unit: 'prozent' },
  expandedShare: { label: 'Ausgebaute Quellen (Pumpe oder weiteres Bohrloch), planende Bots', goal: 'Ausbau lohnt für gute Quellen, nicht für jede', unit: 'prozent' },
  investGain: { label: 'Ø Imperium Standard-Bot ÷ derselbe Bot ohne Ausbau', goal: 'Investitionen in gute Quellen zahlen sich aus (über 1)', unit: 'faktor' },
  allOutWins: { label: 'Seeds, in denen „alles ausbauen“ den Standard-Bot schlägt', goal: 'Blind alles ausbauen ist keine Siegformel', unit: 'prozent' },
};

/** Anteil je Weg an allen verkauften Barrel (Händler nicht extra – er fährt über einen der Wege). */
export function routeShares(ledger: TransportLedger): Record<TransportMode, number> {
  const summe = TRANSPORT_MODES.reduce((s, m) => s + ledger[m].barrels, 0);
  return Object.fromEntries(TRANSPORT_MODES.map((m) => [m, summe > 0 ? ledger[m].barrels / summe : 0])) as Record<TransportMode, number>;
}

function totalLedger(rows: readonly BotRow[]): TransportLedger {
  const out = newLedger();
  for (const r of rows) addLedger(out, r.transport);
  return out;
}

function mean(xs: readonly number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Misst alle Kennzahlen aus den Bot-Zeilen und vergleicht sie mit bots.targets. */
export function checkTargets(
  rows: readonly BotRow[],
  wildcatHit: number,
  balance: Balance,
  variants: { none: Pick<InvestVariant, 'meanEmpire'>; all: Pick<InvestVariant, 'beatsStandard'> },
): TargetRow[] {
  const row = (s: Strategy) => rows.find((r) => r.strategy === s);
  const alle = <K extends keyof FindStats>(k: K) => rows.flatMap((r) => r.finds[k]);
  const tag = balance.bots.daysPerRound;
  const klein = alle('small').map((r) => r / tag);
  const gusher = alle('gusher').map((r) => r / tag);
  const mutig = Math.max(row('gierig')?.meanEmpire ?? 0, row('ausgewogen')?.meanEmpire ?? 0);
  const werte: Record<BotTargetId, number> = {
    winRate: Math.max(0, ...rows.map((r) => r.winRate)),
    standardBankrupt: row('ausgewogen')?.bankruptRate ?? 0,
    greedyBankrupt: row('gierig')?.bankruptRate ?? 0,
    cautiousBehind: mutig > 0 ? (row('vorsichtig')?.meanEmpire ?? 0) / mutig : 0,
    standardGoal: row('ausgewogen')?.goalRate ?? 0,
    smallRateInRange: klein.length > 0 ? klein.filter((r) => r >= 50 && r <= 500).length / klein.length : 0,
    gusherFactor: mean(klein) > 0 ? mean(gusher) / mean(klein) : 0,
    decline: mean(alle('declines')),
    wildcatHit,
    appointments: row('ausgewogen')?.meanAppointments ?? 0,
    routeShare: Math.max(0, ...Object.values(routeShares(totalLedger(rows)))),
    pipelineSuccess: (() => {
      const planend = rows.filter((r) => r.strategy !== 'zufaellig');
      const ziel = planend.reduce((s, r) => s + r.goalGames, 0);
      return ziel > 0 ? planend.reduce((s, r) => s + r.pipelineGoalGames, 0) / ziel : 0;
    })(),
    expandedShare: (() => {
      const planend = rows.filter((r) => r.strategy !== 'zufaellig');
      const quellen = planend.reduce((s, r) => s + r.build.producing, 0);
      return quellen > 0 ? planend.reduce((s, r) => s + r.build.expanded, 0) / quellen : 0;
    })(),
    investGain: variants.none.meanEmpire > 0 ? (row('ausgewogen')?.meanEmpire ?? 0) / variants.none.meanEmpire : 0,
    allOutWins: variants.all.beatsStandard,
  };
  return (Object.keys(TARGET_TEXT) as BotTargetId[]).map((id) => {
    const { min, max } = balance.bots.targets[id];
    const value = werte[id];
    return { id, ...TARGET_TEXT[id], value, min, max, ok: value >= min && value <= max };
  });
}

function zahl(value: number, digits: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function zielWert(unit: TargetRow['unit'], value: number): string {
  return unit === 'prozent' ? prozent(value) : zahl(value, 2);
}

/** Markdown-Tabelle Ist/Ziel (2.15). */
export function targetTable(targets: readonly TargetRow[]): string {
  return [
    '| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |',
    '| --- | --- | ---: | ---: | :---: |',
    ...targets.map(
      (t) =>
        `| ${t.label} | ${t.goal} | ${zielWert(t.unit, t.min)} – ${zielWert(t.unit, t.max)} | ${zielWert(t.unit, t.value)} | ${t.ok ? 'ja' : '**nein**'} |`,
    ),
  ].join('\n');
}

function prozent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Markdown-Tabelle: Quoten in % mit einer Nachkommastelle, Werte in ganzen $, Bullards Quellen und Termine mit einer Nachkommastelle. */
export function botTable(rows: readonly BotRow[]): string {
  const zeilen = rows.map(
    (r) =>
      `| ${r.strategy} | ${r.games.toLocaleString('de-DE')} | ${prozent(r.bankruptRate)} | ${prozent(r.goalRate)} | ${Math.round(r.meanEmpire).toLocaleString('de-DE')} $ | ${prozent(r.winRate)} | ${Math.round(r.rivalCash).toLocaleString('de-DE')} $ | ${zahl(r.rivalWells, 1)} | ${zahl(r.meanAppointments, 1)} |`,
  );
  return [
    '| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...zeilen,
  ].join('\n');
}

/**
 * Markdown-Tabelle Ausbau (0.2.15+8): je Strategie und für die beiden Gegenproben
 * Ø höchste Turmzahl, Ø Pumpen, Ø weitere Bohrlöcher, Anteil ausgebauter Quellen
 * (Ranches mit Fund), Ø Imperium und Pleitequote.
 */
export function buildTable(rows: readonly BotRow[], variants: { none: InvestVariant; all: InvestVariant }): string {
  const zeile = (name: string, games: number, b: BuildStats, empire: number, bankrupt: number) => {
    const je = (x: number) => zahl(games > 0 ? x / games : 0, 2);
    return `| ${name} | ${je(b.rigs)} | ${je(b.pumps)} | ${je(b.extraWells)} | ${prozent(b.producing > 0 ? b.expanded / b.producing : 0)} | ${Math.round(empire).toLocaleString('de-DE')} $ | ${prozent(bankrupt)} |`;
  };
  return [
    '| Bot | Ø Bohrtürme (höchstens zugleich) | Ø Pumpen | Ø weitere Bohrlöcher | Anteil ausgebauter Quellen | Ø Imperiumswert | Bankrottquote |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((r) => zeile(r.strategy, r.games, r.build, r.meanEmpire, r.bankruptRate)),
    zeile('ausgewogen, nie ausbauen', variants.none.games, variants.none.build, variants.none.meanEmpire, variants.none.bankruptRate),
    zeile('ausgewogen, alles ausbauen', variants.all.games, variants.all.build, variants.all.meanEmpire, variants.all.bankruptRate),
  ].join('\n');
}

const ROUTE_LABEL: Record<RouteKey, string> = {
  wagon: 'Mietfuhrwerk',
  rail: 'Bahn (Thorne)',
  teams: 'Eigene Fuhrwerke',
  pipeline: 'Pipeline',
  trader: 'davon an den Händler',
};

function dollarJeBarrel(x: number | null): string {
  return x === null ? '–' : `${zahl(x, 2)} $`;
}

/**
 * Markdown-Tabelle Transportwege (0.2.15+4): Anteil an allen verkauften Barrel
 * (gesamt und je Strategie), Erlös nach Fracht und Förderzins, Anlagen- und
 * Fixkosten und Gewinn je Barrel. Der Händler ist ein Käufer – seine Barrel
 * stecken schon in den Wegen, seine Kosten sind Cranes Groll.
 */
export function transportTable(rows: readonly BotRow[]): string {
  const gesamt = totalLedger(rows);
  const anteile = routeShares(gesamt);
  const jeStrategie = rows.map((r) => ({ r, a: routeShares(r.transport), summe: TRANSPORT_MODES.reduce((s, m) => s + r.transport[m].barrels, 0) }));
  const zeile = (k: RouteKey) => {
    const g = gesamt[k];
    const anteil = (x: { r: BotRow; a: Record<TransportMode, number>; summe: number }) =>
      k === 'trader' ? (x.summe > 0 ? x.r.transport.trader.barrels / x.summe : 0) : x.a[k];
    const ges = k === 'trader' ? gesamt.trader.barrels / Math.max(1, TRANSPORT_MODES.reduce((s, m) => s + gesamt[m].barrels, 0)) : anteile[k];
    return `| ${ROUTE_LABEL[k]} | ${prozent(ges)} | ${jeStrategie.map((x) => prozent(anteil(x))).join(' | ')} | ${dollarJeBarrel(g.barrels > 0 ? g.net / g.barrels : null)} | ${dollarJeBarrel(g.barrels > 0 ? g.costs / g.barrels : null)} | ${dollarJeBarrel(profitPerBarrel(g))} |`;
  };
  return [
    `| Weg | Anteil Barrel | ${rows.map((r) => r.strategy).join(' | ')} | Ø Erlös je bbl | Ø Anlagen/Fixkosten je bbl | Ø Gewinn je bbl |`,
    `| --- | ---: | ${rows.map(() => '---:').join(' | ')} | ---: | ---: | ---: |`,
    ...ROUTE_KEYS.map(zeile),
  ].join('\n');
}

/** Wie oft lief eine Pipeline – je Strategie, in allen Partien und in denen mit Kapitelziel. */
export function pipelineLine(rows: readonly BotRow[]): string {
  return rows
    .map((r) => `${r.strategy} ${prozent(r.games > 0 ? r.pipelineGames / r.games : 0)} (mit Kapitelziel ${r.goalGames > 0 ? prozent(r.pipelineGoalGames / r.goalGames) : '–'})`)
    .join(', ');
}
