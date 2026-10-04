// Zahlen in Worten für die Oberfläche: Dollar, Barrel, Prozent, Runden.

export function money(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 2 })} $`;
}

export function barrels(value: number): string {
  return Math.round(value).toLocaleString('de-DE');
}

/** Förderzins als Prozent, z. B. 0.125 -> "12,5 %". */
export function percent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

export function rounds(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}
