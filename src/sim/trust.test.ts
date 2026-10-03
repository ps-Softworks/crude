import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { advanceTransport, netPrice, quoteSale, tariff } from './transport';
import {
  craneCut,
  craneCutRoundsLeft,
  hikeChance,
  jacobPrice,
  railFrozen,
  RIVAL_MARKS,
  settleTakeover,
  takeoverOffer,
} from './trust';

const balance = loadBalance();
const crane = balance.rivals.crane;
const thorne = balance.rivals.thorne;

/** Setzt Merkzeichen, als hätte Jacob in Runde `round` so geantwortet. */
function mitMarken(state: GameState, marks: Record<string, number>): GameState {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, ...marks } } };
}

function inRunde(state: GameState, round: number): GameState {
  return { ...state, round };
}

describe('Crane Trust: Posted-Price-Druck (2.8)', () => {
  const start = newGame('crane', balance);

  it('ohne Merkzeichen zahlt der Trust den vollen Posted Price', () => {
    expect(craneCut(start, balance)).toBe(0);
    expect(jacobPrice(start, balance)).toBe(start.postedPrice);
  });

  it('hingenommen in Runde r: Abschlag in den Runden r+1 … r+cutRounds, davor und danach nicht', () => {
    const s = mitMarken(start, { [RIVAL_MARKS.craneCut]: 6 });
    expect(craneCut(inRunde(s, 6), balance)).toBe(0);
    for (let r = 7; r <= 6 + crane.cutRounds; r++) {
      expect(craneCut(inRunde(s, r), balance)).toBe(crane.priceCut);
    }
    expect(craneCut(inRunde(s, 7 + crane.cutRounds), balance)).toBe(0);
    expect(craneCutRoundsLeft(inRunde(s, 7), balance)).toBe(crane.cutRounds);
    expect(craneCutRoundsLeft(inRunde(s, 6 + crane.cutRounds), balance)).toBe(1);
  });

  it('mit Delgados Verband nur allianceFactor des Abschlags', () => {
    const s = inRunde(mitMarken(start, { [RIVAL_MARKS.craneCut]: 6, [RIVAL_MARKS.alliance]: 6 }), 7);
    expect(craneCut(s, balance)).toBeCloseTo(crane.priceCut * crane.allianceFactor, 10);
  });

  it('die Treueerklärung allein bringt keinen Abschlag', () => {
    expect(craneCut(inRunde(mitMarken(start, { [RIVAL_MARKS.craneLoyal]: 6 }), 7), balance)).toBe(0);
  });

  it('Verkauf und Nettopreis rechnen mit dem Abschlag', () => {
    const s = { ...inRunde(mitMarken(start, { [RIVAL_MARKS.craneCut]: 6 }), 7), oilStock: 1000 };
    const preis = s.postedPrice - crane.priceCut;
    expect(jacobPrice(s, balance)).toBeCloseTo(preis, 10);
    expect(netPrice(s, balance, 'wagon')).toBeCloseTo(preis - tariff(s, balance, 'wagon'), 10);
    expect(quoteSale(s, balance, 'wagon', 1000).gross).toBeCloseTo(1000 * preis, 6);
  });

  it('der Preis für Jacob fällt nie unter null', () => {
    const s = { ...inRunde(mitMarken(start, { [RIVAL_MARKS.craneCut]: 6 }), 7), postedPrice: 0.05 };
    expect(jacobPrice(s, balance)).toBe(0);
  });
});

describe('Thorne Rail: Frachtvertrag (2.8)', () => {
  const start = newGame('thorne', balance);
  const immer: Balance = { ...balance, transport: { ...balance.transport, thorne: { ...balance.transport.thorne, hikeChance: 1 } } };

  it('Vertrag in Runde r: fest in den Runden r … r+contractRounds−1', () => {
    const s = mitMarken(start, { [RIVAL_MARKS.thorneContract]: 4 });
    expect(railFrozen(inRunde(s, 3), balance)).toBe(false);
    expect(railFrozen(inRunde(s, 4), balance)).toBe(true);
    expect(railFrozen(inRunde(s, 3 + thorne.contractRounds), balance)).toBe(true);
    expect(railFrozen(inRunde(s, 4 + thorne.contractRounds), balance)).toBe(false);
  });

  it('mit Vertrag erhöht Thorne nicht – und der Weltzufall läuft trotzdem gleich weiter', () => {
    const bahn = { ...start, round: 5, shipped: { wagon: 0, rail: 100, teams: 0, pipeline: 0 } };
    const ohne = advanceTransport(bahn, immer);
    const mit = advanceTransport(mitMarken(bahn, { [RIVAL_MARKS.thorneContract]: 4 }), immer);
    expect(ohne.railTariff).toBeGreaterThan(start.railTariff);
    expect(mit.railTariff).toBe(start.railTariff);
    expect(mit.rng).toBe(ohne.rng);
  });

  it('nach der Absage erhöht Thorne öfter (× refusedHikeFactor, höchstens 1)', () => {
    expect(hikeChance(start, balance)).toBe(balance.transport.thorne.hikeChance);
    const abgelehnt = mitMarken(start, { [RIVAL_MARKS.thorneRefused]: 4 });
    expect(hikeChance(abgelehnt, balance)).toBeCloseTo(
      Math.min(1, balance.transport.thorne.hikeChance * thorne.refusedHikeFactor),
      10,
    );
    expect(hikeChance(abgelehnt, immer)).toBe(1);
  });
});

describe('Crane Trust: Übernahmeangebot (2.8)', () => {
  const start = { ...newGame('uebernahme', balance), cash: 20000 };

  it('Angebot = Imperiumswert × takeoverPremium, nach Treueerklärung × loyalPremium, mindestens takeoverMin', () => {
    expect(takeoverOffer(start, balance)).toBe(Math.round(empireValue(start, balance) * crane.takeoverPremium));
    const treu = mitMarken(start, { [RIVAL_MARKS.craneLoyal]: 6 });
    expect(takeoverOffer(treu, balance)).toBe(Math.round(empireValue(treu, balance) * crane.loyalPremium));
    expect(takeoverOffer({ ...start, cash: 0 }, balance)).toBe(crane.takeoverMin);
  });

  it('ohne Zusage passiert nichts', () => {
    expect(settleTakeover(start, balance)).toBe(start);
  });

  it('angenommen: Die Partie endet am Rundenende mit „verkauft“, die Kasse ist der Kaufpreis', () => {
    const s = mitMarken({ ...start, round: 15, oilStock: 500 }, { [RIVAL_MARKS.craneSold]: 15 });
    const preis = takeoverOffer(s, balance);
    const ende = endRound(s, balance);
    expect(ende.finished).toBe(true);
    expect(ende.ending).toBe('verkauft');
    expect(ende.round).toBe(15);
    expect(ende.cash).toBe(preis);
    expect(ende.loans).toEqual([]);
    expect(ende.oilStock).toBe(0);
    expect(empireValue(ende, balance)).toBe(preis);
    expect(ende.log.at(-1)).toMatch(/an den Crane Trust/);
    // Danach geht nichts mehr weiter.
    expect(endRound(ende, balance)).toBe(ende);
  });

  it('ein Spielstand mit dem Ende „verkauft“ lässt sich laden', () => {
    const s = endRound(mitMarken({ ...start, round: 15 }, { [RIVAL_MARKS.craneSold]: 15 }), balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok && geladen.state.ending).toBe('verkauft');
  });
});
