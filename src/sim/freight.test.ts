// Termine als Hauptwerkzeug, Etappe 2: Transport-Aktionen (Plan 2.3, Tests 2.6 „Transport“ und „Gemeinsam“).
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import {
  brennanActive,
  brennanPenalty,
  freightLevers,
  freightPressure,
  freightView,
  newFreight,
  poolDiscount,
  poolJoinChance,
  poolPenalty,
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

  it('Ergebnisstufen: ≤ 0 Abfuhr (Tarif sofort + raise, Erhöhung × 2 für 4 Runden), 1–3 Senkung nach cuts mit Ruhe nach freeze', () => {
    const s = { ...spiel('stufen'), railTariff: 0.55 };
    const abfuhr = visitThorne(s, NEUTRAL, false);
    // Spielspaß K1: Die Abfuhr kostet sofort.
    expect(abfuhr.railTariff).toBeCloseTo(0.55 + F.rebuff.raise, 9);
    expect(abfuhr.log.at(-1)).toMatch(/hebt er den Tarif sofort/);
    expect(abfuhr.freight.hikeDoubleUntil).toBe(s.round + F.rebuff.rounds - 1);
    expect(hikeChance(abfuhr, balance)).toBeCloseTo(Math.min(1, TH.hikeChance * F.rebuff.factor), 9);
    expect(hikeChance({ ...abfuhr, round: s.round + F.rebuff.rounds }, balance)).toBeCloseTo(TH.hikeChance, 9);
    // Stufe 1: drei Druckmittel gegen Widerstand 2.
    const drei = { ...bahn(s, 20000), worldModel: { ...s.worldModel, laws: { ...s.worldModel.laws, bills: { ...s.worldModel.laws.bills, antitrust: { ...s.worldModel.laws.bills.antitrust, stage: 'debate' as const } } } } };
    expect(freightPressure(drei, balance)).toBe(3);
    const eins = visitThorne(drei, NEUTRAL, false);
    expect(eins.railTariff).toBeCloseTo(0.55 - F.cuts[0], 9);
    expect(eins.freight.freezeUntil).toBe(s.round + F.freeze[0] - 1);
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

  it('Spielspaß K1: die Abfuhr hebt den Tarif nie über maxTariff', () => {
    const s = { ...spiel('abfuhr-dach'), railTariff: TH.maxTariff - 0.01 };
    expect(visitThorne(s, NEUTRAL, false).railTariff).toBe(TH.maxTariff);
    expect(visitThorne({ ...s, railTariff: TH.maxTariff }, NEUTRAL, false).railTariff).toBe(TH.maxTariff);
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

  /** Spielspaß K1: Thorne zählt je Runde mit Chance check nach – hier immer bzw. nie. */
  const ZAEHLT: Balance = { ...balance, freight: { ...F, bluff: { ...F.bluff, check: 1 } } };
  const NIE: Balance = { ...balance, freight: { ...F, bluff: { ...F.bluff, check: 0 } } };

  it('zählt Thorne nach und geht in der Runde mehr als railShare per Bahn: Aufschlag sofort und Groll (Erhöhung × 2 für 4 Runden)', () => {
    const v = geblufft('bluff-fang');
    const s = settleFreight({ ...v, round: v.round + 1, shipped: { wagon: 0, rail: 10000, teams: 0, pipeline: 0 } }, ZAEHLT);
    expect(s.railTariff).toBeCloseTo(v.railTariff + F.bluff.penalty, 9);
    expect(s.freight.bluffsCaught).toBe(1);
    expect(s.freight.bluffCheck).toBeNull();
    expect(s.freight.hikeDoubleUntil).toBe(v.round + 1 + F.rebuff.rounds - 1);
  });

  it('es zählt jede Runde für sich: eine ehrliche erste Runde schützt die zweite nicht', () => {
    const v = geblufft('bluff-runde');
    let s: GameState = settleFreight({ ...v, round: v.round + 1, shipped: { wagon: 0, rail: 2000, teams: 8000, pipeline: 0 } }, ZAEHLT);
    expect(s.freight.bluffsCaught).toBe(0);
    expect(s.freight.bluffCheck).not.toBeNull();
    s = settleFreight({ ...s, round: v.round + 2, shipped: { wagon: 0, rail: 7000, teams: 3000, pipeline: 0 } }, ZAEHLT);
    expect(s.freight.bluffsCaught).toBe(1);
  });

  it('zählt Thorne nicht nach, fällt der Bluff nicht auf – nach der letzten Prüfrunde ist er vorbei', () => {
    const v = geblufft('bluff-glueck');
    let s: GameState = settleFreight({ ...v, round: v.round + 1, shipped: { wagon: 0, rail: 10000, teams: 0, pipeline: 0 } }, NIE);
    s = settleFreight({ ...s, round: v.round + 2 }, NIE);
    expect(s.railTariff).toBe(v.railTariff);
    expect(s.freight.bluffCheck).toBeNull();
    expect(s.freight.bluffsCaught).toBe(0);
  });

  it('das Nachzählen würfelt aus dem eigenen Strang: gleicher Seed und Runde ⇒ gleiches Ergebnis, Weltzufall unberührt', () => {
    const v = geblufft('bluff-strang');
    const s = { ...v, round: v.round + 1, shipped: { wagon: 0, rail: 10000, teams: 0, pipeline: 0 } };
    expect(settleFreight(s, balance).freight.bluffsCaught).toBe(settleFreight(s, balance).freight.bluffsCaught);
    expect(settleFreight(s, balance).rng).toBe(s.rng);
  });

  it('hält Jacob die Drohung ein (Bahnanteil höchstens railShare), passiert nichts', () => {
    const v = geblufft('bluff-ehrlich');
    let s: GameState = { ...v, round: v.round + 1, shipped: { wagon: 0, rail: 5000, teams: 5000, pipeline: 0 } };
    s = settleFreight(s, ZAEHLT);
    s = settleFreight({ ...s, round: s.round + 1 }, ZAEHLT);
    expect(s.railTariff).toBe(v.railTariff);
    expect(s.freight.bluffCheck).toBeNull();
    expect(s.freight.bluffsCaught).toBe(0);
  });
});

describe('Brennan (Plan 2.3)', () => {
  it('ersetzt die Mietfuhrwerke: Brennans Preis, Kapazität und Laufzeit aus balance.yaml', () => {
    const s = ok(bookCard(spiel('brennan'), balance, katalog, 'brennan'));
    expect(brennanActive(s)).toBe(true);
    expect(tariff(s, balance, 'wagon')).toBe(F.brennan.costPerBarrel);
    expect(capacityLeft(s, balance, 'wagon')).toBe(F.brennan.capacity);
    expect(brennanActive({ ...s, round: s.round + F.brennan.rounds })).toBe(false);
  });

  it('unter der Mindestmenge kostet jedes fehlende Barrel brennan.shortfall', () => {
    const s = ok(bookCard(spiel('brennan-min'), balance, katalog, 'brennan'));
    const n = settleFreight({ ...s, shipped: { ...s.shipped, wagon: 500 } }, balance);
    expect(n.cash).toBeCloseTo(s.cash - (F.brennan.minimum - 500) * F.brennan.shortfall, 6);
    expect(brennanPenalty({ ...s, shipped: { ...s.shipped, wagon: 500 } }, balance)).toEqual({ missing: F.brennan.minimum - 500, fine: (F.brennan.minimum - 500) * F.brennan.shortfall });
    expect(brennanPenalty({ ...s, shipped: { ...s.shipped, wagon: F.brennan.minimum } }, balance).fine).toBe(0);
    expect(brennanPenalty({ ...s, round: s.round + F.brennan.rounds, shipped: { ...s.shipped, wagon: 0 } }, balance).fine).toBe(0);
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
    // Genug Bahnfracht, damit die Zusage an Thorne hält (sonst käme die Strafe dazu).
    const laeuft = { ...s, round: 2, logistics: { ...s.logistics, pipeline: 'ready' as const }, shipped: { ...s.shipped, rail: F.pool.minimum } };
    expect(capacityLeft(laeuft, balance, 'pipeline')).toBe(Math.round(balance.transport.pipeline.capacity * (1 - F.pool.foreignShare)));
    const n = settleFreight(laeuft, balance);
    const fremd = Math.min(Math.round(balance.transport.pipeline.capacity * F.pool.foreignShare), poolVolume(laeuft, balance));
    expect(n.cash).toBeCloseTo(laeuft.cash + fremd * F.pool.transitFee, 6);
  });
});

describe('Transportgemeinschaft: Rabatt und Zusage (Spielspaß K1)', () => {
  function gemeinschaft(seed: string, mitglieder = 1): GameState {
    const s0 = spiel(seed);
    return { ...s0, round: 3, freight: { ...newFreight(), pool: s0.wildcatters.firms.slice(0, mitglieder).map((f) => f.name), poolSince: 2, poolHeldRound: 3 } };
  }

  it('Rabatt auf Jacobs Bahnfracht: discountStep je volle discountPer bbl Gemeinschaftsmenge, höchstens discountMax', () => {
    const s = gemeinschaft('pool-rabatt');
    const menge = poolVolume(s, balance);
    const erwartet = Math.min(F.pool.discountMax, Math.floor(menge / F.pool.discountPer) * F.pool.discountStep);
    expect(poolDiscount(s, balance)).toBeCloseTo(erwartet, 9);
    expect(tariff({ ...s, railTariff: 0.55 }, balance, 'rail')).toBeCloseTo(0.55 - erwartet, 9);
    const gross: Balance = { ...balance, freight: { ...F, pool: { ...F.pool, discountPer: 1 } } };
    expect(poolDiscount(s, gross)).toBe(F.pool.discountMax);
    expect(poolDiscount({ ...s, freight: newFreight() }, balance)).toBe(0);
  });

  it('Zusage verfehlt: Jacobs Bahnfracht + Gemeinschaft unter minimum kostet shortfall je Barrel – nicht in der Gründungsrunde', () => {
    const s = gemeinschaft('pool-strafe');
    const fehlt = Math.max(0, F.pool.minimum - 1000 - poolVolume(s, balance));
    expect(fehlt).toBeGreaterThan(0);
    const knapp = { ...s, shipped: { ...s.shipped, rail: 1000 } };
    expect(poolPenalty(knapp, balance)).toEqual({ missing: fehlt, fine: Math.round(fehlt * F.pool.shortfall * 100) / 100 });
    const n = settleFreight(knapp, balance);
    expect(n.cash).toBeCloseTo(s.cash - fehlt * F.pool.shortfall, 6);
    expect(n.log.at(-1)).toMatch(/Zusage an Thorne/);
    expect(poolPenalty({ ...knapp, shipped: { ...knapp.shipped, rail: F.pool.minimum } }, balance).fine).toBe(0);
    expect(poolPenalty({ ...knapp, round: 2 }, balance).fine).toBe(0);
    expect(poolPenalty({ ...knapp, freight: newFreight() }, balance).fine).toBe(0);
  });

  it('die Karte nennt Rabatt und Zusage, das Frachtfenster zeigt sie', () => {
    const s = spiel('pool-text');
    expect(FREIGHT_HANDLERS.transportgemeinschaft.detail?.(s, balance)).toMatch(/Zusage/);
    const v = freightView(gemeinschaft('pool-ansicht'), balance);
    expect(v.pool?.minimum).toBe(F.pool.minimum);
    expect(v.pool?.discount).toBe(poolDiscount(gemeinschaft('pool-ansicht'), balance));
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
    expect(SAVE_FORMAT).toBe(24); // Etappe 3: freight.poolLeft (freiwillig)
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
