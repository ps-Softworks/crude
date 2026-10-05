// Personal (4.9, GDD §11 und §3): Sekretärin und Fixer ab Kapitel 2, Richtlinien,
// Loyalität, Löhne, Hitze. Jede Regel ein Test.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBalance, type Balance } from './balance';
import { parseEventFiles } from './eventContent';
import { choiceCost, type EventChoice, type EventDef, type MailKind } from './events';
import { endRound, newGame, type GameState } from './game';
import { sabotageChance } from './logistics';
import { sabotageChanceOf, type TrunkProject } from './bigPipeline';
import { deserializeGame, serializeGame } from './save';
import {
  competenceShown,
  dismissStaff,
  extraAppointments,
  fixerDefense,
  heatWord,
  hireStaff,
  isStaffState,
  loyaltyWord,
  memberOf,
  newStaff,
  openStaff,
  orderFixer,
  orderSuccess,
  payroll,
  recognizeStaff,
  setMailRule,
  setMailSpendLimit,
  setSalesPolicy,
  setWageLevel,
  staffUnlocked,
  staffWorld,
  STAFF_EVENT_MARKS,
  STAFF_MARKS,
  STAFF_ROLES,
  wageIndex,
  wageOf,
  type StaffMember,
  type StaffState,
} from './staff';
import { checkStaffContent, parseStaffContent, staffView } from './staffContent';
import { autoSell, choiceWorth, delegateMail, delegatedMail, runOrders, settleStaff } from './staffRound';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const STAFF_YAML = readFileSync(new URL('../../content/staff.yaml', import.meta.url), 'utf8');

function t(de: string) {
  return { de, en: '' };
}

function person(role: StaffMember['role'], extra: Partial<StaffMember> = {}): StaffMember {
  return { role, name: 0, competence: 3, claim: extra.competence ?? 3, ambition: 3, traits: [], loyalty: 60, hiredRound: 1, good: 0, bad: 0, ...extra };
}

/** Neue Partie mit freigeschaltetem Personal und genau diesen Angestellten. */
function mitPersonal(members: StaffMember[], patch: Partial<StaffState> = {}, seed = 'personal'): GameState {
  // Kreditklima normal (50), damit die Löhne nicht vom gewürfelten Start des Weltmodells abhängen.
  const g = newGame(seed, balance);
  const s = openStaff({ ...g, worldModel: { ...g.worldModel, credit: 50 } }, balance);
  // Bewerber für besetzte Stellen gingen beim Einstellen wieder (hireStaff).
  const candidates = s.staff!.candidates.filter((c) => !members.some((m) => m.role === c.role));
  return { ...s, staff: { ...s.staff!, hired: members, candidates, ...patch } };
}

