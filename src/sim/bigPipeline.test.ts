import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BalanceError, parseGameData, type Balance } from './balance';
import {
  abandonProject,
  acceptChance,
  advanceBigPipelines,
  askRight,
  BIG_PIPELINE_MARKS,
  BIG_PIPELINE_READ_MARKS,
  bigPipelineAssets,
  bigPipelineCapacity,
  bigPipelineCosts,
  bigPipelinesUnlocked,
  harborTrunkRunning,
  buildRounds,
  cleared,
  DEFAULT_PIPELINE_WORLD,
  detourRight,
  expropriateRight,
  offerAmount,
  ownsHarborPipeline,
  payDemand,
  pipelineWorldOf,
  routeSketch,
  planRoute,
  sabotageChanceOf,
  setTrunkGuards,
  startConstruction,
  sueRight,
  surveyRoute,
  thornePressure,
  trunkMode,
  unlockBigPipelines,
  validBigPipelines,
  type PipelineWorld,
  type TrunkProject,
  type WayRight,
} from './bigPipeline';
import { letterText, parsePipelineContent } from './bigPipelineContent';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { resolveEvent } from './events';
import { threatenThorne, withMark } from './logistics';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance, rawBalance, rawMap } from './testBalance';
import { loadEvents } from './testEvents';
import { capacityLeft, modeCapacity, modeUnavailable, netPrice, quoteSale, sellOil, tariff } from './transport';

const balance = loadBalance();
const KAPITEL2: PipelineWorld = { ...DEFAULT_PIPELINE_WORLD, chapter: 2 };
const HAFEN = { origin: 'salthill', destination: 'hafen' };

/** Balance mit verbogenen Werten im Abschnitt bigPipelines (und optional transport.thorne). */
function mitWerten(patch: (b: Record<string, any>) => void): Balance {
  const raw = rawBalance() as Record<string, any>;
  patch(raw);
  return parseGameData(raw, rawMap());
}

/** Eine Partie „in Kapitel 2“: freigeschaltet, mit Geld. */
function kapitel2(seed = 'fernleitung', b: Balance = balance): GameState {
  const s = unlockBigPipelines(newGame(seed, b), b, { world: KAPITEL2 });
  return { ...s, cash: 500_000 };
}

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error((r as unknown as { reason: string }).reason);
  return r as Extract<T, { ok: true }>;
}

function projekt(state: GameState, i = 0): TrunkProject {
  return state.bigPipelines!.projects[i];
}

/** Alle Wegerechte eines Projekts direkt klären (für Tests von Bau und Betrieb). */
function alleRechte(state: GameState, i = 0): GameState {
  const bp = state.bigPipelines!;
  const p = bp.projects[i];
  const rights = p.rights.map((r): WayRight => ({ ...r, status: 'granted' }));
  return { ...state, bigPipelines: { ...bp, projects: bp.projects.map((x, j) => (j === i ? { ...p, rights } : x)) } };
}

/** Eine fertige Fernleitung zum Ziel (ohne Zufall: Rechte direkt, Bau ohne Sabotage). */
function fertigeLeitung(destination = 'hafen', b: Balance = balance, seed = 'fernleitung'): GameState {
  let s = ok(surveyRoute(kapitel2(seed, b), b, { origin: 'salthill', destination })).state;
  s = ok(startConstruction(alleRechte(s), b, projekt(s).id)).state;
  const bp = s.bigPipelines!;
  return { ...s, bigPipelines: { ...bp, projects: bp.projects.map((p) => ({ ...p, status: 'ready' as const, roundsLeft: 0, readyRound: s.round })) } };
}

const OHNE_SABOTAGE = mitWerten((r) => {
  r.bigPipelines.sabotage.building = 0;
  r.bigPipelines.sabotage.ready = 0;
  r.bigPipelines.sabotage.perUnit = 0;
});

describe('Fernleitungen: Freischaltung (Kapitel 2)', () => {
  it('gibt es in Kapitel 1 nicht – das Rundenende ändert nichts und würfelt nichts', () => {
    const s = newGame('k1', balance);
    expect(bigPipelinesUnlocked(s)).toBe(false);
    expect(advanceBigPipelines(s, balance)).toBe(s);
    expect(endRound(s, balance).bigPipelines).toBeUndefined();
    expect(surveyRoute(s, balance, HAFEN)).toEqual({ ok: false, reason: 'Fernleitungen gibt es erst ab Kapitel 2.' });
  });

  it('wird ab balance.bigPipelines.fromChapter freigeschaltet (oder per Debug erzwungen)', () => {
    const s = newGame('k2', balance);
    expect(unlockBigPipelines(s, balance, { world: { ...KAPITEL2, chapter: 1 } })).toBe(s);
    expect(bigPipelinesUnlocked(unlockBigPipelines(s, balance, { world: KAPITEL2 }))).toBe(true);
    expect(bigPipelinesUnlocked(unlockBigPipelines(s, balance, { force: true }))).toBe(true);
    // Auch das Rundenende schaltet frei, sobald das Kapitel reicht.
    expect(bigPipelinesUnlocked(advanceBigPipelines(s, balance, { world: KAPITEL2 }))).toBe(true);
  });

  it('liest Weltgrößen aus dem Zustand, sonst Ersatzwerte', () => {
    expect(pipelineWorldOf({})).toEqual(DEFAULT_PIPELINE_WORLD);
    // Integration: Die Stimmung kommt nur noch aus dem echten Weltmodell (state.worldModel, 4.1).
    expect(pipelineWorldOf({ worldModel: { mood: 30 } }).mood).toBe(30);
    expect(pipelineWorldOf({ chapter: 2, worldModel: { mood: 70 }, politics: { influence: 65 }, laws: { commonCarrier: true } })).toEqual({
      chapter: 2,
      mood: 70,
      influence: 65,
      commonCarrier: true,
    });
  });
});

