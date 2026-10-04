// Crane-Nachfolge (4.10, GDD §13 Kapitel 2): Cornelius Crane zieht sich zurück,
// Margaret Crane (modern, Marke und Vertrieb) und Harold Pruett (Kostenkürzer) ringen
// succession.rounds Runden um den Aufsichtsrat – im Trust oder, wenn der Staat ihn
// zerschlägt, als eigene Firmen (Crane Eastern und Crane Midland).
//
// Margarets Anteil im Aufsichtsrat bewegt sich je Runde:
//   Anteil += creditDrift · (Kreditklima − 50) / 50 + (Zufall − 0,5) · noise
// – ein Boom hilft der Modernen, eine Krise dem Kostenkürzer. Jacob kann sich einmal je
// Runde öffentlich hinter einen Erben stellen (Geld, Termin): backShift × Respekt-Faktor.
//
// Zerschlagung (GDD §7.2): Druck sammelt sich je Runde aus Kartellgesetz, Volksbund-
// Regierung und Unmut; ohne Anlass sinkt er. Ohne Kartellgesetz bleibt er unter 1.
// Jacob kann anschieben (Unterlagen an die Presse) oder bremsen (Freunde in Hallstead).
// Ab 1 wird der Trust zerschlagen – das Ringen ist dann vorbei.
//
// Was danach gilt (je Runde, über diplomacyEffects):
//   Margaret führt  → Partner (Vertrauen ≥ partnerTrust) bekommen margaretPremium $ je Barrel mehr
//   Pruett führt    → alle bekommen pruettCut weniger, außer mit Preisabsprache mit Pruett
//   zerschlagen     → beide Nachfolgefirmen bieten um Öl: breakupPremium mehr

import type { Balance } from './balance';
import { formatDate } from './calendar';
import {
  changeRelation,
  DIPLO_MARKS,
  diplomacyWorld,
  hasDiplomacy,
  HEIRS,
  LOG_NAMES,
  remember,
  round2,
  setMark,
  type DiploGame,
  type DiploReason,
  type DiploResult,
  type DiplomacyState,
  type Heir,
  type SuccessionOutcome,
  type SuccessionState,
} from './diplomacyCore';
import { spendAppointments } from './agenda';
import type { GameState } from './game';
import type { Rng } from './rng';

export function newSuccession(balance: Balance, round: number): SuccessionState {
  const s = balance.diplomacy.succession;
  return {
    share: s.startShare,
    endRound: round + s.rounds - 1,
    backed: { margaret: 0, pruett: 0 },
    lastBack: 0,
    breakup: 0,
    pushedFor: 0,
    pushedAgainst: 0,
    lastPush: 0,
    outcome: null,
    decidedRound: 0,
  };
}

function other(heir: Heir): Heir {
  return heir === 'margaret' ? 'pruett' : 'margaret';
}

function clampShare(share: number): number {
  return round2(Math.min(0.98, Math.max(0.02, share)));
}

/** Wie viel Jacobs Wort im Aufsichtsrat wiegt: 0,5 bei Respekt 0 … 1,5 bei Respekt 100. */
export function respectFactor(d: Pick<DiplomacyState, 'respect'>): number {
  return 0.5 + d.respect / 100;
}

/** Zerschlagungsdruck nach dieser Runde (ohne Jacobs Zutun). */
export function breakupPressure(state: GameState, balance: Balance, current: number): number {
  const b = balance.diplomacy.succession.breakup;
  const w = diplomacyWorld(state);
  const unmut = Math.max(0, (50 - w.mood) / 50);
  const zufluss = (w.antitrustLaw ? b.law : 0) + (w.government === 'volksbund' ? b.volksbund : 0) + unmut * b.mood;
  let p = current + zufluss - (zufluss === 0 ? b.decay : 0);
  p = Math.max(0, p);
  if (!w.antitrustLaw) p = Math.min(p, b.maxWithoutLaw);
  return round2(p);
}

/** Sitze im Aufsichtsrat, die hinter Margaret stehen (Anzeige). */
export function margaretSeats(d: Pick<DiplomacyState, 'succession'>, balance: Balance): number {
  return Math.round(d.succession.share * balance.diplomacy.succession.boardSeats);
}

