// Messung „Spielspaß-Durchgang: Tieferbohren“ (Kapitel 1): Ist „tiefer oder aufgeben?“ eine
// echte Wahl? Spielt die drei planenden Bots (vorsichtig, gierig, ausgewogen) mit allen
// Ereignissen über viele Seeds – wie npm run bots – und schaut bei jeder Tiefer-Entscheidung hin:
//   wahre Chance   deeperChance mit der verdeckten Fundchance q der Ranch, dazu Jacobs eigene Hinweise
//                  auf dieser Ranch (Bayes wie posteriorChance, aber mit q statt dem Zonenwert): Die
//                  Hinweise hängen an der echten Geologie, q allein unterschätzt die Funde bei den
//                  Ranches, die die Bots nach guten Hinweisen auswählen,
//   nur q          deeperChance mit q allein (zum Vergleich),
//   Geologe        die Chance, die das Ranch-Fenster zeigt (stageOutlook),
//   Schwelle       ab welcher Chance sich das Weiterbohren lohnt (deeperOutlook.breakEven),
//   richtig        Weiterbohren lohnt nach wahrer Chance (wahre Chance ≥ Schwelle).
// Dazu: wie oft weitergebohrt wurde und wie oft der Bot richtig lag, Treffer je Stufe, Anteil der
// Funde aus 600/900 m, Ø Wert und Anfangsrate tiefer Funde, Geologe gegen echte Trefferquote.
// Aufruf: npx tsx tools/tiefbohrung.ts [Seeds]   (Standard 500)
import { botTurn, newLedger, type Strategy } from '../src/sim/bots';
import { deeperOutlook } from '../src/sim/deeper';
import { deeperChance } from '../src/sim/drilling';
import { clueFactor, knowledgeOf, posteriorChance } from '../src/sim/exploration';
import { trueChance } from '../src/sim/forecast';
import type { Parcel } from '../src/sim/geology';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { Rng, seedFromString } from '../src/sim/rng';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';

const balance = loadBalance();
const catalog = loadEvents();
const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 500);
const STRATEGIEN: Strategy[] = ['vorsichtig', 'gierig', 'ausgewogen'];
const tage = balance.bots.daysPerRound;

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number, d = 0) => x.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const mittel = (xs: readonly number[]) => (xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length > 0 ? s[Math.floor((s.length - 1) / 2)] : 0;
};

/** Fundchance aus q und Jacobs eigenen Hinweisen auf dieser Ranch (exakter Bayes: Hinweise hängen nur an der Geologie). */
function wahreFundchance(state: GameState, parcel: Parcel): number {
  const q = trueChance(balance, parcel);
  let logOdds = Math.log(q / (1 - q));
  for (const clue of knowledgeOf(state, parcel.id).clues) logOdds += Math.log(clueFactor(balance, clue));
  return 1 / (1 + Math.exp(-logOdds));
}

interface Entscheidung {
  strategie: Strategy;
  stufe: number;
  wahr: number;
  nurQ: number;
  basis: number;
  geologe: number;
  schwelle: number;
  wert: number;
  tiefer: boolean;
  treffer: boolean;
}

interface Fund {
  stufe: number;
  rate: number;
  barrel: number;
  /** Wert laut Rechenhilfe bei der Entscheidung (nur tiefe Funde). */
  wert?: number;
}

const entscheidungen: Entscheidung[] = [];
const funde: Fund[] = [];
const start = Date.now();

