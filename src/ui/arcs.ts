// Lädt die Story-Bögen aus content/arcs.yaml für die Oberfläche (2.9).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import arcsText from '../../content/arcs.yaml?raw';
import { checkArcMarks, parseArcContent } from '../sim/arcs';
import { formatContentError } from '../sim/eventContent';
import { events } from './events';

const { content, errors } = parseArcContent('content/arcs.yaml', arcsText);
const alle = content ? [...errors, ...checkArcMarks('content/arcs.yaml', content, events)] : errors;
if (!content || alle.length > 0) throw new Error(alle.map(formatContentError).join('\n'));

export const arcContent = content;
