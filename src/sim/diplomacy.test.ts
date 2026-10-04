// Tests für die Rivalen-Diplomatie und die Crane-Nachfolge (4.10).
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, type Balance } from './balance';
import {
  acceptScore,
  advanceDiplomacy,
  answerOffer,
  antitrustInForce,
  backHeir,
  breakPact,
  breakupPressure,
  buyFirm,
  DIPLO_MARKS,
  diplomacyEffects,
  diplomacyHeat,
  diplomacyMoodShift,
  diplomacyView,
  diplomacyWorld,
  FALLBACK_WORLD,
  firmPrice,
  joinGuild,
  leaveGuild,
  openOffers,
  proposePact,
  pushBreakup,
  relationMood,
  startDiplomacy,
  takeoverShield,
  validDiplomacy,
  type DiploGame,
  type DiplomacyState,
} from './diplomacy';
import { margaretPartner, refreshEffects } from './diplomacyEffects';
import {
  DIPLOMACY_PULSE_MARKS,
  DIPLOMACY_READ_MARKS,
  DIPLOMACY_SIM_MARKS,
  driftRelations,
  offerAnswerMark,
  offerMark,
  reconcileMark,
  revengeMark,
  type DiploRival,
} from './diplomacyCore';
import { diploText, parseDiplomacyContent, respectWord } from './diplomacyContent';
import { advanceGuild } from './diplomacyGuild';
import { advanceOffers, advancePacts, wouldOffer } from './diplomacyPacts';
import { advanceSuccession, margaretSeats } from './diplomacySuccession';
import { advanceTakeovers, firmsIncome } from './diplomacyTakeovers';
import { drawEvents, timedEffect } from './events';
import { endRound, newGame, type GameState } from './game';
import { Rng } from './rng';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { jacobPrice, RIVAL_MARKS } from './trust';
import { readFileSync } from 'node:fs';

const balance = loadBalance();
const catalog = loadEvents();

type Roh = Record<string, Record<string, unknown>>;

/** balance.yaml mit geändertem Block „diplomacy“. */
function mitDiplo(patch: (d: Roh) => void): Balance {
  const raw = rawBalance() as { diplomacy: Roh };
  patch(raw.diplomacy);
  return parseBalance(raw);
}

/** Ohne Zufall und ohne Nebenwirkungen: jedes Teilsystem einzeln einschaltbar. */
const ruhig = mitDiplo((d) => {
  d.succession.noise = 0;
  d.succession.creditDrift = 0;
  d.pacts.offerChance = 0;
  d.pacts.breakChance = 0;
  d.relations.revengeChance = 0;
  d.takeovers.pruettBuyChance = 0;
  d.guild.growChance = 0;
});

function ruhigMit(patch: (d: Roh) => void): Balance {
  return mitDiplo((d) => {
    d.succession.noise = 0;
    d.succession.creditDrift = 0;
    d.pacts.offerChance = 0;
    d.pacts.breakChance = 0;
    d.relations.revengeChance = 0;
    d.takeovers.pruettBuyChance = 0;
    d.guild.growChance = 0;
    patch(d);
  });
}

/**
 * Kapitel 2 mit ausgeglichener Welt: Seit 4.1 würfelt newGame die Weltgrößen (Stimmung,
 * Kreditklima …) je Seed – die Tests setzen sie ausdrücklich auf 50/50, damit sie nicht
 * am Würfel des Seeds hängen.
 */
function k2(b: Balance = ruhig, seed = 'diplo'): DiploGame {
  return startDiplomacy(mitWelt({ ...newGame(seed, b), cash: 50000 }, { mood: 50, credit: 50, government: 'handel' }), b, 2) as DiploGame;
}

function mitMarken<T extends GameState>(state: T, marks: Record<string, number>): T {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, ...marks } } };
}

/** Setzt einzelne Weltgrößen; der Rest des Weltmodells (4.1) bleibt, wie er ist. */
function mitWelt<T extends GameState>(state: T, welt: Record<string, unknown>): T {
  return { ...state, worldModel: { ...state.worldModel, ...welt } } as T;
}

/** Ohne Weltmodell (z. B. ein Zustand ohne Block A) – dann gelten die Ersatzwerte. */
function ohneWelt(state: GameState): GameState {
  const { worldModel: _welt, ...rest } = state;
  return rest as GameState;
}

function diplo<T extends DiploGame>(state: T, patch: Partial<DiplomacyState>): T {
  return { ...state, diplomacy: { ...state.diplomacy, ...patch } };
}

function rel(state: DiploGame, rival: keyof DiplomacyState['relations'], trust: number, grudge = 0): DiploGame {
  return diplo(state, { relations: { ...state.diplomacy.relations, [rival]: { trust, grudge } } });
}

function d(state: GameState): DiplomacyState {
  return state.diplomacy!;
}

describe('Kapitel 1: Diplomatie unsichtbar', () => {
  const start = newGame('diplo', balance);

  it('ein neues Spiel hat keine Diplomatie, der Rundenschritt ändert nichts', () => {
    expect(start.diplomacy).toBeUndefined();
    expect(advanceDiplomacy(start, balance)).toBe(start);
  });

  it('startDiplomacy in Kapitel 1 lässt alles, wie es ist', () => {
    expect(startDiplomacy(start, balance, 1)).toBe(start);
  });

  it('eine ganze Partie Kapitel 1: kein k2-Ereignis, keine Diplomatie-Nachwirkung', () => {
    let s = newGame('k1-diplo', balance, catalog);
    while (!s.finished) s = endRound(s, balance, catalog);
    expect(s.events.seen.filter((id) => id.startsWith('k2_'))).toEqual([]);
    expect(s.diplomacy).toBeUndefined();
    expect(s.events.timed.some((t) => t.source === 'diplomatie')).toBe(false);
  });
});

describe('Start in Kapitel 2', () => {
  it('legt die Diplomatie an: Merkzeichen, Startwerte, Nachfolge läuft', () => {
    const s = k2(balance);
    const b = balance.diplomacy;
    expect(d(s).chapter).toBe(2);
    expect(d(s).startRound).toBe(s.round);
    expect(s.events.marks[DIPLO_MARKS.started]).toBe(s.round);
    expect(d(s).respect).toBe(b.relations.respectStart);
    expect(d(s).succession.share).toBe(b.succession.startShare);
    expect(d(s).succession.endRound).toBe(s.round + b.succession.rounds - 1);
    expect(d(s).succession.outcome).toBeNull();
    for (const r of Object.values(d(s).relations)) expect(r).toEqual({ trust: 0, grudge: 0 });
    expect(s.log.at(-1)).toContain('Cornelius Crane zieht sich zurück');
  });

  it('zweimal starten ändert nichts', () => {
    const s = k2();
    expect(startDiplomacy(s, ruhig, 2)).toBe(s);
  });

  it('übernimmt Beziehungen aus Kapitel 1 (Merkzeichen der Rivalen)', () => {
    const c = balance.diplomacy.carryOver;
    const g = newGame('diplo', balance);
    const pakt = startDiplomacy(mitMarken(g, { [RIVAL_MARKS.bullardPact]: 2 }), balance, 2);
    expect(d(pakt).relations.bullard.trust).toBe(c.bullardPactTrust);
    const fehde = startDiplomacy(mitMarken(g, { [RIVAL_MARKS.bullardFeud]: 2 }), balance, 2);
    expect(d(fehde).relations.bullard.grudge).toBe(c.bullardFeudGrudge);
    const verrat = startDiplomacy(mitMarken(g, { [RIVAL_MARKS.bullardPact]: 2, [RIVAL_MARKS.bullardBetrayed]: 5 }), balance, 2);
    expect(relationMood(d(verrat), 'bullard')).toBe('verraten');
    expect(d(verrat).relations.bullard).toEqual({ trust: -balance.diplomacy.relations.betrayalTrust, grudge: balance.diplomacy.relations.betrayalGrudge });
    const viele = startDiplomacy(
      mitMarken(g, { [RIVAL_MARKS.craneLoyal]: 6, [RIVAL_MARKS.alliance]: 6, [RIVAL_MARKS.thorneContract]: 4, [RIVAL_MARKS.thorneRefused]: 4 }),
      balance,
      2,
    );
    expect(d(viele).relations.margaret.trust).toBe(c.craneLoyalTrust);
    expect(d(viele).relations.pruett.trust).toBe(c.craneLoyalTrust);
    expect(d(viele).relations.delgado.trust).toBe(c.delgadoMemberTrust);
    expect(d(viele).relations.thorne).toEqual({ trust: c.thorneContractTrust, grudge: c.thorneRefusedGrudge });
  });

  it('in der nächsten Runde steht Cornelius Crane vor der Tür', () => {
    const s = startDiplomacy(newGame('diplo', balance, catalog), balance, 2);
    const next = endRound(s, balance, catalog);
    expect(next.events.pending).toContain('k2_crane_rueckzug');
  });

  it('gleicher Seed und gleiche Züge ergeben dieselbe Diplomatie (eigener Zufall)', () => {
    const lauf = (seed: string) => {
      let s = startDiplomacy(newGame(seed, balance, catalog), balance, 2);
      for (let i = 0; i < 12 && !s.finished; i++) s = endRound(s, balance, catalog);
      return s;
    };
    expect(lauf('gleich')).toEqual(lauf('gleich'));
    expect(d(lauf('gleich')).rng).not.toBe(d(lauf('anders')).rng);
  });
});

