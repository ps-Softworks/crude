// Anlagen verkaufen (0.4.20+41, GDD §8 „Notverkauf … Rivalen bieten mit“, Nachtplan A1): Gegenstück zum Feldkauf.
// Jacob verkauft Bullard eine eigene Pacht – mit allen Bohrlöchern darauf – oder einen eigenen Bohrturm.
//
// Bullards Gebot für eine Pacht (er rechnet wie beim Feldkauf, will aber verdienen):
//   fördernde Quellen:  Σ letzte Rate · Bullards Nettopreis je bbl · Σ (1 − Rückgang)^t über buyout.horizon Runden
//   ungebohrt:          max(Pachtbonus · undrilledBonus, Bullards Fundchance · valuePerFind)
//   × Knappheit wie beim Feldkauf (gute Felder knapp = mehr wert)
//   × Haltung: neutral bid, Handschlag pakt, Fehde feud
//   höchstens cashShare seiner Kasse; in Kapitel 3 verschuldet kauft er nichts.
// Das Gebot ist fest – Jacob nimmt an oder lässt es. Verkauft ist verkauft: die Quellen fördern ab jetzt für Bullard
// (mehrere Bohrlöcher werden bei ihm zu einer Quelle mit der Summe der Raten – er rechnet je Ranch eine Quelle).
//
// Notverkauf in der Pleitefrist (GDD §8 „Notverkauf von Anlagen zu 40–60 % des Werts; Rivalen bieten mit“):
// Statt bid/pakt/feud gelten emergency.neutral/pakt/feud, und die anderen Ölleute bieten mit – das Gebot ist
// mindestens emergency.others × Wert. Bullards Kasse deckelt dann nicht: Was er nicht hat, legen seine Teilhaber
// dazu. Türme gehen in der Frist zu rigShare × emergency.rig des Neupreises weg.
import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { leaseOf, parcelLabel } from './lease';
import { goodLandScarcity } from './buyout';
import { bullardStance, rivalChance, rivalNetPerBarrel, type RivalWell } from './rival';
import { findRig, rigLabel, rigWell } from './rigs';

export interface SaleBalance {
  /** Gebot im Verhältnis zu Bullards Wert, ohne besondere Haltung. */
  bid: number;
  /** … mit Handschlag (er zahlt fast den vollen Wert). */
  pakt: number;
  /** … in Fehde (er nutzt Jacobs Not aus). */
  feud: number;
  /** Ungebohrtes Land: mindestens dieser Anteil des gezahlten Pachtbonus. */
  undrilledBonus: number;
  /** Höchstens dieser Anteil von Bullards Kasse. */
  cashShare: number;
  /** Eigener Turm: Anteil des Kaufpreises (Dampfmaschine/Gestänge zählen mit ihrem Preis × derselbe Anteil). */
  rigShare: number;
  /** Gebote rundet er auf diesen Schritt. */
  step: number;
  /** Notverkauf in der Pleitefrist: Anteile des Werts je Haltung, Untergrenze durch andere Bieter, Faktor für Türme. */
  emergency: { neutral: number; pakt: number; feud: number; others: number; rig: number };
}

export interface SaleQuote {
  parcelId: string;
  /** Bullards Gebot in $. */
  offer: number;
  /** Was die Pacht für Bullard wert ist (vor Abschlag und Kassengrenze). */
  value: number;
  /** Summe der aktuellen Förderung der Quellen auf der Ranch (0 = ungebohrt). */
  rate: number;
  /** Anzahl fördernder Quellen. */
  wells: number;
  /** Das Gebot ist durch Bullards Kasse gedeckelt. */
  cashLimited: boolean;
  stance: 'neutral' | 'pakt' | 'fehde';
  /** Notverkauf in der Pleitefrist (andere Bieter, kein Kassendeckel). */
  emergency: boolean;
}

