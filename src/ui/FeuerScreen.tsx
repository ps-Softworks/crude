// Frühes Ende „Ein Feuer in der Nacht“ (B3, GDD §14): Bullards Männer haben Jacobs Haus angezündet.
// Regeln in src/sim/feuer.ts, Texte in content/feuer.yaml. Zeigt das Ende, „Was aus ihnen wurde“ und
// die letzten Einträge der Kladde; danach nur ein neues Spiel.

import { useEffect, useRef } from 'react';
import { feuerView } from '../sim/feuer';
import { formatDate, type GameState } from '../sim/game';
import { feuerContent } from './feuer';
import { FeedbackLink } from './FeedbackLink';
import { Silhouette } from './Silhouette';

export function FeuerScreen({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const view = feuerView(game, feuerContent);
  const titel = useRef<HTMLHeadingElement>(null);
  // Fokus auf die Überschrift – ein nachgedrücktes Enter startet kein neues Spiel.
  useEffect(() => titel.current?.focus({ preventScroll: true }), []);
  return (
    <section className="gameover bogen feuer" aria-labelledby="bogen-titel">
      <div className="bogen-inhalt">
        <div className="ergebnis-kopf">
          <Silhouette id="jacob" name="Jacob Harlan" size={44} />
          <div>
            <h2 id="bogen-titel" ref={titel} tabIndex={-1}>
              {view.title}
            </h2>
            <p className="bogen-text">
              {formatDate(game)}: {view.text}
            </p>
          </div>
        </div>
        <div className="bogen-spalten">
          <div>
            <h3>{view.fateHeading}</h3>
            <ul className="log">
              {view.fates.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="muted">{view.restart}</p>
          </div>
          <div>
            <h3>Die letzten Einträge</h3>
            <ul className="log">
              {game.log
                .slice(-4)
                .reverse()
                .map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="bogen-fuss">
        <FeedbackLink className="feedback gross" />
        <button className="primary" onClick={onRestart}>
          Neues Spiel
        </button>
      </div>
    </section>
  );
}