/** Die Entscheidung fällt: Merkzeichen, Protokoll, Beziehungen (GDD §9.3: Gedächtnis). */
function decide(state: DiploGame, balance: Balance, outcome: SuccessionOutcome): DiploGame {
  const s = balance.diplomacy.succession;
  let d: DiplomacyState = { ...state.diplomacy, succession: { ...state.diplomacy.succession, outcome, decidedRound: state.round } };
  const date = formatDate(state);
  const log = [...state.log];
  const { backed } = d.succession;
  if (outcome === 'zerschlagen') {
    log.push(`${date}: Das Gericht zerschlägt den Crane Trust. Margaret Crane führt Crane Eastern, Harold Pruett Crane Midland.`);
    if (d.succession.pushedFor > 0) {
      for (const h of HEIRS) d = changeRelation(d, h, { grudge: s.loserGrudge });
      d = changeRelation(d, 'delgado', { trust: s.winnerTrust });
    }
    if (d.succession.pushedAgainst > 0) d = changeRelation(d, 'delgado', { grudge: s.loserGrudge });
  } else {
    const loser = other(outcome);
    log.push(
      outcome === 'margaret'
        ? `${date}: Margaret Crane gewinnt den Aufsichtsrat und führt den Crane Trust. Harold Pruett bleibt im Mittleren Westen.`
        : `${date}: Harold Pruett gewinnt den Aufsichtsrat und führt den Crane Trust. Margaret Crane behält nur Crane Eastern.`,
    );
    if (backed[outcome] > 0 && backed[loser] > 0) {
      // Doppeltes Spiel: Beide haben es gemerkt.
      for (const h of HEIRS) d = changeRelation(d, h, { trust: -s.doubleGameTrust });
      log.push(`${date}: Beide wissen, dass du ihnen beiden zugesagt hast.`);
    } else if (backed[outcome] > 0) {
      d = remember(changeRelation(d, outcome, { trust: s.winnerTrust }), outcome, 'gefallen', state.round);
      d = changeRelation(d, loser, { grudge: s.loserGrudge });
    } else if (backed[loser] > 0) {
      d = changeRelation(d, outcome, { grudge: s.loserGrudge });
    }
  }
  const mark = outcome === 'margaret' ? DIPLO_MARKS.heirMargaret : outcome === 'pruett' ? DIPLO_MARKS.heirPruett : DIPLO_MARKS.breakup;
  return setMark({ ...state, log, diplomacy: d }, mark);
}

/**
 * Rundenschritt der Nachfolge (am Rundenende): erst der Zerschlagungsdruck, dann der
 * Aufsichtsrat; am Ende der letzten Runde entscheidet die Mehrheit (Gleichstand: Margaret).
 * Zieht immer genau einen Zufallswert, solange das Ringen läuft.
 */
export function advanceSuccession(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const s0 = state.diplomacy.succession;
  if (s0.outcome !== null) return state;
  const zufall = rng.float();
  const breakup = breakupPressure(state, balance, s0.breakup);
  const b = balance.diplomacy.succession;
  const w = diplomacyWorld(state);
  const share = clampShare(s0.share + (b.creditDrift * (w.credit - 50)) / 50 + (zufall - 0.5) * b.noise);
  const next: DiploGame = { ...state, diplomacy: { ...state.diplomacy, succession: { ...s0, breakup, share } } };
  if (breakup >= 1) return decide(next, balance, 'zerschlagen');
  if (state.round >= s0.endRound) return decide(next, balance, share >= 0.5 ? 'margaret' : 'pruett');
  return next;
}

/** Wer den Trust (bzw. dessen Hauptteil) führt; null, solange das Ringen läuft. */
export function successionOutcome(state: GameState): SuccessionOutcome | null {
  return state.diplomacy?.succession.outcome ?? null;
}

/** Warum Jacob sich gerade nicht hinter einen Erben stellen kann, oder null. */
export function backReason(state: GameState, balance: Balance): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const s = state.diplomacy.succession;
  if (s.outcome !== null) return 'entschieden';
  if (s.lastBack === state.round) return 'schon';
  if (state.cash < balance.diplomacy.succession.backCost) return 'geld';
  return null;
}

