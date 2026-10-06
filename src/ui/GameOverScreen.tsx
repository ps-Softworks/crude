// Pleite-Bildschirm: Die Rechnung ist nicht zu bezahlen, die Bank nimmt die Firma
// in Zwangsverwaltung. Zeigt den Stand am Ende und startet ein neues Spiel.

import { HistorySummary } from './HistoryPanel';
import { chapterRound, chapterRounds } from '../sim/timeskip';
import { useEffect, useRef } from 'react';
import { debt } from '../sim/credit';
import { formatDate, type GameState } from '../sim/game';
import { secondChanceBlocker, secondChanceCash, secondChanceEnd } from '../sim/secondChance';
import { balance } from './balance';
import { ConfirmButton } from './ConfirmButton';
import { FeedbackLink } from './FeedbackLink';
import { barrels, money } from './format';
import { Silhouette } from './Silhouette';


export function GameOverScreen({ game, onRestart, onSecondChance }: { game: GameState; onRestart: () => void; onSecondChance?: () => void }) {
  // Zweiter Anlauf (GDD §14): einmal je Spiel, Regeln in src/sim/secondChance.ts.
  const anlauf = onSecondChance && secondChanceBlocker(game) === null;
  const anlaufEnde = secondChanceEnd(game, balance);
  const schuld = debt(game);
  // Pleite im Zeitsprung (4.5): Der Sprung hat in diesem Jahr geendet, nicht in einer Kapitelrunde.
  const imSprung = game.timeskips[game.timeskips.length - 1]?.bankrupt === true;
  const ergebnis = game.cash - schuld;
  const titel = useRef<HTMLHeadingElement>(null);
  // Fokus auf die Überschrift (0.2.15+12) – ein zweites Enter wirft das Ergebnis nicht ungesehen weg.
  useEffect(() => titel.current?.focus({ preventScroll: true }), []);
  return (
    <section className="gameover bogen" aria-labelledby="bogen-titel">
      <div className="bogen-inhalt">
        <div className="ergebnis-kopf">
          <Silhouette id="jacob" name="Jacob Harlan" size={44} />
          <div>
            <h2 id="bogen-titel" ref={titel} tabIndex={-1}>
              Pleite
            </h2>
            <p className="bogen-text">
              {imSprung
                ? `${formatDate(game)}, während Jacob die Firma einem Verwalter überlassen hatte: Die Kasse ist leer, die Bank leiht nichts mehr. `
                : `${formatDate(game)}, Runde ${chapterRound(game)} von ${chapterRounds(game)}: Jacob Harlan hat die Rechnung nicht bezahlen können. `}
              Die Bank nimmt die Firma in Zwangsverwaltung – der Bohrturm, die Pachten und die fördernden Quellen werden zwangsversteigert.
            </p>
          </div>
        </div>
        <div className="bogen-spalten">
          <div>
            <h3>Zahlen</h3>
            <dl className="terms zweispaltig">
              <dt>Fehlbetrag</dt>
              <dd>{money(Math.max(0, -game.cash))}</dd>
              <dt>Ergebnis</dt>
              <dd>
                {money(ergebnis)} (Kasse {money(game.cash)} − Schulden {money(schuld)})
              </dd>
              <dt>Gefördert</dt>
              <dd>{barrels(game.wells.filter((w) => w.status === 'found').reduce((s, w) => s + (w.production?.total ?? 0), 0))} bbl</dd>
              <dt>Öl im Tank</dt>
              <dd>{barrels(game.oilStock)} bbl</dd>
              <dt>Rating</dt>
              <dd>{game.rating}</dd>
              <dt>Zahlungen nicht pünktlich</dt>
              <dd>{game.missedPayments}</dd>
              <dt>Pachten</dt>
              <dd>{game.leases.filter((l) => l.holder === 'jacob').length}</dd>
            </dl>
            <HistorySummary game={game} />
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
            <p className="muted">
              Ein Wildcatter, der pleitegeht, ist in den Bars von Port Ellis kein Unbekannter. Mit einem neuen Versuch in einer anderen Welt
              vielleicht ein anderes Ende.
            </p>
            {anlauf && (
              <p className="zweiter-anlauf">
                <strong>Zweiter Anlauf:</strong> Jacob fängt in derselben Welt noch einmal an – mit {money(secondChanceCash(game, balance))}, Silas'
                altem Turm und ohne Schulden. Quellen, Pachten und Anlagen sind weg; Ruf, Feinde, Gefallen und Familie bleiben.
                {anlaufEnde > game.totalRounds ? ` Das Kapitel läuft für ihn bis Runde ${anlaufEnde - (game.chapterStart ?? 1) + 1}.` : ''} Das geht nur einmal.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="bogen-fuss">
        <FeedbackLink className="feedback gross" />
        {anlauf && (
          <ConfirmButton
            question="Noch einmal von vorn anfangen – in dieser Welt, als Wildcatter? Den zweiten Anlauf gibt es nur einmal."
            confirmLabel="Ja, zweiter Anlauf"
            onConfirm={onSecondChance!}
          >
            Zweiter Anlauf
          </ConfirmButton>
        )}
        <button className="primary" onClick={onRestart}>
          Neues Spiel
        </button>
      </div>
    </section>
  );
}
