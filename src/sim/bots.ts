// Bot-Läufe (GDD §17, Schritt 1.14): Die Simulation spielt ganze Partien ohne
// Grafik, mit drei Strategien – vorsichtig, gierig, zufällig. Daraus entstehen
// Bankrottquote und mittlerer Imperiumswert je Strategie für die Balance.
//
// Die Bots benutzen nur die öffentlichen Funktionen der Simulation, so wie der
// Schreibtisch. Ihr eigener Zufall kommt aus einem eigenen Rng – state.rng
// gehört der Welt und wird nie angefasst; Math.random kommt nicht vor.
// Die Zahlen stehen in content/balance.yaml unter bots.

import { TRANSPORT_MODES, type Balance } from './balance';
import { headroom, takeLoan } from './credit';
import { applyAction, parcelActions, type DeskActionKind } from './desk';
import { stageCost, wellOf } from './drilling';
import { chapterCheck } from './chapter';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { leaseOf, leaseTerms, optionOf } from './lease';
import { Rng, seedFromString } from './rng';
import { capacityLeft, netPrice, sellOil } from './transport';

export type Strategy = 'vorsichtig' | 'gierig' | 'zufaellig';
export const STRATEGIES: readonly Strategy[] = ['vorsichtig', 'gierig', 'zufaellig'];

/** Führt eine Aktion aus; bei ok:false bleibt alles, wie es war. */
function act(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind): GameState {
  const r = applyAction(state, balance, parcelId, kind);
  return r.ok ? r.state : state;
}

/**
 * Verkauft Öl aus dem Tank: Transportmittel mit dem höchsten Nettopreis zuerst,
 * jeweils bis zur freien Kapazität. share = Anteil des Tanks (1 = alles).
 * Ein Transportmittel, bei dem nach Fracht nichts übrig bleibt, wird nicht benutzt.
 */
function sell(state: GameState, balance: Balance, share: number): GameState {
  let rest = Math.floor(Math.floor(state.oilStock) * share);
  const modes = [...TRANSPORT_MODES].sort((a, b) => netPrice(state, balance, b) - netPrice(state, balance, a));
  for (const mode of modes) {
    if (rest <= 0) break;
    if (netPrice(state, balance, mode) <= 0) continue;
    const menge = Math.min(rest, capacityLeft(state, balance, mode), Math.floor(state.oilStock));
    if (menge <= 0) continue;
    const r = sellOil(state, balance, mode, menge);
    if (r.ok) {
      state = r.state;
      rest -= menge;
    }
  }
  return state;
}

/** Fundchance laut Geologe als Anteil 0–1 (die Prognose rechnet in Prozent). */
function chance(state: GameState, parcelId: string): number {
  const f = state.forecasts[parcelId];
  return f ? f.center / 100 : 0;
}

/** Freie Parzellen (weder gepachtet noch mit Option), beste Prognose zuerst. */
function freeParcels(state: GameState, minChance: number): string[] {
  return state.parcels
    .filter((p) => !p.discovery && !leaseOf(state, p.id) && !optionOf(state, p.id))
    .filter((p) => chance(state, p.id) >= minChance)
    .sort((a, b) => chance(state, b.id) - chance(state, a.id) || a.id.localeCompare(b.id))
    .map((p) => p.id);
}

function jacobsLeases(state: GameState): string[] {
  return state.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId);
}

function jacobsOptions(state: GameState): { parcelId: string; bonus: number }[] {
  return state.options.filter((o) => o.holder === 'jacob');
}

/** Offene Bohrungen, an denen Jacob entscheiden muss. */
function openWells(state: GameState) {
  return state.wells.filter((w) => w.status === 'decision' || w.status === 'stuck');
}

// --- vorsichtig ---------------------------------------------------------------

function cautiousTurn(state: GameState, balance: Balance): GameState {
  const { minChance, cashReserve, maxStage } = balance.bots.cautious;
  state = sell(state, balance, 1);
  for (const well of openWells(state)) {
    const next = well.stage + 1;
    const leistbar = next <= maxStage && next <= balance.drilling.stages.length && state.cash - stageCost(balance, next) >= cashReserve;
    const kind: DeskActionKind = well.status === 'decision' && leistbar ? 'deeper' : 'abandon';
    state = act(state, balance, well.parcelId, kind);
  }
  for (const option of jacobsOptions(state)) {
    if (state.cash - option.bonus >= cashReserve) state = act(state, balance, option.parcelId, 'exercise');
  }
  for (const parcelId of jacobsLeases(state)) {
    if (!wellOf(state, parcelId) && state.cash - stageCost(balance, 1) >= cashReserve) {
      state = act(state, balance, parcelId, 'drill');
    }
  }
  // Eine Option nur, wenn danach auch der Bonus noch bezahlbar ist – sonst verfällt
  // sie ungenutzt. Die beste Prognose, die sich das leisten kann.
  const best = freeParcels(state, minChance).find((id) => {
    const t = leaseTerms(state, balance, id);
    return state.cash - t.optionFee - t.bonus >= cashReserve;
  });
  if (best !== undefined) state = act(state, balance, best, 'option');
  return state;
}

