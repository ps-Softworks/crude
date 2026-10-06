import { describe, expect, it } from 'vitest';
import { offerBuyout } from './buyout';
import type { Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { leaseOf } from './lease';
import { rigSaleBlocker, rigSalePrice, saleBlocker, saleQuote, sellLease, sellRig } from './sale';
import { deserializeGame, serializeGame } from './save';
import { RIVAL_MARKS } from './trust';
import { loadBalance } from './testBalance';

const balance = loadBalance();

function quelle(parcelId: string, nr: number, rate: number, extra: Partial<Well> = {}): Well {
  return {
    id: `${parcelId}#${nr}`,
    parcelId,
    stage: 1,
    status: 'found',
    roundsLeft: 0,
    spent: 0,
    oilStage: 1,
    result: 'small',
    production: { initialRate: rate, roundsProduced: 2, lastRate: rate, total: rate * 2 },
    startRound: 1,
    ...extra,
  };
}

/** Spiel, in dem Jacob eine Pacht mit fördernden Quellen (oder ungebohrt) hält. */
function mitPacht(seed = 'verkauf', rates: number[] = [4000], extra: Partial<Well> = {}): { state: GameState; id: string } {
  const g = newGame(seed, balance);
  const parcel = g.parcels.find((p) => !p.discovery && !p.sure && !g.options.some((o) => o.parcelId === p.id))!;
  const lease = { parcelId: parcel.id, holder: 'jacob' as const, bonus: 1000, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: rates.length > 0 };
  const wells = rates.map((r, i) => quelle(parcel.id, i + 1, r, extra));
  return { state: { ...g, cash: 1000, leases: [...g.leases, lease], wells: [...g.wells, ...wells], rival: { ...g.rival, cash: 1_000_000 } }, id: parcel.id };
}

describe('Anlagen verkaufen: Bullards Gebot', () => {
  it('fördernde Quellen: Wert = Ölfluss über den Horizont × Knappheit, Gebot = bid × Wert, auf den Schritt abgerundet', () => {
    const { state, id } = mitPacht();
    const q = saleQuote(state, balance, id)!;
    const d = balance.production.decline;
    const net = state.postedPrice * (1 - 0.15) - balance.rivals.bullard.transportPerBarrel;
    const flow = 4000 * net * ((1 - (1 - d) ** balance.buyout.horizon) / d);
    expect(q.value).toBeGreaterThanOrEqual(Math.round(flow));
    expect(q.offer % balance.sale.step).toBe(0);
    expect(q.offer).toBe(Math.floor((q.value * balance.sale.bid) / balance.sale.step) * balance.sale.step);
    expect(q.rate).toBe(4000);
    expect(q.wells).toBe(1);
    expect(q.stance).toBe('neutral');
    expect(q.emergency).toBe(false);
  });

  it('mehrere Bohrlöcher zählen zusammen; ungebohrt mindestens undrilledBonus × Pachtbonus', () => {
    const eins = mitPacht('verkauf', [3000]);
    const zwei = mitPacht('verkauf', [3000, 2000]);
    expect(saleQuote(zwei.state, balance, zwei.id)!.rate).toBe(5000);
    expect(saleQuote(zwei.state, balance, zwei.id)!.offer).toBeGreaterThan(saleQuote(eins.state, balance, eins.id)!.offer);
    const leer = mitPacht('verkauf', []);
    const q = saleQuote(leer.state, balance, leer.id)!;
    expect(q.rate).toBe(0);
    expect(q.value).toBeGreaterThanOrEqual(1000 * balance.sale.undrilledBonus);
  });

  it('Handschlag zahlt mehr, Fehde weniger', () => {
    const { state, id } = mitPacht();
    const mark = (m: string) => ({ ...state, events: { ...state.events, marks: { ...state.events.marks, [m]: 1 } } });
    const basis = saleQuote(state, balance, id)!.offer;
    const pakt = saleQuote(mark(RIVAL_MARKS.bullardPact), balance, id)!;
    const fehde = saleQuote(mark(RIVAL_MARKS.bullardBetrayed), balance, id)!;
    expect(pakt.stance).toBe('pakt');
    expect(pakt.offer).toBeGreaterThan(basis);
    expect(fehde.stance).toBe('fehde');
    expect(fehde.offer).toBeLessThan(basis);
  });

  it('höchstens cashShare von Bullards Kasse', () => {
    const { state, id } = mitPacht();
    const arm = { ...state, rival: { ...state.rival, cash: 2000 } };
    const q = saleQuote(arm, balance, id)!;
    expect(q.cashLimited).toBe(true);
    expect(q.offer).toBe(Math.floor((2000 * balance.sale.cashShare) / balance.sale.step) * balance.sale.step);
  });

  it('Sperren: Bohrung läuft, verpfändet, trocken gebohrt, Bullard verschuldet, fremde Ranch', () => {
    const bohrt = mitPacht('verkauf', [4000]);
    const mitBohrung = { ...bohrt.state, wells: [...bohrt.state.wells, { ...quelle(bohrt.id, 2, 0), status: 'drilling' as const, production: undefined }] };
    expect(saleBlocker(mitBohrung, balance, bohrt.id)).toMatch(/gebohrt/);
    const pfand = { ...bohrt.state, loans: [{ id: 1, source: 'bank' as const, principal: 1000, rate: 0.08, takenRound: 1, collateral: bohrt.id }] };
    expect(saleBlocker(pfand, balance, bohrt.id)).toMatch(/verpfändet/);
    const trocken = mitPacht('verkauf', []);
    const dry = { ...trocken.state, leases: trocken.state.leases.map((l) => (l.parcelId === trocken.id ? { ...l, drilled: true } : l)), wells: [...trocken.state.wells, { ...quelle(trocken.id, 1, 0), status: 'dry' as const, production: undefined }] };
    expect(saleBlocker(dry, balance, trocken.id)).toMatch(/trocken/);
    const schulden = { ...bohrt.state, rivalsK3: { bullardDebt: balance.rivalsK3.bullard.distressAt } } as unknown as GameState;
    expect(saleBlocker(schulden, balance, bohrt.id)).toMatch(/Schulden/);
    expect(saleQuote(schulden, balance, bohrt.id)).toBeNull();
    const fremd = bohrt.state.parcels.find((p) => !leaseOf(bohrt.state, p.id))!;
    expect(saleBlocker(bohrt.state, balance, fremd.id)).toMatch(/eigene/);
  });
});

describe('Anlagen verkaufen: Pacht an Bullard', () => {
  it('Geld in die Kasse, Pacht an Bullard, die Quellen fördern als eine Quelle für ihn (mit Pumpe)', () => {
    const { state, id } = mitPacht('verkauf', [3000, 1500], { pump: true });
    const q = saleQuote(state, balance, id)!;
    const r = sellLease(state, balance, id);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.cash).toBe(state.cash + q.offer);
    expect(s.rival.cash).toBe(state.rival.cash - q.offer);
    expect(leaseOf(s, id)!.holder).toBe('bullard');
    expect(s.wells.some((w) => w.parcelId === id)).toBe(false);
    const bei = s.rival.wells.filter((w) => w.parcelId === id);
    expect(bei).toHaveLength(1);
    expect(bei[0].rate).toBe(4500);
    expect(bei[0].status).toBe('found');
    // Er fördert in der nächsten Runde wirklich – und Jacob kann die Pacht später zurückkaufen.
    const weiter = endRound(s, balance);
    expect(weiter.rival.wells.find((w) => w.parcelId === id)!.status).toBe('found');
    const zurueck = offerBuyout({ ...s, cash: 1_000_000 }, balance, id, 1);
    expect(zurueck.ok).toBe(false); // zu wenig geboten – aber die Ranch ist wieder handelbar
  });

  it('Startquelle (sure) und ungebohrtes Land lassen sich verkaufen; Spielstand übersteht es', () => {
    const g = newGame('verkauf-sure', balance);
    const sure = g.parcels.find((p) => p.sure)!;
    const lease = { parcelId: sure.id, holder: 'jacob' as const, bonus: 500, royalty: 0.125, startRound: 1, expiresAfterRound: 99, drilled: true };
    const s0: GameState = { ...g, leases: [...g.leases, lease], wells: [quelle(sure.id, 1, 3200)], rival: { ...g.rival, cash: 500_000 } };
    const r = sellLease(s0, balance, sure.id);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.wells).toHaveLength(0);
    const geladen = deserializeGame(serializeGame(r.state, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.leases.find((l) => l.parcelId === sure.id)!.holder).toBe('bullard');
    const leer = mitPacht('verkauf', []);
    const u = sellLease(leer.state, balance, leer.id);
    expect(u.ok).toBe(true);
    if (u.ok) expect(u.state.rival.wells.some((w) => w.parcelId === leer.id)).toBe(false);
  });

  it('Kapitel 3: Bullard existiert weiter und kauft', () => {
    const { state, id } = mitPacht();
    const k3 = { ...state, chapter: 3, rivalsK3: { bullardDebt: 0 } } as unknown as GameState;
    expect(k3.rival).toBeDefined();
    expect(sellLease(k3, balance, id).ok).toBe(true);
  });
});

