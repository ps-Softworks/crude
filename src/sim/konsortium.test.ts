// Mr. Vale und das Konsortium (4.17, GDD §12): Einladung, drei Wege, Gefallen,
// Rauswurf, Doppelspiel, Rettung in der Krise, Wirkung aufs Weltmodell.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import type { GameState } from './game';
import { kapitel3Of, type Kapitel3State } from './kapitel3';
import {
  acceptRescue,
  answerFavor,
  answerInvitation,
  detectionChance,
  expelledCost,
  favorChoices,
  invitationOpen,
  konsortiumWorldInput,
  rescueAvailable,
  settleKonsortium,
  trustWord,
} from './konsortium';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, k3Rounds, ok, withK3 } from './testKapitel3';

const balance = loadBalance();
const K = balance.kapitel3.konsortium;

/** Bis zur Einladung spielen (Runde inviteRound des Kapitels). */
function eingeladen(seed: string, b: Balance = balance): GameState {
  const s = k3Rounds(k3Game(seed, b), b, b.kapitel3.konsortium.inviteRound - 1);
  expect(invitationOpen(s.kapitel3!)).toBe(true);
  return s;
}

function patchK(s: GameState, f: (k: Kapitel3State) => Kapitel3State): GameState {
  return { ...s, kapitel3: f(s.kapitel3 ?? kapitel3Of(s, balance)!) };
}

/** Mitglied mit einem offenen Gefallen. */
function mitGefallen(seed: string, weg: 'annehmen' | 'ausspielen' = 'annehmen', b: Balance = balance): GameState {
  let s = ok(answerInvitation(eingeladen(seed, b), b, weg));
  for (let i = 0; i < 10 && !s.kapitel3!.konsortium.favor; i++) s = k3Round(s, b);
  expect(s.kapitel3!.konsortium.favor).not.toBeNull();
  return s;
}

describe('Einladung', () => {
  it('kommt zu Beginn der Runde inviteRound des Kapitels, nicht früher', () => {
    const s = k3Rounds(k3Game('inv', balance), balance, K.inviteRound - 2);
    expect(s.kapitel3?.konsortium.invitedRound ?? 0).toBe(0);
    const t = k3Round(s, balance);
    expect(t.kapitel3!.konsortium.invitedRound).toBe(t.round);
    expect(t.kapitel3!.konsortium.inviteDeadline).toBe(t.round + K.inviteDeadline - 1);
    expect(t.kapitel3!.notes.some((n) => n.key === 'einladung' && n.round === t.round)).toBe(true);
  });

  it('Schweigen gilt nach der Frist als Absage', () => {
    let s = eingeladen('inv-still');
    s = k3Rounds(s, balance, K.inviteDeadline);
    expect(s.kapitel3!.konsortium.path).toBe('abgelehnt');
    expect(s.kapitel3!.notes.some((n) => n.key === 'einladung_verfallen')).toBe(true);
    expect(s.kapitel3!.konsortium.power).toBe(K.powerStart + K.power.refuse);
  });

  it('ohne Einladung keine Antwort; nur einmal antworten', () => {
    expect(answerInvitation(k3Game('inv-0', balance), balance, 'annehmen')).toEqual({ ok: false, reason: 'keine_einladung' });
    const s = ok(answerInvitation(eingeladen('inv-1'), balance, 'ablehnen'));
    expect(answerInvitation(s, balance, 'annehmen')).toEqual({ ok: false, reason: 'schon_entschieden' });
  });
});

