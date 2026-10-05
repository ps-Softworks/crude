// Termine als Hauptwerkzeug, Etappe 2: Transport-Aktionen (Plan 2.3, Tests 2.6 „Transport“ und „Gemeinsam“).
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import {
  brennanActive,
  freightLevers,
  freightPressure,
  freightView,
  newFreight,
  poolJoinChance,
  poolVolume,
  settleFreight,
  thorneResistance,
  visitThorne,
  FREIGHT_HANDLERS,
} from './freight';
import { newGame, type GameState } from './game';
import { pipelineBuildCost } from './logistics';
import { bookCard, planView } from './plans';
import { joinChance, newPricing } from './pricing';
import { deserializeGame, SAVE_FORMAT } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { capacityLeft, tariff } from './transport';
import { hikeChance, railFrozen, RIVAL_MARKS } from './trust';

const balance = loadBalance();
const katalog = loadEvents();
const F = balance.freight;
const TH = balance.transport.thorne;

/** Thornes Laune immer neutral und Widerstand-Grundwert 2 (wie im Plan) – damit die Stufen fest sind. */
const NEUTRAL: Balance = { ...balance, freight: { ...F, mood: { down: 0, up: 0 }, resistance: { ...F.resistance, base: 2 } } };

function ok(r: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function spiel(seed: string, patch: Partial<GameState> = {}): GameState {
  return { ...newGame(seed, balance, katalog), cash: 5000, ...patch };
}

/** Bahnmenge der Vorrunde setzen (gebündelte Menge). */
function bahn(s: GameState, menge: number): GameState {
  return { ...s, freight: { ...s.freight, railLast: menge } };
}

describe('Druckmittel und Widerstand (Plan 2.3)', () => {
  it('gebündelte Bahnmenge ab 8.000 und ab 20.000 bbl zählt je einen Punkt', () => {
    expect(freightPressure(bahn(spiel('druck'), 7000), balance)).toBe(0);
    expect(freightLevers(bahn(spiel('druck'), 8000), balance).filter((l) => l.ok).map((l) => l.key)).toEqual(['bundle']);
    expect(freightLevers(bahn(spiel('druck'), 20000), balance).filter((l) => l.ok).map((l) => l.key)).toEqual(['bundle', 'bundleBig']);
  });

  it('Ausweichwege (Gespanne, Brennan, Pipeline) für die Hälfte der Bahnmenge und eine glaubwürdige Pipeline sind Druckmittel', () => {
    const s = bahn(spiel('ausweich'), 4000);
    const gespanne = { ...s, logistics: { ...s.logistics, teams: 1 } };
    expect(freightLevers(gespanne, balance).find((l) => l.key === 'fallback')?.ok).toBe(true);
    expect(freightLevers({ ...s, cash: balance.transport.pipeline.buildCost }, balance).find((l) => l.key === 'pipeline')?.ok).toBe(true);
  });

  it('Widerstand: 2 + 1 je Zugeständnis der letzten 4 Runden + 1 bei Fehde mit Bullard', () => {
    const s = spiel('widerstand');
    expect(thorneResistance(s, balance)).toBe(F.resistance.base);
    const zwei = { ...s, round: 6, freight: { ...s.freight, concessions: [1, 3, 5] } };
    expect(thorneResistance(zwei, balance)).toBe(F.resistance.base + 2);
    const fehde = { ...zwei, events: { ...zwei.events, marks: { ...zwei.events.marks, [RIVAL_MARKS.bullardFeud]: 1 } } };
    expect(thorneResistance(fehde, balance)).toBe(F.resistance.base + 2 + F.resistance.feud);
  });

  it('Ergebnisstufen: ≤ 0 Abfuhr (Erhöhung × 2 für 4 Runden), 1 −0,05, 2 −0,10 und 2 Runden Ruhe, ≥ 3 −0,15 und 4 Runden Ruhe', () => {
    const s = { ...spiel('stufen'), railTariff: 0.55 };
    const abfuhr = visitThorne(s, NEUTRAL, false);
    expect(abfuhr.railTariff).toBe(0.55);
    expect(abfuhr.freight.hikeDoubleUntil).toBe(s.round + F.rebuff.rounds - 1);
    expect(hikeChance(abfuhr, balance)).toBeCloseTo(Math.min(1, TH.hikeChance * F.rebuff.factor), 9);
    expect(hikeChance({ ...abfuhr, round: s.round + F.rebuff.rounds }, balance)).toBeCloseTo(TH.hikeChance, 9);
    // Stufe 1: drei Druckmittel gegen Widerstand 2.
    const drei = { ...bahn(s, 20000), worldModel: { ...s.worldModel, laws: { ...s.worldModel.laws, bills: { ...s.worldModel.laws.bills, antitrust: { ...s.worldModel.laws.bills.antitrust, stage: 'debate' as const } } } } };
    expect(freightPressure(drei, balance)).toBe(3);
    expect(visitThorne(drei, NEUTRAL, false).railTariff).toBeCloseTo(0.55 - F.cuts[0], 9);
    const vier = { ...drei, logistics: { ...drei.logistics, teams: 5 } };
    const zwei = visitThorne(vier, NEUTRAL, false);
    expect(zwei.railTariff).toBeCloseTo(0.55 - F.cuts[1], 9);
    expect(railFrozen(zwei, balance)).toBe(true);
    expect(railFrozen({ ...zwei, round: s.round + F.freeze[1] }, balance)).toBe(false);
    const fuenf = { ...vier, cash: balance.transport.pipeline.buildCost };
    const voll = visitThorne(fuenf, NEUTRAL, false);
    expect(voll.railTariff).toBeCloseTo(0.55 - F.cuts[2], 9);
    expect(voll.freight.freezeUntil).toBe(s.round + F.freeze[2] - 1);
    // Sondertarif statt Senkung – und nach Ablauf der alte Tarif.
    const sonder = visitThorne(fuenf, NEUTRAL, true);
    expect(sonder.railTariff).toBe(F.special.tariff);
    const vorbei = settleFreight({ ...sonder, round: s.round + F.special.rounds }, balance);
    expect(vorbei.railTariff).toBe(0.55);
    expect(vorbei.freight.special).toBeNull();
  });

  it('nie unter minTariff', () => {
    const s = { ...bahn(spiel('boden'), 30000), railTariff: TH.minTariff + 0.02, cash: balance.transport.pipeline.buildCost };
    const voll = { ...s, logistics: { ...s.logistics, teams: 5 } };
    expect(visitThorne(voll, NEUTRAL, false).railTariff).toBe(TH.minTariff);
  });

  it('Thornes Laune würfelt aus dem eigenen Strang: gleicher Seed und Runde ⇒ gleiches Ergebnis, Weltzufall unberührt', () => {
    const s = bahn({ ...spiel('laune'), railTariff: 0.55 }, 20000);
    expect(visitThorne(s, balance, false).railTariff).toBe(visitThorne(s, balance, false).railTariff);
    expect(visitThorne(s, balance, false).rng).toBe(s.rng);
  });

  it('mit Exklusivvertrag ist das Vorsprechen gesperrt', () => {
    const s = spiel('exklusiv');
    const ex = { ...s, events: { ...s.events, marks: { ...s.events.marks, [RIVAL_MARKS.thorneExclusive]: s.round, [RIVAL_MARKS.thorneContract]: s.round } } };
    expect(planView(ex, balance, katalog).cards.find((c) => c.id === 'thorne_vorsprechen')?.reason).toMatch(/Exklusivvertrag/);
  });
});

describe('Bluff-Prüfung (Plan 2.3)', () => {
  /** Zugeständnis, das an Ausweichwegen hing (ohne sie wäre es eine Abfuhr). */
  function geblufft(seed: string): GameState {
    const s = { ...bahn(spiel(seed), 20000), railTariff: 0.55 };
    return visitThorne({ ...s, logistics: { ...s.logistics, teams: 5 } }, NEUTRAL, false);
  }

  it('hing das Zugeständnis an Ausweichwegen oder Pipeline, prüft Thorne die zwei Folgerunden', () => {
    const v = geblufft('bluff');
    expect(v.freight.bluffCheck).toEqual({ from: v.round + 1, until: v.round + F.bluff.rounds, rail: 0, total: 0 });
    expect(v.freight.bluffsRisked).toBe(1);
  });

  it('gehen danach mehr als 80 % per Bahn: +0,10 $ und Groll (Erhöhung × 2 für 4 Runden)', () => {
    const v = geblufft('bluff-fang');
    let s: GameState = { ...v, round: v.round + 1, shipped: { wagon: 0, rail: 10000, teams: 0, pipeline: 0 } };
    s = settleFreight(s, balance);
    s = settleFreight({ ...s, round: s.round + 1 }, balance);
    expect(s.railTariff).toBeCloseTo(v.railTariff + F.bluff.penalty, 9);
    expect(s.freight.bluffsCaught).toBe(1);
    expect(s.freight.hikeDoubleUntil).toBe(v.round + 2 + F.rebuff.rounds - 1);
  });

  it('hält Jacob die Drohung ein (Bahnanteil unter 80 %), passiert nichts', () => {
    const v = geblufft('bluff-ehrlich');
    let s: GameState = { ...v, round: v.round + 1, shipped: { wagon: 0, rail: 5000, teams: 5000, pipeline: 0 } };
    s = settleFreight(s, balance);
    s = settleFreight({ ...s, round: s.round + 1 }, balance);
    expect(s.railTariff).toBe(v.railTariff);
    expect(s.freight.bluffCheck).toBeNull();
    expect(s.freight.bluffsCaught).toBe(0);
  });
});

describe('Brennan (Plan 2.3)', () => {
  it('ersetzt die Mietfuhrwerke: 0,35 $ je bbl, 5.000 bbl, 4 Runden', () => {
    const s = ok(bookCard(spiel('brennan'), balance, katalog, 'brennan'));
    expect(brennanActive(s)).toBe(true);
    expect(tariff(s, balance, 'wagon')).toBe(F.brennan.costPerBarrel);
    expect(capacityLeft(s, balance, 'wagon')).toBe(F.brennan.capacity);
    expect(brennanActive({ ...s, round: s.round + F.brennan.rounds })).toBe(false);
  });

  it('unter der Mindestmenge kostet jedes fehlende Barrel 0,15 $', () => {
    const s = ok(bookCard(spiel('brennan-min'), balance, katalog, 'brennan'));
    const n = settleFreight({ ...s, shipped: { ...s.shipped, wagon: 500 } }, balance);
    expect(n.cash).toBeCloseTo(s.cash - (F.brennan.minimum - 500) * F.brennan.shortfall, 6);
  });

  it('bei laufendem Exklusivvertrag warnt die Karte', () => {
    const s = spiel('brennan-ex');
    const ex = { ...s, events: { ...s.events, marks: { ...s.events.marks, [RIVAL_MARKS.thorneExclusive]: s.round } } };
    expect(planView(ex, balance, katalog).cards.find((c) => c.id === 'brennan')?.warning).toMatch(/Exklusivvertrag/);
    expect(planView(s, balance, katalog).cards.find((c) => c.id === 'brennan')?.warning).toBeNull();
  });

  it('Antwort „ziehen lassen“ auf Thornes Abwerbung beendet den Vertrag', () => {
    const s = ok(bookCard(spiel('brennan-weg'), balance, katalog, 'brennan'));
    const weg = { ...s, round: s.round + 1, events: { ...s.events, marks: { ...s.events.marks, brennan_abgeworben: s.round + 1 } } };
    expect(settleFreight(weg, balance).freight.brennan).toBeNull();
  });
});

describe('Transportgemeinschaft (Plan 2.3)', () => {
  it('gleicher Seed ⇒ gleiche Zusagen, Weltzufall unverändert', () => {
    const s = { ...spiel('pool'), railTariff: 0.55 };
    const a = FREIGHT_HANDLERS.transportgemeinschaft.apply(s, balance, 'ohne');
    const b = FREIGHT_HANDLERS.transportgemeinschaft.apply(s, balance, 'ohne');
    expect(a.freight.pool).toEqual(b.freight.pool);
    expect(a.rng).toBe(s.rng);
    expect(a.freight.pool.length).toBeGreaterThan(0);
    expect(poolVolume(a, balance)).toBeGreaterThan(0);
  });

  it('Zusage: 0,25 + (Tarif − 0,25) + Ruf, begrenzt auf 0,1–0,8', () => {
    const s = { ...spiel('pool-zusage'), railTariff: 0.45 };
    expect(poolJoinChance(s, balance)).toBeCloseTo(F.pool.base + 0.2, 9);
    expect(poolJoinChance({ ...s, railTariff: 1 }, balance)).toBe(F.pool.max);
    expect(poolJoinChance({ ...s, railTariff: 0.25, wildcatterStanding: -0.3 }, balance)).toBe(F.pool.min);
  });

  it('ohne „Gemeinschaft halten“ springen Mitglieder ab, mit nicht', () => {
    const immer: Balance = { ...balance, freight: { ...F, pool: { ...F.pool, leave: 1 } } };
    const s0 = spiel('pool-weg');
    const s = { ...s0, round: 3, freight: { ...newFreight(), pool: ['A', 'B'], poolSince: 1, poolHeldRound: 1 } };
    expect(settleFreight(s, immer).freight.pool).toEqual([]);
    expect(settleFreight({ ...s, freight: { ...s.freight, poolHeldRound: 3 } }, immer).freight.pool).toEqual(['A', 'B']);
  });

  it('gemeinsame Pipeline: −40 % Bau, 30 % Fremdöl gegen Durchleitungsgebühr', () => {
    const s0 = spiel('pool-pipe');
    const s = { ...s0, freight: { ...newFreight(), pool: [s0.wildcatters.firms[0].name], poolPipeline: true, poolSince: 1, poolHeldRound: 99 } };
    expect(pipelineBuildCost(s, balance)).toBe(Math.round(balance.transport.pipeline.buildCost * (1 - F.pool.pipelineDiscount)));
    const laeuft = { ...s, round: 2, logistics: { ...s.logistics, pipeline: 'ready' as const } };
    expect(capacityLeft(laeuft, balance, 'pipeline')).toBe(Math.round(balance.transport.pipeline.capacity * (1 - F.pool.foreignShare)));
    const n = settleFreight(laeuft, balance);
    const fremd = Math.min(Math.round(balance.transport.pipeline.capacity * F.pool.foreignShare), poolVolume(laeuft, balance));
    expect(n.cash).toBeCloseTo(laeuft.cash + fremd * F.pool.transitFee, 6);
  });
});

describe('Exklusivvertrag kündigen (Plan 2.3)', () => {
  it('nur mit Druck ≥ 2; danach gilt der Vertrag nicht mehr', () => {
    const s0 = spiel('kuendigen');
    const ex = { ...s0, events: { ...s0.events, marks: { ...s0.events.marks, [RIVAL_MARKS.thorneExclusive]: s0.round, [RIVAL_MARKS.thorneContract]: s0.round } } };
    expect(planView(ex, balance, katalog).cards.find((c) => c.id === 'exklusiv_kuendigen')?.reason).toMatch(/Druck/);
    const druck = bahn(ex, 20000);
    const n = ok(bookCard(druck, balance, katalog, 'exklusiv_kuendigen'));
    expect(n.cash).toBe(druck.cash - (balance.plans.cards.exklusiv_kuendigen.cash ?? 0));
    expect(tariff(n, balance, 'wagon')).toBe(balance.transport.wagon.costPerBarrel);
    expect(railFrozen(n, balance)).toBe(false);
  });
});

describe('Gemeinsam (Plan 2.6)', () => {
  it('der Ruf bei den Wildcattern wirkt auf Förderbremse und Transportgemeinschaft', () => {
    const s = { ...spiel('ruf'), railTariff: 0.4 };
    const gut = { ...s, wildcatterStanding: 0.2 };
    expect(joinChance(gut, balance) - joinChance(s, balance)).toBeCloseTo(0.2, 9);
    expect(poolJoinChance(gut, balance) - poolJoinChance(s, balance)).toBeCloseTo(0.2, 9);
  });

  it('Migration: ein Spielstand aus Format 21 (0.4.19, vor den Terminen) lädt ohne Preis- und Transport-Aktionen', () => {
    expect(SAVE_FORMAT).toBe(22); // Etappe 3: freight.poolLeft (freiwillig)
    const s = spiel('migration');
    const alt: Record<string, unknown> = { ...s };
    delete alt.pricing;
    delete alt.freight;
    delete alt.wildcatterStanding;
    const r = deserializeGame(JSON.stringify({ format: 21, appVersion: '0.4.19', savedRound: 1, state: alt }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pricing).toEqual(newPricing());
    expect(r.state.freight).toEqual(newFreight());
    expect(r.state.wildcatterStanding).toBe(0);
  });

  it('das Frachtfenster bekommt alles aus freightView (Druckliste, Widerstand in Worten, Stufen)', () => {
    const v = freightView(bahn(spiel('ansicht'), 9000), balance);
    expect(v.levers).toHaveLength(5);
    expect(v.pressure).toBe(1);
    expect(v.resistanceWord).toBe('Thorne ist gelassen');
    expect(v.outcomes).toHaveLength(4);
  });
});
