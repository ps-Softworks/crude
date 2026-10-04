import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, parseGameData, type WorldModelBalance } from './balance';
import { loanRate, takeLoan } from './credit';
import { endRound, newGame } from './game';
import { computePrice, neighbourSupply } from './market';
import { makeNewspaper, parseNewspaperContent } from './newspaper';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance, rawMap } from './testBalance';
import {
  advanceWorld,
  effectiveDemand,
  isWorldState,
  knappheit,
  leadingParty,
  neutralWorld,
  newWorld,
  PARTIES,
  pipelineFor,
  saltHillInput,
  skipWorld,
  trendPrice,
  worldPriceFactor,
  worldRateAdd,
  type WorldState,
} from './world';
import { worldHeadline } from './worldNews';
import { CAMPAIGN_ROUNDS, crisisStats, crisisWindows, CAMPAIGN_TARGETS, percentile, runWorld, runWorlds, ROUNDS_PER_YEAR } from './worldRun';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

const balance = loadBalance();
const wb = balance.worldModel;

/** Weltbalance mit geänderten Werten eines Blocks. */
function mit<K extends keyof WorldModelBalance>(key: K, werte: Partial<WorldModelBalance[K]>, basis: WorldModelBalance = wb): WorldModelBalance {
  return { ...basis, [key]: { ...basis[key], ...werte } };
}

/** Ohne Zufallsereignisse (kein Fund, keine Verstaatlichung, kein Crash, kein Krieg) und ohne Rauschen. */
const still: WorldModelBalance = mit(
  'tension',
  { noise: 0, warChance: 0, warSlope: 0 },
  mit(
    'credit',
    { noise: 0, crashChance: 0, crashSlope: 0, priceTrigger: 1 },
    mit('supply', { findChance: 0 }, mit('nationalism', { noise: 0, nationalizeChance: 0 }, mit('mood', { noise: 0 }, mit('politics', { noise: 0 })))),
  ),
);

function zahlen(w: WorldState): number[] {
  return [w.demand, w.capacity, w.output, w.stock, w.price, w.credit, w.mood, w.tension, w.tech, w.nationalism, ...w.pipeline, ...PARTIES.map((p) => w.parties[p])];
}

describe('Weltmodell (4.1): Ausgangslage', () => {
  it('gleicher Seed, gleiche Welt; anderer Seed, andere Ausgangslage', () => {
    expect(newWorld('abc', wb)).toEqual(newWorld('abc', wb));
    expect(newWorld('abc', wb)).not.toEqual(newWorld('xyz', wb));
  });

  it('der Preis startet im Gleichgewicht bei 1 – Kapitel 1 beginnt ohne Welttrend', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const w = newWorld(seed, wb);
      expect(w.price).toBe(1);
      expect(worldPriceFactor(w, wb)).toBe(1);
      // Die Kapazität deckt bei normaler Auslastung die Nachfrage samt Aufrüstung.
      expect(w.capacity * wb.supply.utilBase).toBeCloseTo(effectiveDemand(w, wb), 10);
    }
  });

  it('die Ausgangslage ist ein echtes Gleichgewicht: ohne Zufall bleibt die Knappheit bei 1 und das Lager normal', () => {
    // Ohne Kredit-, Spannungs- und Regierungswirkung, damit nur Angebot und Nachfrage zählen.
    const ruhig = mit('credit', { boom: 0, speculation: 0, handel: 0, volksbund: 0, provinz: 0 }, mit('tension', { revert: 0, arms: 0 }, still));
    for (const seed of ['g1', 'g2', 'g3']) {
      let w: WorldState = { ...newWorld(seed, ruhig), government: 'provinz', credit: 50 };
      for (let i = 0; i < 40; i++) {
        w = advanceWorld(w, ruhig);
        expect(Math.abs(knappheit(w, ruhig) - 1)).toBeLessThan(0.01);
        expect(Math.abs(w.stock - wb.supply.stockNorm)).toBeLessThan(0.02);
      }
    }
  });

  it('Startwerte liegen in den Bereichen aus balance.yaml, Parteien ergeben zusammen 1', () => {
    for (let i = 0; i < 50; i++) {
      const w = newWorld(`start-${i}`, wb);
      expect(w.tech).toBeGreaterThanOrEqual(wb.start.tech.min);
      expect(w.tech).toBeLessThanOrEqual(wb.start.tech.max);
      expect(w.credit).toBeGreaterThanOrEqual(wb.start.credit.min);
      expect(w.credit).toBeLessThanOrEqual(wb.start.credit.max);
      expect(PARTIES.reduce((s, p) => s + w.parties[p], 0)).toBeCloseTo(1, 10);
      expect(w.government).toBe(leadingParty(w.parties));
      expect(w.electionIn).toBeGreaterThanOrEqual(1);
      expect(w.electionIn).toBeLessThanOrEqual(wb.politics.electionEvery);
      expect(w.pipeline).toHaveLength(wb.supply.delay);
    }
  });

  it('eigener Zufall: Die Welt verändert weder Karte noch Ereignisse des Spiels', () => {
    const a = newGame('eigen', balance);
    const ohne = newGame('eigen', { ...balance, worldModel: mit('start', { credit: { min: 10, max: 10 } }) });
    expect(ohne.parcels).toEqual(a.parcels);
    expect(ohne.options).toEqual(a.options);
    expect(ohne.rng).toBe(a.rng);
    expect(ohne.worldModel.credit).toBe(10);
  });
});

