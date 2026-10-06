import { describe, expect, it } from 'vitest';
import type { Well } from './drilling';
import { barrelsPerRound, estimateOffer } from './diplomacyEstimate';
import { newGame } from './game';
import { wellRate } from './production';
import { loadBalance } from './testBalance';

const balance = loadBalance();

function mitQuelle() {
  const start = newGame('schaetzung', balance);
  const p = start.parcels[0];
  const quelle: Well = { id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, result: 'small', production: { initialRate: 8000, lastRate: 8000, total: 0, roundsProduced: 1 }, startRound: 1 };
  return { start, quelle, state: { ...start, wells: [quelle] } };
}

describe('Schätzung der Absprachen (diplomacyEstimate)', () => {
  it('ohne fördernde Quelle 0 Barrel, mit Quelle die Rate der Quelle', () => {
    const { start, quelle, state } = mitQuelle();
    expect(barrelsPerRound({ ...start, wells: [] }, balance)).toBe(0);
    expect(barrelsPerRound(state, balance)).toBe(wellRate(balance, quelle, 1));
  });

  it('Preisabsprache: pricePremium × Förderung, Laufzeit aus balance, Kartell', () => {
    const { state } = mitQuelle();
    const e = estimateOffer(state, balance, 'price')!;
    const p = balance.diplomacy.pacts;
    expect(e.perBarrel).toBe(p.pricePremium);
    expect(e.perRound).toBe(Math.round(p.pricePremium * barrelsPerRound(state, balance)));
    expect(e.perRound).toBeGreaterThan(0);
    expect(e.rounds).toBe(p.rounds);
    expect(e.cartel).toBe(true);
    expect(e.traceSeverity).toBe(p.cartelHeat);
  });

  it('Liefervertrag: supplyPremium, kein Kartell', () => {
    const { state } = mitQuelle();
    const e = estimateOffer(state, balance, 'supply')!;
    expect(e.perBarrel).toBe(balance.diplomacy.pacts.supplyPremium);
    expect(e.cartel).toBe(false);
  });

  it('Gebietsabsprache: nennt den Anteil, um den neue Pachten billiger werden, keinen erfundenen Betrag', () => {
    const { state } = mitQuelle();
    const e = estimateOffer(state, balance, 'territory')!;
    expect(e.perRound).toBeNull();
    expect(e.leaseDiscount).toBe(balance.diplomacy.pacts.territoryLeaseCost);
    expect(e.perBarrel).toBeNull();
    expect(e.cartel).toBe(true);
  });

  it('Kreuzbeteiligung ohne laufenden Ertrag, Kaufangebot ohne Schätzung', () => {
    const { state } = mitQuelle();
    expect(estimateOffer(state, balance, 'cross')!.perRound).toBeNull();
    expect(estimateOffer(state, balance, 'buyout')).toBeNull();
  });
});
