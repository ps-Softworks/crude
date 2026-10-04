// Lager, eigene Fuhrwerke und Pipeline (0.2.15+2, GDD §6, Kapitel 1 §13).
//
// Das Öl muss irgendwo stehen und irgendwie zum Käufer. Hier stehen die Anlagen,
// die Jacob dafür selbst baut oder anstellt – und was sie kosten:
//   Lager      Tanks fassen nur so viel (storage); was darüber gefördert wird, läuft aus.
//              Je Runde kosten gelagerte Barrel Geld, ein Teil verdunstet, selten brennt es.
//   Fuhrwerke  eigene Gespanne: Lohn je Runde (auch wenn sie stehen), dafür billig je Barrel.
//   Pipeline   Route vermessen → Wegerechte über Briefe → bauen (mehrere Runden) →
//              sehr billiger Transport; Sabotage-Risiko, Wachleute senken es.
//   Drohung    Mit der Pipeline Thorne drohen: senkt den Bahntarif nur, wenn sie glaubwürdig ist.
// Zufall (Brand, Sabotage) kommt aus einem eigenen Strom – die Welt bleibt gleich.
// Reine Funktionen: Zustand rein, neuer Zustand raus.

import type { Balance, TransportMode } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { recordAct } from './politics';
import { Rng, seedFromString, type RngState } from './rng';
import { markRound, RIVAL_MARKS } from './trust';

export type PipelineStatus = 'none' | 'surveyed' | 'building' | 'ready' | 'damaged';

export interface LogisticsState {
  /** Eigener Zufall für Tankbrand und Sabotage. */
  rng: RngState;
  /** Fertige Zusatztanks. */
  tanks: number;
  /** Tanks im Bau – fertig am Rundenende, noch vor der Förderung. */
  tanksBuilding: number;
  /** Eigene Gespanne mit Fuhrleuten. */
  teams: number;
  /** Bis einschließlich dieser Runde stehen die eigenen Fuhrwerke still (Streik, Schlamm); 0 = nie. */
  teamsIdleUntil: number;
  pipeline: PipelineStatus;
  /** Im Bau: Runden bis fertig; beschädigt: Runden bis repariert. */
  pipelineRounds: number;
  /** Wachleute an der Pipeline. */
  guards: boolean;
  /** In dieser Runde an den Händler verkauft (bbl). */
  traderSold: number;
  /** Letzte Runde mit Händlerverkauf (0 = nie) – Cranes Groll. */
  traderLast: number;
  /** Runde der letzten Drohung gegenüber Thorne (0 = nie). */
  threatRound: number;
}

/** Merkzeichen, die die Simulation hier setzt – Ereignisse in content/events/ reagieren darauf. */
export const LOGISTICS_MARKS = {
  /** Jacob hat eigene Fuhrleute angestellt. */
  teams: 'fuhrleute_eigen',
  /** Die Pipeline-Route ist vermessen: Die Landbesitzer schreiben. */
  surveyed: 'pipeline_geplant',
  /** Die Pipeline läuft – eigene Transportlösung (Kapitelbonus). */
  built: 'pipeline_gebaut',
  /** Jacob hat an den Händler in Port Ellis verkauft. */
  trader: 'haendler_kunde',
} as const;

export const LOGISTICS_SIM_MARKS = Object.values(LOGISTICS_MARKS);

