import { describe, expect, it } from 'vitest';
import type { Balance, TransportMode } from './balance';
import { empireValue } from './empire';
import { applyEffects, drawEvents } from './events';
import { endRound, newGame, type GameState } from './game';
import {
  advanceLogistics,
  buildPipeline,
  buildTank,
  compareRoutes,
  dismissTeam,
  hireTeam,
  logisticsAssets,
  pipelineCredible,
  routeCost,
  sabotageChance,
  setGuards,
  settleStorage,
  spillOver,
  storageCapacity,
  surveyPipeline,
  traderGain,
  type RouteScenario,
} from './logistics';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { advanceTransport, buyerPrice, capacityLeft, netPrice, sellOil, tariff } from './transport';
import { craneCut } from './trust';

const balance = loadBalance();
const T = balance.transport;
const catalog = loadEvents();

function spiel(extra: Partial<GameState> = {}, seed = 'logistik'): GameState {
  return { ...newGame(seed, balance), ...extra };
}

function ok<S extends { ok: true; state: GameState } | { ok: false; reason: string }>(r: S): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function mitMarks(state: GameState, marks: Record<string, number>): GameState {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, ...marks } } };
}

function mit(patch: { storage?: Partial<Balance['transport']['storage']>; pipeline?: Partial<Balance['transport']['pipeline']> }): Balance {
  return {
    ...balance,
    transport: { ...T, storage: { ...T.storage, ...patch.storage }, pipeline: { ...T.pipeline, ...patch.pipeline } },
  };
}

describe('Lager (0.2.15+2)', () => {
  it('Startkapazität plus Zusatztanks', () => {
    const s = spiel();
    expect(storageCapacity(s, balance)).toBe(T.storage.startCapacity);
    expect(storageCapacity({ logistics: { ...s.logistics, tanks: 2 } }, balance)).toBe(T.storage.startCapacity + 2 * T.storage.tankCapacity);
  });

  it('ein Tank kostet tankCost, ist erst zum Rundenende fertig und zählt zum Imperiumswert', () => {
    const s = spiel({ cash: 1000 });
    const gebaut = ok(buildTank(s, balance));
    expect(gebaut.cash).toBe(1000 - T.storage.tankCost);
    expect(storageCapacity(gebaut, balance)).toBe(T.storage.startCapacity);
    expect(logisticsAssets(gebaut, balance)).toBe(T.assetShare * T.storage.tankCost);
    const fertig = settleStorage(gebaut, balance);
    expect(storageCapacity(fertig, balance)).toBe(T.storage.startCapacity + T.storage.tankCapacity);
  });

  it('ohne Geld oder über maxTanks kein Tank', () => {
    expect(buildTank(spiel({ cash: 10 }), balance).ok).toBe(false);
    const voll = spiel({ cash: 1e6 });
    expect(buildTank({ ...voll, logistics: { ...voll.logistics, tanks: T.storage.maxTanks } }, balance).ok).toBe(false);
  });

  it('Lagerkosten und Schwund je Runde; das Öl der Landbesitzer schrumpft anteilig', () => {
    const b = mit({ storage: { fireChance: 0 } });
    const s = settleStorage(spiel({ cash: 1000, oilStock: 10_000, royaltyOil: 1000 }), b);
    expect(s.cash).toBeCloseTo(1000 - 10_000 * T.storage.costPerBarrel, 2);
    expect(s.oilStock).toBeCloseTo(10_000 * (1 - T.storage.shrink), 6);
    expect(s.royaltyOil / s.oilStock).toBeCloseTo(0.1, 9);
  });

  it('ein Tankbrand vernichtet fireLoss des Öls (eigener Zufall – die Welt bleibt gleich)', () => {
    const b = mit({ storage: { fireChance: 1, shrink: 0 } });
    const s0 = spiel({ oilStock: 10_000 });
    const s = settleStorage(s0, b);
    expect(s.oilStock).toBeCloseTo(10_000 * (1 - T.storage.fireLoss), 6);
    expect(s.log.at(-1)).toMatch(/brennt/);
    expect(s.rng).toBe(s0.rng);
  });

  it('was über die Tanks hinaus gefördert wird, läuft aus', () => {
    const s = spillOver(spiel({ oilStock: T.storage.startCapacity + 5000, royaltyOil: 2000 }), balance);
    expect(s.oilStock).toBe(T.storage.startCapacity);
    expect(s.royaltyOil).toBeLessThan(2000);
    expect(s.log.at(-1)).toMatch(/laufen in den Boden/);
    expect(spillOver(spiel({ oilStock: 100 }), balance).oilStock).toBe(100);
  });

  it('im Rundenende: übervoller Tank wird auf die Kapazität gekappt', () => {
    const s = endRound(spiel({ oilStock: 1e6, cash: 1e6 }), balance);
    expect(s.oilStock).toBeLessThanOrEqual(T.storage.startCapacity);
  });

  it('Verkaufs-Timing: Lagern kostet je Runde weniger als ein Preissprung von 10 %', () => {
    const s = spiel({ oilStock: 10_000 });
    const kostenJeBarrel = T.storage.costPerBarrel + (T.storage.shrink + T.storage.fireChance * T.storage.fireLoss) * s.postedPrice;
    expect(kostenJeBarrel).toBeLessThan(0.1 * s.postedPrice);
    expect(kostenJeBarrel).toBeGreaterThan(0);
  });
});

