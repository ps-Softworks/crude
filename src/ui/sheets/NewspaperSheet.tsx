// Fenster „Zeitung“ (Z): die Zeitung zu Beginn der Runde (2.6).

import { NewspaperPanel } from '../NewspaperPanel';
import type { SheetContext } from './types';

export function NewspaperSheet({ ctx }: { ctx: SheetContext }) {
  if (ctx.game.finished) return <p className="muted">Das Kapitel ist zu Ende – keine neue Ausgabe.</p>;
  return <NewspaperPanel game={ctx.game} />;
}
