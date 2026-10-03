// Termine und Kraft (2.3, GDD §3 und §4): Jede Runde hat eine feste Zahl an
// Terminen. Wer mehr will, macht Überstunden – bis zu maxOvertime extra, jede
// kostet Kraft. Eine Runde ohne Überstunden gibt Kraft zurück. Unter
// tiredBelow gibt es weniger Termine: Müdigkeit frisst Zeit.
//
// Die Zahl der Termine einer Runde wird am Rundenanfang festgelegt (budget), damit
// eine Überstunde, die Jacob mitten in der Runde unter die Schwelle drückt, nicht
// rückwirkend aus normalen Terminen Überstunden macht. Kein Zufall hier.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';

export interface AgendaState {
  /** Termine dieser Runde ohne Überstunden (am Rundenanfang festgelegt). */
  budget: number;
  /** Schon belegte Termine dieser Runde, Überstunden eingeschlossen. */
  used: number;
  /** Feste Termine (routine), die Jacob in dieser Runde schon wahrgenommen hat. */
  done: string[];
}

type Zeit = Pick<GameState, 'agenda' | 'strength'>;

/** Termine je Runde bei dieser Kraft: unter der Müdigkeitsschwelle weniger. */
export function budgetFor(strength: number, balance: Balance): number {
  const a = balance.agenda;
  return strength < a.tiredBelow ? a.appointments - a.tiredPenalty : a.appointments;
}

export function newAgenda(strength: number, balance: Balance): AgendaState {
  return { budget: budgetFor(strength, balance), used: 0, done: [] };
}

/** Wie viele Termine noch gehen, Überstunden eingeschlossen. */
export function appointmentsLeft(state: Zeit, balance: Balance): number {
  return Math.max(0, state.agenda.budget + balance.agenda.maxOvertime - state.agenda.used);
}

/** Wie viele Überstunden in dieser Runde schon gemacht sind. */
export function overtimeUsed(state: Zeit): number {
  return Math.max(0, state.agenda.used - state.agenda.budget);
}

/** Wie viele der nächsten n Termine Überstunden wären. */
export function overtimeFor(state: Zeit, n: number): number {
  return Math.max(0, state.agenda.used + n - state.agenda.budget) - overtimeUsed(state);
}

/** Warum n Termine nicht mehr gehen, oder null, wenn sie gehen. */
export function timeReason(state: Zeit, balance: Balance, n: number): string | null {
  const frei = appointmentsLeft(state, balance);
  if (n <= frei) return null;
  if (frei === 0) return 'Dafür fehlt die Zeit: Alle Termine und Überstunden sind belegt.';
  return `Dafür fehlt die Zeit (${n} Termine nötig, nur noch ${frei} frei).`;
}

export type SpendResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Belegt n Termine. Was über die Termine der Runde hinausgeht, sind
 * Überstunden: jede kostet overtimeCost Kraft (nie unter 0).
 */
export function spendAppointments(state: GameState, balance: Balance, n: number): SpendResult {
  const reason = timeReason(state, balance, n);
  if (reason) return { ok: false, reason };
  if (n === 0) return { ok: true, state };
  const extra = overtimeFor(state, n);
  const strength = Math.max(0, state.strength - extra * balance.agenda.overtimeCost);
  const log =
    extra > 0
      ? [...state.log, `${formatDate(state)}: Überstunden – Jacob arbeitet bis tief in die Nacht.`]
      : state.log;
  return { ok: true, state: { ...state, strength, log, agenda: { ...state.agenda, used: state.agenda.used + n } } };
}

/**
 * Rundenende: Nach einer Runde ohne Überstunden kommt Jacob wieder zu Kräften
 * (restBonus, höchstens bis strengthMax). Dann beginnt die nächste Runde mit
 * frischen Terminen – so vielen, wie die Kraft jetzt hergibt.
 */
export function settleAgenda(state: GameState, balance: Balance): GameState {
  const ruhig = overtimeUsed(state) === 0;
  const strength = ruhig ? Math.min(state.strengthMax, state.strength + balance.agenda.restBonus) : state.strength;
  const log =
    strength > state.strength
      ? [...state.log, `${formatDate(state)}: Eine ruhige Runde – Jacob kommt wieder zu Kräften.`]
      : state.log;
  return { ...state, strength, log, agenda: newAgenda(strength, balance) };
}

/**
 * Wie Jacob wirkt, in einem Wort. Kraft ist nie als Zahl sichtbar (GDD §4) –
 * die Oberfläche zeigt nur das.
 */
export function strengthWord(state: Pick<GameState, 'strength' | 'strengthMax'>, balance: Balance): string {
  if (state.strength < balance.agenda.tiredBelow * 0.6) return 'erschöpft';
  if (state.strength < balance.agenda.tiredBelow) return 'müde';
  if (state.strength < state.strengthMax * 0.8) return 'angespannt';
  return 'ausgeruht';
}

/** Was die Kopfzeile über die Termine der Runde zeigt. */
export interface AgendaView {
  /** Termine der Runde ohne Überstunden. */
  budget: number;
  /** Davon belegt. */
  used: number;
  /** Überstunden: möglich und schon gemacht. */
  overtimeMax: number;
  overtimeUsed: number;
  /** Termine und Überstunden, die noch gehen. */
  left: number;
  /** Jacobs Zustand in einem Wort. */
  word: string;
  /** Müdigkeit kostet gerade Termine. */
  tired: boolean;
}

export function agendaView(state: GameState, balance: Balance): AgendaView {
  return {
    budget: state.agenda.budget,
    used: Math.min(state.agenda.used, state.agenda.budget),
    overtimeMax: balance.agenda.maxOvertime,
    overtimeUsed: overtimeUsed(state),
    left: appointmentsLeft(state, balance),
    word: strengthWord(state, balance),
    tired: state.agenda.budget < balance.agenda.appointments,
  };
}

/** Was eine Antwort an Zeit kostet, in Worten: „1 Termin“, „2 Termine, davon 1 Überstunde“, „ohne Termin“. */
export function costLabel(cost: number, overtime: number): string {
  if (cost === 0) return 'ohne Termin';
  const termine = cost === 1 ? '1 Termin' : `${cost} Termine`;
  if (overtime === 0) return termine;
  if (overtime === cost) return cost === 1 ? '1 Überstunde' : `${cost} Überstunden`;
  return `${termine}, davon ${overtime === 1 ? '1 Überstunde' : `${overtime} Überstunden`}`;
}
