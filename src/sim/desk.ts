// Der Schreibtisch (1.11): Die Oberfläche soll nur anzeigen und klicken, aber sie
// muss wissen, was auf einer Parzelle gerade geht, welcher Schritt als Nächstes
// dran ist, welche Quellen es gibt und was in dieser Runde passiert ist. Alles hier
// wird aus den vorhandenen Simulationsfunktionen abgeleitet – ein Probelauf, ein
// Aufruf, kein zweiter Ort mit Spielregeln. Keine Oberfläche, kein Zufall.

import type { Balance } from './balance';
import { TRANSPORT_MODES } from './balance';
import {
  abandonWell,
  drillDeeper,
  fishWell,
  stageCost,
  startDrilling,
  wellOf,
  type DrillResult,
  type Well,
  type WellStatus,
} from './drilling';
import type { GameState } from './game';
import {
  buyLease,
  buyOption,
  exerciseOption,
  leaseOf,
  leaseTerms,
  optionOf,
  parcelLabel,
  type LeaseResult,
} from './lease';
import { sellOil } from './transport';

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Was auf der Karte anklickbar ist – jede Art von Aktion genau einmal. */
export type DeskActionKind = 'lease' | 'option' | 'exercise' | 'drill' | 'deeper' | 'fish' | 'abandon';

export interface DeskAction {
  kind: DeskActionKind;
  /** Was der Knopf sagt. */
  label: string;
  /** Geht die Aktion jetzt? Sonst steht der Grund in reason. */
  ok: boolean;
  /** Warum nicht, mit Worten aus der Simulation. */
  reason?: string;
}

/** Aus einem Probelauf der Simulation eine Knopfzeile machen. */
function knopf(kind: DeskActionKind, label: string, probe: LeaseResult | DrillResult): DeskAction {
  return probe.ok ? { kind, label, ok: true } : { kind, label, ok: false, reason: probe.reason };
}

/**
 * Alle Aktionen, die auf einer Parzelle gerade Sinn ergeben – mit dem, was sie
 * kosten, und mit dem Grund, warum eine gerade nicht geht. Der Probelauf geht
 * nie in den Zustand hinein: Es wird nichts geändert und nichts gewürfelt.
 * Auf der Entdeckungsquelle und auf fremden Parzellen gibt es nichts zu tun.
 */
export function parcelActions(state: GameState, balance: Balance, parcelId: string): DeskAction[] {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!parcel || parcel.discovery) return [];
  const lease = leaseOf(state, parcelId);
  const option = optionOf(state, parcelId);
  const well = wellOf(state, parcelId);

  // Jacobs Option: einlösen ist der einzige Schritt, danach ist es eine Pacht.
  if (option?.holder === 'jacob') {
    return [knopf('exercise', `Option einlösen (${money(option.bonus)})`, exerciseOption(state, balance, parcelId))];
  }

  if (lease?.holder === 'jacob') {
    const actions: DeskAction[] = [];
    if (!well) {
      actions.push(knopf('drill', `Bohren (${money(stageCost(balance, 1))})`, startDrilling(state, balance, parcelId)));
    }
    // Nach einer trockenen Stufe geht es tiefer weiter, bei klemmendem Werkzeug
    // muss es erst bergen – beides kann man aufgeben.
    const letzte = balance.drilling.stages[well?.stage ?? 0];
    if (well?.status === 'decision' && letzte) {
      actions.push(knopf('deeper', `Tiefer bohren (${money(stageCost(balance, well.stage + 1))})`, drillDeeper(state, balance, parcelId)));
    }
    if (well?.status === 'stuck') {
      actions.push(knopf('fish', 'Fischen', fishWell(state, balance, parcelId)));
    }
    if (well?.status === 'decision' || well?.status === 'stuck') {
      actions.push(knopf('abandon', 'Aufgeben', abandonWell(state, balance, parcelId)));
    }
    return actions;
  }

  // Gehört die Parzelle jemand anderem, ist hier nichts zu holen.
  if (lease || option) return [];

  // Freie Parzelle: Pacht zahlt den Bonus, Option nur die kleine Gebühr.
  const terms = leaseTerms(state, balance, parcelId);
  return [
    knopf('lease', `Pacht kaufen (${money(terms.bonus)})`, buyLease(state, balance, parcelId)),
    knopf('option', `Option kaufen (${money(terms.optionFee)})`, buyOption(state, balance, parcelId)),
  ];
}

