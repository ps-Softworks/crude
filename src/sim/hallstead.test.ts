import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, type Balance } from './balance';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { hallsteadAssets, hallsteadWorldInput, settleHallstead } from './hallstead';
import {
  checkHallsteadContent,
  competenceWord,
  credibilityWord,
  fillText,
  hallsteadView,
  newsLine,
  parseHallsteadContent,
} from './hallsteadContent';
import {
  chapterOf,
  debugUnlockHallstead,
  fallbackWorld,
  hallsteadOf,
  hallsteadUnlocked,
  validHallstead,
  worldView,
  type HallsteadResult,
} from './hallsteadState';
import { bankRateDiscount, buyHolding, campaignMoodShift, holdingsValue, runCampaign, saleProceeds, sellHolding } from './holdings';
import {
  availableFavors,
  bribe,
  donate,
  fireLobbyist,
  hireLobbyist,
  lobbyHeat,
  lobbyLawShift,
  lobbyWaterDown,
  pushLaw,
  lawInfluence,
  politicsUnlocked,
  politicalWeight,
  LAWS_CONNECTED,
  spendFavors,
  waterDownLaw,
} from './lobby';
import { bankRateAdd, takeLoan } from './credit';
import { newExchange } from './exchange';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const contentText = readFileSync(new URL('../../content/hallstead.yaml', import.meta.url), 'utf8');
const content = parseHallsteadContent('content/hallstead.yaml', contentText).content!;

/** Balance mit verbogenen Hallstead-Werten. */
function bal(mod: (h: Record<string, any>) => void): Balance {
  const raw = structuredClone(rawBalance()) as Record<string, any>;
  mod(raw.hallstead);
  return parseBalance(raw);
}

/** Alle Wertbewegungen aus: kein Zufall, kein Trend, kein Schlag. */
function ruhig(h: Record<string, any>) {
  for (const k of Object.keys(h.holdings.kinds)) {
    Object.assign(h.holdings.kinds[k], { drift: 0, creditBeta: 0, demandBeta: 0, noise: 0, shock: { chance: 0, drop: 0, crashOnly: false } });
  }
}

/**
 * Partie in Kapitel 3 mit viel Geld. Das Weltmodell (4.1) würfelt Kreditklima und
 * Regierung je Seed – die Tests setzen eine ausdrückliche Durchschnittswelt:
 * Kredit 50, kein Crash, Nachfrage 1, Stimmung 50, Handelspartei, Wahl in 16 Runden.
 */
function kapitel3(seed = 'hallstead', cash = 2_000_000, b: Balance = balance): GameState {
  const g = newGame(seed, b);
  const worldModel = { ...g.worldModel, credit: 50, crash: 0, demand: 1, mood: 50, government: 'handel' as const, electionIn: 16 };
  return { ...g, worldModel, chapter: 3, cash } as GameState;
}

function ok(r: HallsteadResult): GameState {
  if (!r.ok) throw new Error(`Handlung abgelehnt: ${r.reason}`);
  return r.state;
}

/** Ersetzt das Weltmodell durch ein Teilstück (nur für settleHallstead/worldView – endRound braucht das ganze). */
function mitWelt(state: GameState, welt: Record<string, unknown>): GameState {
  return { ...state, worldModel: welt } as unknown as GameState;
}

/** Partie ganz ohne Weltmodell (alte Teststände). */
function ohneWelt(state: GameState): GameState {
  const { worldModel: _, ...rest } = state;
  return rest as unknown as GameState;
}

describe('Hallstead: Spielzahlen (4.16)', () => {
  it('liest den Block hallstead aus balance.yaml', () => {
    expect(balance.hallstead.unlockChapter).toBe(3);
    expect(Object.keys(balance.hallstead.holdings.kinds)).toEqual(['land', 'bahn', 'auto', 'zeitung', 'bank']);
    expect(balance.hallstead.holdings.kinds.zeitung.single).toBe(true);
    expect(Object.keys(balance.hallstead.lobby.candidates).length).toBeGreaterThan(0);
  });

  it('meldet fehlende oder falsche Werte', () => {
    const raw = structuredClone(rawBalance()) as Record<string, any>;
    delete raw.hallstead;
    expect(() => parseBalance(raw)).toThrow(BalanceError);
    expect(() => bal((h) => (h.lobby.candidates.pryce.trait = 'schurke'))).toThrow(/trait/);
    expect(() => bal((h) => (h.lobby.candidates.pryce.competence = 6))).toThrow(/competence/);
    expect(() => bal((h) => (h.newspaper.lostBelow = 90))).toThrow(/lostBelow/);
    expect(() => bal((h) => (h.holdings.kinds.land.shock.chance = 2))).toThrow(/shock.chance/);
  });
});

