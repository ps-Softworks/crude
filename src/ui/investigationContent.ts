// Lädt die Texte des Schattenbuchs aus content/investigation.yaml (4.11).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import investigationText from '../../content/investigation.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseInvestigationContent } from '../sim/investigation';

const { content, errors } = parseInvestigationContent('content/investigation.yaml', investigationText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const investigationContent = content;
