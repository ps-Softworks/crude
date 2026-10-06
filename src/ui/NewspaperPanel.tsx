// Die Zeitung zu Beginn der Runde (2.6): Titelseite mit der Aussicht für den
// Ölpreis und Kurzmeldungen. Welche Schlagzeile erscheint, entscheidet src/sim.
// Nach einer Wahl (4.2) druckt die Zeitung das amtliche Ergebnis und das Programm der Sieger,
// aus dem Parlament (4.3) Antrag, Debatte oder Abstimmung über ein Gesetz.

import type { GameState } from '../sim/game';
import { makeNewspaper } from '../sim/newspaper';
import { balance } from './balance';
import { newspaperContent } from './newspaper';
import { politicsContent } from './politics';
// 4.15 Andockpunkt: Börsenseite (nur mit Börse, ab Kapitel 3) – seit 0.4.20+9 baut sie die Simulation mit.
import { exchangeContent } from './exchange';
import './sheets/exchange.css';

export function NewspaperPanel({ game }: { game: GameState }) {
  const zeitung = makeNewspaper(game, balance, newspaperContent, undefined, politicsContent, exchangeContent);
  const wahl = zeitung.election;
  const gesetz = zeitung.law;
  const boerse = zeitung.exchange ?? null;
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
      {gesetz && (
        <div className="zeitung-gesetz" aria-label={gesetz.title}>
          <h3>{gesetz.title}</h3>
          <p>{gesetz.text}</p>
          {gesetz.vote && (
            <p className="zeitung-gesetz-abstimmung">
              <em>{gesetz.vote.title}:</em> {gesetz.vote.yesLabel} {gesetz.vote.yes} % · {gesetz.vote.noLabel} {gesetz.vote.no} %
              <span className="balken" aria-hidden="true">
                <span style={{ width: `${gesetz.vote.yes}%` }} />
              </span>
            </p>
          )}
        </div>
      )}
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
          {/* 0.4.20+9: Kurszettel, Harlan Oil hervorgehoben. */}
          {boerse.quotes.length > 0 && (
            <table className="zeitung-kurse">
              <tbody>
                {boerse.quotes.map((q) => (
                  <tr key={q.id} className={q.own ? 'eigene' : undefined}>
                    <th scope="row">{q.name}</th>
                    <td>{q.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                    <td className={q.change < 0 ? 'ab' : q.change > 0 ? 'auf' : undefined}>
                      {q.change === 0 ? '±0' : `${q.change > 0 ? '+' : '−'}${Math.abs(q.change * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
