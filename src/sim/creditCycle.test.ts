// 4.4 Kreditklima und Außenspannung: Kreditzyklus (Boom → Überhitzung → Panik oder Crash),
// Wirkung auf Zins und Bankrahmen, Costa Negra und Qasir, Frühwarnzeichen in der Zeitung.
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, type WorldModelBalance } from './balance';
import { baseCreditLimit, creditLimit, headroom, takeLoan } from './credit';
import { newGame } from './game';
import { makeNewspaper, parseNewspaperContent } from './newspaper';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import {
  advanceWorld,
  creditPhase,
  effectiveDemand,
  foreignOffline,
  isWorldState,
  newWorld,
  qasirShare,
  steadyLeverage,
  withCreditForeignDefaults,
  worldLimitFactor,
  worldRateAdd,
  type WorldState,
} from './world';
import { worldHeadline } from './worldNews';
import { CAMPAIGN_ROUNDS, creditCrises, ROUNDS_PER_YEAR, runWorlds } from './worldRun';
import { readFileSync } from 'node:fs';

const balance = loadBalance();
const wb = balance.worldModel;

function mit<K extends keyof WorldModelBalance>(key: K, werte: Partial<WorldModelBalance[K]>, basis: WorldModelBalance = wb): WorldModelBalance {
  return { ...basis, [key]: { ...basis[key], ...werte } };
}

/** Ohne Zufallsereignisse und Rauschen (wie in world.test.ts), dazu ein stilles Ausland. */
const still: WorldModelBalance = (() => {
  let b = mit('credit', { noise: 0, crashChance: 0, crashSlope: 0, priceTrigger: 1 });
  b = mit('tension', { noise: 0, warChance: 0, warSlope: 0 }, b);
  b = mit('supply', { findChance: 0 }, b);
  b = mit('nationalism', { noise: 0, nationalizeChance: 0 }, b);
  b = mit('mood', { noise: 0 }, b);
  b = mit('politics', { noise: 0 }, b);
  return {
    ...b,
    foreign: {
      costaNegra: { ...b.foreign.costaNegra, noise: 0, uprisingChance: 0, uprisingSlope: 0 },
      qasir: { ...b.foreign.qasir, noise: 0, embargoChance: 0, embargoSlope: 0 },
    },
  };
})();

/** Eine Welt ohne Regierungswirkung aufs Kreditklima. */
function welt(seed: string, werte: Partial<WorldState> = {}): WorldState {
  return { ...newWorld(seed, wb), government: 'provinz', ...werte };
}

const L = wb.credit.leverage;

describe('4.4 Kreditzyklus: Phasen', () => {
  it('Crash und Panik gehen vor, dann Überhitzung, Boom, knapp, normal', () => {
    const basis = { credit: 50, crash: 0, panic: 0, leverage: L.base };
    expect(creditPhase(basis, wb)).toBe('normal');
    expect(creditPhase({ ...basis, credit: wb.credit.boomFrom }, wb)).toBe('boom');
    expect(creditPhase({ ...basis, credit: wb.credit.tightFrom }, wb)).toBe('tight');
    expect(creditPhase({ ...basis, credit: 55, leverage: L.bubbleFrom }, wb)).toBe('overheated');
    // Hohe Verschuldung bei ängstlichen Banken ist keine Blase.
    expect(creditPhase({ ...basis, credit: 40, leverage: L.bubbleFrom + 10 }, wb)).toBe('normal');
    expect(creditPhase({ ...basis, panic: 2, leverage: 90, credit: 90 }, wb)).toBe('panic');
    expect(creditPhase({ ...basis, crash: 1, panic: 2 }, wb)).toBe('crash');
  });

  it('balance.yaml: die Frühwarnung liegt vor dem Crash (bubbleFrom ≤ crashFrom)', () => {
    expect(L.bubbleFrom).toBeLessThanOrEqual(L.crashFrom);
  });
});

