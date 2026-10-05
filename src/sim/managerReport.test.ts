import { describe, expect, it } from 'vitest';
import { managerReport } from './managerReport';
import { roundFlow } from './timeskip';
import { chapterEnds, jumpWith } from './timeskipBots';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const catalog = loadEvents();
const sprung = chapterEnds(balance, 3, catalog).map((ende) => ({ ende, ...jumpWith(ende, balance, { stance: 'balanced', family: 'some' }, () => 'x', catalog) }));

describe('Bericht des Verwalters (0.4.20+2)', () => {
  it('nennt die Förderung vor und nach dem Sprung und rechnet Raffinerie, Fernleitung zum Hafen und neues Land vor', () => {
    const { ende, state, record } = sprung.find((x) => !x.bankrupt)!;
    const r = managerReport(state, record, balance)!;
    expect(r).not.toBeNull();
    expect(r.flowBefore).toBe(Math.round(roundFlow(ende)));
    expect(r.flowAfter).toBe(Math.round(roundFlow(state)));
    expect(r.fell).toBe(r.flowAfter < r.flowBefore * 0.8);
    const ids = r.ideas.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['refinery', 'harbor', 'land']));
    expect(r.ideas.find((i) => i.id === 'refinery')!.cost).toBe(balance.refinery.buildCost);
    for (const i of r.ideas) {
      expect(i.cost).toBeGreaterThan(0);
      expect(i.affordable).toBe(state.cash >= i.cost);
    }
    expect(r.ideas.find((i) => i.id === 'land')!.count).toBeGreaterThan(0);
  });

  it('schweigt nach Zeitsprung II, bei alten Spielständen ohne Förderung und nach der Pleite', () => {
    const { state, record } = sprung.find((x) => !x.bankrupt)!;
    expect(managerReport(state, { ...record, number: 2 }, balance)).toBeNull();
    const { flow: _weg, ...alt } = record.before;
    expect(managerReport(state, { ...record, before: alt }, balance)).toBeNull();
    expect(managerReport({ ...state, ending: 'pleite' }, record, balance)).toBeNull();
  });

  it('eine laufende oder fertige Raffinerie taucht nicht mehr als Vorschlag auf', () => {
    const { state, record } = sprung.find((x) => !x.bankrupt)!;
    const gebaut = { ...state, refinery: { ...state.refinery!, level: 1 } };
    expect(managerReport(gebaut, record, balance)!.ideas.map((i) => i.id)).not.toContain('refinery');
  });
});