for (const strategie of STRATEGIEN) {
  for (let i = 0; i < seeds; i++) {
    const seed = `${balance.bots.seedPrefix}-${i}`;
    let state: GameState = newGame(seed, balance, catalog);
    const rng = new Rng(seedFromString(`${seed}-bot`));
    const ledger = newLedger();
    const wertBeiEntscheidung = new Map<string, number>();
    while (!state.finished) {
      const offen = state.wells.filter((w) => w.status === 'decision');
      const vorher = new Map(
        offen.map((w) => {
          const parcel = state.parcels.find((p) => p.id === w.parcelId)!;
          return [w.id, { w, parcel, o: deeperOutlook(state, balance, w.parcelId) }] as const;
        }),
      );
      const gezogen = botTurn(state, balance, strategie, rng, catalog, ledger);
      for (const { w, parcel, o } of vorher.values()) {
        if (!o) continue;
        const nachher = gezogen.wells.find((x) => x.id === w.id);
        const tiefer = nachher?.status === 'drilling' && nachher.stage === w.stage + 1;
        if (tiefer) wertBeiEntscheidung.set(w.id, o.value);
        entscheidungen.push({
          strategie,
          stufe: w.stage + 1,
          wahr: deeperChance(balance, parcel, w.stage, wahreFundchance(state, parcel)),
          nurQ: deeperChance(balance, parcel, w.stage),
          basis: deeperChance(balance, parcel, w.stage, posteriorChance(state, balance, parcel.id)),
          geologe: o.chance ?? 0,
          schwelle: o.breakEven,
          wert: o.value,
          tiefer,
          treffer: w.oilStage === w.stage + 1,
        });
      }
      state = endRound(gezogen, balance, catalog);
    }
    // Funde am Kapitelende: nur erste Bohrlöcher je Ranch (weitere gehen ohnehin auf dieselbe Tiefe).
    const erste = new Set<string>();
    for (const w of state.wells) {
      if (w.status !== 'found' || !w.production || erste.has(w.parcelId)) continue;
      erste.add(w.parcelId);
      funde.push({ stufe: w.stage, rate: w.production.initialRate / tage, barrel: w.production.total, wert: wertBeiEntscheidung.get(w.id) });
    }
  }
}

const zeile = (name: string, es: readonly Entscheidung[]) => {
  const richtig = es.filter((e) => e.wahr >= e.schwelle);
  const tiefer = es.filter((e) => e.tiefer);
  const botRichtig = es.filter((e) => e.tiefer === e.wahr >= e.schwelle);
  const treffer = tiefer.filter((e) => e.treffer);
  return `| ${name} | ${es.length} | ${prozent(richtig.length / Math.max(1, es.length))} | ${prozent(tiefer.length / Math.max(1, es.length))} | ${prozent(botRichtig.length / Math.max(1, es.length))} | ${prozent(treffer.length / Math.max(1, tiefer.length))} | ${prozent(mittel(es.map((e) => e.wahr)))} | ${prozent(mittel(es.map((e) => e.nurQ)))} | ${prozent(mittel(es.map((e) => e.basis)))} | ${prozent(mittel(es.map((e) => e.geologe)))} | ${prozent(mittel(es.map((e) => (e.treffer ? 1 : 0))))} | ${prozent(median(es.map((e) => e.schwelle)))} | ${zahl(mittel(es.map((e) => e.wert)))} $ |`;
};

const kopf = [
  '| Entscheidungen | Anzahl | Weiterbohren richtig (wahre Chance ≥ Schwelle) | weitergebohrt | Bot lag richtig | Treffer, wo weitergebohrt | Ø wahre Chance | Ø nur q | Ø Jacobs Wissen | Ø Geologe | echte Trefferquote | Median Schwelle „lohnt ab“ | Ø Wert eines Funds |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];
const tabelle = [
  ...kopf,
  zeile('alle', entscheidungen),
  ...STRATEGIEN.map((s) => zeile(s, entscheidungen.filter((e) => e.strategie === s))),
  ...[2, 3].map((st) => zeile(`auf ${balance.drilling.stages[st - 1].depth} m`, entscheidungen.filter((e) => e.stufe === st))),
].join('\n');

const fundZeilen = [
  '| Tiefe | Anteil der Funde | Ø Anfangsrate bbl/Tag | Ø Barrel bis Kapitelende | Ø Wert laut Rechenhilfe |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...balance.drilling.stages.map((st, i) => {
    const f = funde.filter((x) => x.stufe === i + 1);
    const w = f.map((x) => x.wert).filter((x): x is number => x !== undefined);
    return `| ${st.depth} m | ${prozent(f.length / Math.max(1, funde.length))} | ${zahl(mittel(f.map((x) => x.rate)))} | ${zahl(mittel(f.map((x) => x.barrel)))} | ${w.length > 0 ? `${zahl(mittel(w))} $` : '–'} |`;
  }),
].join('\n');

console.log(tabelle);
console.log(`\n${fundZeilen}`);
console.log(`\n${funde.length} Funde (erste Bohrlöcher). ${seeds} Seeds × ${STRATEGIEN.length} Bots in ${((Date.now() - start) / 1000).toFixed(1)} s.`);
