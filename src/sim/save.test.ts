import { describe, expect, it } from 'vitest';
import { applyAction } from './desk';
import { checkBankruptcy } from './credit';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Wie in src/ui: der Spielstand trägt die Version der App. */
const APP_VERSION = '0.1.13';

function ok(result: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Spiel mit Pacht und Bohrung auf der ersten freien Parzelle, ohne Zufall beim Kaufen. */
function mitPachtUndBohrung(seed: string): GameState {
  let state = { ...newGame(seed, balance), cash: 100000 };
  const id = state.parcels.find((p) => !p.discovery && !state.options.some((o) => o.parcelId === p.id))!.id;
  state = ok(applyAction(state, balance, id, 'lease'));
  return ok(applyAction(state, balance, id, 'drill'));
}

/** Spiel, in dem Jacob pleite ist. */
function pleite(): GameState {
  const tot = checkBankruptcy({ ...newGame('pleite', balance), cash: -500, round: balance.start.rounds }, balance);
  expect(tot.ending).toBe('pleite');
  return tot;
}

/** Stellen im Zustand, wo eine Zahl kaputt oder gar nicht da ist. */
function kaputteWerte(wert: unknown, pfad = 'state'): string[] {
  if (wert === undefined) return [pfad];
  if (typeof wert === 'number') return Number.isFinite(wert) ? [] : [pfad];
  if (Array.isArray(wert)) return wert.flatMap((e, i) => kaputteWerte(e, `${pfad}[${i}]`));
  if (wert === null || typeof wert !== 'object') return [];
  return Object.entries(wert).flatMap(([k, v]) => kaputteWerte(v, `${pfad}.${k}`));
}

/** Spielstand aus einem Objekt bauen, ohne an validateState vorbeizukommen. */
function datei(state: unknown, format: unknown = SAVE_FORMAT): string {
  return JSON.stringify({ format, appVersion: APP_VERSION, savedRound: 1, state });
}

describe('Spielstand schreiben und lesen', () => {
  it('ein neuer Spielstand kommt genauso zurück, wie er geschrieben wurde', () => {
    const state = newGame('speicher', balance);
    const geladen = deserializeGame(serializeGame(state, APP_VERSION));
    expect(geladen.ok).toBe(true);
    expect(geladen.ok && geladen.state).toEqual(state);
  });

  it('im Spielstand stehen Bau, Spielversion und Runde', () => {
    const datei = JSON.parse(serializeGame(newGame('kopfdaten', balance), APP_VERSION));
    expect(datei.format).toBe(SAVE_FORMAT);
    expect(datei.appVersion).toBe(APP_VERSION);
    expect(datei.savedRound).toBe(1);
  });

  it('schreiben lässt den Zustand unangetastet', () => {
    const state = mitPachtUndBohrung('unangetastet');
    const vorher = structuredClone(state);
    serializeGame(state, APP_VERSION);
    expect(state).toEqual(vorher);
  });

  it('nichts im Zustand wird zu NaN, Infinity oder undefined', () => {
    let state = mitPachtUndBohrung('zahlen');
    for (let i = 0; i < 15; i++) state = endRound(state, balance);
    expect(kaputteWerte(state)).toEqual([]);
    // NaN und Infinity landen als null im Text – die Zahlen selbst müssen also stimmen.
    expect(serializeGame(state, APP_VERSION)).not.toMatch(/NaN|Infinity/);
  });
});

describe('Ein Spiel läuft nach dem Laden genau weiter', () => {
  it('nach fünf Runden mit Pacht und Bohrung: acht Runden ohne Unterschied', () => {
    let state = mitPachtUndBohrung('fortgang');
    for (let i = 0; i < 5; i++) state = endRound(state, balance);

    const geladen = deserializeGame(serializeGame(state, APP_VERSION));
    expect(geladen.ok).toBe(true);
    if (!geladen.ok) return;

    let original = state;
    let ausSpeicher = geladen.state;
    for (let i = 0; i < 8; i++) {
      original = endRound(original, balance);
      ausSpeicher = endRound(ausSpeicher, balance);
      expect(ausSpeicher).toEqual(original);
      expect(serializeGame(ausSpeicher, APP_VERSION)).toBe(serializeGame(original, APP_VERSION));
    }
  });

  it('über alle 16 Runden: Runde für Runde gesichert und wieder geladen', () => {
    let state = mitPachtUndBohrung('ganzeskapitel');
    const ohneSpeichern: GameState[] = [state];
    for (let i = 0; i < 16; i++) {
      state = endRound(state, balance);
      ohneSpeichern.push(state);
      const geladen = deserializeGame(serializeGame(state, APP_VERSION));
      expect(geladen.ok).toBe(true);
      expect(geladen.ok && geladen.state).toEqual(state);
    }
    expect(state.finished).toBe(true);
    expect(state.ending).toBe('kapitel');

    // Weiterlaufen aus jedem gesicherten Stand ergibt wieder exakt dieselben Runden.
    for (let i = 0; i < 15; i++) {
      const geladen = deserializeGame(serializeGame(ohneSpeichern[i], APP_VERSION));
      expect(geladen.ok).toBe(true);
      if (!geladen.ok) return;
      expect(endRound(geladen.state, balance)).toEqual(ohneSpeichern[i + 1]);
    }
  });

  it('auch ein Spiel mit Pleite übersteht die Rundreise', () => {
    const tot = pleite();
    const geladen = deserializeGame(serializeGame(tot, APP_VERSION));
    expect(geladen.ok).toBe(true);
    expect(geladen.ok && geladen.state).toEqual(tot);
    expect(geladen.ok && geladen.state.ending).toBe('pleite');
    expect(endRound(geladen.ok ? geladen.state : tot, balance)).toEqual(tot);
  });
});

describe('Ein kaputter Spielstand wird abgelehnt', () => {
  it('kaputter Text', () => {
    const geladen = deserializeGame('{"format": 1, "state":');
    expect(geladen.ok).toBe(false);
    expect(geladen.ok ? '' : geladen.reason).toBe('Spielstand ist beschädigt.');
  });

  it('etwas ganz anderes als ein Spielstand', () => {
    expect(deserializeGame('[]').ok).toBe(false);
    expect(deserializeGame('hallo').ok).toBe(false);
    expect(deserializeGame('42').ok).toBe(false);
    expect(deserializeGame('null').ok).toBe(false);
  });

  it('Spielstand aus einer anderen Version', () => {
    const state = newGame('fremd', balance);
    for (const format of [SAVE_FORMAT + 1, SAVE_FORMAT - 1, 0]) {
      const geladen = deserializeGame(datei(state, format));
      expect(geladen.ok).toBe(false);
      expect(geladen.ok ? '' : geladen.reason).toBe('Spielstand stammt aus einer anderen Version.');
    }
    const ohneFormat = deserializeGame(JSON.stringify({ appVersion: APP_VERSION, savedRound: 1, state }));
    expect(ohneFormat.ok).toBe(false);
    expect(ohneFormat.ok ? '' : ohneFormat.reason).toBe('Spielstand stammt aus einer anderen Version.');
  });

  it('fehlende Felder im Zustand', () => {
    const voll = newGame('luecken', balance);
    const luecken: Record<string, unknown>[] = [
      {},
      { seed: 5 },
      { ...voll, seed: 42 },
      { ...voll, rng: 'x' },
      { ...voll, round: Number.NaN },
      { ...voll, cash: Infinity },
      { ...voll, startYear: undefined },
      { ...voll, oilStock: null },
      { ...voll, royaltyOil: 'viel' },
      { ...voll, railTariff: Number.NaN },
      { ...voll, postedPrice: Number.POSITIVE_INFINITY },
      { ...voll, missedPayments: null },
      { ...voll, bankruptcyDeadline: Number.NaN },
      { ...voll, roundLogStart: 'null' },
      { ...voll, parcels: {} },
      { ...voll, fields: null },
      { ...voll, leases: 'keine' },
      { ...voll, options: undefined },
      { ...voll, wells: 3 },
      { ...voll, priceHistory: {} },
      { ...voll, loans: null },
      { ...voll, log: 'nichts' },
      { ...voll, forecasts: [] },
      { ...voll, shipped: null },
      { ...voll, rival: null },
      { ...voll, rival: { ...voll.rival, rng: 'x' } },
      { ...voll, rival: { ...voll.rival, cash: Number.NaN } },
      { ...voll, rival: { ...voll.rival, wells: 'keine' } },
      { ...voll, finished: 'ja' },
      { ...voll, rating: undefined },
      { ...voll, ending: 'gewonnen' },
      { ...voll, round: 0 },
      { ...voll, round: voll.totalRounds + 1 },
      { ...voll, totalRounds: 0 },
    ];
    for (const state of luecken) {
      const geladen = deserializeGame(datei(state));
      expect(geladen.ok).toBe(false);
      expect(geladen.ok ? '' : geladen.reason).toBe('Spielstand ist unvollständig.');
    }
  });

  it('ein vollständiger Zustand wird auch mit Ende und Runde 16 angenommen', () => {
    const zuEnde = endRound(mitPachtUndBohrung('kapitelende'), balance);
    let state = zuEnde;
    while (!state.finished) state = endRound(state, balance);
    expect(state.round).toBe(state.totalRounds);
    expect(deserializeGame(serializeGame(state, APP_VERSION)).ok).toBe(true);
    const gekappt: unknown = { ...state, round: state.totalRounds + 1 };
    expect(deserializeGame(datei(gekappt)).ok).toBe(false);
  });
});