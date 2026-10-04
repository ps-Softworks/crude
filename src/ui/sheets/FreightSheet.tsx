// Fenster „Fracht“ (F, V = Reiter Verkauf): Tank und Verkauf, Lager und
// Fuhrwerke, Pipeline und Thorne, Wege im Vergleich (0.2.15+2).

import { Tabs, activeTab } from '../sheet/Tabs';
import { PipelinePanel, RoutePlanPanel, SalePanel, StoragePanel } from '../TransportPanel';
import type { SheetContext } from './types';

export const FREIGHT_TABS = [
  { id: 'verkauf', label: 'Verkauf' },
  { id: 'lager', label: 'Lager & Fuhrwerke' },
  { id: 'pipeline', label: 'Pipeline & Thorne' },
  { id: 'wege', label: 'Wege' },
];

export function FreightSheet({ ctx }: { ctx: SheetContext }) {
  const tab = activeTab('fracht', FREIGHT_TABS, ctx.tab);
  return (
    <Tabs sheet="fracht" tabs={FREIGHT_TABS} active={tab} onChange={ctx.onTab}>
      {tab === 'verkauf' && <SalePanel game={ctx.game} onSold={ctx.onGame} />}
      {tab === 'lager' && <StoragePanel game={ctx.game} onChange={ctx.onGame} />}
      {tab === 'pipeline' && <PipelinePanel game={ctx.game} onChange={ctx.onGame} />}
      {tab === 'wege' && <RoutePlanPanel game={ctx.game} />}
    </Tabs>
  );
}
