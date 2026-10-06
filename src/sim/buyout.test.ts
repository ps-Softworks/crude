import { describe, expect, it } from 'vitest';
import { acceptChance, buyoutBlocker, buyoutQuote, goodLandScarcity, offerBuyout } from './buyout';
import { buyoutCount, buyoutTurn } from './bots';
import { endRound, newGame, type GameState } from './game';
import { leaseOf } from './lease';
import { deserializeGame, serializeGame } from './save';
import { RIVAL_MARKS } from './trust';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Spiel, in dem Bullard eine Pacht mit fördernder Quelle (oder ungebohrt) auf einer freien Ranch hat. */
function mitBullard(seed = 'feldkauf', status: 'found' | 'none' | 'drilling' | 'dry' = 'found', rate = 4000): { state: GameState; id: string } {
  const g = newGame(seed, balance);
  const parcel = g.parcels.find((p) => !p.discovery && !p.sure && !g.options.some((o) => o.parcelId === p.id))!;
  const lease = { parcelId: parcel.id, holder: 'bullard' as const, bonus: 800, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: status !== 'none' };
  const wells = status === 'none' ? [] : [{ parcelId: parcel.id, startRound: 1, roundsLeft: status === 'drilling' ? 1 : 0, status: status as 'found' | 'drilling' | 'dry', rate: status === 'found' ? rate : undefined, royalty: 0.15 }];
  return { state: { ...g, cash: 200000, leases: [...g.leases, lease], rival: { ...g.rival, wells } }, id: parcel.id };
}

describe('Feldkauf: Bullards Preis', () => {
  it('fördernde Quelle: Wert = Ölfluss über den Horizont × Knappheit × Haltung, auf den Schritt gerundet', () => {
    const { state, id } = mitBullard();
    const q = buyoutQuote(state, balance, id)!;
    const k = balance.buyout;
    const d = balance.production.decline;
    const net = state.postedPrice * (1 - 0.15) - balance.rivals.bullard.transportPerBarrel;
    expect(q.flow).toBe(Math.round(4000 * net * ((1 - (1 - d) ** k.horizon) / d)));
    expect(q.scarcity).toBeCloseTo(1 + k.scarcityWeight * goodLandScarcity(state, balance), 10);
    expect(q.stance).toBe(1);
    expect(q.stanceReasons).toEqual([]);
    expect(q.value % k.step).toBe(0);
    expect(Math.abs(q.value - q.flow * q.scarcity)).toBeLessThanOrEqual(k.step / 2);
    expect(q.rate).toBe(4000);
  });

  it('mehr Ölfluss = teurer; ungebohrtes Land kostet mindestens den Pachtbonus', () => {
    const klein = buyoutQuote(mitBullard('feldkauf', 'found', 1000).state, balance, mitBullard('feldkauf', 'found', 1000).id)!;
    const gross = buyoutQuote(mitBullard('feldkauf', 'found', 6000).state, balance, mitBullard('feldkauf', 'found', 6000).id)!;
    expect(gross.value).toBeGreaterThan(klein.value * 4);
    const leer = mitBullard('feldkauf', 'none');
    const q = buyoutQuote(leer.state, balance, leer.id)!;
    expect(q.rate).toBe(0);
    expect(q.flow).toBeGreaterThanOrEqual(800);
  });

  it('Knappheit: je mehr gute Ranches vergeben sind, desto teurer', () => {
    const { state, id } = mitBullard();
    const vorher = buyoutQuote(state, balance, id)!;
    // Alle anderen freien Ranches verpachten (an Bullard, ungebohrt).
    const frei = state.parcels.filter((p) => !p.discovery && !state.leases.some((l) => l.parcelId === p.id));
    const voll = { ...state, leases: [...state.leases, ...frei.map((p) => ({ parcelId: p.id, holder: 'bullard' as const, bonus: 500, royalty: 0.15, startRound: 1, expiresAfterRound: 99, drilled: false }))] };
    expect(goodLandScarcity(voll, balance)).toBe(1);
    expect(buyoutQuote(voll, balance, id)!.value).toBeGreaterThan(vorher.value);
  });

  it('Fehde macht es teurer, Handschlag billiger', () => {
    const { state, id } = mitBullard();
    const mark = (m: string) => ({ ...state, events: { ...state.events, marks: { ...state.events.marks, [m]: 1 } } });
    const basis = buyoutQuote(state, balance, id)!.value;
    const fehde = buyoutQuote(mark(RIVAL_MARKS.bullardBetrayed), balance, id)!;
    expect(fehde.value).toBeGreaterThan(basis);
    expect(fehde.stanceReasons).toEqual(['fehde']);
    expect(buyoutQuote(mark(RIVAL_MARKS.bullardPact), balance, id)!.value).toBeLessThan(basis);
  });

  it('nichts zu kaufen: fremde Ranch, laufende Bohrung, trockenes Loch', () => {
    const frei = newGame('feldkauf-frei', balance);
    expect(buyoutQuote(frei, balance, frei.parcels.find((p) => !p.discovery)!.id)).toBeNull();
    for (const status of ['drilling', 'dry'] as const) {
      const { state, id } = mitBullard('feldkauf', status);
      expect(buyoutQuote(state, balance, id)).toBeNull();
      expect(buyoutBlocker(state, id)).toMatch(/bohrt|trocken/);
    }
  });
});

