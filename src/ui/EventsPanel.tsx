// Ereignisse auf dem Schreibtisch (2.1) und der Terminkalender (2.3): Titel,
// Text und die Antworten als Knöpfe, jeweils mit dem, was sie an Terminen
// kosten. Was eine Antwort bewirkt und ob sie geht, entscheidet src/sim.
// Posteingang (2.4): Briefe mit Briefart, Frist und rotem Siegel.
// Dokumentenprüfung (2.5): Dokument neben dem Vergleichsstück, Lupe je Feld.

import { costLabel } from '../sim/agenda';
import { inspectField, type DeskDocument } from '../sim/documents';
import { deskEvents, deskMail, deskRoutines, resolveEvent, type DeskEvent, type MailKind } from '../sim/events';
import type { GameState } from '../sim/game';
import { balance } from './balance';
import { events } from './events';

const BRIEFART: Record<MailKind, string> = {
  offer: 'Angebot',
  demand: 'Forderung',
  info: 'Information',
  personal: 'Persönliches',
};

function frist(event: DeskEvent): string {
  return event.urgent ? 'Frist läuft ab – sonst gilt die Standardantwort' : `noch ${event.roundsLeft} Runden Zeit`;
}

const BEFUND = { unchecked: '', ok: 'stimmt', forged: 'Fälschung!' } as const;

function Dokument({ game, eventId, doc, onResolved }: { game: GameState; eventId: string; doc: DeskDocument; onResolved: (state: GameState) => void }) {
  return (
    <div className="dokument">
      <table>
        <thead>
          <tr>
            <th />
            <th>{doc.title}</th>
            <th>laut {doc.reference}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doc.fields.map((f) => (
            <tr key={f.id} className={f.verdict === 'forged' ? 'gefaelscht' : undefined}>
              <th scope="row">{f.label}</th>
              <td>{f.value}</td>
              <td>{f.reference ?? '–'}</td>
              <td>
                {f.verdict === 'unchecked' ? (
                  <button
                    className="lupe"
                    disabled={doc.checksLeft === 0}
                    title="Dieses Feld mit der Lupe prüfen"
                    onClick={() => {
                      const r = inspectField(game, balance, events, eventId, f.id);
                      if (r.ok) onResolved(r.state);
                    }}
                  >
                    Lupe
                  </button>
                ) : (
                  <span className={`befund ${f.verdict}`}>{BEFUND[f.verdict]}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {doc.checksLeft > 0 ? `Die Lupe reicht noch für ${doc.checksLeft === 1 ? 'ein Feld' : `${doc.checksLeft} Felder`}.` : 'Für weitere Prüfungen fehlt die Zeit.'}
      </p>
    </div>
  );
}

function Karte({ game, event, onResolved, className }: { game: GameState; event: DeskEvent; onResolved: (state: GameState) => void; className: string }) {
  const gesperrt = event.choices.find((c) => !c.ok);
  return (
    <article className={className}>
      {event.mail && (
        <p className="briefkopf">
          {event.urgent && <span className="siegel" title="Dringend" aria-label="Rotes Siegel" />}
          <span className="briefart">{BRIEFART[event.mail]}</span> · {frist(event)}
        </p>
      )}
      <h2>{event.title}</h2>
      <p>{event.text}</p>
      {event.document && <Dokument game={game} eventId={event.id} doc={event.document} onResolved={onResolved} />}
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
  const offen = deskEvents(game, balance, events).filter((e) => !e.mail);
  const post = deskMail(game, balance, events);
  const termine = deskRoutines(game, balance, events);
  if (offen.length === 0 && post.length === 0 && termine.length === 0) return null;
  return (
    <section className="events">
      {offen.map((event) => (
        <Karte key={event.id} game={game} event={event} onResolved={onResolved} className="event" />
      ))}
      {post.length > 0 && (
        <details className="posteingang" open>
          <summary>Posteingang – {post.length === 1 ? '1 Brief' : `${post.length} Briefe`}</summary>
          {post.map((event) => (
            <Karte key={event.id} game={game} event={event} onResolved={onResolved} className={event.urgent ? 'event brief dringend' : 'event brief'} />
          ))}
        </details>
      )}
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
