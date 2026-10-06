// Wandtelefon ab Kapitel 2 (0.4.20+34): Holzkasten mit zwei Glocken, Sprechtrichter, Kurbel und
// Hörer an der Schnur. Klingelt es, zittern die Glocken (ohne Bewegung bei reduced motion).
import { useEffect } from 'react';
import { playSound } from '../sound';

export function Telefon({ klingelt }: { klingelt: boolean }) {
  // Es klingelt: zwei Glocken (einmal, wenn der Anruf eintrifft).
  useEffect(() => {
    if (klingelt) playSound('telefon');
  }, [klingelt]);
  return (
    <svg className={`telefon${klingelt ? ' klingelt' : ''}`} viewBox="0 0 60 100" role="presentation" aria-hidden="true">
      <rect className="telefon-brett" x="14" y="4" width="32" height="92" rx="2" />
      <g className="telefon-glocken">
        <circle cx="23" cy="18" r="7" />
        <circle cx="37" cy="18" r="7" />
        <rect x="28" y="16" width="4" height="4" />
      </g>
      <rect className="telefon-kasten" x="17" y="28" width="26" height="40" rx="2" />
      <path className="telefon-trichter" d="M27 46 h6 l4 10 h-14 z" />
      <circle className="telefon-trichter" cx="30" cy="57" r="6" />
      <path className="telefon-kurbel" d="M43 38 h6 v8" />
      <circle className="telefon-kurbel" cx="49" cy="47" r="2" />
      <path className="telefon-schnur" d="M17 40 C 8 46, 6 58, 10 66" />
      <rect className="telefon-hoerer" x="5" y="64" width="9" height="16" rx="3" />
      <rect className="telefon-pult" x="16" y="72" width="28" height="6" rx="1" />
    </svg>
  );
}
