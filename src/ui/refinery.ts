// Lädt die Texte der Raffinerie aus content/refinery.yaml für die Oberfläche (4.6).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import refineryYaml from '../../content/refinery.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseRefineryContent, refineryText, type RefineryTextKey } from '../sim/refineryContent';

const { content, errors } = parseRefineryContent('content/refinery.yaml', refineryYaml);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const refineryContent = content;

/** Kurzform: Text aus content/refinery.yaml mit gefüllten Platzhaltern. */
export function rt(key: RefineryTextKey, values: Record<string, string> = {}): string {
  return refineryText(content!, key, values);
}
