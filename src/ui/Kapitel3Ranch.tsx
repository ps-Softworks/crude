// Seismik im Ranch-Fenster (4.17, Kapitel 3): eine Zeile unter dem Geologen –
// der Bericht, der Trupp unterwegs oder der Knopf „Seismik-Trupp schicken“.
// Ob es geht, sagt surveyBlocker aus src/sim/seismik. Vor Kapitel 3: nichts.

import type { GameState } from '../sim/game';
import { kapitel3Of } from '../sim/kapitel3';
import { orderSurvey, surveyBlocker } from '../sim/seismik';
import { balance } from './balance';
import { money } from './format';
import { k3, reasonText, reportText, t } from './kapitel3';

export function SeismikZeile({ game, parcelId, onGame }: { game: GameState; parcelId: string; onGame?: (s: GameState) => void }) {
  const k = kapitel3Of(game, balance);
  if (!k) return null;
  const bericht = k.seismik.reports[parcelId];
  const unterwegs = k.seismik.surveys.find((s) => s.parcelId === parcelId);
  const sperre = surveyBlocker(game, balance, parcelId);
  let inhalt;
  if (bericht) inhalt = reportText(bericht);
  else if (unterwegs) inhalt = `${t(k3.seismik.pending)} – Bericht ab Runde ${unterwegs.readyRound}`;
  else
    inhalt = (
      <>
        <button
          type="button"
          disabled={!!sperre || !onGame}
          title={sperre ? reasonText(sperre) : undefined}
          onClick={() => {
            const r = orderSurvey(game, balance, parcelId);
            if (r.ok) onGame?.(r.state);
          }}
        >
          {`${t(k3.seismik.order)} (${money(balance.kapitel3.seismik.surveyCost)})`}
        </button>
        {sperre && <span className="weg-grund"> {reasonText(sperre)}</span>}
      </>
    );
  return (
    <>
      <dt>{t(k3.seismik.label)}</dt>
      <dd>{inhalt}</dd>
    </>
  );
}
