// Übernahmen (4.10, GDD §9.4 freundliche Übernahme, §9.6 Lebenszyklus):
//
// - Jacob kauft eine kleine Wildcatter-Firma (state.wildcatters): Preis =
//   max(1, Quellen) · pricePerWell · (1 + premium). Die Quellen fördern weiter wie
//   bisher (der Markt rechnet sie schon mit), aber der Gewinn geht an Jacob:
//   je Runde Quellen · barrelsPerWell · max(0, Posted Price − costPerBarrel).
// - In der Krise (Kreditklima unter crisisCredit) kauft Harold Pruett Pleitefirmen
//   auf – je Runde mit pruettBuyChance (als Trustchef doppelt) eine der freien Firmen.
// - Steht Jacob selbst vor der Pleite (Frist läuft oder Kasse im Minus), bietet
//   Pruett an, die Firma zu kaufen: Imperiumswert · distressPremium, mindestens
//   distressMin. Annehmen beendet die Partie mit dem Verkauf (Ende „verkauft“).
// Feindliche Übernahmen über Aktien gehören zu 4.8 (Schutz: takeoverShield).

import { spendAppointments } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import {
  betrayedBy,
  cents,
  diplomacyWorld,
  hasDiplomacy,
  takeId,
  type DiploGame,
  type DiploReason,
  type DiploResult,
  type DiplomacyState,
} from './diplomacyCore';
import { empireValue } from './empire';
import type { GameState } from './game';
import type { Rng } from './rng';

/** Kaufpreis einer Wildcatter-Firma in ganzen $. */
export function firmPrice(balance: Balance, wells: number): number {
  const t = balance.diplomacy.takeovers;
  return Math.round(Math.max(1, wells) * t.pricePerWell * (1 + t.premium));
}

/** Wem eine Firma gehört: jacob, pruett oder null (noch selbstständig). */
export function firmOwner(d: Pick<DiplomacyState, 'firms'>, name: string): 'jacob' | 'pruett' | null {
  return d.firms.find((f) => f.name === name)?.owner ?? null;
}

/** Warum Jacob diese Firma nicht kaufen kann, oder null. */
export function buyReason(state: GameState, balance: Balance, name: string): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const firm = state.wildcatters.firms.find((f) => f.name === name);
  if (!firm) return 'unbekannt';
  if (firmOwner(state.diplomacy, name) !== null) return 'vergeben';
  if (state.cash < firmPrice(balance, firm.wells)) return 'geld';
  return null;
}

/** Jacob kauft eine kleine Firma (freundliche Übernahme, ein Termin). */
export function buyFirm(state: GameState, balance: Balance, name: string): DiploResult {
  const reason = buyReason(state, balance, name);
  if (reason) return { ok: false, reason };
  const zeit = spendAppointments(state, balance, balance.diplomacy.takeovers.appointments);
  if (!zeit.ok) return { ok: false, reason: 'zeit' };
  const s = zeit.state as DiploGame;
  const firm = s.wildcatters.firms.find((f) => f.name === name)!;
  const preis = firmPrice(balance, firm.wells);
  return {
    ok: true,
    state: {
      ...s,
      cash: s.cash - preis,
      diplomacy: { ...s.diplomacy, firms: [...s.diplomacy.firms, { name, owner: 'jacob', round: s.round }] },
      log: [...s.log, `${formatDate(s)}: Jacob kauft ${name} für ${preis.toLocaleString('de-DE')} $.`],
    },
  };
}

/** Gewinn aus Jacobs Firmen in dieser Runde (Posted Price der Runde). */
export function firmsIncome(state: DiploGame, balance: Balance): number {
  const t = balance.diplomacy.takeovers;
  const netto = Math.max(0, state.postedPrice - t.costPerBarrel);
  const quellen = state.diplomacy.firms
    .filter((f) => f.owner === 'jacob')
    .reduce((sum, f) => sum + (state.wildcatters.firms.find((w) => w.name === f.name)?.wells ?? 0), 0);
  return cents(quellen * t.barrelsPerWell * netto);
}

/** Steht Jacob vor der Pleite? */
export function inDistress(state: Pick<GameState, 'cash' | 'bankruptcyDeadline'>): boolean {
  return state.bankruptcyDeadline > 0 || state.cash < 0;
}

/** Pruetts Kaufangebot für Jacobs Firma in ganzen $. */
export function buyoutPrice(state: GameState, balance: Balance): number {
  const t = balance.diplomacy.takeovers;
  return Math.max(t.distressMin, Math.round(empireValue(state, balance) * t.distressPremium));
}

/**
 * Am Rundenende: Gewinn aus Jacobs Firmen; in der Krise kauft Pruett vielleicht eine
 * Firma (ein Zufallswert für die Chance, einer für die Wahl); steht Jacob vor der
 * Pleite, macht Pruett vielleicht ein Kaufangebot (ein Zufallswert).
 */
export function advanceTakeovers(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const t = balance.diplomacy.takeovers;
  const date = formatDate(state);
  const log = [...state.log];
  let d = state.diplomacy;
  let cash = state.cash;

  const gewinn = firmsIncome(state, balance);
  if (gewinn > 0) {
    cash = cents(cash + gewinn);
    log.push(`${date}: Deine gekauften Firmen bringen ${gewinn.toLocaleString('de-DE')} $.`);
  }

  const pruettChef = d.succession.outcome === 'pruett';
  const chance = Math.min(1, t.pruettBuyChance * (pruettChef ? 2 : 1));
  if (diplomacyWorld(state).credit < t.crisisCredit && rng.float() < chance) {
    const frei = state.wildcatters.firms.filter((f) => firmOwner(d, f.name) === null).map((f) => f.name);
    if (frei.length > 0) {
      const name = rng.pick(frei);
      d = { ...d, firms: [...d.firms, { name, owner: 'pruett', round: state.round }] };
      log.push(`${date}: Harold Pruett kauft in der Krise ${name} auf.`);
    }
  }

  const hatAngebot = d.offers.some((o) => o.kind === 'buyout');
  if (inDistress({ cash, bankruptcyDeadline: state.bankruptcyDeadline }) && !hatAngebot && !betrayedBy(d, 'pruett') && rng.float() < chance) {
    const [id, d2] = takeId(d, 'o');
    const price = buyoutPrice({ ...state, cash }, balance);
    d = { ...d2, offers: [...d2.offers, { id, rival: 'pruett', kind: 'buyout', round: state.round, expires: state.round + balance.diplomacy.pacts.offerRounds, price }] };
    log.push(`${date}: Harold Pruett bietet an, Jacobs Firma für ${price.toLocaleString('de-DE')} $ zu kaufen.`);
  }
  return { ...state, cash, log, diplomacy: d };
}

/** Rückgabe-Hülle für die Oberfläche: Firmen mit Besitzer und Preis. */
export interface FirmRow {
  name: string;
  wells: number;
  owner: 'jacob' | 'pruett' | null;
  price: number;
  reason: DiploReason | null;
}

export function firmRows(state: GameState, balance: Balance): FirmRow[] {
  if (!hasDiplomacy(state)) return [];
  return state.wildcatters.firms.map((f) => ({
    name: f.name,
    wells: f.wells,
    owner: firmOwner(state.diplomacy, f.name),
    price: firmPrice(balance, f.wells),
    reason: buyReason(state, balance, f.name),
  }));
}
