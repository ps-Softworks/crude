import { describe, expect, it } from 'vitest';
import { endRound, newGame } from './game';
import { neighbourWells } from './market';
import { deserializeGame } from './save';
import { loadBalance } from './testBalance';
import { advanceWildcatters, newWildcatters, wildcatterWells } from './wildcatters';

const balance = loadBalance();
const W = balance.rivals.wildcatters;

describe('Kleine Wildcatter im Hintergrund (2.8)', () => {
  it('jede Partie hat min…max Firmen mit verschiedenen Namen aus balance.yaml', () => {
    const anzahlen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { firms } = newWildcatters(`w-${i}`, balance);
      expect(firms.length).toBeGreaterThanOrEqual(W.min);
      expect(firms.length).toBeLessThanOrEqual(W.max);
      expect(new Set(firms.map((f) => f.name)).size).toBe(firms.length);
      for (const f of firms) expect(W.names).toContain(f.name);
      anzahlen.add(firms.length);
    }
    expect(anzahlen.size).toBeGreaterThan(1);
  });

  it('gleicher Seed, gleiche Wildcatter', () => {
    expect(newWildcatters('gleich', balance)).toEqual(newWildcatters('gleich', balance));
  });

  it('ihnen gehören genau die Nachbarquellen des Markts – in jeder Runde', () => {
    let s = newGame('nachbarn', balance);
    while (!s.finished) {
      expect(wildcatterWells(s)).toBe(Math.floor(neighbourWells(balance.market, s.round)));
      expect(s.wildcatters.firms.every((f) => f.wells >= 1)).toBe(true);
      s = endRound(s, balance);
    }
  });

  it('neue Quellen kommen ins Protokoll, mit dem Namen der Firma', () => {
    const s = endRound(newGame('protokoll', balance), balance);
    const namen = s.wildcatters.firms.map((f) => f.name);
    expect(s.log.some((l) => namen.some((n) => l.includes(`${n} bringt am Salt Hill`)))).toBe(true);
  });

  it('sie ändern die Welt nicht: Weltzufall, Preis und Bullard sind ohne sie gleich', () => {
    const mit = endRound(endRound(newGame('welt', balance), balance), balance);
    const ohneStart = { ...newGame('welt', balance), wildcatters: { rng: 0, firms: [] } };
    const ohne = endRound(endRound(ohneStart, balance), balance);
    expect(ohne.wildcatters.firms).toEqual([]);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.priceHistory).toEqual(ohne.priceHistory);
    expect(mit.rival).toEqual(ohne.rival);
  });

  it('ohne Firmen (alter Spielstand) passiert nichts', () => {
    const s = { ...newGame('alt', balance), wildcatters: { rng: 0, firms: [] }, round: 5 };
    expect(advanceWildcatters(s, balance)).toBe(s);
  });

  it('ein Spielstand aus Format 6 lädt mit leeren Wildcattern', () => {
    const { wildcatters: _weg, ...alt } = newGame('format6', balance);
    const geladen = deserializeGame(JSON.stringify({ format: 6, appVersion: '0.2.7', savedRound: 1, state: alt }));
    expect(geladen.ok).toBe(true);
    expect(geladen.ok && geladen.state.wildcatters).toEqual({ rng: 0, firms: [] });
  });
});