/** Läuft gerade die Pleitefrist? Dann wird notverkauft. */
export function inEmergency(state: Pick<GameState, 'bankruptcyDeadline' | 'finished'>): boolean {
  return !state.finished && state.bankruptcyDeadline > 0;
}

const ACTIVE = new Set(['drilling', 'decision', 'stuck']);

function bullardBroke(state: GameState, balance: Balance): boolean {
  return state.rivalsK3 !== undefined && state.rivalsK3.bullardDebt >= balance.rivalsK3.bullard.distressAt;
}

/** Warum Jacob diese Ranch nicht an Bullard verkaufen kann – oder null. */
export function saleBlocker(state: GameState, balance: Balance, parcelId: string): string | null {
  if (state.finished) return 'Das Spiel ist vorbei.';
  const lease = leaseOf(state, parcelId);
  if (!lease || lease.holder !== 'jacob') return 'Nur eigene Pachten lassen sich verkaufen.';
  const wells = state.wells.filter((w) => w.parcelId === parcelId);
  if (wells.some((w) => ACTIVE.has(w.status))) return 'Hier wird noch gebohrt – erst wenn das Loch fertig ist, redet Bullard über einen Preis.';
  if (state.loans.some((l) => l.collateral === parcelId)) return 'Die Quelle ist bei der Bank verpfändet – erst den Kredit tilgen.';
  const found = wells.filter((w) => w.status === 'found');
  if (lease.drilled && found.length === 0) return 'Hier wurde trocken gebohrt – das Land will niemand.';
  if (bullardBroke(state, balance) && !inEmergency(state)) return 'Bullard steckt selbst in Schulden – er kauft nichts.';
  return null;
}

/** Bullards Gebot für eine eigene Pacht – null, wenn sie nicht verkäuflich ist. */
export function saleQuote(state: GameState, balance: Balance, parcelId: string): SaleQuote | null {
  if (saleBlocker(state, balance, parcelId) !== null) return null;
  const lease = leaseOf(state, parcelId)!;
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!parcel) return null;
  const k = balance.sale;
  const b = balance.rivals.bullard;
  const found = state.wells.filter((w) => w.parcelId === parcelId && w.status === 'found');
  const rate = found.reduce((s, w) => s + (w.production?.lastRate ?? w.production?.initialRate ?? 0), 0);
  let flow: number;
  if (found.length > 0) {
    const net = rivalNetPerBarrel(state.postedPrice, lease.royalty, b.transportPerBarrel);
    const d = balance.production.decline;
    flow = rate * net * ((1 - (1 - d) ** balance.buyout.horizon) / d);
  } else {
    flow = Math.max(lease.bonus * k.undrilledBonus, rivalChance(state, balance, parcel) * b.valuePerFind);
  }
  const scarcity = 1 + balance.buyout.scarcityWeight * goodLandScarcity(state, balance);
  const stance = bullardStance(state);
  const not = inEmergency(state);
  const e = k.emergency;
  const factor = not
    ? Math.max(e.others, stance === 'pakt' ? e.pakt : stance === 'fehde' ? e.feud : e.neutral)
    : stance === 'pakt' ? k.pakt : stance === 'fehde' ? k.feud : k.bid;
  const value = Math.round(flow * scarcity);
  const roh = Math.floor((value * factor) / k.step) * k.step;
  const kasse = Math.floor((Math.max(0, state.rival.cash) * k.cashShare) / k.step) * k.step;
  const offer = not ? Math.max(0, roh) : Math.max(0, Math.min(roh, kasse));
  return { parcelId, offer, value, rate: Math.round(rate), wells: found.length, cashLimited: !not && kasse < roh, stance, emergency: not };
}

