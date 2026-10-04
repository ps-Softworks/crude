// Ruths Zettel (0.2.15+9) auf der Schreibunterlage: der nächste Schritt oder der
// Hinweis des Einstiegs (Text aus content/tutorial.yaml), bei Krankheit die
// Krankmeldung. Ein Klick (oder Enter) führt dorthin, wo es weitergeht.

import type { NextStep } from '../../sim/desk';
import type { TutorialView } from '../../sim/tutorial';

export function RuthNote({
  step,
  tutorial,
  sickRounds,
  exhausted,
  finished,
  tutorialOffer,
  onGo,
  onTutorial,
}: {
  step: NextStep | null;
  tutorial: TutorialView | null;
  /** Jacob ist krank: noch so viele Runden (0 = gesund). */
  sickRounds: number;
  exhausted: boolean;
  finished: boolean;
  tutorialOffer: boolean;
  /** Zum Ziel des Hinweises; null, wenn es keins gibt. */
  onGo: (() => void) | null;
  onTutorial: (on: boolean) => void;
}) {
  const krank = !finished && sickRounds > 0;
  const kopf = krank ? 'Jacob liegt krank im Bett' : tutorial ? `${tutorial.title} · Schritt ${tutorial.stepNumber} von ${tutorial.stepCount}` : 'Ruths Zettel';
  const text = krank
    ? `${sickRounds > 1 ? `Noch ${sickRounds} Runden.` : 'Diese Runde noch.'} Keine Termine: Ereignisse und Briefe bekommen ihre Standardantwort.`
    : tutorial
      ? tutorial.text
      : (step?.text ?? 'Das Kapitel ist zu Ende.');

  return (
    <div className="unterlage">
      <button
        type="button"
        className={`zettel${krank ? ' krank' : ''}${onGo ? '' : ' ohne-ziel'}`}
        onClick={() => onGo?.()}
        aria-disabled={onGo ? undefined : true}
        aria-label={`Ruths Zettel: ${kopf}. ${text}${onGo ? ' – Enter führt hin.' : ''}`}
      >
        <span className="zettel-kopf">
          {kopf}
          {tutorial && !krank && <span className="zettel-schritt"> – {tutorial.stepLabel}</span>}
        </span>
        <span className="zettel-text">{text}</span>
        {exhausted && !krank && <span className="zettel-ps">PS: Du siehst erschöpft aus. Fehler schleichen sich ein.</span>}
        {onGo && <span className="zettel-hin">Hingehen →</span>}
      </button>
      <span className="unterlage-links">
        {tutorial ? (
          <button type="button" className="link" onClick={() => onTutorial(false)}>
            Hinweise ausblenden
          </button>
        ) : (
          tutorialOffer && (
            <button type="button" className="link" onClick={() => onTutorial(true)}>
              Einstiegshilfe zeigen
            </button>
          )
        )}
      </span>
    </div>
  );
}
