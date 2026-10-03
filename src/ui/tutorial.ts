// Einstieg (2.13): lädt die Hinweistexte aus content/tutorial.yaml und merkt sich,
// ob der Spieler die Hinweise ausgeschaltet hat. Das ist eine Vorliebe des
// Spielers, keine Spielregel – sie liegt im localStorage, nicht im Spielstand.
// Welcher Hinweis kommt, entscheidet allein src/sim/tutorial.
import tutorialText from '../../content/tutorial.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseTutorialContent } from '../sim/tutorial';

const { content, errors } = parseTutorialContent('content/tutorial.yaml', tutorialText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const tutorialContent = content;

const KEY = 'crude.tutorial';

/** Sind die Hinweise eingeschaltet? Ohne gespeicherte Wahl: ja. */
export function loadTutorialOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'aus';
  } catch {
    return true;
  }
}

export function saveTutorialOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'an' : 'aus');
  } catch {
    /* Kein Speicher – dann gilt die Wahl nur bis zum Neuladen. */
  }
}
