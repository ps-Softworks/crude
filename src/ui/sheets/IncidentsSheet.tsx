// Fenster „Vorfälle“ (N): die Zettel am Notizspieß – Ereignisse ohne Brief und
// ohne Besucher (die warten an der Tür). Szenen, die man auf „später“ legt, hängen auch hier.

import { EventStack } from './EventStack';
import type { SheetContext } from './types';

export function IncidentsSheet({ ctx }: { ctx: SheetContext }) {
  return (
    <EventStack
      game={ctx.game}
      list={[...ctx.inbox.incidents, ...ctx.inbox.tableaus]}
      empty="Am Notizspieß hängt nichts."
      onResolved={ctx.onGame}
      listLabel="Vorfälle"
      focus={ctx.focus}
      next="nächster Vorfall"
      cardClass={() => 'event'}
      itemMeta={(e) => (e.urgent ? 'Frist läuft ab' : `noch ${e.roundsLeft} Runden`)}
    />
  );
}