/**
 * Jacob stellt sich öffentlich hinter Margaret oder Pruett (einmal je Runde):
 * kostet backCost $ und backAppointments Termine, verschiebt den Anteil um
 * backShift × Respekt-Faktor. Der andere Erbe nimmt es übel (Groll + 5).
 */
export function backHeir(state: GameState, balance: Balance, heir: Heir): DiploResult {
  const reason = backReason(state, balance);
  if (reason) return { ok: false, reason };
  const b = balance.diplomacy.succession;
  const zeit = spendAppointments(state, balance, b.backAppointments);
  if (!zeit.ok) return { ok: false, reason: 'zeit' };
  const s0 = zeit.state as DiploGame;
  const d0 = s0.diplomacy;
  const shift = b.backShift * respectFactor(d0) * (heir === 'margaret' ? 1 : -1);
  let d: DiplomacyState = {
    ...d0,
    succession: {
      ...d0.succession,
      share: clampShare(d0.succession.share + shift),
      backed: { ...d0.succession.backed, [heir]: d0.succession.backed[heir] + 1 },
      lastBack: state.round,
    },
  };
  d = changeRelation(d, other(heir), { grudge: 5 });
  return {
    ok: true,
    state: {
      ...s0,
      cash: s0.cash - b.backCost,
      diplomacy: d,
      log: [...s0.log, `${formatDate(state)}: Jacob stellt sich öffentlich hinter ${LOG_NAMES[heir]} (${b.backCost.toLocaleString('de-DE')} $).`],
    },
  };
}

/** Warum Jacob die Zerschlagung gerade nicht anschieben/bremsen kann, oder null. */
export function pushReason(state: GameState, balance: Balance): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const s = state.diplomacy.succession;
  if (s.outcome !== null) return 'entschieden';
  if (s.lastPush === state.round) return 'schon';
  if (state.cash < balance.diplomacy.succession.breakup.pushCost) return 'geld';
  return null;
}

/**
 * Zerschlagung anschieben (+1: Unterlagen an Presse und Volksbund) oder bremsen
 * (−1: Freunde in Hallstead). Einmal je Runde, pushCost $ und ein Termin. Ohne
 * Kartellgesetz bleibt der Druck unter maxWithoutLaw. Bremsen freut die Erben
 * (Vertrauen + 5) und ärgert Delgado (Groll + 5).
 */
export function pushBreakup(state: GameState, balance: Balance, dir: 1 | -1): DiploResult {
  const reason = pushReason(state, balance);
  if (reason) return { ok: false, reason };
  const b = balance.diplomacy.succession.breakup;
  const zeit = spendAppointments(state, balance, 1);
  if (!zeit.ok) return { ok: false, reason: 'zeit' };
  const s0 = zeit.state as DiploGame;
  const d0 = s0.diplomacy;
  let breakup = Math.max(0, d0.succession.breakup + dir * b.push);
  if (!diplomacyWorld(s0).antitrustLaw) breakup = Math.min(breakup, b.maxWithoutLaw);
  let d: DiplomacyState = {
    ...d0,
    succession: {
      ...d0.succession,
      breakup: round2(breakup),
      lastPush: state.round,
      pushedFor: d0.succession.pushedFor + (dir > 0 ? 1 : 0),
      pushedAgainst: d0.succession.pushedAgainst + (dir < 0 ? 1 : 0),
    },
  };
  if (dir < 0) {
    for (const h of HEIRS) d = changeRelation(d, h, { trust: 5 });
    d = changeRelation(d, 'delgado', { grudge: 5 });
  }
  const text =
    dir > 0
      ? `${formatDate(state)}: Jacob spielt Unterlagen über den Crane Trust an die Presse und den Volksbund.`
      : `${formatDate(state)}: Jacob bittet Freunde in Hallstead, den Crane Trust in Ruhe zu lassen.`;
  return { ok: true, state: { ...s0, cash: s0.cash - b.pushCost, diplomacy: d, log: [...s0.log, text] } };
}

/** Wie laut die Zerschlagung im Gespräch ist (Anzeige statt Zahl). */
export type BreakupTalk = 'ruhig' | 'geruechte' | 'drohend';

export function breakupTalk(d: Pick<DiplomacyState, 'succession'>): BreakupTalk {
  const p = d.succession.breakup;
  return p >= 0.6 ? 'drohend' : p >= 0.25 ? 'geruechte' : 'ruhig';
}
