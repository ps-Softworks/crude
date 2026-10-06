// Spielspaß K1 (Tieferbohren als echte Wahl): Nach einer trockenen Stufe steht Jacob vor
// der Frage „tiefer oder aufgeben?“. In der Tiefe ist Öl seltener, ein Fund aber größer
// (findFactor in balance.yaml). Diese Rechenhilfe stellt die Wette auf: Was kostet die
// nächste Stufe samt Unfall- und Klemmrisiko, was brächte ein Fund dort bis Kapitelende,
// und ab welcher Chance lohnt sich das? Die Chance selbst kommt vom Geologen
// (stageOutlook) – nie aus der verdeckten Fundchance. Reine Rechnung, ohne Zufall.

import type { Balance } from './balance';
import { deeperQuote, stageOutlook, wellsOn, type Well } from './drilling';
import type { GameState } from './game';
import { findValue } from './invest';
import { findRig, rigRisk, rigStageRounds } from './rigs';
import { techDrillRounds } from './research';

export interface DeeperOutlook {
  /** Stufe, um die es geht (ab 1 gezählt), und ihre Tiefe in Metern. */
  stage: number;
  depth: number;
  /** Kosten der Stufe in $ (mit dem Turm dieser Bohrung). */
  cost: number;
  /** Erwartete Zusatzkosten aus Unfall (Entschädigung) und klemmendem Werkzeug (Bergung) in $. */
  risk: number;
  /** Was ein Fund dort bis Kapitelende etwa brächte: kleine Quelle, Gusher, und im Mittel nach der Zone ($). */
  valueSmall: number;
  valueGusher: number;
  value: number;
  /** Ab dieser Chance (0–1) lohnt sich das Weiterbohren: (Kosten + Risiko) ÷ Wert eines Funds. 1 = nie. */
  breakEven: number;
  /** Chance des Geologen für diese Stufe (0–1); null ohne Prognose. */
  chance: number | null;
  /** Erwarteter Gewinn nach Chance des Geologen: Chance × Wert − Kosten − Risiko ($); null ohne Prognose. */
  expected: number | null;
}

/** Anteil Gusher an den Funden der Zone dieser Ranch (öffentliches Wissen: small : gusher). */
function gusherShare(balance: Balance, zone: string): number {
  const z = balance.geology.zones.find((x) => x.name === zone);
  return z ? z.gusher / (z.small + z.gusher) : 0;
}

/**
 * Die Wette fürs Tieferbohren an der Bohrung dieser Ranch, die gerade auf eine Entscheidung
 * wartet. chance: Chance für die nächste Stufe (0–1); ohne Angabe die des Geologen.
 * null, wenn hier nichts zu entscheiden ist oder es nicht tiefer geht.
 */
export function deeperOutlook(state: GameState, balance: Balance, parcelId: string, chance?: number): DeeperOutlook | null {
  const well: Well | undefined = wellsOn(state, parcelId).find((w) => w.status === 'decision');
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!well || !parcel) return null;
  const quote = deeperQuote(state, balance, well);
  const stage = balance.drilling.stages[well.stage];
  if (!quote || !stage) return null;
  const rig = findRig(state, well.rigId);
  const r = rigRisk(balance, rig, stage);
  const risk = Math.round(r.accident * balance.drilling.accidentCost + r.stuck * balance.drilling.fishingCost);
  const delay = techDrillRounds(state, balance, rigStageRounds(balance, rig, stage));
  const next = well.stage + 1;
  const valueSmall = findValue(state, balance, parcelId, next, 'small', delay);
  const valueGusher = findValue(state, balance, parcelId, next, 'gusher', delay);
  const g = gusherShare(balance, parcel.zone);
  const value = Math.round((1 - g) * valueSmall + g * valueGusher);
  const kosten = quote.cost + risk;
  const breakEven = value > 0 ? Math.min(1, kosten / value) : 1;
  const geologe = chance ?? (stageOutlook(state, balance, parcelId)?.chance ?? null);
  const p = geologe === null ? null : chance !== undefined ? chance : geologe / 100;
  return {
    stage: next,
    depth: stage.depth,
    cost: quote.cost,
    risk,
    valueSmall: Math.round(valueSmall),
    valueGusher: Math.round(valueGusher),
    value,
    breakEven,
    chance: p,
    expected: p === null ? null : Math.round(p * value - kosten),
  };
}

/** Lohnt sich das Weiterbohren nach der Chance des Geologen? (Erwarteter Gewinn ≥ 0.) */
export function deeperPays(outlook: DeeperOutlook | null): boolean {
  return outlook !== null && outlook.expected !== null && outlook.expected >= 0;
}

/** Urteil fürs Ranch-Fenster: klar drüber, knapp an der Schwelle, klar drunter, oder zu spät im Kapitel. */
export type DeeperVerdict = 'lohnt' | 'knapp' | 'lohntNicht' | 'zuSpaet';

/**
 * Wie die Chance des Geologen zur Schwelle steht: ab 1,25 × Schwelle „lohnt“, ab 0,8 × „knapp“,
 * darunter „lohnt nicht“. Bringt ein Fund bis Kapitelende nicht einmal die Kosten (Schwelle 1),
 * ist es „zu spät“. Ohne Prognose null.
 */
export function deeperVerdict(outlook: DeeperOutlook): DeeperVerdict | null {
  if (outlook.breakEven >= 1) return 'zuSpaet';
  if (outlook.chance === null) return null;
  if (outlook.chance >= outlook.breakEven * 1.25) return 'lohnt';
  if (outlook.chance >= outlook.breakEven * 0.8) return 'knapp';
  return 'lohntNicht';
}