function mitStaffBalance(patch: (s: Balance['staff']) => Balance['staff']): Balance {
  return { ...balance, staff: patch(balance.staff) };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

function brief(id: string, mail: MailKind, choices: EventChoice[]): EventDef {
  return {
    id,
    title: t(`Brief ${id}`),
    text: t('Text'),
    conditions: {},
    marked: [],
    notMarked: [],
    delay: 1,
    chance: 0,
    once: true,
    routine: false,
    // Antworten ohne Termin – nur die darf das Vorzimmer geben (Termin-Test: eigene Angabe je Wahl).
    appointments: 0,
    choices,
    mail,
  };
}

/** Legt einen Brief in den Posteingang, dessen Frist in dieser Runde abläuft (oder später). */
function imPosteingang(state: GameState, id: string, dueIn = 0): GameState {
  return { ...state, events: { ...state.events, pending: [...state.events.pending, id], due: { ...state.events.due, [id]: state.round + dueIn } } };
}

describe('Spielzahlen (balance.yaml: staff)', () => {
  it('lädt den Block staff', () => {
    expect(balance.staff.unlockChapter).toBe(2);
    expect(balance.staff.wage.levels.map((l) => l.id)).toContain(balance.staff.wage.startLevel);
  });

  it('meldet einen fehlenden Block und falsche Reihenfolgen verständlich', () => {
    const raw = rawBalance();
    expect(() => parseBalance({ ...raw, staff: undefined })).toThrow(/Block "staff" fehlt/);
    const staff = structuredClone(raw.staff) as { loyalty: { words: { treu: number } } };
    staff.loyalty.words.treu = 0;
    expect(() => parseBalance({ ...raw, staff })).toThrow(/Loyalitätswörter/);
  });
});

describe('Kapitel 1: kein Personal (GDD §11: ab Kapitel 2)', () => {
  it('eine ganze Partie ohne Personal – nichts davon im Zustand oder Protokoll', () => {
    let state = newGame('k1-ohne-personal', balance);
    while (!state.finished) {
      state = endRound(state, balance);
      expect(state.staff).toBeUndefined();
    }
    expect(state.log.some((z) => z.includes('Bewerbung'))).toBe(false);
  });

  it('Weltschnittstelle liest das Kreditklima aus dem Weltmodell (state.worldModel.credit wie auf main ab 0.4.1)', () => {
    const boom = { ...newGame('welt-boom', balance), worldModel: { credit: 80 } } as unknown as GameState;
    expect(staffWorld(boom).credit).toBe(80);
    expect(wageIndex(boom, balance)).toBeGreaterThan(1);
    const krise = { ...newGame('welt-krise', balance), worldModel: { credit: 20 } } as unknown as GameState;
    expect(wageIndex(krise, balance)).toBeLessThan(1);
    // Neue Partie: das echte Weltmodell (worldModel.credit) zählt.
    const neu = newGame('welt-start', balance);
    expect(staffWorld(neu).credit).toBe(neu.worldModel.credit);
  });

  it('Ersatzwerte der Weltschnittstelle: Kapitel 1, Kreditklima 50', () => {
    const state = newGame('welt', balance);
    expect(staffWorld({})).toEqual({ chapter: 1, credit: 50 });
    expect(staffWorld(state).chapter).toBe(1);
    expect(staffUnlocked(state, balance)).toBe(false);
    expect(settleStaff(state, balance)).toBe(state);
  });

  it('ab Kapitel 2 schaltet das Rundenende das Personal frei', () => {
    const state = { ...newGame('k2', balance), chapter: 2 } as GameState;
    expect(staffUnlocked(state, balance)).toBe(true);
    const out = settleStaff(state, balance);
    expect(out.staff).toBeDefined();
    expect(out.staff!.candidates.length).toBe(STAFF_ROLES.length * balance.staff.candidatesPerRole);
  });

  it('openStaff ändert nichts, wenn schon Personal da ist', () => {
    const s = openStaff(newGame('x', balance), balance);
    expect(openStaff(s, balance)).toBe(s);
  });
});

describe('Bewerber', () => {
  it('sind je Seed gleich und je Stelle staff.candidatesPerRole, mit verschiedenen Namen', () => {
    const a = newStaff('seed-a', 1, balance);
    expect(newStaff('seed-a', 1, balance)).toEqual(a);
    for (const role of STAFF_ROLES) {
      const c = a.candidates.filter((p) => p.role === role);
      expect(c.length).toBe(balance.staff.candidatesPerRole);
      expect(new Set(c.map((p) => p.name)).size).toBe(c.length);
    }
  });

  it('Merkmale prägen die Zahlen und widersprechen sich nicht (über 200 Seeds)', () => {
    for (let i = 0; i < 200; i++) {
      for (const p of newStaff(`m-${i}`, 1, balance).candidates) {
        expect(p.traits.length).toBeGreaterThanOrEqual(1);
        expect(p.traits.length).toBeLessThanOrEqual(2);
        expect(p.competence).toBeGreaterThanOrEqual(1);
        expect(p.competence).toBeLessThanOrEqual(5);
        if (p.traits.includes('genie')) expect(p.competence).toBeGreaterThanOrEqual(4);
        expect(Math.abs(p.claim - p.competence)).toBeLessThanOrEqual(1);
        const k = competenceShown(p, { round: 1 }, balance);
        expect(p.competence).toBeGreaterThanOrEqual(k.min);
        expect(p.competence).toBeLessThanOrEqual(k.max);
        if (p.traits.includes('ehrgeizig')) expect(p.ambition).toBeGreaterThanOrEqual(4);
        if (p.traits.includes('treu')) expect(p.ambition).toBeLessThanOrEqual(2);
        expect(p.traits.includes('treu') && p.traits.includes('ehrgeizig')).toBe(false);
        expect(p.traits.includes('gewissenhaft') && p.traits.includes('gierig')).toBe(false);
      }
    }
  });

  it('alle staff.candidateRefreshRounds Runden kommen neue – für freie Stellen', () => {
    let state = mitPersonal([person('secretary')]);
    const vorher = state.staff!.candidates;
    expect(vorher.every((c) => c.role === 'fixer')).toBe(true);
    for (let i = 0; i < balance.staff.candidateRefreshRounds; i++) state = endRound(state, balance);
    expect(state.staff!.candidates.every((c) => c.role === 'fixer')).toBe(true);
    expect(state.staff!.candidatesRound).toBeGreaterThan(1);
  });

  it('Kompetenz ist ungefähr (±1), nach staff.revealRounds Runden im Dienst genau', () => {
    const p = { ...person('secretary', { competence: 1, hiredRound: 5 }) };
    expect(competenceShown(p, { round: 5 }, balance)).toEqual({ min: 1, max: 2 });
    expect(competenceShown(p, { round: 5 + balance.staff.revealRounds }, balance)).toEqual({ min: 1, max: 1 });
    const bewerber = { role: 'fixer' as const, name: 0, competence: 5, claim: 4, ambition: 3, traits: [] };
    expect(competenceShown(bewerber, { round: 99 }, balance)).toEqual({ min: 3, max: 5 });
  });
});

describe('Einstellen, Anerkennung, Entlassen', () => {
  it('Einstellen kostet einen Termin, setzt das Merkzeichen und schickt die anderen Bewerber der Stelle weg', () => {
    const s = openStaff(newGame('hire', balance), balance);
    const index = s.staff!.candidates.findIndex((c) => c.role === 'secretary');
    const r = hireStaff(s, balance, index);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.agenda.used).toBe(s.agenda.used + balance.staff.hireAppointments);
    expect(memberOf(r.state, 'secretary')?.loyalty).toBe(balance.staff.loyalty.start);
    expect(r.state.staff!.candidates.some((c) => c.role === 'secretary')).toBe(false);
    expect(r.state.events.marks[STAFF_MARKS.secretary]).toBe(s.round);
    const zweiter = hireStaff({ ...r.state, staff: { ...r.state.staff!, candidates: s.staff!.candidates } }, balance, index);
    expect(zweiter.ok).toBe(false);
  });

  it('ohne Personal (Kapitel 1) geht keine Aktion', () => {
    const s = newGame('k1', balance);
    expect(hireStaff(s, balance, 0).ok).toBe(false);
    expect(setMailRule(s, 'offer', 'staff').ok).toBe(false);
    expect(orderFixer(s, balance, 'spy').ok).toBe(false);
  });

  it('Anerkennung: ein Termin, Loyalität plus, einmal je Runde', () => {
    const s = mitPersonal([person('secretary', { loyalty: 50 })]);
    const r = recognizeStaff(s, balance, 'secretary');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(memberOf(r.state, 'secretary')!.loyalty).toBe(50 + balance.staff.loyalty.recognition);
    expect(r.state.agenda.used).toBe(s.agenda.used + balance.staff.recognitionAppointments);
    expect(recognizeStaff(r.state, balance, 'secretary').ok).toBe(false);
  });

  it('Entlassen: Abfindung, die Kollegen nehmen es übel, ein Fixer mit Hitze weiß zu viel', () => {
    const s = mitPersonal([person('secretary', { loyalty: 60 }), person('fixer')], { heat: 20 });
    const s2 = { ...s, events: { ...s.events, marks: { ...s.events.marks, [STAFF_MARKS.fixer]: 1 } } };
    const r = dismissStaff(s2, balance, 'fixer');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(s.cash - wageOf(person('fixer'), s, balance) * balance.staff.wage.severanceRounds);
    expect(memberOf(r.state, 'secretary')!.loyalty).toBe(60 - balance.staff.loyalty.scapegoat);
    expect(r.state.events.marks[STAFF_MARKS.fixerFired]).toBeDefined();
    expect(r.state.events.marks[STAFF_MARKS.fixer]).toBeUndefined();
  });
});