describe('Weltmodell: eine Runde', () => {
  it('ist deterministisch und zählt die Runde hoch', () => {
    const w = newWorld('runde', wb);
    expect(advanceWorld(w, wb)).toEqual(advanceWorld(w, wb));
    expect(advanceWorld(w, wb).round).toBe(1);
    expect(advanceWorld(w, wb).rng).not.toBe(w.rng);
  });

  it('Technik wächst logistisch: immer mehr, nie über 100', () => {
    let w = newWorld('technik', wb);
    let vorher = w.tech;
    for (let i = 0; i < 2000; i++) {
      w = advanceWorld(w, wb);
      expect(w.tech).toBeGreaterThanOrEqual(vorher);
      expect(w.tech).toBeLessThan(100);
      vorher = w.tech;
    }
    expect(w.tech).toBeGreaterThan(95);
  });

  it('Nachfrage wächst bis zur Sättigung, nicht ins Unendliche', () => {
    const w = skipWorld(newWorld('satt', wb), still, 3000);
    expect(w.demand).toBeGreaterThan(wb.demand.cap * 0.95);
    expect(w.demand).toBeLessThanOrEqual(wb.demand.cap);
  });

  it('Krieg, Crash und Aufrüstung verändern die Nachfrage dieser Runde', () => {
    const basis = { demand: 2, tension: 0, crash: 0, war: 0 };
    expect(effectiveDemand(basis, wb)).toBe(2);
    expect(effectiveDemand({ ...basis, war: 3 }, wb)).toBeCloseTo(2 * (1 + wb.demand.warBoost), 10);
    expect(effectiveDemand({ ...basis, crash: 3 }, wb)).toBeCloseTo(2 * (1 - wb.demand.crashDrop), 10);
    expect(effectiveDemand({ ...basis, tension: 100 }, wb)).toBeCloseTo(2 * (1 + wb.demand.armsDemand), 10);
  });

  it('Neubohrungen fördern erst nach supply.delay Runden', () => {
    const w = newWorld('verzug', wb);
    const n = advanceWorld({ ...w, pipeline: [5, ...w.pipeline.slice(1)] }, still);
    // Die vorderste Bohrung (5) ist fertig: Die Kapazität springt.
    expect(n.capacity).toBeCloseTo(w.capacity * (1 - wb.supply.depletion) + 5, 10);
    // Die neue Bohrung steht hinten an.
    expect(n.pipeline).toHaveLength(wb.supply.delay);
  });

  it('eine Pipeline mit anderer Länge (alter Spielstand, geändertes delay) wird sofort angeglichen', () => {
    expect(pipelineFor([1, 2, 3, 4], 2)).toEqual({ pipeline: [3, 4], done: 3 });
    expect(pipelineFor([2, 4], 4)).toEqual({ pipeline: [3, 3, 2, 4], done: 0 });
    expect(pipelineFor([1, 2], 2)).toEqual({ pipeline: [1, 2], done: 0 });
    const w = newWorld('angleichen', wb); // gespeichert mit delay 6
    for (const delay of [3, 9]) {
      const anders = mit('supply', { delay }, still);
      const n = advanceWorld(w, anders);
      expect(n.pipeline).toHaveLength(delay);
      if (delay < w.pipeline.length) {
        // Zu lang: die überzähligen Bohrungen sind sofort fertig – keine geht verloren.
        const fertig = w.pipeline.slice(0, w.pipeline.length - delay + 1).reduce((a, b) => a + b, 0);
        expect(n.capacity).toBeCloseTo(w.capacity * (1 - wb.supply.depletion) + fertig, 10);
      } else {
        // Zu kurz: es wird trotzdem jede Runde etwas fertig, nicht erst nach (delay − 6) Runden.
        expect(n.capacity).toBeGreaterThan(w.capacity * (1 - wb.supply.depletion) + 0.01);
      }
      // Und der Preis läuft danach nicht weg.
      expect(Math.abs(skipWorld(w, anders, 20).price / trendPrice(skipWorld(w, anders, 20), anders) - 1)).toBeLessThan(0.1);
    }
  });

  it('Technik senkt den Preis, aber nicht das Bohren, Fördern oder die Stimmung (alles hängt an der Knappheit)', () => {
    const w = { ...newWorld('technik-knapp', wb), tech: 60 };
    const neu = advanceWorld({ ...w, techStart: 60 }, still);
    const alt = advanceWorld({ ...w, techStart: 10 }, still);
    expect(alt.price).toBeLessThan(neu.price * 0.9);
    expect(knappheit(alt, wb)).toBeCloseTo(knappheit(neu, wb), 10);
    expect(alt.pipeline.at(-1)!).toBeCloseTo(neu.pipeline.at(-1)!, 10);
    expect(alt.output).toBeCloseTo(neu.output, 10);
    expect(alt.mood).toBeCloseTo(neu.mood, 10);
    expect(alt.credit).toBeCloseTo(neu.credit, 10);
  });

  it('der Trendpreis sinkt nie unter price.trendMin', () => {
    expect(trendPrice({ tech: 100, techStart: 0 }, mit('price', { techCost: 0.9, trendMin: 0.4 }))).toBe(0.4);
    expect(trendPrice({ tech: 100, techStart: 0 }, mit('price', { techCost: 0.9, trendMin: 0.2 }))).toBeCloseTo(0.2, 10);
  });
});

