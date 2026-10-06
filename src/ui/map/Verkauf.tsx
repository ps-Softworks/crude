// Anlagen verkaufen (Gegenstück zum Feldkauf): Bullards festes Gebot für eine eigene Pacht – zugeklappt im
// Ranch-Fenster (in der Pleitefrist aufgeklappt), Verkauf mit Rückfrage. Gebot und Sperren rechnet src/sim/sale.ts.

import type { GameState } from '../../sim/game';
import { saleBlocker, saleQuote, sellLease } from '../../sim/sale';
import { ConfirmButton } from '../ConfirmButton';
import { balance } from '../balance';
import { barrels, money } from '../format';

const HALTUNG = { neutral: '', pakt: ' (Handschlag – er zahlt fast den vollen Wert)', fehde: ' (Fehde – er nutzt das aus)' } as const;

export function Verkauf({ game, parcelId, onGame }: { game: GameState; parcelId: string; onGame: (state: GameState) => void }) {
  if (game.finished) return null;
  const sperre = saleBlocker(game, balance, parcelId);
  const quote = sperre ? null : saleQuote(game, balance, parcelId);
  return (
    <details className="ausbau-klappe verkauf" open={!!quote?.emergency}>
      <summary>{quote?.emergency ? 'Notverkauf an Bullard' : 'An Bullard verkaufen'}</summary>
      {sperre || !quote ? (
        <p className="muted klein">{sperre}</p>
      ) : (
        <>
          <p className="klein">
            {quote.rate > 0 ? (
              <>
                {quote.wells === 1 ? 'Die Quelle fördert' : `${quote.wells} Quellen fördern`} {barrels(quote.rate)} bbl je Runde – nach dem Verkauf für Bullard.
              </>
            ) : (
              <>Noch ungebohrt – Bullard rechnet mit seiner Fundchance.</>
            )}
            <br />
            <span className="muted">
              Für ihn wert: {money(quote.value)}
              {HALTUNG[quote.stance]}
              {quote.emergency && ' · Notverkauf: die anderen Ölleute bieten mit, mehr ist in der Frist nicht drin'}
              {quote.cashLimited && ' · mehr hat er gerade nicht in der Kasse'}
            </span>
          </p>
          {quote.offer <= 0 ? (
            <p className="muted klein">Bullard hat gerade kein Geld für ein Gebot.</p>
          ) : (
            <ConfirmButton
              question={`Pacht für ${money(quote.offer)} an Bullard verkaufen? Verkauft ist verkauft.`}
              confirmLabel="Ja, verkaufen"
              onConfirm={() => {
                const r = sellLease(game, balance, parcelId);
                if (r.ok) onGame(r.state);
              }}
            >
              Bullards Gebot annehmen ({money(quote.offer)})
            </ConfirmButton>
          )}
        </>
      )}
    </details>
  );
}
