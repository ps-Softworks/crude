// Die Zeitung zu Beginn der Runde (2.6): Titelseite mit der Aussicht für den
// Ölpreis und Kurzmeldungen. Welche Schlagzeile erscheint, entscheidet src/sim.
// Nach einer Wahl (4.2) druckt die Zeitung das amtliche Ergebnis und das Programm der Sieger.

import type { GameState } from '../sim/game';
import { makeNewspaper } from '../sim/newspaper';
import { balance } from './balance';
import { newspaperContent } from './newspaper';
import { politicsContent } from './politics';
// 4.15 Andockpunkt: Börsenseite (nur mit Börse, ab Kapitel 3).
import { readClimate } from '../sim/exchange';
import { makeExchangePage } from '../sim/exchangeContent';
import { exchangeContent } from './exchange';
import './sheets/exchange.css';

export function NewspaperPanel({ game }: { game: GameState }) {
  const zeitung = makeNewspaper(game, balance, newspaperContent, undefined, politicsContent);
  const wahl = zeitung.election;
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
      {wahl && (
        <div className="zeitung-wahl" aria-label={wahl.title}>
          <h3>{wahl.title}</h3>
          <ol className="zeitung-wahl-ergebnis">
            {wahl.lines.map((l) => (
              <li key={l.party} className={l.winner ? 'sieger' : undefined}>
                <span className="partei">{l.name}</span>
                <span className="balken" style={{ width: `${l.percent}%` }} />
                <span className="anteil">{l.percent} %</span>
              </li>
            ))}
          </ol>
          <p className="zeitung-wahl-programm">
            <em>{wahl.programTitle}:</em> {wahl.program.join(' · ')}
          </p>
        </div>
      )}
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
