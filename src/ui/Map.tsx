// Karte von Cordova (0.2.15+6): ein kolorierter Plan auf Papier, als SVG.
// Übersicht der Provinz mit Gebieten; Klick auf ein Gebiet fährt sanft hinein,
// Mausrad zoomt, Ziehen verschiebt (Grenzen in mapCamera.ts). Die Ranches kommen
// aus dem Seed (src/sim/ranches.ts), ihr Zustand aus dem Spielstand. Klick auf eine
// Ranch wählt sie fürs Seitenpanel. Keine Spielregeln hier – nur zeichnen.
// Farben nur aus den CSS-Variablen in style.css (2.12); SVG-Attribute verstehen
// var() nicht, darum gehen alle Farben über style={{ … }} oder CSS-Klassen.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Balance } from '../sim/balance';
import { wellsOn, type Well } from '../sim/drilling';
import { formatForecast } from '../sim/forecast';
import type { GameState } from '../sim/game';
import { leaseOf, optionOf, roundsLeft } from '../sim/lease';
import { generateWorld, type RanchShape } from '../sim/ranches';
import type { RivalWell } from '../sim/rival';
import { landmarkById, polygonCentroid, type Landmark, type Polygon, type Region, type Vec } from '../sim/worldMap';
import { boundsOf, fitBounds, overview, panBy, sameView, tween, zoomAt, type Limits, type View } from './mapCamera';
import { units } from './format';
import { stageScale } from './stage';
import { labelFits, ranchStatus, slotPositions, STATUS_LABEL, type RanchStatus } from './mapShapes';

/** Zeichen auf einer Ranch (0.2.15+10): Pflock = hier geht etwas, Brief = ein offenes Ereignis betrifft sie. */
export interface MapMarker {
  parcelId: string;
  kind: 'pflock' | 'brief';
  /** Für Vorleser und Tooltip, z. B. „Bohren möglich“ oder der Titel des Ereignisses. */
  label: string;
  /** Nur für Briefe: Ereignis-id, auf die ein Klick führt. */
  eventId?: string;
}

interface Props {
  balance: Balance;
  game: GameState;
  debug: boolean;
  selected: string | null;
  /** Ranches, die der Hinweis auf dem Schreibtisch meint. */
  highlight: string[];
  onSelect: (id: string) => void;
  markers?: readonly MapMarker[];
  onMarker?: (marker: MapMarker) => void;
}

/** Höhe : Breite des Kartenbilds. */
const ASPECT = 0.75;
/** Ab so vielen Bildpunkten je Karteneinheit sind Ranches anklickbar und Bohrplätze zu sehen. */
const DETAIL_PPU = 30;
const FAHRT_MS = 520;

const FILL: Record<RanchStatus, string> = {
  free: 'var(--land)',
  option: 'url(#karte-option)',
  lease: 'var(--gruen-hell)',
  bullard: 'var(--rost-hell)',
  bullardOption: 'url(#karte-bullard-option)',
  other: 'var(--ocker-hell)',
};
const MARK: Partial<Record<RanchStatus, string>> = {
  option: 'var(--blau)',
  lease: 'var(--gruen)',
  bullard: 'var(--rost)',
  bullardOption: 'var(--rost)',
  other: 'var(--ocker)',
};
const DEBUG_FILL = { dry: 'var(--grau-hell)', small: 'var(--blau-hell)', gusher: 'var(--ocker-hell)' } as const;

interface Hover {
  kind: 'ranch' | 'region';
  id: string;
  /** Position im Kartenrahmen in Bildpunkten. */
  x: number;
  y: number;
}

