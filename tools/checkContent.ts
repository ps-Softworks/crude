// Prüfprogramm für Inhalte (2.1): liest alle Ereignis-Dateien und meldet Fehler
// mit Datei und Zeilennummer. Aufruf: npm run check:content
// Anderer Ordner: npm run check:content -- src/sim/__fixtures__/events
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkArcMarks, parseArcContent } from '../src/sim/arcs';
// 4.14 Andockpunkt: Marke und Tankstellen.
import { checkBrandRefs, parseBrandContent } from '../src/sim/brandContent';
import { checkChapterMarks, parseChapterContent } from '../src/sim/chapter';
import { parseDiplomacyContent } from '../src/sim/diplomacyContent'; // 4.10 Andockpunkt
import { formatContentError, parseEventFiles } from '../src/sim/eventContent';
import { checkSystemEffects } from '../src/sim/eventSystems'; // 4.12
import { analyzeRelevance, checkRelevanceMarks, parseRelevanceContent, readMarks, simReadMarks } from '../src/sim/eventRelevance';
import { parseFamilyContent } from '../src/sim/family';
// 4.16 Andockpunkt
import { checkHallsteadContent, parseHallsteadContent } from '../src/sim/hallsteadContent';
import { checkKapitel3Content, parseKapitel3Content } from '../src/sim/kapitel3Content'; // 4.17 Andockpunkt
import { parseNewspaperContent } from '../src/sim/newspaper';
import { parseLawFiles } from '../src/sim/laws';
import { parsePoliticsContent } from '../src/sim/politics';
// 4.6 Andockpunkt: Texte der Raffinerie.
import { parseRefineryContent } from '../src/sim/refineryContent';
import { parseStocksContent } from '../src/sim/stocksContent'; // 4.8 Andockpunkt
import { checkStaffContent, parseStaffContent } from '../src/sim/staffContent'; // 4.9 Andockpunkt
// 4.15 Andockpunkt: Börse.
import { parseExchangeContent } from '../src/sim/exchangeContent';
import { loadBalance, readLawFiles } from '../src/sim/testBalance';
import { EVENTS_DIR, readEventFiles } from '../src/sim/testEvents';
import { parseTutorialContent } from '../src/sim/tutorial';
import { parseTimeskipContent } from '../src/sim/timeskip';
import { mapRefErrors } from '../src/sim/regions';
import { parseFigureCatalog } from '../src/ui/figures';
import { parseMapHints } from '../src/ui/tutorialMap';
import { visitorErrors } from '../src/ui/visitors';
// 4.7 Andockpunkt: Briefe der Fernleitungen.
import { parsePipelineContent } from '../src/sim/bigPipelineContent';
// 4.11 Andockpunkt: Texte für Schattenbuch (Ermittler) und Werkstatt (Forschung).
import { checkInvestigationContent, parseInvestigationContent } from '../src/sim/investigation';
import { parseResearchContent } from '../src/sim/research';
// Termine als Hauptwerkzeug (Etappe 1): Planungsbrett.
import { checkPlanContent, parsePlanContent } from '../src/sim/planContent';
import { checkNetwork } from '../src/sim/network';
import { planRefErrors } from '../src/sim/plans';

