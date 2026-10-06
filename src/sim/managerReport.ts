// Bericht des Verwalters (0.4.20+2): Nach Zeitsprung I stand Philipp mit viel Geld, wenig Förderung und lauter
// neuen Gegenständen am Tisch – und niemand sagte, was davon wofür taugt. Der Bericht unter der Chronik nennt die
// Förderung vorher und nachher (und warum sie fiel) und rechnet vor, was das Geld jetzt kauft: die beiden Wege zum
// Kapitelziel (Raffinerie, Fernleitung zum Hafen) und neues Land in der jetzt offenen Provinz.
//
// Reine Lesehilfe ohne neue Regel: nur Zahlen aus dem Zustand und balance.yaml.

import type { Balance } from './balance';
import { planRoute } from './bigPipeline';
import { stageCost } from './drilling';
import type { GameState } from './game';
import { leaseTerms } from './lease';
import { roundFlow, type TimeskipRecord } from './timeskip';

export type ReportIdeaId = 'refinery' | 'harbor' | 'land';

export interface ReportIdea {
  id: ReportIdeaId;
  /** Grobe Kosten in $ (Raffinerie: erste Anlage; Fernleitung: Vermessung + Bau + faire Wegerechte; Land: Pacht + volle Bohrung). */
  cost: number;
  /** Reicht die Kasse dafür? */
  affordable: boolean;
  /** Land: so viele freie Ranches in der offenen Provinz. */
  count?: number;
}

export interface ManagerReport {
  flowBefore: number;
  flowAfter: number;
  /** Fiel die Förderung um mehr als ein Fünftel? */
  fell: boolean;
  /**
   * 0.4.20+29: Woher die Förderung nachher kommt – Quellen aus Kapitel 1 (sie verlieren je Runde einen Teil und
   * sind nach dem Sprung fast leer) und Quellen, die der Verwalter gebohrt hat. Sonst wirkt „mehr Quellen,
   * weniger Öl“ wie ein Fehler.
   */
  oldWells: number;
  oldFlow: number;
  newWells: number;
  newFlow: number;
  ideas: ReportIdea[];
}

/** Ab diesem Verhältnis nachher ÷ vorher gilt die Förderung als gehalten. */
const GEHALTEN = 0.8;

/** Was der Verwalter zum Start von Kapitel 2 berichtet; null für Zeitsprung II, alte Spielstände (ohne Förderung) oder nach der Pleite. */
export function managerReport(state: GameState, record: Pick<TimeskipRecord, 'number' | 'before' | 'after'>, balance: Balance): ManagerReport | null {
  if (record.number !== 1 || record.before.flow === undefined || state.ending === 'pleite') return null;
  const flowBefore = record.before.flow;
  const flowAfter = Math.round(roundFlow(state));
  const ideas: ReportIdea[] = [];
  const kasse = state.cash;
  const idee = (id: ReportIdeaId, cost: number, extra: Partial<ReportIdea> = {}) => ideas.push({ id, cost: Math.round(cost), affordable: kasse >= cost, ...extra });

  if (state.refinery && state.refinery.level === 0 && state.refinery.project === null) idee('refinery', balance.refinery.buildCost);

  if (state.bigPipelines) {
    const plan = state.regions
      .map((origin) => planRoute(state, balance, { origin, destination: 'hafen' }))
      .flatMap((r) => (r.ok ? [r.plan] : []))
      .sort((a, b) => a.surveyCost + a.buildCost + a.rightsCost - (b.surveyCost + b.buildCost + b.rightsCost))[0];
    if (plan) idee('harbor', plan.surveyCost + plan.buildCost + plan.rightsCost);
  }

  const genommen = new Set([...state.leases.map((l) => l.parcelId), ...state.wells.map((w) => w.parcelId), ...state.rival.wells.map((w) => w.parcelId)]);
  const frei = state.parcels.filter((p) => !p.discovery && !genommen.has(p.id) && state.regions.includes(p.region));
  if (frei.length > 0) {
    const bohrung = balance.drilling.stages.reduce((sum, _, i) => sum + stageCost(balance, i + 1), 0);
    const pacht = frei.map((p) => leaseTerms(state, balance, p.id).bonus).sort((a, b) => a - b);
    idee('land', pacht[Math.floor(pacht.length / 2)] + bohrung, { count: frei.length });
  }

  // Kapitel 1 endet vor dem Sprung: Kapitel 2 beginnt nach timeskip.rounds Quartalen.
  const kapitel1Ende = state.chapterStart - balance.timeskip.rounds - 1;
  let oldWells = 0, oldFlow = 0, newWells = 0, newFlow = 0;
  for (const w of state.wells) {
    if (w.status !== 'found') continue;
    const rate = w.production?.lastRate ?? 0;
    if (w.startRound <= kapitel1Ende) {
      oldWells += 1;
      oldFlow += rate;
    } else {
      newWells += 1;
      newFlow += rate;
    }
  }
  return {
    flowBefore,
    flowAfter,
    fell: flowBefore > 0 && flowAfter < flowBefore * GEHALTEN,
    oldWells,
    oldFlow: Math.round(oldFlow),
    newWells,
    newFlow: Math.round(newFlow),
    ideas,
  };
}