describe('Fernleitungen: Stimmung aus dem Weltmodell (4.1)', () => {
  it('eine echte Partie (newGame mit Weltmodell) liefert ihre Stimmung – nicht den Ersatzwert 50', () => {
    const s = kapitel2('stimmung');
    expect(s.worldModel).toBeDefined();
    expect(pipelineWorldOf(s).mood).toBe(s.worldModel.mood);
    expect(pipelineWorldOf(s).mood).not.toBe(DEFAULT_PIPELINE_WORLD.mood);
  });

  it('die Stimmung wirkt auf die Wegerechte: im Rundenende ohne vorgegebene Welt entscheidet state.worldModel.mood', () => {
    const basis = ok(surveyRoute(kapitel2('stimmung2', OHNE_SABOTAGE), OHNE_SABOTAGE, HAFEN)).state;
    const p = projekt(basis);
    const r = p.rights.find((x) => x.kind === 'ranch')!;
    const froh: GameState = { ...basis, worldModel: { ...basis.worldModel, mood: 100 } };
    const wuetend: GameState = { ...basis, worldModel: { ...basis.worldModel, mood: 0 } };
    const chance = (st: GameState) => acceptChance(st, OHNE_SABOTAGE, p, r, 'fair', pipelineWorldOf(st));
    expect(chance(froh)).toBeGreaterThan(chance(wuetend));
    expect(chance(froh) - chance(wuetend)).toBeCloseTo(Math.min(1, 100 * OHNE_SABOTAGE.bigPipelines.rights.moodWeight), 6);
    // Über viele Partien: bei guter Stimmung unterschreiben mehr Landbesitzer als bei schlechter (Rundenende liest den Zustand selbst).
    const zusagen = (mood: number) => {
      let ja = 0;
      for (let i = 0; i < 60; i++) {
        let s = ok(surveyRoute(kapitel2(`stimmung-${i}`, OHNE_SABOTAGE), OHNE_SABOTAGE, HAFEN)).state;
        s = { ...s, worldModel: { ...s.worldModel, mood } };
        const recht = projekt(s).rights.find((x) => x.kind === 'ranch' && x.status === 'open');
        if (!recht) continue;
        s = ok(askRight(s, OHNE_SABOTAGE, projekt(s).id, recht.id, 'fair')).state;
        s = advanceBigPipelines(s, OHNE_SABOTAGE);
        if (projekt(s).rights.find((x) => x.id === recht.id)!.status === 'granted') ja++;
      }
      return ja;
    };
    expect(zusagen(100)).toBeGreaterThan(zusagen(0));
  });
});

describe('Fernleitungen: Route planen', () => {
  it('Salt Hill → Hafen: Länge, Bauzeit 1–4 Runden, Kosten, Ranches entlang der Trasse, Stadtrat und Thornes Gleise', () => {
    const plan = ok(planRoute(kapitel2(), balance, HAFEN)).plan;
    expect(plan.length).toBeGreaterThan(15);
    expect(plan.buildRounds).toBe(4);
    expect(plan.buildCost).toBe(Math.round(plan.length * balance.bigPipelines.costPerUnit));
    expect(plan.surveyCost).toBe(Math.round(plan.length * balance.bigPipelines.surveyPerUnit));
    expect(plan.bypassesRail).toBe(true);
    const arten = plan.rights.map((r) => r.kind);
    expect(arten.filter((k) => k === 'ranch' || k === 'own').length).toBeGreaterThan(2);
    expect(arten).toContain('rail');
    expect(arten).toContain('town');
    // Thorne verkauft nie freiwillig: Die Kreuzung beginnt als Forderung.
    const bahn = plan.rights.find((r) => r.kind === 'rail')!;
    expect(bahn.status).toBe('holdout');
    expect(bahn.demand).toBe(balance.bigPipelines.rights.railDemand);
    // Die Stadt liegt am Ende der Trasse.
    expect(plan.rights[plan.rights.length - 1].kind).toBe('town');
  });

  it('Trassenskizze: Ausschnitt 4:3 innerhalb der Karte, mit Trasse und Ranches an der Trasse', () => {
    const s = kapitel2();
    const plan = ok(planRoute(s, balance, HAFEN)).plan;
    const sk = routeSketch(s, balance, plan);
    expect(sk.view.width / sk.view.height).toBeCloseTo(4 / 3, 5);
    expect(sk.view.x).toBeGreaterThanOrEqual(0);
    expect(sk.view.y + sk.view.height).toBeLessThanOrEqual(balance.world.size.height + 1e-9);
    for (const [x, y] of plan.points) {
      expect(x).toBeGreaterThanOrEqual(sk.view.x);
      expect(y).toBeLessThanOrEqual(sk.view.y + sk.view.height);
    }
    expect(sk.ranches.map((r) => r.id)).toEqual(plan.rights.filter((r) => r.kind === 'ranch' || r.kind === 'own').map((r) => r.id));
  });

  it('die Bauzeit bleibt zwischen minRounds und maxRounds', () => {
    expect(buildRounds(balance, 0.6)).toBe(balance.bigPipelines.minRounds);
    expect(buildRounds(balance, 999)).toBe(balance.bigPipelines.maxRounds);
  });

  it('der Bahnhof Port Ellis liegt an Thornes Gleisen: keine Kreuzung, kein Druck', () => {
    const plan = ok(planRoute(kapitel2(), balance, { origin: 'salthill', destination: 'bahnhof_portellis' })).plan;
    expect(plan.bypassesRail).toBe(false);
    expect(plan.rights.some((r) => r.kind === 'rail')).toBe(false);
  });

  it('Anschluss an die kleine Pipeline aus Kapitel 1: beginnt am Bahnhof, kürzer, kostet das Aufweiten', () => {
    const s = kapitel2();
    expect(planRoute(s, balance, { ...HAFEN, fromSmall: true })).toEqual({ ok: false, reason: 'Es gibt keine kleine Pipeline zum Anschließen.' });
    const mitKleiner: GameState = { ...s, logistics: { ...s.logistics, pipeline: 'ready' } };
    const direkt = ok(planRoute(mitKleiner, balance, HAFEN)).plan;
    const anschluss = ok(planRoute(mitKleiner, balance, { ...HAFEN, fromSmall: true })).plan;
    const bahnhof = balance.world.landmarks.find((l) => l.id === 'bahnhof_salthill')!.at!;
    expect(anschluss.points[0]).toEqual(bahnhof);
    expect(anschluss.length).toBeLessThan(direkt.length);
    expect(anschluss.buildCost).toBe(Math.round(anschluss.length * balance.bigPipelines.costPerUnit + balance.bigPipelines.smallUpgradeCost));
    expect(anschluss.buildRounds).toBeLessThan(direkt.buildRounds);
    // Der Bahnhof liegt an den Gleisen – berühren ist kein Kreuzen.
    expect(anschluss.rights.some((r) => r.kind === 'rail')).toBe(false);
  });

  it('eigene Pachten und Wegerechte aus Kapitel 1 sind schon geklärt', () => {
    const s = kapitel2();
    const plan = ok(planRoute(s, balance, HAFEN)).plan;
    const ranch = plan.rights.find((r) => r.kind === 'ranch')!;
    const gepachtet: GameState = {
      ...s,
      leases: [...s.leases, { parcelId: ranch.id, holder: 'jacob', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 99, drilled: false }],
    };
    const eigen = ok(planRoute(gepachtet, balance, HAFEN)).plan.rights.find((r) => r.id === ranch.id)!;
    expect(eigen.kind).toBe('own');
    expect(cleared(eigen)).toBe(true);
    // Figuren-Rechte aus Kapitel 1 (Merkzeichen) gelten weiter, wenn die Trasse ihre Ranch kreuzt.
    const figur = plan.rights.find((r) => s.parcels.find((p) => p.id === r.id)?.figure);
    if (figur) {
      const recht = balance.transport.pipeline.rights.find((r) => r.figure === s.parcels.find((p) => p.id === figur.id)!.figure)!;
      const mitRecht: GameState = { ...s, events: { ...s.events, marks: { ...s.events.marks, [recht.mark]: 3 } } };
      expect(ok(planRoute(mitRecht, balance, HAFEN)).plan.rights.find((r) => r.id === figur.id)!.status).toBe('granted');
    }
  });

  it('lehnt unbekannte Gebiete und Ziele ab', () => {
    expect(planRoute(kapitel2(), balance, { origin: 'hollins', destination: 'hafen' }).ok).toBe(false);
    expect(planRoute(kapitel2(), balance, { origin: 'portellis', destination: 'hafen' }).ok).toBe(false);
    expect(planRoute(kapitel2(), balance, { origin: 'salthill', destination: 'golf' }).ok).toBe(false);
  });
});

