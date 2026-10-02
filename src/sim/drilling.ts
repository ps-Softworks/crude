// Bohren (GDD §5): Eine Bohrung kostet Geld und dauert Runden. Am Ende jeder
// Stufe drohen Unfälle und klemmendes Werkzeug. Findet sie nichts, darf der
// Spieler tiefer bohren – teurer und gefährlicher ("Push your luck").
// In welcher Stufe das Öl liegt, wird beim Start einmal verdeckt gezogen.

import type { Balance, DrillStage } from './balance';
import { formatDate } from './calendar';
import { makeForecast, trueChance } from './forecast';
import { initialRate } from './production';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { leaseOf, parcelLabel } from './lease';
import { Rng } from './rng';

export type WellStatus = 'drilling' | 'decision' | 'stuck' | 'found' | 'dry';

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
  result?: 'small' | 'gusher';
  /** Wird beim Fund gesetzt; davor gibt es nichts zu fördern. */
  production?: Production;
  startRound: number;
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

export function wellOf(state: Pick<GameState, 'wells'>, parcelId: string): Well | undefined {
  return state.wells.find((w) => w.parcelId === parcelId);
}

export function activeWells(state: Pick<GameState, 'wells'>): Well[] {
  return state.wells.filter((w) => ACTIVE.includes(w.status));
}

/** In welcher Stufe liegt das Öl? roll in [0, 1); trockene Parzellen haben keins. */
export function rollOilStage(balance: Balance, parcel: Parcel, roll: number): number | null {
  if (parcel.geology === 'dry') return null;
  const stages = balance.drilling.stages;
  let threshold = roll;
  for (let i = 0; i < stages.length; i++) {
    threshold -= stages[i].oilShare;
    if (threshold < 0) return i + 1;
  }
  return stages.length;
}

/**
 * Chance, dass in Stufe stage+1 Öl liegt, wenn bis Stufe stage nichts kam.
 * Nur für Simulation und Debug-Ansicht.
 */
export function deeperChance(balance: Balance, parcel: Parcel, stage: number): number {
  const stages = balance.drilling.stages;
  if (stage >= stages.length) return 0;
  const q = trueChance(balance, parcel);
  const passed = stages.slice(0, stage).reduce((s, st) => s + st.oilShare, 0);
  const rest = 1 - q * passed;
  return rest <= 0 ? 0 : (q * stages[stage].oilShare) / rest;
}

function replaceWell(state: GameState, well: Well): Well[] {
  return state.wells.map((w) => (w.parcelId === well.parcelId ? well : w));
}

function labelOf(state: GameState, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return parcel ? parcelLabel(parcel) : parcelId;
}

