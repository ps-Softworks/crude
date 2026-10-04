// Stapel aus Ereignissen (0.2.15+9): links die Liste, rechts die Karte, die
// gerade vorn liegt. Für Post, Vorfälle und Termine. Tasten 1–4 antworten auf
// die vordere Karte.

import { useState, type ReactNode } from 'react';
import type { DeskEvent } from '../../sim/events';
import type { GameState } from '../../sim/game';
import { EventCard } from '../EventCard';

export function EventStack({
  game,
  list,
  empty,
  onResolved,
  cardClass,
  itemMeta,
  listLabel,
}: {
  game: GameState;
  list: readonly DeskEvent[];
  empty: ReactNode;
  onResolved: (state: GameState) => void;
  cardClass: (e: DeskEvent) => string;
  /** Kleine Zeile unter dem Titel in der Liste (Briefart, Frist …). */
  itemMeta?: (e: DeskEvent) => ReactNode;
  listLabel: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  if (list.length === 0) return <p className="muted leer">{empty}</p>;
  // Ist die gewählte Karte beantwortet, rückt die nächste nach vorn.
  const vorn = list.find((e) => e.id === gewaehlt) ?? list[0];

  return (
    <div className="stapel">
      <ul className="stapel-liste" aria-label={listLabel}>
        {list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={`${e.id === vorn.id ? 'aktiv' : ''}${e.urgent ? ' dringend' : ''}`}
              aria-current={e.id === vorn.id ? 'true' : undefined}
              onClick={() => setGewaehlt(e.id)}
            >
              <span className="stapel-titel">
                {e.urgent && <span className="siegel" aria-hidden="true" />} {e.title}
              </span>
              {itemMeta && <span className="stapel-meta">{itemMeta(e)}</span>}
              {e.urgent && <span className="frist-text">Frist!</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="stapel-karte">
        <EventCard key={vorn.id} game={game} event={vorn} onResolved={onResolved} className={cardClass(vorn)} hotkeys />
        {list.length > 1 && <p className="muted klein">Tasten 1–4 wählen eine Antwort. Links liegen noch {list.length - 1} weitere.</p>}
      </div>
    </div>
  );
}
