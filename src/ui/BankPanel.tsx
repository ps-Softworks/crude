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
  loanSlider,
  quarterInterest,
  quarterInterestTotal,
  repay,
  repaySlider,
  sliderAmount,
  sliderPositions,
  takeLoan,
  type AmountSlider,
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

/** Schieberegler über die Stellungen, die die Simulation vorgibt; die letzte Stellung ist genau das Maximum. */
function Regler({
  slider,
  position,
  onChange,
  label,
}: {
  slider: AmountSlider;
  position: number;
  onChange: (position: number) => void;
  label: string;
}) {
  const letzte = sliderPositions(slider) - 1;
  return (
    <input
      type="range"
      className="regler"
      aria-label={label}
      min={0}
      max={letzte}
      step={1}
      value={Math.min(position, letzte)}
      disabled={letzte === 0}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function BankPanel({ game, onResult }: { game: GameState; onResult: (result: LoanResult) => void }) {
  // Reglerstellungen: Kredit startet beim kleinsten Kredit, Tilgung bei „alles“.
  const [kreditPos, setKreditPos] = useState(0);
  const [tilgPos, setTilgPos] = useState(Number.MAX_SAFE_INTEGER);
  const schuld = debt(game);
  const rahmen = creditLimit(game, balance);
  const frei = headroom(game, balance);
  const pfandFrei = freeCollateral(game).length;
  const zinsZeile = quarterInterestTotal(game);

  // Reglergrenzen und Folgen kommen aus der Simulation (Probelauf).
  const kreditRegler = loanSlider(game, balance);
  const kreditBetrag = kreditRegler ? sliderAmount(kreditRegler, kreditPos) : 0;
  const kreditProbe = kreditRegler ? takeLoan(game, balance, kreditBetrag) : takeLoan(game, balance, balance.credit.minLoan);
  const tilgRegler = repaySlider(game, balance);
  const tilgBetrag = tilgRegler ? sliderAmount(tilgRegler, tilgPos) : 0;
  const tilgProbe = tilgRegler ? repay(game, balance, tilgBetrag) : null;

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

      <div className="regler-zeile">
        <strong>Kredit aufnehmen</strong>
        {kreditRegler ? (
          <>
            <Regler slider={kreditRegler} position={kreditPos} onChange={setKreditPos} label="Kredit aufnehmen" />
            <span className="regler-wert">
              {money(kreditBetrag)}
              {kreditProbe.ok && (
                <>
                  {' '}
                  · {percent(kreditProbe.loan.rate)} pro Jahr · Zins je Quartal danach {money(quarterInterestTotal(kreditProbe.state))}
                </>
              )}
            </span>
            <button
              disabled={!kreditProbe.ok}
              onClick={() => {
                onResult(takeLoan(game, balance, kreditBetrag));
                setKreditPos(0);
              }}
            >
              {money(kreditBetrag)} leihen
            </button>
          </>
        ) : (
          !kreditProbe.ok && <p className="hint">{kreditProbe.reason}</p>
        )}
      </div>

      {game.loans.length > 0 && (
        <div className="regler-zeile">
          <strong>Tilgen</strong>
          {tilgRegler ? (
            <>
              <Regler slider={tilgRegler} position={tilgPos} onChange={setTilgPos} label="Tilgen" />
              <span className="regler-wert">
                {money(tilgBetrag)}
                {tilgBetrag === schuld && ' (alles)'}
                {tilgProbe?.ok && (
                  <>
                    {' '}
                    · Restschuld {money(debt(tilgProbe.state))} · Zins je Quartal danach{' '}
                    {money(quarterInterestTotal(tilgProbe.state))}
                  </>
                )}
              </span>
              <button
                disabled={!tilgProbe?.ok}
                title="Zuerst das teurere Geld tilgen"
                onClick={() => {
                  onResult(repay(game, balance, tilgBetrag));
                  setTilgPos(Number.MAX_SAFE_INTEGER);
                }}
              >
                {money(tilgBetrag)} tilgen
              </button>
            </>
          ) : (
            <p className="hint">Kein Geld in der Kasse zum Tilgen.</p>
          )}
        </div>
      )}
      {tilgProbe && !tilgProbe.ok && <p className="hint">{tilgProbe.reason}</p>}
    </div>
  );
}
