// Weichen statt Alltagspost (Spielspaß K1, src/sim/weichen.ts): Folgen bis Kapitelende, geschenktes Land,
// ein besserer Turm und Ruths Unterschrift beim Bankrahmen.
import { describe, expect, it } from 'vitest';
import { creditLimit } from './credit';
import { parseEventFiles } from './eventContent';
import { resolveEvent, timedEffect, timedRoundsLeft, type EventChoice, type EventDef } from './events';
import { newGame, type GameState } from './game';
import { leaseTerms } from './lease';
import { SILAS_RIG } from './rigs';
import { loadBalance } from './testBalance';
import { giftRig, grantLand, roundsToChapterEnd, WEICHEN_MARKS, weichenCreditFactor } from './weichen';

const balance = loadBalance();
const t = (de: string) => ({ de, en: '' });

function weiche(choice: Partial<EventChoice>): EventDef {
  return {
    id: 'probe', title: t('Probe'), text: t('Text'), conditions: {}, marked: [], notMarked: [], delay: 0, chance: 1, once: true, routine: false, appointments: 0,
    choices: [{ id: 'ja', label: t('ja'), result: t('ok'), requires: {}, effects: {}, default: true, marks: [], ...choice }],
  };
}

function aufDemTisch(s: GameState, id = 'probe'): GameState {
  return { ...s, events: { ...s.events, pending: [id], due: { [id]: s.round } } };
}

function mossFarm(s: GameState) {
  return s.parcels.find((p) => p.figure === 'moss')!;
}

describe('roundsToChapterEnd und lasting: Wirkung bis Kapitelende', () => {
  it('zählt die laufende Runde mit und ist mindestens 1', () => {
    const s = newGame('weiche', balance);
    expect(roundsToChapterEnd({ round: 1, totalRounds: 16 })).toBe(16);
    expect(roundsToChapterEnd({ round: 16, totalRounds: 16 })).toBe(1);
    expect(roundsToChapterEnd({ round: 20, totalRounds: 16 })).toBe(1);
    expect(roundsToChapterEnd(s)).toBe(s.totalRounds - s.round + 1);
  });

  it('eine Antwort mit lasting wirkt bis zur letzten Runde des Kapitels statt nur events.timedRounds Runden', () => {
    const s = aufDemTisch({ ...newGame('weiche', balance), round: 5 });
    const mit = resolveEvent(s, balance, [weiche({ effects: { leaseCost: 0.2 }, lasting: true })], 'probe', 'ja');
    const ohne = resolveEvent(s, balance, [weiche({ effects: { leaseCost: 0.2 } })], 'probe', 'ja');
    if (!mit.ok || !ohne.ok) throw new Error('Wahl ging nicht');
    expect(timedRoundsLeft(mit.state, 'leaseCost')).toBe(s.totalRounds - 5 + 1);
    expect(timedRoundsLeft(ohne.state, 'leaseCost')).toBe(balance.events.timedRounds);
    expect(timedEffect({ ...mit.state, round: s.totalRounds }, 'leaseCost')).toBeCloseTo(0.2, 9);
    expect(timedEffect({ ...ohne.state, round: s.totalRounds }, 'leaseCost')).toBe(0);
  });
});

describe('grantLand: die Ranch einer Figur ohne Bonus', () => {
  it('Moss-Farm: Pacht für Jacob ohne Bonus bis Kapitelende, mit dem genannten Förderzins; Optionen darauf entfallen', () => {
    const s = newGame('land', balance);
    const farm = mossFarm(s);
    const mitOption = { ...s, options: [...s.options, { parcelId: farm.id, bonus: 500, royalty: 0.125, fee: 50, expiresAfterRound: 3 } as GameState['options'][number]] };
    const n = grantLand(mitOption, balance, { figure: 'moss', royalty: 0.0625 });
    expect(n.leases.at(-1)).toEqual({ parcelId: farm.id, holder: 'jacob', bonus: 0, royalty: 0.0625, startRound: s.round, expiresAfterRound: s.totalRounds, drilled: false });
    expect(n.options.some((o) => o.parcelId === farm.id)).toBe(false);
    expect(n.cash).toBe(s.cash);
    expect(n.log.at(-1)).toMatch(/pachtet Moss-Farm ohne Bonus bis Kapitelende \(Förderzins 6,3 %\)/);
  });

  it('ohne royalty gilt der übliche Förderzins der Ranch', () => {
    const s = newGame('land', balance);
    expect(grantLand(s, balance, { figure: 'moss' }).leases.at(-1)!.royalty).toBe(leaseTerms(s, balance, mossFarm(s).id).royalty);
  });

  it('pachtet Jacob schon: keine zweite Pacht, aber seine bekommt die besseren Bedingungen; unbekannte Figur: nichts', () => {
    const s = newGame('land', balance);
    const einmal = grantLand(s, balance, { figure: 'moss', royalty: 0.0625 });
    const kurz = { ...einmal, leases: einmal.leases.map((l) => (l.parcelId === mossFarm(s).id ? { ...l, expiresAfterRound: s.round } : l)) };
    const zweimal = grantLand(kurz, balance, { figure: 'moss', royalty: 0 });
    expect(zweimal.leases.filter((l) => l.parcelId === mossFarm(s).id)).toEqual([{ ...einmal.leases.at(-1)!, royalty: 0, expiresAfterRound: s.totalRounds }]);
    expect(zweimal.log.at(-1)).toMatch(/gilt jetzt bis Kapitelende zum Förderzins von 0 %/);
    // Höher wird der Förderzins nie.
    expect(grantLand(zweimal, balance, { figure: 'moss', royalty: 0.0625 }).leases.find((l) => l.parcelId === mossFarm(s).id)!.royalty).toBe(0);
    expect(grantLand(s, balance, { figure: 'niemand' })).toBe(s);
  });

  it('hat ein anderer die Ranch gepachtet: nichts, nur ein Satz im Protokoll', () => {
    const s = newGame('land', balance);
    const fremd = { ...s, leases: [...s.leases, { parcelId: mossFarm(s).id, holder: 'bullard', bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 9, drilled: false } as GameState['leases'][number]] };
    const n = grantLand(fremd, balance, { figure: 'moss', royalty: 0 });
    expect(n.leases).toEqual(fremd.leases);
    expect(n.log.at(-1)).toMatch(/ist schon verpachtet/);
  });

  it('wirkt über die Antwort eines Ereignisses (land)', () => {
    const s = aufDemTisch(newGame('land', balance));
    const r = resolveEvent(s, balance, [weiche({ land: { figure: 'moss', royalty: 0 } })], 'probe', 'ja');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.leases.some((l) => l.parcelId === mossFarm(s).id && l.holder === 'jacob' && l.royalty === 0)).toBe(true);
  });
});

