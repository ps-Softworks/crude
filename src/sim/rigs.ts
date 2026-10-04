// Bohrtürme und Pumpen (0.2.15+7, GDD §5 Technik, Kapitel 1: Seilschlag).
//
// Je Turm läuft eine Bohrung zugleich. Jacob startet mit Silas' geliehenem
// Seilschlag-Turm. Weitere Türme kauft er (Lieferzeit, zählt zum Imperiumswert)
// oder mietet sie (Miete je Runde, jederzeit zurückzugeben). Nachrüsten:
//   Dampfmaschine  jede Bohrstufe billiger und schneller
//   Stahlgestänge  weniger Unfälle und klemmendes Werkzeug
// Pumpen sitzen an fündigen Quellen: mehr Rate, weniger Druckverlust, aber
// Unterhalt je Runde. Ob sich das lohnt, rechnet src/sim/invest.ts vor.
// Reine Funktionen, kein Zufall.

import type { Balance, DrillStage } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import type { Well } from './drilling';
import { parcelLabel } from './lease';

export type RigKind = 'lent' | 'owned' | 'rented';
export type RigUpgrade = 'steam' | 'rods';

export interface Rig {
  id: string;
  kind: RigKind;
  /** Ab dieser Runde einsatzbereit (Lieferung). */
  readyRound: number;
  /** Dampfmaschine eingebaut. */
  steam: boolean;
  /** Stahlgestänge statt Seil. */
  rods: boolean;
}

/** Silas' geliehener Turm – der erste, mit dem Jacob anfängt. */
export const SILAS_RIG = 'silas';

export type RigResult = { ok: true; state: GameState } | { ok: false; reason: string };

const ACTIVE = new Set(['drilling', 'decision', 'stuck']);