describe('Hallstead: Kapitel-Tor', () => {
  it('ist in Kapitel 1 zu: keine Handlung, kein Zustand, Rundenende unverändert', () => {
    const g = { ...newGame('tor', balance), cash: 1_000_000 };
    expect(chapterOf(g)).toBe(1);
    expect(hallsteadUnlocked(g, balance)).toBe(false);
    expect(buyHolding(g, balance, 'land')).toEqual({ ok: false, reason: 'locked' });
    expect(hireLobbyist(g, balance, 'tibbs')).toEqual({ ok: false, reason: 'locked' });
    expect(settleHallstead(g, balance)).toBe(g);
    let s = newGame('tor', balance);
    for (let i = 0; i < 4; i++) s = endRound(s, balance);
    expect(s.hallstead).toBeUndefined();
  });

  it('öffnet ab Kapitel 3 (state.chapter, Andockpunkt 4.5)', () => {
    expect(hallsteadUnlocked({ ...newGame('tor', balance), chapter: 2 } as GameState, balance)).toBe(false);
    expect(hallsteadUnlocked(kapitel3(), balance)).toBe(true);
  });

  it('lässt sich im Debug vorher öffnen', () => {
    const g = debugUnlockHallstead(newGame('tor', balance), balance);
    expect(hallsteadUnlocked(g, balance)).toBe(true);
  });
});

describe('Hallstead: Weltgrößen (Andockpunkt 4.1)', () => {
  it('nimmt ohne Weltmodell die Durchschnittswelt mit festen Wahlterminen', () => {
    const g = ohneWelt(kapitel3());
    expect(worldView(g, balance)).toEqual(fallbackWorld(1, balance));
    expect(fallbackWorld(1, balance).electionIn).toBe(16);
    expect(fallbackWorld(16, balance).electionIn).toBe(1);
    expect(fallbackWorld(17, balance).electionIn).toBe(16);
    expect(fallbackWorld(1, balance).government).toBe('handel');
  });

  it('liest state.worldModel, fehlende oder kaputte Felder fallen einzeln zurück', () => {
    const w = worldView(mitWelt(kapitel3(), { credit: 80, crash: 3, demand: 1.4, mood: 20, government: 'volksbund', electionIn: 2 }), balance);
    expect(w).toEqual({ credit: 80, crash: true, demand: 1.4, mood: 20, government: 'volksbund', electionIn: 2 });
    const halb = worldView(mitWelt(kapitel3(), { credit: 'viel', government: 'kaiser', crash: 0 }), balance);
    expect(halb.credit).toBe(50);
    expect(halb.government).toBe('handel');
    expect(halb.crash).toBe(false);
  });

  it('liest das echte Weltmodell von main (newGame), nicht die Durchschnittswelt', () => {
    const g = { ...newGame('echt', balance), chapter: 3 } as GameState;
    const w = worldView(g, balance);
    expect(w.credit).toBe(g.worldModel.credit);
    expect(w.government).toBe(g.worldModel.government);
    expect(w.crash).toBe(g.worldModel.crash > 0);
    expect(w.electionIn).toBe(g.worldModel.electionIn);
  });
});

describe('Nebeninvestments: kaufen und verkaufen (GDD §8)', () => {
  it('kauft einen Anteil, kauft nach und verkauft alles mit Abschlag', () => {
    const preis = balance.hallstead.holdings.kinds.bahn.price;
    let g = kapitel3();
    const start = g.cash;
    g = ok(buyHolding(g, balance, 'bahn'));
    g = ok(buyHolding(g, balance, 'bahn'));
    expect(g.cash).toBe(start - 2 * preis);
    expect(g.hallstead!.holdings.positions.bahn).toEqual({ value: 2 * preis, invested: 2 * preis, since: 1 });
    expect(holdingsValue(g)).toBe(2 * preis);
    const erloes = saleProceeds(g, balance, 'bahn');
    expect(erloes).toBe(2 * preis * (1 - balance.hallstead.holdings.sellFee));
    g = ok(sellHolding(g, balance, 'bahn'));
    expect(g.cash).toBe(start - 2 * preis + erloes);
    expect(g.hallstead!.holdings.positions.bahn).toBeUndefined();
    expect(sellHolding(g, balance, 'bahn')).toEqual({ ok: false, reason: 'notOwned' });
  });

  it('Zeitung und Bank gibt es nur einmal; ohne Geld kein Kauf', () => {
    const g = ok(buyHolding(kapitel3(), balance, 'zeitung'));
    expect(buyHolding(g, balance, 'zeitung')).toEqual({ ok: false, reason: 'owned' });
    expect(buyHolding(kapitel3('x', 100), balance, 'land')).toEqual({ ok: false, reason: 'cash' });
  });

  it('zählt im Imperiumswert mit', () => {
    const vorher = kapitel3();
    const nachher = ok(buyHolding(vorher, balance, 'land'));
    expect(hallsteadAssets(nachher)).toBe(balance.hallstead.holdings.kinds.land.price);
    expect(empireValue(nachher, balance)).toBeCloseTo(empireValue(vorher, balance), 2);
  });
});

