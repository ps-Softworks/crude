// Kapitelende (1.16): Runde 16 ist vorbei. Zeigt den Stand am Ende, den
// Imperiumswert aus src/sim und lädt zum Feedback und zu einer neuen Partie ein.
// 2.9: „Was aus ihnen wurde“ – wie die Story-Bögen Silas und Moss ausgegangen sind.
// 2.8: Auch das frühe Ende „Der kluge Mann“ – Jacob hat an den Crane Trust verkauft.
// 2.11: Kapitelprüfung (erreicht/verfehlt) mit Boni und die Entscheidung zur
// Aktiengesellschaft. Regeln in src/sim/chapter.ts, Texte in content/chapter.yaml.

import { useEffect, useRef } from 'react';
import { arcSummaries } from '../sim/arcs';
import { canGoPublic, chapterBonuses, chapterCheck, chapterResult, fillText, ipoProceeds } from '../sim/chapter';
import { debt } from '../sim/credit';
import { empireValue } from '../sim/empire';
import { formatDate, type GameState } from '../sim/game';
import { arcContent } from './arcs';
import { balance } from './balance';
import { chapterContent } from './chapter';
import { FeedbackLink } from './FeedbackLink';
import { barrels, money, NBSP } from './format';
import { Silhouette } from './Silhouette';


function prozent(share: number) {
  return `${Math.round(share * 100)}${NBSP}%`;
}

function Haken({ ok }: { ok: boolean }) {
  return <span className={ok ? 'ok' : 'nein'}>{ok ? '✓' : '✗'}</span>;
}

export function ChapterEndScreen({
  game,
  onRestart,
  onIpo,
  notice = null,
  onPeek,
}: {
  game: GameState;
  onRestart: () => void;
  onIpo: (share: number) => void;
  /** Rückmeldung, wenn die Entscheidung nicht ging. */
  notice?: string | null;
  /** „Noch einmal auf den Schreibtisch schauen“. */
  onPeek?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // Fokus auf die erste Entscheidung (Börsengang), sonst auf „Neues Spiel“ (0.2.15+11).
  useEffect(() => {
    const root = ref.current;
    (root?.querySelector<HTMLElement>('.ipo button') ?? root?.querySelector<HTMLElement>('.bogen-fuss .primary'))?.focus({ preventScroll: true });
  }, [game.ipo === null]);
  const ergebnis = chapterResult(game, balance);
  const verkauft = ergebnis === 'verkauft';
  const ende = chapterContent.endings[ergebnis === 'erreicht' || ergebnis === 'verkauft' ? ergebnis : 'verfehlt'];
  const quellen = game.wells.filter((w) => w.status === 'found');
  const pruefung = chapterCheck(game, balance);
  const boni = chapterBonuses(game, chapterContent, arcContent);
  const { goals, bonus, ipo } = chapterContent;
  return (
    <section ref={ref} className={`gameover kapitelende bogen ${ergebnis ?? ''}`} aria-labelledby="bogen-titel">
      <div className="bogen-inhalt">
        <div className="ergebnis-kopf">
          <Silhouette id="jacob" name="Jacob Harlan" size={44} />
          <div>
            <h2 id="bogen-titel">{fillText(ende.title, {})}</h2>
            <p className="bogen-text">
              {formatDate(game)}: {fillText(ende.text, {})}
            </p>
          </div>
        </div>
        <div className="bogen-spalten">
          <div>
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
            <h3>Zahlen</h3>
            <dl className="terms zweispaltig">
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
          </div>
          <div>
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
                  <Silhouette id={b.arc} name={b.name} size={36} />
                  <div>
                    <strong>{b.name}:</strong> <em>{b.title}</em>
                    <br />
                    {b.text}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="bogen-fuss">
        {notice && <p className="randnotiz warn">{notice}</p>}
        <FeedbackLink className="feedback gross" />
        {onPeek && (
          <button type="button" className="link" onClick={onPeek}>
            Noch einmal auf den Schreibtisch schauen
          </button>
        )}
        <button className="primary" onClick={onRestart}>
          Neues Spiel
        </button>
      </div>
    </section>
  );
}
