import { describe, expect, it } from 'vitest';
import { checkBankruptcy } from './credit';
import type { Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { leaseOf } from './lease';
import { deserializeGame, serializeGame } from './save';
import { secondChanceBlocker, secondChanceCash, secondChanceEnd, startSecondChance } from './secondChance';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { k3Game } from './testKapitel3';

const balance = loadBalance();
const catalog = loadEvents();

function quelle(parcelId: string, rate: number): Well {
  return { id: `${parcelId}#1`, parcelId, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, result: 'small', production: { initialRate: rate, roundsProduced: 3, lastRate: rate, total: rate * 3 }, startRound: 1, pump: true };
}

/** Pleite in Runde round: eine fördernde und eine ungebohrte Pacht, Schulden, ein eigener Turm, Merkzeichen. */
function pleite(round = 6, seed = 'anlauf'): GameState {
  const g = newGame(seed, balance);
  const [a, b] = g.parcels.filter((p) => !p.discovery && !p.sure && !g.options.some((o) => o.parcelId === p.id));
  const s: GameState = {
    ...g,
    round,
    cash: -4000,
    loans: [{ id: 1, source: 'bank', principal: 9000, rate: 0.1, takenRound: 1, collateral: null }],
    leases: [
      ...g.leases,
      { parcelId: a.id, holder: 'jacob', bonus: 800, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: true },
      { parcelId: b.id, holder: 'jacob', bonus: 600, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: false },
    ],
    wells: [quelle(a.id, 2500)],
    rigs: [...g.rigs, { id: 'eigen-1', kind: 'owned', readyRound: 1, steam: true, rods: false }],
    oilStock: 3000,
    bankruptcyDeadline: round,
    insolvency: { since: round - 2, ratingBefore: 'C' },
    events: { ...g.events, marks: { ...g.events.marks, bullard_verraten: 2 } },
  };
  const ende = checkBankruptcy(s, balance);
  expect(ende.ending).toBe('pleite');
  return ende;
}

describe('Zweiter Anlauf', () => {
  it('nur nach der Pleite und nur einmal je Spiel', () => {
    expect(secondChanceBlocker(newGame('x', balance))).toMatch(/nur nach der Pleite/);
    const s = pleite();
    expect(secondChanceBlocker(s)).toBeNull();
    const r = startSecondChance(s, balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    const wieder = checkBankruptcy({ ...r.state, cash: -10, bankruptcyDeadline: r.state.round }, balance);
    expect(wieder.ending).toBe('pleite');
    expect(secondChanceBlocker(wieder)).toMatch(/schon gehabt/);
    expect(startSecondChance(wieder, balance).ok).toBe(false);
  });

  it('neu als Wildcatter: wenig Geld, keine Schulden, Quellen, Pachten, eigene Türme – nächste Runde', () => {
    const s = pleite();
    const r = startSecondChance(s, balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    const n = r.state;
    expect(n.finished).toBe(false);
    expect(n.ending).toBeNull();
    expect(n.cash).toBe(balance.secondChance.cash[0]);
    expect(secondChanceCash(s, balance)).toBe(balance.secondChance.cash[0]);
    expect(n.loans).toEqual([]);
    expect(n.wells).toEqual([]);
    expect(n.leases.filter((l) => l.holder === 'jacob')).toEqual([]);
    expect(n.options.filter((o) => o.holder === 'jacob')).toEqual([]);
    expect(n.rigs.every((rig) => rig.kind !== 'owned')).toBe(true);
    expect(n.rigs.length).toBeGreaterThan(0);
    expect(n.oilStock).toBe(0);
    expect(n.bankruptcyDeadline).toBe(0);
    expect('insolvency' in n).toBe(false);
    expect(n.rating).toBe(balance.credit.startRating);
    expect(n.round).toBe(s.round + 1);
    expect(n.secondChance).toEqual({ round: s.round + 1 });
  });

  it('Bullard ersteigert die fördernde Pacht, ungebohrtes Land fällt zurück; Welt, Ruf, Feinde, Familie bleiben', () => {
    const s = pleite();
    const r = startSecondChance(s, balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    const [a, b] = s.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId);
    expect(leaseOf(r.state, a)!.holder).toBe('bullard');
    expect(r.state.rival.wells.find((w) => w.parcelId === a)).toMatchObject({ status: 'found', rate: 2500 });
    expect(leaseOf(r.state, b)).toBeUndefined();
    expect(r.state.seed).toBe(s.seed);
    expect(r.state.worldModel).toEqual(s.worldModel);
    expect(r.state.events.marks.bullard_verraten).toBe(2);
    expect(r.state.family.ruth).toBe(s.family.ruth);
    expect(r.state.wildcatterStanding).toBe(s.wildcatterStanding);
  });

  it('Rundenzahl läuft weiter; zu wenig Runden übrig – das Kapitel läuft bis minRounds Runden weiter', () => {
    const frueh = pleite(4);
    expect(secondChanceEnd(frueh, balance)).toBe(frueh.totalRounds);
    const spaet = pleite(frueh.totalRounds);
    const r = startSecondChance(spaet, balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.totalRounds).toBe(spaet.totalRounds + balance.secondChance.minRounds);
    expect(r.state.totalRounds - r.state.round + 1).toBe(balance.secondChance.minRounds);
    // Das Spiel läuft danach normal weiter.
    const weiter = endRound(r.state, balance, catalog);
    expect(weiter.round).toBe(r.state.round + 1);
  });

  it('der Merker übersteht Speichern und Laden', () => {
    const r = startSecondChance(pleite(), balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    const geladen = deserializeGame(serializeGame(r.state, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.secondChance).toEqual(r.state.secondChance);
  });

  it('Kapitel 3: Startgeld des Kapitels, Raffinerie und Tankstellen sind weg, das Aktienbuch bleibt', () => {
    const k3 = k3Game('anlauf-k3', balance);
    const s = checkBankruptcy({ ...k3, cash: -1000, bankruptcyDeadline: k3.round }, balance);
    expect(s.ending).toBe('pleite');
    const r = startSecondChance(s, balance, catalog);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(balance.secondChance.cash[2]);
    if (k3.refinery) expect(r.state.refinery!.level).toBe(0);
    if (k3.brand) expect(Object.values(r.state.brand!.regions).every((x) => x.stations === 0)).toBe(true);
    expect(r.state.stocks).toEqual(s.stocks);
  });
});