export function newLogistics(seed: string): LogisticsState {
  return {
    rng: seedFromString(`${seed}:logistik`),
    tanks: 0,
    tanksBuilding: 0,
    teams: 0,
    teamsIdleUntil: 0,
    pipeline: 'none',
    pipelineRounds: 0,
    guards: false,
    traderSold: 0,
    traderLast: 0,
    threatRound: 0,
  };
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dollars(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function bbl(value: number): string {
  return Math.round(value).toLocaleString('de-DE');
}

/** Setzt ein Merkzeichen der Simulation (behält die erste Runde). */
export function withMark(state: GameState, mark: string): GameState {
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

function logged(state: GameState, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

export type LogisticsResult = { ok: true; state: GameState } | { ok: false; reason: string };

function guard(state: GameState, cost: number): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (cost > state.cash) return `Dafür fehlt das Geld (${dollars(cost)} $ nötig).`;
  return null;
}

// --- Lager -------------------------------------------------------------------

/** Was in Jacobs Tanks passt (bbl). */
export function storageCapacity(state: Pick<GameState, 'logistics'>, balance: Balance): number {
  const s = balance.transport.storage;
  return s.startCapacity + state.logistics.tanks * s.tankCapacity;
}

/** Lagerkosten, Schwund und Brandrisiko für den aktuellen Tank bis zum Rundenende (Erwartungswert). */
export function storageOutlook(state: Pick<GameState, 'oilStock' | 'postedPrice'>, balance: Balance) {
  const s = balance.transport.storage;
  const stock = state.oilStock;
  const cost = cents(stock * s.costPerBarrel);
  const shrink = stock * s.shrink;
  const fireRisk = stock * s.fireChance * s.fireLoss;
  return { cost, shrink, fireRisk, perBarrel: cents(s.costPerBarrel + (s.shrink + s.fireChance * s.fireLoss) * state.postedPrice) };
}

export function buildTank(state: GameState, balance: Balance): LogisticsResult {
  const s = balance.transport.storage;
  const nein = guard(state, s.tankCost);
  if (nein) return { ok: false, reason: nein };
  if (state.logistics.tanks + state.logistics.tanksBuilding >= s.maxTanks) {
    return { ok: false, reason: `Mehr als ${s.maxTanks} Zusatztanks passen nicht aufs Gelände.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - s.tankCost),
      logistics: { ...state.logistics, tanksBuilding: state.logistics.tanksBuilding + 1 },
      log: logged(state, `Jacob lässt einen neuen Tank bauen (${dollars(s.tankCost)} $, fertig zum Rundenende).`),
    },
  };
}

/** Öl im Tank verringern: das Öl der Landbesitzer schrumpft anteilig mit. */
function lose(state: GameState, barrels: number): GameState {
  if (barrels <= 0 || state.oilStock <= 0) return state;
  const rest = Math.max(0, state.oilStock - barrels);
  return { ...state, oilStock: rest, royaltyOil: (state.royaltyOil * rest) / state.oilStock };
}

/**
 * Rundenende, vor der Förderung: Neue Tanks sind fertig. Für das Öl, das noch im
 * Tank steht, fallen Lagerkosten an, ein Teil verdunstet, und mit fireChance
 * brennt ein Tank (fireLoss des Öls ist weg).
 */
export function settleStorage(input: GameState, balance: Balance): GameState {
  const s = balance.transport.storage;
  let state: GameState = input;
  const lg = input.logistics;
  if (lg.tanksBuilding > 0) {
    state = {
      ...state,
      logistics: { ...lg, tanks: lg.tanks + lg.tanksBuilding, tanksBuilding: 0 },
      log: logged(state, `${lg.tanksBuilding === 1 ? 'Ein neuer Tank ist' : `${lg.tanksBuilding} neue Tanks sind`} fertig.`),
    };
  }
  if (state.oilStock <= 0) return state;
  const kosten = cents(state.oilStock * s.costPerBarrel);
  const schwund = state.oilStock * s.shrink;
  state = { ...lose(state, schwund), cash: cents(state.cash - kosten) };
  state = { ...state, log: logged(state, `Lager: ${dollars(kosten)} $ Lagerkosten, ${bbl(schwund)} Barrel Schwund.`) };
  const rng = new Rng(state.logistics.rng);
  if (rng.float() < s.fireChance) {
    const weg = state.oilStock * s.fireLoss;
    state = lose(state, weg);
    // Öffentliches Handeln (4.2): Ein Feldbrand bei Jacob drückt am Rundenende die Stimmung im Land.
    state = recordAct({ ...state, log: logged(state, `Ein Tank brennt! ${bbl(weg)} Barrel Öl gehen in Rauch auf.`) }, 'field_fire');
  }
  return { ...state, logistics: { ...state.logistics, rng: rng.state } };
}

/** Nach der Förderung: Was nicht in die Tanks passt, läuft aus und ist verloren. */
export function spillOver(state: GameState, balance: Balance): GameState {
  const platz = storageCapacity(state, balance);
  const ueber = state.oilStock - platz;
  if (ueber <= 0) return state;
  const out = lose(state, ueber);
  return { ...out, log: logged(out, `Die Tanks sind voll: ${bbl(ueber)} Barrel laufen in den Boden. Mehr Tanks oder schneller verkaufen!`) };
}

// --- Eigene Fuhrwerke ----------------------------------------------------------

/** Stehen die eigenen Fuhrwerke in dieser Runde still? */
export function teamsIdle(state: Pick<GameState, 'round' | 'logistics'>): boolean {
  return state.logistics.teamsIdleUntil >= state.round;
}

export function hireTeam(state: GameState, balance: Balance): LogisticsResult {
  const t = balance.transport.teams;
  const nein = guard(state, t.hireCost);
  if (nein) return { ok: false, reason: nein };
  if (state.logistics.teams >= t.maxTeams) return { ok: false, reason: `Mehr als ${t.maxTeams} Gespanne kann Jacob nicht beaufsichtigen.` };
  const out: GameState = {
    ...state,
    cash: cents(state.cash - t.hireCost),
    logistics: { ...state.logistics, teams: state.logistics.teams + 1 },
    log: logged(state, `Jacob kauft ein Gespann und stellt einen Fuhrmann ein (${dollars(t.hireCost)} $, Lohn ${dollars(t.wagePerRound)} $ je Runde).`),
  };
  return { ok: true, state: withMark(out, LOGISTICS_MARKS.teams) };
}

export function dismissTeam(state: GameState, balance: Balance): LogisticsResult {
  const t = balance.transport.teams;
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  if (state.logistics.teams <= 0) return { ok: false, reason: 'Jacob hat keine eigenen Fuhrwerke.' };
  const erloes = cents(t.hireCost * t.resale);
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash + erloes),
      logistics: { ...state.logistics, teams: state.logistics.teams - 1 },
      log: logged(state, `Jacob verkauft ein Gespann für ${dollars(erloes)} $ und entlässt den Fuhrmann.`),
    },
  };
}

// --- Pipeline ----------------------------------------------------------------

/**
 * Wegerechte mit Namen und ob Jacob sie schon hat. Kreuzt die Route die Ranch
 * einer Figur (0.2.15+5), steht ihr Name da, sonst das Label aus balance.yaml.
 */
export function rightsStatus(
  state: Pick<GameState, 'events'> & Partial<Pick<GameState, 'parcels'>>,
  balance: Balance,
): { mark: string; label: string; held: boolean; parcelId?: string }[] {
  return balance.transport.pipeline.rights.map((r) => {
    const ranch = r.figure ? state.parcels?.find((p) => p.figure === r.figure) : undefined;
    const recht = { mark: r.mark, label: ranch ? `${ranch.name} (${ranch.owner})` : r.label, held: state.events.marks[r.mark] !== undefined };
    return ranch ? { ...recht, parcelId: ranch.id } : recht;
  });
}

/** Merkzeichen der Wegerechte, die noch fehlen. */
export function missingRights(state: Pick<GameState, 'events'>, balance: Balance): string[] {
  return rightsStatus(state, balance).filter((r) => !r.held).map((r) => r.mark);
}

export function pipelineWorks(state: Pick<GameState, 'logistics'>): boolean {
  return state.logistics.pipeline === 'ready';
}

export function surveyPipeline(state: GameState, balance: Balance): LogisticsResult {
  const p = balance.transport.pipeline;
  if (state.logistics.pipeline !== 'none') return { ok: false, reason: 'Die Route ist schon vermessen.' };
  const nein = guard(state, p.surveyCost);
  if (nein) return { ok: false, reason: nein };
  const out: GameState = {
    ...state,
    cash: cents(state.cash - p.surveyCost),
    logistics: { ...state.logistics, pipeline: 'surveyed' },
    log: logged(state, `Ein Landvermesser steckt die Pipeline-Route zum Bahnhof ab (${dollars(p.surveyCost)} $). Jetzt braucht Jacob die Wegerechte.`),
  };
  return { ok: true, state: withMark(out, LOGISTICS_MARKS.surveyed) };
}

export function buildPipeline(state: GameState, balance: Balance): LogisticsResult {
  const p = balance.transport.pipeline;
  if (state.logistics.pipeline === 'none') return { ok: false, reason: 'Erst die Route vermessen.' };
  if (state.logistics.pipeline !== 'surveyed') return { ok: false, reason: 'Die Pipeline ist schon gebaut oder im Bau.' };
  if (missingRights(state, balance).length > 0) return { ok: false, reason: 'Es fehlen noch Wegerechte.' };
  const nein = guard(state, p.buildCost);
  if (nein) return { ok: false, reason: nein };
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - p.buildCost),
      logistics: { ...state.logistics, pipeline: 'building', pipelineRounds: p.buildRounds },
      log: logged(state, `Der Pipeline-Bau beginnt (${dollars(p.buildCost)} $, ${p.buildRounds} Runden).`),
    },
  };
}

export function setGuards(state: GameState, on: boolean): LogisticsResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  if (state.logistics.guards === on) return { ok: false, reason: on ? 'Die Wachleute sind schon da.' : 'Es gibt keine Wachleute.' };
  return {
    ok: true,
    state: {
      ...state,
      logistics: { ...state.logistics, guards: on },
      log: logged(state, on ? 'Jacob stellt Wachleute an die Pipeline.' : 'Jacob schickt die Wachleute nach Hause.'),
    },
  };
}

/** Chance je Runde, dass die laufende Pipeline sabotiert wird. */
export function sabotageChance(state: Pick<GameState, 'events' | 'logistics'>, balance: Balance): number {
  const p = balance.transport.pipeline;
  const feinde =
    markRound(state, RIVAL_MARKS.bullardFeud) !== undefined ||
    markRound(state, RIVAL_MARKS.bullardBetrayed) !== undefined ||
    markRound(state, RIVAL_MARKS.thorneRefused) !== undefined ||
    state.logistics.threatRound > 0;
  const basis = p.sabotageChance * (feinde ? p.sabotageFactor : 1);
  return Math.min(1, state.logistics.guards ? basis * p.guardsFactor : basis);
}

/** Fixkosten je Runde: Lohn der Fuhrleute, Streckenwärter, Wachleute. */
export function fixedCosts(state: Pick<GameState, 'logistics'>, balance: Balance) {
  const { teams, pipeline } = balance.transport;
  const lg = state.logistics;
  const wages = lg.teams * teams.wagePerRound;
  const laeuft = lg.pipeline === 'ready' || lg.pipeline === 'damaged';
  const upkeep = laeuft ? pipeline.upkeepPerRound : 0;
  const guards = laeuft && lg.guards ? pipeline.guardsPerRound : 0;
  return { wages, upkeep, guards, total: wages + upkeep + guards };
}

/**
 * Rundenende: Löhne und Unterhalt werden bezahlt, der Pipeline-Bau rückt vor,
 * eine laufende Pipeline kann sabotiert werden (Reparatur kostet repairCost und
 * legt sie repairRounds Runden still).
 */
export function advanceLogistics(input: GameState, balance: Balance): GameState {
  const p = balance.transport.pipeline;
  const kosten = fixedCosts(input, balance);
  let state: GameState = input;
  if (kosten.total > 0) {
    const teile = [
      kosten.wages > 0 ? `Lohn der Fuhrleute ${dollars(kosten.wages)} $` : '',
      kosten.upkeep > 0 ? `Streckenwärter ${dollars(kosten.upkeep)} $` : '',
      kosten.guards > 0 ? `Wachleute ${dollars(kosten.guards)} $` : '',
    ].filter(Boolean);
    state = { ...state, cash: cents(state.cash - kosten.total), log: logged(state, `Fixkosten: ${teile.join(', ')}.`) };
  }
  const lg = state.logistics;
  if (lg.pipeline === 'building') {
    const rest = lg.pipelineRounds - 1;
    if (rest <= 0) {
      state = { ...state, logistics: { ...lg, pipeline: 'ready', pipelineRounds: 0 }, log: logged(state, 'Die Pipeline zum Bahnhof ist fertig. Ab jetzt fließt das Öl billig.') };
      return withMark(state, LOGISTICS_MARKS.built);
    }
    return { ...state, logistics: { ...lg, pipelineRounds: rest } };
  }
  if (lg.pipeline === 'damaged') {
    const rest = lg.pipelineRounds - 1;
    return rest <= 0
      ? { ...state, logistics: { ...lg, pipeline: 'ready', pipelineRounds: 0 }, log: logged(state, 'Die Pipeline ist repariert.') }
      : { ...state, logistics: { ...lg, pipelineRounds: rest } };
  }
  if (lg.pipeline === 'ready') {
    const rng = new Rng(lg.rng);
    const getroffen = rng.float() < sabotageChance(state, balance);
    if (!getroffen) return { ...state, logistics: { ...lg, rng: rng.state } };
    return {
      ...state,
      cash: cents(state.cash - p.repairCost),
      logistics: { ...lg, rng: rng.state, pipeline: 'damaged', pipelineRounds: p.repairRounds },
      log: logged(state, `Sabotage! Jemand hat die Pipeline in der Nacht aufgesägt. Reparatur ${dollars(p.repairCost)} $, sie steht ${p.repairRounds === 1 ? 'eine Runde' : `${p.repairRounds} Runden`} still.`),
    };
  }
  return state;
}

// --- Drohung gegenüber Thorne ---------------------------------------------------

/**
 * Glaubt Thorne an die Pipeline? Ja, wenn sie schon gebaut wird (oder läuft),
 * wenn alle Wegerechte da sind oder wenn Jacob das Geld für den Bau hat.
 */
export function pipelineCredible(state: Pick<GameState, 'events' | 'logistics' | 'cash'>, balance: Balance): boolean {
  const lg = state.logistics;
  if (lg.pipeline === 'building' || lg.pipeline === 'ready' || lg.pipeline === 'damaged') return true;
  if (lg.pipeline === 'surveyed' && missingRights(state, balance).length === 0) return true;
  return state.cash >= balance.transport.pipeline.buildCost;
}

/** Runden, bis Jacob wieder drohen kann (0 = jetzt). */
export function threatWait(state: Pick<GameState, 'round' | 'logistics'>, balance: Balance): number {
  if (state.logistics.threatRound === 0) return 0;
  return Math.max(0, state.logistics.threatRound + balance.transport.thorne.threatCooldown - state.round);
}

/**
 * Jacob droht Thorne mit der eigenen Pipeline. Glaubwürdig: Der Bahntarif sinkt
 * um threatCut (nicht unter minTariff). Bluff: Thorne lacht – und erhöht danach
 * öfter (Merkzeichen thorne_abgelehnt). So oder so erst nach threatCooldown wieder.
 */
export function threatenThorne(state: GameState, balance: Balance): LogisticsResult {
  const th = balance.transport.thorne;
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const warten = threatWait(state, balance);
  if (warten > 0) return { ok: false, reason: `Thorne empfängt Jacob frühestens in ${warten} ${warten === 1 ? 'Runde' : 'Runden'} wieder.` };
  const lg = { ...state.logistics, threatRound: state.round };
  if (!pipelineCredible(state, balance)) {
    const out: GameState = {
      ...state,
      logistics: lg,
      log: logged(state, 'Thorne lacht Jacob aus: „Eine Pipeline? Mit welchem Geld, welchem Land?“ Er wird sich das merken.'),
    };
    return { ok: true, state: withMark(out, RIVAL_MARKS.thorneRefused) };
  }
  // 4.7 Andockpunkt: Liegt der Tarif schon unter minTariff (Fernleitung zum Hafen, Kapitel 2), hebt die Drohung ihn nicht an.
  const neu = Math.min(state.railTariff, Math.max(th.minTariff, cents(state.railTariff - th.threatCut)));
  return {
    ok: true,
    state: {
      ...state,
      railTariff: neu,
      logistics: lg,
      log: logged(state, `Thorne rechnet nach und senkt den Bahntarif auf ${neu.toFixed(2).replace('.', ',')} $ je Barrel.`),
    },
  };
}

// --- Buchwert und Wegevergleich ---------------------------------------------------

/** Was Tanks, Gespanne und Pipeline zum Imperiumswert beitragen. */
export function logisticsAssets(state: Pick<GameState, 'logistics'>, balance: Balance): number {
  const t = balance.transport;
  const lg = state.logistics;
  const pipe = lg.pipeline === 'building' || lg.pipeline === 'ready' || lg.pipeline === 'damaged' ? t.pipeline.buildCost : 0;
  return cents(t.assetShare * ((lg.tanks + lg.tanksBuilding) * t.storage.tankCost + pipe) + lg.teams * t.teams.hireCost * t.teams.resale);
}

/** Planungslage für den Wegevergleich. */
export interface RouteScenario {
  /** Barrel je Runde, die verschickt werden sollen. */
  volume: number;
  /** Runden, über die sich eine Anschaffung bezahlt machen muss. */
  rounds: number;
  /** Aktueller Bahntarif. */
  railTariff: number;
  /** Ist schon da (keine Anschaffung mehr): eigene Gespanne / fertige Pipeline. */
  ownedTeams?: number;
  pipelineBuilt?: boolean;
}

export interface RouteCost {
  mode: TransportMode;
  /** Kosten je Barrel inklusive Fixkosten und anteiliger Anschaffung. */
  perBarrel: number;
  /** Wie viel dieser Weg je Runde schafft. */
  capacity: number;
  /** Gespanne, die man dafür bräuchte (nur teams). */
  teams?: number;
}

/**
 * Kosten je Barrel eines Wegs für eine Planungslage – mit Fixkosten und der
 * Anschaffung, verteilt auf alle Barrel der kommenden Runden. Schafft ein Weg
 * die Menge nicht, rechnet er nur mit dem, was er schafft (capacity zeigt das).
 */
export function routeCost(balance: Balance, s: RouteScenario, mode: TransportMode): RouteCost {
  const t = balance.transport;
  const runden = Math.max(1, s.rounds);
  switch (mode) {
    case 'wagon':
      return { mode, perBarrel: t.wagon.costPerBarrel, capacity: t.wagon.capacity };
    case 'rail':
      return { mode, perBarrel: s.railTariff, capacity: t.rail.capacity };
    case 'teams': {
      const n = Math.min(t.teams.maxTeams, Math.max(1, Math.ceil(s.volume / t.teams.capacity)));
      const menge = Math.min(s.volume, n * t.teams.capacity);
      const neu = Math.max(0, n - (s.ownedTeams ?? 0));
      const fix = n * t.teams.wagePerRound + (neu * t.teams.hireCost * (1 - t.teams.resale)) / runden;
      return { mode, perBarrel: cents(t.teams.costPerBarrel + fix / Math.max(1, menge)), capacity: n * t.teams.capacity, teams: n };
    }
    case 'pipeline': {
      const menge = Math.min(s.volume, t.pipeline.capacity);
      const bau = s.pipelineBuilt ? 0 : t.pipeline.buildCost;
      // Gebaut wird erst: Die Bauzeit fehlt an den nutzbaren Runden.
      const nutzbar = s.pipelineBuilt ? runden : Math.max(0, runden - t.pipeline.buildRounds);
      if (nutzbar === 0) return { mode, perBarrel: Infinity, capacity: t.pipeline.capacity };
      const fix = t.pipeline.upkeepPerRound + bau / nutzbar;
      return { mode, perBarrel: cents(t.pipeline.costPerBarrel + fix / Math.max(1, menge)), capacity: t.pipeline.capacity };
    }
  }
}

/** Alle Wege für eine Lage, billigster zuerst (nur Wege, die die ganze Menge schaffen, vorn). */
export function compareRoutes(balance: Balance, s: RouteScenario): RouteCost[] {
  return (['wagon', 'rail', 'teams', 'pipeline'] as const)
    .map((m) => routeCost(balance, s, m))
    .sort((a, b) => Number(b.capacity >= s.volume) - Number(a.capacity >= s.volume) || a.perBarrel - b.perBarrel);
}

/**
 * Lohnt der Händler? Gewinn je Runde gegenüber „alles an Crane“, wenn Jacob jede
 * Runde volume Barrel verkauft und davon so viel wie möglich an den Händler geht:
 * Aufschlag auf die Händlermenge minus Cranes Groll auf den Rest.
 */
export function traderGain(balance: Balance, volume: number): number {
  const tr = balance.transport.trader;
  const haendler = Math.min(volume, tr.capacity);
  return cents(haendler * tr.premium - (volume - haendler) * tr.grudgeCut);
}

/**
 * Wegevergleich für den Schreibtisch: Förderung der letzten Runde, restliche
 * Runden, aktueller Bahntarif und was Jacob schon hat.
 */
export function routePlan(state: GameState, balance: Balance, volume: number): { scenario: RouteScenario; routes: RouteCost[] } {
  const scenario: RouteScenario = {
    volume,
    rounds: Math.max(1, state.totalRounds - state.round + 1),
    railTariff: state.railTariff,
    ownedTeams: state.logistics.teams,
    pipelineBuilt: state.logistics.pipeline === 'ready' || state.logistics.pipeline === 'damaged',
  };
  return { scenario, routes: compareRoutes(balance, scenario) };
}
