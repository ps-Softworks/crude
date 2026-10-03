// Hilfen zum Zeichnen der Karte (0.2.15+6): wie eine Ranch eingefärbt wird, wo
// ihre Bohrplätze als Symbole sitzen und ob ihr Name hineinpasst. Hier wird nur
// gelesen und angeordnet – keine Spielregeln (die stehen in src/sim).

import type { GameState } from '../sim/game';
import { leaseOf, optionOf } from '../sim/lease';
import type { Vec } from '../sim/worldMap';

/**
 * Wie die Ranch auf der Karte aussieht:
 * free = frei, option/lease = Jacobs Option/Pacht, bullard/bullardOption = Rivale,
 * other = gehört schon einem anderen Wildcatter (die Entdeckungsquelle).
 */
export type RanchStatus = 'free' | 'option' | 'lease' | 'bullard' | 'bullardOption' | 'other';

export function ranchStatus(game: Pick<GameState, 'parcels' | 'leases' | 'options'>, parcelId: string): RanchStatus {
  const parcel = game.parcels.find((p) => p.id === parcelId);
  if (parcel?.discovery) return 'other';
  const lease = leaseOf(game, parcelId);
  if (lease) return lease.holder === 'jacob' ? 'lease' : 'bullard';
  const option = optionOf(game, parcelId);
  if (option) return option.holder === 'jacob' ? 'option' : 'bullardOption';
  return 'free';
}

export const STATUS_LABEL: Record<RanchStatus, string> = {
  free: 'frei',
  option: 'Jacobs Option',
  lease: 'Jacobs Pacht',
  bullard: 'Bullards Pacht',
  bullardOption: 'Bullards Option',
  other: 'anderer Wildcatter',
};

/** Kleinster Abstand von p zu einer Kante des Umrisses (≈ Platz um die Mitte). */
export function innerRadius(poly: readonly Vec[], p: Vec): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

/**
 * Wo die n Bohrplätze einer Ranch als Symbole sitzen: einer in der Mitte, mehr
 * im Kreis darum, etwas unter der Mitte (darüber steht der Name). Gleiche Ranch,
 * gleiche Plätze.
 */
export function slotPositions(poly: readonly Vec[], center: Vec, n: number): Vec[] {
  if (n <= 0) return [];
  const r = innerRadius(poly, center);
  const mitte: Vec = [center[0], center[1] + Math.min(0.25 * r, 0.3)];
  if (n === 1) return [mitte];
  const ring = Math.min(0.55 * r, 0.22 + 0.12 * n);
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n + Math.PI / n;
    return [mitte[0] + ring * Math.cos(a), mitte[1] + ring * 0.75 * Math.sin(a)] as Vec;
  });
}

/** Breite des Umrisses auf der Höhe y (Waagerechte durch den Umriss). */
export function widthAt(poly: readonly Vec[], y: number): number {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs);
}

/** Passt ein Name mit so vielen Zeichen bei dieser Schriftgröße (Karteneinheiten) in die Ranch? */
export function labelFits(poly: readonly Vec[], center: Vec, chars: number, fontSize: number): boolean {
  const breite = chars * fontSize * 0.5;
  const y = center[1] - fontSize * 0.6;
  const platz = Math.min(widthAt(poly, y - fontSize * 0.5), widthAt(poly, y + fontSize * 0.3));
  return breite <= platz * 0.92 && innerRadius(poly, center) >= fontSize * 0.9;
}
