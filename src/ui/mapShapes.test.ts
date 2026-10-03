// Zeichenhilfen der Karte (0.2.15+6): Status je Ranch, Bohrplätze, Namen.
import { describe, expect, it } from 'vitest';
import { newGame } from '../sim/game';
import type { Lease, LeaseOption } from '../sim/lease';
import { pointInPolygon, type Vec } from '../sim/worldMap';
import { loadBalance } from '../sim/testBalance';
import { loadEvents } from '../sim/testEvents';
import { innerRadius, labelFits, ranchStatus, slotPositions, widthAt } from './mapShapes';

const quadrat: Vec[] = [[0, 0], [4, 0], [4, 4], [0, 4]];

describe('Zeichenhilfen der Karte', () => {
  it('Status: frei, Option, Pacht, Bullard und die Entdeckungsquelle', () => {
    const game = newGame('karte', loadBalance(), loadEvents());
    const fund = game.parcels.find((p) => p.discovery)!;
    const andere = game.parcels.filter((p) => !p.discovery && !game.options.some((o) => o.parcelId === p.id));
    expect(ranchStatus(game, fund.id)).toBe('other');
    expect(ranchStatus(game, andere[0].id)).toBe('free');
    const pacht = (parcelId: string, holder: Lease['holder']): Lease => ({ parcelId, holder, bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 5, drilled: false });
    const option = (parcelId: string, holder: LeaseOption['holder']): LeaseOption => ({ parcelId, holder, bonus: 0, royalty: 0.125, fee: 0, free: false, expiresAfterRound: 3 });
    const g = {
      ...game,
      options: [option(andere[0].id, 'jacob'), option(andere[3].id, 'bullard')],
      leases: [pacht(andere[1].id, 'jacob'), pacht(andere[2].id, 'bullard')],
    };
    expect(ranchStatus(g, andere[0].id)).toBe('option');
    expect(ranchStatus(g, andere[1].id)).toBe('lease');
    expect(ranchStatus(g, andere[2].id)).toBe('bullard');
    expect(ranchStatus(g, andere[3].id)).toBe('bullardOption');
  });

  it('Bohrplätze liegen alle in der Ranch und nicht aufeinander', () => {
    for (let n = 1; n <= 6; n++) {
      const plaetze = slotPositions(quadrat, [2, 2], n);
      expect(plaetze).toHaveLength(n);
      for (const p of plaetze) expect(pointInPolygon(p, quadrat)).toBe(true);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(plaetze[i][0] - plaetze[j][0], plaetze[i][1] - plaetze[j][1])).toBeGreaterThan(0.2);
    }
    expect(slotPositions(quadrat, [2, 2], 0)).toEqual([]);
  });

  it('Platz in der Ranch: Innenradius und Breite', () => {
    expect(innerRadius(quadrat, [2, 2])).toBeCloseTo(2);
    expect(widthAt(quadrat, 2)).toBeCloseTo(4);
    expect(widthAt(quadrat, 9)).toBe(0);
  });

  it('Namen nur, wenn genug Platz ist', () => {
    expect(labelFits(quadrat, [2, 2], 10, 0.3)).toBe(true);
    expect(labelFits(quadrat, [2, 2], 40, 0.3)).toBe(false);
    expect(labelFits(quadrat, [2, 2], 4, 3)).toBe(false);
  });
});
