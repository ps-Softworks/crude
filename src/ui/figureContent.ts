// Lädt content/figures.yaml für die Oberfläche (2.12; Namen ab 0.2.15+10).
import figuresText from '../../content/figures.yaml?raw';
import { parseFigureCatalog } from './figures';

export const figureCatalog = parseFigureCatalog('content/figures.yaml', figuresText);
export const figures = figureCatalog.forms;
