// Knopf mit Rückfrage im Spiel statt window.confirm (0.4.20+1, siehe confirm.ts): Ein Klick
// klappt eine kleine Notiz mit „Ja …“ und „Abbrechen“ auf. Der Fokus springt auf „Ja“,
// Enter bestätigt, Esc bricht ab und bringt den Fokus zurück auf den Knopf – ohne dass
// Esc zugleich das Fenster schließt.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { confirmKey } from './confirm';

export function ConfirmButton({
  question,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  onConfirm,
  disabled,
  title,
  className,
  children,
}: {
  /** Die Rückfrage, z. B. „Neues Spiel beginnen? Der aktuelle Stand geht verloren.“ */
  question: string;
  /** Beschriftung des Bestätigungsknopfs, z. B. „Ja, neues Spiel“. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const ja = useRef<HTMLButtonElement>(null);
  const abbrechen = useRef<HTMLButtonElement>(null);
  const zurueck = useRef(false);
  const frageId = useId();

  useEffect(() => {
    if (offen) ja.current?.focus({ preventScroll: true });
    else if (zurueck.current) {
      zurueck.current = false;
      knopf.current?.focus({ preventScroll: true });
    }
  }, [offen]);

  function schliessen() {
    zurueck.current = true;
    setOffen(false);
  }

  function bestaetigen() {
    setOffen(false);
    onConfirm();
  }

  function tasten(e: KeyboardEvent<HTMLDivElement>) {
    const aktion = confirmKey(e.key, document.activeElement === abbrechen.current);
    if (!aktion) return;
    // Esc und Enter gehören der Rückfrage – nicht dem Fenster und nicht dem Schreibtisch.
    e.preventDefault();
    e.stopPropagation();
    if (aktion === 'cancel') schliessen();
    else bestaetigen();
  }

  if (!offen) {
    return (
      <button ref={knopf} type="button" className={className} disabled={disabled} title={title} onClick={() => setOffen(true)}>
        {children}
      </button>
    );
  }
  return (
    <div className="rueckfrage" role="alertdialog" aria-modal="false" aria-labelledby={frageId} onKeyDown={tasten}>
      <p id={frageId}>{question}</p>
      <p className="rueckfrage-knoepfe">
        <button ref={ja} type="button" className="primary" onClick={bestaetigen}>
          {confirmLabel}
        </button>{' '}
        <button ref={abbrechen} type="button" onClick={schliessen}>
          {cancelLabel}
        </button>
      </p>
    </div>
  );
}
