// 4.11: Die Schnittstelle zum Weltmodell liest Block As state.worldModel (main 9d1d837).
import { describe, expect, it } from 'vitest';
import { chapterOf, worldPort, type WorldPort } from './worldPort';

const ersatz: WorldPort = { mood: 50, tech: 12, government: null };

/** Ein Zustand mit dem Weltmodell in der Form von main (world.ts, WorldState) – nur die Felder, auf die es ankommt, plus ein paar andere. */
function mitWeltmodell(w: Record<string, unknown>): object {
  return {
    round: 41,
    chapter: 2,
    worldModel: {
      rng: 123,
      price: 1.1,
      credit: 50,
      tension: 20,
      nationalism: 12,
      techStart: 8,
      parties: { handel: 0.4, volksbund: 0.3, provinz: 0.3 },
      electionIn: 7,
      war: 0,
      crash: 0,
      ...w,
    },
  };
}

describe('worldPort (4.11 Schnittstelle zu 4.1)', () => {
  it('liest Stimmung, Technikstand und Regierung aus state.worldModel', () => {
    const p = worldPort(mitWeltmodell({ mood: 31, tech: 14.5, government: 'volksbund' }), ersatz);
    expect(p).toEqual({ mood: 31, tech: 14.5, government: 'volksbund' });
  });

  it('worldModel geht vor einem älteren state.world', () => {
    const s = { ...mitWeltmodell({ mood: 20, tech: 9, government: 'handel' }), world: { mood: 90, tech: 80, government: 'provinz' } };
    expect(worldPort(s, ersatz)).toEqual({ mood: 20, tech: 9, government: 'handel' });
    expect(worldPort({ world: { mood: 90 } }, ersatz).mood).toBe(90);
  });

  it('ohne Weltmodell oder mit kaputten Feldern gelten die Ersatzwerte', () => {
    expect(worldPort({ round: 3 }, ersatz)).toEqual(ersatz);
    expect(worldPort(mitWeltmodell({ mood: 'gut', tech: Number.NaN, government: 'monarchie' }), ersatz)).toEqual(ersatz);
    expect(worldPort(mitWeltmodell({ mood: 140, tech: -3 }), ersatz)).toEqual({ mood: 100, tech: 0, government: null });
  });

  it('chapterOf: ohne Feld Kapitel 1', () => {
    expect(chapterOf({})).toBe(1);
    expect(chapterOf({ chapter: 2 })).toBe(2);
  });
});
