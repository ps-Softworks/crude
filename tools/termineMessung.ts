// Messung „Termine als Hauptwerkzeug“, Etappe 1 (Plan: Abnahme Etappe 1): spielt den
// Standard-Bot (ausgewogen) mit allen Ereignissen über 500 Seeds und misst
//   - exploreGain: Trefferquote selbst gewählter Pachten nach Erkundung ÷ blinde Wahl,
//   - ehrliche Prognose: echte Fundquote je Klasse von 20 Punkten gegen die Mitte der Prognose,
//   - versteckte Struktur: Anteil Rand/Ring mit q ≥ 45 %, Anteil Kern mit q ≤ 30 %,
//   - Erkundung kostet Zeit: Ø Termine je Runde für Erkundung in den Runden 1–6.
// Die Zielwerte aus npm run bots stehen in docs/botlaeufe.md.
// Aufruf: npx tsx tools/termineMessung.ts [Seeds] – schreibt nur mit „--schreiben“ nach docs/plan-termine-messung.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { playGame, type LeaseChoice } from '../src/sim/bots';
import { generateParcels } from '../src/sim/geology';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const catalog = loadEvents();
const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 500);
const schreiben = process.argv.includes('--schreiben');
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number, d = 2) => x.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const mittel = (xs: readonly number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const start = Date.now();
const leases: LeaseChoice[] = [];
const prognosen: { shown: number; oil: boolean }[] = [];
let termine = 0;
let runden = 0;
let ziel = 0;
let pleite = 0;
for (let i = 0; i < seeds; i++) {
  const r = playGame(`${balance.bots.seedPrefix}-${i}`, balance, 'ausgewogen', catalog);
  leases.push(...r.explore.leases);
  prognosen.push(...r.explore.forecasts);
  termine += r.explore.appointmentsEarly;
  runden += r.explore.roundsEarly;
  if (r.goal) ziel++;
  if (r.bankrupt) pleite++;
}

// exploreGain
const erkundet = leases.filter((l) => l.known);
const trefferErkundet = mittel(erkundet.map((l) => (l.oil ? 1 : 0)));
const trefferBlind = mittel(erkundet.map((l) => l.blind));
const exploreGain = trefferBlind > 0 ? trefferErkundet / trefferBlind : 0;

// ehrliche Prognose (Snapshot zu Beginn von Runde 7 und die Prognosen der gewählten Pachten)
const alle = [...prognosen, ...erkundet.filter((l) => l.shown !== null).map((l) => ({ shown: l.shown!, oil: l.oil }))];
const klassen = [0, 20, 40, 60, 80].map((von) => {
  const drin = alle.filter((p) => p.shown >= von && (von === 80 ? p.shown <= 100 : p.shown < von + 20));
  const mitte = mittel(drin.map((p) => p.shown)) / 100;
  const echt = mittel(drin.map((p) => (p.oil ? 1 : 0)));
  return { von, n: drin.length, mitte, echt, abw: Math.abs(echt - mitte) };
});
const ehrlich = klassen.filter((k) => k.n >= 30).every((k) => k.abw <= 0.1);

// versteckte Struktur (nur die Karte, über dieselben Seeds)
let randRing = 0;
let randRingHoch = 0;
let kern = 0;
let kernTief = 0;
for (let i = 0; i < seeds; i++) {
  for (const p of generateParcels(balance, `${balance.bots.seedPrefix}-${i}`)) {
    if (p.discovery) continue;
    const q = p.chance ?? 0;
    if (p.zone === 'kern') {
      kern++;
      if (q <= 0.3) kernTief++;
    } else {
      randRing++;
      if (q >= 0.45) randRingHoch++;
    }
  }
}
const hoch = randRingHoch / randRing;
const tief = kernTief / kern;
const zeit = runden > 0 ? termine / runden : 0;
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

const zeile = (name: string, ziel: string, ist: string, ok: boolean) => `| ${name} | ${ziel} | ${ist} | ${ok ? 'ja' : 'nein'} |`;
const tabelle = [
  '| Kriterium | Ziel (Plan) | Ist | erfüllt |',
  '| --- | --- | ---: | :---: |',
  zeile('exploreGain: Trefferquote erkundet gewählt ÷ blind', '≥ 1,6', `${zahl(exploreGain)} (${prozent(trefferErkundet)} gegen ${prozent(trefferBlind)}, ${erkundet.length} Pachten)`, exploreGain >= 1.6),
  zeile('Ehrliche Prognose: echte Fundquote je 20-Punkte-Klasse', 'höchstens 10 Punkte neben der Mitte', `größte Abweichung ${zahl(Math.max(...klassen.filter((k) => k.n >= 30).map((k) => k.abw)) * 100, 1)} Punkte`, ehrlich),
  zeile('Rand- und Ringranches mit q ≥ 45 %', '≥ 10 %', prozent(hoch), hoch >= 0.1),
  zeile('Kernranches mit q ≤ 30 %', '≥ 15 %', prozent(tief), tief >= 0.15),
  zeile('Ø Termine je Runde für Erkundung, Runden 1–6 (Standard-Bot)', '1,5–3', zahl(zeit), zeit >= 1.5 && zeit <= 3),
].join('\n');
const klassenTabelle = [
  '| Prognose-Mitte | Prognosen | Ø Mitte | echte Fundquote | Abweichung |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...klassen.map((k) => `| ${k.von}–${k.von + 20} % | ${k.n} | ${prozent(k.mitte)} | ${prozent(k.echt)} | ${zahl(k.abw * 100, 1)} Punkte${k.n < 30 ? ' (zu wenige)' : ''} |`),
].join('\n');

console.log(tabelle);
console.log(`\n${klassenTabelle}`);
console.log(`\nStandard-Bot: Kapitelziel ${prozent(ziel / seeds)}, Pleite ${prozent(pleite / seeds)} · ${seeds} Seeds in ${sekunden} s.`);

if (schreiben) {
  const datei = new URL('docs/plan-termine-messung.md', root);
  const alt = readFileSync(datei, 'utf8');
  const MARKE = '<!-- Messung: npx tsx tools/termineMessung.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->';
  const ENDE = '<!-- Ende der Messung -->';
  const block = `${MARKE}\n\nStand: ${new Date().toISOString().slice(0, 10)} · Version ${version} · ${seeds} Seeds (\`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${seeds - 1}\`), Standard-Bot mit allen ${catalog.length} Ereignissen\n\n${tabelle}\n\n**Prognose gegen Wahrheit** (Prognosen aller bekannten, noch nicht selbst gebohrten Ranches zu Beginn von Runde 7 und die Prognosen der selbst gewählten Pachten):\n\n${klassenTabelle}\n\nStandard-Bot in diesem Lauf: Kapitelziel ${prozent(ziel / seeds)}, Pleite ${prozent(pleite / seeds)}.\n\n${ENDE}`;
  const neu = alt.includes(MARKE) && alt.includes(ENDE) ? alt.slice(0, alt.indexOf(MARKE)) + block + alt.slice(alt.indexOf(ENDE) + ENDE.length) : `${alt}\n${block}\n`;
  writeFileSync(datei, neu);
  console.log('Geschrieben: docs/plan-termine-messung.md');
}
