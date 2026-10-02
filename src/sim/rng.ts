// Deterministischer Zufall (mulberry32). Der Zustand ist eine einzige Zahl,
// damit er im Spielstand gespeichert werden kann: gleicher Seed = gleiche Folge.

export type RngState = number;

/** Macht aus einem beliebigen Text-Seed einen Startzustand. */
export function seedFromString(seed: string): RngState {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Liefert eine Zahl in [0, 1) und den neuen Zustand. */
export function nextFloat(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Bequeme Hülle für Funktionen, die viele Zufallszahlen am Stück ziehen. */
export class Rng {
  constructor(public state: RngState) {}

  float(): number {
    const [value, next] = nextFloat(this.state);
    this.state = next;
    return value;
  }

  /** Ganze Zahl zwischen min und max (beide eingeschlossen). */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Zufälliges Element aus einer Liste. Leere Listen sind ein Fehler. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('pick() braucht eine Liste mit mindestens einem Element.');
    }
    return items[this.int(0, items.length - 1)];
  }
}