describe('Eigene Fuhrwerke (0.2.15+2)', () => {
  it('ohne Gespann kein eigener Transport', () => {
    const s = spiel({ oilStock: 1000 });
    expect(capacityLeft(s, balance, 'teams')).toBe(0);
    expect(sellOil(s, balance, 'teams', 100).ok).toBe(false);
  });

  it('ein Gespann kostet hireCost, setzt das Merkzeichen und schafft capacity je Runde', () => {
    const s = ok(hireTeam(spiel({ cash: 1000, oilStock: 5000 }), balance));
    expect(s.cash).toBe(1000 - T.teams.hireCost);
    expect(s.events.marks.fuhrleute_eigen).toBe(1);
    expect(capacityLeft(s, balance, 'teams')).toBe(T.teams.capacity);
    const verkauft = ok(sellOil(s, balance, 'teams', T.teams.capacity));
    expect(capacityLeft(verkauft, balance, 'teams')).toBe(0);
    expect(tariff(s, balance, 'teams')).toBe(T.teams.costPerBarrel);
  });

  it('Lohn wird jede Runde fällig, auch wenn nichts fährt', () => {
    const s = { ...spiel({ cash: 1000 }), logistics: { ...spiel().logistics, teams: 2 } };
    expect(advanceLogistics(s, balance).cash).toBe(1000 - 2 * T.teams.wagePerRound);
  });

  it('Streik (Effekt teamsIdle): Gespanne stehen bis Runde jetzt+n still', () => {
    const s = { ...spiel({ oilStock: 1000 }), logistics: { ...spiel().logistics, teams: 1 } };
    const streik = applyEffects(s, { teamsIdle: 1 });
    expect(capacityLeft(streik, balance, 'teams')).toBe(0);
    expect(capacityLeft({ ...streik, round: 2 }, balance, 'teams')).toBe(0);
    expect(capacityLeft({ ...streik, round: 3 }, balance, 'teams')).toBe(T.teams.capacity);
    expect(applyEffects(s, { teams: -5 }).logistics.teams).toBe(0);
  });

  it('abgeben bringt resale zurück; höchstens maxTeams', () => {
    const s = { ...spiel({ cash: 0 }), logistics: { ...spiel().logistics, teams: T.teams.maxTeams } };
    expect(hireTeam({ ...s, cash: 1e6 }, balance).ok).toBe(false);
    expect(ok(dismissTeam(s, balance)).cash).toBe(T.teams.hireCost * T.teams.resale);
    expect(dismissTeam(spiel(), balance).ok).toBe(false);
  });
});

