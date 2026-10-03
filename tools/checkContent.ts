// Prüfprogramm für Inhalte (2.1): liest alle Ereignis-Dateien und meldet Fehler
// mit Datei und Zeilennummer. Aufruf: npm run check:content
// Anderer Ordner: npm run check:content -- src/sim/__fixtures__/events
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkArcMarks, parseArcContent } from '../src/sim/arcs';
import { checkChapterMarks, parseChapterContent } from '../src/sim/chapter';
import { formatContentError, parseEventFiles } from '../src/sim/eventContent';
import { parseFamilyContent } from '../src/sim/family';
import { parseNewspaperContent } from '../src/sim/newspaper';
import { EVENTS_DIR, readEventFiles } from '../src/sim/testEvents';

const dir = process.argv[2] ? resolve(process.argv[2]) : EVENTS_DIR;
const files = readEventFiles(dir);
const parsed = parseEventFiles(files);
const { events } = parsed;
// Zeitung (2.6): Schlagzeilen gehören auch zu den Inhalten.
const zeitung = parseNewspaperContent(
  'content/newspaper.yaml',
  readFileSync(new URL('../content/newspaper.yaml', import.meta.url), 'utf8'),
);
// Familie (2.7): Zustandswörter und Sätze für den Familienbildschirm.
const familie = parseFamilyContent('content/family.yaml', readFileSync(new URL('../content/family.yaml', import.meta.url), 'utf8'));
// Story-Bögen (2.9): Ausgänge und ihre Merkzeichen.
const boegen = parseArcContent('content/arcs.yaml', readFileSync(new URL('../content/arcs.yaml', import.meta.url), 'utf8'));
const bogenMarks = boegen.content && parsed.errors.length === 0 ? checkArcMarks('content/arcs.yaml', boegen.content, events) : [];
// Kapitelende (2.11): Texte des Ergebnisbildschirms und Merkzeichen der Boni.
const kapitel = parseChapterContent('content/chapter.yaml', readFileSync(new URL('../content/chapter.yaml', import.meta.url), 'utf8'));
const kapitelMarks = kapitel.content && parsed.errors.length === 0 ? checkChapterMarks('content/chapter.yaml', kapitel.content, events) : [];
const errors = [...parsed.errors, ...zeitung.errors, ...familie.errors, ...boegen.errors, ...bogenMarks, ...kapitel.errors, ...kapitelMarks];

if (errors.length > 0) {
  for (const error of errors) console.error(formatContentError(error));
  console.error(`\n${errors.length} Fehler in ${files.length} Datei(en). Inhalte nicht in Ordnung.`);
  process.exit(1);
}
const ohneEnglisch = events.filter((e) => e.title.en.trim() === '').length;
console.log(`Inhalte in Ordnung: ${events.length} Ereignisse in ${files.length} Datei(en).`);
if (ohneEnglisch > 0) console.log(`Hinweis: ${ohneEnglisch} Ereignisse haben noch keinen englischen Text.`);
// Entwürfe (2.10a): Schlüsselszenen, die Philipp noch überarbeiten soll.
const entwuerfe = events.filter((e) => e.draft).map((e) => e.id);
if (entwuerfe.length > 0) console.log(`Entwürfe (draft: true): ${entwuerfe.length} – ${entwuerfe.join(', ')}`);
