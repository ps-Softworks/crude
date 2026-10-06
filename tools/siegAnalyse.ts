// Siegquoten-Analyse (Sitzung „bot runner“, 0.4.20+15): spielt die Kampagnen wie npm run kampagne und schreibt die
// Rohergebnisse je Saat als JSON – zum Auswerten, wer in welchen Welten gewinnt (tools/siegAuswertung.ts).
// Aufruf: npx tsx tools/siegAnalyse.ts <seeds> <ausgabe.json> ['<balance-änderung als JSON>' | @datei]
import { readFileSync, writeFileSync } from 'node:fs';
import { runCampaignSeedsParallel } from './kampagnenParallel';

const [seedsText = '200', ausgabe = 'sieg.json', overrideArg = '{}'] = process.argv.slice(2);
const override = overrideArg.startsWith('@') ? readFileSync(overrideArg.slice(1), 'utf8') : overrideArg;
const start = Date.now();
const roh = await runCampaignSeedsParallel(Number(seedsText) || 200, Number(process.env.KAMPAGNE_JOBS) || 7, override);
writeFileSync(ausgabe, JSON.stringify(roh));
console.log(`${roh.length} Saaten in ${((Date.now() - start) / 1000).toFixed(0)} s → ${ausgabe}`);
