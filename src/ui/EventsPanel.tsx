// Ereignisse auf dem Schreibtisch (2.1) und der Terminkalender (2.3): Titel,
// Text und die Antworten als Knöpfe, jeweils mit dem, was sie an Terminen
// kosten. Was eine Antwort bewirkt und ob sie geht, entscheidet src/sim.

import { costLabel } from '../sim/agenda';
import { deskEvents, deskRoutines, resolveEvent, type DeskEvent } from '../sim/events';
import type { GameState } from '../sim/game';
import { balance } from './balance';
import { events } from './events';

function Karte({ game, event, onResolved, className }: { game: GameState; event: DeskEvent; onResolved: (state: GameState) => void; className: string }) {
  const gesperrt = event.choices.find((c) => !c.ok);
  return (
    <article className={className}>
      <h2>{event.title}</h2>
      <p>{event.text}</p>
      <div className="actions">
        {event.choices.map((choice) => (
          <button
            key={choice.id}
            disabled={!choice.ok}
            title={choice.reason}
            className={choice.overtime > 0 ? 'ueberstunde' : undefined}
            onClick={() => {
              const r = resolveEvent(game, balance, events, event.id, choice.id);
              if (r.ok) onResolved(r.state);
            }}
          >
            {choice.label} <span className="kosten">· {costLabel(choice.cost, choice.overtime)}</span>
          </button>
        ))}
      </div>
      {gesperrt && <p className="hint">{gesperrt.reason}</p>}
    </article>
  );
}

export function EventsPanel({ game, onResolved }: { game: GameState; onResolved: (state: GameState) => void }) {
  const offen = deskEvents(game, balance, events);
  const termine = deskRoutines(game, balance, events);
  if (offen.length === 0 && termine.length === 0) return null;
  return (
    <section className="events">
      {offen.map((event) => (
        <Karte key={event.id} game={game} event={event} onResolved={onResolved} className="event" />
      ))}
      {termine.length > 0 && (
        <details className="kalender" open>
          <summary>Terminkalender – was diese Runde noch ginge</summary>
          {termine.map((event) => (
            <Karte key={event.id} game={game} event={event} onResolved={onResolved} className="event termin" />
          ))}
        </details>
      )}
    </section>
  );
}
