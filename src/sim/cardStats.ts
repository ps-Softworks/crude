// Messhilfe (Spielspaß K1): Was jede Preis- und Fracht-Karte einer Bot-Partie gebracht oder gekostet
// hat, und wie oft sie schiefging. Keine Spielregel – liest nur den Zustand vor und nach jeder Runde
// (vorher = nach den Bot-Zügen, vor endRound; nachher = nach endRound). Benutzt von src/sim/bots.ts
// (playGame) und tools/termineMessung2.ts.
//
// Geldeffekt je Anwendung (geschätzt, in $):
//   thorne    Tarifänderung × Bahnfracht der nächsten H Runden (Erfolg: Senkung, Abfuhr: sofortige
//             Erhöhung); ein erwischter Bluff zählt mit seinem Aufschlag × Bahnfracht gegen den Besuch.
//   geruecht  Preisplus (bzw. Rückschlag) × Verkauf der Folgerunde je Schockrunde, dazu Cranes Abschlag
//             × Verkauf an Crane, solange er gilt.
//   crane     Cranes Abschlag/Aufschlag vorher gegen nachher × Verkauf an Crane der nächsten H Runden.
//   brennan   (Mietfuhrwerk − Brennans Preis) × Barrel über Brennan, minus Strafen.
//   gemeinschaft  Rabatt × Bahnfracht, solange sie läuft, minus Strafen für die verfehlte Zusage.
//   liefervertrag Mehrerlös des Vertrags (wie pricing.contractResults).
// Von allen geht der Barpreis der Karte ab. Schlecht = Abfuhr, erwischter Bluff, Gerücht entlarvt,
// Gemeinschaft kommt nicht zustande oder zahlt Strafe, Brennan-Strafe oder abgeworben, Vertrag mit Verlust.

import type { Balance } from './balance';
import { brennanActive, brennanPenalty, FREIGHT_MARKS, poolDiscount, poolPenalty } from './freight';
import type { GameState } from './game';
import { dealBonus } from './pricing';
import { craneCut } from './trust';

/** Karten mit eigener Zeile in der Messung. */
export const TRACKED_CARDS = ['thorne_vorsprechen', 'geruecht', 'crane_feilschen', 'brennan', 'transportgemeinschaft', 'liefervertrag'] as const;
export type TrackedCard = (typeof TRACKED_CARDS)[number];

export interface CardUse {
  card: TrackedCard;
  round: number;
  bad: boolean;
  money: number;
}

/** Ein Geldeffekt, der über die Barrel späterer Runden aufläuft. */
interface Window {
  use: number;
  /** Je Runde (from … until) $ je Barrel. */
  perBarrel: Record<number, number>;
  measure: 'rail' | 'sold' | 'crane';
}

export interface CardTracker {
  uses: CardUse[];
  windows: Window[];
  /** Laufende Anwendungen: Besuch mit offener Bluff-Prüfung, letztes Gerücht, Brennan, Gemeinschaft, Vertrag. */
  bluffUse: number | null;
  rumourUse: number | null;
  brennanUse: number | null;
  poolUse: number | null;
  contractUse: number | null;
}

/** So viele Runden zählt eine Tarif- oder Abschlagsänderung. */
export const HORIZON = 8;

export function newCardTracker(): CardTracker {
  return { uses: [], windows: [], bluffUse: null, rumourUse: null, brennanUse: null, poolUse: null, contractUse: null };
}

function barrels(state: GameState, measure: Window['measure']): number {
  const alle = Object.values(state.shipped).reduce((s, v) => s + v, 0);
  if (measure === 'rail') return state.shipped.rail;
  if (measure === 'sold') return alle;
  return Math.max(0, alle - state.logistics.traderSold);
}

function konstant(from: number, until: number, wert: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let r = from; r <= until; r++) out[r] = wert;
  return out;
}

/** Was Crane je Barrel weniger zahlt (Abschlag minus Aufschlag) in Runde r. */
function craneNet(state: GameState, balance: Balance, round: number): number {
  const s = { ...state, round };
  return craneCut(s, balance) - dealBonus(s);
}

/** Unterschied Cranes Abzug vorher − nachher für die Runden r+1 … r+H (positiv = Jacob bekommt mehr). */
function craneDiff(vorher: GameState, nachher: GameState, balance: Balance, r: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (let k = r + 1; k <= r + HORIZON; k++) out[k] = craneNet(vorher, balance, k) - craneNet(nachher, balance, k);
  return out;
}

