// Kampagnen-Bots (4.20): spielt je Strategie balance.bots.campaign.games Kampagnen über Kapitel 1–3
// (mit Zeitsprüngen, Termin-Aktionen und allen Ereignissen), druckt die Tabellen und die Zielwerte
// (Ist/Ziel) und schreibt sie in docs/botlaeufe.md in den Abschnitt „Kapitel 2 und 3“.
// Aufruf: npm run kampagne            (alle Kampagnen aus balance.yaml)
//         npm run kampagne -- 100     (nur 100 Seeds, schreibt nichts – zum Justieren)
// 0.4.20+6: läuft auf mehreren Kernen (tools/kampagnenParallel.ts), höchstens KAMPAGNE_JOBS Prozesse (Standard 7).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { campaignTables, campaignTargetTable, checkCampaignTargets, policyLine } from '../src/sim/campaignBots';
import { runCampaignParallel } from './kampagnenParallel';
import { parseStocksContent } from '../src/sim/stocksContent';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { loadKapitel3Texts } from '../src/sim/testKapitel3';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const catalog = loadEvents();
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const stocks = parseStocksContent('content/stocks.yaml', readFileSync(new URL('content/stocks.yaml', root), 'utf8'), balance.stocks.board.seatsMax);
if (!stocks.content) throw new Error('content/stocks.yaml lässt sich nicht lesen.');
const texts = { stocksBoard: stocks.content.board, kapitel3: loadKapitel3Texts() };

const arg = Number(process.argv[2]);
const probe = Number.isInteger(arg) && arg > 0;
const games = probe ? arg : balance.bots.campaign.games;

const start = Date.now();
const jobs = Number(process.env.KAMPAGNE_JOBS) || 7;
const report = await runCampaignParallel(games, jobs, '{}', (n) => {
  if (n % 50 === 0) process.stderr.write(`  ${n}/${games} Seeds …\n`);
});
const sekunden = ((Date.now() - start) / 1000).toFixed(1);
const t = campaignTables(report);
const targets = checkCampaignTargets(report, balance);
const zielTabelle = campaignTargetTable(targets);

console.log(t.overview);
console.log(`\n${t.chapters}`);
console.log(`\n${t.crises}`);
console.log(`\n${t.stances}`);
console.log(`\n${t.fair}`);
console.log(`\n${t.feldzug}`);
console.log(`\n${t.delaney}`);
console.log(`\n${zielTabelle}`);
console.log(`\n${games} Kampagnen je Strategie in ${sekunden} s.`);
const verfehlt = targets.filter((x) => !x.ok);
console.log(verfehlt.length === 0 ? 'Alle Zielwerte Kapitel 1–3 im Toleranzbereich.' : `Außerhalb der Toleranz: ${verfehlt.map((x) => x.label).join(', ')}`);
if (probe) process.exit(0);

