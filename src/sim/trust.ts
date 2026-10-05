// Crane Trust und Thorne Rail (2.8, GDD §9.2, §9.4): die beiden Großen, an denen
// Jacob in Kapitel 1 hängt – Crane kauft das Öl (Posted Price), Thorne fährt es
// (Bahntarif). Ihre Züge kommen als Briefe aus content/events/k1-rivalen.yaml;
// was Jacob antwortet, merken sie sich als Merkzeichen. Hier steht, was diese
// Merkzeichen bewirken. Reine Funktionen, kein eigener Zufall.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { empireValue } from './empire';
import { timedEffect } from './events';
import type { GameState } from './game';
import { fuelPremium } from './ventures';
// Termine als Hauptwerkzeug, Etappe 2: Preis-Aktionen (Abschlag, Handel, Abnahmevertrag) und Transport-Aktionen (Thorne).
import { activeContract, contractGrudge, cutCleared, dealBonus, punishCut } from './pricing';

/**
 * Merkzeichen der Rivalen. Die meisten setzt eine Wahl in content/events/,
 * bullard_verraten setzt die Simulation selbst (Bullard bemerkt den Verrat).
 */
export const RIVAL_MARKS = {
  /** Jacob hat den Abschlag des Trusts hingenommen. */
  craneCut: 'crane_abschlag',
  /** Jacob ist Delgados Verband unabhängiger Produzenten beigetreten: halber Abschlag. */
  alliance: 'delgado_verband',
  /** Jacob hat Crane eine Treueerklärung unterschrieben: kein Abschlag, aber ein schlechteres Übernahmeangebot. */
  craneLoyal: 'crane_treue',
  /** Jacob verkauft an den Crane Trust – das frühe Ende „Der kluge Mann“. */
  craneSold: 'crane_verkauft',
  /** Frachtvertrag mit Thorne: eine Weile keine Tariferhöhung. */
  thorneContract: 'thorne_vertrag',
  /** Frachtvertrag abgelehnt (oder Drohung als Bluff durchschaut): Thorne erhöht öfter. */
  thorneRefused: 'thorne_abgelehnt',
  /** Exklusivvertrag (0.2.15+2, zusammen mit thorne_vertrag): andere Wege kosten Strafe. */
  thorneExclusive: 'thorne_exklusiv',
  /** Mengenrabatt gegen Mindestabnahme (0.2.15+2). */
  thorneVolume: 'thorne_mengenrabatt',
  /** Handschlag mit Bullard: keiner pachtet dem anderen vor der Nase. */
  bullardPact: 'bullard_handschlag',
  /** Bullard fühlt sich beleidigt: Fehde. */
  bullardFeud: 'bullard_fehde',
  /** Jacob hat den Handschlag gebrochen (setzt die Simulation). Verrat vergisst Bullard nie. */
  bullardBetrayed: 'bullard_verraten',
} as const;

/** Merkzeichen, die die Simulation selbst setzt (für die Inhaltsprüfung). */
export const RIVAL_SIM_MARKS = [RIVAL_MARKS.bullardBetrayed, RIVAL_MARKS.thorneRefused] as const;

