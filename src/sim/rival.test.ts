import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { stageCost, type Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { buyLease, leaseTerms, settleLeases, type Lease } from './lease';
import { advanceMarket } from './market';
import { advanceRival, newRival, rivalCandidates, rivalChance, rivalUtility } from './rival';
import { Rng } from './rng';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const bullard = balance.rivals.bullard;

/** Balance mit geänderten Bullard-Zahlen (nur für Tests, ohne Prüfung). */
function mitBullard(change: Partial<typeof bullard>): Balance {
  return { ...balance, rivals: { bullard: { ...bullard, ...change } } };
}

/** Bullard pachtet nie von selbst – für Tests, die nur Bohren oder Abrechnung prüfen. */
const passiv = mitBullard({ minUtility: Infinity });

function parcel(state: GameState, id: string) {
  return state.parcels.find((p) => p.id === id)!;
}

function nachbarn(state: GameState, id: string) {
  const p = parcel(state, id);
  return state.parcels.filter((q) => q.id !== id && Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1);
}

function pacht(state: GameState, parcelId: string, holder: 'jacob' | 'bullard', drilled = false): Lease {
  return { parcelId, holder, bonus: 0, royalty: 0.125, startRound: state.round, expiresAfterRound: state.round + 3, drilled };
}

function fündigeQuelle(parcelId: string): Well {
  return { parcelId, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1 } as Well;
}

/** Eine Randparzelle ohne Option, Pacht oder Nachbarschaft zu Jacobs Startoptionen. */
function freieRandparzelle(state: GameState) {
  const jacob = new Set(state.options.map((o) => o.parcelId));
  return state.parcels.find(
    (p) => p.zone === 'rand' && !jacob.has(p.id) && !nachbarn(state, p.id).some((n) => jacob.has(n.id) || n.discovery),
  )!;
}

describe('Rivale Bullard (1.12)', () => {
  it('startet mit seinem Geld aus balance.yaml und eigenem Zufallsstrom', () => {
    const state = newGame('start', balance);
    expect(state.rival).toEqual(newRival('start', balance));
    expect(state.rival.cash).toBe(bullard.startCash);
    expect(state.rival.wells).toEqual([]);
    expect(state.rival.rng).not.toEqual(state.rng);
  });

  describe('Bullards Fundchance', () => {
    it('Randparzelle: 1 − rand.dry (Zonenwissen, nicht die Wahrheit)', () => {
      const state = newGame('chance', balance);
      const p = freieRandparzelle(state);
      const rand = balance.geology.zones.find((z) => z.name === 'rand')!;
      expect(rivalChance(state, balance, p)).toBeCloseTo(1 - rand.dry, 10);
    });

    it('neben einer fündigen Quelle von Jacob kommt nearFindChance dazu', () => {
      const state0 = newGame('chance', balance);
      const p = freieRandparzelle(state0);
      const n = nachbarn(state0, p.id)[0];
      const state = { ...state0, wells: [fündigeQuelle(n.id)] };
      expect(rivalChance(state, balance, p)).toBeCloseTo(rivalChance(state0, balance, p) + bullard.nearFindChance, 10);
    });
  });

  describe('Nutzen', () => {
    it('folgt der Formel (roll 0.5 = ohne Streuung)', () => {
      const state = newGame('nutzen', balance);
      const p = freieRandparzelle(state);
      const { risk } = bullard.personality;
      const erwartet =
        rivalChance(state, balance, p) * bullard.valuePerFind * (1 + (risk - 3) * bullard.riskWeight) -
        leaseTerms(state, balance, p.id).bonus -
        stageCost(balance, 1);
      expect(rivalUtility(state, balance, p, 0.5)).toBeCloseTo(erwartet, 6);
      // Streuung: roll 1 statt 0.5 bringt 0.5 · noise · risk/5.
      expect(rivalUtility(state, balance, p, 1) - rivalUtility(state, balance, p, 0.5)).toBeCloseTo(
        0.5 * bullard.noise * (risk / 5),
        6,
      );
    });

    it('neben Jacobs Pacht: + aggression · nearJacobBonus', () => {
      const state0 = newGame('nutzen', balance);
      const p = freieRandparzelle(state0);
      const n = nachbarn(state0, p.id)[0];
      const state = { ...state0, leases: [pacht(state0, n.id, 'jacob')] };
      expect(rivalUtility(state, balance, p, 0.5) - rivalUtility(state0, balance, p, 0.5)).toBeCloseTo(
        bullard.personality.aggression * bullard.nearJacobBonus,
        6,
      );
    });
  });

  it('Kandidaten: weder Salt Hill noch Pachten noch Optionen (auch Jacobs), sortiert nach id', () => {
    const state0 = newGame('kandidaten', balance);
    const p = freieRandparzelle(state0);
    const state = { ...state0, leases: [pacht(state0, p.id, 'bullard')] };
    const ids = rivalCandidates(state, balance).map((c) => c.id);
    expect(ids).not.toContain(p.id);
    expect(state.options.length).toBeGreaterThan(0);
    for (const o of state.options) expect(ids).not.toContain(o.parcelId);
    for (const d of state.parcels.filter((q) => q.discovery)) expect(ids).not.toContain(d.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids.length).toBe(state.parcels.length - 1 - state.options.length - 1);
  });

  describe('Pachten', () => {
    it('höchstens actionsPerRound je Runde und nur, wenn das Geld für den Bonus reicht', () => {
      const reich = newGame('pachten', balance);
      const s = advanceRival({ ...reich, rival: { ...reich.rival, cash: 1_000_000 } }, balance);
      expect(s.leases.filter((l) => l.holder === 'bullard')).toHaveLength(bullard.actionsPerRound);

      const arm = advanceRival({ ...reich, rival: { ...reich.rival, cash: 0 } }, balance);
      expect(arm.leases.filter((l) => l.holder === 'bullard')).toHaveLength(0);
      expect(arm.rival.cash).toBe(0);
    });

    it('nie unter minUtility', () => {
      const state = newGame('pachten', balance);
      const s = advanceRival({ ...state, rival: { ...state.rival, cash: 1_000_000 } }, mitBullard({ minUtility: 1e9 }));
      expect(s.leases.filter((l) => l.holder === 'bullard')).toHaveLength(0);
    });

    it('nimmt die Parzelle mit dem höchsten Nutzen und zahlt Bonus plus Bohrung', () => {
      const state0 = newGame('pachten', balance);
      const state = { ...state0, rival: { ...state0.rival, cash: 1_000_000 } };
      const s = advanceRival(state, balance);
      const lease = s.leases.find((l) => l.holder === 'bullard')!;
      // Nachrechnen mit demselben Zufallsstrom.
      const rng = new Rng(state.rival.rng);
      const nutzen = rivalCandidates(state, balance).map((p) => ({ id: p.id, u: rivalUtility(state, balance, p, rng.float()) }));
      const bester = nutzen.reduce((a, b) => (b.u > a.u ? b : a));
      expect(lease.parcelId).toBe(bester.id);
      expect(s.rival.cash).toBe(1_000_000 - lease.bonus - stageCost(balance, 1));
    });

    it('Bullards ungebohrte Pacht kostet keinen Verzögerungszins', () => {
      const state0 = newGame('zins', balance);
      const p = freieRandparzelle(state0);
      const state = { ...state0, leases: [pacht(state0, p.id, 'bullard')] };
      const s = settleLeases(state, balance);
      expect(s.cash).toBe(state.cash);
      expect(s.leases).toHaveLength(1);
    });

    it('Jacob kann eine Bullard-Parzelle nicht pachten', () => {
      const state0 = newGame('konflikt', balance);
      const p = freieRandparzelle(state0);
      const state = { ...state0, leases: [pacht(state0, p.id, 'bullard')] };
      expect(buyLease(state, balance, p.id)).toEqual({ ok: false, reason: 'Diese Parzelle ist schon verpachtet.' });
    });
  });

  describe('Bohren', () => {
    const state0 = newGame('bohren', balance);
    const trocken = state0.parcels.find((p) => p.geology === 'dry' && !p.discovery)!;
    const öl = state0.parcels.find((p) => p.geology !== 'dry' && !p.discovery)!;
    const mitPachten = { ...state0, options: [], leases: [pacht(state0, trocken.id, 'bullard'), pacht(state0, öl.id, 'bullard')] };

    it('bohrt sofort (Geduld 1) und zahlt die Bohrung', () => {
      const s = advanceRival(mitPachten, passiv);
      expect(s.leases.every((l) => l.drilled)).toBe(true);
      expect(s.rival.wells.map((w) => w.status)).toEqual(['drilling', 'drilling']);
      expect(s.rival.cash).toBe(bullard.startCash - 2 * stageCost(balance, 1));
    });

    it('ohne Geld wird nicht gebohrt', () => {
      const s = advanceRival({ ...mitPachten, rival: { ...mitPachten.rival, cash: 0 } }, passiv);
      expect(s.rival.wells).toEqual([]);
      expect(s.leases.some((l) => l.drilled)).toBe(false);
    });

    it('nach drillRounds: Ergebnis = Geologie; fündige Quellen bringen incomePerWell', () => {
      let s = advanceRival(mitPachten, passiv);
      const kasse = s.rival.cash;
      for (let i = 0; i < bullard.drillRounds; i++) s = advanceRival(s, passiv);
      const status = Object.fromEntries(s.rival.wells.map((w) => [w.parcelId, w.status]));
      expect(status).toEqual({ [trocken.id]: 'dry', [öl.id]: 'found' });
      expect(s.rival.cash).toBe(kasse + bullard.incomePerWell);
      expect(s.log.some((l) => l.includes('Bullard stößt auf Parzelle') && l.includes('auf Öl'))).toBe(true);
    });
  });

  describe('Determinismus', () => {
    it('gleicher Seed → gleicher Rivalenzustand nach 5 Runden', () => {
      let a = newGame('gleich', balance);
      let b = newGame('gleich', balance);
      for (let i = 0; i < 5; i++) {
        a = endRound(a, balance);
        b = endRound(b, balance);
      }
      expect(a.rival).toEqual(b.rival);
      expect(a.leases).toEqual(b.leases);
    });

    it('Bullard rührt Jacobs Zufallsstrom nicht an', () => {
      const state = newGame('strom', balance);
      expect(advanceRival(state, balance).rng).toEqual(state.rng);
    });
  });

  it('Markt: eine fündige Bullard-Quelle senkt den Preis', () => {
    const state = newGame('markt', balance);
    const ohne = advanceMarket(state, balance.market, bullard.ratePerWell);
    const mitQuelle = { ...state, rival: { ...state.rival, wells: [{ parcelId: 'x', startRound: 1, roundsLeft: 0, status: 'found' as const }] } };
    const mit = advanceMarket(mitQuelle, balance.market, bullard.ratePerWell);
    expect(mit.postedPrice).toBeLessThan(ohne.postedPrice);
  });

  describe('Fertig-Kriterium: Bullard schnappt dir eine gute Parzelle weg', () => {
    it('Szenario: Jacobs Option verfällt, Bullard pachtet die beste Parzelle', () => {
      const state0 = newGame('bullard', balance);
      const reich = { ...state0, options: [], rival: { ...state0.rival, cash: 1_000_000 } };
      // Die beste nicht-trockene Parzelle aus Bullards Sicht.
      const ziel = rivalCandidates(reich, balance)
        .filter((p) => p.geology !== 'dry')
        .reduce((a, b) => (rivalUtility(reich, balance, b, 0.5) > rivalUtility(reich, balance, a, 0.5) ? b : a));
      const option = { parcelId: ziel.id, holder: 'jacob' as const, bonus: 0, royalty: 0.125, fee: 0, free: true, expiresAfterRound: reich.round };
      // Streuung aus, damit die beste Parzelle sicher gewinnt.
      const ohneStreuung = mitBullard({ noise: 0 });
      const s = endRound({ ...reich, options: [option] }, ohneStreuung);

      expect(s.options.some((o) => o.parcelId === ziel.id)).toBe(false);
      expect(s.leases.find((l) => l.parcelId === ziel.id)?.holder).toBe('bullard');
      expect(s.log.some((l) => l.includes(`schnappt dir Parzelle ${ziel.x + 1}/${ziel.y + 1} weg`))).toBe(true);
      expect(buyLease(s, ohneStreuung, ziel.id)).toEqual({ ok: false, reason: 'Diese Parzelle ist schon verpachtet.' });
    });

    it('ohne Eingriff: Jacob spielt 16 Runden passiv, Bullard hält eine gute Parzelle', () => {
      let s = newGame('rivale', balance);
      while (!s.finished) s = endRound(s, balance);
      const gute = s.leases.filter((l) => l.holder === 'bullard' && parcel(s, l.parcelId).geology !== 'dry');
      expect(gute.length).toBeGreaterThanOrEqual(1);
      expect(s.rival.wells.some((w) => w.status === 'found')).toBe(true);
    });
  });
});
