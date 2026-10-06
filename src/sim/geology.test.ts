import { describe, expect, it } from 'vitest';
import { areaFactor, generateParcels, ranchOfFigure, zoneFor } from './geology';
import { zoneChance } from './forecast';
import { loadBalance } from './testBalance';
import { regionChapter, regionRichness } from './worldMap';

const balance = loadBalance();
const dome = balance.world.regions.find((r) => r.id === 'salthill')!.geology!.center;

function world(seed: string) {
  return generateParcels(balance, seed);
}

describe('Karte und Ranches', () => {
  it('nur das offene Gebiet Salt Hill hat Ranches, jede mit eindeutiger id', () => {
    const parcels = world('raster');
    expect(parcels.length).toBeGreaterThan(20);
    expect(new Set(parcels.map((p) => p.id)).size).toBe(parcels.length);
    expect(new Set(parcels.map((p) => p.region))).toEqual(new Set(['salthill']));
  });

  it('trockene Ranches haben keine Reserven, ölhaltige liegen im Bereich – mal Fläche', () => {
    for (const p of world('reserven')) {
      if (p.geology === 'dry') expect(p.reserves).toBe(0);
      else {
        const r = balance.geology.reserves[p.geology];
        const f = areaFactor(balance, p);
        expect(p.reserves).toBeGreaterThanOrEqual(Math.floor(r.min * f));
        expect(p.reserves).toBeLessThanOrEqual(Math.ceil(r.max * f));
      }
    }
  });

  it('Reserven skalieren mit der Fläche: große Ranches haben im Schnitt mehr Öl', () => {
    let klein = 0;
    let gross = 0;
    let nKlein = 0;
    let nGross = 0;
    for (let i = 0; i < 100; i++) {
      for (const p of world(`flaeche-${i}`)) {
        if (p.reserves === 0) continue;
        if (p.area < balance.ranches.slotArea) {
          klein += p.reserves;
          nKlein++;
        } else if (p.area > 3 * balance.ranches.slotArea) {
          gross += p.reserves;
          nGross++;
        }
      }
    }
    expect(gross / nGross).toBeGreaterThan(2 * (klein / nKlein));
  });

  it('die Geologie fällt je Seed anders aus', () => {
    const a = world('seed-a').map((p) => p.geology).join();
    const b = world('seed-b').map((p) => p.geology).join();
    expect(a).not.toEqual(b);
  });

  it('die Mitte des Salzdoms liegt im Kern, eine Ecke des Gebiets am Rand', () => {
    expect(zoneFor(balance, 'salthill', dome[0], dome[1]).name).toBe('kern');
    expect(zoneFor(balance, 'salthill', 13.5, 7.2).name).toBe('rand');
  });

  it('die Zone kommt aus dem Abstand der Ranch-Mitte zum Salzdom', () => {
    for (const p of world('zonen')) expect(p.zone).toBe(zoneFor(balance, p.region, p.x, p.y).name);
  });

  it('Salt Hill ist im Schnitt ergiebiger als der Rand (über 300 Welten, je Fläche)', () => {
    const oil = { kern: { a: 0, sum: 0 }, rand: { a: 0, sum: 0 } };
    for (let i = 0; i < 300; i++) {
      for (const p of world(`welt-${i}`)) {
        if ((p.zone === 'kern' || p.zone === 'rand') && !p.discovery) {
          oil[p.zone].a += p.area;
          oil[p.zone].sum += p.reserves;
        }
      }
    }
    expect(oil.kern.sum / oil.kern.a).toBeGreaterThan(2 * (oil.rand.sum / oil.rand.a));
  });

  it('die Figuren aus den Ereignissen haben ihre Ranch mit festem Landbesitzer', () => {
    for (const seed of ['harlan', 'brandt', 'moss']) {
      const state = { parcels: world(seed) };
      for (const f of balance.world.figures) {
        const ranch = ranchOfFigure(state, f.id)!;
        expect(ranch).toBeDefined();
        expect(ranch.name).toBe(f.name.de);
        expect(ranch.owner).toBe(f.owner);
        expect(ranch.landowner).toBe(f.landowner);
        expect(ranch.discovery).toBe(false);
      }
    }
  });
});

describe('Ergiebigkeit der Gebiete (0.4.20+41, map.yaml richness/chapter)', () => {
  const ohne = { ...balance, world: { ...balance.world, regions: balance.world.regions.map((r) => ({ ...r, richness: undefined })) } };

  it('Kapitel-2-Gebiete und die Küstenebene haben mehr Öl je Ranch, Salt Hill bleibt gleich', () => {
    for (const id of ['salthill', 'hollins', 'kueste']) {
      const faktor = regionRichness(balance.world, id).reserves;
      const mit = generateParcels(balance, 'reich', [id]);
      const roh = generateParcels(ohne, 'reich', [id]);
      expect(mit.length).toBe(roh.length);
      mit.forEach((p, i) => {
        // Gleicher Zufall: gleiche Ranches, Reserven × Faktor (gerundet); bessere Fundchance kann aus „trocken“ Öl machen.
        if (roh[i].reserves > 0 && p.reserves > 0 && p.geology === roh[i].geology) expect(Math.abs(p.reserves - roh[i].reserves * faktor)).toBeLessThanOrEqual(faktor + 1);
        expect(p.chance ?? 0).toBeGreaterThanOrEqual(roh[i].chance ?? 0);
      });
    }
    expect(regionRichness(balance.world, 'salthill')).toEqual({ reserves: 1, chance: 0 });
    expect(regionRichness(balance.world, 'hollins').reserves).toBeGreaterThan(1);
    expect(regionRichness(balance.world, 'kueste').reserves).toBeGreaterThan(regionRichness(balance.world, 'hollins').reserves);
  });

  it('das öffentliche Wissen kennt den Aufschlag der Fundchance', () => {
    const plus = regionRichness(balance.world, 'kueste').chance;
    expect(plus).toBeGreaterThan(0);
    expect(zoneChance(balance, { zone: 'ring', region: 'kueste' })).toBeCloseTo(zoneChance(balance, { zone: 'ring', region: 'salthill' }) + plus, 6);
  });

  it('Kapitel je Gebiet: Salt Hill 1, gesperrte Gebiete 2, die Küstenebene 3', () => {
    const k = (id: string) => regionChapter(balance.world.regions.find((r) => r.id === id)!);
    expect([k('salthill'), k('hollins'), k('cottonwood'), k('bitterwasser'), k('kueste')]).toEqual([1, 2, 2, 2, 3]);
  });
});
