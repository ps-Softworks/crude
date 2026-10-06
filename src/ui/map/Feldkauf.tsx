// Feldkauf (0.4.20+26): Angebot an Bullard für eine seiner Pachten – Regler für die Summe, darunter die
// Vorhersage, mit welcher Chance er annimmt. Preis, Chance und Ergebnis rechnet src/sim/buyout.ts.

import { useEffect, useState } from 'react';
import { acceptChance, buyoutBlocker, buyoutQuote, offerBuyout } from '../../sim/buyout';
import type { GameState } from '../../sim/game';
import { balance } from '../balance';
import { barrels, money, percent } from '../format';

const GRUND = { fehde: 'Fehde mit Bullard', pakt: 'Handschlag', verschuldet: 'Bullard ist verschuldet' } as const;

export function Feldkauf({ game, parcelId, onGame }: { game: GameState; parcelId: string; onGame: (state: GameState) => void }) {
  const quote = buyoutQuote(game, balance, parcelId);
  const [betrag, setBetrag] = useState(quote?.value ?? 0);
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  // Andere Ranch oder neue Runde: Regler zurück auf Bullards Preis.
  useEffect(() => {
    setBetrag(quote?.value ?? 0);
    setErgebnis(null);
  }, [parcelId, game.round]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!quote || game.finished) return null;

  const sperre = buyoutBlocker(game, parcelId);
  const max = Math.min(quote.max, Math.floor(game.cash / quote.step) * quote.step);
  const zuArm = max < quote.min;
  const wert = Math.min(Math.max(betrag, quote.min), Math.max(quote.min, max));
  const chance = acceptChance(balance, quote, wert);

  return (
    <section className="feldkauf" aria-labelledby="feldkauf-titel">
      <h4 id="feldkauf-titel">Bullard ein Angebot machen</h4>
      <p className="klein">
        {quote.rate > 0 ? <>Seine Quelle fördert {barrels(quote.rate)} bbl je Runde – die bleibt auf dem Feld.</> : <>Noch ungebohrt – er rechnet mit seiner Fundchance.</>}
        <br />
        <span className="muted">
          Ölfluss {money(quote.flow)}
          {quote.scarcity > 1.005 && <> · gute Felder knapp ×{quote.scarcity.toFixed(2).replace('.', ',')}</>}
          {quote.stance !== 1 && (
            <>
              {' '}
              · {quote.stanceReasons.map((r) => GRUND[r]).join(', ')} ×{quote.stance.toFixed(2).replace('.', ',')}
            </>
          )}
        </span>
      </p>
      {sperre ? (
        <p className="muted klein">{sperre}</p>
      ) : zuArm ? (
        <p className="muted klein">Unter {money(quote.min)} redet Bullard gar nicht erst – in der Kasse sind {money(Math.floor(game.cash))}.</p>
      ) : (
        <>
          <label className="feldkauf-regler">
            Angebot: <strong>{money(wert)}</strong>
            <input
              type="range"
              min={quote.min}
              max={max}
              step={quote.step}
              value={wert}
              onChange={(e) => setBetrag(Number(e.target.value))}
              aria-valuetext={`${money(wert)}, Bullard nimmt mit ${percent(chance)} an`}
            />
          </label>
          <p className="klein">
            Ruth schätzt: Bullard nimmt mit <strong>{percent(chance)}</strong> an.
          </p>
          <button
            type="button"
            onClick={() => {
              const r = offerBuyout(game, balance, parcelId, wert);
              if (!r.ok) {
                setErgebnis(r.reason);
                return;
              }
              setErgebnis(r.accepted ? `Angenommen – die Ranch gehört dir (${money(wert)}).` : `Abgelehnt. Frühestens in ${balance.buyout.cooldown} Runden wieder.`);
              onGame(r.state);
            }}
          >
            Angebot machen ({money(wert)})
          </button>
        </>
      )}
      {ergebnis && (
        <p className="klein" role="status">
          {ergebnis}
        </p>
      )}
    </section>
  );
}
