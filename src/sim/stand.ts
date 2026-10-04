// Stand – Aufnahme in die Gesellschaft (4.17, GDD §12 „Stand“, Weltbibel:
// Cornelia Vandermeer). Wie bei Sir Brante entscheidet Herkunft über offene
// Türen: Die alten Familien Hallsteads beherrschen Banken, Clubs und Gerichte und
// verachten das Ölgeld. Drei Wege, jeder kostet etwas anderes:
//   - erkaufen: Stiftungen und Spenden – jede bringt weniger als die vorige, und
//     gekauftes Ansehen hat eine Decke (donation.cap);
//   - erheiraten: Thomas heiratet in die Vandermeer-Familie – viel Ansehen, aber
//     Thomas wurde nicht gefragt;
//   - brechen: die Schulden der alten Familien aufkaufen – die Türen gehen auf
//     (Rang wie aufgenommen), aber die Banken geben keinen Rabatt und das Ansehen
//     zählt nicht mehr.
// Aufgenommen ist nur, wer in den Hallstead Union Club kommt (ab club.from Ansehen).
// Ansehen ist intern 0–100 und nie als Zahl sichtbar – nur als Rang und Satz.
// Wirkung: Zinsrabatt der alten Banken (standRateDiscount, Andockpunkt in credit.ts)
// und Zugang zu den großen Konsortialprojekten (minRank).

import type { Balance } from './balance';
import type { GameState } from './game';
import { begin, clamp, note, type Kapitel3Result, type Kapitel3State } from './kapitel3';

export const STAND_RANKS = ['emporkoemmling', 'geduldet', 'anerkannt', 'aufgenommen'] as const;
export type StandRank = (typeof STAND_RANKS)[number];
/** Rang für Texte: einer der vier – oder gefürchtet, wer die Ordnung gebrochen hat. */
export type StandStatus = StandRank | 'gefuerchtet';

/** Rang als Zahl 0–3 für Türen (Projekte, Heirat). Wer die Ordnung brach, steht wie ein Aufgenommener da. */
export function standRank(k3: Pick<Kapitel3State, 'stand'>, balance: Balance): number {
  const s = k3.stand;
  if (s.admitted || s.broken) return 3;
  const ranks = balance.kapitel3.stand.ranks;
  let r = 0;
  ranks.forEach((from, i) => {
    if (s.ansehen >= from) r = i;
  });
  return r;
}

export function standStatus(k3: Pick<Kapitel3State, 'stand'>, balance: Balance): StandStatus {
  if (k3.stand.broken && !k3.stand.admitted) return 'gefuerchtet';
  return STAND_RANKS[standRank(k3, balance)];
}

/** Ansehen ändern (0–100). */
export function adjustAnsehen(k3: Kapitel3State, delta: number): Kapitel3State {
  return { ...k3, stand: { ...k3.stand, ansehen: clamp(k3.stand.ansehen + delta, 0, 100) } };
}

/** Was die nächste Stiftung brächte (0 = nichts mehr zu holen). */
export function donationGain(k3: Kapitel3State, balance: Balance): number {
  const d = balance.kapitel3.stand.donation;
  const roh = Math.round(d.gain * Math.pow(d.falloff, k3.stand.donations));
  return Math.max(0, Math.min(roh, d.cap - k3.stand.ansehen));
}

export function donate(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const d = balance.kapitel3.stand.donation;
  if (k3.stand.broken) return { ok: false, reason: 'gebrochen' };
  if (k3.stand.admitted) return { ok: false, reason: 'aufgenommen' };
  const gain = donationGain(k3, balance);
  if (gain <= 0) return { ok: false, reason: 'spenden_ausgereizt' };
  if (state.cash < d.cost) return { ok: false, reason: 'geld' };
  const k = adjustAnsehen({ ...k3, stand: { ...k3.stand, donations: k3.stand.donations + 1 } }, gain);
  return { ok: true, state: { ...state, cash: state.cash - d.cost, kapitel3: note(k, { round: state.round, key: 'spende', vars: { betrag: d.cost } }) } };
}

