import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance } from './balance';
import {
  applyBrandScandal,
  awarenessWord,
  brandAntitrust,
  brandAssets,
  brandGoal,
  brandOf,
  brandRegionOpen,
  brandUnlocked,
  brandValue,
  brandWorldFrom,
  buildStations,
  buildingCount,
  campaignActive,
  DEFAULT_BRAND_WORLD,
  foundBrand,
  isBrandState,
  nationalShare,
  newBrand,
  regionDemand,
  regionMarket,
  reputationFactor,
  sellStation,
  setPricePolicy,
  settleBrand,
  startCampaign,
  stationCost,
  type BrandResult,
  type BrandState,
  type BrandWorld,
} from './brand';
import { brandNewsText, checkBrandRefs, parseBrandContent } from './brandContent';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const B = balance.brand;
const K3: BrandWorld = { ...DEFAULT_BRAND_WORLD, chapter: 3 };
const K1: BrandWorld = { ...DEFAULT_BRAND_WORLD, chapter: 1 };

function ok<S>(r: BrandResult<S>): S {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Eine Partie mitten in Kapitel 3 – viel Geld, noch keine Marke. */
function kapitel3(seed = 'marke', cash = 1_000_000): GameState {
  return { ...newGame(seed, balance), cash, startYear: 109, round: 2 };
}

/** Gegründete Marke mit n fertigen Tankstellen in Cordova. */
function mitTankstellen(n: number, seed = 'marke'): GameState {
  let s = ok(foundBrand(kapitel3(seed), balance, K3, 'harlan'));
  s = ok(buildStations(s, balance, K3, 'cordova', Math.min(n, B.station.buildMax)));
  let rest = n - Math.min(n, B.station.buildMax);
  while (rest > 0) {
    const k = Math.min(rest, B.station.buildMax);
    s = ok(buildStations(s, balance, K3, 'cordova', k));
    rest -= k;
  }
  // Bau fertig: Runde weiterdrehen und abrechnen.
  return settleBrand({ ...s, round: s.round + B.station.buildRounds }, balance, K3);
}

describe('Freischaltung (4.14)', () => {
  it('ist erst ab Kapitel 3 offen', () => {
    expect(brandUnlocked(K1, balance)).toBe(false);
    expect(brandUnlocked({ chapter: 2 }, balance)).toBe(false);
    expect(brandUnlocked(K3, balance)).toBe(true);
  });

  it('Sierra Alta öffnet erst in Kapitel 4', () => {
    expect(brandRegionOpen(K3, balance, 'cordova')).toBe(true);
    expect(brandRegionOpen(K3, balance, 'sierra_alta')).toBe(false);
    expect(brandRegionOpen({ chapter: 4 }, balance, 'sierra_alta')).toBe(true);
    expect(brandRegionOpen(K3, balance, 'gibtsnicht')).toBe(false);
  });

  it('in Kapitel 1 ändert die Abrechnung nichts und zieht keinen Zufall', () => {
    const s = newGame('k1', balance);
    expect(settleBrand(s, balance, K1)).toBe(s);
    expect(settleBrand(s, balance)).toBe(s);
  });

  it('Kapitel 1 bleibt im Rundenende ohne Marke', () => {
    const s = endRound(newGame('k1-runde', balance), balance);
    expect(s.brand).toBeUndefined();
  });

  it('Aktionen gehen in Kapitel 1 nicht', () => {
    const s = { ...newGame('k1', balance), cash: 1_000_000 };
    expect(foundBrand(s, balance, K1, 'harlan')).toEqual({ ok: false, reason: 'locked' });
    expect(buildStations(s, balance, K1, 'cordova', 1)).toEqual({ ok: false, reason: 'locked' });
  });
});

describe('Schnittstelle zur Welt', () => {
  it('nimmt Ersatzwerte, solange es Kapitel, Weltmodell und Ruf nicht gibt', () => {
    expect(brandWorldFrom(newGame('w', balance))).toEqual(DEFAULT_BRAND_WORLD);
  });

  it('liest Kapitel, Kreditcrash und Ruf, wenn andere Systeme sie liefern', () => {
    const w = brandWorldFrom({ chapter: 3, world: { crash: 2 }, reputation: { public: -250 } });
    expect(w.chapter).toBe(3);
    expect(w.crash).toBe(true);
    expect(w.reputation).toBe(-100);
  });

  it('overrides gewinnen', () => {
    expect(brandWorldFrom({ chapter: 3 }, { chapter: 5 }).chapter).toBe(5);
  });
});

describe('Ausgangslage', () => {
  it('Crane ist in jeder Region schon da, Jacob nicht', () => {
    const b = newBrand('s', balance);
    for (const r of B.regions) {
      expect(b.regions[r.id].crane.stations).toBe(r.craneStations);
      expect(b.regions[r.id].stations).toBe(0);
    }
    expect(b.founded).toBe(false);
  });

  it('brandOf liefert vor der ersten Abrechnung die Ausgangslage', () => {
    const s = kapitel3();
    expect(brandOf(s, balance)).toEqual(newBrand(s.seed, balance));
  });
});

describe('Marke gründen', () => {
  it('kostet foundCost und setzt den Namen', () => {
    const s = kapitel3();
    const n = ok(foundBrand(s, balance, K3, 'golfstern', 'Golfstern'));
    expect(n.cash).toBe(s.cash - B.foundCost);
    expect(n.brand!.founded).toBe(true);
    expect(n.brand!.nameId).toBe('golfstern');
    expect(n.log.at(-1)).toContain('Golfstern');
  });

  it('geht nur einmal, nur mit Geld und nur mit gültigem Namen', () => {
    const n = ok(foundBrand(kapitel3(), balance, K3, 'harlan'));
    expect(foundBrand(n, balance, K3, 'harlan')).toEqual({ ok: false, reason: 'founded' });
    expect(foundBrand(kapitel3('x', B.foundCost - 1), balance, K3, 'harlan')).toEqual({ ok: false, reason: 'cash' });
    expect(foundBrand(kapitel3(), balance, K3, 'Böse Marke')).toEqual({ ok: false, reason: 'name' });
  });
});

describe('Tankstellen', () => {
  it('kosten je Region costFactor × station.cost', () => {
    const ost = B.regions.find((r) => r.id === 'ostkueste')!;
    expect(stationCost(balance, 'ostkueste')).toBeCloseTo(B.station.cost * ost.costFactor);
  });

  it('bauen dauert buildRounds; danach verkaufen sie', () => {
    let s = ok(foundBrand(kapitel3(), balance, K3, 'harlan'));
    const vorher = s.cash;
    s = ok(buildStations(s, balance, K3, 'cordova', 3));
    expect(s.cash).toBeCloseTo(vorher - 3 * stationCost(balance, 'cordova'));
    expect(buildingCount(s.brand!, 'cordova')).toBe(3);
    // Gleiche Runde abgerechnet: noch im Bau, kein Absatz.
    const gleich = settleBrand(s, balance, K3);
    expect(gleich.brand!.regions.cordova.stations).toBe(0);
    expect(gleich.brand!.regions.cordova.last!.sales).toBe(0);
    // Nächste Runde: offen, verkaufen schon.
    const spaeter = settleBrand({ ...gleich, round: gleich.round + B.station.buildRounds }, balance, K3);
    expect(spaeter.brand!.regions.cordova.stations).toBe(3);
    expect(spaeter.brand!.regions.cordova.last!.sales).toBeGreaterThan(0);
    expect(spaeter.brand!.news).toContainEqual({ kind: 'opened', region: 'cordova', count: 3 });
  });

  it('brauchen eine Marke, eine offene Region, eine sinnvolle Zahl und Platz', () => {
    const ohne = kapitel3();
    expect(buildStations(ohne, balance, K3, 'cordova', 1)).toEqual({ ok: false, reason: 'notFounded' });
    const s = ok(foundBrand(ohne, balance, K3, 'harlan'));
    expect(buildStations(s, balance, K3, 'sierra_alta', 1)).toEqual({ ok: false, reason: 'region' });
    expect(buildStations(s, balance, K3, 'cordova', 0)).toEqual({ ok: false, reason: 'count' });
    expect(buildStations(s, balance, K3, 'cordova', B.station.buildMax + 1)).toEqual({ ok: false, reason: 'count' });
    expect(buildStations(s, balance, K3, 'cordova', 1.5)).toEqual({ ok: false, reason: 'count' });
    expect(buildStations({ ...s, cash: 0 }, balance, K3, 'cordova', 1)).toEqual({ ok: false, reason: 'cash' });
    const voll: GameState = {
      ...s,
      brand: { ...s.brand!, regions: { ...s.brand!.regions, cordova: { ...s.brand!.regions.cordova, stations: B.station.maxPerRegion } } },
    };
    expect(buildStations(voll, balance, K3, 'cordova', 1)).toEqual({ ok: false, reason: 'full' });
  });

  it('verkaufen bringt resale der Baukosten zurück', () => {
    const s = mitTankstellen(2);
    const n = ok(sellStation(s, balance, K3, 'cordova'));
    expect(n.brand!.regions.cordova.stations).toBe(1);
    expect(n.cash).toBeCloseTo(s.cash + stationCost(balance, 'cordova') * B.station.resale);
    expect(sellStation(s, balance, K3, 'okara')).toEqual({ ok: false, reason: 'noStation' });
  });
});

describe('Marktanteil', () => {
  it('mehr Tankstellen, mehr Anteil – aber mit abnehmendem Ertrag', () => {
    const a = regionMarket(mitTankstellen(2).brand!, balance, 'cordova', K3);
    const b = regionMarket(mitTankstellen(4).brand!, balance, 'cordova', K3);
    expect(b.share).toBeGreaterThan(a.share);
    expect(b.attract.jacob / a.attract.jacob).toBeLessThan(2);
  });

  it('Anteile von Jacob, Crane und den Freien ergeben zusammen höchstens 1', () => {
    const m = regionMarket(mitTankstellen(5).brand!, balance, 'cordova', K3);
    expect(m.share + m.craneShare).toBeLessThan(1);
    const frei = m.attract.independents / (m.attract.jacob + m.attract.crane + m.attract.independents);
    expect(m.share + m.craneShare + frei).toBeCloseTo(1);
  });

  it('billig zieht mehr Kunden an, bringt aber weniger je Barrel', () => {
    const s = mitTankstellen(3);
    const billig = ok(setPricePolicy(s, balance, K3, 'cordova', 'billig'));
    const teuer = ok(setPricePolicy(s, balance, K3, 'cordova', 'teuer'));
    const mb = regionMarket(billig.brand!, balance, 'cordova', K3);
    const mn = regionMarket(s.brand!, balance, 'cordova', K3);
    const mt = regionMarket(teuer.brand!, balance, 'cordova', K3);
    expect(mb.share).toBeGreaterThan(mn.share);
    expect(mn.share).toBeGreaterThan(mt.share);
    expect(mb.margin).toBeLessThan(mn.margin);
    expect(mt.margin).toBeGreaterThan(mn.margin);
    expect(setPricePolicy(s, balance, K3, 'cordova', 'normal')).toEqual({ ok: false, reason: 'samePrice' });
  });

  it('Absatz ist durch die Kapazität der Tankstellen begrenzt', () => {
    const s = mitTankstellen(1);
    const riesig: BrandState = { ...s.brand!, motor: 1000 };
    const m = regionMarket(riesig, balance, 'cordova', K3);
    expect(m.sales).toBeCloseTo(B.station.capacity);
  });

  it('der Ruf in der Öffentlichkeit wirkt sofort auf den Absatz (Skandal)', () => {
    const b = mitTankstellen(3).brand!;
    const gut = regionMarket(b, balance, 'cordova', { ...K3, reputation: 60 });
    const schlecht = regionMarket(b, balance, 'cordova', { ...K3, reputation: -80 });
    expect(gut.sales).toBeGreaterThan(schlecht.sales);
    expect(reputationFactor(balance, -100)).toBeCloseTo(1 - B.share.reputationWeight);
    expect(reputationFactor(balance, 0)).toBe(1);
  });

  it('im Kreditcrash tanken die Leute weniger', () => {
    expect(regionDemand(balance, 'cordova', 1, { ...K3, crash: true })).toBeCloseTo(regionDemand(balance, 'cordova', 1, K3) * (1 - B.demand.crashDrop));
  });

  it('eine geschlossene Region verkauft nichts', () => {
    const m = regionMarket(newBrand('x', balance), balance, 'sierra_alta', K3);
    expect(m.demand).toBe(0);
    expect(m.sales).toBe(0);
  });
});

describe('Preiskampf', () => {
  it('beide billig: die Marge sinkt um priceWar.marginFactor', () => {
    const s = ok(setPricePolicy(mitTankstellen(3), balance, K3, 'cordova', 'billig'));
    const krieg: BrandState = {
      ...s.brand!,
      regions: { ...s.brand!.regions, cordova: { ...s.brand!.regions.cordova, crane: { ...s.brand!.regions.cordova.crane, price: 'billig' } } },
    };
    const m = regionMarket(krieg, balance, 'cordova', K3);
    expect(m.priceWar).toBe(true);
    expect(m.margin).toBeCloseTo(B.prices.billig.margin * B.priceWar.marginFactor);
  });

  it('Margaret Crane beginnt ihn, wenn Jacob stark wird – mit warChance 1 sicher, und hört nach warRounds auf', () => {
    const b2 = parseBalance({ ...rawBalance(), brand: { ...(rawBalance().brand as object), crane: { ...(rawBalance().brand as { crane: object }).crane, warChance: 1, reactShare: 0 } } });
    let s: GameState = ok(foundBrand(kapitel3(), b2, K3, 'harlan'));
    s = ok(buildStations(s, b2, K3, 'cordova', 2));
    s = settleBrand({ ...s, round: s.round + 1 }, b2, K3);
    expect(s.brand!.regions.cordova.crane.price).toBe('billig');
    expect(s.brand!.news).toContainEqual({ kind: 'priceWarStart', region: 'cordova' });
    for (let i = 0; i < b2.brand.crane.warRounds; i++) s = settleBrand({ ...s, round: s.round + 1 }, b2, K3);
    expect(s.brand!.regions.cordova.crane.price).toBe('normal');
    expect(s.brand!.regions.cordova.crane.cooldown).toBe(b2.brand.crane.cooldown);
    expect(s.brand!.news).toContainEqual({ kind: 'priceWarEnd', region: 'cordova' });
  });

  it('ohne Jacobs Tankstellen gibt es keinen Preiskampf', () => {
    const b2 = parseBalance({ ...rawBalance(), brand: { ...(rawBalance().brand as object), crane: { ...(rawBalance().brand as { crane: object }).crane, warChance: 1, reactShare: 0 } } });
    const s = settleBrand(kapitel3(), b2, K3);
    expect(Object.values(s.brand!.regions).every((r) => r.crane.price === 'normal')).toBe(true);
  });
});

describe('Crane baut aus', () => {
  it('liegt ihr Anteil unter dem Ziel, baut sie mit expandChance 1 sicher', () => {
    const b2 = parseBalance({
      ...rawBalance(),
      brand: { ...(rawBalance().brand as object), crane: { ...(rawBalance().brand as { crane: object }).crane, expandChance: 1, targetShare: 1 } },
    });
    const vorher = newBrand('x', b2).regions.cordova.crane.stations;
    const s = settleBrand(kapitel3('x'), b2, K3);
    expect(s.brand!.regions.cordova.crane.stations).toBe(vorher + b2.brand.crane.expandStations);
    // Sierra Alta ist in Kapitel 3 zu: dort tut sich nichts.
    expect(s.brand!.regions.sierra_alta.crane.stations).toBe(newBrand('x', b2).regions.sierra_alta.crane.stations);
  });

  it('nie über maxPerRegion', () => {
    const b2 = parseBalance({
      ...rawBalance(),
      brand: { ...(rawBalance().brand as object), crane: { ...(rawBalance().brand as { crane: object }).crane, expandChance: 1, targetShare: 1, expandStations: 100 } },
    });
    const s = settleBrand(kapitel3('x'), b2, K3);
    expect(s.brand!.regions.cordova.crane.stations).toBe(b2.brand.station.maxPerRegion);
  });
});

describe('Bekanntheit und Werbung', () => {
  it('Tankstellen machen die Marke bekannter, ohne sie verblasst sie', () => {
    let s = mitTankstellen(4);
    const a = s.brand!.regions.cordova.awareness;
    s = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
    expect(s.brand!.regions.cordova.awareness).toBeGreaterThan(a);
    // Alle verkauft: verblasst.
    const leer: GameState = { ...s, brand: { ...s.brand!, regions: { ...s.brand!.regions, cordova: { ...s.brand!.regions.cordova, stations: 0 } } } };
    const n = settleBrand({ ...leer, round: leer.round + 1 }, balance, K3);
    expect(n.brand!.regions.cordova.awareness).toBeCloseTo(s.brand!.regions.cordova.awareness * (1 - B.awareness.decay));
  });

  it('Werbung kostet, wirkt rounds Runden und läuft dann aus', () => {
    const plakate = B.campaigns.find((c) => c.id === 'plakate')!;
    let s = mitTankstellen(2);
    const ohne = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
    const vorher = s.cash;
    s = ok(startCampaign({ ...s, round: s.round + 1 }, balance, K3, 'cordova', 'plakate'));
    expect(s.cash).toBeCloseTo(vorher - plakate.cost);
    expect(campaignActive(s.brand!.regions.cordova, 'plakate', s.round)).toBe(true);
    expect(startCampaign(s, balance, K3, 'cordova', 'plakate')).toEqual({ ok: false, reason: 'running' });
    const mit = settleBrand(s, balance, K3);
    expect(mit.brand!.regions.cordova.awareness).toBeCloseTo(ohne.brand!.regions.cordova.awareness + plakate.gain);
    let t = mit;
    for (let i = 1; i < plakate.rounds; i++) t = settleBrand({ ...t, round: t.round + 1 }, balance, K3);
    expect(t.brand!.regions.cordova.campaigns).toEqual([]);
    expect(t.brand!.news).toContainEqual({ kind: 'campaignEnd', region: 'cordova', campaign: 'plakate' });
  });

  it('Werbung braucht Tankstellen und eine bekannte Art', () => {
    const s = ok(foundBrand(kapitel3(), balance, K3, 'harlan'));
    expect(startCampaign(s, balance, K3, 'cordova', 'plakate')).toEqual({ ok: false, reason: 'noStation' });
    expect(startCampaign(mitTankstellen(1), balance, K3, 'cordova', 'zeppelin')).toEqual({ ok: false, reason: 'campaign' });
  });

  it('ein Skandal kostet in jeder Region Bekanntheit', () => {
    const s = settleBrand({ ...mitTankstellen(4), round: 4 }, balance, K3);
    const a = s.brand!.regions.cordova.awareness;
    const n = applyBrandScandal(s, balance, 2);
    expect(n.brand!.regions.cordova.awareness).toBeCloseTo(Math.max(0, a - 2 * B.awareness.scandalLoss));
    expect(n.brand!.news.at(-1)).toEqual({ kind: 'scandal', severity: 2 });
    // Ohne Marke passiert nichts.
    const ohne = kapitel3();
    expect(applyBrandScandal(ohne, balance, 5)).toBe(ohne);
  });

  it('Bekanntheit kommt nur als Wort', () => {
    expect(awarenessWord(0)).toBe('unbekannt');
    expect(awarenessWord(20)).toBe('bekannt');
    expect(awarenessWord(50)).toBe('beliebt');
    expect(awarenessWord(90)).toBe('ueberall');
  });
});

describe('Abrechnung', () => {
  it('der Gewinn geht in die Kasse und steht im Protokoll', () => {
    const s = mitTankstellen(3);
    const n = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
    expect(n.cash).toBeCloseTo(s.cash + n.brand!.lastProfit);
    expect(n.brand!.lastProfit).toBeCloseTo(n.brand!.regions.cordova.last!.profit);
    expect(n.log.at(-1)).toContain('Tankstellen');
  });

  it('Unterhalt kostet auch ohne Absatz (teurer Preis im Crash kann Verlust bringen)', () => {
    const s = mitTankstellen(1);
    const m = regionMarket(s.brand!, balance, 'cordova', K3);
    expect(m.profit).toBeCloseTo(m.sales * m.margin - B.station.upkeep);
  });

  it('die Automobilisierung lässt die Nachfrage wachsen', () => {
    const s = settleBrand(kapitel3(), balance, K3);
    expect(s.brand!.motor).toBeCloseTo(1 + B.demand.growth);
  });

  it('fehlt eigenes Benzin (4.13), kostet der Zukauf boughtCost je Barrel', () => {
    const s = mitTankstellen(3);
    const frei = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
    const knapp = settleBrand({ ...s, round: s.round + 1 }, balance, { ...K3, ownGasoline: 0 });
    const absatz = frei.brand!.regions.cordova.last!.sales;
    expect(knapp.brand!.lastProfit).toBeCloseTo(frei.brand!.lastProfit - absatz * B.supply.boughtCost, 1);
  });

  it('ist deterministisch: gleicher Seed, gleiche Folge', () => {
    const lauf = () => {
      let s = mitTankstellen(4, 'det');
      for (let i = 0; i < 8; i++) s = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
      return s.brand;
    };
    expect(lauf()).toEqual(lauf());
  });

  it('läuft über endRound, wenn das Kapitel (4.5) 3 ist', () => {
    const s = { ...newGame('rund', balance), chapter: 3 } as GameState & { chapter: number };
    const n = endRound(s, balance);
    expect(n.brand).toBeDefined();
    expect(n.brand!.motor).toBeCloseTo(1 + B.demand.growth);
  });
});

describe('Kennzahlen', () => {
  it('nationaler Anteil = Jacobs Absatz / Nachfrage aller offenen Regionen', () => {
    const s = settleBrand({ ...mitTankstellen(5), round: 5 }, balance, K3);
    const res = Object.values(s.brand!.regions).flatMap((r) => (r.last ? [r.last] : []));
    const erwartet = res.reduce((a, x) => a + x.sales, 0) / res.reduce((a, x) => a + x.demand, 0);
    expect(nationalShare(s.brand).jacob).toBeCloseTo(erwartet);
    expect(nationalShare(undefined)).toEqual({ jacob: 0, crane: 0 });
  });

  it('Kapitelziel: Marke in 3 Regionen erfüllt es', () => {
    let s = ok(foundBrand(kapitel3(), balance, K3, 'harlan'));
    for (const id of ['cordova', 'okara', 'mittelland']) s = ok(buildStations(s, balance, K3, id, B.goal.presenceStations));
    expect(brandGoal(s.brand, balance).regions).toBe(0);
    s = settleBrand({ ...s, round: s.round + 1 }, balance, K3);
    const g = brandGoal(s.brand, balance);
    expect(g.regions).toBe(3);
    expect(g.regionsReached).toBe(true);
    expect(g.reached).toBe(true);
    expect(brandGoal(undefined, balance).reached).toBe(false);
  });

  it('Kartellrisiko ab regional 25 %', () => {
    const s = mitTankstellen(1);
    const stark: BrandState = {
      ...s.brand!,
      regions: { ...s.brand!.regions, cordova: { ...s.brand!.regions.cordova, last: { ...s.brand!.regions.cordova.last!, share: B.antitrust.regional } } },
    };
    expect(brandAntitrust(stark, balance).regions).toEqual(['cordova']);
    expect(brandAntitrust(undefined, balance)).toEqual({ regions: [], national: false });
  });

  it('Markenwert wächst mit der Bekanntheit und hängt am Ruf', () => {
    const s = settleBrand({ ...mitTankstellen(5), round: 5 }, balance, K3);
    const gut = brandValue(s.brand, balance, { ...K3, reputation: 50 });
    const schlecht = brandValue(s.brand, balance, { ...K3, reputation: -50 });
    expect(gut).toBeGreaterThan(schlecht);
    expect(brandValue(newBrand('x', balance), balance, K3)).toBe(0);
  });

  it('Tankstellen und Markenwert zählen im Imperiumswert; ohne Marke bleibt er gleich', () => {
    const s = mitTankstellen(3);
    const ohne: GameState = { ...s, brand: undefined };
    expect(brandAssets(ohne, balance)).toBe(0);
    expect(empireValue(s, balance)).toBeCloseTo(empireValue(ohne, balance) + brandAssets(s, balance), 1);
    expect(brandAssets(s, balance)).toBeGreaterThan(0);
  });
});

describe('Spielstand', () => {
  it('Marke übersteht Sichern und Laden', () => {
    const s = settleBrand({ ...mitTankstellen(2), round: 4 }, balance, K3);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect(geladen.state.brand).toEqual(s.brand);
  });

  it('Stände ohne Marke laden weiter', () => {
    expect(deserializeGame(serializeGame(newGame('alt', balance), 'test')).ok).toBe(true);
  });

  it('eine kaputte Marke wird abgelehnt', () => {
    const s = mitTankstellen(1);
    expect(isBrandState(s.brand)).toBe(true);
    const kaputt = { ...s, brand: { ...s.brand!, regions: { cordova: { ...s.brand!.regions.cordova, price: 'umsonst' } } } };
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
    expect(isBrandState({ ...s.brand!, motor: Number.NaN })).toBe(false);
  });
});

describe('Spielzahlen (balance.yaml, brand)', () => {
  it('fehlt der Block, meldet parseBalance einen BalanceError', () => {
    const r = rawBalance();
    delete (r as Record<string, unknown>).brand;
    expect(() => parseBalance(r)).toThrow(BalanceError);
  });

  it('doppelte Regionen und falsche Preisordnung fallen auf', () => {
    const r = rawBalance();
    const brand = r.brand as { regions: unknown[]; prices: Record<string, { attract: number; margin: number }> };
    expect(() => parseBalance({ ...r, brand: { ...brand, regions: [...brand.regions, brand.regions[0]] } })).toThrow(/zweimal/);
    expect(() => parseBalance({ ...r, brand: { ...brand, prices: { ...brand.prices, billig: { attract: 0.5, margin: 1 } } } })).toThrow(BalanceError);
  });
});

describe('Texte (content/brand.yaml)', () => {
  const text = readFileSync(new URL('../../content/brand.yaml', import.meta.url), 'utf8');
  const { content, errors } = parseBrandContent('content/brand.yaml', text);

  it('sind vollständig und passen zu balance.yaml', () => {
    expect(errors).toEqual([]);
    expect(checkBrandRefs('content/brand.yaml', content!, balance)).toEqual([]);
  });

  it('melden fehlende Regionen und Tippfehler', () => {
    const fehlt = { ...content!, regions: { cordova: content!.regions.cordova, ostkuste: { de: 'X', en: '' } } };
    const meldungen = checkBrandRefs('content/brand.yaml', fehlt, balance).map((e) => e.message);
    expect(meldungen.some((m) => m.includes('okara'))).toBe(true);
    expect(meldungen.some((m) => m.includes('ostkuste'))).toBe(true);
  });

  it('melden kaputtes YAML und fehlende Blöcke', () => {
    expect(parseBrandContent('x', 'a: [').content).toBeNull();
    expect(parseBrandContent('x', 'draft: true\n').errors.length).toBeGreaterThan(0);
  });

  it('machen aus Nachrichten Sätze mit Regionsnamen', () => {
    expect(brandNewsText(content!, { kind: 'craneExpand', region: 'ostkueste', count: 2 })).toBe('Ostküste: Crane baut 2 neue Tankstellen.');
    expect(brandNewsText(content!, { kind: 'opened', region: 'mittelland', count: 1 }, 'en')).toContain('Midlands');
  });
});