/** Bohrung auf einer eigenen, ungebohrten Pacht beginnen. */
export function startDrilling(state: GameState, balance: Balance, parcelId: string): DrillResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!parcel) return { ok: false, reason: 'Diese Parzelle gibt es nicht.' };
  const lease = leaseOf(state, parcelId);
  if (!lease || lease.holder !== 'jacob') return { ok: false, reason: 'Bohren geht nur auf einer eigenen Pacht.' };
  if (lease.drilled || wellOf(state, parcelId)) return { ok: false, reason: 'Hier wird schon gebohrt.' };
  if (activeWells(state).length >= balance.drilling.rigs) {
    return { ok: false, reason: 'Der Bohrturm ist noch bei einer anderen Bohrung im Einsatz.' };
  }
  const cost = stageCost(balance, 1);
  if (state.cash < cost) {
    return { ok: false, reason: `Nicht genug Geld: Die Bohrung kostet ${money(cost)}, in der Kasse sind ${money(state.cash)}.` };
  }
  const rng = new Rng(state.rng);
  // Immer genau ein Zufallswert, auch bei trockenem Land: so bleibt der Zufall gleichmäßig.
  const oilStage = rollOilStage(balance, parcel, rng.float());
  const well: Well = {
    parcelId,
    stage: 1,
    status: 'drilling',
    roundsLeft: stageOf(balance, 1).rounds,
    spent: cost,
    oilStage,
    startRound: state.round,
  };
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
        `${formatDate(state)}: Bohrung auf Parzelle ${parcelLabel(parcel)} begonnen (${stageOf(balance, 1).depth} m, ${money(cost)}).`,
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
  const lastStage = balance.drilling.stages.length;

  const wells = input.wells.map((old): Well => {
    if (old.status !== 'drilling') return old;
    const well = { ...old, roundsLeft: old.roundsLeft - 1 };
    if (well.roundsLeft > 0) return well;
    const label = labelOf(input, well.parcelId);
    const a = rng.float();
    const s = rng.float();
    const depth = stageOf(balance, well.stage).depth;
    if (a < accidentChance(balance, well.stage)) {
      const paid = Math.min(cash, balance.drilling.accidentCost);
      cash -= paid;
      log.push(`${date}: Unfall auf dem Bohrturm (Parzelle ${label}) – ${money(paid)} Entschädigung, die Stufe muss wiederholt werden.`);
      return { ...well, roundsLeft: 1 };
    }
    if (s < stuckChance(balance, well.stage)) {
      log.push(`${date}: Auf Parzelle ${label} klemmt das Werkzeug in ${depth} m Tiefe.`);
      return { ...well, status: 'stuck' };
    }
    if (well.oilStage === well.stage) {
      const parcel = input.parcels.find((p) => p.id === well.parcelId)!;
      const result = parcel.geology === 'gusher' ? 'gusher' : 'small';
      log.push(
        result === 'gusher'
          ? `${date}: GUSHER! Auf Parzelle ${label} schießt in ${depth} m das Öl über den Bohrturm!`
          : `${date}: Öl! Parzelle ${label} fördert in ${depth} m eine kleine Quelle.`,
      );
      return {
        ...well,
        status: 'found',
        result,
        production: { initialRate: initialRate(balance, input, well.parcelId), roundsProduced: 0, lastRate: 0, total: 0 },
      };
    }
    if (well.stage < lastStage) {
      const parcel = input.parcels.find((p) => p.id === well.parcelId)!;
      forecasts[well.parcelId] = makeForecast(
        balance,
        parcel,
        balance.forecast.geologist,
        rng,
        deeperChance(balance, parcel, well.stage),
      );
      log.push(`${date}: Parzelle ${label} ist in ${depth} m trocken. Tiefer bohren oder aufgeben?`);
      return { ...well, status: 'decision' };
    }
    log.push(`${date}: Parzelle ${label} ist auch in ${depth} m trocken – die Bohrung ist ein Fehlschlag.`);
    return { ...well, status: 'dry' };
  });

  return { ...input, rng: rng.state, cash, wells, forecasts, log };
}

function needWell(state: GameState, parcelId: string, allowed: readonly WellStatus[]): Well | string {
  if (state.finished) return 'Das Kapitel ist beendet.';
  const well = wellOf(state, parcelId);
  if (!well || !allowed.includes(well.status)) return 'Das geht bei dieser Bohrung gerade nicht.';
  return well;
}

/** Nach einer trockenen Stufe eine Stufe tiefer bohren. */
export function drillDeeper(state: GameState, balance: Balance, parcelId: string): DrillResult {
  const well = needWell(state, parcelId, ['decision']);
  if (typeof well === 'string') return { ok: false, reason: well };
  const next = well.stage + 1;
  if (next > balance.drilling.stages.length) return { ok: false, reason: 'Tiefer geht es mit diesem Turm nicht.' };
  const stage = stageOf(balance, next);
  if (state.cash < stage.cost) {
    return { ok: false, reason: `Nicht genug Geld: ${stage.depth} m kosten ${money(stage.cost)}, in der Kasse sind ${money(state.cash)}.` };
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - stage.cost,
      wells: replaceWell(state, { ...well, stage: next, status: 'drilling', roundsLeft: stage.rounds, spent: well.spent + stage.cost }),
      log: [...state.log, `${formatDate(state)}: Auf Parzelle ${labelOf(state, parcelId)} wird tiefer gebohrt, auf ${stage.depth} m (${money(stage.cost)}).`],
    },
  };
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
      log: [...state.log, `${formatDate(state)}: Bergung des Werkzeugs auf Parzelle ${labelOf(state, parcelId)} (${money(cost)}).`],
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
      log: [...state.log, `${formatDate(state)}: Die Bohrung auf Parzelle ${labelOf(state, parcelId)} wird aufgegeben.`],
    },
  };
}