describe('Schleife 1: Angebot dämpft den Preis – mit Verzögerung', () => {
  it('ein Preissprung bringt erst später mehr Kapazität, dann fällt der Preis wieder', () => {
    // Nur Schleife 1: Kreditklima und Außenspannung bleiben stehen.
    const nurAngebot = mit('tension', { scarcity: 0, arms: 0, revert: 0 }, mit('credit', { boom: 0, speculation: 0 }, still));
    // Knappheit: Fast ein Drittel der Kapazität fällt weg (wie nach einer großen Verstaatlichung).
    const w0 = { ...newWorld('schleife1', wb), credit: 50 };
    const knapp: WorldState = { ...w0, capacity: w0.capacity * 0.7 };
    const verlauf: WorldState[] = [knapp];
    for (let i = 0; i < 60; i++) verlauf.push(advanceWorld(verlauf.at(-1)!, nurAngebot));
    const preise = verlauf.slice(1).map((w) => w.price);
    expect(preise[0]).toBeGreaterThan(1.3);
    // Die ersten delay Runden kommt nur, was schon im Bau war.
    const zuwachsFrueh = verlauf[wb.supply.delay].capacity - verlauf[1].capacity;
    const zuwachsSpaet = verlauf[3 * wb.supply.delay].capacity - verlauf[2 * wb.supply.delay].capacity;
    expect(zuwachsSpaet).toBeGreaterThan(zuwachsFrueh);
    // Am Ende ist der Preis wieder in der Nähe des Gleichgewichts.
    expect(preise.at(-1)!).toBeLessThan(preise[0] * 0.85);
    expect(Math.abs(preise.at(-1)! - 1)).toBeLessThan(0.25);
  });

  it('ein Riesenfund macht eine Ölschwemme: Kapazität springt, der Preis fällt', () => {
    const fund = mit('supply', { findChance: 1 }, still);
    const w = newWorld('fund', wb);
    const n = advanceWorld(w, fund);
    expect(n.news).toContain('glut');
    expect(n.counts.gluts).toBe(1);
    expect(n.capacity).toBeGreaterThan(w.capacity * (1 - wb.supply.depletion) * (1 + wb.supply.findSize.min) - 1e-9);
    expect(n.price).toBeLessThan(0.85);
  });

  it('volle Tanks drücken den Preis, leere heben ihn', () => {
    const w = newWorld('lager', wb);
    const voll = advanceWorld({ ...w, stock: wb.supply.stockMax }, still);
    const leer = advanceWorld({ ...w, stock: 0 }, still);
    expect(voll.price).toBeLessThan(1);
    expect(leer.price).toBeGreaterThan(1);
  });
});

describe('Schleife 2: Kreditklima schaukelt sich auf und kippt', () => {
  it('ein Boom (hoher Preis) macht die Banken mutiger', () => {
    const w = newWorld('boom', wb);
    const ruhig = advanceWorld({ ...w, credit: 50 }, still);
    const boom = advanceWorld({ ...w, credit: 50, stock: 0, capacity: w.capacity * 0.8 }, still);
    expect(boom.price).toBeGreaterThan(1.2);
    expect(boom.credit).toBeGreaterThan(ruhig.credit);
  });

  it('über 50 verstärkt Spekulation das Klima, unter 50 kehrt es zur Mitte zurück', () => {
    const w = { ...newWorld('spekulation', wb), government: 'provinz' as const };
    const hoch = advanceWorld({ ...w, credit: 65 }, still);
    const tief = advanceWorld({ ...w, credit: 30 }, still);
    expect(hoch.credit).toBeGreaterThan(65);
    expect(tief.credit).toBeGreaterThan(30);
  });

  it('mehr Kredit → mehr Neubohrungen (Schleife 1 und 2 hängen zusammen)', () => {
    const w = newWorld('kreditbohren', wb);
    const locker = advanceWorld({ ...w, credit: 90 }, still);
    const eng = advanceWorld({ ...w, credit: 10 }, still);
    expect(locker.pipeline.at(-1)!).toBeGreaterThan(eng.pipeline.at(-1)!);
  });

  it('ein überhitztes Klima kippt: Crash, Zinssprung, weniger Neubohrungen', () => {
    const kippt = mit('credit', { crashChance: 1 }, still);
    const w = { ...newWorld('crash', wb), credit: 90 };
    const n = advanceWorld(w, kippt);
    expect(n.news).toContain('crash');
    expect(n.counts.crashes).toBe(1);
    expect(n.crash).toBeGreaterThanOrEqual(wb.credit.rounds.min);
    expect(n.crash).toBeLessThanOrEqual(wb.credit.rounds.max);
    expect(n.credit).toBeLessThan(40);
    expect(worldRateAdd(n, wb)).toBeGreaterThan(worldRateAdd(w, wb));
    // Nach dem Crash wirkt er nach und endet mit einer Erholung.
    let x = n;
    for (let i = 0; i < n.crash; i++) x = advanceWorld(x, still);
    expect(x.crash).toBe(0);
    expect(x.news).toContain('recovery');
  });

  it('ein Preissturz kippt ein heißes Klima auch ohne Würfelglück – ab credit.priceTriggerFrom', () => {
    const trigger = mit('credit', { priceTrigger: 0.2 }, still);
    const w = { ...newWorld('sturz', wb), credit: 70, price: 2 };
    expect(advanceWorld(w, trigger).news).toContain('crash');
    expect(advanceWorld(w, mit('credit', { priceTrigger: 0.2, priceTriggerFrom: 90 }, still)).news).not.toContain('crash');
  });

  it('im Crash stoppen Bohrungen im Bau (pipelineCut) und es wird weniger neu gebohrt (investCut)', () => {
    const w = { ...newWorld('crash-bohren', wb), credit: 90 };
    const zahlen = (pipelineCut: number, investCut: number) => advanceWorld(w, mit('credit', { crashChance: 1, pipelineCut, investCut }, still)).pipeline;
    const voll = zahlen(1, 1);
    const halb = zahlen(0.5, 1);
    expect(halb.slice(0, -1).map((x, i) => x / voll[i])).toEqual(halb.slice(0, -1).map(() => 0.5));
    expect(zahlen(1, 0.25).at(-1)!).toBeCloseTo(voll.at(-1)! * 0.25, 10);
  });
});

