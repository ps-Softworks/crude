// Lädt content/figures.yaml für die Oberfläche (2.12).
import figuresText from '../../content/figures.yaml?raw';
import { parseFigures } from './figures';

export const figures = parseFigures('content/figures.yaml', figuresText);
