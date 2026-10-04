// Ein Ereignis als Karte (2.1, ab 0.2.15+9 eigene Datei): Titel, Text und die
// Antworten als Knöpfe mit dem, was sie an Terminen kosten. Genutzt für Briefe,
// Vorfälle, Termine (und ab Etappe 2 Besucher). Was eine Antwort bewirkt und ob
// sie geht, entscheidet src/sim. Briefe (2.4) zeigen Briefart, Frist und rotes
// Siegel; die Dokumentenprüfung (2.5) legt das Dokument neben das Vergleichsstück.

import { useEffect } from 'react';
import { costLabel } from '../sim/agenda';
import { inspectField, type DeskDocument } from '../sim/documents';
import { resolveEvent, type DeskEvent, type MailKind } from '../sim/events';
import type { GameState } from '../sim/game';
import { balance } from './balance';
import { events } from './events';
import { choiceIndex, keyInput } from './keys';

export const BRIEFART: Record<MailKind, string> = {
  offer: 'Angebot',
  demand: 'Forderung',
  info: 'Information',
  personal: 'Persönliches',
};

export function frist(event: DeskEvent): string {
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

export function EventCard({
  game,
  event,
  onResolved,
  className,
  hotkeys = false,
}: {
  game: GameState;
  event: DeskEvent;
  onResolved: (state: GameState) => void;
  className: string;
  /** Tasten 1–4 wählen eine Antwort (nur für die Karte, die gerade vorn liegt). */
  hotkeys?: boolean;
}) {
  const gesperrt = event.choices.find((c) => !c.ok);

  function antworte(choiceId: string) {
    const r = resolveEvent(game, balance, events, event.id, choiceId);
    if (r.ok) onResolved(r.state);
  }

  useEffect(() => {
    if (!hotkeys) return;
    const taste = (e: KeyboardEvent) => {
      const i = choiceIndex(keyInput(e));
      if (i === null) return;
      const choice = event.choices[i];
      // Gesperrte Antworten lassen sich auch per Taste nicht wählen.
      if (!choice || !choice.ok) return;
      e.preventDefault();
      antworte(choice.id);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  });

  return (
    <article className={className}>
      {event.mail && (
        <p className="briefkopf">
          {event.urgent && <span className="siegel" title="Dringend" aria-label="Rotes Siegel" />}
          <span className="briefart">{BRIEFART[event.mail]}</span> · {frist(event)}
        </p>
      )}
      {!event.mail && event.urgent && (
        <p className="briefkopf">
          <span className="siegel" aria-hidden="true" /> Frist läuft ab – sonst gilt die Standardantwort
        </p>
      )}
      <h3 className="event-titel">{event.title}</h3>
      <p>{event.text}</p>
      {event.document && <Dokument game={game} eventId={event.id} doc={event.document} onResolved={onResolved} />}
      <div className="actions">
        {event.choices.map((choice, i) => (
          <button
            key={choice.id}
            disabled={!choice.ok}
            title={choice.reason}
            className={choice.overtime > 0 ? 'ueberstunde' : undefined}
            onClick={() => antworte(choice.id)}
          >
            {hotkeys && i < 4 && <span className="taste">{i + 1}</span>}
            {choice.label} <span className="kosten">· {costLabel(choice.cost, choice.overtime)}</span>
          </button>
        ))}
      </div>
      {gesperrt && <p className="hint">{gesperrt.reason}</p>}
    </article>
  );
}
