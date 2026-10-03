// Bankkredit: Rating, Schulden, Rahmen und die Zinsrechnung. Alle Regeln stehen
// in src/sim/credit – hier wird nur angezeigt und geklickt.

import { useState } from 'react';
import type { Rating } from '../sim/balance';
import {
  creditLimit,
  debt,
  freeCollateral,
  headroom,
  loanRate,
  quarterInterest,
  repay,
  takeLoan,
  type LoanResult,
} from '../sim/credit';
import type { GameState } from '../sim/game';
import { parcelLabel } from '../sim/lease';
import { balance } from './balance';

/** Was das Rating über Jacobs Ruf bei der Bank sagt. */
const RATING_TEXT: Record<Rating, string> = {
  A: 'die Bank vertraut dir blind',
  B: 'solide',
  C: 'die Bank schaut genau hin',
  D: 'keine neuen Kredite',
};

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Zins als Prozent, z. B. 0.07 -> "7 %". */
function percent(value: number) {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

function parcelName(game: GameState, parcelId: string | null) {
  const parcel = game.parcels.find((p) => p.id === parcelId);
  return parcel ? `Parzelle ${parcelLabel(parcel)}` : '–';
}

export function BankPanel({ game, onResult }: { game: GameState; onResult: (result: LoanResult) => void }) {
  const [betrag, setBetrag] = useState<string>('');
  const schuld = debt(game);
  const rahmen = creditLimit(game, balance);
  const frei = headroom(game, balance);
  const pfandFrei = freeCollateral(game).length;
  const wert = betrag === '' ? frei : Number(betrag);
  const tilgung = Math.min(Math.floor(game.cash), schuld);

  // Probelauf: Die Simulation sagt, ob die Aktion gerade geht und warum nicht.
  const probe = takeLoan(game, balance, wert);
  const zinsZeile = game.loans.length > 0 ? game.loans.reduce((s, l) => s + quarterInterest(l), 0) : 0;

  return (
    <div className="bank-panel">
      <p className={`state rating rating-${game.rating.toLowerCase()}`}>
        <strong>Rating {game.rating}</strong> – {RATING_TEXT[game.rating]}
        {game.missedPayments > 0 && (
          <>
            {' '}
            · {game.missedPayments} {game.missedPayments === 1 ? 'Zahlung nicht pünktlich' : 'Zahlungen nicht pünktlich'}
          </>
        )}
      </p>

      {game.bankruptcyDeadline > 0 && (
        <p className="state pleite">
          Die Kasse ist im Minus und niemand leiht mehr: Bis Runde {game.bankruptcyDeadline} muss Geld herein,
          sonst ist Jacob pleite.
        </p>
      )}

      <dl className="terms">
        <dt>Schulden</dt>
        <dd>{money(schuld)}</dd>
        <dt>Bankrahmen</dt>
        <dd>
          {money(rahmen)} · frei {money(frei)}
        </dd>
        <dt>Zins heute</dt>
        <dd>
          {percent(loanRate(balance, game.rating, pfandFrei > 0))} mit Pfand ·{' '}
          {percent(loanRate(balance, game.rating, false))} ohne
          {pfandFrei > 0 ? ` · ${pfandFrei} Quelle als Pfand frei` : ' · keine Quelle als Pfand frei'}
        </dd>
        <dt>Zins je Quartal</dt>
        <dd>{money(zinsZeile)}</dd>
      </dl>

      {game.loans.length === 0 ? (
        <p className="muted">Keine Schulden.</p>
      ) : (
        <ul className="loans">
          {game.loans.map((loan) => (
            <li key={loan.id}>
              {loan.source === 'bank' ? 'Bank' : 'Geldverleiher'} · {money(loan.principal)} ·{' '}
              {percent(loan.rate)} pro Jahr
              <br />
              {money(loan.principal)} × {percent(loan.rate)} ÷ 4 = {money(quarterInterest(loan))} je Quartal
              {loan.collateral && <> · Pfand {parcelName(game, loan.collateral)}</>}
            </li>
          ))}
        </ul>
      )}

      <label>
        Betrag (${balance.credit.minLoan} = kleinster Kredit){' '}
        <input
          type="number"
          min={balance.credit.minLoan}
          step={balance.credit.minLoan}
          value={betrag === '' ? frei : betrag}
          onChange={(e) => setBetrag(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          disabled={!probe.ok}
          title={probe.ok ? `${percent(probe.loan.rate)} pro Jahr` : probe.reason}
          onClick={() => {
            const r = takeLoan(game, balance, wert);
            onResult(r);
            if (r.ok) setBetrag('');
          }}
        >
          Kredit aufnehmen ({money(wert)})
        </button>
        <button
          disabled={schuld === 0 || tilgung <= 0}
          title={schuld > 0 ? 'Zuerst das teurere Geld tilgen' : 'Du schuldest niemandem Geld'}
          onClick={() => onResult(repay(game, balance, tilgung))}
        >
          Tilgen ({money(tilgung)})
        </button>
      </div>
      {!probe.ok && <p className="hint">{probe.reason}</p>}
    </div>
  );
}