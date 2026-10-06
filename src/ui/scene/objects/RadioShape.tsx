// Das Radio auf dem Mahagoni-Tisch (0.4.20+10, GDD §3: „Mahagoni, Börsenticker und Radio
// (Kapitel 3)“). Nur Zierde: kein Knopf, keine Regel – ein Kathedralen-Gehäuse mit
// Stoffbespannung, Skala und zwei Drehknöpfen.

export function RadioShape() {
  return (
    <svg viewBox="0 0 80 90" className="form" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
      {/* Gehäuse mit Spitzbogen */}
      <path d="M6,88 L6,40 Q6,4 40,4 Q74,4 74,40 L74,88 Z" className="f-radio" />
      {/* Stoffbespannung mit Holzgitter */}
      <path d="M16,62 L16,40 Q16,14 40,14 Q64,14 64,40 L64,62 Z" className="f-radio-stoff" />
      <path d="M28,62 L28,22 M40,62 L40,14 M52,62 L52,22" className="s-radio-gitter" />
      {/* Skala und Knöpfe */}
      <rect x="30" y="67" width="20" height="8" rx="4" className="f-papier-dunkel" />
      <circle cx="19" cy="76" r="5" className="f-messing" />
      <circle cx="61" cy="76" r="5" className="f-messing" />
    </svg>
  );
}