const datum = new Date().toISOString().slice(0, 10);
const c = balance.bots.campaign;
const ANFANG = '<!-- Kampagne: Anfang (npm run kampagne schreibt bis zur Endmarke neu) -->';
const ENDE = '<!-- Kampagne: Ende -->';
const abschnitt = `${ANFANG}

## Kapitel 2 und 3 (Kampagnen-Bots, 4.20)

Stand: ${datum} · Version ${version} · erzeugt mit \`npm run kampagne\` (tools/kampagnenlaeufe.ts, Regeln in src/sim/campaignBots.ts)

${games.toLocaleString('de-DE')} Kampagnen je Strategie auf denselben Seeds wie oben (\`${balance.bots.seedPrefix}-0\` …): Die Bots spielen Kapitel 1 wie oben, dann Zeitsprung I, Kapitel 2, Zeitsprung II und Kapitel 3 – mit Ritt und Karten (Termin-Aktionen), allen Ereignissen, Börsengang, Direktiven und Weichen, Raffinerie (Kapitel 2), Marke, Tankstellen und Börse (Kapitel 3). Eine verfehlte Kapitelprüfung beendet die Kampagne nicht (das nächste Kapitel beginnt geschwächt); aus scheidet, wer pleitegeht (auch im Zeitsprung), abgesetzt oder geschluckt wird oder ins Gefängnis kommt. Endwert = Imperiumswert am Ende von Kapitel 3, ausgeschieden = 0. Siegquote: höchster Endwert je Seed. In ${(report.games * (2 * report.rows.length + 1)).toLocaleString('de-DE')} Kampagnen (${report.rows.length} Strategien, 2 weitere Haltungen des Standard-Bots, ${report.rows.length - 1} Strategien vom gleichen Start) in ${sekunden} s.

- **vorsichtig:** ${policyLine(c.cautious)}
- **gierig:** ${policyLine(c.greedy)}
- **ausgewogen (Standard-Bot):** ${policyLine(c.balanced)}
- **betrügerisch:** ${policyLine(c.cheat)}
- **zufällig:** würfelt Direktiven, Börsengang, Weichen und Börse; Raffinerie, Marke und Tankstellen fasst er in ${(c.randomSystemsChance * 100).toLocaleString('de-DE')} % der Runden an.

${t.overview}

### Je Kapitel

Anteile beziehen sich auf alle Kampagnen der Strategie; Imperiumswerte auf die, die das Kapitel zu Ende spielen. Kapitel 2 und 3 zählen den Zeitsprung davor mit.

${t.chapters}

### Krisen je Kampagne

GDD §15 nennt je Kampagne (7 Kapitel, 73 Jahre) 2–4 Kreditkrisen, 1–3 Ölschwemmen und 0–2 Kriege. Kapitel 1–3 sind 24 Jahre, die Ziele unten sind entsprechend ein Drittel. Gezählt wird jede Welt bis zum Ende von Kapitel 3; scheidet der Bot früher aus, läuft die Welt ohne ihn weiter. Kauf auf Kredit heizt Börse und Kreditklima an (GDD §8: „kann den Crash auslösen“, §15: „Greift der Spieler ein, darf er diese Zahl deutlich nach oben oder unten treiben“) – der Zielwert gilt deshalb für die Welten des vorsichtigen Bots, der nie auf Kredit kauft.

${t.crises}

### Kein dominanter Weg: Haltung im Zeitsprung

Der Standard-Bot spielt dieselben Seeds mit jeder der drei Haltungen (sonst unverändert).

${t.stances}

### Gleicher Start

Kapitel 1 entscheidet viel: Wer es ohne Quelle beendet, geht im Zeitsprung meist pleite. Damit Kapitel 2 und 3 allein vergleichbar sind, spielt hier jede Strategie ab dem Kapitelende des Standard-Bots weiter (gleiche Kasse, gleiche Quellen).

${t.fair}

### Cranes Feldzug (Kapitel 3)

Ab ${balance.feldzug.trigger.stations} Harlan-Tankstellen kündigt Margaret Crane einen Preiskrieg an (src/sim/feldzug.ts): Jacobs Marge an der Zapfsäule fällt auf ${(balance.feldzug.war.margin * 100).toLocaleString('de-DE')} %, die Bank gibt nur ${(balance.feldzug.bank.limitFactor * 100).toLocaleString('de-DE')} % des Rahmens, bis Cranes Kasse nach ${balance.feldzug.war.chestMin}–${balance.feldzug.war.chestMax} Runden leer ist. Auswege: Preisabsprache (Spur für Delaney, Harlan behält nur ${balance.feldzug.pact.keepRegions} Regionen) oder Thornes Kredit (Pfand: die Mehrheit – nicht bezahlt = geschluckt). Anteile an den Kampagnen, die Kapitel 3 selbst gespielt haben; „davon geschluckt“ an denen mit Thornes Kredit.

${t.feldzug}

### Betrug und Delaney

Der betrügerische Bot (GDD §17) zieht jeden schmutzigen Hebel (siehe oben); sein Risiko ist echt: Spuren machen Hitze, Delaney ermittelt, klagt an und verurteilt – bei viel Hitze zum Zwangsverkauf eines Teils der Quellen, ab ${balance.investigation.fine.prisonAt} Hitzepunkten offener Spuren zu Haft (Kampagne zu Ende). Anteile an allen Kampagnen der Strategie, Stand am Ende der Kampagne (Merkzeichen der Ermittlung); Ø Hitze = Spuren plus Personal am Ende.

${t.delaney}

### Zielwerte Kapitel 1–3

Toleranzbereiche in balance.yaml unter bots.campaignTargets; gemessen in src/sim/campaignBots.ts (checkCampaignTargets).

${zielTabelle}

${ENDE}`;

const ziel = new URL('docs/botlaeufe.md', root);
const alt = existsSync(ziel) ? readFileSync(ziel, 'utf8') : '';
const MARKE = '<!-- Ab hier von Hand geschrieben: npm run bots lässt den Rest stehen. -->';
let neu: string;
if (alt.includes(ANFANG) && alt.includes(ENDE)) {
  neu = alt.slice(0, alt.indexOf(ANFANG)) + abschnitt + alt.slice(alt.indexOf(ENDE) + ENDE.length);
} else if (alt.includes(MARKE)) {
  // Direkt hinter die Marke: npm run bots lässt alles danach stehen.
  const i = alt.indexOf(MARKE) + MARKE.length;
  neu = `${alt.slice(0, i)}\n\n${abschnitt}${alt.slice(i)}`;
} else {
  neu = `${alt}\n\n${MARKE}\n\n${abschnitt}\n`;
}
writeFileSync(ziel, neu);
console.log('Geschrieben: docs/botlaeufe.md (Abschnitt Kapitel 2 und 3)');