describe('Löhne und Loyalität', () => {
  it('Lohn: Grundlohn der Stelle, ±competenceStep je Kompetenzstufe, Lohnstufe, Kreditklima', () => {
    const s = mitPersonal([]);
    const w = balance.staff.wage;
    expect(wageOf(person('secretary'), s, balance)).toBe(w.secretary);
    expect(wageOf(person('secretary', { competence: 5 }), s, balance)).toBe(Math.round(w.secretary * (1 + 2 * w.competenceStep)));
    // Der Lohn folgt dem Ruf, nicht der echten Kompetenz – sonst verriete er sie.
    expect(wageOf(person('secretary', { competence: 1, claim: 3 }), s, balance)).toBe(w.secretary);
    expect(wageOf(person('fixer'), s, balance, 'gut')).toBe(Math.round(w.fixer * 1.1));
    const boom: GameState = { ...s, worldModel: { ...s.worldModel, credit: 100 } };
    expect(wageOf(person('secretary'), boom, balance)).toBe(Math.round(w.secretary * (1 + 50 * w.creditSensitivity)));
  });

  it('die Löhne gehen am Rundenende von der Kasse', () => {
    const s = mitPersonal([person('secretary'), person('fixer')]);
    const lohn = payroll(s, balance);
    const out = settleStaff(s, balance);
    expect(out.cash).toBeCloseTo(s.cash - lohn, 2);
    expect(out.staff!.journal.some((z) => z.includes('Löhne'))).toBe(true);
  });

  it('Lohnkürzung kostet sofort Loyalität, eine Erhöhung nicht', () => {
    const s = mitPersonal([person('secretary', { loyalty: 60 })]);
    const knapp = setWageLevel(s, balance, 'knapp');
    expect(knapp.ok && memberOf(knapp.state, 'secretary')!.loyalty).toBe(60 - balance.staff.loyalty.cut);
    const gut = setWageLevel(s, balance, 'gut');
    expect(gut.ok && memberOf(gut.state, 'secretary')!.loyalty).toBe(60);
    expect(setWageLevel(s, balance, 'gibtsnicht').ok).toBe(false);
  });

  it('je Runde: Loyalität der Lohnstufe, minus Ehrgeiz ohne Beförderung', () => {
    const s = mitPersonal([person('secretary', { loyalty: 60, ambition: 5 })], {
      policies: { ...mitPersonal([]).staff!.policies, wage: 'grosszuegig' },
    });
    const out = settleStaff(s, balance);
    const l = balance.staff.loyalty;
    expect(memberOf(out, 'secretary')!.loyalty).toBe(60 + 4 - 2 * l.ambitionDrift);
  });

  it('„Treu bis zum Tod“ fällt nie unter loyalFloor', () => {
    const s = mitPersonal([person('secretary', { loyalty: balance.staff.loyalty.loyalFloor, traits: ['treu'] })], {
      policies: { ...mitPersonal([]).staff!.policies, wage: 'knapp' },
    });
    expect(memberOf(settleStaff(s, balance), 'secretary')!.loyalty).toBe(balance.staff.loyalty.loyalFloor);
  });

  it('Loyalität und Hitze sind nur Wörter', () => {
    const w = balance.staff.loyalty.words;
    expect(loyaltyWord(w.treu, balance)).toBe('treu');
    expect(loyaltyWord(w.zufrieden, balance)).toBe('zufrieden');
    expect(loyaltyWord(w.unzufrieden, balance)).toBe('unzufrieden');
    expect(loyaltyWord(w.unzufrieden - 1, balance)).toBe('abtruennig');
    expect(heatWord(0, balance)).toBe('kalt');
    expect(heatWord(balance.staff.fixer.words.lauwarm, balance)).toBe('lauwarm');
    expect(heatWord(balance.staff.fixer.words.heiss, balance)).toBe('heiss');
  });

  it('Abwerben: unter poachBelow geht jemand zum Rivalen', () => {
    const b = mitStaffBalance((s) => ({ ...s, loyalty: { ...s.loyalty, poachChance: 1 } }));
    const s = mitPersonal([person('secretary', { loyalty: 5 })]);
    const out = settleStaff(s, b);
    expect(memberOf(out, 'secretary')).toBeUndefined();
    expect(out.events.marks[STAFF_MARKS.poached]).toBeDefined();
    expect(out.events.marks[STAFF_MARKS.secretary]).toBeUndefined();
  });

  it('Verrat: der Ehrgeizige gründet eine Firma, der Fixer geht zur Presse, die Sekretärin kopiert die Bücher', () => {
    const b = mitStaffBalance((s) => ({ ...s, loyalty: { ...s.loyalty, poachChance: 0, betrayChance: 1 } }));
    const firma = settleStaff(mitPersonal([person('secretary', { loyalty: 5, ambition: 5, traits: ['ehrgeizig'] })]), b);
    expect(firma.events.marks[STAFF_MARKS.ownFirm]).toBeDefined();
    const presse = settleStaff(mitPersonal([person('fixer', { loyalty: 5, ambition: 5 })]), b);
    expect(presse.events.marks[STAFF_MARKS.betrayal]).toBeDefined();
    // Verrat, dann kühlt es in derselben Runde schon etwas ab.
    expect(presse.staff!.heat).toBe(b.staff.fixer.leakHeat - b.staff.fixer.heatDecay);
    const buecher = settleStaff(mitPersonal([person('secretary', { loyalty: 5, ambition: 5 })]), b);
    expect(buecher.events.marks[STAFF_MARKS.betrayal]).toBeDefined();
    expect(buecher.staff!.hired).toEqual([]);
    // Wenig Ehrgeiz: kein Verrat.
    const ruhig = settleStaff(mitPersonal([person('secretary', { loyalty: 5, ambition: 2 })]), b);
    expect(memberOf(ruhig, 'secretary')).toBeDefined();
  });

  it('Whistleblower: Gewissenhafte verraten bei Hitze auch ohne Ehrgeiz', () => {
    const b = mitStaffBalance((s) => ({ ...s, loyalty: { ...s.loyalty, poachChance: 0, betrayChance: 1 } }));
    const out = settleStaff(mitPersonal([person('secretary', { loyalty: 5, ambition: 1, traits: ['gewissenhaft'] })], { heat: 50 }), b);
    expect(memberOf(out, 'secretary')).toBeUndefined();
    expect(out.events.marks[STAFF_MARKS.betrayal]).toBeDefined();
  });
});

