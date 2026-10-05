import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { checkBankruptcy } from './credit';
import {
  advanceExchange,
  buyStock,
  chapterOf,
  exchangeEquity,
  exchangeHeadline,
  exchangeWorldInput,
  exchangeWarning,
  marginDebt,
  marginHeat,
  marginRate,
  NEUTRAL_CLIMATE,
  newExchange,
  openExchange,
  positionEquity,
  readClimate,
  sellPosition,
  settleExchange,
  topUpPosition,
  validExchange,
  WARNING_HEADLINES,
  type CreditClimate,
  type ExchangeState,
} from './exchange';
import { parseExchangeBalance } from './exchangeBalance';
import { endRound, newGame, type GameState } from './game';
import { effectiveDemand, worldRateAdd } from './world';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const EB = balance.exchange;

/** Balance mit verbogenen Börsenzahlen. */
function mit(over: (eb: Balance['exchange']) => Partial<Balance['exchange']>): Balance {
  return { ...balance, exchange: { ...EB, ...over(EB) } };
}

/** Partie mit offener Börse und viel Bargeld (Kapitel 3 vorgezogen). */
function mitBoerse(cash = 20000, seed = 'boerse', b: Balance = balance): GameState {
  return { ...openExchange(newGame(seed, b), b), cash };
}

function setzeEx(state: GameState, ex: Partial<ExchangeState>): GameState {
  return { ...state, exchange: { ...state.exchange!, ...ex } };
}

/** Eine Runde an der Börse, ohne den Rest des Spiels. */
function runde(state: GameState, b: Balance = balance, climate: CreditClimate = NEUTRAL_CLIMATE): GameState {
  return { ...advanceExchange(state, b, climate), round: state.round + 1 };
}

describe('Freischaltung (Kapitel 3)', () => {
  it('in Kapitel 1 gibt es keine Börse – endRound lässt state.exchange leer', () => {
    let s = newGame('kapitel1', balance);
    for (let i = 0; i < 4; i++) s = endRound(s, balance);
    expect(s.exchange).toBeUndefined();
  });

  it('settleExchange gibt in Kapitel 1 und 2 dasselbe Objekt zurück', () => {
    const s = newGame('kapitel2', balance);
    expect(settleExchange(s, balance)).toBe(s);
    const k2 = { ...s, chapter: 2 } as GameState;
    expect(settleExchange(k2, balance)).toBe(k2);
  });

  it('ab Kapitel balance.exchange.unlockChapter öffnet sich die Börse am Rundenende', () => {
    expect(EB.unlockChapter).toBe(3);
    const s = { ...newGame('kapitel3', balance), chapter: 3 } as GameState;
    const offen = settleExchange(s, balance);
    expect(offen.exchange).toBeDefined();
    expect(offen.exchange!.events).toEqual(['opened']);
    expect(Object.keys(offen.exchange!.prices)).toEqual(EB.stocks.map((x) => x.id));
    // Ein Rundenende später bewegen sich die Kurse.
    const weiter = settleExchange({ ...offen, round: offen.round + 1 }, balance);
    expect(weiter.exchange!.events).not.toContain('opened');
    expect(weiter.exchange!.history[EB.stocks[0].id]).toHaveLength(2);
  });

  it('endRound in Kapitel 3: erst öffnet sich die Börse, dann laufen Kurse und Zwangsverkäufe vor der Pleiteprüfung', () => {
    const k3 = { ...newGame('endRound-k3', balance), chapter: 3 } as GameState;
    const r1 = endRound(k3, balance);
    expect(r1.exchange?.events).toEqual(['opened']);
    // Ein Kauf mit vollem Hebel, dann kracht der Weltmarkt (4.4): Das Minus landet in der Pleiteprüfung.
    const gekauft = buyStock({ ...r1, cash: 5000 }, balance, 'motorwagen', 5000, 10);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    const krach: GameState = { ...gekauft.state, worldModel: { ...gekauft.state.worldModel, credit: 30, crash: 3 } };
    const r2 = endRound(krach, balance);
    expect(r2.exchange!.events).toContain('crash');
    expect(r2.exchange!.events).toContain('liquidated');
    expect(r2.cash).toBeLessThan(0);
    expect(r2.bankruptcyDeadline).toBeGreaterThan(0);
  });

  it('chapterOf liest state.chapter, sonst Kapitel 1', () => {
    expect(chapterOf({})).toBe(1);
    expect(chapterOf({ chapter: 3 })).toBe(3);
    expect(chapterOf({ chapter: 'drei' })).toBe(1);
  });

  it('die Börse würfelt mit eigenem Zufall: Karte und Spielzufall bleiben gleich', () => {
    const s = newGame('eigenerZufall', balance);
    const offen = openExchange(s, balance);
    expect(offen.rng).toBe(s.rng);
    expect(offen.exchange!.rng).not.toBe(s.rng);
    const a = runde(offen);
    const b = runde(offen);
    expect(a.exchange).toEqual(b.exchange);
  });
});