describe('Nebeninvestments: Rundenende', () => {
  it('bewegt den Wert mit Trend und Kreditklima und zahlt den Ertrag in die Kasse', () => {
    const b = bal((h) => {
      ruhig(h);
      h.holdings.kinds.bahn.drift = 0.01;
      h.holdings.kinds.bahn.creditBeta = 0.002;
    });
    const kb = b.hallstead.holdings.kinds.bahn;
    let g = ok(buyHolding(kapitel3('w', 2_000_000, b), b, 'bahn'));
    g = mitWelt(g, { credit: 60 });
    const kasse = g.cash;
    const s = settleHallstead(g, b);
    const wert = kb.price * (1 + 0.01 + 0.002 * 10);
    expect(s.hallstead!.holdings.positions.bahn!.value).toBeCloseTo(wert, 2);
    expect(s.cash).toBeCloseTo(kasse + wert * kb.yield, 2);
    expect(s.hallstead!.news.some((n) => n.key === 'yield')).toBe(true);
  });

  it('Autoaktien wachsen mit der Nachfrage', () => {
    const b = bal((h) => {
      ruhig(h);
      h.holdings.kinds.auto.demandBeta = 1.5;
    });
    let g = ok(buyHolding(kapitel3('d', 2_000_000, b), b, 'auto'));
    g = settleHallstead(mitWelt(g, { demand: 1 }), b);
    g = settleHallstead(mitWelt(g, { demand: 1.1 }), b);
    expect(g.hallstead!.holdings.positions.auto!.value).toBeCloseTo(b.hallstead.holdings.kinds.auto.price * 1.15, 2);
  });

  it('ein Crash trifft einmal, wenn er beginnt – nicht jede Runde', () => {
    const b = bal(ruhig);
    const kb = b.hallstead.holdings.kinds.auto;
    let g = ok(buyHolding(kapitel3('c', 2_000_000, b), b, 'auto'));
    g = settleHallstead(mitWelt(g, { crash: 4 }), b);
    expect(g.hallstead!.holdings.positions.auto!.value).toBeCloseTo(kb.price * (1 - kb.crashDrop), 2);
    expect(g.hallstead!.news.some((n) => n.key === 'crash')).toBe(true);
    g = settleHallstead(mitWelt(g, { crash: 3 }), b);
    expect(g.hallstead!.holdings.positions.auto!.value).toBeCloseTo(kb.price * (1 - kb.crashDrop), 2);
  });

  it('Land kann versiegen, die Bank erlebt einen Ansturm nur in der Krise', () => {
    const b = bal((h) => {
      ruhig(h);
      h.holdings.kinds.land.shock = { chance: 1, drop: 0.7, crashOnly: false };
      h.holdings.kinds.bank.shock = { chance: 1, drop: 0.6, crashOnly: true };
      h.holdings.kinds.bank.crashDrop = 0;
    });
    let g = ok(buyHolding(ok(buyHolding(kapitel3('s', 2_000_000, b), b, 'land')), b, 'bank'));
    g = settleHallstead(g, b);
    expect(g.hallstead!.holdings.positions.land!.value).toBeCloseTo(b.hallstead.holdings.kinds.land.price * 0.3, 2);
    expect(g.hallstead!.holdings.positions.bank!.value).toBe(b.hallstead.holdings.kinds.bank.price);
    g = settleHallstead(mitWelt(g, { crash: 2 }), b);
    expect(g.hallstead!.holdings.positions.bank!.value).toBeCloseTo(b.hallstead.holdings.kinds.bank.price * 0.4, 2);
  });

  it('ein langer Crash bringt höchstens einen Bankrun (Gefahr je Krise, nicht je Runde)', () => {
    const b = bal((h) => {
      ruhig(h);
      h.holdings.kinds.bank.shock = { chance: 1, drop: 0.6, crashOnly: true };
      h.holdings.kinds.bank.crashDrop = 0;
    });
    const preis = b.hallstead.holdings.kinds.bank.price;
    let g = ok(buyHolding(kapitel3('lang', 2_000_000, b), b, 'bank'));
    let laeufe = 0;
    for (const crash of [8, 7, 6, 5, 4, 3, 2, 1]) {
      g = settleHallstead(mitWelt(g, { crash }), b);
      laeufe += g.hallstead!.news.filter((n) => n.key === 'shock').length;
    }
    expect(laeufe).toBe(1);
    expect(g.hallstead!.holdings.positions.bank!.value).toBeCloseTo(preis * 0.4, 2);
    // Nach dem Crash: Ruhe, dann die nächste Krise – wieder höchstens ein Ansturm.
    g = settleHallstead(mitWelt(g, { crash: 0 }), b);
    g = settleHallstead(mitWelt(g, { crash: 5 }), b);
    g = settleHallstead(mitWelt(g, { crash: 4 }), b);
    expect(g.hallstead!.holdings.positions.bank!.value).toBeCloseTo(preis * 0.4 * 0.4, 2);
  });

  it('wer mitten im Crash kauft, bekommt keinen Einbruch und keinen Bankrun hinterher', () => {
    const b = bal((h) => {
      ruhig(h);
      h.holdings.kinds.bank.shock = { chance: 1, drop: 0.6, crashOnly: true };
    });
    const krise = mitWelt(kapitel3('tief', 2_000_000, b), { crash: 3, demand: 0.9 });
    let g = ok(buyHolding(ok(buyHolding(krise, b, 'auto')), b, 'bank'));
    expect(g.hallstead!.holdings.crashSeen).toBe(true);
    expect(g.hallstead!.holdings.demandSeen).toBe(0.9);
    g = settleHallstead(mitWelt(g, { crash: 2, demand: 0.9 }), b);
    expect(g.hallstead!.holdings.positions.auto!.value).toBe(b.hallstead.holdings.kinds.auto.price);
    expect(g.hallstead!.holdings.positions.bank!.value).toBe(b.hallstead.holdings.kinds.bank.price);
    expect(g.hallstead!.news.some((n) => n.key === 'crash' || n.key === 'shock')).toBe(false);
  });

  it('ist bei gleichem Seed gleich (eigener Zufall)', () => {
    const lauf = (seed: string) => {
      let g = ok(buyHolding(ok(buyHolding(kapitel3(seed), balance, 'auto')), balance, 'land'));
      for (let i = 0; i < 6; i++) g = endRound(g, balance);
      return g.hallstead;
    };
    expect(lauf('gleich')).toEqual(lauf('gleich'));
    expect(lauf('gleich')!.holdings.positions.auto!.value).not.toBe(lauf('anders')!.holdings.positions.auto!.value);
  });

  it('läuft im echten Rundenende mit (vor der Pleiteprüfung)', () => {
    let g = ok(buyHolding(kapitel3('e'), balance, 'bahn'));
    g = endRound(g, balance);
    expect(g.hallstead!.news.length).toBeGreaterThan(0);
    expect(g.hallstead!.holdings.positions.bahn!.value).not.toBe(balance.hallstead.holdings.kinds.bahn.price);
  });
});

