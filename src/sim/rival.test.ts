import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { stageCost, type Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { buyLease, leaseTerms, settleLeases, type Lease } from './lease';
import { advanceMarket } from './market';
import { advanceRival, betrayalParcel, bullardStance, newRival, rivalCandidates, rivalChance, rivalNetPerBarrel, rivalUtility, rivalWellIncome, type RivalWell } from './rival';
import { Rng } from './rng';
import { loadBalance } from './testBalance';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const bullard = balance.rivals.bullard;

/** Balance mit geänderten Bullard-Zahlen (nur für Tests, ohne Prüfung). */
function mitBullard(change: Partial<typeof bullard>): Balance {
  return { ...balance, rivals: { ...balance.rivals, bullard: { ...bullard, ...change } } };
}

/** Bullard pachtet nie von selbst – für Tests, die nur Bohren oder Abrechnung prüfen. */
const passiv = mitBullard({ minUtility: Infinity });

function parcel(state: GameState, id: string) {
  return state.parcels.find((p) => p.id === id)!;
}

function nachbarn(state: GameState, id: string) {
  const p = parcel(state, id);
  return state.parcels.filter((q) => p.neighbors.includes(q.id));
}

function pacht(state: GameState, parcelId: string, holder: 'jacob' | 'bullard', drilled = false): Lease {
  return { parcelId, holder, bonus: 0, royalty: 0.125, startRound: state.round, expiresAfterRound: state.round + 3, drilled };
}

function fündigeQuelle(parcelId: string): Well {
  return { id: `${parcelId}#1`, parcelId, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1 } as Well;
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
    it('Randparzelle: Zonenwissen plus ein Teil der Wahrheit (insight), nicht die Wahrheit selbst', () => {
      const state = newGame('chance', balance);
      const p = freieRandparzelle(state);
      const rand = balance.geology.zones.find((z) => z.name === 'rand')!;
      expect(rivalChance(state, balance, p)).toBeCloseTo(rand.prior + bullard.insight * (p.chance! - rand.prior), 10);
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

    it('Fundwert passt zur Größenordnung der Funde (1.16): Land am Fund kann sich lohnen', () => {
      // Sonst wäre jede Parzelle am Fund für Bullard ein sicheres Minusgeschäft,
      // selbst wenn er sicher wäre, Öl zu finden.
      const teuersterBonus = Math.max(...balance.lease.locations.map((l) => l.bonus));
      expect(bullard.valuePerFind).toBeGreaterThan(teuersterBonus + stageCost(balance, 1));
      // Und nicht mehr wert als ein mittlerer kleiner Fund zum Höchstpreis.
      const { min, max } = balance.geology.reserves.small;
      expect(bullard.valuePerFind).toBeLessThanOrEqual(((min + max) / 2) * balance.market.priceMax);
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
      expect(buyLease(state, balance, p.id)).toEqual({ ok: false, reason: 'Diese Ranch ist schon verpachtet.' });
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

    it('nach drillRounds: Ergebnis = Geologie; ein Fund startet mit ratePerWell und bringt erst ab der nächsten Runde Geld', () => {
      let s = advanceRival(mitPachten, passiv);
      const kasse = s.rival.cash;
      for (let i = 0; i < bullard.drillRounds; i++) s = advanceRival(s, passiv);
      const status = Object.fromEntries(s.rival.wells.map((w) => [w.parcelId, w.status]));
      expect(status).toEqual({ [trocken.id]: 'dry', [öl.id]: 'found' });
      expect(s.rival.cash).toBe(kasse);
      const fund = s.rival.wells.find((w) => w.status === 'found')!;
      expect(fund.rate).toBe(bullard.ratePerWell);
      expect(fund.royalty).toBe(0.125);
      expect(s.log.some((l) => l.includes('Bullard stößt auf ') && l.includes('auf Öl'))).toBe(true);
    });
  });

  describe('Einnahmen (Nachbesserung 0.1.14+3): an Ölpreis und Förderung gekoppelt', () => {
    const quelle = (rate: number, royalty = 0.125): RivalWell => ({ parcelId: 'q', startRound: 1, roundsLeft: 0, status: 'found', rate, royalty });
    const state0 = newGame('einnahmen', balance);
    const mitQuelle = (well: RivalWell, cash = 0): GameState => ({ ...state0, options: [], rival: { ...state0.rival, cash, wells: [well] } });

    it('Erlös je Barrel = Preis · (1 − Förderzins) − Transport, nie unter null', () => {
      expect(rivalNetPerBarrel(1.0, 0.125, 0.4)).toBeCloseTo(0.475, 10);
      expect(rivalNetPerBarrel(0.4, 0.125, 0.4)).toBe(0);
    });

    it('Einnahmen = Förderung · Erlös je Barrel, zum Verkaufspreis der Runde', () => {
      const s = advanceRival(mitQuelle(quelle(4000)), passiv, undefined, 1.0);
      expect(s.rival.cash).toBeCloseTo(4000 * (1.0 * (1 - 0.125) - bullard.transportPerBarrel), 2);
      expect(rivalWellIncome(quelle(4000), balance, 1.0)).toBe(s.rival.cash);
    });

    it('hoher Preis bringt mehr, niedriger weniger; unter den Kosten nichts', () => {
      const hoch = advanceRival(mitQuelle(quelle(4000)), passiv, undefined, 1.4).rival.cash;
      const tief = advanceRival(mitQuelle(quelle(4000)), passiv, undefined, 0.7).rival.cash;
      const unter = advanceRival(mitQuelle(quelle(4000)), passiv, undefined, 0.3).rival.cash;
      expect(hoch).toBeGreaterThan(tief);
      expect(tief).toBeGreaterThan(0);
      expect(unter).toBe(0);
    });

    it('höherer Förderzins senkt die Einnahmen', () => {
      expect(rivalWellIncome(quelle(4000, 0.25), balance, 1.0)).toBeLessThan(rivalWellIncome(quelle(4000, 0.1), balance, 1.0));
    });

    it('die Förderung fällt je Runde um production.decline – auch fürs Marktangebot', () => {
      let s = mitQuelle(quelle(bullard.ratePerWell));
      const kassen: number[] = [];
      for (let i = 0; i < 3; i++) {
        const vorher = s.rival.cash;
        s = advanceRival(s, passiv, undefined, 1.0);
        kassen.push(s.rival.cash - vorher);
      }
      expect(s.rival.wells[0].rate).toBeCloseTo(bullard.ratePerWell * (1 - balance.production.decline) ** 3, 6);
      expect(kassen[1]).toBeCloseTo(kassen[0] * (1 - balance.production.decline), 0);
      // Weniger Förderung → weniger Druck auf den Preis.
      const frisch = advanceMarket(mitQuelle(quelle(bullard.ratePerWell)), balance.market, bullard.ratePerWell);
      const alt = advanceMarket(s, balance.market, bullard.ratePerWell);
      expect(alt.postedPrice).toBeGreaterThanOrEqual(frisch.postedPrice);
    });

    it('im Spiel verkauft Bullard zum Preis vor dem Marktschritt (wie Jacob)', () => {
      const state = { ...mitQuelle(quelle(4000)), postedPrice: 1.2 };
      const s = endRound(state, passiv);
      expect(s.rival.cash).toBeCloseTo(rivalWellIncome(quelle(4000), balance, 1.2), 2);
    });

    it('Größenordnung: Bullards Kasse am Kapitelende bleibt begrenzt (passiver Jacob, 20 Seeds)', () => {
      let summe = 0;
      for (let i = 0; i < 20; i++) {
        let s = newGame(`kasse-${i}`, balance);
        while (!s.finished) s = endRound(s, balance);
        summe += s.rival.cash;
      }
      const schnitt = summe / 20;
      // 0.2.15+5: Auf der Ranch-Karte sucht Bullard kleine Farmen – etwas weniger Kasse als auf dem Raster.
      expect(schnitt).toBeGreaterThan(5_000);
      expect(schnitt).toBeLessThan(80_000);
    }, 30_000);
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
      // Die beste Ranch aus Bullards Sicht (er kennt die Geologie nicht).
      const ziel = rivalCandidates(reich, balance)
        .reduce((a, b) => (rivalUtility(reich, balance, b, 0.5) > rivalUtility(reich, balance, a, 0.5) ? b : a));
      const option = { parcelId: ziel.id, holder: 'jacob' as const, bonus: 0, royalty: 0.125, fee: 0, free: true, expiresAfterRound: reich.round };
      // Streuung aus, damit die beste Parzelle sicher gewinnt.
      const ohneStreuung = mitBullard({ noise: 0 });
      const s = endRound({ ...reich, options: [option] }, ohneStreuung);

      expect(s.options.some((o) => o.parcelId === ziel.id)).toBe(false);
      expect(s.leases.find((l) => l.parcelId === ziel.id)?.holder).toBe('bullard');
      expect(s.log.some((l) => l.includes(`schnappt dir ${ziel.name} weg`))).toBe(true);
      expect(buyLease(s, ohneStreuung, ziel.id)).toEqual({ ok: false, reason: 'Diese Ranch ist schon verpachtet.' });
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

describe('Bullard merkt sich Jacobs Antwort (2.8)', () => {
  function mitMarken(state: GameState, marks: Record<string, number>): GameState {
    return { ...state, events: { ...state.events, marks: { ...state.events.marks, ...marks } } };
  }

  /** Spiel ohne Startoptionen, mit einer Pacht Jacobs auf einer freien Randparzelle. */
  function mitJacobPacht(seed: string) {
    const roh = { ...newGame(seed, balance), options: [] };
    const p = freieRandparzelle(roh);
    const state = { ...roh, leases: [pacht(roh, p.id, 'jacob')] };
    return { state, p };
  }

  it('Haltung: neutral ohne Merkzeichen, Pakt nach dem Handschlag, Fehde nach Beleidigung oder Verrat', () => {
    const s = newGame('haltung', balance);
    expect(bullardStance(s)).toBe('neutral');
    expect(bullardStance(mitMarken(s, { [RIVAL_MARKS.bullardPact]: 2 }))).toBe('pakt');
    expect(bullardStance(mitMarken(s, { [RIVAL_MARKS.bullardFeud]: 2 }))).toBe('fehde');
    expect(bullardStance(mitMarken(s, { [RIVAL_MARKS.bullardPact]: 2, [RIVAL_MARKS.bullardBetrayed]: 5 }))).toBe('fehde');
  });

  it('Handschlag: Bullard pachtet nichts direkt neben Jacobs Land', () => {
    const { state, p } = mitJacobPacht('pakt');
    const frei = nachbarn(state, p.id).filter((n) => !n.discovery);
    const ohne = rivalCandidates(state, balance).map((c) => c.id);
    expect(frei.some((n) => ohne.includes(n.id))).toBe(true);
    const mit = rivalCandidates(mitMarken(state, { [RIVAL_MARKS.bullardPact]: 1 }), balance).map((c) => c.id);
    expect(frei.some((n) => mit.includes(n.id))).toBe(false);
    // Weiter weg darf er weiter pachten.
    expect(mit.length).toBeGreaterThan(0);
  });

  it('Fehde: Der Nachbarschaftsbonus neben Jacobs Land zählt feudFactor-fach', () => {
    const { state, p } = mitJacobPacht('fehde');
    const n = nachbarn(state, p.id).find((q) => !q.discovery)!;
    const neutral = rivalUtility(state, balance, n, 0.5);
    const fehde = rivalUtility(mitMarken(state, { [RIVAL_MARKS.bullardFeud]: 1 }), balance, n, 0.5);
    expect(fehde - neutral).toBeCloseTo(bullard.personality.aggression * bullard.nearJacobBonus * (bullard.feudFactor - 1), 6);
  });

  it('Verrat: Pachtet Jacob nach dem Handschlag neben Bullard, merkt der es – für immer Fehde', () => {
    const roh = { ...newGame('verrat', balance), options: [], round: 4 };
    const b = freieRandparzelle(roh);
    const n = nachbarn(roh, b.id).find((q) => !q.discovery)!;
    const bullardPacht = { ...pacht(roh, b.id, 'bullard'), startRound: 1 };
    const jacobPacht = { ...pacht(roh, n.id, 'jacob'), startRound: 4 };
    const s = mitMarken({ ...roh, leases: [bullardPacht, jacobPacht] }, { [RIVAL_MARKS.bullardPact]: 3 });
    expect(betrayalParcel(s)?.id).toBe(n.id);
    const nach = advanceRival(s, passiv);
    expect(nach.events.marks[RIVAL_MARKS.bullardBetrayed]).toBe(4);
    expect(bullardStance(nach)).toBe('fehde');
    expect(nach.log.some((l) => l.includes('Handschlag gilt nicht mehr'))).toBe(true);
    // Was Jacob vor dem Handschlag gepachtet hatte, zählt nicht.
    const vorher = mitMarken({ ...roh, leases: [bullardPacht, { ...jacobPacht, startRound: 2 }] }, { [RIVAL_MARKS.bullardPact]: 3 });
    expect(betrayalParcel(vorher)).toBeNull();
    expect(advanceRival(vorher, passiv).events.marks[RIVAL_MARKS.bullardBetrayed]).toBeUndefined();
  });

  it('ohne Ereignisse (Bots) bleibt Bullard wie bisher: neutral', () => {
    let s = newGame('bots', balance);
    for (let i = 0; i < 5; i++) s = endRound(s, balance);
    expect(bullardStance(s)).toBe('neutral');
    expect(Object.values(RIVAL_MARKS).some((m) => s.events.marks[m] !== undefined)).toBe(false);
  });
});
