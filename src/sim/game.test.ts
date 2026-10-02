import { describe, expect, it } from 'vitest';
import { assignFields, buildFields } from './field';
import { endRound, formatDate, newGame, type GameState } from './game';
import { generateParcels } from './geology';
import { startOptions, buyLease } from './lease';
import { startDrilling } from './drilling';
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
    const geologie = generateParcels(balance, rng);
    // Die Lagerstätten kommen nach der Geologie und verändern sie nicht.
    const parcels = assignFields(geologie, buildFields(geologie));
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

describe('Lagerstätten und Tank im Spielzustand', () => {
  it('legt zu Beginn leere Tanks an', () => {
    expect(newGame('tank', balance).oilStock).toBe(0);
  });

  it('findet auf jeder Karte Lagerstätten', () => {
    for (const seed of ['harlan', 'brandt', 'kalender']) {
      expect(newGame(seed, balance).fields.length).toBeGreaterThan(0);
    }
  });

  it('gibt jeder ölführenden Parzelle ihre Feld-ID, ohne Öl verliert keine Reserve', () => {
    const state = newGame('felder', balance);
    const oel = state.parcels.filter((p) => p.reserves > 0);
    expect(state.fields.flatMap((f) => f.parcelIds).sort()).toEqual(oel.map((p) => p.id).sort());
    const summe = (list: { reserves: number }[]) => list.reduce((s, p) => s + p.reserves, 0);
    expect(summe(state.fields)).toBe(summe(oel));
  });

  it('lässt Lagerstätten und Parzellen über die Runden unverändert', () => {
    const before = newGame('stabil', balance);
    const felder = before.fields;
    const parzellen = before.parcels;
    const state = endRound(before, balance);
    expect(state.fields).toEqual(felder);
    expect(state.parcels).toEqual(parzellen);
  });
});

describe('Reihenfolge beim Rundenende', () => {
  /** Spiel mit einer Bohrung, die genau in dieser Runde fertig wird. */
  function amFund(seed = 'reihenfolge'): GameState {
    const state = newGame(seed, balance);
    const parcel = state.parcels.find((p) => p.reserves > 0)!;
    return {
      ...state,
      wells: [
        {
          parcelId: parcel.id,
          stage: 1,
          status: 'drilling',
          roundsLeft: 1,
          spent: 1500,
          oilStage: 1,
          startRound: 1,
        },
      ],
    };
  }

  it('die Förderrunde läuft vor der Bohrung: eine neue Quelle liefert erst ab der nächsten Runde', () => {
    const state = endRound(amFund(), balance);
    expect(state.wells[0].status).toBe('found');
    expect(state.wells[0].production).toMatchObject({ roundsProduced: 0, lastRate: 0, total: 0 });
    expect(state.oilStock).toBe(0);
  });

  it('in der Runde danach fließt Öl in den Tank', () => {
    const state = endRound(endRound(amFund(), balance), balance);
    expect(state.wells[0].production!.roundsProduced).toBe(1);
    expect(state.oilStock).toBeGreaterThan(0);
    expect(state.oilStock).toBe(state.wells[0].production!.total);
    expect(state.log.some((l) => /fördert .* Barrel, im Tank sind/.test(l))).toBe(true);
  });
});

describe('Startwerte für Transport und Verkauf (1.8)', () => {
  it('Bahntarif aus der Balance, nichts verschickt, kein Förderzins-Öl', () => {
    const state = newGame('transport-start', balance);
    expect(state.railTariff).toBe(balance.transport.rail.costPerBarrel);
    expect(state.shipped).toEqual({ wagon: 0, rail: 0 });
    expect(state.royaltyOil).toBe(0);
  });
});

describe('Marktintegration (1.9)', () => {
  it('newGame setzt postedPrice auf basePrice und priceHistory mit einem Eintrag', () => {
    const state = newGame('market-start', balance);
    expect(state.postedPrice).toBe(balance.market.basePrice);
    expect(state.priceHistory).toEqual([balance.market.basePrice]);
  });

  it('endRound ruft advanceMarket auf: postedPrice ändert sich, priceHistory wächst', () => {
    let state = newGame('market-round', balance);
    const startPrice = state.postedPrice; // = basePrice = 1.00
    state = endRound(state, balance);
    expect(state.priceHistory).toHaveLength(2);
    expect(state.postedPrice).toBe(state.priceHistory[1]);
    // Runde 1 Preis wird berechnet: neighbourSupply=4800, Preis = 1.0 * (5000/4800)^1.5 ≈ 1.06
    expect(state.postedPrice).toBeGreaterThan(startPrice);
  });

  it('priceHistory enthält alle postedPrice-Werte der bisherigen Runden', () => {
    let state = newGame('market-history', balance);
    for (let i = 0; i < 5; i++) {
      state = endRound(state, balance);
    }
    expect(state.priceHistory).toHaveLength(6); // Runde 1 + 5 Runden
    state.priceHistory.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(balance.market.priceMin);
      expect(p).toBeLessThanOrEqual(balance.market.priceMax);
    });
  });

  it('Log-Eintrag bei Preissprung >= newsThreshold', () => {
    let state = newGame('market-log', balance);
    // Pachte und bohne auf einer ölführenden Parzelle (nicht Entdeckungsquelle)
    const oilParcel = state.parcels.find((p) => p.reserves > 0 && !p.discovery)!;
    const leaseResult = buyLease(state, balance, oilParcel.id);
    expect(leaseResult.ok).toBe(true);
    if (!leaseResult.ok) throw new Error(leaseResult.reason);
    state = leaseResult.state;
    const drillResult = startDrilling(state, balance, oilParcel.id);
    expect(drillResult.ok).toBe(true);
    if (!drillResult.ok) throw new Error(drillResult.reason);
    state = drillResult.state;
    // Bohre schnell durch alle Stufen
    for (let i = 0; i < 3; i++) {
      state = endRound(state, balance);
    }
    const hasPriceLog = state.log.some((l) => l.includes('Posted Price'));
    expect(hasPriceLog).toBe(true);
  });

  it('Determinismus: gleicher Seed = gleiche Preisentwicklung', () => {
    const run = (seed: string) => {
      let s = newGame(seed, balance);
      for (let i = 0; i < 10; i++) s = endRound(s, balance);
      return s.priceHistory;
    };
    expect(run('det-market')).toEqual(run('det-market'));
  });
});
