// Abzeichen der Siegelmappe (4.17): was in Kapitel 3 auf Jacob wartet.
import { describe, expect, it } from 'vitest';
import { newGame } from './game';
import { kapitel3Pending } from './kapitel3View';
import { orderSurvey, buyLicense } from './seismik';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, k3Rounds, ok } from './testKapitel3';

const balance = loadBalance();
const K = balance.kapitel3.konsortium;

describe('kapitel3Pending', () => {
  it('Kapitel 1: nichts (die Mappe liegt nicht auf dem Tisch)', () => {
    expect(kapitel3Pending(newGame('p0', balance), balance)).toBeNull();
  });

  it('zählt Einladung, Angebote und frische Berichte; Frist in der letzten Runde ist dringend', () => {
    const start = kapitel3Pending(k3Game('p1', balance), balance)!;
    expect(start.total).toBe(0);
    let s = k3Rounds(k3Game('p1', balance), balance, K.inviteRound - 1);
    let p = kapitel3Pending(s, balance)!;
    expect(p.invitation).toBe(true);
    expect(p.total).toBe(1 + p.offers);
    s = k3Rounds(s, balance, K.inviteDeadline - 1);
    expect(kapitel3Pending(s, balance)!.urgent).toBe(true);

    const mitLizenz = ok(buyLicense(k3Game('p2', balance), balance));
    const ranch = mitLizenz.parcels.find((x) => !x.discovery)!;
    const t = k3Round(ok(orderSurvey(mitLizenz, balance, ranch.id)), balance);
    p = kapitel3Pending(t, balance)!;
    expect(p.reports).toBe(1);
    expect(kapitel3Pending(k3Round(t, balance), balance)!.reports).toBe(0);
  });

  it('Rettung in der Pleitefrist zählt und ist dringend', () => {
    const p = kapitel3Pending({ ...k3Game('p3', balance), bankruptcyDeadline: 2 }, balance)!;
    expect(p.rescue).toBe(true);
    expect(p.urgent).toBe(true);
  });
});
