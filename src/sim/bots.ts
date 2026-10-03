// Bot-Läufe (GDD §17, Schritt 1.14): Die Simulation spielt ganze Partien ohne
// Grafik, mit vier Strategien – vorsichtig, gierig, ausgewogen, zufällig. Daraus
// entstehen Bankrottquote und mittlerer Imperiumswert je Strategie für die Balance.
// Seit 2.15 spielen die Bots mit den echten Ereignissen (Briefe, feste Termine,
// Rivalen) und beantworten sie nach ihrer Strategie; dazu kommen Kennzahlen, die
// gegen die Zielwerte aus GDD §15 geprüft werden (bots.targets in balance.yaml).
//
// Die Bots benutzen nur die öffentlichen Funktionen der Simulation, so wie der
// Schreibtisch. Ihr eigener Zufall kommt aus einem eigenen Rng – state.rng
// gehört der Welt und wird nie angefasst; Math.random kommt nicht vor.
// Die Zahlen stehen in content/balance.yaml unter bots.

import { TRANSPORT_MODES, type Balance, type BotEventWeights, type BotTargetId } from './balance';
import { overtimeFor } from './agenda';
import { creditLimit, debt, headroom, takeLoan } from './credit';
import { applyAction, parcelActions, type DeskActionKind } from './desk';
import { stageCost, wellOf } from './drilling';
import { chapterCheck } from './chapter';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { generateParcels } from './geology';
import { leaseOf, leaseTerms, locationFor, optionOf } from './lease';
import { Rng, seedFromString } from './rng';
import { buildTank, hireTeam, storageCapacity } from './logistics';
import { jacobSupply } from './market';
import { capacityLeft, netPrice, sellOil } from './transport';
import { RIVAL_MARKS } from './trust';
import { tutorialHint } from './tutorial';
import { choiceCost, choiceReason, resolveEvent, routineOffered, type EventChoice, type EventDef } from './events';

export type Strategy = 'vorsichtig' | 'gierig' | 'ausgewogen' | 'zufaellig';
export const STRATEGIES: readonly Strategy[] = ['vorsichtig', 'gierig', 'ausgewogen', 'zufaellig'];

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

/**
 * Lager und Fuhrpark (0.2.15+2), bewusst einfach: Bleibt nach dem Verkauf Öl
 * liegen, weil alle Wege voll sind, stellt der Bot ein eigenes Gespann ein und
 * verkauft weiter. Würde die nächste Förderung überlaufen, baut er Tanks. Beides
 * nur, solange die Rücklage bleibt – gierig leiht dafür notfalls bei der Bank. Pipeline, Händler und Thorne-Drohung nutzen
 * die Bots (noch) nicht.
 */