describe('Sekretärin: Termine (GDD §3: 5, mit Sekretärin bis zu 7)', () => {
  it('ein Termin mehr, ab extraFromCompetence zwei – nicht im Rausch', () => {
    expect(extraAppointments(mitPersonal([]), balance)).toBe(0);
    expect(extraAppointments(mitPersonal([person('secretary', { competence: 3 })]), balance)).toBe(1);
    expect(extraAppointments(mitPersonal([person('secretary', { competence: 4 })]), balance)).toBe(2);
    expect(extraAppointments(mitPersonal([person('secretary', { competence: 5 })], { drunk: ['secretary'] }), balance)).toBe(0);
  });

  it('die nächste Runde beginnt mit den Extra-Terminen – nicht, wenn Jacob krank ist', () => {
    const s = mitPersonal([person('secretary', { competence: 5 })]);
    const out = endRound(s, balance);
    expect(out.agenda.budget).toBe(balance.agenda.appointments + 2);
    const krank = settleStaff({ ...s, sick: 2, agenda: { ...s.agenda, budget: 0 } }, balance);
    expect(krank.agenda.budget).toBe(0);
  });

  it('ein Trinker fällt mit drunkChance aus', () => {
    const b = mitStaffBalance((s) => ({ ...s, secretary: { ...s.secretary, drunkChance: 1 } }));
    const out = settleStaff(mitPersonal([person('secretary', { traits: ['trinker'] })]), b);
    expect(out.staff!.drunk).toEqual(['secretary']);
    expect(out.agenda.budget).toBe(mitPersonal([]).agenda.budget);
  });
});