export type SaleResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Jacob nimmt Bullards Gebot an: Geld in die Kasse, Pacht und Quellen gehen an Bullard. */
export function sellLease(state: GameState, balance: Balance, parcelId: string): SaleResult {
  const blocker = saleBlocker(state, balance, parcelId);
  if (blocker) return { ok: false, reason: blocker };
  const quote = saleQuote(state, balance, parcelId)!;
  if (quote.offer <= 0) return { ok: false, reason: 'Bullard hat gerade kein Geld für ein Gebot.' };
  const lease = leaseOf(state, parcelId)!;
  const parcel = state.parcels.find((p) => p.id === parcelId)!;
  const found = state.wells.filter((w) => w.parcelId === parcelId && w.status === 'found');
  // Bullard rechnet je Ranch eine Quelle: alle Bohrlöcher zusammen, Rate = Summe.
  const rivalWells: RivalWell[] =
    found.length > 0
      ? [{ parcelId, startRound: Math.min(...found.map((w) => w.startRound)), roundsLeft: 0, status: 'found', rate: quote.rate, royalty: lease.royalty }]
      : [];
  // Im Notverkauf legen Bullards Teilhaber dazu, was er nicht hat.
  const bezahlt = Math.min(quote.offer, Math.max(0, state.rival.cash));
  const geld = `${quote.offer.toLocaleString('de-DE')} $`;
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash + quote.offer,
      leases: state.leases.map((l) => (l.parcelId === parcelId && l.holder === 'jacob' ? { ...l, holder: 'bullard' as const } : l)),
      wells: state.wells.filter((w) => w.parcelId !== parcelId),
      rival: { ...state.rival, cash: state.rival.cash - (quote.emergency ? bezahlt : quote.offer), wells: [...state.rival.wells.filter((w) => w.parcelId !== parcelId), ...rivalWells] },
      log: [
        ...state.log,
        `${formatDate(state)}: Jacob verkauft ${parcelLabel(parcel)} ${quote.emergency ? 'in der Not ' : ''}an Bullard für ${geld}${found.length > 0 ? ' – die Quelle fördert ab jetzt für ihn' : ''}.`,
      ],
    },
  };
}

/** Was ein eigener Turm beim Verkauf bringt (Dampfmaschine/Gestänge zählen mit). */
export function rigSalePrice(state: GameState, balance: Balance, rigId: string): number {
  const rig = findRig(state, rigId);
  if (!rig || rig.kind !== 'owned') return 0;
  const r = balance.drilling.rigs;
  const neu = r.buy.cost + (rig.steam ? r.steam.cost : 0) + (rig.rods ? r.rods.cost : 0);
  return Math.round(neu * balance.sale.rigShare * (inEmergency(state) ? balance.sale.emergency.rig : 1));
}

/** Warum dieser Turm nicht verkauft werden kann – oder null. */
export function rigSaleBlocker(state: GameState, rigId: string): string | null {
  if (state.finished) return 'Das Spiel ist vorbei.';
  const rig = findRig(state, rigId);
  if (!rig || rig.kind !== 'owned') return 'Verkaufen lassen sich nur eigene Türme.';
  if (state.round < rig.readyRound) return 'Der Turm ist noch nicht geliefert.';
  if (rigWell(state, rigId)) return 'Der Turm bohrt noch.';
  if (state.deals?.pledgedRig === rigId) return 'Der Turm ist bei der Bank verpfändet.';
  if (state.deals?.lent?.rigId === rigId) return 'Der Turm ist gerade verliehen.';
  return null;
}

/** Eigenen Turm an einen Händler verkaufen. */
export function sellRig(state: GameState, balance: Balance, rigId: string): SaleResult {
  const blocker = rigSaleBlocker(state, rigId);
  if (blocker) return { ok: false, reason: blocker };
  const rig = findRig(state, rigId)!;
  const preis = rigSalePrice(state, balance, rigId);
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash + preis,
      rigs: state.rigs.filter((r) => r.id !== rigId),
      log: [...state.log, `${formatDate(state)}: Jacob verkauft ${rigLabel(rig)} für ${preis.toLocaleString('de-DE')} $.`],
    },
  };
}
