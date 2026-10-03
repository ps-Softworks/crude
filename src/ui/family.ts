// Lädt die Familientexte aus content/family.yaml für die Oberfläche (2.7).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import familyText from '../../content/family.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseFamilyContent } from '../sim/family';

const { content, errors } = parseFamilyContent('content/family.yaml', familyText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const familyContent = content;
