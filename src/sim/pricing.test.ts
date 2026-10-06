// Termine als Hauptwerkzeug, Etappe 2: Preis-Aktionen (Plan 2.1, 2.2, Tests 2.6 „Preis“).
import { knowAll } from './network';
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import type { Well } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { computePrice, neighbourSupply, rivalSupply } from './market';
import { bookCard, planView, settlePlans } from './plans';
import {
  cartelShare,
  cheatChance,
  contractPrice,
  cranePoints,
  cranePressure,
  craneResistance,
  exposeChance,
  foundCartel,
  haggleCrane,
  holdOutlook,
  marketMods,
  newPricing,
  PRICING_MARKS,
  rumourShock,
  rumourShockNow,
  settlePricing,
  settlePricingAfterMarket,
  spreadRumour,
  throttleFactor,
  type CartelState,
} from './pricing';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { craneCut, jacobPrice, RIVAL_MARKS } from './trust';
import { buyerCapacityLeft, buyerPrice, sellOil } from './transport';

const balance = loadBalance();

/** 0.4.20+42: Preis-Karten der Ölleute – alle Stellen gelten als bekannt. */
function neuesSpiel(seed: string): GameState {
  return { ...newGame(seed, balance, katalog), network: knowAll(balance) };
}
const katalog = loadEvents();
const PA = balance.priceActions;

