import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './game';
import { settleIncomeTax, taxableProfit } from './lawEffects';
import { loadBalance } from './testBalance';
import { newWorld } from './world';

const balance = loadBalance();
const steuer = balance.laws.find((l) => l.id === 'income_tax')!;

/** Spielstand mit beschlossenem Gesetz (oder ohne). */
function mitGesetz(ids: string[], cash = 10_000): GameState {
  const g = newGame('steuer', balance);
  const w = g.worldModel ?? newWorld('steuer', balance.worldModel);
  const bills = { ...w.laws.bills };
  for (const id of ids) bills[id] = { stage: 'passed', pressure: 0, voteIn: 0, cooldown: 0, proposals: 1, passedRound: 1, lastVote: 0.6, weakened: false, lobbyVote: 0 };
  return { ...g, cash, worldModel: { ...w, laws: { ...w.laws, bills } } };
}

describe('Einkommensteuer (0.4.20+17)', () => {
  it('steht mit 5 % im Gesetz', () => {
    expect(steuer.effects.rules.incomeTax).toBe(0.05);
  });

  it('nimmt den Steuersatz vom Gewinn der Runde – nicht bei Verlust, ohne Gesetz gar nicht', () => {
    const vorher = mitGesetz(['income_tax'], 10_000);
    const nachher = { ...vorher, cash: 14_000 };
    expect(taxableProfit(vorher, nachher)).toBe(4_000);
    const r = settleIncomeTax(vorher, nachher, balance);
    expect(r.cash).toBe(14_000 - 4_000 * 0.05);
    expect(r.log.at(-1)).toContain('Einkommensteuer');
    expect(settleIncomeTax(vorher, { ...vorher, cash: 9_000 }, balance).cash).toBe(9_000);
    const frei = mitGesetz([], 10_000);
    expect(settleIncomeTax(frei, { ...frei, cash: 14_000 }, balance).cash).toBe(14_000);
  });

  it('geliehenes Geld ist kein Gewinn', () => {
    const vorher = mitGesetz(['income_tax'], 10_000);
    const nachher: GameState = { ...vorher, cash: 14_000, loans: [...vorher.loans, { ...(vorher.loans[0] ?? {}), principal: 4_000 } as GameState['loans'][number]] };
    expect(taxableProfit(vorher, nachher)).toBeLessThanOrEqual(0.01);
  });
});
