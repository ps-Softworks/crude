// Welches Fenster wie heißt, wie groß es ist und was darin liegt (0.2.15+9).

import type { ReactNode } from 'react';
import type { OpenItem } from '../inbox';
import type { OpenSheet, SheetId } from '../sceneState';
import { Sheet, type SheetSize } from '../sheet/Sheet';
import { BellSheet } from './BellSheet';
import { CalendarSheet } from './CalendarSheet';
import { FamilySheet } from './FamilySheet';
import { FreightSheet } from './FreightSheet';
import { IncidentsSheet } from './IncidentsSheet';
import { JournalSheet } from './JournalSheet';
import { LedgerSheet } from './LedgerSheet';
import { MenuSheet, type MenuProps } from './MenuSheet';
import { NewspaperSheet } from './NewspaperSheet';
import { PostSheet } from './PostSheet';
import { RigFileSheet } from './RigFileSheet';
import { RivalsSheet } from './RivalsSheet';
import type { SheetContext } from './types';

export const SHEET_INFO: Record<SheetId, { title: string; size: SheetSize }> = {
  zeitung: { title: 'Zeitung', size: 'brief' },
  post: { title: 'Post', size: 'mappe' },
  vorfaelle: { title: 'Vorfälle', size: 'mappe' },
  termine: { title: 'Termine', size: 'mappe' },
  kassenbuch: { title: 'Kassenbuch', size: 'mappe' },
  akte: { title: 'Bohrturm-Akte', size: 'mappe' },
  fracht: { title: 'Fracht', size: 'mappe' },
  familie: { title: 'Familie', size: 'brief' },
  protokoll: { title: 'Protokoll', size: 'mappe' },
  konkurrenz: { title: 'Konkurrenz', size: 'brief' },
  menu: { title: 'Menü', size: 'brief' },
  glocke: { title: 'Runde beenden', size: 'brief' },
};

export interface SheetHostProps {
  open: OpenSheet;
  ctx: SheetContext;
  menu: Omit<MenuProps, 'ctx'>;
  /** Rückmeldung der letzten gescheiterten Aktion. */
  notice: string | null;
  onClose: () => void;
  onBack: () => void;
  onEndRound: () => void;
  onGo: (item: OpenItem) => void;
  onChapterEnd: (() => void) | null;
  /** Geht gerade zu (0.2.15+10: kurzer Übergang). */
  closing?: boolean;
}

export function SheetHost({ open, ctx, menu, notice, onClose, onBack, onEndRound, onGo, onChapterEnd, closing = false }: SheetHostProps) {
  const info = SHEET_INFO[open.id];
  const inhalt: Record<SheetId, () => ReactNode> = {
    zeitung: () => <NewspaperSheet ctx={ctx} />,
    post: () => <PostSheet ctx={ctx} />,
    vorfaelle: () => <IncidentsSheet ctx={ctx} />,
    termine: () => <CalendarSheet ctx={ctx} />,
    kassenbuch: () => <LedgerSheet ctx={ctx} />,
    akte: () => <RigFileSheet ctx={ctx} />,
    fracht: () => <FreightSheet ctx={ctx} />,
    familie: () => <FamilySheet ctx={ctx} />,
    protokoll: () => <JournalSheet ctx={ctx} />,
    konkurrenz: () => <RivalsSheet ctx={ctx} />,
    menu: () => <MenuSheet ctx={ctx} {...menu} />,
    glocke: () => <BellSheet ctx={ctx} onEndRound={onEndRound} onGo={onGo} onChapterEnd={onChapterEnd} />,
  };
  return (
    <Sheet
      title={info.title}
      size={info.size}
      className={`sheet-${open.id}`}
      origin={`.objekt[data-sheet="${open.id}"]`}
      closing={closing}
      onClose={onClose}
      back={open.back ? { label: SHEET_INFO[open.back.sheet].title, onBack } : undefined}
      note={notice}
    >
      {inhalt[open.id]()}
    </Sheet>
  );
}