describe('Post nach Richtlinie', () => {
  const gutSchlecht = brief('a', 'offer', [wahl('gut', { effects: { cash: 50 } }), wahl('schlecht', { default: true, effects: { cash: -20 } })]);

  function mitRegel(state: GameState, kind: MailKind = 'offer'): GameState {
    const r = setMailRule(state, kind, 'staff');
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  }

  it('das Vorzimmer wählt die Antwort, die am meisten wert ist (Kompetenz 5: ohne Schätzfehler)', () => {
    const s = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })])), 'a');
    const out = delegateMail(s, balance, [gutSchlecht]);
    expect(out.cash).toBe(s.cash + 50);
    expect(out.events.pending).not.toContain('a');
    expect(out.log.at(-1)).toContain('Das Vorzimmer nach Richtlinie: Brief a – Ergebnis gut');
    expect(memberOf(out, 'secretary')!.good).toBe(1);
  });

  it('ohne Richtlinie, ohne Sekretärin oder bei laufender Frist bleibt alles bei Jacob', () => {
    const ohneRegel = imPosteingang(mitPersonal([person('secretary', { competence: 5 })]), 'a');
    expect(delegateMail(ohneRegel, balance, [gutSchlecht])).toBe(ohneRegel);
    const ohneKraft = imPosteingang(mitRegel(mitPersonal([])), 'a');
    expect(delegateMail(ohneKraft, balance, [gutSchlecht])).toBe(ohneKraft);
    const frist = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })])), 'a', 1);
    expect(delegateMail(frist, balance, [gutSchlecht]).events.pending).toContain('a');
    const rausch = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })], { drunk: ['secretary'] })), 'a');
    expect(delegateMail(rausch, balance, [gutSchlecht])).toBe(rausch);
  });

  it('teurer als mailSpendLimit antwortet das Vorzimmer nie', () => {
    const kauf = brief('k', 'offer', [wahl('kaufen', { effects: { cash: -300, oilStock: 2000 } }), wahl('nein', { default: true })]);
    expect(choiceWorth(kauf.choices[0], balance)).toBeGreaterThan(0);
    const basis = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })])), 'k');
    const knapp = setMailSpendLimit(basis, 100);
    expect(knapp.ok && delegateMail(knapp.state, balance, [kauf]).cash).toBe(basis.cash);
    const weit = setMailSpendLimit(basis, 1000);
    expect(weit.ok && delegateMail(weit.state, balance, [kauf]).cash).toBe(basis.cash - 300);
  });

  it('Antworten, die Jacob persönlich brauchen (Termin), gibt das Vorzimmer nie – auch wenn sie am meisten wert sind', () => {
    const besuch = brief('b', 'personal', [
      wahl('hinfahren', { appointments: 1, effects: { cash: 500, strength: 14 } }),
      wahl('schreiben', { appointments: 0, effects: { cash: 10 } }),
      wahl('liegen', { default: true, appointments: 0 }),
    ]);
    const s = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })]), 'personal'), 'b');
    const out = delegateMail(s, balance, [besuch]);
    expect(out.log.at(-1)).toContain('Ergebnis schreiben');
    expect(out.cash).toBe(s.cash + 10);
    expect(out.strength).toBe(s.strength);
    // Bleibt nur die Termin-Antwort, erledigt das Vorzimmer den Brief gar nicht.
    const nurBesuch = brief('c', 'personal', [wahl('hinfahren', { appointments: 1, effects: { strength: 14 } })]);
    const s2 = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })]), 'personal'), 'c');
    expect(delegateMail(s2, balance, [nurBesuch])).toBe(s2);
    expect(delegatedMail(s2, [nurBesuch])).toEqual([]);
  });

  it('echte Briefe: Ruths Geburtstag und die Reporterin – keine geschenkte Kraft, kein Empfang ohne Jacob', () => {
    // Etappe 3: Mutters Brief ist gestrichen – Ruths Zettel zum Geburtstag hat dieselbe Falle (Kraft nur mit Jacob).
    const katalog = loadEvents();
    const mutter = katalog.find((e) => e.id === 'ruth_geburtstag')!;
    const reporterin = katalog.find((e) => e.id === 'k2_hitze_reporterin')!;
    for (const event of [mutter, reporterin]) {
      expect(event.mail).toBe('personal');
      const basis = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })]), 'personal'), event.id);
      const r = setMailSpendLimit({ ...basis, strength: 20 }, 1000);
      if (!r.ok) throw new Error(r.reason);
      const out = delegateMail(r.state, balance, [event]);
      const eintrag = out.log.at(-1)!;
      const gewaehlt = event.choices.find((c) => eintrag.includes(c.result.de))!;
      expect(gewaehlt).toBeDefined();
      expect(choiceCost(event, gewaehlt)).toBe(0);
    }
    // Ruth: „ausfahrt“ (Kraft +8, zwei Termine) bleibt Jacob vorbehalten.
    const basis = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })]), 'personal'), 'ruth_geburtstag');
    const r = setMailSpendLimit({ ...basis, strength: 20 }, 1000);
    if (!r.ok) throw new Error(r.reason);
    expect(delegateMail(r.state, balance, [mutter]).strength).toBeLessThan(20 + 8);
  });

  it('am Rundenende ersetzt das Vorzimmer die Standard-Antwort', () => {
    const s = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 5 })])), 'a');
    const out = endRound(s, balance, [gutSchlecht]);
    expect(out.log.some((z) => z.includes('Das Vorzimmer nach Richtlinie: Brief a'))).toBe(true);
    expect(out.log.some((z) => z.includes('Ohne Antwort: Brief a'))).toBe(false);
  });

  it('delegatedMail zeigt, welche Briefe das Vorzimmer übernehmen würde', () => {
    const s = imPosteingang(mitRegel(mitPersonal([person('secretary')])), 'a', 2);
    expect(delegatedMail(s, [gutSchlecht])).toEqual(['a']);
    expect(delegatedMail(imPosteingang(mitPersonal([person('secretary')]), 'a'), [gutSchlecht])).toEqual([]);
  });

  it('eine schlechte Kraft irrt sich manchmal – die Akte zählt es', () => {
    const b = mitStaffBalance((s) => ({ ...s, secretary: { ...s.secretary, judgementNoise: 10000 } }));
    const knapp = brief('n', 'offer', [wahl('x', { effects: { cash: 10 } }), wahl('y', { default: true, effects: { cash: 0 } })]);
    let gut = 0;
    let schlecht = 0;
    for (let i = 0; i < 40; i++) {
      const s = imPosteingang(mitRegel(mitPersonal([person('secretary', { competence: 1 })], {}, `irrtum-${i}`)), 'n');
      const m = memberOf(delegateMail(s, b, [knapp]), 'secretary')!;
      gut += m.good;
      schlecht += m.bad;
    }
    expect(gut).toBeGreaterThan(0);
    expect(schlecht).toBeGreaterThan(0);
  });
});

