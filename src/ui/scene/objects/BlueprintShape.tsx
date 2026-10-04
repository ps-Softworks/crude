// Werkstatt-Mappe (4.11): eine halb aufgerollte Blaupause mit Bohrmeißel-Skizze.
// Farben nur über CSS-Klassen aus scene.css, wie in Shapes.tsx.

const svg = { 'aria-hidden': true, focusable: false, preserveAspectRatio: 'xMidYMid meet' } as const;

export function BlueprintShape() {
  return (
    <svg viewBox="0 0 110 80" className="form" {...svg}>
      <rect x="8" y="14" width="86" height="58" className="f-kladde" />
      <ellipse cx="96" cy="43" rx="8" ry="29" className="f-papier" />
      <g className="s-glanz">
        <circle cx="38" cy="43" r="14" />
        <path d="M38,29 L38,57 M24,43 L52,43" />
        <path d="M62,26 L82,26 M62,36 L78,36 M62,46 L84,46 M62,56 L74,56" />
      </g>
    </svg>
  );
}
