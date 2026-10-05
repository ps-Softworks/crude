// Weichen statt Alltagspost (Spielspaß-Durchgang, Kapitel 1): Ein Tester fand die Briefe
// langweilig – Philipp: „entweder wirklich relevante oder keine“. Kapitel 1 hat darum nur noch
// wenige Ereignisse, und jedes stellt eine Weiche, die bis zum Kapitelende sichtbar wirkt.
// Neben Geld und Merkzeichen kann eine Antwort dafür:
//
//   lasting: true              befristete Wirkungen (price, production, leaseCost) gelten bis
//                              zum Kapitelende statt events.timedRounds Runden
//   land: { figure, royalty }  Jacob bekommt die Pacht auf der Ranch dieser Figur (content/map.yaml)
//                              ohne Bonus, bis Kapitelende, mit diesem Förderzins (fehlt: der übliche)
//   rig: steam | rods          Silas' Turm (sonst Jacobs erster Turm) bekommt Dampfmaschine bzw.
//                              Stahlgestänge geschenkt
//
// Dazu liest die Simulation ein Merkzeichen: ruth_teilhaberin – mit Ruths Unterschrift gibt die
// Bank mehr Rahmen (weichen.ruthCredit). Zahlen in balance.yaml unter weichen.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import type { GameState } from './game';
import { leaseOf, leaseTerms, parcelLabel, type Lease } from './lease';
import { SILAS_RIG } from './rigs';

/** Merkzeichen, die die Simulation aus den Weichen liest. */
export const WEICHEN_MARKS = {
  /** Ruth steht mit auf den Urkunden: die Bank gibt mehr Rahmen. */
  ruthPartner: 'ruth_teilhaberin',
} as const;

export type RigGift = 'steam' | 'rods';
export const RIG_GIFTS: readonly RigGift[] = ['steam', 'rods'];

export interface LandGrant {
  /** Figur aus content/map.yaml (moss, pruitt, hale), deren Ranch Jacob pachtet. */
  figure: string;
  /** Förderzins; fehlt er, gilt der übliche der Ranch. */
  royalty?: number;
}

/** Runden, die eine Wirkung „bis Kapitelende“ noch gilt (die laufende mitgezählt). */
export function roundsToChapterEnd(state: Pick<GameState, 'round' | 'totalRounds'>): number {
  return Math.max(1, state.totalRounds - state.round + 1);
}

/**
 * Pacht auf der Ranch einer Figur ohne Bonus, bis Kapitelende. Pachtet Jacob dort schon, gelten die
 * besseren Bedingungen für seine Pacht. Geht nicht (Protokoll sagt warum), wenn die Ranch fehlt oder
 * ein anderer sie gepachtet hat.
 */
export function grantLand(state: GameState, balance: Balance, grant: LandGrant): GameState {
  const parcel = state.parcels.find((p) => p.figure === grant.figure && state.regions.includes(p.region));
  if (!parcel) return state;
  const name = parcelLabel(parcel);
  const vorhanden = leaseOf(state, parcel.id);
  // Pachtet Jacob dort schon, gelten die besseren Bedingungen für seine Pacht (bis Kapitelende, niedrigerer Förderzins).
  if (vorhanden && vorhanden.holder === 'jacob') {
    const royalty = Math.min(vorhanden.royalty, grant.royalty ?? vorhanden.royalty);
    const leases = state.leases.map((x) => (x === vorhanden ? { ...x, royalty, expiresAfterRound: Math.max(x.expiresAfterRound, state.totalRounds) } : x));
    const zins = Math.round(royalty * 1000) / 10;
    return { ...state, leases, log: [...state.log, `${formatDate(state)}: Jacobs Pacht auf ${name} gilt jetzt bis Kapitelende zum Förderzins von ${zins.toLocaleString('de-DE')} %.`] };
  }
  if (vorhanden || state.rival.wells.some((w) => w.parcelId === parcel.id)) {
    return { ...state, log: [...state.log, `${formatDate(state)}: ${name} ist schon verpachtet – das Angebot läuft ins Leere.`] };
  }
  const lease: Lease = {
    parcelId: parcel.id,
    holder: 'jacob',
    bonus: 0,
    royalty: grant.royalty ?? leaseTerms(state, balance, parcel.id).royalty,
    startRound: state.round,
    expiresAfterRound: state.totalRounds,
    drilled: false,
  };
  const zins = Math.round(lease.royalty * 1000) / 10;
  return {
    ...state,
    options: state.options.filter((o) => o.parcelId !== parcel.id),
    leases: [...state.leases, lease],
    log: [...state.log, `${formatDate(state)}: Jacob pachtet ${name} ohne Bonus bis Kapitelende (Förderzins ${zins.toLocaleString('de-DE')} %).`],
  };
}

/** Silas' Turm (sonst der erste) bekommt Dampfmaschine oder Stahlgestänge geschenkt. */
export function giftRig(state: GameState, gift: RigGift): GameState {
  const ziel = state.rigs.find((r) => r.id === SILAS_RIG) ?? state.rigs[0];
  if (!ziel || ziel[gift]) return state;
  const was = gift === 'steam' ? 'eine Dampfmaschine' : 'Stahlgestänge';
  return {
    ...state,
    rigs: state.rigs.map((r) => (r.id === ziel.id ? { ...r, [gift]: true } : r)),
    log: [...state.log, `${formatDate(state)}: Der Turm bekommt ${was} – ohne dass Jacob dafür bezahlt.`],
  };
}

/** Faktor auf den Bankrahmen: in Kapitel 1 (nicht im Zeitsprung danach) mit Ruths Unterschrift weichen.ruthCredit, sonst 1. */
export function weichenCreditFactor(state: Partial<Pick<GameState, 'events' | 'chapter' | 'round' | 'totalRounds'>>, balance: Balance): number {
  if (chapterOf(state) !== 1) return 1;
  if (state.round !== undefined && state.totalRounds !== undefined && state.round > state.totalRounds) return 1;
  return state.events?.marks[WEICHEN_MARKS.ruthPartner] !== undefined ? balance.weichen.ruthCredit : 1;
}