describe('Fernleitungen: vermessen und Wegerechte', () => {
  it('Vermessen kostet, legt die Wegerechte auf den Tisch und setzt Merkzeichen', () => {
    const s = kapitel2();
    const plan = ok(planRoute(s, balance, HAFEN)).plan;
    const v = ok(surveyRoute(s, balance, HAFEN)).state;
    expect(v.cash).toBe(s.cash - plan.surveyCost);
    expect(projekt(v).status).toBe('rights');
    expect(projekt(v).rights).toHaveLength(plan.rights.length);
    expect(v.events.marks[BIG_PIPELINE_MARKS.surveyed]).toBe(v.round);
    expect(v.events.marks[BIG_PIPELINE_MARKS.harborPlanned]).toBe(v.round);
    expect(surveyRoute(v, balance, HAFEN)).toEqual({ ok: false, reason: 'Diese Trasse ist schon vermessen.' });
  });

  it('Angebote: Geld beim Notar, großzügig kostet mehr und überzeugt eher', () => {
    const s = ok(surveyRoute(kapitel2(), balance, HAFEN)).state;
    const p = projekt(s);
    const r = p.rights.find((x) => x.kind === 'ranch' && x.status === 'open')!;
    expect(offerAmount(balance, r, 'low')).toBeLessThan(offerAmount(balance, r, 'fair'));
    expect(offerAmount(balance, r, 'fair')).toBeLessThan(offerAmount(balance, r, 'generous'));
    const low = acceptChance(s, balance, p, r, 'low');
    const fair = acceptChance(s, balance, p, r, 'fair');
    const gen = acceptChance(s, balance, p, r, 'generous');
    expect(low).toBeLessThan(fair);
    expect(fair).toBeLessThan(gen);
    const a = ok(askRight(s, balance, p.id, r.id, 'fair')).state;
    expect(a.cash).toBe(s.cash - offerAmount(balance, r, 'fair'));
    const gefragt = projekt(a).rights.find((x) => x.id === r.id)!;
    expect(gefragt.status).toBe('asked');
    expect(gefragt.escrow).toBe(offerAmount(balance, r, 'fair'));
    expect(askRight(a, balance, p.id, r.id, 'fair').ok).toBe(false);
  });

  it('Landbesitzer-Art, Stimmung, Ruf und Thornes Hetze ändern die Chance', () => {
    const s = ok(surveyRoute(kapitel2(), balance, HAFEN)).state;
    const p = projekt(s);
    const basis = { kind: 'ranch' as const, party: 'neutral' as const };
    const neutral = acceptChance(s, balance, p, basis, 'fair');
    expect(acceptChance(s, balance, p, { ...basis, party: 'verschuldet' }, 'fair')).toBeGreaterThan(neutral);
    expect(acceptChance(s, balance, p, { ...basis, party: 'misstrauisch' }, 'fair')).toBeLessThan(neutral);
    expect(acceptChance(s, balance, p, basis, 'fair', { ...KAPITEL2, mood: 80 })).toBeGreaterThan(neutral);
    expect(acceptChance(s, balance, p, basis, 'fair', { ...KAPITEL2, mood: 20 })).toBeLessThan(neutral);
    const ruf: GameState = { ...s, events: { ...s.events, marks: { ...s.events.marks, [BIG_PIPELINE_READ_MARKS.reputation]: 2 } } };
    expect(acceptChance(ruf, balance, p, basis, 'fair')).toBeGreaterThan(neutral);
    // Zum Bahnhof (keine Konkurrenz für Thorne) hetzt er nicht.
    expect(acceptChance(s, balance, { bypassesRail: false }, basis, 'fair')).toBeGreaterThan(neutral);
    // Thorne verkauft nie, eigenes Land ist frei.
    expect(acceptChance(s, balance, p, { kind: 'rail', party: 'thorne' }, 'generous')).toBe(0);
    expect(acceptChance(s, balance, p, { kind: 'own', party: 'neutral' }, 'low')).toBe(1);
  });

  it('Zusage am Rundenende: Wegerecht da, Brief in der Post', () => {
    const sicher = mitWerten((r) => (r.bigPipelines.rights.offerBonus.fair = 5));
    const s = ok(surveyRoute(kapitel2('ja', sicher), sicher, HAFEN)).state;
    const r = projekt(s).rights.find((x) => x.kind === 'ranch' && x.status === 'open')!;
    const a = ok(askRight(s, sicher, projekt(s).id, r.id, 'fair')).state;
    const n = advanceBigPipelines(a, sicher, { world: KAPITEL2 });
    const recht = projekt(n).rights.find((x) => x.id === r.id)!;
    expect(recht.status).toBe('granted');
    expect(recht.escrow).toBe(0);
    expect(n.bigPipelines!.letters.some((l) => l.kind === 'accepted' && l.rightId === r.id)).toBe(true);
  });

  it('Absage: Geld zurück; nach holdoutAfter Absagen (oder einer auf ein großzügiges Angebot) stellt er sich quer', () => {
    const nie = mitWerten((r) => {
      r.bigPipelines.rights.offerBonus = { low: -5, fair: -5, generous: -5 };
      r.bigPipelines.sabotage.building = 0;
    });
    let s = ok(surveyRoute(kapitel2('nein', nie), nie, HAFEN)).state;
    const pid = projekt(s).id;
    const [r1, r2] = projekt(s).rights.filter((x) => x.kind === 'ranch' && x.status === 'open');
    const vorher = s.cash;
    s = ok(askRight(s, nie, pid, r1.id, 'fair')).state;
    s = ok(askRight(s, nie, pid, r2.id, 'generous')).state;
    s = advanceBigPipelines(s, nie, { world: KAPITEL2 });
    expect(s.cash).toBe(vorher);
    expect(projekt(s).rights.find((x) => x.id === r1.id)!.status).toBe('refused');
    const quer = projekt(s).rights.find((x) => x.id === r2.id)!;
    expect(quer.status).toBe('holdout');
    expect(quer.demand).toBe(Math.round((r2.price * nie.bigPipelines.rights.holdoutDemand) / 10) * 10);
    expect(s.events.marks[BIG_PIPELINE_MARKS.holdout]).toBeDefined();
    // Zweite Absage → Querkopf.
    s = ok(askRight(s, nie, pid, r1.id, 'low')).state;
    s = advanceBigPipelines(s, nie, { world: KAPITEL2 });
    expect(projekt(s).rights.find((x) => x.id === r1.id)!.status).toBe('holdout');
    expect(s.bigPipelines!.letters.some((l) => l.kind === 'holdout' && l.rightId === r1.id)).toBe(true);
  });

  it('Querkopf: Forderung zahlen, Umweg bauen oder – nur mit Einfluss – enteignen', () => {
    let s = ok(surveyRoute(kapitel2(), balance, HAFEN)).state;
    const pid = projekt(s).id;
    const ranches = projekt(s).rights.filter((x) => x.kind === 'ranch').slice(0, 3);
    const bp = s.bigPipelines!;
    s = {
      ...s,
      bigPipelines: {
        ...bp,
        projects: [{ ...projekt(s), rights: projekt(s).rights.map((r) => (ranches.some((x) => x.id === r.id) ? { ...r, status: 'holdout' as const, demand: 5000 } : r)) }],
      },
    };
    const [a, b, c] = ranches;
    const bezahlt = ok(payDemand(s, pid, a.id)).state;
    expect(bezahlt.cash).toBe(s.cash - 5000);
    expect(projekt(bezahlt).rights.find((r) => r.id === a.id)!.status).toBe('granted');

    const umweg = ok(detourRight(s, balance, pid, b.id)).state;
    expect(projekt(umweg).length).toBeCloseTo(projekt(s).length + balance.bigPipelines.rights.detourLength, 5);
    expect(projekt(umweg).rights.find((r) => r.id === b.id)!.status).toBe('detour');

    expect(expropriateRight(s, balance, pid, c.id, { ...KAPITEL2, influence: 10 })).toEqual({ ok: false, reason: 'Dafür fehlt Jacob der politische Einfluss.' });
    const enteignet = ok(expropriateRight(s, balance, pid, c.id, { ...KAPITEL2, influence: 80 })).state;
    expect(projekt(enteignet).rights.find((r) => r.id === c.id)!.status).toBe('expropriated');
    expect(enteignet.cash).toBe(s.cash - Math.round(c.price * balance.bigPipelines.rights.expropriateShare));
    expect(enteignet.events.marks[BIG_PIPELINE_MARKS.expropriated]).toBeDefined();
    // Um eine Stadt oder Bahnlinie gibt es keinen Umweg, die Stadt enteignet niemand.
    const bahn = projekt(s).rights.find((r) => r.kind === 'rail')!;
    expect(detourRight(s, balance, pid, bahn.id).ok).toBe(false);
    const stadt = projekt(s).rights.find((r) => r.kind === 'town')!;
    expect(expropriateRight(s, balance, pid, stadt.id, { ...KAPITEL2, influence: 100 }).ok).toBe(false);
  });

  it('Klage gegen Thorne: Urteil nach courtRounds Runden', () => {
    const gewinnt = mitWerten((r) => (r.bigPipelines.rights.courtChance = 1));
    const verliert = mitWerten((r) => (r.bigPipelines.rights.courtChance = 0));
    for (const [b, erwartet] of [
      [gewinnt, 'granted'],
      [verliert, 'holdout'],
    ] as const) {
      let s = ok(surveyRoute(kapitel2('gericht', b), b, HAFEN)).state;
      const bahn = projekt(s).rights.find((r) => r.kind === 'rail')!;
      s = ok(sueRight(s, b, projekt(s).id, bahn.id)).state;
      expect(projekt(s).rights.find((r) => r.id === bahn.id)!.status).toBe('court');
      for (let i = 0; i < b.bigPipelines.rights.courtRounds; i++) s = advanceBigPipelines({ ...s, round: s.round + i }, b, { world: KAPITEL2 });
      expect(projekt(s).rights.find((r) => r.id === bahn.id)!.status).toBe(erwartet);
    }
  });

  it('Einschüchterung (Ereignis): alle Querköpfe an Ranches geben nach – einmal', () => {
    let s = ok(surveyRoute(kapitel2(), OHNE_SABOTAGE, HAFEN)).state;
    const bp = s.bigPipelines!;
    s = { ...s, bigPipelines: { ...bp, projects: [{ ...projekt(s), rights: projekt(s).rights.map((r) => (r.kind === 'ranch' ? { ...r, status: 'holdout' as const, demand: 900 } : r)) }] } };
    s = { ...s, events: { ...s.events, marks: { ...s.events.marks, [BIG_PIPELINE_READ_MARKS.intimidation]: s.round } } };
    const n = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(projekt(n).rights.filter((r) => r.kind === 'ranch').every((r) => r.status === 'granted')).toBe(true);
    // Thornes Kreuzung bleibt eine Forderung.
    expect(projekt(n).rights.find((r) => r.kind === 'rail')!.status).toBe('holdout');
    expect(n.bigPipelines!.handled).toContain(BIG_PIPELINE_READ_MARKS.intimidation);
  });

  it('Aufgeben vor dem Bau: hinterlegtes Geld kommt zurück', () => {
    let s = ok(surveyRoute(kapitel2(), balance, HAFEN)).state;
    const r = projekt(s).rights.find((x) => x.kind === 'ranch' && x.status === 'open')!;
    const vorher = s.cash;
    s = ok(askRight(s, balance, projekt(s).id, r.id, 'generous')).state;
    const weg = ok(abandonProject(s, projekt(s).id)).state;
    expect(weg.cash).toBe(vorher);
    expect(weg.bigPipelines!.projects).toHaveLength(0);
  });
});

