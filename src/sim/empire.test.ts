import { describe, expect, it } from 'vitest';
import type { Well } from './drilling';
import { empireValue, ownReserves } from './empire';
import { newGame, type GameState } from './game';
import { fieldStatus, wellRate } from './production';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Eine fördernde Quelle auf der Parzelle. */
function quelle(parcelId: string): Well {
  return {
    parcelId,
    stage: 1,
    status: 'found',
    roundsLeft: 0,
    spent: 1500,
    oilStage: 1,
    result: 'small',
    production: { initialRate: 400, roundsProduced: 1, lastRate: 400, total: 400 },
    startRound: 1,
  };
}

describe('Imperiumswert', () => {
  const start = newGame('imperium', balance);

  it('am Start ist er die Startkasse', () => {
    expect(empireValue(start, balance)).toBe(balance.start.cash);
  });

  it('Öl im Tank zählt ohne das Förderzins-Öl', () => {
    const state: GameState = { ...start, oilStock: 100, royaltyOil: 20, postedPrice: 1 };
    expect(empireValue(state, balance)).toBe(start.cash + 80);
  });

  it('ein Kredit senkt den Wert um die Restschuld', () => {
    const state: GameState = {
      ...start,
      loans: [{ id: 1, source: 'bank', principal: 1000, rate: 0.07, takenRound: 1, collateral: null }],
    };
    expect(empireValue(state, balance)).toBe(start.cash - 1000);
  });

  it('Reserven zählen nur auf Feldern mit eigener fördernder Quelle', () => {
    const [eigenes, fremdes] = start.fields;
    expect(fremdes).toBeDefined();
    const state: GameState = { ...start, postedPrice: 1, wells: [quelle(eigenes.parcelIds[0])] };
    expect(ownReserves(state, balance, eigenes.id)).toBeGreaterThan(0);
    expect(ownReserves(state, balance, fremdes.id)).toBe(0);
    const erwartet = Math.round((start.cash + balance.empire.reserveFactor * 1 * ownReserves(state, balance, eigenes.id)) * 100) / 100;
    expect(empireValue(state, balance)).toBe(erwartet);
  });

  it('eigene Reserven: was die Quellen noch fördern (Rate / Rückgang), nicht das ganze Feld', () => {
    const gross = start.fields.find((f) => f.reserves > 10 * 400 / balance.production.decline)!;
    expect(gross).toBeDefined();
    const state: GameState = { ...start, postedPrice: 1, wells: [quelle(gross.parcelIds[0])] };
    const naechsteRate = wellRate(balance, state.wells[0], 1);
    expect(ownReserves(state, balance, gross.id)).toBe(Math.round(naechsteRate / balance.production.decline));
    expect(ownReserves(state, balance, gross.id)).toBeLessThan(fieldStatus(state, balance, gross).remaining);
  });

  it('eigene Reserven: höchstens, was im Feld noch förderbar ist', () => {
    const feld = start.fields[0];
    const fast = { ...quelle(feld.parcelIds[0]), production: { initialRate: 400, roundsProduced: 1, lastRate: 400, total: feld.reserves - 10 } };
    const state: GameState = { ...start, postedPrice: 1, wells: [fast] };
    expect(ownReserves(state, balance, feld.id)).toBe(fieldStatus(state, balance, feld).remaining);
    expect(ownReserves(state, balance, feld.id)).toBeLessThanOrEqual(10);
  });

  it('pleite ist 0 wert', () => {
    const state: GameState = { ...start, finished: true, ending: 'pleite', cash: 5000 };
    expect(empireValue(state, balance)).toBe(0);
  });
});
