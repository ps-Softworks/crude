import { describe, expect, it } from 'vitest';
import { creditLimit, quarterInterest, settleLoans, takeLoan } from './credit';
import { callerCard, DEAL_HANDLERS, dealsOf, dealsRunning, newDeals, royaltyPrice, settleDeals } from './deals';
import type { Well } from './drilling';
import { newGame, type GameState } from './game';
import { bookCard, planView, ringPhone, settlePlans } from './plans';
import { buyRig, rigReady } from './rigs';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { buyerCapacityLeft, buyerPrice, quoteSale, sellOil, tariff } from './transport';

const balance = loadBalance();
const katalog = loadEvents();
const b = balance.deals;

function start(seed = 'deals', patch: Partial<GameState> = {}): GameState {
  return { ...newGame(seed, balance, katalog), ...patch };
}

function mitKredit(seed = 'deals', betrag = 4000): GameState {
  const r = takeLoan(start(seed), balance, betrag);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function mitTurm(seed = 'deals'): GameState {
  const r = buyRig({ ...start(seed), cash: 10000 }, balance);
  if (!r.ok) throw new Error(r.reason);
  const s = r.state;
  // Lieferung abwarten: der Turm ist ab sofort bereit.
  return { ...s, rigs: s.rigs.map((x) => (x.kind === 'owned' ? { ...x, readyRound: s.round } : x)) };
}

function buche(s: GameState, card: string, target?: string): GameState {
  const r = bookCard(s, balance, katalog, card, target);
  if (!r.ok) throw new Error(`${card}: ${r.reason}`);
  return r.state;
}

describe('Bank (0.4.20+31)', () => {
  it('Zins nachverhandeln: nur mit Bankkredit, gelingt etwa so oft wie die Chance des Ratings, senkt alle Bankkredite', () => {
    expect(DEAL_HANDLERS.bank_zins.lock!(start(), balance)).toMatch(/keinen Bankkredit/);
    let ja = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const s = mitKredit(`zins${i}`);
      const vorher = s.loans[0].rate;
      const nach = DEAL_HANDLERS.bank_zins.apply(s, balance);
      if (nach.loans[0].rate < vorher) {
        ja++;
        expect(nach.loans[0].rate).toBeCloseTo(Math.max(b.bank.rate.floor, vorher - b.bank.rate.cut), 6);
      }
      expect(DEAL_HANDLERS.bank_zins.lock!(nach, balance)).toMatch(/Erst wieder/);
    }
    expect(Math.abs(ja / n - b.bank.rate.chance[mitKredit().rating])).toBeLessThan(0.08);
  });

  it('Stundung: keine Bankzinsen aus der Kasse, dafür wächst die Schuld um Zinsen × (1 + Aufschlag)', () => {
    const s = buche(mitKredit(), 'bank_stundung');
    const zins = quarterInterest(s.loans[0]);
    const ohne = settleLoans(mitKredit(), balance);
    const mit = settleLoans(s, balance);
    expect(mit.cash).toBeCloseTo(s.cash, 2);
    expect(ohne.cash).toBeCloseTo(mitKredit().cash - zins, 2);
    expect(mit.loans[0].principal).toBeCloseTo(s.loans[0].principal + zins * (1 + b.bank.defer.surcharge), 2);
    expect(DEAL_HANDLERS.bank_stundung.lock!(s, balance)).not.toBeNull();
  });

  it('Turm verpfänden: Rahmen + Bonus; nach versäumter Zahlung gehört der Turm der Bank (Jacob mietet)', () => {
    expect(DEAL_HANDLERS.bank_pfand.lock!(start(), balance)).toMatch(/keinen eigenen Bohrturm/);
    const s = mitTurm();
    const vorher = creditLimit(s, balance);
    const p = buche(s, 'bank_pfand');
    expect(creditLimit(p, balance)).toBe(Math.round((vorher + b.bank.pledge.limitBonus) / 100) * 100);
    // Kasse tief im Minus, kein Rahmen frei: der Geldverleiher springt ein → versäumt → Pfand weg.
    const pleite = settleLoans({ ...p, cash: -50000, rating: 'D' }, balance);
    const turm = pleite.rigs.find((r) => r.id === dealsOf(p).pledgedRig)!;
    expect(turm.kind).toBe('rented');
    expect(dealsOf(pleite).pledgedRig).toBeNull();
  });
});

