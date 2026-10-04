// Kapitel 3 (4.17) in der Kladde: Notizen als lesbare Zeilen. Die Texte kommen aus
// content/kapitel3.yaml (Kapitel3Content), hier wird nur eingesetzt – Ranchname,
// Betrag, Gefallen, Projekt. Dieselbe Zeile steht in der Siegelmappe (ui/kapitel3.ts)
// und im Rundenbericht/Kladde (state.log, über advanceKapitel3).

import { formatDate } from './calendar';
import type { GameState } from './game';
import { DEFAULT_LANG, localize, type Lang } from './i18n';
import type { Kapitel3Note } from './kapitel3';
import { fillText, type Kapitel3Content } from './kapitel3Content';
import { parcelLabel } from './lease';

/** Ganze Dollar wie in der Oberfläche, z. B. „6.000 $“ (geschütztes Leerzeichen). */
function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

/** Notiz mit eingesetzten Namen und Beträgen. */
export function kapitel3NoteText(state: GameState, n: Kapitel3Note, texts: Kapitel3Content, lang: Lang = DEFAULT_LANG): string {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(n.vars ?? {})) {
    if (key === 'betrag') vars[key] = money(Number(value));
    else if (key === 'ranch') {
      const p = state.parcels.find((x) => x.id === String(value));
      vars[key] = p ? parcelLabel(p) : String(value);
    } else if (key === 'gefallen') {
      const f = texts.konsortium.favors[String(value)];
      vars[key] = f ? localize(f.title, lang) : String(value);
    } else if (key === 'projekt') {
      const p = texts.projekte.list[String(value)];
      vars[key] = p ? localize(p.title, lang) : String(value);
    } else vars[key] = String(value);
  }
  return fillText(texts.notes[n.key], vars, lang);
}

/**
 * Hängt für neue Notizen je eine Zeile an state.log – so stehen Kartellgewinn,
 * Rauswurf, aufgeflogenes Doppelspiel, Projekte und Berichte im Rundenbericht
 * („Was diese Runde geschah“) und in der Kladde. Ohne Texte (Bots, Werkzeuge)
 * bleibt das Protokoll, wie es ist.
 */
export function logKapitel3Notes(state: GameState, notes: readonly Kapitel3Note[], texts: Kapitel3Content | undefined, lang: Lang = DEFAULT_LANG): GameState {
  if (!texts || notes.length === 0) return state;
  const date = formatDate(state);
  return { ...state, log: [...state.log, ...notes.map((n) => `${date}: ${kapitel3NoteText(state, n, texts, lang)}`)] };
}
