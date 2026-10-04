// Fenster „Familie“ (H): Ruth und – nach der Geburt – Thomas (2.7).

import { FamilyPanel } from '../FamilyPanel';
import type { SheetContext } from './types';

export function FamilySheet({ ctx }: { ctx: SheetContext }) {
  // Der Fensterkopf heißt schon „Familie“ – kein zweiter Titel darunter.
  return <FamilyPanel game={ctx.game} debug={ctx.debug} hideTitle />;
}
