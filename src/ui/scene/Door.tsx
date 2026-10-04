// Die Tür (0.2.15+10): Wer mit Jacob reden will, wartet davor. Eine Plakette
// nennt den Ersten beim Namen und zählt die übrigen, hinter der Milchglasscheibe
// steht sein Schatten. Kommt jemand Neues, klopft es einmal (die Tür wackelt kurz,
// dazu „klopf, klopf“ als Text). Klick oder W bittet herein; warten mehrere,
// fragt erst ein kleines Fenster, wer hereinkommt (0.2.15+11).

import { DoorShape } from './objects/Shapes';
import type { Placement } from './DeskObject';
import { SilhouetteForm } from '../Silhouette';
import type { SilhouetteKind } from '../figures';

export function Door({
  at,
  names,
  figure,
  urgent,
  knock,
  glow,
  inRoom = null,
  onEnter,
}: {
  at: Placement;
  /** Namen der Wartenden, der Erste vorn. */
  names: readonly string[];
  /** Silhouette des Ersten (für den Schatten hinter dem Glas). */
  figure: SilhouetteKind | null;
  urgent: boolean;
  /** Jemand Neues steht draußen – es klopft (einmal). */
  knock: boolean;
  glow: boolean;
  /** Wer gerade hereingekommen ist (0.2.15+11) – dann steht die Tür offen. */
  inRoom?: string | null;
  onEnter: () => void;
}) {
  const n = names.length;
  const plakette = inRoom ? 'offen' : n === 0 ? 'Niemand wartet' : n === 1 ? `${names[0]} wartet` : `${names[0]} wartet · +${n - 1}`;
  const label =
    n === 0
      ? 'Tür – niemand wartet'
      : `Tür – ${names.join(', ')} ${n === 1 ? 'wartet' : 'warten'}${urgent ? ', Frist läuft ab' : ''}. Taste W ${n === 1 ? 'bittet herein' : 'zeigt, wer wartet'}.`;
  return (
    <button
      type="button"
      className={`objekt objekt-tuer tuer${n > 0 ? ' besetzt' : ''}${knock ? ' klopft frisch' : ''}${glow ? ' tutorial-ziel' : ''}${inRoom ? ' offen' : ''}`}
      style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` }}
      onClick={onEnter}
      data-sheet="wartende"
      aria-disabled={n === 0 ? true : undefined}
      aria-label={label}
      title={n > 1 ? 'Wer wartet? (W)' : n === 1 ? 'Hereinbitten (W)' : 'Niemand wartet'}
    >
      <span className="objekt-bild tuer-bild">
        <DoorShape />
        {figure && (
          <span className="tuer-schatten" aria-hidden="true">
            <SilhouetteForm kind={figure} name="" size={60} />
          </span>
        )}
        {knock && (
          <span className="klopf" aria-hidden="true">
            klopf, klopf
          </span>
        )}
      </span>
      <span className="tuer-plakette">{plakette}</span>
      <span className="namensschild">
        Tür<kbd>W</kbd>
      </span>
      {glow && (
        <span className="hier-fahne" aria-hidden="true">
          hier
        </span>
      )}
      {n > 0 && (
        <span className={urgent ? 'abzeichen dringend' : 'abzeichen'}>
          {urgent && <span className="siegel" aria-hidden="true" />}
          {n}
          {urgent && ' · Frist!'}
        </span>
      )}
    </button>
  );
}
