// Wirkung beschlossener Gesetze auf Jacobs Firma (0.4.20+17). Die Gesetze selbst und ihr Weg durchs
// Parlament stehen in laws.ts und content/laws/; hier steht nur, was ein geltendes Gesetz am Rundenende
// mit der Kasse macht. Regeln kommen aus lawRules (aufgeweichte Fassung, wenn Jacob verwässert hat).

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { lawRules, type LawRule } from './laws';
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

/** Einkommensteuer (Gesetz income_tax): Steuersatz × Gewinn der Runde, nur bei Gewinn. */
export function settleIncomeTax(before: GameState, after: GameState, balance: Pick<Balance, 'laws'>): GameState {
  const satz = rulesInForce(after, balance).incomeTax ?? 0;
  if (satz <= 0) return after;
  const gewinn = taxableProfit(before, after);
  if (gewinn <= 0) return after;
  const steuer = cents(gewinn * satz);
  const prozent = Math.round(satz * 1000) / 10;
  return {
    ...after,
    cash: cents(after.cash - steuer),
    log: [...after.log, `${formatDate(after)}: Einkommensteuer ${prozent.toLocaleString('de-DE')} % auf ${Math.round(gewinn).toLocaleString('de-DE')} $ Gewinn: ${Math.round(steuer).toLocaleString('de-DE')} $.`],
  };
}