describe('4.4 Verschuldung: wächst im langen Boom, baut sich sonst ab', () => {
  it('ein langer Boom treibt die Verschuldung über die Blasen-Schwelle, ein kurzer nicht', () => {
    // Kreditklima von außen jede Runde auf ~65 gehalten.
    let w = welt('boom-lang', { credit: 65, leverage: L.base });
    const halten = (x: WorldState) => ({ creditShift: 65 - x.credit });
    const nach = (n: number) => {
      let x = w;
      for (let i = 0; i < n; i++) x = advanceWorld({ ...x, credit: 65 }, still, halten(x));
      return x;
    };
    expect(nach(4).leverage).toBeLessThan(L.bubbleFrom);
    w = nach(200);
    expect(w.leverage).toBeGreaterThan(L.bubbleFrom);
    // Nähert sich dem Gleichgewicht zu diesem Klima.
    expect(Math.abs(w.leverage - steadyLeverage(w.credit, L))).toBeLessThan(2);
  });

  it('bei vorsichtigen Banken (Klima unter 50) sinkt die Verschuldung zur Basis zurück', () => {
    let w = welt('abbau', { credit: 40, leverage: 70 });
    for (let i = 0; i < 80; i++) w = advanceWorld({ ...w, credit: 40 }, still);
    expect(w.leverage).toBeLessThan(L.base + 2);
    expect(w.leverage).toBeGreaterThanOrEqual(L.base - 1e-9);
  });

  it('eine neue Welt startet passend zum Kreditklima, aber ohne Blase', () => {
    for (let i = 0; i < 60; i++) {
      const w = newWorld(`start-lev-${i}`, wb);
      expect(w.leverage).toBeCloseTo(steadyLeverage(w.credit, L, L.start), 10);
      expect(creditPhase(w, wb)).not.toBe('overheated');
    }
  });

  it('leverageShift (vorbereitet: Aktien auf Kredit) heizt die Verschuldung an', () => {
    const w = welt('hebel', { credit: 50, leverage: 30 });
    expect(advanceWorld(w, still, { leverageShift: 5 }).leverage).toBeCloseTo(advanceWorld(w, still).leverage + 5, 10);
  });
});

describe('4.4 Auslöser: Bankpanik oder Crash – die Verschuldung entscheidet', () => {
  const kippt = mit('credit', { crashChance: 1 }, still);

  it('ohne große Verschuldung wird ein Auslöser zur Bankpanik: kürzer, milder, ohne Nachfrageeinbruch', () => {
    const w = welt('panik', { credit: 80, leverage: L.crashFrom - 10 });
    const n = advanceWorld(w, kippt);
    expect(n.news).toContain('panic');
    expect(n.news).not.toContain('crash');
    expect(n.counts.panics).toBe(1);
    expect(n.counts.crashes).toBe(0);
    expect(n.crash).toBe(0);
    expect(n.panic).toBeGreaterThanOrEqual(wb.credit.panicRounds.min);
    expect(n.panic).toBeLessThanOrEqual(wb.credit.panicRounds.max);
    expect(n.leverage).toBeCloseTo(w.leverage * L.panicAfter, 10);
    expect(creditCrises(n)).toBe(1);
    // Nachfrage bleibt, Zins springt, Rahmen schrumpft.
    expect(effectiveDemand(n, wb)).toBeCloseTo(effectiveDemand({ demand: n.demand, tension: n.tension, crash: 0, war: n.war }, wb), 10);
    expect(worldRateAdd(n, wb)).toBeGreaterThan(worldRateAdd({ ...n, panic: 0 }, wb));
    expect(worldLimitFactor(n, wb)).toBe(wb.chapter1.limit.panic);
    // Danach Erholung.
    let x = n;
    for (let i = 0; i < n.panic; i++) x = advanceWorld(x, still);
    expect(x.panic).toBe(0);
    expect(x.news).toContain('recovery');
  });

  it('nach langem Boom (Verschuldung ab leverage.crashFrom) wird derselbe Auslöser zum Crash', () => {
    const w = welt('krach', { credit: 80, leverage: L.crashFrom });
    const n = advanceWorld(w, kippt);
    expect(n.news).toContain('crash');
    expect(n.counts.crashes).toBe(1);
    expect(n.panic).toBe(0);
    expect(n.leverage).toBeCloseTo(w.leverage * L.crashAfter, 10);
    expect(worldLimitFactor(n, wb)).toBe(wb.chapter1.limit.crash);
    // Ein Crash trifft härter als eine Panik: tieferes Klima, schlechtere Stimmung.
    const p = advanceWorld({ ...w, leverage: L.crashFrom - 1 }, kippt);
    expect(n.credit).toBeLessThan(p.credit);
    expect(advanceWorld(n, still).mood).toBeLessThan(advanceWorld(p, still).mood);
  });

  it('in der Panik bremsen die Banken das Bohren (panicPipelineCut, panicInvestCut)', () => {
    const w = welt('panik-bohren', { credit: 80, leverage: 30 });
    const pipe = (panicPipelineCut: number, panicInvestCut: number) => advanceWorld(w, mit('credit', { crashChance: 1, panicPipelineCut, panicInvestCut }, still)).pipeline;
    const voll = pipe(1, 1);
    expect(pipe(0.5, 1)[0]).toBeCloseTo(voll[0] * 0.5, 10);
    expect(pipe(1, 0.25).at(-1)!).toBeCloseTo(voll.at(-1)! * 0.25, 10);
  });

  it('Bankpanik zählt für Gesetze als Kreditkrise (crash im Blick des Parlaments)', () => {
    const w = welt('panik-gesetz', { credit: 80, leverage: 30 });
    const n = advanceWorld(w, kippt, {}, balance.laws);
    expect(n.panic).toBeGreaterThan(0);
    // Der Druck der Einkommensteuer enthält den Krisengrund (+ Punkte), also mehr als ohne Krise.
    const ohne = advanceWorld(w, still, {}, balance.laws);
    expect(n.laws.bills.income_tax?.pressure ?? 0).toBeGreaterThan(ohne.laws.bills.income_tax?.pressure ?? 0);
  });
});