describe('Schleife 3: Knappheit → Spannung → Aufrüstung → Nachfrage', () => {
  it('Knappheit (hoher Preis) erhöht die Außenspannung', () => {
    const w = newWorld('knapp', wb);
    const ruhig = advanceWorld({ ...w, tension: 30 }, still);
    const knapp = advanceWorld({ ...w, tension: 30, stock: 0, capacity: w.capacity * 0.75 }, still);
    expect(knapp.tension).toBeGreaterThan(ruhig.tension);
  });

  it('Knappheit heizt erst ab tension.scarcityFrom, Nationalismus erst ab tension.nationalismFrom', () => {
    const w = { ...newWorld('schwellen', wb), tension: 30 };
    const knapp = { ...w, stock: 0, capacity: w.capacity * 0.9 };
    const tief = advanceWorld(knapp, mit('tension', { scarcityFrom: 1 }, still));
    const hoch = advanceWorld(knapp, mit('tension', { scarcityFrom: 5 }, still));
    expect(tief.tension).toBeGreaterThan(hoch.tension);
    const national = { ...w, nationalism: 70 };
    expect(advanceWorld(national, mit('tension', { nationalismFrom: 20 }, still)).tension).toBeGreaterThan(
      advanceWorld(national, mit('tension', { nationalismFrom: 90 }, still)).tension,
    );
  });

  it('Aufrüstung erhöht die Nachfrage und damit den Preis', () => {
    const w = newWorld('ruestung', wb);
    expect(advanceWorld({ ...w, tension: 90 }, still).price).toBeGreaterThan(advanceWorld({ ...w, tension: 10 }, still).price);
  });

  it('über etwa 60 schaukelt sich die Spannung von selbst auf, darunter beruhigt sie sich', () => {
    const w = newWorld('spirale', wb);
    expect(advanceWorld({ ...w, tension: 75 }, still).tension).toBeGreaterThan(75);
    expect(advanceWorld({ ...w, tension: 45 }, still).tension).toBeLessThan(45);
  });

  it('Krieg bricht aus, dauert warRounds und endet mit Frieden und Entspannung', () => {
    const krieg = mit('tension', { warChance: 1 }, still);
    const w = { ...newWorld('krieg', wb), tension: 85 };
    const n = advanceWorld(w, krieg);
    expect(n.news).toContain('war');
    expect(n.war).toBeGreaterThanOrEqual(wb.tension.warRounds.min);
    expect(effectiveDemand(n, wb)).toBeGreaterThan(effectiveDemand({ ...n, war: 0 }, wb));
    let x = n;
    for (let i = 0; i < n.war; i++) x = advanceWorld(x, still);
    expect(x.war).toBe(0);
    expect(x.news).toContain('peace');
    expect(x.tension).toBe(wb.tension.afterWar);
  });
});

