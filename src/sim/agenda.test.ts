import { describe, expect, it } from 'vitest';
import {
  agendaView,
  appointmentsLeft,
  budgetFor,
  costLabel,
  settleAgenda,
  spendAppointments,
  strengthWord,
  timeReason,
} from './agenda';
import { nextStep } from './desk';
import type { Well } from './drilling';
import { autoResolve, choiceCost, deskEvents, deskRoutines, drawEvents, resolveEvent, type EventChoice, type EventDef } from './events';
import { familyStrength } from './family';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

function ereignis(id: string, extra: Partial<EventDef> = {}): EventDef {
  return {
    id,
    title: t(`Titel ${id}`),
    text: t('Text'),
    conditions: {},
    marked: [],
    notMarked: [],
    delay: 1,
    chance: 1,
    once: true,
    routine: false,
    appointments: 1,
    choices: [wahl('ja')],
    ...extra,
  };
}

function belegen(state: GameState, n: number): GameState {
  const r = spendAppointments(state, balance, n);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('Termine je Runde (GDD §3)', () => {
  it('die Zahlen kommen aus balance.yaml', () => {
    expect(balance.agenda).toMatchObject({ appointments: 5, maxOvertime: 2, overtimeCost: 5, restBonus: 5, tiredBelow: 50 });
  });

  it('eine neue Partie beginnt mit 5 Terminen und voller Kraft', () => {
    const state = newGame('termine', balance);
    expect(state.agenda).toEqual({ budget: 5, used: 0, done: [] });
    expect(state.strength).toBe(100);
    expect(state.strengthMax).toBe(100);
    expect(appointmentsLeft(state, balance)).toBe(7);
  });

  it('unter 50 Kraft gibt es einen Termin weniger', () => {
    expect(budgetFor(50, balance)).toBe(5);
    expect(budgetFor(49, balance)).toBe(4);
  });

  it('normale Termine kosten keine Kraft, jede Überstunde 5', () => {
    let state = belegen(newGame('ueber', balance), 5);
    expect(state.strength).toBe(100);
    state = belegen(state, 1);
    expect(state.strength).toBe(95);
    expect(state.log.at(-1)).toMatch(/Überstunden/);
    state = belegen(state, 1);
    expect(state.strength).toBe(90);
    expect(appointmentsLeft(state, balance)).toBe(0);
  });

  it('ein Termin, der über die Grenze reicht, zählt nur seinen Überstunden-Teil', () => {
    const state = belegen(belegen(newGame('teil', balance), 4), 2);
    expect(state.strength).toBe(95);
    expect(state.agenda.used).toBe(6);
  });

  it('mehr als 2 Überstunden gehen nicht – mit Grund', () => {
    const voll = belegen(newGame('voll', balance), 7);
    expect(spendAppointments(voll, balance, 1)).toEqual({ ok: false, reason: 'Dafür fehlt die Zeit: Alle Termine und Überstunden sind belegt.' });
    const fast = belegen(newGame('fast', balance), 6);
    expect(timeReason(fast, balance, 2)).toBe('Dafür fehlt die Zeit (2 Termine nötig, nur noch 1 frei).');
    expect(timeReason(fast, balance, 1)).toBeNull();
  });

  it('Kraft fällt nie unter 0', () => {
    const state = belegen({ ...newGame('null', balance), strength: 3 }, 7);
    expect(state.strength).toBe(0);
  });
});

describe('Kraft am Rundenende (GDD §4)', () => {
  it('eine ruhige Runde ohne Überstunden gibt 5 Kraft zurück, höchstens bis zum Maximum', () => {
    const state = belegen({ ...newGame('ruhe', balance), strength: 60 }, 5);
    const nach = settleAgenda(state, balance);
    expect(nach.strength).toBe(65);
    expect(nach.log.at(-1)).toMatch(/ruhige Runde/);
    expect(settleAgenda({ ...newGame('voll', balance), strength: 98 }, balance).strength).toBe(100);
    // Bei voller Kraft gibt es nichts zu melden.
    const frisch = newGame('frisch', balance);
    expect(settleAgenda(frisch, balance).log).toEqual(frisch.log);
  });

  it('nach Überstunden gibt es keine Erholung', () => {
    const state = belegen({ ...newGame('muede', balance), strength: 60 }, 6);
    expect(state.strength).toBe(55);
    expect(settleAgenda(state, balance).strength).toBe(55);
  });

  it('die nächste Runde beginnt mit frischen Terminen – nach der Kraft von jetzt', () => {
    const state = belegen({ ...newGame('neu', balance), strength: 52, agenda: { budget: 5, used: 0, done: ['termin_x'] } }, 7);
    expect(state.strength).toBe(42);
    const nach = settleAgenda(state, balance);
    expect(nach.agenda).toEqual({ budget: 4, used: 0, done: [] });
  });

  it('Überstunden in einer Runde machen die nächste kürzer, wenn die Kraft unter 50 fällt', () => {
    let state: GameState = { ...newGame('kette', balance), strength: 55 };
    state = belegen(state, 7);
    expect(state.strength).toBe(45);
    // Die Müdigkeit wirkt erst ab der nächsten Runde.
    expect(state.agenda.budget).toBe(5);
    state = endRound(state, balance);
    expect(state.round).toBe(2);
    expect(state.agenda).toEqual({ budget: 4, used: 0, done: [] });
    expect(agendaView(state, balance)).toMatchObject({ budget: 4, tired: true, left: 6 });
  });

  it('Jacobs Zustand ist nur ein Wort, keine Zahl', () => {
    const s = newGame('wort', balance);
    expect(strengthWord({ ...s, strength: 100 }, balance)).toBe('ausgeruht');
    expect(strengthWord({ ...s, strength: 70 }, balance)).toBe('angespannt');
    expect(strengthWord({ ...s, strength: 45 }, balance)).toBe('müde');
    expect(strengthWord({ ...s, strength: 10 }, balance)).toBe('erschöpft');
  });

  it('Kosten in Worten', () => {
    expect(costLabel(0, 0)).toBe('ohne Termin');
    expect(costLabel(1, 0)).toBe('1 Termin');
    expect(costLabel(2, 1)).toBe('2 Termine, davon 1 Überstunde');
    expect(costLabel(2, 2)).toBe('2 Überstunden');
  });
});

describe('Ereignisse kosten Termine (2.3)', () => {
  const katalog = [
    ereignis('brief', {
      appointments: 2,
      choices: [wahl('lesen'), wahl('wegwerfen', { appointments: 0, default: true }), wahl('kraft', { effects: { strength: 50 } })],
    }),
  ];
  const start = drawEvents(newGame('kosten', balance), balance, katalog);

  it('eine Antwort belegt die Termine des Ereignisses, eine Wahl kann eigene Kosten haben', () => {
    expect(choiceCost(katalog[0], katalog[0].choices[0])).toBe(2);
    expect(choiceCost(katalog[0], katalog[0].choices[1])).toBe(0);
    const r = resolveEvent(start, balance, katalog, 'brief', 'lesen');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.agenda.used).toBe(2);
    const w = resolveEvent(start, balance, katalog, 'brief', 'wegwerfen');
    expect(w.ok && w.state.agenda.used).toBe(0);
  });

  it('ohne freie Termine geht keine Antwort, die Zeit kostet', () => {
    const voll = belegen(start, 6);
    expect(resolveEvent(voll, balance, katalog, 'brief', 'lesen')).toEqual({ ok: false, reason: 'Dafür fehlt die Zeit (2 Termine nötig, nur noch 1 frei).' });
    expect(resolveEvent(voll, balance, katalog, 'brief', 'wegwerfen').ok).toBe(true);
    const [karte] = deskEvents(voll, balance, katalog);
    expect(karte.choices.map((c) => [c.id, c.cost, c.overtime, c.ok])).toEqual([
      ['lesen', 2, 2, false],
      ['wegwerfen', 0, 0, true],
      ['kraft', 2, 2, false],
    ]);
  });

  it('Kraft als Effekt bleibt zwischen 0 und dem Maximum', () => {
    const r = resolveEvent({ ...start, strength: 80 }, balance, katalog, 'brief', 'kraft');
    expect(r.ok && r.state.strength).toBe(100);
  });

  it('bleibt ein Ereignis liegen, kostet die Standard-Wahl keine Termine', () => {
    const nach = autoResolve(start, katalog);
    expect(nach.agenda.used).toBe(0);
  });

  it('ohne freie Termine weist der nächste Schritt nicht mehr auf das Ereignis hin', () => {
    expect(nextStep(start, balance)?.text).toMatch(/Schreibtisch/);
    expect(nextStep(belegen(start, 7), balance)?.text).not.toMatch(/Schreibtisch/);
  });
});

