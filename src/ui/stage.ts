// Bühne (0.2.15+11): Der Schreibtisch hat eine feste Arbeitsgröße von etwa
// 1280×800 Bildpunkten. Auf größeren Bildschirmen (bis 1920×1080) wird die ganze
// Bühne gleichmäßig vergrößert – Schrift, Fenster und Gegenstände wachsen mit,
// statt winzig neben großen Objekten zu stehen. Ab 0.2.15+12 darf sie auch etwas
// schrumpfen (bis 0,85): Auf einem 1280×800-Bildschirm bleiben im Browser mit
// Adress- und Tab-Leiste nur etwa 1280×680 – sonst würden Tisch und Gegenstände
// kleiner, die Schrift aber nicht, und Schilder überdeckten sich.

/** Arbeitsgröße der Bühne in CSS-Pixeln. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 800;
/** Mehr als das wird nicht vergrößert. */
const MAX_SCALE = 1.6;
/** Weniger als das wird nicht verkleinert (Schrift bleibt lesbar). */
const MIN_SCALE = 0.85;

/** Vergrößerung für ein Fenster dieser Größe: so viel, wie die 16:10-Bühne gegenüber der Arbeitsgröße Platz hat. */
export function stageScaleFor(width: number, height: number): number {
  const passt = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  return Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, passt)) * 1000) / 1000;
}

/** Setzt --skala am Wurzelelement und hält es bei Größenänderungen aktuell. */
export function watchStageScale(win: Window = window): () => void {
  const setzen = () => win.document.documentElement.style.setProperty('--skala', String(stageScaleFor(win.innerWidth, win.innerHeight)));
  setzen();
  win.addEventListener('resize', setzen);
  return () => win.removeEventListener('resize', setzen);
}

/**
 * Wie stark die Bühne um ein Element gerade vergrößert ist: Bildschirmpixel je
 * CSS-Pixel. Für Rechnungen mit getBoundingClientRect (die liefert Bildschirmpixel).
 */
export function stageScale(el: Element | null | undefined): number {
  const buehne = el?.closest<HTMLElement>('.buehne');
  if (!buehne || buehne.offsetWidth === 0) return 1;
  return buehne.getBoundingClientRect().width / buehne.offsetWidth || 1;
}