describe('Stimmung, Politik, Nationalismus', () => {
  it('teures Öl und Crash drücken die Stimmung', () => {
    const w = { ...newWorld('stimmung', wb), mood: 50 };
    const normal = advanceWorld(w, still);
    const teuer = advanceWorld({ ...w, stock: 0, capacity: w.capacity * 0.75 }, still);
    const crash = advanceWorld({ ...w, crash: 5 }, still);
    expect(teuer.mood).toBeLessThan(normal.mood);
    expect(crash.mood).toBeLessThan(normal.mood);
  });

  it('schlechte Stimmung stärkt den Volksbund, gute die Handelspartei', () => {
    const w = { ...newWorld('parteien', wb), parties: { handel: 1 / 3, volksbund: 1 / 3, provinz: 1 / 3 }, government: 'provinz' as const };
    const sauer = advanceWorld({ ...w, mood: 10 }, still);
    const froh = advanceWorld({ ...w, mood: 90 }, still);
    expect(sauer.parties.volksbund).toBeGreaterThan(froh.parties.volksbund);
    expect(froh.parties.handel).toBeGreaterThan(sauer.parties.handel);
  });

  it('Wahlen alle electionEvery Runden; es regiert die stärkste Partei', () => {
    let w = { ...newWorld('wahl', wb), electionIn: 1 };
    w = advanceWorld(w, wb);
    expect(w.news.some((n) => n === 'election' || n === 'reelection')).toBe(true);
    expect(w.government).toBe(leadingParty(w.parties));
    expect(w.electionIn).toBe(wb.politics.electionEvery);
    let wahlen = 0;
    for (let i = 0; i < wb.politics.electionEvery * 3; i++) {
      w = advanceWorld(w, wb);
      if (w.news.includes('election') || w.news.includes('reelection')) wahlen += 1;
    }
    expect(wahlen).toBe(3);
  });

  it('Wiederwahl und Regierungswechsel werden unterschieden', () => {
    const w = { ...newWorld('wieder', wb), electionIn: 1 };
    const bleibt = advanceWorld({ ...w, parties: { handel: 0.6, volksbund: 0.2, provinz: 0.2 }, government: 'handel' }, still);
    expect(bleibt.news).toContain('reelection');
    expect(bleibt.news).not.toContain('election');
    expect(bleibt.counts.changes).toBe(0);
    expect(worldHeadline(bleibt, wb)).toBe('world_reelected_handel');
    const wechsel = advanceWorld({ ...w, parties: { handel: 0.2, volksbund: 0.6, provinz: 0.2 }, government: 'handel' }, still);
    expect(wechsel.news).toContain('election');
    expect(wechsel.counts.changes).toBe(1);
    expect(worldHeadline(wechsel, wb)).toBe('world_election_volksbund');
  });

  it('die Regierung färbt das Kreditklima: Handelspartei lockert, Volksbund bremst', () => {
    const w = { ...newWorld('regierung', wb), credit: 50 };
    const handel = advanceWorld({ ...w, government: 'handel' }, still);
    const volksbund = advanceWorld({ ...w, government: 'volksbund' }, still);
    expect(handel.credit).toBeGreaterThan(volksbund.credit);
  });

  it('hoher Nationalismus führt zur Verstaatlichung: Kapazität geht verloren', () => {
    const enteignet = mit('nationalism', { nationalizeChance: 1 }, still);
    const w = { ...newWorld('enteignung', wb), nationalism: 95 };
    const n = advanceWorld(w, enteignet);
    expect(n.news).toContain('nationalization');
    expect(n.nationalism).toBe(wb.nationalism.after);
    expect(n.capacity).toBeLessThan(w.capacity * (1 - wb.supply.depletion));
  });
});

