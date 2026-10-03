// Pleite-Bildschirm: Die Rechnung ist nicht zu bezahlen, die Bank nimmt die Firma
// in Zwangsverwaltung. Zeigt den Stand am Ende und startet ein neues Spiel.

import { debt } from '../sim/credit';
import { formatDate, type GameState } from '../sim/game';
import { FeedbackLink } from './FeedbackLink';
import { Silhouette } from './Silhouette';

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

function barrels(value: number) {
  return value.toLocaleString('de-DE');
}

export function GameOverScreen({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const schuld = debt(game);
  const ergebnis = game.cash - schuld;
  return (
    <section className="gameover">
      <div className="ergebnis-kopf">
        <Silhouette id="jacob" name="Jacob Harlan" size={52} />
        <h2>Pleite</h2>
      </div>
      <p>
        {formatDate(game)}, Runde {game.round} von {game.totalRounds}: Jacob Harlan hat die Rechnung nicht
        bezahlen können. Die Bank nimmt die Firma in Zwangsverwaltung – der Bohrturm, die Pachten und die
        fördernden Quellen werden zwangsversteigert.
      </p>
      <dl className="terms">
        <dt>Fehlbetrag</dt>
        <dd>{money(Math.max(0, -game.cash))}</dd>
        <dt>Ergebnis</dt>
        <dd>
          {money(ergebnis)} (Kasse {money(game.cash)} − Schulden {money(schuld)})
        </dd>
        <dt>Gefördert</dt>
        <dd>{barrels(game.wells.filter((w) => w.status === 'found').reduce((s, w) => s + (w.production?.total ?? 0), 0))} bbl</dd>
        <dt>Öl im Tank</dt>
        <dd>{barrels(Math.floor(game.oilStock))} bbl</dd>
        <dt>Rating</dt>
        <dd>{game.rating}</dd>
        <dt>Zahlungen nicht pünktlich</dt>
        <dd>{game.missedPayments}</dd>
        <dt>Pachten</dt>
        <dd>{game.leases.filter((l) => l.holder === 'jacob').length}</dd>
      </dl>
      <p className="muted">
        Ein Wildcatter, der pleitegeht, ist in den Bars von Port Ellis kein Unbekannter. Mit einem neuen
        Versuch in einer anderen Welt vielleicht ein anderes Ende.
      </p>
      <h3>Die letzten Einträge</h3>
      <ul className="log">
        {game.log.slice(-6).reverse().map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <div className="knoepfe">
        <FeedbackLink className="feedback gross" />
        <button className="primary" onClick={onRestart}>
          Neues Spiel
        </button>
      </div>
    </section>
  );
}