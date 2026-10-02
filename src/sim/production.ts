// Förderung (GDD §5): Jede Quelle startet mit einer Rate aus der Größe ihres
// Feldes und fällt je Quartal. Das Feld ist gemeinsam: Die förderbare Menge ist
// fest, jede weitere Quelle im selben Feld senkt den Druck aller Quellen und
// verringert am Ende die Gesamtausbeute (Überförderung, Wasser). Die geförderten
// Barrel landen im Tank; Verkauf und Förderzins kommen mit dem Preis in 1.8.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { Well } from './drilling';
import { fieldLabel, fieldOf, type Field } from './field';
import type { GameState } from './game';

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
 * Anteil der Feldreserve, der bei so vielen Quellen überhaupt noch herauskommt.
 * Überförderung kostet Ausbeute, höchstens recoveryLossMax.
 */
export function recoveryFactor(balance: Balance, wells: number): number {
  const { recoveryLossPerWell, recoveryLossMax } = balance.production;
  const verlust = Math.min(recoveryLossMax, Math.max(0, wells - 1) * recoveryLossPerWell);
  return 1 - verlust;
}

/** Förderbare Barrel eines Feldes mit so vielen Quellen. */
export function recoverable(balance: Balance, reserves: number, wells: number): number {
  return Math.round(reserves * recoveryFactor(balance, wells));
}

/** Was eine Quelle in der nächsten Runde liefert: Anfangsrate minus Rückgang, mal Druck. */
export function wellRate(balance: Balance, well: Well, wells: number): number {
  const p = well.production;
  if (!p) return 0;
  const ratengang = (1 - balance.production.decline) ** p.roundsProduced;
  return Math.round(p.initialRate * ratengang * pressureFactor(balance, wells));
}

/** Alle Quellen, die gerade fördern. */
export function producingWells(state: Pick<GameState, 'wells'>): Well[] {
  return state.wells.filter((w) => w.status === 'found');
}

/** Die fördernden Quellen eines Feldes. */
export function fieldWells(state: Pick<GameState, 'parcels' | 'fields' | 'wells'>, fieldId: string): Well[] {
  return producingWells(state).filter((w) => fieldOf(state, w.parcelId)?.id === fieldId);
}

/** Feld und Reserve einer Parzelle; ohne Feld bleibt nur die Parzelle selbst. */
function pocketOf(state: Pick<GameState, 'parcels' | 'fields'>, parcelId: string): { field?: Field; reserves: number } {
  const parcel = state.parcels.find((p) => p.id === parcelId);
  const field = fieldOf(state, parcelId);
  return { field, reserves: field ? field.reserves : (parcel?.reserves ?? 0) };
}

/**
 * Anfangsrate einer frischen Quelle: ein fester Anteil der Reserve ihres Feldes.
 * Liegt sie in keinem Feld (z. B. die Geologie wurde von Hand geändert), zählt
 * die Reserve der Parzelle selbst.
 */
export function initialRate(balance: Balance, state: Pick<GameState, 'parcels' | 'fields'>, parcelId: string): number {
  return Math.round(pocketOf(state, parcelId).reserves * balance.production.initialRateShare);
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

  const neuenStand = new Map<string, { lastRate: number; total: number }>();
  let gefoerdert = 0;
  for (const gruppe of gruppen.values()) {
    const { field, reserves } = pocketOf(input, gruppe[0].parcelId);
    const bereitsDa = gruppe.reduce((s, w) => s + (w.production?.total ?? 0), 0);
    const budget = Math.max(0, recoverable(balance, reserves, gruppe.length) - bereitsDa);
    const gewollt = gruppe.map((w) => wellRate(balance, w, gruppe.length));
    const bekommen = shareOut(gewollt, budget);
    gruppe.forEach((w, i) => {
      neuenStand.set(w.parcelId, { lastRate: bekommen[i], total: (w.production?.total ?? 0) + bekommen[i] });
      gefoerdert += bekommen[i];
    });
    if (budget === 0 && reserves > 0) {
      log.push(`${date}: ${field ? fieldLabel(field) : 'Das Feld'} ist erschöpft – die Quellen versiegen.`);
    }
  }

  const oilStock = input.oilStock + gefoerdert;
  const neueWells = input.wells.map((w): Well => {
    const stand = neuenStand.get(w.parcelId);
    if (!stand || !w.production) return w;
    return { ...w, production: { ...w.production, lastRate: stand.lastRate, total: stand.total, roundsProduced: w.production.roundsProduced + 1 } };
  });

  if (gefoerdert > 0) {
    log.push(
      `${date}: ${neuenStand.size} ${neuenStand.size === 1 ? 'Quelle fördert' : 'Quellen fördern'} ${barrels(gefoerdert)} Barrel, im Tank sind ${barrels(oilStock)} Barrel.`,
    );
  }
  return { ...input, wells: neueWells, oilStock, log };
}