describe('4.4 Wirkung auf die Bank: Zins und Rahmen', () => {
  it('überhitzt heben die Banken die Zinsen schon vor dem Crash (Frühwarnzeichen)', () => {
    const boom = { credit: 60, crash: 0, panic: 0, leverage: L.base };
    const blase = { ...boom, leverage: L.bubbleFrom };
    expect(worldRateAdd(blase, wb) - worldRateAdd(boom, wb)).toBeCloseTo(wb.chapter1.bubbleRate, 10);
    expect(worldRateAdd({ ...boom, panic: 2 }, wb)).toBeGreaterThan(worldRateAdd(boom, wb));
    expect(worldRateAdd({ ...boom, crash: 2 }, wb)).toBeGreaterThan(worldRateAdd({ ...boom, panic: 2 }, wb));
  });

  it('der Bankrahmen folgt der Phase: Boom mehr, Panik und Crash weniger – auf 100 $ gerundet', () => {
    const g = newGame('rahmen', balance);
    const basis = baseCreditLimit(g, balance);
    const mitPhase = (w: Partial<WorldState>) => creditLimit({ ...g, worldModel: { ...g.worldModel, credit: 50, crash: 0, panic: 0, leverage: L.base, ...w } }, balance);
    expect(mitPhase({})).toBe(basis);
    expect(mitPhase({ crash: 3 })).toBe(Math.round((basis * wb.chapter1.limit.crash) / 100) * 100);
    expect(mitPhase({ panic: 3 })).toBe(Math.round((basis * wb.chapter1.limit.panic) / 100) * 100);
    expect(mitPhase({ credit: wb.credit.boomFrom })).toBeGreaterThan(basis);
    expect(mitPhase({ credit: 60, leverage: L.bubbleFrom })).toBeGreaterThan(mitPhase({ credit: 60 }));
    expect(mitPhase({ credit: wb.credit.tightFrom })).toBeLessThan(basis);
    // Ohne Weltmodell: Grundrahmen.
    expect(creditLimit({ wells: g.wells }, balance)).toBe(basis);
  });

  it('im Crash gibt die Bank weniger her – was vorher ging, geht jetzt nicht mehr', () => {
    const g = newGame('crash-kredit', balance);
    const ruhig = { ...g, worldModel: { ...g.worldModel, credit: 50, crash: 0, panic: 0, leverage: L.base } };
    const krach = { ...ruhig, worldModel: { ...ruhig.worldModel, crash: 4 } };
    const betrag = Math.floor(headroom(ruhig, balance) / 100) * 100;
    expect(takeLoan(ruhig, balance, betrag).ok).toBe(true);
    expect(headroom(krach, balance)).toBeLessThan(betrag);
    const r = takeLoan(krach, balance, betrag);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Mehr gibt die Bank nicht/);
  });
});