describe('feste Termine (routine)', () => {
  const termin = ereignis('kaffee', { routine: true, appointments: 1, choices: [wahl('hin', { effects: { cash: 10 } })] });
  const nurMitQuelle = ereignis('rundgang', { routine: true, conditions: { minProducingWells: 1 } });
  const katalog = [termin, nurMitQuelle];

  it('werden nicht gewürfelt, sondern stehen im Kalender, solange die Bedingungen stimmen', () => {
    const state = drawEvents(newGame('routine', balance), balance, katalog);
    expect(state.events.pending).toEqual([]);
    expect(deskRoutines(state, balance, katalog).map((e) => e.id)).toEqual(['kaffee']);
    const mitQuelle = { ...state, wells: [{ status: 'found' } as Well] };
    expect(deskRoutines(mitQuelle, balance, katalog).map((e) => e.id)).toEqual(['kaffee', 'rundgang']);
  });

  it('gehen einmal je Runde und kommen in der nächsten wieder', () => {
    let state = newGame('einmal', balance, katalog);
    const r = resolveEvent(state, balance, katalog, 'kaffee', 'hin');
    if (!r.ok) throw new Error(r.reason);
    state = r.state;
    expect(state.cash).toBe(balance.start.cash + 10);
    expect(state.agenda).toMatchObject({ used: 1, done: ['kaffee'] });
    expect(resolveEvent(state, balance, katalog, 'kaffee', 'hin').ok).toBe(false);
    expect(deskRoutines(state, balance, katalog)).toEqual([]);
    state = endRound(state, balance, katalog);
    expect(deskRoutines(state, balance, katalog).map((e) => e.id)).toEqual(['kaffee']);
  });

  it('bleiben sie liegen, passiert nichts', () => {
    const state = newGame('liegen', balance, katalog);
    const nach = endRound(state, balance, katalog);
    expect(nach.cash).toBe(endRound(newGame('liegen', balance), balance).cash);
  });
});

