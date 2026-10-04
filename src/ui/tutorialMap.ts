// Einstieg auf der Karte (0.2.15+11): Im Ranch-Fenster und am Kartenrand ist man
// schon auf der Karte – dort stehen die Hinweise ohne den Weg dorthin („Öffne die
// Wandkarte …“). Die Texte stehen im Block „onMap“ von content/tutorial.yaml.
// Reines Lesen; welcher Hinweis kommt, entscheidet src/sim/tutorial.
import { parse } from 'yaml';
import type { LocalizedText } from '../sim/i18n';
import { TUTORIAL_HINT_IDS, type TutorialContent, type TutorialHintId } from '../sim/tutorial';

/**
 * Fassungen für die Karte (0.2.15+11, Block „onMap“ in content/tutorial.yaml):
 * ohne den Weg zur Wandkarte. Wirft mit verständlicher Meldung bei unbekannten
 * Hinweisen oder fehlendem deutschem Text.
 */
export function parseMapHints(file: string, text: string): Partial<Record<TutorialHintId, LocalizedText>> {
  const data = parse(text) as { onMap?: unknown } | null;
  const block = data?.onMap;
  if (block === undefined) return {};
  if (block === null || typeof block !== 'object' || Array.isArray(block)) throw new Error(`${file}: „onMap“ braucht Hinweise mit de/en.`);
  const out: Partial<Record<TutorialHintId, LocalizedText>> = {};
  for (const [id, wert] of Object.entries(block)) {
    if (!(TUTORIAL_HINT_IDS as readonly string[]).includes(id)) throw new Error(`${file}: onMap.${id} gibt es nicht (erlaubt: ${TUTORIAL_HINT_IDS.join(', ')}).`);
    const t = wert as { de?: unknown; en?: unknown } | null;
    if (typeof t?.de !== 'string' || t.de.trim() === '') throw new Error(`${file}: onMap.${id} braucht einen deutschen Text.`);
    out[id as TutorialHintId] = { de: t.de, en: typeof t.en === 'string' ? t.en : '' };
  }
  return out;
}

/** Die Hinweise, wie sie auf der Karte stehen: wo es eine Kartenfassung gibt, die, sonst die normale. */
export function withMapHints(base: TutorialContent, map: Partial<Record<TutorialHintId, LocalizedText>>): TutorialContent {
  return { ...base, hints: { ...base.hints, ...map } };
}

