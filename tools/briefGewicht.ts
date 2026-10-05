// Messung „Spielspaß-Durchgang: Briefe mit Gewicht“ (Kapitel 1): Wie viel Geld steht in einem Brief
// auf dem Spiel – gemessen am Imperium zu dem Zeitpunkt, an dem er auf den Tisch kommt?
// Spielt den Standard-Bot (ausgewogen) mit allen Ereignissen über viele Seeds. Für jedes Ereignis mit
// Geld in den Antworten, das neu auf den Tisch kommt (Briefe, Besuche, Vorfälle; feste Termine nicht),
// zählt der größte Geldbetrag unter seinen Antworten – so, wie der Spieler ihn in dieser Runde sieht
// (mit dem Faktor aus src/sim/letterScale.ts). Ausgegeben: Median und oberes Viertel von
// |Geld| ÷ Imperium je Kapiteldrittel, getrennt nach normalen und großen Briefen (KEY_LETTERS), dazu
// Median von Faktor, Erlös je Runde und Imperium.
// Aufruf: npx tsx tools/briefGewicht.ts [Seeds] – schreibt nur mit „--schreiben“ nach docs/plan-termine-messung.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { botTurn, newLedger } from '../src/sim/bots';
import { empireValue } from '../src/sim/empire';
import type { EventDef } from '../src/sim/events';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { letterScale, roundRevenue, scaledCash } from '../src/sim/letterScale';
import { Rng, seedFromString } from '../src/sim/rng';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const catalog = loadEvents();
const byId = new Map(catalog.map((e) => [e.id, e]));
const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 400);
const schreiben = process.argv.includes('--schreiben');
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number, d = 0) => x.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const quantil = (xs: number[], q: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Der größte Geldbetrag unter den Antworten, wie der Spieler ihn jetzt sieht (0 = kein Geld im Spiel). */
function einsatz(state: GameState, event: EventDef): number {
  return Math.max(0, ...event.choices.map((c) => Math.abs(scaledCash(state, balance, c) ?? 0)));
}

/** Die großen Entscheidungen (Schlüsselbriefe mit Grundbetrag 2.000–8.000 $), getrennt gezählt. */
const KEY_LETTERS = ['silas_abrechnung', 'silas_saloon', 'moss_schulden', 'moss_dank', 'moss_versteigerung', 'moss_spekulant', 'vale_umschlag', 'bullard_kredit', 'bullard_rueckzahlung'];

// Kapitel 1 hat balance.start.rounds = 16 Runden.
const DRITTEL = ['Runde 1–5', 'Runde 6–11', 'Runde 12–16'] as const;
const drittel = (round: number) => (round <= 5 ? 0 : round <= 11 ? 1 : 2);

interface Topf {
  normal: number[];
  gross: number[];
  geldNormal: number[];
  geldGross: number[];
  faktor: number[];
  erloes: number[];
  imperium: number[];
}
const leer = (): Topf => ({ normal: [], gross: [], geldNormal: [], geldGross: [], faktor: [], erloes: [], imperium: [] });
const toepfe = DRITTEL.map(leer);
let pleite = 0;

// --einzeln: je Ereignis Median von Runde, Imperium, Kasse und Faktor beim Eintreffen (zum Einstellen der Beträge).
const diagnose = process.argv.includes('--einzeln') ? new Map<string, { runde: number[]; imperium: number[]; kasse: number[]; faktor: number[] }>() : null;

const start = Date.now();
for (let i = 0; i < seeds; i++) {
  const seed = `${balance.bots.seedPrefix}-${i}`;
  let state: GameState = newGame(seed, balance, catalog);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  const ledger = newLedger();
  const zaehle = (s: GameState) => {
    const t = toepfe[drittel(s.round)];
    const imperium = Math.max(1, empireValue(s, balance));
    t.faktor.push(letterScale(s, balance));
    t.erloes.push(roundRevenue(s, balance));
    t.imperium.push(imperium);
    // Was in dieser Runde neu auf den Tisch kam: lastSeen trägt die Runde des Eintreffens.
    for (const [id, r] of Object.entries(s.events.lastSeen)) {
      if (id.startsWith('@') || r !== s.round) continue;
      const e = byId.get(id);
      if (!e || e.routine) continue;
      const geld = einsatz(s, e);
      if (geld <= 0) continue;
      if (diagnose) {
        const d = diagnose.get(id) ?? { runde: [], imperium: [], kasse: [], faktor: [] };
        d.runde.push(s.round);
        d.imperium.push(imperium);
        d.kasse.push(s.cash);
        d.faktor.push(letterScale(s, balance));
        diagnose.set(id, d);
      }
      if (KEY_LETTERS.includes(id)) {
        t.gross.push(geld / imperium);
        t.geldGross.push(geld);
      } else {
        t.normal.push(geld / imperium);
        t.geldNormal.push(geld);
      }
    }
  };
  zaehle(state);
  while (!state.finished) {
    const g = botTurn(state, balance, 'ausgewogen', rng, catalog, ledger);
    state = endRound(g, balance, catalog);
    if (!state.finished) zaehle(state);
  }
  if (state.ending === 'pleite') pleite++;
}

const tabelle = [
  '| Kapiteldrittel | normale Briefe: Median \\|Geld\\| ÷ Imperium (oberes Viertel) | Median Geld | große Briefe: Median (oberes Viertel) | Median Geld | Median Faktor | Median Erlös je Runde | Median Imperium |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...toepfe.map(
    (t, k) =>
      `| ${DRITTEL[k]} | ${prozent(quantil(t.normal, 0.5))} (${prozent(quantil(t.normal, 0.75))}), n = ${t.normal.length} | ${zahl(quantil(t.geldNormal, 0.5))} $ | ${t.gross.length ? `${prozent(quantil(t.gross, 0.5))} (${prozent(quantil(t.gross, 0.75))}), n = ${t.gross.length}` : '–'} | ${t.gross.length ? `${zahl(quantil(t.geldGross, 0.5))} $` : '–'} | ${zahl(quantil(t.faktor, 0.5), 2)} | ${zahl(quantil(t.erloes, 0.5))} $ | ${zahl(quantil(t.imperium, 0.5))} $ |`,
  ),
].join('\n');
const alleNormal = toepfe.flatMap((t) => t.normal);
const alleGross = toepfe.flatMap((t) => t.gross);
const gesamt = `Ganzes Kapitel: normale Briefe Median ${prozent(quantil(alleNormal, 0.5))}, große Briefe Median ${prozent(quantil(alleGross, 0.5))}.`;
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

