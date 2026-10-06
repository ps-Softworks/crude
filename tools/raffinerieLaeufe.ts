// Raffinerie-Läufe (4.6, 0.4.20+18): prüft die Spielzahlen der Raffinerie über viele Welten
// zu Beginn (Runde 40) und am Ende (Runde 56) von Kapitel 2 und in Kapitel 3 (Runde 84/96, nach Zeitsprung II, mit
// Cracken und eigenen Tankstellen, die Benzin abnehmen). Je Welt und Stufe 1–maxLevel:
//   schlecht = Startmix bei voller Menge, gut = beste Einstellung (bestRefinerySetting),
// jeweils als Mehrerlös gegenüber dem Verkauf derselben Menge Rohöl (ohne Fixkosten), und je Ausbau:
// Anteil der Welten, in denen der Ausbau nach Fixkosten mehr bringt und sich in ≤ 16 bzw. ≤ 30 Runden bezahlt macht.
// Die Zufuhr ist nicht durch die Transportwege begrenzt (Kapitel 3 hat Fernleitungen).
// Aufruf: npx tsx tools/raffinerieLaeufe.ts   (optional: Anzahl Welten, Rohölpreis, Abnahme der Tankstellen in bbl)
import type { GameState } from '../src/sim/game';
import { newGame } from '../src/sim/game';
import { bestRefinerySetting, crackedBounds, crudeVsRefined, planRun, refineryTech, unlockRefinery, type ProductMix } from '../src/sim/refinery';
import type { MixBound, Product } from '../src/sim/refineryBalance';
import { loadBalance } from '../src/sim/testBalance';
import { newWorld, skipWorld } from '../src/sim/world';

const balance = loadBalance();
// Zum Ausprobieren: RAFF='{"unitCapacity":10000,"products":{"gasoline":{"basePrice":1.8}}}' überschreibt balance.refinery.
function mische(ziel: Record<string, unknown>, quelle: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(quelle)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && ziel[k] && typeof ziel[k] === 'object') mische(ziel[k] as Record<string, unknown>, v as Record<string, unknown>);
    else ziel[k] = v;
  }
}
if (process.env.RAFF) mische(balance.refinery as unknown as Record<string, unknown>, JSON.parse(process.env.RAFF));
const R = balance.refinery;
const anzahl = Number(process.argv[2] ?? 20);
const preis = Number(process.argv[3] ?? R.crudeRef);
const abnahmeK3 = Number(process.argv[4] ?? 15_000);
const crack = balance.research.techs.find((t) => (t.effects as Record<string, number>).gasolineYield)?.effects as Record<string, number> | undefined;
const crackPlus = Number(process.env.CRACK ?? crack?.gasolineYield ?? 0);

function bounds(k3: boolean): Record<Product, MixBound> {
  const b = refineryTech(balance, 1).mix;
  return k3 ? crackedBounds(b, crackPlus) : b;
}

function lage(seed: string, level: number, runde: number): GameState {
  const g = newGame(seed, balance);
  const worldModel = skipWorld(newWorld(seed, balance.worldModel), balance.worldModel, runde);
  const s = unlockRefinery(
    { ...g, startYear: R.products.kerosene.trend.refYear + Math.floor((runde - 40) / 4), round: 1, worldModel, oilStock: 400_000, royaltyOil: 0, postedPrice: preis },
    balance,
  );
  return { ...s, logistics: { ...s.logistics, pipeline: 'ready' }, refinery: { ...s.refinery!, level } };
}

function gewinn(s: GameState, mix: ProductMix, intake: number, abnahme: number): number {
  const st = { ...s, refinery: { ...s.refinery!, mix, intake } };
  const crude = Math.floor(intake * s.refinery!.level * R.unitCapacity);
  const run = planRun(st, balance, crude, { stationOfftake: abnahme });
  return run.revenue - run.operating - run.feed - crude * crudeVsRefined(st, balance).crudeNet;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const tsd = (v: number) => `${(v / 1000).toFixed(1)}k`;
const pct = (n: number) => `${Math.round((n / anzahl) * 100)} %`;

console.log(
  `Raffinerie-Läufe: ${anzahl} Welten, Rohöl ${preis.toFixed(2)} $, Stufe = ${R.unitCapacity} bbl, Ausbau ${R.expandCost} $, Fixkosten ${R.upkeepPerLevel} $/Stufe; ` +
    `Mehrerlös gegenüber Rohölverkauf je Runde (ohne Fixkosten). Kapitel 3: Cracken +${crackPlus * 100} % Benzin, Tankstellen nehmen ${abnahmeK3} bbl ab.`,
);
for (const [runde, k3] of [
  [40, false],
  [56, false],
  [84, true],
  [96, true],
] as const) {
  const abnahme = k3 ? abnahmeK3 : 0;
  const b = bounds(k3);
  const besteJe: number[][] = [];
  console.log(`\nRunde ${runde}${k3 ? ' (Kapitel 3)' : ''}:`);
  for (let level = 1; level <= R.maxLevel; level++) {
    const schlecht: number[] = [];
    const gut: number[] = [];
    const mengen: number[] = [];
    for (let i = 0; i < anzahl; i++) {
      const s = lage(`raff${i}`, level, runde);
      schlecht.push(gewinn(s, R.startMix, 1, abnahme));
      const best = bestRefinerySetting(s, balance, { bounds: b, stationOfftake: abnahme, unlimitedFeed: true });
      gut.push(best.gain);
      mengen.push(best.intake);
      (besteJe[i] ??= []).push(best.gain);
    }
    let lohnt = '';
    if (level >= 2) {
      let n = 0;
      let schnell = 0;
      let mittel = 0;
      for (let i = 0; i < anzahl; i++) {
        const mehr = besteJe[i][level - 1] - besteJe[i][level - 2] - R.upkeepPerLevel;
        if (mehr > 0) n++;
        if (mehr > 0 && R.expandCost / mehr <= 16) schnell++;
        if (mehr > 0 && R.expandCost / mehr <= 30) mittel++;
      }
      lohnt = ` | Ausbau: lohnt ${pct(n)}, bezahlt ≤ 16 R. ${pct(schnell)}, ≤ 30 R. ${pct(mittel)}`;
    }
    const crude = level * R.unitCapacity;
    console.log(
      `  Stufe ${level}: schlecht ${tsd(median(schlecht))} (${(median(schlecht) / crude).toFixed(2)} $/bbl) | gut ${tsd(median(gut))} (${(median(gut) / (crude * median(mengen))).toFixed(2)} $/bbl bei ${Math.round(median(mengen) * 100)} %)${lohnt}`,
    );
  }
}