describe('giftRig: Silas’ Turm wird besser', () => {
  it('Stahlgestänge oder Dampfmaschine auf Silas’ Turm, ohne Geld; schon vorhanden: nichts', () => {
    const s = newGame('turm', balance);
    expect(s.rigs.find((r) => r.id === SILAS_RIG)).toMatchObject({ rods: false, steam: false });
    const stahl = giftRig(s, 'rods');
    expect(stahl.rigs.find((r) => r.id === SILAS_RIG)!.rods).toBe(true);
    expect(stahl.cash).toBe(s.cash);
    expect(stahl.log.at(-1)).toMatch(/Stahlgestänge/);
    expect(giftRig(stahl, 'rods')).toBe(stahl);
    expect(giftRig(s, 'steam').rigs.find((r) => r.id === SILAS_RIG)!.steam).toBe(true);
  });

  it('ohne Silas’ Turm bekommt der erste Turm das Geschenk; ganz ohne Turm passiert nichts', () => {
    const s = newGame('turm', balance);
    const fremd = { ...s, rigs: s.rigs.map((r) => ({ ...r, id: 'eigen' })) };
    expect(giftRig(fremd, 'steam').rigs[0].steam).toBe(true);
    const leer = { ...s, rigs: [] };
    expect(giftRig(leer, 'steam')).toBe(leer);
  });
});

describe('Ruths Unterschrift: mehr Bankrahmen in Kapitel 1', () => {
  it('mit ruth_teilhaberin × weichen.ruthCredit, ohne 1, ab Kapitel 2 immer 1', () => {
    const s = newGame('bank', balance);
    const ruth = { ...s, events: { ...s.events, marks: { ...s.events.marks, [WEICHEN_MARKS.ruthPartner]: 10 } } };
    expect(balance.weichen.ruthCredit).toBeGreaterThan(1);
    expect(weichenCreditFactor(s, balance)).toBe(1);
    expect(weichenCreditFactor(ruth, balance)).toBe(balance.weichen.ruthCredit);
    expect(weichenCreditFactor({ ...ruth, chapter: 2 }, balance)).toBe(1);
  });

  it('wirkt auf creditLimit (auf 100 $ gerundet)', () => {
    const s = newGame('bank', balance);
    const ruth = { ...s, events: { ...s.events, marks: { ...s.events.marks, [WEICHEN_MARKS.ruthPartner]: 10 } } };
    const ohne = creditLimit(s, balance);
    expect(ohne).toBeGreaterThan(0);
    expect(Math.abs(creditLimit(ruth, balance) - ohne * balance.weichen.ruthCredit)).toBeLessThanOrEqual(100);
  });
});

describe('Inhaltsprüfung: lasting, land, rig', () => {
  const datei = (zusatz: string) =>
    `- id: probe\n  chance: 0.1\n  title: { de: "T", en: "" }\n  text: { de: "T", en: "" }\n  choices:\n    - id: ja\n      label: { de: "Ja", en: "" }\n      result: { de: "Ja", en: "" }\n${zusatz}`;
  const fehler = (zusatz: string) => parseEventFiles([{ file: 'a.yaml', text: datei(zusatz) }]).errors.map((e) => e.message).join(' ');

  it('liest gültige Angaben', () => {
    const r = parseEventFiles([{ file: 'a.yaml', text: datei('      lasting: true\n      land: { figure: moss, royalty: 0.05 }\n      rig: steam\n') }]);
    expect(r.errors).toEqual([]);
    expect(r.events[0].choices[0]).toMatchObject({ lasting: true, land: { figure: 'moss', royalty: 0.05 }, rig: 'steam' });
    expect(parseEventFiles([{ file: 'a.yaml', text: datei('      land: { figure: hale }\n') }]).events[0].choices[0].land).toEqual({ figure: 'hale' });
  });

  it('meldet falsche Werte', () => {
    expect(fehler('      lasting: ja\n')).toMatch(/„lasting“ muss true oder false sein/);
    expect(fehler('      land: moss\n')).toMatch(/„land“ braucht figure/);
    expect(fehler('      land: { figure: moss, royalty: 1.5 }\n')).toMatch(/„land“ braucht figure/);
    expect(fehler('      rig: turbo\n')).toMatch(/„rig“ muss/);
  });
});
