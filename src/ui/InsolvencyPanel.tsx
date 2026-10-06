// Pleitefrist mit Auswegen (GDD §8): steht im Kassenbuch über der Bank, solange die Frist läuft.
// Notverkauf (Ranch-Fenster, Bohrturm-Akte, Vertrieb), Umschuldung, Rettung durch Mr. Vale – Regeln in src/sim/insolvency.ts.

import type { GameState } from '../sim/game';
import {
  acceptValeRescue,
  cashGap,
  emergencySales,
  insolvencyRoundsLeft,
  restructureBlocker,
  restructureDebt,
  restructureQuote,
  valeRescueBlocker,
  valeRescueQuote,
} from '../sim/insolvency';
import { ConfirmButton } from './ConfirmButton';
import { balance } from './balance';
import { barrels, money, NBSP } from './format';
import type { SheetContext } from './sheets/types';

function prozent(value: number) {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })}${NBSP}%`;
}

function name(game: GameState, parcelId: string) {
  return game.parcels.find((p) => p.id === parcelId)?.name ?? parcelId;
}

export function InsolvencyPanel({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  if (game.finished || game.bankruptcyDeadline <= 0) return null;
  const rest = insolvencyRoundsLeft(game);
  const verkauf = emergencySales(game, balance);
  const umschuldung = restructureQuote(game, balance);
  const umSperre = restructureBlocker(game, balance);
  const vale = valeRescueQuote(game, balance);
  const valeSperre = valeRescueBlocker(game);
  return (
    <section className="pleitefrist" aria-labelledby="pleitefrist-titel">
      <h3 id="pleitefrist-titel">Bankrott droht – Auswege</h3>
      <p className="state pleite">
        In der Kasse fehlen {money(Math.round(cashGap(game)))}. Die Frist läuft bis Ende Runde {game.bankruptcyDeadline}
        {rest === 0 ? ' – das ist diese Runde.' : ` – diese Runde und ${rest === 1 ? 'eine weitere' : `${rest} weitere`}.`} Steht die Kasse am
        Ende der Frist noch im Minus, ist Jacob pleite.
      </p>

      <h4>Notverkauf</h4>
      {verkauf.leases.length + verkauf.rigs.length === 0 && verkauf.stations === 0 ? (
        <p className="muted klein">Nichts, was jetzt jemand kauft.</p>
      ) : (
        <ul className="klein notverkauf">
          {verkauf.leases.map((q) => (
            <li key={q.parcelId}>
              <button type="button" className="link" onClick={() => ctx.showOnMap(q.parcelId)}>
                {name(game, q.parcelId)}
              </button>{' '}
              – Bullard bietet {money(q.offer)}
              {q.rate > 0 ? ` (${barrels(q.rate)} bbl je Runde)` : ' (ungebohrt)'}
            </li>
          ))}
          {verkauf.rigs.length > 0 && (
            <li>
              <button type="button" className="link" onClick={() => ctx.open('akte', { tab: 'tuerme' })}>
                {verkauf.rigs.length === 1 ? 'Eigener Bohrturm' : `${verkauf.rigs.length} eigene Bohrtürme`}
              </button>{' '}
              – zusammen {money(verkauf.rigs.reduce((s, r) => s + r.price, 0))}
            </li>
          )}
          {verkauf.stations > 0 && (
            <li>
              <button type="button" className="link" onClick={() => ctx.open('marke')}>
                Tankstellen
              </button>{' '}
              – {verkauf.stations} im Vertrieb
            </li>
          )}
        </ul>
      )}
      <p className="muted klein">In der Not zahlt Bullard nur 40–60 % des Werts – die anderen Ölleute bieten mit, mehr ist nicht drin.</p>

      <h4>Umschuldung</h4>
      <p className="klein">
        Ein Anwalt fasst Bank- und Notkredite und das Loch zu einem Kredit über {money(Math.round(umschuldung.principal))} zusammen (Honorar{' '}
        {money(umschuldung.fee)}
        {umschuldung.ownLawyer ? ', eigener Anwalt' : ''}), {prozent(umschuldung.rate)} pro Jahr, Zinsen bis Runde {umschuldung.deferUntil} auf die
        Schuld.
      </p>
      {umSperre ? (
        <p className="muted klein">{umSperre}</p>
      ) : (
        <ConfirmButton
          question={`Umschulden: ${money(Math.round(umschuldung.principal))} zu ${prozent(umschuldung.rate)}?`}
          confirmLabel="Ja, umschulden"
          onConfirm={() => {
            const r = restructureDebt(game, balance);
            if (r.ok) ctx.onGame(r.state);
          }}
        >
          Umschulden
        </ConfirmButton>
      )}

      {game.kapitel3 ? (
        <p className="klein">
          Mr. Vale bietet die Rettung durch das Konsortium an –{' '}
          <button type="button" className="link" onClick={() => ctx.open('konzern')}>
            Siegelmappe
          </button>
          .
        </p>
      ) : (
        <>
          <h4>Die Herren aus Hallstead</h4>
          <p className="klein">
            Mr. Vale legt {money(vale.cash)} auf den Tisch. Jacob schuldet ihm danach {money(vale.owed)} zu {prozent(vale.rate)} – und einen Gefallen,
            den Vale sich holen wird.
          </p>
          {valeSperre ? (
            <p className="muted klein">{valeSperre}</p>
          ) : (
            <ConfirmButton
              question={`Vales Geld annehmen? ${money(vale.owed)} Schuld und ein Gefallen.`}
              confirmLabel="Ja, annehmen"
              onConfirm={() => {
                const r = acceptValeRescue(game, balance);
                if (r.ok) ctx.onGame(r.state);
              }}
            >
              Vales Geld annehmen
            </ConfirmButton>
          )}
        </>
      )}
    </section>
  );
}
