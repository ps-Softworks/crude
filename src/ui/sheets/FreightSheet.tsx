// Fenster „Fracht“ (F, V = Reiter Verkauf): Tank und Verkauf, Lager und
// Fuhrwerke, Pipeline und Thorne, Wege im Vergleich (0.2.15+2).

import { Tabs, activeTab } from '../sheet/Tabs';
import { PipelinePanel, RoutePlanPanel, SalePanel, StoragePanel } from '../TransportPanel';
import type { SheetContext } from './types';
// 4.7 Andockpunkt: Reiter „Fernleitung“ (erst ab Kapitel 2 sichtbar).
import { showTrunkTab, TrunkPipelineTab } from './TrunkPipelineTab';

export const FREIGHT_TABS = [
  { id: 'verkauf', label: 'Verkauf' },
  { id: 'lager', label: 'Lager & Fuhrwerke' },
  { id: 'pipeline', label: 'Pipeline & Thorne' },
  { id: 'wege', label: 'Wege' },
];

export function FreightSheet({ ctx }: { ctx: SheetContext }) {
  // 4.7 Andockpunkt: Fernleitung als eigener Reiter, nur wenn freigeschaltet.
  const tabs = showTrunkTab(ctx.game) ? [...FREIGHT_TABS, { id: 'fernleitung', label: 'Fernleitung' }] : FREIGHT_TABS;
  const tab = activeTab('fracht', tabs, ctx.tab);
  return (
    <Tabs sheet="fracht" tabs={tabs} active={tab} onChange={ctx.onTab}>
      {tab === 'verkauf' && <SalePanel game={ctx.game} onSold={ctx.onGame} />}
      {tab === 'lager' && <StoragePanel game={ctx.game} onChange={ctx.onGame} />}
      {tab === 'pipeline' && <PipelinePanel game={ctx.game} onChange={ctx.onGame} />}
      {tab === 'wege' && <RoutePlanPanel game={ctx.game} />}
      {tab === 'fernleitung' && <TrunkPipelineTab ctx={ctx} />}
    </Tabs>
  );
}
