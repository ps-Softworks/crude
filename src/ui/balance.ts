// Lädt die Spielzahlen aus content/balance.yaml für die Oberfläche.
import { parse } from 'yaml';
import balanceText from '../../content/balance.yaml?raw';
import { parseBalance } from '../sim/balance';

export const balance = parseBalance(parse(balanceText));
