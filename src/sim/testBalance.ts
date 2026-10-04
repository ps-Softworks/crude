// Nur für Tests und Werkzeuge: lädt die echte content/balance.yaml samt Karte (content/map.yaml).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { readdirSync } from 'node:fs';
import { parseGameData, type Balance } from './balance';
import { loadLawCatalog, type LawDef } from './laws';

/** Rohe YAML-Daten von balance.yaml, mit der Karte unter world – für Tests, die einzelne Werte verbiegen. */
export function rawBalance(): Record<string, unknown> {
  const text = readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8');
  return { ...parse(text), world: rawMap() };
}

/** Rohe YAML-Daten von content/map.yaml. */
export function rawMap(): unknown {
  return parse(readFileSync(new URL('../../content/map.yaml', import.meta.url), 'utf8'));
}

/** Gesetzesdateien aus content/laws/ (4.3), mit Pfad relativ zum Projekt. */
export function readLawFiles(): { file: string; text: string }[] {
  const dir = new URL('../../content/laws/', import.meta.url);
  return readdirSync(dir)
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .sort()
    .map((n) => ({ file: `content/laws/${n}`, text: readFileSync(new URL(n, dir), 'utf8') }));
}

/** Der echte Gesetzeskatalog. */
export function loadLaws(): LawDef[] {
  return loadLawCatalog(readLawFiles());
}

export function loadBalance(): Balance {
  const text = readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8');
  return parseGameData(parse(text), rawMap(), loadLaws());
}
