// Lädt die Spielzahlen aus content/balance.yaml, die Karte aus content/map.yaml und die Gesetze aus content/laws/ für die Oberfläche.
import { parse } from 'yaml';
import balanceText from '../../content/balance.yaml?raw';
import mapText from '../../content/map.yaml?raw';
import { parseGameData } from '../sim/balance';
import { loadLawCatalog } from '../sim/laws';

// Gesetze (4.3): jede Datei in content/laws/ ist ein Gesetz.
const lawFiles = import.meta.glob('../../content/laws/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const laws = loadLawCatalog(Object.keys(lawFiles).map((path) => ({ file: path.replace('../../', ''), text: lawFiles[path] })));

export const balance = parseGameData(parse(balanceText), parse(mapText), laws);
