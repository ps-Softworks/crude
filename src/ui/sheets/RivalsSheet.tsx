// Fenster „Konkurrenz“ (Pinnwand): Jacobs Pachten und Optionen, Bullard und die
// kleinen Wildcatter – die Zahlen, die früher in der Statuszeile standen.

import { wildcatterWells } from '../../sim/wildcatters';
import { balance } from '../balance';
import { money } from '../format';
import type { SheetContext } from './types';
import type { GameState } from '../../sim/game';
import { Tabs, activeTab } from '../sheet/Tabs';
import { DiplomacyTab, diplomacyTabs, revierTabLabel } from './DiplomacySheet'; // 4.10 Andockpunkt

/** Kurzform für Pinnwand und Kartenleiste. */
export function rivalsLines(game: GameState): { jacob: string; bullard: string; wildcatter: string | null } {
  const leases = game.leases.filter((l) => l.holder === 'jacob').length;
  const options = game.options.filter((o) => o.holder === 'jacob').length;
  const rivalLeases = game.leases.filter((l) => l.holder === 'bullard').length;
  const rivalWells = game.rival.wells.filter((w) => w.status === 'found').length;
  return {
    jacob: `Jacob: ${leases} ${leases === 1 ? 'Pacht' : 'Pachten'}, ${options} ${options === 1 ? 'Option' : 'Optionen'}`,
    bullard: `${balance.rivals.bullard.name}: ${rivalLeases} ${rivalLeases === 1 ? 'Pacht' : 'Pachten'}, ${rivalWells} ${rivalWells === 1 ? 'Quelle' : 'Quellen'}`,
    wildcatter:
      game.wildcatters.firms.length > 0
        ? `Wildcatter: ${game.wildcatters.firms.length} ${game.wildcatters.firms.length === 1 ? 'Firma' : 'Firmen'}, ${wildcatterWells(game)} Quellen`
        : null,
  };
}

export function RivalsSheet({ ctx }: { ctx: SheetContext }) {
  // 4.10 Andockpunkt: Ab Kapitel 2 (state.diplomacy) bekommt die Pinnwand Reiter für die Diplomatie.
  const diplo = diplomacyTabs(ctx.game);
  if (diplo.length > 0) {
    const tabs = [{ id: 'revier', label: revierTabLabel() }, ...diplo];
    const tab = activeTab('konkurrenz', tabs, ctx.tab);
    return (
      <Tabs sheet="konkurrenz" tabs={tabs} active={tab} onChange={ctx.onTab}>
        {tab === 'revier' ? <Revier ctx={ctx} /> : <DiplomacyTab tab={tab} ctx={ctx} />}
      </Tabs>
    );
  }
  return <Revier ctx={ctx} />;
}

function Revier({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const z = rivalsLines(game);
  return (
    <>
      <ul className="pinnwand-liste">
        <li>{z.jacob}</li>
        <li>
          {z.bullard}
          {ctx.debug && <span className="muted"> · Kasse {money(game.rival.cash)}</span>}
        </li>
        <li>{z.wildcatter ?? 'Noch keine kleinen Wildcatter im Revier.'}</li>
      </ul>
      {game.wildcatters.firms.length > 0 && (
        <>
          <h3>Die kleinen Wildcatter</h3>
          <ul className="pinnwand-liste klein">
            {game.wildcatters.firms.map((f) => (
              <li key={f.name}>
                {f.name}: {f.wells} {f.wells === 1 ? 'Quelle' : 'Quellen'}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