describe('Übertrag aus Kapitel 1: Delgados Verband', () => {
  const g0 = balance.diplomacy.guild;

  it('wer in Kapitel 1 beigetreten ist, ist von Anfang an Mitglied – keine zweite Gründung, keine zweite Bitte', () => {
    const g = mitMarken({ ...newGame('verband', balance, catalog), cash: 50000 }, { [RIVAL_MARKS.alliance]: 5 });
    const s = startDiplomacy(g, balance, 2);
    expect(d(s).guild).toMatchObject({ founded: s.round, member: true, joinedRound: s.round, members: g0.startMembers + 1, expelled: false });
    expect(d(s).relations.delgado.trust).toBe(balance.diplomacy.carryOver.delgadoMemberTrust);
    expect(s.events.marks[DIPLO_MARKS.guildFounded]).toBe(s.round);
    expect(s.events.marks[DIPLO_MARKS.guildCarried]).toBe(s.round);
    // advanceGuild gründet nicht noch einmal, sondern verlangt den Beitrag.
    const weiter = advanceGuild(s as DiploGame, ruhig, new Rng(1));
    expect(d(weiter).guild.founded).toBe(s.round);
    expect(weiter.cash).toBe(s.cash - g0.dues);
    // Ein paar Runden: Die Gründungs-Bitte kommt nie, stattdessen Delgado mit der neuen Satzung.
    let r: GameState = s;
    for (let i = 0; i < 5; i++) r = endRound(r, ruhig, catalog);
    expect(r.events.seen).not.toContain('k2_verband_gruendung');
    expect(r.events.seen).toContain('k2_verband_mitglied');
    expect(d(r).guild.member).toBe(true);
    expect(d(r).relations.delgado.trust).toBeGreaterThan(0);
  });

  it('ohne Beitritt in Kapitel 1: Gründung nach foundDelay und die Bitte um Beitritt', () => {
    let r: GameState = k2();
    expect(d(r).guild.founded).toBe(0);
    for (let i = 0; i < 5; i++) r = endRound(r, ruhig, catalog);
    expect(r.events.seen).toContain('k2_verband_gruendung');
    expect(r.events.seen).not.toContain('k2_verband_mitglied');
  });

  it('beim Neubeginn kündigen: Delgado traut Jacob weniger', () => {
    const s = startDiplomacy(mitMarken(newGame('verband', balance), { [RIVAL_MARKS.alliance]: 5 }), ruhig, 2);
    const raus = advanceDiplomacy(mitMarken(s, { [DIPLO_MARKS.guildCancel]: s.round }), ruhig);
    expect(d(raus).guild.member).toBe(false);
    expect(d(raus).guild.expelled).toBe(false);
    expect(d(raus).relations.delgado.trust).toBe(ruhig.diplomacy.carryOver.delgadoMemberTrust - ruhig.diplomacy.guild.leaveTrust - ruhig.diplomacy.relations.trustDrift);
  });
});

describe('Welt-Schnittstelle (4.1–4.4) mit Ersatzwerten', () => {
  it('ohne Weltmodell gelten die Ersatzwerte', () => {
    expect(diplomacyWorld(ohneWelt(newGame('w', balance)))).toEqual(FALLBACK_WORLD);
    // Mit dem Weltmodell aus 4.1 gelten dessen gewürfelte Werte.
    const g = newGame('w', balance);
    expect(diplomacyWorld(g)).toMatchObject({ mood: g.worldModel.mood, credit: g.worldModel.credit, government: g.worldModel.government });
  });

  it('liest Stimmung, Kreditklima und Regierung aus state.worldModel', () => {
    const s = mitWelt(newGame('w', balance), { mood: 30, credit: 70, government: 'volksbund' });
    expect(diplomacyWorld(s)).toEqual({ mood: 30, credit: 70, government: 'volksbund', antitrustLaw: false });
  });

  it('Kartellgesetz: als Liste, als Nachschlagewerk oder als Merkzeichen', () => {
    const g = newGame('w', balance);
    expect(antitrustInForce(g)).toBe(false);
    expect(antitrustInForce({ ...g, laws: ['kartellgesetz'] } as GameState)).toBe(true);
    expect(antitrustInForce({ ...g, laws: { kartellgesetz: true } } as GameState)).toBe(true);
    expect(antitrustInForce({ ...g, laws: { kartellgesetz: { active: false } } } as GameState)).toBe(false);
    expect(antitrustInForce(mitMarken(g, { gesetz_kartell: 3 }))).toBe(true);
    // Zusammenführung mit 4.3: das beschlossene Kartellgesetz im Weltmodell zählt.
    const beschlossen = { ...g.worldModel, laws: { ...g.worldModel.laws, bills: { antitrust: { ...(g.worldModel.laws.bills.antitrust ?? {}), stage: 'passed' } } } };
    expect(antitrustInForce({ ...g, worldModel: beschlossen } as GameState)).toBe(true);
    const beantragt = { ...g.worldModel, laws: { ...g.worldModel.laws, bills: { antitrust: { ...(g.worldModel.laws.bills.antitrust ?? {}), stage: 'debate' } } } };
    expect(antitrustInForce({ ...g, worldModel: beantragt } as GameState)).toBe(false);
  });
});

