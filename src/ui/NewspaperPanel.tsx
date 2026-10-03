// Die Zeitung zu Beginn der Runde (2.6): Titelseite mit der Aussicht für den
// Ölpreis und Kurzmeldungen. Welche Schlagzeile erscheint, entscheidet src/sim.

import type { GameState } from '../sim/game';
import { makeNewspaper } from '../sim/newspaper';
import { balance } from './balance';
import { newspaperContent } from './newspaper';

export function NewspaperPanel({ game }: { game: GameState }) {
  const zeitung = makeNewspaper(game, balance, newspaperContent);
  return (
    <section className="zeitung" aria-label="Zeitung">
      <div className="zeitung-kopf">{zeitung.name}</div>
      <div className="zeitung-titel">
        <h2>{zeitung.front.title}</h2>
        <p>{zeitung.front.text}</p>
      </div>
      <ul className="zeitung-meldungen">
        {zeitung.items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}.</strong> {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
