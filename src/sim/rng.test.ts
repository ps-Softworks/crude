import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from './rng';

describe('Zufall mit Startwert', () => {
  it('liefert bei gleichem Seed dieselbe Folge', () => {
    const a = new Rng(seedFromString('cordova'));
    const b = new Rng(seedFromString('cordova'));
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('liefert bei anderem Seed eine andere Folge', () => {
    const a = new Rng(seedFromString('cordova'));
    const b = new Rng(seedFromString('salt hill'));
    expect(a.float()).not.toEqual(b.float());
  });

  it('bleibt in [0, 1) und int() in den Grenzen', () => {
    const rng = new Rng(seedFromString('grenzen'));
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('wählt mit gleichem Seed dieselben Elemente', () => {
    const a = new Rng(seedFromString('zugwahl'));
    const b = new Rng(seedFromString('zugwahl'));
    const liste = ['a', 'b', 'c', 'd'];
    const zuegeA = Array.from({ length: 50 }, () => a.pick(liste));
    const zuegeB = Array.from({ length: 50 }, () => b.pick(liste));
    expect(zuegeA).toEqual(zuegeB);
  });

  it('wählt nur Elemente aus der Liste und trifft jedes mindestens einmal', () => {
    const rng = new Rng(seedFromString('vollstaendig'));
    const liste = ['a', 'b', 'c', 'd'];
    const gezaehlt = new Map<string, number>();
    for (let i = 0; i < 1_000; i++) {
      const wahl = rng.pick(liste);
      expect(liste).toContain(wahl);
      gezaehlt.set(wahl, (gezaehlt.get(wahl) ?? 0) + 1);
    }
    expect(gezaehlt.size).toBe(liste.length);
    for (const element of liste) {
      expect(gezaehlt.get(element)).toBeGreaterThan(0);
    }
  });

  it('bricht bei leerer Liste ab', () => {
    const rng = new Rng(seedFromString('leer'));
    expect(() => rng.pick([])).toThrow(/mindestens einem Element/);
  });

  it('mischt eine Liste (2.10b): gleiche Elemente, Original unverändert, gleicher Seed gleiche Folge', () => {
    const liste = [1, 2, 3, 4, 5, 6, 7, 8];
    const gemischt = new Rng(seedFromString('misch')).shuffle(liste);
    expect([...gemischt].sort((a, b) => a - b)).toEqual(liste);
    expect(liste).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Rng(seedFromString('misch')).shuffle(liste)).toEqual(gemischt);
    const anfaenge = new Set(Array.from({ length: 200 }, (_, i) => new Rng(seedFromString(`m${i}`)).shuffle(liste)[0]));
    expect(anfaenge.size).toBe(liste.length);
  });
});
