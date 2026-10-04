// Bot-Läufe (Schritt 1.14, 2.15): spielt je Strategie balance.bots.games Partien ohne
// Grafik – mit den echten Ereignissen aus content/events/ –, druckt die Tabelle und
// die Zielwerte (Ist/Ziel) und schreibt beides nach docs/botlaeufe.md.
// Aufruf: npm run bots
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadBalance } from '../src/sim/testBalance';
import { blindWildcatChance, botTable, buildTable, checkTargets, crisisTable, investVariant, pipelineLine, runBots, runInvestVariant, targetTable, transportTable } from '../src/sim/bots';
import { loadEvents } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const catalog = loadEvents();

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

const start = Date.now();
const rows = runBots(balance, balance.bots.games, catalog);
const table = botTable(rows);
const wege = transportTable(rows);
const standard = rows.find((r) => r.strategy === 'ausgewogen')!;
const variants = {
  none: runInvestVariant(balance, investVariant(balance, 'none'), standard, catalog),
  all: runInvestVariant(balance, investVariant(balance, 'all'), standard, catalog),
};
const ausbau = buildTable(rows, variants);
const targets = checkTargets(rows, blindWildcatChance(balance), balance, variants);
const zielTabelle = targetTable(targets);
const krisen = crisisTable(rows);
const ohneSieger = Math.max(0, 1 - rows.reduce((s, r) => s + r.winRate, 0));
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

console.log(table);
console.log(`\n${wege}\nPipeline: ${pipelineLine(rows)}`);
console.log(`\n${ausbau}\n„alles ausbauen“ schlägt den Standard-Bot in ${prozent(variants.all.beatsStandard)}, „nie ausbauen“ in ${prozent(variants.none.beatsStandard)} der Seeds mit unterschiedlichem Ausgang.`);
console.log(`\nKreditzyklus (Bankpanik oder Crash im Kapitel):\n${krisen}`);
console.log(`\n${zielTabelle}`);
console.log(`\n${balance.bots.games} Partien je Strategie in ${sekunden} s.`);
const verfehlt = targets.filter((t) => !t.ok);
console.log(verfehlt.length === 0 ? 'Alle Zielwerte im Toleranzbereich.' : `Außerhalb der Toleranz: ${verfehlt.map((t) => t.label).join(', ')}`);

const datum = new Date().toISOString().slice(0, 10);
// Alles ab der Markierung (früher: ab "## Justierung") ist von Hand geschrieben und bleibt beim Neuschreiben stehen.
const MARKE = '<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->';
const ziel = new URL('docs/botlaeufe.md', root);
const alt = existsSync(ziel) ? readFileSync(ziel, 'utf8') : '';
const handTeil = alt.includes(MARKE)
  ? alt.slice(alt.indexOf(MARKE) + MARKE.length)
  : alt.includes('\n## Justierung')
    ? alt.slice(alt.indexOf('\n## Justierung'))
    : '';