describe('Crane-Nachfolge: Margaret gegen Pruett', () => {
  const drift = ruhigMit((x) => {
    x.succession.creditDrift = 0.04;
  });

  it('Boom hilft Margaret, Krise Pruett: Anteil += creditDrift · (Kredit − 50) / 50', () => {
    const boom = advanceSuccession(mitWelt(k2(drift), { credit: 100 }), drift, new Rng(1));
    expect(d(boom).succession.share).toBe(0.54);
    const krise = advanceSuccession(mitWelt(k2(drift), { credit: 0 }), drift, new Rng(1));
    expect(d(krise).succession.share).toBe(0.46);
  });

  it('Zufall verschiebt je Runde höchstens noise / 2', () => {
    // Nur der Zufall: ohne Kredit-Drift (sonst schiebt die Welt zusätzlich).
    const zufall = mitDiplo((x) => {
      x.succession.creditDrift = 0;
    });
    let s = k2(zufall);
    const rng = new Rng(7);
    for (let i = 0; i < 6; i++) {
      const vorher = d(s).succession.share;
      s = advanceSuccession(s, zufall, rng);
      expect(Math.abs(d(s).succession.share - vorher)).toBeLessThanOrEqual(zufall.diplomacy.succession.noise / 2 + 0.005);
    }
  });

  it('in der letzten Runde entscheidet die Mehrheit (Gleichstand: Margaret)', () => {
    const s = k2();
    const ende = d(s).succession.endRound;
    const m = advanceSuccession({ ...diplo(s, { succession: { ...d(s).succession, share: 0.6 } }), round: ende }, ruhig, new Rng(1));
    expect(d(m).succession.outcome).toBe('margaret');
    expect(m.events.marks[DIPLO_MARKS.heirMargaret]).toBe(ende);
    const p = advanceSuccession({ ...diplo(s, { succession: { ...d(s).succession, share: 0.4 } }), round: ende }, ruhig, new Rng(1));
    expect(d(p).succession.outcome).toBe('pruett');
    expect(p.events.marks[DIPLO_MARKS.heirPruett]).toBe(ende);
    const gleich = advanceSuccession({ ...s, round: ende }, ruhig, new Rng(1));
    expect(d(gleich).succession.outcome).toBe('margaret');
    // vor der letzten Runde: noch offen
    expect(d(advanceSuccession(s, ruhig, new Rng(1))).succession.outcome).toBeNull();
  });

  it('Sitze im Aufsichtsrat: Anteil × boardSeats', () => {
    const s = diplo(k2(), { succession: { ...d(k2()).succession, share: 0.75 } });
    expect(margaretSeats(d(s), ruhig)).toBe(9);
  });

  it('Zerschlagungsdruck: Gesetz, Volksbund, Unmut; ohne Anlass sinkt er; ohne Gesetz unter maxWithoutLaw', () => {
    const b = ruhig.diplomacy.succession.breakup;
    const g = k2();
    expect(breakupPressure(g, ruhig, 0.3)).toBe(0.25);
    const unruhig = mitWelt(g, { mood: 0, government: 'volksbund', credit: 50 });
    expect(breakupPressure(unruhig, ruhig, 0.85)).toBe(b.maxWithoutLaw);
    const gesetz = mitMarken(unruhig, { gesetz_kartell: 1 });
    expect(breakupPressure(gesetz, ruhig, 0)).toBe(0.45);
  });

  it('ohne Kartellgesetz wird der Trust nie zerschlagen, mit Gesetz schon', () => {
    let s: DiploGame = mitWelt(k2(), { mood: 0, government: 'volksbund' });
    for (let i = 0; i < 6; i++) s = advanceSuccession(s, ruhig, new Rng(i));
    expect(d(s).succession.outcome).toBeNull();
    s = advanceSuccession(mitMarken(diplo(s, { succession: { ...d(s).succession, breakup: 0.8 } }), { gesetz_kartell: 1 }), ruhig, new Rng(1));
    expect(d(s).succession.outcome).toBe('zerschlagen');
    expect(s.events.marks[DIPLO_MARKS.breakup]).toBe(s.round);
  });

  it('sich hinter einen Erben stellen: Geld, Termin, Anteil, Groll des anderen, einmal je Runde', () => {
    const s = k2();
    const b = ruhig.diplomacy.succession;
    const r = backHeir(s, ruhig, 'margaret');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(s.cash - b.backCost);
    expect(r.state.agenda.used).toBe(s.agenda.used + b.backAppointments);
    expect(d(r.state).succession.share).toBe(0.58);
    expect(d(r.state).succession.backed.margaret).toBe(1);
    expect(d(r.state).relations.pruett.grudge).toBe(5);
    expect(backHeir(r.state, ruhig, 'pruett')).toEqual({ ok: false, reason: 'schon' });
    const p = backHeir(s, ruhig, 'pruett');
    expect(p.ok && d(p.state).succession.share).toBe(0.42);
    expect(backHeir({ ...s, cash: 10 }, ruhig, 'margaret')).toEqual({ ok: false, reason: 'geld' });
    expect(backHeir(newGame('k1', ruhig), ruhig, 'margaret')).toEqual({ ok: false, reason: 'inaktiv' });
    const entschieden = diplo(s, { succession: { ...d(s).succession, outcome: 'pruett' } });
    expect(backHeir(entschieden, ruhig, 'margaret')).toEqual({ ok: false, reason: 'entschieden' });
  });

  it('Respekt macht Jacobs Rückhalt schwerer: backShift × (0,5 + Respekt / 100)', () => {
    const s = diplo(k2(), { respect: 100 });
    const r = backHeir(s, ruhig, 'margaret');
    expect(r.ok && d(r.state).succession.share).toBe(0.62);
  });

  it('Zerschlagung anschieben oder bremsen', () => {
    const s = k2();
    const b = ruhig.diplomacy.succession.breakup;
    const an = pushBreakup(s, ruhig, 1);
    if (!an.ok) throw new Error(an.reason);
    expect(d(an.state).succession.breakup).toBe(b.push);
    expect(an.state.cash).toBe(s.cash - b.pushCost);
    expect(pushBreakup(an.state, ruhig, 1)).toEqual({ ok: false, reason: 'schon' });
    const bremse = pushBreakup(s, ruhig, -1);
    if (!bremse.ok) throw new Error(bremse.reason);
    expect(d(bremse.state).succession.breakup).toBe(0);
    expect(d(bremse.state).relations.margaret.trust).toBe(5);
    expect(d(bremse.state).relations.delgado.grudge).toBe(5);
    const hoch = pushBreakup(diplo(s, { succession: { ...d(s).succession, breakup: 0.85 } }), ruhig, 1);
    expect(hoch.ok && d(hoch.state).succession.breakup).toBe(b.maxWithoutLaw);
  });

  it('die Entscheidung merkt sich, wer wen unterstützt hat', () => {
    const s = ruhig.diplomacy.succession;
    const g = k2();
    const ende = d(g).succession.endRound;
    const gestuetzt = diplo(g, { succession: { ...d(g).succession, share: 0.7, backed: { margaret: 1, pruett: 0 } } });
    const m = advanceSuccession({ ...gestuetzt, round: ende }, ruhig, new Rng(1));
    expect(d(m).relations.margaret.trust).toBe(s.winnerTrust);
    expect(d(m).relations.pruett.grudge).toBe(s.loserGrudge);
    const doppelt = diplo(g, { succession: { ...d(g).succession, share: 0.7, backed: { margaret: 1, pruett: 1 } } });
    const dd = advanceSuccession({ ...doppelt, round: ende }, ruhig, new Rng(1));
    expect(d(dd).relations.margaret.trust).toBe(-s.doubleGameTrust);
    expect(d(dd).relations.pruett.trust).toBe(-s.doubleGameTrust);
    const presse = mitMarken(diplo(g, { succession: { ...d(g).succession, breakup: 0.9, pushedFor: 1 } }), { gesetz_kartell: 1 });
    const z = advanceSuccession(presse, ruhig, new Rng(1));
    expect(d(z).succession.outcome).toBe('zerschlagen');
    expect(d(z).relations.margaret.grudge).toBe(s.loserGrudge);
    expect(d(z).relations.delgado.trust).toBe(s.winnerTrust);
  });
});

describe('Wirkung der Nachfolge auf den Preis', () => {
  const s = ruhig.diplomacy.succession;
  const mit = (outcome: 'margaret' | 'pruett' | 'zerschlagen', g: DiploGame = k2()) => diplo(g, { succession: { ...d(g).succession, outcome } });

  it('Margaret führt: Aufschlag nur für Partner mit genug Vertrauen', () => {
    expect(diplomacyEffects(rel(mit('margaret'), 'margaret', s.partnerTrust), ruhig, 1).price).toBe(s.margaretPremium);
    expect(diplomacyEffects(rel(mit('margaret'), 'margaret', s.partnerTrust - 1), ruhig, 1).price).toBe(0);
  });

  it('Partner ist auch, wer mit Margaret einen Liefervertrag oder eine Kreuzbeteiligung laufen hat', () => {
    const g = rel(mit('margaret'), 'margaret', 0);
    const vertrag = (kind: 'supply' | 'cross' | 'price') =>
      diplo(g, { pacts: [{ id: 'a1', rival: 'margaret', kind, startRound: g.round, endRound: g.round + 3, traced: false }] });
    expect(margaretPartner(d(g), ruhig, g.round)).toBe(false);
    expect(margaretPartner(d(vertrag('supply')), ruhig, g.round)).toBe(true);
    expect(margaretPartner(d(vertrag('cross')), ruhig, g.round)).toBe(true);
    // Abgelaufen zählt nicht mehr.
    expect(margaretPartner(d(vertrag('supply')), ruhig, g.round + 4)).toBe(false);
    expect(diplomacyEffects(vertrag('cross'), ruhig, g.round).price).toBe(s.margaretPremium);
    expect(diplomacyEffects(vertrag('supply'), ruhig, g.round).price).toBe(Math.round((s.margaretPremium + ruhig.diplomacy.pacts.supplyPremium) * 100) / 100);
  });

  it('der Lohn für den Rückhalt verpufft nicht: mit Liefervertrag bleibt der Aufschlag, auch wenn das Vertrauen verblasst', () => {
    // Margaret gewinnt mit Jacobs Rückhalt (winnerTrust), Jacob schließt gleich den Liefervertrag.
    let g: GameState = rel(mit('margaret'), 'margaret', s.winnerTrust);
    expect(margaretSagtZu(g as DiploGame)).toBe(true);
    const a = proposePact(g, ruhig, 'margaret', 'supply');
    if (!a.ok || !a.accepted) throw new Error('Margaret sollte zusagen');
    g = a.state;
    for (let i = 0; i < 8; i++) g = advanceDiplomacy(g, ruhig);
    expect(d(g).relations.margaret.trust).toBeLessThan(s.partnerTrust);
    expect(diplomacyEffects(g as DiploGame, ruhig, g.round).price).toBeGreaterThanOrEqual(s.margaretPremium);
  });

  it('Pruett führt: Abschlag für alle außer Partnern einer Preisabsprache', () => {
    const g = mit('pruett');
    expect(diplomacyEffects(g, ruhig, g.round).price).toBe(-s.pruettCut);
    const pakt = diplo(g, { pacts: [{ id: 'a1', rival: 'pruett', kind: 'price', startRound: g.round, endRound: g.round + 3, traced: false }] });
    expect(diplomacyEffects(pakt, ruhig, g.round).price).toBe(ruhig.diplomacy.pacts.pricePremium);
  });

  it('zerschlagen: beide Nachfolger bieten um das Öl', () => {
    expect(diplomacyEffects(mit('zerschlagen'), ruhig, 1).price).toBe(s.breakupPremium);
  });

  it('die Wirkung kommt über events.timed bei jacobPrice an', () => {
    const g = refreshEffects(rel(mit('margaret'), 'margaret', 50), ruhig, 1);
    expect(timedEffect(g, 'price')).toBe(s.margaretPremium);
    expect(jacobPrice(g, ruhig)).toBeCloseTo(g.postedPrice + s.margaretPremium, 2);
  });
});