export function arrangeMarriage(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const m = balance.kapitel3.stand.marriage;
  if (k3.stand.broken) return { ok: false, reason: 'gebrochen' };
  if (k3.stand.married) return { ok: false, reason: 'schon_verheiratet' };
  if (state.family.thomasBorn <= 0) return { ok: false, reason: 'kein_sohn' };
  if (standRank(k3, balance) < m.minRank) return { ok: false, reason: 'rang' };
  if (state.cash < m.cost) return { ok: false, reason: 'geld' };
  const k = adjustAnsehen({ ...k3, stand: { ...k3.stand, married: true } }, m.gain);
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - m.cost,
      // Thomas wurde nicht gefragt (GDD §12: die Erziehung formt den Erben).
      family: { ...state.family, thomas: clamp(state.family.thomas + m.thomas, 0, 100) },
      kapitel3: note(k, { round: state.round, key: 'heirat', vars: { betrag: m.cost } }),
    },
  };
}

export function breakOrder(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const cost = balance.kapitel3.stand.breakOrder.cost;
  if (k3.stand.broken) return { ok: false, reason: 'gebrochen' };
  if (k3.stand.admitted) return { ok: false, reason: 'aufgenommen' };
  if (state.cash < cost) return { ok: false, reason: 'geld' };
  // Die alten Banken stehen hinter dem Konsortium: Wer sie kauft, schwächt es.
  const power = clamp(k3.konsortium.power + balance.kapitel3.konsortium.power.broken, 0, 100);
  const k: Kapitel3State = { ...k3, stand: { ...k3.stand, broken: true }, konsortium: { ...k3.konsortium, power } };
  return { ok: true, state: { ...state, cash: state.cash - cost, kapitel3: note(k, { round: state.round, key: 'ordnung_gebrochen', vars: { betrag: cost } }) } };
}

export function joinClub(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const c = balance.kapitel3.stand.club;
  if (k3.stand.broken) return { ok: false, reason: 'gebrochen' };
  if (k3.stand.admitted) return { ok: false, reason: 'aufgenommen' };
  if (k3.stand.ansehen < c.from) return { ok: false, reason: 'ansehen' };
  if (state.cash < c.cost) return { ok: false, reason: 'geld' };
  const k = { ...k3, stand: { ...k3.stand, admitted: true } };
  return { ok: true, state: { ...state, cash: state.cash - c.cost, kapitel3: note(k, { round: state.round, key: 'club', vars: { betrag: c.cost } }) } };
}

/** Rundenende: Hallstead vergisst schnell – bis Jacob aufgenommen ist oder die Ordnung gebrochen hat. */
export function settleStand(k3: Kapitel3State, balance: Balance): Kapitel3State {
  const s = balance.kapitel3.stand;
  if (k3.stand.admitted || k3.stand.broken || k3.stand.ansehen <= s.start) return k3;
  return { ...k3, stand: { ...k3.stand, ansehen: Math.max(s.start, k3.stand.ansehen - s.decay) } };
}

/** Zinsrabatt der alten Banken für neue Kredite (Anteil, z. B. 0.01 = ein Punkt). */
export function standRateDiscount(state: GameState, balance: Balance): number {
  const k3 = state.kapitel3;
  if (!k3) return 0;
  if (standStatus(k3, balance) === 'gefuerchtet') return 0;
  return balance.kapitel3.stand.rateDiscount[standRank(k3, balance)] ?? 0;
}

/** Jahreszins nach Rabatt, auf vier Stellen gerundet und nie unter null. */
export function withStandDiscount(rate: number, state: GameState, balance: Balance): number {
  const d = standRateDiscount(state, balance);
  if (d === 0) return rate;
  return Math.max(0, Math.round((rate - d) * 10000) / 10000);
}