describe('Grenzen über viele Seeds (Fertig-Kriterium 4.1)', () => {
  // 200 Welten über eine ganze Kampagne (73 Jahre) – deutlich mehr als 20 Spieljahre.
  const runs = runWorlds('grenze', 200, wb, CAMPAIGN_ROUNDS);

  it('kein Wert läuft ins Unendliche oder aus seinem Bereich', () => {
    // Verstöße sammeln statt Millionen einzelner expect-Aufrufe.
    const fehler: string[] = [];
    const pruefe = (ok: boolean, was: string) => {
      if (!ok && fehler.length < 10) fehler.push(was);
    };
    for (const r of runs) {
      let w = newWorld(r.seed, wb);
      for (let i = 0; i < CAMPAIGN_ROUNDS; i++) {
        w = advanceWorld(w, wb);
        const wo = `${r.seed} Runde ${i + 1}`;
        pruefe(zahlen(w).every(Number.isFinite), `${wo}: unendlich`);
        pruefe(w.price >= wb.price.min && w.price <= wb.price.max, `${wo}: Preis ${w.price}`);
        pruefe(w.stock >= 0 && w.stock <= wb.supply.stockMax, `${wo}: Lager ${w.stock}`);
        pruefe(w.demand > 0 && w.demand <= wb.demand.cap, `${wo}: Nachfrage ${w.demand}`);
        pruefe(w.capacity > 0 && w.capacity < 50, `${wo}: Kapazität ${w.capacity}`);
        for (const k of ['credit', 'mood', 'tension', 'tech', 'nationalism'] as const) pruefe(w[k] >= 0 && w[k] <= 100, `${wo}: ${k} ${w[k]}`);
        pruefe(Math.abs(PARTIES.reduce((s, p) => s + w.parties[p], 0) - 1) < 1e-9, `${wo}: Parteien ≠ 1`);
        pruefe(PARTIES.every((p) => w.parties[p] >= wb.politics.minShare - 1e-9), `${wo}: Partei unter minShare`);
        pruefe(w.pipeline.length === wb.supply.delay, `${wo}: Pipeline ${w.pipeline.length}`);
      }
    }
    expect(fehler).toEqual([]);
  }, 30_000);

  it('Angebot und Nachfrage laufen nicht auseinander', () => {
    for (const r of runs) expect(r.maxImbalance).toBeLessThan(2.5);
    // Die Kapazität wächst mit der Nachfrage mit, aber nicht davon.
    for (const r of runs) {
      const ratio = r.final.capacity / r.final.demand;
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(2);
    }
  });

  it('über 20 Spieljahre bleibt der Preis im Mittel nahe am Trend, mit echten Ausschlägen', () => {
    const zwanzig = runs.map((r) => r.years[20].price);
    const median = [...zwanzig].sort((a, b) => a - b)[100];
    expect(median).toBeGreaterThan(0.7);
    expect(median).toBeLessThan(1.5);
    // GDD §7.3: Einbrüche von fast −50 % in einem Jahr müssen vorkommen – aber nicht in jeder Welt.
    const tief = runs.filter((r) => r.maxYearDrop >= 0.4).length / runs.length;
    expect(tief).toBeGreaterThan(0.2);
    expect(tief).toBeLessThan(0.95);
  });

  it('Krisen kommen so oft wie im GDD §15 vorgesehen (Mehrheit der Welten im Zielbereich)', () => {
    const crashs = crisisStats(runs, (r) => r.final.counts.crashes, CAMPAIGN_TARGETS.crashes);
    const schwemmen = crisisStats(runs, (r) => r.final.counts.gluts, CAMPAIGN_TARGETS.gluts);
    const kriege = crisisStats(runs, (r) => r.final.counts.wars, CAMPAIGN_TARGETS.wars);
    for (const s of [crashs, schwemmen, kriege]) expect(s.inTarget).toBeGreaterThan(0.6);
    expect(crashs.p50).toBeGreaterThanOrEqual(2);
    expect(crashs.p50).toBeLessThanOrEqual(4);
    expect(kriege.p50).toBeLessThanOrEqual(2);
  });

  it('Politik bleibt lebendig: Regierungen wechseln, keine Partei regiert immer', () => {
    const wechsel = runs.reduce((s, r) => s + r.final.counts.changes, 0) / runs.length;
    expect(wechsel).toBeGreaterThan(2);
    for (const p of PARTIES) {
      const anteil = runs.reduce((s, r) => s + r.governmentRounds[p], 0) / (runs.length * CAMPAIGN_ROUNDS);
      expect(anteil).toBeGreaterThan(0.1);
    }
  });

  it('kein schleichendes Leerlaufen: Das Lager bleibt über die Kampagne nahe am Normalwert', () => {
    const lager73 = percentile(runs.map((r) => r.years[73].stock), 0.5);
    expect(Math.abs(lager73 - wb.supply.stockNorm)).toBeLessThan(0.2 * wb.supply.stockNorm);
    // Der Preis folgt dem Technik-Trend nach unten (GDD §7.3: T sinkt mit dem Technikstand).
    const knapp73 = percentile(runs.map((r) => knappheit(r.years[73], wb)), 0.5);
    expect(Math.abs(knapp73 - 1)).toBeLessThan(0.1);
    expect(percentile(runs.map((r) => r.years[73].price), 0.5)).toBeLessThan(0.9);
  });

  it('jede Welt ist neu: Krisen klumpen nicht in einem Zeitfenster (GDD §7.2)', () => {
    const crash = crisisWindows(runs, (r) => r.crashStarts, 5);
    const mittel = crash.rate.reduce((a, b) => a + b, 0) / crash.rate.length;
    // Kein 5-Jahres-Fenster hat mehr als doppelt so viele Crashs wie der Schnitt …
    expect(Math.max(...crash.rate)).toBeLessThan(2 * mittel);
    // … und in keinem liegt der erste Crash für mehr als ein Viertel aller Welten.
    expect(Math.max(...crash.first)).toBeLessThan(0.25);
    const krieg = crisisWindows(runs, (r) => r.warStarts, 5);
    const kriegMittel = krieg.rate.reduce((a, b) => a + b, 0) / krieg.rate.length;
    expect(Math.max(...krieg.rate)).toBeLessThan(2.5 * kriegMittel);
  });

  it('das Kreditklima wandert in den ersten Jahren nicht in allen Welten in dieselbe Richtung', () => {
    const median = (jahr: number) => percentile(runs.map((r) => r.years[jahr].credit), 0.5);
    for (const jahr of [1, 2, 3, 4, 5, 8]) expect(Math.abs(median(jahr) - median(0))).toBeLessThan(5);
    // Auch der Weltpreis startet ohne gemeinsamen Ruck.
    expect(Math.abs(percentile(runs.map((r) => r.years[1].price), 0.5) - 1)).toBeLessThan(0.02);
  });

  it('ein Lauf zeichnet jedes Spieljahr auf', () => {
    const r = runWorld('jahre', wb, 20 * ROUNDS_PER_YEAR);
    expect(r.years).toHaveLength(21);
    expect(r.final.round).toBe(80);
  });
});

