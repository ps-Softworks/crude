// Rundenbericht (0.2.15+11): Nach der Glocke liegt zuerst ein Blatt „Was diese
// Runde geschah“ auf dem Tisch, noch vor der Zeitung – Kasse vorher und nachher,
// was gefördert wurde, wie es an den Bohrlöchern steht, und die Einträge der Nacht
// aus der Kladde (Kosten, Rivalen, Ereignisse). Nur Vorher und Nachher verglichen,
// alle Zahlen und Texte kommen aus src/sim.

import { useEffect, useRef } from 'react';
import type { Well } from '../../sim/drilling';
import type { GameState } from '../../sim/game';
import { parcelLabel } from '../../sim/lease';
import { balance } from '../balance';
import { barrels, money, moneyDelta, rounds } from '../format';

export interface RoundReport {
  /** Runde, die jetzt beginnt. */
  round: number;
  from: string;
  to: string;
  before: GameState;
  after: GameState;
}

/** Was sich an einem Bohrloch über Nacht getan hat, in einem Satz – oder null. */
function bohrzeile(game: GameState, vorher: Well | undefined, well: Well): { text: string; gut?: boolean; warn?: boolean } | null {
  const parcel = game.parcels.find((p) => p.id === well.parcelId);
  const ort = parcel ? parcelLabel(parcel) : well.parcelId;
  const tiefe = balance.drilling.stages[well.stage - 1]?.depth;
  const neu = !vorher || vorher.status !== well.status || vorher.stage !== well.stage;
  if (well.status === 'found' && (!vorher || vorher.status !== 'found')) {
    return { text: `${ort}: ${well.result === 'gusher' ? 'GUSHER! Ein gewaltiger Fund' : 'Öl gefunden'} in ${tiefe} m.`, gut: true };
  }
  if (!neu) {
    return well.status === 'drilling' ? { text: `${ort}: Der Turm bohrt weiter – fertig in ${rounds(well.roundsLeft)}.` } : null;
  }
  switch (well.status) {
    case 'decision':
      return { text: `${ort}: In ${tiefe} m trocken – tiefer bohren oder aufgeben?`, warn: true };
    case 'stuck':
      return { text: `${ort}: Das Werkzeug klemmt in ${tiefe} m.`, warn: true };
    case 'dry':
      return { text: `${ort}: trocken – kein Öl.` };
    case 'drilling':
      return { text: `${ort}: Stufe ${well.stage} auf ${tiefe} m – fertig in ${rounds(well.roundsLeft)}.` };
    default:
      return null;
  }
}

/** So viele Kladde-Zeilen stehen im Bericht, der Rest in der Kladde (0.2.15+12). */
export const BERICHT_ZEILEN = 5;

export function ReportSheet({ report, onDone, next, onJournal }: { report: RoundReport | null; onDone: () => void; next: boolean; onJournal?: () => void }) {
  const knopf = useRef<HTMLButtonElement>(null);
  useEffect(() => knopf.current?.focus({ preventScroll: true }), []);
  if (!report) {
    return (
      <p className="muted leer">
        Kein Bericht – er liegt nur nach dem Läuten der Glocke auf dem Tisch. Alles Bisherige steht in der Kladde (P).
      </p>
    );
  }
  const { before, after } = report;
  const kasse = after.cash - before.cash;
  const gefoerdert = after.wells.reduce((sum, w) => {
    const vorher = before.wells.find((v) => v.id === w.id);
    return sum + Math.max(0, (w.production?.total ?? 0) - (vorher?.production?.total ?? 0));
  }, 0);
  const bohrungen = after.wells.flatMap((w) => {
    const z = bohrzeile(after, before.wells.find((v) => v.id === w.id), w);
    return z ? [{ id: w.id, ...z }] : [];
  });
  // Alles seit dem Läuten – auch die Standardantworten auf liegen gebliebene Ereignisse.
  const zeilen = after.log.slice(before.log.length);
  const kurz = zeilen.slice(0, BERICHT_ZEILEN);
  const mehr = zeilen.length - kurz.length;

  return (
    <div className="bericht">
      <p className="bericht-datum">
        {report.from} → <strong>{report.to}</strong> · Runde {report.round}
      </p>
      <dl className="terms bericht-zahlen">
        <dt>Kasse</dt>
        <dd>
          {money(before.cash)} → <strong>{money(after.cash)}</strong>{' '}
          {Math.round(kasse) !== 0 && <span className={kasse < 0 ? 'geld minus' : 'geld plus'}>{moneyDelta(kasse)}</span>}
        </dd>
        <dt>Förderung</dt>
        <dd>{gefoerdert > 0 ? `${barrels(gefoerdert)} bbl in den Tank` : 'noch keine'}</dd>
        <dt>Tank</dt>
        <dd>
          {barrels(before.oilStock)} → {barrels(after.oilStock)} bbl
        </dd>
      </dl>
      {bohrungen.length > 0 && (
        <>
          <h3>Bohrungen</h3>
          <ul className="bericht-bohrungen">
            {bohrungen.map((b) => (
              <li key={b.id} className={b.gut ? 'gut' : b.warn ? 'warn' : undefined}>
                {b.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Aus der Kladde</h3>
      {zeilen.length === 0 ? (
        <p className="muted">Eine ruhige Nacht.</p>
      ) : (
        <>
          <ul className="log bericht-log">
            {kurz.map((z, i) => (
              <li key={i}>{z}</li>
            ))}
          </ul>
          {(mehr > 0 || onJournal) && (
            <p className="bericht-mehr">
              {mehr > 0 && <span className="muted">… und {mehr === 1 ? 'ein weiterer Eintrag' : `${mehr} weitere Einträge`}. </span>}
              {onJournal && (
                <button type="button" className="link" onClick={onJournal}>
                  Ganze Kladde (P)
                </button>
              )}
            </p>
          )}
        </>
      )}
      <p className="knoepfe bericht-fuss">
        <button type="button" className="primary" ref={knopf} onClick={onDone} data-autofocus>
          {next ? 'Weiter zur Zeitung (Enter)' : 'Weiter (Enter)'}
        </button>
      </p>
    </div>
  );
}
