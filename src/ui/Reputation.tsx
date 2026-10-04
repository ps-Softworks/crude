// Ruf (4.12, GDD §4): eine Zeile mit den Achsen als Wort – nie als Zahl. Regeln in src/sim/reputation.ts,
// Texte in content/chapter.yaml → chapter2.reputation. Ohne Ruf-Zustand (Kapitel 1) erscheint nichts.
import { localize } from '../sim/i18n';
import { REPUTATION_AXES, reputationOf, reputationWord } from '../sim/reputation';
import type { GameState } from '../sim/game';
import { chapterContent } from './chapter';

export function ReputationLine({ game, className = 'klein' }: { game: GameState; className?: string }) {
  if (!game.reputation) return null;
  const T = chapterContent.chapter2.reputation;
  // Die Gesellschaft (Stand) erst, wenn sie sich bewegt hat – sie zählt richtig ab Kapitel 3.
  const achsen = REPUTATION_AXES.filter((a) => a !== 'standing' || reputationOf(game, a) !== 0);
  return (
    <p className={className}>
      {localize(T.title)}: {achsen.map((a) => `${localize(T.axes[a])} ${localize(T.words[reputationWord(reputationOf(game, a))])}`).join(' · ')}
    </p>
  );
}