/** Margaret sagt einem Vorschlag zu (für den Partner-Test). */
function margaretSagtZu(g: DiploGame): boolean {
  return acceptScore(d(g), ruhig, 'margaret') >= ruhig.diplomacy.pacts.acceptThreshold;
}

describe('Absprachen', () => {
  const p = ruhig.diplomacy.pacts;

  it('Zusage nach Vertrauen, Respekt, Vertragstreue und Groll', () => {
    const g = k2();
    // Bullard: Vertragstreue 5 → +12; ohne Vertrauen 12 < 15
    expect(acceptScore(d(g), ruhig, 'bullard')).toBe(12);
    expect(acceptScore(d(rel(g, 'bullard', 10, 4)), ruhig, 'bullard')).toBe(18);
    expect(acceptScore(d(diplo(g, { respect: 70 })), ruhig, 'bullard')).toBe(22);
  });

  it('Absage kostet trotzdem den Termin; Zusage schließt die Absprache und wirkt sofort', () => {
    const g = k2();
    const nein = proposePact(g, ruhig, 'bullard', 'price');
    if (!nein.ok) throw new Error(nein.reason);
    expect(nein.accepted).toBe(false);
    expect(nein.state.agenda.used).toBe(g.agenda.used + p.appointments);
    expect(d(nein.state).pacts).toEqual([]);
    const ja = proposePact(rel(g, 'bullard', 10), ruhig, 'bullard', 'price');
    if (!ja.ok) throw new Error(ja.reason);
    expect(ja.accepted).toBe(true);
    const pact = d(ja.state).pacts[0];
    expect(pact).toMatchObject({ rival: 'bullard', kind: 'price', startRound: g.round, endRound: g.round + p.rounds - 1 });
    expect(d(ja.state).relations.bullard.trust).toBe(10 + p.acceptTrust);
    expect(timedEffect(ja.state, 'price')).toBe(p.pricePremium);
    expect(proposePact(ja.state, ruhig, 'bullard', 'price')).toEqual({ ok: false, reason: 'laeuft' });
  });

  it('nicht jeder lässt sich auf alles ein', () => {
    const g = k2();
    expect(proposePact(g, ruhig, 'thorne', 'price')).toEqual({ ok: false, reason: 'art' });
    expect(proposePact(g, ruhig, 'delgado', 'cross')).toEqual({ ok: false, reason: 'art' });
    expect(proposePact(g, ruhig, 'bullard', 'supply')).toEqual({ ok: false, reason: 'art' });
  });

  it('Gebietsabsprache macht Pachten billiger', () => {
    const r = proposePact(rel(k2(), 'pruett', 30), ruhig, 'pruett', 'territory');
    expect(r.ok && r.accepted).toBe(true);
    expect(r.ok && timedEffect(r.state, 'leaseCost')).toBe(-p.territoryLeaseCost);
  });

  it('Liefervertrag mit Crane Eastern: mehr Geld, aber Bullard grollt (GDD §9.7)', () => {
    const r = proposePact(rel(k2(), 'margaret', 40), ruhig, 'margaret', 'supply');
    if (!r.ok) throw new Error(r.reason);
    expect(r.accepted).toBe(true);
    expect(timedEffect(r.state, 'price')).toBe(p.supplyPremium);
    expect(d(r.state).relations.bullard.grudge).toBe(p.supplyBullardGrudge);
  });

  it('Kreuzbeteiligung kostet Geld und schützt vor Übernahmen (für 4.8)', () => {
    const g = rel(rel(k2(), 'margaret', 40), 'pruett', 40);
    expect(proposePact({ ...g, cash: 100 }, ruhig, 'margaret', 'cross')).toEqual({ ok: false, reason: 'geld' });
    const a = proposePact(g, ruhig, 'margaret', 'cross');
    if (!a.ok) throw new Error(a.reason);
    expect(a.state.cash).toBe(g.cash - p.crossCost);
    expect(takeoverShield(a.state, ruhig)).toBe(p.crossShield);
    const b = proposePact(a.state, ruhig, 'pruett', 'cross');
    expect(b.ok && takeoverShield(b.state, ruhig)).toBe(2 * p.crossShield);
  });

  it('Kartellgesetz: Preis- und Gebietsabsprachen hinterlassen eine Spur, Kreuzbeteiligungen nicht', () => {
    const g = mitMarken(rel(rel(k2(), 'bullard', 40), 'margaret', 40), { gesetz_kartell: 1 });
    const a = proposePact(g, ruhig, 'bullard', 'price');
    if (!a.ok) throw new Error(a.reason);
    expect(d(a.state).traces).toEqual([{ source: 'kartell_bullard', severity: p.cartelHeat, round: g.round }]);
    expect(diplomacyHeat(a.state)).toBe(p.cartelHeat);
    expect(diplomacyView(a.state, ruhig)!.pacts[0].illegal).toBe(true);
    expect(diplomacyMoodShift(a.state, ruhig)).toBe(-p.cartelMood);
    const c = proposePact(a.state, ruhig, 'margaret', 'cross');
    expect(c.ok && diplomacyHeat(c.state)).toBe(p.cartelHeat);
  });

  it('kommt das Kartellgesetz später, schreibt die laufende Absprache ihre Spur einmal', () => {
    const a = proposePact(rel(k2(), 'bullard', 40), ruhig, 'bullard', 'price');
    if (!a.ok) throw new Error(a.reason);
    expect(diplomacyHeat(a.state)).toBe(0);
    const gesetz = mitMarken(a.state as DiploGame, { gesetz_kartell: a.state.round });
    const eins = advancePacts(gesetz, ruhig, new Rng(1));
    expect(diplomacyHeat(eins)).toBe(p.cartelHeat);
    expect(diplomacyHeat(advancePacts({ ...eins, round: eins.round + 1 }, ruhig, new Rng(2)))).toBe(p.cartelHeat);
  });

  it('Jacob bricht: doppelte Wirkung, Verrat für immer, Respekt sinkt bei allen', () => {
    const r = ruhig.diplomacy.relations;
    const a = proposePact(rel(k2(), 'bullard', 40), ruhig, 'bullard', 'price');
    if (!a.ok) throw new Error(a.reason);
    const pact = d(a.state).pacts[0];
    const b = breakPact(a.state, ruhig, pact.id);
    if (!b.ok) throw new Error(b.reason);
    expect(d(b.state).pacts).toEqual([]);
    expect(timedEffect(b.state, 'price')).toBe(2 * p.pricePremium);
    expect(d(b.state).aftermath).toEqual([{ key: 'price', value: 2 * p.pricePremium, from: a.state.round, until: a.state.round + p.breakRounds - 1 }]);
    expect(relationMood(d(b.state), 'bullard')).toBe('verraten');
    expect(d(b.state).relations.bullard).toEqual({ trust: 45 - r.betrayalTrust, grudge: r.betrayalGrudge });
    expect(d(b.state).respect).toBe(r.respectStart - r.betrayalRespect);
    expect(b.state.events.marks[DIPLO_MARKS.betrayer]).toBe(a.state.round);
    expect(proposePact(rel(b.state as DiploGame, 'bullard', 100), ruhig, 'bullard', 'territory')).toEqual({ ok: false, reason: 'verraten' });
    expect(breakPact(b.state, ruhig, pact.id)).toEqual({ ok: false, reason: 'unbekannt' });
  });

  it('Kreuzbeteiligung brechen: Aktien zurück', () => {
    const a = proposePact(rel(k2(), 'margaret', 40), ruhig, 'margaret', 'cross');
    if (!a.ok) throw new Error(a.reason);
    const b = breakPact(a.state, ruhig, d(a.state).pacts[0].id);
    expect(b.ok && b.state.cash).toBe(a.state.cash + p.crossCost);
  });

  it('bricht ein Rivale, verliert Jacob die Wirkung und zahlt eine Weile drauf', () => {
    const brecher = ruhigMit((x) => {
      x.pacts.breakChance = 1;
    });
    const a = proposePact(rel(rel(k2(brecher), 'pruett', 40), 'margaret', 40), brecher, 'pruett', 'price');
    if (!a.ok) throw new Error(a.reason);
    const c = proposePact(a.state, brecher, 'margaret', 'cross');
    if (!c.ok) throw new Error(c.reason);
    const s = advancePacts(c.state as DiploGame, brecher, new Rng(1));
    expect(d(s).pacts.map((x) => x.kind)).toEqual(['cross']);
    expect(d(s).aftermath).toEqual([{ key: 'price', value: -p.pricePremium, from: c.state.round + 1, until: c.state.round + p.breakRounds }]);
    expect(s.events.marks[DIPLO_MARKS.betrayed]).toBe(c.state.round);
    expect(d(s).memory.some((m) => m.rival === 'pruett' && m.kind === 'beleidigung')).toBe(true);
  });

  it('Absprachen laufen nach pacts.rounds Runden aus', () => {
    const a = proposePact(rel(k2(), 'bullard', 40), ruhig, 'bullard', 'price');
    if (!a.ok) throw new Error(a.reason);
    const pact = d(a.state).pacts[0];
    const vorher = advancePacts({ ...(a.state as DiploGame), round: pact.endRound - 1 }, ruhig, new Rng(1));
    expect(d(vorher).pacts).toHaveLength(1);
    const danach = advancePacts({ ...(a.state as DiploGame), round: pact.endRound }, ruhig, new Rng(1));
    expect(d(danach).pacts).toEqual([]);
    expect(danach.log.at(-1)).toContain('läuft aus');
  });
});

