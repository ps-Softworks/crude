import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance } from './balance';
import { loadBalance } from './testBalance';

describe('Spielzahlen (balance.yaml)', () => {
  it('die echte Datei ist gültig', () => {
    const balance = loadBalance();
    expect(balance.start.cash).toBe(2000);
    expect(balance.start.rounds).toBe(16);
  });

  it('meldet Zonen, deren Wahrscheinlichkeiten nicht 1 ergeben', () => {
    const raw = structuredClone(loadBalance()) as unknown as { geology: { zones: { dry: number }[] } };
    raw.geology.zones[0].dry = 0.9;
    expect(() => parseBalance(raw)).toThrow(BalanceError);
    expect(() => parseBalance(raw)).toThrow(/ergibt .* statt 1/);
  });

  it('meldet fehlende Zahlen mit ihrem Namen', () => {
    const raw = structuredClone(loadBalance()) as unknown as { start: Record<string, unknown> };
    delete raw.start.cash;
    expect(() => parseBalance(raw)).toThrow(/"start.cash" fehlt/);
  });
});