describe('Verkauf nach Regel', () => {
  function verkauf(members: StaffMember[], sales: Partial<StaffState['policies']['sales']>, b = balance): [GameState, GameState] {
    const basis = mitPersonal(members);
    const r = setSalesPolicy({ ...basis, oilStock: 1000, royaltyOil: 0 }, { on: true, ...sales });
    if (!r.ok) throw new Error(r.reason);
    return [r.state, autoSell(r.state, b)];
  }

  it('ab dem Mindestpreis verkauft das Vorzimmer den Anteil des Tanks', () => {
    const [vorher, nachher] = verkauf([person('secretary', { competence: 5 })], { minPrice: 0, share: 0.5 });
    expect(nachher.oilStock).toBe(500);
    expect(nachher.cash).toBeGreaterThan(vorher.cash);
    expect(memberOf(nachher, 'secretary')!.good).toBe(1);
  });

  it('unter dem Mindestpreis bleibt das Öl im Tank; ausgeschaltet oder ohne Sekretärin auch', () => {
    const [vorher, nachher] = verkauf([person('secretary', { competence: 5 })], { minPrice: 99 });
    expect(nachher.oilStock).toBe(vorher.oilStock);
    const [aus, ausNach] = verkauf([person('secretary', { competence: 5 })], { minPrice: 0, on: false });
    expect(ausNach.oilStock).toBe(aus.oilStock);
    const [leer, leerNach] = verkauf([], { minPrice: 0 });
    expect(leerNach.oilStock).toBe(leer.oilStock);
  });

  it('bei misjudgeChance 1 und Kompetenz 1 hält sich das Vorzimmer nicht an die Regel', () => {
    const b = mitStaffBalance((s) => ({ ...s, sales: { ...s.sales, misjudgeChance: 1 } }));
    const [vorher, haelt] = verkauf([person('secretary', { competence: 1 })], { minPrice: 0 }, b);
    expect(haelt.oilStock).toBe(vorher.oilStock);
    expect(memberOf(haelt, 'secretary')!.bad).toBe(1);
    const [, unter] = verkauf([person('secretary', { competence: 1 })], { minPrice: 99, share: 1 }, b);
    expect(unter.oilStock).toBeLessThan(1000);
    expect(unter.staff!.journal.at(-1)).toContain('unter dem Mindestpreis');
  });

  it('der Charmante holt charmBonus je Barrel mehr, beim Gierigen verschwindet greedSkim', () => {
    const [, normal] = verkauf([person('secretary', { competence: 5 })], { minPrice: 0, share: 0.5 });
    const [, charme] = verkauf([person('secretary', { competence: 5, traits: ['charmant'] })], { minPrice: 0, share: 0.5 });
    expect(charme.cash - normal.cash).toBeCloseTo(500 * balance.staff.secretary.charmBonus, 2);
    const b = mitStaffBalance((s) => ({ ...s, secretary: { ...s.secretary, greedChance: 1 } }));
    const [vorher, gier] = verkauf([person('secretary', { competence: 5, traits: ['gierig'] })], { minPrice: 0, share: 0.5 }, b);
    const erloes = normal.cash - vorher.cash;
    expect(gier.cash - vorher.cash).toBeCloseTo(erloes - Math.round(erloes * b.staff.secretary.greedSkim * 100) / 100, 2);
    expect(memberOf(gier, 'secretary')!.bad).toBe(1);
  });
});