describe('Pipeline (0.2.15+2)', () => {
  it('Route vermessen kostet surveyCost und bringt die Wegerecht-Ereignisse', () => {
    const s = ok(surveyPipeline(spiel({ cash: 1000 }), balance));
    expect(s.cash).toBe(1000 - T.pipeline.surveyCost);
    expect(s.logistics.pipeline).toBe('surveyed');
    const gezogen = drawEvents({ ...s, round: 2 }, balance, catalog);
    const offen = [...gezogen.events.pending];
    expect(offen).toContain('wegerecht_moss');
    expect(offen).toContain('wegerecht_bahndamm');
  });

  it('bauen nur mit allen Wegerechten und genug Geld', () => {
    const vermessen = ok(surveyPipeline(spiel({ cash: 1e5 }), balance));
    expect(buildPipeline(vermessen, balance).ok).toBe(false);
    const rechte = Object.fromEntries(T.pipeline.rights.map((r) => [r.mark, 1]));
    expect(buildPipeline({ ...mitMarks(vermessen, rechte), cash: 100 }, balance).ok).toBe(false);
    const bau = ok(buildPipeline(mitMarks(vermessen, rechte), balance));
    expect(bau.logistics.pipeline).toBe('building');
    expect(bau.logistics.pipelineRounds).toBe(T.pipeline.buildRounds);
  });

  it('nach buildRounds Rundenenden läuft sie: billig, große Kapazität, Kapitelbonus-Merkzeichen', () => {
    let s: GameState = { ...spiel({ cash: 1e5, oilStock: 1000 }), logistics: { ...spiel().logistics, pipeline: 'building', pipelineRounds: T.pipeline.buildRounds } };
    for (let i = 0; i < T.pipeline.buildRounds; i++) {
      expect(capacityLeft(s, balance, 'pipeline')).toBe(0);
      s = advanceLogistics(s, balance);
    }
    expect(s.logistics.pipeline).toBe('ready');
    expect(s.events.marks.pipeline_gebaut).toBeDefined();
    expect(capacityLeft(s, balance, 'pipeline')).toBe(T.pipeline.capacity);
    expect(netPrice(s, balance, 'pipeline')).toBeGreaterThan(netPrice(s, balance, 'rail'));
  });

  it('Sabotage legt sie still und kostet die Reparatur; danach läuft sie wieder', () => {
    const b = mit({ pipeline: { sabotageChance: 1 } });
    const s0 = { ...spiel({ cash: 5000 }), logistics: { ...spiel().logistics, pipeline: 'ready' as const } };
    const kaputt = advanceLogistics(s0, b);
    expect(kaputt.logistics.pipeline).toBe('damaged');
    expect(kaputt.cash).toBe(5000 - T.pipeline.upkeepPerRound - T.pipeline.repairCost);
    expect(capacityLeft(kaputt, b, 'pipeline')).toBe(0);
    let s = kaputt;
    for (let i = 0; i < T.pipeline.repairRounds; i++) s = advanceLogistics(s, b);
    expect(s.logistics.pipeline).toBe('ready');
  });

  it('Feinde verdoppeln die Sabotage-Chance, Wachleute senken sie', () => {
    const s0 = { ...spiel(), logistics: { ...spiel().logistics, pipeline: 'ready' as const } };
    const basis = sabotageChance(s0, balance);
    expect(sabotageChance(mitMarks(s0, { bullard_fehde: 2 }), balance)).toBeCloseTo(basis * T.pipeline.sabotageFactor, 9);
    const bewacht = ok(setGuards(s0, true));
    expect(sabotageChance(bewacht, balance)).toBeCloseTo(basis * T.pipeline.guardsFactor, 9);
    expect(advanceLogistics({ ...bewacht, cash: 1000 }, mit({ pipeline: { sabotageChance: 0 } })).cash).toBe(
      1000 - T.pipeline.upkeepPerRound - T.pipeline.guardsPerRound,
    );
  });
});

describe('Glaubwürdigkeit der Pipeline (Druckmittel gegen Thorne, Etappe 2 – die alte Drohung entfällt)', () => {
  it('ohne Geld und Wegerechte glaubt Thorne nicht an die Pipeline, mit dem Geld für den Bau schon', () => {
    expect(pipelineCredible(spiel({ cash: 100 }), balance)).toBe(false);
    expect(pipelineCredible(spiel({ cash: T.pipeline.buildCost }), balance)).toBe(true);
  });

  it('auch mit allen Wegerechten (ohne Geld) glaubt Thorne die Drohung', () => {
    const s = ok(surveyPipeline(spiel({ cash: 200 }), balance));
    const rechte = Object.fromEntries(T.pipeline.rights.map((r) => [r.mark, 1]));
    expect(pipelineCredible(mitMarks(s, rechte), balance)).toBe(true);
  });

  it('Exklusivvertrag: Tarif fest, jeder andere Weg kostet exclusivePenalty', () => {
    const s = mitMarks(spiel({ oilStock: 5000 }), { thorne_vertrag: 1, thorne_exklusiv: 1 });
    expect(tariff(s, balance, 'wagon')).toBeCloseTo(T.wagon.costPerBarrel + T.thorne.exclusivePenalty, 9);
    expect(tariff(s, balance, 'rail')).toBe(s.railTariff);
    const nachher = { ...s, round: 1 + balance.rivals.thorne.contractRounds };
    expect(tariff(nachher, balance, 'wagon')).toBe(T.wagon.costPerBarrel);
  });

  it('Mengenrabatt: billiger je Barrel, unter der Mindestmenge kostet jedes fehlende Barrel Strafe (nicht in der Unterschriftsrunde)', () => {
    const s = mitMarks(spiel({ oilStock: 20_000, cash: 1000 }), { thorne_mengenrabatt: 1 });
    expect(tariff(s, balance, 'rail')).toBeCloseTo(s.railTariff - T.thorne.volumeDiscount, 9);
    expect(advanceTransport(s, balance).cash).toBe(1000);
    const r2 = { ...s, round: 2 };
    expect(advanceTransport(r2, balance).cash).toBe(1000 - T.thorne.minVolume * T.thorne.shortfallPenalty);
    const genug = ok(sellOil(r2, balance, 'rail', T.thorne.minVolume));
    expect(advanceTransport(genug, balance).cash).toBe(genug.cash);
  });
});

