// Nur für Tests: findet jede Zahl im Zustand, die NaN oder ±Infinity ist.
// JSON.stringify schreibt solche Zahlen als null – ein Regex über den Text findet sie nie.

/** Pfade aller nicht endlichen Zahlen in einem beliebig verschachtelten Wert. */
export function nonFiniteNumbers(wert: unknown, pfad = 'state', gesehen = new Set<object>()): string[] {
  if (typeof wert === 'number') return Number.isFinite(wert) ? [] : [pfad];
  if (wert === null || typeof wert !== 'object') return [];
  if (gesehen.has(wert)) return [];
  gesehen.add(wert);
  if (Array.isArray(wert)) return wert.flatMap((e, i) => nonFiniteNumbers(e, `${pfad}[${i}]`, gesehen));
  return Object.entries(wert).flatMap(([k, v]) => nonFiniteNumbers(v, `${pfad}.${k}`, gesehen));
}