describe('Eigene Zeitung und eigene Bank', () => {
  it('eine Kampagne je Runde kostet Glaubwürdigkeit und bringt Gefallen und Stimmung', () => {
    const nb = balance.hallstead.newspaper;
    let g = ok(buyHolding(kapitel3(), balance, 'zeitung'));
    expect(runCampaign(kapitel3(), balance)).toEqual({ ok: false, reason: 'notOwned' });
    g = ok(runCampaign(g, balance));
    expect(runCampaign(g, balance)).toEqual({ ok: false, reason: 'already' });
    expect(g.hallstead!.holdings.credibility).toBe(nb.credibilityStart - nb.campaignCost);
    expect(g.hallstead!.lobby.favors).toBeCloseTo((nb.favorsPerCampaign * nb.credibilityStart) / 100, 5);
    expect(campaignMoodShift(g, balance)).toBeCloseTo((nb.moodPerCampaign * nb.credibilityStart) / 100, 5);
    expect(hallsteadWorldInput(g, balance).moodKick).toBe(campaignMoodShift(g, balance));
    // Rundenende in der Kampagnenrunde: keine Erholung; danach erholt sie sich.
    g = settleHallstead(g, balance);
    expect(g.hallstead!.holdings.credibility).toBe(nb.credibilityStart - nb.campaignCost);
    g = settleHallstead({ ...g, round: 2 }, balance);
    expect(g.hallstead!.holdings.credibility).toBe(nb.credibilityStart - nb.campaignCost + nb.recovery);
    expect(campaignMoodShift(g, balance)).toBe(0);
  });

  it('zu viel Propaganda verspielt die Glaubwürdigkeit', () => {
    let g = ok(buyHolding(kapitel3(), balance, 'zeitung'));
    for (let r = 1; r <= 6; r++) g = ok(runCampaign({ ...g, round: r }, balance));
    expect(credibilityWord(g.hallstead!.holdings.credibility, balance)).toBe('lost');
  });

  it('die eigene Bank macht den Kredit billiger (credit.ts)', () => {
    expect(bankRateDiscount(kapitel3(), balance)).toBe(0);
    const mitBank = ok(buyHolding(kapitel3(), balance, 'bank'));
    expect(bankRateDiscount(mitBank, balance)).toBe(balance.hallstead.bankRateDiscount);
    expect(bankRateAdd(mitBank, balance)).toBeCloseTo(bankRateAdd(kapitel3(), balance) - balance.hallstead.bankRateDiscount, 6);
    const ohne = takeLoan(kapitel3(), balance, balance.credit.minLoan);
    const mit = takeLoan(mitBank, balance, balance.credit.minLoan);
    if (!ohne.ok || !mit.ok) throw new Error('Kredit abgelehnt');
    expect(mit.state.loans.at(-1)!.rate).toBeCloseTo(ohne.state.loans.at(-1)!.rate - balance.hallstead.bankRateDiscount, 6);
  });

  it('die Kampagne hebt im echten Rundenende die Stimmung im Weltmodell', () => {
    const g = ok(buyHolding(kapitel3('stimmung'), balance, 'zeitung'));
    const kampagne = ok(runCampaign(g, balance));
    const schub = campaignMoodShift(kampagne, balance);
    expect(schub).toBeGreaterThan(0);
    const ohne = endRound(g, balance).worldModel.mood;
    const mit = endRound(kampagne, balance).worldModel.mood;
    // Weltmodell 4.2: Ein einmaliger Stoß (WorldInput.moodKick) wirkt sofort in voller Höhe auf die Stimmung.
    expect(mit - ohne).toBeCloseTo(schub, 6);
  });
});

