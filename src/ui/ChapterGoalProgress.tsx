// Kapitelprüfung zum Mitlesen (0.4.19+2): Ziel von Kapitel 2 und 3 mit dem Stand von jetzt –
// vorher stand es nur einmal auf der Chronikseite und dann erst wieder im Endbogen.
// Regeln: src/sim/chapter.ts (chapter2Check, chapter3Check), Texte: content/chapter.yaml.

import { chapter2Check, chapter3Check, fillText } from '../sim/chapter';
import { chapterOf } from '../sim/chapterOf';
import type { GameState } from '../sim/game';
import { balance } from './balance';
import { chapterContent } from './chapter';
import { money, NBSP } from './format';

const prozent = (x: number) => `${Math.round(x * 100)}${NBSP}%`;
const anteil = (x: number) => `${(x * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}%`;

function Punkt({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li>
      <span className={ok ? 'ok' : 'nein'}>{ok ? '✓' : '✗'}</span> {children}
    </li>
  );
}

/** Liste der Prüfpunkte des laufenden Kapitels (ab Kapitel 2); in Kapitel 1 nichts. */
export function ChapterGoalProgress({ game }: { game: GameState }) {
  const k = chapterOf(game);
  if (k < 2) return null;
  if (k >= 3) {
    const p = chapter3Check(game, balance);
    return (
      <div className="kapitelziel klein">
        <strong>Kapitelziel (geprüft am Kapitelende)</strong>
        <ul className="pruefung">
          <Punkt ok={p.brand}>
            {fillText(chapterContent.chapter3.goals.brand, { regionAnteil: prozent(balance.brand.goal.presenceShare), regionen: String(balance.brand.goal.regions), anteil: prozent(balance.brand.goal.share) })} (jetzt {p.regions}{' '}
            Regionen · {anteil(p.share)})
          </Punkt>
          <Punkt ok={p.ratingReached}>
            {fillText(chapterContent.chapter3.goals.rating, { rating: balance.chapter.chapter3.minRating })} (jetzt {p.rating})
          </Punkt>
        </ul>
      </div>
    );
  }
  const p = chapter2Check(game, balance);
  return (
    <div className="kapitelziel klein">
      <strong>Kapitelziel (geprüft am Kapitelende)</strong>
      <ul className="pruefung">
        <Punkt ok={p.transport}>
          {fillText(chapterContent.chapter2.goals.transport, {})}
          {p.refinery ? ' (Raffinerie)' : p.harbor ? ' (Fernleitung zum Hafen)' : ''}
        </Punkt>
        <Punkt ok={p.controlReached}>
          {fillText(chapterContent.chapter2.goals.control, { ziel: prozent(balance.chapter.chapter2.goalControl) })} (jetzt {prozent(p.control)})
        </Punkt>
        <Punkt ok={p.valueReached}>
          {fillText(chapterContent.chapter2.goals.value, { ziel: money(balance.chapter.chapter2.goalValue) })} (jetzt {money(p.value)})
        </Punkt>
      </ul>
    </div>
  );
}
