// Die Gegenstände auf dem Schreibtisch (0.2.15+9) als schlichte Scherenschnitt-
// Formen in Sepia. Farben nur über CSS-Klassen aus scene.css (SVG-Attribute
// verstehen var() nicht). Alles ist Dekoration (aria-hidden) – Namen und Zahlen
// stehen als Text am Gegenstand.

const svg = { 'aria-hidden': true, focusable: false, preserveAspectRatio: 'xMidYMid meet' } as const;

export function WallMapShape() {
  return (
    <svg viewBox="0 0 120 90" className="form" {...svg}>
      <rect x="2" y="2" width="116" height="86" className="f-holz" />
      <rect x="8" y="8" width="104" height="74" className="f-land" />
      <path d="M8,62 C24,58 30,70 46,66 C60,62 66,74 84,70 C96,67 104,72 112,70 L112,82 L8,82 Z" className="f-meer" />
      <path d="M20,20 L44,16 L52,34 L36,46 L18,40 Z M58,22 L86,18 L94,38 L70,48 L56,40 Z" className="f-gebiet" />
      <path d="M14,52 Q40,44 60,50 T108,46" className="s-fluss" />
      <circle cx="40" cy="30" r="3" className="f-rot" />
    </svg>
  );
}

export function CorkShape() {
  return (
    <svg viewBox="0 0 100 80" className="form" {...svg}>
      <rect x="2" y="2" width="96" height="76" className="f-holz" />
      <rect x="6" y="6" width="88" height="68" className="f-kork" />
    </svg>
  );
}

export function LampShape() {
  return (
    <svg viewBox="0 0 60 100" className="form" {...svg}>
      <ellipse cx="30" cy="40" rx="26" ry="30" className="lampe-schein" />
      <path d="M22,60 Q16,40 26,22 L34,22 Q44,40 38,60 Z" className="lampe-glas" />
      <path d="M30,30 Q26,38 30,46 Q34,38 30,30 Z" className="lampe-flamme" />
      <rect x="18" y="60" width="24" height="8" className="f-messing" />
      <path d="M14,92 Q14,70 30,68 Q46,70 46,92 Z" className="f-messing" />
    </svg>
  );
}

export function DoorShape() {
  return (
    <svg viewBox="0 0 80 160" className="form" {...svg}>
      <rect x="0" y="0" width="80" height="160" className="f-holz-dunkel" />
      <rect x="8" y="8" width="64" height="152" className="f-holz" />
      <rect x="16" y="18" width="48" height="52" className="f-tuerfeld" />
      <rect x="16" y="82" width="48" height="66" className="f-tuerfeld" />
      <circle cx="62" cy="80" r="3.5" className="f-messing" />
    </svg>
  );
}

export function PhotoFrameShape() {
  return (
    <svg viewBox="0 0 70 90" className="form" {...svg}>
      <rect x="2" y="2" width="66" height="86" rx="3" className="f-holz-dunkel" />
      <ellipse cx="35" cy="44" rx="26" ry="34" className="f-papier-dunkel" />
    </svg>
  );
}

export function LetterStackShape({ count, urgent }: { count: number; urgent: boolean }) {
  const n = Math.min(Math.max(count, 0), 4);
  return (
    <svg viewBox="0 0 100 80" className="form" {...svg}>
      {/* Eine leere Ablage, darauf je Brief ein Umschlag. */}
      <rect x="6" y="60" width="88" height="14" className="f-holz-dunkel" />
      {Array.from({ length: n }, (_, i) => {
        const y = 52 - i * 9;
        const dreh = (i % 2 === 0 ? -1 : 1) * (2 + i);
        return (
          <g key={i} transform={`rotate(${dreh} 50 ${y + 12})`}>
            <rect x="14" y={y} width="72" height="24" className="f-papier" />
            <path d={`M14,${y} L50,${y + 14} L86,${y}`} className="s-tinte" />
          </g>
        );
      })}
      {urgent && n > 0 && <circle cx="50" cy={52 - (n - 1) * 9 + 14} r="5" className="f-rot" />}
    </svg>
  );
}

export function SpikeShape({ count, urgent }: { count: number; urgent: boolean }) {
  const n = Math.min(Math.max(count, 0), 4);
  return (
    <svg viewBox="0 0 50 90" className="form" {...svg}>
      <rect x="10" y="78" width="30" height="8" rx="2" className="f-holz-dunkel" />
      <line x1="25" y1="8" x2="25" y2="80" className="s-eisen" />
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={8 + (i % 2) * 4} y={58 - i * 12} width="30" height="20" transform={`rotate(${i % 2 ? 6 : -5} 25 ${68 - i * 12})`} className={urgent && i === n - 1 ? 'f-rot-hell' : 'f-papier'} />
      ))}
    </svg>
  );
}