describe('Feldkauf: Annahme-Chance', () => {
  it('50 % bei Bullards Preis, steigt mit dem Angebot, nie über 1', () => {
    const q = { value: 10000 };
    expect(acceptChance(balance, q, 10000)).toBeCloseTo(0.5, 10);
    expect(acceptChance(balance, q, 12000)).toBeGreaterThan(acceptChance(balance, q, 11000));
    expect(acceptChance(balance, q, 8000)).toBeLessThan(0.5);
    expect(acceptChance(balance, q, 1e9)).toBeLessThanOrEqual(1);
    expect(acceptChance(balance, q, 0)).toBe(0);
  });

  it('über viele Seeds trifft die Vorhersage: Anteil Annahmen ≈ Ø Chance', () => {
    let ja = 0;
    let summe = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const { state, id } = mitBullard(`feldkauf-${i}`);
      const q = buyoutQuote(state, balance, id)!;
      const betrag = Math.round((q.value * (0.8 + (i % 5) * 0.1)) / q.step) * q.step;
      const r = offerBuyout(state, balance, id, betrag);
      if (!r.ok) throw new Error(r.reason);
      summe += r.chance;
      if (r.accepted) ja++;
    }
    expect(Math.abs(ja / n - summe / n)).toBeLessThan(0.08);
  });
});

