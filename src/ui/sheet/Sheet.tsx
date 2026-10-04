// Ein Fenster über dem Schreibtisch (0.2.15+9): ein Bogen Papier, der Tisch
// dahinter wird dunkel. Schließen mit Esc, mit dem X oder mit einem Klick daneben.
// Der Fokus springt hinein und bleibt drin (Tab läuft im Kreis); zurück zum
// auslösenden Gegenstand bringt ihn useFocusReturn.

import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { stageScale } from '../stage';

const FOKUSSIERBAR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export type SheetSize = 'brief' | 'mappe';

export interface SheetProps {
  title: string;
  size: SheetSize;
  onClose: () => void;
  /** „‹ zurück zu …“ oben links. */
  back?: { label: string; onBack: () => void };
  /** Randnotiz unten (Rückmeldung der letzten Aktion). */
  note?: string | null;
  /** Für Querverweise neben der Randnotiz, z. B. „zum Kassenbuch“. */
  noteExtra?: ReactNode;
  className?: string;
  /** Aus welchem Gegenstand das Fenster aufgeht (CSS-Selektor) – dort ist der Ursprung der Bewegung. */
  origin?: string;
  /** Das Fenster geht gerade zu (kurz noch sichtbar, nicht mehr bedienbar). */
  closing?: boolean;
  children: ReactNode;
}

/** Was Tab der Reihe nach erreicht – ohne tabindex="-1" (z. B. inaktive Reiter), sonst bricht die Fokusfalle. */
export function fokussierbare(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter(
    (el) => el.tabIndex >= 0 && (el.offsetParent !== null || el === document.activeElement),
  );
}

export function Sheet({ title, size, onClose, back, note, noteExtra, className, origin, closing = false, children }: SheetProps) {
  const titelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  // Übergang (0.2.15+10): Das Fenster wächst aus dem Gegenstand heraus, der es geöffnet hat.
  useLayoutEffect(() => {
    const el = ref.current;
    const quelle = origin ? document.querySelector(origin) : null;
    if (!el || !quelle) return;
    const q = quelle.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const f = stageScale(el);
    el.style.transformOrigin = `${(q.left + q.width / 2 - r.left) / f}px ${(q.top + q.height / 2 - r.top) / f}px`;
    // Nur beim Öffnen.
  }, [title]);

  // Beim Öffnen: Fokus ins Fenster – auf das, was data-autofocus trägt, sonst auf den
  // aktiven Reiter, sonst auf das Fenster selbst. Nie von selbst auf einen Knopf im
  // Inhalt (0.2.15+12): ein zweites Enter würde sonst ungelesen kaufen oder antworten.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const ziel = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? root;
    ziel.focus({ preventScroll: true });
    // Nur beim Öffnen (oder Wechsel zu einem anderen Fenster); ein Reiterwechsel verschiebt den Fokus nicht.
  }, [title]);

  // Verschwindet der Knopf mit dem Fokus (z. B. ein beantworteter Brief), bleibt der Fokus im Fenster.
  useEffect(() => {
    if (closing) return;
    const aktiv = document.activeElement;
    if (ref.current && (!aktiv || aktiv === document.body)) ref.current.focus({ preventScroll: true });
  });

  function tasten(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    // Fokusfalle: Tab und Umschalt+Tab laufen im Fenster im Kreis.
    const liste = fokussierbare(ref.current);
    if (liste.length === 0) {
      e.preventDefault();
      return;
    }
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

  return (
    <div
      className={closing ? 'sheet-dunkel schliesst' : 'sheet-dunkel'}
      inert={closing}
      onMouseDown={(e) => {
        // Klick daneben schließt – nicht aber ein Ziehen, das im Fenster begann.
        // preventDefault: sonst zieht der Mausklick den Fokus auf <body>, nachdem er schon zum Gegenstand zurückgekehrt ist.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        ref={ref}
        className={`sheet sheet-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        onKeyDown={tasten}
      >
        <div className="sheet-kopf">
          {back && (
            <button type="button" className="link sheet-zurueck" onClick={back.onBack}>
              ‹ zurück zu {back.label}
            </button>
          )}
          <h2 id={titelId}>{title}</h2>
          <button type="button" className="sheet-zu" onClick={onClose} aria-label="Fenster schließen (Esc)" title="Schließen (Esc)">
            ×
          </button>
        </div>
        <div className="sheet-inhalt">{children}</div>
        {(note || noteExtra) && (
          <p className="randnotiz" role="status">
            {note}
            {noteExtra}
          </p>
        )}
      </div>
    </div>
  );
}
