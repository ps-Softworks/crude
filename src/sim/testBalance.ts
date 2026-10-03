// Nur für Tests und Werkzeuge: lädt die echte content/balance.yaml samt Karte (content/map.yaml).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { parseGameData, type Balance } from './balance';

/** Rohe YAML-Daten von balance.yaml, mit der Karte unter world – für Tests, die einzelne Werte verbiegen. */
export function rawBalance(): Record<string, unknown> {
  const text = readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8');
  return { ...parse(text), world: rawMap() };
}

/** Rohe YAML-Daten von content/map.yaml. */
export function rawMap(): unknown {
  return parse(readFileSync(new URL('../../content/map.yaml', import.meta.url), 'utf8'));
}

export function loadBalance(): Balance {
  const text = readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8');
  return parseGameData(parse(text), rawMap());
}
