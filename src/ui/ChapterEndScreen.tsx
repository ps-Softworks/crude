// Kapitelende (1.16): Runde 16 ist vorbei. Zeigt den Stand am Ende, den
// Imperiumswert aus src/sim und lädt zum Feedback und zu einer neuen Partie ein.
// 2.8: Auch das frühe Ende „Der kluge Mann“ – Jacob hat an den Crane Trust verkauft.

import { debt } from '../sim/credit';
import { empireValue } from '../sim/empire';
import { formatDate, type GameState } from '../sim/game';
import { balance } from './balance';
import { FeedbackLink } from './FeedbackLink';

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

function barrels(value: number) {
  return value.toLocaleString('de-DE');
}

export function ChapterEndScreen({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const quellen = game.wells.filter((w) => w.status === 'found');
  const verkauft = game.ending === 'verkauft';
  return (
    <section className="gameover kapitelende">
      <h2>{verkauft ? 'Der kluge Mann' : 'Kapitel 1 ist zu Ende'}</h2>
      {verkauft ? (
        <p>
          {formatDate(game)}: Jacob Harlan hat seine Firma an den Crane Trust verkauft. Cornelius Crane schüttelt ihm die
          Hand, als hätte er nie etwas anderes erwartet. Jacob ist ein reicher Mann – und in Cordova bohrt jetzt ein
          anderer.
        </p>
      ) : (
        <p>
          {formatDate(game)}: Die {game.totalRounds} Runden in Cordova sind gespielt. So steht Jacob Harlans Firma da:
        </p>
      )}
      <dl className="terms">
        <dt>{verkauft ? 'Kaufpreis' : 'Imperiumswert'}</dt>
        <dd>
          <strong>{money(empireValue(game, balance))}</strong>
        </dd>
        <dt>Kasse</dt>
        <dd>{money(game.cash)}</dd>
        <dt>Schulden</dt>
        <dd>{money(debt(game))}</dd>
        <dt>Fündige Quellen</dt>
        <dd>{quellen.length}</dd>
        <dt>Gefördert</dt>
        <dd>{barrels(quellen.reduce((s, w) => s + (w.production?.total ?? 0), 0))} bbl</dd>
        <dt>Rating</dt>
        <dd>{game.rating}</dd>
      </dl>
      <div className="knoepfe">
        <FeedbackLink className="feedback gross" />
        <button className="primary" onClick={onRestart}>
          Neues Spiel
        </button>
      </div>
    </section>
  );
}