describe('Fernleitungen: Bau und Betrieb', () => {
  it('Bau erst mit allen Wegerechten; danach roundsLeft Runden bis zur vollen Kapazität', () => {
    let s = ok(surveyRoute(kapitel2('bau', OHNE_SABOTAGE), OHNE_SABOTAGE, HAFEN)).state;
    expect(startConstruction(s, OHNE_SABOTAGE, projekt(s).id).ok).toBe(false);
    s = alleRechte(s);
    const kosten = Math.round(projekt(s).length * OHNE_SABOTAGE.bigPipelines.costPerUnit);
    const vorher = s.cash;
    s = ok(startConstruction(s, OHNE_SABOTAGE, projekt(s).id)).state;
    expect(s.cash).toBe(vorher - kosten);
    expect(projekt(s).status).toBe('building');
    const runden = projekt(s).roundsLeft;
    expect(runden).toBeGreaterThanOrEqual(1);
    expect(runden).toBeLessThanOrEqual(4);
    for (let i = 0; i < runden - 1; i++) s = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(projekt(s).status).toBe('building');
    expect(bigPipelineCapacity(s, OHNE_SABOTAGE)).toBe(0);
    s = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(projekt(s).status).toBe('ready');
    expect(s.events.marks[BIG_PIPELINE_MARKS.built]).toBeDefined();
    expect(s.events.marks[BIG_PIPELINE_MARKS.harbor]).toBeDefined();
    expect(ownsHarborPipeline(s)).toBe(true);
  });

  it('eine laufende Fernleitung gibt dem Weg „Pipeline“ ihre Kapazität – auch ohne kleine Pipeline', () => {
    const s = fertigeLeitung();
    expect(s.logistics.pipeline).toBe('none');
    expect(modeUnavailable(s, 'pipeline')).toBeNull();
    expect(modeCapacity(s, balance, 'pipeline')).toBe(balance.bigPipelines.capacity);
    expect(capacityLeft(s, balance, 'pipeline')).toBe(balance.bigPipelines.capacity);
    const mitKleiner: GameState = { ...s, logistics: { ...s.logistics, pipeline: 'ready' } };
    expect(modeCapacity(mitKleiner, balance, 'pipeline')).toBe(balance.bigPipelines.capacity + balance.transport.pipeline.capacity);
    // Kapitel 1 unverändert.
    expect(modeCapacity(newGame('k1', balance), balance, 'pipeline')).toBe(0);
  });

  it('eine Leitung zum Bahnhof bringt das Öl nur auf Thornes Gleise: Kapazität für den Weg „Bahn“, zu Thornes Tarif', () => {
    const s: GameState = { ...fertigeLeitung('bahnhof_portellis'), railTariff: 0.5, oilStock: 200_000, royaltyOil: 0 };
    const p = projekt(s);
    expect(p.bypassesRail).toBe(false);
    expect(trunkMode(p)).toBe('rail');
    expect(harborTrunkRunning(s)).toBe(false);
    // Kein billiger Weg „Pipeline“ …
    expect(modeCapacity(s, balance, 'pipeline')).toBe(0);
    expect(modeUnavailable(s, 'pipeline')).not.toBeNull();
    // … sondern mehr Platz auf Thornes Bahn.
    expect(modeCapacity(s, balance, 'rail')).toBe(balance.transport.rail.capacity + balance.bigPipelines.capacity);
    expect(bigPipelineCapacity(s, balance, 'rail')).toBe(balance.bigPipelines.capacity);
    const menge = balance.transport.rail.capacity + 50_000;
    const verkauf = ok(sellOil(s, balance, 'rail', menge));
    expect(verkauf.quote.transportCost).toBeCloseTo(menge * 0.5, 2);
    expect(verkauf.state.shipped.rail).toBe(menge);
    // Ohne Bahnhof-Leitung passt so viel nicht auf die Bahn.
    expect(sellOil({ ...s, bigPipelines: undefined }, balance, 'rail', menge).ok).toBe(false);
  });

  it('Hafen gegen Bahnhof: dieselbe Menge bringt über den Hafen mehr, solange Thornes Tarif über den Pipeline-Kosten liegt', () => {
    const lage = { oilStock: 200_000, royaltyOil: 0, railTariff: 0.4 };
    const hafen: GameState = { ...fertigeLeitung('hafen'), ...lage };
    const bahnhof: GameState = { ...fertigeLeitung('bahnhof_portellis'), ...lage };
    const menge = 100_000;
    const ueberHafen = quoteSale(hafen, balance, 'pipeline', menge);
    const ueberBahnhof = quoteSale(bahnhof, balance, 'rail', menge);
    expect(tariff(hafen, balance, 'pipeline')).toBe(balance.transport.pipeline.costPerBarrel);
    expect(tariff(bahnhof, balance, 'rail')).toBe(0.4);
    expect(netPrice(hafen, balance, 'pipeline')).toBeGreaterThan(netPrice(bahnhof, balance, 'rail'));
    expect(ueberHafen.net - ueberBahnhof.net).toBeCloseTo(menge * (0.4 - balance.transport.pipeline.costPerBarrel), 2);
    expect(capacityLeft(hafen, balance, 'pipeline')).toBeGreaterThanOrEqual(menge);
    expect(capacityLeft(bahnhof, balance, 'rail')).toBeGreaterThanOrEqual(menge);
  });

  it('Unterhalt und Wachleute kosten je Runde', () => {
    let s = fertigeLeitung('hafen', OHNE_SABOTAGE);
    const p = projekt(s);
    expect(bigPipelineCosts(s, OHNE_SABOTAGE).upkeep).toBe(Math.round(p.length * OHNE_SABOTAGE.bigPipelines.upkeepPerUnit));
    s = ok(setTrunkGuards(s, p.id, true)).state;
    const k = bigPipelineCosts(s, OHNE_SABOTAGE);
    expect(k.guards).toBe(Math.round(p.length * OHNE_SABOTAGE.bigPipelines.sabotage.guardsPerUnit));
    const n = advanceBigPipelines({ ...s, railTariff: balance.bigPipelines.thorne.minTariff }, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(n.cash).toBe(s.cash - k.total);
  });

  it('Sabotage: Thorne bei Leitungen zum Hafen, Fehde, Waffenstillstand, Wachleute', () => {
    const s = fertigeLeitung();
    const p = projekt(s);
    const basis = sabotageChanceOf(s, balance, p);
    const sb = balance.bigPipelines.sabotage;
    expect(basis).toBeCloseTo((sb.ready + p.length * sb.perUnit) * sb.thorneFactor, 6);
    expect(sabotageChanceOf(s, balance, { ...p, bypassesRail: false })).toBeLessThan(basis);
    const mark = (m: string): GameState => ({ ...s, events: { ...s.events, marks: { ...s.events.marks, [m]: 1 } } });
    expect(sabotageChanceOf(mark(BIG_PIPELINE_READ_MARKS.thorneFeud), balance, p)).toBeGreaterThan(basis);
    expect(sabotageChanceOf(mark(BIG_PIPELINE_READ_MARKS.truce), balance, p)).toBeLessThan(basis);
    expect(sabotageChanceOf(mark('bullard_fehde'), balance, p)).toBeGreaterThan(basis);
    expect(sabotageChanceOf(s, balance, { ...p, guards: true })).toBeCloseTo(basis * sb.guardsFactor, 6);
    expect(sabotageChanceOf(s, balance, { ...p, status: 'damaged' })).toBe(0);
  });

  it('ein Anschlag legt die Leitung still und kostet die Reparatur; danach läuft sie wieder', () => {
    const immer = mitWerten((r) => {
      r.bigPipelines.sabotage.ready = 1;
      r.bigPipelines.sabotage.maxChance = 1;
    });
    let s = fertigeLeitung('hafen', immer);
    s = { ...s, railTariff: immer.bigPipelines.thorne.minTariff };
    const n = advanceBigPipelines(s, immer, { world: KAPITEL2 });
    expect(projekt(n).status).toBe('damaged');
    expect(n.events.marks[BIG_PIPELINE_MARKS.sabotaged]).toBeDefined();
    const reparatur = Math.round(Math.round(projekt(s).length * immer.bigPipelines.costPerUnit) * immer.bigPipelines.sabotage.repairShare);
    expect(n.cash).toBe(s.cash - reparatur - bigPipelineCosts(n, immer).upkeep);
    expect(bigPipelineCapacity(n, immer)).toBe(0);
    const repariert = advanceBigPipelines(n, immer, { world: KAPITEL2 });
    expect(projekt(repariert).status).toBe('ready');
  });

  it('im Bau verzögert ein Anschlag um eine Runde', () => {
    const immer = mitWerten((r) => {
      r.bigPipelines.sabotage.building = 1;
      r.bigPipelines.sabotage.maxChance = 1;
    });
    let s = ok(surveyRoute(kapitel2('bauanschlag', immer), immer, HAFEN)).state;
    s = ok(startConstruction(alleRechte(s), immer, projekt(s).id)).state;
    const vorher = projekt(s).roundsLeft;
    s = advanceBigPipelines(s, immer, { world: KAPITEL2 });
    expect(projekt(s).roundsLeft).toBe(vorher);
  });

  it('Transportpflicht (4.3): fremdes Öl bringt Gebühren', () => {
    const s = { ...fertigeLeitung('hafen', OHNE_SABOTAGE), railTariff: balance.bigPipelines.thorne.minTariff };
    const ohne = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    const mit = advanceBigPipelines(s, OHNE_SABOTAGE, { world: { ...KAPITEL2, commonCarrier: true } });
    const c = OHNE_SABOTAGE.bigPipelines.carrier;
    expect(mit.cash - ohne.cash).toBe(Math.round(c.volume * c.fee));
  });

  it('Fernleitungen zählen zum Imperiumswert', () => {
    const s = fertigeLeitung();
    const anteil = bigPipelineAssets(s, balance);
    expect(anteil).toBeCloseTo(Math.round(projekt(s).length * balance.bigPipelines.costPerUnit) * balance.bigPipelines.assetShare, 2);
    const ohne: GameState = { ...s, bigPipelines: undefined };
    expect(empireValue(s, balance) - empireValue(ohne, balance)).toBeCloseTo(anteil, 2);
  });
});

describe('Fernleitungen: Thorne unter Druck (Fertig-Kriterium 4.7)', () => {
  it('eine fertige Leitung zum Hafen setzt Thorne unter Druck: Er senkt den Tarif jede Runde bis zum Boden von Kapitel 2', () => {
    const th = balance.bigPipelines.thorne;
    let s: GameState = { ...fertigeLeitung('hafen', OHNE_SABOTAGE), railTariff: 0.8 };
    expect(thornePressure(s, OHNE_SABOTAGE)).toBe(1);
    const n = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(n.railTariff).toBeCloseTo(0.8 - OHNE_SABOTAGE.bigPipelines.thorne.cut, 2);
    expect(n.events.marks[BIG_PIPELINE_MARKS.thornePressure]).toBe(n.round);
    expect(n.bigPipelines!.letters.some((l) => l.kind === 'thorneCut')).toBe(true);
    for (let i = 0; i < 20; i++) s = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
    expect(s.railTariff).toBe(th.minTariff);
    expect(s.bigPipelines!.thorneCut).toBeCloseTo(0.8 - th.minTariff, 2);
  });

  it('vom Starttarif aus wirkt die Senkung über mehrere Runden – der Boden liegt unter dem Mindesttarif aus Kapitel 1', () => {
    const th = balance.bigPipelines.thorne;
    expect(th.minTariff).toBeLessThan(balance.transport.thorne.minTariff);
    let s: GameState = { ...fertigeLeitung('hafen', OHNE_SABOTAGE), railTariff: balance.transport.rail.costPerBarrel };
    const tarife: number[] = [];
    for (let i = 0; i < 10; i++) {
      s = advanceBigPipelines(s, OHNE_SABOTAGE, { world: KAPITEL2 });
      tarife.push(s.railTariff);
    }
    const senkungen = tarife.filter((t, i) => t < (i === 0 ? balance.transport.rail.costPerBarrel : tarife[i - 1])).length;
    expect(senkungen).toBeGreaterThanOrEqual(4);
    expect(s.railTariff).toBe(th.minTariff);
    expect(s.bigPipelines!.letters.filter((l) => l.kind === 'thorneCut').length).toBe(senkungen);
  });

  it('eine Leitung zum Bahnhof (Öl bleibt auf Thornes Gleisen) und eine Leitung im Bau setzen ihn nicht unter Druck', () => {
    const bahnhof: GameState = { ...fertigeLeitung('bahnhof_portellis', OHNE_SABOTAGE), railTariff: 0.8 };
    expect(thornePressure(bahnhof, OHNE_SABOTAGE)).toBe(0);
    expect(advanceBigPipelines(bahnhof, OHNE_SABOTAGE, { world: KAPITEL2 }).railTariff).toBe(0.8);
    let bau = ok(surveyRoute(kapitel2('imbau', OHNE_SABOTAGE), OHNE_SABOTAGE, HAFEN)).state;
    bau = { ...ok(startConstruction(alleRechte(bau), OHNE_SABOTAGE, projekt(bau).id)).state, railTariff: 0.8 };
    expect(advanceBigPipelines(bau, OHNE_SABOTAGE, { world: KAPITEL2 }).railTariff).toBe(0.8);
  });

  it('Jacobs Drohung aus Kapitel 1 hebt einen Tarif unter dem Kapitel-1-Boden nicht wieder an', () => {
    const s: GameState = { ...fertigeLeitung('hafen', OHNE_SABOTAGE), railTariff: OHNE_SABOTAGE.bigPipelines.thorne.minTariff };
    const r = threatenThorne(s, OHNE_SABOTAGE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.railTariff).toBe(OHNE_SABOTAGE.bigPipelines.thorne.minTariff);
  });

  it('halber Druck, halbe Senkung', () => {
    const halb = mitWerten((r) => {
      r.bigPipelines.thorne.fullPressureCapacity = r.bigPipelines.capacity * 2;
      r.bigPipelines.sabotage.ready = 0;
      r.bigPipelines.sabotage.perUnit = 0;
    });
    const s: GameState = { ...fertigeLeitung('hafen', halb), railTariff: 0.8 };
    expect(thornePressure(s, halb)).toBe(0.5);
    expect(advanceBigPipelines(s, halb, { world: KAPITEL2 }).railTariff).toBeCloseTo(0.8 - halb.bigPipelines.thorne.cut / 2, 2);
  });

  it('im ganzen Rundenende: Thorne wagt trotz Bahnfracht keine Erhöhung, sondern senkt', () => {
    const gierig = mitWerten((r) => {
      r.transport.thorne.hikeChance = 1;
      r.bigPipelines.sabotage.ready = 0;
      r.bigPipelines.sabotage.perUnit = 0;
    });
    const basis = fertigeLeitung('hafen', gierig);
    const vorher = 0.6;
    const mitFracht: GameState = { ...basis, railTariff: vorher, shipped: { ...basis.shipped, rail: 1000 } };
    // Ohne Fernleitung erhöht er (hikeChance 1).
    const ohne = endRound({ ...mitFracht, bigPipelines: undefined }, gierig);
    expect(ohne.railTariff).toBeGreaterThan(vorher);
    // Mit Fernleitung zum Hafen (Kapitel 2) nimmt er die Erhöhung zurück und senkt.
    const mit = endRound({ ...mitFracht, chapter: 2 } as GameState, gierig);
    expect(mit.railTariff).toBeCloseTo(vorher - gierig.bigPipelines.thorne.cut, 2);
    expect(mit.log.some((l) => l.includes('nimmt seine Tariferhöhung zurück'))).toBe(true);
  });
});

describe('Fernleitungen: Thornes Antwort auf dem Schreibtisch', () => {
  const katalog = loadEvents();
  /** Eine fertige Leitung zum Hafen (Kapitel 2), Thorne beim Starttarif – das Rundenende mit allen Ereignissen. */
  function druckRunde(seed = 'thorne-brief'): GameState {
    const s = { ...fertigeLeitung('hafen', OHNE_SABOTAGE, seed), railTariff: balance.transport.rail.costPerBarrel, chapter: 2 } as GameState;
    return endRound(s, OHNE_SABOTAGE, katalog);
  }

  it('sobald Thorne senkt, liegt sein Brief im Posteingang (Gegenangebot)', () => {
    const n = druckRunde();
    expect(n.events.marks[BIG_PIPELINE_MARKS.thornePressure]).toBeDefined();
    expect(n.railTariff).toBeLessThan(balance.transport.rail.costPerBarrel);
    expect(n.events.pending).toContain('fernleitung_thorne_gegenangebot');
    const brief = katalog.find((e) => e.id === 'fernleitung_thorne_gegenangebot')!;
    expect(brief.mail).toBe('offer');
    expect(brief.rival).toBe('thorne');
  });

  it('Frachtvertrag: noch billiger und eine Weile keine Erhöhung', () => {
    const n = druckRunde();
    const r = ok(resolveEvent(n, OHNE_SABOTAGE, katalog, 'fernleitung_thorne_gegenangebot', 'frachtvertrag'));
    expect(r.state.railTariff).toBeCloseTo(n.railTariff - 0.03, 2);
    expect(r.state.events.marks.thorne_vertrag).toBeDefined();
  });

  it('Abkommen: Geld und Waffenstillstand – aber keine zweite Leitung zum Hafen (zum Bahnhof schon)', () => {
    const n = druckRunde();
    const r = ok(resolveEvent(n, OHNE_SABOTAGE, katalog, 'fernleitung_thorne_gegenangebot', 'abkommen')).state;
    expect(r.cash).toBe(n.cash + 2000);
    expect(r.events.marks[BIG_PIPELINE_READ_MARKS.thorneDeal]).toBeDefined();
    expect(sabotageChanceOf(r, OHNE_SABOTAGE, projekt(r))).toBe(0);
    const zweites = balance.world.regions.find((g) => g.kind === 'drillable' && g.geology && g.id !== 'salthill')!;
    const mitGebiet: GameState = { ...r, regions: [...r.regions, zweites.id] };
    const nein = surveyRoute(mitGebiet, OHNE_SABOTAGE, { origin: zweites.id, destination: 'hafen' });
    expect(nein).toEqual({ ok: false, reason: 'Jacob hat Thorne sein Wort gegeben: keine weitere Leitung zum Hafen.' });
    expect(surveyRoute(mitGebiet, OHNE_SABOTAGE, { origin: zweites.id, destination: 'bahnhof_portellis' }).ok).toBe(true);
    // Ohne Abkommen ginge die zweite Hafen-Leitung.
    expect(surveyRoute({ ...n, regions: [...n.regions, zweites.id] }, OHNE_SABOTAGE, { origin: zweites.id, destination: 'hafen' }).ok).toBe(true);
  });

  it('wer den Brief verbrennt, bekommt Besuch von Thorne selbst', () => {
    const n = druckRunde();
    expect(n.events.pending).not.toContain('fernleitung_thorne_besuch');
    const feind = withMark(n, BIG_PIPELINE_READ_MARKS.thorneFeud);
    const weiter = endRound({ ...feind, events: { ...feind.events, pending: [] } }, OHNE_SABOTAGE, katalog);
    expect(weiter.events.pending).toContain('fernleitung_thorne_besuch');
    const besuch = katalog.find((e) => e.id === 'fernleitung_thorne_besuch')!;
    expect(besuch.visitor).toBe('thorne');
    // Mit Waffenstillstand kommt er nicht.
    const ruhig = withMark(feind, BIG_PIPELINE_READ_MARKS.truce);
    expect(endRound({ ...ruhig, events: { ...ruhig.events, pending: [] } }, OHNE_SABOTAGE, katalog).events.pending).not.toContain('fernleitung_thorne_besuch');
  });
});

describe('Fernleitungen: Spielstand, Balance, Inhalte', () => {
  it('Spielstand mit Fernleitung lädt wieder (ab Format 14 mit Weltmodell; Fernleitung optional, kein eigenes Format); kaputte Fernleitung wird abgelehnt; ohne ist in Ordnung', () => {
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(14);
    const s = fertigeLeitung();
    const text = serializeGame(s, 'test');
    expect(JSON.parse(text).format).toBe(SAVE_FORMAT);
    const geladen = deserializeGame(text);
    expect(geladen.ok && geladen.state.worldModel).toEqual(s.worldModel);
    expect(geladen.ok && geladen.state.bigPipelines).toEqual(s.bigPipelines);
    expect(validBigPipelines(undefined)).toBe(true);
    expect(validBigPipelines({ ...s.bigPipelines, projects: [{ ...projekt(s), status: 'kaputt' }] })).toBe(false);
    const kaputt = JSON.parse(serializeGame(s, 'test'));
    kaputt.state.bigPipelines.rng = 'x';
    expect(deserializeGame(JSON.stringify(kaputt)).ok).toBe(false);
    expect(deserializeGame(serializeGame(newGame('k1', balance), 'test')).ok).toBe(true);
  });

  it('alte Spielstände (Format 13, ohne Weltmodell und Fernleitungen) laden über die Migration von main weiter', () => {
    const s = newGame('alt13', balance);
    const alt = JSON.parse(serializeGame(s, 'test'));
    alt.format = 13;
    delete alt.state.worldModel;
    delete alt.state.bigPipelines;
    const geladen = deserializeGame(JSON.stringify(alt));
    expect(geladen.ok).toBe(true);
    expect(geladen.ok && geladen.state.bigPipelines).toBeUndefined();
    expect(geladen.ok && geladen.state.worldModel).toBeDefined();
  });

  it('balance.yaml: fehlender Abschnitt und falsches Ziel sind Fehler', () => {
    const ohne = rawBalance() as Record<string, unknown>;
    delete ohne.bigPipelines;
    expect(() => parseGameData(ohne, rawMap())).toThrow(BalanceError);
    expect(() =>
      mitWerten((r) => {
        r.bigPipelines.destinations = [{ id: 'golf', bypassesRail: true }];
      }),
    ).toThrow(/Fernleitungs-Ziel/);
    expect(() => mitWerten((r) => (r.bigPipelines.minRounds = 5))).toThrow(BalanceError);
  });

  it('content/pipelines.yaml: gültig, Absender-Variante vor default, Platzhalter gefüllt', () => {
    const text = readFileSync(new URL('../../content/pipelines.yaml', import.meta.url), 'utf8');
    const { content, errors } = parsePipelineContent('content/pipelines.yaml', text);
    expect(errors).toEqual([]);
    const brief = { round: 1, kind: 'holdout' as const, projectId: 'fl1', rightId: 'x', party: 'thorne' as const, owner: 'Augustus Thorne', ranch: 'Kreuzung', amount: 25000 };
    expect(letterText(content!, brief)).toContain('25.000 $');
    expect(letterText(content!, brief)).toContain('Thorne');
    expect(letterText(content!, { ...brief, party: 'neutral', owner: 'Familie Oakes', ranch: 'Oakes-Ranch' })).toContain('Oakes-Ranch');
    expect(letterText(content!, brief, 'en')).toContain('tracks');
    const kaputt = parsePipelineContent('x.yaml', 'letters:\n  accepted:\n    stadt: { de: Hallo }\n');
    expect(kaputt.content).toBeNull();
    expect(kaputt.errors.some((e) => e.message.includes('default'))).toBe(true);
  });
});

describe('Fernleitungen: Ereignisse (content/events/k2-fernleitung.yaml)', () => {
  it('kommen nur nach Merkzeichen der Fernleitung – also nie in Kapitel 1 – und setzen Merkzeichen, die die Simulation liest', () => {
    const k2 = loadEvents().filter((e) => e.id.startsWith('fernleitung_'));
    expect(k2.map((e) => e.id)).toEqual([
      'fernleitung_thorne_unterhaendler',
      'fernleitung_querkopf_veranda',
      'fernleitung_sabotage_spuren',
      'fernleitung_thorne_gegenangebot',
      'fernleitung_thorne_besuch',
    ]);
    const sim: readonly string[] = Object.values(BIG_PIPELINE_MARKS);
    const gelesen: readonly string[] = Object.values(BIG_PIPELINE_READ_MARKS);
    for (const e of k2) {
      expect(e.marked.length).toBeGreaterThan(0);
      // Mindestens ein Merkzeichen setzt nur die Fernleitung selbst (also nie in Kapitel 1); dazu höchstens eigene Antworten.
      expect(e.marked.some((m) => sim.includes(m))).toBe(true);
      expect(e.marked.every((m) => sim.includes(m) || gelesen.includes(m))).toBe(true);
      // Merkzeichen der Antworten: von der Fernleitung gelesen oder Thornes Frachtvertrag (trust.ts).
      for (const c of e.choices) expect(c.marks.every((m) => gelesen.includes(m) || m === 'thorne_vertrag')).toBe(true);
    }
  });
});
