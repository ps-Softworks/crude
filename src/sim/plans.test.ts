// Termine als Hauptwerkzeug, Etappe 1: Planungsbrett (Plan 1.3, Tests 1.5).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nonFiniteNumbers } from './testFinite';
import type { Balance } from './balance';
import { resolveEvent } from './events';
import { hireGeologist, knowledgeForecast, knowledgeOf, learnFromWells, rideParcels } from './exploration';
import { endRound, newGame, type GameState } from './game';
import { leaseTerms } from './lease';
import { checkPlanContent, parsePlanContent } from './planContent';
import { bookCard, cardReason, planCards, planRefErrors, planView, settlePlans, unbookCard } from './plans';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const katalog = loadEvents();

function ok(r: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Eine freie Ranch mit zwei Nachbarn, über die Jacob noch nichts weiß. */
function unbekannt(state: GameState): string {
  return state.parcels.find(
    (p) => !p.discovery && !state.knowledge[p.id] && p.neighbors.filter((id) => state.parcels.some((q) => q.id === id && !q.discovery)).length >= 2,
  )!.id;
}

/** Balance mit einer Testkarte, die erst am Rundenende wirkt (Etappe 2 bringt solche Karten). */
function mitRundenendKarte(): Balance {
  return {
    ...balance,
    plans: { cards: { ...balance.plans.cards, probe: { tab: 'markt', appointments: 2, cash: 50, strength: 0, target: 'ranch', timing: 'rundenende', handler: 'rute', requires: {} } } },
  };
}

describe('Buchen und Zurücknehmen (Plan 1.3)', () => {
  it('Buchen belegt die Termine der Karte und zieht Geld und Kraft ab; die Sofort-Karte wirkt gleich', () => {
    const state = newGame('buchen', balance, katalog);
    const ziel = unbekannt(state);
    const nach = ok(bookCard(state, balance, katalog, 'ritt', ziel));
    const karte = balance.plans.cards.ritt;
    expect(nach.agenda.used).toBe(state.agenda.used + karte.appointments);
    expect(nach.strength).toBe(state.strength + karte.strength);
    expect(knowledgeOf(nach, ziel).level).toBe(1);
    expect(nach.plans.booked).toEqual([{ cardId: 'ritt', target: ziel, appointments: 2, overtime: 0, cash: 0, strength: karte.strength, done: true }]);
    expect(nach.plans.report.at(-1)).toMatch(/Ritt übers Land/);
    // Schon gewirkt: zurücknehmen geht nicht mehr.
    expect(unbookCard(nach, balance, 0)).toEqual({ ok: false, reason: 'Das ist schon geschehen – zurücknehmen geht nicht mehr.' });
  });

  it('Überstunden kosten Kraft – und beim Zurücknehmen kommt sie wieder', () => {
    const b = mitRundenendKarte();
    let state = newGame('nacht', b, katalog);
    state = { ...state, agenda: { ...state.agenda, used: state.agenda.budget - 1 } };
    const ziel = unbekannt(state);
    const nach = ok(bookCard(state, b, katalog, 'probe', ziel));
    expect(nach.plans.booked[0]).toMatchObject({ appointments: 2, overtime: 1, cash: 50, done: false });
    expect(nach.strength).toBe(state.strength - b.agenda.overtimeCost);
    expect(nach.cash).toBe(state.cash - 50);
    const zurueck = ok(unbookCard(nach, b, 0));
    expect(zurueck.agenda.used).toBe(state.agenda.used);
    expect(zurueck.strength).toBe(state.strength);
    expect(zurueck.cash).toBe(state.cash);
    expect(zurueck.plans.booked).toEqual([]);
  });

  it('Zurücknehmen gibt genau die Kraft zurück, die das Buchen gekostet hat – auch am Rand bei 0 und bei strengthMax', () => {
    for (const kraft of [-3, 2]) {
      const base = mitRundenendKarte();
      const b: Balance = { ...base, plans: { cards: { ...base.plans.cards, probe: { ...base.plans.cards.probe, strength: kraft } } } };
      const start = newGame('kraftrand', b, katalog);
      for (const s0 of [0, 1, start.strengthMax - 1, start.strengthMax]) {
        const state = { ...start, strength: s0 };
        const ziel = unbekannt(state);
        const nach = ok(bookCard(state, b, katalog, 'probe', ziel));
        expect(nach.strength).toBe(Math.min(state.strengthMax, Math.max(0, s0 + kraft)));
        expect(nach.plans.booked[0].strength).toBe(nach.strength - s0);
        const zurueck = ok(unbookCard(nach, b, 0));
        expect(zurueck.strength).toBe(s0);
      }
    }
  });

  it('Rundenend-Karten wirken erst am Rundenende – das Ergebnis steht im Wochenbericht', () => {
    const b = mitRundenendKarte();
    const state = newGame('rundenende', b, katalog);
    const ziel = unbekannt(state);
    const gebucht = ok(bookCard(state, b, katalog, 'probe', ziel));
    expect(knowledgeOf(gebucht, ziel).clues).toEqual([]);
    expect(cardReason(gebucht, b, katalog, planCards(b, katalog).find((c) => c.id === 'probe')!, ziel)).toBe('Diese Karte ist für diese Runde schon gebucht.');
    const abgerechnet = settlePlans(gebucht, b);
    expect(knowledgeOf(abgerechnet, ziel).clues.map((c) => c.kind)).toEqual(['rute']);
    expect(abgerechnet.plans).toMatchObject({ round: state.round + 1, booked: [] });
    expect(abgerechnet.plans.report.join(' ')).toMatch(/Rutengänger/);
    // Im echten Rundenende genauso – und der Bericht liegt in der neuen Runde auf dem Tisch.
    const neu = endRound(gebucht, b, katalog);
    expect(neu.round).toBe(state.round + 1);
    expect(knowledgeOf(neu, ziel).clues.map((c) => c.kind)).toEqual(['rute']);
    expect(planView(neu, b, katalog).report.join(' ')).toMatch(/Rutengänger/);
  });

  it('gesperrte Karten nennen den richtigen Grund', () => {
    const state = newGame('gesperrt', balance, katalog);
    const karten = planCards(balance, katalog);
    const karte = (id: string) => karten.find((c) => c.id === id)!;
    const ziel = unbekannt(state);
    expect(cardReason(state, balance, katalog, karte('geologe_besprechung'), ziel)).toBe('Ohne Geologen gibt es keine Karte.');
    expect(cardReason(state, balance, katalog, karte('tagebuch'))).toBe('Bullard hat noch nichts gebohrt, was in seinem Tagebuch stünde.');
    expect(cardReason(state, balance, katalog, karte('bohrbericht'), ziel)).toBe('Hier hat niemand gebohrt, dessen Bericht zu kaufen wäre.');
    const salt = state.parcels.find((p) => p.discovery)!.id;
    expect(bookCard(state, balance, katalog, 'ritt', salt)).toEqual({ ok: false, reason: 'Salt Hill ist erschlossen – da gibt es nichts zu erkunden.' });
    expect(bookCard(state, balance, katalog, 'ritt')).toEqual({ ok: false, reason: 'Erst eine Ranch wählen.' });
    expect(cardReason({ ...state, cash: 10 }, balance, katalog, karte('geologe_einstellen'))).toMatch(/Nicht genug Geld/);
    const voll = { ...state, agenda: { ...state.agenda, used: state.agenda.budget + balance.agenda.maxOvertime } };
    expect(cardReason(voll, balance, katalog, karte('ritt'), ziel)).toBe('Dafür fehlt die Zeit: Alle Termine und Überstunden sind belegt.');
    // Zweimal dieselbe Ranch abreiten bringt nichts Neues.
    const geritten = rideParcels(state, ziel).reduce((s, p) => ok(bookCard({ ...s, agenda: { ...s.agenda, used: 0 } }, balance, katalog, 'ritt', p.id)), state);
    expect(cardReason({ ...geritten, agenda: { ...geritten.agenda, used: 0 } }, balance, katalog, karte('ritt'), ziel)).toMatch(/schon überall geritten|nichts Neues/);
  });

  it('das Brett zeigt Termine als Felder (rote Nachtfelder für Überstunden) und die Karten mit Zielen', () => {
    const state = newGame('brett', balance, katalog);
    const ziel = unbekannt(state);
    const nach = ok(bookCard(state, balance, katalog, 'ritt', ziel));
    const v = planView(nach, balance, katalog);
    expect(v.slots).toHaveLength(nach.agenda.budget + balance.agenda.maxOvertime);
    expect(v.slots.slice(0, 2).every((s) => s.kind === 'plan' && s.cardId === 'ritt')).toBe(true);
    expect(v.slots.filter((s) => s.overtime)).toHaveLength(balance.agenda.maxOvertime);
    const ritt = v.cards.find((c) => c.id === 'ritt')!;
    expect(ritt.tab).toBe('land');
    expect(ritt.targets.length).toBeGreaterThan(10);
    expect(ritt.targets.every((t) => !t.ok || t.reason === undefined)).toBe(true);
    // Feste Termine liegen im Reiter „leute“, die Feldinspektion im Reiter „land“.
    expect(v.cards.find((c) => c.id === 'termin_ruth')).toMatchObject({ tab: 'leute', event: 'termin_ruth', auto: true });
    expect(v.cards.filter((c) => c.tab === 'land').length).toBeGreaterThanOrEqual(6);
    expect(v.cards.length).toBeGreaterThanOrEqual(6);
  });
});

describe('Feste Termine als Karten (Plan 1.3)', () => {
  it('buchen wirkt genau wie der feste Termin bisher (Familie, Kraft, Termine)', () => {
    const state = newGame('familie', balance, katalog);
    const alt = ok(resolveEvent(state, balance, katalog, 'termin_ruth', 'bleiben'));
    const neu = ok(bookCard(state, balance, katalog, 'termin_ruth'));
    const { plans: _a, ...rest } = neu;
    const { plans: _b, ...restAlt } = alt;
    expect(rest).toEqual(restAlt);
    expect(neu.plans.booked).toEqual([{ cardId: 'termin_ruth', appointments: 1, overtime: 0, cash: 0, strength: 0, done: true }]);
    expect(endRound(neu, balance, katalog).family).toEqual(endRound(alt, balance, katalog).family);
    expect(endRound(neu, balance, katalog).strength).toBe(endRound(alt, balance, katalog).strength);
  });

  it('die Feldinspektion ist der Rundgang an den Quellen – erst mit einer fördernden Quelle', () => {
    const state = newGame('rundgang', balance, katalog);
    expect(planView(state, balance, katalog).cards.some((c) => c.id === 'feldinspektion')).toBe(false);
    const p = state.parcels.find((x) => !x.discovery)!;
    const mitQuelle: GameState = {
      ...state,
      wells: [{ id: `${p.id}#1`, parcelId: p.id, stage: 1, status: 'found', roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1, result: 'small', production: { initialRate: 100, roundsProduced: 1, lastRate: 100, total: 100 } }],
    };
    const karte = planView(mitQuelle, balance, katalog).cards.find((c) => c.id === 'feldinspektion');
    expect(karte).toMatchObject({ tab: 'land', event: 'termin_rundgang', auto: false });
    const nach = ok(bookCard(mitQuelle, balance, katalog, 'feldinspektion'));
    expect(nach.oilStock).toBe(mitQuelle.oilStock + 40);
    expect(nach.agenda.done).toContain('termin_rundgang');
    expect(planView(nach, balance, katalog).slots.filter((s) => s.cardId === 'feldinspektion')).toHaveLength(2);
  });

  it('die Reise nach Port Ellis ist kein fester Termin mehr', () => {
    expect(katalog.some((e) => e.id === 'termin_port_ellis')).toBe(false);
  });
});

describe('Erkundungs-Karten (Plan 1.3)', () => {
  it('Geologen einstellen, kartieren lassen (Stufe 2) – und am Rundenende kostet er Lohn', () => {
    let state = newGame('geologe', balance, katalog);
    state = ok(bookCard(state, balance, katalog, 'geologe_einstellen'));
    expect(state.exploration.geologist).toMatchObject({ id: 'standard', accuracy: 3, wage: balance.exploration.geologists.standard.wage });
    expect(Math.abs(state.exploration.geologist!.bias)).toBeLessThanOrEqual(balance.exploration.geologists.standard.biasMax!);
    expect(state.cash).toBe(balance.start.cash - balance.plans.cards.geologe_einstellen.cash);
    const ziel = unbekannt(state);
    state = ok(bookCard(state, balance, katalog, 'geologe_besprechung', ziel));
    expect(knowledgeOf(state, ziel).level).toBe(2);
    const kartiert = state.parcels.filter((p) => knowledgeOf(state, p.id).clues.some((c) => c.kind === 'kartierung'));
    expect(kartiert).toHaveLength(2);
    const vorher = state.cash;
    expect(settlePlans(state, balance).cash).toBe(vorher - balance.exploration.geologists.standard.wage);
  });

  it('die Trefferbilanz des Geologen zählt, ob seine Karte (ab 50 %) zum Bohrergebnis passte', () => {
    let state = newGame('bilanz', balance, katalog);
    state = ok(bookCard(state, balance, katalog, 'geologe_einstellen'));
    const ziel = unbekannt(state);
    state = ok(bookCard(state, balance, katalog, 'geologe_besprechung', ziel));
    const f = knowledgeForecast(state, balance, ziel)!;
    const sagteOel = (f.low + f.high) / 2 >= 50;
    for (const fund of [true, false]) {
      const gebohrt: GameState = {
        ...state,
        wells: [{ id: ziel + '#1', parcelId: ziel, stage: 1, status: fund ? 'found' : 'dry', roundsLeft: 0, spent: 0, oilStage: fund ? 1 : null, startRound: 1 }],
      };
      const r = learnFromWells(gebohrt, balance).exploration.record;
      expect(r.hits + r.misses).toBe(1);
      expect(r.hits).toBe(sagteOel === fund ? 1 : 0);
    }
  });

  it('Hale ist billig, ungenau und sieht überall Öl; Hallstead ist der beste', () => {
    const state = newGame('hale', balance, katalog);
    expect(hireGeologist(state, balance, 'hale').exploration.geologist).toMatchObject({ accuracy: 1, bias: 15 });
    expect(hireGeologist(state, balance, 'hallstead').exploration.geologist).toMatchObject({ accuracy: 5 });
  });

  it('der freundliche Farmer lässt beim Pachtbonus nach', () => {
    const state = newGame('farmer', balance, katalog);
    const p = state.parcels.find((x) => !x.discovery && balance.exploration.friendlyOwners.includes(x.landowner))!;
    const vorher = leaseTerms(state, balance, p.id).bonus;
    const nach = ok(bookCard(state, balance, katalog, 'farmer', p.id));
    expect(knowledgeOf(nach, p.id).leaseDiscount).toBe(balance.exploration.friendlyDiscount);
    expect(leaseTerms(nach, balance, p.id).bonus).toBeLessThan(vorher);
    expect(bookCard(nach, balance, katalog, 'farmer', p.id)).toEqual({ ok: false, reason: 'Der alte Farmer hat schon alles erzählt, was er weiß.' });
  });

  it('Bohrbericht und Tagebuch: nur wo Bullard gebohrt hat; Stufe 3', () => {
    let state = newGame('bericht', balance, katalog);
    const [a, b2, c] = state.parcels.filter((p) => !p.discovery && !state.knowledge[p.id]);
    state = {
      ...state,
      rival: {
        ...state.rival,
        wells: [
          { parcelId: a.id, startRound: 1, roundsLeft: 0, status: 'found', rate: 100, royalty: 0.125 },
          { parcelId: b2.id, startRound: 1, roundsLeft: 0, status: 'dry' },
          { parcelId: c.id, startRound: 1, roundsLeft: 2, status: 'drilling' },
        ],
      },
    };
    const v = planView(state, balance, katalog).cards.find((x) => x.id === 'bohrbericht')!;
    expect(v.targets.filter((t) => t.ok).map((t) => t.parcelId).sort()).toEqual([a.id, b2.id].sort());
    const gekauft = ok(bookCard(state, balance, katalog, 'bohrbericht', a.id));
    expect(gekauft.cash).toBe(state.cash - balance.exploration.reportCost.found);
    expect(knowledgeOf(gekauft, a.id).level).toBe(3);
    const gelesen = ok(bookCard(state, balance, katalog, 'tagebuch'));
    expect(knowledgeOf(gelesen, a.id).level).toBe(3);
    expect(knowledgeOf(gelesen, b2.id).level).toBe(3);
    expect(knowledgeOf(gelesen, c.id).level).toBe(0);
  });

  it('Bullards Tagebuch: zu etwa 25 % erwischt – dann Fehde', () => {
    let erwischt = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      let state = newGame(`tagebuch-${i}`, balance);
      const p = state.parcels.find((x) => !x.discovery)!;
      state = { ...state, rival: { ...state.rival, wells: [{ parcelId: p.id, startRound: 1, roundsLeft: 0, status: 'dry' }] } };
      const nach = ok(bookCard(state, balance, [], 'tagebuch'));
      if (nach.events.marks[RIVAL_MARKS.bullardFeud] !== undefined) erwischt++;
    }
    expect(Math.abs(erwischt / n - balance.exploration.diary.caught)).toBeLessThan(0.06);
  });
});

