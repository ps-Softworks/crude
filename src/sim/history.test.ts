import { describe, expect, it } from 'vitest';
import { endRound, newGame } from './game';
import { historyStats, HISTORY_MAX, appendHistory } from './history';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();

describe('Verlauf', () => {
  it('jede Runde hängt einen Eintrag an', () => {
    let s = newGame('verlauf', balance);
    expect(s.history).toBeUndefined();
    s = endRound(s, balance);
    s = endRound(s, balance);
    expect(s.history).toHaveLength(2);
    expect(s.history!.map((e) => e.r)).toEqual([1, 2]);
    const e = s.history![1];
    expect(e.k).toBe(1);
    expect(e.price).toBeCloseTo(s.postedPrice, 1);
    expect(e.out).toBeGreaterThanOrEqual(0);
  });

  it('bleibt beschränkt und ersetzt eine doppelte Runde', () => {
    let s = newGame('verlauf2', balance);
    for (let i = 0; i < HISTORY_MAX + 5; i++) s = appendHistory({ ...s, round: i + 1 }, balance, 10);
    expect(s.history).toHaveLength(HISTORY_MAX);
    s = appendHistory(s, balance, 99);
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history![HISTORY_MAX - 1].out).toBe(99);
  });

  it('übersteht Speichern und Laden; alte Stände ohne Verlauf laden weiter', () => {
    const s = endRound(newGame('verlauf3', balance), balance);
    const geladen = deserializeGame(serializeGame(s, '0.0.0'));
    expect(geladen.ok && geladen.state.history).toEqual(s.history);
    const alt = { ...s };
    delete alt.history;
    const ohne = deserializeGame(serializeGame(alt, '0.0.0'));
    expect(ohne.ok).toBe(true);
    expect(ohne.ok && ohne.state.history).toBeUndefined();
    const kaputt = JSON.parse(serializeGame(s, '0.0.0'));
    kaputt.state.history = 'x';
    expect(deserializeGame(JSON.stringify(kaputt)).ok).toBe(false);
  });

  it('Kennzahlen', () => {
    expect(historyStats(undefined)).toBeNull();
    const st = historyStats([
      { r: 1, k: 1, cash: 100, debt: 0, value: 500, out: 10, price: 1 },
      { r: 2, k: 1, cash: -50, debt: 300, value: 900, out: 20, price: 1 },
      { r: 3, k: 1, cash: 80, debt: 100, value: 700, out: 5, price: 1 },
    ])!;
    expect(st).toMatchObject({ rounds: 3, bestValue: 900, bestRound: 2, totalOutput: 35, lowestCash: -50, peakDebt: 300 });
  });
});
