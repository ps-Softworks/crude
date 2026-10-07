// Pleitewege (0.4.20+47, Sitzung „bot trainer“): Welche Auswege fangen Pleiten ab? Zählt je Strategie und Kapitel
// Fristen, Notverkäufe, Vale-Rettungen, Tank-Notverkäufe am Kapitelende und Pleiten (aus den Logzeilen), in Kapitel 1
// getrennt nach Welten mit/ohne Kreditkrise. Läuft auf mehreren Kernen (KAMPAGNE_JOBS, Standard 7), schreibt nichts.
// Aufruf: npx tsx tools/pleitewege.ts <seeds> <strategie,...> ['<balance-änderung als JSON>' | @datei.json]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { creditCrisisInChapter, playGame, type Strategy } from '../src/sim/bots';
import { campaignSeeds, playCampaign } from '../src/sim/campaignBots';
import type { GameState } from '../src/sim/game';
import { parseStocksContent } from '../src/sim/stocksContent';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { loadKapitel3Texts } from '../src/sim/testKapitel3';
import { mergeBalance } from './kampagnenParallel';

const worker = process.argv[2] === '--worker';
const [von, bis, strats, override = '{}'] = worker ? process.argv.slice(3) : ['0', ...process.argv.slice(2)];
const balance = mergeBalance(loadBalance(), JSON.parse(override.startsWith('@') ? readFileSync(override.slice(1), 'utf8') : override));
const catalog = loadEvents();
const stocks = parseStocksContent('content/stocks.yaml', readFileSync('content/stocks.yaml', 'utf8'), balance.stocks.board.seatsMax);
const texts = { stocksBoard: stocks.content!.board, kapitel3: loadKapitel3Texts() };
const seeds = campaignSeeds(balance, Number(bis)).slice(Number(von));

type Zähler = Record<string, number>;
const out: Record<string, Zähler> = {};
const inc = (strat: string, kap: number, key: string) => {
  const k = `${strat}|K${kap}`;
  out[k] = out[k] ?? {};
  out[k][key] = (out[k][key] ?? 0) + 1;
};

function scan(strat: string, kap: number, lines: readonly string[]) {
  let inFrist = false;
  let verkauft = false;
  let vale = false;
  for (const l of lines) {
    if (l.includes('niemand leiht mehr. Die Bank gibt')) {
      inFrist = true; verkauft = false; vale = false;
      inc(strat, kap, 'frist');
    } else if (inFrist && (l.includes(' in der Not an Bullard') || /verkauft .* für [\d.]+ \$\.$/.test(l))) {
      if (!verkauft) inc(strat, kap, 'fristMitNotverkauf');
      verkauft = true;
      inc(strat, kap, 'notverkaufStück');
    } else if (l.includes('Die Herren aus Hallstead zahlen')) {
      vale = true;
      inc(strat, kap, 'vale');
    } else if (l.includes('Die Kasse stimmt wieder')) {
      if (inFrist) inc(strat, kap, vale ? 'gerettetVale' : verkauft ? 'gerettetNotverkauf' : 'gerettetSelbst');
      inFrist = false;
    } else if (l.includes('verkauft den Tank zum Notpreis')) {
      inc(strat, kap, 'tankNotverkauf');
      inFrist = false;
    } else if (l.includes('ist pleite')) {
      inc(strat, kap, 'pleite');
      if (vale) inc(strat, kap, 'pleiteNachVale');
      inFrist = false;
    }
  }
}

if (!worker) {
  const jobs = Number(process.env.KAMPAGNE_JOBS) || 7;
  const n = Number(bis);
  const step = Math.ceil(n / jobs);
  const teile = await Promise.all(Array.from({ length: Math.ceil(n / step) }, (_, i) => new Promise<Record<string, Zähler>>((ok, fail) => {
    let text = '';
    const p = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', String(i * step), String(Math.min(n, (i + 1) * step)), strats, override], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => (text += d));
    p.on('close', (code) => (code === 0 ? ok(JSON.parse(text)) : fail(new Error(`Worker ${i}: Exit ${code}`))));
  })));
  const t: Record<string, Zähler> = {};
  for (const o of teile) for (const k in o) for (const x in o[k]) (t[k] ??= {})[x] = (t[k][x] ?? 0) + o[k][x];
  console.log(`# Pleitewege ${n} Seeds ${override}`);
  for (const k of Object.keys(t).sort()) console.log(k.padEnd(18), JSON.stringify(t[k]));
  process.exit(0);
}

for (const seed of seeds) {
  for (const strat of strats.split(',') as Strategy[]) {
    const k1 = playGame(seed, balance, strat, catalog).state;
    inc(strat, 1, 'partien');
    scan(strat, 1, k1.log);
    const kr = creditCrisisInChapter(seed, balance) ? 'krise' : 'ruhig';
    inc(strat, 1, `partien_${kr}`);
    if (k1.ending === 'pleite') inc(strat, 1, `pleite_${kr}`);
    if (k1.log.some((l) => l.includes('Die Herren aus Hallstead zahlen'))) inc(strat, 1, `vale_${kr}`);
    if (k1.ending === 'pleite') inc(strat, 1, 'endePleite');
    if (k1.ending !== 'kapitel') continue;
    const letzte = new Map<number, GameState>();
    playCampaign(seed, balance, strat, catalog, texts, undefined, k1, (_v, n) => letzte.set(n.chapter, n));
    const gesehen = new Set(k1.log);
    for (const kap of [...letzte.keys()].sort()) {
      const s = letzte.get(kap)!;
      inc(strat, kap, 'partien');
      if (s.ending === 'pleite') inc(strat, kap, 'endePleite');
      scan(strat, kap, s.log.filter((l) => !gesehen.has(l)));
      for (const l of s.log) gesehen.add(l);
    }
  }
}
console.log(JSON.stringify(out));