function logistics(state: GameState, balance: Balance, reserve: number, borrow = false, hire = true): GameState {
  const { teams, storage } = balance.transport;
  /** Genug Geld für cost? Gierig leiht notfalls bei der Bank. */
  const bezahlbar = (cost: number): boolean => {
    if (state.cash - cost >= reserve) return true;
    if (!borrow) return false;
    const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + reserve - state.cash));
    if (amount > headroom(state, balance)) return false;
    const loan = takeLoan(state, balance, amount);
    if (loan.ok) state = loan.state;
    return loan.ok;
  };
  while (Math.floor(state.oilStock) > 0 && TRANSPORT_MODES.every((m) => capacityLeft(state, balance, m) === 0 || netPrice(state, balance, m) <= 0)) {
    if (!hire || state.logistics.teams >= teams.maxTeams || !bezahlbar(teams.hireCost)) break;
    const r = hireTeam(state, balance);
    if (!r.ok) break;
    state = sell(r.state, balance, 1);
  }
  const naechste = jacobSupply(state);
  for (let i = 0; i < storage.maxTanks && state.oilStock + naechste > storageCapacity(state, balance) + state.logistics.tanksBuilding * storage.tankCapacity; i++) {
    if (state.logistics.tanks + state.logistics.tanksBuilding >= storage.maxTanks || !bezahlbar(storage.tankCost)) break;
    const r = buildTank(state, balance);
    if (!r.ok) break;
    state = r.state;
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
  state = logistics(sell(state, balance, 1), balance, cashReserve);
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
  state = logistics(sell(state, balance, 1), balance, 0, true, false);
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

// --- ausgewogen (2.15, Standard-Bot) -------------------------------------------

/**
 * So viel darf der ausgewogene Bot noch leihen: höchstens maxDebtShare des
 * Bankrahmens insgesamt, und nie mehr, als die Bank gerade gibt.
 */
export function balancedBorrowable(state: GameState, balance: Balance): number {
  const grenze = balance.bots.balanced.maxDebtShare * creditLimit(state, balance) - debt(state);
  return Math.max(0, Math.min(headroom(state, balance), Math.floor(grenze)));
}

/** Zahlt eine Aktion; fehlt Geld bis zur Rücklage, leiht er den Rest – aber nur im eigenen Rahmen. */
function balancedPay(state: GameState, balance: Balance, parcelId: string, kind: DeskActionKind, cost: number): GameState {
  const { cashReserve } = balance.bots.balanced;
  if (state.cash - cost >= cashReserve) return act(state, balance, parcelId, kind);
  const amount = Math.max(balance.credit.minLoan, Math.ceil(cost + cashReserve - state.cash));
  if (amount > balancedBorrowable(state, balance)) return state;
  const loan = takeLoan(state, balance, amount);
  if (!loan.ok) return state;
  const r = applyAction(loan.state, balance, parcelId, kind);
  return r.ok ? r.state : state;
}

function balancedTurn(state: GameState, balance: Balance): GameState {
  const { minChance, cashReserve, maxStage, maxUndrilled } = balance.bots.balanced;
  state = logistics(sell(state, balance, 1), balance, cashReserve, false, false);
  for (const well of openWells(state)) {
    const vorher = state;
    const next = well.stage + 1;
    if (well.status === 'stuck') state = balancedPay(state, balance, well.parcelId, 'fish', balance.drilling.fishingCost);
    else if (next <= maxStage && next <= balance.drilling.stages.length) {
      state = balancedPay(state, balance, well.parcelId, 'deeper', stageCost(balance, next));
    }
    if (state === vorher) state = act(state, balance, well.parcelId, 'abandon');
  }
  for (const option of jacobsOptions(state)) state = balancedPay(state, balance, option.parcelId, 'exercise', option.bonus);
  for (const parcelId of undrilled(state)) state = balancedPay(state, balance, parcelId, 'drill', stageCost(balance, 1));
  // Neues Land nur, wenn danach auch die erste Bohrstufe und die Rücklage bezahlbar bleiben.
  if (undrilled(state).length + jacobsOptions(state).length < maxUndrilled) {
    const geld = state.cash + balancedBorrowable(state, balance) - cashReserve - stageCost(balance, 1);
    const best = freeParcels(state, minChance).find((id) => leaseTerms(state, balance, id).bonus <= geld);
    if (best !== undefined) state = balancedPay(state, balance, best, 'lease', leaseTerms(state, balance, best).bonus);
  }
  return state;
}

// --- Ereignisse (2.15) -----------------------------------------------------------

/** Wie der Bot eine Antwort bewertet; reserve = Bargeld, das danach bleiben muss. */
export interface EventPolicy extends BotEventWeights {
  reserve: number;
}

export function eventPolicy(balance: Balance, strategy: Exclude<Strategy, 'zufaellig'>): EventPolicy {
  switch (strategy) {
    case 'vorsichtig':
      return { ...balance.bots.events.cautious, reserve: balance.bots.cautious.cashReserve };
    case 'gierig':
      return { ...balance.bots.events.greedy, reserve: 0 };
    case 'ausgewogen':
      return { ...balance.bots.events.balanced, reserve: balance.bots.balanced.cashReserve };
  }
}

/** Den Verkauf an Crane (frühes Ende) wählt kein Bot: die Bot-Läufe messen das ganze Kapitel. */
function endsGame(choice: EventChoice): boolean {
  return choice.marks.includes(RIVAL_MARKS.craneSold);
}

/** Barrel, die Jacob bis Kapitelende noch fördert (grob): letzte Förderung × Restrunden. Für den Bahntarif. */
function barrelsAhead(state: GameState): number {
  const jeRunde = state.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
  return jeRunde * Math.max(0, state.totalRounds - state.round + 1);
}

/** Wert der Effekte in $ – ohne Termine. Kraft zählt nur, soweit sie unter dem Höchstwert Platz hat. */
/**
 * Befristete Nachwirkungen (0.2.15+3) grob in $: Preis und Förderung auf die
 * Förderung der nächsten timedRounds Runden, Pacht auf relevance.refLeaseSpend.
 */
function timedValue(state: GameState, balance: Balance, e: EventChoice['effects']): number {
  const runden = Math.min(balance.events.timedRounds, Math.max(0, state.totalRounds - state.round + 1));
  const jeRunde = state.wells.reduce((s, w) => s + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
  return (
    (e.price ?? 0) * jeRunde * runden +
    (e.production ?? 0) * jeRunde * runden * state.postedPrice -
    (e.leaseCost ?? 0) * balance.events.relevance.refLeaseSpend
  );
}

function effectValue(state: GameState, balance: Balance, choice: EventChoice, policy: EventPolicy, extraStrength = 0): number {
  const e = choice.effects;
  const kraft = (e.strength ?? 0) + extraStrength;
  const wirksam = kraft > 0 ? Math.min(kraft, state.strengthMax - state.strength) : kraft;
  return (
    (e.cash ?? 0) +
    (e.oilStock ?? 0) * state.postedPrice +
    wirksam * policy.strength +
    ((e.ruth ?? 0) + (e.thomas ?? 0)) * policy.family -
    (e.railTariff ?? 0) * barrelsAhead(state) +
    timedValue(state, balance, e)
  );
}

/**
 * Wert einer Antwort, die der Bot jetzt geben könnte, oder null, wenn sie nicht
 * geht oder er sie nicht will (Verkauf an Crane, Überstunden zu müde, Rücklage).
 */
export function choiceValue(state: GameState, balance: Balance, event: EventDef, choice: EventChoice, policy: EventPolicy): number | null {
  if (endsGame(choice) || choiceReason(state, balance, event, choice) !== null) return null;
  const cost = choiceCost(event, choice);
  const over = overtimeFor(state, cost);
  if (over > 0 && state.strength < policy.overtimeFrom) return null;
  const cash = choice.effects.cash ?? 0;
  if (cash < 0 && state.cash + cash < policy.reserve) return null;
  return effectValue(state, balance, choice, policy, -over * balance.agenda.overtimeCost) - cost * policy.appointment;
}

/** Was ohne Antwort passiert: die Standard-Wahl wie in autoResolve, ohne Termine. Feste Termine: nichts. */
function baseline(state: GameState, balance: Balance, event: EventDef, policy: EventPolicy): number {
  if (event.routine) return 0;
  const standard = event.choices.find((c) => c.default) ?? event.choices[0];
  return standard ? effectValue(state, balance, standard, policy) : 0;
}

/** Alles, worauf Jacob gerade antworten kann: offene Ereignisse und feste Termine. */
function openItems(state: GameState, catalog: readonly EventDef[]): EventDef[] {
  const offen = state.events.pending.flatMap((id) => catalog.filter((e) => e.id === id));
  return [...offen, ...catalog.filter((e) => routineOffered(state, e))];
}

/**
 * Beantwortet Ereignisse und nimmt feste Termine wahr: immer die Antwort mit dem
 * größten Gewinn gegenüber „liegen lassen“, bis keine mehr etwas bringt oder die
 * Zeit fehlt. Was liegen bleibt, bekommt am Rundenende die Standard-Wahl.
 */
export function answerEvents(state: GameState, balance: Balance, catalog: readonly EventDef[], policy: EventPolicy): GameState {
  for (let i = 0; i < 30; i++) {
    let best: { event: EventDef; choice: EventChoice; gain: number } | null = null;
    for (const event of openItems(state, catalog)) {
      const basis = baseline(state, balance, event, policy);
      for (const choice of event.choices) {
        const wert = choiceValue(state, balance, event, choice, policy);
        if (wert === null) continue;
        const gain = wert - basis;
        if (gain > (best?.gain ?? 0)) best = { event, choice, gain };
      }
    }
    if (!best) break;
    const r = resolveEvent(state, balance, catalog, best.event.id, best.choice.id);
    if (!r.ok) break;
    state = r.state;
  }
  return state;
}

/** Zufall: Jedes offene Ereignis und jeder feste Termin wird mit halber Chance zufällig beantwortet. */
function randomAnswers(state: GameState, balance: Balance, catalog: readonly EventDef[], rng: Rng): GameState {
  for (const event of openItems(state, catalog)) {
    if (rng.float() >= 0.5) continue;
    const moeglich = event.choices.filter((c) => !endsGame(c) && choiceReason(state, balance, event, c) === null);
    if (moeglich.length === 0) continue;
    const r = resolveEvent(state, balance, catalog, event.id, rng.pick(moeglich).id);
    if (r.ok) state = r.state;
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

/**
 * Eine Runde Aktionen nach der Strategie – ohne endRound. Mit Katalog (2.15)
 * beantwortet der Bot zuerst Ereignisse und nimmt feste Termine wahr.
 */
export function botTurn(state: GameState, balance: Balance, strategy: Strategy, rng: Rng, catalog: readonly EventDef[] = []): GameState {
  if (state.finished) return state;
  if (catalog.length > 0) {
    state = strategy === 'zufaellig' ? randomAnswers(state, balance, catalog, rng) : answerEvents(state, balance, catalog, eventPolicy(balance, strategy));
  }
  switch (strategy) {
    case 'vorsichtig':
      return cautiousTurn(state, balance);
    case 'gierig':
      return greedyTurn(state, balance);
    case 'ausgewogen':
      return balancedTurn(state, balance);
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
  /** Termine zu Rundenbeginn, über alle gespielten Runden summiert (krank = 0). */
  appointments: number;
  /** Runden, die Jacob krank war. */
  sickRounds: number;
  state: GameState;
}

/**
 * Spielt eine ganze Partie bis zum Ende des Kapitels oder bis zur Pleite. Mit
 * Katalog (2.15) kommen Ereignisse, Briefe und feste Termine dazu.
 */
export function playGame(seed: string, balance: Balance, strategy: Strategy, catalog: readonly EventDef[] = []): GameResult {
  let state = newGame(seed, balance, catalog);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  let rounds = 0;
  let appointments = 0;
  let sickRounds = 0;
  while (!state.finished) {
    if (rounds >= state.totalRounds + 5) {
      throw new Error(`Partie ${seed} (${strategy}) endet nicht nach ${rounds} Runden.`);
    }
    if (state.sick > 0) sickRounds++;
    else appointments += state.agenda.budget;
    state = endRound(botTurn(state, balance, strategy, rng, catalog), balance, catalog);
    rounds++;
  }
  const bankrupt = state.ending === 'pleite';
  return {
    bankrupt,
    goal: !bankrupt && chapterCheck(state, balance).passed,
    empire: empireValue(state, balance),
    rounds,
    appointments,
    sickRounds,
    state,
  };
}

// --- Einstieg (2.13) ------------------------------------------------------------

/**
 * Ein Zug nach den Tutorial-Hinweisen: tut genau, was der Hinweis sagt, bis er
 * „Runde beenden“ sagt, eine Aktion scheitert oder der Einstieg vorbei ist.
 * Höchstens maxSteps Schritte, damit ein Fehler im Hinweis nicht hängen bleibt.
 */
export function hintTurn(state: GameState, balance: Balance, maxSteps = 20): GameState {
  for (let i = 0; i < maxSteps; i++) {
    const hint = tutorialHint(state, balance);
    if (!hint || hint.action.kind === 'endRound') return state;
    const action = hint.action;
    const r =
      action.kind === 'sell'
        ? sellOil(state, balance, action.mode, action.barrels)
        : action.kind === 'loan'
          ? takeLoan(state, balance, action.amount)
          : applyAction(state, balance, action.parcelId, action.kind);
    if (!r.ok) return state;
    state = r.state;
  }
  return state;
}

export interface HintGame {
  /** Hat der Bot im Einstieg eine eigene Quelle gefunden? */
  found: boolean;
  /** Runde, in der die erste Quelle fündig wurde (am Ende dieser Runde), sonst null. */
  foundRound: number | null;
  /** Hat er in dieser Zeit Öl verkauft? */
  sold: boolean;
  state: GameState;
}

/**
 * Ein neuer Spieler, der nur den Hinweisen folgt: spielt, solange der Einstieg
 * läuft (höchstens bis zum Kapitelende), und meldet, ob er eine Quelle gefunden hat.
 * Ereignisse bekommen ihre Standardantwort – der Bot liest keine Briefe.
 */
export function playByHints(seed: string, balance: Balance, catalog: readonly EventDef[] = []): HintGame {
  let state = newGame(seed, balance, catalog);
  let foundRound: number | null = null;
  let sold = false;
  while (!state.finished && tutorialHint(state, balance) !== null) {
    state = hintTurn(state, balance);
    if (TRANSPORT_MODES.some((m) => state.shipped[m] > 0)) sold = true;
    const runde = state.round;
    state = endRound(state, balance, catalog);
    if (foundRound === null && state.wells.some((w) => w.status === 'found')) foundRound = runde;
  }
  return { found: foundRound !== null, foundRound, sold, state };
}

export interface BotRow {
  strategy: Strategy;
  games: number;
  bankruptRate: number;
  /** Anteil der Partien, in denen die Kapitelprüfung (2.11) bestanden ist. */
  goalRate: number;
  meanEmpire: number;
  /**
   * Anteil der Seeds, in denen diese Strategie den höchsten Imperiumswert hat (Gleichstand wird geteilt).
   * Seit 2.15 nur, wenn der Beste mindestens die Startkasse erreicht – sonst hat niemand gewonnen.
   */
  winRate: number;
  /** Ø Kasse des Rivalen Bullard am Ende der Partie. */
  rivalCash: number;
  /** Ø fündige Quellen Bullards am Ende der Partie. */
  rivalWells: number;
  /** Ø Termine je Runde (2.15; krank = 0 Termine). */
  meanAppointments: number;
  /** Anteil der Runden, die Jacob krank war. */
  sickShare: number;
  /** Jacobs Funde (2.15): Anfangsraten in Barrel je Runde und gemessener Rückgang je Quelle. */
  finds: FindStats;
}

/**
 * Wer gewinnt einen Seed? Die Strategie mit dem höchsten Imperiumswert. Eine
 * Pleite zählt immer als letzter Platz – auch hinter einem Imperiumswert unter
 * null, denn wer pleite ist, hat das Kapitel verloren. Bei Gleichstand teilen
 * sich die Besten den Sieg. Gibt je Strategie den Sieganteil 0–1 zurück.
 * minEmpire (2.15): Bleibt auch der Beste unter diesem Imperiumswert (in den
 * Bot-Läufen: die Startkasse), hat niemand gewonnen – wer am wenigsten verliert,
 * ist kein Sieger. Die Karte bleibt dann ohne Sieger (leere Map).
 */
export function seedWinners(
  results: readonly { strategy: Strategy; bankrupt: boolean; empire: number }[],
  minEmpire = -Infinity,
): Map<Strategy, number> {
  const rang = (r: { bankrupt: boolean; empire: number }) => (r.bankrupt ? -Infinity : r.empire);
  const bester = Math.max(...results.map(rang));
  if (bester === -Infinity || bester < minEmpire) return new Map();
  const sieger = results.filter((r) => rang(r) === bester);
  return new Map(sieger.map((r) => [r.strategy, 1 / sieger.length]));
}

/** Summen über Jacobs Funde – zum Zusammenlegen über Strategien. */
export interface FindStats {
  small: number[];
  gusher: number[];
  /** Gemessener Rückgang je Runde, eine Zahl je Quelle mit mindestens zwei Förderrunden. */
  declines: number[];
}

/**
 * Gemessener Rückgang einer Quelle je Runde: aus Anfangsrate und letzter Förderung
 * über die Förderrunden dazwischen – Druckverlust im Feld eingeschlossen. null, wenn
 * die Quelle noch keine zwei Runden gefördert hat.
 */
export function measuredDecline(production: { initialRate: number; roundsProduced: number; lastRate: number }): number | null {
  const { initialRate, roundsProduced, lastRate } = production;
  if (roundsProduced < 2 || initialRate <= 0 || lastRate <= 0) return null;
  return 1 - (lastRate / initialRate) ** (1 / (roundsProduced - 1));
}

function findStats(state: GameState): FindStats {
  const out: FindStats = { small: [], gusher: [], declines: [] };
  for (const w of state.wells) {
    if (w.status !== 'found' || !w.production || !w.result) continue;
    (w.result === 'gusher' ? out.gusher : out.small).push(w.production.initialRate);
    const d = measuredDecline(w.production);
    if (d !== null) out.declines.push(d);
  }
  return out;
}

/**
 * Spielt games Partien je Strategie, für jede Strategie mit denselben Seeds.
 * catalog: Ereignisse aus content/events/ (2.15); ohne Katalog spielen die Bots ohne Ereignisse.
 */
export function runBots(balance: Balance, games = balance.bots.games, catalog: readonly EventDef[] = []): BotRow[] {
  const summe = new Map(
    STRATEGIES.map((s) => [
      s,
      { pleiten: 0, ziel: 0, wert: 0, siege: 0, bKasse: 0, bQuellen: 0, termine: 0, runden: 0, krank: 0, finds: { small: [], gusher: [], declines: [] } as FindStats },
    ]),
  );
  for (let i = 0; i < games; i++) {
    const seed = `${balance.bots.seedPrefix}-${i}`;
    const results = STRATEGIES.map((strategy) => {
      const r = playGame(seed, balance, strategy, catalog);
      const s = summe.get(strategy)!;
      if (r.bankrupt) s.pleiten++;
      if (r.goal) s.ziel++;
      s.wert += r.empire;
      s.bKasse += r.state.rival.cash;
      s.bQuellen += r.state.rival.wells.filter((w) => w.status === 'found').length;
      s.termine += r.appointments;
      s.runden += r.rounds;
      s.krank += r.sickRounds;
      const f = findStats(r.state);
      s.finds.small.push(...f.small);
      s.finds.gusher.push(...f.gusher);
      s.finds.declines.push(...f.declines);
      return { strategy, bankrupt: r.bankrupt, empire: r.empire };
    });
    for (const [strategy, anteil] of seedWinners(results, balance.start.cash)) summe.get(strategy)!.siege += anteil;
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
      meanAppointments: s.runden > 0 ? s.termine / s.runden : 0,
      sickShare: s.runden > 0 ? s.krank / s.runden : 0,
      finds: s.finds,
    };
  });
}

/**
 * Blinde Wildcat-Bohrung (GDD §15: „etwa 1 von 5 bis 1 von 10“): Wer ohne
 * Geologen irgendeine Parzelle in Randlage (weit weg vom bekannten Fund) bis zur
 * Zieltiefe (Stufe 1) bohrt – wie oft trifft er Öl? Erwartungswert über alle
 * Randlage-Parzellen der Karten der Bot-Seeds; nur die Geologie zählt, kein Bot.
 */
export function blindWildcatChance(balance: Balance, games = balance.bots.games): number {
  const rand = balance.lease.locations[balance.lease.locations.length - 1];
  const stufe1 = balance.drilling.stages[0].oilShare;
  let summe = 0;
  let n = 0;
  for (let i = 0; i < games; i++) {
    const parcels = generateParcels(balance, new Rng(seedFromString(`${balance.bots.seedPrefix}-${i}`)));
    const funde = parcels.filter((p) => p.discovery);
    for (const p of parcels) {
      if (p.discovery || locationFor(balance, funde, p).name !== rand.name) continue;
      summe += p.geology === 'dry' ? 0 : stufe1;
      n++;
    }
  }
  return n > 0 ? summe / n : 0;
}

/** Eine Zeile der Zielwert-Tabelle (2.15). */
export interface TargetRow {
  id: BotTargetId;
  /** Was gemessen wird. */
  label: string;
  /** Wo der Zielwert herkommt und wie er im GDD steht. */
  goal: string;
  value: number;
  min: number;
  max: number;
  ok: boolean;
  unit: 'prozent' | 'faktor' | 'zahl';
}

const TARGET_TEXT: Record<BotTargetId, { label: string; goal: string; unit: TargetRow['unit'] }> = {
  winRate: { label: 'Höchste Siegquote einer Strategie', goal: 'GDD §17: keine Einzelstrategie gewinnt in mehr als 40 %', unit: 'prozent' },
  standardBankrupt: { label: 'Pleitequote Standard-Bot (ausgewogen)', goal: 'Kapitel 1 ist der Einstieg (GDD §17: Kapitel 4 übersteht er in 55–70 %)', unit: 'prozent' },
  greedyBankrupt: { label: 'Pleitequote gierig', goal: 'GDD §15: wer im Boom zu viele Schulden macht, stirbt (Krisen erst ab Kapitel 2)', unit: 'prozent' },
  cautiousBehind: { label: 'Ø Imperium vorsichtig ÷ bester Ø der Mutigeren', goal: 'GDD §15: wer nie Schulden macht, wird überholt (unter 1)', unit: 'faktor' },
  standardGoal: { label: 'Kapitelziel Standard-Bot (ausgewogen)', goal: 'Kapitelprüfung erreichbar, aber nicht geschenkt', unit: 'prozent' },
  smallRateInRange: { label: 'Kleine Funde mit 50–500 bbl/Tag', goal: 'GDD §15: Anfangsrate 50–500 bbl/Tag', unit: 'prozent' },
  gusherFactor: { label: 'Ø Anfangsrate Gusher ÷ kleiner Fund', goal: 'GDD §15: Gusher deutlich mehr', unit: 'faktor' },
  decline: { label: 'Gemessener Rückgang je Quartal', goal: 'GDD §15: 8–15 %', unit: 'prozent' },
  wildcatHit: { label: 'Trefferquote blinde Wildcat-Bohrung (Randlage, 300 m)', goal: 'GDD §15: etwa 1 von 5 bis 1 von 10', unit: 'prozent' },
  appointments: { label: 'Ø Termine je Runde (Standard-Bot)', goal: 'GDD §15: 5 je Quartal', unit: 'zahl' },
};

function mean(xs: readonly number[]): number {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Misst alle Kennzahlen aus den Bot-Zeilen und vergleicht sie mit bots.targets. */
export function checkTargets(rows: readonly BotRow[], wildcatHit: number, balance: Balance): TargetRow[] {
  const row = (s: Strategy) => rows.find((r) => r.strategy === s);
  const alle = <K extends keyof FindStats>(k: K) => rows.flatMap((r) => r.finds[k]);
  const tag = balance.bots.daysPerRound;
  const klein = alle('small').map((r) => r / tag);
  const gusher = alle('gusher').map((r) => r / tag);
  const mutig = Math.max(row('gierig')?.meanEmpire ?? 0, row('ausgewogen')?.meanEmpire ?? 0);
  const werte: Record<BotTargetId, number> = {
    winRate: Math.max(0, ...rows.map((r) => r.winRate)),
    standardBankrupt: row('ausgewogen')?.bankruptRate ?? 0,
    greedyBankrupt: row('gierig')?.bankruptRate ?? 0,
    cautiousBehind: mutig > 0 ? (row('vorsichtig')?.meanEmpire ?? 0) / mutig : 0,
    standardGoal: row('ausgewogen')?.goalRate ?? 0,
    smallRateInRange: klein.length > 0 ? klein.filter((r) => r >= 50 && r <= 500).length / klein.length : 0,
    gusherFactor: mean(klein) > 0 ? mean(gusher) / mean(klein) : 0,
    decline: mean(alle('declines')),
    wildcatHit,
    appointments: row('ausgewogen')?.meanAppointments ?? 0,
  };
  return (Object.keys(TARGET_TEXT) as BotTargetId[]).map((id) => {
    const { min, max } = balance.bots.targets[id];
    const value = werte[id];
    return { id, ...TARGET_TEXT[id], value, min, max, ok: value >= min && value <= max };
  });
}

function zahl(value: number, digits: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function zielWert(unit: TargetRow['unit'], value: number): string {
  return unit === 'prozent' ? prozent(value) : zahl(value, 2);
}

/** Markdown-Tabelle Ist/Ziel (2.15). */
export function targetTable(targets: readonly TargetRow[]): string {
  return [
    '| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |',
    '| --- | --- | ---: | ---: | :---: |',
    ...targets.map(
      (t) =>
        `| ${t.label} | ${t.goal} | ${zielWert(t.unit, t.min)} – ${zielWert(t.unit, t.max)} | ${zielWert(t.unit, t.value)} | ${t.ok ? 'ja' : '**nein**'} |`,
    ),
  ].join('\n');
}

function prozent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Markdown-Tabelle: Quoten in % mit einer Nachkommastelle, Werte in ganzen $, Bullards Quellen und Termine mit einer Nachkommastelle. */
export function botTable(rows: readonly BotRow[]): string {
  const zeilen = rows.map(
    (r) =>
      `| ${r.strategy} | ${r.games.toLocaleString('de-DE')} | ${prozent(r.bankruptRate)} | ${prozent(r.goalRate)} | ${Math.round(r.meanEmpire).toLocaleString('de-DE')} $ | ${prozent(r.winRate)} | ${Math.round(r.rivalCash).toLocaleString('de-DE')} $ | ${zahl(r.rivalWells, 1)} | ${zahl(r.meanAppointments, 1)} |`,
  );
  return [
    '| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...zeilen,
  ].join('\n');
}