describe('Lobbyist in Hallstead (GDD §10, §11)', () => {
  it('einstellen, nicht doppelt, entlassen', () => {
    const c = balance.hallstead.lobby.candidates.tibbs;
    let g = kapitel3();
    const kasse = g.cash;
    expect(hireLobbyist(g, balance, 'niemand')).toEqual({ ok: false, reason: 'unknown' });
    expect(hireLobbyist(kapitel3('x', 0), balance, 'tibbs')).toEqual({ ok: false, reason: 'cash' });
    g = ok(hireLobbyist(g, balance, 'tibbs'));
    expect(g.cash).toBe(kasse - c.hireCost);
    expect(hireLobbyist(g, balance, 'pryce')).toEqual({ ok: false, reason: 'hasLobbyist' });
    g = ok(fireLobbyist(g, balance));
    expect(g.hallstead!.lobby.lobbyist).toBeNull();
    expect(fireLobbyist(g, balance)).toEqual({ ok: false, reason: 'noLobbyist' });
  });

  it('bringt Gefallen nach Kompetenz und Regierung und kostet Gehalt', () => {
    const lb = balance.hallstead.lobby;
    const c = lb.candidates.pryce;
    let g = ok(hireLobbyist(kapitel3(), balance, 'pryce'));
    const kasse = g.cash;
    // 0.4.20+17: dazu Jacobs eigene Kontakte (ownFavors × Gewicht nach Firmengröße).
    const eigene = Math.round(lb.ownFavors * politicalWeight(empireValue(g, balance), balance) * 100) / 100;
    g = settleHallstead(g, balance);
    expect(g.cash).toBe(kasse - c.salary);
    expect(g.hallstead!.lobby.favors).toBeCloseTo(c.competence * lb.favorsPerCompetence * lb.government.handel + eigene, 5);
    const v = settleHallstead(mitWelt(ok(hireLobbyist(kapitel3(), balance, 'pryce')), { government: 'volksbund' }), balance);
    expect(v.hallstead!.lobby.favors).toBeCloseTo(c.competence * lb.favorsPerCompetence * lb.government.volksbund + eigene, 5);
  });

  it('der Trinker verschläft Runden, das Genie schwankt, mehr als maxFavors gibt es nicht', () => {
    const b = bal((h) => {
      h.lobby.drunkChance = 1;
      h.lobby.maxFavors = 3;
      h.lobby.ownFavors = 0;
    });
    const t = settleHallstead(ok(hireLobbyist(kapitel3('t', 2_000_000, b), b, 'tibbs')), b);
    expect(t.hallstead!.lobby.favors).toBe(0);
    expect(t.hallstead!.news).toContainEqual({ key: 'lobbyDrunk' });
    const lb = balance.hallstead.lobby;
    const basis = lb.candidates.lowell.competence * lb.favorsPerCompetence * lb.government.handel;
    for (const seed of ['a', 'b', 'c', 'd']) {
      const f = settleHallstead(ok(hireLobbyist(kapitel3(seed), b, 'lowell')), b).hallstead!.lobby.favors;
      expect(f).toBeGreaterThanOrEqual(basis * (1 - lb.genieSpread) - 0.01);
      expect(f).toBeLessThanOrEqual(basis * (1 + lb.genieSpread) + 0.01);
    }
    let p = ok(hireLobbyist(kapitel3('p', 2_000_000, b), b, 'pryce'));
    for (let i = 0; i < 5; i++) p = settleHallstead(p, b);
    expect(p.hallstead!.lobby.favors).toBe(3);
  });

  it('Gesetze fordern und verhindern kostet Gefallen und verschiebt die Chance (Andockpunkt 4.3)', () => {
    const lb = balance.hallstead.lobby;
    let g = kapitel3();
    // 0.4.20+17: Fordern/Bremsen geht auch ohne Lobbyist – es kostet nur Gefallen.
    expect(pushLaw(g, balance, 'kartell', -1)).toEqual({ ok: false, reason: 'favors' });
    g = ok(hireLobbyist(g, balance, 'pryce'));
    expect(pushLaw(g, balance, 'kartell', -1)).toEqual({ ok: false, reason: 'favors' });
    g = { ...g, hallstead: { ...g.hallstead!, lobby: { ...g.hallstead!.lobby, favors: 10 } } };
    g = ok(pushLaw(g, balance, 'kartell', -1));
    expect(availableFavors(g)).toBe(10 - lb.pushCost);
    expect(g.hallstead!.lobby.pressure.kartell).toBe(-lb.pushStep);
    expect(lobbyLawShift(g, balance, 'kartell')).toBeCloseTo((-lb.pushStep / 100) * lb.maxShift, 5);
    expect(lobbyLawShift(g, balance, 'steuerabzug')).toBe(0);
    // Druck verblasst je Runde.
    const s = settleHallstead(g, balance);
    expect(s.hallstead!.lobby.pressure.kartell).toBeCloseTo(-lb.pushStep * (1 - lb.decay), 3);
  });

  it('mehr als voller Druck geht nicht', () => {
    let g = ok(hireLobbyist(kapitel3(), balance, 'pryce'));
    g = { ...g, hallstead: { ...g.hallstead!, lobby: { ...g.hallstead!.lobby, favors: 20, pressure: { steuerabzug: 100 } } } };
    expect(pushLaw(g, balance, 'steuerabzug', 1)).toEqual({ ok: false, reason: 'maxed' });
    expect(pushLaw(g, balance, 'steuerabzug', -1).ok).toBe(true);
  });

  it('verwässern bis höchstens maxWater', () => {
    const lb = balance.hallstead.lobby;
    let g = ok(hireLobbyist(kapitel3(), balance, 'pryce'));
    g = { ...g, hallstead: { ...g.hallstead!, lobby: { ...g.hallstead!.lobby, favors: 20 } } };
    while (true) {
      const r = waterDownLaw(g, balance, 'umwelt');
      if (!r.ok) {
        expect(r.reason).toBe('maxed');
        break;
      }
      g = r.state;
    }
    expect(lobbyWaterDown(g, 'umwelt')).toBeCloseTo(lb.maxWater, 5);
  });

  it('Umschlag: Gefallen gegen Geld und Hitze – nicht mit einem gewissenhaften Lobbyisten', () => {
    const b = balance.hallstead.lobby.bribe;
    expect(bribe(ok(hireLobbyist(kapitel3(), balance, 'pryce')), balance)).toEqual({ ok: false, reason: 'refuses' });
    let g = ok(hireLobbyist(kapitel3(), balance, 'tibbs'));
    const kasse = g.cash;
    g = ok(bribe(g, balance));
    expect(g.cash).toBe(kasse - b.cost);
    expect(g.hallstead!.lobby.favors).toBe(b.favors);
    expect(lobbyHeat(g)).toBe(b.heat);
  });

  it('0.4.20+16: die Hitze der Umschläge verblasst je Runde um heatDecay, Reste unter 0,5 fallen weg', () => {
    const b = balance.hallstead.lobby.bribe;
    const g = ok(bribe(ok(hireLobbyist(kapitel3(), balance, 'tibbs')), balance));
    const nach = settleHallstead(g, balance);
    expect(lobbyHeat(nach)).toBeCloseTo(b.heat * (1 - b.heatDecay), 2);
    const fast = { ...g, hallstead: { ...g.hallstead!, lobby: { ...g.hallstead!.lobby, heat: 0.5 } } };
    expect(lobbyHeat(settleHallstead(fast, balance))).toBe(0);
  });

  it('Wahlkampfspende: gewinnt die Partei, schuldet sie Gefallen, sonst ist das Geld weg', () => {
    const d = balance.hallstead.lobby.donation;
    // Ohne Jacobs eigene Kontakte (0.4.20+17), damit nur die Spende zählt.
    const b0 = bal((h) => {
      h.lobby.ownFavors = 0;
    });
    const g = kapitel3('hallstead', undefined, b0);
    expect(donate(g, b0, 'handel', d.min - 1)).toEqual({ ok: false, reason: 'amount' });
    // Wahl in 2 Runden laut Weltmodell.
    let a = ok(donate(mitWelt(g, { electionIn: 2, government: 'handel' }), b0, 'handel', 2 * d.min));
    expect(a.hallstead!.lobby.donations[0].electionRound).toBe(2);
    a = settleHallstead(a, b0);
    expect(a.hallstead!.lobby.donations).toHaveLength(1);
    a = settleHallstead({ ...a, round: 2 }, b0);
    expect(a.hallstead!.lobby.donations).toHaveLength(0);
    expect(a.hallstead!.lobby.favors).toBeCloseTo(((2 * d.min) / d.perFavor) * d.winMultiplier, 5);
    let v = ok(donate(mitWelt(g, { electionIn: 1, government: 'volksbund' }), b0, 'provinz', d.min));
    v = settleHallstead(v, b0);
    expect(v.hallstead!.lobby.favors).toBe(0);
    expect(v.hallstead!.news).toContainEqual({ key: 'donationLost', party: 'provinz', amount: d.min });
  });

  it('andere Systeme können Gefallen ausgeben (Andockpunkt)', () => {
    let g = kapitel3();
    g = { ...g, hallstead: { ...hallsteadOf(g, balance), lobby: { ...hallsteadOf(g, balance).lobby, favors: 3.5 } } };
    expect(spendFavors(g, balance, 4)).toEqual({ ok: false, reason: 'favors' });
    expect(availableFavors(ok(spendFavors(g, balance, 3)))).toBe(0);
    expect(spendFavors({ ...g, chapter: 1 } as GameState, balance, 1)).toEqual({ ok: false, reason: 'locked' });
  });
});