describe('Zweiter Käufer: Händler in Port Ellis (0.2.15+2)', () => {
  it('zahlt Posted Price plus Aufschlag, nimmt nur capacity je Runde', () => {
    const s = spiel({ oilStock: 10_000 });
    expect(buyerPrice(s, balance, 'trader')).toBeCloseTo(s.postedPrice + T.trader.premium, 9);
    const r = ok(sellOil(s, balance, 'rail', T.trader.capacity, 'trader'));
    expect(r.cash).toBeGreaterThan(ok(sellOil(s, balance, 'rail', T.trader.capacity)).cash);
    expect(sellOil(r, balance, 'rail', 1, 'trader').ok).toBe(false);
    expect(r.events.marks.haendler_kunde).toBe(1);
    expect(advanceTransport(r, balance).logistics.traderSold).toBe(0);
  });

  it('Crane merkt es sich: grudgeRounds Runden lang zahlt er grudgeCut weniger', () => {
    const r = ok(sellOil(spiel({ oilStock: 1000 }), balance, 'rail', 100, 'trader'));
    expect(craneCut(r, balance)).toBe(0);
    expect(craneCut({ ...r, round: 2 }, balance)).toBe(T.trader.grudgeCut);
    expect(craneCut({ ...r, round: 1 + T.trader.grudgeRounds }, balance)).toBe(T.trader.grudgeCut);
    expect(craneCut({ ...r, round: 2 + T.trader.grudgeRounds }, balance)).toBe(0);
  });
});

describe('Kein Weg dominiert immer – Beispielrechnungen (0.2.15+2)', () => {
  const best = (s: RouteScenario): TransportMode => compareRoutes(balance, s)[0].mode;

  it('kleine Menge, Bahn zum Starttarif: die Bahn', () => {
    expect(best({ volume: 1000, rounds: 8, railTariff: T.rail.costPerBarrel })).toBe('rail');
  });

  it('winzige Menge, Thorne hat erhöht: das gemietete Fuhrwerk (eigene Gespanne lohnen nicht)', () => {
    expect(best({ volume: 200, rounds: 8, railTariff: 0.7 })).toBe('wagon');
  });

  it('mittlere Menge, Bahn teurer geworden: eigene Fuhrwerke', () => {
    const lage = { volume: 4000, rounds: 8, railTariff: 0.45 };
    expect(best(lage)).toBe('teams');
    expect(routeCost(balance, lage, 'teams').teams).toBe(2);
  });

  it('große Menge, viele Runden übrig: die Pipeline trotz Baukosten', () => {
    expect(best({ volume: 20_000, rounds: 12, railTariff: 0.35 })).toBe('pipeline');
  });

  it('große Menge, aber spät im Kapitel: die Pipeline zahlt sich nicht mehr aus', () => {
    const lage = { volume: 20_000, rounds: 4, railTariff: T.rail.costPerBarrel };
    expect(best(lage)).toBe('rail');
    expect(routeCost(balance, { ...lage, pipelineBuilt: true }, 'pipeline').perBarrel).toBeLessThan(T.rail.costPerBarrel);
  });

  it('jeder der vier Wege gewinnt in mindestens einer Lage', () => {
    const lagen: RouteScenario[] = [];
    for (const volume of [200, 1000, 4000, 20_000]) {
      for (const rounds of [4, 12]) for (const railTariff of [0.25, 0.45, 0.7]) lagen.push({ volume, rounds, railTariff });
    }
    expect(new Set(lagen.map(best))).toEqual(new Set(['wagon', 'rail', 'teams', 'pipeline']));
  });

  it('Händler lohnt bei kleiner Förderung, bei großer kostet Cranes Groll mehr als der Aufschlag', () => {
    expect(traderGain(balance, 2000)).toBeGreaterThan(0);
    expect(traderGain(balance, 15_000)).toBeLessThan(0);
  });

  it('Mengenrabatt lohnt ab Menge, Exklusivvertrag nur, wenn alles per Bahn geht', () => {
    const rabatt = (menge: number) => {
      const s = mitMarks(spiel({ oilStock: 20_000, cash: 0, round: 2 }), { thorne_mengenrabatt: 1 });
      const ohne = { ...s, events: { ...s.events, marks: {} } };
      const mitV = advanceTransport(ok(sellOil(s, balance, 'rail', menge)), balance).cash;
      const ohneV = advanceTransport(ok(sellOil(ohne, balance, 'rail', menge)), balance).cash;
      return mitV - ohneV;
    };
    expect(rabatt(2000)).toBeLessThan(0);
    expect(rabatt(8000)).toBeGreaterThan(0);
    const exkl = mitMarks(spiel(), { thorne_vertrag: 1, thorne_exklusiv: 1 });
    expect(netPrice(exkl, balance, 'teams')).toBeLessThan(netPrice(spiel(), balance, 'teams'));
  });
});