// --- gierig -------------------------------------------------------------------

/**
 * Versucht die Aktion; fehlt Geld, leiht der Bot den fehlenden Betrag bei der
 * Bank (mindestens minLoan, höchstens headroom) und versucht es noch einmal.
 * keep: so viel Bargeld soll danach noch in der Kasse liegen.
 * Klappt es auch dann nicht, bleibt der Zustand ohne Kredit.
 */
function withLoan(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind, cost: number, keep = 0): GameState {
  if (state.cash - cost >= keep) {
    const first = applyAction(state, balance, parcelId, kind);
    if (first.ok) return first.state;
    if (state.cash >= cost) return state;
  }
  const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + keep - state.cash));
  if (amount > headroom(state, balance)) return state;
  const loan = takeLoan(state, balance, amount);
  if (!loan.ok) return state;
  const second = applyAction(loan.state, balance, parcelId, kind);
  return second.ok ? second.state : state;
}

/** Eigene Pachten ohne Bohrung. */
function undrilled(state: GameState): string[] {
  return jacobsLeases(state).filter((id) => !wellOf(state, id));
}

/**
 * Verzögerungszins, der am Rundenende fällig wird. Der gierige Bot behält ihn als
 * Bargeld – fehlt er, verfällt die Pacht sofort.
 */
function rentDue(state: GameState, balance: Balance): number {
  return undrilled(state).length * balance.lease.delayRental;
}

function greedyTurn(state: GameState, balance: Balance): GameState {
  state = sell(state, balance, 1);
  for (const well of openWells(state)) {
    if (well.status === 'stuck' || well.stage < balance.drilling.stages.length) {
      const vorher = state;
      state =
        well.status === 'stuck'
          ? withLoan(state, balance, well.parcelId, 'fish', balance.drilling.fishingCost, rentDue(state, balance))
          : withLoan(state, balance, well.parcelId, 'deeper', stageCost(balance, well.stage + 1), rentDue(state, balance));
      // Reicht auch der Kredit nicht, gibt der Bot auf – sonst bliebe der Turm
      // für den Rest des Kapitels an dieser Bohrung hängen.
      if (state === vorher) state = act(state, balance, well.parcelId, 'abandon');
    } else {
      // Tiefer geht es mit dem Turm nicht – dann bleibt nur aufgeben.
      state = act(state, balance, well.parcelId, 'abandon');
    }
  }
  for (const option of jacobsOptions(state)) {
    state = withLoan(state, balance, option.parcelId, 'exercise', option.bonus, rentDue(state, balance) + balance.lease.delayRental);
  }
  for (const parcelId of jacobsLeases(state)) {
    if (!wellOf(state, parcelId)) {
      state = withLoan(state, balance, parcelId, 'drill', stageCost(balance, 1), rentDue(state, balance) - balance.lease.delayRental);
    }
  }
  // Pachten, solange Kasse und Bankrahmen reichen – die beste Prognose zuerst,
  // die sich noch bezahlen lässt. Für jede ungebohrte Pacht bleibt Geld für die
  // erste Bohrstufe übrig; sonst verfiele die Pacht ungebohrt.
  for (;;) {
    const ungebohrt = undrilled(state).length;
    if (ungebohrt >= balance.bots.greedy.maxUndrilled) break;
    const geld = state.cash + headroom(state, balance) - (ungebohrt + 1) * stageCost(balance, 1);
    const best = freeParcels(state, balance.bots.greedy.minChance).find((id) => leaseTerms(state, balance, id).bonus <= geld);
    if (best === undefined) break;
    const bonus = leaseTerms(state, balance, best).bonus;
    // Bargeld für den Verzögerungszins behalten – ohne ihn verfällt die Pacht sofort.
    const next = withLoan(state, balance, best, 'lease', bonus, rentDue(state, balance) + balance.lease.delayRental);
    if (next === state) break;
    state = next;
  }
  return state;
}

// --- zufällig -----------------------------------------------------------------

/** Alle Aktionen, die gerade gehen, über alle Parzellen. */
export function okActions(state: GameState, balance: Balance): { parcelId: string; kind: DeskActionKind }[] {
  return state.parcels.flatMap((p) =>
    parcelActions(state, balance, p.id)
      .filter((a) => a.ok)
      .map((a) => ({ parcelId: p.id, kind: a.kind })),
  );
}

function randomTurn(state: GameState, balance: Balance, rng: Rng): GameState {
  state = sell(state, balance, rng.float());
  for (let i = 0; i < balance.bots.random.actionsPerRound; i++) {
    const moeglich = okActions(state, balance);
    if (moeglich.length === 0) break;
    const wahl = rng.pick(moeglich);
    state = act(state, balance, wahl.parcelId, wahl.kind);
  }
  return state;
}