/** Eine Runde auswerten: vorher = Zustand nach den Zügen von Runde r, nachher = nach endRound. */
export function trackCards(t: CardTracker, vorher: GameState, nachher: GameState, balance: Balance): void {
  const r = vorher.round;
  // 1. Aufgelaufene Effekte dieser Runde (Barrel von Runde r).
  for (const w of t.windows) {
    const satz = w.perBarrel[r];
    if (satz !== undefined) t.uses[w.use].money += satz * barrels(vorher, w.measure);
  }
  t.windows = t.windows.filter((w) => Object.keys(w.perBarrel).some((k) => Number(k) > r));
  // 2. Neue Anwendungen aus dem Planungsbrett dieser Runde.
  const gebucht = vorher.plans?.round === r ? vorher.plans.booked : [];
  for (const b of gebucht) {
    const card = b.cardId as TrackedCard;
    if (!(TRACKED_CARDS as readonly string[]).includes(card)) continue;
    const use: CardUse = { card, round: r, bad: false, money: -b.cash };
    const i = t.uses.push(use) - 1;
    if (card === 'thorne_vorsprechen') {
      const vf = vorher.freight;
      const nf = nachher.freight;
      if (nf.concessions.includes(r)) {
        t.windows.push({ use: i, perBarrel: konstant(r + 1, r + HORIZON, nf.cutTotal - vf.cutTotal), measure: 'rail' });
        if (nf.bluffsRisked > vf.bluffsRisked) t.bluffUse = i;
      } else {
        use.bad = true;
        const teurer = Math.max(0, Math.min(balance.freight.rebuff.raise, balance.transport.thorne.maxTariff - vorher.railTariff));
        t.windows.push({ use: i, perBarrel: konstant(r + 1, r + HORIZON, -teurer), measure: 'rail' });
      }
    } else if (card === 'geruecht') {
      const vor = vorher.pricing.rumours;
      const nach = nachher.pricing.rumours;
      if (nach.count === vor.count) use.bad = true; // verpufft
      else {
        t.rumourUse = i;
        if (nach.exposedRound === r) {
          use.bad = true;
          t.windows.push({ use: i, perBarrel: craneDiff(vorher, nachher, balance, r), measure: 'crane' });
        }
      }
    } else if (card === 'crane_feilschen') {
      // Abfuhr: Cranes neuer, verlängerter Abschlag ab der nächsten Runde (das Merkzeichen bleibt beim ersten Mal stehen).
      const k = nachher.pricing.cranePunish;
      if (k && k.from === r + 1 && k.until === r + balance.rivals.crane.cutRounds + balance.priceActions.crane.rebuffExtra) use.bad = true;
      t.windows.push({ use: i, perBarrel: craneDiff(vorher, nachher, balance, r), measure: 'crane' });
    } else if (card === 'brennan') {
      t.brennanUse = i;
    } else if (card === 'transportgemeinschaft') {
      if ((nachher.freight.pool.length ?? 0) > 0 && (vorher.freight.pool.length ?? 0) === 0) t.poolUse = i;
      else use.bad = true;
    } else if (card === 'liefervertrag') {
      if (nachher.pricing.contract?.buyer === 'haendler' && nachher.pricing.contract.from === r + 1) t.contractUse = i;
    }
  }
  // 3. Laufende Verträge: Brennan (gilt schon in der Buchungsrunde) und Gemeinschaft.
  if (t.brennanUse !== null && brennanActive(vorher)) {
    const u = t.uses[t.brennanUse];
    // Brennan ersetzt die Mietfuhrwerke: Was über ihn fährt, fährt der Bot erst, wenn billigere Wege voll sind.
    u.money += (balance.transport.wagon.costPerBarrel - balance.freight.brennan.costPerBarrel) * vorher.shipped.wagon;
    const strafe = brennanPenalty(vorher, balance).fine;
    if (strafe > 0) {
      u.money -= strafe;
      u.bad = true;
    }
    const weg = nachher.events.marks[FREIGHT_MARKS.brennanLost];
    if (weg !== undefined && nachher.freight.brennan === null && weg >= (vorher.freight.brennan?.from ?? Infinity)) u.bad = true;
  }
  if (t.poolUse !== null && (vorher.freight?.pool.length ?? 0) > 0) {
    const u = t.uses[t.poolUse];
    u.money += poolDiscount(vorher, balance) * vorher.shipped.rail;
    const strafe = poolPenalty(vorher, balance).fine;
    if (strafe > 0) {
      u.money -= strafe;
      u.bad = true;
    }
  }
  // 4. Gerüchteschock dieser Runde (nach den neuen Anwendungen, damit ein frisches Gerücht mitzählt): Der Preis am Rundenende gilt für die Verkäufe der Folgerunde.
  const sh = nachher.pricing?.rumours.shock;
  if (t.rumourUse !== null && sh && r >= sh.round && r < sh.round + (nachher.pricing.rumours.exposedRound === sh.round ? 1 : balance.priceActions.rumour.rounds)) {
    const plus = nachher.postedPrice * (1 - 1 / (1 + sh.value));
    t.windows.push({ use: t.rumourUse, perBarrel: { [r + 1]: plus }, measure: 'sold' });
  }
  // 5. Erwischter Bluff: Aufschlag gegen den Besuch, der ihn riskiert hat.
  if (t.bluffUse !== null && nachher.freight.bluffsCaught > vorher.freight.bluffsCaught) {
    const u = t.uses[t.bluffUse];
    u.bad = true;
    const aufschlag = Math.max(0, Math.min(balance.freight.bluff.penalty, balance.transport.thorne.maxTariff - vorher.railTariff));
    t.windows.push({ use: t.bluffUse, perBarrel: konstant(r + 1, r + HORIZON, -aufschlag), measure: 'rail' });
    t.bluffUse = null;
  }
  if (nachher.freight.bluffCheck === null) t.bluffUse = null;
  // 6. Liefervertrag beendet: Mehrerlös aus pricing.contractResults.
  const vorherErg = vorher.pricing.contractResults.length;
  if (t.contractUse !== null && nachher.pricing.contractResults.length > vorherErg && vorher.pricing.contract?.buyer === 'haendler') {
    const g = nachher.pricing.contractResults[nachher.pricing.contractResults.length - 1];
    const u = t.uses[t.contractUse];
    u.money += g;
    u.bad = g < 0;
    t.contractUse = null;
  }
}

/** Am Partieende: Ein noch laufender Liefervertrag zählt mit seinem bisherigen Mehrerlös. */
export function finishCards(t: CardTracker, state: GameState): void {
  const c = state.pricing?.contract;
  if (t.contractUse !== null && c && c.buyer === 'haendler') {
    const u = t.uses[t.contractUse];
    u.money += c.gain;
    u.bad = c.gain < 0;
  }
}
