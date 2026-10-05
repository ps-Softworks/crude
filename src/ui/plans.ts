// Planungsbrett und Erkundung (Termine als Hauptwerkzeug, Etappe 1): lädt die Texte
// aus content/plans.yaml für die Oberfläche. Welche Karte geht und was sie tut,
// entscheidet allein src/sim/plans.ts und src/sim/exploration.ts.
import plansText from '../../content/plans.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import type { ClueView, KnowledgeLevel } from '../sim/exploration';
import { localize, type LocalizedText } from '../sim/i18n';
import { KNOWLEDGE_LEVEL_KEYS, parsePlanContent } from '../sim/planContent';
import type { PlanCardView } from '../sim/plans';
import { events } from './events';

const gelesen = parsePlanContent('content/plans.yaml', plansText);
if (!gelesen.content) throw new Error(gelesen.errors.map(formatContentError).join('\n'));
const content = gelesen.content;

export const planContent = content;

/** Titel und Text einer Karte – feste Termine ohne eigene Karte nehmen sie aus ihrem Ereignis. */
export function cardText(card: Pick<PlanCardView, 'id' | 'event'>): { title: string; text: string; risk?: string } {
  const eigen = content.cards[card.id];
  if (eigen) return { title: localize(eigen.title), text: localize(eigen.text), ...(eigen.risk ? { risk: localize(eigen.risk) } : {}) };
  const e = events.find((x) => x.id === card.event);
  return { title: e ? localize(e.title) : card.id, text: e ? localize(e.text) : '' };
}

/** Name der Wissensstufe (Gerücht, beritten, kartiert, Bohrbericht). */
export function levelLabel(level: KnowledgeLevel): string {
  return localize(content.levels[KNOWLEDGE_LEVEL_KEYS[level]]);
}

/** Was man über eine Zone hört (Stufe 0, statt einer Zahl). */
export function zoneWord(zone: string): string {
  const t: LocalizedText | undefined = content.zones[zone];
  return t ? localize(t) : zone;
}

/** Eine Zeile der Hinweisliste, z. B. „Runde 3: Sickerstelle am Bach (Ritt)“. */
export function clueLine(c: ClueView): string {
  const was = localize(c.seen ? content.clues[c.kind].seen : content.clues[c.kind].unseen);
  const wo = c.neighbour ? ` – nebenan auf ${c.neighbour}` : '';
  return `Runde ${c.round}: ${was}${wo} (${localize(content.sources[c.source])})`;
}
