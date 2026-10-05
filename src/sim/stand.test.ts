// Stand – Aufnahme in die Gesellschaft (4.17, GDD §12): Ränge, drei Wege
// (erkaufen, erheiraten, brechen), Club, Verblassen, Zinsrabatt.
import { describe, expect, it } from 'vitest';
import { bankRate, freeCollateral, takeLoan } from './credit';
import type { GameState } from './game';
import { newGame } from './game';
import { kapitel3Of, type Kapitel3State } from './kapitel3';
import { arrangeMarriage, breakOrder, donate, donationGain, joinClub, MARRIAGE_BLOCKS, settleStand, standRank, standRateDiscount, standStatus, THOMAS_MARRIED } from './stand';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, ok } from './testKapitel3';

const balance = loadBalance();
const S = balance.kapitel3.stand;

function mitAnsehen(seed: string, ansehen: number, extra: Partial<Kapitel3State['stand']> = {}): GameState {
  const s = k3Game(seed, balance);
  const k = kapitel3Of(s, balance)!;
  return { ...s, kapitel3: { ...k, stand: { ...k.stand, ansehen, ...extra } } };
}

/** Thomas ist geboren (Kapitel 1, Runde 3) und mag seinen Vater. */
function mitThomas(s: GameState): GameState {
  return { ...s, family: { ...s.family, thomasBorn: 3, thomas: 70 } };
}

describe('Ränge', () => {
  it('nach den Schwellen aus balance.yaml; aufgenommen nur über den Club', () => {
    const k = (ansehen: number, extra: Partial<Kapitel3State['stand']> = {}) => mitAnsehen('rang', ansehen, extra).kapitel3!;
    expect(standStatus(k(S.start), balance)).toBe('emporkoemmling');
    expect(standStatus(k(S.ranks[1]), balance)).toBe('geduldet');
    expect(standStatus(k(S.ranks[2]), balance)).toBe('anerkannt');
    expect(standStatus(k(100), balance)).toBe('anerkannt');
    expect(standStatus(k(100, { admitted: true }), balance)).toBe('aufgenommen');
    expect(standStatus(k(0, { broken: true }), balance)).toBe('gefuerchtet');
    expect(standRank(k(0, { broken: true }), balance)).toBe(3);
  });

  it('Kapitelbeginn: Emporkömmling (Ölgeld zählt in Hallstead nichts)', () => {
    expect(standStatus(kapitel3Of(k3Game('start', balance), balance)!, balance)).toBe('emporkoemmling');
  });
});

describe('Anerkennung erkaufen', () => {
  it('jede Stiftung bringt weniger als die vorige und nie über cap', () => {
    let s = mitAnsehen('spende', S.start);
    const gains: number[] = [];
    for (let i = 0; i < 20; i++) {
      const vorher = s.kapitel3!.stand.ansehen;
      const r = donate(s, balance);
      if (!r.ok) {
        expect(r.reason).toBe('spenden_ausgereizt');
        break;
      }
      expect(r.state.cash).toBe(s.cash - S.donation.cost);
      gains.push(r.state.kapitel3!.stand.ansehen - vorher);
      s = r.state;
    }
    expect(gains[0]).toBe(S.donation.gain);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThanOrEqual(gains[i - 1]);
    expect(s.kapitel3!.stand.ansehen).toBeLessThanOrEqual(S.donation.cap);
    expect(donationGain(s.kapitel3!, balance)).toBe(0);
  });

  it('Kapitel 1 und ohne Geld: nein', () => {
    expect(donate(newGame('k1', balance), balance)).toEqual({ ok: false, reason: 'gesperrt' });
    expect(donate({ ...k3Game('arm', balance), cash: 0 }, balance)).toEqual({ ok: false, reason: 'geld' });
  });
});

describe('Anerkennung erheiraten', () => {
  it('braucht Thomas und den Rang „geduldet“; kostet Mitgift und Thomas’ Zuneigung', () => {
    expect(arrangeMarriage(mitAnsehen('h0', S.ranks[1]), balance)).toEqual({ ok: false, reason: 'kein_sohn' });
    expect(arrangeMarriage(mitThomas(mitAnsehen('h1', S.start)), balance)).toEqual({ ok: false, reason: 'rang' });
    const s = mitThomas(mitAnsehen('h2', S.ranks[1]));
    const t = ok(arrangeMarriage(s, balance));
    expect(t.cash).toBe(s.cash - S.marriage.cost);
    expect(t.kapitel3!.stand.ansehen).toBe(S.ranks[1] + S.marriage.gain);
    expect(t.family.thomas).toBe(70 + S.marriage.thomas);
    expect(arrangeMarriage(t, balance)).toEqual({ ok: false, reason: 'schon_verheiratet' });
  });

  it('0.4.19+3: nicht mit Thomas’ Bruch, eigenem Weg oder Evelyn Crane; die Heirat setzt thomas_verheiratet', () => {
    const s = mitThomas(mitAnsehen('h3', S.ranks[1]));
    for (const mk of MARRIAGE_BLOCKS) {
      const mit = { ...s, events: { ...s.events, marks: { ...s.events.marks, [mk]: 1 } } };
      expect(arrangeMarriage(mit, balance)).toEqual({ ok: false, reason: 'thomas_vergeben' });
    }
    const t = ok(arrangeMarriage(s, balance));
    expect(t.events.marks[THOMAS_MARRIED]).toBe(s.round);
  });
});

