// Prüfprogramm für Inhalte (2.1): liest alle Ereignis-Dateien und meldet Fehler
// mit Datei und Zeilennummer. Aufruf: npm run check:content
// Anderer Ordner: npm run check:content -- src/sim/__fixtures__/events
import { resolve } from 'node:path';
import { formatContentError, parseEventFiles } from '../src/sim/eventContent';
import { EVENTS_DIR, readEventFiles } from '../src/sim/testEvents';

const dir = process.argv[2] ? resolve(process.argv[2]) : EVENTS_DIR;
const files = readEventFiles(dir);
const { events, errors } = parseEventFiles(files);

if (errors.length > 0) {
  for (const error of errors) console.error(formatContentError(error));
  console.error(`\n${errors.length} Fehler in ${files.length} Datei(en). Inhalte nicht in Ordnung.`);
  process.exit(1);
}
const ohneEnglisch = events.filter((e) => e.title.en.trim() === '').length;
console.log(`Inhalte in Ordnung: ${events.length} Ereignisse in ${files.length} Datei(en).`);
if (ohneEnglisch > 0) console.log(`Hinweis: ${ohneEnglisch} Ereignisse haben noch keinen englischen Text.`);
