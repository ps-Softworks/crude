// Bot-Läufe (Schritt 1.14): spielt je Strategie balance.bots.games Partien ohne
// Grafik, druckt die Tabelle und schreibt sie nach docs/botlaeufe.md.
// Aufruf: npm run bots
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { parseBalance } from '../src/sim/balance';
import { botTable, runBots } from '../src/sim/bots';

const root = new URL('../', import.meta.url);
const balance = parseBalance(parse(readFileSync(new URL('content/balance.yaml', root), 'utf8')));
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

const start = Date.now();
const rows = runBots(balance);
const table = botTable(rows);
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

console.log(table);
console.log(`\n${balance.bots.games} Partien je Strategie in ${sekunden} s.`);

const datum = new Date().toISOString().slice(0, 10);
// Alles ab "## Justierung" ist von Hand geschrieben und bleibt beim Neuschreiben stehen.
const ziel = new URL('docs/botlaeufe.md', root);
const alt = existsSync(ziel) ? readFileSync(ziel, 'utf8') : '';
const handTeil = alt.includes('\n## Justierung') ? alt.slice(alt.indexOf('\n## Justierung')) : '';
const md = `# Bot-Läufe

Stand: ${datum} · Version ${version}

- Partien je Strategie: ${balance.bots.games.toLocaleString('de-DE')}
- Seeds: \`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${balance.bots.games - 1}\` (für jede Strategie dieselben)
- Erzeugt mit \`npm run bots\` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

${table}

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall.
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt.
${handTeil}`;
writeFileSync(ziel, md);
console.log('Geschrieben: docs/botlaeufe.md');