function pts(poly: Polygon): string {
  return poly.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

function linie(points: Polygon): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

/** Weiche Linie durch die Punkte (für Fluss und Wege), als Bézier-Pfad. */
function kurve(points: Polygon): string {
  if (points.length < 3) return linie(points);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

function zahl(n: number, digits = 0): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}

/** Kleiner Bohrturm: Fuß bei (x, y), Höhe 1,6·s. */
function Bohrturm({ x, y, s, className }: { x: number; y: number; s: number; className: string }) {
  const top = y - 1.6 * s;
  const d = [
    `M${x - 0.55 * s},${y} L${x},${top} L${x + 0.55 * s},${y}`,
    `M${x - 0.38 * s},${y - 0.5 * s} L${x + 0.38 * s},${y - 0.5 * s}`,
    `M${x - 0.2 * s},${y - 1.05 * s} L${x + 0.2 * s},${y - 1.05 * s}`,
    `M${x - 0.38 * s},${y - 0.5 * s} L${x + 0.2 * s},${y - 1.05 * s}`,
  ].join(' ');
  return <path d={d} className={className} strokeWidth={s * 0.22} strokeLinejoin="round" />;
}

function Bohrloch({ well, at, s }: { well: Pick<Well, 'status'> | Pick<RivalWell, 'status'>; at: Vec; s: number; rival?: boolean }) {
  const [x, y] = at;
  if (well.status === 'dry') {
    // Trockenes Loch: verschlossen, nur ein graues Kreuz.
    const k = s * 0.45;
    return <path d={`M${x - k},${y - k} L${x + k},${y + k} M${x + k},${y - k} L${x - k},${y + k}`} className="karte-trocken" strokeWidth={s * 0.25} />;
  }
  return (
    <g>
      {well.status === 'found' && <ellipse cx={x} cy={y + s * 0.12} rx={s * 0.75} ry={s * 0.28} className="karte-oelpfuetze" />}
      <Bohrturm x={x} y={y} s={s} className={`karte-turm ${well.status}`} />
    </g>
  );
}

/** Bahnhof: Häuschen mit Giebel. */
function Bahnhof({ at, s }: { at: Vec; s: number }) {
  const [x, y] = at;
  return (
    <g className="karte-symbol">
      <path d={`M${x - s},${y + 0.6 * s} V${y - 0.2 * s} L${x},${y - s} L${x + s},${y - 0.2 * s} V${y + 0.6 * s} Z`} strokeWidth={s * 0.18} />
      <rect x={x - 0.25 * s} y={y + 0.05 * s} width={0.5 * s} height={0.55 * s} className="karte-symbol-innen" />
    </g>
  );
}

/** Hafen: Anker. */
function Anker({ at, s }: { at: Vec; s: number }) {
  const [x, y] = at;
  const d = [
    `M${x},${y - 0.75 * s} V${y + 0.8 * s}`,
    `M${x - 0.4 * s},${y - 0.35 * s} H${x + 0.4 * s}`,
    `M${x - 0.75 * s},${y + 0.25 * s} Q${x - 0.6 * s},${y + 0.85 * s} ${x},${y + 0.8 * s} Q${x + 0.6 * s},${y + 0.85 * s} ${x + 0.75 * s},${y + 0.25 * s}`,
  ].join(' ');
  return (
    <g className="karte-anker">
      <circle cx={x} cy={y - 0.95 * s} r={0.2 * s} strokeWidth={s * 0.16} fill="none" />
      <path d={d} strokeWidth={s * 0.2} fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Ein paar Häuserblöcke als Stadtzeichen, fest um die Mitte gelegt. */
const BLOECKE: readonly [number, number, number, number][] = [
  [-1.6, -0.9, 0.9, 0.55],
  [-0.5, -1.1, 0.7, 0.7],
  [0.5, -0.8, 1.0, 0.5],
  [-1.2, 0.0, 0.6, 0.6],
  [-0.4, -0.2, 0.9, 0.55],
  [0.7, 0.0, 0.6, 0.7],
  [-0.9, 0.85, 1.1, 0.45],
];

export function Map({ balance, game, debug, selected, highlight, onSelect, markers = [], onMarker }: Props) {
  const world = balance.world;
  const limits: Limits = useMemo(() => ({ world: world.size, aspect: ASPECT, minW: 3.5, margin: 1.5 }), [world.size]);

  // Umrisse aus dem Seed – gleiche Partie, gleiche Karte. Nur neu rechnen, wenn sich Seed oder Gebiete ändern.
  const regionKey = game.regions.join(',');
  const shapes = useMemo(
    () => new globalThis.Map<string, RanchShape>(generateWorld(world, balance.ranches, game.seed, regionKey.split(',')).map((r) => [r.id, r])),
    [world, balance.ranches, game.seed, regionKey],
  );

  const regionView = useCallback((r: Region) => fitBounds(boundsOf(r.outline), limits, 0.06), [limits]);
  // Zu Beginn liegt Salt Hill vor Jacob – das erste offene bohrbare Gebiet.
  const startRegion = world.regions.find((r) => r.kind === 'drillable' && game.regions.includes(r.id));
  const [view, setViewState] = useState<View>(() => (startRegion ? regionView(startRegion) : overview(limits)));
  // Die Startansicht ist „zu Hause“ (0.2.15+11): Esc fährt nur zurück, wenn der Spieler selbst gezoomt oder verschoben hat.
  const [home] = useState<View>(view);
  const [focus, setFocus] = useState<string | null>(startRegion?.id ?? null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [breite, setBreite] = useState(800);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  const fahrt = useRef<number | null>(null);
  const zug = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(null);
  const gezogen = useRef(false);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const stopFahrt = () => {
    if (fahrt.current !== null) cancelAnimationFrame(fahrt.current);
    fahrt.current = null;
  };

  /** Sanfte Kamerafahrt zum Ziel (ohne Bewegung, wenn der Nutzer das so eingestellt hat). */
  const fahre = useCallback(
    (ziel: View) => {
      stopFahrt();
      const von = viewRef.current;
      const ruhig = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (ruhig || sameView(von, ziel)) {
        setView(ziel);
        return;
      }
      const start = performance.now();
      const schritt = (jetzt: number) => {
        const t = Math.min(1, (jetzt - start) / FAHRT_MS);
        setView(tween(von, ziel, t));
        fahrt.current = t < 1 ? requestAnimationFrame(schritt) : null;
      };
      fahrt.current = requestAnimationFrame(schritt);
    },
    [setView],
  );

  useEffect(() => stopFahrt, []);

  // Breite des Bildes messen: Schrift und Linien sollen auf dem Bildschirm gleich groß bleiben.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // In CSS-Pixeln der Bühne: Wächst die Bühne auf großen Bildschirmen, wächst die Schrift auf der Karte mit.
    const messen = () => setBreite(svg.getBoundingClientRect().width / stageScale(svg) || 800);
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(messen);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  /** Bildschirmpunkt → Karteneinheiten. */
  const kartenpunkt = useCallback((clientX: number, clientY: number): Vec => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const v = viewRef.current;
    return [v.x + ((clientX - r.left) / r.width) * v.w, v.y + ((clientY - r.top) / r.height) * v.h];
  }, []);

  // Mausrad zoomt um den Mauszeiger. Eigener Listener, weil React das Rad nur passiv meldet.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      stopFahrt();
      const faktor = Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.004);
      setView(zoomAt(viewRef.current, faktor, kartenpunkt(e.clientX, e.clientY), limits));
      setHover(null);
    };
    svg.addEventListener('wheel', rad, { passive: false });
    return () => svg.removeEventListener('wheel', rad);
  }, [kartenpunkt, limits, setView]);

  // Ziehen verschiebt. Erst ab ein paar Bildpunkten gilt es als Ziehen, sonst bleibt es ein Klick.
  const runter = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    zug.current = { x: e.clientX, y: e.clientY, view: viewRef.current, moved: false, id: e.pointerId };
  };
  const bewegen = (e: PointerEvent<SVGSVGElement>) => {
    const z = zug.current;
    if (!z) return;
    const dx = e.clientX - z.x;
    const dy = e.clientY - z.y;
    if (!z.moved && Math.hypot(dx, dy) < 5) return;
    if (!z.moved) {
      z.moved = true;
      stopFahrt();
      svgRef.current?.setPointerCapture(z.id);
      setHover(null);
    }
    const r = svgRef.current!.getBoundingClientRect();
    setView(panBy(z.view, (-dx / r.width) * z.view.w, (-dy / r.height) * z.view.h, limits));
  };
  const hoch = () => {
    const z = zug.current;
    zug.current = null;
    if (z?.moved) {
      gezogen.current = true;
      if (svgRef.current?.hasPointerCapture(z.id)) svgRef.current.releasePointerCapture(z.id);
      setTimeout(() => (gezogen.current = false), 0);
    }
  };

  const ppu = breite / view.w;
  /** Bildpunkte → Karteneinheiten, damit Schrift und Striche beim Zoomen gleich groß bleiben. */
  const u = (px: number) => px / ppu;
  const detail = ppu >= DETAIL_PPU;
  const ganz = overview(limits);

  function zeigeGebiet(r: Region) {
    if (r.kind === 'drillable' && !game.regions.includes(r.id)) {
      setNotice(`${r.name.de} ist noch unerforscht. Hier wird erst gepachtet, wenn Jacob davon erfährt.`);
      return;
    }
    setNotice(null);
    setFocus(r.id);
    fahre(regionView(r));
  }

  function zurUebersicht() {
    setNotice(null);
    setFocus(null);
    fahre(ganz);
  }

  function zoomKnopf(faktor: number) {
    const v = viewRef.current;
    fahre(zoomAt(v, faktor, [v.x + v.w / 2, v.y + v.h / 2], limits));
  }

  function tasten(e: KeyboardEvent<SVGSVGElement>) {
    const v = viewRef.current;
    const schritt = 0.15;
    const verschiebe: Record<string, [number, number]> = {
      ArrowLeft: [-v.w * schritt, 0],
      ArrowRight: [v.w * schritt, 0],
      ArrowUp: [0, -v.h * schritt],
      ArrowDown: [0, v.h * schritt],
    };
    if (verschiebe[e.key]) {
      e.preventDefault();
      fahre(panBy(v, verschiebe[e.key][0], verschiebe[e.key][1], limits));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomKnopf(0.7);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomKnopf(1 / 0.7);
    } else if (e.key === 'Escape' && notice) {
      e.preventDefault();
      setNotice(null);
    } else if (e.key === 'Escape' && !sameView(v, home, 0.05) && !sameView(v, overview(limits), 0.05)) {
      // Nur wenn der Spieler selbst gezoomt oder verschoben hat: zurück zur Startansicht.
      // Sonst geht das Esc weiter – zurück zum Schreibtisch.
      e.preventDefault();
      setFocus(startRegion?.id ?? null);
      fahre(home);
    }
  }

  /** Zeigt den Hinweis an einer Stelle der Karte (für Fokus über die Tastatur). */
  function hoverAt(kind: Hover['kind'], id: string, p: Vec) {
    const v = viewRef.current;
    setHover({ kind, id, x: ((p[0] - v.x) / v.w) * breite, y: ((p[1] - v.y) / v.h) * breite * ASPECT });
  }
  function hoverMaus(kind: Hover['kind'], id: string, e: { clientX: number; clientY: number }) {
    if (zug.current?.moved) return;
    const r = svgRef.current!.getBoundingClientRect();
    const f = stageScale(svgRef.current);
    setHover({ kind, id, x: (e.clientX - r.left) / f, y: (e.clientY - r.top) / f });
  }

  function aktiv(e: KeyboardEvent, tun: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      tun();
    }
  }

  // ------------------------------------------------------------ Ebenen

  const meer = world.landmarks.filter((l) => l.kind === 'sea' && l.outline);
  const linien = world.landmarks.filter((l) => l.points);
  const orte = world.landmarks.filter((l) => l.at);

  const ranches = game.parcels.map((p) => ({ p, shape: shapes.get(p.id) })).filter((r): r is { p: (typeof game.parcels)[number]; shape: RanchShape } => !!r.shape);

  // Pipeline-Route vom Salzdom zum Bahnhof, sobald sie vermessen ist.
  const pipeline = game.logistics.pipeline;
  const routen = world.regions
    .filter((r) => r.pipelineTo && r.geology && game.regions.includes(r.id))
    .map((r) => ({ von: r.geology!.center, nach: landmarkById(world, r.pipelineTo!)?.at }))
    .filter((r): r is { von: Vec; nach: Vec } => !!r.nach);

  const fluss = linien.find((l) => l.kind === 'river');

  function gebietsLabel(r: Region): { at: Vec; offen: boolean } {
    const offen = r.kind === 'town' || game.regions.includes(r.id);
    const c = polygonCentroid(r.outline);
    if (r.kind === 'drillable' && offen) {
      // Über den Ranches: am oberen Rand des Gebiets.
      const top = Math.min(...r.outline.map((p) => p[1]));
      return { at: [c[0], top + u(26)], offen };
    }
    if (r.kind === 'town') return { at: [c[0], Math.min(...r.outline.map((p) => p[1])) - u(8)], offen };
    return { at: c, offen };
  }

  const halo = { strokeWidth: u(3.5) };

  return (
    <div className="karte">
      <svg
        ref={svgRef}
        className="karte-bild"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="application"
        aria-label="Karte von Cordova. Pfeiltasten verschieben, Plus und Minus zoomen, Escape fährt zurück zur Startansicht und von dort zum Schreibtisch."
        tabIndex={0}
        onPointerDown={runter}
        onPointerMove={bewegen}
        onPointerUp={hoch}
        onPointerCancel={hoch}
        onPointerLeave={() => setHover(null)}
        onClickCapture={(e) => {
          if (gezogen.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onKeyDown={tasten}
      >
        <defs>
          <pattern id="karte-gesperrt" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.5" className="karte-schraffur-grau" strokeWidth="0.06" />
          </pattern>
          <pattern id="karte-option" width="0.32" height="0.32" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.32" height="0.32" style={{ fill: 'var(--blau-hell)' }} />
            <line x1="0" y1="0" x2="0" y2="0.32" style={{ stroke: 'var(--blau)' }} strokeWidth="0.05" strokeOpacity="0.55" />
          </pattern>
          <pattern id="karte-bullard-option" width="0.32" height="0.32" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="0.32" height="0.32" style={{ fill: 'var(--land)' }} />
            <line x1="0" y1="0" x2="0" y2="0.32" style={{ stroke: 'var(--rost)' }} strokeWidth="0.06" strokeOpacity="0.6" />
          </pattern>
          <pattern id="karte-wellen" width="1.6" height="0.7" patternUnits="userSpaceOnUse">
            <path d="M0,0.35 q0.2,-0.16 0.4,0 t0.4,0" fill="none" style={{ stroke: 'var(--blau)' }} strokeWidth="0.04" strokeOpacity="0.5" />
          </pattern>
          <radialGradient id="karte-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2410" stopOpacity="0.16" />
          </radialGradient>
        </defs>

        {/* Papiergrund, etwas größer als die Karte, damit beim Verschieben nichts leer ist. */}
        <rect x={-10} y={-10} width={world.size.width + 20} height={world.size.height + 20} className="karte-land" />

        {meer.map((l) => (
          <g key={l.id} pointerEvents="none">
            <polygon points={pts(l.outline!)} className="karte-meer" />
            <polygon points={pts(l.outline!)} fill="url(#karte-wellen)" />
            <path d={kurve(l.outline!.filter((p) => p[1] < world.size.height && p[0] > 0 && p[0] < world.size.width))} className="karte-kueste" strokeWidth={u(1.6)} fill="none" />
            <text x={world.size.width * 0.32} y={world.size.height - 1.2} className="karte-meername" style={{ fontSize: u(18), letterSpacing: u(6) }}>
              {l.name.de}
            </text>
          </g>
        ))}

        {/* Gebiete: offen = nur der Rand, gesperrt = grau schraffiert, Stadt = dunkleres Papier. */}
        {world.regions.map((r) => {
          const offen = r.kind === 'town' || game.regions.includes(r.id);
          const klickbar = !detail || !offen || r.kind === 'town' || focus !== r.id;
          const klasse = r.kind === 'town' ? 'stadt' : offen ? 'offen' : 'gesperrt';
          return (
            <g
              key={r.id}
              className={`karte-gebiet ${klasse}`}
              role="button"
              tabIndex={klickbar ? 0 : -1}
              aria-label={`${r.name.de}${offen ? '' : ', noch unerforscht'}`}
              pointerEvents={klickbar ? undefined : 'none'}
              onClick={() => zeigeGebiet(r)}
              onKeyDown={(e) => aktiv(e, () => zeigeGebiet(r))}
              onPointerMove={(e) => hoverMaus('region', r.id, e)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => hoverAt('region', r.id, polygonCentroid(r.outline))}
              onBlur={() => setHover(null)}
            >
              <polygon points={pts(r.outline)} className="karte-gebiet-flaeche" />
              {!offen && <polygon points={pts(r.outline)} fill="url(#karte-gesperrt)" />}
              <polygon
                points={pts(r.outline)}
                className="karte-gebiet-rand"
                strokeWidth={u(offen ? 2.2 : 1.4)}
                strokeDasharray={offen ? undefined : `${u(7)} ${u(4)}`}
              />
            </g>
          );
        })}

        {/* Port Ellis: ein paar Häuserblöcke. */}
        {world.regions
          .filter((r) => r.kind === 'town')
          .map((r) => {
            const [cx, cy] = polygonCentroid(r.outline);
            return (
              <g key={`${r.id}-haeuser`} pointerEvents="none">
                {BLOECKE.map(([x, y, w, h], i) => (
                  <rect key={i} x={cx + x * 0.8} y={cy + y * 0.8 + 0.3} width={w * 0.8} height={h * 0.8} className="karte-haus" strokeWidth={u(0.8)} />
                ))}
              </g>
            );
          })}

        {/* Ranches der offenen Gebiete. */}
        <g pointerEvents={detail ? undefined : 'none'}>
          {ranches.map(({ p, shape }) => {
            const status = ranchStatus(game, p.id);
            const fill = debug ? DEBUG_FILL[p.geology] : FILL[status];
            const mark = MARK[status];
            const name = p.name;
            const option = optionOf(game, p.id);
            const label = `${name}, ${STATUS_LABEL[status]}, ${p.slots} ${p.slots === 1 ? 'Bohrplatz' : 'Bohrplätze'}`;
            return (
              <g
                key={p.id}
                className="karte-ranch"
                role="button"
                tabIndex={detail ? 0 : -1}
                aria-label={label}
                aria-pressed={p.id === selected}
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => aktiv(e, () => onSelect(p.id))}
                onPointerMove={(e) => hoverMaus('ranch', p.id, e)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => hoverAt('ranch', p.id, shape.center)}
                onBlur={() => setHover(null)}
              >
                <polygon points={pts(shape.polygon)} style={{ fill }} className="karte-ranch-flaeche" strokeWidth={u(0.9)} />
                {mark && (
                  <polygon
                    points={pts(shape.polygon)}
                    fill="none"
                    style={{ stroke: mark }}
                    strokeWidth={u(2.4)}
                    strokeDasharray={option ? `${u(5)} ${u(3)}` : undefined}
                    strokeLinejoin="round"
                    clipPath={`url(#clip-${p.id})`}
                    pointerEvents="none"
                    opacity={0.85}
                  />
                )}
                <clipPath id={`clip-${p.id}`}>
                  <polygon points={pts(shape.polygon)} />
                </clipPath>
              </g>
            );
          })}
        </g>

        {/* Fluss, Wagenweg, Bahnlinie. */}
        {linien.map((l) => {
          if (l.kind === 'river') {
            return (
              <g key={l.id} pointerEvents="none">
                <path d={kurve(l.points!)} id={`karte-${l.id}`} className="karte-fluss-ufer" strokeWidth={u(7)} fill="none" />
                <path d={kurve(l.points!)} className="karte-fluss" strokeWidth={u(4)} fill="none" />
              </g>
            );
          }
          if (l.kind === 'rail') {
            return (
              <g key={l.id} pointerEvents="none">
                <path d={linie(l.points!)} className="karte-bahn" strokeWidth={u(1.6)} fill="none" />
                <path d={linie(l.points!)} className="karte-bahn" strokeWidth={u(7)} strokeDasharray={`${u(1.4)} ${u(6)}`} fill="none" />
              </g>
            );
          }
          return (
            <g key={l.id} pointerEvents="none">
              <path d={kurve(l.points!)} className="karte-weg-rand" strokeWidth={u(5)} fill="none" />
              <path d={kurve(l.points!)} className="karte-weg" strokeWidth={u(2.2)} strokeDasharray={`${u(6)} ${u(3)}`} fill="none" />
            </g>
          );
        })}

        {/* Pipeline vom Salzdom zum Bahnhof. */}
        {pipeline !== 'none' &&
          routen.map((r, i) => (
            <g key={i} pointerEvents="none" className={`karte-pipeline ${pipeline}`}>
              <path
                d={linie([r.von, r.nach])}
                strokeWidth={u(pipeline === 'ready' ? 4 : 2.5)}
                strokeDasharray={pipeline === 'ready' ? undefined : pipeline === 'damaged' ? `${u(4)} ${u(4)}` : `${u(8)} ${u(5)}`}
                fill="none"
                strokeLinecap="round"
              />
              {detail && (
                <text
                  x={(r.von[0] + r.nach[0]) / 2 + u(8)}
                  y={(r.von[1] + r.nach[1]) / 2}
                  className="karte-klein"
                  style={{ fontSize: u(12.5) }}
                  paintOrder="stroke"
                  {...halo}
                >
                  {pipeline === 'surveyed' ? 'Pipeline vermessen' : pipeline === 'building' ? 'Pipeline im Bau' : pipeline === 'damaged' ? 'Pipeline beschädigt' : 'Pipeline'}
                </text>
              )}
            </g>
          ))}

        {/* Bohrplätze, Bohrtürme und Namen der Ranches. */}
        <g pointerEvents="none">
          {ranches.map(({ p, shape }) => {
            const status = ranchStatus(game, p.id);
            const wells = wellsOn(game, p.id);
            const rivalWells = game.rival.wells.filter((w) => w.parcelId === p.id);
            const alle: (Pick<Well, 'status'> & { rival?: boolean })[] = [...wells, ...rivalWells.map((w) => ({ status: w.status, rival: true }))];
            const plaetze = slotPositions(shape.polygon, shape.center, Math.max(p.slots, alle.length));
            const s = u(7);
            if (!detail) {
              // Übersicht: fündige Quellen als Punkte.
              const funde = alle.filter((w) => w.status === 'found');
              if (p.discovery) return <Bohrturm key={p.id} x={shape.center[0]} y={shape.center[1] + u(4)} s={u(5)} className="karte-turm found" />;
              return funde.length > 0 ? <circle key={p.id} cx={shape.center[0]} cy={shape.center[1]} r={u(2.6)} className="karte-punkt" /> : null;
            }
            const schrift = u(13);
            const passt = labelFits(shape.polygon, shape.center, p.name.length, schrift);
            const option = optionOf(game, p.id);
            const lease = leaseOf(game, p.id);
            const frist = lease && !lease.drilled ? roundsLeft(game, lease) : option ? roundsLeft(game, option) : undefined;
            const rate = wells.reduce((sum, w) => sum + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
            const nameY = shape.center[1] - u(10);
            return (
              <g key={p.id}>
                {p.discovery ? (
                  <g>
                    <ellipse cx={shape.center[0]} cy={shape.center[1] + u(14)} rx={u(9)} ry={u(3)} className="karte-oelpfuetze" />
                    <Bohrturm x={shape.center[0]} y={shape.center[1] + u(14)} s={u(11)} className="karte-turm found gross" />
                  </g>
                ) : (
                  plaetze.map((at, i) => {
                    const w = alle[i];
                    if (!w) return <circle key={i} cx={at[0]} cy={at[1] - s * 0.5} r={s * 0.38} className="karte-platz" strokeWidth={u(1)} strokeDasharray={`${u(1.6)} ${u(1.4)}`} />;
                    return (
                      <g key={i} className={w.rival ? 'karte-rivale' : undefined}>
                        <Bohrloch well={w} at={[at[0], at[1] + s * 0.3]} s={s} />
                      </g>
                    );
                  })
                )}
                {passt && !highlight.includes(p.id) && (
                  <text x={shape.center[0]} y={p.discovery ? shape.center[1] - u(16) : nameY} className={`karte-ranchname${p.discovery ? ' fund' : ''}`} style={{ fontSize: schrift }} paintOrder="stroke" {...halo}>
                    {p.name}
                  </text>
                )}
                {debug && p.reserves > 0 && !p.discovery && (
                  <text x={shape.center[0]} y={nameY - schrift} className="karte-klein" style={{ fontSize: u(10) }}>
                    {Math.round(p.reserves / 1000)}k
                  </text>
                )}
                {passt && (frist !== undefined || rate > 0) && (() => {
                  // Statuszeile unter den Bohrplätzen – nur, wenn sie dort ganz in die Ranch passt (sonst ragt sie in den Namen der Nachbarn).
                  const text = rate > 0 ? `${zahl(rate)} Barrel` : `${status === 'option' || status === 'bullardOption' ? 'Option' : 'Pacht'} · noch ${frist} ${frist === 1 ? 'Runde' : 'Runden'}`;
                  const klein = u(12);
                  const y = shape.center[1] + u(30);
                  if (!labelFits(shape.polygon, [shape.center[0], y + klein * 0.6], text.length, klein)) return null;
                  return (
                    <text x={shape.center[0]} y={y} className="karte-klein karte-status" style={{ fontSize: klein, fill: MARK[status] }} paintOrder="stroke" {...halo}>
                      {text}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </g>

        {/* Bahnhöfe und Hafen. */}
        {orte.map((l: Landmark) => {
          const s = u(l.kind === 'harbor' ? 9 : 8);
          const rechts = l.at![0] < world.size.width * 0.6 || l.kind === 'harbor';
          return (
            <g key={l.id} pointerEvents="none">
              {l.kind === 'harbor' ? <Anker at={l.at!} s={s} /> : <Bahnhof at={l.at!} s={s} />}
              {(detail || l.kind !== 'station' || l.id === 'bahnhof_salthill') && (
                <text
                  x={l.at![0] + (rechts ? 1 : -1) * u(13)}
                  y={l.at![1] + u(4)}
                  textAnchor={rechts ? 'start' : 'end'}
                  className="karte-ort"
                  style={{ fontSize: u(12) }}
                  paintOrder="stroke"
                  {...halo}
                >
                  {l.name.de}
                </text>
              )}
            </g>
          );
        })}

        {fluss && (
          <text className="karte-flussname" style={{ fontSize: u(13), letterSpacing: u(2) }} dy={-u(7)} pointerEvents="none">
            <textPath href={`#karte-${fluss.id}`} startOffset="12%">
              {fluss.name.de}
            </textPath>
          </text>
        )}

        {/* Gebietsnamen; gesperrte mit „noch unerforscht“. */}
        {world.regions.map((r) => {
          const { at, offen } = gebietsLabel(r);
          const gross = r.kind === 'drillable';
          return (
            <g key={`${r.id}-name`} pointerEvents="none">
              <text
                x={at[0]}
                y={at[1]}
                className={`karte-gebietsname${offen ? '' : ' gesperrt'}${r.kind === 'town' ? ' stadt' : ''}`}
                style={{ fontSize: u(gross ? 17 : 15), letterSpacing: u(gross ? 3 : 1.5) }}
                paintOrder="stroke"
                {...halo}
              >
                {r.name.de}
              </text>
              {!offen && (
                <text x={at[0]} y={at[1] + u(17)} className="karte-unerforscht" style={{ fontSize: u(12) }} paintOrder="stroke" {...halo}>
                  noch unerforscht
                </text>
              )}
            </g>
          );
        })}

        {/* Hervorhebung des Einstiegs und die gewählte Ranch obenauf. */}
        <g pointerEvents="none">
          {ranches
            .filter(({ p }) => highlight.includes(p.id))
            .map(({ p, shape }) => {
              // Ziel des Einstiegs (0.2.15+11): pulsierender Rahmen, immer mit Namen und einem Fähnchen „hier“.
              const oben = Math.min(...shape.polygon.map((q) => q[1]));
              const [cx] = shape.center;
              const mast = oben - u(4);
              const fahne = u(13);
              return (
                <g key={p.id} className="karte-ziel">
                  <polygon points={pts(shape.polygon)} fill="none" strokeWidth={u(5)} className="highlight" strokeLinejoin="round" />
                  <line x1={cx} y1={mast + u(4)} x2={cx} y2={mast - u(30)} className="karte-fahne-mast" strokeWidth={u(2)} />
                  <rect x={cx} y={mast - u(30)} width={u(36)} height={u(17)} className="karte-fahne" strokeWidth={u(1)} />
                  <text x={cx + u(18)} y={mast - u(17.5)} className="karte-fahne-text" style={{ fontSize: fahne }}>
                    hier
                  </text>
                  <text x={cx} y={mast - u(36)} className="karte-ranchname karte-ziel-name" style={{ fontSize: u(14) }} paintOrder="stroke" {...halo}>
                    {p.name}
                  </text>
                </g>
              );
            })}
          {ranches
            .filter(({ p }) => p.id === selected)
            .map(({ p, shape }) => (
              <polygon key={p.id} points={pts(shape.polygon)} fill="none" strokeWidth={u(3)} className="karte-gewaehlt" strokeLinejoin="round" />
            ))}
        </g>

        {/* Zeichen (0.2.15+10): Pflock = hier kann Jacob etwas tun, Brief = ein offenes Ereignis. */}
        {markers.map((m, i) => {
          const r = ranches.find((x) => x.p.id === m.parcelId);
          if (!r) return null;
          const [cx, cy] = r.shape.center;
          if (m.kind === 'pflock') {
            const x = cx - u(14);
            const y = cy - u(4);
            return (
              <g key={`m${i}`} className="karte-marke pflock" pointerEvents="none" aria-hidden="true">
                <title>{m.label}</title>
                <line x1={x} y1={y} x2={x} y2={y - u(20)} strokeWidth={u(2.4)} />
                <path d={`M${x},${y - u(20)} L${x + u(11)},${y - u(16)} L${x},${y - u(12)} Z`} />
              </g>
            );
          }
          // Neben den Namen, nicht darauf (0.2.15+11).
          const halb = labelFits(r.shape.polygon, r.shape.center, r.p.name.length, u(13)) ? r.p.name.length * u(13) * 0.27 : u(4);
          const x = cx + halb + u(4);
          const y = cy - u(10) - u(14);
          return (
            <g
              key={`m${i}`}
              className="karte-marke brief"
              role="button"
              tabIndex={0}
              aria-label={`Offen: ${m.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onMarker?.(m);
              }}
              onKeyDown={(e) => aktiv(e, () => onMarker?.(m))}
            >
              <title>{m.label}</title>
              <rect x={x} y={y} width={u(22)} height={u(15)} strokeWidth={u(1.4)} />
              <path d={`M${x},${y} L${x + u(11)},${y + u(8)} L${x + u(22)},${y}`} strokeWidth={u(1.2)} fill="none" />
              <circle cx={x + u(11)} cy={y + u(8)} r={u(3)} className="karte-marke-siegel" />
            </g>
          );
        })}

        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#karte-vignette)" pointerEvents="none" />
      </svg>

      <div className="karte-knoepfe">
        {!sameView(view, ganz, 0.05) && (
          <button type="button" onClick={zurUebersicht} title="Ganze Provinz zeigen">
            ← Übersicht
          </button>
        )}
        <button type="button" onClick={() => zoomKnopf(0.7)} aria-label="Hineinzoomen" title="Hineinzoomen (+)">
          +
        </button>
        <button type="button" onClick={() => zoomKnopf(1 / 0.7)} aria-label="Herauszoomen" title="Herauszoomen (−)">
          −
        </button>
      </div>

      <Kompass />

      {notice && (
        <p className="karte-notiz" role="status">
          {notice}
        </p>
      )}

      {hover && (
        <div className="karte-tipp" style={{ left: Math.min(hover.x + 14, breite - 230), top: hover.y + 16 }} role="tooltip">
          {hover.kind === 'ranch' ? <RanchTipp game={game} id={hover.id} debug={debug} /> : <GebietTipp game={game} region={world.regions.find((r) => r.id === hover.id)!} />}
        </div>
      )}

      <Legende />
    </div>
  );
}

function RanchTipp({ game, id, debug }: { game: GameState; id: string; debug: boolean }): ReactNode {
  const p = game.parcels.find((x) => x.id === id);
  if (!p) return null;
  const status = ranchStatus(game, id);
  const wells = wellsOn(game, id);
  const rival = game.rival.wells.filter((w) => w.parcelId === id).length;
  const forecast = game.forecasts[id];
  const belegt = wells.length + rival;
  const lease = leaseOf(game, id);
  const option = optionOf(game, id);
  const frist = lease ? (lease.drilled ? undefined : roundsLeft(game, lease)) : option ? roundsLeft(game, option) : undefined;
  const rate = wells.reduce((sum, w) => sum + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
  return (
    <>
      <strong>{p.name}</strong>
      <dl>
        <dt>Land</dt>
        <dd>{p.owner}</dd>
        <dt>Stand</dt>
        <dd>
          {p.discovery ? 'Entdeckungsquelle, nicht pachtbar' : STATUS_LABEL[status]}
          {frist !== undefined && ` · noch ${frist} ${frist === 1 ? 'Runde' : 'Runden'}`}
        </dd>
        <dt>Fläche</dt>
        <dd>{units(p.area)}</dd>
        <dt>Bohrplätze</dt>
        <dd>
          {p.slots}
          {belegt > 0 && ` (${belegt} belegt)`}
        </dd>
        {rate > 0 && (
          <>
            <dt>Förderung</dt>
            <dd>{zahl(rate)} Barrel je Runde</dd>
          </>
        )}
        {!p.discovery && (
          <>
            <dt>Prognose</dt>
            <dd>{forecast ? formatForecast(forecast) : '–'}</dd>
          </>
        )}
        {debug && (
          <>
            <dt>Geologie</dt>
            <dd>
              {p.geology} · {zahl(p.reserves)} Barrel
            </dd>
          </>
        )}
      </dl>
    </>
  );
}

function GebietTipp({ game, region }: { game: GameState; region: Region }): ReactNode {
  const offen = region.kind === 'town' || game.regions.includes(region.id);
  const ranches = game.parcels.filter((p) => p.region === region.id);
  const eigene = ranches.filter((p) => ranchStatus(game, p.id) === 'lease').length;
  return (
    <>
      <strong>{region.name.de}</strong>
      <div className="muted">
        {region.kind === 'town'
          ? 'Stadt mit Bahnhof und Hafen'
          : offen
            ? `${ranches.length} Ranches und Farmen${eigene > 0 ? `, ${eigene} davon gepachtet` : ''} – Klick zum Hineinzoomen`
            : 'noch unerforscht'}
      </div>
    </>
  );
}

function Kompass() {
  return (
    <svg className="karte-kompass" viewBox="-20 -24 40 46" aria-hidden="true">
      <circle r="13" className="kompass-ring" />
      <path d="M0,-17 L4,0 L0,17 L-4,0 Z" className="kompass-nadel" />
      <path d="M0,-17 L4,0 L-4,0 Z" className="kompass-nord" />
      <path d="M-17,0 L0,3 L17,0 L0,-3 Z" className="kompass-nadel" />
      <text y="-18.5" className="kompass-n">
        N
      </text>
    </svg>
  );
}

function Legende() {
  const eintraege: { klasse: string; text: string }[] = [
    { klasse: 'frei', text: 'frei' },
    { klasse: 'option', text: 'Jacobs Option' },
    { klasse: 'lease', text: 'Jacobs Pacht' },
    { klasse: 'bullard', text: 'Bullard' },
    { klasse: 'other', text: 'anderer Wildcatter' },
    { klasse: 'gesperrt', text: 'unerforscht' },
  ];
  return (
    <ul className="karte-legende" aria-label="Legende">
      {eintraege.map((e) => (
        <li key={e.klasse}>
          <span className={`feld ${e.klasse}`} aria-hidden="true" />
          {e.text}
        </li>
      ))}
      <li>
        <svg viewBox="-6 -12 12 14" className="legende-symbol" aria-hidden="true">
          <Bohrturm x={0} y={0} s={6} className="karte-turm found" />
        </svg>
        Quelle
      </li>
      <li>
        <svg viewBox="-6 -12 12 14" className="legende-symbol" aria-hidden="true">
          <circle cx={0} cy={-4} r={3} className="karte-platz" strokeWidth={0.9} strokeDasharray="1.4 1.2" />
        </svg>
        freier Bohrplatz
      </li>
      <li>
        <svg viewBox="-2 -12 14 14" className="legende-symbol karte-marke pflock" aria-hidden="true">
          <line x1={0} y1={0} x2={0} y2={-10} strokeWidth={1.4} />
          <path d="M0,-10 L6,-8 L0,-6 Z" />
        </svg>
        hier kannst du etwas tun
      </li>
      <li>
        <svg viewBox="-1 -1 14 10" className="legende-symbol karte-marke brief" aria-hidden="true">
          <rect x={0} y={0} width={12} height={8} strokeWidth={0.8} />
          <path d="M0,0 L6,4 L12,0" strokeWidth={0.7} fill="none" />
        </svg>
        offenes Ereignis (Klick öffnet es)
      </li>
    </ul>
  );
}
