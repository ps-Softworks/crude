// Fenster „Post“ (B): links die Briefe nach Frist, rechts der Brief – mit
// Dokument und Vergleichsstück nebeneinander und der Lupe je Feld (2.4, 2.5).

import { BRIEFART } from '../EventCard';
import { EventStack } from './EventStack';
import type { SheetContext } from './types';

export function PostSheet({ ctx }: { ctx: SheetContext }) {
  return (
    <EventStack
      game={ctx.game}
      list={ctx.inbox.letters}
      empty="Der Posteingang ist leer."
      onResolved={ctx.onGame}
      listLabel="Briefe"
      focus={ctx.focus}
      next="nächster Brief"
      cardClass={(e) => (e.urgent ? 'event brief dringend' : 'event brief')}
      itemMeta={(e) => (
        <>
          {e.mail && BRIEFART[e.mail]} · {e.urgent ? 'läuft ab' : `noch ${e.roundsLeft} Runden`}
          {e.document && ' · mit Dokument'}
        </>
      )}
    />
  );
}