describe('Die alte Ordnung brechen', () => {
  it('öffnet alle Türen, aber kein Rabatt, keine Spenden, kein Club, keine Heirat; schwächt das Konsortium', () => {
    const s = mitThomas(mitAnsehen('br', 60));
    const t = ok(breakOrder(s, balance));
    expect(t.cash).toBe(s.cash - S.breakOrder.cost);
    expect(standStatus(t.kapitel3!, balance)).toBe('gefuerchtet');
    expect(standRateDiscount(t, balance)).toBe(0);
    expect(t.kapitel3!.konsortium.power).toBe(s.kapitel3!.konsortium.power + balance.kapitel3.konsortium.power.broken);
    for (const f of [donate, joinClub, arrangeMarriage, breakOrder]) expect(f(t, balance)).toEqual({ ok: false, reason: 'gebrochen' });
  });
});

describe('Hallstead Union Club', () => {
  it('erst ab club.from Ansehen; danach aufgenommen und kein Verblassen mehr', () => {
    expect(joinClub(mitAnsehen('c0', S.club.from - 1), balance)).toEqual({ ok: false, reason: 'ansehen' });
    const s = mitAnsehen('c1', S.club.from);
    const t = ok(joinClub(s, balance));
    expect(t.cash).toBe(s.cash - S.club.cost);
    expect(standStatus(t.kapitel3!, balance)).toBe('aufgenommen');
    expect(joinClub(t, balance)).toEqual({ ok: false, reason: 'aufgenommen' });
    expect(settleStand(t.kapitel3!, balance)).toBe(t.kapitel3!);
  });
});

describe('Verblassen und Zinsrabatt', () => {
  it('Ansehen verblasst je Runde um decay, nie unter start', () => {
    const k = mitAnsehen('vb', S.start + 2 * S.decay + 0.5).kapitel3!;
    const a = settleStand(k, balance);
    expect(a.stand.ansehen).toBeCloseTo(S.start + S.decay + 0.5);
    const c = settleStand(settleStand(a, balance), balance);
    expect(c.stand.ansehen).toBe(S.start);
    const tief = mitAnsehen('vb2', S.start - 5).kapitel3!;
    expect(settleStand(tief, balance).stand.ansehen).toBe(S.start - 5);
  });

  it('läuft über die Rundenabrechnung mit', () => {
    const s = mitAnsehen('vb3', 40);
    expect(k3Round(s, balance).kapitel3!.stand.ansehen).toBe(40 - S.decay);
  });

  it('die alten Banken geben je Rang Rabatt auf neue Kredite (Andockpunkt credit.ts)', () => {
    expect(standRateDiscount(newGame('z0', balance), balance)).toBe(0);
    const auf = mitAnsehen('z1', S.club.from, { admitted: true });
    expect(standRateDiscount(auf, balance)).toBe(S.rateDiscount[3]);
    const ohne = { ...newGame('z1', balance), cash: auf.cash };
    const mit = takeLoan(auf, balance, 500);
    const normal = takeLoan(ohne, balance, 500);
    expect(mit.ok && normal.ok).toBe(true);
    if (mit.ok && normal.ok) expect(mit.loan.rate).toBeCloseTo(normal.loan.rate - S.rateDiscount[3], 6);
  });

  it('das Kassenbuch zeigt vorab genau den Zins, den der Kredit dann bekommt (bankRate)', () => {
    const auf = mitAnsehen('z2', S.club.from, { admitted: true });
    const ohne = { ...newGame('z2', balance), cash: auf.cash };
    for (const s of [auf, ohne]) {
      const secured = freeCollateral(s).length > 0;
      const r = takeLoan(s, balance, 500);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.loan.rate).toBe(bankRate(s, balance, secured));
    }
    expect(bankRate(auf, balance, false)).toBeCloseTo(bankRate(ohne, balance, false) - S.rateDiscount[3], 6);
  });
});
