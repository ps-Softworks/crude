import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { newGame, type GameState } from './game';
import {
  acceptReferral,
  advanceNetwork,
  checkNetwork,
  isCold,
  isKnown,
  jumpNetwork,
  newNetwork,
  noteContact,
  reconcile,
  relationFactor,
  relationOf,
  shiftRelation,
} from './network';
import { bookCard, planView, unbookCard } from './plans';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const r = balance.network.relation;

function spiel(seed = 'netz'): GameState {
  return newGame(seed, balance);
}

describe('Netzwerk: Start und Regeln (0.4.20+42)', () => {
  it('die Regeln in balance.yaml sind stimmig: jede Karte hat eine Stelle, jede Stelle ist erreichbar', () => {
    expect(checkNetwork(balance)).toEqual([]);
  });

  it('Kapitel 1 startet klein: nur die Start-Stellen sind bekannt', () => {
    const g = spiel();
    const start = Object.entries(balance.network.contacts).filter(([, c]) => c.start).map(([id]) => id);
    expect(Object.keys(g.network!.known).sort()).toEqual(start.sort());
    expect(isKnown(g, 'bank')).toBe(true);
    expect(isKnown(g, 'oelleute')).toBe(false);
    expect(isKnown(g, 'marine')).toBe(false);
    expect(relationOf(g, 'bank')).toBe(r.start);
  });

  it('alter Spielstand ohne Netzwerk: alle Stellen bekannt, neutral', () => {
    const g = { ...spiel(), network: undefined };
    expect(isKnown(g, 'marine')).toBe(true);
    expect(relationOf(g, 'marine')).toBe(50);
    expect(advanceNetwork(g, balance)).toBe(g);
  });

  it('Karten unbekannter Stellen liegen nicht auf der Hand', () => {
    const g = spiel();
    const v = planView(g, balance, []);
    const ids = v.cards.map((c) => c.id);
    expect(ids).toContain('rute');
    expect(ids).not.toContain('foerderbremse');
    expect(ids).not.toContain('brennan');
    const r2 = bookCard(g, balance, [], 'foerderbremse');
    expect(r2.ok).toBe(false);
  });

  it('ein checkNetwork-Fehler: Empfehlung von einer Stelle, die es nicht gibt, und nie erreichbare Stellen', () => {
    const kaputt: Balance = {
      ...balance,
      network: { ...balance.network, contacts: { ...balance.network.contacts, a: { start: false, meet: [{ referral: 'b' }], breachMarks: [] }, b: { start: false, meet: [{ referral: 'a' }], breachMarks: [] }, c: { start: false, meet: [{ referral: 'gibtsnicht' }], breachMarks: [] } } },
    };
    const e = checkNetwork(kaputt).join('\n');
    expect(e).toContain('a: nie erreichbar');
    expect(e).toContain('unbekannter Stelle „gibtsnicht“');
  });
});

describe('Netzwerk: Beziehung', () => {
  it('jede gebuchte Karte pflegt die Beziehung; Zurücknehmen nimmt das zurück', () => {
    const g = { ...spiel(), cash: 10000 };
    const parcel = g.parcels.find((p) => !p.discovery)!.id;
    const b = bookCard(g, balance, [], 'rute', parcel);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(relationOf(b.state, 'geologen')).toBe(r.start + r.use);
    expect(noteContact(g, balance, 'oelleute')).toBe(g); // unbekannt: nichts
    const gebucht = b.state.plans.booked.findIndex((x) => x.cardId === 'rute');
    // rute wirkt sofort – zurücknehmen geht nicht, die Pflege bleibt
    expect(unbookCard(b.state, balance, gebucht).ok).toBe(false);
  });

  it('Bruch-Merkzeichen senken die Beziehung genau einmal', () => {
    let g = spiel();
    g = { ...g, network: { ...g.network!, known: { ...g.network!.known, oelleute: { since: 1, relation: 60, last: 1 } } } };
    g = { ...g, events: { ...g.events, marks: { ...g.events.marks, bullard_fehde: 1 } } };
    const a = advanceNetwork(g, balance);
    expect(relationOf(a, 'oelleute')).toBe(60 - r.breach);
    const b = advanceNetwork(a, balance);
    expect(relationOf(b, 'oelleute')).toBe(60 - r.breach);
  });

  it('ohne Kontakt sinkt die Beziehung nach idle Runden – bis zum Boden', () => {
    let g = spiel();
    g = { ...g, round: 1 + r.idle + 1, network: { ...g.network!, known: { ...g.network!.known, bank: { since: 1, relation: 70, last: 1 } } } };
    expect(relationOf(advanceNetwork(g, balance), 'bank')).toBe(70 - r.decay);
    g = { ...g, network: { ...g.network!, known: { ...g.network!.known, bank: { since: 1, relation: r.floor, last: 1 } } } };
    expect(relationOf(advanceNetwork(g, balance), 'bank')).toBe(r.floor);
  });

  it('verärgert: Karten gesperrt, Versöhnen kostet Geld und hebt die Beziehung', () => {
    let g = { ...spiel(), cash: 5000 };
    g = shiftRelation(g, 'geologen', -100);
    expect(isCold(g, balance, 'geologen')).toBe(true);
    const b = bookCard(g, balance, [], 'geologe_einstellen');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toContain('verärgert');
    const v = reconcile(g, balance, 'geologen');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.state.cash).toBe(5000 - r.reconcileCash);
    expect(relationOf(v.state, 'geologen')).toBe(r.reconcileTo);
    expect(reconcile(v.state, balance, 'geologen').ok).toBe(false);
  });

  it('Preisfaktor: neutral 1, enge Beziehung besser, schlechte schlechter', () => {
    const g = spiel();
    expect(relationFactor(g, balance, 'bank')).toBeCloseTo(1, 10);
    expect(relationFactor(shiftRelation(g, 'bank', 50), balance, 'bank')).toBeCloseTo(1 + r.bonus, 10);
    expect(relationFactor(shiftRelation(g, 'bank', -50), balance, 'bank')).toBeCloseTo(1 - r.bonus, 10);
  });

  it('minRelation: Karte erst bei guter Beziehung auf der Hand', () => {
    const b2: Balance = { ...balance, plans: { cards: { ...balance.plans.cards, rute: { ...balance.plans.cards.rute, requires: { minRelation: 70 } } } } };
    const g = spiel();
    expect(planView(g, b2, []).cards.some((c) => c.id === 'rute')).toBe(false);
    expect(planView(shiftRelation(g, 'geologen', 25), b2, []).cards.some((c) => c.id === 'rute')).toBe(true);
  });
});

