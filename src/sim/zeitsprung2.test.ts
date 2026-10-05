// 4.19 Zeitsprung II (Jahr 15–20, GDD §13): vom Ende von Kapitel 2 in Kapitel 3 „Der Konzernherr“.
// Weichen (Kriegsgefahr, Marine, Grady, College), Firmenübergabe (Baustellen, Anleihen), Chronik,
// Kapitel-3-Start mit allen Systemen und den Rivalen K3.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hallsteadUnlocked } from './hallsteadState';
import { decideIpo } from './chapter';
import type { GameState } from './game';
import { producingWells } from './production';
import { deserializeGame, serializeGame } from './save';
import { parseStocksContent } from './stocksContent';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { chapterEnds } from './timeskipBots';
import {
  answerSwitch,
  chapterRounds,
  chapterUnderConstruction,
  gameYear,
  jacobAge,
  JUMP_SWITCHES,
  jumpNumber,
  parseTimeskipContent,
  runTimeskip,
  startTimeskip,
  SWITCH_CHOICES,
  switchCost,
  timeskipBlocked,
  TIMESKIP_MARKS,
  type SwitchId,
  type TimeskipRecord,
} from './timeskip';
import type { Balance } from './balance';

const balance = loadBalance();
const catalog = loadEvents();
const TEXTE = {
  stocksBoard: parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board,
};

type Antworten = (id: SwitchId) => string;
const ERSTE: Antworten = (id) => SWITCH_CHOICES[id][0];
const ZWEITE: Antworten = (id) => SWITCH_CHOICES[id][1];