describe('Kreditklima (4.4-Schnittstelle)', () => {
  it('readClimate liest das Weltmodell des Spielstands (state.worldModel aus 4.1)', () => {
    const s = newGame('klima', balance);
    expect(readClimate(s)).toEqual({ credit: s.worldModel.credit, crash: s.worldModel.crash });
    expect(readClimate({ worldModel: { ...s.worldModel, credit: 72, crash: 2 } })).toEqual({ credit: 72, crash: 2 });
  });

  it('ohne Weltmodell (alte Teststände) gilt das neutrale Klima', () => {
    expect(readClimate({})).toEqual(NEUTRAL_CLIMATE);
    expect(readClimate({ worldModel: { credit: Number.NaN, crash: 0 } })).toEqual(NEUTRAL_CLIMATE);
  });

  it('mit echtem newGame(): worldModel.credit treibt Börsenfieber und Maklerzins', () => {
    const s = setzeEx(mitBoerse(50000, 'echt'), { fever: 50 });
    const gekauft = buyStock(s, balance, 'thorne_bahn', 10000, 5);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    const mitKlima = (credit: number): GameState => ({ ...gekauft.state, worldModel: { ...gekauft.state.worldModel, credit, crash: 0 } });
    const normal = settleExchange(mitKlima(50), balance);
    const heiss = settleExchange(mitKlima(70), balance);
    expect(heiss.exchange!.fever - normal.exchange!.fever).toBeCloseTo(EB.fever.climate * 20, 6);
    // Gleiche Kurse und Dividenden, nur der Zins unterscheidet sich: heißes Klima, teures Geld.
    const zinsDiff = (40000 * (marginRate(EB, { credit: 70, crash: 0 }) - marginRate(EB, NEUTRAL_CLIMATE))) / 4;
    expect(zinsDiff).toBeGreaterThan(0);
    expect(normal.cash - heiss.cash).toBeCloseTo(zinsDiff, 1);
  });

  it('der Maklerzins steigt mit dem Kreditklima', () => {
    expect(marginRate(EB, NEUTRAL_CLIMATE)).toBeCloseTo(EB.margin.rate);
    expect(marginRate(EB, { credit: 100, crash: 0 })).toBeCloseTo(EB.margin.rate + EB.margin.rateClimate);
    expect(marginRate(EB, { credit: 0, crash: 0 })).toBeCloseTo(Math.max(0, EB.margin.rate - EB.margin.rateClimate));
  });

  it('ein heißes Kreditklima heizt das Börsenfieber an', () => {
    const s = setzeEx(mitBoerse(), { fever: 50 });
    const kalt = runde(s, balance, { credit: 50, crash: 0 }).exchange!.fever;
    const heiss = runde(s, balance, { credit: 80, crash: 0 }).exchange!.fever;
    expect(heiss - kalt).toBeCloseTo(EB.fever.climate * 30, 6);
  });

  it('ein neuer Crash im Weltmodell reißt die Börse sofort mit – auch ohne Warnung', () => {
    const s = setzeEx(mitBoerse(), { fever: 50, warned: 0 });
    const n = runde(s, balance, { credit: 40, crash: 3 });
    expect(n.exchange!.events).toContain('crash');
    expect(n.exchange!.crash).toBeGreaterThan(0);
    expect(n.exchange!.lastClimateCrash).toBe(3);
    // Derselbe Weltcrash löst danach keinen zweiten Börsencrash aus.
    const danach = runde(setzeEx(n, { crash: 0 }), balance, { credit: 40, crash: 2 });
    expect(danach.exchange!.events).not.toContain('crash');
  });

  it('nur ein Kreditcrash: kracht die Börse aus eigenem Fieber, kracht auch das Weltmodell', () => {
    const sicher = mit((eb) => ({ crash: { ...eb.crash, chance: 1, minWarnings: 1 } }));
    const start = setzeEx(mitBoerse(10000, 'boerse', sicher), { fever: 95, warned: 1, events: [] });
    const s: GameState = { ...start, worldModel: { ...start.worldModel, credit: 70, crash: 0, news: [] } };
    const n = settleExchange(s, sicher);
    expect(n.exchange!.events).toContain('crash');
    const w = n.worldModel;
    const c = balance.worldModel.credit;
    expect(w.crash).toBe(Math.min(c.rounds.max, Math.max(c.rounds.min, n.exchange!.crash)));
    expect(w.credit).toBeCloseTo(70 * c.after, 6);
    expect(w.news).toContain('crash');
    expect(w.counts.crashes).toBe(s.worldModel.counts.crashes + 1);
    // Die Welt spürt ihn: weniger Nachfrage, teureres Bankgeld.
    expect(effectiveDemand(w, balance.worldModel)).toBeLessThan(effectiveDemand(s.worldModel, balance.worldModel));
    expect(worldRateAdd(w, balance.worldModel)).toBeGreaterThan(worldRateAdd(s.worldModel, balance.worldModel));
    // Derselbe Crash zählt nicht doppelt: Die Börse kennt den Weltcrash schon.
    expect(n.exchange!.lastClimateCrash).toBe(w.crash);
    const danach = settleExchange({ ...n, round: n.round + 1 }, sicher);
    expect(danach.exchange!.crashes).toBe(1);
    expect(danach.worldModel.counts.crashes).toBe(w.counts.crashes);
  });

  it('läuft schon ein Weltcrash, ändert ein Börsencrash das Weltmodell nicht', () => {
    const sicher = mit((eb) => ({ crash: { ...eb.crash, chance: 1, minWarnings: 1 } }));
    const start = setzeEx(mitBoerse(10000, 'boerse', sicher), { fever: 95, warned: 1, events: [] });
    const s: GameState = { ...start, worldModel: { ...start.worldModel, crash: 3 } };
    const n = settleExchange(s, sicher);
    expect(n.exchange!.events).toContain('crash');
    expect(n.worldModel).toBe(s.worldModel);
  });

  it('exchangeWorldInput: ohne Börse oder ohne Kredit bleibt der Welt-Input unverändert', () => {
    const input = { extraSupply: 0.01 };
    expect(exchangeWorldInput({}, input)).toBe(input);
    expect(exchangeWorldInput(mitBoerse(), input)).toBe(input);
    const heiss = setzeEx(mitBoerse(), { creditShift: 4 });
    expect(exchangeWorldInput(heiss, { ...input, creditShift: 1 })).toEqual({ extraSupply: 0.01, creditShift: 5 });
  });

  it('Kauf auf Kredit hebt über mehrere Runden das Weltkreditklima messbar an (endRound)', () => {
    // Ohne Crashs (Börse und Welt), ruhiger Markt: Es zählt nur die Hitze aus dem Maklerkredit.
    const ruhig: Balance = {
      ...balance,
      worldModel: { ...balance.worldModel, credit: { ...balance.worldModel.credit, crashChance: 0, crashSlope: 0, priceTrigger: 99 } },
      exchange: {
        ...EB,
        crash: { ...EB.crash, chance: 0, slope: 0 },
        market: { drift: 0.01, boom: 0, noise: 0 },
        sectors: Object.fromEntries(Object.entries(EB.sectors).map(([k, v]) => [k, { ...v, idio: 0 }])) as Balance['exchange']['sectors'],
      },
    };
    const k3 = { ...newGame('kredit-heizt', ruhig), chapter: 3, cash: 500000 } as GameState;
    const offen = endRound(k3, ruhig);
    expect(offen.exchange).toBeDefined();
    // Einsatz × 4 geliehen = genau heatScale: volle Hitze.
    const gekauft = buyStock(offen, ruhig, 'handelsbank', EB.margin.heatScale / 4, 5);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    expect(marginHeat(gekauft.state, EB)).toBe(1);
    let mit = gekauft.state;
    let ohne = offen;
    for (let i = 0; i < 4; i++) {
      mit = endRound(mit, ruhig);
      ohne = endRound(ohne, ruhig);
    }
    expect(mit.exchange!.positions).toHaveLength(1);
    // Die erste Hitze wirkt ab der Folgerunde: drei Runden × creditShift, über 50 schaukelt es sich noch auf.
    expect(mit.worldModel.credit - ohne.worldModel.credit).toBeGreaterThanOrEqual(3 * EB.margin.creditShift - 1e-6);
  });

  it('Kauf auf Kredit heizt Kreditklima und Börsenfieber an (GDD §8)', () => {
    const s = setzeEx(mitBoerse(200000), { fever: 50 });
    const ohne = runde(s);
    const gekauft = buyStock(s, balance, 'crane_trust', EB.margin.heatScale / 9, 10);
    expect(gekauft.ok).toBe(true);
    if (!gekauft.ok) return;
    expect(marginDebt(gekauft.state)).toBeCloseTo(EB.margin.heatScale);
    expect(marginHeat(gekauft.state, EB)).toBe(1);
    const mitKredit = runde(gekauft.state);
    expect(mitKredit.exchange!.creditShift).toBeCloseTo(EB.margin.creditShift);
    expect(ohne.exchange!.creditShift).toBe(0);
    expect(mitKredit.exchange!.fever - ohne.exchange!.fever).toBeCloseTo(EB.fever.margin, 6);
  });
});

