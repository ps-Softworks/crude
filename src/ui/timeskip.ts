// Lädt die Texte zum Zeitsprung aus content/timeskip.yaml (4.5).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import timeskipText from '../../content/timeskip.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseTimeskipContent } from '../sim/timeskip';

const { content, errors } = parseTimeskipContent('content/timeskip.yaml', timeskipText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const timeskipContent = content;
