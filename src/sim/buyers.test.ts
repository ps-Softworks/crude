import { describe, expect, it } from 'vitest';
import { baseCapacity, buyerContract, contractOptions, EXTRA_BUYERS, extraBuyerCapacityLeft, extraBuyerPrice, openBuyers, settleBuyers, signBuyerContract } from './buyers';
import { newGame, type GameState } from './game';
import { knowAll, relationOf, shiftRelation } from './network';
import { bookCard } from './plans';
import { grudgeCut } from './trust';
import { buyerCapacityLeft, buyerPrice, netPrice, quoteSale, sellOil, tariff } from './transport';
import { loadBalance } from './testBalance';

const balance = loadBalance();

function spiel(patch: Partial<GameState> = {}): GameState {
  return { ...newGame('abnehmer', balance), oilStock: 20000, cash: 5000, ...patch };
}

/** Kapitel 1 mit bekanntem Lampenölhandel. */
function mitCordova(patch: Partial<GameState> = {}): GameState {
  return spiel({ network: knowAll(balance), ...patch });
}

describe('Großhändler (0.4.20+43)', () => {
  it('jeder Abnehmer hat eine Stelle im Netzwerk und eine Vertragskarte', () => {
    for (const id of EXTRA_BUYERS) {
      expect(balance.network.contacts[balance.buyers[id].contact], id).toBeDefined();
      expect(balance.plans.cards[`vertrag_${id}`]?.contact, id).toBe(balance.buyers[id].contact);
    }
  });

  it('unbekannte Abnehmer kaufen nicht; Kapitel-2-Abnehmer kaufen in Kapitel 1 nicht', () => {
    expect(openBuyers(spiel(), balance)).toEqual([]);
    expect(extraBuyerCapacityLeft(spiel(), balance, 'cordova')).toBe(0);
    const g = mitCordova();
    expect(openBuyers(g, balance)).toEqual(['cordova']);
    expect(openBuyers({ ...g, chapter: 2 }, balance)).toEqual(['cordova', 'okara', 'hallstead', 'aldmark']);
    expect(openBuyers({ ...g, chapter: 3 }, balance)).toContain('eastern');
  });

  it('Preis: Posted Price + Aufschlag, die Beziehung hebt oder senkt ihn; Zusatzfracht drückt den Nettopreis', () => {
    const g = mitCordova();
    const b = balance.buyers.cordova;
    expect(extraBuyerPrice(g, balance, 'cordova')).toBeCloseTo(g.postedPrice + b.premium, 2);
    expect(buyerPrice(g, balance, 'cordova')).toBe(extraBuyerPrice(g, balance, 'cordova'));
    const gut = shiftRelation(g, b.contact, 50);
    expect(extraBuyerPrice(gut, balance, 'cordova')).toBeGreaterThan(extraBuyerPrice(g, balance, 'cordova'));
    expect(netPrice(g, balance, 'wagon', 'cordova')).toBeCloseTo(extraBuyerPrice(g, balance, 'cordova') - tariff(g, balance, 'wagon') - b.freight, 2);
    const q = quoteSale(g, balance, 'wagon', 100, 'cordova');
    expect(q.transportCost).toBeCloseTo(100 * (tariff(g, balance, 'wagon') + b.freight), 1);
  });

  it('Verkauf: Menge je Runde begrenzt, Crane grollt, das erste Geschäft der Runde pflegt die Beziehung', () => {
    const g = mitCordova();
    const kap = baseCapacity(g, balance, 'cordova');
    expect(buyerCapacityLeft(g, balance, 'cordova')).toBe(kap);
    const r = sellOil(g, balance, 'wagon', 500, 'cordova');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(buyerCapacityLeft(r.state, balance, 'cordova')).toBe(kap - 500);
    expect(r.state.logistics.traderLast).toBe(g.round);
    expect(relationOf(r.state, 'cordova_handel')).toBe(relationOf(g, 'cordova_handel') + balance.network.relation.use);
    const zwei = sellOil(r.state, balance, 'wagon', 100, 'cordova');
    expect(zwei.ok && relationOf(zwei.state, 'cordova_handel')).toBe(relationOf(r.state, 'cordova_handel'));
    expect(sellOil(r.state, balance, 'wagon', kap, 'cordova').ok).toBe(false);
    // Crane zieht in der nächsten Runde den Groll ab.
    expect(grudgeCut({ ...r.state, round: r.state.round + 1 }, balance)).toBeGreaterThan(0);
    // Rundenende: Liste leer.
    expect(settleBuyers(r.state, balance).buyers!.sold).toEqual({});
  });

  it('Liefervertrag: Festpreis, Menge reicht über die Grundmenge hinaus, Strafe und Beziehung bei Fehlmenge', () => {
    const g = mitCordova();
    const c = balance.buyers.cordova.contract;
    const n = c.sizes[c.sizes.length - 1];
    const v = signBuyerContract(g, balance, 'cordova', n);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const k = buyerContract(v.state, 'cordova')!;
    expect(k.price).toBeCloseTo(extraBuyerPrice(g, balance, 'cordova') * (1 + c.premium), 2);
    expect(k.until).toBe(g.round + c.rounds - 1);
    expect(signBuyerContract(v.state, balance, 'cordova', n).ok).toBe(false);
    expect(contractOptions(v.state, balance, 'cordova')[0].reason).not.toBeNull();
    // Nichts geliefert: Strafe für die ganze Menge, Beziehung sinkt.
    const s = settleBuyers(v.state, balance);
    expect(s.cash).toBeCloseTo(v.state.cash - n * c.penalty, 2);
    expect(relationOf(s, 'cordova_handel')).toBeLessThan(relationOf(v.state, 'cordova_handel'));
    // Geliefert: keine Strafe.
    const geliefert = sellOil(v.state, balance, 'wagon', n, 'cordova');
    expect(geliefert.ok).toBe(true);
    if (geliefert.ok) expect(settleBuyers(geliefert.state, balance).cash).toBe(geliefert.state.cash);
    // Abgelaufen: weg.
    const spaeter = settleBuyers({ ...v.state, round: k.until }, balance);
    expect(spaeter.buyers!.contracts.cordova).toBeUndefined();
  });

  it('Vertragskarte im Adressbuch: nur bei bekannter Stelle', () => {
    const ohne = bookCard(spiel(), balance, [], 'vertrag_cordova', String(balance.buyers.cordova.contract.sizes[0]));
    expect(ohne.ok).toBe(false);
    const mit = bookCard(mitCordova(), balance, [], 'vertrag_cordova', String(balance.buyers.cordova.contract.sizes[0]));
    expect(mit.ok).toBe(true);
    if (mit.ok) expect(buyerContract(mit.state, 'cordova')).not.toBeNull();
  });

  it('Export: zahlt manchmal nicht – fest je Seed und Runde', () => {
    const g = mitCordova({ chapter: 2 });
    const r = sellOil(g, balance, 'wagon', 1000, 'aldmark');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    let ausfall = 0;
    for (let runde = 1; runde <= 200; runde++) {
      const s = { ...r.state, round: runde };
      if (settleBuyers(s, balance).cash < s.cash) ausfall++;
    }
    expect(ausfall).toBeGreaterThan(0);
    expect(ausfall).toBeLessThan(200 * balance.buyers.aldmark.defaultChance * 2.5);
    expect(settleBuyers(r.state, balance)).toEqual(settleBuyers(r.state, balance));
  });
});
