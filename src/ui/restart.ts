// „Neues Spiel“ (0.4.20+1): neue Welt mit neuem Zufalls-Seed. Hier ohne React und ohne
// Fenster, damit es sich testen lässt; App.tsx löscht dazu den Autosave.

/** Ein neuer Seed, der nicht der alte ist (Math.random könnte ihn sonst theoretisch wiederholen). */
export function freshSeed(current: string, draw: () => string = () => Math.random().toString(36).slice(2, 8)): string {
  for (let i = 0; i < 20; i++) {
    const seed = draw();
    if (seed !== '' && seed !== current) return seed;
  }
  return `${current}-neu`;
}

/**
 * Adresse ohne ?seed=… – sonst käme nach dem Neuladen wieder die alte Welt aus der Adresse
 * statt der neuen Partie aus dem Autosave. null, wenn kein Seed drinsteht (oder die Adresse nicht taugt).
 */
export function withoutSeedParam(href: string): string | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has('seed')) return null;
    url.searchParams.delete('seed');
    return url.toString();
  } catch {
    return null;
  }
}
