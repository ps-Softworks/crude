import type { Balance } from '../sim/balance';
import type { Parcel } from '../sim/geology';

const CELL = 48;
const GULF = 40;

const DEBUG_COLORS = { dry: '#c9c2b4', small: '#8a7f6b', gusher: '#2b2620' } as const;

interface Props {
  balance: Balance;
  parcels: Parcel[];
  debug: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}

export function Map({ balance, parcels, debug, selected, onSelect }: Props) {
  const { width, height, saltHill } = balance.map;
  const w = width * CELL;
  const h = height * CELL;

  return (
    <svg className="map" viewBox={`0 0 ${w} ${h + GULF}`} role="img" aria-label="Karte von Cordova">
      {parcels.map((p) => (
        <g key={p.id} onClick={() => onSelect(p.id)} className="parcel">
          <rect
            x={p.x * CELL + 1}
            y={p.y * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            fill={debug ? DEBUG_COLORS[p.geology] : '#d8d8d8'}
            stroke={p.id === selected ? '#b3261e' : '#9a9a9a'}
            strokeWidth={p.id === selected ? 3 : 1}
          />
          {debug && p.reserves > 0 && (
            <text
              x={p.x * CELL + CELL / 2}
              y={p.y * CELL + CELL / 2 + 4}
              textAnchor="middle"
              className={p.geology === 'gusher' ? 'label light' : 'label'}
            >
              {Math.round(p.reserves / 1000)}k
            </text>
          )}
        </g>
      ))}
      <circle
        cx={saltHill.x * CELL + CELL / 2}
        cy={saltHill.y * CELL + CELL / 2}
        r={CELL * balance.geology.zones[0].maxDistance}
        fill="none"
        stroke="#555"
        strokeDasharray="6 4"
        pointerEvents="none"
      />
      <text x={saltHill.x * CELL + CELL / 2} y={(saltHill.y - balance.geology.zones[0].maxDistance) * CELL - 6} textAnchor="middle" className="place">
        Salt Hill
      </text>
      <rect x={0} y={h} width={w} height={GULF} fill="#a9b8c2" />
      <text x={w - 12} y={h + 26} textAnchor="end" className="place">
        Golf · Port Ellis
      </text>
    </svg>
  );
}