describe('Kauf, Verkauf, Nachschuss', () => {
  it('Kauf mit Hebel: Einsatz aus der Kasse, der Rest ist Maklerkredit, Gebühr vom Volumen', () => {
    const s = mitBoerse(5000);
    const r = buyStock(s, balance, 'thorne_bahn', 1000, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.exchange!.positions[0];
    expect(r.state.cash).toBe(4000);
    expect(p.stake).toBe(1000);
    expect(p.loan).toBe(4000);
    expect(p.shares * s.exchange!.prices.thorne_bahn).toBeCloseTo(5000 * (1 - EB.margin.fee));
  });

  it('Kauf scheitert ohne Konto, ohne Geld, unter dem Mindesteinsatz und mit falschem Hebel', () => {
    const ohne = newGame('ohneKonto', balance);
    expect(buyStock(ohne, balance, 'thorne_bahn', 1000, 1).ok).toBe(false);
    const s = mitBoerse(800);
    expect(buyStock(s, balance, 'thorne_bahn', 1000, 1).ok).toBe(false);
    expect(buyStock(s, balance, 'thorne_bahn', EB.margin.minBuy - 1, 1).ok).toBe(false);
    expect(buyStock(s, balance, 'thorne_bahn', 600, 3).ok).toBe(false);
    expect(buyStock(s, balance, 'gibtsnicht', 600, 1).ok).toBe(false);
    expect(buyStock(s, balance, 'thorne_bahn', 600, 1).ok).toBe(true);
  });

  it('Verkauf: Erlös minus Gebühr, zuerst wird der Maklerkredit getilgt', () => {
    const s = mitBoerse(5000);
    const r = buyStock(s, balance, 'thorne_bahn', 1000, 2);
    if (!r.ok) throw new Error(r.reason);
    // Kurs verdoppelt sich.
    const hoch = setzeEx(r.state, { prices: { ...r.state.exchange!.prices, thorne_bahn: s.exchange!.prices.thorne_bahn * 2 } });
    const p = hoch.exchange!.positions[0];
    const v = sellPosition(hoch, balance, p.id);
    if (!v.ok) throw new Error(v.reason);
    const erloes = 2000 * (1 - EB.margin.fee) * 2 * (1 - EB.margin.fee);
    expect(v.state.cash).toBeCloseTo(4000 + erloes - 1000, 1);
    expect(v.state.exchange!.positions).toHaveLength(0);
  });

  it('Nachschuss tilgt den Kredit, erhöht den Einsatz und hebt die Forderung auf', () => {
    const s = mitBoerse(5000);
    const r = buyStock(s, balance, 'thorne_bahn', 1000, 5);
    if (!r.ok) throw new Error(r.reason);
    const p = r.state.exchange!.positions[0];
    const gerufen = setzeEx(r.state, { positions: [{ ...p, called: true }] });
    const t = topUpPosition(gerufen, balance, p.id, 2000);
    if (!t.ok) throw new Error(t.reason);
    const neu = t.state.exchange!.positions[0];
    expect(neu.loan).toBe(2000);
    expect(neu.stake).toBe(3000);
    expect(neu.called).toBe(false);
    expect(t.state.cash).toBe(2000);
    expect(topUpPosition(t.state, balance, p.id, 999999).ok).toBe(false);
  });

  it('Zinsen gehen von der Kasse ab, Dividenden kommen dazu', () => {
    const s = setzeEx(mitBoerse(10000), { fever: 50 });
    const r = buyStock(s, balance, 'handelsbank', 2000, 2);
    if (!r.ok) throw new Error(r.reason);
    const n = runde(r.state);
    const p = n.exchange!.positions[0];
    const zins = (2000 * marginRate(EB, NEUTRAL_CLIMATE)) / 4;
    const dividende = p.shares * n.exchange!.prices.handelsbank * EB.sectors.bank.dividend;
    expect(n.cash).toBeCloseTo(r.state.cash - zins + dividende, 1);
  });

  it('fällt das Eigenkapital unter margin.call × Einsatz, fordert der Makler Nachschuss', () => {
    const s = mitBoerse(10000);
    const r = buyStock(s, balance, 'thorne_bahn', 1000, 5);
    if (!r.ok) throw new Error(r.reason);
    const preis = s.exchange!.prices.thorne_bahn;
    // Kurs so, dass nach der Runde etwa 35 % des Einsatzes übrig sind: zwischen call (50 %) und liquidate (20 %).
    const p = r.state.exchange!.positions[0];
    const ziel = (p.loan + 0.35 * p.stake) / p.shares;
    const ruhig = mit((eb) => ({ market: { drift: 0, boom: 0, noise: 0 }, sectors: { ...eb.sectors, rail: { ...eb.sectors.rail, idio: 0 } } }));
    const vorher = setzeEx(r.state, { fever: 50, prices: { ...r.state.exchange!.prices, thorne_bahn: ziel } });
    const n = runde(vorher, ruhig);
    expect(ziel).toBeLessThan(preis);
    expect(n.exchange!.positions[0].called).toBe(true);
    expect(n.exchange!.events).toContain('call');
  });
});

describe('Börsenfieber, Warnung und Crash', () => {
  it('die Zeitung warnt ab warnFrom oder bei heißem Kreditklima, nie mitten im Crash', () => {
    const ex = newExchange('w', 1, EB);
    expect(exchangeWarning({ ...ex, fever: EB.warnFrom - 1 }, EB)).toBe(false);
    expect(exchangeWarning({ ...ex, fever: EB.warnFrom }, EB)).toBe(true);
    expect(exchangeWarning({ ...ex, fever: 50 }, EB, { credit: EB.warnCredit, crash: 0 })).toBe(true);
    expect(exchangeWarning({ ...ex, fever: 99, crash: 2 }, EB)).toBe(false);
    expect(exchangeHeadline({ ...ex, events: [], fever: EB.warnFrom }, EB)).toBe('warning');
    expect(exchangeHeadline({ ...ex, events: [], fever: EB.alarmFrom }, EB)).toBe('alarm');
    expect(exchangeHeadline({ ...ex, events: [], fever: EB.boomFrom }, EB)).toBe('boom');
    expect(exchangeHeadline({ ...ex, events: [], fever: EB.gloomTo }, EB)).toBe('gloom');
    expect(exchangeHeadline({ ...ex, events: [], fever: 50 }, EB)).toBe('quiet');
    expect(exchangeHeadline({ ...ex, events: ['crash'], crash: 2 }, EB)).toBe('crash');
    expect(exchangeHeadline({ ...ex, events: [], crash: 2 }, EB)).toBe('slump');
    expect(exchangeHeadline({ ...ex, events: ['recovery'], fever: 30 }, EB)).toBe('recovery');
  });

  it('ohne crash.minWarnings Runden Warnung kein Crash aus dem Fieber – selbst bei sicherem Wurf', () => {
    const sicher = mit((eb) => ({ crash: { ...eb.crash, chance: 1, minWarnings: 2 } }));
    let s = setzeEx(mitBoerse(10000, 'boerse', sicher), { fever: 100, warned: 0, events: [] });
    s = runde(s, sicher);
    expect(s.exchange!.events).not.toContain('crash');
    expect(s.exchange!.warned).toBe(1);
    s = runde(setzeEx(s, { fever: 100 }), sicher);
    expect(s.exchange!.events).toContain('crash');
    expect(s.exchange!.crashes).toBe(1);
    expect(s.exchange!.fever).toBeLessThan(100 * EB.crash.after + 1e-9);
  });

  it('gezählt wird nur die Warnung, die zu Rundenbeginn in der Zeitung stand (endRound mit echtem Weltmodell)', () => {
    // Zu Rundenbeginn: Börse ruhig, Kreditklima normal – die Zeitung warnt nicht.
    const k3 = { ...newGame('warnung-sichtbar', balance), chapter: 3 } as GameState;
    const offen = endRound(k3, balance);
    // Jacobs Maklerkredit der letzten Runde (creditShift) heizt das Weltklima in diesem Rundenende über warnCredit.
    const start: GameState = {
      ...setzeEx(offen, { fever: 50, warned: 0, events: [], creditShift: EB.warnCredit - 50 + 8 }),
      worldModel: { ...offen.worldModel, credit: 50, crash: 0 },
    };
    expect(exchangeHeadline(start.exchange!, EB, readClimate(start))).toBe('quiet');
    const n = endRound(start, balance);
    // Das Klima ist im Rundenende über die Warnschwelle gestiegen (ohne Crash) …
    expect(n.worldModel.credit).toBeGreaterThanOrEqual(EB.warnCredit);
    expect(n.worldModel.crash).toBe(0);
    // … gezählt wird trotzdem keine Warnung, denn in der Zeitung stand keine.
    expect(n.exchange!.warned).toBe(0);
    // Erst die nächste Zeitung warnt – und die zählt.
    expect(WARNING_HEADLINES).toContain(exchangeHeadline(n.exchange!, EB, readClimate(n)));
    expect(settleExchange(n, balance).exchange!.warned).toBe(1);
  });

  it('unter crash.from kracht es nie, auch nach langer Warnung', () => {
    const sicher = mit((eb) => ({ crash: { ...eb.crash, chance: 1 } }));
    const s = setzeEx(mitBoerse(10000, 'boerse', sicher), { fever: EB.crash.from - 0.5, warned: 10 });
    expect(runde(s, sicher, NEUTRAL_CLIMATE).exchange!.events).not.toContain('crash');
  });

  it('ein Crash stürzt die Kurse um crash.drop × Beta und wirkt crash.rounds nach', () => {
    const sicher = mit((eb) => ({
      crash: { ...eb.crash, chance: 1, minWarnings: 1 },
      sectors: Object.fromEntries(Object.entries(eb.sectors).map(([k, v]) => [k, { ...v, idio: 0 }])) as Balance['exchange']['sectors'],
    }));
    const s = setzeEx(mitBoerse(10000, 'boerse', sicher), { fever: 95 });
    const n = runde(s, sicher);
    const ex = n.exchange!;
    expect(ex.events).toContain('crash');
    const sturz = 1 - ex.index / s.exchange!.index;
    expect(sturz).toBeGreaterThanOrEqual(EB.crash.drop.min - 1e-9);
    expect(sturz).toBeLessThanOrEqual(EB.crash.drop.max + 1e-9);
    expect(1 - ex.prices.motorwagen / s.exchange!.prices.motorwagen).toBeCloseTo(Math.min(1, EB.sectors.auto.beta * sturz), 2);
    expect(ex.crash).toBeGreaterThanOrEqual(EB.crash.rounds.min);
    expect(ex.crash).toBeLessThanOrEqual(EB.crash.rounds.max);
    // Er wirkt nach, dann kommt die Erholung.
    let t = n;
    for (let i = 0; i < ex.crash; i++) t = runde(t, sicher);
    expect(t.exchange!.crash).toBe(0);
    expect(t.exchange!.events).toContain('recovery');
  });

  it('über 50 schaukelt sich das Fieber auf, unter 50 zieht es zurück', () => {
    const still = mit((eb) => ({ market: { drift: 0, boom: 0, noise: 0 }, fever: { ...eb.fever, noise: 0 } }));
    const hoch = runde(setzeEx(mitBoerse(), { fever: 70 }), still).exchange!.fever;
    const tief = runde(setzeEx(mitBoerse(), { fever: 30 }), still).exchange!.fever;
    expect(hoch).toBeGreaterThan(70);
    expect(tief).toBeGreaterThan(30);
  });
});

/**
 * „Fertig, wenn“ (Roadmap 4.15): Ein Crash kann Aktienkäufe auf Kredit
 * ruinieren, und die Zeitung warnt vorher.
 */
describe('Roadmap 4.15: Crash ruiniert Kauf auf Kredit, die Zeitung warnt vorher', () => {
  /** Spielt die Börse Runde für Runde und merkt sich die Schlagzeile zu Beginn jeder Runde. */
  function bisZumCrash(start: GameState, maxRunden = 40): { state: GameState; schlagzeilen: string[]; vorher: GameState } {
    let s = start;
    const schlagzeilen: string[] = [];
    for (let i = 0; i < maxRunden; i++) {
      schlagzeilen.push(exchangeHeadline(s.exchange!, EB, readClimate(s)));
      const vorher = s;
      s = checkBankruptcy(runde(s, balance, readClimate(s)), balance);
      if (s.exchange!.events.includes('crash')) return { state: s, schlagzeilen, vorher };
    }
    throw new Error('kein Crash');
  }

  it('Jacob kauft mit zehnfachem Hebel im Boom – der Crash frisst Einsatz und Kasse', () => {
    // Boom: Die Börse ist heiß (wie nach einem langen Aufschwung), Jacob hat 10.000 $.
    const boom = setzeEx(mitBoerse(10000, 'schwarzer-tag'), { fever: 76, warned: 0, events: [] });
    const gekauft = buyStock(boom, balance, 'motorwagen', 8000, 10);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    expect(gekauft.state.cash).toBe(2000);

    const { state, schlagzeilen, vorher } = bisZumCrash(gekauft.state);
    // Die Zeitung hat vor dem Crash gewarnt: in den letzten crash.minWarnings Ausgaben vor dem Krach.
    const letzte = schlagzeilen.slice(-EB.crash.minWarnings);
    expect(letzte).toHaveLength(EB.crash.minWarnings);
    for (const h of letzte) expect(WARNING_HEADLINES).toContain(h);
    // Der Kauf auf Kredit stand bis zum Crash (sonst wäre er nicht vom Crash ruiniert worden).
    expect(vorher.exchange!.positions).toHaveLength(1);

    // Der Makler hat zwangsverkauft, der Erlös deckt den Kredit nicht: Jacob zahlt aus der Kasse – ins Minus.
    expect(state.exchange!.positions).toHaveLength(0);
    expect(state.exchange!.events).toContain('liquidated');
    expect(state.exchange!.liquidated[0].shortfall).toBeGreaterThan(0);
    expect(state.cash).toBeLessThan(0);
    // Verloren hat er mehr als den Einsatz: Einsatz weg und die Kasse im Minus.
    expect(gekauft.state.cash + 8000 - state.cash).toBeGreaterThan(8000);
    // Die Pleiteprüfung greift: Ohne Kreditrahmen läuft die Frist der Bank.
    expect(state.bankruptcyDeadline).toBeGreaterThan(0);
  });

  it('derselbe Crash ohne Kredit kostet nur einen Teil des Einsatzes', () => {
    // 4.20: Ohne Jacobs Kredit heizt sich die Börse langsamer auf (speculation 0,09) – deshalb etwas heißer starten.
    const boom = setzeEx(mitBoerse(10000, 'schwarzer-tag'), { fever: 86, warned: 0, events: [] });
    const gekauft = buyStock(boom, balance, 'motorwagen', 8000, 1);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    const { state } = bisZumCrash(gekauft.state);
    expect(state.exchange!.positions).toHaveLength(1);
    expect(state.cash).toBeGreaterThanOrEqual(2000);
    expect(exchangeEquity(state)).toBeGreaterThan(0);
  });

  it('wer die Warnung liest und rechtzeitig verkauft, steht im Crash ohne Schulden da', () => {
    const boom = setzeEx(mitBoerse(10000, 'schwarzer-tag'), { fever: 76, warned: 0, events: [] });
    const gekauft = buyStock(boom, balance, 'motorwagen', 8000, 10);
    if (!gekauft.ok) throw new Error(gekauft.reason);
    let s = gekauft.state;
    // Jacob verkauft, sobald die Zeitung warnt – vor dem Rundenende.
    for (let i = 0; i < 40; i++) {
      if (WARNING_HEADLINES.includes(exchangeHeadline(s.exchange!, EB)) && s.exchange!.positions.length > 0) {
        const v = sellPosition(s, balance, s.exchange!.positions[0].id);
        if (!v.ok) throw new Error(v.reason);
        s = v.state;
      }
      s = runde(s);
      if (s.exchange!.events.includes('crash')) break;
    }
    expect(s.exchange!.crashes).toBe(1);
    expect(s.exchange!.positions).toHaveLength(0);
    expect(s.cash).toBeGreaterThan(0);
  });
});

describe('Spielstand und Zahlen', () => {
  it('validExchange: fehlend ist gültig, kaputt nicht', () => {
    expect(validExchange(undefined)).toBe(true);
    const ex = newExchange('s', 1, EB);
    expect(validExchange(ex)).toBe(true);
    expect(validExchange(JSON.parse(JSON.stringify(ex)))).toBe(true);
    expect(validExchange({ ...ex, fever: Number.NaN })).toBe(false);
    expect(validExchange({ ...ex, positions: [{ id: 1, stock: 'x' }] })).toBe(false);
    expect(validExchange({ ...ex, events: ['boom'] })).toBe(false);
  });

  it('positionEquity: Wert minus Kredit, darf negativ werden', () => {
    const ex = newExchange('s', 1, EB);
    const p = { id: 1, stock: 'thorne_bahn', shares: 10, stake: 100, loan: 2000, round: 1, called: false };
    expect(positionEquity(ex, p)).toBeCloseTo(10 * ex.prices.thorne_bahn - 2000);
  });

  it('balance.yaml: die Warnung muss vor dem Crash liegen können', () => {
    const raw = rawBalance() as { exchange: Record<string, unknown> };
    expect(() => parseExchangeBalance(raw)).not.toThrow();
    expect(() => parseExchangeBalance({ exchange: { ...raw.exchange, warnFrom: 90 } })).toThrow(/warnFrom/);
    expect(() => parseExchangeBalance({ exchange: { ...raw.exchange, margin: { ...(raw.exchange.margin as object), leverages: [1, 20] } } })).toThrow(/leverages/);
    expect(() => parseExchangeBalance({})).toThrow(/exchange/);
  });
});
