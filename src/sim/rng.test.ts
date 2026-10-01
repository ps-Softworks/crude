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
});