describe('Fixer: Aufträge, Abwehr, Hitze', () => {
  const sicher = (p: number) =>
    mitStaffBalance((s) => ({
      ...s,
      fixer: {
        ...s.fixer,
        orders: { spy: { ...s.fixer.orders.spy, successMin: p, successMax: p }, sabotage: { ...s.fixer.orders.sabotage, successMin: p, successMax: p } },
      },
    }));

  it('ein Auftrag wird sofort bezahlt und geht nur einmal je Runde', () => {
    const s = mitPersonal([person('fixer')]);
    const r = orderFixer(s, balance, 'spy');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(s.cash - balance.staff.fixer.orders.spy.cost);
    expect(orderFixer(r.state, balance, 'spy').ok).toBe(false);
    expect(orderFixer(mitPersonal([]), balance, 'spy').ok).toBe(false);
    expect(orderFixer({ ...s, cash: 0 }, balance, 'spy').ok).toBe(false);
  });

  it('ein gewissenhafter Fixer verweigert Sabotage – kostet Loyalität, kein Geld', () => {
    const s = mitPersonal([person('fixer', { loyalty: 60, traits: ['gewissenhaft'] })]);
    const r = orderFixer(s, balance, 'sabotage');
    expect(r.ok && r.message).toContain('verweigert');
    if (!r.ok) return;
    expect(r.state.cash).toBe(s.cash);
    expect(r.state.staff!.orders).toEqual([]);
    expect(memberOf(r.state, 'fixer')!.loyalty).toBe(60 - balance.staff.loyalty.illegalOrder);
  });

  it('Erfolgschance steigt mit der Kompetenz von successMin zu successMax', () => {
    const o = balance.staff.fixer.orders.spy;
    expect(orderSuccess('spy', 1, balance)).toBe(o.successMin);
    expect(orderSuccess('spy', 5, balance)).toBe(o.successMax);
  });

  it('Spionage bringt einen Bericht über Bullard und Hitze', () => {
    const s = mitPersonal([person('fixer')], { orders: ['spy'] });
    const b = sicher(1);
    const out = runOrders(s, b);
    expect(out.staff!.intel).toEqual({ round: s.round, cash: Math.round(s.rival.cash / 100) * 100, drilling: 0, found: 0, leases: 0 });
    expect(out.staff!.heat).toBe(b.staff.fixer.orders.spy.heat);
    expect(out.staff!.orders).toEqual([]);
    expect(out.events.marks[STAFF_MARKS.spied]).toBeDefined();
  });

  it('der Verschwiegene macht nur halb so viel Hitze', () => {
    const out = runOrders(mitPersonal([person('fixer', { traits: ['verschwiegen'] })], { orders: ['spy'] }), sicher(1));
    expect(out.staff!.heat).toBe(balance.staff.fixer.orders.spy.heat / 2);
  });

  it('Sabotage: Bullard verliert Geld und Zeit – misslingt sie, gibt es Fehde und mehr Hitze', () => {
    const basis = mitPersonal([person('fixer')], { orders: ['sabotage'] });
    const s = { ...basis, rival: { ...basis.rival, wells: [{ parcelId: 'x', startRound: 1, roundsLeft: 2, status: 'drilling' as const }] } };
    const o = balance.staff.fixer.orders.sabotage;
    const gut = runOrders(s, sicher(1));
    expect(gut.rival.cash).toBe(Math.max(0, s.rival.cash - o.rivalCash!));
    expect(gut.rival.wells[0].roundsLeft).toBe(2 + o.delay!);
    expect(gut.events.marks[STAFF_MARKS.sabotaged]).toBeDefined();
    const schlecht = runOrders(s, sicher(0));
    expect(schlecht.rival.cash).toBe(s.rival.cash);
    expect(schlecht.events.marks[RIVAL_MARKS.bullardFeud]).toBeDefined();
    expect(schlecht.staff!.heat).toBe(o.heat + o.caughtHeat!);
    expect(memberOf(schlecht, 'fixer')!.bad).toBe(1);
  });

  it('ein betrunkener Fixer vermasselt den Auftrag', () => {
    const out = runOrders(mitPersonal([person('fixer')], { orders: ['spy'], drunk: ['fixer'] }), sicher(1));
    expect(out.staff!.intel).toBeNull();
    expect(memberOf(out, 'fixer')!.bad).toBe(1);
  });

  it('Abwehr: ein Fixer senkt die Sabotage-Chance gegen Jacobs Pipeline', () => {
    const ohne = mitPersonal([]);
    const mit = mitPersonal([person('fixer', { competence: 5 })]);
    expect(fixerDefense(ohne, balance)).toBe(1);
    expect(fixerDefense(mit, balance)).toBeCloseTo(1 - balance.staff.fixer.defense);
    expect(sabotageChance(mit, balance)).toBeCloseTo(sabotageChance(ohne, balance) * (1 - balance.staff.fixer.defense));
  });

  it('Der Fixer schützt auch die Fernleitungen (4.7): Sabotage-Chance × fixerDefense', () => {
    const ohne = mitPersonal([]);
    const mit = mitPersonal([person('fixer', { competence: 5 })]);
    const leitung = { status: 'ready', length: 1, bypassesRail: false, guards: false } as unknown as TrunkProject;
    const basis = sabotageChanceOf(ohne, balance, leitung);
    expect(basis).toBeGreaterThan(0);
    expect(sabotageChanceOf(mit, balance, leitung)).toBeCloseTo(basis * (1 - balance.staff.fixer.defense));
  });

  it('Hitze kühlt je Runde ab, der Verschwiegene schneller', () => {
    const f = balance.staff.fixer;
    expect(settleStaff(mitPersonal([person('fixer')], { heat: 40 }), balance).staff!.heat).toBe(40 - f.heatDecay);
    expect(settleStaff(mitPersonal([person('fixer', { traits: ['verschwiegen'] })], { heat: 40 }), balance).staff!.heat).toBe(40 - f.heatDecayDiscreet);
  });

  it('Skandal ab scandalFrom: Strafe und Abkühlung – oder der treue Fixer nimmt die Schuld auf sich', () => {
    const b = mitStaffBalance((s) => ({ ...s, fixer: { ...s.fixer, scandalChance: 1 } }));
    const f = b.staff.fixer;
    const s = mitPersonal([person('fixer')], { heat: 90 });
    const out = settleStaff(s, b);
    expect(out.cash).toBeCloseTo(s.cash - payroll(s, b) - f.scandalFine, 2);
    expect(out.staff!.heat).toBe(90 - f.heatDecay - f.scandalCool);
    expect(out.events.marks[STAFF_MARKS.scandal]).toBeDefined();
    const treu = mitPersonal([person('fixer', { traits: ['treu'] })], { heat: 90 });
    const opfer = settleStaff(treu, b);
    expect(opfer.cash).toBeCloseTo(treu.cash - payroll(treu, b), 2);
    expect(memberOf(opfer, 'fixer')).toBeUndefined();
    expect(opfer.staff!.heat).toBe(0);
  });

  it('das Merkzeichen fixer_hitze gilt, solange es heiß ist', () => {
    const heiss = settleStaff(mitPersonal([person('fixer')], { heat: 95 }), mitStaffBalance((s) => ({ ...s, fixer: { ...s.fixer, scandalChance: 0 } })));
    expect(heiss.events.marks[STAFF_MARKS.heat]).toBeDefined();
    const kalt = settleStaff({ ...heiss, staff: { ...heiss.staff!, heat: 0 } }, balance);
    expect(kalt.events.marks[STAFF_MARKS.heat]).toBeUndefined();
  });
});

