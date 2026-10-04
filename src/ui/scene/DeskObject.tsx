// Ein Gegenstand auf dem Schreibtisch (0.2.15+9): ein echter Knopf mit festem
// Namensschild, Kürzel, Abzeichen (Zahl, Frist) und dem Leuchten des Einstiegs.
// Position und Größe in Prozent der Bühne.

import type { ReactNode } from 'react';

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ObjectBadge {
  /** Zahl oder kurzes Wort („neu“). */
  text: string;
  /** Rotes Siegel – immer zusammen mit Text („Frist!“), nie nur Farbe. */
  urgent?: boolean;
}

export function DeskObject({
  id,
  name,
  shortcut,
  at,
  badge,
  status,
  glow,
  fresh,
  sheet,
  onOpen,
  children,
  className,
}: {
  id: string;
  name: string;
  shortcut?: string;
  at: Placement;
  badge?: ObjectBadge | null;
  /** Kurzform am Gegenstand, z. B. „2 bohren · 1 frei“. */
  status?: ReactNode;
  /** Der Einstieg zeigt hierher. */
  glow?: boolean;
  /** Etwas Neues liegt da, das noch niemand angesehen hat (Stempel „neu“, pulsiert einmal). */
  fresh?: boolean;
  /** Welches Fenster der Gegenstand öffnet – dorthin kehrt der Fokus zurück. */
  sheet?: string;
  onOpen: () => void;
  children: ReactNode;
  className?: string;
}) {
  const label = [
    name,
    shortcut ? `Taste ${shortcut}` : null,
    badge ? `${badge.text}${badge.urgent ? ', Frist läuft ab' : ''}` : null,
    fresh ? 'neu' : null,
    typeof status === 'string' ? status : null,
  ]
    .filter(Boolean)
    .join(' – ');
  return (
    <button
      type="button"
      className={`objekt objekt-${id}${glow ? ' tutorial-ziel' : ''}${fresh ? ' frisch' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` }}
      onClick={onOpen}
      data-sheet={sheet}
      aria-label={label}
      title={shortcut ? `${name} (${shortcut})` : name}
    >
      <span className="objekt-bild">{children}</span>
      {status && <span className="objekt-status">{status}</span>}
      <span className="namensschild">
        {name}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
      {fresh && badge?.text !== 'neu' && (
        <span className="neu-stempel" aria-hidden="true">
          neu
        </span>
      )}
      {badge && (
        <span className={badge.urgent ? 'abzeichen dringend' : 'abzeichen'}>
          {badge.urgent && <span className="siegel" aria-hidden="true" />}
          {badge.text}
          {badge.urgent && ' · Frist!'}
        </span>
      )}
    </button>
  );
}
