// Fenster „Wer wartet“ (0.2.15+11): Stehen mehrere vor der Tür, sucht Jacob aus,
// wen er hereinbittet – wessen Frist abläuft, steht vorn (Reihenfolge aus inbox.ts).
// Wer warten muss, bleibt draußen; das Ereignis bleibt offen.

import { figures } from '../figureContent';
import { figureOf } from '../figures';
import { SilhouetteForm } from '../Silhouette';
import type { SheetContext } from './types';

export function WaitingSheet({ ctx, onVisitor }: { ctx: SheetContext; onVisitor: (eventId: string) => void }) {
  const { visitors, appearances } = ctx.inbox;
  if (visitors.length === 0) return <p className="muted leer">Vor der Tür wartet niemand mehr.</p>;
  return (
    <ul className="wartende-liste" aria-label="Wer vor der Tür wartet">
      {visitors.map((e, i) => {
        const a = appearances[e.id];
        const name = a?.kind === 'visitor' ? a.name : e.title;
        const form = figureOf(figures, a?.kind === 'visitor' ? a.figure : '');
        return (
          <li key={e.id} className={e.urgent ? 'dringend' : undefined}>
            <span className="wartende-figur" aria-hidden="true">
              <SilhouetteForm kind={form} name="" size={40} />
            </span>
            <span className="wartende-text">
              <strong>{name}</strong> – {e.title}
              <span className="stapel-meta">
                {e.urgent ? (
                  <>
                    <span className="siegel" aria-hidden="true" /> <span className="frist-text">Frist läuft ab</span>
                  </>
                ) : (
                  `wartet noch ${e.roundsLeft} Runden`
                )}
              </span>
            </span>
            <button type="button" className={i === 0 ? 'primary klein-primary' : undefined} onClick={() => onVisitor(e.id)} data-autofocus={i === 0 ? true : undefined}>
              Hereinbitten
            </button>
          </li>
        );
      })}
    </ul>
  );
}