describe('Kapitel 1 spürt die Welt sanft', () => {
  it('der Preisfaktor folgt dem Weltpreis, gedämpft und begrenzt', () => {
    const k = wb.chapter1;
    expect(worldPriceFactor({ price: 1 }, wb)).toBe(1);
    expect(worldPriceFactor({ price: 1.2 }, wb)).toBeCloseTo(1 + k.priceWeight * 0.2, 4);
    expect(worldPriceFactor({ price: 0.8 }, wb)).toBeCloseTo(1 - k.priceWeight * 0.2, 4);
    expect(worldPriceFactor({ price: 10 }, wb)).toBe(1 + k.priceMaxDev);
    expect(worldPriceFactor({ price: 0 }, wb)).toBe(1 - k.priceMaxDev);
    expect(worldPriceFactor(undefined, wb)).toBe(1);
  });

  it('der Posted Price folgt dem Faktor', () => {
    const angebot = neighbourSupply(balance.market, 3);
    expect(computePrice(balance.market, angebot, 1.1)).toBeGreaterThan(computePrice(balance.market, angebot));
  });

  it('Kreditklima ändert den Zins: lockeres Geld billiger, Crash teurer – höchstens rateMaxAdd', () => {
    expect(worldRateAdd({ credit: 50, crash: 0 }, wb)).toBe(0);
    expect(worldRateAdd({ credit: 100, crash: 0 }, wb)).toBeCloseTo(-wb.chapter1.rateWeight, 10);
    expect(worldRateAdd({ credit: 0, crash: 0 }, wb)).toBeCloseTo(wb.chapter1.rateWeight, 10);
    expect(worldRateAdd({ credit: 0, crash: 3 }, wb)).toBeLessThanOrEqual(wb.chapter1.rateMaxAdd);
    expect(worldRateAdd({ credit: 20, crash: 3 }, wb)).toBeGreaterThan(worldRateAdd({ credit: 20, crash: 0 }, wb));
    expect(worldRateAdd(undefined, wb)).toBe(0);
    expect(loanRate(balance, 'B', true, 0.02)).toBeCloseTo(loanRate(balance, 'B', true) + 0.02, 10);
  });

  it('ein neuer Bankkredit bekommt den Zins mit Kreditklima', () => {
    const s = newGame('zins', balance);
    const crash = { ...s, worldModel: { ...s.worldModel, credit: 20, crash: 4 } };
    const r = takeLoan(crash, balance, 1000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.loan.rate).toBeCloseTo(loanRate(balance, s.rating, false) + worldRateAdd(crash.worldModel, wb), 10);
    expect(r.loan.rate).toBeGreaterThan(loanRate(balance, s.rating, false));
  });

  it('jedes Rundenende rückt die Welt ein Quartal weiter; Salt Hill fließt winzig ein', () => {
    let s = newGame('runden', balance);
    expect(s.worldModel.round).toBe(0);
    s = endRound(s, balance);
    s = endRound(s, balance);
    expect(s.worldModel.round).toBe(2);
    expect(Math.abs(saltHillInput(400000, balance.market.demand, wb).extraSupply!)).toBeLessThan(0.1);
  });

  it('der Posted Price am Rundenende nutzt den Welttrend dieser Runde', () => {
    const s = newGame('trend', balance);
    const hoch = { ...s, worldModel: { ...s.worldModel, price: 1.3 } };
    expect(endRound(hoch, balance).postedPrice).toBeGreaterThan(endRound(s, balance).postedPrice);
  });

  it('in Kapitel 1 kann jede Partei die Wahl gewinnen, und Geld wird mal billiger, mal teurer', () => {
    const sieger = { handel: 0, volksbund: 0, provinz: 0 };
    let billiger = 0;
    let teurer = 0;
    let runden = 0;
    for (let i = 0; i < 300; i++) {
      let w = newWorld(`kapitel1-wahl-${i}`, wb);
      for (let r = 0; r < balance.start.rounds; r++) {
        w = advanceWorld(w, wb);
        if (w.news.includes('election') || w.news.includes('reelection')) sieger[w.government] += 1;
        const zins = worldRateAdd(w, wb);
        if (zins < 0) billiger += 1;
        if (zins > 0) teurer += 1;
        runden += 1;
      }
    }
    const wahlen = sieger.handel + sieger.volksbund + sieger.provinz;
    const andere = (sieger.volksbund + sieger.provinz) / wahlen;
    expect(andere).toBeGreaterThan(0.15);
    expect(andere).toBeLessThan(0.45);
    expect(billiger / runden).toBeGreaterThan(0.1);
    expect(teurer / runden).toBeGreaterThan(0.1);
  });

  it('über ein ganzes Kapitel bewegt die Welt den Preistrend nur um wenige Prozent', () => {
    const faktoren = runWorlds('kapitel1', 200, wb, balance.start.rounds).map((r) => worldPriceFactor(r.final, wb));
    const mitte = [...faktoren].sort((a, b) => a - b)[100];
    expect(Math.abs(mitte - 1)).toBeLessThan(0.05);
    for (const f of faktoren) expect(Math.abs(f - 1)).toBeLessThanOrEqual(wb.chapter1.priceMaxDev + 1e-9);
  });
});

