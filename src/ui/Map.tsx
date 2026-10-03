// Karte von Cordova (0.2.15+5, vorläufig): Gebiete, Landmarken und die Ranches als
// einfache SVG-Vielecke. Die Umrisse kommen aus dem Seed (src/sim/ranches.ts) und
// stehen nicht im Spielstand. Die schöne, interaktive Karte kommt im nächsten Paket.
// Keine Spielregeln hier – nur zeichnen, was der Zustand sagt.

import { useMemo } from 'react';
import type { Balance } from '../sim/balance';
import type { GameState } from '../sim/game';
import { wellsOn } from '../sim/drilling';
import { leaseOf, optionOf, roundsLeft } from '../sim/lease';
import { generateWorld, type RanchShape } from '../sim/ranches';
import type { Polygon, Vec } from '../sim/worldMap';

/** Pixel je Karteneinheit. */
const S = 32;
/** Ausschnitt in Karteneinheiten: Salt Hill, Port Ellis und ein Stück der Nachbarbezirke. */
const VIEW = { x: 8, y: 2, w: 24, h: 26 };

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
  /** Ranches, die der Hinweis auf dem Schreibtisch meint. */
  highlight: string[];
  onSelect: (id: string) => void;
}

function pts(poly: Polygon): string {
  return poly.map(([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`).join(' ');
}

function line(points: Polygon): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * S).toFixed(1)},${(y * S).toFixed(1)}`).join(' ');
}

/** Umriss um den Mittelpunkt etwas eingezogen – für Rahmen innerhalb der Ranch. */
function shrink(poly: Polygon, c: Vec, f: number): Vec[] {
  return poly.map(([x, y]) => [c[0] + (x - c[0]) * f, c[1] + (y - c[1]) * f]);
}

/** Kleiner Bohrturm als Dreieck um (x, y) in Pixeln. */
function rig(x: number, y: number, size: number): string {
  return `${x},${y - size} ${x - size * 0.6},${y + size * 0.7} ${x + size * 0.6},${y + size * 0.7}`;
}

export function Map({ balance, game, debug, selected, highlight, onSelect }: Props) {
  // Umrisse aus dem Seed – gleiche Partie, gleiche Karte. Nur neu rechnen, wenn sich Seed oder Gebiete ändern.
  const regionKey = game.regions.join(',');
  const shapes = useMemo(
    () => new globalThis.Map<string, RanchShape>(generateWorld(balance.world, balance.ranches, game.seed, regionKey.split(',')).map((r) => [r.id, r])),
    [balance, game.seed, regionKey],
  );
  const world = balance.world;

  return (
    <svg className="map" viewBox={`${VIEW.x * S} ${VIEW.y * S} ${VIEW.w * S} ${VIEW.h * S}`} role="img" aria-label="Karte von Cordova">
      <defs>
        <pattern id="gesperrt" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: 'var(--linie)' }} strokeWidth="2" />
        </pattern>
      </defs>
      {world.landmarks
        .filter((l) => l.kind === 'sea' && l.outline)
        .map((l) => (
          <polygon key={l.id} points={pts(l.outline!)} style={{ fill: 'var(--meer)' }} />
        ))}
      {world.regions.map((r) => {
        const offen = game.regions.includes(r.id);
        return (
          <g key={r.id} pointerEvents="none">
            <polygon
              points={pts(r.outline)}
              style={{ fill: r.kind === 'town' ? 'var(--papier)' : offen ? 'none' : 'url(#gesperrt)', stroke: 'var(--tinte-weich)' }}
              strokeWidth={1.5}
              strokeDasharray={offen ? undefined : '6 4'}
              opacity={offen ? 1 : 0.7}
            />
          </g>
        );
      })}
      {world.landmarks
        .filter((l) => l.points)
        .map((l) => (
          <path
            key={l.id}
            d={line(l.points!)}
            fill="none"
            style={{ stroke: l.kind === 'river' ? 'var(--blau)' : l.kind === 'rail' ? 'var(--tinte)' : 'var(--ocker)' }}
            strokeWidth={l.kind === 'river' ? 4 : l.kind === 'rail' ? 2.5 : 2}
            strokeDasharray={l.kind === 'rail' ? '8 4' : l.kind === 'road' ? '3 3' : undefined}
            pointerEvents="none"
          />
        ))}

      {game.parcels.map((p) => {
        const shape = shapes.get(p.id);
        if (!shape) return null;
        const lease = leaseOf(game, p.id);
        const wells = wellsOn(game, p.id);
        const option = lease ? undefined : optionOf(game, p.id);
        const rivals = lease?.holder === 'bullard';
        const rivalWell = game.rival.wells.find((rw) => rw.parcelId === p.id);
        const cx = p.x * S;
        const cy = p.y * S;
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
        const rate = wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
        const breite = wells.length * 14;

        return (
          <g key={p.id} onClick={() => onSelect(p.id)} className="parcel">
            <title>{`${p.name} · ${p.slots} ${p.slots === 1 ? 'Bohrplatz' : 'Bohrplätze'}`}</title>
            <polygon points={pts(shape.polygon)} style={{ fill, stroke: isSelected ? ROT : GRENZE }} strokeWidth={isSelected ? 3 : 1} />
            {markColor && (
              <polygon
                points={pts(shrink(shape.polygon, shape.center, 0.82))}
                fill="none"
                style={{ stroke: markColor }}
                strokeWidth={2.5}
                strokeDasharray={option ? '5 3' : undefined}
                pointerEvents="none"
              />
            )}
            {tag && (
              <text x={cx - 12} y={cy - 8} className="tag" textAnchor="middle" style={{ fill: markColor }}>
                {tag}
              </text>
            )}
            {left !== undefined && (
              <text x={cx + 12} y={cy - 8} textAnchor="middle" className="tag" style={{ fill: markColor }}>
                {left}
              </text>
            )}
            {wells.map((well, i) => (
              // Ein kleiner Bohrturm je Bohrloch; Farbe nach Ergebnis.
              <polygon
                key={well.id}
                points={rig(cx - breite / 2 + 7 + i * 14, cy + 6, 8)}
                style={{
                  fill: well.status === 'found' ? 'var(--oel)' : 'none',
                  stroke: well.status === 'dry' ? GRAU : well.status === 'stuck' ? ROT : TINTE,
                }}
                strokeWidth={2}
                pointerEvents="none"
              />
            ))}
            {rivalWell && (
              // Kleiner Turm für Bullards Bohrung; gefüllt, wenn er Öl gefunden hat.
              <polygon
                points={rig(cx, cy + 6, 7)}
                style={{ fill: rivalWell.status === 'found' ? RIVAL_COLOR : 'none', stroke: rivalWell.status === 'dry' ? GRAU : RIVAL_COLOR }}
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
            {!debug && rate > 0 && (
              // Rate der fördernden Quellen unter den Bohrtürmen.
              <text x={cx} y={cy + 24} textAnchor="middle" className="rate">
                {rate.toLocaleString('de-DE')}
              </text>
            )}
            {p.discovery && (
              // Bohrturm als Zeichen für die Entdeckungsquelle.
              <polygon points={rig(cx, cy, 12)} fill="none" style={{ stroke: TINTE }} strokeWidth={2} pointerEvents="none" />
            )}
            {debug && p.reserves > 0 && !p.discovery && (
              <text x={cx} y={cy + 4} textAnchor="middle" className={p.geology === 'gusher' ? 'label light' : 'label'}>
                {Math.round(p.reserves / 1000)}k
              </text>
            )}
            {highlight.includes(p.id) && (
              // Dicker gelber Rahmen: Hier will der Hinweis auf dem Schreibtisch hin.
              <polygon points={pts(shape.polygon)} fill="none" strokeWidth={5} className="highlight" pointerEvents="none" />
            )}
          </g>
        );
      })}

      {world.landmarks
        .filter((l) => l.at)
        .map((l) => (
          <g key={l.id} pointerEvents="none">
            <rect x={l.at![0] * S - 5} y={l.at![1] * S - 5} width={10} height={10} style={{ fill: TINTE }} />
            <text x={l.at![0] * S + 9} y={l.at![1] * S + 4} className="label">
              {l.name.de}
            </text>
          </g>
        ))}
      {world.regions.map((r) => {
        const xs = r.outline.map((p) => p[0]);
        const ys = r.outline.map((p) => p[1]);
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        const y = Math.min(...ys);
        const offen = game.regions.includes(r.id);
        return (
          <text key={r.id} x={x * S} y={y * S + 20} textAnchor="middle" className="place">
            {r.name.de}
            {offen ? '' : ' (gesperrt)'}
          </text>
        );
      })}
    </svg>
  );
}
