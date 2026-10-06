// Fenster „Runde beenden“ (Glocke, E): was noch offen liegt, mit „Hingehen“,
// und der große Knopf. Gesperrt wird nichts – was liegen bleibt, läuft weiter,
// bis die Frist abläuft (so regelt es die Simulation).

import { agendaView } from '../../sim/agenda';
import { balance } from '../balance';
import { bankruptcyDeadlineOf, landDeadlines, openItems, type OpenItem } from '../inbox';
import type { SheetContext } from './types';

export function BellSheet({ ctx, onEndRound, onGo, onChapterEnd }: { ctx: SheetContext; onEndRound: () => void; onGo: (item: OpenItem) => void; onChapterEnd: (() => void) | null }) {
  const { game } = ctx;
  if (game.finished) {
    return (
      <div className="glocke-blatt">
        <p>Das Kapitel ist zu Ende. Es gibt keine weitere Runde.</p>
        {onChapterEnd && (
          <button type="button" className="primary" onClick={onChapterEnd} data-autofocus>
            Zum Kapitelende
          </button>
        )}
      </div>
    );
  }
  const offen = openItems(ctx.inbox, agendaView(game, balance), landDeadlines(game), bankruptcyDeadlineOf(game));
  return (
    <div className="glocke-blatt">
      {offen.length > 0 ? (
        <>
          <h3>Noch offen</h3>
          <ul className="offen-liste">
            {offen.map((item) => (
              <li key={item.target} className={item.urgent ? 'dringend' : undefined}>
                {item.urgent && <span className="siegel" aria-hidden="true" />}
                <span className="offen-text">
                  {item.text}
                  {item.urgent && <strong className="frist-text"> Frist!</strong>}
                </span>
                <button type="button" className="link" onClick={() => onGo(item)}>
                  Hingehen …
                </button>
              </li>
            ))}
          </ul>
          <p className="muted klein">Was liegen bleibt, läuft weiter, bis die Frist abläuft.</p>
        </>
      ) : (
        <p>Alles erledigt, was auf dem Tisch lag.</p>
      )}
      <div className="knoepfe">
        {offen.length > 0 && (
          <button type="button" onClick={() => onGo(offen[0])}>
            Hingehen …
          </button>
        )}
        <button type="button" className="primary" onClick={onEndRound} data-autofocus>
          Runde {game.round} beenden
        </button>
      </div>
    </div>
  );
}
