// Gegenstand „Vertrieb“ (4.14): eine gefaltete Gratis-Straßenkarte mit einem
// kleinen Emailschild darauf. Nur Dekoration – Name und Zahlen stehen als Text am
// Gegenstand. Farben über die Klassen aus scene.css.

const svg = { 'aria-hidden': true, focusable: false, preserveAspectRatio: 'xMidYMid meet' } as const;

export function BrandShape() {
  return (
    <svg viewBox="0 0 110 80" className="form" {...svg}>
      {/* Gefaltete Straßenkarte: drei Felder, das mittlere etwas dunkler. */}
      <path d="M8,14 L40,8 L70,14 L102,8 L102,72 L70,78 L40,72 L8,78 Z" className="f-papier" />
      <path d="M40,8 L70,14 L70,78 L40,72 Z" className="f-land" />
      <path d="M14,60 C30,50 44,58 58,44 C70,32 84,40 96,22" className="s-fluss" />
      <path d="M12,30 L98,46" className="s-tinte" />
      {/* Emailschild mit Zapfsäule. */}
      <circle cx="78" cy="56" r="15" className="f-rot" />
      <rect x="72" y="47" width="10" height="16" rx="1.5" className="f-papier" />
      <rect x="74" y="50" width="6" height="4" className="f-holz" />
      <path d="M82,52 q5,0 5,5 v4" className="s-tinte" />
    </svg>
  );
}
