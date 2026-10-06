// Lädt content/glossar.yaml für die Oberfläche (0.4.20+42). Geprüft wird in tools/checkContent.ts
// und im Test src/sim/glossary.test.ts; hier nur lesen.
import glossarText from '../../content/glossar.yaml?raw';
import { parseGlossary, sortedGlossary, type GlossaryEntry } from '../sim/glossary';

const geladen = parseGlossary('content/glossar.yaml', glossarText);
if (!geladen.content) throw new Error(`content/glossar.yaml: ${geladen.errors.map((e) => e.message).join(' ')}`);

/** Alle Begriffe, alphabetisch. */
export const glossary: readonly GlossaryEntry[] = sortedGlossary(geladen.content);

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return glossary.find((e) => e.id === id);
}
