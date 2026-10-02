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

  describe('Pacht', () => {
    type RawLease = { lease: Record<string, unknown> & { locations: Record<string, unknown>[]; landowners: Record<string, unknown>[] } };
    const raw = () => structuredClone(loadBalance()) as unknown as RawLease;

    it('liest die Pacht-Zahlen aus der echten Datei', () => {
      const { lease } = loadBalance();
      expect(lease.termRounds).toBe(4);
      expect(lease.delayRental).toBe(25);
      expect(lease.locations.map((l) => l.label)).toEqual(['Am Fund', 'Nachbar eines Funds', 'Randlage']);
      expect(lease.landowners.map((o) => o.name)).toEqual(['neutral', 'gierig', 'verschuldet', 'misstrauisch', 'fromm']);
    });

    it('meldet Lagen, die nicht aufsteigend sortiert sind', () => {
      const r = raw();
      r.lease.locations[1].maxDistance = 1;
      expect(() => parseBalance(r)).toThrow(/Pacht-Lagen müssen nach maxDistance aufsteigend/);
    });

    it('meldet Gewichte von 0 oder weniger', () => {
      const r = raw();
      r.lease.landowners[2].weight = 0;
      expect(() => parseBalance(r)).toThrow(/Gewicht größer als 0/);
    });

    it('meldet unbekannte oder fehlende Landbesitzer', () => {
      const r = raw();
      r.lease.landowners[0].name = 'geizig';
      expect(() => parseBalance(r)).toThrow(/unbekannter Landbesitzer "geizig"/);
      const s = raw();
      s.lease.landowners.pop();
      expect(() => parseBalance(s)).toThrow(/"fromm" muss genau einmal vorkommen/);
    });

    it('meldet vertauschte Förderzins-Grenzen', () => {
      const r = raw();
      r.lease.royaltyMin = 0.3;
      expect(() => parseBalance(r)).toThrow(/royaltyMin" ist größer/);
    });

    it('meldet fehlende Zahlen in Lagen mit Pfad', () => {
      const r = raw();
      delete r.lease.locations[0].bonus;
      expect(() => parseBalance(r)).toThrow(/"lease.locations.0.bonus" fehlt/);
    });

    it('meldet Laufzeiten, die keine ganze Zahl ab 1 sind', () => {
      const r = raw();
      r.lease.termRounds = 0;
      expect(() => parseBalance(r)).toThrow(/"lease.termRounds" muss eine ganze Zahl ab 1/);
    });
  });
});
