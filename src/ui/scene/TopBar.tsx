// Kopfleiste (0.2.15+9): eine Messingleiste über Schreibtisch und Karte – Titel,
// Datum, Kasse, Schulden, Tank, Termine und Jacobs Zustand in einem Wort. Bleibt
// auch auf der Karte stehen, damit man beim Bauen das Geld sieht. Logo und Version
// sitzen klein in der Ecke unten links, damit die Leiste Platz hat.

import { agendaView } from '../../sim/agenda';
import { debt, headroom } from '../../sim/credit';
import { formatDate, type GameState } from '../../sim/game';
import { balance } from '../balance';
import { FeedbackLink } from '../FeedbackLink';
import { money } from '../format';
import { Bohrturm } from '../Silhouette';
import { chapterRound, chapterRounds, chapterUnderConstruction, fillTimeskipText } from '../../sim/timeskip';
import { timeskipContent } from '../timeskip';

/** Termine der Runde als Punkte (● belegt, ○ frei, ◆ Überstunde) und Jacobs Zustand in einem Wort (2.3). */
export function Termine({ game, debug, lang = false, kurz = false }: { game: GameState; debug: boolean; lang?: boolean; /** Ohne „wirkt …“, wenn die Leiste eng ist. */ kurz?: boolean }) {
  const t = agendaView(game, balance);
  const punkte = '●'.repeat(t.used) + '○'.repeat(Math.max(0, t.budget - t.used));
  const extra = t.sickRounds > 0 ? '' : '◆'.repeat(t.overtimeUsed) + '◇'.repeat(Math.max(0, t.overtimeMax - t.overtimeUsed));
  const frei = Math.max(0, t.budget - t.used);
  const reserve = t.sickRounds > 0 ? 0 : Math.max(0, t.overtimeMax - t.overtimeUsed);
  const erklaerung = `Termine dieser Runde: ${frei} von ${t.budget} frei (○ frei, ● belegt)${reserve > 0 ? `, dazu ${reserve} als Überstunde (◇) – die kosten Kraft` : ''}.`;
  return (
    <span className={t.left === 0 ? 'termine warn' : 'termine'} title={erklaerung} aria-label={`${erklaerung} Jacob wirkt ${t.word}.`}>
      Termine <span className="punkte">{punkte}</span>
      <span className="punkte extra">{extra}</span>
      {!kurz && <> · wirkt {t.word}</>}
      {lang && t.tired && ' (Müdigkeit kostet einen Termin)'}
      {lang && t.exhausted && ' (Fehler schleichen sich ein)'}
      {lang && <span className="termine-legende"> ○ frei · ● belegt · ◇ Überstunde (kostet Kraft) · ◆ genommen</span>}
      {debug && (
        <>
          {' '}
          · Kraft {game.strength}
          {game.sick > 0 && <> · krank {game.sick}</>}
        </>
      )}
    </span>
  );
}

export function TopBar({
  game,
  debug,
  saved,
  onMenu,
  onLedger,
}: {
  game: GameState;
  debug: boolean;
  /** Der letzte Autosave hat geklappt. */
  saved: boolean;
  onMenu: () => void;
  onLedger: () => void;
}) {
  // Bankrott droht: die Banderole braucht Platz – Nebensachen fallen weg, das Menü bleibt (0.2.15+12).
  const banderole = game.bankruptcyDeadline > 0 && !game.finished && !game.ending;
  return (
    <>
    <div className="ecke-marke" aria-hidden="true">
      <Bohrturm size={14} />
      CRUDE <span className="version">v{__APP_VERSION__}</span>
    </div>
    <div className="kopfleiste">
      {chapterUnderConstruction(game) && (
        <span className="kopf-titel">
          <span className="kapitel-im-bau" title={fillTimeskipText(timeskipContent.preview.text, {})}>
            {fillTimeskipText(timeskipContent.preview.badge, {})}
          </span>
        </span>
      )}
      <span>
        {formatDate(game)} · Runde {chapterRound(game)}/{chapterRounds(game)}
      </span>
      <span>
        Kasse <strong>{money(game.cash)}</strong>
      </span>
      <span>
        Schulden {money(debt(game))}
        {!banderole && <span className="klein"> (frei {money(headroom(game, balance))})</span>}
      </span>
      <Termine game={game} debug={debug} kurz={banderole} />
      {banderole && (
        <button type="button" className="banderole" onClick={onLedger} title={`Bankrott droht – die Frist läuft bis Runde ${game.bankruptcyDeadline}. Klick öffnet das Kassenbuch.`}>
          Bankrott droht · Runde {game.bankruptcyDeadline}
        </button>
      )}
      <span className="kopf-rechts">
        {saved && (
          <span className="gesichert" title="Der Spielstand ist gespeichert.">
            ✓ gesichert
          </span>
        )}
        <FeedbackLink className="feedback kopf" />
        <button type="button" className="menue-knopf" onClick={onMenu} data-sheet="menu" aria-label="Menü">
          ☰ Menü
        </button>
      </span>
    </div>
    </>
  );
}