/** Eine Runde Aktionen nach der Strategie – ohne endRound. */
export function botTurn(state: GameState, balance: Balance, strategy: Strategy, rng: Rng): GameState {
  if (state.finished) return state;
  switch (strategy) {
    case 'vorsichtig':
      return cautiousTurn(state, balance);
    case 'gierig':
      return greedyTurn(state, balance);
    case 'zufaellig':
      return randomTurn(state, balance, rng);
  }
}

export interface GameResult {
  bankrupt: boolean;
  /** Kapitelprüfung (2.11) bestanden. */
  goal: boolean;
  empire: number;
  rounds: number;
  state: GameState;
}

/** Spielt eine ganze Partie bis zum Ende des Kapitels oder bis zur Pleite. */
export function playGame(seed: string, balance: Balance, strategy: Strategy): GameResult {
  let state = newGame(seed, balance);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  let rounds = 0;
  while (!state.finished) {
    if (rounds >= state.totalRounds + 5) {
      throw new Error(`Partie ${seed} (${strategy}) endet nicht nach ${rounds} Runden.`);
    }
    state = endRound(botTurn(state, balance, strategy, rng), balance);
    rounds++;
  }
  const bankrupt = state.ending === 'pleite';
  return { bankrupt, goal: !bankrupt && chapterCheck(state, balance).passed, empire: empireValue(state, balance), rounds, state };
}

export interface BotRow {
  strategy: Strategy;
  games: number;
  bankruptRate: number;
  /** Anteil der Partien, in denen die Kapitelprüfung (2.11) bestanden ist. */
  goalRate: number;
  meanEmpire: number;
  /** Anteil der Seeds, in denen diese Strategie den höchsten Imperiumswert hat (Gleichstand wird geteilt). */
  winRate: number;
  /** Ø Kasse des Rivalen Bullard am Ende der Partie. */
  rivalCash: number;
  /** Ø fündige Quellen Bullards am Ende der Partie. */
  rivalWells: number;
}

/**
 * Wer gewinnt einen Seed? Die Strategie mit dem höchsten Imperiumswert. Eine
 * Pleite zählt immer als letzter Platz – auch hinter einem Imperiumswert unter
 * null, denn wer pleite ist, hat das Kapitel verloren. Bei Gleichstand teilen
 * sich die Besten den Sieg. Gibt je Strategie den Sieganteil 0–1 zurück.
 */
export function seedWinners(results: readonly { strategy: Strategy; bankrupt: boolean; empire: number }[]): Map<Strategy, number> {
  const rang = (r: { bankrupt: boolean; empire: number }) => (r.bankrupt ? -Infinity : r.empire);
  const bester = Math.max(...results.map(rang));
  const sieger = results.filter((r) => rang(r) === bester);
  return new Map(sieger.map((r) => [r.strategy, 1 / sieger.length]));
}

/** Spielt games Partien je Strategie, für jede Strategie mit denselben Seeds. */
export function runBots(balance: Balance, games = balance.bots.games): BotRow[] {
  const summe = new Map<Strategy, { pleiten: number; ziel: number; wert: number; siege: number; bKasse: number; bQuellen: number }>(
    STRATEGIES.map((s) => [s, { pleiten: 0, ziel: 0, wert: 0, siege: 0, bKasse: 0, bQuellen: 0 }]),
  );
  for (let i = 0; i < games; i++) {
    const seed = `${balance.bots.seedPrefix}-${i}`;
    const results = STRATEGIES.map((strategy) => {
      const r = playGame(seed, balance, strategy);
      const s = summe.get(strategy)!;
      if (r.bankrupt) s.pleiten++;
      if (r.goal) s.ziel++;
      s.wert += r.empire;
      s.bKasse += r.state.rival.cash;
      s.bQuellen += r.state.rival.wells.filter((w) => w.status === 'found').length;
      return { strategy, bankrupt: r.bankrupt, empire: r.empire };
    });
    for (const [strategy, anteil] of seedWinners(results)) summe.get(strategy)!.siege += anteil;
  }
  return STRATEGIES.map((strategy) => {
    const s = summe.get(strategy)!;
    const anteil = (x: number) => (games > 0 ? x / games : 0);
    return {
      strategy,
      games,
      bankruptRate: anteil(s.pleiten),
      goalRate: anteil(s.ziel),
      meanEmpire: anteil(s.wert),
      winRate: anteil(s.siege),
      rivalCash: anteil(s.bKasse),
      rivalWells: anteil(s.bQuellen),
    };
  });
}

function prozent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Markdown-Tabelle: Quoten in % mit einer Nachkommastelle, Werte in ganzen $, Bullards Quellen mit einer Nachkommastelle. */
export function botTable(rows: readonly BotRow[]): string {
  const zeilen = rows.map(
    (r) =>
      `| ${r.strategy} | ${r.games.toLocaleString('de-DE')} | ${prozent(r.bankruptRate)} | ${prozent(r.goalRate)} | ${Math.round(r.meanEmpire).toLocaleString('de-DE')} $ | ${prozent(r.winRate)} | ${Math.round(r.rivalCash).toLocaleString('de-DE')} $ | ${r.rivalWells.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} |`,
  );
  return [
    '| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...zeilen,
  ].join('\n');
}
