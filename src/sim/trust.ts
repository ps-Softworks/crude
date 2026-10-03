// Crane Trust und Thorne Rail (2.8, GDD §9.2, §9.4): die beiden Großen, an denen
// Jacob in Kapitel 1 hängt – Crane kauft das Öl (Posted Price), Thorne fährt es
// (Bahntarif). Ihre Züge kommen als Briefe aus content/events/k1-rivalen.yaml;
// was Jacob antwortet, merken sie sich als Merkzeichen. Hier steht, was diese
// Merkzeichen bewirken. Reine Funktionen, kein eigener Zufall.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { empireValue } from './empire';
import type { GameState } from './game';

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
  /** Frachtvertrag abgelehnt: Thorne erhöht öfter. */
  thorneRefused: 'thorne_abgelehnt',
  /** Handschlag mit Bullard: keiner pachtet dem anderen vor der Nase. */
  bullardPact: 'bullard_handschlag',
  /** Bullard fühlt sich beleidigt: Fehde. */
  bullardFeud: 'bullard_fehde',
  /** Jacob hat den Handschlag gebrochen (setzt die Simulation). Verrat vergisst Bullard nie. */
  bullardBetrayed: 'bullard_verraten',
} as const;

/** Merkzeichen, die die Simulation selbst setzt (für die Inhaltsprüfung). */
export const RIVAL_SIM_MARKS = [RIVAL_MARKS.bullardBetrayed] as const;

/** Runde, in der ein Merkzeichen gesetzt wurde, oder undefined. */
export function markRound(state: Partial<Pick<GameState, 'events'>>, mark: string): number | undefined {
  return state.events?.marks?.[mark];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Posted-Price-Druck (GDD §9.4): Hat Jacob den Abschlag hingenommen (Runde r),
 * zahlt der Trust ihm in den Runden r+1 … r+cutRounds priceCut $ je Barrel weniger,
 * mit Delgados Verband nur allianceFactor davon. Sonst 0.
 */
export function craneCut(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, balance: Balance): number {
  const r = markRound(state, RIVAL_MARKS.craneCut);
  const { priceCut, cutRounds, allianceFactor } = balance.rivals.crane;
  if (r === undefined || state.round <= r || state.round > r + cutRounds) return 0;
  const faktor = markRound(state, RIVAL_MARKS.alliance) !== undefined ? allianceFactor : 1;
  return cents(priceCut * faktor);
}

/** Runden, die der Abschlag noch gilt (diese mitgezählt); 0 = keiner. */
export function craneCutRoundsLeft(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, balance: Balance): number {
  const r = markRound(state, RIVAL_MARKS.craneCut);
  if (r === undefined || craneCut(state, balance) === 0) return 0;
  return r + balance.rivals.crane.cutRounds - state.round + 1;
}

/** Was der Trust Jacob je Barrel zahlt: Posted Price minus Abschlag, nie unter null. */
export function jacobPrice(
  state: Pick<GameState, 'round' | 'postedPrice'> & Partial<Pick<GameState, 'events'>>,
  balance: Balance,
): number {
  return Math.max(0, cents(state.postedPrice - craneCut(state, balance)));
}

/**
 * Frachtvertrag (Runde r): In den Runden r … r+contractRounds−1 erhöht Thorne
 * den Tarif nicht.
 */
export function railFrozen(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'events'>>, balance: Balance): boolean {
  const r = markRound(state, RIVAL_MARKS.thorneContract);
  return r !== undefined && state.round >= r && state.round < r + balance.rivals.thorne.contractRounds;
}

/** Chance je Runde mit Bahnfracht, dass Thorne erhöht: nach einer Absage × refusedHikeFactor (höchstens 1). */
export function hikeChance(state: Partial<Pick<GameState, 'events'>>, balance: Balance): number {
  const base = balance.transport.thorne.hikeChance;
  const refused = markRound(state, RIVAL_MARKS.thorneRefused) !== undefined;
  return Math.min(1, refused ? base * balance.rivals.thorne.refusedHikeFactor : base);
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
