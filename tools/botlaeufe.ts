// Bot-Läufe (Schritt 1.14): spielt je Strategie balance.bots.games Partien ohne
// Grafik, druckt die Tabelle und schreibt sie nach docs/botlaeufe.md.
// Aufruf: npm run bots
import { readFileSync, writeFileSync } from 'node:fs';
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
const md = `# Bot-Läufe

Stand: ${datum} · Version ${version}

- Partien je Strategie: ${balance.bots.games.toLocaleString('de-DE')}
- Seeds: \`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${balance.bots.games - 1}\` (für jede Strategie dieselben)
- Erzeugt mit \`npm run bots\` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

${table}

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, nimmt nie einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer, pachtet, solange Kasse und Bankrahmen reichen, leiht fehlendes Geld.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall.

Hinweis: Die Zahlen in content/balance.yaml sind Platzhalter, die Balance folgt in 1.15.
`;
writeFileSync(new URL('docs/botlaeufe.md', root), md);
console.log('Geschrieben: docs/botlaeufe.md');
