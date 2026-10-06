// Kampagnen-Variante (Sitzung „bot runner“): spielt die Kampagnen-Bots mit Balance-Änderungen im Speicher und druckt
// Zielwerte und Übersicht – zum Justieren, schreibt nichts. Läuft auf mehreren Kernen (KAMPAGNE_JOBS, Standard 7).
// Aufruf: npx tsx tools/kampagneVariante.ts <name> <seeds> '<balance-änderung als JSON>'
//   z. B. npx tsx tools/kampagneVariante.ts k2-450 200 '{"chapter":{"chapter2":{"goalValue":450000}}}'
// Auf dem PC ohne innere Anführungszeichen im Befehl: JSON aus einer Datei mit @pfad (tools/varianten/*.json).
import { readFileSync } from 'node:fs';
import { campaignTables, checkCampaignTargets } from '../src/sim/campaignBots';
import { loadBalance } from '../src/sim/testBalance';
import { mergeBalance, runCampaignParallel } from './kampagnenParallel';

const [name = 'variante', seedsText = '200', overrideArg = '{}'] = process.argv.slice(2);
const override = overrideArg.startsWith('@') ? readFileSync(overrideArg.slice(1), 'utf8') : overrideArg;
const games = Number(seedsText) || 200;
const balance = mergeBalance(loadBalance(), JSON.parse(override));
const start = Date.now();
const report = await runCampaignParallel(games, Number(process.env.KAMPAGNE_JOBS) || 7, override);
const t = campaignTables(report);
const zeilen = checkCampaignTargets(report, balance).map((x) => `${x.ok ? 'ok  ' : 'NEIN'} ${x.label}: ${typeof x.value === 'number' ? x.value.toFixed(3) : x.value}`);
console.log([`# ${name} (${games} Kampagnen, ${((Date.now() - start) / 1000).toFixed(0)} s) ${override.trim()}`, ...zeilen, '', t.overview, '', t.chapters, ''].join('\n'));
