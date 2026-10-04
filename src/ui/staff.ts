// Lädt die Personaltexte aus content/staff.yaml für die Oberfläche (4.9).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import staffText from '../../content/staff.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseStaffContent } from '../sim/staffContent';

const { content, errors } = parseStaffContent('content/staff.yaml', staffText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const staffContent = content;
