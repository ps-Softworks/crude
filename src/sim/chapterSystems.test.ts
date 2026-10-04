import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openChapterSystems } from './chapterSystems';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { parseStocksContent } from './stocksContent';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const events = loadEvents();
const board = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board;

function imKapitel(chapter: number, seed = 'kapitelstart'): GameState {
  return { ...newGame(seed, balance, events), chapter, ipo: { share: 0.3, proceeds: 0 } };
}

describe('Kapitelstart der Phase-4-Systeme (Integration)', () => {
  it('Kapitel 1 bleibt unverändert', () => {
    const s = newGame('k1', balance, events);
    expect(openChapterSystems(s, balance, { stocksBoard: board })).toBe(s);
  });

  it('Kapitel 2 legt Raffinerie, Fernleitungen, Aktien, Personal, Diplomatie, Ermittler und Werkstatt an', () => {
    const s = openChapterSystems(imKapitel(2), balance, { stocksBoard: board });
    expect(s.refinery).toBeDefined();
    expect(s.bigPipelines).toBeDefined();
    expect(s.stocks?.public).toBe(true);
    expect(s.staff).toBeDefined();
    expect(s.diplomacy).toBeDefined();
    expect(s.investigation).toBeDefined();
    expect(s.research).toBeDefined();
    // Kapitel-3-Systeme noch nicht.
    expect(s.brand).toBeUndefined();
    expect(s.exchange).toBeUndefined();
    expect(s.kapitel3).toBeUndefined();
    expect(s.hallstead).toBeUndefined();
  });

  it('Kapitel 3 legt zusätzlich Marke, Börse und Siegelmappe an', () => {
    const s = openChapterSystems(imKapitel(3), balance, { stocksBoard: board });
    expect(s.refinery).toBeDefined();
    expect(s.brand).toBeDefined();
    expect(s.exchange).toBeDefined();
    expect(s.kapitel3).toBeDefined();
  });

  it('ohne Räte entsteht kein Aktienbuch, der Rest schon', () => {
    const s = openChapterSystems(imKapitel(2), balance);
    expect(s.stocks).toBeUndefined();
    expect(s.refinery).toBeDefined();
  });

  it('ist deterministisch und doppelt aufgerufen dasselbe', () => {
    const a = openChapterSystems(imKapitel(3), balance, { stocksBoard: board });
    const b = openChapterSystems(imKapitel(3), balance, { stocksBoard: board });
    expect(a).toEqual(b);
    expect(openChapterSystems(a, balance, { stocksBoard: board })).toBe(a);
  });

  it('der Stand übersteht Sichern, Laden und ein paar Rundenenden', () => {
    let s = openChapterSystems(imKapitel(3), balance, { stocksBoard: board });
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    for (let i = 0; i < 4 && !s.finished; i++) s = endRound(s, balance, events);
    expect(deserializeGame(serializeGame(s, 'test')).ok).toBe(true);
    expect(Number.isFinite(s.cash)).toBe(true);
  });
});