describe('Feldkauf: Angebot', () => {
  it('angenommen: Geld an Bullard, Pacht mit Förderzins an Jacob, die Quelle fördert für Jacob weiter', () => {
    const { state, id } = mitBullard();
    const q = buyoutQuote(state, balance, id)!;
    const r = offerBuyout(state, balance, id, q.max);
    if (!r.ok || !r.accepted) throw new Error('nicht angenommen');
    const s = r.state;
    expect(s.cash).toBe(state.cash - q.max);
    expect(s.rival.cash).toBe(state.rival.cash + q.max);
    expect(leaseOf(s, id)).toMatchObject({ holder: 'jacob', royalty: 0.15, drilled: true });
    expect(s.rival.wells.some((w) => w.parcelId === id)).toBe(false);
    const quelle = s.wells.find((w) => w.parcelId === id)!;
    expect(quelle).toMatchObject({ status: 'found', production: { initialRate: 4000 } });
    const weiter = endRound(s, balance);
    expect(weiter.wells.find((w) => w.parcelId === id)!.production!.lastRate).toBeGreaterThan(0);
  });

  it('abgelehnt: kein Geld fließt, auf dieser Ranch erst nach cooldown Runden wieder', () => {
    let gefunden = false;
    for (let i = 0; i < 50 && !gefunden; i++) {
      const { state, id } = mitBullard(`ablehnen-${i}`);
      const q = buyoutQuote(state, balance, id)!;
      const r = offerBuyout(state, balance, id, q.min);
      if (!r.ok || r.accepted) continue;
      gefunden = true;
      expect(r.state.cash).toBe(state.cash);
      expect(leaseOf(r.state, id)!.holder).toBe('bullard');
      expect(buyoutBlocker(r.state, id)).toMatch(/abgelehnt/);
      expect(offerBuyout(r.state, balance, id, q.max).ok).toBe(false);
      // Den Preis zeigt das Fenster trotzdem weiter an.
      expect(buyoutQuote(r.state, balance, id)).not.toBeNull();
      const spaeter = { ...r.state, round: r.state.round + balance.buyout.cooldown };
      expect(buyoutBlocker(spaeter, id)).toBeNull();
    }
    expect(gefunden).toBe(true);
  });

  it('der Wurf hängt an Seed, Ranch und Runde – nicht am Betrag oder an mehrfachem Laden', () => {
    const { state, id } = mitBullard('wurf');
    const q = buyoutQuote(state, balance, id)!;
    const a = offerBuyout(state, balance, id, q.value);
    const b = offerBuyout(state, balance, id, q.value);
    expect(a).toEqual(b);
    // Höheres Angebot nimmt er mindestens so oft an: wer bei value annimmt, nimmt auch bei max an.
    const hoch = offerBuyout(state, balance, id, q.max);
    if (a.ok && a.accepted && hoch.ok) expect(hoch.accepted).toBe(true);
    expect(state.rng).toBe((a.ok ? a.state : state).rng);
  });

  it('Grenzen: außerhalb des Reglers oder ohne Geld kein Angebot', () => {
    const { state, id } = mitBullard();
    const q = buyoutQuote(state, balance, id)!;
    expect(offerBuyout(state, balance, id, q.min - q.step).ok).toBe(false);
    expect(offerBuyout(state, balance, id, q.max + q.step).ok).toBe(false);
    expect(offerBuyout({ ...state, cash: q.min - 1 }, balance, id, q.min).ok).toBe(false);
  });

  it('Wartezeit übersteht Speichern und Laden', () => {
    const { state, id } = mitBullard();
    const s = { ...state, buyouts: { [id]: state.round + 2 } };
    const geladen = deserializeGame(serializeGame(s, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.buyouts).toEqual({ [id]: state.round + 2 });
  });
});

describe('Feldkauf der Bots (0.4.20+30)', () => {
  it('bietet offer × Preis für die Ranch mit dem besten Ölfluss je Dollar – nur mit Reserve und bis maxPrice × Ölfluss', () => {
    const { state, id } = mitBullard('bot-kauf');
    const q = buyoutQuote(state, balance, id)!;
    const willig: typeof balance = { ...balance, bots: { ...balance.bots, buyout: { ...balance.bots.buyout, balanced: { offer: 1.1, maxPrice: 99, reserve: 0 } } } };
    const nachher = buyoutTurn(state, willig, 'ausgewogen');
    expect(buyoutCount(nachher)).toMatchObject({ offers: 1 });
    const betrag = Math.round((q.value * 1.1) / q.step) * q.step;
    if (buyoutCount(nachher).accepted === 1) expect(nachher.cash).toBe(state.cash - betrag);
    // Zu teuer gemessen am Ölfluss: kein Angebot.
    const geizig: typeof balance = { ...balance, bots: { ...balance.bots, buyout: { ...balance.bots.buyout, balanced: { offer: 1.1, maxPrice: 0.1, reserve: 0 } } } };
    expect(buyoutTurn(state, geizig, 'ausgewogen')).toBe(state);
    // Keine Reserve übrig: kein Angebot.
    expect(buyoutTurn({ ...state, cash: betrag }, { ...willig, bots: { ...willig.bots, buyout: { ...willig.bots.buyout, balanced: { offer: 1.1, maxPrice: 99, reserve: 1 } } } }, 'ausgewogen').cash).toBe(betrag);
  });
});
