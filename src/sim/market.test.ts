import { describe, expect, it } from 'vitest';
import { computePrice, neighbourSupply, jacobSupply, advanceMarket } from './market';
import { loadBalance } from './testBalance';
import { newGame, endRound, type GameState } from './game';
import { startDrilling } from './drilling';
import { buyLease } from './lease';

const balance = loadBalance();
const market = balance.market;

describe('Marktberechnung', () => {
  describe('Formeln', () => {
    it('neighbourSupply wächst linear mit newWellsPerRound', () => {
      expect(neighbourSupply(market, 1)).toBe(12 * 400);
      expect(neighbourSupply(market, 2)).toBe((12 + 2) * 400);
      expect(neighbourSupply(market, 3)).toBe((12 + 4) * 400);
    });

    it('jacobSupply summiert lastRate aller fördernden Quellen', () => {
      const state: Pick<GameState, 'wells'> = {
        wells: [
          { status: 'found', production: { lastRate: 500, initialRate: 600, total: 1000, roundsProduced: 2 } } as any,
          { status: 'found', production: { lastRate: 300, initialRate: 400, total: 700, roundsProduced: 2 } } as any,
          { status: 'drilling', production: undefined } as any,
          { status: 'dry', production: undefined } as any,
        ],
      };
      expect(jacobSupply(state)).toBe(800);
    });

    it('computePrice: Basisformel P = T * (N/A)^ε * S - k', () => {
      // Runde 1: neighbourSupply = 12*400 = 4800, jacobSupply = 0
      // A = 4800, N = 5000, T = 1.0, ε = 1.5, S = 1.0, k = 0
      // P = 1.0 * (5000/4800)^1.5 * 1.0 - 0 = (1.04166...)^1.5 ≈ 1.063
      const price = computePrice(market, 1, 0);
      expect(price).toBeCloseTo(1.06, 2);
    });

    it('computePrice: mit Jacob-Angebot sinkt der Preis', () => {
      const priceOhne = computePrice(market, 1, 0);
      const priceMit = computePrice(market, 1, 2000);
      expect(priceMit).toBeLessThan(priceOhne);
    });

    it('computePrice: rundet auf ganze Cent', () => {
      const custom = { ...market, basePrice: 1.0, demand: 100, elasticity: 1, shock: 1, regionalDiscount: 0, priceMin: 0.01, priceMax: 10 };
      const price = computePrice(custom, 1, 0); // A = neighbour(1) = 4800, N/A = 100/4800
      expect(price * 100).toBe(Math.round(price * 100));
    });
  });

  describe('Grenzen', () => {
    it('Preis wird nie unter priceMin fallen', () => {
      const custom = { ...market, priceMin: 0.50, demand: 100, elasticity: 2 };
      const price = computePrice(custom, 1, 100000);
      expect(price).toBe(0.50);
    });

    it('Preis wird nie über priceMax steigen', () => {
      const custom = { ...market, priceMax: 1.20, demand: 100000, elasticity: 2 };
      const price = computePrice(custom, 1, 0);
      expect(price).toBe(1.20);
    });

    it('A ist mindestens 1 (Vermeidung Division durch 0)', () => {
      const custom = { ...market, neighbours: { startWells: 0, newWellsPerRound: 0, ratePerWell: 0 } };
      const price = computePrice(custom, 1, 0);
      expect(price).toBeLessThanOrEqual(market.priceMax);
      expect(price).toBeGreaterThanOrEqual(market.priceMin);
    });
  });

  describe('Wachstum', () => {
    it('Nachbarangebot steigt pro Runde um newWellsPerRound * ratePerWell', () => {
      const diff = neighbourSupply(market, 2) - neighbourSupply(market, 1);
      expect(diff).toBe(market.neighbours.newWellsPerRound * market.neighbours.ratePerWell);
    });

    it('Preis sinkt über die Runden wenn Jacob nicht fördert (Angebot wächst)', () => {
      const prices = [1, 2, 3, 4].map((r) => computePrice(market, r, 0));
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeLessThan(prices[i - 1]);
      }
    });
  });

  describe('Log', () => {
    it('advanceMarket loggt bei Änderung >= newsThreshold', () => {
      const state = newGame('log-test', balance);
      // Setze einen Preis, der sich stark ändert
      state.postedPrice = 1.00;
      state.priceHistory = [1.00];
      state.round = 2;
      // Simuliere großen Preissprung durch hohes Jacob-Angebot
      const modified = advanceMarket({ ...state, wells: [{ status: 'found', production: { lastRate: 50000, initialRate: 50000, total: 50000, roundsProduced: 1 } } as any] }, market);
      const logEntry = modified.log.find((l) => l.includes('Posted Price'));
      expect(logEntry).toBeDefined();
      expect(logEntry).toMatch(/steigt|fällt/);
    });

    it('advanceMarket loggt NICHT bei Änderung < newsThreshold', () => {
      // Erstelle einen Zustand wo sich der Preis kaum ändert
      // Runde 10: neighbourSupply = (12 + 9*2) * 400 = 30 * 400 = 12000
      // N/A = 5000/12000 = 0.4167, Preis = 1.0 * (0.4167)^1.5 = 0.269
      // Runde 11: neighbourSupply = 32 * 400 = 12800, N/A = 5000/12800 = 0.3906, Preis = 1.0 * (0.3906)^1.5 = 0.244
      // Änderung = (0.269-0.244)/0.269 = 9.3% < 10%
      const state = newGame('log-test-2', balance);
      state.round = 10;
      state.postedPrice = 0.27; // approximierter Preis für Runde 9
      state.priceHistory = [0.27];
      const modified = advanceMarket({ ...state, wells: [] }, market);
      const logEntry = modified.log.find((l) => l.includes('Posted Price'));
      expect(logEntry).toBeUndefined();
    });
  });

  describe('Determinismus', () => {
    it('gleicher Zustand = gleicher Preis', () => {
      const p1 = computePrice(market, 5, 1234);
      const p2 = computePrice(market, 5, 1234);
      expect(p1).toBe(p2);
    });

    it('advanceMarket ist deterministisch bei gleichem Input', () => {
      const state = newGame('det', balance);
      const r1 = advanceMarket(state, market);
      const r2 = advanceMarket(state, market);
      expect(r1.postedPrice).toBe(r2.postedPrice);
      expect(r1.priceHistory).toEqual(r2.priceHistory);
    });
  });

  describe('Szenarien', () => {
    it('Szenario 16 Runden mit Jacob: Endpreis <= 0,6 * Startpreis', () => {
      let state = newGame('szenario-jacob', balance);
      // Pachte und bohne auf einer ölführenden Parzelle (nicht Entdeckungsquelle)
      const oilParcel = state.parcels.find((p) => p.reserves > 0 && !p.discovery)!;
      const leaseResult = buyLease(state, balance, oilParcel.id);
      expect(leaseResult.ok).toBe(true);
      if (!leaseResult.ok) throw new Error(leaseResult.reason);
      state = leaseResult.state;
      const drillResult = startDrilling(state, balance, oilParcel.id);
      expect(drillResult.ok).toBe(true);
      if (!drillResult.ok) throw new Error(drillResult.reason);
      state = drillResult.state;

      // Simuliere 16 Runden mit Förderung
      for (let i = 0; i < 16; i++) {
        state = endRound(state, balance);
      }

      const startPrice = state.priceHistory[0];
      const endPrice = state.priceHistory[state.priceHistory.length - 1];
      expect(endPrice).toBeLessThanOrEqual(startPrice * 0.6);
    });

    it('Szenario ohne Jacob: Preis fällt kontinuierlich durch Nachbarn', () => {
      let state = newGame('szenario-ohne-jacob', balance);
      // Keine Bohrungen, nur Nachbarn
      for (let i = 0; i < 16; i++) {
        state = endRound(state, balance);
      }

      const prices = state.priceHistory;
      // Preis sollte über die Runden fallen (Nachbarn wachsen)
      expect(prices[prices.length - 1]).toBeLessThan(prices[0]);
      // Aber nie unter priceMin
      prices.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(balance.market.priceMin);
      });
    });
  });
});