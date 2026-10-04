// Fenster „Bohrturm-Akte“ (A): Reiter „Türme“ (kaufen, mieten, nachrüsten) und
// „Quellen“ (alle Bohrungen, je mit „Auf Karte zeigen“).

import { sourceRows } from '../../sim/desk';
import type { GameState } from '../../sim/game';
import { barrels } from '../format';
import { RigsPanel } from '../RigsPanel';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';

/** Alle Bohrungen als Liste: fördernde Quellen zuerst, Text und Zahlen aus src/sim/desk. */
export function SourcesPanel({ game, onShow }: { game: GameState; onShow: (parcelId: string) => void }) {
  const rows = sourceRows(game);
  if (rows.length === 0) {
    return <p className="muted">Noch keine Bohrung. Pachte eine Ranch und leg den Bohrturm auf.</p>;
  }
  return (
    <ul className="sources">
      {rows.map((row) => (
        <li key={row.wellId} className={row.status}>
          <strong>{row.label}</strong>
          <span className="lage">{row.text}</span>
          <button type="button" className="link" onClick={() => onShow(row.parcelId)}>
            Auf Karte zeigen
          </button>
          {row.status === 'found' && (
            <span className="zahlen">
              {barrels(row.lastRate)} bbl letzte Runde · {barrels(row.total)} bbl gesamt
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RigFileSheet({ ctx }: { ctx: SheetContext }) {
  const rows = sourceRows(ctx.game);
  const tabs = [
    { id: 'tuerme', label: 'Türme', badge: String(ctx.game.rigs.length) },
    { id: 'quellen', label: 'Quellen', badge: rows.length > 0 ? String(rows.length) : undefined },
  ];
  const tab = activeTab('akte', tabs, ctx.tab);
  return (
    <Tabs sheet="akte" tabs={tabs} active={tab} onChange={ctx.onTab}>
      {tab === 'tuerme' ? <RigsPanel game={ctx.game} onChange={ctx.onGame} onShow={ctx.showOnMap} /> : <SourcesPanel game={ctx.game} onShow={ctx.showOnMap} />}
    </Tabs>
  );
}
