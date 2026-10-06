// Welches Fenster wie heißt, wie groß es ist und was darin liegt (0.2.15+9).

import type { ReactNode } from 'react';
import type { OpenItem } from '../inbox';
import type { OpenSheet, SheetId } from '../sceneState';
import { Sheet, type SheetSize } from '../sheet/Sheet';
import { BellSheet } from './BellSheet';
// 4.14 Andockpunkt: Marke und Tankstellen.
import { BrandSheet } from './BrandSheet';
import { brandContent } from '../brand';
import { localize } from '../../sim/i18n';
import { CalendarSheet } from './CalendarSheet';
import { FamilySheet } from './FamilySheet';
import { FreightSheet } from './FreightSheet';
import { IncidentsSheet } from './IncidentsSheet';
import { KonzernSheet } from './KonzernSheet'; // 4.17 Andockpunkt
import { JournalSheet } from './JournalSheet';
import { LedgerSheet } from './LedgerSheet';
import { GlossarySheet } from './GlossarySheet';
import { MenuSheet, type MenuProps } from './MenuSheet';
import { NewspaperSheet } from './NewspaperSheet';
import { PostSheet } from './PostSheet';
// 4.6 Andockpunkt: Raffinerie.
import { RefinerySheet } from './RefinerySheet';
import { rt } from '../refinery';
import { ReportSheet, type RoundReport } from './ReportSheet';
import { RigFileSheet } from './RigFileSheet';
import { RivalsSheet } from './RivalsSheet';
import { StaffSheet } from './StaffSheet'; // 4.9 Andockpunkt
import type { SheetContext } from './types';
import { WaitingSheet } from './WaitingSheet';
import { chapterOf } from '../../sim/chapterOf';
// 4.11 Andockpunkt: Schattenbuch (Ermittler) und Werkstatt (Forschung).
import { ShadowBookSheet } from './ShadowBookSheet';
import { WorkshopSheet } from './WorkshopSheet';
// 4.15 Andockpunkt: Börsenticker.
import { ExchangeSheet } from './ExchangeSheet';
// 4.16 Andockpunkt
import { HallsteadSheet } from './HallsteadSheet';

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
  glossar: { title: 'Glossar', size: 'mappe' },
  glocke: { title: 'Runde beenden', size: 'brief' },
  bericht: { title: 'Was diese Runde geschah', size: 'brief' },
  wartende: { title: 'Wer vor der Tür wartet', size: 'brief' },
  // 4.6 Andockpunkt: Raffinerie.
  raffinerie: { title: rt('sheetTitle'), size: 'mappe' },
  personal: { title: 'Personal', size: 'mappe' }, // 4.9 Andockpunkt
  // 4.11 Andockpunkt
  schattenbuch: { title: 'Schattenbuch', size: 'brief' },
  werkstatt: { title: 'Werkstatt', size: 'mappe' },
  // 4.14 Andockpunkt: Marke und Tankstellen.
  marke: { title: localize(brandContent.object.title), size: 'mappe' },
  // 4.15 Andockpunkt: Börsenticker.
  boerse: { title: 'Börsenticker', size: 'mappe' },
  // 4.16 Andockpunkt
  hallstead: { title: 'Hallstead-Mappe', size: 'mappe' },
  konzern: { title: 'Konzern und Gesellschaft', size: 'mappe' }, // 4.17 Andockpunkt
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
  /** Rundenbericht der letzten Glocke (0.2.15+11). */
  report: RoundReport | null;
  /** Besucher hereinbitten (Fenster „Wer wartet“). */
  onVisitor: (eventId: string) => void;
}

export function SheetHost({ open, ctx, menu, notice, onClose, onBack, onEndRound, onGo, onChapterEnd, closing = false, report, onVisitor }: SheetHostProps) {
  // 0.4.20+34: Ab Kapitel 2 sind die Termine das Telefon.
  const info = open.id === 'termine' && chapterOf(ctx.game) >= 2 ? { ...SHEET_INFO.termine, title: 'Telefon' } : SHEET_INFO[open.id];
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
    glossar: () => <GlossarySheet />,
    glocke: () => <BellSheet ctx={ctx} onEndRound={onEndRound} onGo={onGo} onChapterEnd={onChapterEnd} />,
    bericht: () => <ReportSheet report={report} onDone={onClose} next={open.then === 'zeitung'} onJournal={() => ctx.open('protokoll', { back: { sheet: 'bericht' } })} />,
    wartende: () => <WaitingSheet ctx={ctx} onVisitor={onVisitor} />,
    // 4.6 Andockpunkt: Raffinerie.
    raffinerie: () => <RefinerySheet ctx={ctx} />,
    personal: () => <StaffSheet ctx={ctx} />, // 4.9 Andockpunkt
    // 4.11 Andockpunkt
    schattenbuch: () => <ShadowBookSheet ctx={ctx} />,
    werkstatt: () => <WorkshopSheet ctx={ctx} />,
    // 4.14 Andockpunkt: Marke und Tankstellen.
    marke: () => <BrandSheet ctx={ctx} />,
    // 4.15 Andockpunkt: Börsenticker.
    boerse: () => <ExchangeSheet ctx={ctx} />,
    // 4.16 Andockpunkt
    hallstead: () => <HallsteadSheet ctx={ctx} />,
    konzern: () => <KonzernSheet ctx={ctx} />, // 4.17 Andockpunkt
  };
  return (
    <Sheet
      title={info.title}
      // 4.10 Andockpunkt (Integration): Mit Diplomatie hat die Pinnwand fünf Reiter – die passen nur in die breite Mappe.
      size={open.id === 'konkurrenz' && ctx.game.diplomacy ? 'mappe' : info.size}
      className={`sheet-${open.id}`}
      origin={open.id === 'wartende' ? '.objekt-tuer' : `.objekt[data-sheet="${open.id}"]`}
      closing={closing}
      onClose={onClose}
      back={open.back ? { label: SHEET_INFO[open.back.sheet].title, onBack } : undefined}
      note={notice}
    >
      {inhalt[open.id]()}
    </Sheet>
  );
}
