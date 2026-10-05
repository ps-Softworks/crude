// Termine und Kraft (2.3, GDD §3 und §4): Jede Runde hat eine feste Zahl an
// Terminen. Wer mehr will, macht Überstunden – bis zu maxOvertime extra, jede
// kostet Kraft. Eine Runde ohne Überstunden gibt Kraft zurück. Unter
// tiredBelow gibt es weniger Termine: Müdigkeit frisst Zeit.
//
// Schwellen (2.7, GDD §4): Unter errorsBelow schleichen sich Fehler ein (die
// besten Antworten fehlen, die Lupe prüft weniger – siehe exhausted). Fällt die
// Kraft am Rundenende unter sickBelow, wird Jacob krank: 1 bis sickRoundsMax
// Runden ohne Termine, je tiefer die Kraft, desto länger. Bei 0 bricht er
// zusammen (collapseRounds). Im Krankenbett kommt er wieder zu Kräften.
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

type Zeit = Pick<GameState, 'agenda' | 'strength' | 'sick'>;

/** Termine je Runde bei dieser Kraft: unter der Müdigkeitsschwelle weniger. */
export function budgetFor(strength: number, balance: Balance): number {
  const a = balance.agenda;
  return strength < a.tiredBelow ? a.appointments - a.tiredPenalty : a.appointments;
}

export function newAgenda(strength: number, balance: Balance, sick = 0): AgendaState {
  return { budget: sick > 0 ? 0 : budgetFor(strength, balance), used: 0, done: [] };
}

/** Wie viele Termine noch gehen, Überstunden eingeschlossen. Krank: keine. */
export function appointmentsLeft(state: Zeit, balance: Balance): number {
  if (state.sick > 0) return 0;
  return Math.max(0, state.agenda.budget + balance.agenda.maxOvertime - state.agenda.used);
}

/** Unter errorsBelow (2.7): Jacob ist so erschöpft, dass sich Fehler einschleichen. */
export function exhausted(state: Pick<GameState, 'strength'>, balance: Balance): boolean {
  return state.strength < balance.agenda.errorsBelow;
}

/** Warum eine beste Antwort (sharp) gerade fehlt, oder null (2.7). */
export function sharpReason(state: Pick<GameState, 'strength'>, balance: Balance): string | null {
  return exhausted(state, balance) ? 'Jacob ist zu erschöpft – diese Antwort fällt ihm gerade nicht ein.' : null;
}

/** Wie lange Jacob bei dieser Kraft krank wird (2.7): 0 = gar nicht. Kein Zufall – je tiefer, desto länger. */
export function sickRoundsFor(strength: number, balance: Balance): number {
  const a = balance.agenda;
  if (strength <= 0) return a.collapseRounds;
  if (strength >= a.sickBelow) return 0;
  const stufe = a.sickBelow / a.sickRoundsMax;
  return Math.min(a.sickRoundsMax, 1 + Math.floor((a.sickBelow - strength) / stufe));
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
  if (n > 0 && state.sick > 0) return 'Jacob liegt krank im Bett – Termine gehen erst wieder, wenn er auf den Beinen ist.';
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
 * Gibt n Termine zurück (Planungsbrett: eine Karte, die noch nicht gewirkt hat,
 * wird zurückgenommen). Waren davon overtime Überstunden, kommt deren Kraft zurück.
 */
export function refundAppointments(state: GameState, balance: Balance, n: number, overtime = 0): GameState {
  if (n <= 0) return state;
  const strength = Math.min(state.strengthMax, state.strength + overtime * balance.agenda.overtimeCost);
  return { ...state, strength, agenda: { ...state.agenda, used: Math.max(0, state.agenda.used - n) } };
}

/**
 * Rundenende: Erst die Krankheit (2.7) – liegt Jacob schon krank, ist eine
 * Runde überstanden und er gewinnt sickRecovery Kraft; sonst wird er krank,
 * wenn die Kraft unter sickBelow liegt (bei 0: Zusammenbruch). Dann gibt eine
 * Runde ohne Überstunden restBonus zurück (höchstens bis strengthMax). Die
 * nächste Runde beginnt mit frischen Terminen – so vielen, wie Kraft und
 * Krankheit hergeben.
 */
export function settleAgenda(state: GameState, balance: Balance): GameState {
  const a = balance.agenda;
  const date = formatDate(state);
  const log = [...state.log];
  let { strength, sick } = state;
  if (sick > 0) {
    sick -= 1;
    strength = Math.min(state.strengthMax, strength + a.sickRecovery);
    log.push(sick > 0 ? `${date}: Jacob hütet weiter das Bett.` : `${date}: Jacob ist wieder auf den Beinen.`);
  } else {
    sick = sickRoundsFor(strength, balance);
    if (sick > 0) {
      const runden = sick === 1 ? 'eine Runde' : `${sick} Runden`;
      log.push(
        strength <= 0
          ? `${date}: Zusammenbruch – Jacob bricht auf dem Bohrplatz zusammen. Der Arzt verordnet Bettruhe für ${runden}.`
          : `${date}: Jacob ist krank. Fieber und Husten – er fällt ${runden} aus.`,
      );
    }
  }
  if (overtimeUsed(state) === 0) {
    const vorher = strength;
    strength = Math.min(state.strengthMax, strength + a.restBonus);
    if (strength > vorher && state.sick === 0 && sick === 0) log.push(`${date}: Eine ruhige Runde – Jacob kommt wieder zu Kräften.`);
  }
  return { ...state, strength, sick, log, agenda: newAgenda(strength, balance, sick) };
}

/** Kraftstufen, wie man sie Jacob ansieht (2.7). */
export const STRENGTH_LEVELS = ['rested', 'tense', 'tired', 'exhausted', 'sick'] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

/** Wie Jacob gerade beisammen ist – die Stufe, nie die Zahl. */
export function strengthLevel(state: Pick<GameState, 'strength' | 'strengthMax' | 'sick'>, balance: Balance): StrengthLevel {
  if (state.sick > 0) return 'sick';
  if (exhausted(state, balance)) return 'exhausted';
  if (state.strength < balance.agenda.tiredBelow) return 'tired';
  if (state.strength < state.strengthMax * 0.8) return 'tense';
  return 'rested';
}

const STUFE: Record<StrengthLevel, string> = {
  rested: 'ausgeruht',
  tense: 'angespannt',
  tired: 'müde',
  exhausted: 'erschöpft',
  sick: 'krank',
};

/**
 * Wie Jacob wirkt, in einem Wort. Kraft ist nie als Zahl sichtbar (GDD §4) –
 * die Oberfläche zeigt nur das.
 */
export function strengthWord(state: Pick<GameState, 'strength' | 'strengthMax' | 'sick'>, balance: Balance): string {
  return STUFE[strengthLevel(state, balance)];
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
  /** Erschöpft (2.7): Fehler schleichen sich ein. */
  exhausted: boolean;
  /** Krank (2.7): keine Termine, noch so viele Runden (diese mitgezählt). */
  sickRounds: number;
}

export function agendaView(state: GameState, balance: Balance): AgendaView {
  return {
    budget: state.agenda.budget,
    used: Math.min(state.agenda.used, state.agenda.budget),
    overtimeMax: balance.agenda.maxOvertime,
    overtimeUsed: overtimeUsed(state),
    left: appointmentsLeft(state, balance),
    word: strengthWord(state, balance),
    tired: state.sick === 0 && state.agenda.budget < balance.agenda.appointments,
    exhausted: state.sick === 0 && exhausted(state, balance),
    sickRounds: state.sick,
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
