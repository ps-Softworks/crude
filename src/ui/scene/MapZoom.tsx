// Zoom Wandkarte ⇄ Karte (0.2.15+10): Ein Bogen Kartenpapier wächst aus der
// Wandkarte bis über die ganze Bühne (hinein) oder schrumpft zurück an die Wand
// (hinaus). Erst danach baut sich die Karte auf. Nur transform und opacity; bei
// „weniger Bewegung“ blendet er nur kurz.

import { useLayoutEffect, useRef } from 'react';
import { stageScale } from '../stage';
import { WallMapShape } from './objects/Shapes';
import { reducedMotion } from '../settings';

export const ZOOM_MS = 380;

export function MapZoom({ dir, onDone }: { dir: 'in' | 'out'; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ende = useRef(onDone);
  ende.current = onDone;

  useLayoutEffect(() => {
    const el = ref.current;
    const buehne = el?.closest('.buehne');
    const wand = buehne?.querySelector('.objekt-karte .objekt-bild');
    const fertig = () => ende.current();
    if (!el || !buehne || !wand || typeof el.animate !== 'function') {
      fertig();
      return;
    }
    const b = buehne.getBoundingClientRect();
    const w = wand.getBoundingClientRect();
    const f = stageScale(el);
    const klein = `translate(${(w.left - b.left) / f}px, ${(w.top - b.top) / f}px) scale(${w.width / b.width}, ${w.height / b.height})`;
    const gross = 'translate(0px, 0px) scale(1, 1)';
    const ruhig = reducedMotion();
    const frames = ruhig
      ? [{ opacity: dir === 'in' ? 0 : 1 }, { opacity: dir === 'in' ? 1 : 0 }]
      : dir === 'in'
        ? [
            { transform: klein, opacity: 0.6 },
            { transform: gross, opacity: 1 },
          ]
        : [
            { transform: gross, opacity: 1 },
            { transform: klein, opacity: 0.4 },
          ];
    const a = el.animate(frames, { duration: ruhig ? 150 : ZOOM_MS, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'forwards' });
    a.onfinish = fertig;
    return () => {
      a.onfinish = null;
      a.cancel();
    };
  }, [dir]);

  return (
    <div ref={ref} className="karten-zoom" aria-hidden="true">
      <WallMapShape />
    </div>
  );
}
