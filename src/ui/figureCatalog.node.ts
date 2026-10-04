// Nur für Tests und Werkzeuge: liest content/figures.yaml von der Platte.
import { readFileSync } from 'node:fs';
import { parseFigureCatalog } from './figures';

export const figureCatalog = parseFigureCatalog('content/figures.yaml', readFileSync(new URL('../../content/figures.yaml', import.meta.url), 'utf8'));
