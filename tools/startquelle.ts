// Startquelle (0.4.20+25): Wie viel Öl braucht die sichere erste Quelle für einen sauberen Anfang?
// Maßstab (Philipp): Sie soll mindestens reichen, bis eine weitere Quelle Öl bringt, und sich selbst lohnen.
// Spielt Kapitel 1 je Menge (lease.startOptions.sureReserves) mit den vier planenden Bots und mit Ereignissen.
// Aufruf: npx tsx tools/startquelle.ts [Partien je Bot, Standard 100] [Mengen, z. B. 8000,12000,20000]
import type { Balance } from '../src/sim/balance';
import { botTurn, hintTurn, newLedger, type Planner } from '../src/sim/bots';
import { TRANSPORT_MODES } from '../src/sim/balance';
import { deeperOutlook, deeperPays } from '../src/sim/deeper';
import { abandonWell, activeWells, drillDeeper, fishWell, stageCost, startDrilling } from '../src/sim/drilling';
import { suggestRide } from '../src/sim/exploration';
import { buyLease, leaseOf, leaseTerms, optionOf } from '../src/sim/lease';
import { bookCard } from '../src/sim/plans';
import { tutorialHint } from '../src/sim/tutorial';
import { capacityLeft, sellOil } from '../src/sim/transport';
import { chapterCheck } from '../src/sim/chapter';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { Rng, seedFromString } from '../src/sim/rng';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { netPrice } from '../src/sim/transport';

const basis = loadBalance();
const catalog = loadEvents();
const n = Number(process.argv[2] ?? 100);
const mengen = (process.argv[3] ?? '6000,10000,15000,20000,30000,45000').split(',').map(Number);
const BOTS: (Planner | 'einsteiger')[] = ['einsteiger', 'vorsichtig', 'ausgewogen', 'gierig', 'betruegerisch'];

interface Partie {
  pleite: boolean;
  ziel: boolean;
  /** Runde, in der die Startquelle fündig wurde (null = nie gebohrt). */
  start: number | null;
  /** Runde, in der eine Quelle auf einer anderen Ranch fündig wurde. */
  zweite: number | null;
  /** Förderung der Startquelle in der Runde der zweiten Quelle (bbl). */
  rateBeiZweiter: number | null;
  /** Anfangsförderung der Startquelle (bbl je Runde). */
  rateStart: number;
  /** Netto-Erlös der Startquelle (Preis − Bahnfracht − Förderzins) minus Bohrkosten, bis Kapitelende. */
  gewinn: number;
  /** … bis zur zweiten Quelle (oder Kapitelende). */
  gewinnBisZweite: number;
  /** Letzte Runde, in der die Startquelle noch förderte (null = nie). */
  zuletzt: number | null;
  /** Rate der Startquelle am Kapitelende. */
  rateEnde: number;
  /** Kredit aufgenommen, bevor die zweite Quelle kam. */
  kreditVorher: boolean;
  /** Niedrigste Kasse vor der zweiten Quelle. */
  kasseTief: number;
}

/**
 * Einsteiger: folgt den Hinweisen (Startquelle einlösen und bohren, reiten, verkaufen). Danach sucht er
 * nur mit eigenem Geld weiter – kein Kredit, ein Loch nach dem anderen, kein zweites Loch auf der
 * Startranch: reiten, die beste Ranch (Prognose ≥ 40 %) pachten, sobald Pacht + Bohrung + 500 $ Reserve
 * in der Kasse sind, tiefer nur, wenn es sich lohnt. Verkauft jede Runde alles auf dem besten Weg.
 */
function einsteigerZug(state: GameState, balance: Balance): GameState {
  if (tutorialHint(state, balance) !== null) return hintTurn(state, balance);
  const tun = (r: { ok: true; state: GameState } | { ok: false }) => (r.ok ? r.state : state);
  // Verkaufen
  for (const mode of [...TRANSPORT_MODES].sort((a, b) => netPrice(state, balance, b) - netPrice(state, balance, a))) {
    const menge = Math.min(Math.floor(state.oilStock), capacityLeft(state, balance, mode));
    if (menge > 0 && netPrice(state, balance, mode) > 0) state = tun(sellOil(state, balance, mode, menge));
  }
  // Wartende Bohrung: tiefer, bergen oder aufgeben
  for (const w of state.wells.filter((x) => x.status === 'decision' || x.status === 'stuck')) {
    if (w.status === 'stuck') state = tun(fishWell(state, balance, w.parcelId));
    else if (deeperPays(deeperOutlook(state, balance, w.parcelId))) state = tun(drillDeeper(state, balance, w.parcelId));
    if (state.wells.find((x) => x.id === w.id)?.status === w.status) state = tun(abandonWell(state, balance, w.parcelId));
  }
  // Reiten (kostet Termine, kein Geld)
  const ziel = suggestRide(state, balance, state.cash);
  if (ziel) state = tun(bookCard(state, balance, catalog, 'ritt', ziel));
  // Neue Bohrung nur ohne laufende und nur aus eigener Kasse
  if (activeWells(state).length === 0) {
    const s = state;
    const kandidaten = s.parcels
      .filter((p) => !p.discovery && !p.sure && !leaseOf(s, p.id) && !optionOf(s, p.id) && (s.forecasts[p.id] ? (s.forecasts[p.id].low + s.forecasts[p.id].high) / 2 : 0) >= 40)
      .sort((a, b) => s.forecasts[b.id].low + s.forecasts[b.id].high - s.forecasts[a.id].low - s.forecasts[a.id].high || (a.id < b.id ? -1 : 1));
    for (const p of kandidaten) {
      if (leaseTerms(s, balance, p.id).bonus + stageCost(balance, 1) + 500 > s.cash) continue;
      const pacht = buyLease(s, balance, p.id);
      if (!pacht.ok) continue;
      const bohrung = startDrilling(pacht.state, balance, p.id);
      if (bohrung.ok) state = bohrung.state;
      break;
    }
  }
  return state;
}

