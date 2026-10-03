import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import {
  checkBankruptcy,
  creditLimit,
  debt,
  freeCollateral,
  headroom,
  loanRate,
  loanSlider,
  quarterInterest,
  quarterInterestTotal,
  repay,
  repayMax,
  repaySlider,
  settleLoans,
  sliderAmount,
  sliderPositions,
  takeLoan,
  type Loan,
} from './credit';
import type { Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { buyLease } from './lease';
import { loadBalance } from './testBalance';

// Die Handrechnungen hier gehen von den GDD-Zahlen aus (§12): Bankrahmen 3.000 $,
// Geldverleiher bis 2.000 $. balance.yaml weicht seit 1.15 davon ab (Bot-Justierung);
// die Regeln sind dieselben, deshalb stehen die beiden Werte hier fest.
const echt = loadBalance();
const balance: Balance = { ...echt, credit: { ...echt.credit, limitBase: 3000, emergency: { ...echt.credit.emergency, limit: 2000 } } };
const C = balance.credit;

/** Spiel mit n fördernden Quellen; die Bohrungen werden nur so hingesetzt. */
function mitQuellen(n: number, seed = 'quellen'): GameState {
  const state = newGame(seed, balance);
  const wells: Well[] = state.parcels
    .filter((p) => p.reserves > 0)
    .slice(0, n)
    .map((p) => ({
      parcelId: p.id,
      stage: 1,
      status: 'found' as const,
      roundsLeft: 0,
      spent: 1500,
      oilStage: 1,
      result: 'small' as const,
      production: { initialRate: 400, roundsProduced: 3, lastRate: 300, total: 1000 },
      startRound: 1,
    }));
  return { ...state, wells };
}

/** Spiel mit einem Bankkredit über amount zum Zins rate. */
function mitKredit(amount: number, rate: number, state: GameState = newGame('kredit', balance)): GameState {
  return {
    ...state,
    loans: [{ id: 1, source: 'bank', principal: amount, rate, takenRound: 1, collateral: null }],
  };
}

/** Spiel mit einem Notkredit des Geldverleihers. */
function mitNotkredit(amount: number, state: GameState = newGame('notkredit', balance)): GameState {
  return {
    ...state,
    loans: [{ id: 1, source: 'lender', principal: amount, rate: C.emergency.rate, takenRound: 1, collateral: null }],
  };
}

/** Leiht bei der Bank; gibt den neuen Zustand zurück. */
function leihe(state: GameState, amount: number): GameState {
  const r = takeLoan(state, balance, amount);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('Bankrahmen und Schulden', () => {
  it('der Rahmen ist 3.000 $ plus 2.000 $ je fördernder Quelle', () => {
    expect(creditLimit(mitQuellen(0), balance)).toBe(C.limitBase);
    expect(creditLimit(mitQuellen(0), balance)).toBe(3000);
    expect(creditLimit(mitQuellen(1), balance)).toBe(5000);
    expect(creditLimit(mitQuellen(2), balance)).toBe(7000);
  });

  it('eine Bohrung, die noch nicht fördert, verlängert den Rahmen nicht', () => {
    const state = mitQuellen(1);
    const gebohrt: GameState = { ...state, wells: [{ ...state.wells[0], status: 'drilling' }] };
    expect(creditLimit(gebohrt, balance)).toBe(3000);
  });

  it('der freie Rahmen sinkt mit jedem Bankkredit', () => {
    const leer = newGame('rahmen', balance);
    expect(headroom(leer, balance)).toBe(3000);
    expect(headroom(leihe(leer, 1000), balance)).toBe(2000);
    expect(headroom(leihe(leihe(leer, 1000), 500), balance)).toBe(1500);
    expect(headroom(leihe(leer, 3000), balance)).toBe(0);
  });

  it('Schulden zählen Bank und Geldverleiher, der Rahmen nur die Bank', () => {
    const state = leihe(leihe(mitQuellen(1), 1000), 500);
    expect(debt(state)).toBe(1500);
    // Eine Quelle als Pfand: Rahmen 5.000 $, davon 1.500 $ bei der Bank belegt.
    expect(headroom(state, balance)).toBe(3500);
    const mitGeldverleiher = { ...state, loans: [...state.loans, mitNotkredit(700).loans[0]] };
    expect(debt(mitGeldverleiher)).toBe(2200);
    expect(headroom(mitGeldverleiher, balance)).toBe(3500);
  });
});

describe('Zinssätze (GDD §12)', () => {
  it('Rating B kostet 5 % pro Jahr, wenn eine Quelle als Pfand dient', () => {
    expect(C.rates.B).toBe(0.07);
    expect(loanRate(balance, 'B', true)).toBe(0.05);
  });

  it('Rating B kostet 10 % pro Jahr ohne Sicherheit', () => {
    expect(loanRate(balance, 'B', false)).toBe(0.1);
  });

  it('mit Pfand zwei Punkte weniger, ohne Sicherheit drei mehr – bei jedem Rating', () => {
    for (const rating of ['A', 'B', 'C', 'D'] as const) {
      expect(loanRate(balance, rating, true)).toBeCloseTo(C.rates[rating] - 0.02, 10);
      expect(loanRate(balance, rating, false)).toBeCloseTo(C.rates[rating] + 0.03, 10);
    }
    expect(C.rates).toEqual({ A: 0.05, B: 0.07, C: 0.1, D: 0.15 });
  });

  it('ein schlechteres Rating kostet mehr', () => {
    const zins = (['A', 'B', 'C', 'D'] as const).map((r) => loanRate(balance, r, true));
    expect(zins).toEqual([...zins].sort((a, b) => a - b));
  });

  it('rechnet ohne Gleitkomma: 7 % minus 2 % sind genau 5 %', () => {
    expect(loanRate(balance, 'B', true)).toBe(0.05);
    expect(loanRate(balance, 'C', true)).toBe(0.08);
    expect(loanRate(balance, 'D', true)).toBe(0.13);
  });

  it('der Zins fällt nie unter null', () => {
    const bal: Balance = {
      ...balance,
      credit: { ...C, rates: { A: 0.01, B: 0.02, C: 0.03, D: 0.04 } },
    };
    expect(loanRate(bal, 'A', true)).toBe(0);
  });

  it('die Zinsrechnung der Bankpanel: ein Quartal ist ein Viertel des Jahreszinses', () => {
    expect(quarterInterest({ principal: 2000, rate: 0.05 })).toBe(25);
    expect(quarterInterest({ principal: 1000, rate: 0.07 })).toBe(17.5);
    expect(quarterInterest({ principal: 17.5, rate: 0.4 })).toBe(1.75);
  });
});

describe('Kredit aufnehmen (takeLoan)', () => {
  it('das Geld kommt sofort in die Kasse, der Kredit steht in der Liste', () => {
    const vorher = newGame('aufnehmen', balance);
    const r = takeLoan(vorher, balance, 2000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(vorher.cash + 2000);
    expect(r.state.loans).toEqual([
      { id: 1, source: 'bank', principal: 2000, rate: 0.1, takenRound: 1, collateral: null },
    ]);
    expect(r.state.log.at(-1)).toMatch(/2\.000 \$ bei der Bank geliehen \(10 % pro Jahr, ohne Pfand\)/);
  });

  it('ohne fördernde Quelle zahlt Jacob den Aufschlag, mit Pfand die 5 %', () => {
    expect(takeLoan(newGame('ohne', balance), balance, 1000).ok).toBe(true);
    const sicher = takeLoan(mitQuellen(1, 'mit'), balance, 1000);
    if (!sicher.ok) throw new Error(sicher.reason);
    expect(sicher.loan.rate).toBe(0.05);
    const quelle = mitQuellen(1, 'mit').wells[0];
    expect(sicher.loan.collateral).toBe(quelle.parcelId);
    expect(sicher.state.log.at(-1)).toMatch(/5 % pro Jahr, Pfand ist die Quelle auf Parzelle \d+\/\d+/);
  });

  it('eine verpfändete Quelle wird nicht zweimal verwendet – der zweite Kredit ist ungesichert', () => {
    const mitQuelle = mitQuellen(1, 'einpfand');
    const erster = takeLoan(mitQuelle, balance, 1000);
    if (!erster.ok) throw new Error(erster.reason);
    expect(freeCollateral(erster.state)).toHaveLength(0);
    const zweiter = takeLoan(erster.state, balance, 1000);
    if (!zweiter.ok) throw new Error(zweiter.reason);
    expect(zweiter.loan.rate).toBe(0.1);
    expect(zweiter.loan.collateral).toBeNull();
    expect(zweiter.loan.id).toBe(2);
  });

  it('eine zweite Quelle verpfändet sich für den zweiten Kredit', () => {
    const zwei = mitQuellen(2, 'zweipfand');
    const erster = takeLoan(zwei, balance, 1000);
    if (!erster.ok) throw new Error(erster.reason);
    const zweiter = takeLoan(erster.state, balance, 1000);
    if (!zweiter.ok) throw new Error(zweiter.reason);
    expect(zweiter.loan.rate).toBe(0.05);
    expect(freeCollateral(zweiter.state)).toHaveLength(0);
  });

  it('lehnt mehr ab, als im Rahmen ist', () => {
    const leer = newGame('grenze', balance);
    expect(takeLoan(leer, balance, C.limitBase).ok).toBe(true);
    const voll = takeLoan(leihe(leer, C.limitBase), balance, 500);
    expect(voll.ok).toBe(false);
    if (!voll.ok) expect(voll.reason).toMatch(/Im Rahmen sind noch 0 \$/);
    // Mit einer fördernden Quelle als Pfand ist der Rahmen 2.000 $ größer.
    expect(takeLoan(mitQuellen(1, 'mehr'), balance, C.limitBase + C.limitPerWell).ok).toBe(true);
    expect(takeLoan(leihe(mitQuellen(1, 'mehr'), C.limitBase + C.limitPerWell), balance, 500).ok).toBe(false);
  });

  it('lehnt Beträge unter dem kleinsten Kredit ab', () => {
    const r = takeLoan(newGame('kleinkredit', balance), balance, C.minLoan - 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/kleinste Kredit bei der Bank ist 500 \$/);
    expect(takeLoan(newGame('kleinkredit', balance), balance, C.minLoan).ok).toBe(true);
  });

  it('lehnt bei Rating D ab – die Bank gibt dann keinen neuen Kredit', () => {
    const r = takeLoan({ ...newGame('ratingd', balance), rating: 'D' }, balance, 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Rating D/);
  });

  it('zwei nicht bezahlte Rundenenden bringen das Rating auf D', () => {
    let state = mitKredit(3000, 0.1, { ...newGame('verfall', balance), cash: 0 });
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(1);
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(2);
    expect(state.rating).toBe('D');
    expect(takeLoan(state, balance, 500).ok).toBe(false);
  });

  it('lehnt 0, negative Beträge und Bruchteile ab', () => {
    const state = newGame('ungueltig', balance);
    for (const n of [0, -500, 500.5, NaN]) expect(takeLoan(state, balance, n).ok).toBe(false);
  });

  it('lehnt ab, wenn das Kapitel beendet ist, und lässt den Zustand unberührt', () => {
    const state = { ...newGame('beendet', balance), finished: true };
    expect(takeLoan(state, balance, 500).ok).toBe(false);
    const vorher = newGame('rein', balance);
    const kopie = structuredClone(vorher);
    takeLoan(vorher, balance, 500);
    expect(vorher).toEqual(kopie);
  });
});

describe('Tilgen (repay)', () => {
  it('tilgt zuerst das teurere Geld: den Notkredit vor dem Bankkredit', () => {
    const bank = mitKredit(1000, 0.1);
    const beide = { ...bank, loans: [...bank.loans, { ...mitNotkredit(1000).loans[0], id: 2 }] };
    const r = repay(beide, balance, 400);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(beide.cash - 400);
    expect(r.state.loans).toEqual([
      { id: 1, source: 'bank', principal: 1000, rate: 0.1, takenRound: 1, collateral: null },
      { id: 2, source: 'lender', principal: 600, rate: C.emergency.rate, takenRound: 1, collateral: null },
    ]);
    expect(r.state.log.at(-1)).toMatch(/400 \$ getilgt – zuerst das teurere Geld \(40 % pro Jahr\)/);
  });

  it('zahlt das billigere Geld, wenn das billigere zuerst fällig ist', () => {
    const bank = mitKredit(1000, 0.1);
    const beide = { ...bank, loans: [...bank.loans, { ...mitNotkredit(1000).loans[0], id: 2 }] };
    const r = repay(beide, balance, 1400);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([
      { id: 1, source: 'bank', principal: 600, rate: 0.1, takenRound: 1, collateral: null },
    ]);
  });

  it('ein ganz getilgter Kredit verschwindet und gibt sein Pfand frei', () => {
    const quelle = mitQuellen(1, 'pfandfrei').wells[0];
    const verpfändet = leihe(mitQuellen(1, 'pfandfrei'), 1000);
    const r = repay(verpfändet, balance, 1000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([]);
    expect(r.state.cash).toBe(verpfändet.cash - 1000);
    expect(freeCollateral(r.state).map((w) => w.parcelId)).toEqual([quelle.parcelId]);
    expect(debt(r.state)).toBe(0);
  });

  it('eine Teilzahlung lässt den Rest stehen', () => {
    const state = mitKredit(1000, 0.1);
    const r = repay(state, balance, 250);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans[0].principal).toBe(750);
    expect(r.loan.principal).toBe(750);
  });

  it('lehnt mehr ab, als geschuldet oder in der Kasse ist', () => {
    const state = mitKredit(1000, 0.1);
    expect(repay(state, balance, 1001).ok).toBe(false);
    expect(repay(state, balance, 0).ok).toBe(false);
    expect(repay({ ...state, cash: 100 }, balance, 500).ok).toBe(false);
    expect(repay(state, balance, 1000).ok).toBe(true);
  });

  it('ohne Schulden und nach Kapitelende geht nichts', () => {
    expect(repay(newGame('sauber', balance), balance, 100).ok).toBe(false);
    expect(repay({ ...mitKredit(100, 0.1), finished: true }, balance, 100).ok).toBe(false);
  });

  it('verändert den Eingangszustand nicht', () => {
    const state = mitKredit(1000, 0.1);
    const kopie = structuredClone(state);
    repay(state, balance, 500);
    expect(state).toEqual(kopie);
  });
});

describe('Zinsen am Rundenende (settleLoans)', () => {
  it('zahlt für jeden Kredit ein Quartel Zins und meldet es im Protokoll', () => {
    const state = mitKredit(1000, 0.1, { ...newGame('zins', balance), cash: 2000 });
    const nach = settleLoans(state, balance);
    expect(nach.cash).toBe(1975);
    expect(nach.loans).toEqual(state.loans);
    expect(nach.log.at(-1)).toMatch(/Zinsen 25 \$ für 1 Kredit gezahlt\./);
  });

  it('reicht die Kasse nicht, leiht Jacob zuerst das billigere Geld bei der Bank', () => {
    // 1.000 $ zu 10 %: 25 $ Zinsen, 10 $ in der Kasse. Im Rahmen sind noch 2.000 $.
    const state = mitKredit(1000, 0.1, { ...newGame('bank-zuerst', balance), cash: 10 });
    const nach = settleLoans(state, balance);
    // Fehlbetrag 15 $, aufgerundet auf den kleinsten Kredit von 500 $.
    expect(nach.loans).toHaveLength(2);
    expect(nach.loans[1]).toMatchObject({ source: 'bank', principal: C.minLoan, takenRound: 1 });
    expect(nach.cash).toBe(10 - 25 + C.minLoan);
    expect(nach.missedPayments).toBe(0);
    expect(nach.log.some((l) => /Zinsen 10 \$ für 1 Kredit gezahlt\./.test(l))).toBe(true);
    expect(nach.log.some((l) => /bei der Bank geliehen/.test(l))).toBe(true);
  });

  it('ist der Bankrahmen leer, holt der Geldverleiher einen Notkredit über genau den Fehlbetrag', () => {
    const state = mitKredit(3000, 0.1, { ...newGame('notkredit', balance), cash: 0 });
    const nach = settleLoans(state, balance);
    // 75 $ Zinsen, die Kasse bleibt bei 0: der Notkredit bezahlt die Rechnung, Geld gibt es dafür nicht.
    expect(nach.cash).toBe(0);
    expect(nach.loans).toEqual([
      state.loans[0],
      { id: 2, source: 'lender', principal: 75, rate: C.emergency.rate, takenRound: 1, collateral: null },
    ]);
    expect(nach.missedPayments).toBe(1);
    expect(nach.log.some((l) => /Geldverleiher gibt einen Notkredit über 75 \$ zu 40 % pro Jahr/.test(l))).toBe(true);
    expect(nach.log.some((l) => /Zinsen .* gezahlt/.test(l))).toBe(false);
  });

  it('bei Rating D gibt die Bank nichts, der Geldverleiher springt ein', () => {
    const state = { ...mitKredit(1000, 0.1, { ...newGame('rating-d', balance), cash: 0 }), rating: 'D' as const };
    const nach = settleLoans(state, balance);
    expect(nach.loans[1]).toMatchObject({ source: 'lender', principal: 25 });
    expect(nach.cash).toBe(0);
  });

  it('der Notkredit bleibt in seinem Rahmen: danach bleiben Zinsen offen und die Kasse ist im Minus', () => {
    const voll = mitNotkredit(C.emergency.limit, { ...newGame('ausgelastet', balance), cash: 0, rating: 'D' });
    const nach = settleLoans(voll, balance);
    expect(nach.loans).toHaveLength(1);
    expect(nach.cash).toBe(-200);
    expect(nach.missedPayments).toBe(1);
    expect(nach.log.at(-1)).toMatch(/200 \$ bleiben offen/);
  });

  it('ein Notkredit zählt als Fehlzahlung, ein sauber bezahltes Quartal heilt einen Strich', () => {
    let state = mitKredit(3000, 0.1, { ...newGame('historie', balance), cash: 0 });
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(1);
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(2);
    state = { ...state, cash: 5000 };
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(1);
    state = settleLoans(state, balance);
    expect(state.missedPayments).toBe(0);
  });

  it('das Rating fällt mit der Verschuldung: 25 % Rahmen B, 60 % C, darüber D', () => {
    const leer = newGame('verschuldung', balance);
    expect(settleLoans(leihe(leer, 750), balance).rating).toBe('B');
    expect(settleLoans(leihe(leer, 750), balance).loans[0].principal).toBe(750);
    const viel = leihe(leihe(leer, 1800), 500);
    expect(settleLoans(viel, balance).rating).toBe('D');
    const mittel = leihe(leer, 1500);
    expect(settleLoans(mittel, balance).rating).toBe('C');
  });

  it('in Kapitel 1 gibt es kein Rating A, auch ohne Schulden', () => {
    expect(settleLoans(newGame('gut', balance), balance).rating).toBe('B');
  });

  it('ohne Kredite bleibt die Kasse unangetastet', () => {
    const state = newGame('ohne', balance);
    const nach = settleLoans(state, balance);
    expect(nach.cash).toBe(state.cash);
    expect(nach.loans).toEqual([]);
    expect(nach.log).toEqual(state.log);
  });

  it('verändert den Eingangszustand nicht', () => {
    const state = mitKredit(1000, 0.1, { ...newGame('rein', balance), cash: 0 });
    const kopie = structuredClone(state);
    settleLoans(state, balance);
    expect(state).toEqual(kopie);
  });

  it('die Zinsen kommen nach der Pacht: erst der Verzögerungszins, dann der Notkredit über den Rest', () => {
    const start = newGame('ordnung', balance);
    const pacht = buyLease(start, balance, start.parcels.find((p) => !p.discovery)!.id);
    if (!pacht.ok) throw new Error(pacht.reason);
    const geld: GameState = {
      ...pacht.state,
      cash: 30,
      rating: 'D',
      loans: [{ id: 1, source: 'bank', principal: 1000, rate: 0.07, takenRound: 1, collateral: null }],
    };
    // 25 $ Verzögerungszins werden zuerst gezahlt, von den 17,50 $ Zinsen fehlen danach 12,50 $.
    const nach = endRound(geld, balance);
    expect(nach.loans[1]).toMatchObject({ source: 'lender', principal: 12.5 });
    expect(nach.cash).toBe(0);
  });
});

describe('Pleite (checkBankruptcy)', () => {
  /** Kasse leer, Rahmen leer, aber noch keine Frist. */
  const inNot = (): GameState => ({ ...mitKredit(3000, 0.1, { ...newGame('not', balance), cash: -500 }), bankruptcyDeadline: 0 });

  it('mit Geld in der Kasse passiert gar nichts', () => {
    const state = newGame('geld', balance);
    expect(checkBankruptcy(state, balance)).toBe(state);
  });

  it('negative Kasse ohne Kreditrahmen startet eine Frist von graceRounds Runden', () => {
    const state = checkBankruptcy(inNot(), balance);
    expect(state.bankruptcyDeadline).toBe(state.round + balance.bankruptcy.graceRounds);
    expect(state.bankruptcyDeadline).toBe(3);
    expect(state.ending).toBeNull();
    expect(state.finished).toBe(false);
    expect(state.log.at(-1)).toMatch(/Kasse ist 500 \$ im Minus.*2 Runden Frist\./);
  });

  it('negative Kasse, aber die Bank hat noch Rahmen: am Rundenende leiht Jacob, keine Frist', () => {
    const state = mitKredit(1000, 0.1, { ...newGame('rahmen', balance), cash: -500 });
    const nach = endRound(state, balance);
    expect(nach.cash).toBeGreaterThanOrEqual(0);
    expect(nach.loans.some((l) => l.source === 'bank' && l.id === 2)).toBe(true);
    expect(nach.bankruptcyDeadline).toBe(0);
  });

  it('negative Kasse in der letzten Runde des Kapitels: sofort pleite', () => {
    const state = checkBankruptcy({ ...inNot(), round: balance.start.rounds }, balance);
    expect(state.ending).toBe('pleite');
    expect(state.finished).toBe(true);
  });

  it('eine laufende Frist fällt, sobald die Kasse wieder stimmt', () => {
    const laufend = { ...inNot(), bankruptcyDeadline: 4 };
    const gerettet = checkBankruptcy({ ...laufend, cash: 10 }, balance);
    expect(gerettet.bankruptcyDeadline).toBe(0);
    expect(gerettet.log.at(-1)).toMatch(/Kasse stimmt wieder/);
    expect(checkBankruptcy({ ...laufend, cash: 10 }, balance).bankruptcyDeadline).toBe(0);
  });

  it('ist die Frist noch nicht ab, geht es weiter', () => {
    const state = checkBankruptcy({ ...inNot(), round: 2, bankruptcyDeadline: 3 }, balance);
    expect(state.bankruptcyDeadline).toBe(3);
    expect(state.ending).toBeNull();
    expect(state.finished).toBe(false);
  });

  it('ist die Frist abgelaufen, ist Jacob pleite und das Spiel vorbei', () => {
    const state = checkBankruptcy({ ...inNot(), round: 3, bankruptcyDeadline: 3 }, balance);
    expect(state.ending).toBe('pleite');
    expect(state.finished).toBe(true);
    expect(state.bankruptcyDeadline).toBe(3);
    expect(state.log.at(-1)).toMatch(/Frist ist abgelaufen\. Jacob Harlan ist pleite/);
  });

  it('zahlt Jacob in der Frist die Schulden zurück, geht es ohne Folgen weiter', () => {
    const gerettet = repay({ ...inNot(), cash: 3000, round: 2, bankruptcyDeadline: 3 }, balance, 2500);
    if (!gerettet.ok) throw new Error(gerettet.reason);
    const nach = checkBankruptcy(gerettet.state, balance);
    expect(nach.ending).toBeNull();
    expect(nach.finished).toBe(false);
    expect(nach.bankruptcyDeadline).toBe(0);
  });

  it('ein beendetes Spiel wird nicht mehr geprüft', () => {
    const zuEnde = { ...inNot(), round: 3, finished: true };
    expect(checkBankruptcy(zuEnde, balance)).toBe(zuEnde);
  });
});

describe('Kredit und Pleite im Spielablauf', () => {
  it('die Zinsen werden am Rundenende gezahlt', () => {
    const state = mitKredit(1000, 0.07, { ...newGame('runde', balance), cash: 2000 });
    const nach = endRound(state, balance);
    expect(nach.cash).toBeCloseTo(1982.5, 10);
    expect(nach.round).toBe(2);
    expect(nach.log.some((l) => /Zinsen 17,5 \$ für 1 Kredit gezahlt\./.test(l))).toBe(true);
  });

  it('bei Pleite endet die Runde sofort: keine neue Runde, kein Ende des Kapitels', () => {
    const tot: GameState = {
      ...mitNotkredit(C.emergency.limit, { ...newGame('pleite', balance), cash: -500, rating: 'D' }),
      bankruptcyDeadline: 1,
    };
    const nach = endRound(tot, balance);
    expect(nach.ending).toBe('pleite');
    expect(nach.finished).toBe(true);
    expect(nach.round).toBe(1);
    expect(nach.log.some((l) => /Kapitel 1 ist zu Ende/.test(l))).toBe(false);
    expect(nach.log.some((l) => /Eine neue Runde beginnt/.test(l))).toBe(false);
    expect(endRound(nach, balance)).toBe(nach);
  });

  it('mit einem laufenden Notkredit kann das Kapitel auch zu Ende gehen', () => {
    const state: GameState = { ...newGame('kapitel', balance), round: balance.start.rounds, loans: [] };
    const nach = endRound(state, balance);
    expect(nach.ending).toBe('kapitel');
    expect(nach.finished).toBe(true);
  });
});
describe('Komplett tilgen (Regression: Schulden mit Cent-Beträgen ließen sich nicht ganz tilgen)', () => {
  const kredit = (id: number, source: Loan['source'], principal: number, rate: number): Loan => ({
    id,
    source,
    principal,
    rate,
    takenRound: 1,
    collateral: null,
  });

  it('tilgt einen Notkredit mit Cent-Betrag vollständig', () => {
    const state = { ...newGame('cent', balance), cash: 5000, loans: [kredit(1, 'lender', 123.45, 0.4)] };
    expect(repayMax(state)).toBe(123.45);
    const r = repay(state, balance, repayMax(state));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([]);
    expect(debt(r.state)).toBe(0);
    expect(r.state.cash).toBe(4876.55);
  });

  it('tilgt mehrere Kredite mit krummen Beträgen vollständig, ohne Rundungsreste', () => {
    const loans = [kredit(1, 'bank', 500, 0.07), kredit(2, 'lender', 0.1, 0.4), kredit(3, 'lender', 0.2, 0.4), kredit(4, 'bank', 1000, 0.1)];
    const state = { ...newGame('mehrere', balance), cash: 1500.3, loans };
    expect(repayMax(state)).toBe(1500.3);
    const r = repay(state, balance, repayMax(state));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([]);
    expect(r.state.cash).toBe(0);
  });

  it('reicht die Kasse genau (auch mit Cent), geht alles; ein Cent weniger lässt einen Cent stehen', () => {
    const state = { ...newGame('genau', balance), cash: 1012.5, loans: [kredit(1, 'lender', 12.5, 0.4), kredit(2, 'bank', 1000, 0.07)] };
    const alles = repay(state, balance, 1012.5);
    if (!alles.ok) throw new Error(alles.reason);
    expect(alles.state.loans).toEqual([]);
    expect(alles.state.cash).toBe(0);
    const knapp = repay({ ...state, cash: 1012.49 }, balance, 1012.49);
    if (!knapp.ok) throw new Error(knapp.reason);
    expect(debt(knapp.state)).toBe(0.01);
  });

  it('tilgt nach echten Rundenenden mit Notkredit und Zinsen vollständig', () => {
    // Bankrahmen voll, Kasse leer: der Geldverleiher springt mit Cent-Beträgen ein.
    let state = mitKredit(3000, 0.07, { ...newGame('echt', balance), cash: 0 });
    state = settleLoans(state, balance);
    state = settleLoans(state, balance);
    expect(state.loans.some((l) => l.source === 'lender')).toBe(true);
    state = { ...state, cash: 10000 };
    const r = repay(state, balance, repayMax(state));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([]);
    expect(debt(r.state)).toBe(0);
    expect(r.state.cash).toBe(Math.round((10000 - debt(state)) * 100) / 100);
  });

  it('ohne Geld in der Kasse gibt es nichts zu tilgen', () => {
    const state = { ...mitKredit(1000, 0.1), cash: -50 };
    expect(repayMax(state)).toBe(0);
    expect(repaySlider(state, balance)).toBeNull();
  });
});

describe('Schieberegler für Kredit und Tilgung', () => {
  it('Regler „Tilgen“ endet genau bei min(Kasse, Schulden) – auch mit Cent', () => {
    const state = { ...mitNotkredit(1234.56), cash: 5000 };
    const regler = repaySlider(state, balance)!;
    expect(regler).toEqual({ min: C.sliderStep, max: 1234.56, step: C.sliderStep });
    const letzte = sliderPositions(regler) - 1;
    expect(sliderAmount(regler, letzte)).toBe(1234.56);
    expect(sliderAmount(regler, letzte - 1)).toBe(1200);
    expect(sliderAmount(regler, 0)).toBe(C.sliderStep);
    const r = repay(state, balance, sliderAmount(regler, letzte));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.loans).toEqual([]);
  });

  it('Regler „Tilgen“ wird von der Kasse begrenzt', () => {
    const state = { ...mitKredit(3000, 0.1), cash: 720.5 };
    const regler = repaySlider(state, balance)!;
    expect(regler.max).toBe(720.5);
    expect(repay(state, balance, sliderAmount(regler, 99)).ok).toBe(true);
  });

  it('kleine Schulden: der Regler hat nur eine Stellung, nämlich alles', () => {
    const state = { ...mitNotkredit(42.1), cash: 100 };
    const regler = repaySlider(state, balance)!;
    expect(sliderPositions(regler)).toBe(1);
    expect(sliderAmount(regler, 0)).toBe(42.1);
  });

  it('Regler „Kredit aufnehmen“ geht vom kleinsten Kredit bis zum freien Rahmen, jede Stellung geht bei der Bank durch', () => {
    const state = newGame('regler', balance);
    const regler = loanSlider(state, balance)!;
    expect(regler).toEqual({ min: C.minLoan, max: headroom(state, balance), step: C.sliderStep });
    for (let p = 0; p < sliderPositions(regler); p++) {
      expect(takeLoan(state, balance, sliderAmount(regler, p)).ok).toBe(true);
    }
    expect(sliderAmount(regler, sliderPositions(regler) - 1)).toBe(headroom(state, balance));
  });

  it('Regler „Kredit aufnehmen“ fehlt bei vollem Rahmen und bei Rating D', () => {
    expect(loanSlider(mitKredit(3000, 0.07, newGame('voll', balance)) , balance)).toBeNull();
    expect(loanSlider({ ...newGame('d', balance), rating: 'D' }, balance)).toBeNull();
    // Rahmen kleiner als der kleinste Kredit: auch kein Regler.
    expect(loanSlider(mitKredit(3000 - C.minLoan + 1, 0.07, newGame('rest', balance)), balance)).toBeNull();
  });

  it('Zinsen je Quartal für alle Kredite zusammen', () => {
    const state = { ...mitKredit(1000, 0.1), loans: [...mitKredit(1000, 0.1).loans, { ...mitNotkredit(100).loans[0], id: 2 }] };
    expect(quarterInterestTotal(state)).toBe(25 + 10);
  });
});