describe('Angebote der Rivalen', () => {
  const angebote = ruhigMit((x) => {
    x.pacts.offerChance = 1;
  });

  it('ein Rivale schlägt etwas vor; antworten erst ab der nächsten Runde', () => {
    const g = k2(angebote);
    const s = advanceOffers(g, angebote, new Rng(3));
    expect(d(s).offers).toHaveLength(1);
    const o = d(s).offers[0];
    expect(o.round).toBe(g.round);
    expect(o.expires).toBe(g.round + angebote.diplomacy.pacts.offerRounds);
    expect(answerOffer(s, angebote, o.id, true)).toEqual({ ok: false, reason: 'unbekannt' });
    const naechste = { ...s, round: s.round + 1 };
    expect(openOffers(naechste)).toBe(1);
    const ja = answerOffer(naechste, angebote, o.id, true);
    if (!ja.ok) throw new Error(ja.reason);
    expect(d(ja.state).offers).toEqual([]);
    expect(d(ja.state).pacts.map((x) => [x.rival, x.kind])).toEqual([[o.rival, o.kind]]);
    const nein = answerOffer(naechste, angebote, o.id, false);
    expect(nein.ok && d(nein.state).relations[o.rival].grudge).toBe(angebote.diplomacy.pacts.declineGrudge);
  });

  it('nicht angenommene Angebote verfallen', () => {
    const s = advanceOffers(k2(angebote), angebote, new Rng(3));
    const o = d(s).offers[0];
    const spaeter = advanceOffers({ ...s, round: o.expires }, angebote, new Rng(4));
    expect(d(spaeter).offers.some((x) => x.id === o.id)).toBe(false);
    expect(spaeter.log.some((l) => l.includes('verfallen'))).toBe(true);
  });

  it('ein Angebot passt zur eigenen Zusage-Schwelle: wer Jacob nicht zusagen würde, bietet auch nichts an', () => {
    const p = angebote.diplomacy.pacts;
    const g = k2(angebote);
    // Zu Beginn (Vertrauen 0): Margaret (Vertragstreue 2) und Thorne (1) liegen weit unter der Schwelle.
    expect(wouldOffer(d(g), angebote, 'margaret')).toBe(false);
    expect(wouldOffer(d(g), angebote, 'thorne')).toBe(false);
    for (const r of ['margaret', 'pruett', 'bullard', 'thorne', 'delgado'] as DiploRival[]) {
      expect(wouldOffer(d(g), angebote, r)).toBe(acceptScore(d(g), angebote, r) >= p.acceptThreshold - p.offerMargin && d(g).relations[r].grudge < p.offerMaxGrudge);
    }
    // In vielen Runden bietet nie jemand an, der unter der Schwelle liegt.
    let s: DiploGame = g;
    const rng = new Rng(11);
    for (let i = 0; i < 30; i++) {
      const vorher = d(s).offers.map((o) => o.id);
      s = advanceOffers({ ...s, round: s.round + 1 }, angebote, rng);
      for (const o of d(s).offers.filter((x) => !vorher.includes(x.id))) {
        expect(acceptScore(d(s), angebote, o.rival)).toBeGreaterThanOrEqual(p.acceptThreshold - p.offerMargin);
      }
    }
    // Mit genug Vertrauen schreibt auch Margaret.
    expect(wouldOffer(d(rel(g, 'margaret', 20)), angebote, 'margaret')).toBe(true);
  });

  it('wer grollt oder verraten wurde, bietet nichts an', () => {
    let g = k2(angebote);
    const voll = { trust: 0, grudge: 50 };
    g = diplo(g, { relations: { margaret: voll, pruett: voll, bullard: voll, thorne: voll, delgado: voll } });
    expect(d(advanceOffers(g, angebote, new Rng(3))).offers).toEqual([]);
  });
});

describe('Übernahmen', () => {
  const t = ruhig.diplomacy.takeovers;

  it('Kaufpreis: max(1, Quellen) · pricePerWell · (1 + premium)', () => {
    expect(firmPrice(ruhig, 3)).toBe(Math.round(3 * t.pricePerWell * (1 + t.premium)));
    expect(firmPrice(ruhig, 0)).toBe(Math.round(t.pricePerWell * (1 + t.premium)));
  });

  it('Jacob kauft eine kleine Firma; ihr Gewinn geht an ihn', () => {
    const g = k2();
    const firm = g.wildcatters.firms[0];
    const r = buyFirm(g, ruhig, firm.name);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(g.cash - firmPrice(ruhig, firm.wells));
    expect(d(r.state).firms).toEqual([{ name: firm.name, owner: 'jacob', round: g.round }]);
    expect(buyFirm(r.state, ruhig, firm.name)).toEqual({ ok: false, reason: 'vergeben' });
    expect(buyFirm(r.state, ruhig, 'Niemand & Söhne')).toEqual({ ok: false, reason: 'unbekannt' });
    expect(buyFirm({ ...g, cash: 0 }, ruhig, firm.name)).toEqual({ ok: false, reason: 'geld' });
    const gewinn = firm.wells * t.barrelsPerWell * Math.max(0, g.postedPrice - t.costPerBarrel);
    expect(firmsIncome(r.state as DiploGame, ruhig)).toBeCloseTo(gewinn, 2);
    const s = advanceTakeovers(r.state as DiploGame, ruhig, new Rng(1));
    expect(s.cash).toBeCloseTo(r.state.cash + gewinn, 2);
  });

  it('in der Krise kauft Pruett eine freie Firma, sonst nicht', () => {
    const kauf = ruhigMit((x) => {
      x.takeovers.pruettBuyChance = 1;
    });
    const krise = advanceTakeovers(mitWelt(k2(kauf), { credit: 20 }), kauf, new Rng(1));
    expect(d(krise).firms).toHaveLength(1);
    expect(d(krise).firms[0].owner).toBe('pruett');
    const normal = advanceTakeovers(mitWelt(k2(kauf), { credit: 50 }), kauf, new Rng(1));
    expect(d(normal).firms).toEqual([]);
  });

  it('vor der Pleite bietet Pruett an, Jacobs Firma zu kaufen – annehmen beendet das Spiel', () => {
    const kauf = ruhigMit((x) => {
      x.takeovers.pruettBuyChance = 1;
    });
    const g = { ...k2(kauf), cash: -100 };
    const s = advanceTakeovers(g, kauf, new Rng(1));
    const o = d(s).offers.find((x) => x.kind === 'buyout')!;
    expect(o.price).toBeGreaterThanOrEqual(kauf.diplomacy.takeovers.distressMin);
    expect(d(advanceTakeovers(s, kauf, new Rng(2))).offers.filter((x) => x.kind === 'buyout')).toHaveLength(1);
    const r = answerOffer({ ...s, round: s.round + 1 }, kauf, o.id, true);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state).toMatchObject({ finished: true, ending: 'verkauft', cash: o.price, loans: [] });
    expect(endRound(r.state, kauf)).toBe(r.state);
  });
});

