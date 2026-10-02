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

  describe('Förderung', () => {
    type RawProduction = { production?: { initialRateShare: Record<string, number> } & Record<string, number> };
    const raw = () => structuredClone(loadBalance()) as unknown as RawProduction;

    it('liest die Förderungs-Zahlen aus der echten Datei', () => {
      const { production } = loadBalance();
      expect(production.initialRateShare).toEqual({ small: 0.2, gusher: 0.15 });
      expect(production.decline).toBe(0.12);
      expect(production.freeWells).toBe(4);
      expect(production.pressureLossPerWell).toBe(0.15);
      expect(production.pressureMin).toBe(0.4);
      expect(production.recoveryLossPerWell).toBe(0.06);
      expect(production.recoveryLossMax).toBe(0.3);
    });

    it('meldet einen fehlenden Block', () => {
      const r = raw();
      delete r.production;
      expect(() => parseBalance(r)).toThrow(/Block "production" fehlt/);
    });

    it('meldet fehlende Zahlen mit ihrem Namen', () => {
      const r = raw();
      delete r.production!.decline;
      expect(() => parseBalance(r)).toThrow(/"production.decline" fehlt oder ist keine Zahl/);
    });

    it('meldet Werte, die keine Anteile zwischen 0 und 1 sind', () => {
      const r = raw();
      r.production!.initialRateShare.small = 5;
      expect(() => parseBalance(r)).toThrow(/"production.initialRateShare.small" muss zwischen 0 und 1/);
      const s = raw();
      s.production!.initialRateShare.gusher = -0.1;
      expect(() => parseBalance(s)).toThrow(/"production.initialRateShare.gusher" muss zwischen 0 und 1/);
      const t = raw();
      t.production!.decline = -0.1;
      expect(() => parseBalance(t)).toThrow(/"production.decline" muss zwischen 0 und 1/);
      const u = raw();
      u.production!.decline = 1.5;
      expect(() => parseBalance(u)).toThrow(/"production.decline" muss zwischen 0 und 1/);
      const v = raw();
      v.production!.recoveryLossMax = 1.2;
      expect(() => parseBalance(v)).toThrow(/"production.recoveryLossMax" muss zwischen 0 und 1/);
    });

    it('meldet eine fehlende Anfangsrate mit ihrem Namen', () => {
      const r = raw();
      delete r.production!.initialRateShare.gusher;
      expect(() => parseBalance(r)).toThrow(/"production.initialRateShare.gusher" fehlt oder ist keine Zahl/);
      const s = raw();
      delete (s.production as { initialRateShare?: unknown }).initialRateShare;
      expect(() => parseBalance(s)).toThrow(/"production.initialRateShare.small" fehlt oder ist keine Zahl/);
    });

    it('meldet einen Druckfaktor außerhalb 0 bis 1', () => {
      const r = raw();
      r.production!.pressureMin = 1.5;
      expect(() => parseBalance(r)).toThrow(/"production.pressureMin" muss zwischen 0 und 1/);
      const s = raw();
      s.production!.pressureMin = -0.5;
      expect(() => parseBalance(s)).toThrow(/"production.pressureMin" muss zwischen 0 und 1/);
    });


    it('meldet freie Quellen, die keine ganze Zahl ab 1 sind', () => {
      const r = raw();
      r.production!.freeWells = 0;
      expect(() => parseBalance(r)).toThrow(/"production.freeWells" muss eine ganze Zahl ab 1/);
      const s = raw();
      s.production!.freeWells = 1.5;
      expect(() => parseBalance(s)).toThrow(/"production.freeWells" muss eine ganze Zahl ab 1/);
    });

    it('meldet einen Ausbeuteverlust über der Obergrenze', () => {
      const r = raw();
      r.production!.recoveryLossPerWell = 0.5;
      expect(() => parseBalance(r)).toThrow(/"production.recoveryLossPerWell" ist größer als "production.recoveryLossMax"/);
    });
  });

  describe('Markt und Transport', () => {
    type RawTransport = {
      market: Record<string, number> & { neighbours: Record<string, number> };
      transport: { wagon: Record<string, unknown>; rail: Record<string, unknown>; thorne: Record<string, number> };
    };
    const raw = () => structuredClone(loadBalance()) as unknown as RawTransport;

    it('liest Markt und Transport aus der echten Datei', () => {
      const { market, transport } = loadBalance();
      expect(market.basePrice).toBe(1.00);
      expect(market.demand).toBe(5000);
      expect(market.elasticity).toBe(1.5);
      expect(market.shock).toBe(1.0);
      expect(market.regionalDiscount).toBe(0.00);
      expect(market.priceMin).toBe(0.20);
      expect(market.priceMax).toBe(1.60);
      expect(market.neighbours).toEqual({ startWells: 12, newWellsPerRound: 2, ratePerWell: 400 });
      expect(market.newsThreshold).toBe(0.10);
      expect(transport.wagon).toEqual({ label: 'Fuhrwerk', costPerBarrel: 0.6, capacity: 600 });
      expect(transport.rail).toEqual({ label: 'Bahn', costPerBarrel: 0.25, capacity: 3000 });
      expect(transport.thorne).toEqual({ hikeChance: 0.2, hikeStep: 0.1, maxTariff: 0.8 });
    });

    it('meldet eine Bahn, die nicht billiger als das Fuhrwerk ist', () => {
      const r = raw();
      r.transport.rail.costPerBarrel = 0.6;
      expect(() => parseBalance(r)).toThrow(/Bahn muss billiger als Fuhrwerk sein/);
    });

    it('meldet einen Höchsttarif unter dem Bahntarif', () => {
      const r = raw();
      r.transport.thorne.maxTariff = 0.2;
      expect(() => parseBalance(r)).toThrow(/maxTariff/);
    });

    it('meldet Kapazität 0', () => {
      const r = raw();
      r.transport.wagon.capacity = 0;
      expect(() => parseBalance(r)).toThrow(/transport.wagon.capacity/);
    });

    it('meldet hikeChance über 1', () => {
      const r = raw();
      r.transport.thorne.hikeChance = 1.5;
      expect(() => parseBalance(r)).toThrow(/hikeChance/);
    });

    it('meldet einen basePrice von 0', () => {
      const r = raw();
      r.market.basePrice = 0;
      expect(() => parseBalance(r)).toThrow(/basePrice/);
    });

    it('meldet eine Nachfrage von 0 oder weniger', () => {
      for (const v of [0, -100]) {
        const r = raw();
        r.market.demand = v;
        expect(() => parseBalance(r)).toThrow(/market\.demand/);
      }
    });

    it('meldet eine Elastizität von 0 oder weniger', () => {
      for (const v of [0, -1]) {
        const r = raw();
        r.market.elasticity = v;
        expect(() => parseBalance(r)).toThrow(/market\.elasticity/);
      }
    });

    it('meldet priceMin über basePrice und priceMax unter basePrice', () => {
      const r = raw();
      r.market.priceMin = 1.2;
      expect(() => parseBalance(r)).toThrow(/market\.priceMin/);
      const r2 = raw();
      r2.market.priceMax = 0.9;
      expect(() => parseBalance(r2)).toThrow(/market\.priceMax/);
    });

    it('meldet halbe oder negative Nachbarquellen und eine newsThreshold über 1', () => {
      const r = raw();
      r.market.neighbours.newWellsPerRound = 1.5;
      expect(() => parseBalance(r)).toThrow(/market\.neighbours\.newWellsPerRound/);
      const r2 = raw();
      r2.market.neighbours.startWells = -1;
      expect(() => parseBalance(r2)).toThrow(/market\.neighbours\.startWells/);
      const r3 = raw();
      r3.market.newsThreshold = 1.5;
      expect(() => parseBalance(r3)).toThrow(/market\.newsThreshold/);
    });
  });
});
