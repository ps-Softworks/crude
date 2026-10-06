// Reiter „Verlauf“ im Kassenbuch (0.4.20+42): vier Diagramme aus state.history.

import type { GameState } from '../sim/game';
import { historyStats } from '../sim/history';
import { HistoryChart } from './HistoryChart';
import { barrels, money } from './format';
import './sheets/verlauf.css';

export function HistoryPanel({ game }: { game: GameState }) {
  const history = game.history ?? [];
  const stats = historyStats(history);
  if (!stats) {
    return <p className="muted">Ruth führt das Buch erst vom Ende der ersten Runde an – danach erscheinen hier die Linien.</p>;
  }
  return (
    <div className="verlauf">
      <div className="verlauf-gitter">
        <HistoryChart title="Imperiumswert ($)" history={history} series={[{ label: 'Wert', value: (e) => e.value }]} />
        <HistoryChart
          title="Kasse und Schulden ($)"
          history={history}
          series={[
            { label: 'Kasse', value: (e) => e.cash },
            { label: 'Schulden', value: (e) => e.debt, tone: 'rot' },
          ]}
        />
        <HistoryChart title="Förderung je Runde (bbl)" history={history} series={[{ label: 'Förderung', value: (e) => e.out, tone: 'ocker' }]} />
        <HistoryChart title="Ölpreis, Posted Price ($/bbl)" history={history} series={[{ label: 'Preis', value: (e) => e.price, tone: 'blau' }]} decimals={2} />
      </div>
      <p className="muted klein verlauf-fuss">
        Bester Wert {money(stats.bestValue)} (Runde {stats.bestRound}) · gefördert {barrels(stats.totalOutput)} bbl in {stats.rounds} Runden
      </p>
    </div>
  );
}

/** Kurze Statistik mit kleinem Diagramm für Kapitelende und Pleite-Bildschirm. */
export function HistorySummary({ game }: { game: GameState }) {
  const history = game.history ?? [];
  const stats = historyStats(history);
  if (!stats || history.length < 2) return null;
  return (
    <div className="verlauf-zusammen">
      <h3>Verlauf</h3>
      <p className="verlauf-stat">
        Bester Wert {money(stats.bestValue)} (Runde {stats.bestRound}) · gesamt gefördert {barrels(stats.totalOutput)} bbl in {stats.rounds} Runden · tiefste Kasse{' '}
        {money(stats.lowestCash)} · höchste Schulden {money(stats.peakDebt)}
      </p>
      <HistoryChart title="Imperiumswert ($)" history={history} series={[{ label: 'Wert', value: (e) => e.value }]} compact />
    </div>
  );
}
