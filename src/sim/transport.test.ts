import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { endRound, newGame, type GameState } from './game';
import { advanceTransport, capacityLeft, netPrice, quoteSale, sellOil, tariff } from './transport';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const T = balance.transport;
const PRICE = balance.market.basePrice;

/** Spiel mit Öl im Tank (ohne Bohren). */
function mitOel(oil = 5000, royaltyOil = 0, seed = 'transport'): GameState {
  return { ...newGame(seed, balance), oilStock: oil, royaltyOil };
}

function mitThorne(thorne: Partial<Balance['transport']['thorne']>): Balance {
  return { ...balance, transport: { ...T, thorne: { ...T.thorne, ...thorne } } };
}

function verkauf(state: GameState, mode: 'wagon' | 'rail', barrels: number, bal = balance): GameState {
  const r = sellOil(state, bal, mode, barrels);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Jede Runde per Bahn verkaufen und die Runde beenden; liefert den Tarifverlauf. */
function bahnSpiel(seed: string, runden: number, bal = balance): number[] {
  let state: GameState = { ...newGame(seed, bal), oilStock: 1e6 };
  const verlauf = [state.railTariff];
  for (let i = 0; i < runden && !state.finished; i++) {
    state = endRound(verkauf(state, 'rail', 100, bal), bal);
    verlauf.push(state.railTariff);
  }
  return verlauf;
}

describe('Transport und Verkauf', () => {
  describe('Fertig-Kriterium A: Die Bahn ist billiger', () => {
    it('Bahntarif liegt unter dem Fuhrwerk, Netto je Barrel darüber', () => {
      const state = newGame('bahn', balance);
      expect(tariff(state, balance, 'rail')).toBeLessThan(tariff(state, balance, 'wagon'));
      expect(netPrice(state, balance, 'rail')).toBeGreaterThan(netPrice(state, balance, 'wagon'));
    });

    it('gleiche Menge bringt per Bahn mehr Geld als per Fuhrwerk', () => {
      const state = mitOel(1000, 100);
      expect(verkauf(state, 'rail', 500).cash).toBeGreaterThan(verkauf(state, 'wagon', 500).cash);
    });
  });

  describe('Fertig-Kriterium B: Thorne kann den Tarif erhöhen', () => {
    it('bei Bahnfracht jede Runde steigt der Tarif irgendwann', () => {
      const gestiegen = ['a', 'b', 'c', 'd', 'e'].some((seed) => {
        const v = bahnSpiel(seed, balance.start.rounds);
        return v[v.length - 1] > v[0];
      });
      expect(gestiegen).toBe(true);
    });

    it('mit hikeChance 1 steigt er nach einer Runde genau um hikeStep', () => {
      const bal = mitThorne({ hikeChance: 1 });
      const v = bahnSpiel('sicher', 1, bal);
      expect(v[1]).toBeCloseTo(T.rail.costPerBarrel + T.thorne.hikeStep, 10);
    });

    it('steigt nie über maxTariff und kann teurer als das Fuhrwerk werden', () => {
      const bal = mitThorne({ hikeChance: 1 });
      const v = bahnSpiel('erpressung', balance.start.rounds, bal);
      expect(Math.max(...v)).toBeLessThanOrEqual(T.thorne.maxTariff);
      expect(v[v.length - 1]).toBe(T.thorne.maxTariff);
      expect(v[v.length - 1]).toBeGreaterThan(T.wagon.costPerBarrel);
    });

    it('meldet die Erhöhung im Protokoll', () => {
      const bal = mitThorne({ hikeChance: 1 });
      const state = endRound(verkauf(mitOel(), 'rail', 100, bal), bal);
      expect(state.log.some((l) => l.includes('Thorne erhöht den Bahntarif auf 0,35 $'))).toBe(true);
    });
  });

  describe('Kein Anstieg ohne Bahnfracht', () => {
    it('nur Fuhrwerk: Tarif und Zufall bleiben unverändert', () => {
      const bal = mitThorne({ hikeChance: 1 });
      const state = verkauf(mitOel(), 'wagon', 100, bal);
      const nach = advanceTransport(state, bal);
      expect(nach.railTariff).toBe(state.railTariff);
      expect(nach.rng).toBe(state.rng);
    });

    it('gar nichts verschickt: Tarif und Zufall bleiben unverändert', () => {
      const bal = mitThorne({ hikeChance: 1 });
      const state = mitOel();
      const nach = advanceTransport(state, bal);
      expect(nach.railTariff).toBe(state.railTariff);
      expect(nach.rng).toBe(state.rng);
    });

    it('hikeChance 0: nie ein Anstieg', () => {
      const v = bahnSpiel('nie', balance.start.rounds, mitThorne({ hikeChance: 0 }));
      expect(new Set(v).size).toBe(1);
    });

    it('am Höchsttarif wird kein Zufall mehr gezogen', () => {
      const state = { ...verkauf(mitOel(), 'rail', 100), railTariff: T.thorne.maxTariff };
      const nach = advanceTransport(state, balance);
      expect(nach.rng).toBe(state.rng);
      expect(nach.railTariff).toBe(T.thorne.maxTariff);
    });
  });

  describe('sellOil', () => {
    it('rechnet Erlös, Fracht, Förderzins und Netto exakt', () => {
      const state = mitOel(1000, 150);
      const q = quoteSale(state, balance, 'rail', 400);
      expect(q.gross).toBeCloseTo(400 * PRICE, 10);
      expect(q.transportCost).toBeCloseTo(400 * T.rail.costPerBarrel, 10);
      expect(q.royalty).toBeCloseTo(((400 * 150) / 1000) * PRICE, 10);
      expect(q.net).toBeCloseTo(q.gross - q.transportCost - q.royalty, 10);
    });

    it('rundet auf ganze Cent', () => {
      const q = quoteSale(mitOel(3, 1), balance, 'rail', 1);
      expect(q.royalty).toBe(0.33);
    });

    it('ändert Tank, Förderzins-Öl, Kasse und Fracht der Runde', () => {
      const state = mitOel(1000, 150);
      const r = sellOil(state, balance, 'wagon', 400);
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.oilStock).toBe(600);
      expect(r.state.royaltyOil).toBeCloseTo(90, 10);
      expect(r.state.cash).toBeCloseTo(state.cash + r.quote.net, 10);
      expect(r.state.shipped).toEqual({ wagon: 400, rail: 0 });
      expect(r.state.log.at(-1)).toMatch(/400 Barrel per Fuhrwerk verkauft – .* \$ nach Fracht und Förderzins\./);
    });

    it('verändert den Eingangszustand nicht', () => {
      const state = mitOel(1000, 150);
      const kopie = structuredClone(state);
      sellOil(state, balance, 'rail', 400);
      expect(state).toEqual(kopie);
    });

    it('lehnt mehr ab, als im Tank ist', () => {
      const r = sellOil(mitOel(100.7), balance, 'rail', 101);
      expect(r.ok).toBe(false);
    });

    it('lehnt ab, wenn die Kapazität überschritten wird – auch über zwei Verkäufe', () => {
      const state = mitOel(1e6);
      expect(sellOil(state, balance, 'wagon', T.wagon.capacity + 1).ok).toBe(false);
      const erst = verkauf(state, 'wagon', T.wagon.capacity - 10);
      expect(capacityLeft(erst, balance, 'wagon')).toBe(10);
      expect(sellOil(erst, balance, 'wagon', 11).ok).toBe(false);
      expect(sellOil(erst, balance, 'wagon', 10).ok).toBe(true);
      expect(sellOil(erst, balance, 'rail', 11).ok).toBe(true);
    });

    it('lehnt 0, negative Mengen und Bruchteile ab', () => {
      const state = mitOel();
      for (const n of [0, -5, 1.5, NaN]) expect(sellOil(state, balance, 'rail', n).ok).toBe(false);
    });

    it('lehnt ab, wenn das Kapitel beendet ist', () => {
      const r = sellOil({ ...mitOel(), finished: true }, balance, 'rail', 10);
      expect(r.ok).toBe(false);
    });
  });

  it('nach dem Rundenende ist die Kapazität wieder voll', () => {
    let state = verkauf(verkauf(mitOel(1e6), 'wagon', 100), 'rail', 200);
    state = endRound(state, balance);
    expect(state.shipped).toEqual({ wagon: 0, rail: 0 });
    expect(capacityLeft(state, balance, 'wagon')).toBe(T.wagon.capacity);
    expect(capacityLeft(state, balance, 'rail')).toBe(T.rail.capacity);
  });

  it('gleicher Seed und gleiche Aktionen = gleicher Tarifverlauf', () => {
    expect(bahnSpiel('det', balance.start.rounds)).toEqual(bahnSpiel('det', balance.start.rounds));
  });
});
