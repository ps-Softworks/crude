// Kapitelende (1.16): Runde 16 ist vorbei. Zeigt den Stand am Ende, den
// Imperiumswert aus src/sim und lädt zum Feedback und zu einer neuen Partie ein.
// 2.9: „Was aus ihnen wurde“ – wie die Story-Bögen Silas und Moss ausgegangen sind.
// 2.8: Auch das frühe Ende „Der kluge Mann“ – Jacob hat an den Crane Trust verkauft.
// 2.11: Kapitelprüfung (erreicht/verfehlt) mit Boni und die Entscheidung zur
// Aktiengesellschaft. Regeln in src/sim/chapter.ts, Texte in content/chapter.yaml.
// 4.5: Weiter in den Zeitsprung bis Kapitel 2.
// 4.12: Kapitel 2 „Der Herausforderer“ – eigene Prüfung (Raffinerie oder Hafen-Pipeline, Kontrolle,
// Imperiumswert), Verkauf an Pruett und die frühen Enden (abgesetzt, geschluckt, hinter Gittern),
// Story-Bögen des Kapitels, Ausblick auf Kapitel 3 (noch im Bau).

import { useEffect, useRef } from 'react';
import { arcSummaries } from '../sim/arcs';
import { canGoPublic, chapter2Check, chapterBonuses, chapterCheck, chapterResult, fillText, ipoProceeds, type Chapter2EndingId } from '../sim/chapter';
import { chapterOf } from '../sim/chapterOf';
import { debt } from '../sim/credit';
import { empireValue } from '../sim/empire';
import { formatDate, type GameState } from '../sim/game';
import { arcContent } from './arcs';
import { balance } from './balance';
import { chapterContent } from './chapter';
import { FeedbackLink } from './FeedbackLink';
import { barrels, money, NBSP } from './format';
import { Silhouette } from './Silhouette';
import { ReputationLine } from './Reputation';
import { fillTimeskipText, timeskipBlocked } from '../sim/timeskip';
import { timeskipContent } from './timeskip';


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
  onTimeskip,
}: {
  game: GameState;
  onRestart: () => void;
  onIpo: (share: number) => void;
  /** Rückmeldung, wenn die Entscheidung nicht ging. */
  notice?: string | null;
  /** „Noch einmal auf den Schreibtisch schauen“. */
  onPeek?: () => void;
  /** Weiter in den Zeitsprung (4.5): der Brief an den Verwalter. */
  onTimeskip?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // Fokus auf die Überschrift des Bogens (0.2.15+12) – nicht auf den Börsengang oder
  // „Neues Spiel“: Beides gilt endgültig, ein nachgedrücktes Enter darf es nicht auslösen.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('#bogen-titel')?.focus({ preventScroll: true });
  }, [game.ipo === null]);
  const ergebnis = chapterResult(game, balance);
  const verkauft = ergebnis === 'verkauft';
  // Kapitel 2 (4.12): eigene Ausgänge, eigene Prüfung, keine Aktiengesellschaft und (noch) kein Zeitsprung II.
  const k2 = chapterOf(game) >= 2;
  const k2Text = chapterContent.chapter2;
  const k2Ende: Chapter2EndingId = ergebnis === null || ergebnis === 'pleite' ? 'verfehlt' : ergebnis;
  const ende = k2 ? k2Text.endings[k2Ende] : chapterContent.endings[ergebnis === 'erreicht' || ergebnis === 'verkauft' ? ergebnis : 'verfehlt'];
  const k1 = !k2;
  const imBau = k2;
  const pruefung2 = chapter2Check(game, balance);
  const sprung = timeskipContent.start;
  const sprungGesperrt = timeskipBlocked(game, balance);
  const sprungMoeglich = k1 && !verkauft && game.ending === 'kapitel';
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
            <h2 id="bogen-titel" tabIndex={-1}>
              {fillText(ende.title, {})}
            </h2>
            <p className="bogen-text">
              {formatDate(game)}: {fillText(ende.text, {})}
            </p>
          </div>
        </div>
        <div className="bogen-spalten">
          <div>
            {k2 && game.ending === 'kapitel' && (
              <>
                <h3>Kapitelprüfung</h3>
                <ul className="pruefung">
                  <li>
                    <Haken ok={pruefung2.transport} /> {fillText(k2Text.goals.transport, {})}
                    {pruefung2.refinery ? ' (Raffinerie)' : pruefung2.harbor ? ' (Fernleitung zum Hafen)' : ''}
                  </li>
                  <li>
                    <Haken ok={pruefung2.controlReached} /> {fillText(k2Text.goals.control, { ziel: prozent(balance.chapter.chapter2.goalControl) })} ({prozent(pruefung2.control)})
                  </li>
                  <li>
                    <Haken ok={pruefung2.valueReached} /> {fillText(k2Text.goals.value, { ziel: money(balance.chapter.chapter2.goalValue) })} ({money(pruefung2.value)})
                  </li>
                </ul>
              </>
            )}
            {!verkauft && !imBau && (
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
              {k2 && (
                <>
                  <dt>Kontrolle</dt>
                  <dd>{prozent(pruefung2.control)}</dd>
                </>
              )}
            </dl>
            {k2 && <ReputationLine game={game} />}
          </div>
          <div>
            {!verkauft && !imBau && (
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
            {k2 && (
              <div className="ipo sprung-angebot">
                <h3>{fillText(k2Text.next.title, {})}</h3>
                <p>{fillText(k2Text.next.text, {})}</p>
              </div>
            )}
            {sprungMoeglich && onTimeskip && (
              <div className="ipo sprung-angebot">
                <h3>{fillTimeskipText(sprung.title, {})}</h3>
                <p>{fillTimeskipText(sprung.text, {})}</p>
                {sprungGesperrt ? <p className="muted">{fillTimeskipText(sprung.blockedIpo, {})}</p> : null}
              </div>
            )}
            <h3>Was aus ihnen wurde</h3>
            <ul className="boegen">
              {arcSummaries(game, arcContent).map((b) => (
                <li key={b.arc} className="person">
                  {/* Bögen späterer Kapitel (nora_k2 …) zeigen die Figur ohne Kapitel-Endung. */}
                  <Silhouette id={b.arc.replace(/_k\d+$/, '')} name={b.name} size={36} />
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
        <button className={sprungMoeglich && onTimeskip ? '' : 'primary'} onClick={onRestart}>
          Neues Spiel
        </button>
        {sprungMoeglich && onTimeskip && (
          <button type="button" className="primary" onClick={onTimeskip} disabled={sprungGesperrt !== undefined} title={sprungGesperrt}>
            {fillTimeskipText(sprung.button, {})}
          </button>
        )}
      </div>
    </section>
  );
}
