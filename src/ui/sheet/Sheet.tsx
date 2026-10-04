// Ein Fenster über dem Schreibtisch (0.2.15+9): ein Bogen Papier, der Tisch
// dahinter wird dunkel. Schließen mit Esc, mit dem X oder mit einem Klick daneben.
// Der Fokus springt hinein und bleibt drin (Tab läuft im Kreis); zurück zum
// auslösenden Gegenstand bringt ihn useFocusReturn.

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

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
  children: ReactNode;
}

function fokussierbare(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function Sheet({ title, size, onClose, back, note, noteExtra, className, children }: SheetProps) {
  const titelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  // Beim Öffnen: Fokus ins Fenster – auf das, was data-autofocus trägt, sonst auf den ersten Knopf im Inhalt.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const ziel =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      fokussierbare(root.querySelector<HTMLElement>('.sheet-inhalt') ?? root)[0] ??
      root;
    ziel.focus({ preventScroll: true });
    // Nur beim Öffnen (oder Wechsel zu einem anderen Fenster); ein Reiterwechsel verschiebt den Fokus nicht.
  }, [title]);

  // Verschwindet der Knopf mit dem Fokus (z. B. ein beantworteter Brief), bleibt der Fokus im Fenster.
  useEffect(() => {
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
      className="sheet-dunkel"
      onMouseDown={(e) => {
        // Klick daneben schließt – nicht aber ein Ziehen, das im Fenster begann.
        if (e.target === e.currentTarget) onClose();
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