describe('Delgados Produzentenverband', () => {
  const g0 = ruhig.diplomacy.guild;

  it('Delgado gründet ihn foundDelay Runden nach Kapitelbeginn', () => {
    const g = k2();
    expect(d(advanceGuild(g, ruhig, new Rng(1))).guild.founded).toBe(0);
    expect(joinGuild(g, ruhig)).toEqual({ ok: false, reason: 'nicht_gegruendet' });
    const s = advanceGuild({ ...g, round: g.round + g0.foundDelay }, ruhig, new Rng(1));
    expect(d(s).guild).toMatchObject({ founded: g.round + g0.foundDelay, members: g0.startMembers });
    expect(s.events.marks[DIPLO_MARKS.guildFounded]).toBe(s.round);
  });

  function gegruendet(b: Balance = ruhig): DiploGame {
    const g = k2(b);
    return advanceGuild({ ...g, round: g.round + b.diplomacy.guild.foundDelay }, b, new Rng(1));
  }

  it('beitreten: Beitrag je Runde, Aufschlag × Stärke', () => {
    const r = joinGuild(gegruendet(), ruhig);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state as DiploGame;
    expect(d(s).guild.member).toBe(true);
    expect(d(s).guild.members).toBe(g0.startMembers + 1);
    expect(joinGuild(s, ruhig)).toEqual({ ok: false, reason: 'mitglied' });
    const staerke = Math.min(1, (g0.startMembers + 1) / g0.fullMembers);
    expect(diplomacyEffects(s, ruhig, s.round).price).toBe(Math.round(g0.premium * staerke * 100) / 100);
    const nachher = advanceGuild(s, ruhig, new Rng(1));
    expect(nachher.cash).toBe(s.cash - g0.dues);
  });

  it('der Verband wächst, mit Jacob schneller', () => {
    const wachsen = ruhigMit((x) => {
      x.guild.growChance = 1;
    });
    const g = gegruendet(wachsen);
    expect(d(advanceGuild(g, wachsen, new Rng(1))).guild.members).toBe(wachsen.diplomacy.guild.startMembers + 1);
    const r = joinGuild(g, wachsen);
    if (!r.ok) throw new Error(r.reason);
    expect(d(advanceGuild(r.state as DiploGame, wachsen, new Rng(1))).guild.members).toBe(wachsen.diplomacy.guild.startMembers + 3);
  });

  it('wer zu groß wird, den stellt Delgado zur Rede; draußen pachtet er teurer', () => {
    const gross = ruhigMit((x) => {
      x.guild.tooBigValue = 0;
    });
    const r = joinGuild(gegruendet(gross), gross);
    if (!r.ok) throw new Error(r.reason);
    const s = advanceGuild(r.state as DiploGame, gross, new Rng(1));
    expect(s.events.marks[DIPLO_MARKS.guildTooBig]).toBe(s.round);
    expect(d(s).guild.warned).toBe(s.round);
    const raus = leaveGuild(s, gross);
    if (!raus.ok) throw new Error(raus.reason);
    expect(d(raus.state).relations.delgado.trust).toBe(10 - gross.diplomacy.guild.leaveTrust);
    expect(diplomacyEffects(raus.state as DiploGame, gross, s.round).leaseCost).toBe(gross.diplomacy.guild.outsiderLeaseCost);
    expect(leaveGuild(raus.state, gross)).toEqual({ ok: false, reason: 'kein_mitglied' });
  });
});

describe('Antworten aus den Ereignissen (Merkzeichen)', () => {
  const drift = ruhig.diplomacy.relations.trustDrift;

  it('Abschied bei Cornelius: beide Erben trauen Jacob mehr', () => {
    const s = advanceDiplomacy(mitMarken(k2(), { [DIPLO_MARKS.farewell]: 1 }), ruhig);
    expect(d(s).relations.margaret.trust).toBe(ruhig.diplomacy.succession.farewellTrust - drift);
    expect(d(s).relations.pruett.trust).toBe(ruhig.diplomacy.succession.farewellTrust - drift);
  });

  it('Zusage beim Besuch verschiebt den Aufsichtsrat – genau einmal', () => {
    const eins = advanceDiplomacy(mitMarken(k2(), { [DIPLO_MARKS.backMargaret]: 1 }), ruhig);
    expect(d(eins).succession.share).toBe(0.5 + ruhig.diplomacy.succession.visitShift);
    expect(d(eins).succession.backed.margaret).toBe(1);
    const zwei = advanceDiplomacy(eins, ruhig);
    expect(d(zwei).succession.share).toBe(0.5 + ruhig.diplomacy.succession.visitShift);
  });

  it('Glückwunsch an die neue Führung', () => {
    const g = k2();
    const m = diplo(g, { succession: { ...d(g).succession, outcome: 'margaret' } });
    const s = advanceDiplomacy(mitMarken(m, { [DIPLO_MARKS.congrats]: 1 }), ruhig);
    expect(d(s).relations.margaret.trust).toBe(ruhig.diplomacy.succession.congratsTrust - drift);
  });

  it('Verband: beitreten, im Guten austreten, im Streit ausgeschlossen werden', () => {
    const g = k2();
    const gegruendet = advanceGuild({ ...g, round: g.round + ruhig.diplomacy.guild.foundDelay }, ruhig, new Rng(1));
    const drin = advanceDiplomacy(mitMarken(gegruendet, { [DIPLO_MARKS.guildJoin]: gegruendet.round }), ruhig);
    expect(d(drin).guild.member).toBe(true);
    const imGuten = advanceDiplomacy(mitMarken(drin, { [DIPLO_MARKS.guildLeave]: drin.round }), ruhig);
    expect(d(imGuten).guild).toMatchObject({ member: false, expelled: false });
    expect(d(imGuten).relations.delgado.trust).toBe(d(drin).relations.delgado.trust - drift);
    const streit = advanceDiplomacy(mitMarken(drin, { [DIPLO_MARKS.guildFight]: drin.round }), ruhig);
    expect(d(streit).guild).toMatchObject({ member: false, expelled: true });
    expect(d(streit).relations.delgado.grudge).toBeGreaterThan(20);
    expect(joinGuild(streit, ruhig)).toEqual({ ok: false, reason: 'ausgeschlossen' });
  });

  it('Bruch öffentlich machen: Respekt steigt, der Täter grollt', () => {
    const g = diplo(k2(), { memory: [{ rival: 'pruett', kind: 'beleidigung', round: 1 }] });
    const s = advanceDiplomacy(mitMarken(g, { [DIPLO_MARKS.exposed]: 1 }), ruhig);
    expect(d(s).respect).toBe(ruhig.diplomacy.relations.respectStart + ruhig.diplomacy.relations.betrayalRespect / 3);
    expect(d(s).relations.pruett.grudge).toBe(10 - (ruhig.diplomacy.relations.grudgeDecay * 3) / 5);
  });

  it('Entschuldigung nach einem Verrat bringt den halben Respekt zurück', () => {
    const s = advanceDiplomacy(mitMarken(diplo(k2(), { respect: 35 }), { [DIPLO_MARKS.apology]: 1 }), ruhig);
    expect(d(s).respect).toBe(35 + ruhig.diplomacy.relations.betrayalRespect / 2);
  });

  it('jede gelesene Antwort-Marke steht in content/events/k2-diplomatie.yaml, jede Sim-Marke wird dort abgefragt', () => {
    // Angebote gibt es nur für die Arten, die balance.yaml einem Rivalen erlaubt – die prüft der Test unten.
    const angebot = (m: string) => m.startsWith('k2_angebot_');
    const gesetzt = new Set(catalog.flatMap((e) => e.choices.flatMap((c) => c.marks)));
    for (const m of DIPLOMACY_READ_MARKS.filter((x) => !angebot(x))) expect(gesetzt.has(m), m).toBe(true);
    const abgefragt = new Set(catalog.flatMap((e) => e.marked));
    // k2_hintergangen (erster Bruch) bleibt für spätere Kapitel; der Brief hängt am Anlass k2_bruch.
    for (const m of DIPLOMACY_SIM_MARKS.filter((x) => !angebot(x) && x !== DIPLO_MARKS.betrayed)) expect(abgefragt.has(m), m).toBe(true);
  });
});

