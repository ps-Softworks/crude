import { describe, expect, it } from 'vitest';
import { networkTurn } from './bots';
import { empireValue } from './empire';
import {
  farmoutParcels,
  financingDebt,
  financingOf,
  FINANCING_HANDLERS,
  financingContacts,
  financingRunning,
  newFinancing,
  settleFinancing,
  sizesIn,
  stateOpen,
  stateOversightHeat,
  whitcombRanch,
  whitcombZone,
  type FinancingState,
} from './financing';
import { drawEvents } from './events';
import { FINANCING_READ_MARKS, FINANCING_SIM_MARKS } from './financingMarks';
import { endRound, newGame, type GameState } from './game';
import { heat } from './investigation';
import type { Lease } from './lease';
import { advanceNetwork, checkNetwork, isKnown, knowAll, relationOf } from './network';
import { bookCard, planView } from './plans';
import { deserializeGame, serializeGame } from './save';
import { totalDebt } from './stocks';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const f = balance.financing;

function spiel(patch: Partial<GameState> = {}): GameState {
  return { ...newGame('geld', balance), network: knowAll(balance), cash: 10000, ...patch };
}

function pacht(state: GameState, parcelId: string, drilled = false): Lease {
  return { parcelId, holder: 'jacob', bonus: 500, royalty: 0.125, startRound: state.round, expiresAfterRound: 99, drilled };
}

