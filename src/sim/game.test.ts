import { describe, expect, it } from 'vitest';
import { assignFields, buildFields } from './field';
import { endRound, formatDate, newGame, type GameState } from './game';
import { generateParcels } from './geology';
import { startOptions } from './lease';
import { computePrice, neighbourSupply } from './market';
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

describe('Startwerte für Kredit und Pleite (1.10)', () => {
  it('Jacob kommt mit Rating B, ohne Schulden und ohne Frist an', () => {
    const state = newGame('kredit-start', balance);
    expect(state.rating).toBe(balance.credit.startRating);
    expect(state.rating).toBe('B');
    expect(state.loans).toEqual([]);
    expect(state.missedPayments).toBe(0);
    expect(state.bankruptcyDeadline).toBe(0);
    expect(state.ending).toBeNull();
  });

  it('ohne Schulden kostet das Rundenende keine Zinsen und das Kapitel endet normal', () => {
    let state = newGame('ohne-kredit', balance);
    for (let i = 0; i < balance.start.rounds; i++) state = endRound(state, balance);
    expect(state.cash).toBe(balance.start.cash);
    expect(state.loans).toEqual([]);
    expect(state.finished).toBe(true);
    expect(state.ending).toBe('kapitel');
  });
});

describe('Bankrott beendet das Spiel (1.10, Fertig-Kriterium)', () => {
  /** Schulden, Rating D, Geldverleiher ausgeschöpft, Zinsen höher als die Kasse. */
  function verschuldet(seed: string): GameState {
    const state = newGame(seed, balance);
    return {
      ...state,
      cash: 50,
      rating: 'D',
      loans: [
        { id: 1, source: 'bank', principal: 3000, rate: 0.15, takenRound: 1, collateral: null },
        { id: 2, source: 'lender', principal: balance.credit.emergency.limit, rate: balance.credit.emergency.rate, takenRound: 1, collateral: null },
      ],
    };
  }

  it('nach graceRounds Runden im Minus ist Jacob pleite; danach ändert endRound nichts mehr', () => {
    let state = endRound(verschuldet('bankrott'), balance);
    expect(state.cash).toBeLessThan(0);
    expect(state.bankruptcyDeadline).toBe(1 + balance.bankruptcy.graceRounds);
    expect(state.ending).toBeNull();
    for (let i = 0; i < balance.bankruptcy.graceRounds; i++) state = endRound(state, balance);
    expect(state.finished).toBe(true);
    expect(state.ending).toBe('pleite');
    expect(state.round).toBe(1 + balance.bankruptcy.graceRounds);
    expect(state.log.at(-1)).toMatch(/pleite/);
    expect(endRound(state, balance)).toBe(state);
  });

  it('wer sich in der Frist rettet, spielt weiter', () => {
    let state = endRound(verschuldet('rettung'), balance);
    expect(state.bankruptcyDeadline).toBeGreaterThan(0);
    state = { ...state, cash: 10000 };
    state = endRound(state, balance);
    expect(state.bankruptcyDeadline).toBe(0);
    expect(state.ending).toBeNull();
  });

  it('im Minus in der letzten Runde: sofort pleite statt Kapitelende', () => {
    const state = endRound({ ...verschuldet('letzte'), round: balance.start.rounds }, balance);
    expect(state.ending).toBe('pleite');
    expect(state.finished).toBe(true);
    expect(state.log.some((l) => /Kapitel 1 ist zu Ende/.test(l))).toBe(false);
  });

  it('gleicher Seed und gleiche Schritte ergeben den gleichen Bankrott', () => {
    const lauf = () => {
      let s = verschuldet('gleich');
      for (let i = 0; i < 5; i++) s = endRound(s, balance);
      return s;
    };
    expect(lauf()).toEqual(lauf());
  });
});

describe('Protokoll der Runde (1.11)', () => {
  it('im neuen Spiel beginnt das Rundenprotokoll bei 0', () => {
    expect(newGame('protokoll-start', balance).roundLogStart).toBe(0);
  });

  it('endRound merkt sich die alte Länge: alles danach gehört zur Abrechnung', () => {
    const state = newGame('protokoll-runde', balance);
    const vorher = state.log.length;
    const nachher = endRound(state, balance);
    expect(nachher.roundLogStart).toBe(vorher);
    expect(nachher.log.length).toBeGreaterThan(vorher);
    expect(state.roundLogStart).toBe(0);
  });

  it('mit jeder Runde wandert der Schnitt weiter', () => {
    let state = newGame('protokoll-mehrere', balance);
    for (let i = 0; i < 3; i++) {
      const vorher = state.log.length;
      state = endRound(state, balance);
      expect(state.roundLogStart).toBe(vorher);
    }
    expect(state.round).toBe(4);
  });

  it('auch am Ende des Kapitels bleibt das Protokoll der letzten Runde sichtbar', () => {
    const state = { ...newGame('protokoll-kapitel', balance), round: balance.start.rounds };
    const vorher = state.log.length;
    const nachher = endRound(state, balance);
    expect(nachher.finished).toBe(true);
    expect(nachher.ending).toBe('kapitel');
    expect(nachher.roundLogStart).toBe(vorher);
    expect(nachher.log.at(-1)).toMatch(/Kapitel 1 ist zu Ende/);
  });

  it('bei Pleite auch: das Protokoll endet mit dem Schuldspruch', () => {
    const tot: GameState = {
      ...newGame('protokoll-pleite', balance),
      cash: -500,
      bankruptcyDeadline: 1,
      rating: 'D',
      loans: [
        { id: 1, source: 'bank', principal: 3000, rate: 0.15, takenRound: 1, collateral: null },
        {
          id: 2,
          source: 'lender',
          principal: balance.credit.emergency.limit,
          rate: balance.credit.emergency.rate,
          takenRound: 1,
          collateral: null,
        },
      ],
    };
    const vorher = tot.log.length;
    const nachher = endRound(tot, balance);
    expect(nachher.ending).toBe('pleite');
    expect(nachher.roundLogStart).toBe(vorher);
    expect(nachher.log.at(-1)).toMatch(/pleite/);
  });
});

describe('Ölpreis im Spielablauf (1.9)', () => {
  it('newGame setzt den Posted Price aus dem Startangebot und eine Preisliste mit einem Eintrag', () => {
    const state = newGame('markt-start', balance);
    expect(state.postedPrice).toBe(computePrice(balance.market, neighbourSupply(balance.market, 1)));
    expect(state.priceHistory).toEqual([state.postedPrice]);
  });

  it('nach endRound ist die Preisliste einen Eintrag länger', () => {
    const start = newGame('markt-runde', balance);
    const next = endRound(start, balance);
    expect(next.priceHistory).toHaveLength(2);
    expect(next.priceHistory.at(-1)).toBe(next.postedPrice);
  });
});
