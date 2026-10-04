// Weltläufe (Schritt 4.1): simuliert das Weltmodell über viele Seeds und eine
// ganze Kampagne (73 Spieljahre) ohne Spieler, druckt Verläufe und Krisenzahlen
// und schreibt sie nach docs/weltmodell.md (der Teil ab der Markierung bleibt stehen).
// Aufruf: npm run welt   (optional: npm run welt -- 500   für 500 Seeds)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadBalance } from '../src/sim/testBalance';
import { votePercent } from '../src/sim/laws';
import { advanceWorld, newWorld, worldPriceFactor, worldRateAdd, type WorldNews } from '../src/sim/world';
import {
  CAMPAIGN_ROUNDS,
  CAMPAIGN_TARGETS,
  creditCrises,
  crisisStats,
  crisisWindows,
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
const laws = balance.laws;
const runs = runWorlds(PREFIX, anzahl, wb, CAMPAIGN_ROUNDS, laws);
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
function kurve(key: 'price' | 'credit' | 'leverage' | 'tension' | 'mood', lo: number, hi: number, band: 'p10' | 'p50' | 'p90' = 'p50'): string {
  const STUFEN = '▁▂▃▄▅▆▇█';
  return yearBands(runs, key)
    .map((b) => STUFEN[Math.max(0, Math.min(7, Math.round(((b[band] - lo) / (hi - lo)) * 7)))])
    .join('');
}

// --- Krisen -----------------------------------------------------------------
function krisenTabelle(): string {
  const zeilen: string[] = ['| Krise | Ziel je Kampagne (GDD §15) | Ø | 10 % · 50 % · 90 % der Welten | Welten im Ziel | Ø in den ersten 20 Jahren |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
  const reihen: [string, 'crashes' | 'gluts' | 'wars', (w: WorldRun['final']) => number][] = [
    ['Kreditkrisen (Bankpanik + Crash)', 'crashes', creditCrises],
    ['Ölschwemmen (Riesenfund)', 'gluts', (w) => w.counts.gluts],
    ['Kriege in Übersee', 'wars', (w) => w.counts.wars],
  ];
  for (const [name, k, f] of reihen) {
    const s = crisisStats(runs, (r) => f(r.final), CAMPAIGN_TARGETS[k]);
    const z = runs.reduce((sum, r) => sum + f(r.years[20]), 0) / runs.length;
    zeilen.push(`| ${name} | ${CAMPAIGN_TARGETS[k][0]}–${CAMPAIGN_TARGETS[k][1]} | ${zahl(s.mean)} | ${Math.round(s.p10)} · ${Math.round(s.p50)} · ${Math.round(s.p90)} | ${prozent(s.inTarget)} | ${zahl(z)} |`);
  }
  // 4.4: ohne Ziel aus GDD §15 – gemessen, damit man sieht, wie oft sie kommen.
  const ohneZiel: [string, (w: WorldRun['final']) => number][] = [
    ['davon große Crashs', (w) => w.counts.crashes],
    ['davon Bankpaniken', (w) => w.counts.panics],
    ['Aufstände in Costa Negra', (w) => w.counts.uprisings],
    ['Ölembargos aus Qasir', (w) => w.counts.embargoes],
  ];
  for (const [name, f] of ohneZiel) {
    const s = crisisStats(runs, (r) => f(r.final), [0, 99]);
    zeilen.push(`| ${name} | – | ${zahl(s.mean)} | ${Math.round(s.p10)} · ${Math.round(s.p50)} · ${Math.round(s.p90)} | – | ${zahl(runs.reduce((sum, r) => sum + f(r.years[20]), 0) / runs.length)} |`);
  }
  const nat = crisisStats(runs, (r) => r.final.counts.nationalizations, [0, 99]);
  zeilen.push(`| Verstaatlichungen | – | ${zahl(nat.mean)} | ${Math.round(nat.p10)} · ${Math.round(nat.p50)} · ${Math.round(nat.p90)} | – | ${zahl(runs.reduce((s, r) => s + r.years[20].counts.nationalizations, 0) / runs.length)} |`);
  const wechsel = crisisStats(runs, (r) => r.final.counts.changes, [0, 99]);
  zeilen.push(`| Regierungswechsel (von ${Math.floor(CAMPAIGN_ROUNDS / wb.politics.electionEvery)} Wahlen) | – | ${zahl(wechsel.mean)} | ${Math.round(wechsel.p10)} · ${Math.round(wechsel.p50)} · ${Math.round(wechsel.p90)} | – | ${zahl(runs.reduce((s, r) => s + r.years[20].counts.changes, 0) / runs.length)} |`);
  return zeilen.join('\n');
}

// --- Krisen über die Zeit ---------------------------------------------------
const FENSTER = 5;
function zeitTabelle(): string {
  const crash = crisisWindows(runs, (r) => r.crisisStarts, FENSTER);
  const gross = crisisWindows(runs, (r) => r.crashStarts, FENSTER);
  const krieg = crisisWindows(runs, (r) => r.warStarts, FENSTER);
  const kopf = `| je Welt | ${crash.rate.map((_, i) => `J. ${i * FENSTER}–${Math.min(72, i * FENSTER + FENSTER - 1)}`).join(' | ')} |`;
  const linie = `| --- | ${crash.rate.map(() => '---:').join(' | ')} |`;
  const reihe = (name: string, werte: number[], f: (x: number) => string) => `| ${name} | ${werte.map(f).join(' | ')} |`;
  return [
    kopf,
    linie,
    reihe('Kreditkrisen', crash.rate, (x) => zahl(x)),
    reihe('erste Kreditkrise (Anteil Welten)', crash.first, (x) => prozent(x)),
    reihe('davon große Crashs', gross.rate, (x) => zahl(x)),
    reihe('Kriege', krieg.rate, (x) => zahl(x)),
  ].join('\n');
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
const kapitel1 = runWorlds(PREFIX, anzahl, wb, balance.start.rounds, laws);
const faktoren = kapitel1.map((r) => worldPriceFactor(r.final, wb));
const zinsen = kapitel1.flatMap((r) => {
  // Zinsaufschlag in jeder Runde des Kapitels.
  let w = newWorld(r.seed, wb);
  const out: number[] = [];
  for (let i = 0; i < balance.start.rounds; i++) {
    w = advanceWorld(w, wb, {}, laws);
    out.push(worldRateAdd(w, wb));
  }
  return out;
});
// Abweichung des Preisfaktors je Runde und Wahlausgänge im Kapitel.
const nahe: number[] = [];
const wahlen1 = { handel: 0, volksbund: 0, provinz: 0, wieder: 0, alle: 0 };
for (const r of kapitel1) {
  let w = newWorld(r.seed, wb);
  for (let i = 0; i < balance.start.rounds; i++) {
    w = advanceWorld(w, wb, {}, laws);
    nahe.push(Math.abs(worldPriceFactor(w, wb) - 1));
    if (w.news.includes('election') || w.news.includes('reelection')) {
      wahlen1.alle += 1;
      wahlen1[w.government] += 1;
      if (w.news.includes('reelection')) wahlen1.wieder += 1;
    }
  }
}
const crashKapitel1 = kapitel1.filter((r) => r.final.counts.crashes > 0).length / kapitel1.length;
const kriseKapitel1 = kapitel1.filter((r) => creditCrises(r.final) > 0).length / kapitel1.length;
// Fertig-Kriterium 4.4: großer Crash in 5–25 % der 20-Jahres-Welten; Frühwarnung davor.
const crash20 = runs.filter((r) => r.years[20].counts.crashes > 0).length / runs.length;
let crashsAlle = 0;
let gewarnt = 0;
for (const r of runs) for (const c of r.crashStarts) { crashsAlle += 1; if (r.bubbleWarnings.some((b) => b < c && b >= c - 8)) gewarnt += 1; }
const warnAnteil = runs.reduce((s, r) => s + r.bubbleWarnings.length, 0) / (runs.length * CAMPAIGN_ROUNDS);
/** Ausland (4.4): Anteil der Aufstände bzw. Embargos mit Warnung in den 8 Runden davor, und wie oft die Warnung steht. */
function auslandWarnung(starts: (r: (typeof runs)[number]) => number[], warn: (r: (typeof runs)[number]) => number[]): { n: number; anteil: number; runden: number } {
  let n = 0;
  let ja = 0;
  for (const r of runs) for (const s of starts(r)) { n += 1; if (warn(r).some((b) => b < s && b >= s - 8)) ja += 1; }
  return { n, anteil: ja / Math.max(1, n), runden: runs.reduce((s, r) => s + warn(r).length, 0) / (runs.length * CAMPAIGN_ROUNDS) };
}
const warnAufstand = auslandWarnung((r) => r.uprisingStarts, (r) => r.unrestWarnings);
const warnEmbargo = auslandWarnung((r) => r.embargoStarts, (r) => r.qasirWarnings);
const kriegKapitel1 = kapitel1.filter((r) => r.final.counts.wars > 0).length / kapitel1.length;

// --- Beispielwelt -----------------------------------------------------------
const NAMEN: Record<WorldNews, string> = {
  crash: 'Crash',
  panic: 'Bankpanik',
  uprising: 'Aufstand in Costa Negra',
  uprising_end: 'Costa Negra fördert wieder',
  embargo: 'Embargo aus Qasir',
  embargo_end: 'Embargo aufgehoben',
  recovery: 'Banken erholt',
  war: 'Krieg',
  peace: 'Frieden',
  election: 'Wahl',
  reelection: 'Wiederwahl',
  glut: 'Riesenfund',
  nationalization: 'Verstaatlichung',
};
const PARTEI = { handel: 'Handelspartei', volksbund: 'Volksbund', provinz: 'Provinzliga' };
function chronik(seed: string): string {
  let w = newWorld(seed, wb);
  const zeilen: string[] = [];
  for (let i = 1; i <= CAMPAIGN_ROUNDS; i++) {
    w = advanceWorld(w, wb, {}, laws);
    const wichtig = w.news.filter((n) => n !== 'reelection');
    const parlament = w.laws.news.filter((n) => n.kind !== 'debate');
    if (wichtig.length === 0 && parlament.length === 0) continue;
    const jahr = Math.floor((i - 1) / ROUNDS_PER_YEAR) + 1;
    const GESETZ = { proposed: 'Antrag', passed: 'beschlossen', failed: 'abgelehnt', debate: 'Debatte' };
    const text = [
      ...wichtig.map((n) => (n === 'election' ? `Wahl: ${PARTEI[w.government]} regiert` : NAMEN[n])),
      ...parlament.map((n) => `${laws.find((l) => l.id === n.law)?.name.de ?? n.law} ${GESETZ[n.kind]}${n.yes !== undefined ? ` (${votePercent(n.yes, n.kind === 'passed')} % Ja)` : ''}`),
    ].join(', ');
    zeilen.push(`- Jahr ${jahr}: ${text} (Weltpreis ${zahl(w.price)}, Kreditklima ${zahl(w.credit, 0)}, Verschuldung ${zahl(w.leverage, 0)}, Spannung ${zahl(w.tension, 0)})`);
  }
  return zeilen.join('\n');
}

// --- Gesetze (4.3) ------------------------------------------------------------
function gesetzTabelle(): string {
  const zeilen = [
    '| Gesetz | Welten mit Beschluss | Jahr des Beschlusses 10 % · 50 % · 90 % | verschiedene Runden | Ø Anträge | Ø Niederlagen | beschlossen in Kapitel 1 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const l of laws) {
    const runden = runs.map((r) => r.lawPassed[l.id]).filter((x): x is number => x !== null);
    const jahr = (q: number) => (runden.length > 0 ? zahl(percentile(runden, q) / ROUNDS_PER_YEAR, 0) : '–');
    const schnitt = (f: (r: WorldRun) => number) => zahl(runs.reduce((s, r) => s + f(r), 0) / runs.length);
    const k1 = kapitel1.filter((r) => r.lawPassed[l.id] !== null).length / kapitel1.length;
    zeilen.push(
      `| ${l.name.de} | ${prozent(runden.length / runs.length)} | ${jahr(0.1)} · ${jahr(0.5)} · ${jahr(0.9)} | ${new Set(runden).size} | ${schnitt((r) => r.lawProposals[l.id])} | ${schnitt((r) => r.lawFailures[l.id])} | ${prozent(k1)} |`,
    );
  }
  return zeilen.join('\n');
}
function trustZeile(): string {
  const jahre = [0, 10, 20, 40, 73];
  return jahre.map((j) => {
    const werte = runs.map((r) => r.years[j].laws.trustShare);
    return `Jahr ${j}: ${prozent(percentile(werte, 0.1))} · **${prozent(percentile(werte, 0.5))}** · ${prozent(percentile(werte, 0.9))}`;
  }).join('; ');
}

const zielOk = (['crashes', 'gluts', 'wars'] as const).every(
  (k) => crisisStats(runs, (r) => (k === 'crashes' ? creditCrises(r.final) : r.final.counts[k]), CAMPAIGN_TARGETS[k]).inTarget > 0.6,
);
const endlich = runs.every((r) => r.years.every((y) => TRACKED.every((k) => Number.isFinite(y[k]))));

const auto = `# Weltmodell

Stand: ${new Date().toISOString().slice(0, 10)} · Version ${version}

Erzeugt mit \`npm run welt\` (tools/weltlaeufe.ts, Regeln in src/sim/world.ts und src/sim/laws.ts, Zahlen in content/balance.yaml unter worldModel, Gesetze in content/laws/).
${anzahl} Welten (Seeds \`${PREFIX}-0\` bis \`${PREFIX}-${anzahl - 1}\`) über eine ganze Kampagne: ${CAMPAIGN_ROUNDS} Runden = 73 Spieljahre, **ohne Spieler**. Rechenzeit ${sekunden} s.

- Alle Werte endlich: **${endlich ? 'ja' : 'NEIN'}** · Krisenzahlen in der Mehrheit der Welten im GDD-Ziel: **${zielOk ? 'ja' : 'NEIN'}**

## Verläufe

Je Zelle: 10 % · **Median** · 90 % der Welten am Ende des Spieljahres; Min/Max über alle Welten und Jahre.

${verlaufTabelle()}

Median je Spieljahr als Kurve (Jahr 0 bis 73):

- Weltpreis (▁ 0,7 … █ 1,4): \`${kurve('price', 0.7, 1.4)}\`
- Weltpreis 90 % (▁ 0,7 … █ 2,0): \`${kurve('price', 0.7, 2.0, 'p90')}\`
- Kreditklima (▁ 30 … █ 70): \`${kurve('credit', 30, 70)}\`
- Verschuldung 90 % (▁ 20 … █ 60): \`${kurve('leverage', 20, 60, 'p90')}\`
- Außenspannung 90 % (▁ 0 … █ 100): \`${kurve('tension', 0, 100, 'p90')}\`
- Stimmung (▁ 30 … █ 60): \`${kurve('mood', 30, 60)}\`

## Krisen je Kampagne

${krisenTabelle()}

Regierung: ${regierungZeile()}.

Kreditzyklus (4.4): Welten mit großem Crash in den ersten 20 Jahren: **${prozent(crash20)}** (Fertig-Kriterium 5–25 %). Vor ${prozent(gewarnt / Math.max(1, crashsAlle))} der ${crashsAlle} Crashs warnte die Zeitung in den 8 Runden davor vor der Blase; die Warnung steht in ${prozent(warnAnteil)} aller Runden. Ausland: Vor ${prozent(warnAufstand.anteil)} der ${warnAufstand.n} Aufstände stand „Unruhen in Costa Negra“ (in ${prozent(warnAufstand.runden)} aller Runden), vor ${prozent(warnEmbargo.anteil)} der ${warnEmbargo.n} Embargos „Verstimmung in Qasir“ (in ${prozent(warnEmbargo.runden)} aller Runden).

## Krisen über die Zeit

Jede Welt ist neu (GDD §7.2): Kreditkrisen und Kriege sollen nicht in allen Welten zur selben Zeit kommen. Je Fenster von ${FENSTER} Spieljahren: Ø Krisen je Welt und Anteil der Welten, deren erste Kreditkrise dort liegt (der Rest: ohne).

${zeitTabelle()}

## Preisausschläge

- Größter Preisrückgang binnen eines Jahres je Welt: Median ${prozent(percentile(drops, 0.5))}, 90 % ${prozent(percentile(drops, 0.9))}; Welten mit einem Einbruch von mindestens 40 %: ${prozent(drops.filter((d) => d >= 0.4).length / drops.length)} (GDD §7.3: „fast −50 % in einem Jahr“ soll vorkommen).
- Größter Preisanstieg binnen eines Jahres: Median ${prozent(percentile(rises, 0.5))}, 90 % ${prozent(percentile(rises, 0.9))}.

## Kapitel 1 (Runde 1–${balance.start.rounds})

- Faktor auf den Trendpreis am Salt Hill nach ${balance.start.rounds} Runden: 10 % ${zahl(percentile(faktoren, 0.1), 3)} · Median ${zahl(percentile(faktoren, 0.5), 3)} · 90 % ${zahl(percentile(faktoren, 0.9), 3)} (Grenze ±${prozent(wb.chapter1.priceMaxDev)}).
- Zinsaufschlag der Bank je Runde: 10 % ${zahl(percentile(zinsen, 0.1) * 100)} · Median ${zahl(percentile(zinsen, 0.5) * 100)} · 90 % ${zahl(percentile(zinsen, 0.9) * 100)} Prozentpunkte (Grenze ±${zahl(wb.chapter1.rateMaxAdd * 100)}).
- Runden, in denen der Faktor höchstens ±2 % vom Neutralwert abweicht: ${prozent(nahe.filter((x) => x <= 0.02 + 1e-9).length / Math.max(1, nahe.length))}; Zins billiger: ${prozent(zinsen.filter((x) => x < 0).length / zinsen.length)}, teurer: ${prozent(zinsen.filter((x) => x > 0).length / zinsen.length)} der Runden.
- Wahlen in Kapitel 1: ${wahlen1.alle}; es siegt Handelspartei ${prozent(wahlen1.handel / Math.max(1, wahlen1.alle))}, Volksbund ${prozent(wahlen1.volksbund / Math.max(1, wahlen1.alle))}, Provinzliga ${prozent(wahlen1.provinz / Math.max(1, wahlen1.alle))}; Wiederwahl ${prozent(wahlen1.wieder / Math.max(1, wahlen1.alle))}.
- Welten mit einer Kreditkrise in Kapitel 1: ${prozent(kriseKapitel1)} (davon großer Crash: ${prozent(crashKapitel1)}); mit einem Krieg: ${prozent(kriegKapitel1)}.
- Ob die Kapitel-1-Balance hält, zeigt \`npm run bots\` (docs/botlaeufe.md) – die Bots spielen mit Weltmodell.

## Gesetze (4.3)

Kein Gesetz hat ein festes Jahr: Druck aus dem Weltzustand → Antrag → Debatte → Abstimmung (content/laws/, Ablauf in balance.yaml unter worldModel.laws).

${gesetzTabelle()}

Marktanteil des größten Konzerns (Crane Trust), 10 % · Median · 90 %: ${trustZeile()}.

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
