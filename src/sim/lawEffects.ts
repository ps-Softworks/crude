// Wirkung beschlossener Gesetze auf Jacobs Firma (0.4.20+17). Die Gesetze selbst und ihr Weg durchs
// Parlament stehen in laws.ts und content/laws/; hier steht nur, was ein geltendes Gesetz am Rundenende
// mit der Kasse macht. Regeln kommen aus lawRules (aufgeweichte Fassung, wenn Jacob verwässert hat).

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { brandOf, brandWorldFrom, nationalShare, sellStation } from './brand';
import { lawRules, type LawRule } from './laws';
import { Rng, seedFromString } from './rng';
import { totalDebt } from './stocks';

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Die geltenden Gesetzesregeln dieses Spielstands (leer ohne Weltmodell). */
export function rulesInForce(state: Pick<GameState, 'worldModel'>, balance: Pick<Balance, 'laws'>): Partial<Record<LawRule, number>> {
  return lawRules(state.worldModel?.laws, balance.laws);
}

/**
 * Gewinn der Runde für die Steuer: was die Kasse im Rundenende gewonnen hat, ohne frisch geliehenes Geld
 * (Kredite und Anleihen zählen nicht als Gewinn, Tilgungen nicht als Verlust).
 */
export function taxableProfit(before: GameState, after: GameState): number {
  return cents(after.cash - before.cash - (totalDebt(after) - totalDebt(before)));
}

/**
 * Einkommensteuer (Gesetz income_tax): Steuersatz × Gewinn der Runde, nur bei Gewinn.
 * 0.4.20+18: Die höhere Einkommensteuer (income_tax_raise) legt incomeTaxAdd drauf; der Steuerabzug für
 * Ölvorkommen (depletion_allowance) stellt einen Anteil des Gewinns steuerfrei.
 */
export function settleIncomeTax(before: GameState, after: GameState, balance: Pick<Balance, 'laws'>): GameState {
  const regeln = rulesInForce(after, balance);
  const satz = (regeln.incomeTax ?? 0) > 0 ? (regeln.incomeTax ?? 0) + (regeln.incomeTaxAdd ?? 0) : 0;
  if (satz <= 0) return after;
  const gewinn = taxableProfit(before, after);
  if (gewinn <= 0) return after;
  const steuer = cents(gewinn * (1 - (regeln.depletionAllowance ?? 0)) * satz);
  const prozent = Math.round(satz * 1000) / 10;
  return {
    ...after,
    cash: cents(after.cash - steuer),
    log: [...after.log, `${formatDate(after)}: Einkommensteuer ${prozent.toLocaleString('de-DE')} % auf ${Math.round(gewinn).toLocaleString('de-DE')} $ Gewinn: ${Math.round(steuer).toLocaleString('de-DE')} $.`],
  };
}

/** 0.4.20+18: Gilt eine Förderquote (Gesetz production_quota)? */
export function quotaInForce(state: Pick<GameState, 'worldModel'>, balance: Pick<Balance, 'laws'>): boolean {
  return (rulesInForce(state, balance).quotaShare ?? 0) > 0;
}

/** 0.4.20+18: Heißes Öl ein- oder ausschalten (nur, solange eine Förderquote gilt). */
export function setHotOil(state: GameState, balance: Pick<Balance, 'laws'>, on: boolean): GameState {
  if (state.finished || !quotaInForce(state, balance)) return state;
  return { ...state, hotOil: on, log: [...state.log, `${formatDate(state)}: ${on ? 'Jacob lässt voll fördern – heißes Öl, an der Quote vorbei.' : 'Jacob hält die Förderquote ein.'}`] };
}

/**
 * 0.4.20+18: Heißes Öl – nach der Förderung. Was über der Quote lag (Förderung × (1 − quotaShare)), findet der
 * Inspektor mit quotaCatch je Runde; dann kostet jedes Barrel quotaFine. Eigener Zufall je Runde (Seed + Runde).
 */
export function settleHotOil(state: GameState, balance: Pick<Balance, 'laws'>, produced: number): GameState {
  const r = rulesInForce(state, balance);
  const quote = r.quotaShare ?? 0;
  if (!state.hotOil || quote <= 0 || produced <= 0) return state;
  const heiss = produced * (1 - quote);
  const wurf = new Rng(seedFromString(`${state.seed}:heissesOel:${state.round}`)).float();
  if (wurf >= (r.quotaCatch ?? 0)) return state;
  const busse = cents(heiss * (r.quotaFine ?? 0));
  if (busse <= 0) return state;
  return {
    ...state,
    cash: cents(state.cash - busse),
    log: [...state.log, `${formatDate(state)}: Der Inspektor findet heißes Öl – ${Math.round(heiss).toLocaleString('de-DE')} Barrel über der Quote, ${Math.round(busse).toLocaleString('de-DE')} $ Bußgeld.`],
  };
}

/**
 * 0.4.20+18: Kartellgesetz (antitrust, Regel breakupFrom) – liegt Jacobs landesweiter Tankstellen-Marktanteil
 * auf oder über der Schwelle, muss er in der Region mit dem höchsten Anteil die Hälfte seiner Tankstellen
 * verkaufen (zum Wiederverkaufswert, aufgerundet). Jede Runde aufs Neue, bis er darunter liegt.
 */
export function settleBreakup(state: GameState, balance: Balance): GameState {
  const ab = rulesInForce(state, balance).breakupFrom ?? 0;
  if (ab <= 0 || !state.brand?.founded) return state;
  const brand = brandOf(state, balance);
  const anteil = nationalShare(brand).jacob;
  if (anteil < ab) return state;
  const ziel = Object.entries(brand.regions)
    .filter(([, r]) => r.stations > 0)
    .sort(([a, x], [b, y]) => (y.last?.share ?? 0) - (x.last?.share ?? 0) || (a < b ? -1 : 1))[0];
  if (!ziel) return state;
  const welt = brandWorldFrom(state);
  const anzahl = Math.ceil(ziel[1].stations / 2);
  let s = state;
  let verkauft = 0;
  for (let i = 0; i < anzahl; i++) {
    const r = sellStation(s, balance, welt, ziel[0]);
    if (!r.ok) break;
    s = r.state;
    verkauft += 1;
  }
  if (verkauft === 0) return state;
  const prozent = Math.round(anteil * 100);
  return { ...s, log: [...s.log, `${formatDate(s)}: Kartellgesetz: Bei ${prozent} % Marktanteil im ganzen Land muss Jacob ${verkauft} Tankstellen verkaufen.`] };
}
