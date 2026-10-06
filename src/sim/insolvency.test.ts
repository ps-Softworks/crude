import { describe, expect, it } from 'vitest';
import { checkBankruptcy, settleLoans, type Loan } from './credit';
import type { Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import {
  acceptValeRescue,
  emergencySales,
  insolvencyBotTurn,
  restructureBlocker,
  restructureDebt,
  restructureQuote,
  VALE_RESCUE_MARK,
  valeRescueBlocker,
  valeRescueQuote,
} from './insolvency';
import { loadEvents } from './testEvents';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const R = balance.insolvency;

function bank(id: number, principal: number, rate = 0.08): Loan {
  return { id, source: 'bank', principal, rate, takenRound: 1, collateral: null };
}

/** Jacob mit Schulden, Kasse im Minus, Frist läuft (wie nach checkBankruptcy). */
function inFrist(rating: 'B' | 'C' | 'D' = 'B', seed = 'frist'): GameState {
  const g = newGame(seed, balance);
  const vorher: GameState = { ...g, cash: -3000, loans: [bank(1, 5000), { ...bank(2, 1000, balance.credit.emergency.rate), source: 'lender' }], bankruptcyDeadline: 0 };
  return checkBankruptcy(vorher, balance, rating);
}

function quelle(parcelId: string, rate: number): Well {
  return { id: `${parcelId}#1`, parcelId, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, result: 'small', production: { initialRate: rate, roundsProduced: 1, lastRate: rate, total: rate }, startRound: 1 };
}

describe('Pleitefrist: Beginn und Ende', () => {
  it('die Frist merkt sich Beginn und Rating vor der Krise; stimmt die Kasse wieder, fällt beides weg', () => {
    const s = inFrist('C');
    expect(s.bankruptcyDeadline).toBe(s.round + balance.bankruptcy.graceRounds);
    expect(s.insolvency).toEqual({ since: s.round, ratingBefore: 'C' });
    const gut = checkBankruptcy({ ...s, cash: 10 }, balance);
    expect(gut.bankruptcyDeadline).toBe(0);
    expect('insolvency' in gut).toBe(false);
  });

  it('läuft die Frist ohne Lösung ab, ist Jacob pleite wie bisher', () => {
    const s = inFrist();
    const ende = checkBankruptcy({ ...s, round: s.bankruptcyDeadline }, balance);
    expect(ende.ending).toBe('pleite');
  });

  it('der Vermerk übersteht Speichern und Laden', () => {
    const s = inFrist('C');
    const geladen = deserializeGame(serializeGame(s, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.insolvency).toEqual(s.insolvency);
  });
});

describe('Ausweg (a): Notverkauf', () => {
  it('listet verkäufliche Pachten mit Notgebot und eigene Türme; Verkauf füllt die Kasse', () => {
    const s0 = inFrist();
    const parcel = s0.parcels.find((p) => !p.discovery && !p.sure)!;
    const s: GameState = {
      ...s0,
      leases: [...s0.leases, { parcelId: parcel.id, holder: 'jacob', bonus: 800, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: true }],
      wells: [quelle(parcel.id, 3000)],
      rigs: [...s0.rigs, { id: 'eigen-1', kind: 'owned', readyRound: 1, steam: false, rods: false }],
      rival: { ...s0.rival, cash: 100 },
    };
    const v = emergencySales(s, balance);
    expect(v.leases).toHaveLength(1);
    expect(v.leases[0].emergency).toBe(true);
    expect(v.rigs.map((r) => r.rigId)).toEqual(['eigen-1']);
    expect(v.total).toBe(v.leases[0].offer + v.rigs[0].price);
    // Bot-Regel: verkauft, bis die Kasse stimmt.
    const bot = insolvencyBotTurn(s, balance);
    expect(bot.cash).toBeGreaterThan(s.cash);
    expect(bot.leases.find((l) => l.parcelId === parcel.id)!.holder).toBe('bullard');
  });
});

describe('Ausweg (b): Umschuldung', () => {
  it('mit Rating C vor der Krise: Bank- und Notkredite und das Loch werden ein Bankkredit, Kasse auf null', () => {
    const s = inFrist('C');
    expect(restructureBlocker(s, balance)).toBeNull();
    const q = restructureQuote(s, balance);
    const schuld = 5000 + 1000 + 3000;
    expect(q.fee).toBe(Math.round(R.restructure.lawyerFee + R.restructure.lawyerShare * schuld));
    expect(q.principal).toBe(schuld + q.fee);
    expect(q.rate).toBeLessThan(balance.credit.emergency.rate);
    expect(q.deferUntil).toBe(s.round + R.restructure.deferRounds);
    const r = restructureDebt(s, balance);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(0);
    expect(r.state.loans).toHaveLength(1);
    expect(r.state.loans[0]).toMatchObject({ source: 'bank', principal: q.principal, rate: q.rate, deferUntil: q.deferUntil });
    expect(r.state.insolvency?.restructured).toBe(true);
    expect(restructureBlocker(r.state, balance)).toMatch(/schon umgeschuldet/);
    // Am Rundenende stimmt die Kasse: die Frist fällt.
    expect(checkBankruptcy(r.state, balance).bankruptcyDeadline).toBe(0);
  });

  it('mit eigenem Anwalt halbes Honorar', () => {
    const s = { ...inFrist('C'), investigation: { lawyer: 1 } } as unknown as GameState;
    const ohne = restructureQuote(inFrist('C'), balance).fee;
    expect(restructureQuote(s, balance).fee).toBe(Math.round(ohne * R.restructure.ownLawyer));
  });

  it('gesperrt mit Rating D vor der Krise und ohne Frist', () => {
    expect(restructureBlocker(inFrist('D'), balance)).toMatch(/Rating D/);
    expect(restructureBlocker(newGame('ohne', balance), balance)).toMatch(/Pleite droht/);
    expect(restructureDebt(inFrist('D'), balance).ok).toBe(false);
  });

  it('gestreckte Zinsen kommen bis deferUntil auf die Schuld, danach aus der Kasse', () => {
    const r = restructureDebt(inFrist('C'), balance);
    if (!r.ok) throw new Error(r.reason);
    const loan = r.state.loans[0];
    const nach = settleLoans(r.state, balance);
    expect(nach.cash).toBe(0);
    expect(nach.loans[0].principal).toBeCloseTo(loan.principal + (loan.principal * loan.rate) / 4, 1);
    const spaeter = settleLoans({ ...r.state, cash: 10000, round: loan.deferUntil! + 1 }, balance);
    expect(spaeter.loans[0].principal).toBe(loan.principal);
    expect(spaeter.cash).toBeCloseTo(10000 - (loan.principal * loan.rate) / 4, 1);
  });
});

describe('Ausweg (c): Rettung durch Mr. Vale', () => {
  it('deckt Loch und Polster, Schuld repay × Summe, Merkzeichen; nur einmal je Spiel', () => {
    const s = inFrist();
    expect(valeRescueBlocker(s)).toBeNull();
    const q = valeRescueQuote(s, balance);
    expect(q.cash).toBe(3000 + Math.max(R.rescue.cushion, 3000 * R.rescue.cushionShare));
    expect(q.owed).toBe(Math.round(q.cash * R.rescue.repay));
    const r = acceptValeRescue(s, balance);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(s.cash + q.cash);
    expect(r.state.loans.at(-1)).toMatchObject({ source: 'vale', principal: q.owed, rate: R.rescue.rate });
    expect(r.state.events.marks[VALE_RESCUE_MARK]).toBe(s.round);
    // Nächste Krise: Vale kommt nicht wieder.
    const wieder = { ...r.state, cash: -100, bankruptcyDeadline: r.state.round + 2 };
    expect(valeRescueBlocker(wieder)).toMatch(/schon einmal/);
  });

  it('nicht ohne Frist und nicht in Kapitel 3 (dort rettet das Konsortium)', () => {
    expect(valeRescueBlocker(newGame('ruhe', balance))).toMatch(/Pleite droht/);
    expect(valeRescueBlocker({ ...inFrist(), kapitel3: {} } as unknown as GameState)).toMatch(/Konsortium/);
  });

  it('einige Runden später fordert Vale seinen Gefallen (Ereignis vale_rettung_gefallen)', () => {
    const catalog = loadEvents();
    const r = acceptValeRescue(inFrist(), balance);
    if (!r.ok) throw new Error(r.reason);
    const def = catalog.find((e) => e.id === 'vale_rettung_gefallen')!;
    expect(def.marked).toEqual([VALE_RESCUE_MARK]);
    let s: GameState = { ...r.state, bankruptcyDeadline: 0, cash: 50000 };
    let gesehen = false;
    for (let i = 0; i < def.delay + 2 && !s.finished; i++) {
      s = endRound(s, balance, catalog);
      if (s.events.pending.includes('vale_rettung_gefallen')) gesehen = true;
    }
    expect(gesehen).toBe(true);
  });
});