describe('4.4 Außenspannung: Costa Negra und Qasir', () => {
  it('ein Aufstand in Costa Negra nimmt Förderung vom Markt – der Preis steigt', () => {
    const w = welt('aufstand', { credit: 50 });
    const unruhig = { ...w, foreign: { ...w.foreign, uprising: 3 } };
    expect(foreignOffline(unruhig, wb)).toBeCloseTo(wb.foreign.costaNegra.share * wb.foreign.costaNegra.loss, 10);
    expect(advanceWorld(unruhig, still).price).toBeGreaterThan(advanceWorld(w, still).price * 1.03);
    expect(advanceWorld(unruhig, still).foreign.uprising).toBe(2);
  });

  it('ein Embargo aus Qasir nimmt dessen ganzen Anteil – und der wächst mit dem Ölhunger der Welt', () => {
    expect(qasirShare(1, wb)).toBeCloseTo(wb.foreign.qasir.shareBase, 10);
    expect(qasirShare(4, wb)).toBeGreaterThan(qasirShare(2, wb));
    expect(qasirShare(1000, wb)).toBe(wb.foreign.qasir.shareMax);
    const basis = welt('embargo', { credit: 50 });
    // Eine Welt, die viermal so viel Öl braucht – und fördert.
    const w = { ...basis, demand: 4, capacity: basis.capacity * 4, pipeline: basis.pipeline.map((x) => x * 4) };
    const zu = { ...w, foreign: { ...w.foreign, embargo: 2 } };
    expect(foreignOffline(zu, wb)).toBeCloseTo(qasirShare(4, wb), 10);
    expect(advanceWorld(zu, still).price).toBeGreaterThan(advanceWorld(w, still).price * 1.1);
  });

  it('Aufstand und Embargo enden mit einer Meldung', () => {
    const w = welt('ende');
    expect(advanceWorld({ ...w, foreign: { ...w.foreign, uprising: 1 } }, still).news).toContain('uprising_end');
    expect(advanceWorld({ ...w, foreign: { ...w.foreign, embargo: 1 } }, still).news).toContain('embargo_end');
  });

  it('billiges Öl, Nationalismus und Einmischung machen Costa Negra unruhig; über der Schwelle kommt der Aufstand', () => {
    const w = welt('unruhe', { credit: 50 });
    const ruhig = advanceWorld({ ...w, nationalism: 20, tension: 20 }, still).foreign.costaNegra;
    expect(advanceWorld({ ...w, nationalism: 90, tension: 20 }, still).foreign.costaNegra).toBeGreaterThan(ruhig);
    expect(advanceWorld({ ...w, nationalism: 20, tension: 90 }, still).foreign.costaNegra).toBeGreaterThan(ruhig);
    // Überangebot (volle Tanks) → billiges Öl → Armut.
    expect(advanceWorld({ ...w, nationalism: 20, tension: 20, stock: 0.9 }, still).foreign.costaNegra).toBeGreaterThan(ruhig);
    const sicher = { ...still, foreign: { ...still.foreign, costaNegra: { ...still.foreign.costaNegra, uprisingChance: 1 } } };
    const n = advanceWorld({ ...w, foreign: { ...w.foreign, costaNegra: 95 } }, sicher);
    expect(n.news).toContain('uprising');
    expect(n.counts.uprisings).toBe(1);
    expect(n.foreign.costaNegra).toBe(wb.foreign.costaNegra.after);
  });

  it('wenn die Großmächte um Qasir werben oder Krieg führen, wächst der Unmut; über der Schwelle kommt das Embargo', () => {
    const w = welt('qasir', { credit: 50 });
    const ruhig = advanceWorld({ ...w, tension: 20 }, still).foreign.qasir;
    expect(advanceWorld({ ...w, tension: 80 }, still).foreign.qasir).toBeGreaterThan(ruhig);
    expect(advanceWorld({ ...w, tension: 20, war: 5 }, still).foreign.qasir).toBeGreaterThan(ruhig);
    const sicher = { ...still, foreign: { ...still.foreign, qasir: { ...still.foreign.qasir, embargoChance: 1 } } };
    const n = advanceWorld({ ...w, foreign: { ...w.foreign, qasir: 95 } }, sicher);
    expect(n.news).toContain('embargo');
    expect(n.counts.embargoes).toBe(1);
    expect(n.foreign.embargo).toBeGreaterThanOrEqual(wb.foreign.qasir.rounds.min);
  });
});