export function LedgerShape() {
  return (
    <svg viewBox="0 0 100 80" className="form" {...svg}>
      <rect x="10" y="8" width="80" height="66" rx="3" className="f-leder" />
      <rect x="10" y="8" width="12" height="66" className="f-holz-dunkel" />
      <rect x="40" y="26" width="38" height="16" className="f-papier" />
      <line x1="44" y1="34" x2="74" y2="34" className="s-tinte" />
    </svg>
  );
}

export function FolderShape({ variant }: { variant: 'akte' | 'fracht' }) {
  return (
    <svg viewBox="0 0 110 80" className="form" {...svg}>
      <path d="M6,16 L40,16 L46,8 L76,8 L82,16 L104,16 L104,76 L6,76 Z" className={variant === 'akte' ? 'f-mappe' : 'f-mappe-gruen'} />
      <rect x="10" y="22" width="90" height="50" className="f-papier" />
      {variant === 'akte' ? (
        <g transform="translate(55 68)">
          <Bohrturm x={0} y={0} s={28} />
        </g>
      ) : (
        <g className="s-tinte">
          <line x1="20" y1="34" x2="90" y2="34" />
          <line x1="20" y1="44" x2="80" y2="44" />
          <line x1="20" y1="54" x2="86" y2="54" />
        </g>
      )}
    </svg>
  );
}

/**
 * Kleiner Bohrturm im Ordner (0.2.15+11): Gitterturm wie das Zeichen in der
 * Kopfleiste – zwei Beine, Querstreben, Kreuzverbände, oben die Rolle, unten der Boden.
 */
function Bohrturm({ x, y, s }: { x: number; y: number; s: number }) {
  const h = s * 1.5;
  const top = y - h;
  // Breite des Turms auf Höhe t (0 = Boden, 1 = Spitze).
  const bei = (t: number) => (s / 2) * (1 - t * 0.82);
  const hoehe = (t: number) => y - h * t;
  const ebenen = [0.28, 0.54, 0.76];
  const streben = ebenen.map((t) => `M${x - bei(t)},${hoehe(t)} L${x + bei(t)},${hoehe(t)}`).join(' ');
  const kreuze = [0, ...ebenen]
    .slice(0, -1)
    .map((t, i) => {
      const t2 = ebenen[i];
      return `M${x - bei(t)},${hoehe(t)} L${x + bei(t2)},${hoehe(t2)} M${x + bei(t)},${hoehe(t)} L${x - bei(t2)},${hoehe(t2)}`;
    })
    .join(' ');
  return (
    <g>
      <path d={`M${x - bei(0)},${y} L${x - bei(1)},${top} L${x + bei(1)},${top} L${x + bei(0)},${y}`} className="s-tinte-dick" />
      <path d={`${streben} ${kreuze}`} className="s-tinte" />
      <path d={`M${x - s * 0.62},${y} L${x + s * 0.62},${y}`} className="s-tinte-dick" />
      <circle cx={x} cy={top - s * 0.06} r={s * 0.08} className="s-tinte-dick" />
    </g>
  );
}

export function NotebookShape() {
  return (
    <svg viewBox="0 0 80 90" className="form" {...svg}>
      <rect x="10" y="6" width="60" height="78" rx="2" className="f-kladde" />
      <rect x="22" y="22" width="36" height="14" className="f-papier" />
      <line x1="10" y1="6" x2="10" y2="84" className="s-tinte-dick" />
    </svg>
  );
}

export function DrawerShape() {
  return (
    <svg viewBox="0 0 120 50" className="form" {...svg}>
      <rect x="2" y="4" width="116" height="42" className="f-holz" />
      <rect x="8" y="10" width="104" height="30" className="f-holz-dunkel f-schublade" />
      <rect x="48" y="20" width="24" height="8" rx="3" className="f-messing" />
    </svg>
  );
}

export function BellShape() {
  return (
    <svg viewBox="0 0 100 90" className="form" {...svg}>
      <ellipse cx="50" cy="80" rx="42" ry="7" className="f-holz-dunkel" />
      <path d="M14,76 Q14,30 50,28 Q86,30 86,76 Z" className="f-messing" />
      <path d="M26,60 Q30,40 46,36" className="s-glanz" />
      <rect x="47" y="14" width="6" height="14" className="f-messing-dunkel" />
      <ellipse cx="50" cy="13" rx="10" ry="4" className="f-messing-dunkel" />
    </svg>
  );
}
