// 4.11: Schattenbuch und Werkstatt lassen sich in Kapitel 2 aufschlagen (Rauchtest ohne Browser).
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../../sim/game';
import { advanceInvestigation } from '../../sim/investigation';
import { buildWorkshop } from '../../sim/research';
import { balance } from '../balance';
import { ShadowBookSheet } from './ShadowBookSheet';
import type { SheetContext } from './types';
import { WorkshopSheet } from './WorkshopSheet';

function ctx(game: GameState, tab?: string): SheetContext {
  return {
    game,
    inbox: { post: [], incidents: [], visitors: [] } as unknown as SheetContext['inbox'],
    debug: false,
    debugTools: false,
    onGame: () => {},
    onLoan: () => {},
    tab,
    onTab: () => {},
    open: () => {},
    showOnMap: () => {},
  };
}

function kapitel2(marks: string[]): GameState {
  const g = newGame('ui-k2', balance);
  const m: Record<string, number> = {};
  for (const x of marks) m[x] = 2;
  return { ...g, cash: 50000, chapter: 2, events: { ...g.events, marks: m } } as GameState;
}

describe('Schattenbuch und Werkstatt (4.11)', () => {
  it('das Schattenbuch zeigt Hitze, Spuren mit Text und Gegenmittel', () => {
    const s = advanceInvestigation(kapitel2(['moss_betrogen', 'silas_kronzeuge']), balance);
    const spuren = renderToString(createElement(ShadowBookSheet, { ctx: ctx(s, 'spuren') }));
    expect(spuren).toContain('Hitze');
    expect(spuren).toContain('Ezekiel Moss');
    expect(spuren).toContain('Zeugen kaufen');
    const mittel = renderToString(createElement(ShadowBookSheet, { ctx: ctx(s, 'gegenmittel') }));
    expect(mittel).toContain('Anwalt');
    expect(mittel).toContain('Sündenbock');
  });

  it('die Werkstatt zeigt die Techniken bis Stufe II und was Jacob tun kann', () => {
    const ohne = renderToString(createElement(WorkshopSheet, { ctx: ctx(kapitel2([])) }));
    expect(ohne).toContain('Versuchswerkstatt einrichten');
    expect(ohne).toContain('Thermisches Cracken');
    // was jede Technik bewirkt – 0.4.20+9: alles wirkt, kein „wirkt noch nicht“ mehr
    expect(ohne).toContain('Bohrzeit');
    expect(ohne).toContain('Benzinausbeute');
    expect(ohne).toContain('Tanklaster');
    expect(ohne).not.toContain('wirkt noch nicht');
    const r = buildWorkshop(kapitel2([]), balance);
    if (!r.ok) throw new Error(r.reason);
    const mit = renderToString(createElement(WorkshopSheet, { ctx: ctx(r.state) }));
    expect(mit).toContain('Forschen');
    expect(mit).toContain('Stufe II');
  });
});