describe('Rache und Vergessen', () => {
  it('ab revengeGrudge schlägt ein Rivale zurück (Bullard: Pachten teurer)', () => {
    const rache = ruhigMit((x) => {
      x.relations.revengeChance = 1;
    });
    const r = rache.diplomacy.relations;
    const s = advanceDiplomacy(rel(k2(rache), 'bullard', 0, 80), rache);
    expect(d(s).aftermath.some((a) => a.key === 'leaseCost' && a.value === r.revengeLeaseCost)).toBe(true);
    expect(timedEffect({ ...s, round: s.round + 1 }, 'leaseCost')).toBe(r.revengeLeaseCost);
    expect(d(s).relations.bullard.grudge).toBeLessThan(80 - r.revengeRelief + 0.01);
  });

  it('Thorne erhöht den Bahntarif dauerhaft', () => {
    const rache = ruhigMit((x) => {
      x.relations.revengeChance = 1;
    });
    let s: GameState = rel(k2(rache), 'thorne', 0, 100);
    const tarif = s.railTariff;
    for (let i = 0; i < 10 && s.railTariff === tarif; i++) s = advanceDiplomacy(s, rache);
    expect(s.railTariff).toBeCloseTo(tarif + rache.diplomacy.relations.revengeRail, 2);
  });

  it('unter der Schwelle passiert nichts', () => {
    const s = advanceDiplomacy(rel(k2(), 'bullard', 0, 50), ruhig);
    expect(d(s).aftermath).toEqual([]);
  });

  it('Vertrauen wandert Richtung 0, Groll verblasst nach Nachtragen; Verrat bleibt', () => {
    const r = ruhig.diplomacy.relations;
    let g = rel(rel(k2(), 'margaret', 10, 20), 'bullard', -10, 20);
    const dd = driftRelations(d(g), ruhig);
    expect(dd.relations.margaret).toEqual({ trust: 10 - r.trustDrift, grudge: Math.round((20 - (r.grudgeDecay * 3) / 5) * 100) / 100 });
    expect(dd.relations.bullard).toEqual({ trust: -10 + r.trustDrift, grudge: Math.round((20 - r.grudgeDecay / 5) * 100) / 100 });
    g = diplo(rel(g, 'pruett', 30, 0), { memory: [{ rival: 'pruett', kind: 'verrat', round: 1 }] });
    const v = driftRelations(d(g), ruhig);
    expect(v.relations.pruett.trust).toBe(0);
    expect(v.relations.pruett.grudge).toBe(r.betrayalGrudge / 2);
  });
});

describe('Rundenschritt und Spielstand', () => {
  it('eine ganze Partie mit Diplomatie ab Runde 1: Nachfolge entschieden, Verband gegründet, alles endlich', () => {
    let s = startDiplomacy(newGame('k2-lauf', balance, catalog), balance, 2);
    while (!s.finished) s = endRound(s, balance, catalog);
    const x = d(s);
    expect(x.succession.outcome).not.toBeNull();
    expect(x.guild.founded).toBeGreaterThan(0);
    expect(Number.isFinite(s.cash)).toBe(true);
    for (const r of Object.values(x.relations)) {
      expect(r.trust).toBeGreaterThanOrEqual(-100);
      expect(r.trust).toBeLessThanOrEqual(100);
      expect(r.grudge).toBeGreaterThanOrEqual(0);
      expect(r.grudge).toBeLessThanOrEqual(100);
    }
    expect(s.events.seen).toContain('k2_crane_rueckzug');
  });

  it('Spielstand mit Diplomatie: sichern und laden', () => {
    let s = startDiplomacy(newGame('save-diplo', balance, catalog), balance, 2);
    for (let i = 0; i < 4; i++) s = endRound(s, balance, catalog);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok && geladen.state).toEqual(s);
    expect(validDiplomacy(d(s))).toBe(true);
  });

  it('kaputte Diplomatie wird abgelehnt, fehlende ist in Ordnung', () => {
    const s = k2();
    const kaputt = { ...s, diplomacy: { ...d(s), relations: { margaret: { trust: 0, grudge: 0 } } } };
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
    expect(deserializeGame(serializeGame(newGame('k1', balance), 'test')).ok).toBe(true);
  });

  it('die Ansicht für die Oberfläche', () => {
    const v = diplomacyView(k2(), ruhig)!;
    expect(v.succession.seats).toBe(6);
    expect(v.succession.backReason).toBeNull();
    expect(v.relations.map((r) => r.rival)).toEqual(['margaret', 'pruett', 'bullard', 'thorne', 'delgado']);
    expect(v.proposals.every((p) => ruhig.diplomacy.rivals[p.rival].kinds.includes(p.kind))).toBe(true);
    expect(v.guild.founded).toBe(false);
    expect(diplomacyView(newGame('k1', ruhig), ruhig)).toBeNull();
  });
});

describe('Spielzahlen (balance.yaml, diplomacy)', () => {
  it('liest den Block mit Persönlichkeiten aus GDD §9.2', () => {
    expect(balance.diplomacy.unlockChapter).toBe(2);
    expect(balance.diplomacy.rivals.margaret.personality).toEqual({ risk: 4, aggression: 3, loyalty: 2, grudge: 3, patience: 4 });
    expect(balance.diplomacy.rivals.pruett.personality).toEqual({ risk: 1, aggression: 2, loyalty: 4, grudge: 3, patience: 5 });
    expect(balance.diplomacy.rivals.bullard.personality).toBeUndefined();
  });

  it('meldet Fehler verständlich', () => {
    const ohne = rawBalance() as Record<string, unknown>;
    delete ohne.diplomacy;
    expect(() => parseBalance(ohne)).toThrow(BalanceError);
    expect(() =>
      mitDiplo((x) => {
        x.rivals.margaret = { ...(x.rivals.margaret as object), kinds: ['heirat'] };
      }),
    ).toThrow(/kinds/);
    expect(() =>
      mitDiplo((x) => {
        x.succession.startShare = 1;
      }),
    ).toThrow(/startShare/);
  });
});

describe('Texte (content/diplomacy.yaml)', () => {
  const text = readFileSync(new URL('../../content/diplomacy.yaml', import.meta.url), 'utf8');

  it('sind vollständig', () => {
    const { content, errors } = parseDiplomacyContent('content/diplomacy.yaml', text);
    expect(errors).toEqual([]);
    expect(content).not.toBeNull();
    expect(diploText(content!.texts.offer_line, { name: 'Pruett', art: 'Preisabsprache' })).toBe('Pruett schlägt vor: Preisabsprache');
  });

  it('melden fehlende Texte', () => {
    const { content, errors } = parseDiplomacyContent('x.yaml', text.replace(/^ {2}accept:.*$/m, ''));
    expect(content).toBeNull();
    expect(errors.some((e) => e.message.includes('texts.accept'))).toBe(true);
  });

  it('Respekt als Wort', () => {
    expect(respectWord(80)).toBe('hoch');
    expect(respectWord(50)).toBe('mittel');
    expect(respectWord(10)).toBe('niedrig');
  });
});

