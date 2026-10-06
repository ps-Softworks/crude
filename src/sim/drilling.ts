// Bohren (GDD §5): Eine Bohrung kostet Geld und dauert Runden. Am Ende jeder
// Stufe drohen Unfälle und klemmendes Werkzeug. Findet sie nichts, darf der
// Spieler tiefer bohren – teurer und gefährlicher ("Push your luck").
// In welcher Stufe das Öl liegt, wird beim Start einmal verdeckt gezogen.

import type { Balance, DrillStage } from './balance';
import { formatDate } from './calendar';
import { forecastMid, makeDeeperForecast, trueChance } from './forecast';
import { posteriorChance } from './exploration';
import { initialRate } from './production';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { leaseOf, parcelLabel } from './lease';
import { Rng } from './rng';
import { findRig, freeRig, noRigReason, rigLabel, rigRisk, rigStageCost, rigStageRounds, type Rig } from './rigs';
// 4.11 Andockpunkt: Drehbohren und Rollenmeißel verkürzen und verbilligen das Bohren (ab Kapitel 2).
// 0.4.20+9: Bohrtiefe (Drehbohren, Rollenmeißel) macht tiefe Stufen sicherer (techStage).
import { techDrillCost, techDrillRounds, techStage } from './research';

export type WellStatus = 'drilling' | 'decision' | 'stuck' | 'found' | 'dry';

/** Art des Funds: kleine Quelle oder Gusher. Entscheidet über die Anfangsrate. */
export type Find = 'small' | 'gusher';

/** Was eine gefundene Quelle seit dem Fund geliefert hat. */
export interface Production {
  /** Anfangsrate in Barrel je Runde, beim Fund aus der Reserve des Feldes. */
  initialRate: number;
  /** Runden, in denen die Quelle schon gefördert hat. */
  roundsProduced: number;
  /** Barrel der letzten Runde. */
  lastRate: number;
  /** Insgesamt geförderte Barrel aus dieser Quelle. */
  total: number;
}

export interface Well {
  /** Eindeutig je Bohrloch (0.2.15+5): Ranch-id, # und laufende Nummer auf dieser Ranch. */
  id: string;
  parcelId: string;
  /** Aktuelle Stufe, ab 1 gezählt. */
  stage: number;
  status: WellStatus;
  /** Runden bis zum Abschluss der laufenden Stufe. */
  roundsLeft: number;
  /** Bisher in diese Bohrung gesteckte $ (Stufen und Bergung, ohne Unfälle). */
  spent: number;
  /** Verdeckt: Stufe, in der das Öl liegt; null bei trockener Parzelle. */
  oilStage: number | null;
  result?: Find;
  /** Wird beim Fund gesetzt; davor gibt es nichts zu fördern. */
  production?: Production;
  startRound: number;
  /** Turm, der hier bohrt oder gebohrt hat (0.2.15+7); fehlt bei alten Ständen = Silas' Turm. */
  rigId?: string;
  /** Pumpe nachgerüstet (0.2.15+7). */
  pump?: boolean;
}

export type DrillResult = { ok: true; state: GameState } | { ok: false; reason: string };

const ACTIVE: readonly WellStatus[] = ['drilling', 'decision', 'stuck'];

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function stageOf(balance: Balance, stage: number): DrillStage {
  const s = balance.drilling.stages[stage - 1];
  if (!s) throw new Error(`Bohrstufe ${stage} gibt es nicht.`);
  return s;
}

export function stageCost(balance: Balance, stage: number): number {
  return stageOf(balance, stage).cost;
}

export function accidentChance(balance: Balance, stage: number): number {
  return stageOf(balance, stage).accident;
}

export function stuckChance(balance: Balance, stage: number): number {
  return stageOf(balance, stage).stuck;
}

/** Spielspaß K1: So viel größer ist ein Fund in dieser Stufe (Vorrat und Anfangsrate, Stufe 1 = 1). */
export function findFactor(balance: Balance, stage: number): number {
  return stageOf(balance, stage).findFactor;
}