const md = `# Bot-Läufe

Stand: ${datum} · Version ${version}

- Partien je Strategie: ${balance.bots.games.toLocaleString('de-DE')}
- Seeds: \`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${balance.bots.games - 1}\` (für jede Strategie dieselben)
- Mit allen ${catalog.length} Ereignissen aus content/events/ (Briefe, feste Termine, Rivalen, Story-Bögen)
- Erzeugt mit \`npm run bots\` (tools/botlaeufe.ts, Regeln in src/sim/bots.ts)

${table}

- **vorsichtig:** bohrt und kauft nur, wenn danach noch die Rücklage in der Kasse bleibt, kauft nur Optionen, deren Bonus er danach auch zahlen kann, nimmt nie selbst einen Kredit.
- **gierig:** bohrt jede Pacht, bohrt immer tiefer (gibt auf, wenn auch ein Kredit nicht mehr reicht), pachtet die beste bezahlbare Prognose, solange Kasse und Bankrahmen reichen und höchstens so viele Pachten ungebohrt sind, wie in balance.yaml steht; leiht fehlendes Geld und behält Bargeld für den Verzögerungszins.
- **ausgewogen (Standard-Bot):** pachtet die beste Prognose ab ${prozent(balance.bots.balanced.minChance)} Fundchance, bohrt bis Stufe ${balance.bots.balanced.maxStage}, behält ${balance.bots.balanced.cashReserve} $ Rücklage und leiht, aber höchstens ${prozent(balance.bots.balanced.maxDebtShare)} des Bankrahmens.
- **zufällig:** wählt jede Runde einige erlaubte Aktionen per Zufall und beantwortet Ereignisse zufällig.
- **Ereignisse:** Die drei planenden Bots bewerten jede Antwort in $ (Geld, Öl, Kraft, Familie, Bahntarif, Termine; Gewichte in balance.yaml unter bots.events) und antworten, wenn das mehr bringt als liegen lassen. Den Verkauf an Crane wählt kein Bot.
- **Kapitelziel:** Anteil der Partien, in denen die Kapitelprüfung bestanden ist (nicht bankrott und Imperiumswert ≥ 50.000 $ oder 5 fördernde Quellen, Zahlen in balance.yaml unter chapter).
- **Siegquote:** Anteil der Seeds, in denen die Strategie den höchsten Imperiumswert hat. Eine Pleite zählt immer als letzter Platz, Gleichstand wird geteilt. Seit 2.15 gewinnt nur, wer mindestens die Startkasse (${balance.start.cash.toLocaleString('de-DE')} $) erreicht – sonst hat niemand gewonnen (diesmal ${prozent(ohneSieger)} der Seeds).
- **Ø Termine:** Termine je Runde zu Rundenbeginn (krank = 0).

## Transportwege

Anteil an allen verkauften Barrel (gesamt und je Strategie). Erlös = was nach Fracht und Förderzins in der Kasse landet; Anlagen/Fixkosten = Anschaffung (soweit sie nicht im Imperiumswert weiterzählt), Löhne, Streckenwärter, Wachleute, Reparaturen, Wegerechte, Thornes Strafen und Vertragsgebühr; beim Händler Cranes Groll auf die übrigen Verkäufe. Gewinn = Erlös − Kosten.

${wege}

Pipeline lief in: ${pipelineLine(rows)}.

- **Transport-Charakter** (balance.yaml bots.transport): vorsichtig ${JSON.stringify(balance.bots.transport.cautious)}; gierig ${JSON.stringify(balance.bots.transport.greedy)}; ausgewogen ${JSON.stringify(balance.bots.transport.balanced)}; zufällig: mit ${prozent(balance.bots.random.logisticsChance)} je Runde eine zufällige Anschaffung, verkauft zufällig auch an den Händler.

## Ausbau: Bohrtürme, Pumpen, weitere Bohrlöcher

Je Partie: Ø höchste Zahl Türme zugleich (Silas' Turm mitgezählt), Ø Quellen mit Pumpe am Ende, Ø fündige Bohrlöcher über das erste je Ranch hinaus; Anteil ausgebauter Quellen = Ranches mit Fund, die eine Pumpe oder mehr als ein fündiges Bohrloch haben. Bebaubar ist in Kapitel 1 nur der Salt Hill. Zwei Gegenproben spielen den Standard-Bot (ausgewogen) auf denselben Seeds: **nie ausbauen** (nur Silas' Turm, keine Pumpe, kein weiteres Loch, kein Nachrüsten) und **alles ausbauen** (bis ${balance.drilling.rigs.max} Türme gemietet, nachgerüstet, Pumpe und weiteres Loch überall, wo es geht – auch ohne Amortisation).

${ausbau}

„Alles ausbauen“ schlägt den Standard-Bot in ${prozent(variants.all.beatsStandard)}, „nie ausbauen“ in ${prozent(variants.none.beatsStandard)} der Seeds mit unterschiedlichem Ausgang.

- **Ausbau-Charakter** (balance.yaml bots.invest): vorsichtig ${JSON.stringify(balance.bots.invest.cautious)}; gierig ${JSON.stringify(balance.bots.invest.greedy)}; ausgewogen ${JSON.stringify(balance.bots.invest.balanced)}.

## Kreditzyklus

Bankrottquote je Strategie, getrennt nach Seeds, in deren Welt während des Kapitels eine Kreditkrise (Bankpanik oder Crash, 4.4) kommt, und Seeds ohne. Eingeteilt wird an der Welt allein (ohne Jacobs Handeln), damit eine frühe Pleite die Einteilung nicht verzerrt. In Kapitel 1 ist es fast immer eine Bankpanik; Crash und Embargo kommen erst in späteren Kapiteln (docs/weltmodell.md). Kein Zielwert, nur Kennzahl.

${krisen}

## Zielwerte Kapitel 1

Toleranzbereiche stehen in balance.yaml unter bots.targets; gemessen wird in src/sim/bots.ts (checkTargets).

${zielTabelle}

${MARKE}${handTeil}`;
writeFileSync(ziel, md);
console.log('Geschrieben: docs/botlaeufe.md');
