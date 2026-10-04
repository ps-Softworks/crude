// Fenster „Protokoll“ (P): was in dieser Runde geschah, und das ganze Protokoll.

import { roundLog } from '../../sim/desk';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';

const TABS = [
  { id: 'runde', label: 'Diese Runde' },
  { id: 'alles', label: 'Alles' },
];

export function JournalSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const tab = activeTab('protokoll', TABS, ctx.tab);
  const zeilen = tab === 'runde' ? roundLog(game) : game.log;
  return (
    <Tabs sheet="protokoll" tabs={TABS} active={tab} onChange={ctx.onTab}>
      {zeilen.length === 0 ? (
        <p className="muted">In dieser Runde ist noch nichts passiert.</p>
      ) : (
        <ul className="log">
          {[...zeilen].reverse().map((line, i) => (
            <li key={zeilen.length - i}>{line}</li>
          ))}
        </ul>
      )}
    </Tabs>
  );
}
