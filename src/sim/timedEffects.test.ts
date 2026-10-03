// Befristete Nachwirkungen aus Ereignissen (0.2.15+3): price, production, leaseCost.
import { describe, expect, it } from 'vitest';
import { advanceProduction, initialRate } from './production';
import { applyEffects, autoResolve, resolveEvent, timedEffect, timedRoundsLeft, type EventDef } from './events';
import { newGame, type GameState } from './game';
import { leaseTerms } from './lease';
import { deserializeGame, serializeGame, SAVE_FORMAT } from './save';
import { loadBalance } from './testBalance';
import { jacobPrice } from './trust';

const balance = loadBalance();
const RUNDEN = balance.events.timedRounds;

function spiel(): GameState {
  return newGame('nachwirkung', balance);
}

/** Spiel mit einer fördernden Quelle. */
function mitQuelle(): GameState {
  const s = spiel();
  const parcel = s.parcels.find((p) => p.fieldId !== undefined)!;
  return {
    ...s,
    wells: [
      {
        id: `${parcel.id}#1`,
        parcelId: parcel.id,
        stage: 1,
        status: 'found',
        roundsLeft: 0,
        spent: 1000,
        oilStage: 1,
        result: 'small',
        production: { initialRate: initialRate(balance, s, { parcelId: parcel.id, result: 'small' }), roundsProduced: 0, lastRate: 0, total: 0 },
        startRound: 1,
      },
    ],
  };
}

const ereignis: EventDef = {
  id: 'pruefer',
  title: { de: 'Prüfer', en: '' },
  text: { de: 'Text', en: '' },
  conditions: {},
  chance: 1,
  once: false,
  marked: [],
  notMarked: [],
  delay: 0,
  routine: false,
  appointments: 0,
  choices: [
    { id: 'abzug', label: { de: 'Abzug', en: '' }, result: { de: 'ok', en: '' }, requires: {}, effects: { price: -0.05 }, default: true, marks: [] },
    { id: 'schmieren', label: { de: 'Schmieren', en: '' }, result: { de: 'ok', en: '' }, requires: {}, effects: { price: 0.02 }, default: false, marks: [] },
  ],
};

describe('Befristete Nachwirkungen (0.2.15+3)', () => {
  it('balance.yaml: timedRounds ist eine Rundenzahl ab 1', () => {
    expect(RUNDEN).toBeGreaterThanOrEqual(1);
  });

  it('price: Der Trust zahlt Jacob timedRounds Runden lang mehr oder weniger, dann wieder den Posted Price', () => {
    const s = applyEffects(spiel(), { price: -0.05 }, 'pruefer', RUNDEN);
    expect(jacobPrice(s, balance)).toBeCloseTo(s.postedPrice - 0.05, 10);
    const letzte = { ...s, round: s.round + RUNDEN - 1 };
    expect(jacobPrice(letzte, balance)).toBeCloseTo(s.postedPrice - 0.05, 10);
    expect(timedRoundsLeft(letzte, 'price')).toBe(1);
    const danach = { ...s, round: s.round + RUNDEN };
    expect(jacobPrice(danach, balance)).toBe(danach.postedPrice);
    expect(timedEffect(danach, 'price')).toBe(0);
  });

  it('price: nie unter null', () => {
    const s = applyEffects(spiel(), { price: -100 }, 'x', RUNDEN);
    expect(jacobPrice(s, balance)).toBe(0);
  });

  it('production: Jacobs Quellen fördern mehr oder weniger', () => {
    const basis = advanceProduction(mitQuelle(), balance).oilStock;
    const mehr = advanceProduction(applyEffects(mitQuelle(), { production: 0.2 }, 'x', RUNDEN), balance).oilStock;
    const weniger = advanceProduction(applyEffects(mitQuelle(), { production: -0.2 }, 'y', RUNDEN), balance).oilStock;
    expect(basis).toBeGreaterThan(0);
    expect(mehr).toBeCloseTo(basis * 1.2, 6);
    expect(weniger).toBeCloseTo(basis * 0.8, 6);
  });

  it('leaseCost: Pachten werden teurer oder billiger', () => {
    const s = spiel();
    const id = s.parcels.find((p) => p.fieldId === undefined)!.id;
    const basis = leaseTerms(s, balance, id).bonus;
    const billig = leaseTerms(applyEffects(s, { leaseCost: -0.5 }, 'x', RUNDEN), balance, id).bonus;
    const teuer = leaseTerms(applyEffects(s, { leaseCost: 0.5 }, 'y', RUNDEN), balance, id).bonus;
    expect(billig).toBeLessThan(basis);
    expect(teuer).toBeGreaterThan(basis);
  });

  it('verschiedene Ereignisse addieren sich, dasselbe Ereignis ersetzt seine eigene Wirkung', () => {
    let s = applyEffects(spiel(), { price: 0.03 }, 'a', RUNDEN);
    s = applyEffects(s, { price: 0.02 }, 'b', RUNDEN);
    expect(timedEffect(s, 'price')).toBeCloseTo(0.05, 10);
    s = applyEffects(s, { price: 0.02 }, 'a', RUNDEN);
    expect(timedEffect(s, 'price')).toBeCloseTo(0.04, 10);
    expect(s.events.timed).toHaveLength(2);
  });

  it('eine Antwort am Schreibtisch und die Standard-Antwort ohne Jacob tragen die Wirkung ein', () => {
    const s = { ...spiel(), events: { ...spiel().events, pending: ['pruefer'] } };
    const r = resolveEvent(s, balance, [ereignis], 'pruefer', 'schmieren');
    expect(r.ok && timedEffect(r.state, 'price')).toBeCloseTo(0.02, 10);
    expect(r.ok && r.state.events.timed[0].until).toBe(s.round + RUNDEN - 1);
    const ohne = autoResolve(s, [ereignis], undefined, RUNDEN);
    expect(timedEffect(ohne, 'price')).toBeCloseTo(-0.05, 10);
  });

  it('Spielstand: Nachwirkungen werden gesichert; ältere Stände (Format 10) bekommen eine leere Liste', () => {
    const s = applyEffects(spiel(), { production: 0.1 }, 'x', RUNDEN);
    const r = deserializeGame(serializeGame(s, 'test'));
    expect(r.ok && r.state.events.timed).toEqual(s.events.timed);
    const alt: GameState = { ...spiel(), events: { ...spiel().events } };
    delete (alt.events as Partial<GameState['events']>).timed;
    const r2 = deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: 'alt', savedRound: 1, state: alt }));
    expect(r2.ok && r2.state.events.timed).toEqual([]);
  });
});
