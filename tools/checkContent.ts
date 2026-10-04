// Prüfprogramm für Inhalte (2.1): liest alle Ereignis-Dateien und meldet Fehler
// mit Datei und Zeilennummer. Aufruf: npm run check:content
// Anderer Ordner: npm run check:content -- src/sim/__fixtures__/events
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkArcMarks, parseArcContent } from '../src/sim/arcs';
import { checkChapterMarks, parseChapterContent } from '../src/sim/chapter';
import { formatContentError, parseEventFiles } from '../src/sim/eventContent';
import { analyzeRelevance, checkRelevanceMarks, parseRelevanceContent, readMarks, simReadMarks } from '../src/sim/eventRelevance';
import { parseFamilyContent } from '../src/sim/family';
import { parseNewspaperContent } from '../src/sim/newspaper';
import { loadBalance } from '../src/sim/testBalance';
import { EVENTS_DIR, readEventFiles } from '../src/sim/testEvents';
import { parseTutorialContent } from '../src/sim/tutorial';
import { mapRefErrors } from '../src/sim/regions';
import { parseFigureCatalog } from '../src/ui/figures';
import { parseMapHints } from '../src/ui/tutorialMap';
import { visitorErrors } from '../src/ui/visitors';
// 4.7 Andockpunkt: Briefe der Fernleitungen.
import { parsePipelineContent } from '../src/sim/bigPipelineContent';

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
// Einstieg (2.13): Hinweistexte des Tutorials.
const einstieg = parseTutorialContent('content/tutorial.yaml', readFileSync(new URL('../content/tutorial.yaml', import.meta.url), 'utf8'));
// Wirkung der Antworten (0.2.15+3): begründete Ausnahmen.
const wirkung = parseRelevanceContent('content/relevance.yaml', readFileSync(new URL('../content/relevance.yaml', import.meta.url), 'utf8'));
const wirkungMarks = wirkung.content && parsed.errors.length === 0 ? checkRelevanceMarks('content/relevance.yaml', wirkung.content, events) : [];
const errors = [...wirkung.errors, ...wirkungMarks, ...einstieg.errors, ...parsed.errors, ...zeitung.errors, ...familie.errors, ...boegen.errors, ...bogenMarks, ...kapitel.errors, ...kapitelMarks];

// Karte (0.2.15+5): ranch und unlocks in den Ereignissen müssen auf content/map.yaml zeigen.
const karte = parsed.errors.length === 0 ? mapRefErrors(events, loadBalance().world) : [];
for (const m of karte) errors.push({ file: 'content/map.yaml', line: 1, message: m });
// Besucher (0.2.15+10): „visitor“ in den Ereignissen muss auf eine Figur mit Namen in content/figures.yaml zeigen.
try {
  const figuren = parseFigureCatalog('content/figures.yaml', readFileSync(new URL('../content/figures.yaml', import.meta.url), 'utf8'));
  if (parsed.errors.length === 0) for (const m of visitorErrors(events, figuren)) errors.push({ file: 'content/figures.yaml', line: 1, message: m });
} catch (e) {
  errors.push({ file: 'content/figures.yaml', line: 1, message: (e as Error).message });
}
// Einstieg auf der Karte (0.2.15+11): Block „onMap“ in content/tutorial.yaml.
try {
  parseMapHints('content/tutorial.yaml', readFileSync(new URL('../content/tutorial.yaml', import.meta.url), 'utf8'));
} catch (e) {
  errors.push({ file: 'content/tutorial.yaml', line: 1, message: (e as Error).message });
}
// 4.7 Andockpunkt: Fernleitungen (Kapitel 2) – Briefe in content/pipelines.yaml.
errors.push(...parsePipelineContent('content/pipelines.yaml', readFileSync(new URL('../content/pipelines.yaml', import.meta.url), 'utf8')).errors);
if (errors.length > 0) {
  for (const error of errors) console.error(formatContentError(error));
  console.error(`\n${errors.length} Fehler in ${files.length} Datei(en). Inhalte nicht in Ordnung.`);
  process.exit(1);
}
const ohneEnglisch = events.filter((e) => e.title.en.trim() === '').length;
console.log(`Inhalte in Ordnung: ${events.length} Ereignisse in ${files.length} Datei(en).`);
console.log(`Auftritte: ${events.filter((e) => e.visitor).length} Besuche am Schreibtisch, ${events.filter((e) => e.tableau).length} Vollbild-Szenen.`);
if (ohneEnglisch > 0) console.log(`Hinweis: ${ohneEnglisch} Ereignisse haben noch keinen englischen Text.`);
// Entwürfe (2.10a): Schlüsselszenen, die Philipp noch überarbeiten soll.
const entwuerfe = events.filter((e) => e.draft).map((e) => e.id);
if (entwuerfe.length > 0) console.log(`Entwürfe (draft: true): ${entwuerfe.length} – ${entwuerfe.join(', ')}`);
// Wirkung der Antworten (0.2.15+3): Zusammenfassung; die Liste zeigt npm run check:events.
if (boegen.content && kapitel.content && wirkung.content) {
  const balance = loadBalance();
  const gelesen = readMarks(events, [
    ...simReadMarks(balance),
    ...Object.values(boegen.content).flatMap((a) => a.outcomes.flatMap((o) => o.any)),
    ...kapitel.content.bonus.transport.any,
  ]);
  const bericht = analyzeRelevance(events, gelesen, balance, new Set(wirkung.content.later.map((l) => l.mark)));
  if (bericht.weak.length > 0) {
    console.log(`Hinweis: ${bericht.weak.length} schwache Antworten (zu wenig Wirkung oder Merkzeichen ohne Folge) – Liste: npm run check:events`);
  } else console.log(`Wirkung: alle ${bericht.choices.length} Antworten spürbar (Schwelle ${bericht.threshold} $).`);
}
