// Fenster „Konkurrenz“ (Pinnwand): Jacobs Pachten und Optionen, Bullard und die
// kleinen Wildcatter – die Zahlen, die früher in der Statuszeile standen.

import { wildcatterWells } from '../../sim/wildcatters';
import { pricingView } from '../../sim/pricing'; // Etappe 2: Förderbremse und Ruf bei den Wildcattern
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
                {pricingView(game).cartel?.members.includes(f.name) && ' · in der Förderbremse'}
              </li>
            ))}
          </ul>
          <Foerderbremse game={game} />
        </>
      )}
    </>
  );
}

/** Förderbremse und Ruf bei den Wildcattern (Etappe 2) – alles aus pricingView. */
function Foerderbremse({ game }: { game: GameState }) {
  const v = pricingView(game);
  const c = v.cartel;
  return (
    <>
      <p className="klein">Jacobs Ruf bei den Wildcattern: {v.standingWord}.</p>
      {c ? (
        <>
          <h3>Förderbremse</h3>
          <ul className="pinnwand-liste klein">
            <li>
              Mitglieder: {c.members.join(', ')} – {Math.round(c.share * 100)} % der Nachbarquellen drosseln
            </li>
            <li>
              Jacob drosselt {Math.round(c.jacobCut * 100)} % · noch {c.roundsLeft} {c.roundsLeft === 1 ? 'Runde' : 'Runden'} ·{' '}
              Bullard {c.bullard === 'in' ? 'macht mit' : c.bullard === 'out' ? 'bleibt draußen' : 'ist noch nicht gefragt'}
            </li>
            <li>{c.held ? 'Diese Runde gehalten.' : 'Diese Runde noch nicht gehalten – die Versuchung wächst.'}</li>
            {c.gossip && <li>Gerede: {c.gossip}</li>}
            {v.lastEffect !== null && <li>Wirkung auf den Preis dieser Runde: {v.lastEffect >= 0 ? '+' : ''}{Math.round(v.lastEffect * 100)} %</li>}
          </ul>
        </>
      ) : v.banRounds > 0 ? (
        <p className="klein">Nach dem letzten Pakt will noch {v.banRounds} {v.banRounds === 1 ? 'Runde' : 'Runden'} niemand von einer Förderbremse hören.</p>
      ) : null}
    </>
  );
}
