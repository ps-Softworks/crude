// Rundenwechsel (0.2.15+10): Die Glocke ist geläutet – das Kalenderblatt mit dem
// alten Datum reißt ab, darunter steht das neue, dazu ein Blick zurück auf das, was
// über Nacht geschah (aus dem Protokoll der Runde). Dann liegt der Schreibtisch
// wieder da: Zeitung, neue Briefe, vielleicht klopft es. Unter einer Sekunde,
// Klick oder Taste überspringt. Bei „weniger Bewegung“ nur ein kurzes Einblenden.

import { useEffect, useRef } from 'react';

export const UEBERGANG_MS = 950;
const RUHIG_MS = 300;

function ruhig(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function RoundTransition({ from, to, round, lines, onDone }: { from: string; to: string; round: number; lines: readonly string[]; onDone: () => void }) {
  const fertig = useRef(false);
  const ende = useRef(onDone);
  ende.current = onDone;

  useEffect(() => {
    const schluss = () => {
      if (fertig.current) return;
      fertig.current = true;
      ende.current();
    };
    const t = window.setTimeout(schluss, ruhig() ? RUHIG_MS : UEBERGANG_MS);
    // Jede Taste überspringt – und löst dabei nichts anderes aus.
    const taste = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      schluss();
    };
    window.addEventListener('keydown', taste, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', taste, true);
    };
  }, []);

  return (
    <div
      className="rundenwechsel"
      role="status"
      aria-live="polite"
      onClick={() => {
        if (!fertig.current) {
          fertig.current = true;
          onDone();
        }
      }}
    >
      <div className="rw-kalender" aria-hidden="true">
        <span className="rw-blatt rw-neu">
          <span className="kalender-band" />
          <span className="rw-datum">{to}</span>
          <span className="rw-runde">Runde {round}</span>
        </span>
        <span className="rw-blatt rw-alt">
          <span className="kalender-band" />
          <span className="rw-datum">{from}</span>
        </span>
      </div>
      <p className="rw-zeile">{to}</p>
      {lines.length > 0 && (
        <ul className="rw-rueckblick">
          {lines.map((l, i) => (
            <li key={i} style={{ animationDelay: `${420 + i * 90}ms` }}>
              {l}
            </li>
          ))}
        </ul>
      )}
      <span className="rw-hinweis">Klick oder Taste: weiter</span>
    </div>
  );
}
