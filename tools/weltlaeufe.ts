// Weltläufe (Schritt 4.1): simuliert das Weltmodell über viele Seeds und eine
// ganze Kampagne (73 Spieljahre) ohne Spieler, druckt Verläufe und Krisenzahlen
// und schreibt sie nach docs/weltmodell.md (der Teil ab der Markierung bleibt stehen).
// Aufruf: npm run welt   (optional: npm run welt -- 500   für 500 Seeds)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadBalance } from '../src/sim/testBalance';
import { advanceWorld, newWorld, worldPriceFactor, worldRateAdd, type WorldNews } from '../src/sim/world';
import {
  CAMPAIGN_ROUNDS,
  CAMPAIGN_TARGETS,
  crisisStats,
  extremes,
  percentile,
  ROUNDS_PER_YEAR,
  runWorlds,
  TRACKED,
  TRACKED_LABEL,
  yearBands,
  type WorldRun,
} from '../src/sim/worldRun';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const wb = balance.worldModel;
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const anzahl = Number(process.argv[2] ?? 300);
const PREFIX = 'welt';

const start = Date.now();
const runs = runWorlds(PREFIX, anzahl, wb, CAMPAIGN_ROUNDS);
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const prozent = (x: number) => `${zahl(x * 100, 1)} %`;

// --- Verläufe ---------------------------------------------------------------
const JAHRE = [0, 1, 2, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 73];
function verlaufTabelle(): string {
  const kopf = `| Größe | ${JAHRE.map((j) => `Jahr ${j}`).join(' | ')} | Min | Max |`;
  const linie = `| --- | ${JAHRE.map(() => '---:').join(' | ')} | ---: | ---: |`;
  const zeilen = TRACKED.map((k) => {
    const bands = yearBands(runs, k);
    const e = extremes(runs, k);
    const st = k === 'price' || k === 'demand' || k === 'capacity' || k === 'stock' ? 2 : 0;
    const zellen = JAHRE.map((j) => `${zahl(bands[j].p10, st)} · **${zahl(bands[j].p50, st)}** · ${zahl(bands[j].p90, st)}`);
    return `| ${TRACKED_LABEL[k]} | ${zellen.join(' | ')} | ${zahl(e.min, st)} | ${zahl(e.max, st)} |`;
  });
  return [kopf, linie, ...zeilen].join('\n');
}

/** Textkurve des Median-Weltpreises je Spieljahr (▁ = 0,7, █ = 1,4). */
function kurve(key: 'price' | 'credit' | 'tension' | 'mood', lo: number, hi: number, band: 'p10' | 'p50' | 'p90' = 'p50'): string {
  const STUFEN = '▁▂▃▄▅▆▇█';
  return yearBands(runs, key)
    .map((b) => STUFEN[Math.max(0, Math.min(7, Math.round(((b[band] - lo) / (hi - lo)) * 7)))])
    .join('');
}