const dir = process.argv[2] ? resolve(process.argv[2]) : EVENTS_DIR;
const files = readEventFiles(dir);
const parsed = parseEventFiles(files);
const { events } = parsed;
// Zeitung (2.6): Schlagzeilen gehören auch zu den Inhalten.
const zeitung = parseNewspaperContent(
  'content/newspaper.yaml',
  readFileSync(new URL('../content/newspaper.yaml', import.meta.url), 'utf8'),
);
// Parteien (4.2): Namen und Programme für Wahlergebnis und Zeitung.
const politik = parsePoliticsContent('content/politics.yaml', readFileSync(new URL('../content/politics.yaml', import.meta.url), 'utf8'));
// Gesetze (4.3): jede Datei in content/laws/ ist ein Gesetz mit Bedingungen, Wirkung und Zeitungsmeldungen.
const gesetze = parseLawFiles(readLawFiles());
// Familie (2.7): Zustandswörter und Sätze für den Familienbildschirm.
const familie = parseFamilyContent('content/family.yaml', readFileSync(new URL('../content/family.yaml', import.meta.url), 'utf8'));
// Story-Bögen (2.9): Ausgänge und ihre Merkzeichen.
const boegen = parseArcContent('content/arcs.yaml', readFileSync(new URL('../content/arcs.yaml', import.meta.url), 'utf8'));
const bogenMarks = boegen.content && parsed.errors.length === 0 ? checkArcMarks('content/arcs.yaml', boegen.content, events) : [];
// Kapitelende (2.11): Texte des Ergebnisbildschirms und Merkzeichen der Boni.
const kapitel = parseChapterContent('content/chapter.yaml', readFileSync(new URL('../content/chapter.yaml', import.meta.url), 'utf8'));
const kapitelMarks = kapitel.content && parsed.errors.length === 0 ? checkChapterMarks('content/chapter.yaml', kapitel.content, events) : [];
// Zeitsprünge (4.5): Direktiven, Weichen, Chronik, Kapitel-2-Überschrift (4.12).
const sprung = parseTimeskipContent('content/timeskip.yaml', readFileSync(new URL('../content/timeskip.yaml', import.meta.url), 'utf8'));
// Einstieg (2.13): Hinweistexte des Tutorials.
const einstieg = parseTutorialContent('content/tutorial.yaml', readFileSync(new URL('../content/tutorial.yaml', import.meta.url), 'utf8'));
// Wirkung der Antworten (0.2.15+3): begründete Ausnahmen.
const wirkung = parseRelevanceContent('content/relevance.yaml', readFileSync(new URL('../content/relevance.yaml', import.meta.url), 'utf8'));
const wirkungMarks = wirkung.content && parsed.errors.length === 0 ? checkRelevanceMarks('content/relevance.yaml', wirkung.content, events) : [];
// 4.8 Andockpunkt: Aufsichtsrat, Strohmänner und Forderungen (Kapitel 2).
const aktien = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../content/stocks.yaml', import.meta.url), 'utf8'), loadBalance().stocks.board.seatsMax);
// Rivalen-Diplomatie (4.10): Texte der Pinnwand ab Kapitel 2. // 4.10 Andockpunkt
const diplomatie = parseDiplomacyContent('content/diplomacy.yaml', readFileSync(new URL('../content/diplomacy.yaml', import.meta.url), 'utf8'));
const errors = [...aktien.errors, ...diplomatie.errors, ...wirkung.errors, ...wirkungMarks, ...einstieg.errors, ...parsed.errors, ...zeitung.errors, ...politik.errors, ...gesetze.errors, ...familie.errors, ...boegen.errors, ...bogenMarks, ...kapitel.errors, ...kapitelMarks, ...sprung.errors];

// 4.12: Systemwirkungen der Ereignisse – Räte (content/stocks.yaml und Gäste aus balance.yaml), Gesetze und Techniken müssen es geben;
// jeder Gast braucht einen Namen in content/stocks.yaml → guests.
{
  const balance = loadBalance();
  const gaeste = Object.keys(balance.eventSystems.boardGuests);
  const raete = [...(aktien.content?.board.map((b) => b.id) ?? []), ...gaeste];
  if (parsed.errors.length === 0) errors.push(...checkSystemEffects('content/events', events, { boardIds: raete, laws: gesetze.laws, techs: balance.research.techs.map((t) => t.id), brandRegions: balance.brand.regions.map((r) => r.id), stocks: balance.exchange.stocks.map((x) => x.id), leverages: balance.exchange.margin.leverages }));
  for (const g of gaeste) if (aktien.content && !aktien.content.guests.some((x) => x.id === g)) errors.push({ file: 'content/stocks.yaml', line: 1, message: `guests: Der Gast „${g}“ aus balance.yaml (eventSystems.boardGuests) hat keinen Namen.` });
}

// 4.9 Andockpunkt – Personal: Namen, Merkmale und Wörter der Personalakten, passend zu balance.yaml (staff).
const personal = parseStaffContent('content/staff.yaml', readFileSync(new URL('../content/staff.yaml', import.meta.url), 'utf8'));
errors.push(...personal.errors);
if (personal.content) errors.push(...checkStaffContent('content/staff.yaml', personal.content, loadBalance()));

// 4.15 Andockpunkt: Börse – Namen der Aktien aus balance.yaml, Schlagzeilen, Briefe des Maklers.
const boerse = parseExchangeContent(
  'content/exchange.yaml',
  readFileSync(new URL('../content/exchange.yaml', import.meta.url), 'utf8'),
  loadBalance().exchange.stocks.map((s) => s.id),
);
errors.push(...boerse.errors);

