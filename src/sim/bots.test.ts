import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { botTable, botTurn, okActions, playGame, runBots, seedWinners, STRATEGIES } from './bots';
import { applyAction } from './desk';
import { endRound, newGame } from './game';
import { Rng, seedFromString } from './rng';
import { validateState } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `test-${i}`);
/** Hat Jacob in dieser Partie selbst bei der Bank geliehen? (takeLoan schreibt das ins Protokoll) */
const bankLoan = (log: string[]) => log.some((z) => z.includes('bei der Bank geliehen'));

describe('Bot-Läufe', () => {
  it('gleicher Seed und gleiche Strategie ergeben dieselbe Partie', () => {
    for (const s of STRATEGIES) {
      expect(playGame('gleich', balance, s)).toEqual(playGame('gleich', balance, s));
    }
  });

  it('der Bot-Zufall fasst den Zufall der Welt nicht an und nutzt nie Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const seed of seeds(10)) {
      const start = newGame(seed, balance);
      const nach = botTurn(start, balance, 'zufaellig', new Rng(seedFromString(`${seed}-bot`)));
      // Nur Bohren würfelt in der Welt; ohne neue Bohrung bleibt state.rng gleich.
      if (nach.wells.length === start.wells.length) expect(nach.rng).toBe(start.rng);
      const ende = playGame(seed, balance, 'zufaellig').state;
      expect(ende.parcels.map((p) => p.reserves)).toEqual(start.parcels.map((p) => p.reserves));
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('jede Strategie spielt bis zum Ende und hinterlässt einen gültigen Spielstand', () => {
    for (const s of STRATEGIES) {
      for (const seed of seeds(5)) {
        const r = playGame(seed, balance, s);
        expect(r.state.finished).toBe(true);
        expect(validateState(r.state).ok).toBe(true);
        expect(r.bankrupt).toBe(r.state.ending === 'pleite');
        expect(r.rounds).toBeLessThanOrEqual(balance.start.rounds);
      }
    }
  });

  it('vorsichtig nimmt nie selbst einen Kredit', () => {
    // Am Rundenende kann die Bank automatisch einspringen (z. B. nach einem Unfall) –
    // das ist Regel, nicht Strategie. Der Bot selbst leiht in seinem Zug nie.
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        const nach = botTurn(state, balance, 'vorsichtig', rng);
        expect(nach.loans.length).toBeLessThanOrEqual(state.loans.length);
        state = endRound(nach, balance);
      }
    }
  });

  it('vorsichtig kauft nur Optionen, deren Bonus danach noch bezahlbar ist', () => {
    const { cashReserve } = balance.bots.cautious;
    let gekauft = 0;
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        const vorher = new Set(state.options.map((o) => o.parcelId));
        const nach = botTurn(state, balance, 'vorsichtig', rng);
        for (const o of nach.options.filter((o) => o.holder === 'jacob' && !vorher.has(o.parcelId))) {
          gekauft++;
          expect(nach.cash - o.bonus).toBeGreaterThanOrEqual(cashReserve);
        }
        state = endRound(nach, balance);
      }
    }
    expect(gekauft).toBeGreaterThan(0);
  });

  it('gierig gibt eine Bohrung auf, wenn auch ein Kredit das Weiterbohren nicht bezahlt', () => {
    // Ohne Aufgeben bliebe der einzige Turm für den Rest des Kapitels blockiert.
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        state = botTurn(state, balance, 'gierig', rng);
        expect(state.wells.filter((w) => w.status === 'decision' || w.status === 'stuck')).toEqual([]);
        state = endRound(state, balance);
      }
    }
  });

  it('gierig leiht in mindestens einer von 20 Partien bei der Bank', () => {
    expect(seeds(20).some((seed) => bankLoan(playGame(seed, balance, 'gierig').state.log))).toBe(true);
  });

  it('zufällig wählt nur Aktionen, die gerade gehen', () => {
    let state = newGame('zufall', balance);
    const rng = new Rng(seedFromString('zufall-bot'));
    for (let i = 0; i < 4; i++) {
      const aktionen = okActions(state, balance);
      expect(aktionen.length).toBeGreaterThan(0);
      for (const a of aktionen) expect(applyAction(state, balance, a.parcelId, a.kind).ok).toBe(true);
      state = botTurn(state, balance, 'zufaellig', rng);
    }
  });

  it('die Tabelle hat Kopfzeile und eine Zeile je Strategie', () => {
    const table = botTable(runBots(balance, 3));
    const zeilen = table.split('\n');
    expect(zeilen[0]).toBe('| Strategie | Partien | Bankrottquote | Ø Imperiumswert | Siegquote |');
    expect(zeilen).toHaveLength(2 + 3);
    for (const s of STRATEGIES) expect(table).toContain(`| ${s} |`);
  });

  it('Siegquote: der höchste Imperiumswert gewinnt, eine Pleite nie, Gleichstand wird geteilt', () => {
    const sieger = seedWinners([
      { strategy: 'vorsichtig', bankrupt: false, empire: -500 },
      { strategy: 'gierig', bankrupt: true, empire: 0 },
      { strategy: 'zufaellig', bankrupt: false, empire: -800 },
    ]);
    expect([...sieger]).toEqual([['vorsichtig', 1]]);
    const geteilt = seedWinners([
      { strategy: 'vorsichtig', bankrupt: false, empire: 100 },
      { strategy: 'gierig', bankrupt: false, empire: 100 },
      { strategy: 'zufaellig', bankrupt: false, empire: 0 },
    ]);
    expect(Object.fromEntries(geteilt)).toEqual({ vorsichtig: 0.5, gierig: 0.5 });
  });

  it('Gate 1: keine Strategie gewinnt immer', () => {
    for (const r of runBots(balance, 100)) expect(r.winRate).toBeLessThan(1);
  }, 60_000);

  it('die Siegquoten aller Strategien ergeben zusammen 100 %', () => {
    const rows = runBots(balance, 20);
    expect(rows.reduce((s, r) => s + r.winRate, 0)).toBeCloseTo(1, 10);
  });

  it('Fertig-Kriterium: 1.000 Partien je Strategie ergeben Quote und Ø-Wert', () => {
    const rows = runBots(balance);
    expect(rows.map((r) => r.strategy)).toEqual([...STRATEGIES]);
    for (const r of rows) {
      expect(r.games).toBe(balance.bots.games);
      expect(r.games).toBe(1000);
      expect(r.bankruptRate).toBeGreaterThanOrEqual(0);
      expect(r.bankruptRate).toBeLessThanOrEqual(1);
      expect(Number.isFinite(r.meanEmpire)).toBe(true);
    }
  }, 120_000);

  it('docs/botlaeufe.md enthält die Tabelle mit allen drei Strategien', () => {
    const md = readFileSync(new URL('../../docs/botlaeufe.md', import.meta.url), 'utf8');
    expect(md).toContain('Bankrottquote');
    for (const s of STRATEGIES) expect(md).toContain(s);
  });
});
