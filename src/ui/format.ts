// Zahlen in Worten für die Oberfläche: Dollar, Barrel, Prozent, Runden.
// Ab 0.2.15+11: Geld in ganzen Dollar, Barrel abgerundet (überall gleich), und
// zwischen Zahl und Einheit ein geschütztes Leerzeichen – „100 %“ bricht nie um.

/** Geschütztes Leerzeichen zwischen Zahl und Einheit. */
export const NBSP = ' ';

/** Ganze Dollar, z. B. „6.953 $“ (die Kasse rechnet in Cent, gezeigt wird gerundet). */
export function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')}${NBSP}$`;
}

/** Geldänderung mit Vorzeichen, z. B. „+120 $“ oder „−180 $“. */
export function moneyDelta(value: number): string {
  const r = Math.round(value);
  return `${r < 0 ? '−' : '+'}${money(Math.abs(r))}`;
}

/** Barrel abgerundet: Was im Tank steht, kann man auch verkaufen. */
export function barrels(value: number): string {
  return Math.floor(value + 1e-9).toLocaleString('de-DE');
}

/** Förderzins als Prozent, z. B. 0.125 -> "12,5 %". */
export function percent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })}${NBSP}%`;
}

export function rounds(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

/** „1 Einheit“, „2,5 Einheiten“. */
export function units(n: number): string {
  const zahl = n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return zahl === '1' ? '1 Einheit' : `${zahl} Einheiten`;
}

/** „1 Antwort wählen“: Tastenhinweis passend zur Zahl der Antworten (höchstens 1–4). */
export function keyRange(n: number): string {
  const bis = Math.min(4, n);
  return bis <= 1 ? 'Taste 1' : `Tasten 1–${bis}`;
}
