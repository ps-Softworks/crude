// Fenster „Kassenbuch“ (G): Kasse, Schulden, Rahmen und Rating im Kopf, darunter
// die Regler für Kredit und Tilgung (BankPanel, 0.2.15+1).
// 4.8 Andockpunkt: Ab Kapitel 2 (state.stocks) bekommt das Kassenbuch Reiter für
// Aktienbuch, Aufsichtsrat und Anleihen (StocksPanel). In Kapitel 1 bleibt es, wie es war.

import { creditLimit, debt, headroom } from '../../sim/credit';
import { startStocks, stocksAttention } from '../../sim/stocks';
import { balance } from '../balance';
import { BankPanel } from '../BankPanel';
import { money } from '../format';
import { Tabs, activeTab } from '../sheet/Tabs';
import { stocksContent } from '../stocks';
import { BoardPanel, BondsPanel, SharesPanel } from '../StocksPanel';
import type { SheetContext } from './types';

export function LedgerSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const kopf = (
    <p className="kassenbuch-kopf">
      Kasse <strong>{money(game.cash)}</strong> · Schulden {money(debt(game))} · Rahmen frei {money(headroom(game, balance))} von{' '}
      {money(creditLimit(game, balance))} · Rating {game.rating}
    </p>
  );
  // 4.8 Andockpunkt: ohne Aktienbuch (Kapitel 1) nur die Bank. Der Debug-Knopf zum Anlegen steht im Menü → Debug → „Vorab freischalten“.
  if (!game.stocks) {
    return (
      <>
        {kopf}
        <BankPanel game={game} onResult={ctx.onLoan} />
      </>
    );
  }
  const achtung = stocksAttention(game);
  const tabs = [
    { id: 'bank', label: 'Bank' },
    ...(game.stocks.public
      ? [
          { id: 'aktien', label: 'Aktienbuch' },
          { id: 'rat', label: 'Aufsichtsrat', badge: achtung ? '!' : undefined },
        ]
      : []),
    { id: 'anleihen', label: 'Anleihen' },
  ];
  const tab = activeTab('kassenbuch', tabs, ctx.tab);
  return (
    <>
      {kopf}
      <Tabs sheet="kassenbuch" tabs={tabs} active={tab} onChange={ctx.onTab}>
        {tab === 'bank' && <BankPanel game={game} onResult={ctx.onLoan} />}
        {tab === 'aktien' && <SharesPanel game={game} onChange={ctx.onGame} debug={ctx.debug} />}
        {tab === 'rat' && <BoardPanel game={game} onChange={ctx.onGame} debug={ctx.debug} />}
        {tab === 'anleihen' && <BondsPanel game={game} onChange={ctx.onGame} />}
      </Tabs>
    </>
  );
}

/** 4.8 Andockpunkt: Debug-Knopf im gemeinsamen Abschnitt „Vorab freischalten“ (Menü → Debug).
 *  Nur zum Ausprobieren, bis 4.5 Kapitel 2 startet: Börsengang mit 49 %, wenn noch keiner entschieden ist. */
export function StocksDebugButton({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  if (game.stocks) return <span className="muted klein">Aktienbuch ist angelegt (Kassenbuch → Aktienbuch).</span>;
  if (game.finished) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.onGame(startStocks({ ...game, ipo: game.ipo ?? { share: 0.49, proceeds: 0 } }, balance, stocksContent.board, { force: true }))}
    >
      Aktienbuch anlegen (Kapitel 2 testen, Börsengang 49 %)
    </button>
  );
}