describe('Anlagen verkaufen: Notverkauf in der Pleitefrist', () => {
  it('40–60 % des Werts, andere Bieter setzen die Untergrenze, kein Kassendeckel', () => {
    const { state, id } = mitPacht();
    const not = { ...state, cash: -5000, bankruptcyDeadline: state.round + 2, rival: { ...state.rival, cash: 1000 } };
    const q = saleQuote(not, balance, id)!;
    expect(q.emergency).toBe(true);
    expect(q.cashLimited).toBe(false);
    expect(q.offer / q.value).toBeGreaterThanOrEqual(0.4 - 0.01);
    expect(q.offer / q.value).toBeLessThanOrEqual(0.6);
    const fehde = { ...not, events: { ...not.events, marks: { ...not.events.marks, [RIVAL_MARKS.bullardBetrayed]: 1 } } };
    expect(saleQuote(fehde, balance, id)!.offer).toBe(Math.floor((q.value * balance.sale.emergency.others) / balance.sale.step) * balance.sale.step);
    const r = sellLease(not, balance, id);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(-5000 + q.offer);
    expect(r.state.rival.cash).toBe(0); // den Rest legen seine Teilhaber dazu
  });

  it('auch wenn Bullard in Kapitel 3 verschuldet ist', () => {
    const { state, id } = mitPacht();
    const s = { ...state, bankruptcyDeadline: 5, rivalsK3: { bullardDebt: balance.rivalsK3.bullard.distressAt } } as unknown as GameState;
    expect(saleBlocker(s, balance, id)).toBeNull();
  });
});

