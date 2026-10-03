// Ereignisse auf dem Schreibtisch (2.1): Titel, Text und die Antworten als Knöpfe.
// Was eine Antwort bewirkt und ob sie geht, entscheidet src/sim/events.

import { deskEvents, resolveEvent } from '../sim/events';
import type { GameState } from '../sim/game';
import { events } from './events';

export function EventsPanel({ game, onResolved }: { game: GameState; onResolved: (state: GameState) => void }) {
  const offen = deskEvents(game, events);
  if (offen.length === 0) return null;
  return (
    <section className="events">
      {offen.map((event) => (
        <article key={event.id} className="event">
          <h2>{event.title}</h2>
          <p>{event.text}</p>
          <div className="actions">
            {event.choices.map((choice) => (
              <button
                key={choice.id}
                disabled={!choice.ok}
                title={choice.reason}
                onClick={() => {
                  const r = resolveEvent(game, events, event.id, choice.id);
                  if (r.ok) onResolved(r.state);
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {event.choices.some((c) => !c.ok) && (
            <p className="hint">{event.choices.find((c) => !c.ok)?.reason}</p>
          )}
        </article>
      ))}
    </section>
  );
}
