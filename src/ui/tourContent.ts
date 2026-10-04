// Lädt content/rundgang.yaml für die Oberfläche (0.2.15+10).
import tourText from '../../content/rundgang.yaml?raw';
import { parseTour } from './tour';

export const tourSteps = parseTour('content/rundgang.yaml', tourText);