function money(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 2 })} $`;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Die Türme zu Spielbeginn: Silas' geliehener, dazu (für Tests) weitere eigene. */
export function startRigs(balance: Balance): Rig[] {
  return Array.from({ length: balance.drilling.rigs.start }, (_, i) => ({
    id: i === 0 ? SILAS_RIG : `turm-${i + 1}`,
    kind: i === 0 ? 'lent' : 'owned',
    readyRound: 1,
    steam: false,
    rods: false,
  }));
}

/** Name eines Turms für Schreibtisch und Protokoll. */
export function rigLabel(rig: Pick<Rig, 'id' | 'kind'>): string {
  if (rig.kind === 'lent') return "Silas' Seilschlag-Turm";
  const nr = rig.id.replace(/^turm-/, '');
  return rig.kind === 'rented' ? `Mietturm ${nr}` : `Turm ${nr}`;
}

/** Welcher Turm an einer Bohrung steht; alte Bohrungen ohne Angabe gehören Silas' Turm. */
export function rigOfWell(well: Pick<Well, 'rigId'>): string {
  return well.rigId ?? SILAS_RIG;
}

export function findRig(state: Pick<GameState, 'rigs'>, rigId: string | undefined): Rig | undefined {
  return state.rigs.find((r) => r.id === (rigId ?? SILAS_RIG));
}

/** Die laufende Bohrung eines Turms, falls er im Einsatz ist. */
export function rigWell(state: Pick<GameState, 'wells'>, rigId: string): Well | undefined {
  return state.wells.find((w) => ACTIVE.has(w.status) && rigOfWell(w) === rigId);
}

export function rigReady(state: Pick<GameState, 'round'>, rig: Rig): boolean {
  return rig.readyRound <= state.round;
}

/** Wie gut ein Turm ausgerüstet ist – der beste freie bohrt zuerst. */
function ausstattung(rig: Rig): number {
  return (rig.steam ? 2 : 0) + (rig.rods ? 1 : 0);
}

/** Der beste freie, einsatzbereite Turm – oder undefined, wenn alle bohren oder noch unterwegs sind. */
export function freeRig(state: Pick<GameState, 'rigs' | 'wells' | 'round'>): Rig | undefined {
  return state.rigs
    .filter((r) => rigReady(state, r) && !rigWell(state, r.id))
    .sort((a, b) => ausstattung(b) - ausstattung(a))[0];
}

/** Warum gerade kein Turm frei ist, in einem Satz. */
export function noRigReason(state: Pick<GameState, 'rigs' | 'round'>): string {
  const unterwegs = state.rigs.filter((r) => !rigReady(state, r));
  if (unterwegs.length > 0) {
    const bald = Math.min(...unterwegs.map((r) => r.readyRound - state.round));
    return `Alle Türme sind im Einsatz – der neue Turm kommt in ${bald === 1 ? '1 Runde' : `${bald} Runden`}.`;
  }
  return state.rigs.length === 1
    ? 'Der Bohrturm ist noch bei einer anderen Bohrung im Einsatz.'
    : 'Alle Bohrtürme sind im Einsatz.';
}

// --- Wirkung der Ausrüstung --------------------------------------------------------

/** Kosten einer Bohrstufe mit diesem Turm (Dampfmaschine: billiger). */
export function rigStageCost(balance: Balance, rig: Rig | undefined, stage: DrillStage): number {
  return rig?.steam ? Math.round(stage.cost * balance.drilling.rigs.steam.costFactor) : stage.cost;
}

/** Runden einer Bohrstufe mit diesem Turm (Dampfmaschine: schneller, mindestens 1). */
export function rigStageRounds(balance: Balance, rig: Rig | undefined, stage: DrillStage): number {
  return rig?.steam ? Math.max(1, stage.rounds - balance.drilling.rigs.steam.roundsLess) : stage.rounds;
}

/** Unfall- und Klemm-Chance einer Stufe mit diesem Turm (Stahlgestänge: weniger). */
export function rigRisk(balance: Balance, rig: Rig | undefined, stage: DrillStage): { accident: number; stuck: number } {
  const f = rig?.rods ? balance.drilling.rigs.rods.riskFactor : 1;
  return { accident: stage.accident * f, stuck: stage.stuck * f };
}

/** Was eine Dampfmaschine je Bohrstufe spart (in $, auf der ersten Stufe) und nach wie vielen Stufen sie bezahlt ist. */
export function steamPayback(balance: Balance): { savingPerStage: number; stages: number | null } {
  const s = balance.drilling.rigs.steam;
  const ersteStufe = balance.drilling.stages[0];
  const saving = ersteStufe.cost - Math.round(ersteStufe.cost * s.costFactor);
  return { savingPerStage: saving, stages: saving > 0 ? Math.ceil(s.cost / saving) : null };
}

/** Was Stahlgestänge je erster Bohrstufe im Mittel spart (Unfälle, Bergung) und nach wie vielen Stufen es bezahlt ist. */
export function rodsPayback(balance: Balance): { savingPerStage: number; stages: number | null } {
  const d = balance.drilling;
  const st = d.stages[0];
  const saving = cents((st.accident * d.accidentCost + st.stuck * d.fishingCost) * (1 - d.rigs.rods.riskFactor));
  return { savingPerStage: saving, stages: saving > 0 ? Math.ceil(d.rigs.rods.cost / saving) : null };
}

/** Ab wie vielen Runden Nutzung ein gekaufter Turm billiger ist als ein gemieteter (Buchwert abgezogen). */
export function buyVsRentRounds(balance: Balance): number | null {
  const r = balance.drilling.rigs;
  const netto = r.buy.cost * (1 - r.assetShare);
  return r.rent.costPerRound > 0 ? Math.ceil(netto / r.rent.costPerRound) : null;
}

// --- Aktionen ------------------------------------------------------------------------

function logged(state: GameState, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

function nextRigId(state: Pick<GameState, 'rigs'>): string {
  const nummern = state.rigs.map((r) => Number(r.id.replace(/^turm-/, ''))).filter(Number.isFinite);
  return `turm-${Math.max(1, ...nummern) + 1}`;
}

function canAddRig(state: GameState, balance: Balance, cost: number): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  const max = balance.drilling.rigs.max;
  if (state.rigs.length >= max) return `Mehr als ${max} Türme kann Jacob nicht beaufsichtigen.`;
  if (state.cash < cost) return `Nicht genug Geld: ${money(cost)} nötig, in der Kasse sind ${money(state.cash)}.`;
  return null;
}

/** Einen Turm kaufen: zahlbar sofort, einsatzbereit nach der Lieferzeit. */
export function buyRig(state: GameState, balance: Balance): RigResult {
  const b = balance.drilling.rigs.buy;
  const nein = canAddRig(state, balance, b.cost);
  if (nein) return { ok: false, reason: nein };
  const rig: Rig = { id: nextRigId(state), kind: 'owned', readyRound: state.round + b.deliveryRounds, steam: false, rods: false };
  const wann = b.deliveryRounds === 0 ? 'sofort einsatzbereit' : b.deliveryRounds === 1 ? 'Lieferung zur nächsten Runde' : `Lieferung in ${b.deliveryRounds} Runden`;
  return {
    ok: true,
    state: { ...state, cash: cents(state.cash - b.cost), rigs: [...state.rigs, rig], log: logged(state, `Jacob kauft einen Bohrturm (${money(b.cost)}, ${wann}).`) },
  };
}

/** Einen Turm mieten: sofort da, Miete am Ende jeder Runde. */
export function rentRig(state: GameState, balance: Balance): RigResult {
  const miete = balance.drilling.rigs.rent.costPerRound;
  const nein = canAddRig(state, balance, miete);
  if (nein) return { ok: false, reason: nein };
  const rig: Rig = { id: nextRigId(state), kind: 'rented', readyRound: state.round, steam: false, rods: false };
  return {
    ok: true,
    state: { ...state, rigs: [...state.rigs, rig], log: logged(state, `Jacob mietet einen Bohrturm (${money(miete)} je Runde).`) },
  };
}

/** Einen gemieteten Turm zurückgeben – nur, wenn er gerade nicht bohrt. */
export function returnRig(state: GameState, _balance: Balance, rigId: string): RigResult {
  const rig = findRig(state, rigId);
  if (!rig || rig.kind !== 'rented') return { ok: false, reason: 'Nur gemietete Türme lassen sich zurückgeben.' };
  if (rigWell(state, rig.id)) return { ok: false, reason: 'Der Turm bohrt noch – erst danach kann er zurück.' };
  return { ok: true, state: { ...state, rigs: state.rigs.filter((r) => r.id !== rig.id), log: logged(state, `${rigLabel(rig)} geht zurück an den Vermieter.`) } };
}

/** Dampfmaschine oder Stahlgestänge an einem eigenen (oder Silas') Turm nachrüsten. */
export function upgradeRig(state: GameState, balance: Balance, rigId: string, upgrade: RigUpgrade): RigResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const rig = findRig(state, rigId);
  if (!rig) return { ok: false, reason: 'Diesen Turm gibt es nicht.' };
  if (rig.kind === 'rented') return { ok: false, reason: 'An einem Mietturm baut Jacob nichts um.' };
  if (rig[upgrade]) return { ok: false, reason: upgrade === 'steam' ? 'Der Turm hat schon eine Dampfmaschine.' : 'Der Turm hat schon Stahlgestänge.' };
  const cost = balance.drilling.rigs[upgrade].cost;
  if (state.cash < cost) return { ok: false, reason: `Nicht genug Geld: ${money(cost)} nötig, in der Kasse sind ${money(state.cash)}.` };
  const was = upgrade === 'steam' ? 'eine Dampfmaschine' : 'Stahlgestänge';
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - cost),
      rigs: state.rigs.map((r) => (r.id === rig.id ? { ...r, [upgrade]: true } : r)),
      log: logged(state, `${rigLabel(rig)} bekommt ${was} (${money(cost)}).`),
    },
  };
}

/** Die Quelle auf einer Ranch, die als Nächstes eine Pumpe bekäme: fündig, ohne Pumpe, die stärkste zuerst. */
export function pumpTarget(state: Pick<GameState, 'wells'>, parcelId: string): Well | undefined {
  return state.wells
    .filter((w) => w.parcelId === parcelId && w.status === 'found' && !w.pump && w.production)
    .sort((a, b) => (b.production!.lastRate || b.production!.initialRate) - (a.production!.lastRate || a.production!.initialRate))[0];
}

/** Eine Pumpe an der stärksten Quelle dieser Ranch nachrüsten, die noch keine hat. */
export function installPump(state: GameState, balance: Balance, parcelId: string): RigResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const well = pumpTarget(state, parcelId);
  if (!well) {
    return state.wells.some((w) => w.parcelId === parcelId && w.status === 'found')
      ? { ok: false, reason: 'Alle Quellen auf dieser Ranch haben schon eine Pumpe.' }
      : { ok: false, reason: 'Eine Pumpe braucht eine fündige Quelle.' };
  }
  const cost = balance.production.pump.cost;
  if (state.cash < cost) return { ok: false, reason: `Nicht genug Geld: Die Pumpe kostet ${money(cost)}, in der Kasse sind ${money(state.cash)}.` };
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - cost),
      wells: state.wells.map((w) => (w.id === well.id ? { ...w, pump: true } : w)),
      log: logged(state, `Auf ${parcel ? parcelLabel(parcel) : parcelId} wird eine Pumpe nachgerüstet (${money(cost)}).`),
    },
  };
}

/** Pumpen, die gerade Unterhalt kosten: an Quellen, die noch fördern (oder gerade erst gefunden sind). */
export function runningPumps(state: Pick<GameState, 'wells'>): Well[] {
  return state.wells.filter((w) => w.pump && w.status === 'found' && w.production && (w.production.lastRate > 0 || w.production.roundsProduced === 0));
}

/** Fixkosten der Runde für Türme und Pumpen. */
export function equipmentCosts(state: Pick<GameState, 'rigs' | 'wells'>, balance: Balance): { rent: number; pumps: number } {
  return {
    rent: state.rigs.filter((r) => r.kind === 'rented').length * balance.drilling.rigs.rent.costPerRound,
    pumps: runningPumps(state).length * balance.production.pump.upkeep,
  };
}

/**
 * Rundenende: Miete für gemietete Türme und Unterhalt der Pumpen. Ein gekaufter
 * Turm, der zur nächsten Runde kommt, wird gemeldet.
 */
export function settleRigs(input: GameState, balance: Balance): GameState {
  const k = equipmentCosts(input, balance);
  const kosten = k.rent + k.pumps;
  let log = input.log;
  if (kosten > 0) {
    const teile = [k.rent > 0 ? `Turmmiete ${money(k.rent)}` : '', k.pumps > 0 ? `Pumpen ${money(k.pumps)}` : ''].filter(Boolean);
    log = logged(input, `${teile.join(', ')}.`);
  }
  const kommen = input.rigs.filter((r) => r.readyRound === input.round + 1);
  if (kommen.length > 0) log = [...log, `${formatDate(input)}: ${kommen.length === 1 ? 'Der neue Bohrturm ist' : `${kommen.length} neue Bohrtürme sind`} zur nächsten Runde da.`];
  if (kosten === 0 && kommen.length === 0) return input;
  return { ...input, cash: cents(input.cash - kosten), log };
}

/** Buchwert gekaufter Türme für den Imperiumswert. */
export function rigAssets(state: Pick<GameState, 'rigs'>, balance: Balance): number {
  const r = balance.drilling.rigs;
  return cents(state.rigs.filter((x) => x.kind === 'owned').length * r.buy.cost * r.assetShare);
}
