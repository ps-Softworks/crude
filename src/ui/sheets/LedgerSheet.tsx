// Fenster „Kassenbuch“ (G): Kasse, Schulden, Rahmen und Rating im Kopf, darunter
// die Regler für Kredit und Tilgung (BankPanel, 0.2.15+1).

import { creditLimit, debt, headroom } from '../../sim/credit';
import { balance } from '../balance';
import { BankPanel } from '../BankPanel';
import { money } from '../format';
import type { SheetContext } from './types';

export function LedgerSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  return (
    <>
      <p className="kassenbuch-kopf">
        Kasse <strong>{money(game.cash)}</strong> · Schulden {money(debt(game))} · Rahmen frei {money(headroom(game, balance))} von{' '}
        {money(creditLimit(game, balance))} · Rating {game.rating}
      </p>
      <BankPanel game={game} onResult={ctx.onLoan} />
    </>
  );
}