describe('Zeitung deutet die Welt an', () => {
  it('was geschah, geht vor Zuständen; ruhige Welt → keine Meldung', () => {
    const w = { ...newWorld('zeitung', wb), credit: 50, mood: 50, tension: 20, crash: 0, news: [] };
    expect(worldHeadline(w, wb)).toBeNull();
    expect(worldHeadline({ ...w, news: ['crash'], crash: 5 }, wb)).toBe('world_crash');
    expect(worldHeadline({ ...w, news: ['war', 'election'] }, wb)).toBe('world_war');
    expect(worldHeadline({ ...w, news: ['election'], government: 'volksbund' }, wb)).toBe('world_election_volksbund');
    expect(worldHeadline({ ...w, credit: 90 }, wb)).toBe('world_credit_easy');
    expect(worldHeadline({ ...w, crash: 2 }, wb)).toBe('world_credit_tight');
    expect(worldHeadline({ ...w, tension: 80 }, wb)).toBe('world_tension');
    expect(worldHeadline({ ...w, mood: 10 }, wb)).toBe('world_mood_angry');
    expect(worldHeadline(undefined, wb)).toBeNull();
  });

  it('die Meldung steht in der Zeitung', () => {
    const text = readFileSync(new URL('../../content/newspaper.yaml', import.meta.url), 'utf8');
    const { content: inhalt, errors } = parseNewspaperContent('content/newspaper.yaml', text);
    expect(errors).toEqual([]);
    const s = newGame('blatt', balance);
    const krieg = { ...s, worldModel: { ...s.worldModel, news: ['war' as const] } };
    const zeitung = makeNewspaper(krieg, balance, inhalt!);
    expect(zeitung.items.map((i) => i.id)).toContain('world_war');
  });
});

describe('Spielstand mit Weltmodell (Format 14)', () => {
  it('das Weltmodell übersteht Sichern und Laden', () => {
    let s = newGame('sichern', balance);
    s = endRound(s, balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.worldModel).toEqual(s.worldModel);
  });

  it('ältere Spielstände (Format 13) bekommen eine ruhige Durchschnittswelt', () => {
    const s = newGame('alt', balance);
    const { worldModel: _weg, ...ohne } = s;
    const text = JSON.stringify({ format: 13, appVersion: '0.2.15+12', savedRound: 1, state: ohne });
    const geladen = deserializeGame(text);
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.worldModel).toEqual(neutralWorld('alt'));
    expect(isWorldState(geladen.state.worldModel)).toBe(true);
    // Mit der Ersatzwelt läuft das Spiel normal weiter.
    expect(endRound(geladen.state, balance).worldModel.round).toBe(1);
  });

  it('die Ersatzwelt ist mit den heutigen Spielzahlen ruhig: ohne Zufall kein Preisruck', () => {
    const ruhig = mit('credit', { boom: 0, speculation: 0, handel: 0, volksbund: 0, provinz: 0 }, mit('tension', { revert: 0, arms: 0 }, still));
    let w = neutralWorld('ersatz');
    for (let i = 0; i < 20; i++) {
      w = advanceWorld(w, ruhig);
      expect(Math.abs(knappheit(w, ruhig) - 1)).toBeLessThan(0.02);
    }
  });

  it('ein kaputtes Weltmodell wird nicht geladen', () => {
    const s = newGame('kaputt', balance);
    const text = JSON.stringify({ format: 14, appVersion: 'x', savedRound: 1, state: { ...s, worldModel: { ...s.worldModel, price: 'teuer' } } });
    expect(deserializeGame(text).ok).toBe(false);
  });
});

describe('balance.yaml: worldModel wird geprüft', () => {
  function mitWert(pfad: string[], wert: unknown): unknown {
    const raw = rawBalance() as Record<string, unknown>;
    const kopie = structuredClone(raw);
    let o = kopie.worldModel as Record<string, unknown>;
    for (const k of pfad.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[pfad.at(-1)!] = wert;
    return kopie;
  }

  it('die echte Datei lädt', () => {
    expect(() => parseGameData(parse(readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8')), rawMap())).not.toThrow();
  });

  it('fehlende oder unsinnige Werte melden einen verständlichen Fehler', () => {
    expect(() => parseBalance(mitWert(['credit', 'crashChance'], 2))).toThrow(BalanceError);
    expect(() => parseBalance(mitWert(['tension', 'warFrom'], 150))).toThrow(/warFrom/);
    expect(() => parseBalance(mitWert(['supply', 'delay'], 0))).toThrow(/delay/);
    expect(() => parseBalance(mitWert(['price', 'min'], 0))).toThrow(/price/);
    expect(() => parseBalance(mitWert(['demand', 'cap'], 1))).toThrow(/cap/);
    expect(() => parseBalance(mitWert(['mood', 'speed'], undefined))).toThrow(/mood.speed/);
  });
});
