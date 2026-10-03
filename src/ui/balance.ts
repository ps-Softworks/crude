// Lädt die Spielzahlen aus content/balance.yaml und die Karte aus content/map.yaml für die Oberfläche.
import { parse } from 'yaml';
import balanceText from '../../content/balance.yaml?raw';
import mapText from '../../content/map.yaml?raw';
import { parseGameData } from '../sim/balance';

export const balance = parseGameData(parse(balanceText), parse(mapText));