// 4.17 Andockpunkt: Kapitel 3 – Texte für Seismik, Konsortium, Projekte und Stand, passend zu balance.yaml.
const kapitel3 = parseKapitel3Content('content/kapitel3.yaml', readFileSync(new URL('../content/kapitel3.yaml', import.meta.url), 'utf8'));
errors.push(...kapitel3.errors);
if (kapitel3.content) errors.push(...checkKapitel3Content('content/kapitel3.yaml', kapitel3.content, loadBalance()));

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
// 4.6 Andockpunkt: Raffinerie (content/refinery.yaml).
errors.push(...parseRefineryContent('content/refinery.yaml', readFileSync(new URL('../content/refinery.yaml', import.meta.url), 'utf8')).errors);
// 4.7 Andockpunkt: Fernleitungen (Kapitel 2) – Briefe in content/pipelines.yaml.
errors.push(...parsePipelineContent('content/pipelines.yaml', readFileSync(new URL('../content/pipelines.yaml', import.meta.url), 'utf8')).errors);
// 4.11 Andockpunkt: Ermittler und Forschung (ab Kapitel 2).
{
  const balance = loadBalance();
  const ermittler = parseInvestigationContent('content/investigation.yaml', readFileSync(new URL('../content/investigation.yaml', import.meta.url), 'utf8'));
  errors.push(...ermittler.errors);
  if (ermittler.content && parsed.errors.length === 0) errors.push(...checkInvestigationContent('content/investigation.yaml', ermittler.content, balance, events));
  errors.push(...parseResearchContent('content/research.yaml', readFileSync(new URL('../content/research.yaml', import.meta.url), 'utf8'), balance).errors);
}
// 4.14 Andockpunkt: Marke und Tankstellen – Texte und Querprüfung gegen balance.yaml (brand).
const marke = parseBrandContent('content/brand.yaml', readFileSync(new URL('../content/brand.yaml', import.meta.url), 'utf8'));
errors.push(...marke.errors);
if (marke.content) errors.push(...checkBrandRefs('content/brand.yaml', marke.content, loadBalance()));
// 4.16 Andockpunkt: Texte der Hallstead-Mappe und ob sie zu balance.yaml passen.
const hallstead = parseHallsteadContent('content/hallstead.yaml', readFileSync(new URL('../content/hallstead.yaml', import.meta.url), 'utf8'));
errors.push(...hallstead.errors);
if (hallstead.content) errors.push(...checkHallsteadContent('content/hallstead.yaml', hallstead.content, loadBalance()));
// Termine als Hauptwerkzeug (Etappe 1): Texte des Planungsbretts, passend zu balance.yaml (plans.cards) und den festen Terminen.
{
  const balance = loadBalance();
  const brett = parsePlanContent('content/plans.yaml', readFileSync(new URL('../content/plans.yaml', import.meta.url), 'utf8'));
  errors.push(...brett.errors);
  if (brett.content) errors.push(...checkPlanContent('content/plans.yaml', brett.content, balance, events.map((e) => e.id)));
  // 0.4.20+42: Netzwerk – jede Karte hat eine Stelle, jede Stelle ist erreichbar.
  for (const message of checkNetwork(balance)) errors.push({ file: 'content/balance.yaml', line: 1, message });
  if (parsed.errors.length === 0) for (const m of planRefErrors(balance, events)) errors.push({ file: 'content/balance.yaml', line: 1, message: m });
}
if (errors.length > 0) {
  for (const error of errors) console.error(formatContentError(error));
  console.error(`\n${errors.length} Fehler in ${files.length} Datei(en). Inhalte nicht in Ordnung.`);
  process.exit(1);
}
const ohneEnglisch = events.filter((e) => e.title.en.trim() === '').length;
console.log(`Inhalte in Ordnung: ${events.length} Ereignisse in ${files.length} Datei(en).`);
console.log(`Gesetze: ${gesetze.laws.length} – ${gesetze.laws.map((l) => l.name.de).join(', ')}.`);
console.log(`Auftritte: ${events.filter((e) => e.visitor).length} Besuche am Schreibtisch, ${events.filter((e) => e.tableau).length} Vollbild-Szenen.`);
if (ohneEnglisch > 0) console.log(`Hinweis: ${ohneEnglisch} Ereignisse haben noch keinen englischen Text.`);
// Entwürfe (2.10a): Schlüsselszenen, die Philipp noch überarbeiten soll.
const entwuerfe = events.filter((e) => e.draft).map((e) => e.id);
if (entwuerfe.length > 0) console.log(`Entwürfe (draft: true): ${entwuerfe.length} – ${entwuerfe.join(', ')}`);
if (sprung.content?.draft) console.log('Entwurf: content/timeskip.yaml (Zeitsprung-Texte, draft: true)');
const gesetzEntwuerfe = gesetze.laws.filter((l) => l.draft).map((l) => l.id);
if (gesetzEntwuerfe.length > 0) console.log(`Gesetze als Entwurf: ${gesetzEntwuerfe.join(', ')}`);
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