describe('Fertig-Kriterium 2.3 mit den echten Inhalten', () => {
  const katalog = loadEvents();

  /** Alles, was in dieser Runde Termine kosten würde: feste Termine plus offene Ereignisse (je billigste Wahl mit Zeit). */
  function bedarf(state: GameState): number {
    const termine = deskRoutines(state, balance, katalog).reduce((s, e) => s + Math.min(...e.choices.map((c) => c.cost)), 0);
    const ereignisse = deskEvents(state, balance, katalog).reduce((s, e) => s + Math.max(...e.choices.map((c) => c.cost)), 0);
    return termine + ereignisse;
  }

  it('in jeder Runde gibt es mehr Termine, als selbst mit Überstunden gehen – vor und nach der ersten Quelle', () => {
    const start = newGame('kriterium', balance, katalog);
    const mitQuelle = { ...start, wells: [{ status: 'found' } as Well] };
    for (const state of [start, mitQuelle]) {
      expect(bedarf(state)).toBeGreaterThan(state.agenda.budget + balance.agenda.maxOvertime);
    }
  });

  it('wer mehr will, macht Überstunden: sie kosten Kraft, und irgendwann ist Schluss', () => {
    let state = newGame('gierig', balance, katalog);
    for (const id of ['termin_port_ellis', 'termin_lohnbohren', 'termin_ruth']) {
      const r = resolveEvent(state, balance, katalog, id, katalog.find((e) => e.id === id)!.choices[0].id);
      if (!r.ok) throw new Error(r.reason);
      state = r.state;
    }
    // 3 + 2 Termine sind die Runde, Ruth ist die erste Überstunde.
    expect(state.agenda.used).toBe(6);
    // 100 − 3 (Reise) − 3 (Bohren) − 5 (Überstunde); Ruths Abend gibt erst am Rundenende Kraft (2.7).
    expect(state.strength).toBe(89);
    const [sonntag] = deskRoutines(state, balance, katalog);
    expect(sonntag.id).toBe('termin_sonntag');
    expect(sonntag.choices[0]).toMatchObject({ ok: false, reason: 'Dafür fehlt die Zeit (2 Termine nötig, nur noch 1 frei).' });
    // Nach der Runde keine Erholung (Überstunde) – nur die Familienzeit gibt Kraft (2.7).
    expect(endRound(state, balance, katalog).strength).toBe(89 + familyStrength(state, balance));
  });
});

describe('Sichern und Laden (2.3)', () => {
  it('Termine und Kraft überstehen Sichern und Laden', () => {
    const state = belegen({ ...newGame('sichern', balance), strength: 70 }, 6);
    const geladen = deserializeGame(serializeGame(state, '0.2.3'));
    expect(geladen.ok && geladen.state.agenda).toEqual(state.agenda);
    expect(geladen.ok && geladen.state.strength).toBe(65);
  });

  it('ein Spielstand ohne Termine im neuen Format ist unvollständig', () => {
    const { agenda: _a, ...ohne } = newGame('ohne', balance);
    expect(deserializeGame(JSON.stringify({ format: 3, appVersion: '0.2.3', savedRound: 1, state: ohne })).ok).toBe(false);
  });
});