/**
 * Spielspaß K1 (Tieferbohren): In der Tiefe ist Öl seltener, ein Fund aber größer. Beim
 * ersten Fund auf einer Ranch in Stufe stage wächst ihr Vorrat (und der ihres Feldes) um
 * (findFactor − 1) × Vorrat – die Anfangsrate hängt am Vorrat je Fläche (initialRate) und
 * wächst mit. Weitere Bohrlöcher derselben Ranch gehen auf dieselbe Tiefe und erben das,
 * ohne den Vorrat noch einmal zu vergrößern. Flache Funde ändern nichts.
 */
export function deepFindReserves(
  state: Pick<GameState, 'parcels' | 'fields' | 'wells'>,
  balance: Balance,
  parcelId: string,
  stage: number,
): Pick<GameState, 'parcels' | 'fields'> {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  const faktor = findFactor(balance, stage);
  if (!parcel || faktor <= 1 || wellsOn(state, parcelId).some((w) => w.status === 'found')) {
    return { parcels: state.parcels, fields: state.fields };
  }
  const plus = Math.round(parcel.reserves * (faktor - 1));
  return {
    parcels: state.parcels.map((p) => (p.id === parcelId ? { ...p, reserves: p.reserves + plus } : p)),
    fields: state.fields.map((f) => (f.id === parcel.fieldId ? { ...f, reserves: f.reserves + plus } : f)),
  };
}

/** Alle Bohrlöcher auf einer Ranch, in der Reihenfolge, in der sie gebohrt wurden. */
export function wellsOn(state: Pick<GameState, 'wells'>, parcelId: string): Well[] {
  return state.wells.filter((w) => w.parcelId === parcelId);
}

/**
 * Kennung für das nächste Bohrloch einer Ranch: höchste vergebene Nummer + 1. Nicht
 * die Anzahl + 1 – im Zeitsprung verkauft der Verwalter einzelne Quellen (Notverkauf),
 * danach wäre die Nummer schon vergeben (4.5).
 */
