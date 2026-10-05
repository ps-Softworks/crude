import { describe, expect, it } from 'vitest';
import type { Balance, MarketBalance } from './balance';
import { distanceToDome } from './geology';
import { drillDeeper, fishWell, startDrilling, wellOf, type Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { buyLease, leaseOf } from './lease';
import { advanceMarket, computePrice, jacobSupply, neighbourSupply, neighbourWells } from './market';
import { loadBalance } from './testBalance';
import { TRANSPORT_MODES } from './balance';
import { capacityLeft, sellOil } from './transport';

const balance = loadBalance();
const market = balance.market;

/** Feste Testwerte, unabhängig von den Platzhaltern in der YAML. */
const fest: MarketBalance = {
  basePrice: 1,
  demand: 5000,
  elasticity: 1.5,
  shock: 1,
  regionalDiscount: 0,
  priceMin: 0.2,
  priceMax: 1.6,
  neighbours: { startWells: 12, newWellsPerRound: 2, ratePerWell: 400 },
  newsThreshold: 0.1,
};

function quelle(status: Well['status'], lastRate: number): Well {
  return {
    parcelId: `p${lastRate}`,
    status,
    production: status === 'found' ? { initialRate: lastRate, lastRate, total: 0, roundsProduced: 1 } : undefined,
  } as Well;
}

function mitMarkt(bal: Balance, markt: Partial<MarketBalance>, rest: Partial<Balance> = {}): Balance {
  return { ...bal, ...rest, market: { ...bal.market, ...markt, neighbours: { ...bal.market.neighbours, ...markt.neighbours } } };
}

/**
 * Jacob mit (fast) unbegrenztem Geld: pachtet jede Runde alles, was frei ist –
 * nah am Salt Hill zuerst –, bohrt so viel, wie Türme da sind, und bohrt immer weiter.
 */
function bohrtAlles(state: GameState, bal: Balance): GameState {
  let s: GameState = { ...state, cash: Math.max(state.cash, 10_000_000) };
  const parzellen = s.parcels
    .filter((p) => !p.discovery)
    .sort((a, b) => distanceToDome(bal, a.region, a.x, a.y) - distanceToDome(bal, b.region, b.x, b.y));
  for (const p of parzellen) {
    const well = wellOf(s, p.id);
    if (well?.status === 'decision') {
      const r = drillDeeper(s, bal, p.id);
      if (r.ok) s = r.state;
      continue;
    }
    if (well?.status === 'stuck') {
      const r = fishWell(s, bal, p.id);
      if (r.ok) s = r.state;
      continue;
    }
    if (well) continue;
    if (!leaseOf(s, p.id)) {
      const r = buyLease(s, bal, p.id);
      if (r.ok) s = r.state;
    }
    if (leaseOf(s, p.id)) {
      const r = startDrilling(s, bal, p.id);
      if (r.ok) s = r.state;
    }
  }
  return s;
}

/** Ganze Partie (alle Runden); mit oder ohne Jacobs Bohrungen. */
/** Etappe 2: Der Preis rechnet mit Jacobs Verkauf – also verkauft er, was in den Tank passt und die Wege schaffen. */
function verkauftAlles(state: GameState, bal: Balance): GameState {
  let s = state;
  for (const mode of TRANSPORT_MODES) {
    const menge = Math.min(Math.floor(s.oilStock), capacityLeft(s, bal, mode));
    if (menge <= 0) continue;
    const r = sellOil(s, bal, mode, menge);
    if (r.ok) s = r.state;
  }
  return s;
}

function partie(seed: string, bal: Balance, jacobBohrt: boolean, verkauft = true): GameState {
  let s = newGame(seed, bal);
  while (!s.finished) s = endRound(jacobBohrt ? (verkauft ? verkauftAlles(bohrtAlles(s, bal), bal) : bohrtAlles(s, bal)) : s, bal);
  return s;
}

describe('Ölpreis (1.9)', () => {
  describe('Preisformel P = T · (N/A)^ε · S − k', () => {
    it('Angebot gleich Nachfrage ergibt T · S − k', () => {
      expect(computePrice(fest, 5000)).toBe(1);
      expect(computePrice({ ...fest, shock: 1.2 }, 5000)).toBe(1.2);
    });

    it('doppeltes Angebot ergibt 0,5^1,5 ≈ 0,35', () => {
      expect(computePrice(fest, 10000)).toBe(0.35);
    });

    it('der Preis fällt streng, wenn das Angebot steigt', () => {
      const preise = [3000, 4000, 5000, 6000, 7000, 8000].map((a) => computePrice(fest, a));
      for (let i = 1; i < preise.length; i++) expect(preise[i]).toBeLessThan(preise[i - 1]);
    });

    it('wird auf priceMin und priceMax begrenzt, auch ohne Angebot', () => {
      expect(computePrice(fest, 1_000_000)).toBe(fest.priceMin);
      expect(computePrice(fest, 100)).toBe(fest.priceMax);
      expect(computePrice(fest, 0)).toBe(fest.priceMax);
    });

    it('zieht den regionalen Abschlag k ab', () => {
      expect(computePrice({ ...fest, regionalDiscount: 0.15 }, 5000)).toBe(0.85);
    });

    it('rundet auf ganze Cent', () => {
      const p = computePrice(fest, 4321);
      expect(Math.round(p * 100) / 100).toBe(p);
    });
  });

  describe('Angebot', () => {
    it('die Nachbarn bekommen jede Runde newWellsPerRound Bohrtürme dazu', () => {
      expect(neighbourWells(fest, 1)).toBe(12);
      expect(neighbourWells(fest, 2)).toBe(14);
      expect(neighbourWells(fest, 9)).toBe(28);
      expect(neighbourSupply(fest, 2)).toBe(14 * 400);
    });

    it('Jacobs Angebot zählt nur fündige Quellen', () => {
      const wells = [quelle('found', 500), quelle('found', 300), quelle('drilling', 0), quelle('dry', 0)];
      expect(jacobSupply({ wells })).toBe(800);
    });
  });

  describe('advanceMarket', () => {
    it('setzt den neuen Preis und hängt ihn an die Preisliste an', () => {
      const start = newGame('markt', balance);
      const nach = advanceMarket({ ...start, wells: [quelle('found', 2000)] }, market);
      const erwartet = computePrice(market, 2000 + neighbourSupply(market, start.round));
      expect(nach.postedPrice).toBe(erwartet);
      expect(nach.priceHistory).toEqual([...start.priceHistory, erwartet]);
    });

    it('ein Preissturz ab newsThreshold kommt ins Protokoll', () => {
      const start = { ...newGame('markt', balance), postedPrice: 1 };
      const nach = advanceMarket({ ...start, wells: [quelle('found', 5000)] }, fest);
      expect(nach.postedPrice).toBe(0.36);
      expect(nach.log.at(-1)).toBe('Frühjahr 88: Der Trust senkt den Posted Price auf 0,36 $ – Überangebot am Salt Hill.');
    });

    it('ein Preissprung nach oben wird auch gemeldet', () => {
      const start = { ...newGame('markt', balance), postedPrice: 0.5 };
      const nach = advanceMarket(start, { ...fest, neighbours: { ...fest.neighbours, startWells: 10 } });
      expect(nach.log.at(-1)).toMatch(/hebt den Posted Price auf 1,40 \$ an/);
    });

    it('kleine Änderungen unter newsThreshold bleiben still', () => {
      const start = { ...newGame('markt', balance), postedPrice: 1.05 };
      const nach = advanceMarket(start, fest); // 4800 bbl ⇒ 1,06 $: knapp 1 %
      expect(nach.postedPrice).toBe(1.06);
      expect(nach.log).toEqual(start.log);
    });
  });

  describe('Fertig-Kriterium: Preisverfall am Salt Hill, sobald alle bohren', () => {
    // Jacob darf mehrere Türme gleichzeitig betreiben, damit er wirklich "alles" anbohrt.
    const viel = { ...balance, drilling: { ...balance.drilling, rigs: { ...balance.drilling.rigs, start: 8, max: 8 } } };

    it('Szenario 1: Jacob und die Nachbarn bohren 16 Runden – der Preis fällt um mindestens 40 %', () => {
      const s = partie('salt-hill', viel, true);
      expect(s.priceHistory).toHaveLength(balance.start.rounds + 1);
      expect(s.priceHistory.at(-1)!).toBeLessThanOrEqual(0.6 * s.priceHistory[0]);
      expect(s.log.some((l) => l.includes('senkt den Posted Price'))).toBe(true);
    });

    it('Szenario 2 (Gegenprobe): niemand bohrt neu – der Preis bleibt stehen', () => {
      // Ohne Welttrend (4.1): Hier geht es nur ums Angebot am Salt Hill.
      const ohneWelt = { ...balance.worldModel, chapter1: { ...balance.worldModel.chapter1, priceWeight: 0 } };
      const ruhig = mitMarkt(balance, { neighbours: { ...market.neighbours, newWellsPerRound: 0 } }, { rivals: { ...balance.rivals, bullard: { ...balance.rivals.bullard, minUtility: Infinity } }, worldModel: ohneWelt });
      const s = partie('salt-hill', ruhig, false);
      expect(new Set(s.priceHistory)).toEqual(new Set([s.priceHistory[0]]));
      expect(s.log.some((l) => l.includes('Posted Price'))).toBe(false);
    });

    it('Szenario 3 (seit Etappe 2): Jacobs Verkäufe drücken den Preis – wer sein Öl im Tank lässt, nicht', () => {
      // Ohne neue Nachbarn, sonst landen beide Partien am Preisboden. Der Preis rechnet mit dem Verkauf, nicht der Förderung.
      const nurJacob = mitMarkt(viel, { neighbours: { ...market.neighbours, newWellsPerRound: 0 } });
      const verkauft = partie('salt-hill', nurJacob, true, true);
      const behalten = partie('salt-hill', nurJacob, true, false);
      expect(behalten.priceHistory.at(-1)!).toBeGreaterThan(verkauft.priceHistory.at(-1)!);
      behalten.priceHistory.forEach((p, i) => expect(p).toBeGreaterThanOrEqual(verkauft.priceHistory[i]));
    });

    it('Determinismus: gleicher Seed und gleiche Züge ergeben dieselbe Preisliste', () => {
      expect(partie('gleich', viel, true).priceHistory).toEqual(partie('gleich', viel, true).priceHistory);
    });
  });
});
