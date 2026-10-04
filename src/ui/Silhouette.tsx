// Silhouetten (2.12, GDD §16): Platzhalter für die gezeichneten Porträts – ein
// Scherenschnitt im Oval, wie ein Medaillon aus der Zeit. Alle Formen teilen
// Kopf, Hals und Schultern, nur Kopfbedeckung und Haar unterscheiden sie.
// Farben kommen aus den CSS-Variablen (style.css).

import type { ReactNode } from 'react';
import { figures } from './figureContent';
import { figureOf, type SilhouetteKind } from './figures';

const KOPF = <ellipse cx="30" cy="33" rx="9.5" ry="11.5" />;
const HALS = <path d="M25.5 40 L34.5 40 L35.5 52 L24.5 52 Z" />;
const SCHULTERN = <path d="M5 74 C7 58 17 51 30 51 C43 51 53 58 55 74 Z" />;

const FORMEN: Record<SilhouetteKind, ReactNode> = {
  kopf: (
    <>
      {SCHULTERN}
      {HALS}
      {KOPF}
    </>
  ),
  hut: (
    <>
      {SCHULTERN}
      {HALS}
      {KOPF}
      {/* Breitkrempiger Hut mit Delle im Kopf */}
      <ellipse cx="30" cy="24.5" rx="17" ry="3.2" />
      <path d="M21 25 C20.5 15 23 10.5 27 10.5 L30 12.5 L33 10.5 C37 10.5 39.5 15 39 25 Z" />
    </>
  ),
  zylinder: (
    <>
      {SCHULTERN}
      {HALS}
      {KOPF}
      <ellipse cx="30" cy="24" rx="13.5" ry="2.6" />
      <path d="M22 24.5 L23 5 L37 5 L38 24.5 Z" />
    </>
  ),
  muetze: (
    <>
      {SCHULTERN}
      {HALS}
      {KOPF}
      {/* Schirmmütze und Vollbart */}
      <path d="M20 27 C19.5 17 24 13.5 30.5 13.5 C37 13.5 41 17 40.5 26 Z" />
      <path d="M37 24.5 L49 27.5 L38.5 28.5 Z" />
      <path d="M20.5 33 C20 47 26 50 30 50 C34 50 40 47 39.5 33 C36 40 24 40 20.5 33 Z" />
    </>
  ),
  strohhut: (
    <>
      {SCHULTERN}
      {HALS}
      {KOPF}
      {/* Flacher Strohhut mit sehr breiter Krempe */}
      <ellipse cx="30" cy="24" rx="22" ry="3" />
      <path d="M21.5 24.5 L22.5 14 L37.5 14 L38.5 24.5 Z" />
    </>
  ),
  frau: (
    <>
      <path d="M10 74 C12 60 20 53 30 53 C40 53 48 60 50 74 Z" />
      <path d="M26.5 40 L33.5 40 L34.5 54 L25.5 54 Z" />
      {/* Hochgestecktes Haar mit Knoten am Hinterkopf */}
      <circle cx="40" cy="25" r="6" />
      <ellipse cx="30" cy="32" rx="9" ry="11" />
      <path d="M20.5 31 C20 20 25 18 30 18 C36 18 40.5 21 39.5 31 C36 25 26 24 20.5 31 Z" />
    </>
  ),
  kind: (
    <>
      <path d="M15 74 C16 63 22 58 30 58 C38 58 44 63 45 74 Z" />
      <circle cx="30" cy="44" r="12.5" />
      {/* Haarbüschel */}
      <path d="M27 32 C28 28 31 28 33 30 C31 30 30 31 29.5 33 Z" />
    </>
  ),
};

/** Silhouette einer Person aus content/figures.yaml, z. B. „ruth“. */
export function Silhouette({ id, name, size = 56 }: { id: string; name: string; size?: number }) {
  return <SilhouetteForm kind={figureOf(figures, id)} name={name} size={size} />;
}

export function SilhouetteForm({ kind, name, size = 56, bare = false }: { kind: SilhouetteKind; name: string; size?: number; bare?: boolean }) {
  // bare (0.2.15+11): ohne Oval und Rahmen – eine Person, die im Raum steht, kein Medaillon.
  if (bare) {
    return (
      <svg className="silhouette frei" viewBox="2 2 56 72" width={size} height={(size * 72) / 56} role="img" aria-label={name}>
        <title>{name}</title>
        <g className="silhouette-figur">{FORMEN[kind]}</g>
      </svg>
    );
  }
  return (
    <svg className="silhouette" viewBox="0 0 60 74" width={size} height={(size * 74) / 60} role="img" aria-label={name}>
      <title>{name}</title>
      <defs>
        <clipPath id={`oval-${kind}`}>
          <ellipse cx="30" cy="37" rx="28" ry="35" />
        </clipPath>
      </defs>
      <ellipse className="silhouette-grund" cx="30" cy="37" rx="28" ry="35" />
      <g className="silhouette-figur" clipPath={`url(#oval-${kind})`}>
        {FORMEN[kind]}
      </g>
      <ellipse className="silhouette-rahmen" cx="30" cy="37" rx="28" ry="35" />
    </svg>
  );
}

/** Bohrturm als Zeichen neben dem Titel – derselbe Scherenschnitt-Stil. */
export function Bohrturm({ size = 34 }: { size?: number }) {
  return (
    <svg className="bohrturm" viewBox="0 0 40 48" width={size} height={(size * 48) / 40} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M20 3 L8 45 M20 3 L32 45 M5 45 L35 45" />
        <path d="M17.2 13 L22.8 13 M14.4 23 L25.6 23 M11.6 33 L28.4 33 M17.2 13 L25.6 23 L11.6 33 L31 44 M22.8 13 L14.4 23 L28.4 33 L9 44" strokeWidth="1.4" />
      </g>
    </svg>
  );
}