describe('Fertig-Kriterium 4.4: Kreditcrash selten, aber möglich', () => {
  // 400 Welten über 20 Spieljahre, mit Gesetzeskatalog wie im Spiel.
  const zwanzig = runWorlds('kreditcrash', 400, wb, 20 * ROUNDS_PER_YEAR, balance.laws);

  it('ein großer Kreditcrash kommt in 5–25 % der 20-Jahres-Welten vor', () => {
    const anteil = zwanzig.filter((r) => r.final.counts.crashes > 0).length / zwanzig.length;
    expect(anteil).toBeGreaterThanOrEqual(0.05);
    expect(anteil).toBeLessThanOrEqual(0.25);
  });

  it('Bankpaniken (kleine Kreditkrisen) sind häufiger als Crashs – Kreditkrisen insgesamt bleiben im GDD-Ziel', () => {
    const panik = zwanzig.filter((r) => r.final.counts.panics > 0).length;
    const krach = zwanzig.filter((r) => r.final.counts.crashes > 0).length;
    expect(panik).toBeGreaterThan(2 * krach);
  });

  // Ganze Kampagnen für Frühwarnung und Ausland.
  const kampagnen = runWorlds('fruehwarnung', 300, wb, CAMPAIGN_ROUNDS, balance.laws);

  it('vor fast jedem Crash warnt die Zeitung: „Ganz Hallstead kauft auf Pump“ in den 8 Runden davor', () => {
    let crashs = 0;
    let gewarnt = 0;
    for (const r of kampagnen) {
      for (const c of r.crashStarts) {
        crashs += 1;
        if (r.bubbleWarnings.some((b) => b < c && b >= c - 8)) gewarnt += 1;
      }
    }
    expect(crashs).toBeGreaterThan(30);
    expect(gewarnt / crashs).toBeGreaterThan(0.9);
    // Die Warnung ist ein Zeichen, kein Dauerzustand.
    const runden = kampagnen.reduce((s, r) => s + r.bubbleWarnings.length, 0) / (kampagnen.length * CAMPAIGN_ROUNDS);
    expect(runden).toBeLessThan(0.15);
  });

  it('Aufstände in Costa Negra kommen in den meisten Welten vor, Embargos aus Qasir selten und spät', () => {
    const aufstand = kampagnen.filter((r) => r.final.counts.uprisings > 0).length / kampagnen.length;
    expect(aufstand).toBeGreaterThan(0.5);
    expect(kampagnen.reduce((s, r) => s + r.final.counts.uprisings, 0) / kampagnen.length).toBeLessThan(5);
    const embargo = kampagnen.filter((r) => r.final.counts.embargoes > 0).length / kampagnen.length;
    expect(embargo).toBeGreaterThan(0.1);
    expect(embargo).toBeLessThan(0.6);
    // In den ersten 10 Jahren ist Qasirs Anteil noch klein und ein Embargo fast nie.
    expect(kampagnen.filter((r) => r.years[10].counts.embargoes > 0).length / kampagnen.length).toBeLessThan(0.05);
  });
});

describe('4.4 Zeitung: Frühwarnzeichen und Meldungen', () => {
  const ruhig = (): WorldState => ({ ...newWorld('zeitung44', wb), credit: 50, leverage: L.base, mood: 50, tension: 20, electionIn: 10, news: [] });

  it('was geschah, geht vor; Panik, Embargo und Aufstand haben eigene Meldungen', () => {
    const w = ruhig();
    expect(worldHeadline(w, wb)).toBeNull();
    expect(worldHeadline({ ...w, news: ['panic'], panic: 3 }, wb)).toBe('world_panic');
    expect(worldHeadline({ ...w, news: ['crash', 'panic'] }, wb)).toBe('world_crash');
    expect(worldHeadline({ ...w, news: ['embargo', 'uprising'] }, wb)).toBe('world_embargo');
    expect(worldHeadline({ ...w, news: ['uprising', 'glut'] }, wb)).toBe('world_uprising');
    expect(worldHeadline({ ...w, news: ['embargo_end'] }, wb)).toBe('world_embargo_end');
    expect(worldHeadline({ ...w, news: ['uprising_end'] }, wb)).toBe('world_uprising_end');
  });

  it('Frühwarnzeichen: Blase, Panik wirkt nach, Unruhe im Süden, Verstimmung in Qasir', () => {
    const w = ruhig();
    expect(worldHeadline({ ...w, credit: 60, leverage: L.bubbleFrom }, wb)).toBe('world_credit_bubble');
    expect(worldHeadline({ ...w, panic: 2 }, wb)).toBe('world_credit_tight');
    expect(worldHeadline({ ...w, foreign: { ...w.foreign, costaNegra: wb.news.unrestHigh } }, wb)).toBe('world_costa_negra_unrest');
    expect(worldHeadline({ ...w, foreign: { ...w.foreign, qasir: wb.news.qasirHigh } }, wb)).toBe('world_qasir_unrest');
    // Während des Aufstands warnt die Zeitung nicht mehr vor ihm.
    expect(worldHeadline({ ...w, foreign: { ...w.foreign, costaNegra: 90, uprising: 2 } }, wb)).toBeNull();
  });

  it('die Meldungen stehen in der Zeitung, große Ereignisse vorn', () => {
    const text = readFileSync(new URL('../../content/newspaper.yaml', import.meta.url), 'utf8');
    const { content } = parseNewspaperContent('newspaper.yaml', text);
    const s = newGame('blatt44', balance);
    for (const [news, id] of [
      ['panic', 'world_panic'],
      ['embargo', 'world_embargo'],
      ['uprising', 'world_uprising'],
    ] as const) {
      const z = makeNewspaper({ ...s, worldModel: { ...s.worldModel, news: [news] } }, balance, content!);
      expect(z.items[0].id).toBe(id);
      expect(z.items[0].title.length).toBeGreaterThan(5);
    }
  });
});

