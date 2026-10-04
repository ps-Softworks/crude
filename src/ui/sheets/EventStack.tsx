// Stapel aus Ereignissen (0.2.15+9): links die Liste, rechts die Karte, die
// gerade vorn liegt. Für Post, Vorfälle und Termine. Tasten 1–4 antworten auf
// die vordere Karte. Ab 0.2.15+11 endet eine Antwort wie beim Besuch: Das
// Ergebnis steht da (Text, Kasse, Tank), erst „Weiter“ legt die nächste Karte vor.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeskEvent } from '../../sim/events';
import type { GameState } from '../../sim/game';
import { EventCard } from '../EventCard';
import { keyRange } from '../format';
import { Outcome, outcomeOf, type OutcomeData } from '../Outcome';

export function EventStack({
  game,
  list,
  empty,
  onResolved,
  cardClass,
  itemMeta,
  listLabel,
  focus,
  next = 'nächste Karte',
}: {
  game: GameState;
  list: readonly DeskEvent[];
  empty: ReactNode;
  onResolved: (state: GameState) => void;
  cardClass: (e: DeskEvent) => string;
  /** Kleine Zeile unter dem Titel in der Liste (Briefart, Frist …). */
  itemMeta?: (e: DeskEvent) => ReactNode;
  listLabel: string;
  /** Diese Karte liegt beim Öffnen vorn (z. B. der Brief, auf dessen Zeichen auf der Karte geklickt wurde). */
  focus?: string;
  /** Wie die nächste Karte heißt, für „Weiter – nächster Brief“. */
  next?: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(focus ?? null);
  const [ergebnis, setErgebnis] = useState<OutcomeData | null>(null);
  const weiterRef = useRef<HTMLButtonElement>(null);
  const kartenRef = useRef<HTMLDivElement>(null);

  // Ergebnis da: Fokus auf „Weiter“.
  useEffect(() => {
    if (ergebnis) weiterRef.current?.focus({ preventScroll: true });
  }, [ergebnis]);

  // Enter oder Leertaste auf „Weiter“ reichen; eine Ziffer soll hier nichts beantworten.
  function weiter() {
    setErgebnis(null);
    setGewaehlt(null);
    window.setTimeout(() => {
      const root = kartenRef.current;
      (root?.querySelector<HTMLElement>('.actions button:not(:disabled)') ?? root?.closest<HTMLElement>('[role="dialog"]'))?.focus({ preventScroll: true });
    }, 0);
  }

  if (ergebnis) {
    return (
      <div className="stapel stapel-ergebnis">
        <article className="event ergebnis-karte" aria-live="polite">
          <p className="briefkopf">Erledigt</p>
          <h3 className="event-titel">{ergebnis.title}</h3>
          <Outcome data={ergebnis} />
          <p className="ergebnis-fuss">
            <button type="button" className="primary" ref={weiterRef} onClick={weiter} data-autofocus>
              {list.length > 0 ? `Weiter – ${next}` : 'Weiter'}
            </button>
            {list.length > 0 && <span className="muted klein">Noch {list.length} offen.</span>}
          </p>
        </article>
      </div>
    );
  }

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
      <div className="stapel-karte" ref={kartenRef}>
        <EventCard
          key={vorn.id}
          game={game}
          event={vorn}
          onResolved={(state, choiceId) => {
            // Nach der Lupe (ohne Wahl) bleibt die Karte offen.
            if (choiceId !== '') setErgebnis(outcomeOf(game, state, vorn.id, choiceId, vorn.title));
            onResolved(state);
          }}
          className={cardClass(vorn)}
          hotkeys
        />
        <p className="muted klein">
          {keyRange(vorn.choices.length)} {vorn.choices.length === 1 ? 'wählt die Antwort' : 'wählen eine Antwort'}.
          {list.length > 1 && ` Links liegen noch ${list.length - 1} weitere.`}
        </p>
      </div>
    </div>
  );
}