describe('Anlagen verkaufen: eigener Bohrturm', () => {
  const mitTurm = (): GameState => {
    const g = newGame('turm-verkauf', balance);
    return { ...g, rigs: [...g.rigs, { id: 'eigen-1', kind: 'owned', readyRound: 1, steam: true, rods: false }] };
  };

  it('Preis = rigShare × Neupreis mit Dampfmaschine; Turm weg, Geld da', () => {
    const s = mitTurm();
    const preis = rigSalePrice(s, balance, 'eigen-1');
    const r = balance.drilling.rigs;
    expect(preis).toBe(Math.round((r.buy.cost + r.steam.cost) * balance.sale.rigShare));
    const v = sellRig(s, balance, 'eigen-1');
    if (!v.ok) throw new Error(v.reason);
    expect(v.state.cash).toBe(s.cash + preis);
    expect(v.state.rigs.some((x) => x.id === 'eigen-1')).toBe(false);
    // In der Pleitefrist bringt er weniger.
    expect(rigSalePrice({ ...s, bankruptcyDeadline: 3 }, balance, 'eigen-1')).toBe(Math.round(preis * balance.sale.emergency.rig));
  });

  it('Sperren: Silas-Turm, nicht geliefert, bohrt, verpfändet, verliehen', () => {
    const s = mitTurm();
    expect(rigSaleBlocker(s, 'silas')).toMatch(/eigene/);
    expect(rigSaleBlocker({ ...s, rigs: s.rigs.map((r) => (r.id === 'eigen-1' ? { ...r, readyRound: 9 } : r)) }, 'eigen-1')).toMatch(/geliefert/);
    const parcel = s.parcels[0].id;
    const bohrt = { ...s, wells: [{ ...quelle(parcel, 1, 0), status: 'drilling' as const, production: undefined, rigId: 'eigen-1' }] };
    expect(rigSaleBlocker(bohrt, 'eigen-1')).toMatch(/bohrt/);
    const deals = { cooldown: {}, deferRound: 0, pledgedRig: 'eigen-1', railFixed: null, railQuota: null, advance: null, bulkRound: 0, lent: null, guardRound: 0 };
    expect(rigSaleBlocker({ ...s, deals } as GameState, 'eigen-1')).toMatch(/verpfändet/);
    expect(rigSaleBlocker({ ...s, deals: { ...deals, pledgedRig: null, lent: { rigId: 'eigen-1', until: 9 } } } as GameState, 'eigen-1')).toMatch(/verliehen/);
    expect(sellRig({ ...s, deals: { ...deals } } as GameState, balance, 'eigen-1').ok).toBe(false);
  });
});