function ok(r: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Ein Spiel mit einer fördernden Quelle auf einer echten ölführenden Ranch und vollem Tank. */
function mitQuelle(seed: string, rate = 8000, tank = 12000): GameState {
  const s = neuesSpiel(seed);
  const p = s.parcels.find((x) => !x.discovery && x.geology !== 'dry')!;
  const well: Well = { id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, result: 'small', production: { initialRate: rate, lastRate: rate, total: 0, roundsProduced: 1 }, startRound: 1 };
  return { ...s, wells: [well], oilStock: tank, cash: 5000 };
}

/** Eine laufende Förderbremse mit allen Wildcattern (ab dieser Runde). */
function mitBremse(s: GameState, patch: Partial<CartelState> = {}): GameState {
  const cartel: CartelState = {
    since: s.round,
    until: s.round + PA.cartel.rounds - 1,
    members: s.wildcatters.firms.map((f) => f.name),
    jacobCut: PA.cartel.cut,
    organizer: false,
    heldRound: s.round,
    bullard: 'out',
    bullardAsked: false,
    bullardFullRound: 0,
    bullardBreakRound: 0,
    cheaters: [],
    cheatShare: 0,
    confronted: [],
    suspect: null,
    ...patch,
  };
  return { ...s, pricing: { ...s.pricing, cartel } };
}

function mitPreis(b: Balance, patch: (p: Balance['priceActions']) => void): Balance {
  const pa = structuredClone(b.priceActions);
  patch(pa);
  return { ...b, priceActions: pa };
}

describe('Markt-Kern (Plan 2.1)', () => {
  it('Kapitel 1 rechnet mit Jacobs Verkauf, nicht mit seiner Förderung', () => {
    const s = mitQuelle('markt-verkauf');
    const ohneVerkauf = marketMods(s, balance);
    const nachbarn = neighbourSupply(balance.market, s.round, 0) + rivalSupply(s, balance.rivals.bullard.ratePerWell);
    expect(ohneVerkauf.supply).toBe(nachbarn);
    const verkauft = ok(sellOil(s, balance, 'rail', 5000).ok ? sellOil(s, balance, 'rail', 5000) : sellOil(s, balance, 'wagon', 3000));
    expect(marketMods(verkauft, balance).supply).toBe(nachbarn + verkauft.shipped.rail + verkauft.shipped.wagon);
  });

  it('Zurückhalten hebt den Preis am Rundenende und kostet Lager (holdOutlook)', () => {
    const s = mitQuelle('markt-halten', 8000, 20000);
    const h = holdOutlook(s, balance, 10000);
    expect(h.price).toBeGreaterThan(h.priceAll);
    expect(h.cost).toBeGreaterThan(0);
    expect(holdOutlook(s, balance, 0).price).toBe(h.priceAll);
  });

  it('der verkaufte Bestand der Runde landet am Rundenende in pricing.sold', () => {
    const s = ok(sellOil(mitQuelle('markt-sold'), balance, 'wagon', 2000));
    expect(settlePricing(s, balance).pricing.sold).toBe(2000);
  });
});

describe('Förderbremse (Plan 2.2)', () => {
  it('die Drossel senkt das Angebot der Nachbarn um Kartellanteil × Drossel × (1 − Betrugsanteil)', () => {
    const s = mitBremse(mitQuelle('bremse-a'));
    const n = neighbourSupply(balance.market, s.round, 0);
    const b = rivalSupply(s, balance.rivals.bullard.ratePerWell);
    expect(cartelShare(s)).toBe(1);
    expect(marketMods(s, balance).supply).toBeCloseTo(n * (1 - PA.cartel.cut) + b, 6);
    const betrug = { ...s, pricing: { ...s.pricing, cartel: { ...s.pricing.cartel!, cheatShare: 0.25 } } };
    expect(marketMods(betrug, balance).supply).toBeCloseTo(n * (1 - PA.cartel.cut * 0.75) + b, 6);
  });

  it('Jacob drosselt seine Förderung mit (ehrlich 20 %, Organisatoren-Klausel 10 %)', () => {
    expect(throttleFactor(mitBremse(mitQuelle('bremse-j')))).toBeCloseTo(1 - PA.cartel.cut, 9);
    expect(throttleFactor(mitBremse(mitQuelle('bremse-j'), { jacobCut: PA.cartel.organizerCut, organizer: true }))).toBeCloseTo(1 - PA.cartel.organizerCut, 9);
    expect(throttleFactor(mitQuelle('bremse-j'))).toBe(1);
  });

  it('Betrug: 0,05 + 0,03 je Runde + 0,10 ungehalten + 0,05 Klausel + 0,15 nach Bullards Auffahren; zur Rede gestellt 0', () => {
    const s0 = mitBremse(mitQuelle('betrug'), { since: 1, heldRound: 1 });
    const s = { ...s0, round: 3 };
    const m = s.pricing.cartel!.members[0];
    const ch = PA.cartel.cheat;
    expect(cheatChance(s, balance, m)).toBeCloseTo(ch.base + 2 * ch.perRound + ch.unheld, 9);
    const gehalten = { ...s, pricing: { ...s.pricing, cartel: { ...s.pricing.cartel!, heldRound: 3, organizer: true, bullardFullRound: 2 } } };
    expect(cheatChance(gehalten, balance, m)).toBeCloseTo(ch.base + 2 * ch.perRound + PA.cartel.organizerCheat + ch.bullardFull, 9);
    const ermahnt = { ...s, pricing: { ...s.pricing, cartel: { ...s.pricing.cartel!, confronted: [m] } } };
    expect(cheatChance(ermahnt, balance, m)).toBe(0);
  });

  it('bricht mehr als ein Drittel der Kartellquellen, platzt der Pakt: Bann, Ruf −0,2, Nachbarn +10 %', () => {
    const alleBetruegen = mitPreis(balance, (p) => (p.cartel.cheat.base = 1));
    const s = { ...mitBremse(mitQuelle('platzt'), { since: 1 }), round: 2 };
    const n = settlePricing(s, alleBetruegen);
    expect(n.pricing.cartel).toBeNull();
    expect(n.pricing.collapsed).toBe(1);
    expect(n.pricing.cartelBanUntil).toBe(2 + PA.cartel.banRounds);
    expect(n.wildcatterStanding).toBeCloseTo(PA.standing.collapse, 9);
    expect(n.events.marks[PRICING_MARKS.collapse]).toBe(2);
    const nachbarn = neighbourSupply(balance.market, 2, 0);
    expect(marketMods(n, alleBetruegen).supply).toBeCloseTo(nachbarn * (1 + PA.cartel.collapseBoost) + rivalSupply(n, balance.rivals.bullard.ratePerWell), 6);
    // Niemand betrügt: Der Pakt hält.
    const ehrlich = mitPreis(balance, (p) => ((p.cartel.cheat.base = 0), (p.cartel.cheat.perRound = 0), (p.cartel.bullard.full = 0)));
    expect(settlePricing(s, ehrlich).pricing.cartel).not.toBeNull();
  });

  it('ein einzelner kleiner Betrüger unter einem Drittel: Pakt hält, Verdacht und Brief-Merkzeichen', () => {
    const s0 = mitQuelle('verdacht');
    const firms = s0.wildcatters.firms.map((f, i) => ({ ...f, wells: i === 0 ? 1 : 10 }));
    const s = { ...mitBremse({ ...s0, wildcatters: { ...s0.wildcatters, firms } }, { since: 1, members: firms.map((f) => f.name), confronted: firms.slice(1).map((f) => f.name) }), round: 2 };
    const n = settlePricing(s, mitPreis(balance, (p) => ((p.cartel.cheat.base = 1), (p.cartel.bullard.full = 0))));
    expect(n.pricing.cartel?.cheaters).toEqual([firms[0].name]);
    expect(n.pricing.cartel?.suspect).toBe(firms[0].name);
    expect(n.events.marks[PRICING_MARKS.suspect]).toBe(2);
    // Zur Rede stellen: ab jetzt betrügt er nicht mehr.
    const karte = ok(bookCard({ ...n, plans: { round: 2, booked: [], report: [] } }, balance, katalog, 'zur_rede'));
    const danach = settlePlans(karte, balance);
    expect(danach.pricing.cartel?.confronted).toContain(firms[0].name);
  });

  it('Bullard drinnen drosselt mit (× 0,8), beim Bruch fördert er × 1,5', () => {
    const s = mitBremse(mitQuelle('bullard-drin'), { bullard: 'in', bullardAsked: true });
    const b = { ...s, rival: { ...s.rival, wells: [{ parcelId: 'x', startRound: 1, roundsLeft: 0, status: 'found' as const, rate: 4000 }] } };
    const n = neighbourSupply(balance.market, b.round, 0) * (1 - PA.cartel.cut);
    expect(marketMods(b, balance).supply).toBeCloseTo(n + 4000 * (1 - PA.cartel.cut), 6);
    const bruch = { ...b, pricing: { ...b.pricing, cartel: { ...b.pricing.cartel!, bullardBreakRound: b.round } } };
    expect(marketMods(bruch, balance).supply).toBeCloseTo(n + 4000 * PA.cartel.bullard.breakFactor, 6);
  });

  it('Bullard draußen fährt mit 20 % voll auf – die Betrugschance aller steigt in der Folgerunde', () => {
    const immer = mitPreis(balance, (p) => ((p.cartel.bullard.full = 1), (p.cartel.cheat.base = 0), (p.cartel.cheat.perRound = 0)));
    const s = { ...mitBremse(mitQuelle('bullard-aus'), { since: 1 }), round: 2 };
    const n = settlePricing(s, immer);
    expect(n.pricing.cartel?.bullardFullRound).toBe(2);
    const m = n.pricing.cartel!.members[0];
    expect(cheatChance({ ...n, round: 3 }, immer, m)).toBeCloseTo(immer.priceActions.cartel.cheat.unheld + immer.priceActions.cartel.cheat.bullardFull, 9);
  });

  it('Gründung über das Brett: Beitritt je Firma aus dem eigenen Strang, gleicher Seed ⇒ gleiche Mitglieder, Weltzufall unberührt', () => {
    const s = mitQuelle('gruendung');
    const a = foundCartel(s, balance, false);
    const b = foundCartel(s, balance, false);
    expect(a.pricing.cartel?.members).toEqual(b.pricing.cartel?.members);
    expect(a.rng).toBe(s.rng);
    expect(a.events.rng).toBe(s.events.rng);
    // Ruf wirkt auf den Beitritt: verbrannt ⇒ höchstens die Untergrenze.
    const verbrannt = foundCartel({ ...s, wildcatterStanding: -0.3 }, mitPreis(balance, (p) => (p.cartel.join.min = 0)), false);
    expect((verbrannt.pricing.cartel?.members.length ?? 0)).toBeLessThanOrEqual(a.pricing.cartel?.members.length ?? 0);
  });

  it('Förderbremse am Rundenende: Der Preis der Folgerunde steigt gegenüber derselben Runde ohne Bremse', () => {
    const s = mitQuelle('bremse-preis', 6000, 0);
    const gebucht = ok(bookCard(s, balance, katalog, 'foerderbremse', 'ehrlich'));
    const mit = endRound(gebucht, balance, katalog);
    const ohne = endRound(s, balance, katalog);
    if (mit.pricing.founded === 1 && cartelShare(mit) > 0) {
      expect(mit.postedPrice).toBeGreaterThan(ohne.postedPrice);
      expect(mit.pricing.effect?.cartel).toBe(true);
      expect(mit.plans.report.join(' ')).toMatch(/Förderbremse/);
    }
  });

  it('steigt der Preis über 1,15 × Trendpreis, zahlt Crane Jacob ab der nächsten Runde den Abschlag', () => {
    const s = mitBremse(mitQuelle('crane-schlag'));
    const mods = marketMods(s, balance);
    const teuer = { ...s, postedPrice: 1.5 };
    const n = settlePricingAfterMarket(teuer, balance, mods, 1);
    expect(n.pricing.cranePunish).toEqual({ from: s.round + 1, until: s.round + balance.rivals.crane.cutRounds, value: balance.rivals.crane.priceCut });
    expect(craneCut({ ...n, round: s.round + 1 }, balance)).toBeCloseTo(balance.rivals.crane.priceCut, 9);
    const billig = settlePricingAfterMarket({ ...s, postedPrice: 1.0 }, balance, mods, 1);
    expect(billig.pricing.cranePunish).toBeNull();
  });

  it('Kartellgesetz in Kraft: Verfahren, Strafe, Pakt aufgelöst', () => {
    const s0 = { ...mitBremse(mitQuelle('kartellgesetz'), { since: 1 }), round: 2 };
    const laws = { ...s0.worldModel.laws, bills: { ...s0.worldModel.laws.bills, antitrust: { ...s0.worldModel.laws.bills.antitrust, stage: 'passed' as const } } };
    const s = { ...s0, worldModel: { ...s0.worldModel, laws } };
    const n = settlePricing(s, mitPreis(balance, (p) => (p.cartel.antitrust.chance = 1)));
    expect(n.pricing.cartel).toBeNull();
    expect(n.cash).toBe(s.cash - PA.cartel.antitrust.fine);
    expect(n.pricing.courtRound).toBe(2);
  });

  it('Laufzeit vorbei: Der Pakt endet; hat er 4 Runden gehalten, steigt der Ruf', () => {
    const s = { ...mitBremse(mitQuelle('auslauf'), { since: 1, until: 4 }), round: 4 };
    const n = settlePricingAfterMarket(s, balance, marketMods(s, balance), 1);
    expect(n.pricing.cartel).toBeNull();
    expect(n.wildcatterStanding).toBeCloseTo(PA.standing.held, 9);
  });
});

describe('Liefervertrag (Plan 2.2)', () => {
  it('Festpreis = Posted Price + 0,10 − 0,02 × Laufzeit', () => {
    const s = { ...mitQuelle('vertrag-preis'), postedPrice: 0.9 };
    expect(contractPrice(s, balance, 4)).toBeCloseTo(0.9 + PA.contract.premium - 4 * PA.contract.perRound, 9);
    expect(contractPrice(s, balance, 8)).toBeCloseTo(0.9 + PA.contract.premium - 8 * PA.contract.perRound, 9);
  });

  it('Buchen: Vertrag ab der nächsten Runde, Händler zahlt den Festpreis und nimmt die Vertragsmenge', () => {
    const s = mitQuelle('vertrag', 8000, 12000);
    const view = planView(s, balance, katalog).cards.find((c) => c.id === 'liefervertrag')!;
    expect(view.options.length).toBeGreaterThan(0);
    const gebucht = ok(bookCard(s, balance, katalog, 'liefervertrag', '4x3000'));
    const n = endRound(gebucht, balance, katalog);
    expect(n.pricing.contract).toMatchObject({ buyer: 'haendler', qty: 3000, from: s.round + 1, until: s.round + 4 });
    expect(buyerPrice(n, balance, 'trader')).toBe(n.pricing.contract!.price);
    expect(buyerCapacityLeft(n, balance, 'trader')).toBe(3000);
  });

  it('Fehlmenge kostet 0,15 $ je bbl; Cranes Groll läuft Laufzeit + 2 Runden', () => {
    const s0 = mitQuelle('vertrag-strafe');
    const contract = { buyer: 'haendler' as const, qty: 3000, price: 0.9, from: s0.round, until: s0.round + 3, gain: 0 };
    const s = { ...s0, pricing: { ...newPricing(), contract } };
    const n = settlePricing(s, balance);
    expect(n.cash).toBeCloseTo(s.cash - 3000 * PA.contract.shortfall, 6);
    expect(craneCut({ ...s, round: s0.round + 5 }, balance)).toBeCloseTo(balance.transport.trader.grudgeCut, 9);
    expect(craneCut({ ...s, round: s0.round + 6 }, balance)).toBe(0);
  });

  it('Bankpanik: Der Händler geht pleite, die laufende Runde bleibt unbezahlt', () => {
    const s0 = mitQuelle('vertrag-pleite');
    const contract = { buyer: 'haendler' as const, qty: 2000, price: 1, from: s0.round, until: s0.round + 3, gain: 0 };
    const verkauft = ok(sellOil({ ...s0, pricing: { ...newPricing(), contract } }, balance, 'wagon', 2000, 'trader'));
    const krise = { ...verkauft, worldModel: { ...verkauft.worldModel, news: ['panic' as const] } };
    const n = settlePricing(krise, mitPreis(balance, (p) => (p.contract.failChance = 1)));
    expect(n.pricing.contract).toBeNull();
    expect(n.cash).toBeCloseTo(krise.cash - 2000, 6);
    expect(n.events.marks[PRICING_MARKS.traderBust]).toBe(s0.round);
  });
});

describe('Gerüchte (Plan 2.2)', () => {
  it('Abnutzung: jedes weitere Gerücht wirkt × 0,6; Entlarvung 20 % + 15 % je früheres', () => {
    const s = mitQuelle('geruecht');
    expect(rumourShock(s, balance, 'versiegen')).toBeCloseTo(PA.rumour.dry.shock, 9);
    const zwei = { ...s, pricing: { ...s.pricing, rumours: { ...s.pricing.rumours, count: 2 } } };
    expect(rumourShock(zwei, balance, 'versiegen')).toBeCloseTo(PA.rumour.dry.shock * PA.rumour.wear ** 2, 4);
    expect(exposeChance(s, balance)).toBeCloseTo(PA.rumour.exposed.base, 9);
    expect(exposeChance(zwei, balance)).toBeCloseTo(PA.rumour.exposed.base + 2 * PA.rumour.exposed.perRumour, 9);
  });

  it('„Quellen versiegen“ schockt den Preis dieser Runde nach oben – nur mit vollem Tank', () => {
    const nie = mitPreis(balance, (p) => ((p.rumour.exposed.base = 0), (p.rumour.exposed.perRumour = 0)));
    const s = mitQuelle('geruecht-voll', 8000, 12000);
    const n = spreadRumour(s, nie, 'versiegen');
    expect(n.pricing.rumours.shock).toEqual({ round: s.round, value: PA.rumour.dry.shock });
    expect(marketMods(n, nie).shock).toBeCloseTo(1 + PA.rumour.dry.shock, 9);
    // Spielspaß K1: Der Schock wirkt rumour.rounds Runden, danach nicht mehr.
    expect(rumourShockNow({ ...n, round: s.round + PA.rumour.rounds - 1 }, nie)).toBeCloseTo(PA.rumour.dry.shock, 9);
    expect(rumourShockNow({ ...n, round: s.round + PA.rumour.rounds }, nie)).toBe(0);
    expect(rumourShockNow({ ...n, round: s.round - 1 }, nie)).toBe(0);
    const leer = spreadRumour({ ...s, oilStock: 1000 }, nie, 'versiegen');
    expect(leer.pricing.rumours.shock).toBeNull();
  });

  it('Spielspaß K1: „Quellen versiegen“ aufgeflogen – der Preis fällt sofort (backlash), nur eine Runde', () => {
    const immer = mitPreis(balance, (p) => (p.rumour.exposed.base = 1));
    const s = mitQuelle('geruecht-rueck', 8000, 12000);
    const n = spreadRumour(s, immer, 'versiegen');
    expect(n.pricing.rumours.exposedRound).toBe(s.round);
    expect(n.pricing.rumours.shock).toEqual({ round: s.round, value: PA.rumour.exposed.backlash });
    expect(marketMods(n, immer).shock).toBeCloseTo(1 + PA.rumour.exposed.backlash, 9);
    expect(rumourShockNow({ ...n, round: s.round + 1 }, immer)).toBe(0);
    expect(n.log.at(-1)).toMatch(/Preis fällt sofort/);
    expect(n.pricing.cranePunish).not.toBeNull();
  });

  it('aufgeflogen: Nora verbrannt, Crane-Abschlag, Ruf −0,1; beim Bullard-Gerücht Fehde', () => {
    const immer = mitPreis(balance, (p) => (p.rumour.exposed.base = 1));
    const s = mitQuelle('geruecht-auf');
    const n = spreadRumour(s, immer, 'riesenfund');
    expect(n.pricing.noraBurned).toBe(true);
    expect(n.pricing.rumours.shock).toBeNull();
    expect(n.pricing.cranePunish).not.toBeNull();
    expect(n.wildcatterStanding).toBeCloseTo(PA.standing.exposed, 9);
    expect(n.events.marks[RIVAL_MARKS.bullardFeud]).toBe(s.round);
  });
});

describe('Mit Crane feilschen (Plan 2.2)', () => {
  /** Stufen wie im Plan: Cranes Laune neutral, kein Grund-Gegendruck (Spielspaß K1 kommt unten dazu). */
  const PLAN = mitPreis(balance, (p) => ((p.crane.mood = { down: 0, up: 0 }), (p.crane.resistance = { ...p.crane.resistance, base: 0 })));
  it('ohne Druckmittel ist die Karte gesperrt – mit Grund', () => {
    const s = { ...mitQuelle('crane-null', 1000, 0), logistics: { ...newGame('x', balance).logistics } };
    expect(cranePressure(s, balance)).toBe(0);
    expect(planView(s, balance, katalog).cards.find((c) => c.id === 'crane_feilschen')?.reason).toBe('Kein Druckmittel gegen Crane.');
  });

  it('Punkte: Tank ab 10.000 (+1), Förderbremse (+2), Verband (+1)', () => {
    const s = mitBremse(mitQuelle('crane-punkte', 8000, 12000));
    const verband = { ...s, events: { ...s.events, marks: { ...s.events.marks, [RIVAL_MARKS.alliance]: 1 } } };
    const punkte = Object.fromEntries(cranePoints(verband, balance).map((p) => [p.key, p.ok]));
    expect(punkte).toMatchObject({ tank: true, cartel: true, alliance: true });
    expect(cranePressure(verband, balance)).toBeGreaterThanOrEqual(PA.crane.points.tank + PA.crane.points.cartel + PA.crane.points.alliance);
  });

  it('1 Punkt: Abfuhr – der Abschlag kommt sofort und länger', () => {
    const s = mitQuelle('crane-eins', 1000, 12000);
    expect(cranePressure(s, balance)).toBe(1);
    const n = haggleCrane(s, PLAN, true);
    expect(n.pricing.cranePunish?.until).toBe(s.round + balance.rivals.crane.cutRounds + PA.crane.rebuffExtra);
    expect(n.events.marks[PRICING_MARKS.supplicant]).toBe(s.round);
  });

  it('2 Punkte: Abschlag und Groll gestrichen', () => {
    const s0 = mitQuelle('crane-zwei', 1000, 12000);
    const s = { ...s0, logistics: { ...s0.logistics, teams: PA.crane.freightTeams, traderLast: s0.round }, events: { ...s0.events, marks: { ...s0.events.marks, [RIVAL_MARKS.craneCut]: s0.round } } };
    expect(cranePressure(s, balance)).toBe(2);
    const n = haggleCrane(s, PLAN, true);
    expect(craneCut({ ...n, round: s.round + 1 }, balance)).toBe(0);
    expect(craneCut({ ...s, round: s.round + 1 }, balance)).toBeGreaterThan(0);
  });

  it('ab 3 Punkten mit „angebot“: Aufschlag – Austritt aus der Förderbremse ist Verrat (Ruf −0,3)', () => {
    const s = mitBremse(mitQuelle('crane-drei', 1000, 12000));
    expect(cranePressure(s, balance)).toBeGreaterThanOrEqual(3);
    const n = haggleCrane(s, PLAN, true);
    expect(n.pricing.cartel).toBeNull();
    expect(n.wildcatterStanding).toBeCloseTo(PA.standing.betrayal, 9);
    expect(jacobPrice({ ...n, round: s.round + 1 }, balance)).toBeCloseTo(n.postedPrice + PA.crane.deal.bonus, 9);
    // Ohne „angebot“ bleibt es bei Stufe 2: kein Verrat.
    const treu = haggleCrane(s, PLAN, false);
    expect(treu.pricing.cartel).not.toBeNull();
    expect(treu.wildcatterStanding).toBe(0);
  });

  it('ab 4 Punkten: fester Abnahmevertrag zu Posted Price + 0,05; Delgados Verband ist weg', () => {
    const s0 = mitBremse(mitQuelle('crane-vier', 1000, 12000));
    const s = { ...s0, events: { ...s0.events, marks: { ...s0.events.marks, [RIVAL_MARKS.alliance]: 1 } } };
    expect(cranePressure(s, balance)).toBeGreaterThanOrEqual(4);
    const n = haggleCrane(s, PLAN, true);
    expect(n.pricing.contract).toMatchObject({ buyer: 'crane', price: Math.round((s.postedPrice + PA.crane.contract.premium) * 100) / 100 });
    expect(n.events.marks[RIVAL_MARKS.alliance]).toBeUndefined();
    const spaeter = { ...n, round: s.round + 1, postedPrice: 0.3 };
    expect(jacobPrice(spaeter, balance)).toBeCloseTo(n.pricing.contract!.price + PA.crane.deal.bonus, 9);
  });

  it('Spielspaß K1: Cranes Gegendruck (Grundwert, mehr nach frischem Nachgeben) und Laune zählen gegen die Punkte', () => {
    const s0 = mitQuelle('crane-gegen', 1000, 12000);
    const s = { ...s0, logistics: { ...s0.logistics, teams: PA.crane.freightTeams, traderLast: s0.round }, events: { ...s0.events, marks: { ...s0.events.marks, [RIVAL_MARKS.craneCut]: s0.round } } };
    expect(cranePressure(s, balance)).toBe(2);
    expect(craneResistance(s, balance)).toBe(PA.crane.resistance.base);
    const frisch = { ...s, round: 10, pricing: { ...s.pricing, clearedRound: 9 } };
    expect(craneResistance(frisch, balance)).toBe(PA.crane.resistance.base + PA.crane.resistance.recent);
    expect(craneResistance({ ...frisch, round: 9 + PA.crane.resistance.rounds }, balance)).toBe(PA.crane.resistance.base);
    // Laune neutral: 2 Punkte − 1 Gegendruck = 1 ⇒ Abfuhr mit verlängertem Abschlag.
    const neutral = mitPreis(balance, (p) => (p.crane.mood = { down: 0, up: 0 }));
    const n = haggleCrane(s, neutral, false);
    expect(n.pricing.cranePunish?.until).toBe(s.round + balance.rivals.crane.cutRounds + PA.crane.rebuffExtra);
    expect(n.log.at(-1)).toMatch(/Bittsteller/);
    // Beste Laune (+1) gleicht den Gegendruck aus ⇒ Abschlag gestrichen; schlechte Laune (−1) ⇒ Abfuhr.
    const gut = mitPreis(balance, (p) => (p.crane.mood = { down: 0, up: 1 }));
    expect(craneCut({ ...haggleCrane(s, gut, false), round: s.round + 1 }, balance)).toBe(0);
    const schlecht = mitPreis(balance, (p) => ((p.crane.mood = { down: 1, up: 0 }), (p.crane.resistance = { ...p.crane.resistance, base: 0 })));
    expect(haggleCrane(s, schlecht, false).log.at(-1)).toMatch(/Bittsteller/);
  });

  it('Spielspaß K1: Cranes Laune würfelt aus dem eigenen Strang – gleicher Seed und Runde ⇒ gleiches Ergebnis, Weltzufall unberührt', () => {
    const s = mitBremse(mitQuelle('crane-strang', 1000, 12000));
    expect(haggleCrane(s, balance, false).log.at(-1)).toBe(haggleCrane(s, balance, false).log.at(-1));
    expect(haggleCrane(s, balance, false).rng).toBe(s.rng);
  });

  it('Spielspaß K1: die Karte nennt Gegendruck, Laune und was die Abfuhr kostet', () => {
    const s = mitQuelle('crane-text', 1000, 12000);
    const text = planView(s, balance, katalog).cards.find((c) => c.id === 'crane_feilschen')?.detail ?? '';
    expect(text).toMatch(/Gegendruck/);
    expect(text).toMatch(/Abfuhr/);
  });
});

describe('Preis-Karten auf dem Brett', () => {
  it('Möglichkeiten: ohne Wahl kein Buchen, gesperrte Möglichkeit mit Grund', () => {
    const s = mitQuelle('karten', 8000, 1000);
    expect(bookCard(s, balance, katalog, 'geruecht')).toEqual({ ok: false, reason: 'Erst eine Möglichkeit wählen.' });
    const geruecht = planView(s, balance, katalog).cards.find((c) => c.id === 'geruecht')!;
    expect(geruecht.options.find((o) => o.id === 'versiegen')?.ok).toBe(false);
    expect(geruecht.options.find((o) => o.id === 'riesenfund')?.ok).toBe(true);
  });

  it('„Pakt halten“ liegt erst auf der Hand, wenn eine Förderbremse läuft (nicht in der Gründungsrunde)', () => {
    const s = mitQuelle('halten');
    const ids = (x: GameState) => planView(x, balance, katalog).cards.map((c) => c.id);
    expect(ids(s)).not.toContain('pakt_halten');
    expect(ids(mitBremse(s))).not.toContain('pakt_halten');
    expect(ids({ ...mitBremse(s, { since: s.round - 1, until: s.round + 2 }), round: s.round })).toContain('pakt_halten');
  });

  it('Förderbremse ohne eigene Förderung ist gesperrt', () => {
    const s = neuesSpiel('ohne-quelle');
    expect(planView(s, balance, katalog).cards.find((c) => c.id === 'foerderbremse')?.reason).toMatch(/fördernde Quelle/);
  });
});

describe('Spielstand (Etappe 2)', () => {
  it('der neue Zustand ist im frischen Spiel leer', () => {
    const s = neuesSpiel('neu');
    expect(s.pricing).toEqual(newPricing());
    expect(s.wildcatterStanding).toBe(0);
    expect(computePrice(balance.market, marketMods(s, balance).supply, 1)).toBeGreaterThan(0);
  });
});
