// Nur für Tests und Werkzeuge: liest Ereignis-Dateien von der Platte.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARC_IDS, parseArcContent } from './arcs';
import type { Balance } from './balance';
import { parseChapterContent } from './chapter';
import { loadEventCatalog } from './eventContent';
import { parseRelevanceContent, readMarks, simReadMarks } from './eventRelevance';
import type { EventDef } from './events';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Alle .yaml-Dateien eines Ordners, alphabetisch, mit Pfad relativ zum Projekt (immer mit „/“, auch unter Windows). */
export function readEventFiles(dir: string): { file: string; text: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      return { file: (relative(ROOT, path) || path).split(sep).join('/'), text: readFileSync(path, 'utf8') };
    });
}

export const EVENTS_DIR = join(ROOT, 'content/events');

/** Die echten Ereignisse aus content/events/. */
export function loadEvents(): EventDef[] {
  return loadEventCatalog(readEventFiles(EVENTS_DIR));
}

/**
 * Wirkung der Antworten (0.2.15+3): alle Merkzeichen, die etwas abfragt – Ereignisse,
 * Story-Bögen (content/arcs.yaml), Kapitelende (content/chapter.yaml) und die Simulation.
 */
export function loadReadMarks(events: readonly EventDef[], balance: Balance): Set<string> {
  const arcs = parseArcContent('content/arcs.yaml', readFileSync(join(ROOT, 'content/arcs.yaml'), 'utf8')).content;
  const chapter = parseChapterContent('content/chapter.yaml', readFileSync(join(ROOT, 'content/chapter.yaml'), 'utf8')).content;
  const extra = [
    ...simReadMarks(balance),
    ...(arcs ? ARC_IDS.flatMap((id) => arcs[id].outcomes.flatMap((o) => o.any)) : []),
    ...(chapter ? chapter.bonus.transport.any : []),
  ];
  return readMarks(events, extra);
}

/** Begründete Ausnahmen (0.2.15+3): Merkzeichen für spätere Kapitel aus content/relevance.yaml. */
export function loadLaterMarks(): Set<string> {
  const content = parseRelevanceContent('content/relevance.yaml', readFileSync(join(ROOT, 'content/relevance.yaml'), 'utf8')).content;
  return new Set((content?.later ?? []).map((l) => l.mark));
}
