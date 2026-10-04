// Die Zeitung zu Beginn der Runde (2.6): Titelseite mit der Aussicht für den
// Ölpreis und Kurzmeldungen. Welche Schlagzeile erscheint, entscheidet src/sim.

import type { GameState } from '../sim/game';
import { makeNewspaper } from '../sim/newspaper';
import { balance } from './balance';
import { newspaperContent } from './newspaper';
// 4.15 Andockpunkt: Börsenseite (nur mit Börse, ab Kapitel 3).
import { readClimate } from '../sim/exchange';
import { makeExchangePage } from '../sim/exchangeContent';
import { exchangeContent } from './exchange';
import './sheets/exchange.css';

export function NewspaperPanel({ game }: { game: GameState }) {
  const zeitung = makeNewspaper(game, balance, newspaperContent);
  const boerse = game.exchange ? makeExchangePage(game.exchange, balance.exchange, exchangeContent, readClimate(game)) : null;
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
      {/* 4.15 Andockpunkt: Börsenseite – Frühwarnzeichen vor dem Crash. */}
      {boerse && (
        <div className={`zeitung-boerse boerse-${boerse.id}`}>
          <div className="zeitung-boerse-kopf">{boerse.name}</div>
          <h3>{boerse.title}</h3>
          <p>{boerse.text}</p>
        </div>
      )}
    </section>
  );
}