describe('Hallstead im Spielstand', () => {
  it('übersteht Sichern und Laden; ohne Hallstead lädt es auch', () => {
    const g = ok(hireLobbyist(ok(buyHolding(kapitel3(), balance, 'land')), balance, 'tibbs'));
    const r = deserializeGame(serializeGame(g, 'test'));
    expect(r.ok && r.state.hallstead).toEqual(g.hallstead);
    expect(deserializeGame(serializeGame(newGame('alt', balance), 'test')).ok).toBe(true);
  });

  it('verwirft einen kaputten Hallstead-Zustand', () => {
    const g = ok(buyHolding(kapitel3(), balance, 'land'));
    const kaputt = { ...g, hallstead: { ...g.hallstead!, holdings: { ...g.hallstead!.holdings, positions: { gold: { value: 1, invested: 1, since: 1 } } } } };
    expect(validHallstead(kaputt.hallstead)).toBe(false);
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
    expect(validHallstead({ ...g.hallstead!, lobby: { ...g.hallstead!.lobby, donations: [{ party: 'kaiser', amount: 1, electionRound: 1 }] } })).toBe(false);
    expect(validHallstead(undefined)).toBe(true);
  });
});

describe('Texte der Hallstead-Mappe (content/hallstead.yaml)', () => {
  it('sind vollständig und passen zu balance.yaml', () => {
    const r = parseHallsteadContent('content/hallstead.yaml', contentText);
    expect(r.errors).toEqual([]);
    expect(checkHallsteadContent('content/hallstead.yaml', r.content!, balance)).toEqual([]);
    // 0.4.20+17: dieselben Kennungen wie im Gesetzeskatalog (content/laws/).
    expect(r.content!.laws.map((l) => l.id)).toContain('antitrust');
    expect(r.content!.laws.map((l) => l.id)).toContain('income_tax');
  });

  it('meldet fehlende Texte, falsche Haltungen und Kandidaten ohne Text', () => {
    const kaputt = contentText.replace('oil: for', 'oil: vielleicht').replace(/ {2}tibbs:\n {4}name:.*\n {4}text:.*\n/, '');
    const r = parseHallsteadContent('x.yaml', kaputt);
    expect(r.errors.some((e) => e.message.includes('oil'))).toBe(true);
    const ohneTibbs = parseHallsteadContent('x.yaml', contentText.replace(/ {2}tibbs:\n {4}name:.*\n {4}text:.*\n/, '')).content!;
    expect(checkHallsteadContent('x.yaml', ohneTibbs, balance).some((e) => e.message.includes('tibbs'))).toBe(true);
    const ohneSchlag = bal((h) => (h.holdings.kinds.bahn.shock.chance = 0.1));
    expect(checkHallsteadContent('x.yaml', content, ohneSchlag).some((e) => e.message.includes('bahn.shock'))).toBe(true);
    expect(parseHallsteadContent('x.yaml', 'object: [').errors[0].message).toMatch(/YAML/);
  });

  it('Wörter statt Zahlen: Glaubwürdigkeit und Kompetenz', () => {
    expect(credibilityWord(80, balance)).toBe('high');
    expect(credibilityWord(45, balance)).toBe('scratched');
    expect(credibilityWord(10, balance)).toBe('lost');
    expect([1, 2, 3, 4, 5].map(competenceWord)).toEqual(['low', 'low', 'mid', 'high', 'high']);
    expect(fillText('{a} und {b}', { a: 1 })).toBe('1 und {b}');
  });

  it('baut die Sicht fürs Fenster und das Telegramm', () => {
    let g = ok(hireLobbyist(ok(buyHolding(kapitel3(), balance, 'bank')), balance, 'tibbs'));
    g = ok(donate(g, balance, 'handel', balance.hallstead.lobby.donation.min));
    g = settleHallstead(g, balance);
    const v = hallsteadView(g, balance, content);
    expect(v.unlocked).toBe(true);
    expect(v.holdings.find((h) => h.kind === 'bank')!.owned).toBe(true);
    expect(v.bankDiscount).toContain(`${Math.round(balance.hallstead.bankRateDiscount * 100)} Punkte`);
    expect(v.lobbyist!.name).toBe('Warren Tibbs');
    expect(v.canBribe).toBe(true);
    expect(v.government).toContain('Handelspartei');
    expect(v.donations[0]).toContain('Handelspartei');
    // 0.4.20+17: Die Mappe zeigt nur Gesetze, die das Parlament kennt.
    expect(v.laws.map((l) => l.id).sort()).toEqual(content.laws.filter((l) => balance.laws.some((d) => d.id === l.id)).map((l) => l.id).sort());
    expect(v.laws.length).toBeGreaterThanOrEqual(2);
    expect(v.weight).toMatch(/wiegt/);
    // Solange kein Gesetzessystem (4.3) den Druck liest, sagt die Mappe das.
    expect(v.lawsPending).toBe(LAWS_CONNECTED ? null : content.ui.lawsPending.de);
    expect(v.telegram.length).toBeGreaterThan(0);
    expect(v.telegram.join(' ')).not.toMatch(/\{\w+\}/);
    expect(v.telegramNews).toBe(false);
    const crash = settleHallstead(mitWelt(g, { crash: 2 }), balance);
    expect(hallsteadView(crash, balance, content).telegramNews).toBe(true);
    expect(newsLine({ key: 'shock', kind: 'land', amount: 1000 }, content, 'en')).toContain("Jacob's land");
    const zu = hallsteadView(newGame('zu', balance), balance, content);
    expect(zu.unlocked).toBe(false);
    expect(zu.lobbyist).toBeNull();
  });
});

