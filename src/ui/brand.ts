// Lädt die Texte für Marke und Tankstellen aus content/brand.yaml (4.14).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import brandText from '../../content/brand.yaml?raw';
import { parseBrandContent } from '../sim/brandContent';
import { formatContentError } from '../sim/eventContent';

const { content, errors } = parseBrandContent('content/brand.yaml', brandText);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const brandContent = content;