describe('Briefe zum Personal (STAFF_EVENT_MARKS, content/events/k2-personal.yaml)', () => {
  function gesetzt(state: GameState, mark: string): GameState {
    return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
  }

  it('ein Lob in dieser Runde gibt Loyalität wie eine Anerkennung', () => {
    const s = gesetzt(mitPersonal([person('secretary', { loyalty: 50 })]), STAFF_EVENT_MARKS.praiseSecretary);
    expect(memberOf(settleStaff(s, balance), 'secretary')!.loyalty).toBe(50 + balance.staff.loyalty.recognition);
    // In einer späteren Runde wirkt dasselbe Merkzeichen nicht noch einmal.
    const spaeter = { ...s, round: s.round + 1 };
    expect(memberOf(settleStaff(spaeter, balance), 'secretary')!.loyalty).toBe(50);
  });

  it('schickt ein Brief den Fixer los, wird es heißer', () => {
    const s = gesetzt(mitPersonal([person('fixer')]), STAFF_EVENT_MARKS.heat);
    expect(settleStaff(s, balance).staff!.heat).toBe(balance.staff.fixer.eventHeat - balance.staff.fixer.heatDecay);
  });

  it('die Briefe kommen erst mit Personal – ihre Merkzeichen setzt nur die Simulation', () => {
    // Nur die Briefe aus k2-personal.yaml – andere Kapitel-2-Ereignisse (z. B. 4.10 Diplomatie) haben eigene Merkzeichen.
    const personalIds = new Set([...readFileSync(new URL('../../content/events/k2-personal.yaml', import.meta.url), 'utf8').matchAll(/^- id: (\S+)/gm)].map((m) => m[1]));
    const katalog = loadEvents().filter((e) => personalIds.has(e.id));
    expect(katalog.length).toBeGreaterThan(0);
    for (const e of katalog) {
      expect(e.mail).toBeDefined();
      expect(e.marked.some((m) => (Object.values(STAFF_MARKS) as string[]).includes(m))).toBe(true);
    }
  });
});

describe('Zufall und Spielstand', () => {
  it('gleicher Zustand, gleiches Rundenende; der Weltzufall bleibt vom Personal unberührt', () => {
    const ohne = newGame('zufall', balance);
    const mit = mitPersonal([person('secretary', { traits: ['trinker', 'genie'] }), person('fixer')], { orders: ['spy'] }, 'zufall');
    expect(endRound(mit, balance)).toEqual(endRound(mit, balance));
    expect(endRound(mit, balance).rng).toBe(endRound(ohne, balance).rng);
  });

  it('Spielstand mit Personal lädt wieder; ein kaputter Personalzustand nicht; ohne Personal wie bisher', () => {
    const s = mitPersonal([person('secretary')], { intel: { round: 1, cash: 100, drilling: 0, found: 0, leases: 0 } });
    const back = deserializeGame(serializeGame(s, 'test'));
    expect(back.ok && back.state.staff).toEqual(s.staff);
    expect(deserializeGame(serializeGame({ ...s, staff: { foo: 1 } as unknown as StaffState }, 'test')).ok).toBe(false);
    expect(deserializeGame(serializeGame(newGame('ohne', balance), 'test')).ok).toBe(true);
    expect(isStaffState(s.staff)).toBe(true);
  });
});

describe('Inhalte (content/staff.yaml)', () => {
  it('lesen sich ohne Fehler und passen zu balance.yaml', () => {
    const { content, errors } = parseStaffContent('content/staff.yaml', STAFF_YAML);
    expect(errors).toEqual([]);
    expect(checkStaffContent('content/staff.yaml', content!, balance)).toEqual([]);
  });

  it('melden fehlende Teile und eine falsche Zahl Namen', () => {
    expect(parseStaffContent('x.yaml', 'roles: {}').errors.length).toBeGreaterThan(0);
    const { content } = parseStaffContent('content/staff.yaml', STAFF_YAML);
    const zuWenig = { ...content!, names: { ...content!.names, fixer: content!.names.fixer.slice(1) } };
    expect(checkStaffContent('content/staff.yaml', zuWenig, balance).length).toBe(1);
  });

  it('die Personalakte zeigt Namen, Spannen, Wörter – ohne Personal nichts', () => {
    const { content } = parseStaffContent('content/staff.yaml', STAFF_YAML);
    expect(staffView(newGame('k1', balance), balance, content!)).toBeNull();
    const s = mitPersonal([person('fixer', { competence: 4, hiredRound: 1 })], { intel: { round: 1, cash: 1200, drilling: 2, found: 1, leases: 3 } });
    const v = staffView(s, balance, content!)!;
    expect(v.members[0].name).toBe(content!.names.fixer[0].name);
    expect(v.members[0].competence).toBe('3–5');
    expect(v.members[0].loyaltyText).toBe(content!.loyalty.zufrieden.de);
    expect(v.orders.map((o) => o.id)).toEqual(['spy', 'sabotage']);
    expect(v.orders[0].chance).toBeNull();
    expect(v.intel).toContain('1.200');
    expect(v.candidates.every((c) => c.role === 'secretary')).toBe(true);
  });

  it('Ereignisse dürfen auf die Merkzeichen des Personals reagieren (z. B. „Drohen“ nur mit Fixer)', () => {
    const yaml = `- id: drohen\n  title: { de: Drohen, en: "" }\n  text: { de: Text, en: "" }\n  marked: [${STAFF_MARKS.fixer}]\n  chance: 0.5\n  choices:\n    - id: ok\n      label: { de: Ok, en: "" }\n      result: { de: Ok, en: "" }\n      default: true\n`;
    expect(parseEventFiles([{ file: 'test.yaml', text: yaml }]).errors).toEqual([]);
  });
});