function springen(s0: GameState, antworten: Antworten = ERSTE, b: Balance = balance): { state: GameState; record: TimeskipRecord } {
  const start = startTimeskip(s0, b, { stance: 'balanced', family: 'some' });
  if (!start.ok) throw new Error(start.reason);
  let s = start.state;
  for (let i = 0; i < 12; i++) {
    const step = runTimeskip(s, b, catalog, TEXTE);
    if (step.status === 'done') return { state: step.state, record: step.record };
    let a = answerSwitch(s, b, step.id, antworten(step.id), catalog, TEXTE);
    if (!a.ok) a = answerSwitch(s, b, step.id, SWITCH_CHOICES[step.id].find((c) => c !== antworten(step.id))!, catalog, TEXTE);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('Zu viele Weichen.');
}

/** Kapitel-1-Enden des Standard-Bots, die den Sprung I überstehen, als Kapitel 2. */
const KAPITEL2: GameState[] = chapterEnds(balance, 6, catalog)
  .map((e) => {
    const ipo = decideIpo(e, balance, 0);
    return springen(ipo.ok ? ipo.state : e, ZWEITE).state;
  })
  .filter((s) => !s.finished)
  // Die Firma mit den meisten fördernden Quellen zuerst: Ohne eigenes Öl trägt seit 0.4.19+2 kein Marinevertrag mehr durch den Sprung.
  .sort((a, b) => producingWells(b).length - producingWells(a).length);

/** Ein Kapitel 2, das gerade zu Ende ist (ohne eigene Züge: letzte Runde, Prüfung im Protokoll). */
function kapitel2Ende(nr = 0, patch: Partial<GameState> = {}): GameState {
  const s = KAPITEL2[nr];
  // Was am Kapitelbeginn auf dem Tisch lag, hat Jacob in vier Jahren beantwortet.
  const events = { ...s.events, seen: [...s.events.seen, ...s.events.pending], pending: [] };
  return { ...s, events, round: s.totalRounds, finished: true, ending: 'kapitel', ...patch };
}

describe('Zeitsprung II: Start', () => {
  it('geht am Ende von Kapitel 2; nach Kapitel 3 endet der Early-Access-Umfang', () => {
    expect(KAPITEL2.length).toBeGreaterThan(1);
    const ende = kapitel2Ende();
    expect(jumpNumber(ende)).toBe(2);
    expect(timeskipBlocked(ende, balance)).toBeUndefined();
    expect(timeskipBlocked({ ...ende, finished: false, ending: null }, balance)).toMatch(/Ende des Kapitels/);
    expect(timeskipBlocked({ ...ende, ending: 'abgesetzt' }, balance)).toMatch(/Ende des Kapitels/);
    expect(timeskipBlocked({ ...ende, chapter: 3 }, balance)).toMatch(/Kapitel 4/);
    expect(chapterUnderConstruction({ chapter: 3 })).toBe(false);
    expect(chapterUnderConstruction({ chapter: 4 })).toBe(true);
  });

  it('Weichen kosten: Gradys Einlage und das College; Krieg und Marine nichts', () => {
    const t2 = balance.timeskip.second;
    expect(switchCost(balance, 'grady', 'take')).toBe(t2.gradyCost);
    expect(switchCost(balance, 'grady', 'refuse')).toBe(0);
    expect(switchCost(balance, 'college', 'college')).toBe(t2.collegeCost);
    expect(switchCost(balance, 'war_export', 'export')).toBe(0);
    expect(switchCost(balance, 'navy', 'accept')).toBe(0);
  });

  it('Texte für alle Weichen von Zeitsprung II, Chronik und Kapitel 3 stehen in content/timeskip.yaml', () => {
    const c = parseTimeskipContent('content/timeskip.yaml', readFileSync(new URL('../../content/timeskip.yaml', import.meta.url), 'utf8'));
    expect(c.errors).toEqual([]);
    for (const id of JUMP_SWITCHES[2]) for (const choice of SWITCH_CHOICES[id]) expect(c.content!.switches[id].choices[choice].de).not.toBe('');
    expect(c.content!.start2.title.de).toMatch(/Kapitel 3/);
    expect(c.content!.chapter3.text.de).toMatch(/Marke/);
  });
});

describe('Zeitsprung II: Ablauf und Kapitel 3', () => {
  const ende = kapitel2Ende();
  const { state: k3, record } = springen(ende);

  it('Jahr 15–20, danach Kapitel 3 in Jahr 21 mit 16 Runden, Jacob 45', () => {
    expect(record.number).toBe(2);
    expect(record.fromYear).toBe(15);
    expect(record.toYear).toBe(20);
    expect(k3.chapter).toBe(3);
    expect(gameYear(k3.round)).toBe(21);
    expect(chapterRounds(k3)).toBe(16);
    expect(jacobAge(k3)).toBe(45);
    expect(k3.finished).toBe(false);
    expect(k3.ending).toBeNull();
    expect(k3.timeskips).toHaveLength(2);
    expect(k3.log.some((z) => /Kapitel 3 „Der Konzernherr“ beginnt – Jacob ist 45/.test(z))).toBe(true);
  });

  it('nur Weichen von Zeitsprung II; die Marine kommt, wenn Harlan Oil fördert, das College, wenn Thomas lebt', () => {
    for (const id of record.switches) expect(JUMP_SWITCHES[2]).toContain(id);
    if (producingWells(ende).length > 0) expect(record.switches).toContain('navy');
    if (ende.family.thomasBorn > 0) expect(record.switches).toContain('college');
  });

  it('ohne eigene Quelle weder Marinevertrag noch Kriegsexport – und keine Einnahme daraus (0.4.19+2)', () => {
    // Ein Verwalter, der nicht bohrt (kein Geld dafür), und eine Firma ohne Quelle.
    const null0 = (r: Record<string, number>) => Object.fromEntries(Object.keys(r).map((k) => [k, 0]));
    const t = balance.timeskip;
    const b: Balance = { ...balance, timeskip: { ...t, invest: null0(t.invest) as typeof t.invest, borrow: null0(t.borrow) as typeof t.borrow } };
    const leer = kapitel2Ende(0, { wells: [] });
    const { state, record: r } = springen(leer, ERSTE, b);
    expect(producingWells(state)).toHaveLength(0);
    expect(r.switches).not.toContain('navy');
    expect(r.switches).not.toContain('war_export');
    expect(state.events.marks[TIMESKIP_MARKS.navy]).toBeUndefined();
    // Die Marine zahlt je Barrel, nicht pauschal: Mit Prämie 0 ändert sich bei einer Firma ohne Öl nichts.
    const ohnePraemie: Balance = { ...b, timeskip: { ...b.timeskip, second: { ...b.timeskip.second, navyPremium: 0 } } };
    expect(springen(leer, ERSTE, ohnePraemie).state.cash).toBe(state.cash);
  });

  it('Merkzeichen der Antworten: Marinevertrag, College; das Spiel liest sie in Kapitel 3', () => {
    if (record.switches.includes('navy')) expect(k3.events.marks[TIMESKIP_MARKS.navy]).toBeDefined();
    if (record.switches.includes('college')) expect(k3.events.marks[TIMESKIP_MARKS.college]).toBeDefined();
    const ohne = springen(ende, ZWEITE).state;
    expect(ohne.events.marks[TIMESKIP_MARKS.navy]).toBeUndefined();
    if (record.switches.includes('college')) expect(ohne.events.marks[TIMESKIP_MARKS.noCollege]).toBeDefined();
  });

  it('alle Kapitel-3-Systeme sind ab der ersten Runde offen: Marke, Börse, Hallstead, Seismik/Konsortium, Rivalen', () => {
    expect(k3.brand).toBeDefined();
    expect(k3.exchange).toBeDefined();
    expect(k3.kapitel3).toBeDefined();
    expect(hallsteadUnlocked(k3, balance)).toBe(true);
    expect(k3.rivalsK3?.bullardDebt).toBe(balance.rivalsK3.bullard.startDebt);
    // Die Kapitel-2-Systeme bleiben.
    expect(k3.refinery).toBeDefined();
    expect(k3.stocks).toBeDefined();
    expect(k3.diplomacy).toBeDefined();
    // Ereignisse aus Kapitel 3 liegen auf dem Tisch, keine aus Kapitel 2.
    expect(k3.events.pending.length).toBeGreaterThan(0);
    expect(k3.events.pending.every((id) => !id.startsWith('k2_'))).toBe(true);
  });

  it('gleiche Entscheidungen → genau dieselbe Welt; Speichern und Laden über den Kapitelwechsel', () => {
    expect(springen(ende).state).toEqual(k3);
    const r = deserializeGame(serializeGame(k3, '0.4.19'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(k3);
  });

  it('Sprung I bleibt Sprung I: andere Weichen, Kapitel 2 danach', () => {
    const k2 = KAPITEL2[0];
    expect(k2.chapter).toBe(2);
    expect(k2.timeskips[0].number).toBe(1);
    for (const id of k2.timeskips[0].switches) expect(JUMP_SWITCHES[1]).toContain(id);
  });
});

describe('Zeitsprung II: Weichen nach dem Zustand der Welt', () => {
  it('Kriegsgefahr kommt nur bei hoher Außenspannung; Export bringt mehr, kostet manchmal einen Tanker', () => {
    const ende = kapitel2Ende();
    const ruhig = springen({ ...ende, worldModel: { ...ende.worldModel, tension: 0 } }, ERSTE, { ...balance, timeskip: { ...balance.timeskip, second: { ...balance.timeskip.second, warTension: 101 } } });
    expect(ruhig.record.switches).not.toContain('war_export');
    const b: Balance = { ...balance, timeskip: { ...balance.timeskip, second: { ...balance.timeskip.second, warTension: 0, warLossChance: 1 } } };
    const export_ = springen(ende, ERSTE, b);
    expect(export_.record.switches).toContain('war_export');
    expect(export_.state.events.marks[TIMESKIP_MARKS.warExport]).toBeDefined();
    expect(export_.record.entries.some((e) => e.kind === 'war_tanker')).toBe(true);
    const daheim = springen(ende, (id) => (id === 'war_export' ? 'hold' : ERSTE(id)), b);
    expect(daheim.state.events.marks[TIMESKIP_MARKS.warExport]).toBeUndefined();
    expect(daheim.record.entries.some((e) => e.kind === 'war_tanker')).toBe(false);
  });

  it('Grady: Einsteigen kostet, zahlt je Quartal und hinterlässt eine Spur „Reserveland“; Ablehnen setzt zs2_grady_abgelehnt', () => {
    const b: Balance = { ...balance, timeskip: { ...balance.timeskip, second: { ...balance.timeskip.second, gradyChance: 1 } } };
    const ende = kapitel2Ende(0, { cash: 200000 });
    const ja = springen(ende, ERSTE, b);
    expect(ja.record.switches).toContain('grady');
    expect(ja.state.events.marks[TIMESKIP_MARKS.grady]).toBeDefined();
    expect(ja.state.investigation?.extra.some((x) => x.label === 'Reserveland' && x.severity === balance.timeskip.second.gradyTrace)).toBe(true);
    const nein = springen(ende, (id) => (id === 'grady' ? 'refuse' : ERSTE(id)), b);
    expect(nein.state.events.marks[TIMESKIP_MARKS.gradyRefused]).toBeDefined();
    expect(nein.state.events.marks[TIMESKIP_MARKS.grady]).toBeUndefined();
    // Die Einlage verzinst sich über die Jahre: Wer einsteigt, hat am Ende mehr in der Kasse.
    expect(ja.state.cash).toBeGreaterThan(nein.state.cash);
  });

  it('College macht Thomas zufriedener und prägt den Erben anders als „gleich in die Firma“', () => {
    const ende = kapitel2Ende();
    if (ende.family.thomasBorn === 0) return;
    const college = springen(ende, ERSTE).state;
    const firma = springen(ende, (id) => (id === 'college' ? 'company' : ERSTE(id))).state;
    expect(college.family.thomas).toBeGreaterThan(firma.family.thomas);
    expect(college.consequences?.heirValues.thomas?.moral).toBeGreaterThan(firma.consequences?.heirValues.thomas?.moral ?? 0);
    expect(firma.consequences?.heirValues.thomas?.business).toBeGreaterThan(college.consequences?.heirValues.thomas?.business ?? 0);
  });

  it('der Verwalter bringt Baustellen zu Ende und löst Anleihen durch einen Bankkredit ab', () => {
    const ende = kapitel2Ende();
    const mitBau: GameState = {
      ...ende,
      refinery: { ...ende.refinery!, level: 0, project: 'build', projectLeft: 3 },
      stocks: { ...ende.stocks!, bonds: [{ id: 1, principal: 30000, rate: 0.06, issued: ende.round - 2, maturity: ende.round + 10 }] },
    };
    const { state, record } = springen(mitBau);
    expect(state.refinery!.level).toBeGreaterThanOrEqual(1);
    expect(state.refinery!.project).toBeNull();
    expect(state.stocks!.bonds).toEqual([]);
    expect(record.entries.some((e) => e.kind === 'projects_finished')).toBe(true);
    expect(record.entries.find((e) => e.kind === 'bonds_refinanced')?.amount).toBe(30000);
  });

  it('eine eigene Raffinerie bringt im Sprung mehr ein als keine', () => {
    const ende = kapitel2Ende();
    const ohne = springen({ ...ende, refinery: { ...ende.refinery!, level: 0, project: null } }).state;
    const mit = springen({ ...ende, refinery: { ...ende.refinery!, level: 2, project: null } }).state;
    expect(mit.cash).toBeGreaterThan(ohne.cash);
  });
});
