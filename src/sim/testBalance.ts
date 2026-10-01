// Nur für Tests: lädt die echte content/balance.yaml.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { parseBalance, type Balance } from './balance';

export function loadBalance(): Balance {
  const text = readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8');
  return parseBalance(parse(text));
}
