// Lädt die Schlagzeilen aus content/newspaper.yaml für die Oberfläche (2.6).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import newspaperText from '../../content/newspaper.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseNewspaperContent } from '../sim/newspaper';

const { content, errors } = parseNewspaperContent('content/newspaper.yaml', newspaperText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const newspaperContent = content;
