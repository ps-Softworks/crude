// Förderung (GDD §5): Jede Quelle startet mit einer Rate aus der Größe ihres
// Feldes und fällt je Quartal. Das Feld ist gemeinsam: Die förderbare Menge ist
// fest, jede weitere Quelle im selben Feld senkt den Druck aller Quellen und
// verringert am Ende die Gesamtausbeute (Überförderung, Wasser). Die geförderten
// Barrel landen im Tank; der Förderzins-Anteil wird als royaltyOil mitgeführt.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { Find, Well } from './drilling';
import { fieldLabel, fieldOf, type Field } from './field';
import type { GameState } from './game';
import { areaFactor } from './geology';
import { timedEffect } from './events';
import { leaseOf, parcelLabel } from './lease';
// Termine als Hauptwerkzeug, Etappe 2: In der Förderbremse drosselt Jacob seine eigene Förderung (das Öl bleibt im Boden).
import { throttleFactor } from './pricing';

/**
 * Druckfaktor eines Feldes mit so vielen fördernden Quellen: Die ersten
 * freeWells fördern ungestört, jede weitere nimmt allen einen Teil der Rate.
 * Unten bleibt der Faktor bei pressureMin stehen.
 */
export function pressureFactor(balance: Balance, wells: number): number {
  const { freeWells, pressureLossPerWell, pressureMin } = balance.production;
  const gedrueckt = 1 - (wells - freeWells) * pressureLossPerWell;
  return Math.max(pressureMin, wells <= freeWells ? 1 : gedrueckt);
}

/**
 * Anteil der Feldreserve, der überhaupt noch herauskommt, wenn auf dem Feld
 * einmal so viele Quellen gleichzeitig gefördert haben (Höchststand). Erst über
 * freeWells kostet Überförderung Ausbeute, höchstens recoveryLossMax. Der Schaden
 * bleibt, auch wenn später weniger Quellen fördern.
 */
export function recoveryFactor(balance: Balance, peakWells: number): number {
  const { freeWells, recoveryLossPerWell, recoveryLossMax } = balance.production;
  const verlust = Math.min(recoveryLossMax, Math.max(0, peakWells - freeWells) * recoveryLossPerWell);
  return 1 - verlust;
}

/** Förderbare Barrel eines Feldes, auf dem höchstens so viele Quellen gefördert haben. */
export function recoverable(balance: Balance, reserves: number, peakWells: number): number {
  return Math.round(reserves * recoveryFactor(balance, peakWells));
}

/**
 * Druck, den eine Quelle spürt: der Druckfaktor des Feldes; eine Pumpe
 * (0.2.15+7) fängt pump.pressureKeep des Verlusts auf.
 */
export function wellPressure(balance: Balance, pump: boolean, wells: number): number {
  const p = pressureFactor(balance, wells);
  return pump ? 1 - (1 - p) * (1 - balance.production.pump.pressureKeep) : p;
}

/**
 * Was eine Quelle in der nächsten Runde liefert: Anfangsrate minus Rückgang, mal
 * Druck. Eine Pumpe (0.2.15+7) hebt die Rate um pump.rateFactor.
 */
export function wellRate(balance: Balance, well: Pick<Well, 'production' | 'pump'>, wells: number): number {
  const p = well.production;
  if (!p) return 0;
  const ratengang = (1 - balance.production.decline) ** p.roundsProduced;
  const pumpe = well.pump ? balance.production.pump.rateFactor : 1;
  return Math.round(p.initialRate * ratengang * wellPressure(balance, !!well.pump, wells) * pumpe);
}

/** Alle Quellen, die gerade fördern. */
export function producingWells(state: Pick<GameState, 'wells'>): Well[] {
  return state.wells.filter((w) => w.status === 'found');
}

/** Die fördernden Quellen eines Feldes. */
export function fieldWells(state: Pick<GameState, 'parcels' | 'fields' | 'wells'>, fieldId: string): Well[] {
  return producingWells(state).filter((w) => fieldOf(state, w.parcelId)?.id === fieldId);
}

/** Lage eines Feldes für die Anzeige: Quellen, Druck, förderbare und restliche Barrel. */
export function fieldStatus(
  state: Pick<GameState, 'parcels' | 'fields' | 'wells'>,
  balance: Balance,
  field: Field,
): { wells: number; pressure: number; recoverable: number; remaining: number } {
  const quellen = fieldWells(state, field.id);
  const ausbeute = recoverable(balance, field.reserves, Math.max(field.peakWells, quellen.length));
  const gefoerdert = quellen.reduce((s, w) => s + (w.production?.total ?? 0), 0);
  return {
    wells: quellen.length,
    pressure: pressureFactor(balance, quellen.length),
    recoverable: ausbeute,
    remaining: Math.max(0, ausbeute - gefoerdert),
  };
}

/** Feld und Reserve einer Parzelle; ohne Feld bleibt nur die Parzelle selbst. */
function pocketOf(state: Pick<GameState, 'parcels' | 'fields'>, parcelId: string): { field?: Field; reserves: number } {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  const field = fieldOf(state, parcelId);
  return { field, reserves: field ? field.reserves : (parcel?.reserves ?? 0) };
}

/**
 * Anfangsrate einer frischen Quelle: ein fester Anteil der Reserve je
 * Standardfläche (ranches.slotArea) ihrer Ranch, je nach Art des Funds – so viel,
 * wie früher eine Rasterparzelle hatte. Gefördert wird trotzdem aus dem gemeinsamen
 * Feld – die Ranch bestimmt nur, wie stark die Quelle anfängt. Mehr Bohrlöcher auf
 * einer Ranch (0.2.15+5) = mehr Rate, aber das Feld leert sich schneller und
 * verliert über freeWells Druck.
 */
