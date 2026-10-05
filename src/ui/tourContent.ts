// Lädt content/rundgang.yaml (0.2.15+10), rundgang-k2.yaml (0.4.20+2) und rundgang-k3.yaml (0.4.20+3) für die Oberfläche.
import tourText from '../../content/rundgang.yaml?raw';
import tourTextK2 from '../../content/rundgang-k2.yaml?raw';
import tourTextK3 from '../../content/rundgang-k3.yaml?raw';
import { parseTour } from './tour';

export const tourSteps = parseTour('content/rundgang.yaml', tourText);
export const tourStepsK2 = parseTour('content/rundgang-k2.yaml', tourTextK2);
export const tourStepsK3 = parseTour('content/rundgang-k3.yaml', tourTextK3);