describe('4.4 Spielstand (Format 17)', () => {
  it('Verschuldung, Panik und Ausland überstehen Sichern und Laden', () => {
    const s = newGame('sichern44', balance);
    const mitKrise = { ...s, worldModel: { ...s.worldModel, panic: 2, leverage: 47, foreign: { costaNegra: 61, qasir: 12, uprising: 1, embargo: 0 } } };
    const g = deserializeGame(serializeGame(mitKrise, 'test'));
    if (!g.ok) throw new Error(g.reason);
    expect(g.state.worldModel).toEqual(mitKrise.worldModel);
  });

  it('Stände aus Format 16 bekommen Ersatzwerte: keine Panik, Verschuldung zum Kreditklima, ruhiges Ausland', () => {
    const s = newGame('alt44', balance);
    const { panic: _p, leverage: _l, foreign: _f, ...alt } = s.worldModel;
    const { panics: _a, uprisings: _b, embargoes: _c, ...zaehler } = s.worldModel.counts;
    const text = JSON.stringify({ format: 16, appVersion: '0.4.3', savedRound: 1, state: { ...s, worldModel: { ...alt, counts: zaehler } } });
    const g = deserializeGame(text);
    if (!g.ok) throw new Error(g.reason);
    const w = g.state.worldModel;
    expect(isWorldState(w)).toBe(true);
    expect(w.panic).toBe(0);
    expect(w.foreign.uprising).toBe(0);
    expect(w.foreign.embargo).toBe(0);
    expect(w.counts.panics).toBe(0);
    expect(w.leverage).toBeGreaterThanOrEqual(L.base);
    // Vorhandene Werte bleiben unangetastet.
    expect(withCreditForeignDefaults(s.worldModel)).toEqual(s.worldModel);
  });

  it('ein Weltzustand ohne Ausland ist kaputt', () => {
    const { foreign: _f, ...ohne } = newWorld('kaputt44', wb);
    expect(isWorldState(ohne)).toBe(false);
  });
});

describe('4.4 balance.yaml wird geprüft', () => {
  function mitWert(pfad: string[], wert: unknown): unknown {
    const kopie = structuredClone(rawBalance() as Record<string, unknown>);
    let o = kopie.worldModel as Record<string, unknown>;
    for (const k of pfad.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[pfad.at(-1)!] = wert;
    return kopie;
  }

  it('fehlende oder unsinnige Werte melden einen verständlichen Fehler', () => {
    expect(() => parseBalance(mitWert(['credit', 'leverage', 'bubbleFrom'], 90))).toThrow(/bubbleFrom/);
    expect(() => parseBalance(mitWert(['credit', 'tightFrom'], 70))).toThrow(/tightFrom/);
    expect(() => parseBalance(mitWert(['foreign', 'qasir', 'shareMax'], 2))).toThrow(BalanceError);
    expect(() => parseBalance(mitWert(['foreign', 'costaNegra', 'rounds'], { min: 1.5, max: 3 }))).toThrow(/ganze Runden/);
    expect(() => parseBalance(mitWert(['chapter1', 'limit', 'crash'], undefined))).toThrow(/limit.crash/);
  });
});
