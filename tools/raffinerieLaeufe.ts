// Raffinerie-Läufe (4.6): prüft die Spielzahlen der Raffinerie über viele Welten
// zu Beginn (Runde 40) und am Ende (Runde 56) von Kapitel 2. Je Welt und Stufe:
// der Startmix bei voller Menge gegen die beste Einstellung (Mix in 2-%-Schritten,
// Menge in 5-%-Schritten), jeweils als Mehrerlös gegenüber dem Verkauf derselben
// Menge Rohöl (ohne Fixkosten). Ersatz für Bot-Läufe, solange es Kapitel 2 nicht gibt.
// Aufruf: npx tsx tools/raffinerieLaeufe.ts   (optional: Anzahl Welten, Rohölpreis)
import type { GameState } from '../src/sim/game';
import { newGame } from '../src/sim/game';
import { crudeVsRefined, plannedCrude, planRun, refineryTech, refineryWorld, unlockRefinery, type ProductMix } from '../src/sim/refinery';
import { loadBalance } from '../src/sim/testBalance';
import { newWorld, skipWorld } from '../src/sim/world';

const balance = loadBalance();
const R = balance.refinery;
const anzahl = Number(process.argv[2] ?? 20);
const preis = Number(process.argv[3] ?? R.crudeRef);
const bounds = refineryTech(balance, 1).mix;

function lage(seed: string, level: number, runde: number): GameState {
  const g = newGame(seed, balance);
  const worldModel = skipWorld(newWorld(seed, balance.worldModel), balance.worldModel, runde);
  const s = unlockRefinery(
    { ...g, startYear: R.products.kerosene.trend.refYear + Math.floor((runde - 40) / 4), round: 1, worldModel, oilStock: 200_000, royaltyOil: 0, postedPrice: preis },
    balance,
  );
  return { ...s, logistics: { ...s.logistics, pipeline: 'ready' }, refinery: { ...s.refinery!, level } };
}

function gewinn(s: GameState, mix: ProductMix, intake: number): number {
  const st = { ...s, refinery: { ...s.refinery!, mix, intake } };
  const crude = plannedCrude(st, balance);
  const run = planRun(st, balance, crude);
  return run.revenue - run.operating - run.feed - crude * crudeVsRefined(st, balance).crudeNet;
}

function mixe(): ProductMix[] {
  const out: ProductMix[] = [];
  const schritte = (p: keyof ProductMix) => {
    const xs: number[] = [];
    for (let v = Math.round(bounds[p].min * 100); v <= Math.round(bounds[p].max * 100); v += 2) xs.push(v);
    return xs;
  };
  for (const k of schritte('kerosene'))
    for (const l of schritte('lubricant'))
      for (const g of schritte('gasoline')) {
        const f = 100 - k - l - g;
        if (f < bounds.fuelOil.min * 100 || f > bounds.fuelOil.max * 100) continue;
        out.push({ kerosene: k / 100, lubricant: l / 100, fuelOil: f / 100, gasoline: g / 100 });
      }
  return out;
}

const MIXE = mixe();
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const tsd = (v: number) => `${(v / 1000).toFixed(1)}k`;

console.log(`Raffinerie-Läufe: ${anzahl} Welten, Rohöl ${preis.toFixed(2)} $, mit Pipeline, Mehrerlös gegenüber Rohölverkauf je Runde (ohne Fixkosten ${R.upkeepPerLevel} $/Stufe)`);
for (const [level, runde] of [
  [1, 40],
  [1, 56],
  [2, 40],
  [2, 56],
] as const) {
  const start: number[] = [];
  const best: number[] = [];
  const intakes: number[] = [];
  const nachfrage: number[] = [];
  for (let i = 0; i < anzahl; i++) {
    const s = lage(`raff${i}`, level, runde);
    nachfrage.push(refineryWorld(s, balance).demand);
    start.push(gewinn(s, R.startMix, 1));
    let top = -Infinity;
    let topIntake = 1;
    for (const m of MIXE)
      for (let k = 6; k <= 20; k++) {
        const g = gewinn(s, m, k / 20);
        if (g > top) {
          top = g;
          topIntake = k / 20;
        }
      }
    best.push(top);
    intakes.push(topIntake);
  }
  console.log(
    `Stufe ${level}, Runde ${runde}: Welt-Nachfrage ${median(nachfrage).toFixed(2)} | Startmix 100 %: ${tsd(median(start))} | beste Einstellung: ${tsd(median(best))} bei Menge ${Math.round(median(intakes) * 100)} %`,
  );
}
