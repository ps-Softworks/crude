// Lädt content/tester.yaml für die Oberfläche (Tester-Build, 1.16).
import { parse } from 'yaml';
import testerText from '../../content/tester.yaml?raw';
import { parseTesterConfig } from './testerConfig';

export const tester = parseTesterConfig(parse(testerText));
