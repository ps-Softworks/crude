import type { Balance } from '../sim/balance';
import type { GameState } from '../sim/game';
import { wellOf } from '../sim/drilling';
import { leaseOf, optionOf, roundsLeft } from '../sim/lease';

const CELL = 48;
const GULF = 40;

// Farben nur aus den CSS-Variablen in style.css (2.12). SVG-Attribute verstehen
// var() nicht, darum gehen alle Farben über style={{ fill, stroke }}.
const DEBUG_COLORS = { dry: 'var(--grau-hell)', small: 'var(--tinte-blass)', gusher: 'var(--oel)' } as const;

// Kennfarben: eigene Pacht = Grün, eigene Option = Blau (gestrichelt), Fund = Ocker.
const LEASE_COLOR = 'var(--gruen)';
const LEASE_FILL = 'var(--gruen-hell)';
const OPTION_COLOR = 'var(--blau)';
const OPTION_FILL = 'var(--blau-hell)';
const DISCOVERY_FILL = 'var(--ocker-hell)';
// Rivale Bullard: rostbraun, Kürzel „B“.
const RIVAL_COLOR = 'var(--rost)';
const RIVAL_FILL = 'var(--rost-hell)';
const LAND = 'var(--land)';
const GRENZE = 'var(--linie)';
const TINTE = 'var(--tinte)';
const ROT = 'var(--rot)';
const GRAU = 'var(--grau)';

interface Props {
  balance: Balance;
  game: GameState;
  debug: boolean;
  selected: string | null;
  /** Parzellen, die der Hinweis auf dem Schreibtisch meint. */
  highlight: string[];
  onSelect: (id: string) => void;
}

export function Map({ balance, game, debug, selected, highlight, onSelect }: Props) {
  const { width, height, saltHill } = balance.map;
  const w = width * CELL;
  const h = height * CELL;

  return (
    <svg className="map" viewBox={`0 0 ${w} ${h + GULF}`} role="img" aria-label="Karte von Cordova">
      {game.parcels.map((p) => {
        const lease = leaseOf(game, p.id);
        const well = wellOf(game, p.id);
        const option = lease ? undefined : optionOf(game, p.id);
        const rivals = lease?.holder === 'bullard';
        const rivalWell = game.rival.wells.find((rw) => rw.parcelId === p.id);
        const x = p.x * CELL;
        const y = p.y * CELL;
        let fill = LAND;
        if (p.discovery) fill = DISCOVERY_FILL;
        else if (rivals) fill = RIVAL_FILL;
        else if (lease) fill = LEASE_FILL;
        else if (option) fill = OPTION_FILL;
        if (debug) fill = DEBUG_COLORS[p.geology];

        const isSelected = p.id === selected;
        const markColor = rivals ? RIVAL_COLOR : lease ? LEASE_COLOR : option ? OPTION_COLOR : undefined;
        const left = lease ? (lease.drilled ? undefined : roundsLeft(game, lease)) : option ? roundsLeft(game, option) : undefined;
        const tag = rivals ? 'B' : lease ? 'P' : option ? 'O' : undefined;

        return (
          <g key={p.id} onClick={() => onSelect(p.id)} className="parcel">
            <rect
              x={x + 1}
              y={y + 1}
              width={CELL - 2}
              height={CELL - 2}
              style={{ fill, stroke: isSelected ? ROT : GRENZE }}
              strokeWidth={isSelected ? 3 : 1}
            />
            {markColor && (
              <rect
                x={x + 4}
                y={y + 4}
                width={CELL - 8}
                height={CELL - 8}
                fill="none"
                style={{ stroke: markColor }}
                strokeWidth={2.5}
                strokeDasharray={option ? '5 3' : undefined}
                pointerEvents="none"
              />
            )}
            {tag && (
              <text x={x + 8} y={y + 16} className="tag" style={{ fill: markColor }}>
                {tag}
              </text>
            )}
            {left !== undefined && (
              <text x={x + CELL - 8} y={y + CELL - 8} textAnchor="end" className="tag" style={{ fill: markColor }}>
                {left}
              </text>
            )}
            {well && (
              // Bohrturm auf eigenen Bohrungen; Farbe nach Ergebnis.
              <polygon
                points={`${x + CELL / 2},${y + 12} ${x + CELL / 2 - 8},${y + CELL - 12} ${x + CELL / 2 + 8},${y + CELL - 12}`}
                style={{
                  fill: well.status === 'found' ? 'var(--oel)' : 'none',
                  stroke: well.status === 'dry' ? GRAU : well.status === 'stuck' ? ROT : TINTE,
                }}
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
            {rivalWell && (
              // Kleiner Turm für Bullards Bohrung; gefüllt, wenn er Öl gefunden hat.
              <polygon
                points={`${x + CELL / 2},${y + 18} ${x + CELL / 2 - 6},${y + CELL - 14} ${x + CELL / 2 + 6},${y + CELL - 14}`}
                style={{
                  fill: rivalWell.status === 'found' ? RIVAL_COLOR : 'none',
                  stroke: rivalWell.status === 'dry' ? GRAU : RIVAL_COLOR,
                }}
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
            {!debug && well?.status === 'found' && (well.production?.lastRate ?? 0) > 0 && (
              // Rate der fördernden Quelle unter dem Bohrturm.
              <text x={x + CELL / 2} y={y + CELL - 2} textAnchor="middle" className="rate">
                {well.production!.lastRate.toLocaleString('de-DE')}
              </text>
            )}
            {p.discovery && (
              // Bohrturm als Zeichen für die Entdeckungsquelle.
              <polygon
                points={`${x + CELL / 2},${y + 10} ${x + CELL / 2 - 10},${y + CELL - 10} ${x + CELL / 2 + 10},${y + CELL - 10}`}
                fill="none"
                style={{ stroke: TINTE }}
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
            {debug && p.reserves > 0 && !p.discovery && (
              <text
                x={x + CELL / 2}
                y={y + CELL / 2 + 4}
                textAnchor="middle"
                className={p.geology === 'gusher' ? 'label light' : 'label'}
              >
                {Math.round(p.reserves / 1000)}k
              </text>
            )}
            {highlight.includes(p.id) && (
              // Dicker gelber Rahmen: Hier will der Hinweis auf dem Schreibtisch hin.
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={CELL - 3}
                height={CELL - 3}
                fill="none"
                strokeWidth={5}
                className="highlight"
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      <circle
        cx={saltHill.x * CELL + CELL / 2}
        cy={saltHill.y * CELL + CELL / 2}
        r={CELL * balance.geology.zones[0].maxDistance}
        fill="none"
        style={{ stroke: 'var(--tinte-weich)' }}
        strokeDasharray="6 4"
        pointerEvents="none"
      />
      <text x={saltHill.x * CELL + CELL / 2} y={(saltHill.y - balance.geology.zones[0].maxDistance) * CELL - 6} textAnchor="middle" className="place">
        Salt Hill
      </text>
      <rect x={0} y={h} width={w} height={GULF} style={{ fill: 'var(--meer)' }} />
      <text x={w - 12} y={h + 26} textAnchor="end" className="place">
        Golf · Port Ellis
      </text>
    </svg>
  );
}
