// Mr. Vale und das Konsortium (4.17, GDD §12 „Das Konsortium – der rote Faden“,
// Weltbibel: Mr. Vale). Kapitel 3: Einladung auf ein Schloss in Aldmark – Beitritt
// zum Weltkartell „Wie es ist“ (nach dem Achnacarry-Abkommen von 1928).
//
// Drei Wege (GDD §12):
//   - annehmen (mitglied): Anteil am Kartellgewinn je Runde, Seismik-Lizenz umsonst,
//     Zugang zu den Projekten des Konsortiums, geringeres Projektrisiko – dafür
//     verlangt Vale regelmäßig Gefallen. Wer zu oft verweigert, fliegt hinaus.
//   - ablehnen: keine Vorteile, keine Gefallen.
//   - ausspielen (doppelspiel): nehmen, ohne zu geben – mehr Geld (Insiderwissen),
//     Gefallen lassen sich vortäuschen. Jede Runde kann es auffliegen, und die
//     Gefahr wächst. Fliegt es auf: Rauswurf, Ansehen weg, Macht des Konsortiums
//     sinkt (Licht der Öffentlichkeit, Vales größte Angst).
// Rauswurf (verstossen): Das Konsortium drückt eine Weile Jacobs Preise
// (expelledPenalty je Runde beim Trendpreis; 0.4.20+9: skaliert mit dem Posted Price, expelledCost).
// In jeder Krise: Rettung gegen Kontrolle (GDD §12) – in der Pleitefrist bietet
// Vale Geld; wer annimmt, ist Mitglied unter Aufsicht (Gefallen öfter).
//
// Vales Vertrauen (trust) und die Macht des Konsortiums (power) sind 0–100.
// Die Macht wirkt über konsortiumWorldInput aufs Weltmodell (4.1-Andockpunkt).

import type { Balance } from './balance';
import type { GameState } from './game';
import { begin, clamp, kapitel3Of, kapitelRound, note, withRng, type Kapitel3Result, type Kapitel3State, type KonsortiumPath } from './kapitel3';
import { adjustAnsehen } from './stand';

export type InvitationChoice = 'annehmen' | 'ablehnen' | 'ausspielen';
export type FavorChoice = 'erfuellen' | 'verweigern' | 'vortaeuschen';

/** Mitglied im Sinne der Vorteile: offen oder heimlich. */
export function isMember(k3: Pick<Kapitel3State, 'konsortium'>): boolean {
  return k3.konsortium.path === 'mitglied' || k3.konsortium.path === 'doppelspiel';
}

/** Vales Vertrauen als Wort (nie als Zahl sichtbar). */
export function trustWord(k3: Pick<Kapitel3State, 'konsortium'>, balance: Balance): 'niedrig' | 'mittel' | 'hoch' {
  const [mittel, hoch] = balance.kapitel3.konsortium.trustWords;
  const t = k3.konsortium.trust;
  return t >= hoch ? 'hoch' : t >= mittel ? 'mittel' : 'niedrig';
}

/** Liegt Vales Einladung offen auf dem Tisch? */
export function invitationOpen(k3: Pick<Kapitel3State, 'konsortium'>): boolean {
  return k3.konsortium.invitedRound > 0 && k3.konsortium.path === null;
}

/** Antworten auf einen Gefallen: Vortäuschen geht nur im Doppelspiel. */
export function favorChoices(k3: Pick<Kapitel3State, 'konsortium'>): FavorChoice[] {
  return k3.konsortium.path === 'doppelspiel' ? ['erfuellen', 'verweigern', 'vortaeuschen'] : ['erfuellen', 'verweigern'];
}

function mitMacht(k3: Kapitel3State, delta: number): Kapitel3State {
  return { ...k3, konsortium: { ...k3.konsortium, power: clamp(k3.konsortium.power + delta, 0, 100) } };
}

function mitVertrauen(k3: Kapitel3State, delta: number): Kapitel3State {
  return { ...k3, konsortium: { ...k3.konsortium, trust: clamp(k3.konsortium.trust + delta, 0, 100) } };
}

/**
 * Hinauswurf. base: ab dieser Runde zählt der Preisdruck (expelledRounds Runden).
 * aufgeflogen: das Doppelspiel ist entdeckt – Ansehen und Macht leiden.
 */
export function expel(k3: Kapitel3State, balance: Balance, round: number, base: number, aufgeflogen: boolean): Kapitel3State {
  const b = balance.kapitel3;
  let out: Kapitel3State = {
    ...k3,
    konsortium: { ...k3.konsortium, path: 'verstossen', favor: null, controlled: false, doubleSince: 0, pressureUntil: base + b.konsortium.expelledRounds },
  };
  if (aufgeflogen) {
    out = adjustAnsehen(mitMacht({ ...out, konsortium: { ...out.konsortium, trust: 0 } }, b.konsortium.power.exposed), b.stand.exposed);
  }
  return note(out, { round, key: aufgeflogen ? 'aufgeflogen' : 'verstossen' });
}

