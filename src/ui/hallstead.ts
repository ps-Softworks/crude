// Lädt die Texte der Hallstead-Mappe aus content/hallstead.yaml (4.16).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import hallsteadText from '../../content/hallstead.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseHallsteadContent } from '../sim/hallsteadContent';

const { content, errors } = parseHallsteadContent('content/hallstead.yaml', hallsteadText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const hallsteadContent = content;
