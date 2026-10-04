// Rundgang (0.2.15+10): Beim ersten Start zeigt die Einstiegshilfe jeden
// Gegenstand einmal kurz – er leuchtet, daneben steht ein Satz, wozu er da ist.
// Läuft von selbst weiter; Enter/→ weiter, ← zurück, Esc beendet. Texte aus
// content/rundgang.yaml.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourStep } from '../tour';

const SCHRITT_MS = 2600;
const BREITE = 380;

function ziel(object: string): Element | null {
  return document.querySelector(object === 'ruth' ? '.unterlage-platz' : `.objekt-${object}`);
}

export function IntroTour({ steps, onStep, onEnd }: { steps: readonly TourStep[]; onStep: (object: string | null) => void; onEnd: () => void }) {
  const [i, setI] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const schritt = steps[i];
  const ende = useRef(onEnd);
  ende.current = onEnd;
  const zeige = useRef(onStep);
  zeige.current = onStep;
  const jetzt = useRef(i);
  jetzt.current = i;
  const weiter = () => (jetzt.current + 1 < steps.length ? setI(jetzt.current + 1) : ende.current());

  // Leuchten am Gegenstand und die Sprechblase daneben.
  useLayoutEffect(() => {
    if (!schritt) return;
    zeige.current(schritt.object);
    const el = ziel(schritt.object);
    const buehne = box.current?.closest('.buehne');
    if (!el || !buehne) return setPos(null);
    const r = el.getBoundingClientRect();
    const b = buehne.getBoundingClientRect();
    const hoehe = box.current?.offsetHeight ?? 140;
    const x = r.left - b.left;
    const y = r.top - b.top;
    const mitteX = Math.max(12, Math.min(b.width - BREITE - 12, x + r.width / 2 - BREITE / 2));
    const mitteY = Math.max(12, Math.min(b.height - hoehe - 12, y + r.height / 2 - hoehe / 2));
    // Unter dem Gegenstand, sonst darüber, sonst daneben – nie darauf.
    let left = mitteX;
    let top: number;
    if (r.bottom - b.top + 14 + hoehe <= b.height - 8) top = r.bottom - b.top + 14;
    else if (y - hoehe - 14 >= 8) top = y - hoehe - 14;
    else {
      top = mitteY;
      left = x + r.width + 14 + BREITE <= b.width - 8 ? x + r.width + 14 : Math.max(8, x - BREITE - 14);
    }
    setPos({ left, top });
  }, [schritt]);

  useEffect(() => () => zeige.current(null), []);

  // Von selbst weiter.
  useEffect(() => {
    const t = window.setTimeout(weiter, SCHRITT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, steps.length]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (k === 'Escape') ende.current();
      else if (k === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (k === 'Enter' || k === 'ArrowRight' || k === ' ') weiter();
    };
    window.addEventListener('keydown', taste, true);
    return () => window.removeEventListener('keydown', taste, true);
    // weiter liest nur Refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.primary')?.focus({ preventScroll: true });
  }, []);

  if (!schritt) return null;
  return (
    <div className="rundgang" role="dialog" aria-modal="false" aria-label="Rundgang über den Schreibtisch">
      <div ref={box} className="rundgang-blase" style={pos ? { left: pos.left, top: pos.top, width: BREITE } : { width: BREITE }} aria-live="polite">
        <p className="rundgang-zaehler">
          Rundgang · {i + 1} von {steps.length}
        </p>
        <p className="rundgang-text">{schritt.text}</p>
        <p className="knoepfe">
          <button type="button" className="link" onClick={() => ende.current()}>
            Rundgang beenden (Esc)
          </button>
          <button type="button" disabled={i === 0} onClick={() => setI(i - 1)}>
            ‹
          </button>
          <button type="button" className="primary" onClick={weiter}>
            {i + 1 < steps.length ? 'Weiter (Enter)' : 'Fertig'}
          </button>
        </p>
      </div>
    </div>
  );
}