describe('0.4.20+17: Provinzpolitik in Kapitel 2, Gewicht nach Firmengröße', () => {
  const lb = balance.hallstead.lobby;
  const kapitel2 = (): GameState => ({ ...kapitel3(), chapter: 2 }) as GameState;

  it('ab Kapitel 2 fordern, bremsen und spenden – ohne Lobbyist; Lobbyist und Umschlag erst mit Hallstead', () => {
    expect(politicsUnlocked(newGame('k1', balance), balance)).toBe(false);
    const k2 = kapitel2();
    expect(politicsUnlocked(k2, balance)).toBe(true);
    expect(hallsteadUnlocked(k2, balance)).toBe(false);
    const mitGefallen = { ...k2, hallstead: { ...hallsteadOf(k2, balance), lobby: { ...hallsteadOf(k2, balance).lobby, favors: 5 } } };
    const g = ok(pushLaw(mitGefallen, balance, 'income_tax', -1));
    expect(g.hallstead!.lobby.pressure.income_tax).toBe(-lb.pushStep);
    expect(ok(donate(k2, balance, 'handel', lb.donation.min)).hallstead!.lobby.donations).toHaveLength(1);
    expect(hireLobbyist(k2, balance, 'pryce')).toEqual({ ok: false, reason: 'locked' });
    expect(pushLaw(newGame('k1', balance), balance, 'income_tax', 1)).toEqual({ ok: false, reason: 'locked' });
  });

  it('das Gewicht wächst mit dem Imperiumswert (min … 1) – davon hängen eigene Gefallen und Einfluss ab', () => {
    expect(politicalWeight(0, balance)).toBe(lb.weight.min);
    expect(politicalWeight(lb.weight.fullAt / 2, balance)).toBeCloseTo(0.5, 9);
    expect(politicalWeight(lb.weight.fullAt * 3, balance)).toBe(1);
    const k2 = kapitel2();
    const gewicht = politicalWeight(empireValue(k2, balance), balance);
    const nach = settleHallstead(k2, balance);
    expect(nach.hallstead!.lobby.favors).toBeCloseTo(Math.round(lb.ownFavors * gewicht * 100) / 100, 9);
    // In Kapitel 2 keine Beteiligungen, kein Gehalt.
    expect(nach.cash).toBe(k2.cash);
  });

  it('lawInfluence: Druck ÷ 100 × Gewicht je Gesetz, dazu die Verwässerung; in Kapitel 1 nichts', () => {
    const k2 = kapitel2();
    const h = hallsteadOf(k2, balance);
    const g = { ...k2, hallstead: { ...h, lobby: { ...h.lobby, pressure: { income_tax: -50 }, water: { antitrust: 0.2 } } } };
    const r = lawInfluence(g, balance, lb.weight.fullAt / 2);
    expect(r.lawInfluence.income_tax).toBeCloseTo(-0.25, 9);
    expect(r.lawWater).toEqual({ antitrust: 0.2 });
    expect(lawInfluence(newGame('k1', balance), balance, 1e9)).toEqual({ lawInfluence: {}, lawWater: {} });
  });
});

