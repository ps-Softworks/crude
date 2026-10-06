// Ergebnis einer Antwort (0.2.15+11): Was nach einem Brief, Vorfall, Termin oder
// Besuch passiert ist – der Ergebnistext der Wahl aus content/events und was sich
// an Kasse und Tank geändert hat. Nur Vorher und Nachher verglichen; was eine
// Antwort bewirkt, entscheidet resolveEvent in src/sim.

import type { GameState } from '../sim/game';
import { balance } from './balance';
import { events } from './events';
import { barrels, moneyDelta } from './format';
import { resultText } from './visitors';

export interface OutcomeData {
  /** Titel des Ereignisses. */
  title: string;
  /** Der Ergebnistext der gewählten Antwort (kann leer sein). */
  text: string;
  /** Änderung der Kasse in Dollar. */
  cash: number;
  /** Änderung im Tank in Barrel (abgerundet). */
  oil: number;
}

export function outcomeOf(before: GameState, after: GameState, eventId: string, choiceId: string, title: string): OutcomeData {
  return {
    title,
    text: resultText(events, eventId, choiceId, before, balance) ?? '',
    cash: Math.round(after.cash - before.cash),
    oil: Math.floor(after.oilStock) - Math.floor(before.oilStock),
  };
}

/** Ergebnistext und Geld-/Öländerung, z. B. „Stichflamme …“ · „−180 $“. */
export function Outcome({ data }: { data: OutcomeData }) {
  return (
    <>
      {data.text && <p className="nachsatz">{data.text}</p>}
      {(data.cash !== 0 || data.oil !== 0) && (
        <p className="ergebnis-zahlen">
          {data.cash !== 0 && <span className={data.cash < 0 ? 'geld minus' : 'geld plus'}>Kasse {moneyDelta(data.cash)}</span>}
          {data.oil !== 0 && (
            <span className={data.oil < 0 ? 'geld minus' : 'geld plus'}>
              Tank {data.oil < 0 ? '−' : '+'}
              {barrels(Math.abs(data.oil))} bbl
            </span>
          )}
        </p>
      )}
    </>
  );
}