/** Runde, in der ein Merkzeichen gesetzt wurde, oder undefined. */
export function markRound(state: Partial<Pick<GameState, 'events'>>, mark: string): number | undefined {
  return state.events?.marks?.[mark];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

type Lage = Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'logistics' | 'ventures' | 'pricing' | 'freight'>>;

/**
 * Posted-Price-Druck (GDD §9.4): Hat Jacob den Abschlag hingenommen (Runde r),
 * zahlt der Trust ihm in den Runden r+1 … r+cutRounds priceCut $ je Barrel weniger,
 * mit Delgados Verband nur allianceFactor davon. Sonst 0.
 */
export function cartelCut(state: Lage, balance: Balance): number {
  const r = markRound(state, RIVAL_MARKS.craneCut);
  const { priceCut, cutRounds, allianceFactor } = balance.rivals.crane;
  if (r === undefined || state.round <= r || state.round > r + cutRounds || cutCleared(state, r)) return 0;
  const faktor = markRound(state, RIVAL_MARKS.alliance) !== undefined ? allianceFactor : 1;
  return cents(priceCut * faktor);
}

/**
 * Cranes Groll (0.2.15+2): Hat Jacob in Runde h an den Händler verkauft, zahlt
 * der Trust in den Runden h+1 … h+grudgeRounds grudgeCut $ je Barrel weniger.
 */
export function grudgeCut(state: Lage, balance: Balance): number {
  const h = state.logistics?.traderLast ?? 0;
  const { grudgeCut: cut, grudgeRounds } = balance.transport.trader;
  return h > 0 && state.round > h && state.round <= h + grudgeRounds && !cutCleared(state, h) ? cut : 0;
}

/**
 * Alles, was der Trust Jacob je Barrel abzieht: Abschlag (2.8) plus Groll (0.2.15+2), seit
 * Etappe 2 dazu Cranes Abschlag aus den Preis-Aktionen (zu hoher Preis, Gerücht, Abfuhr); der
 * Groll wegen eines Händlervertrags zählt nicht doppelt.
 */
export function craneCut(state: Lage, balance: Balance): number {
  return cents(cartelCut(state, balance) + Math.max(grudgeCut(state, balance), contractGrudge(state, balance)) + punishCut(state));
}

/** Runden, die der Abschlag noch gilt (diese mitgezählt); 0 = keiner. */
export function craneCutRoundsLeft(state: Lage, balance: Balance): number {
  const r = markRound(state, RIVAL_MARKS.craneCut);
  if (r === undefined || cartelCut(state, balance) === 0) return 0;
  return r + balance.rivals.crane.cutRounds - state.round + 1;
}

/**
 * Was der Trust Jacob je Barrel zahlt: Posted Price minus Abschlag, plus/minus
 * befristete Nachwirkungen aus Ereignissen (price, 0.2.15+3), plus der Aufschlag der
 * Benzinanlage aus dem Zeitsprung (4.5), nie unter null.
 */
export function jacobPrice(
  state: Lage & Pick<GameState, 'postedPrice'>,
  balance: Balance,
): number {
  // Etappe 2: Ein fester Abnahmevertrag mit Crane ersetzt Posted Price und Abschläge; ein Handel bringt einen Aufschlag.
  const vertrag = activeContract(state, 'crane');
  const basis = vertrag ? vertrag.price : state.postedPrice - craneCut(state, balance);
  return Math.max(0, cents(basis + dealBonus(state) + timedEffect(state, 'price') + fuelPremium(state, balance)));
}

/**
 * Frachtvertrag (Runde r): In den Runden r … r+contractRounds−1 erhöht Thorne
 * den Tarif nicht.
 */
export function railFrozen(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'freight'>>, balance: Balance): boolean {
  // Etappe 2: Nach einem Zugeständnis beim Vorsprechen (freezeUntil) erhöht Thorne ebenfalls nicht.
  if ((state.freight?.freezeUntil ?? 0) >= state.round) return true;
  return contractActive(state, balance, RIVAL_MARKS.thorneContract);
}

/**
 * Chance je Runde mit Bahnfracht, dass Thorne erhöht: nach einer Absage × refusedHikeFactor,
 * nach einer Abfuhr beim Vorsprechen oder einem erwischten Bluff (Etappe 2) befristet ×
 * transport.negotiation.rebuff.factor – nicht beides zusammen, höchstens 1.
 */
export function hikeChance(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'freight'>>, balance: Balance): number {
  const base = balance.transport.thorne.hikeChance;
  const refused = markRound(state, RIVAL_MARKS.thorneRefused) !== undefined ? balance.rivals.thorne.refusedHikeFactor : 1;
  const abfuhr = (state.freight?.hikeDoubleUntil ?? 0) >= state.round ? balance.freight.rebuff.factor : 1;
  return Math.min(1, base * Math.max(refused, abfuhr));
}

/**
 * Läuft gerade ein Vertrag dieser Art (Runde r … r+contractRounds−1)? Hat Jacob den
 * Exklusivvertrag gekündigt (Etappe 2), gilt nichts mehr, was davor unterschrieben wurde.
 */
function contractActive(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'freight'>>, balance: Balance, mark: string): boolean {
  const r = markRound(state, mark);
  if (r !== undefined && (state.freight?.exclusiveEnded ?? 0) >= r) return false;
  return r !== undefined && state.round >= r && state.round < r + balance.rivals.thorne.contractRounds;
}

/** Exklusivvertrag (0.2.15+2): Tarif fest, jeder Barrel über einen anderen Weg kostet exclusivePenalty. */
export function exclusiveActive(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'freight'>>, balance: Balance): boolean {
  return contractActive(state, balance, RIVAL_MARKS.thorneExclusive);
}

/** Mengenrabatt (0.2.15+2): Bahntarif minus volumeDiscount, solange der Vertrag läuft. */
export function volumeDealActive(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events' | 'freight'>>, balance: Balance): boolean {
  return contractActive(state, balance, RIVAL_MARKS.thorneVolume);
}

/** Mindestabnahme per Bahn in dieser Runde (ab der Runde nach der Unterschrift), sonst 0. */
export function volumeObligation(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, balance: Balance): number {
  const r = markRound(state, RIVAL_MARKS.thorneVolume);
  return volumeDealActive(state, balance) && r !== undefined && state.round > r ? balance.transport.thorne.minVolume : 0;
}

/**
 * Übernahmeangebot des Crane Trust (GDD §13, Kapitel 1): Imperiumswert ×
 * takeoverPremium (nach einer Treueerklärung × loyalPremium), mindestens
 * takeoverMin, auf ganze Dollar gerundet.
 */
export function takeoverOffer(state: GameState, balance: Balance): number {
  const { takeoverPremium, loyalPremium, takeoverMin } = balance.rivals.crane;
  const premium = markRound(state, RIVAL_MARKS.craneLoyal) !== undefined ? loyalPremium : takeoverPremium;
  return Math.max(takeoverMin, Math.round(empireValue(state, balance) * premium));
}

/**
 * Am Rundenende: Hat Jacob das Übernahmeangebot angenommen, endet die Partie
 * sofort mit „verkauft“. Der Trust zahlt das Angebot aus, löst die Kredite ab und
 * übernimmt Öl, Pachten und Quellen. Sonst bleibt alles, wie es ist.
 */
export function settleTakeover(state: GameState, balance: Balance): GameState {
  if (state.finished || markRound(state, RIVAL_MARKS.craneSold) === undefined) return state;
  const preis = takeoverOffer(state, balance);
  return {
    ...state,
    cash: preis,
    loans: [],
    oilStock: 0,
    royaltyOil: 0,
    bankruptcyDeadline: 0,
    finished: true,
    ending: 'verkauft',
    log: [
      ...state.log,
      `${formatDate(state)}: Jacob verkauft seine Firma für ${preis.toLocaleString('de-DE')} $ an den Crane Trust.`,
    ],
  };
}