describe('Die drei Wege', () => {
  it('annehmen: Mitglied, Kartellgewinn je Runde, Ansehen und Macht steigen', () => {
    const s0 = eingeladen('weg-a');
    const s = ok(answerInvitation(s0, balance, 'annehmen'));
    const k = s.kapitel3!;
    expect(k.konsortium.path).toBe('mitglied');
    expect(k.konsortium.power).toBe(K.powerStart + K.power.join);
    expect(k.stand.ansehen).toBe(s0.kapitel3!.stand.ansehen + balance.kapitel3.stand.member);
    const t = k3Round(s, balance);
    expect(t.cash).toBe(s.cash + K.memberIncome);
  });

  it('ablehnen: keine Vorteile, keine Gefallen', () => {
    let s = ok(answerInvitation(eingeladen('weg-b'), balance, 'ablehnen'));
    const cash = s.cash;
    s = k3Rounds(s, balance, 8);
    expect(s.kapitel3!.konsortium.favor).toBeNull();
    // Nur Projekte können Geld bringen – ohne Zeichnung keins.
    expect(s.cash).toBe(cash);
  });

  it('ausspielen: mehr Geld, aber die Entdeckungsgefahr wächst jede Runde', () => {
    const s = ok(answerInvitation(eingeladen('weg-c'), balance, 'ausspielen'));
    expect(s.kapitel3!.konsortium.path).toBe('doppelspiel');
    const r = s.round;
    expect(detectionChance(s.kapitel3!, balance, r)).toBeCloseTo(K.doubleDetect);
    expect(detectionChance(s.kapitel3!, balance, r + 3)).toBeCloseTo(K.doubleDetect + 3 * K.doubleDetectGrowth);
    const sicher = withK3(balance, (k) => ({ ...k, konsortium: { ...k.konsortium, doubleDetect: 0, doubleDetectGrowth: 0 } }));
    expect(k3Round(s, sicher).cash).toBe(s.cash + K.doubleIncome);
  });

  it('Doppelspiel fliegt auf: Rauswurf, Ansehen und Macht sinken, Preisdruck folgt', () => {
    const b = withK3(balance, (k) => ({ ...k, konsortium: { ...k.konsortium, doubleDetect: 1 } }));
    const s = ok(answerInvitation(eingeladen('auf', b), b, 'ausspielen'));
    const t = k3Round(s, b);
    const k = t.kapitel3!;
    expect(k.konsortium.path).toBe('verstossen');
    expect(k.konsortium.trust).toBe(0);
    expect(k.konsortium.power).toBe(s.kapitel3!.konsortium.power + K.power.exposed);
    expect(k.stand.ansehen).toBe(Math.max(0, s.kapitel3!.stand.ansehen + balance.kapitel3.stand.exposed));
    expect(k.notes.some((n) => n.key === 'aufgeflogen')).toBe(true);
    // Preisdruck: genau expelledRounds Runden.
    let u = t;
    let druck = 0;
    for (let i = 0; i < K.expelledRounds + 3; i++) {
      const v = k3Round(u, b);
      if (v.cash < u.cash) druck++;
      u = v;
    }
    expect(druck).toBe(K.expelledRounds);
  });
});

describe('Gefallen', () => {
  it('Mitglieder bekommen alle favorEvery Runden einen Gefallen mit Frist', () => {
    const s = ok(answerInvitation(eingeladen('fav'), balance, 'annehmen'));
    const t = k3Rounds(s, balance, K.favorEvery - 1);
    expect(t.kapitel3!.konsortium.favor).toBeNull();
    const u = k3Round(t, balance);
    const f = u.kapitel3!.konsortium.favor!;
    expect(f.round).toBe(s.round + K.favorEvery);
    expect(f.deadline).toBe(f.round + K.favorDeadline - 1);
    expect(K.favors.map((x) => x.id)).toContain(f.id);
  });

  it('erfüllen kostet, was balance.yaml sagt, und stärkt das Vertrauen', () => {
    const s = mitGefallen('fav-ok');
    const def = K.favors.find((f) => f.id === s.kapitel3!.konsortium.favor!.id)!;
    const t = ok(answerFavor(s, balance, 'erfuellen'));
    expect(t.cash).toBe(s.cash - def.cash);
    expect(t.kapitel3!.konsortium.trust).toBe(Math.min(100, s.kapitel3!.konsortium.trust + K.complyTrust));
    expect(t.kapitel3!.konsortium.favor).toBeNull();
    expect(t.kapitel3!.konsortium.favorsDone).toBe(1);
    expect(answerFavor({ ...s, cash: 0 }, balance, 'erfuellen')).toEqual({ ok: false, reason: 'geld' });
  });

  it('verweigern kostet Vertrauen; unter expelBelow fliegt Jacob hinaus', () => {
    const s = mitGefallen('fav-nein');
    const t = ok(answerFavor(s, balance, 'verweigern'));
    expect(t.kapitel3!.konsortium.trust).toBe(s.kapitel3!.konsortium.trust + K.refuseTrust);
    const knapp = patchK(s, (k) => ({ ...k, konsortium: { ...k.konsortium, trust: K.expelBelow - K.refuseTrust - 1 } }));
    const raus = ok(answerFavor(knapp, balance, 'verweigern'));
    expect(raus.kapitel3!.konsortium.path).toBe('verstossen');
    expect(raus.kapitel3!.konsortium.pressureUntil).toBe(s.round + K.expelledRounds);
  });

  it('0.4.20+9: Der Preisdruck nach dem Rauswurf wächst und fällt mit dem Posted Price', () => {
    const g = k3Game('raus-preis', balance);
    const raus = patchK(g, (k) => ({ ...k, konsortium: { ...k.konsortium, path: 'verstossen', pressureUntil: g.round + 3 } }));
    expect(expelledCost({ postedPrice: balance.market.basePrice }, balance)).toBe(K.expelledPenalty);
    expect(expelledCost({ postedPrice: balance.market.basePrice * 2 }, balance)).toBe(2 * K.expelledPenalty);
    const billig = { ...raus, postedPrice: balance.market.basePrice / 2 };
    const teuer = { ...raus, postedPrice: balance.market.basePrice * 2 };
    const [, c1] = settleKonsortium(billig, balance, billig.kapitel3!);
    const [, c2] = settleKonsortium(teuer, balance, teuer.kapitel3!);
    expect(c1).toBe(-expelledCost(billig, balance));
    expect(c2).toBe(-expelledCost(teuer, balance));
    expect(c2).toBe(4 * c1);
  });

  it('eine verstrichene Frist zählt als Verweigerung', () => {
    const s = mitGefallen('fav-frist');
    const t = k3Rounds(s, balance, K.favorDeadline);
    expect(t.kapitel3!.notes.some((n) => n.key === 'gefallen_verfallen')).toBe(true);
    expect(t.kapitel3!.konsortium.favorsRefused).toBe(1);
  });

  it('zum Schein erfüllen geht nur im Doppelspiel und erhöht die Gefahr', () => {
    const m = mitGefallen('fav-schein-m');
    expect(favorChoices(m.kapitel3!)).not.toContain('vortaeuschen');
    expect(answerFavor(m, balance, 'vortaeuschen')).toEqual({ ok: false, reason: 'falsche_wahl' });
    const sicher = withK3(balance, (k) => ({ ...k, konsortium: { ...k.konsortium, doubleDetect: 0, doubleDetectGrowth: 0 } }));
    const d = mitGefallen('fav-schein-d', 'ausspielen', sicher);
    const t = ok(answerFavor(d, sicher, 'vortaeuschen'));
    expect(t.cash).toBe(d.cash);
    expect(t.kapitel3!.konsortium.suspicion).toBeCloseTo(K.feignDetect);
  });

  it('ohne Gefallen keine Antwort', () => {
    const s = ok(answerInvitation(eingeladen('fav-0'), balance, 'annehmen'));
    expect(answerFavor(s, balance, 'erfuellen')).toEqual({ ok: false, reason: 'kein_gefallen' });
  });
});

