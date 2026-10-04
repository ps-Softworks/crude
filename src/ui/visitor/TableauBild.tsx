// Bilder der Vollbild-Szenen (0.2.15+10): schlichte Scherenschnitte in Sepia –
// Mutter und Kind, ein brennender Turm, ein Blitz über dem Tank, Sturm vom Golf.
// Nur Dekoration; welche Ereignisse als Szene kommen, steht in content/events
// („tableau: true“). Ein Ereignis ohne eigenes Bild bekommt die Lampe.

import { SilhouetteForm } from '../Silhouette';

type Motiv = 'geburt' | 'feuer' | 'blitz' | 'sturm' | 'lampe';

const MOTIV: Record<string, Motiv> = {
  thomas_geburt: 'geburt',
  brand_nachbar: 'feuer',
  blitz_tank: 'blitz',
  sturm_golf: 'sturm',
};

const svg = { 'aria-hidden': true, focusable: false } as const;

function Turm({ x }: { x: number }) {
  return <path d={`M${x},40 L${x - 22},150 M${x},40 L${x + 22},150 M${x - 16},120 L${x + 16},120 M${x - 10},90 L${x + 10},90 M${x - 5},62 L${x + 5},62`} className="tb-strich" />;
}

export function TableauBild({ eventId }: { eventId: string }) {
  const motiv = MOTIV[eventId] ?? 'lampe';
  if (motiv === 'geburt') {
    return (
      <span className="tb-geburt">
        <SilhouetteForm kind="frau" name="" size={200} />
        <SilhouetteForm kind="kind" name="" size={130} />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 300 170" className={`tb tb-${motiv}`} {...svg}>
      <rect x="0" y="150" width="300" height="20" className="tb-boden" />
      {motiv === 'feuer' && (
        <>
          <path d="M70,150 C60,110 95,100 85,60 C110,90 120,70 115,40 C150,80 140,110 160,90 C170,120 165,140 160,150 Z" className="tb-flamme" />
          <path d="M95,150 C90,125 110,118 105,95 C125,115 130,105 128,90 C145,115 140,135 138,150 Z" className="tb-flamme-innen" />
          <Turm x={210} />
          <path d="M40,40 C60,20 90,30 100,10 M150,30 C170,10 200,25 220,5" className="tb-rauch" />
        </>
      )}
      {motiv === 'blitz' && (
        <>
          <rect x="150" y="95" width="110" height="55" rx="4" className="tb-tank" />
          <ellipse cx="205" cy="95" rx="55" ry="8" className="tb-tank" />
          <path d="M120,0 L95,60 L120,60 L90,130 L150,50 L122,50 L145,0 Z" className="tb-blitz" />
          <Turm x={60} />
        </>
      )}
      {motiv === 'sturm' && (
        <>
          <path d="M0,120 C30,100 60,135 90,115 C120,95 150,135 180,112 C210,92 240,132 270,110 L300,108 L300,150 L0,150 Z" className="tb-welle" />
          <path d="M20,10 L5,60 M60,5 L45,55 M100,12 L85,62 M140,6 L125,56 M180,10 L165,60 M220,4 L205,54 M260,10 L245,60" className="tb-regen" />
          <Turm x={230} />
        </>
      )}
      {motiv === 'lampe' && <path d="M140,150 L160,150 L156,120 L144,120 Z M150,60 C135,80 140,110 150,115 C160,110 165,80 150,60 Z" className="tb-flamme" />}
    </svg>
  );
}
