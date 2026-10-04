// Fenster „Termine“ (T): oben die Termine der Runde als Punkte und Jacobs
// Zustand, darunter die festen Termine, die diese Runde noch gingen (2.3).

import { agendaView } from '../../sim/agenda';
import { formatDate } from '../../sim/game';
import { balance } from '../balance';
import { Termine } from '../scene/TopBar';
import { EventStack } from './EventStack';
import type { SheetContext } from './types';

export function CalendarSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const t = agendaView(game, balance);
  return (
    <>
      <p className="kalender-kopf">
        <strong>
          {formatDate(game)} · Runde {game.round} von {game.totalRounds}
        </strong>
        <br />
        <Termine game={game} debug={ctx.debug} lang />
      </p>
      {!game.finished && t.sickRounds > 0 && (
        <p className="krankmeldung">
          Jacob liegt krank im Bett{t.sickRounds > 1 ? ` – noch ${t.sickRounds} Runden` : ' – diese Runde noch'}. Keine Termine: Ereignisse
          und Briefe bekommen ihre Standardantwort.
        </p>
      )}
      <EventStack
        game={game}
        list={ctx.inbox.routines}
        empty="Diese Runde stehen keine festen Termine mehr im Kalender."
        onResolved={ctx.onGame}
        listLabel="Feste Termine"
        cardClass={() => 'event termin'}
      />
    </>
  );
}