export function nextWellId(state: Pick<GameState, 'wells'>, parcelId: string): string {
  const praefix = `${parcelId}#`;
  const hoechste = wellsOn(state, parcelId).reduce((max, w) => {
    const n = w.id.startsWith(praefix) ? Number(w.id.slice(praefix.length)) : NaN;
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return `${praefix}${hoechste + 1}`;
}

/**
 * Das Bohrloch, um das es auf einer Ranch gerade geht: das laufende, sonst das
 * zuletzt gebohrte. Auf einer Ranch läuft höchstens eine Bohrung zugleich.
 */
export function wellOf(state: Pick<GameState, 'wells'>, parcelId: string): Well | undefined {
  const auf = wellsOn(state, parcelId);
  return auf.find((w) => ACTIVE.includes(w.status)) ?? auf[auf.length - 1];
}

/** Freie Bohrplätze auf einer Ranch. */
export function freeSlots(state: Pick<GameState, 'wells' | 'parcels'>, parcelId: string): number {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return Math.max(0, (parcel?.slots ?? 0) - wellsOn(state, parcelId).length);
}

export function activeWells(state: Pick<GameState, 'wells'>): Well[] {
  return state.wells.filter((w) => ACTIVE.includes(w.status));
}

/** In welcher Stufe liegt das Öl? roll in [0, 1); trockene Ranches haben keins. */
export function rollOilStage(balance: Balance, parcel: Parcel, roll: number): number | null {
  if (parcel.geology === 'dry') return null;
  if (parcel.sure) return 1;
  const stages = balance.drilling.stages;
  let threshold = roll;
  for (let i = 0; i < stages.length; i++) {
    threshold -= stages[i].oilShare;
    if (threshold < 0) return i + 1;
  }
  return stages.length;
}

/**
 * Chance, dass in Stufe stage+1 Öl liegt, wenn bis Stufe stage nichts kam – mit der
 * wahren Fundchance (Debug) oder mit chance, z. B. der Chance nach Jacobs Hinweisen.
 */
export function deeperChance(balance: Balance, parcel: Parcel, stage: number, chance?: number): number {
  const stages = balance.drilling.stages;
  if (stage >= stages.length) return 0;
  const q = chance ?? trueChance(balance, parcel);
  const passed = stages.slice(0, stage).reduce((s, st) => s + st.oilShare, 0);
  const rest = 1 - q * passed;
  return rest <= 0 ? 0 : (q * stages[stage].oilShare) / rest;
}

/** Was die Prognose für die nächste Bohrstufe bedeutet (Frühes Öl, 0.4.4+). */
export interface StageOutlook {
  /** Stufe, um die es geht, ab 1 gezählt. */
  stage: number;
  /** Tiefe dieser Stufe in Metern. */
  depth: number;
  /** Chance auf Öl in genau dieser Stufe, in ganzen Prozent. */
  chance: number;
}

/**
 * Chance „in 300 m“ bzw. in der nächsten Stufe, so wie der Spieler sie aus der
 * Prognose ablesen kann – aus der Mitte der angezeigten Bandbreite, nie aus den
 * wahren Werten. Vor der ersten Stufe nennt der Geologe die Gesamtchance; davon
 * liegt nur der Anteil oilShare der ersten Stufe so flach. Nach einer trockenen
 * Stufe schätzt er schon die nächste Stufe (siehe advanceDrilling), dann gilt die
 * Mitte direkt. null, wenn es nichts mehr zu bohren gibt (Fund, aufgegeben,
 * letzte Stufe) oder keine Prognose da ist.
 */
export function stageOutlook(
  state: Pick<GameState, 'forecasts' | 'wells'>,
  balance: Balance,
  parcelId: string,
): StageOutlook | null {
  const forecast = state.forecasts[parcelId];
  if (!forecast) return null;
  const stages = balance.drilling.stages;
  const auf = wellsOn(state, parcelId);
  if (auf.some((w) => w.status === 'found')) return null;
  const well = wellOf(state, parcelId);
  const mid = forecastMid(forecast);
  let stage: number;
  if (!well) stage = 1;
  else if (well.status === 'decision') stage = well.stage + 1;
  else if (well.status === 'drilling' || well.status === 'stuck') stage = well.stage;
  else return null;
  if (stage > stages.length) return null;
  const chance = forecast.sure ? 100 : stage === 1 ? mid * stages[0].oilShare : mid;
  return { stage, depth: stages[stage - 1].depth, chance: Math.round(chance) };
}

function replaceWell(state: GameState, well: Well): Well[] {
  return state.wells.map((w) => (w.id === well.id ? well : w));
}

function labelOf(state: GameState, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return parcel ? parcelLabel(parcel) : parcelId;
}

/** Was die nächste Bohrung auf einer Ranch kostet und wie lange sie dauert. */
export interface DrillQuote {
  /** Stufe, in der die Bohrung beginnt (weitere Bohrlöcher: gleich die Tiefe der Quelle). */
  stage: number;
  cost: number;
  rounds: number;
  /** Der Turm, mit dem gerechnet wird (der beste freie, sonst der beste überhaupt). */
  rig?: Rig;
}

/**
 * Kosten und Dauer der nächsten Bohrung auf dieser Ranch. Die erste Bohrung
 * beginnt mit Stufe 1. Ein weiteres Bohrloch (0.2.15+7) geht gleich auf die
 * Tiefe, in der die Quelle liegt: alle Stufen bis dorthin in einem Zug, ohne
 * Zwischenentscheidung – die Tiefe ist ja bekannt.
 */
export function drillQuote(state: Pick<GameState, 'wells' | 'rigs' | 'round'>, balance: Balance, parcelId: string): DrillQuote {
  const rig = freeRig(state) ?? [...state.rigs].sort((a, b) => Number(b.steam) - Number(a.steam))[0];
  const quelle = wellsOn(state, parcelId).find((w) => w.status === 'found');
  const stage = quelle ? quelle.stage : 1;
  const stufen = balance.drilling.stages.slice(0, stage);
  return {
    stage,
    cost: techDrillCost(state, balance, stufen.reduce((s, st) => s + rigStageCost(balance, rig, st), 0)), // 4.11 Andockpunkt
    rounds: techDrillRounds(state, balance, stufen.reduce((s, st) => s + rigStageRounds(balance, rig, st), 0)), // 4.11 Andockpunkt
    rig,
  };
}

/**
 * Bohrung auf einer eigenen Pacht beginnen. Die erste Bohrung geht auf jeder
 * eigenen Pacht; weitere Bohrlöcher (0.2.15+5) nur auf fündigem Land, bis alle
 * Bohrplätze der Ranch belegt sind. Sie gehen gleich auf die Tiefe der ersten
 * Quelle (0.2.15+7) – das Risiko sind nur noch Unfälle und klemmendes Werkzeug.
 * Jede Bohrung braucht einen freien Turm (0.2.15+7); der beste freie bohrt.
 */
export function startDrilling(state: GameState, balance: Balance, parcelId: string): DrillResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!parcel) return { ok: false, reason: 'Diese Ranch gibt es nicht.' };
  const lease = leaseOf(state, parcelId);
  if (!lease || lease.holder !== 'jacob') return { ok: false, reason: 'Bohren geht nur auf einer eigenen Pacht.' };
  const bisher = wellsOn(state, parcelId);
  if (bisher.some((w) => ACTIVE.includes(w.status))) return { ok: false, reason: 'Hier wird schon gebohrt.' };
  const quelle = bisher.find((w) => w.status === 'found');
  if (bisher.length > 0 || lease.drilled) {
    if (!quelle) return { ok: false, reason: 'Ein weiteres Bohrloch lohnt nur, wo schon Öl gefunden wurde.' };
    if (bisher.length >= parcel.slots) {
      return { ok: false, reason: `Alle ${parcel.slots} Bohrplätze auf ${parcelLabel(parcel)} sind belegt.` };
    }
  }
  const rig = freeRig(state);
  if (!rig) return { ok: false, reason: noRigReason(state) };
  const quote = drillQuote(state, balance, parcelId);
  const cost = quote.cost;
  if (state.cash < cost) {
    return { ok: false, reason: `Nicht genug Geld: Die Bohrung kostet ${money(cost)}, in der Kasse sind ${money(state.cash)}.` };
  }
  const rng = new Rng(state.rng);
  // Immer genau ein Zufallswert, auch bei trockenem Land: so bleibt der Zufall gleichmäßig.
  const gewuerfelt = rollOilStage(balance, parcel, rng.float());
  const oilStage = quelle ? quelle.stage : gewuerfelt;
  // Im Protokoll zählt das Loch auf der Ranch, die Kennung ist eindeutig (nextWellId).
  const nummer = bisher.length + 1;
  const well: Well = {
    id: nextWellId(state, parcelId),
    parcelId,
    stage: quote.stage,
    status: 'drilling',
    roundsLeft: quote.rounds,
    spent: cost,
    oilStage,
    startRound: state.round,
    rigId: rig.id,
  };
  const tiefe = stageOf(balance, quote.stage).depth;
  const turm = state.rigs.length > 1 ? `, ${rigLabel(rig)}` : '';
  return {
    ok: true,
    state: {
      ...state,
      rng: rng.state,
      cash: state.cash - cost,
      leases: state.leases.map((l) => (l.parcelId === parcelId ? { ...l, drilled: true } : l)),
      wells: [...state.wells, well],
      log: [
        ...state.log,
        nummer === 1
          ? `${formatDate(state)}: Bohrung auf ${parcelLabel(parcel)} begonnen (${tiefe} m, ${money(cost)}${turm}).`
          : `${formatDate(state)}: ${nummer}. Bohrloch auf ${parcelLabel(parcel)} begonnen (direkt auf ${tiefe} m, ${money(cost)}${turm}).`,
      ],
    },
  };
}