function spiele(seed: string, balance: Balance, bot: Planner | 'einsteiger'): Partie {
  let state = newGame(seed, balance, catalog);
  const sicher = state.parcels.find((p) => p.sure)!.id;
  const royalty = state.options[0].royalty;
  const rng = new Rng(seedFromString(`${seed}-bot`));
  const ledger = newLedger();
  const p: Partie = { pleite: false, ziel: false, start: null, zweite: null, rateBeiZweiter: null, rateStart: 0, zuletzt: null, rateEnde: 0, gewinn: 0, gewinnBisZweite: 0, kreditVorher: false, kasseTief: state.cash };
  const gefoerdert = (s: GameState) => s.wells.filter((w) => w.parcelId === sicher).reduce((sum, w) => sum + (w.production?.total ?? 0), 0);
  const rate = (s: GameState) => s.wells.filter((w) => w.parcelId === sicher && w.status === 'found').reduce((sum, w) => sum + (w.production?.lastRate ?? 0), 0);
  const kosten = (s: GameState) => s.wells.filter((w) => w.parcelId === sicher).reduce((sum, w) => sum + w.spent, 0);
  let gezahlt = 0;
  let runden = 0;
  while (!state.finished && state.chapter === 1 && runden++ < state.totalRounds + 5) {
    const schuldenVorher = state.loans.length;
    const gezogen = bot === 'einsteiger' ? einsteigerZug(state, balance) : botTurn(state, balance, bot, rng, catalog, ledger);
    if (p.zweite === null && gezogen.loans.length > schuldenVorher) p.kreditVorher = true;
    const vorher = gefoerdert(gezogen);
    const runde = gezogen.round;
    state = endRound(gezogen, balance, catalog);
    const neu = gefoerdert(state) - vorher;
    const erloes = neu * netPrice(state, balance, 'rail') * (1 - royalty);
    const neueKosten = kosten(state) - gezahlt;
    gezahlt += neueKosten;
    p.gewinn += erloes - neueKosten;
    if (p.zweite === null) {
      p.gewinnBisZweite += erloes - neueKosten;
      p.kasseTief = Math.min(p.kasseTief, state.cash);
    }
    if (rate(state) > 0) p.zuletzt = runde;
    if (p.start === null && state.wells.some((w) => w.parcelId === sicher && w.status === 'found')) {
      p.start = runde;
      p.rateStart = state.wells.find((w) => w.parcelId === sicher && w.status === 'found')!.production?.initialRate ?? 0;
    }
    if (p.zweite === null && state.wells.some((w) => w.parcelId !== sicher && w.status === 'found')) {
      p.zweite = runde;
      p.rateBeiZweiter = rate(state);
    }
  }
  p.rateEnde = rate(state);
  p.pleite = state.ending === 'pleite';
  p.ziel = !p.pleite && chapterCheck(state, balance).passed;
  return p;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fmt = (x: number) => (Number.isNaN(x) ? '–' : Math.round(x).toLocaleString('de-DE'));

console.log(`| Menge (bbl) | Bot | Anfangsrate | Startquelle fördert bis Runde (Median) | 2. Quelle: Anteil, Runde Median / 90 % | reicht bis 2. Quelle | ohne 2. Quelle: fördert noch am Ende | lohnt sich (Median Gewinn) | Pleite | Kapitelziel |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
for (const menge of mengen) {
  const balance: Balance = { ...basis, lease: { ...basis.lease, startOptions: { ...basis.lease.startOptions, sureReserves: menge } } };
  const alle: Partie[] = [];
  for (const bot of BOTS) {
    const ps = Array.from({ length: n }, (_, i) => spiele(`${basis.bots.seedPrefix}-${i}`, balance, bot));
    if (bot !== 'einsteiger') alle.push(...ps);
    zeile(menge, bot, ps);
  }
  zeile(menge, '**alle Bots**', alle);
}

function quantil(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

function zeile(menge: number, bot: string, ps: Partie[]): void {
  const gebohrt = ps.filter((p) => p.start !== null);
  const zweite = ps.filter((p) => p.zweite !== null);
  const ohne = gebohrt.filter((p) => p.zweite === null);
  // „Reicht“: Die Startquelle war zuerst da und fördert noch, wenn die zweite kommt.
  const zuerst = zweite.filter((p) => p.start !== null && p.start <= p.zweite!);
  const reicht = zuerst.filter((p) => (p.rateBeiZweiter ?? 0) > 0);
  console.log(
    '| ' +
      [
        fmt(menge),
        bot,
        fmt(median(gebohrt.map((p) => p.rateStart))),
        fmt(median(gebohrt.map((p) => p.zuletzt ?? 0))),
        `${pct(zweite.length / ps.length)}, R ${fmt(median(zweite.map((p) => p.zweite!)))} / ${fmt(quantil(zweite.map((p) => p.zweite!), 0.9))}`,
        pct(reicht.length / Math.max(1, zuerst.length)),
        pct(ohne.filter((p) => p.rateEnde > 0).length / Math.max(1, ohne.length)),
        `${pct(gebohrt.filter((p) => p.gewinn > 0).length / Math.max(1, gebohrt.length))} (${fmt(median(gebohrt.map((p) => p.gewinn)))} $)`,
        pct(ps.filter((p) => p.pleite).length / ps.length),
        pct(ps.filter((p) => p.ziel).length / ps.length),
      ].join(' | ') +
      ' |',
  );
}