export function answerInvitation(input: GameState, balance: Balance, choice: InvitationChoice): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const kb = balance.kapitel3;
  if (k3.konsortium.invitedRound === 0) return { ok: false, reason: 'keine_einladung' };
  if (k3.konsortium.path !== null) return { ok: false, reason: 'schon_entschieden' };
  const r = state.round;
  let k: Kapitel3State;
  if (choice === 'annehmen' || choice === 'ausspielen') {
    const path: KonsortiumPath = choice === 'annehmen' ? 'mitglied' : 'doppelspiel';
    k = { ...k3, konsortium: { ...k3.konsortium, path, lastFavorRound: r, doubleSince: path === 'doppelspiel' ? r : 0 } };
    k = adjustAnsehen(mitMacht(k, choice === 'annehmen' ? kb.konsortium.power.join : kb.konsortium.power.double), kb.stand.member);
    k = note(k, { round: r, key: choice === 'annehmen' ? 'beitritt' : 'doppelspiel' });
  } else {
    k = note(mitMacht({ ...k3, konsortium: { ...k3.konsortium, path: 'abgelehnt' } }, kb.konsortium.power.refuse), { round: r, key: 'absage' });
  }
  return { ok: true, state: { ...state, kapitel3: k } };
}

/** Verweigern (auch: Frist verstrichen). Fällt das Vertrauen unter die Schwelle, fliegt Jacob hinaus. */
function refuse(k3: Kapitel3State, balance: Balance, round: number, base: number, key: 'gefallen_verweigert' | 'gefallen_verfallen'): Kapitel3State {
  const kb = balance.kapitel3.konsortium;
  const id = k3.konsortium.favor?.id ?? '';
  let k = mitVertrauen({ ...k3, konsortium: { ...k3.konsortium, favor: null, favorsRefused: k3.konsortium.favorsRefused + 1 } }, kb.refuseTrust);
  k = note(k, { round, key, vars: { gefallen: id } });
  return k.konsortium.trust < kb.expelBelow ? expel(k, balance, round, base, false) : k;
}

export function answerFavor(input: GameState, balance: Balance, choice: FavorChoice): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const kb = balance.kapitel3.konsortium;
  const favor = k3.konsortium.favor;
  if (!favor) return { ok: false, reason: 'kein_gefallen' };
  if (!favorChoices(k3).includes(choice)) return { ok: false, reason: 'falsche_wahl' };
  const def = kb.favors.find((f) => f.id === favor.id);
  const r = state.round;
  if (choice === 'verweigern') return { ok: true, state: { ...state, kapitel3: refuse(k3, balance, r, r, 'gefallen_verweigert') } };
  if (choice === 'vortaeuschen') {
    // Vale glaubt es – vorerst. Die Gefahr bleibt und wächst.
    let k = mitVertrauen({ ...k3, konsortium: { ...k3.konsortium, favor: null, suspicion: k3.konsortium.suspicion + kb.feignDetect } }, kb.complyTrust);
    k = note(k, { round: r, key: 'gefallen_vorgetaeuscht', vars: { gefallen: favor.id } });
    return { ok: true, state: { ...state, kapitel3: k } };
  }
  const cost = def?.cash ?? 0;
  if (state.cash < cost) return { ok: false, reason: 'geld' };
  let k = mitVertrauen({ ...k3, konsortium: { ...k3.konsortium, favor: null, favorsDone: k3.konsortium.favorsDone + 1 } }, kb.complyTrust);
  k = adjustAnsehen(k, def?.ansehen ?? 0);
  k = note(k, { round: r, key: 'gefallen_erfuellt', vars: { gefallen: favor.id, betrag: cost } });
  return { ok: true, state: { ...state, cash: state.cash - cost, kapitel3: k } };
}

/** Bietet Vale gerade Rettung an? Nur in der Pleitefrist, einmal, und nicht nach dem Rauswurf. */
export function rescueAvailable(state: GameState, balance: Balance): boolean {
  const k3 = kapitel3Of(state, balance);
  return !!k3 && !state.finished && state.bankruptcyDeadline > 0 && !k3.konsortium.rescueUsed && k3.konsortium.path !== 'verstossen';
}

export function acceptRescue(input: GameState, balance: Balance): Kapitel3Result {
  if (!rescueAvailable(input, balance)) return { ok: false, reason: 'keine_rettung' };
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const kb = balance.kapitel3.konsortium;
  const r = state.round;
  const k: Kapitel3State = note(
    {
      ...k3,
      konsortium: {
        ...k3.konsortium,
        // Wer noch keine Einladung hatte, braucht keine mehr.
        invitedRound: k3.konsortium.invitedRound || r,
        path: 'mitglied',
        trust: kb.rescue.trust,
        controlled: true,
        rescueUsed: true,
        doubleSince: 0,
        lastFavorRound: r,
      },
    },
    { round: r, key: 'rettung', vars: { betrag: kb.rescue.cash } },
  );
  return { ok: true, state: { ...state, cash: state.cash + kb.rescue.cash, kapitel3: k } };
}