console.log(tabelle);
console.log(`\n${gesamt}`);
if (diagnose) {
  for (const [id, d] of [...diagnose.entries()].sort((a, b) => b[1].runde.length - a[1].runde.length)) {
    console.log(`${KEY_LETTERS.includes(id) ? '*' : ' '} ${id.padEnd(28)} n=${String(d.runde.length).padStart(4)} Runde ${quantil(d.runde, 0.5)} Imperium ${zahl(quantil(d.imperium, 0.5))} Kasse ${zahl(quantil(d.kasse, 0.25))}/${zahl(quantil(d.kasse, 0.5))} Faktor ${zahl(quantil(d.faktor, 0.5), 1)}`);
  }
}
console.log(`\n${seeds} Seeds in ${sekunden} s (Standard-Bot: Pleite ${prozent(pleite / seeds)}).`);

if (schreiben) {
  const datei = new URL('docs/plan-termine-messung.md', root);
  const alt = readFileSync(datei, 'utf8');
  const MARKE = '<!-- Messung Briefe mit Gewicht: npx tsx tools/briefGewicht.ts 400 --schreiben ersetzt bis zur nächsten Marke. -->';
  const ENDE = '<!-- Ende der Messung Briefe mit Gewicht -->';
  const block = `${MARKE}\n\nStand: ${new Date().toISOString().slice(0, 10)} · Version ${version} · ${seeds} Seeds (\`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${seeds - 1}\`), Standard-Bot mit allen Ereignissen\n\n${tabelle}\n\n${gesamt}\n\n${ENDE}`;
  const neu = alt.includes(MARKE) && alt.includes(ENDE) ? alt.slice(0, alt.indexOf(MARKE)) + block + alt.slice(alt.indexOf(ENDE) + ENDE.length) : `${alt}\n${block}\n`;
  writeFileSync(datei, neu);
  console.log('Geschrieben: docs/plan-termine-messung.md');
}