describe('Spielstand (0.2.15+2)', () => {
  it('Format 10+ sichert Lager, Fuhrwerke und Pipeline mit', () => {
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(10);
    const s = { ...spiel(), logistics: { ...spiel().logistics, teams: 2, tanks: 1, pipeline: 'building' as const, pipelineRounds: 2 } };
    const r = deserializeGame(serializeGame(s, 'test'));
    expect(r.ok && r.state.logistics).toEqual(s.logistics);
  });

  it('ältere Spielstände (Format 9) bekommen Ersatzwerte', () => {
    const s = spiel();
    const alt: Record<string, unknown> = { ...s, shipped: { wagon: 0, rail: 0 } };
    delete alt.logistics;
    const r = deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: 'alt', savedRound: 1, state: alt }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.logistics.teams).toBe(0);
      expect(r.state.shipped).toEqual({ wagon: 0, rail: 0, teams: 0, pipeline: 0 });
    }
  });

  it('Anlagen zählen zum Imperiumswert', () => {
    const s = spiel();
    const mitPipe = { ...s, logistics: { ...s.logistics, pipeline: 'ready' as const } };
    expect(empireValue(mitPipe, balance) - empireValue(s, balance)).toBeCloseTo(T.assetShare * T.pipeline.buildCost, 2);
  });
});

describe('Inhalte (0.2.15+2)', () => {
  it('jedes Wegerecht setzt eine Wahl in content/events/', () => {
    const gesetzt = new Set(catalog.flatMap((e) => e.choices.flatMap((c) => c.marks)));
    for (const r of T.pipeline.rights) expect(gesetzt, r.mark).toContain(r.mark);
  });

  it('Thornes Brief bietet Exklusivvertrag, Mengenrabatt und Absage', () => {
    const brief = catalog.find((e) => e.id === 'thorne_frachtvertrag')!;
    const marks = brief.choices.flatMap((c) => c.marks);
    expect(marks).toEqual(expect.arrayContaining(['thorne_vertrag', 'thorne_exklusiv', 'thorne_mengenrabatt', 'thorne_abgelehnt']));
  });

  it('0.4.19+3: der Mengenrabatt nennt Rabatt, Mindestmenge, Strafe und Laufzeit aus balance.yaml und braucht eine fördernde Quelle', () => {
    const brief = catalog.find((e) => e.id === 'thorne_frachtvertrag')!;
    const rabatt = brief.choices.find((c) => c.id === 'mengenrabatt')!;
    const de = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 2 });
    const etikett = rabatt.label.de;
    expect(etikett).toContain(`${de(T.thorne.volumeDiscount)} $`);
    expect(etikett).toContain(`${T.thorne.minVolume.toLocaleString('de-DE')} bbl`);
    expect(etikett).toContain(`${de(T.thorne.shortfallPenalty)} $ Strafe`);
    expect(etikett).toContain(`${balance.rivals.thorne.contractRounds} Runden`);
    expect(rabatt.requires.minProducingWells).toBe(1);
  });
});
