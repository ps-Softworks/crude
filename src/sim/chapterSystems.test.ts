import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openChapterSystems, openProvince } from './chapterSystems';
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

  it('ab Kapitel 2 ist die ganze Provinz offen, die neuen Ranches ohne Prognosen (0.4.20+2)', () => {
    const vorher = imKapitel(2);
    const s = openChapterSystems(vorher, balance, { stocksBoard: board });
    const bohrbar = balance.world.regions.filter((r) => r.kind === 'drillable').map((r) => r.id);
    expect(bohrbar.length).toBeGreaterThan(1);
    for (const id of bohrbar) {
      expect(s.regions).toContain(id);
      expect(s.parcels.some((p) => p.region === id)).toBe(true);
    }
    const neu = s.parcels.filter((p) => !vorher.parcels.some((q) => q.id === p.id));
    expect(neu.length).toBeGreaterThan(0);
    for (const p of neu) expect(s.forecasts[p.id]).toBeUndefined();
    // Zweimal aufrufen ändert nichts mehr am Land.
    expect(openChapterSystems(s, balance, { stocksBoard: board }).parcels.length).toBe(s.parcels.length);
  });

  it('openProvince öffnet ältere Spielstände ab Kapitel 2 beim Laden, Kapitel 1 und offene Stände bleiben gleich', () => {
    const k1 = newGame('provinz-k1', balance, events);
    expect(openProvince(k1, balance)).toBe(k1);
    const alt = imKapitel(2, 'provinz-alt');
    const offen = openProvince(alt, balance);
    for (const r of balance.world.regions.filter((x) => x.kind === 'drillable')) expect(offen.regions).toContain(r.id);
    expect(offen.parcels.length).toBeGreaterThan(alt.parcels.length);
    // Altes Land, Pachten und Kasse bleiben unberührt.
    for (const p of alt.parcels) expect(offen.parcels.find((q) => q.id === p.id)).toEqual(p);
    expect(offen.cash).toBe(alt.cash);
    expect(offen.leases).toEqual(alt.leases);
    expect(openProvince(offen, balance)).toBe(offen);
    // Über Speichern und Laden bleibt es offen.
    const geladen = deserializeGame(serializeGame(offen, 'test'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(openProvince(geladen.state, balance).parcels.length).toBe(offen.parcels.length);
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
