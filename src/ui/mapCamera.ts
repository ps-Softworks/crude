// Kamera der Karte (0.2.15+6): welcher Ausschnitt der Provinz gerade zu sehen ist.
// Reine Rechnung in Karteneinheiten, ohne React und ohne Spielregeln – darum
// eigens getestet (mapCamera.test.ts).

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Grenzen der Kamera: so weit darf man hinaus- und hineinzoomen und verschieben. */
export interface Limits {
  /** Die ganze Karte. */
  world: { width: number; height: number };
  /** Höhe : Breite des Bildes. */
  aspect: number;
  /** Kleinste Breite in Karteneinheiten (stärkster Zoom). */
  minW: number;
  /** So weit darf der Ausschnitt über den Kartenrand hinaus. */
  margin: number;
}

export function boundsOf(points: readonly (readonly [number, number])[]): Bounds {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Größte Breite: die ganze Karte passt ins Bild. */
export function maxWidth(limits: Limits): number {
  return Math.max(limits.world.width, limits.world.height / limits.aspect);
}

/** Die ganze Provinz, mittig. */
export function overview(limits: Limits): View {
  const w = maxWidth(limits);
  const h = w * limits.aspect;
  return { x: (limits.world.width - w) / 2, y: (limits.world.height - h) / 2, w, h };
}

/** Ausschnitt, der die Fläche mit etwas Rand ganz zeigt (Seitenverhältnis bleibt). */
export function fitBounds(b: Bounds, limits: Limits, pad = 0.08): View {
  const bw = (b.maxX - b.minX) * (1 + 2 * pad);
  const bh = (b.maxY - b.minY) * (1 + 2 * pad);
  const w = Math.max(bw, bh / limits.aspect);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return clampView({ x: cx - w / 2, y: cy - (w * limits.aspect) / 2, w, h: w * limits.aspect }, limits);
}

/**
 * Hält den Ausschnitt in den Grenzen: nicht kleiner als minW, nicht größer als
 * die ganze Karte, und nie so weit verschoben, dass man die Provinz verliert.
 */
export function clampView(v: View, limits: Limits): View {
  const w = Math.min(maxWidth(limits), Math.max(limits.minW, v.w));
  const h = w * limits.aspect;
  // Mitte bleibt, wenn sich die Größe ändert.
  let x = v.x + (v.w - w) / 2;
  let y = v.y + (v.h - h) / 2;
  const { width, height } = limits.world;
  const m = limits.margin;
  x = w >= width ? (width - w) / 2 : Math.min(width + m - w, Math.max(-m, x));
  y = h >= height ? (height - h) / 2 : Math.min(height + m - h, Math.max(-m, y));
  return { x, y, w, h };
}

/** Zoomt um den Punkt p (Karteneinheiten); factor < 1 = hinein. p bleibt an seiner Stelle im Bild. */
export function zoomAt(v: View, factor: number, p: readonly [number, number], limits: Limits): View {
  const w = Math.min(maxWidth(limits), Math.max(limits.minW, v.w * factor));
  const f = w / v.w;
  const h = w * limits.aspect;
  const next = { x: p[0] - (p[0] - v.x) * f, y: p[1] - (p[1] - v.y) * f, w, h };
  return clampView(next, limits);
}

/** Verschiebt den Ausschnitt um dx, dy Karteneinheiten. */
export function panBy(v: View, dx: number, dy: number, limits: Limits): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, limits);
}

/** Zwischenstand einer Kamerafahrt; t von 0 bis 1, sanft an- und auslaufend. */
export function tween(a: View, b: View, t: number): View {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

/** Sind zwei Ausschnitte praktisch gleich? */
export function sameView(a: View, b: View, eps = 1e-3): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.w - b.w) < eps;
}
