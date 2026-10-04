// Integration 4.17 mit main (4.1 Weltmodell) und den anderen Phase-4-Systemen:
// Kreditzins aus einer Hand, Konsortium im Weltmodell, Projekte im Imperiumswert,
// Kapitelnummer über den gemeinsamen Helfer.
import { describe, expect, it } from 'vitest';
import { bankRate, bankRateAdd, loanRate, takeLoan } from './credit';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { chapterOf as k3Chapter, ensureKapitel3 } from './kapitel3';
import { konsortiumWorldInput } from './konsortium';
import { chapterOf } from './stocks';
import { standRateDiscount } from './stand';
import { loadBalance } from './testBalance';
import { k3Game } from './testKapitel3';

const balance = loadBalance();

function mitMacht(s: GameState, power: number): GameState {
  const k = ensureKapitel3(s, balance);
  return { ...k, kapitel3: { ...k.kapitel3!, konsortium: { ...k.kapitel3!.konsortium, power } } };
}

describe('Kapitel 3 nach der Integration', () => {
  it('bankRate rechnet Kreditklima (4.1), eigene Bank (4.16) und Stand-Rabatt (4.17) zusammen – Kassenbuch = Vertrag', () => {
    const s = newGame('int-zins', balance);
    const crash = { ...s, worldModel: { ...s.worldModel, credit: 10, crash: 3 } };
    const klima = bankRateAdd(crash, balance);
    expect(klima).not.toBe(0);
    expect(bankRate(crash, balance, false)).toBeCloseTo(loanRate(balance, crash.rating, false, klima), 6);
    const k = ensureKapitel3({ ...k3Game('int-zins2', balance), worldModel: crash.worldModel } as GameState, balance);
    const auf = { ...k, kapitel3: { ...k.kapitel3!, stand: { ...k.kapitel3!.stand, ansehen: 90, admitted: true } } } as GameState;
    const rabatt = standRateDiscount(auf, balance);
    expect(rabatt).toBeGreaterThan(0);
    expect(bankRate(auf, balance, false)).toBeCloseTo(loanRate(balance, auf.rating, false, bankRateAdd(auf, balance)) - rabatt, 6);
    const kredit = takeLoan(auf, balance, 500);
    expect(kredit.ok).toBe(true);
    if (kredit.ok) expect(kredit.loan.rate).toBeCloseTo(bankRate(auf, balance, false), 6);
  });

  it('die Macht des Konsortiums wirkt im Rundenende aufs Weltmodell; ohne Kapitel 3 nichts', () => {
    expect(konsortiumWorldInput(newGame('int-welt', balance), balance)).toEqual({ tensionShift: 0, creditShift: 0, moodShift: 0 });
    const basis = k3Game('int-welt', balance);
    const stark = endRound(mitMacht(basis, 100), balance);
    const schwach = endRound(mitMacht(basis, 50), balance);
    // Gleiche Würfel, nur die Macht unterscheidet sich: Spannung und Kreditklima liegen höher.
    expect(stark.worldModel.tension).toBeGreaterThan(schwach.worldModel.tension);
    expect(stark.worldModel.credit).toBeGreaterThan(schwach.worldModel.credit);
  });

  it('Anteile an Konsortialprojekten zählen zum Imperiumswert, gescheiterte nicht', () => {
    const k = ensureKapitel3(k3Game('int-wert', balance), balance);
    const stake = { id: 'fernpipeline', share: 0.25, paid: 50_000, joinedRound: k.round, readyRound: k.round + 4, earned: 0 };
    const mit = (status: 'bau' | 'gescheitert') =>
      ({ ...k, kapitel3: { ...k.kapitel3!, projekte: { ...k.kapitel3!.projekte, stakes: [{ ...stake, status }] } } }) as GameState;
    expect(empireValue(mit('bau'), balance)).toBeCloseTo(empireValue(k, balance) + 50_000, 2);
    expect(empireValue(mit('gescheitert'), balance)).toBeCloseTo(empireValue(k, balance), 2);
  });

  it('Kapitelnummer kommt aus dem gemeinsamen Helfer (stocks.ts)', () => {
    expect(k3Chapter).toBe(chapterOf);
    expect(k3Chapter({ ...newGame('int-kap', balance), chapter: 3 } as GameState)).toBe(3);
  });
});
