// Lädt die Ereignisse aus content/events/ für die Oberfläche (2.1). Kaputte
// Dateien halten das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import { loadEventCatalog } from '../sim/eventContent';

const raw = import.meta.glob('../../content/events/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const events = loadEventCatalog(
  Object.keys(raw)
    .sort()
    .map((path) => ({ file: path.replace('../../', ''), text: raw[path] })),
);