// --- Krisen -----------------------------------------------------------------
function krisenTabelle(): string {
  const zeilen: string[] = ['| Krise | Ziel je Kampagne (GDD §15) | Ø | 10 % · 50 % · 90 % der Welten | Welten im Ziel | Ø in den ersten 20 Jahren |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
  const zwanzig = (r: WorldRun, k: 'crashes' | 'gluts' | 'wars') => r.years[20].counts[k];
  const reihen: [string, 'crashes' | 'gluts' | 'wars'][] = [
    ['Kreditkrisen (Crash)', 'crashes'],
    ['Ölschwemmen (Riesenfund)', 'gluts'],
    ['Kriege in Übersee', 'wars'],
  ];
  for (const [name, k] of reihen) {
    const s = crisisStats(runs, (r) => r.final.counts[k], CAMPAIGN_TARGETS[k]);
    const z = runs.reduce((sum, r) => sum + zwanzig(r, k), 0) / runs.length;
    zeilen.push(`| ${name} | ${CAMPAIGN_TARGETS[k][0]}–${CAMPAIGN_TARGETS[k][1]} | ${zahl(s.mean)} | ${Math.round(s.p10)} · ${Math.round(s.p50)} · ${Math.round(s.p90)} | ${prozent(s.inTarget)} | ${zahl(z)} |`);
  }
  const nat = crisisStats(runs, (r) => r.final.counts.nationalizations, [0, 99]);
  zeilen.push(`| Verstaatlichungen | – | ${zahl(nat.mean)} | ${Math.round(nat.p10)} · ${Math.round(nat.p50)} · ${Math.round(nat.p90)} | – | ${zahl(runs.reduce((s, r) => s + r.years[20].counts.nationalizations, 0) / runs.length)} |`);
  const wechsel = crisisStats(runs, (r) => r.final.counts.changes, [0, 99]);
  zeilen.push(`| Regierungswechsel (von ${Math.floor(CAMPAIGN_ROUNDS / wb.politics.electionEvery)} Wahlen) | – | ${zahl(wechsel.mean)} | ${Math.round(wechsel.p10)} · ${Math.round(wechsel.p50)} · ${Math.round(wechsel.p90)} | – | ${zahl(runs.reduce((s, r) => s + r.years[20].counts.changes, 0) / runs.length)} |`);
  return zeilen.join('\n');
}

function regierungZeile(): string {
  const summe = { handel: 0, volksbund: 0, provinz: 0 };
  for (const r of runs) for (const p of Object.keys(summe) as (keyof typeof summe)[]) summe[p] += r.governmentRounds[p];
  const gesamt = runs.length * CAMPAIGN_ROUNDS;
  return `Handelspartei ${prozent(summe.handel / gesamt)}, Volksbund ${prozent(summe.volksbund / gesamt)}, Provinzliga ${prozent(summe.provinz / gesamt)} der Regierungszeit`;
}

// --- Preisausschläge und Kapitel 1 -----------------------------------------
const drops = runs.map((r) => r.maxYearDrop);
const rises = runs.map((r) => r.maxYearRise);
const kapitel1 = runWorlds(PREFIX, anzahl, wb, balance.start.rounds);
const faktoren = kapitel1.map((r) => worldPriceFactor(r.final, wb));
const zinsen = kapitel1.flatMap((r) => {
  // Zinsaufschlag in jeder Runde des Kapitels.
  let w = newWorld(r.seed, wb);
  const out: number[] = [];
  for (let i = 0; i < balance.start.rounds; i++) {
    w = advanceWorld(w, wb);
    out.push(worldRateAdd(w, wb));
  }
  return out;
});
const crashKapitel1 = kapitel1.filter((r) => r.final.counts.crashes > 0).length / kapitel1.length;
const kriegKapitel1 = kapitel1.filter((r) => r.final.counts.wars > 0).length / kapitel1.length;

// --- Beispielwelt -----------------------------------------------------------
const NAMEN: Record<WorldNews, string> = {
  crash: 'Crash',
  recovery: 'Banken erholt',
  war: 'Krieg',
  peace: 'Frieden',
  election: 'Wahl',
  glut: 'Riesenfund',
  nationalization: 'Verstaatlichung',
};
const PARTEI = { handel: 'Handelspartei', volksbund: 'Volksbund', provinz: 'Provinzliga' };
function chronik(seed: string): string {
  let w = newWorld(seed, wb);
  const zeilen: string[] = [];
  for (let i = 1; i <= CAMPAIGN_ROUNDS; i++) {
    const vorher = w.government;
    w = advanceWorld(w, wb);
    const wichtig = w.news.filter((n) => n !== 'election' || w.government !== vorher);
    if (wichtig.length === 0) continue;
    const jahr = Math.floor((i - 1) / ROUNDS_PER_YEAR) + 1;
    const text = wichtig.map((n) => (n === 'election' ? `Wahl: ${PARTEI[w.government]} regiert` : NAMEN[n])).join(', ');
    zeilen.push(`- Jahr ${jahr}: ${text} (Weltpreis ${zahl(w.price)}, Kreditklima ${zahl(w.credit, 0)}, Spannung ${zahl(w.tension, 0)})`);
  }
  return zeilen.join('\n');
}

const zielOk = (['crashes', 'gluts', 'wars'] as const).every((k) => crisisStats(runs, (r) => r.final.counts[k], CAMPAIGN_TARGETS[k]).inTarget > 0.6);
const endlich = runs.every((r) => r.years.every((y) => TRACKED.every((k) => Number.isFinite(y[k]))));

const auto = `# Weltmodell

Stand: ${new Date().toISOString().slice(0, 10)} · Version ${version}

Erzeugt mit \`npm run welt\` (tools/weltlaeufe.ts, Regeln in src/sim/world.ts, Zahlen in content/balance.yaml unter worldModel).
${anzahl} Welten (Seeds \`${PREFIX}-0\` bis \`${PREFIX}-${anzahl - 1}\`) über eine ganze Kampagne: ${CAMPAIGN_ROUNDS} Runden = 73 Spieljahre, **ohne Spieler**. Rechenzeit ${sekunden} s.

- Alle Werte endlich: **${endlich ? 'ja' : 'NEIN'}** · Krisenzahlen in der Mehrheit der Welten im GDD-Ziel: **${zielOk ? 'ja' : 'NEIN'}**

## Verläufe

Je Zelle: 10 % · **Median** · 90 % der Welten am Ende des Spieljahres; Min/Max über alle Welten und Jahre.

${verlaufTabelle()}

Median je Spieljahr als Kurve (Jahr 0 bis 73):

- Weltpreis (▁ 0,7 … █ 1,4): \`${kurve('price', 0.7, 1.4)}\`
- Weltpreis 90 % (▁ 0,7 … █ 2,0): \`${kurve('price', 0.7, 2.0, 'p90')}\`
- Kreditklima (▁ 30 … █ 70): \`${kurve('credit', 30, 70)}\`
- Außenspannung 90 % (▁ 0 … █ 100): \`${kurve('tension', 0, 100, 'p90')}\`
- Stimmung (▁ 30 … █ 60): \`${kurve('mood', 30, 60)}\`

## Krisen je Kampagne

${krisenTabelle()}

Regierung: ${regierungZeile()}.

## Preisausschläge

- Größter Preisrückgang binnen eines Jahres je Welt: Median ${prozent(percentile(drops, 0.5))}, 90 % ${prozent(percentile(drops, 0.9))}; Welten mit einem Einbruch von mindestens 40 %: ${prozent(drops.filter((d) => d >= 0.4).length / drops.length)} (GDD §7.3: „fast −50 % in einem Jahr“ soll vorkommen).
- Größter Preisanstieg binnen eines Jahres: Median ${prozent(percentile(rises, 0.5))}, 90 % ${prozent(percentile(rises, 0.9))}.

## Kapitel 1 (Runde 1–${balance.start.rounds})

- Faktor auf den Trendpreis am Salt Hill nach ${balance.start.rounds} Runden: 10 % ${zahl(percentile(faktoren, 0.1), 3)} · Median ${zahl(percentile(faktoren, 0.5), 3)} · 90 % ${zahl(percentile(faktoren, 0.9), 3)} (Grenze ±${prozent(wb.chapter1.priceMaxDev)}).
- Zinsaufschlag der Bank je Runde: 10 % ${zahl(percentile(zinsen, 0.1) * 100)} · Median ${zahl(percentile(zinsen, 0.5) * 100)} · 90 % ${zahl(percentile(zinsen, 0.9) * 100)} Prozentpunkte (Grenze ±${zahl(wb.chapter1.rateMaxAdd * 100)}).
- Welten mit einem Crash in Kapitel 1: ${prozent(crashKapitel1)}; mit einem Krieg: ${prozent(kriegKapitel1)}.
- Ob die Kapitel-1-Balance hält, zeigt \`npm run bots\` (docs/botlaeufe.md) – die Bots spielen mit Weltmodell.

## Beispielwelt \`${PREFIX}-0\`

${chronik(`${PREFIX}-0`)}
`;

console.log(auto);
const MARKE = '<!-- Ab hier von Hand geschrieben: npm run welt lässt den Rest stehen. -->';
const ziel = new URL('docs/weltmodell.md', root);
const alt = existsSync(ziel) ? readFileSync(ziel, 'utf8') : '';
const handTeil = alt.includes(MARKE) ? alt.slice(alt.indexOf(MARKE) + MARKE.length) : '\n';
writeFileSync(ziel, `${auto}\n${MARKE}${handTeil}`);
console.log('Geschrieben: docs/weltmodell.md');
