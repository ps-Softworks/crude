// Lädt die Texte zum Ende „Ein Feuer in der Nacht“ aus content/feuer.yaml (B3).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import feuerText from '../../content/feuer.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseFeuerContent } from '../sim/feuer';

const { content, errors } = parseFeuerContent('content/feuer.yaml', feuerText);
if (!content || errors.length > 0) throw new Error(errors.map(formatContentError).join('\n'));

export const feuerContent = content;