export function initialRate(
  balance: Balance,
  state: Pick<GameState, 'parcels'>,
  well: { parcelId: string; result: Find },
): number {
  const parcel = state.parcels.find((p) => p.id === well.parcelId);
  if (!parcel) return 0;
  const anteil = balance.production.initialRateShare[well.result];
  return Math.round((parcel.reserves / areaFactor(balance, parcel)) * anteil);
}

function parcelLabelOf(state: Pick<GameState, 'parcels'>, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  return parcel ? parcelLabel(parcel) : parcelId;
}

function barrels(value: number): string {
  return value.toLocaleString('de-DE');
}

/**
 * Verteilt ein Budget auf Anteile, die zusammen mehr ergeben: Jeder bekommt
 * mindestens seinen vollen Anteil ab, nie mehr als das Budget. Der Rest wird in
 * Kartenreihenfolge nach der Nachkommastelle aufgefüllt, damit am Ende genau das
 * Budget herauskommt.
 */
function shareOut(wanted: readonly number[], budget: number): number[] {
  const summe = wanted.reduce((s, w) => s + w, 0);
  if (summe <= budget) return [...wanted];
  if (summe <= 0) return wanted.map(() => 0);
  const roh = wanted.map((w) => (w * budget) / summe);
  const ganz = roh.map(Math.floor);
  let rest = budget - ganz.reduce((s, w) => s + w, 0);
  const nachReste = roh
    .map((wert, i) => ({ i, rest: wert - ganz[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of nachReste) {
    if (rest <= 0) break;
    ganz[i] += 1;
    rest -= 1;
  }
  return ganz;
}

/**
 * Rundenende: Alle fördernden Quellen liefern ihre Rate. Je Feld gibt es nur die
 * förderbare Menge – wer mehr bohrt, drückt sich gegenseitig die Raten und
 * verbraucht die Reserve schneller. Das Öl wandert in den Tank.
 */
export function advanceProduction(input: GameState, balance: Balance): GameState {
  const wells = producingWells(input);
  if (wells.length === 0) return input;
  const date = formatDate(input);
  const log = [...input.log];

  // Quellen nach Feld gruppieren; ohne Feld bildet jede Parzelle ihre eigene Gruppe.
  const gruppen = new Map<string, Well[]>();
  for (const well of wells) {
    const key = fieldOf(input, well.parcelId)?.id ?? well.parcelId;
    gruppen.set(key, [...(gruppen.get(key) ?? []), well]);
  }

  const faktor = Math.max(0, 1 + timedEffect(input, 'production')) * throttleFactor(input);
  const neuenStand = new Map<string, { lastRate: number; total: number }>();
  const hoechststand = new Map<string, number>();
  let gefoerdert = 0;
  let zinsOel = 0;
  for (const gruppe of gruppen.values()) {
    const { field, reserves } = pocketOf(input, gruppe[0].parcelId);
    const n = gruppe.length;
    // Höchststand zuerst festhalten: Die Überförderung dieser Runde kostet schon jetzt Ausbeute.
    const vorher = field?.peakWells ?? 0;
    const peak = Math.max(vorher, n);
    if (field) hoechststand.set(field.id, peak);
    const { freeWells } = balance.production;
    if (vorher <= freeWells && n > freeWells) {
      const ort = field ? fieldLabel(field) : parcelLabelOf(input, gruppe[0].parcelId);
      log.push(`${date}: Auf ${ort} sinkt der Druck – zu viele Quellen.`);
    }
    const bereitsDa = gruppe.reduce((s, w) => s + (w.production?.total ?? 0), 0);
    const ausbeute = recoverable(balance, reserves, peak);
    // Nachwirkung aus Ereignissen (0.2.15+3): production hebt oder senkt Jacobs Raten befristet.
    const gewollt = gruppe.map((w) => wellRate(balance, w, n) * faktor);
    const bekommen = shareOut(gewollt, Math.max(0, ausbeute - bereitsDa));
    gruppe.forEach((w, i) => {
      neuenStand.set(w.id, { lastRate: bekommen[i], total: (w.production?.total ?? 0) + bekommen[i] });
      gefoerdert += bekommen[i];
      zinsOel += bekommen[i] * (leaseOf(input, w.parcelId)?.royalty ?? 0);
    });
    // Nur in der Runde melden, in der das Feld leer wird – nicht danach jede Runde.
    if (reserves > 0 && bereitsDa < ausbeute && bereitsDa + bekommen.reduce((s, b) => s + b, 0) >= ausbeute) {
      log.push(`${date}: ${field ? fieldLabel(field) : 'Das Feld'} ist erschöpft – die Quellen versiegen.`);
    }
  }

  const oilStock = input.oilStock + gefoerdert;
  const neueWells = input.wells.map((w): Well => {
    const stand = neuenStand.get(w.id);
    if (!stand || !w.production) return w;
    return { ...w, production: { ...w.production, lastRate: stand.lastRate, total: stand.total, roundsProduced: w.production.roundsProduced + 1 } };
  });

  if (gefoerdert > 0) {
    log.push(
      `${date}: ${neuenStand.size} ${neuenStand.size === 1 ? 'Quelle fördert' : 'Quellen fördern'} ${barrels(gefoerdert)} Barrel, im Tank sind ${barrels(oilStock)} Barrel.`,
    );
  }
  const fields = input.fields.map((f) => {
    const peak = hoechststand.get(f.id);
    return peak === undefined || peak === f.peakWells ? f : { ...f, peakWells: peak };
  });
  return { ...input, wells: neueWells, fields, oilStock, royaltyOil: input.royaltyOil + zinsOel, log };
}