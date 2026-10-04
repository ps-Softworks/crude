// Die Tür (0.2.15+10): Wer mit Jacob reden will, wartet davor. Eine Plakette
// nennt den Ersten beim Namen und zählt die übrigen, hinter der Milchglasscheibe
// steht sein Schatten. Kommt jemand Neues, klopft es einmal (die Tür wackelt kurz,
// dazu „klopf, klopf“ als Text). Klick oder W bittet herein.

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
  onEnter: () => void;
}) {
  const n = names.length;
  const plakette = n === 0 ? 'Niemand wartet' : n === 1 ? `${names[0]} wartet` : `${names[0]} wartet · +${n - 1}`;
  const label = n === 0 ? 'Tür – niemand wartet' : `Tür – ${names.join(', ')} ${n === 1 ? 'wartet' : 'warten'}${urgent ? ', Frist läuft ab' : ''}. Taste W bittet herein.`;
  return (
    <button
      type="button"
      className={`objekt objekt-tuer tuer${n > 0 ? ' besetzt' : ''}${knock ? ' klopft frisch' : ''}${glow ? ' tutorial-ziel' : ''}`}
      style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` }}
      onClick={onEnter}
      aria-disabled={n === 0 ? true : undefined}
      aria-label={label}
      title={n > 0 ? 'Hereinbitten (W)' : 'Niemand wartet'}
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