describe('Eisenbahn (0.4.20+31)', () => {
  it('Festtarif: friert den Tarif ein und kostet je fehlendem Barrel unter der Mindestmenge', () => {
    const s = settlePlans(buche(start(), 'bahn_festtarif', '4'), balance);
    expect(s.freight.freezeUntil).toBeGreaterThanOrEqual(s.round + 4);
    const naechste = { ...s, round: s.round + 1, shipped: { ...s.shipped, rail: 1000 } };
    const nach = settleDeals(naechste, balance);
    expect(nach.cash).toBeCloseTo(naechste.cash - (b.rail.fixed.minimum - 1000) * b.rail.fixed.shortfall, 2);
    const genug = settleDeals({ ...naechste, shipped: { ...s.shipped, rail: b.rail.fixed.minimum } }, balance);
    expect(genug.cash).toBeCloseTo(naechste.cash, 2);
  });

  it('Frachtkontingent: heute billiger zahlen, die Barrel fahren ohne Fracht, der Rest verfällt', () => {
    const s0 = start('kontingent', { oilStock: 8000, cash: 10000 });
    const n = b.rail.quota.sizes[0];
    const preis = Math.round(n * tariff(s0, balance, 'rail') * (1 - b.rail.quota.discount) * 100) / 100;
    const s = buche(s0, 'bahn_kontingent', String(n));
    expect(s.cash).toBeCloseTo(s0.cash - preis, 2);
    expect(quoteSale(s, balance, 'rail', 3000).transportCost).toBe(0);
    const r = sellOil(s, balance, 'rail', 3000);
    if (!r.ok) throw new Error(r.reason);
    expect(dealsOf(r.state).railQuota!.left).toBe(n - 3000);
    const ende = settleDeals({ ...r.state, round: dealsOf(r.state).railQuota!.until }, balance);
    expect(dealsOf(ende).railQuota).toBeNull();
  });
});

describe('Crane und Händler (0.4.20+31)', () => {
  it('Vorschuss: Geld sofort mit Abschlag; gelieferte Barrel bringen nichts mehr; Rest nach der Frist mit Strafe', () => {
    const s0 = start('vorschuss', { oilStock: 5000 });
    const n = b.crane.advance.sizes[0];
    const preis = buyerPrice(s0, balance, 'crane');
    const s = buche(s0, 'crane_vorschuss', String(n));
    expect(s.cash).toBeCloseTo(s0.cash + n * preis * (1 - b.crane.advance.discount), 1);
    expect(quoteSale(s, balance, 'rail', 1000, 'crane').gross).toBe(0);
    const r = sellOil(s, balance, 'rail', 1000, 'crane');
    if (!r.ok) throw new Error(r.reason);
    expect(dealsOf(r.state).advance!.owed).toBe(n - 1000);
    const frist = { ...r.state, round: dealsOf(r.state).advance!.until };
    const ende = settleDeals(frist, balance);
    expect(ende.cash).toBeCloseTo(frist.cash - (n - 1000) * preis * (1 + b.crane.advance.penalty), 1);
    expect(dealsOf(ende).advance).toBeNull();
  });

  it('Großabnahme: Der Händler nimmt diese Runde mehr, danach Pause', () => {
    const s0 = start();
    const s = buche(s0, 'haendler_grossabnahme');
    expect(buyerCapacityLeft(s, balance, 'trader')).toBe(buyerCapacityLeft(s0, balance, 'trader') + b.trader.bulk.extra);
    expect(buyerCapacityLeft({ ...s, round: s.round + 1 }, balance, 'trader')).toBe(buyerCapacityLeft(s0, balance, 'trader'));
    expect(DEAL_HANDLERS.haendler_grossabnahme.lock!({ ...s, round: s.round + 1 }, balance)).toMatch(/Erst wieder/);
  });
});

