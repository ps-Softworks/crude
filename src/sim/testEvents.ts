// Nur für Tests und Werkzeuge: liest Ereignis-Dateien von der Platte.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEventCatalog } from './eventContent';
import type { EventDef } from './events';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Alle .yaml-Dateien eines Ordners, alphabetisch, mit Pfad relativ zum Projekt. */
export function readEventFiles(dir: string): { file: string; text: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      return { file: relative(ROOT, path) || path, text: readFileSync(path, 'utf8') };
    });
}

export const EVENTS_DIR = join(ROOT, 'content/events');

/** Die echten Ereignisse aus content/events/. */
export function loadEvents(): EventDef[] {
  return loadEventCatalog(readEventFiles(EVENTS_DIR));
}
