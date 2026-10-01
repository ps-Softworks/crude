import { describe, expect, it } from 'vitest';
import { generateParcels, zoneFor } from './geology';
import { Rng, seedFromString } from './rng';
import { loadBalance } from './testBalance';

const balance = loadBalance();

function world(seed: string) {
  return generateParcels(balance, new Rng(seedFromString(seed)));
}

describe('Karte und Parzellen', () => {
  it('füllt das ganze Raster mit eindeutigen Parzellen', () => {
    const parcels = world('raster');
    expect(parcels).toHaveLength(balance.map.width * balance.map.height);
    expect(new Set(parcels.map((p) => p.id)).size).toBe(parcels.length);
  });

  it('trockene Parzellen haben keine Reserven, ölhaltige liegen im Bereich', () => {
    for (const p of world('reserven')) {
      if (p.geology === 'dry') expect(p.reserves).toBe(0);
      else {
        const r = balance.geology.reserves[p.geology];
        expect(p.reserves).toBeGreaterThanOrEqual(r.min);
        expect(p.reserves).toBeLessThanOrEqual(r.max);
      }
    }
  });

  it('die Geologie fällt je Seed anders aus', () => {
    const a = world('seed-a').map((p) => p.geology).join();
    const b = world('seed-b').map((p) => p.geology).join();
    expect(a).not.toEqual(b);
  });

  it('die Mitte von Salt Hill liegt im Kern, die Ecke am Rand', () => {
    expect(zoneFor(balance, balance.map.saltHill.x, balance.map.saltHill.y).name).toBe('kern');
    expect(zoneFor(balance, 0, 0).name).toBe('rand');
  });

  it('Salt Hill ist im Schnitt ergiebiger als der Rand (über 500 Welten)', () => {
    const oil = { kern: { n: 0, sum: 0 }, rand: { n: 0, sum: 0 } };
    for (let i = 0; i < 500; i++) {
      for (const p of world(`welt-${i}`)) {
        if (p.zone === 'kern' || p.zone === 'rand') {
          oil[p.zone].n++;
          oil[p.zone].sum += p.reserves;
        }
      }
    }
    expect(oil.kern.sum / oil.kern.n).toBeGreaterThan(2 * (oil.rand.sum / oil.rand.n));
  });
});
