// Spielspaß K1: Messhilfe für die Preis- und Fracht-Karten (src/sim/cardStats.ts).
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import type { Well } from './drilling';
import { botTurn, playGame } from './bots';
import { Rng } from './rng';
import { finishCards, HORIZON, newCardTracker, trackCards } from './cardStats';
import { newFreight, visitThorne } from './freight';
import { newGame, type GameState } from './game';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const katalog = loadEvents();
const F = balance.freight;
/** Thornes Laune neutral, Widerstand 2: ohne Druck sicher eine Abfuhr. */
const NEUTRAL: Balance = { ...balance, freight: { ...F, mood: { down: 0, up: 0 }, resistance: { ...F.resistance, base: 2 } } };

function gebucht(s: GameState, cardId: string, cash: number): GameState {
  return { ...s, plans: { round: s.round, booked: [{ cardId, appointments: 2, overtime: 0, cash, strength: 0, done: false }], report: [] } };
}

const LEER = { wagon: 0, rail: 0, teams: 0, pipeline: 0 };

describe('Messhilfe Karten (Spielspaß K1)', () => {
  it('Abfuhr bei Thorne: schlecht, Geldeffekt = Barpreis + sofortige Erhöhung × Bahnfracht der Folgerunden', () => {
    const s0 = { ...newGame('karten-abfuhr', balance, katalog), railTariff: 0.5, freight: newFreight() };
    const vorher = { ...gebucht(s0, 'thorne_vorsprechen', 30), shipped: LEER };
    const nachher = { ...visitThorne(vorher, NEUTRAL, false), round: s0.round + 1 };
    const t = newCardTracker();
    trackCards(t, vorher, nachher, balance);
    expect(t.uses).toHaveLength(1);
    expect(t.uses[0]).toMatchObject({ card: 'thorne_vorsprechen', bad: true, money: -30 });
    // Zwei Folgerunden mit je 10.000 bbl per Bahn.
    let s = nachher;
    for (let k = 1; k <= 2; k++) {
      const v = { ...s, plans: { round: s.round, booked: [], report: [] }, shipped: { ...LEER, rail: 10000 } };
      s = { ...v, round: v.round + 1 };
      trackCards(t, v, s, balance);
    }
    expect(t.uses[0].money).toBeCloseTo(-30 - 2 * 10000 * F.rebuff.raise, 6);
    expect(HORIZON).toBeGreaterThanOrEqual(2);
  });

  it('Karten ohne eigene Zeile zählen nicht; am Partieende zählt ein laufender Liefervertrag mit seinem bisherigen Mehrerlös', () => {
    const s0 = newGame('karten-sonst', balance, katalog);
    const t = newCardTracker();
    trackCards(t, { ...gebucht(s0, 'pakt_halten', 0), shipped: LEER }, { ...s0, round: s0.round + 1 }, balance);
    expect(t.uses).toHaveLength(0);
    t.uses.push({ card: 'liefervertrag', round: 1, bad: false, money: 0 });
    t.contractUse = 0;
    finishCards(t, { ...s0, pricing: { ...s0.pricing, contract: { buyer: 'haendler', qty: 2000, price: 1, from: 2, until: 5, gain: -120 } } });
    expect(t.uses[0]).toMatchObject({ bad: true, money: -120 });
  });

  it('playGame sammelt die Anwendungen je Karte (Fracht-Karten des Standard-Bots)', () => {
    const b: Balance = { ...balance, botPlans: { ...balance.botPlans, balanced: { ...balance.botPlans.balanced, thorne: true, brennan: true, pool: true } } };
    // 0.4.20+25: Mit der Startquelle kommen die Fracht-Karten in anderen Seeds – zwölf statt vier.
    const alle = Array.from({ length: 12 }, (_, i) => `bot-${i}`).flatMap((seed) => playGame(seed, b, 'ausgewogen', katalog).plans.cards);
    expect(alle.length).toBeGreaterThan(0);
    expect(alle.every((u) => Number.isFinite(u.money))).toBe(true);
    expect(alle.some((u) => u.card === 'thorne_vorsprechen')).toBe(true);
  });
});

describe('Bots und die Spielspaß-Karten (Spielspaß K1)', () => {
  /** Ein Bot mit vollem Tank, zwei Gespannen und laufender Bluff-Prüfung; die Bahn ist teurer als die Gespanne. */
  function pruefung(bluff: boolean): GameState {
    const b: Balance = { ...balance, botPlans: { ...balance.botPlans, balanced: { ...balance.botPlans.balanced, thorne: true, bluff } } };
    const s0 = newGame('bluff-bot', b, []);
    const p = s0.parcels.find((x) => !x.discovery && x.geology !== 'dry')!;
    const quelle: Well = { id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, result: 'small', production: { initialRate: 8000, lastRate: 8000, total: 0, roundsProduced: 1 }, startRound: 1 };
    const s: GameState = {
      ...s0,
      wells: [quelle],
      round: 5,
      oilStock: 8000,
      railTariff: 0.4,
      logistics: { ...s0.logistics, teams: 2 },
      freight: { ...newFreight(), bluffCheck: { from: 5, until: 6, rail: 0, total: 0 } },
    };
    return botTurn(s, b, 'ausgewogen', new Rng(1), []);
  }

  it('der bluffende Bot schickt während Thornes Prüfung zuerst alles per Bahn, der ehrliche nutzt seine Ausweichwege', () => {
    const ehrlich = pruefung(false);
    const blufft = pruefung(true);
    expect(blufft.shipped.rail).toBeGreaterThan(ehrlich.shipped.rail);
    expect(ehrlich.shipped.teams).toBeGreaterThan(0);
  });

  it('bots.plans: jeder planende Bot spielt Karten nach Charakter', () => {
    const p = balance.botPlans;
    expect(p.cautious).toMatchObject({ contract: true, pool: true, thorne: true, rumour: false, bluff: false });
    expect(p.greedy).toMatchObject({ rumour: true, crane: true, contract: false });
    // Gesamt-Balance: ausgewogen mit Gemeinschaft statt Thorne (mit Thorne gewann er 39–44 % der Seeds).
    expect(p.balanced).toMatchObject({ thorne: false, pool: true, rumour: false, bluff: false });
  });
});
