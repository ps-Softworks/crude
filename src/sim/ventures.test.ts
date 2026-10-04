// Beteiligungen aus dem Zeitsprung (4.5): Benzinanlage und Okara bleiben über den Kapitelwechsel.
import { describe, expect, it } from 'vitest';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { jacobPrice } from './trust';
import { fuelPremium, okaraIncome, settleVentures, venturesValue } from './ventures';
import { worldPriceFactor } from './world';

const balance = loadBalance();
const sw = balance.timeskip.switches;

function stand(ventures: GameState['ventures'], round = 5): GameState {
  return { ...newGame('beteiligung', balance), round, ventures };
}

describe('Benzinanlage', () => {
  it('ab Runde since zahlt der Trust den Aufschlag auf jeden Barrel, vorher nicht', () => {
    const s = stand({ benzin: { since: 6 } });
    expect(fuelPremium(s, balance)).toBe(0);
    expect(fuelPremium({ ...s, round: 6 }, balance)).toBe(sw.automobilePremium);
    const ohne = stand(undefined, 6);
    expect(jacobPrice({ ...s, round: 6 }, balance)).toBeCloseTo(jacobPrice(ohne, balance) + sw.automobilePremium, 5);
  });
});

describe('Okara', () => {
  it('Jacob mit Fund: Einnahmen je Quartal (Weltpreis-Faktor) und Wert im Imperium', () => {
    const s = stand({ okara: { holder: 'jacob', oil: true, since: 5 } });
    const erwartet = Math.round(sw.okaraIncome * worldPriceFactor(s.worldModel, balance.worldModel));
    expect(okaraIncome(s, balance, 'jacob')).toBe(erwartet);
    expect(okaraIncome(s, balance, 'bullard')).toBe(0);
    expect(venturesValue(s, balance)).toBe(Math.round(sw.okaraIncome * worldPriceFactor(s.worldModel, balance.worldModel) * sw.okaraValueQuarters));
    expect(empireValue(s, balance)).toBeCloseTo(empireValue(stand(undefined), balance) + venturesValue(s, balance), 1);
    const danach = settleVentures(s, balance);
    expect(danach.cash).toBe(s.cash + erwartet);
    expect(danach.log.at(-1)).toMatch(/Okara/);
  });

  it('trocken oder noch nicht so weit: nichts', () => {
    expect(okaraIncome(stand({ okara: { holder: 'jacob', oil: false, since: 1 } }), balance, 'jacob')).toBe(0);
    expect(okaraIncome(stand({ okara: { holder: 'jacob', oil: true, since: 9 } }), balance, 'jacob')).toBe(0);
    expect(venturesValue(stand({ okara: { holder: 'jacob', oil: false, since: 1 } }), balance)).toBe(0);
  });

  it('hat Bullard die Pachten genommen, zahlt Okara an ihn – Jacobs Kasse bleibt gleich', () => {
    const s = stand({ okara: { holder: 'bullard', oil: true, since: 1 } });
    const danach = settleVentures(s, balance);
    expect(danach.cash).toBe(s.cash);
    expect(danach.rival.cash).toBeGreaterThan(s.rival.cash);
    expect(venturesValue(s, balance)).toBe(0);
  });

  it('im Rundenende zahlt Okara aus (auch in Kapitel 2)', () => {
    const s = stand({ okara: { holder: 'jacob', oil: true, since: 1 } }, 2);
    const mit = endRound(s, balance);
    const ohne = endRound({ ...s, ventures: undefined }, balance);
    // Ausgezahlt wird nach dem Weltschritt der Runde – mit dem Weltpreis-Faktor von dann.
    expect(mit.cash - ohne.cash).toBe(okaraIncome({ ...s, worldModel: mit.worldModel }, balance, 'jacob'));
    expect(mit.cash - ohne.cash).toBeGreaterThan(0);
  });
});

describe('Spielstand', () => {
  it('Beteiligungen überstehen Sichern und Laden; kaputte werden abgelehnt', () => {
    const s = stand({ benzin: { since: 3 }, okara: { holder: 'bullard', oil: true, since: 4 } });
    const geladen = deserializeGame(serializeGame(s, '0.4.5'));
    expect(geladen.ok && geladen.state).toEqual(s);
    const kaputt = JSON.stringify({ format: 18, appVersion: '0.4.5', savedRound: 5, state: { ...s, ventures: { okara: { holder: 'crane', oil: true, since: 4 } } } });
    expect(deserializeGame(kaputt).ok).toBe(false);
  });
});
