// Der Börsenticker auf dem Schreibtisch (4.15, GDD §3: „Mahagoni, Börsenticker
// und Radio (Kapitel 3)“). Erscheint erst, wenn es die Börse gibt (state.exchange).
// Das Papierband zeigt die Kurse der letzten Runde; ein Telegramm des Maklers
// (Nachschuss, Zwangsverkauf) setzt ein rotes Abzeichen. Gezählt wird in src/sim.

import { priceChange } from '../../sim/exchange';
import type { GameState } from '../../sim/game';
import { balance } from '../balance';
import { keyForSheet } from '../keys';
import '../sheets/exchange.css';
import { DeskObject, type Placement } from './DeskObject';

/** Platz auf dem Tisch: unter dem Kassenbuch, zwischen Ruths Zettel und Glocke (mit Raffinerie geteilt, siehe DeskScene). */
export const TICKER_AT: Placement = { left: 72.5, top: 75, width: 12.5, height: 22 };

function TickerShape() {
  return (
    <svg viewBox="0 0 100 80" className="form" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      {/* Sockel, Glasglocke, Messingwerk */}
      <rect x="18" y="62" width="64" height="10" rx="2" className="f-holz-dunkel" />
      <path d="M26,62 L26,30 Q50,2 74,30 L74,62 Z" className="f-papier-dunkel" opacity="0.55" />
      <rect x="34" y="40" width="32" height="20" rx="3" className="f-messing" />
      <circle cx="50" cy="36" r="6" className="f-messing-dunkel" />
      {/* Papierband */}
      <path d="M66,52 C80,52 84,60 92,72" className="f-papier" />
    </svg>
  );
}

/** 0.4.20+10: Kurstafel an der Wand (Kapitel 3, Mahagoni-Tisch) – schwarze Tafel mit Messingrahmen, die Kurse stehen darauf. */
function BoardShape() {
  return (
    <svg viewBox="0 0 100 110" className="form" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <rect x="4" y="4" width="92" height="102" rx="3" className="f-messing-dunkel" />
      <rect x="10" y="10" width="80" height="90" rx="2" className="f-tafel" />
      <rect x="18" y="16" width="64" height="9" rx="1" className="f-messing" />
    </svg>
  );
}

export function ExchangeTicker({
  game,
  at = TICKER_AT,
  board = false,
  glow,
  onOpen,
}: {
  game: GameState;
  at?: Placement;
  /** Ab Kapitel 3 hängt statt des Tickers eine Kurstafel an der Wand (gleiches Fenster, gleiche Taste). */
  board?: boolean;
  glow: boolean;
  onOpen: () => void;
}) {
  const ex = game.exchange;
  if (!ex) return null;
  const telegramme = ex.positions.filter((p) => p.called).length + ex.liquidated.length;
  const band = balance.exchange.stocks.slice(0, 3).map((s) => {
    const d = priceChange(ex, s.id);
    return (
      <span key={s.id} className={d < 0 ? 'ab' : d > 0 ? 'auf' : undefined}>
        {/* 0.4.19+3: nur Kürzel und Pfeil – mit Kurs passte das Band nicht auf den Ticker („CRA 1…“). Kurse stehen im Fenster. */}
        {s.id.slice(0, 3).toUpperCase()}
        {d < 0 ? '▼' : d > 0 ? '▲' : '·'}{' '}
      </span>
    );
  });
  return (
    <DeskObject
      id="boerse"
      name={board ? 'Kurstafel' : 'Börsenticker'}
      shortcut={keyForSheet('boerse')}
      at={at}
      sheet="boerse"
      glow={glow}
      onOpen={onOpen}
      status={ex.positions.length > 0 ? `${ex.positions.length} im Depot` : 'Kurse'}
      badge={telegramme > 0 ? { text: telegramme === 1 ? 'Telegramm' : `${telegramme} Telegramme`, urgent: ex.positions.some((p) => p.called) } : null}
    >
      {board ? <BoardShape /> : <TickerShape />}
      <span className={board ? 'kurstafel-zeilen' : 'ticker-band'} aria-hidden="true">
        {band}
      </span>
    </DeskObject>
  );
}