/** 0.4.20+9: Preisdruck je Runde nach dem Rauswurf – expelledPenalty × Posted Price ÷ Trendpreis (market.basePrice). */
export function expelledCost(state: Pick<GameState, 'postedPrice'>, balance: Balance): number {
  return Math.round((balance.kapitel3.konsortium.expelledPenalty * state.postedPrice) / balance.market.basePrice);
}

/** Chance, dass das Doppelspiel in dieser Runde auffliegt. */
export function detectionChance(k3: Kapitel3State, balance: Balance, round: number): number {
  const kb = balance.kapitel3.konsortium;
  if (k3.konsortium.path !== 'doppelspiel') return 0;
  return clamp(kb.doubleDetect + kb.doubleDetectGrowth * Math.max(0, round - k3.konsortium.doubleSince) + k3.konsortium.suspicion, 0, 1);
}

/**
 * Rundenende (state.round = r, die nächste Runde ist r + 1): verstrichene Fristen,
 * Preisdruck nach dem Rauswurf, Kartellgewinn, Entdeckung im Doppelspiel, dann
 * Einladung und Gefallen für die neue Runde. Gibt den neuen Zustand und die
 * Geldänderung zurück.
 */
export function settleKonsortium(state: GameState, balance: Balance, input: Kapitel3State): [Kapitel3State, number] {
  const kb = balance.kapitel3.konsortium;
  const r = state.round;
  const next = r + 1;
  let k = input;
  let cash = 0;

  // Schweigen gilt als Absage.
  if (invitationOpen(k) && r >= k.konsortium.inviteDeadline) {
    k = note(mitMacht({ ...k, konsortium: { ...k.konsortium, path: 'abgelehnt' } }, kb.power.refuse), { round: r, key: 'einladung_verfallen' });
  }
  // Ein Gefallen ohne Antwort ist verweigert.
  if (k.konsortium.favor && r >= k.konsortium.favor.deadline) k = refuse(k, balance, r, next, 'gefallen_verfallen');

  // Preisdruck nach dem Rauswurf.
  if (k.konsortium.path === 'verstossen' && r < k.konsortium.pressureUntil) {
    const druck = expelledCost(state, balance);
    cash -= druck;
    k = note(k, { round: r, key: 'preisdruck', vars: { betrag: druck } });
  }

  if (k.konsortium.path === 'mitglied') {
    cash += kb.memberIncome;
    k = note(k, { round: r, key: 'kartellgewinn', vars: { betrag: kb.memberIncome } });
  } else if (k.konsortium.path === 'doppelspiel') {
    cash += kb.doubleIncome;
    k = note(k, { round: r, key: 'insidergewinn', vars: { betrag: kb.doubleIncome } });
    const chance = detectionChance(k, balance, r);
    const [u, k2] = withRng(k, (rng) => rng.float());
    k = u < chance ? expel(k2, balance, r, next, true) : k2;
  }

  // Die Einladung kommt zur neuen Runde.
  if (k.konsortium.invitedRound === 0 && k.konsortium.path === null && kapitelRound(k, next) >= kb.inviteRound) {
    k = note({ ...k, konsortium: { ...k.konsortium, invitedRound: next, inviteDeadline: next + kb.inviteDeadline - 1 } }, { round: next, key: 'einladung' });
  }
  // Vale verlangt einen Gefallen.
  const every = k.konsortium.controlled ? kb.favorEveryControlled : kb.favorEvery;
  if (isMember(k) && !k.konsortium.favor && next - k.konsortium.lastFavorRound >= every) {
    const [def, k2] = withRng(k, (rng) => rng.pick(kb.favors));
    k = note(
      { ...k2, konsortium: { ...k2.konsortium, favor: { id: def.id, round: next, deadline: next + kb.favorDeadline - 1 }, lastFavorRound: next } },
      { round: next, key: 'gefallen', vars: { gefallen: def.id } },
    );
  }
  return [k, cash];
}

/** Wirkung des Konsortiums aufs Weltmodell (4.1 WorldInput): Macht über 50 schürt Spannung und Kreditrausch, drückt die Stimmung. */
export function konsortiumWorldInput(state: GameState, balance: Balance): { tensionShift: number; creditShift: number; moodShift: number } {
  const k3 = state.kapitel3;
  if (!k3) return { tensionShift: 0, creditShift: 0, moodShift: 0 };
  const w = balance.kapitel3.konsortium.worldInput;
  const over = k3.konsortium.power - 50;
  return { tensionShift: over * w.tension, creditShift: over * w.credit, moodShift: over * w.mood };
}
