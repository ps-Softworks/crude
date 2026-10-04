// Kapitel 3 (4.17): Freischaltung, Schnittstellen zu Weltmodell und Kapitel,
// eigener Zufall, Spielstand und Spielzahlen.
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance } from './balance';
import { endRound, newGame, type GameState } from './game';
import { chapterOf, ensureKapitel3, isKapitel3State, kapitel3Of, kapitel3Unlocked, previewKapitel3, worldOf } from './kapitel3';
import { advanceKapitel3 } from './kapitel3Runde';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { k3Game, k3Rounds } from './testKapitel3';

const balance = loadBalance();

describe('Freischaltung', () => {
  it('Kapitel 1: nichts sichtbar, nichts gerechnet, nichts gespeichert', () => {
    let s = newGame('k3-k1', balance);
    expect(chapterOf(s)).toBe(1);
    expect(kapitel3Unlocked(s, balance)).toBe(false);
    expect(kapitel3Of(s, balance)).toBeNull();
    expect(advanceKapitel3(s, balance)).toBe(s);
    for (let i = 0; i < 4; i++) s = endRound(s, balance);
    expect(s.kapitel3).toBeUndefined();
    expect(serializeGame(s, 'test')).not.toContain('kapitel3');
  });

  it('ab Kapitel 3 entsteht der Zustand beim ersten Rundenende, mit Notiz', () => {
    const s = endRound(k3Game('k3-start', balance), balance);
    expect(s.kapitel3).toBeDefined();
    expect(s.kapitel3!.notes[0].key).toBe('freigeschaltet');
    expect(s.kapitel3!.startRound).toBe(1);
  });

  it('ensureKapitel3 legt nur einmal an und nur, wenn freigeschaltet', () => {
    const k1 = newGame('k3-ens', balance);
    expect(ensureKapitel3(k1, balance)).toBe(k1);
    const s = ensureKapitel3(k3Game('k3-ens', balance), balance);
    expect(ensureKapitel3(s, balance)).toBe(s);
  });

  it('Debug-Probe öffnet Kapitel 3 auch in Kapitel 1', () => {
    const s = previewKapitel3(newGame('k3-probe', balance), balance);
    expect(kapitel3Unlocked(s, balance)).toBe(true);
    expect(s.kapitel3!.preview).toBe(true);
  });

  it('fromChapter aus balance.yaml gilt', () => {
    const b = { ...balance, kapitel3: { ...balance.kapitel3, fromChapter: 2 } };
    expect(kapitel3Unlocked({ ...newGame('x', b), chapter: 2 } as GameState, b)).toBe(true);
    expect(kapitel3Unlocked({ ...newGame('x', balance), chapter: 2 } as GameState, balance)).toBe(false);
  });
});

describe('Schnittstellen', () => {
  it('Weltgrößen: Ersatzwerte ohne Weltmodell, sonst die Werte aus state.worldModel', () => {
    const s = k3Game('k3-welt', balance);
    expect(worldOf(s, balance)).toEqual(balance.kapitel3.world);
    const mitWelt = { ...s, worldModel: { tech: 80, credit: 70, tension: 10 } } as GameState;
    expect(worldOf(mitWelt, balance)).toEqual({ tech: 80, credit: 70, tension: 10, mood: balance.kapitel3.world.mood });
  });

  it('Vales Vertrauen merkt sich das Geld „eines Freundes“ aus Kapitel 1', () => {
    const kb = balance.kapitel3.konsortium;
    const s = k3Game('k3-vale', balance);
    expect(kapitel3Of(s, balance)!.konsortium.trust).toBe(kb.trustStart);
    const geld = { ...s, events: { ...s.events, marks: { ...s.events.marks, vale_geld: 3 } } };
    expect(kapitel3Of(geld, balance)!.konsortium.trust).toBe(kb.trustStart + kb.trustValeGeld);
    const zurueck = { ...s, events: { ...s.events, marks: { ...s.events.marks, vale_abgelehnt: 3 } } };
    expect(kapitel3Of(zurueck, balance)!.konsortium.trust).toBe(kb.trustStart + kb.trustValeAbgelehnt);
  });
});

describe('Eigener Zufall', () => {
  it('Kapitel 3 zieht nicht an den Würfeln von Karte, Ereignissen und Rivalen', () => {
    const ohne = endRound({ ...newGame('k3-rng', balance), cash: 1_000_000 }, balance);
    const mit = endRound(k3Game('k3-rng', balance), balance);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.events.rng).toBe(ohne.events.rng);
    expect(mit.rival.rng).toBe(ohne.rival.rng);
  });

  it('gleicher Seed, gleicher Verlauf', () => {
    const a = k3Rounds(k3Game('k3-det', balance), balance, 10);
    const b = k3Rounds(k3Game('k3-det', balance), balance, 10);
    expect(a.kapitel3).toEqual(b.kapitel3);
  });
});

describe('Spielstand', () => {
  it('Kapitel 3 übersteht Sichern und Laden', () => {
    const s = k3Rounds(k3Game('k3-save', balance), balance, 6);
    const r = deserializeGame(serializeGame(s, 'test'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.kapitel3).toEqual(s.kapitel3);
  });

  it('ein beschädigter Kapitel-3-Zustand wird abgelehnt', () => {
    const s = k3Rounds(k3Game('k3-kaputt', balance), balance, 2);
    const kaputt = { ...s, kapitel3: { ...s.kapitel3!, konsortium: { ...s.kapitel3!.konsortium, path: 'vielleicht' } } };
    expect(isKapitel3State(kaputt.kapitel3)).toBe(false);
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
    expect(isKapitel3State(s.kapitel3)).toBe(true);
  });
});

describe('Spielzahlen (Block kapitel3)', () => {
  it('fehlender Block ist ein Fehler', () => {
    const raw = rawBalance();
    delete raw.kapitel3;
    expect(() => parseBalance(raw)).toThrow(BalanceError);
    expect(() => parseBalance(raw)).toThrow(/Block "kapitel3" fehlt/);
  });

  it('falsche Werte werden mit Pfad gemeldet', () => {
    const raw = rawBalance() as { kapitel3: Record<string, Record<string, unknown>> };
    raw.kapitel3.seismik = { ...raw.kapitel3.seismik, insight: 1.5 };
    expect(() => parseBalance(raw)).toThrow(/kapitel3.seismik.insight" darf höchstens 1 sein/);
  });

  it('Technikstufen müssen aufsteigen, Gefallen eindeutig sein', () => {
    const a = rawBalance() as { kapitel3: Record<string, Record<string, unknown>> };
    a.kapitel3.seismik = { ...a.kapitel3.seismik, techStages: [0, 50, 40, 70, 90] };
    expect(() => parseBalance(a)).toThrow(/techStages" muss aufsteigend/);
    const b = rawBalance() as { kapitel3: Record<string, Record<string, unknown>> };
    b.kapitel3.konsortium = { ...b.kapitel3.konsortium, favors: [{ id: 'x', cash: 1 }, { id: 'x', cash: 2 }] };
    expect(() => parseBalance(b)).toThrow(/doppelt/);
  });

  it('der Club liegt über „anerkannt“', () => {
    const raw = rawBalance() as { kapitel3: Record<string, Record<string, unknown>> };
    raw.kapitel3.stand = { ...raw.kapitel3.stand, club: { cost: 1, from: 40 } };
    expect(() => parseBalance(raw)).toThrow(/club.from/);
  });
});