export type ActionResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Führt genau die Aktion aus, die parcelActions angeboten hat, indem dieselbe
 * Simulationsfunktion aufgerufen wird, die auch der Probelauf benutzt.
 */
export function applyAction(
  state: GameState,
  balance: Balance,
  parcelId: string,
  kind: DeskActionKind,
): ActionResult {
  switch (kind) {
    case 'lease':
      return buyLease(state, balance, parcelId);
    case 'option':
      return buyOption(state, balance, parcelId);
    case 'exercise':
      return exerciseOption(state, balance, parcelId);
    case 'drill':
      return startDrilling(state, balance, parcelId);
    case 'deeper':
      return drillDeeper(state, balance, parcelId);
    case 'fish':
      return fishWell(state, balance, parcelId);
    case 'abandon':
      return abandonWell(state, balance, parcelId);
  }
}

/** Ein kurzer Hinweis auf den nächsten Schritt und die Parzellen, um die es geht. */
export interface NextStep {
  text: string;
  /** Parzellen, die der Hinweis meint – die Karte kann sie hervorheben. */
  parcelIds: string[];
}

/** Kurznamen der Parzellen auf der Karte, z. B. "3/5". */
function labelsOf(state: Pick<GameState, 'parcels'>, parcelIds: readonly string[]): string[] {
  return parcelIds.map((id) => {
    const parcel = state.parcels.find((p) => p.id === id);
    return parcel ? parcelLabel(parcel) : id;
  });
}

/** "3/5" oder "3/5, 7/2 und 8/9". */
function ort(stellen: string[]): string {
  if (stellen.length <= 1) return stellen.join('');
  return `${stellen.slice(0, -1).join(', ')} und ${stellen.at(-1)}`;
}

/**
 * Was Jacob als Nächstes tun kann, in einem Satz. Die erste passende Regel gewinnt:
 * erst ein offenes Ereignis, dann eine Bohrung, die auf ihn wartet, dann der laufende Turm, dann eine Pacht
 * zum Bohren, dann eine Option zum Einlösen, dann nichts zum Pachten, dann Öl im
 * Tank, sonst einfach die Runde beenden. Ist das Kapitel vorbei, gibt es nichts.
 */
