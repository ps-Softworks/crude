// Ein Teil der Kampagnen-Bots (0.4.20+6, aufgerufen von tools/kampagnenParallel.ts):
// node --import tsx tools/kampagnenWorker.ts <von> <bis> <ausgabe.json> [balance-änderung-als-json]
// Spielt die Seeds von..bis-1 und schreibt die Ergebnisse als JSON; je fertiger Saat ein „+“ auf stderr.
import { readFileSync, writeFileSync } from 'node:fs';
import { campaignSeeds, playCampaignSeed } from '../src/sim/campaignBots';
import { parseStocksContent } from '../src/sim/stocksContent';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { loadKapitel3Texts } from '../src/sim/testKapitel3';
import { mergeBalance } from './kampagnenParallel';

const [von, bis, ausgabe, override] = process.argv.slice(2);
const balance = mergeBalance(loadBalance(), JSON.parse(override ?? '{}'));
const catalog = loadEvents();
const stocks = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax);
if (!stocks.content) throw new Error('content/stocks.yaml lässt sich nicht lesen.');
const texts = { stocksBoard: stocks.content.board, kapitel3: loadKapitel3Texts() };
const seeds = campaignSeeds(balance, Number(bis)).slice(Number(von));
const ergebnisse = seeds.map((seed) => {
  const r = playCampaignSeed(seed, balance, catalog, texts);
  process.stderr.write('+\n');
  return r;
});
writeFileSync(ausgabe, JSON.stringify(ergebnisse));
