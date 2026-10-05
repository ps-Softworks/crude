// Messung „Termine als Hauptwerkzeug“, Etappe 2 (Plan: Abnahme Etappe 2): spielt den Standard-Bot
// (ausgewogen) mit allen Ereignissen über viele Seeds in vier Varianten der Preis- und Fracht-Karten
// (balance.yaml bots.plans.balanced):
//   Grund     wie in balance.yaml (verhandelt mit Thorne, sonst keine Karten),
//   Preis     dazu Förderbremse, Liefervertrag, Gerücht, Crane feilschen,
//   ohneFracht keine Karte (auch nicht Thorne),
//   Fracht    Thorne, Brennan, Transportgemeinschaft.
// Gemessen: Preiswirkung der Förderbremse, cartelCollapse, pactValue, priceGain, contractLoss,
// Tarifsenkung, freightGain, Bluff-Quote und der höchste Preis. Die Zielwerte aus npm run bots stehen
// in docs/botlaeufe.md.
// Aufruf: npx tsx tools/termineMessung2.ts [Seeds] – schreibt nur mit „--schreiben“ nach docs/plan-termine-messung.md.
// Zum Ausprobieren: --set pfad=wert (mehrfach) verbiegt einzelne Zahlen, z. B. --set freight.resistance.base=1.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Balance } from '../src/sim/balance';
import { playGame, type GameResult } from '../src/sim/bots';
import type { BotPlans } from '../src/sim/pricingBalance';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
// --set pfad=wert: einzelne Zahlen oder Schalter zum Ausprobieren verbiegen (nicht mit --schreiben gedacht).
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] !== '--set') continue;
  const [pfad, roh] = process.argv[i + 1].split('=');
  const teile = pfad.split('.');
  let o = balance as unknown as Record<string, unknown>;
  for (const t of teile.slice(0, -1)) o = o[t] as Record<string, unknown>;
  o[teile.at(-1)!] = roh === 'true' ? true : roh === 'false' ? false : Number.isNaN(Number(roh)) ? roh : Number(roh);
  console.log(`gesetzt: ${pfad} = ${roh}`);
}
const catalog = loadEvents();
const seeds = Number(process.argv.find((a, i) => /^\d+$/.test(a) && process.argv[i - 1] !== '--set') ?? 500);
const schreiben = process.argv.includes('--schreiben');
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number, d = 2) => x.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const geld = (x: number) => `${Math.round(x).toLocaleString('de-DE')} $`;
const mittel = (xs: readonly number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: readonly number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const AUS: BotPlans = { cartel: false, contract: false, rumour: false, crane: false, thorne: false, brennan: false, pool: false };
function mit(plans: Partial<BotPlans>): Balance {
  return { ...balance, botPlans: { ...balance.botPlans, balanced: { ...AUS, ...plans } } };
}

const VARIANTEN: Record<'grund' | 'preis' | 'ohneFracht' | 'fracht', Balance> = {
  grund: balance,
  preis: mit({ ...balance.botPlans.balanced, cartel: true, contract: true, rumour: true, crane: true }),
  ohneFracht: mit({ ...balance.botPlans.balanced, thorne: false, brennan: false, pool: false }),
  fracht: mit({ ...balance.botPlans.balanced, thorne: true, brennan: true, pool: true }),
};

const start = Date.now();
const ergebnisse: Record<keyof typeof VARIANTEN, GameResult[]> = { grund: [], preis: [], ohneFracht: [], fracht: [] };
for (let i = 0; i < seeds; i++) {
  const seed = `${balance.bots.seedPrefix}-${i}`;
  for (const [name, b] of Object.entries(VARIANTEN) as [keyof typeof VARIANTEN, Balance][]) {
    const r = playGame(seed, b, 'ausgewogen', catalog);
    // Der Zustand ist groß – für die Messung reichen die Kennzahlen.
    ergebnisse[name].push({ ...r, state: { ...r.state, log: [] } });
  }
}
const imperium = (rs: readonly GameResult[]) => mittel(rs.map((r) => r.empire));

// Förderbremse (Variante Preis)
const preis = ergebnisse.preis;
const wirkung = preis.flatMap((r) => r.plans.effects);
const ersteRunde = wirkung.filter((e) => e.first && e.share >= 0.4);
const alleAb40 = wirkung.filter((e) => e.share >= 0.4);
const bremsePlus = median(ersteRunde.map((e) => e.uplift));
const bremsePlusAlle = median(alleAb40.map((e) => e.uplift));
const gegruendet = preis.reduce((s, r) => s + r.plans.cartels, 0);
const geplatzt = preis.reduce((s, r) => s + r.plans.collapses, 0);
const collapse = gegruendet > 0 ? geplatzt / gegruendet : 0;
const pakte = preis.flatMap((r) => r.plans.pactValues);
const pactValue = mittel(pakte);
const priceGain = imperium(ergebnisse.grund) > 0 ? imperium(preis) / imperium(ergebnisse.grund) : 0;
const vertraege = preis.flatMap((r) => r.plans.contracts);
const contractLoss = vertraege.length > 0 ? vertraege.filter((g) => g < 0).length / vertraege.length : 0;

// Fracht (Variante Fracht und Grund)
const fracht = ergebnisse.fracht;
const tarifsenkung = mittel(fracht.map((r) => r.plans.tariffCut));
const tarifsenkungGrund = mittel(ergebnisse.grund.map((r) => r.plans.tariffCut));
const besuche = mittel(fracht.map((r) => r.plans.visits));
const freightGain = imperium(ergebnisse.ohneFracht) > 0 ? imperium(fracht) / imperium(ergebnisse.ohneFracht) : 0;
const riskiert = fracht.reduce((s, r) => s + r.plans.bluffsRisked - (r.state.freight?.bluffCheck ? 1 : 0), 0);
const erwischt = fracht.reduce((s, r) => s + r.plans.bluffsCaught, 0);
const bluff = riskiert > 0 ? erwischt / riskiert : 0;
const preisMax = Math.max(...Object.values(ergebnisse).flatMap((rs) => rs.map((r) => r.plans.maxPrice)));

const sekunden = ((Date.now() - start) / 1000).toFixed(1);
const zeile = (name: string, ziel: string, ist: string, ok: boolean) => `| ${name} | ${ziel} | ${ist} | ${ok ? 'ja' : 'nein'} |`;
const tabelle = [
  '| Kriterium | Ziel (Plan) | Ist | erfüllt |',
  '| --- | --- | ---: | :---: |',
  zeile(
    'Förderbremse: Preis der Folgerunde bei Kartellanteil ≥ 40 % (Median gegen „ohne Bremse“)',
    '+10–18 %',
    `+${prozent(bremsePlus)} (${ersteRunde.length} Gründungen; alle Bremsrunden +${prozent(bremsePlusAlle)})`,
    bremsePlus >= 0.1 && bremsePlus <= 0.18,
  ),
  zeile('cartelCollapse: Anteil geplatzter Förderbremsen', '0,3–0,6', `${zahl(collapse)} (${geplatzt} von ${gegruendet})`, collapse >= 0.3 && collapse <= 0.6),
  zeile('pactValue: Ø Mehrerlös je Förderbremse', '300–2.500 $', `${geld(pactValue)} (${pakte.length} Pakte)`, pactValue >= 300 && pactValue <= 2500),
  zeile('priceGain: Ø Imperium mit Preis-Aktionen ÷ ohne', '1,05–1,25', `${zahl(priceGain, 3)} (${geld(imperium(preis))} gegen ${geld(imperium(ergebnisse.grund))})`, priceGain >= 1.05 && priceGain <= 1.25),
  zeile('contractLoss: Anteil verlustreicher Lieferverträge', '0,2–0,5', `${zahl(contractLoss)} (${vertraege.length} Verträge)`, contractLoss >= 0.2 && contractLoss <= 0.5),
  zeile('Ø Tarifsenkung beim ausgewogenen Bot (je Partie)', '0,05–0,15 $', `${zahl(tarifsenkung)} $ (${zahl(besuche, 1)} Besuche je Partie; nur Thorne: ${zahl(tarifsenkungGrund)} $)`, tarifsenkung >= 0.05 && tarifsenkung <= 0.15),
  zeile('freightGain: Ø Imperium mit Fracht-Aktionen ÷ ohne', '1,03–1,15', `${zahl(freightGain, 3)} (${geld(imperium(fracht))} gegen ${geld(imperium(ergebnisse.ohneFracht))})`, freightGain >= 1.03 && freightGain <= 1.15),
  zeile('Bluff erwischt (Anteil der riskierten Fälle)', '20–60 %', `${prozent(bluff)} (${erwischt} von ${riskiert})`, bluff >= 0.2 && bluff <= 0.6),
  zeile('Höchster Posted Price in allen Varianten', '≤ 1,60 $ (priceMax)', `${zahl(preisMax)} $`, preisMax <= balance.market.priceMax),
].join('\n');
const varianten = [
  '| Variante (Standard-Bot) | Ø Imperium | Kapitelziel | Pleite |',
  '| --- | ---: | ---: | ---: |',
  ...(Object.entries(ergebnisse) as [string, GameResult[]][]).map(
    ([name, rs]) => `| ${name} | ${geld(imperium(rs))} | ${prozent(mittel(rs.map((r) => (r.goal ? 1 : 0))))} | ${prozent(mittel(rs.map((r) => (r.bankrupt ? 1 : 0))))} |`,
  ),
].join('\n');

console.log(tabelle);
console.log(`\n${varianten}`);
console.log(`\n${seeds} Seeds × 4 Varianten in ${sekunden} s.`);

if (schreiben) {
  const datei = new URL('docs/plan-termine-messung.md', root);
  const alt = readFileSync(datei, 'utf8');
  const MARKE = '<!-- Messung Etappe 2: npx tsx tools/termineMessung2.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->';
  const ENDE = '<!-- Ende der Messung Etappe 2 -->';
  const block = `${MARKE}\n\nStand: ${new Date().toISOString().slice(0, 10)} · Version ${version} · ${seeds} Seeds (\`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${seeds - 1}\`), Standard-Bot mit allen ${catalog.length} Ereignissen, je Seed vier Varianten der Karten\n\n${tabelle}\n\n${varianten}\n\n${ENDE}`;
  const neu = alt.includes(MARKE) && alt.includes(ENDE) ? alt.slice(0, alt.indexOf(MARKE)) + block + alt.slice(alt.indexOf(ENDE) + ENDE.length) : `${alt}\n${block}\n`;
  writeFileSync(datei, neu);
  console.log('Geschrieben: docs/plan-termine-messung.md');
}