export function nextStep(state: GameState, balance: Balance): NextStep | null {
  if (state.finished) return null;

  // 0. Ein Ereignis wartet auf Antwort (2.1).
  if (state.events.pending.length > 0) {
    return { text: 'Auf dem Schreibtisch liegt etwas, das auf deine Antwort wartet.', parcelIds: [] };
  }

  // 1. Eine Bohrung wartet auf eine Entscheidung: tiefer bohren, bergen oder aufgeben.
  const wartet = state.wells.filter((w) => w.status === 'decision' || w.status === 'stuck');
  if (wartet.length > 0) {
    return {
      text: `Auf Parzelle ${ort(labelsOf(state, wartet.map((w) => w.parcelId)))} wartet die Bohrung auf deine Entscheidung.`,
      parcelIds: wartet.map((w) => w.parcelId),
    };
  }

  // 2. Der Turm arbeitet: nur die nächste Runde bringt ihn weiter.
  if (state.wells.some((w) => w.status === 'drilling')) {
    return { text: 'Der Turm bohrt. Beende die Runde, um weiterzukommen.', parcelIds: [] };
  }

  // 3. Eine eigene, ungebohrte Pacht, die sofort gebohrt werden kann.
  const bereit = state.leases
    .filter((l) => l.holder === 'jacob' && startDrilling(state, balance, l.parcelId).ok)
    .map((l) => l.parcelId);
  if (bereit.length > 0) {
    const orte = ort(labelsOf(state, bereit));
    return {
      text:
        bereit.length === 1
          ? `Deine Pacht auf ${orte} ist bereit: Parzelle anklicken und „Bohren“ wählen.`
          : `Deine Pachten auf ${orte} sind bereit: Parzelle anklicken und „Bohren“ wählen.`,
      parcelIds: bereit,
    };
  }

  // 4. Eine Option, die eingelöst werden kann – danach kann gebohrt werden.
  const optionen = state.options
    .filter((o) => o.holder === 'jacob' && exerciseOption(state, balance, o.parcelId).ok)
    .map((o) => o.parcelId);
  if (optionen.length > 0) {
    const orte = ort(labelsOf(state, optionen));
    return {
      text:
        optionen.length === 1
          ? `Du hast eine Option auf ${orte}: Parzelle anklicken und „Option einlösen“ wählen, dann bohren.`
          : `Du hast Optionen auf ${orte}: Parzelle anklicken und „Option einlösen“ wählen, dann bohren.`,
      parcelIds: optionen,
    };
  }

  // 5. Weder Pacht noch Option: ohne Recht auf Land geht kein Bohren.
  // Pachten und Optionen der Konkurrenz zählen nicht – sie bringen Jacob kein Land.
  if (!state.leases.some((l) => l.holder === 'jacob') && !state.options.some((o) => o.holder === 'jacob')) {
    return { text: 'Pachte eine Parzelle auf der Karte, dann kannst du bohren.', parcelIds: [] };
  }

  // 6. Öl im Tank, das heute noch weg kann.
  if (Math.floor(state.oilStock) >= 1 && TRANSPORT_MODES.some((mode) => sellOil(state, balance, mode, 1).ok)) {
    return { text: 'Öl im Tank: unter „Tank & Verkauf“ verkaufen.', parcelIds: [] };
  }

  return { text: 'Beende die Runde.', parcelIds: [] };
}

/** Eine Bohrung in einer Zeile für die Quellenliste auf dem Schreibtisch. */
export interface SourceRow {
  parcelId: string;
  label: string;
  status: WellStatus;
  /** Was gerade los ist, in wenigen Worten. */
  text: string;
  /** Barrel der letzten Runde; 0, solange die Quelle nichts fördert. */
  lastRate: number;
  /** Barrel insgesamt. */
  total: number;
}

function statusText(well: Well): string {
  switch (well.status) {
    case 'drilling':
      return well.roundsLeft === 1 ? 'bohrt, fertig in 1 Runde' : `bohrt, fertig in ${well.roundsLeft} Runden`;
    case 'decision':
      return 'trocken – tiefer?';
    case 'stuck':
      return 'Werkzeug klemmt';
    case 'found':
      return 'fördert';
    case 'dry':
      return 'trocken';
  }
}

/** Was oben steht: gefundene Quellen, dann die Bohrungen, zuletzt die Fehlschläge. */
const RANGLISTE: Record<WellStatus, number> = {
  found: 0,
  drilling: 1,
  decision: 1,
  stuck: 1,
  dry: 2,
};

/** Alle Bohrungen als Zeilen: fördernde Quellen zuerst, dann aktive, dann trockene. */
export function sourceRows(state: GameState): SourceRow[] {
  return [...state.wells]
    .sort((a, b) => RANGLISTE[a.status] - RANGLISTE[b.status] || a.startRound - b.startRound)
    .map((well) => ({
      parcelId: well.parcelId,
      label: labelsOf(state, [well.parcelId])[0],
      status: well.status,
      text: statusText(well),
      lastRate: well.production?.lastRate ?? 0,
      total: well.production?.total ?? 0,
    }));
}

/** Das Protokoll der laufenden Runde: alles seit dem letzten Rundenende. */
export function roundLog(state: GameState): string[] {
  return state.log.slice(state.roundLogStart);
}