/**
 * Rundenende: Laufende Bohrungen kommen eine Runde voran. Endet eine Stufe,
 * werden immer zwei Zufallswerte gezogen (Unfall, Werkzeug), in Listenreihenfolge.
 */
export function advanceDrilling(input: GameState, balance: Balance): GameState {
  if (!input.wells.some((w) => w.status === 'drilling')) return input;
  const rng = new Rng(input.rng);
  const date = formatDate(input);
  const log = [...input.log];
  const forecasts = { ...input.forecasts };
  let cash = input.cash;
  // Spielspaß K1: Tiefe Funde vergrößern Vorrat von Ranch und Feld (deepFindReserves).
  let lager: Pick<GameState, 'parcels' | 'fields'> = { parcels: input.parcels, fields: input.fields };
  const lastStage = balance.drilling.stages.length;

  const wells = input.wells.map((old): Well => {
    if (old.status !== 'drilling') return old;
    const well = { ...old, roundsLeft: old.roundsLeft - 1 };
    if (well.roundsLeft > 0) return well;
    const label = labelOf(input, well.parcelId);
    const a = rng.float();
    const s = rng.float();
    const depth = stageOf(balance, well.stage).depth;
    // Stahlgestänge (0.2.15+7) senkt Unfall- und Klemm-Chance des Turms; 0.4.20+9: Bohrtiefe aus der Forschung auch.
    // Startquelle (0.4.20+19): Das erste Loch läuft ohne Unfall und Klemmen – „sicher“ heißt sicher.
    const sicher = input.parcels.find((p) => p.id === well.parcelId)?.sure && well.stage === 1;
    const risiko = sicher ? { accident: 0, stuck: 0 } : rigRisk(balance, findRig(input, well.rigId), techStage(input, balance, well.stage));
    if (a < risiko.accident) {
      const paid = Math.min(cash, balance.drilling.accidentCost);
      cash -= paid;
      log.push(`${date}: Unfall auf dem Bohrturm (${label}) – ${money(paid)} Entschädigung, die Stufe muss wiederholt werden.`);
      return { ...well, roundsLeft: 1 };
    }
    if (s < risiko.stuck) {
      log.push(`${date}: Auf ${label} klemmt das Werkzeug in ${depth} m Tiefe.`);
      return { ...well, status: 'stuck' };
    }
    if (well.oilStage === well.stage) {
      const parcel = input.parcels.find((p) => p.id === well.parcelId)!;
      const result = parcel.geology === 'gusher' ? 'gusher' : 'small';
      lager = deepFindReserves({ ...lager, wells: input.wells }, balance, well.parcelId, well.stage);
      const tief = well.stage > 1 && findFactor(balance, well.stage) > 1 ? ' Das Ausharren hat sich gelohnt: In der Tiefe ist die Lagerstätte größer.' : '';
      log.push(
        result === 'gusher'
          ? `${date}: GUSHER! Auf ${label} schießt in ${depth} m das Öl über den Bohrturm!${tief}`
          : `${date}: Öl! ${label} fördert in ${depth} m eine kleine Quelle.${tief}`,
      );
      return {
        ...well,
        status: 'found',
        result,
        production: {
          initialRate: initialRate(balance, lager, { parcelId: well.parcelId, result }),
          roundsProduced: 0,
          lastRate: 0,
          total: 0,
        },
      };
    }
    if (well.stage < lastStage) {
      const parcel = input.parcels.find((p) => p.id === well.parcelId)!;
      // Etappe 1: Der Geologe rechnet mit dem, was Jacob weiß (Chance nach den Hinweisen), nicht mit dem verdeckten q.
      // Spielspaß K1: aus dem Bohrklein enger und ohne Abschneiden an 0 % (makeDeeperForecast).
      forecasts[well.parcelId] = makeDeeperForecast(
        balance,
        parcel.id,
        balance.forecast.geologist,
        rng,
        deeperChance(balance, parcel, well.stage, posteriorChance(input, balance, parcel.id)),
      );
      log.push(`${date}: ${label} ist in ${depth} m trocken. Tiefer bohren oder aufgeben?`);
      return { ...well, status: 'decision' };
    }
    log.push(`${date}: ${label} ist auch in ${depth} m trocken – die Bohrung ist ein Fehlschlag.`);
    return { ...well, status: 'dry' };
  });

  return { ...input, ...lager, rng: rng.state, cash, wells, forecasts, log };
}