function mitMark(state: GameState, mark: string): GameState {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

function fin(state: GameState, patch: Partial<FinancingState>): GameState {
  return { ...state, financing: { ...financingOf(state), ...patch } };
}

describe('Geldquellen: Regeln in balance.yaml', () => {
  it('jede Karte der Geldquellen hat eine Regel und eine bekannte Stelle', () => {
    expect(checkNetwork(balance)).toEqual([]);
    for (const id of Object.keys(FINANCING_HANDLERS)) expect(balance.plans.cards[id]?.handler, id).toBe(id);
    for (const c of financingContacts(balance)) expect(balance.network.contacts[c], c).toBeDefined();
  });

  it('Beträge wachsen mit dem Kapitel; Vale und Staat gibt es in Kapitel 1 nicht', () => {
    expect(sizesIn({ chapter: 1 }, f.investors.haskell.sizes)[0]).toBeLessThan(sizesIn({ chapter: 2 }, f.investors.haskell.sizes)[0]);
    expect(sizesIn({ chapter: 1 }, f.vale.sizes)).toEqual([]);
    expect(sizesIn({ chapter: 1 }, f.state.loan.sizes)).toEqual([]);
    expect(sizesIn({ chapter: 7 }, f.vale.sizes)).toEqual(sizesIn({ chapter: 3 }, f.vale.sizes));
  });
});

describe('Geldquellen: Kennenlernen', () => {
  it('Kapitel 1: Investoren kennt Jacob nicht von Anfang an; die Bank empfiehlt Witwe und Doktor', () => {
    const g = newGame('geld', balance);
    expect(isKnown(g, 'witwe_sloane')).toBe(false);
    const gut = { ...g, network: { ...g.network!, known: { ...g.network!.known, bank: { ...g.network!.known.bank, relation: balance.network.relation.referralAt } } } };
    const a = advanceNetwork(gut, balance);
    const an = a.network!.referrals.map((x) => x.to);
    expect(an).toContain('witwe_sloane');
    expect(an).toContain('doktor_haskell');
  });

  it('Rancher Whitcomb meldet sich bei drei fördernden Quellen von selbst', () => {
    const g = newGame('geld', balance);
    const quellen = g.parcels.filter((p) => !p.discovery).slice(0, 3).map((p, i) => ({ id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found' as const, roundsLeft: 0, spent: 0, oilStage: 1, result: 'small' as const, production: { initialRate: 100 + i, roundsProduced: 1, lastRate: 100, total: 100 }, startRound: 1 }));
    expect(isKnown(advanceNetwork({ ...g, wells: quellen }, balance), 'rancher_whitcomb')).toBe(true);
  });

  it('die Regierung meldet sich nur in Krieg oder Krise (oder hoher Außenspannung), ab Kapitel 2', () => {
    const g = { ...newGame('geld', balance), chapter: 2, chapterStart: 1 };
    const ruhig = { ...g, worldModel: { ...g.worldModel, war: 0, crash: 0, panic: 0, tension: 20, foreign: { ...g.worldModel.foreign, uprising: 0, embargo: 0 } } };
    expect(isKnown(advanceNetwork(ruhig, balance), 'regierung')).toBe(false);
    expect(isKnown(advanceNetwork({ ...ruhig, worldModel: { ...ruhig.worldModel, war: 3 } }, balance), 'regierung')).toBe(true);
    expect(isKnown(advanceNetwork({ ...ruhig, worldModel: { ...ruhig.worldModel, foreign: { ...ruhig.worldModel.foreign, embargo: 2 } } }, balance), 'regierung')).toBe(true);
    expect(isKnown(advanceNetwork({ ...ruhig, worldModel: { ...ruhig.worldModel, tension: 65 } }, balance), 'regierung')).toBe(true);
    // Kapitel 1: auch im Krieg nicht.
    expect(isKnown(advanceNetwork({ ...ruhig, chapter: 1, worldModel: { ...ruhig.worldModel, war: 3 } }, balance), 'regierung')).toBe(false);
  });

  it('Bots nehmen Empfehlungen zu Geldgebern nicht an (kostet sonst Termine)', () => {
    const g = newGame('geld', balance);
    const mitRef = { ...g, network: { ...g.network!, referrals: [{ to: 'witwe_sloane', from: 'bank', round: 1 }] } };
    const b = networkTurn(mitRef, balance);
    expect(isKnown(b, 'witwe_sloane')).toBe(false);
    expect(b.agenda).toEqual(mitRef.agenda);
  });
});

describe('Privatinvestoren', () => {
  it('Einlage: Geld sofort, zählt als Schuld (Steuer, Imperiumswert), steht im Adressbuch', () => {
    const g = spiel();
    const n = sizesIn(g, f.investors.sloane.sizes)[0];
    const r = bookCard(g, balance, [], 'investor_sloane', String(n));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(g.cash + n);
    expect(financingDebt(r.state)).toBe(n);
    expect(totalDebt(r.state)).toBe(totalDebt(g) + n);
    expect(empireValue(r.state, balance)).toBeCloseTo(empireValue(g, balance), 0);
    expect(financingRunning(r.state)[0]).toContain('Einlage');
    // Zweite Einlage derselben Witwe geht nicht, solange die erste läuft.
    expect(bookCard(r.state, balance, [], 'investor_sloane', String(n)).ok).toBe(false);
  });

  it('Gewinnanteil: share vom Gewinn der Runde; ohne Gewinn nichts', () => {
    const g = fin(spiel(), { investors: [{ id: 'haskell', amount: 5000, share: 0.15, from: 1, until: 8, paid: 0, broken: false }] });
    const vorher = { ...g, taxBase: { cash: g.cash, debt: totalDebt(g) } };
    const nachher = { ...vorher, cash: vorher.cash + 2000 };
    const s = settleFinancing(vorher, nachher, balance);
    expect(s.cash).toBeCloseTo(nachher.cash - 300, 2);
    expect(financingOf(s).investors[0].paid).toBe(300);
    const verlust = settleFinancing(vorher, { ...vorher, cash: vorher.cash - 500 }, balance);
    expect(financingOf(verlust).investors[0].paid).toBe(0);
  });

  it('Witwe: Kasse unter der Rücklage bricht den Wunsch – Brief-Merkzeichen, Beziehung sinkt, nur einmal', () => {
    const d = { id: 'sloane' as const, amount: 4000, share: 0.1, from: 1, until: 8, paid: 0, broken: false };
    const g = fin(spiel({ cash: 1000 }), { investors: [d] });
    const s = settleFinancing(g, g, balance);
    expect(s.events.marks.sloane_verstimmt).toBeDefined();
    expect(relationOf(s, 'witwe_sloane')).toBe(relationOf(g, 'witwe_sloane') - balance.network.relation.breach);
    expect(financingOf(s).investors[0].broken).toBe(true);
    const zwei = settleFinancing(s, s, balance);
    expect(relationOf(zwei, 'witwe_sloane')).toBe(relationOf(s, 'witwe_sloane'));
    // Mit genug Kasse kein Bruch.
    const reich = fin(spiel({ cash: 3000 }), { investors: [d] });
    expect(settleFinancing(reich, reich, balance).events.marks.sloane_verstimmt).toBeUndefined();
  });

  it('Doktor: Bankschulden über der Einlage brechen den Wunsch', () => {
    const d = { id: 'haskell' as const, amount: 3000, share: 0.15, from: 1, until: 8, paid: 0, broken: false };
    const loan = { id: 1, source: 'bank' as const, principal: 4000, rate: 0.07, takenRound: 1 };
    const g = fin(spiel({ loans: [loan as GameState['loans'][number]] }), { investors: [d] });
    expect(settleFinancing(g, g, balance).events.marks.haskell_verstimmt).toBeDefined();
  });

  it('Rancher: ein neues Bohrloch neben seiner Weide bricht den Wunsch, eines weit weg nicht', () => {
    const g0 = spiel();
    const ranch = whitcombRanch(g0)!;
    expect(ranch).not.toBeNull();
    const zone = whitcombZone(g0, ranch);
    const nah = zone[1] ?? zone[0];
    const fern = g0.parcels.find((p) => !zone.includes(p.id) && !p.discovery)!.id;
    const d = { id: 'whitcomb' as const, amount: 3000, share: 0.12, from: 2, until: 9, paid: 0, broken: false, ranch };
    const loch = (parcelId: string) => ({ id: `${parcelId}#1`, parcelId, stage: 1, status: 'drilling' as const, roundsLeft: 1, spent: 1000, oilStage: 1, startRound: 3 });
    const g = fin({ ...g0, round: 3 }, { investors: [d] });
    expect(settleFinancing(g, { ...g, wells: [loch(fern)] }, balance).events.marks.whitcomb_verstimmt).toBeUndefined();
    expect(settleFinancing(g, { ...g, wells: [loch(nah)] }, balance).events.marks.whitcomb_verstimmt).toBeDefined();
  });

  it('Laufzeitende: Einlage zurück, wenn die Kasse reicht; sonst verloren – Drama, Beziehung 0, keine Steuer auf die erlassene Schuld', () => {
    const d = { id: 'haskell' as const, amount: 3000, share: 0.15, from: 1, until: 5, paid: 400, broken: false };
    const g = fin(spiel({ round: 5, cash: 5000 }), { investors: [d] });
    const ok = settleFinancing(g, g, balance);
    expect(ok.cash).toBe(2000);
    expect(financingOf(ok).investors).toEqual([]);
    expect(relationOf(ok, 'doktor_haskell')).toBe(relationOf(g, 'doktor_haskell') + balance.network.relation.use);

    const arm = { ...g, cash: 1000, taxBase: { cash: 1000, debt: totalDebt(g) } };
    const weg = settleFinancing(arm, arm, balance);
    expect(weg.cash).toBe(1000);
    expect(weg.events.marks.haskell_ruiniert).toBeDefined();
    expect(relationOf(weg, 'doktor_haskell')).toBe(0);
    expect(financingOf(weg).lost.haskell).toBe(3000);
    expect(financingDebt(weg)).toBe(0);
    expect(weg.taxBase!.debt).toBe(arm.taxBase.debt - 3000);
    // Danach gibt es kein zweites Mal.
    expect(FINANCING_HANDLERS.investor_haskell.lock!(weg, balance)).toContain('kein zweites Mal');
    // Entschädigen: die Hälfte aus eigener Tasche, Beziehung auf reconcileTo.
    const helfen = settleFinancing(weg, mitMark({ ...weg, cash: 4000 }, 'haskell_entschaedigt'), balance);
    expect(helfen.cash).toBe(2500);
    expect(relationOf(helfen, 'doktor_haskell')).toBe(balance.network.relation.reconcileTo);
    // Nur einmal.
    expect(settleFinancing(helfen, helfen, balance).cash).toBe(2500);
  });

  it('Antwort auf den Beschwerdebrief: vorzeitig auszahlen', () => {
    const d = { id: 'sloane' as const, amount: 2000, share: 0.1, from: 1, until: 8, paid: 0, broken: true };
    const g = mitMark(fin(spiel({ cash: 6000 }), { investors: [d] }), 'sloane_auszahlen');
    const s = settleFinancing(g, g, balance);
    expect(s.cash).toBe(4000);
    expect(financingOf(s).investors).toEqual([]);
  });
});

describe('Farm-out', () => {
  function mitPacht(): GameState {
    const g = spiel();
    const p = g.parcels.find((x) => !x.discovery)!;
    return { ...g, leases: [pacht(g, p.id)] };
  }

  it('der Partner bohrt mit eigenem Turm und eigenem Geld auf einer ungebohrten Pacht', () => {
    const g = mitPacht();
    const ziel = farmoutParcels(g)[0];
    const r = bookCard(g, balance, [], 'farmout', ziel);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(g.cash);
    expect(r.state.wells).toHaveLength(1);
    const well = r.state.wells[0];
    expect(well.rigId).toMatch(/^partner-/);
    expect(r.state.rigs.map((x) => x.id)).toContain(well.rigId);
    // Jacobs eigener Turm bleibt frei.
    expect(g.rigs.every((x) => r.state.rigs.some((y) => y.id === x.id))).toBe(true);
    expect(financingOf(r.state).farmouts[0].share).toBe(f.farmout.share);
    expect(farmoutParcels(r.state)).toEqual([]);
  });

  function laufend(cheatRound: number, caught = false): GameState {
    const g = mitPacht();
    const p = g.leases[0].parcelId;
    const well = { id: `${p}#1`, parcelId: p, stage: 1, status: 'found' as const, roundsLeft: 0, spent: 1000, oilStage: 1, result: 'small' as const, production: { initialRate: 1000, roundsProduced: 1, lastRate: 1000, total: 1000 }, startRound: 1 };
    return fin({ ...g, round: cheatRound, wells: [well], oilStock: 5000, royaltyOil: 0, leases: [pacht(g, p, true)] }, {
      farmouts: [{ wellId: well.id, parcelId: p, partner: 'bullard', share: 0.4, rigId: null, from: 1, until: 20, owed: 0, caught }],
    });
  }

  it('Abholung: der Partner nimmt seinen Anteil aus dem Tank; beim Betrug mehr, die Schuld wächst', () => {
    let ehrlich = 0;
    let betrogen = 0;
    for (let runde = 2; runde < 40; runde++) {
      const g = laufend(runde);
      const s = settleFinancing(g, g, balance);
      const weg = g.oilStock - s.oilStock;
      if (weg === 400) ehrlich++;
      else {
        expect(weg).toBe(Math.round(1000 * (0.4 + f.farmout.cheatExtra)));
        expect(financingOf(s).farmouts[0].owed).toBeCloseTo((weg - 400) * g.postedPrice, 2);
        betrogen++;
      }
    }
    expect(ehrlich).toBeGreaterThan(0);
    expect(betrogen).toBeGreaterThan(0);
    // Ertappt: kein Betrug mehr.
    for (let runde = 2; runde < 20; runde++) {
      const g = laufend(runde, true);
      expect(g.oilStock - settleFinancing(g, g, balance).oilStock).toBe(400);
    }
  });

  it('Prüfen: zu viel Genommenes kommt zurück, die Ölleute sind verärgert; grundlos geprüft kränkt ein wenig', () => {
    const g = fin(laufend(5), {});
    const mitSchuld = fin(g, { farmouts: financingOf(g).farmouts.map((x) => ({ ...x, owed: 250 })) });
    const r = bookCard(mitSchuld, balance, [], 'farmout_pruefen');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const karte = balance.plans.cards.farmout_pruefen.cash;
    expect(r.state.cash).toBeCloseTo(mitSchuld.cash - karte + 250, 2);
    expect(financingOf(r.state).farmouts[0].caught).toBe(true);
    // Beziehung: + use fürs Buchen bei „selbst“, − caught bei den Ölleuten.
    expect(relationOf(r.state, 'oelleute')).toBe(relationOf(g, 'oelleute') - f.farmout.caught);
    const sauber = bookCard(g, balance, [], 'farmout_pruefen');
    expect(sauber.ok && relationOf(sauber.state, 'oelleute')).toBe(relationOf(g, 'oelleute') - f.farmout.clean);
  });

  it('trocken: der Partner trägt die Kosten, das Farm-out endet; der Turm des Partners geht nach der Bohrung', () => {
    const g = laufend(5);
    const trocken = { ...g, wells: g.wells.map((w) => ({ ...w, status: 'dry' as const, production: undefined })) };
    expect(financingOf(settleFinancing(trocken, trocken, balance)).farmouts).toEqual([]);
    const rig = { id: 'partner-1-1', kind: 'rented' as const, readyRound: 1, steam: false, rods: false };
    const mitTurm = fin({ ...g, rigs: [...g.rigs, rig] }, { farmouts: financingOf(g).farmouts.map((x) => ({ ...x, rigId: rig.id })) });
    const s = settleFinancing(mitTurm, mitTurm, balance);
    expect(s.rigs.some((x) => x.id === rig.id)).toBe(false);
    // Die Turmmiete (settleRigs) zahlt der Partner.
    expect(s.cash).toBe(mitTurm.cash + balance.drilling.rigs.rent.costPerRound);
  });
});

describe('Konsortium: Mr. Vales Darlehen', () => {
  function k2(patch: Partial<GameState> = {}): GameState {
    return spiel({ chapter: 2, chapterStart: 1, round: 10, ...patch });
  }

  it('nur ab Kapitel 2, einmal je Partie; setzt vale_geld (Vertrauen in Kapitel 3)', () => {
    expect(planView(spiel(), balance, []).cards.map((c) => c.id)).not.toContain('vale_darlehen');
    const g = k2();
    const n = sizesIn(g, f.vale.sizes)[0];
    const r = bookCard(g, balance, [], 'vale_darlehen', String(n));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(g.cash + n);
    expect(r.state.events.marks.vale_geld).toBeDefined();
    expect(financingOf(r.state).vale!.favorRound).toBe(g.round + f.vale.favorAfter);
    expect(financingDebt(r.state)).toBe(n);
    // Zurückgezahlt am Laufzeitende – und Vale gibt nicht noch einmal.
    const ende = { ...r.state, round: financingOf(r.state).vale!.until, cash: n + 100 };
    const s = settleFinancing(ende, ende, balance);
    expect(s.cash).toBe(100);
    expect(FINANCING_HANDLERS.vale_darlehen.lock!(s, balance)).toContain('nur einmal');
  });

  it('nach favorAfter Runden fordert er den Gefallen; wer ablehnt, zahlt sofort, das Konsortium ist verärgert', () => {
    const g = fin(k2(), { vale: { amount: 60000, from: 10, until: 21, favorRound: 14 }, valeUsed: true });
    expect(settleFinancing(g, g, balance).events.marks.vale_gefallen_faellig).toBeUndefined();
    const spaeter = { ...g, round: 14 };
    expect(settleFinancing(spaeter, spaeter, balance).events.marks.vale_gefallen_faellig).toBeDefined();
    const nein = mitMark({ ...spaeter, cash: 70000 }, 'vale_gefallen_verweigert');
    const s = settleFinancing(nein, nein, balance);
    expect(s.cash).toBe(10000);
    expect(financingOf(s).vale).toBeNull();
    expect(relationOf(s, 'konsortium')).toBe(0);
  });
});

describe('Regierung: Staatskredit und Staatsauftrag', () => {
  function k2(krise: boolean): GameState {
    const g = spiel({ chapter: 2, chapterStart: 1, round: 10, oilStock: 20000, royaltyOil: 0 });
    return { ...g, worldModel: { ...g.worldModel, war: krise ? 4 : 0, crash: 0, panic: 0, tension: 10, foreign: { ...g.worldModel.foreign, uprising: 0, embargo: 0 } } };
  }

  it('nur in Krieg oder Krise', () => {
    expect(stateOpen(k2(false), balance)).toBe(false);
    expect(stateOpen(k2(true), balance)).toBe(true);
    expect(FINANCING_HANDLERS.staat_kredit.lock!(k2(false), balance)).toContain('Krieg');
    expect(FINANCING_HANDLERS.staat_kredit.lock!(k2(true), balance)).toBeNull();
  });

  it('Staatskredit: billiges Geld, Zins je Runde, Lieferpflicht zum gebundenen Preis, getilgt am Ende', () => {
    const g = k2(true);
    const n = sizesIn(g, f.state.loan.sizes)[0];
    const r = bookCard(g, balance, [], 'staat_kredit', String(n));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const l = financingOf(r.state).stateLoan!;
    expect(l.qty).toBe(Math.round(n * f.state.loan.deliverPerDollar));
    expect(l.price).toBeCloseTo(g.postedPrice * (1 - f.state.loan.discount), 2);
    const s = settleFinancing(r.state, r.state, balance);
    expect(s.oilStock).toBe(r.state.oilStock - l.qty);
    expect(s.cash).toBeCloseTo(r.state.cash - (n * f.state.loan.rate) / 4 + l.qty * l.price, 1);
    // Leerer Tank: Strafe je fehlendem Barrel.
    const leer = { ...r.state, oilStock: 0 };
    expect(settleFinancing(leer, leer, balance).cash).toBeCloseTo(leer.cash - (n * f.state.loan.rate) / 4 - l.qty * f.state.loan.shortfall, 1);
    const ende = { ...r.state, round: l.until };
    expect(financingOf(settleFinancing(ende, ende, balance)).stateLoan).toBeNull();
  });

  it('Staatsauftrag: Festpreis mit Aufschlag, Aufsicht macht Delaney heiß', () => {
    const g = k2(true);
    const n = sizesIn(g, f.state.order.sizes)[0];
    const r = bookCard(g, balance, [], 'staat_auftrag', String(n));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = financingOf(r.state).stateOrder!;
    expect(o.price).toBeCloseTo(g.postedPrice * (1 + f.state.order.premium), 2);
    expect(stateOversightHeat(r.state, balance)).toBe(f.state.order.heat);
    expect(heat(r.state, balance)).toBe(heat(g, balance) + f.state.order.heat);
    const s = settleFinancing(r.state, r.state, balance);
    expect(s.cash).toBeCloseTo(r.state.cash + n * o.price, 1);
  });
});

describe('Geldquellen im Spielablauf', () => {
  it('Ereignisse: jedes Merkzeichen der Simulation holt ein Ereignis, jede gelesene Antwort setzt eine Wahl', () => {
    const katalog = loadEvents();
    const geld = katalog.filter((e) => e.id.startsWith('geld_'));
    for (const m of FINANCING_SIM_MARKS) expect(geld.some((e) => e.marked.includes(m)), m).toBe(true);
    for (const m of FINANCING_READ_MARKS) expect(geld.some((e) => e.choices.some((c) => c.marks.includes(m))), m).toBe(true);
  });

  it('das Drama kommt, sobald die Einlage verloren ist – auch in Kapitel 2', () => {
    const katalog = loadEvents();
    const g = mitMark(spiel({ chapter: 2, chapterStart: 1, round: 5 }), 'haskell_ruiniert');
    expect(drawEvents({ ...g, round: 6 }, balance, katalog).events.pending).toContain('geld_haskell_ruin');
    const vale = mitMark(spiel({ chapter: 2, chapterStart: 1, round: 5 }), 'vale_gefallen_faellig');
    expect(drawEvents({ ...vale, round: 6 }, balance, katalog).events.pending).toContain('geld_vale_gefallen');
  });

  it('endRound rechnet die Einlage ab (Gewinnanteil vor der Steuer)', () => {
    const g = fin(spiel(), { investors: [{ id: 'sloane', amount: 2000, share: 0.1, from: 1, until: 8, paid: 0, broken: false }] });
    const n = endRound(g, balance);
    expect(n.financing).toBeDefined();
    expect(financingOf(n).investors).toHaveLength(1);
  });

  it('ohne Geldquellen ändert settleFinancing nichts; alte Spielstände laden ohne financing', () => {
    const g = spiel();
    expect(settleFinancing(g, g, balance)).toBe(g);
    const back = deserializeGame(serializeGame(g, 'test'));
    expect(back.ok && back.state.financing).toBeUndefined();
  });

  it('Speichern und Laden behält die Geldquellen; kaputte werden abgelehnt', () => {
    const g = fin(spiel(), { ...newFinancing(), investors: [{ id: 'whitcomb', amount: 3000, share: 0.12, from: 1, until: 8, paid: 0, broken: false, ranch: 'x' }], valeUsed: true });
    const back = deserializeGame(serializeGame(g, 'test'));
    expect(back.ok && back.state.financing).toEqual(g.financing);
    const kaputt = JSON.parse(serializeGame(g, 'test'));
    kaputt.state.financing.investors[0].id = 'niemand';
    expect(deserializeGame(JSON.stringify(kaputt)).ok).toBe(false);
  });
});
