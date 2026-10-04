// Raffinerie-Plan auf dem Schreibtisch (4.6, ab Kapitel 2): ein eingerollter
// Bauplan mit Destillierkolonne, Kessel und zwei Tanks in Tinte. Reine Dekoration
// (aria-hidden); Farben über die Klassen aus scene.css wie bei den übrigen Formen.

const svg = { 'aria-hidden': true, focusable: false, preserveAspectRatio: 'xMidYMid meet' } as const;

export function RefineryShape({ running }: { running: boolean }) {
  return (
    <svg viewBox="0 0 110 80" className="form" {...svg}>
      <rect x="6" y="10" width="98" height="64" className="f-papier" />
      <rect x="2" y="8" width="8" height="68" rx="4" className="f-papier-dunkel" />
      <g className="s-tinte-dick">
        {/* Kolonne */}
        <path d="M30,66 L30,22 L40,22 L40,66" />
        <path d="M30,32 L40,32 M30,42 L40,42 M30,52 L40,52" />
        {/* Kessel und Leitung */}
        <path d="M18,66 L18,54 Q24,48 30,54" />
        <path d="M40,30 L56,30 L56,46" />
        {/* Tanks */}
        <rect x="52" y="46" width="18" height="20" rx="3" />
        <rect x="76" y="40" width="20" height="26" rx="3" />
        <path d="M12,66 L100,66" />
      </g>
      {running && <path d="M35,20 C31,14 39,12 35,6" className="s-tinte" />}
    </svg>
  );
}