function needWell(state: GameState, parcelId: string, allowed: readonly WellStatus[]): Well | string {
  if (state.finished) return 'Das Kapitel ist beendet.';
  const well = wellsOn(state, parcelId).find((w) => allowed.includes(w.status));
  if (!well) return 'Das geht bei dieser Bohrung gerade nicht.';
  return well;
}

/** Nach einer trockenen Stufe eine Stufe tiefer bohren. */
export function drillDeeper(state: GameState, balance: Balance, parcelId: string): DrillResult {
  const well = needWell(state, parcelId, ['decision']);
  if (typeof well === 'string') return { ok: false, reason: well };
  const next = well.stage + 1;
  if (next > balance.drilling.stages.length) return { ok: false, reason: 'Tiefer geht es mit diesem Turm nicht.' };
  const stage = stageOf(balance, next);
  const rig = findRig(state, well.rigId);
  const cost = techDrillCost(state, balance, rigStageCost(balance, rig, stage)); // 4.11 Andockpunkt
  if (state.cash < cost) {
    return { ok: false, reason: `Nicht genug Geld: ${stage.depth} m kosten ${money(cost)}, in der Kasse sind ${money(state.cash)}.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - cost,
      wells: replaceWell(state, { ...well, stage: next, status: 'drilling', roundsLeft: techDrillRounds(state, balance, rigStageRounds(balance, rig, stage)), spent: well.spent + cost }), // 4.11 Andockpunkt
      log: [...state.log, `${formatDate(state)}: Auf ${labelOf(state, parcelId)} wird tiefer gebohrt, auf ${stage.depth} m (${money(cost)}).`],
    },
  };
}

/** Kosten und Unfall-Chance der nächsten tieferen Stufe mit dem Turm dieser Bohrung. */
export function deeperQuote(state: Pick<GameState, 'rigs'>, balance: Balance, well: Well): { cost: number; accident: number } | null {
  const stage = balance.drilling.stages[well.stage];
  if (!stage) return null;
  const rig = findRig(state, well.rigId);
  return { cost: techDrillCost(state, balance, rigStageCost(balance, rig, stage)), accident: rigRisk(balance, rig, techStage(state, balance, well.stage + 1)).accident }; // 4.11 Andockpunkt, 0.4.20+9 Bohrtiefe
}

/** Klemmendes Werkzeug bergen: kostet Geld und eine Runde, dann wird die Stufe neu abgeschlossen. */
export function fishWell(state: GameState, balance: Balance, parcelId: string): DrillResult {
  const well = needWell(state, parcelId, ['stuck']);
  if (typeof well === 'string') return { ok: false, reason: well };
  const cost = balance.drilling.fishingCost;
  if (state.cash < cost) {
    return { ok: false, reason: `Nicht genug Geld: Die Bergung kostet ${money(cost)}, in der Kasse sind ${money(state.cash)}.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - cost,
      wells: replaceWell(state, { ...well, status: 'drilling', roundsLeft: 1, spent: well.spent + cost }),
      log: [...state.log, `${formatDate(state)}: Bergung des Werkzeugs auf ${labelOf(state, parcelId)} (${money(cost)}).`],
    },
  };
}

/** Bohrung aufgeben: Sie gilt als trocken, der Turm wird frei. */
export function abandonWell(state: GameState, _balance: Balance, parcelId: string): DrillResult {
  const well = needWell(state, parcelId, ['decision', 'stuck']);
  if (typeof well === 'string') return { ok: false, reason: well };
  return {
    ok: true,
    state: {
      ...state,
      wells: replaceWell(state, { ...well, status: 'dry' }),
      log: [...state.log, `${formatDate(state)}: Die Bohrung auf ${labelOf(state, parcelId)} wird aufgegeben.`],
    },
  };
}
