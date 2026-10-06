// Raffinerie-Betrieb der Kampagnen-Bots (0.4.20+17): Öl im Tank halten, Mix/Zufuhr einstellen, ausbauen.
import { describe, expect, it } from 'vitest';
import { refineryHold } from './bots';
import { refineryGain, runRefinery, tuneRefinery } from './botsKapitel3';
import { newGame, type GameState } from './game';
import { crudeVsRefined, refineryCapacity, refineryMixBounds, unlockRefinery } from './refinery';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Fertige Raffinerie mit Pipeline, viel Öl im Tank und Geld; Kapitel 2 mit vielen Restrunden. */
function anlage(level = 1, extra: Partial<GameState> = {}): GameState {
  const s = unlockRefinery({ ...newGame('bot-raffinerie', balance), cash: 1_000_000, oilStock: 200_000, royaltyOil: 0, chapter: 2, round: 41, totalRounds: 56, ...extra } as GameState, balance);
  return { ...s, logistics: { ...s.logistics, pipeline: 'ready' }, refinery: { ...s.refinery!, level } };
}

describe('Öl für die eigene Raffinerie (refineryHold)', () => {
  it('ohne laufende Anlage hält der Bot nichts zurück', () => {
    expect(refineryHold(newGame('ohne', balance), balance)).toBe(0);
    expect(refineryHold(anlage(0), balance)).toBe(0);
    const brennt = anlage(1);
    expect(refineryHold({ ...brennt, refinery: { ...brennt.refinery!, repairLeft: 2 } }, balance)).toBe(0);
  });

  it('sonst so viel, wie die Anlage bei der eingestellten Zufuhr verarbeitet', () => {
    const s = anlage(2);
    const halb = { ...s, refinery: { ...s.refinery!, intake: 0.5 } };
    expect(refineryHold(halb, balance)).toBe(Math.floor(0.5 * refineryCapacity(halb, balance)));
  });
});

describe('Mix und Zufuhr (tuneRefinery)', () => {
  it('stellt nie schlechter ein als vorher und bleibt in den Grenzen der Technik', () => {
    const s = anlage(1);
    const crudeNet = crudeVsRefined(s, balance).crudeNet;
    const t = tuneRefinery(s, balance);
    expect(refineryGain(t, balance, crudeNet)).toBeGreaterThanOrEqual(refineryGain(s, balance, crudeNet));
    const b = refineryMixBounds(t, balance, t.refinery!.tech);
    for (const [p, v] of Object.entries(t.refinery!.mix)) {
      expect(v).toBeGreaterThanOrEqual(b[p as keyof typeof b].min - 1e-9);
      expect(v).toBeLessThanOrEqual(b[p as keyof typeof b].max + 1e-9);
    }
    expect(tuneRefinery(t, balance)).toEqual(t);
  });

  it('ohne fertige Anlage ändert er nichts', () => {
    const s = anlage(0);
    expect(tuneRefinery(s, balance)).toBe(s);
  });
});

describe('Ausbau (runRefinery)', () => {
  it('vorsichtig (refineryExpand null) baut nie aus', () => {
    expect(runRefinery(anlage(1), balance, { reserve: 0, perRound: 0, refineryExpand: null }).refinery!.project).toBeNull();
  });

  it('baut aus, wenn der Mehrerlös bis Kapitelende reicht – kurz vor Schluss, ohne Geld oder ohne Mehrerlös nicht', () => {
    // Die Nachfrage nach Produkten ist schon bei halber Kapazität der ersten Stufe gesättigt: Ausbau lohnt nicht …
    const p = { reserve: 0, perRound: 0, refineryExpand: 0.01 };
    const spaet = {};
    expect(runRefinery(anlage(1, spaet), balance, p).refinery!.project).toBeNull();
    // … bei einer kleinen Anlage schon.
    const frei = { ...balance, refinery: { ...balance.refinery, unitCapacity: 4000 } };
    expect(runRefinery(anlage(1, spaet), frei, p).refinery!.project).toBe('expand');
    // Kapitel 2 rechnet Kapitel 3 mit (16 Runden mehr) – kurz vor Kapitelende von Kapitel 3 lohnt nichts mehr.
    expect(runRefinery(anlage(1, { ...spaet, round: 55 }), frei, p).refinery!.project).toBe('expand');
    expect(runRefinery(anlage(1, { ...spaet, chapter: 3, round: 95, totalRounds: 96 }), frei, p).refinery!.project).toBeNull();
    expect(runRefinery(anlage(1, { ...spaet, cash: 1000 }), frei, p).refinery!.project).toBeNull();
  });
});
