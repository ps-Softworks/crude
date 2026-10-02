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

  describe('Prognose', () => {
    type RawForecast = { forecast: Record<string, unknown> & { geologist: Record<string, unknown> } };
    const raw = () => structuredClone(loadBalance()) as unknown as RawForecast;

    it('liest die Geologen-Zahlen aus der echten Datei', () => {
      const { forecast } = loadBalance();
      expect(forecast.widthMax).toBe(50);
      expect(forecast.widthMin).toBe(10);
      expect(forecast.rounding).toBe(5);
      expect(forecast.geologist.accuracy).toBe(3);
      expect(forecast.geologist.bias).toBe(0);
    });

    it('meldet einen fehlenden Block', () => {
      const r = raw();
      delete (r as { forecast?: unknown }).forecast;
      expect(() => parseBalance(r)).toThrow(/Block "forecast" fehlt/);
    });

    it('meldet fehlende Zahlen mit ihrem Namen', () => {
      const r = raw();
      delete r.forecast.rounding;
      expect(() => parseBalance(r)).toThrow(/"forecast.rounding" fehlt/);
    });

    it('meldet eine Genauigkeit außerhalb 1–5', () => {
      const r = raw();
      r.forecast.geologist.accuracy = 0;
      expect(() => parseBalance(r)).toThrow(/"forecast.geologist.accuracy" muss eine ganze Zahl zwischen 1 und 5/);
      const s = raw();
      s.forecast.geologist.accuracy = 6;
      expect(() => parseBalance(s)).toThrow(/"forecast.geologist.accuracy" muss eine ganze Zahl zwischen 1 und 5/);
      const t = raw();
      t.forecast.geologist.accuracy = 2.5;
      expect(() => parseBalance(t)).toThrow(/"forecast.geologist.accuracy" muss eine ganze Zahl/);
    });

    it('meldet eine Verzerrung außerhalb −15 bis +15', () => {
      const r = raw();
      r.forecast.geologist.bias = -16;
      expect(() => parseBalance(r)).toThrow(/"forecast.geologist.bias" muss zwischen -15 und \+15/);
      const s = raw();
      s.forecast.geologist.bias = 15.1;
      expect(() => parseBalance(s)).toThrow(/"forecast.geologist.bias" muss zwischen -15 und \+15/);
    });

    it('meldet vertauschte oder unbrauchbare Bandbreiten', () => {
      const r = raw();
      r.forecast.widthMin = 60;
      expect(() => parseBalance(r)).toThrow(/"forecast.widthMin" ist größer als "forecast.widthMax"/);
      const s = raw();
      s.forecast.widthMin = 0;
      expect(() => parseBalance(s)).toThrow(/"forecast.widthMin" muss größer als 0/);
      const t = raw();
      t.forecast.widthMax = 120;
      expect(() => parseBalance(t)).toThrow(/"forecast.widthMax" darf nicht größer als 100/);
    });

    it('meldet ein Raster, das keine ganze Zahl ab 1 ist', () => {
      const r = raw();
      r.forecast.rounding = 0;
      expect(() => parseBalance(r)).toThrow(/"forecast.rounding" muss eine ganze Zahl ab 1/);
    });
  });
});
