// Kapitelende (1.16): Runde 16 ist vorbei. Zeigt den Stand am Ende, den
// Imperiumswert aus src/sim und lädt zum Feedback und zu einer neuen Partie ein.

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
  return (
    <section className="gameover kapitelende">
      <h2>Kapitel 1 ist zu Ende</h2>
      <p>
        {formatDate(game)}: Die {game.totalRounds} Runden in Cordova sind gespielt. So steht Jacob Harlans Firma da:
      </p>
      <dl className="terms">
        <dt>Imperiumswert</dt>
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