describe('Ölleute, Grundbesitzer, Zeitung, Sheriff (0.4.20+31)', () => {
  it('Turm verleihen: weg für die Laufzeit, Miete je Runde, danach zurück (mal beschädigt)', () => {
    const s0 = mitTurm();
    const s = buche(s0, 'turm_verleihen', '2');
    const turm = s.rigs.find((r) => r.kind === 'owned')!;
    expect(rigReady(s, turm)).toBe(false);
    const r1 = settleDeals(s, balance);
    expect(r1.cash).toBeCloseTo(s.cash + b.rig.lend.rent, 2);
    const r2 = settleDeals({ ...r1, round: r1.round + 1 }, balance);
    expect(dealsOf(r2).lent).toBeNull();
    expect(rigReady({ round: r2.round + 1 }, r2.rigs.find((r) => r.id === turm.id)!)).toBe(true);
    let kaputt = 0;
    for (let i = 0; i < 200; i++) {
      const x = settleDeals({ ...s, seed: `turm${i}`, round: dealsOf(s).lent!.until }, balance);
      if (x.log.some((l) => l.includes('beschädigt'))) kaputt++;
    }
    expect(Math.abs(kaputt / 200 - b.rig.lend.damage)).toBeLessThan(0.08);
  });

  it('Förderzins: nur eigene fördernde Pacht; angenommen = Zins sinkt, Preis bezahlt', () => {
    const g = start('zins', { cash: 50000 });
    const parcel = g.parcels.find((p) => !p.discovery && !p.sure)!;
    const lease = { parcelId: parcel.id, holder: 'jacob' as const, bonus: 500, royalty: 0.18, startRound: 1, expiresAfterRound: 99, drilled: true };
    const well = { id: `${parcel.id}#1`, parcelId: parcel.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1, production: { initialRate: 3000, roundsProduced: 1, lastRate: 3000, total: 3000 } } as Well;
    const s = { ...g, leases: [...g.leases, lease], wells: [...g.wells, well] };
    expect(DEAL_HANDLERS.foerderzins.lock!(g, balance, parcel.id)).toMatch(/Keine eigene Pacht/);
    expect(DEAL_HANDLERS.foerderzins.lock!(s, balance, parcel.id)).toBeNull();
    const preis = royaltyPrice(s, balance, parcel.id);
    expect(preis).toBeGreaterThan(0);
    let ja = 0;
    for (let i = 0; i < 200; i++) {
      const x = DEAL_HANDLERS.foerderzins.apply({ ...s, seed: `fz${i}` }, balance, parcel.id);
      const l = x.leases.find((y) => y.parcelId === parcel.id)!;
      if (l.royalty < 0.18) {
        ja++;
        expect(l.royalty).toBeCloseTo(0.18 - b.royalty.cut, 6);
        expect(x.cash).toBeCloseTo(s.cash - preis, 2);
      } else expect(x.cash).toBe(s.cash);
    }
    expect(Math.abs(ja / 200 - (b.royalty.chance + s.wildcatterStanding))).toBeLessThan(0.08);
  });

  it('Interview: Ruf bei den Wildcattern steigt oder fällt; nach Gerüchten seltener gut', () => {
    let gut = 0;
    let gutGerede = 0;
    for (let i = 0; i < 300; i++) {
      const s = start(`iv${i}`);
      const x = DEAL_HANDLERS.interview.apply(s, balance);
      expect(Math.abs(x.wildcatterStanding - s.wildcatterStanding)).toBeCloseTo(b.interview.shift, 6);
      if (x.wildcatterStanding > s.wildcatterStanding) gut++;
      const g = { ...s, pricing: { ...s.pricing, rumours: { ...s.pricing.rumours, count: 1 } } };
      if (DEAL_HANDLERS.interview.apply(g, balance).wildcatterStanding > s.wildcatterStanding) gutGerede++;
    }
    expect(Math.abs(gut / 300 - b.interview.chance)).toBeLessThan(0.08);
    expect(gutGerede).toBeLessThan(gut);
  });

  it('Öldiebe: ab der Mindestmenge mit der Chance je Runde, nie mit Wache, nicht nach Kapitel 1', () => {
    let geklaut = 0;
    for (let i = 0; i < 400; i++) {
      const s = start(`dieb${i}`, { oilStock: 10000 });
      const x = settleDeals(s, balance);
      if (x.oilStock < s.oilStock) {
        geklaut++;
        expect(x.oilStock).toBe(s.oilStock - Math.floor(s.oilStock * b.theft.loss));
      }
      expect(settleDeals({ ...s, deals: { ...newDeals(), guardRound: s.round } }, balance).oilStock).toBe(s.oilStock);
      expect(settleDeals({ ...s, chapter: 2 }, balance).oilStock).toBe(s.oilStock);
      expect(settleDeals({ ...s, oilStock: b.theft.minStock - 1 }, balance).oilStock).toBe(b.theft.minStock - 1);
    }
    expect(Math.abs(geklaut / 400 - b.theft.chance)).toBeLessThan(0.04);
  });

  it('Spielstand: Deals überleben Speichern und Laden', () => {
    const s = buche(mitTurm(), 'bank_pfand');
    const r = deserializeGame(serializeGame(s, '0.0.0'));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.deals).toEqual(s.deals);
  });

  it('Laufende Abmachungen stehen in je einem Satz da', () => {
    expect(dealsRunning(start(), balance)).toEqual([]);
    const s = buche(buche(mitTurm(), 'bank_pfand'), 'wache');
    const zeilen = dealsRunning(s, balance);
    expect(zeilen.some((z) => z.includes('Pfand'))).toBe(true);
    expect(zeilen).toContain('Wache an den Tanks');
  });
});

