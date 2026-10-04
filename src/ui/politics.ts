// Lädt Parteinamen und Programme aus content/politics.yaml für die Oberfläche (4.2).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import politicsText from '../../content/politics.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parsePoliticsContent } from '../sim/politics';

const { content, errors } = parsePoliticsContent('content/politics.yaml', politicsText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const politicsContent = content;
