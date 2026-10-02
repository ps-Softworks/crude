import { describe, expect, it } from 'vitest';
import { endRound, formatDate, newGame } from './game';
import { generateParcels } from './geology';
import { startOptions } from './lease';
import { Rng, seedFromString } from './rng';
import { loadBalance } from './testBalance';

const balance = loadBalance();

describe('Spielzustand und Rundenschleife', () => {
  it('gleicher Seed = gleiche Welt', () => {
    expect(newGame('harlan', balance)).toEqual(newGame('harlan', balance));
  });

  it('anderer Seed = andere Welt', () => {
    expect(newGame('harlan', balance).parcels).not.toEqual(newGame('brandt', balance).parcels);
  });

  it('startet im Frühjahr 88 mit 2.000 $', () => {
    const state = newGame('start', balance);
    expect(state.round).toBe(1);
    expect(formatDate(state)).toBe('Frühjahr 88');
    expect(state.cash).toBe(2000);
  });

  it('jede Runde ist ein Quartal, nach Winter beginnt ein neues Jahr', () => {
    let state = newGame('kalender', balance);
    const dates = [formatDate(state)];
    for (let i = 0; i < 4; i++) {
      state = endRound(state, balance);
      dates.push(formatDate(state));
    }
    expect(dates).toEqual(['Frühjahr 88', 'Sommer 88', 'Herbst 88', 'Winter 88', 'Frühjahr 89']);
  });

  it('nach 16 Runden ist Kapitel 1 zu Ende und weitere Runden ändern nichts', () => {
    let state = newGame('ende', balance);
    for (let i = 0; i < 15; i++) state = endRound(state, balance);
    expect(state.round).toBe(16);
    expect(formatDate(state)).toBe('Winter 91');
    expect(state.finished).toBe(false);

    state = endRound(state, balance);
    expect(state.finished).toBe(true);
    expect(endRound(state, balance)).toBe(state);
  });

  it('verändert den alten Zustand nicht', () => {
    const before = newGame('rein', balance);
    const copy = structuredClone(before);
    endRound(before, balance);
    expect(before).toEqual(copy);
  });
});

describe('Geologen-Prognosen im Spielzustand', () => {
  it('gibt für jede pachtbare Parzelle eine Prognose, für Salt Hill keine', () => {
    const state = newGame('prognosen', balance);
    const pachtbar = state.parcels.filter((p) => !p.discovery);
    const quelle = state.parcels.find((p) => p.discovery)!;
    expect(Object.keys(state.forecasts)).toHaveLength(pachtbar.length);
    for (const parcel of pachtbar) {
      expect(state.forecasts[parcel.id]).toBeDefined();
      expect(state.forecasts[parcel.id].parcelId).toBe(parcel.id);
    }
    expect(state.forecasts[quelle.id]).toBeUndefined();
  });

  it('gleicher Seed = gleiche Prognosen', () => {
    expect(newGame('harlan', balance).forecasts).toEqual(newGame('harlan', balance).forecasts);
  });

  it('anderer Seed = andere Prognosen', () => {
    expect(newGame('harlan', balance).forecasts).not.toEqual(newGame('brandt', balance).forecasts);
  });

  it('lässt Karte und Startoptionen unverändert (Prognosen kommen danach)', () => {
    const rng = new Rng(seedFromString('reihenfolge'));
    const parcels = generateParcels(balance, rng);
    const options = startOptions({ ...newGame('leer', balance), parcels }, balance, rng);
    const state = newGame('reihenfolge', balance);
    expect(state.parcels).toEqual(parcels);
    expect(state.options).toEqual(options);
  });

  it('bleiben über die Runden unverändert', () => {
    let state = newGame('runden', balance);
    const first = state.forecasts;
    state = endRound(state, balance);
    expect(state.forecasts).toEqual(first);
  });
});
