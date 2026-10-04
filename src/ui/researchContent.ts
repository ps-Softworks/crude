// Lädt die Texte der Werkstatt-Mappe aus content/research.yaml (4.11).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import researchText from '../../content/research.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseResearchContent } from '../sim/research';
import { balance } from './balance';

const { content, errors } = parseResearchContent('content/research.yaml', researchText, balance);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const researchContent = content;
