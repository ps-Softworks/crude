// Lädt die Texte der Rivalen-Diplomatie aus content/diplomacy.yaml (4.10).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import diplomacyText from '../../content/diplomacy.yaml?raw';
import { parseDiplomacyContent } from '../sim/diplomacyContent';
import { formatContentError } from '../sim/eventContent';

const { content, errors } = parseDiplomacyContent('content/diplomacy.yaml', diplomacyText);
if (!content || errors.length > 0) throw new Error(errors.map(formatContentError).join('\n'));

export const diplomacyContent = content;