describe('Telefon (0.4.20+34)', () => {
  const k2 = (seed: string, patch: Partial<GameState> = {}) => start(seed, { chapter: 2, ...patch });

  it('klingelt erst ab Kapitel 2, etwa mit der Chance je Runde, und nur mit einer Karte, die gerade geht', () => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      expect(callerCard(ringPhone(start(`tel${i}`), balance, katalog))).toBeNull();
      const s = ringPhone(k2(`tel${i}`), balance, katalog);
      const c = callerCard(s);
      if (c) {
        n++;
        expect(balance.plans.cards[c].call).toBeGreaterThan(0);
      }
    }
    expect(Math.abs(n / 300 - b.phone.chance)).toBeLessThan(0.08);
  });

  it('ein Anruf liegt nur in seiner Runde auf der Hand', () => {
    const s = k2('anruf', { deals: { ...newDeals(), call: { card: 'bank_angebot', round: 1 } } });
    expect(planView(s, balance, katalog).cards.some((c) => c.id === 'bank_angebot')).toBe(true);
    expect(planView({ ...s, round: 2 }, balance, katalog).cards.some((c) => c.id === 'bank_angebot')).toBe(false);
    expect(planView(k2('anruf'), balance, katalog).cards.some((c) => c.id === 'bank_angebot')).toBe(false);
  });

  it('Sonderkredit: Zins unter dem Bankzins; nach der Frist ohne Tilgung teurer', () => {
    const s0 = k2('sonder', { deals: { ...newDeals(), call: { card: 'bank_angebot', round: 1 } } });
    const n = b.bank.offer.sizes[0];
    const s = buche(s0, 'bank_angebot', String(n));
    const kredit = s.loans[s.loans.length - 1];
    expect(kredit.principal).toBe(n);
    expect(s.cash).toBeCloseTo(s0.cash + n, 2);
    const frist = { ...s, round: dealsOf(s).offerLoan!.due };
    const nach = settleDeals(frist, balance);
    expect(nach.loans.find((l) => l.id === kredit.id)!.rate).toBeCloseTo(kredit.rate + b.bank.offer.penalty, 6);
    const getilgt = settleDeals({ ...frist, loans: frist.loans.filter((l) => l.id !== kredit.id) }, balance);
    expect(dealsOf(getilgt).offerLoan).toBeNull();
  });
});
