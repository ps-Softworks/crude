import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { forecastWidth, formatForecast, makeForecast, makeForecasts, trueChance, zoneChance, type Geologist } from './forecast';
import { generateParcels, type Parcel } from './geology';
import { Rng, seedFromString } from './rng';
import { loadBalance } from './testBalance';

const balance: Balance = loadBalance();
const NORMAL: Geologist = { accuracy: 3, bias: 0 };

function world(seed: string): Parcel[] {
  return generateParcels(balance, seed);
}

function rngFor(seed: string): Rng {
  return new Rng(seedFromString(seed));
}

/** 1.000 Ranches aus 30 Welten, ohne Entdeckungsquelle. */
function sampleParcels(): Parcel[] {
  const parcels: Parcel[] = [];
  for (let i = 0; i < 30; i++) {
    // Ranch-ids wiederholen sich je Welt (salthill-01 …) – für die Prognosen eindeutig machen.
    parcels.push(...world(`welt-${i}`).filter((p) => !p.discovery).map((p) => ({ ...p, id: `${i}:${p.id}` })));
  }
  return parcels.slice(0, 1000);
}

function share(count: number, total: number): number {
  return count / total;
}

describe('Geologe: Bandbreite der Prognose', () => {
  describe('Breite nach Genauigkeit', () => {
    it('gibt es bei Genauigkeit 1 breit, bei 5 schmal', () => {
      expect(forecastWidth(balance, 1)).toBe(50);
      expect(forecastWidth(balance, 3)).toBe(30);
      expect(forecastWidth(balance, 5)).toBe(10);
    });

    it('wird von Genauigkeit 1 nach 5 streng fallend schmaler', () => {
      const widths = [1, 2, 3, 4, 5].map((g) => forecastWidth(balance, g));
      for (let i = 1; i < widths.length; i++) {
        expect(widths[i]).toBeLessThan(widths[i - 1]);
      }
      expect(widths[0]).toBe(balance.forecast.widthMax);
      expect(widths[4]).toBe(balance.forecast.widthMin);
    });
  });

  describe('wahre Fundchance', () => {
    it('ist das verdeckte q der Ranch (Etappe 1)', () => {
      for (const parcel of world('zonen').filter((p) => !p.discovery)) {
        expect(trueChance(balance, parcel)).toBe(parcel.chance);
      }
    });

    it('ohne q (alter Spielstand) gilt das öffentliche Wissen der Zone', () => {
      for (const zone of balance.geology.zones) {
        const parcel = world('zonen').find((p) => p.zone === zone.name);
        expect(parcel, `Zone ${zone.name} fehlt auf der Karte`).toBeDefined();
        const ohne = { ...parcel!, chance: undefined };
        expect(trueChance(balance, ohne)).toBeCloseTo(zone.prior, 10);
        expect(zoneChance(balance, parcel!)).toBeCloseTo(zone.prior, 10);
      }
    });

    it('ist im Kern im Schnitt höher als am Rand', () => {
      const byZone = (name: string) => balance.geology.zones.find((z) => z.name === name)!.prior;
      expect(byZone('kern')).toBeGreaterThan(byZone('ring'));
      expect(byZone('ring')).toBeGreaterThan(byZone('rand'));
    });
  });

  describe('Determinismus', () => {
    const parcels = world('determinismus').filter((p) => !p.discovery);

    it('gleicher Seed = gleiche Prognosen', () => {
      expect(makeForecasts(balance, parcels, NORMAL, rngFor('prognose'))).toEqual(
        makeForecasts(balance, parcels, NORMAL, rngFor('prognose')),
      );
    });

    it('anderer Seed = andere Prognosen', () => {
      const a = makeForecasts(balance, parcels, NORMAL, rngFor('prognose'));
      const b = makeForecasts(balance, parcels, NORMAL, rngFor('prognose-2'));
      const different = parcels.filter((p) => a[p.id].center !== b[p.id].center);
      expect(different.length).toBeGreaterThan(0);
    });

    it('verbraucht pro Parzelle genau einen Zufallswert', () => {
      const skipped = rngFor('zweimal');
      makeForecasts(balance, parcels.slice(0, 5), NORMAL, skipped);
      makeForecasts(balance, parcels.slice(5, 10), NORMAL, skipped);
      const same = rngFor('zweimal');
      makeForecasts(balance, parcels.slice(0, 10), NORMAL, same);
      expect(skipped.state).toBe(same.state);
    });
  });

  describe('Grenzen', () => {
    const parcels = sampleParcels();
    const forecasts = makeForecasts(balance, parcels, NORMAL, rngFor('grenzen'));
    const { rounding } = balance.forecast;
    const width = forecastWidth(balance, NORMAL.accuracy);

    it('bleiben zwischen 0 und 100 und sind nie gleich', () => {
      for (const f of Object.values(forecasts)) {
        expect(f.low).toBeGreaterThanOrEqual(0);
        expect(f.low).toBeLessThan(f.high);
        expect(f.high).toBeLessThanOrEqual(100);
      }
    });

    it('liegen auf dem Raster aus balance.yaml', () => {
      for (const f of Object.values(forecasts)) {
        expect(Number.isInteger(f.low / rounding)).toBe(true);
        expect(Number.isInteger(f.high / rounding)).toBe(true);
      }
    });

    it('sind ungefähr so breit wie die Genauigkeit vorsieht', () => {
      let geprueft = 0;
      for (const parcel of parcels) {
        const f = forecasts[parcel.id];
        // An den Grenzen 0 und 100 darf die Bandbreite schrumpfen, nie wachsen.
        expect(f.high - f.low).toBeLessThanOrEqual(width + rounding);
        if (f.center - width / 2 < 0 || f.center + width / 2 > 100) continue;
        geprueft++;
        expect(Math.abs(f.high - f.low - width)).toBeLessThanOrEqual(rounding);
      }
      // Etappe 1: q streut breiter (3–85 %), darum stoßen mehr Prognosen an die Grenzen 0 und 100.
      expect(geprueft).toBeGreaterThan(parcels.length / 2);
      expect(geprueft).toBeLessThan(parcels.length);
    });

    it('überleben das Runden an den Grenzen 0 und 100', () => {
      for (const parcel of parcels) {
        const optimist = makeForecast(balance, parcel, { accuracy: 5, bias: 15 }, rngFor('rand'));
        expect(optimist.low).toBeGreaterThanOrEqual(0);
        expect(optimist.high).toBeGreaterThan(optimist.low);
        expect(optimist.high).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Verzerrung', () => {
    const parcel = world('verzerrung').find((p) => !p.discovery)!;

    function mittelCenter(geologist: Geologist): number {
      // Gleicher Seed für alle Läufe: die Unschärfe des Geologen ist dann
      // jeweils dieselbe, gemessen wird nur die Verzerrung.
      const rng = rngFor('verzerrung');
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += makeForecast(balance, parcel, geologist, rng).center;
      return sum / 1000;
    }

    it('hebt den Optimisten um genau seinen Wert', () => {
      const ehrlich = mittelCenter({ ...NORMAL, bias: 0 });
      const optimist = mittelCenter({ ...NORMAL, bias: 10 });
      expect(optimist - ehrlich).toBeGreaterThan(8.5);
      expect(optimist - ehrlich).toBeLessThan(11.5);
    });

    it('drückt den Pessimisten genauso weit nach unten', () => {
      const pessimist = mittelCenter({ ...NORMAL, bias: -10 });
      expect(mittelCenter({ ...NORMAL, bias: 0 }) - pessimist).toBeGreaterThan(8.5);
      expect(mittelCenter({ ...NORMAL, bias: 0 }) - pessimist).toBeLessThan(11.5);
    });
  });

  describe('Kern-Test über 1.000 Parzellen', () => {
    const parcels = sampleParcels();
    const forecasts = makeForecasts(balance, parcels, NORMAL, rngFor('prognose'));
    const wahr = parcels.map((p) => 100 * trueChance(balance, p));
    const center = parcels.map((p) => forecasts[p.id].center);
    const mittel = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    it('(a) liegt im Mittel auf der wahren Chance', () => {
      expect(Math.abs(mittel(center) - mittel(wahr))).toBeLessThan(2);
    });

    it('(b) liegt im Mittel auf dem Anteil ölhaltiger Parzellen', () => {
      const oel = parcels.filter((p) => p.geology !== 'dry').length;
      expect(Math.abs(mittel(center) / 100 - share(oel, parcels.length))).toBeLessThan(0.05);
    });

    it('(c) liegt öfter daneben als 5 Prozentpunkte daneben', () => {
      const daneben = center.filter((c, i) => Math.abs(c - wahr[i]) > 5).length;
      expect(share(daneben, parcels.length)).toBeGreaterThan(0.5);
    });

    it('(d) lässt die wahre Chance in gut einem Drittel bis zwei Dritteln der Bandbreite', () => {
      const ausserhalb = parcels.filter((p) => {
        const f = forecasts[p.id];
        const w = 100 * trueChance(balance, p);
        return w < f.low || w > f.high;
      }).length;
      const anteil = share(ausserhalb, parcels.length);
      expect(anteil).toBeGreaterThan(0.3);
      expect(anteil).toBeLessThan(0.7);
    });
  });

  it('zeigt die Bandbreite als Text an', () => {
    const parcel = world('anzeige').find((p) => !p.discovery)!;
    const f = makeForecast(balance, parcel, NORMAL, rngFor('anzeige'));
    expect(formatForecast(f)).toBe(`${f.low}–${f.high} % Fundchance`);
  });
});