describe('Briefe und Besuche zu Angeboten, Rache, Brüchen und Krisenkäufen (Anlässe)', () => {
  const angebote = ruhigMit((x) => {
    x.pacts.offerChance = 1;
  });

  /** Ereignis aus dem Katalog, das auf diesen Anlass wartet. */
  const ereignisZu = (mark: string) => catalog.filter((e) => e.marked.includes(mark));

  it('jedes Angebot, das balance.yaml erlaubt, hat einen Brief mit Annehmen und Ablehnen', () => {
    const paare: [DiploRival, string][] = [
      ...(Object.entries(balance.diplomacy.rivals) as [DiploRival, { kinds: string[] }][]).flatMap(([r, x]) => x.kinds.map((k) => [r, k] as [DiploRival, string])),
      ['pruett', 'buyout'],
    ];
    for (const [rival, kind] of paare) {
      const m = offerMark(rival, kind as 'price');
      const ev = ereignisZu(m);
      expect(ev, m).toHaveLength(1);
      expect(ev[0].once, m).toBe(false);
      const marks = ev[0].choices.flatMap((c) => c.marks);
      expect(marks, m).toContain(offerAnswerMark(rival, kind as 'price', true));
      expect(marks, m).toContain(offerAnswerMark(rival, kind as 'price', false));
      // Ohne Antwort verfällt das Angebot nur – die Standard-Wahl setzt nichts.
      expect(ev[0].choices.find((c) => c.default)?.marks ?? [], m).toEqual([]);
      // Kreuzbeteiligung: der Knopf verlangt genau den Preis aus balance.yaml.
      if (kind === 'cross') {
        const ja = ev[0].choices.find((c) => c.marks.includes(offerAnswerMark(rival, 'cross', true)))!;
        expect(ja.requires.minCash, m).toBe(balance.diplomacy.pacts.crossCost);
      }
    }
    // Pruetts Kaufangebot kommt persönlich – mit Mappe an der Tür.
    expect(ereignisZu(offerMark('pruett', 'buyout'))[0].visitor).toBe('pruett');
  });

  it('jeder Anlass (Rache je Rivale, Bruch, Krisenkauf) hat ein wiederholbares Ereignis', () => {
    for (const m of DIPLOMACY_PULSE_MARKS.filter((x) => !x.startsWith('k2_angebot_'))) {
      const ev = ereignisZu(m);
      expect(ev, m).toHaveLength(1);
      expect(ev[0].once, m).toBe(false);
    }
    for (const r of ['margaret', 'pruett', 'bullard', 'thorne', 'delgado'] as DiploRival[]) {
      expect(ereignisZu(revengeMark(r))[0].choices.some((c) => c.marks.includes(reconcileMark(r))), r).toBe(true);
    }
  });

  it('ein neues Angebot setzt seinen Anlass; in der Runde danach liegt der Brief im Posteingang, dann ist der Anlass weg', () => {
    const g = k2(angebote);
    const s = advanceOffers(g, angebote, new Rng(3));
    const o = d(s).offers[0];
    expect(s.events.marks[offerMark(o.rival, o.kind)]).toBe(g.round);
    let r: GameState = endRound(g, angebote, catalog);
    const neu = d(r).offers.find((x) => x.round === g.round)!;
    expect(r.events.pending).toContain(`k2_angebot_${neu.rival}_${neu.kind}`);
    expect(r.events.marks[offerMark(neu.rival, neu.kind)]).toBe(g.round);
    r = endRound(r, angebote, catalog);
    expect(r.events.marks[offerMark(neu.rival, neu.kind)]).toBeUndefined();
  });

  it('Annehmen im Brief schließt die Absprache, Ablehnen kränkt – und beides geht wieder', () => {
    const p = ruhig.diplomacy.pacts;
    const offer = { id: 'o9', rival: 'bullard' as const, kind: 'price' as const, round: 1, expires: 9 };
    const g = { ...diplo(k2(), { offers: [offer] }), round: 2 };
    const ja = advanceDiplomacy(mitMarken(g, { [offerAnswerMark('bullard', 'price', true)]: 2 }), ruhig);
    expect(d(ja).offers).toEqual([]);
    expect(d(ja).pacts.map((x) => [x.rival, x.kind])).toEqual([['bullard', 'price']]);
    expect(ja.events.marks[offerAnswerMark('bullard', 'price', true)]).toBeUndefined();
    const nein = advanceDiplomacy(mitMarken(g, { [offerAnswerMark('bullard', 'price', false)]: 2 }), ruhig);
    expect(d(nein).offers).toEqual([]);
    expect(d(nein).pacts).toEqual([]);
    expect(d(nein).relations.bullard.grudge).toBe(Math.round((p.declineGrudge - ruhig.diplomacy.relations.grudgeDecay / 5) * 100) / 100);
    // Ein zweites Angebot derselben Art lässt sich wieder per Brief beantworten.
    const zweites = { ...diplo(nein as DiploGame, { offers: [{ ...offer, id: 'o10' }] }), round: 3 };
    const nochmal = advanceDiplomacy(mitMarken(zweites, { [offerAnswerMark('bullard', 'price', true)]: 3 }), ruhig);
    expect(d(nochmal).pacts).toHaveLength(1);
  });

  it('am Schreibtisch schon beantwortet: der Brief bleibt ohne Wirkung', () => {
    const s = advanceDiplomacy(mitMarken(k2(), { [offerAnswerMark('pruett', 'price', true)]: 1 }), ruhig);
    expect(d(s).pacts).toEqual([]);
    expect(s.log.some((l) => l.includes('liegt nicht mehr auf dem Tisch'))).toBe(true);
  });

  it('Pruett an der Tür: Verkaufen beendet die Partie sofort', () => {
    const offer = { id: 'o1', rival: 'pruett' as const, kind: 'buyout' as const, round: 1, expires: 3, price: 7000 };
    const g = { ...diplo(k2(), { offers: [offer] }), round: 2 };
    const r = endRound(mitMarken(g, { [offerAnswerMark('pruett', 'buyout', true)]: 2 }), ruhig, catalog);
    expect(r).toMatchObject({ finished: true, ending: 'verkauft', cash: 7000, round: 2 });
    expect(r.log.at(-1)).toContain('an Harold Pruett');
  });

  it('das Kaufangebot setzt den Anlass für Pruetts Besuch; der Besuch kommt in der nächsten Runde', () => {
    const kauf = ruhigMit((x) => {
      x.takeovers.pruettBuyChance = 1;
    });
    const g = { ...k2(kauf), cash: -100 };
    const s = advanceTakeovers(g, kauf, new Rng(1));
    expect(s.events.marks[offerMark('pruett', 'buyout')]).toBe(g.round);
    const r = drawEvents({ ...s, round: s.round + 1 }, kauf, catalog);
    expect(r.events.pending).toContain('k2_angebot_pruett_buyout');
  });

  it('Krisenkauf: Anlass und Brief; Hilfe für die Bohrleute freut Delgado und ärgert Pruett', () => {
    const kauf = ruhigMit((x) => {
      x.takeovers.pruettBuyChance = 1;
    });
    const s = advanceTakeovers(mitWelt(k2(kauf), { credit: 20 }), kauf, new Rng(1));
    expect(s.events.marks[DIPLO_MARKS.crisisBuy]).toBe(s.round);
    const t = ruhig.diplomacy.takeovers;
    const h = advanceDiplomacy(mitMarken(k2(), { [DIPLO_MARKS.crisisHelp]: 1 }), ruhig);
    expect(d(h).relations.delgado.trust).toBe(t.crisisHelpTrust - ruhig.diplomacy.relations.trustDrift);
    expect(d(h).relations.pruett.grudge).toBe(Math.round((t.crisisHelpGrudge - (ruhig.diplomacy.relations.grudgeDecay * 3) / 5) * 100) / 100);
    expect(h.events.marks[DIPLO_MARKS.crisisHelp]).toBeUndefined();
  });

  it('jede Rache setzt ihren Anlass; die Versöhnung senkt den Groll', () => {
    const rache = ruhigMit((x) => {
      x.relations.revengeChance = 1;
    });
    const g = rel(k2(rache), 'bullard', 0, 80);
    const s = advanceDiplomacy(g, rache);
    expect(s.events.marks[revengeMark('bullard')]).toBe(g.round);
    const r = endRound(g, rache, catalog);
    expect(r.events.pending).toContain('k2_rache_bullard');
    const vorher = d(r).relations.bullard.grudge;
    const v = advanceDiplomacy(mitMarken(r, { [reconcileMark('bullard')]: r.round }), rache);
    const decay = (rache.diplomacy.relations.grudgeDecay * 1) / 5;
    expect(d(v).relations.bullard.grudge).toBe(Math.round(Math.max(0, vorher - rache.diplomacy.relations.reconcileGrudge - decay) * 100) / 100);
  });

  it('jeder Bruch durch einen Rivalen kommt als Brief, nicht nur der erste', () => {
    const brecher = ruhigMit((x) => {
      x.pacts.breakChance = 1;
    });
    const pakt = (g: DiploGame, id: string) => diplo(g, { pacts: [{ id, rival: 'bullard', kind: 'price', startRound: g.round, endRound: g.round + 5, traced: false }] });
    let r: GameState = endRound(pakt(k2(brecher), 'a1'), brecher, catalog);
    expect(r.events.marks[DIPLO_MARKS.betrayed]).toBeDefined();
    expect(r.events.pending).toContain('k2_hintergangen_brief');
    // Brief beantworten (schweigen), ein paar Runden warten, zweiter Bruch.
    for (let i = 0; i < 3; i++) r = endRound(r, brecher, catalog);
    expect(r.events.pending).not.toContain('k2_hintergangen_brief');
    r = endRound(pakt(r as DiploGame, 'a2'), brecher, catalog);
    expect(r.events.pending).toContain('k2_hintergangen_brief');
  });

  it('Anlässe aus der Vorrunde werden gelöscht, frische bleiben', () => {
    const g = k2();
    const alt = mitMarken(g, { [revengeMark('thorne')]: g.round - 1, [DIPLO_MARKS.crisisBuy]: g.round });
    const s = advanceDiplomacy({ ...alt, round: g.round }, ruhig);
    expect(s.events.marks[revengeMark('thorne')]).toBeUndefined();
    expect(s.events.marks[DIPLO_MARKS.crisisBuy]).toBe(g.round);
  });
});