describe('Hallstead: Bahn-/Autoaktien folgen der Börse (0.4.20+28)', () => {
  function mitBoerse(g: GameState, verlauf: Record<string, number[]>): GameState {
    const ex = newExchange('b', 1, balance.exchange);
    return { ...g, exchange: { ...ex, history: { ...ex.history, ...verlauf } } };
  }

  it('Autoaktien: Wert folgt dem Sektorkurs (Motorwagen −20 % → −12 % bei Beta 0,6)', () => {
    const b = bal(ruhig);
    b.hallstead.holdings.kinds.auto.exchangeBeta = 0.6;
    let g = ok(buyHolding(kapitel3('x1', 2_000_000, b), b, 'auto'));
    g = settleHallstead(mitBoerse(mitWelt(g, { demand: 1 }), { motorwagen: [100, 80] }), b);
    expect(g.hallstead!.holdings.positions.auto!.value).toBeCloseTo(b.hallstead.holdings.kinds.auto.price * 0.88, 2);
  });

  it('ohne offene Börse gilt nur das alte Modell', () => {
    const b = bal(ruhig);
    let g = ok(buyHolding(kapitel3('x2', 2_000_000, b), b, 'bahn'));
    g = settleHallstead(mitWelt(g, { demand: 1 }), b);
    expect(g.hallstead!.holdings.positions.bahn!.value).toBeCloseTo(b.hallstead.holdings.kinds.bahn.price, 2);
  });

  it('im Crash kein zweiter Einbruch, wenn der Kurs ihn schon trägt', () => {
    const b = bal(ruhig);
    let g = ok(buyHolding(kapitel3('x3', 2_000_000, b), b, 'bahn'));
    g = settleHallstead(mitBoerse(mitWelt(g, { crash: 4 }), { thorne_bahn: [100, 100] }), b);
    expect(g.hallstead!.holdings.positions.bahn!.value).toBeCloseTo(b.hallstead.holdings.kinds.bahn.price, 2);
  });
});
