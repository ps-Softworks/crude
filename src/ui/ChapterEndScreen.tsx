// Kapitelende (1.16): Runde 16 ist vorbei. Zeigt den Stand am Ende, den
// Imperiumswert aus src/sim und lädt zum Feedback und zu einer neuen Partie ein.
// 2.9: „Was aus ihnen wurde“ – wie die Story-Bögen Silas und Moss ausgegangen sind.
// 2.8: Auch das frühe Ende „Der kluge Mann“ – Jacob hat an den Crane Trust verkauft.
// 2.11: Kapitelprüfung (erreicht/verfehlt) mit Boni und die Entscheidung zur
// Aktiengesellschaft. Regeln in src/sim/chapter.ts, Texte in content/chapter.yaml.

import { arcSummaries } from '../sim/arcs';
import { canGoPublic, chapterBonuses, chapterCheck, chapterResult, fillText, ipoProceeds } from '../sim/chapter';
import { debt } from '../sim/credit';
import { empireValue } from '../sim/empire';
import { formatDate, type GameState } from '../sim/game';
import { arcContent } from './arcs';
import { balance } from './balance';
import { chapterContent } from './chapter';
import { FeedbackLink } from './FeedbackLink';
import { Silhouette } from './Silhouette';

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

function barrels(value: number) {
  return value.toLocaleString('de-DE');
}

function prozent(share: number) {
  return `${Math.round(share * 100)} %`;
}

function Haken({ ok }: { ok: boolean }) {
  return <span className={ok ? 'ok' : 'nein'}>{ok ? '✓' : '✗'}</span>;
}

export function ChapterEndScreen({
  game,
  onRestart,
  onIpo,
}: {
  game: GameState;
  onRestart: () => void;
  onIpo: (share: number) => void;
}) {
  const ergebnis = chapterResult(game, balance);
  const verkauft = ergebnis === 'verkauft';
  const ende = chapterContent.endings[ergebnis === 'erreicht' || ergebnis === 'verkauft' ? ergebnis : 'verfehlt'];
  const quellen = game.wells.filter((w) => w.status === 'found');
  const pruefung = chapterCheck(game, balance);
  const boni = chapterBonuses(game, chapterContent, arcContent);
  const { goals, bonus, ipo } = chapterContent;
  return (
    <section className={`gameover kapitelende ${ergebnis ?? ''}`}>
      <div className="ergebnis-kopf">
        <Silhouette id="jacob" name="Jacob Harlan" size={52} />
        <h2>{fillText(ende.title, {})}</h2>
      </div>
      <p>
        {formatDate(game)}: {fillText(ende.text, {})}
      </p>
      {!verkauft && (
        <>
          <h3>Kapitelprüfung</h3>
          <ul className="pruefung">
            <li>
              <Haken ok={pruefung.solvent} /> {fillText(goals.solvent, {})}
            </li>
            <li>
              <Haken ok={pruefung.valueReached} /> {fillText(goals.value, { ziel: money(balance.chapter.goalValue) })} ({money(pruefung.value)})
            </li>
            <li>
              <Haken ok={pruefung.wellsReached} /> {fillText(goals.wells, { ziel: String(balance.chapter.goalWells) })} ({pruefung.wells})
            </li>
            <li className="bonus">
              <Haken ok={boni.transport} /> Bonus: {fillText(bonus.transport.label, {})}
            </li>
            <li className="bonus">
              <Haken ok={boni.silas} /> Bonus: {fillText(bonus.silas.label, {})}
            </li>
          </ul>
        </>
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
      {!verkauft && (
        <div className="ipo">
          <h3>{fillText(ipo.title, {})}</h3>
          {game.ipo === null && canGoPublic(game, balance) ? (
            <>
              <p>{fillText(ipo.text, {})}</p>
              <div className="knoepfe">
                {balance.chapter.ipo.shares.map((share) => (
                  <button key={share} onClick={() => onIpo(share)}>
                    {fillText(ipo.sell, { anteil: prozent(share), preis: money(ipoProceeds(game, balance, share)) })}
                  </button>
                ))}
                <button onClick={() => onIpo(0)}>{fillText(ipo.keep, {})}</button>
              </div>
            </>
          ) : game.ipo !== null && game.ipo.share > 0 ? (
            <p>{fillText(ipo.sold, { anteil: prozent(game.ipo.share), preis: money(game.ipo.proceeds) })}</p>
          ) : game.ipo !== null ? (
            <p>{fillText(ipo.kept, {})}</p>
          ) : (
            <p>{fillText(ipo.blocked, {})}</p>
          )}
        </div>
      )}
      <h3>Was aus ihnen wurde</h3>
      <ul className="boegen">
        {arcSummaries(game, arcContent).map((b) => (
          <li key={b.arc} className="person">
            <Silhouette id={b.arc} name={b.name} size={44} />
            <div>
              <strong>{b.name}:</strong> <em>{b.title}</em>
              <br />
              {b.text}
            </div>
          </li>
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