describe('Inhalte und Spielstand (Plan 1.3, 1.5)', () => {
  it('content/plans.yaml passt zu balance.yaml, jede Regel und jeder feste Termin existiert', () => {
    const { content, errors } = parsePlanContent('content/plans.yaml', readFileSync(new URL('../../content/plans.yaml', import.meta.url), 'utf8'));
    expect(errors).toEqual([]);
    expect(checkPlanContent('content/plans.yaml', content!, balance)).toEqual([]);
    expect(planRefErrors(balance, katalog)).toEqual([]);
    expect(planRefErrors({ ...balance, plans: { cards: { kaputt: { ...balance.plans.cards.ritt, handler: 'gibtsnicht' } } } }, katalog)[0]).toMatch(/gibtsnicht/);
  });

  it('ein alter Spielstand (Format 21, 0.4.19) lädt: jede Ranch mit Prognose ist kartiert, ohne q gilt die Zone', () => {
    const s = newGame('altstand', balance, katalog);
    const alt: Record<string, unknown> = { ...s, parcels: s.parcels.map(({ chance: _c, ...p }) => p) };
    for (const k of ['knowledge', 'exploration', 'plans']) delete alt[k];
    const geladen = deserializeGame(JSON.stringify({ format: 21, appVersion: '0.4.19', savedRound: 1, state: alt }));
    if (!geladen.ok) throw new Error(geladen.reason);
    const st = geladen.state;
    for (const id of Object.keys(s.forecasts)) expect(st.knowledge[id]).toEqual({ level: 2, clues: [] });
    expect(st.exploration).toEqual({ record: { hits: 0, misses: 0 } });
    expect(st.plans).toEqual({ round: 1, booked: [], report: [] });
    expect(st.forecasts).toEqual(s.forecasts);
    // Weiterspielen geht, auch mit Erkundung.
    const ziel = unbekannt(st);
    const weiter = endRound(ok(bookCard(st, balance, katalog, 'ritt', ziel)), balance, katalog);
    expect(nonFiniteNumbers(weiter)).toEqual([]);
  });

  it('Wissensstand, Geologe und Brett überstehen Sichern und Laden', () => {
    let state = newGame('sichern', balance, katalog);
    state = ok(bookCard(state, balance, katalog, 'geologe_einstellen'));
    state = ok(bookCard(state, balance, katalog, 'ritt', unbekannt(state)));
    const geladen = deserializeGame(serializeGame(state, 'test'));
    expect(geladen.ok && geladen.state).toEqual(state);
  });
});