describe('Rettung in der Krise', () => {
  it('nur in der Pleitefrist, einmal, nicht nach dem Rauswurf', () => {
    const s = k3Game('rett', balance);
    expect(rescueAvailable(s, balance)).toBe(false);
    const krise = { ...s, cash: -5000, bankruptcyDeadline: s.round + 2 };
    expect(rescueAvailable(krise, balance)).toBe(true);
    const t = ok(acceptRescue(krise, balance));
    expect(t.cash).toBe(-5000 + K.rescue.cash);
    expect(t.kapitel3!.konsortium.path).toBe('mitglied');
    expect(t.kapitel3!.konsortium.controlled).toBe(true);
    expect(t.kapitel3!.konsortium.trust).toBe(K.rescue.trust);
    expect(rescueAvailable(t, balance)).toBe(false);
    const raus = patchK(krise, (k) => ({ ...k, konsortium: { ...k.konsortium, path: 'verstossen' } }));
    expect(acceptRescue(raus, balance)).toEqual({ ok: false, reason: 'keine_rettung' });
  });

  it('unter Aufsicht kommen Gefallen öfter, und es gibt keine spätere Einladung', () => {
    const krise = { ...k3Game('rett-2', balance), bankruptcyDeadline: 3 };
    const t = ok(acceptRescue(krise, balance));
    const u = k3Rounds(t, balance, K.favorEveryControlled);
    expect(u.kapitel3!.konsortium.favor).not.toBeNull();
    expect(invitationOpen(u.kapitel3!)).toBe(false);
  });
});

describe('Vertrauen und Weltmodell', () => {
  it('Vertrauen nur als Wort', () => {
    const k = kapitel3Of(k3Game('wort', balance), balance)!;
    const mit = (trust: number) => trustWord({ konsortium: { ...k.konsortium, trust } }, balance);
    expect(mit(0)).toBe('niedrig');
    expect(mit(K.trustWords[0])).toBe('mittel');
    expect(mit(K.trustWords[1])).toBe('hoch');
  });

  it('Macht über 50 schürt Spannung und Kreditrausch, drückt die Stimmung; ohne Kapitel 3 nichts', () => {
    const s = ensure(k3Game('welt', balance));
    const stark = patchK(s, (k) => ({ ...k, konsortium: { ...k.konsortium, power: 80 } }));
    const w = konsortiumWorldInput(stark, balance);
    expect(w.tensionShift).toBeGreaterThan(0);
    expect(w.creditShift).toBeGreaterThan(0);
    expect(w.moodShift).toBeLessThan(0);
    const schwach = konsortiumWorldInput(patchK(s, (k) => ({ ...k, konsortium: { ...k.konsortium, power: 20 } })), balance);
    expect(schwach.tensionShift).toBeLessThan(0);
    const { kapitel3: _weg, ...ohne } = s;
    expect(konsortiumWorldInput(ohne as GameState, balance)).toEqual({ tensionShift: 0, creditShift: 0, moodShift: 0 });
  });
});

function ensure(s: GameState): GameState {
  return k3Round(s, balance);
}