describe('Netzwerk: Kennenlernen', () => {
  it('Empfehlung: ab referralAt bei den Grundbesitzern liegt die Empfehlung für die Ölleute bereit', () => {
    let g = spiel();
    expect(advanceNetwork(g, balance).network!.referrals).toEqual([]);
    g = shiftRelation(g, 'grundbesitzer', r.referralAt - r.start);
    const a = advanceNetwork(g, balance, { oelleute: 'Andere Ölleute', grundbesitzer: 'Grundbesitzer' });
    expect(a.network!.referrals.map((x) => x.to)).toContain('oelleute');
    expect(a.log.join('\n')).toContain('Grundbesitzer will Jacob mit Andere Ölleute bekannt machen');
    expect(isKnown(a, 'oelleute')).toBe(false);
    // Kein doppeltes Angebot.
    expect(advanceNetwork(a, balance).network!.referrals.filter((x) => x.to === 'oelleute')).toHaveLength(1);
    const ok = acceptReferral(a, balance, 'oelleute', (s) => ({ ok: true, state: s }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(isKnown(ok.state, 'oelleute')).toBe(true);
    expect(relationOf(ok.state, 'oelleute')).toBe(r.start + r.use);
    expect(ok.state.network!.referrals.some((x) => x.to === 'oelleute')).toBe(false);
    expect(acceptReferral(ok.state, balance, 'oelleute', (s) => ({ ok: true, state: s })).ok).toBe(false);
  });

  it('Empfehlung kostet Termine: geht nicht, wenn die Zeit fehlt', () => {
    let g = shiftRelation(spiel(), 'grundbesitzer', 20);
    g = advanceNetwork(g, balance);
    const nein = acceptReferral(g, balance, 'oelleute', () => ({ ok: false, reason: 'keine Zeit' }));
    expect(nein).toEqual({ ok: false, reason: 'keine Zeit' });
  });

  it('Größe: mit einer fördernden Quelle melden sich die Ölleute von selbst', () => {
    const g = spiel();
    const parcelId = g.parcels.find((p) => !p.discovery)!.id;
    const quelle = { id: `${parcelId}#1`, parcelId, stage: 1, status: 'found' as const, roundsLeft: 0, spent: 0, oilStage: 1, result: 'small' as const, production: { initialRate: 1000, roundsProduced: 1, lastRate: 1000, total: 1000 }, startRound: 1 };
    const a = advanceNetwork({ ...g, wells: [quelle] }, balance);
    expect(isKnown(a, 'oelleute')).toBe(true);
    expect(a.log.at(-1)).toContain('meldet sich');
  });

  it('Kapitel-2-Stellen melden sich erst ab Kapitel 2', () => {
    const g = spiel();
    expect(isKnown(advanceNetwork(g, balance), 'arbeiter')).toBe(false);
    expect(isKnown(advanceNetwork({ ...g, chapter: 2, chapterStart: 1 }, balance), 'arbeiter')).toBe(true);
  });

  it('Zeitsprung: Beziehungen verblassen Richtung start, Empfehlungen verfallen', () => {
    const g = shiftRelation(spiel(), 'bank', 40);
    const net = { ...g.network!, referrals: [{ to: 'zeitung', from: 'bank', round: 3 }] };
    const j = jumpNetwork(net, balance, 41)!;
    expect(j.known.bank.relation).toBe(Math.round(90 + (r.start - 90) * r.jumpFade));
    expect(j.known.bank.last).toBe(41);
    expect(j.referrals).toEqual([]);
    expect(jumpNetwork(undefined, balance, 41)).toBeUndefined();
  });

  it('Speichern und Laden behält das Netzwerk', () => {
    const g = advanceNetwork(shiftRelation(spiel(), 'grundbesitzer', 20), balance);
    const back = deserializeGame(serializeGame(g, 'test'));
    expect(back.ok && back.state.network).toEqual(g.network);
  });

  it('newNetwork kennt nur Start-Stellen', () => {
    const n = newNetwork(balance, 5);
    expect(n.known.bank).toEqual({ since: 5, relation: r.start, last: 5 });
    expect(n.known.marine).toBeUndefined();
  });
});

