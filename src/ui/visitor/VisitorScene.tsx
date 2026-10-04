// Besuch am Schreibtisch (0.2.15+10): Eine Person tritt durch die Tür vor Jacobs
// Tisch (Silhouette gleitet herein und wird größer), darunter liegt das Sprechblatt
// mit Text und Antwortkarten (Tasten 1–4). Nach der Antwort steht das Ergebnis als
// Nachsatz da, mit „Weiter“ geht die Figur. Esc oder „Bitten Sie zu warten“ schickt
// sie zurück vor die Tür – das Ereignis bleibt offen.
//
// Szenen (Geburt, Brand, Blitz, Sturm) kommen genauso, nur als Vollbild statt Person.
// Die Antworten laufen über dieselbe EventCard und resolveEvent wie Briefe.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { DeskEvent } from '../../sim/events';
import type { GameState } from '../../sim/game';
import { EventCard } from '../EventCard';
import { events } from '../events';
import { figures } from '../figureContent';
import { figureOf } from '../figures';
import type { Appearance } from '../inbox';
import { SilhouetteForm } from '../Silhouette';
import { resultText } from '../visitors';
import { TableauBild } from './TableauBild';

const FOKUSSIERBAR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const GEHEN_MS = 260;

function ruhig(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function VisitorScene({
  game,
  eventId,
  event,
  appearance,
  onGame,
  onWait,
  onLeave,
}: {
  game: GameState;
  eventId: string;
  /** Das Ereignis, solange es offen ist – nach der Antwort ist es weg, dann gilt die letzte Fassung. */
  event: DeskEvent | null;
  appearance: Appearance;
  onGame: (state: GameState) => void;
  /** Zurück vor die Tür, das Ereignis bleibt offen. */
  onWait: () => void;
  /** Gespräch beendet, die Figur ist gegangen. */
  onLeave: () => void;
}) {
  const titelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const letzte = useRef<DeskEvent | null>(event);
  if (event) letzte.current = event;
  const zeigen = event ?? letzte.current;
  const [nachsatz, setNachsatz] = useState<string | null>(null);
  const [geht, setGeht] = useState(false);

  const besuch = appearance.kind === 'visitor';
  const name = appearance.kind === 'visitor' ? appearance.name : null;

  // Verschwindet das Ereignis, ohne dass hier geantwortet wurde (Rundenwechsel), geht die Figur still.
  useEffect(() => {
    if (!event && nachsatz === null) onLeave();
  }, [event, nachsatz, onLeave]);

  // Beim Eintreten: Fokus auf die erste mögliche Antwort; nach der Antwort auf „Weiter“.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const ziel = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('.actions button:not(:disabled)') ?? root;
    ziel.focus({ preventScroll: true });
  }, [nachsatz]);

  function gehen() {
    if (geht) return;
    setGeht(true);
    window.setTimeout(onLeave, ruhig() ? 0 : GEHEN_MS);
  }

  function antwort(state: GameState, choiceId: string) {
    onGame(state);
    // Nach der Lupe (ohne Wahl) bleibt das Gespräch offen.
    if (choiceId === '') return;
    setNachsatz(resultText(events, eventId, choiceId) ?? '');
  }

  function tasten(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !ref.current) return;
    const liste = [...ref.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR)];
    if (liste.length === 0) return;
    const erstes = liste[0];
    const letztes = liste[liste.length - 1];
    if (e.shiftKey && (document.activeElement === erstes || document.activeElement === ref.current)) {
      e.preventDefault();
      letztes.focus();
    } else if (!e.shiftKey && document.activeElement === letztes) {
      e.preventDefault();
      erstes.focus();
    }
  }

  if (!zeigen) return null;

  return (
    <div
      ref={ref}
      className={`besuch ${besuch ? 'als-person' : 'als-szene'}${geht ? ' geht' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titelId}
      tabIndex={-1}
      onKeyDown={tasten}
    >
      {besuch ? (
        <div className="besuch-figur" aria-hidden="true">
          <SilhouetteForm kind={figureOf(figures, appearance.kind === 'visitor' ? appearance.figure : '')} name="" size={230} />
          <span className="besuch-name">{name}</span>
        </div>
      ) : (
        <div className="szene-bild" aria-hidden="true">
          <TableauBild eventId={eventId} />
        </div>
      )}
      <div className="sprechblatt">
        <p className="sprechblatt-wer">{besuch ? `${name} steht vor dem Schreibtisch` : 'Ein Augenblick, den keiner vergisst'}</p>
        <h2 id={titelId} className="sprechblatt-titel">
          {zeigen.title}
        </h2>
        {nachsatz === null ? (
          <>
            <EventCard game={game} event={zeigen} onResolved={antwort} className="event besuch-karte" hotkeys hideTitle />
            <p className="sprechblatt-fuss">
              <span className="muted klein">Tasten 1–4 antworten.</span>
              <button type="button" className="link" onClick={onWait}>
                {besuch ? 'Bitten Sie zu warten (Esc)' : 'Später – zum Notizspieß (Esc)'}
              </button>
            </p>
          </>
        ) : (
          <>
            {nachsatz && <p className="nachsatz">{nachsatz}</p>}
            <p className="sprechblatt-fuss">
              <button type="button" className="primary" onClick={gehen} data-autofocus>
                Weiter
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
