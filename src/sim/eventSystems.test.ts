// 4.12 Systemwirkungen der Ereignisse: jede Wirkung trifft ihr System, verpufft ohne es,
// wird geprüft (Lesen, Querverweise) und zählt für die Spürbarkeit (check:events).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBalance, type Balance } from './balance';
import { openChapterSystems } from './chapterSystems';
import { settleLoans } from './credit';
import { DIPLO_RIVALS } from './diplomacyBalance';
import { advanceDiplomacy } from './diplomacy';
import { parseEventFiles } from './eventContent';
import {
  applySystemEffects,
  checkSystemEffects,
  newConsequences,
  ownLineRunning,
  parseSystemEffects,
  reputationOf,
  reputationWord,
  RIVAL_TARGETS,
  seatStartGuests,
  settleEventSystems,
  systemImpact,
  validConsequences,
  type SystemEffects,
} from './eventSystems';
import { resolveEvent, timedEffect, type EventDef } from './events';
import { endRound, newGame, type GameState } from './game';
import { convictionChance, heat, pressureChance, traces } from './investigation';
import { planRun, refineryCapacity } from './refinery';
import { validReputation } from './reputation';
import { control } from './stocks';
import { parseStocksContent } from './stocksContent';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { modeCapacity } from './transport';
import { advanceProduction } from './production';
import { chapterEnds } from './timeskipBots';

const balance = loadBalance();
const catalog = loadEvents();
const board = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board;

/** Kapitel 2 mit allen Systemen, als Aktiengesellschaft (30 % verkauft). */
function k2(seed = 'systeme', share = 0.3): GameState {
  const s = { ...newGame(seed, balance, catalog), chapter: 2, ipo: { share, proceeds: 0 }, cash: 50000 };
  return openChapterSystems(s, balance, { stocksBoard: board });
}

function wirk(state: GameState, sys: SystemEffects, source = 'test', label = 'Testereignis'): GameState {
  return applySystemEffects(state, sys, balance, source, label);
}

function sys(raw: Record<string, unknown>): SystemEffects | null {
  return parseSystemEffects(raw, () => {});
}

describe('Ruf (GDD §4)', () => {
  it('ändert die Achsen, bleibt zwischen −100 und 100 und hebt den Branchen-Respekt der Diplomatie', () => {
    const s = k2();
    const respekt = s.diplomacy!.respect;
    const r = wirk(s, { reputation: { public: 30, workers: -150, industryRespect: 5 } });
    expect(reputationOf(r, 'public')).toBe(30);
    expect(reputationOf(r, 'workers')).toBe(-100);
    expect(reputationOf(r, 'politics')).toBe(0);
    expect(r.diplomacy!.respect).toBe(Math.min(100, respekt + 5));
  });

  it('ohne Ruf-Zustand ist jede Achse 0; als Wort von verhasst bis verehrt', () => {
    expect(reputationOf(newGame('x', balance), 'public')).toBe(0);
    expect([-60, -20, 0, 20, 60].map(reputationWord)).toEqual(['verhasst', 'misstrauisch', 'neutral', 'geachtet', 'verehrt']);
  });

  it('Öffentlichkeit sitzt mit auf der Geschworenenbank, Politik hilft beim Druck auf Delaney', () => {
    const s = k2();
    const gut = wirk(s, { reputation: { public: 50, politics: 50 } });
    const schlecht = wirk(s, { reputation: { public: -50, politics: -50 } });
    const mitFall = (x: GameState) => ({ ...x, investigation: { ...x.investigation!, evidence: 50 } });
    expect(convictionChance(mitFall(gut), balance)).toBeLessThan(convictionChance(mitFall(schlecht), balance));
    expect(pressureChance(gut, balance)).toBeGreaterThan(pressureChance(schlecht, balance));
  });

  it('Arbeiter: guter Ruf hebt die eigene Förderung, schlechter senkt sie', () => {
    // Ein Kapitel-1-Ende des Standard-Bots mit fördernden Quellen (seit der verdeckten Geologie bohrt nicht jeder fündig).
    const ende = chapterEnds(balance, 4, catalog).find((e) => e.wells.some((w) => w.status === 'found'))!;
    const s = { ...ende, finished: false, ending: null, chapter: 2 } as GameState;
    expect(s.wells.some((w) => w.status === 'found')).toBe(true);
    const gut = advanceProduction(wirk(s, { reputation: { workers: 100 } }), balance);
    const neutral = advanceProduction(s, balance);
    const schlecht = advanceProduction(wirk(s, { reputation: { workers: -100 } }), balance);
    expect(gut.oilStock).toBeGreaterThan(neutral.oilStock);
    expect(schlecht.oilStock).toBeLessThan(neutral.oilStock);
  });

  it('Furcht hält Rivalen zurück: bei Groll knapp über der Schwelle schlägt niemand zurück', () => {
    const raw = rawBalance() as { diplomacy: { relations: Record<string, number> } };
    raw.diplomacy.relations.revengeChance = 1;
    const rache: Balance = parseBalance(raw);
    const basis = { ...k2('furcht'), cash: 50000 };
    const g = rache.diplomacy.relations.revengeGrudge + 5;
    const mitGroll = { ...basis, diplomacy: { ...basis.diplomacy!, relations: { ...basis.diplomacy!.relations, bullard: { trust: 0, grudge: g } } } };
    const ohneFurcht = advanceDiplomacy(mitGroll, rache);
    const mitFurcht = advanceDiplomacy({ ...mitGroll, reputation: { industryFear: 100 } }, rache);
    expect(ohneFurcht.diplomacy!.aftermath.length).toBeGreaterThan(mitFurcht.diplomacy!.aftermath.length);
  });
});

describe('Rivalen (4.10)', () => {
  it('Vertrauen und Groll; „crane“ trifft vor der Nachfolge beide Erben', () => {
    const s = k2();
    const r = wirk(s, { rival: { bullard: { trust: 10, grudge: 5 }, crane: { trust: -10 } } });
    const d = r.diplomacy!.relations;
    expect(d.bullard.trust).toBe(s.diplomacy!.relations.bullard.trust + 10);
    expect(d.bullard.grudge).toBe(s.diplomacy!.relations.bullard.grudge + 5);
    expect(d.margaret.trust).toBe(s.diplomacy!.relations.margaret.trust - 10);
    expect(d.pruett.trust).toBe(s.diplomacy!.relations.pruett.trust - 10);
  });

  it('nach der Nachfolge trifft „crane“ nur den Sieger', () => {
    const s = k2();
    const nach = { ...s, diplomacy: { ...s.diplomacy!, succession: { ...s.diplomacy!.succession, outcome: 'pruett' as const } } };
    const r = wirk(nach, { rival: { crane: { trust: -10 } } });
    expect(r.diplomacy!.relations.margaret.trust).toBe(nach.diplomacy!.relations.margaret.trust);
    expect(r.diplomacy!.relations.pruett.trust).toBe(nach.diplomacy!.relations.pruett.trust - 10);
  });

  it('Stärke: Bullards Kasse und Pruetts Anteil im Crane-Aufsichtsrat', () => {
    const s = k2();
    const r = wirk(s, { rival: { bullard: { strength: 2 }, pruett: { strength: 1 } } });
    expect(r.rival.cash).toBe(s.rival.cash + 2 * balance.eventSystems.bullardStrength);
    expect(r.diplomacy!.succession.share).toBeCloseTo(s.diplomacy!.succession.share - balance.eventSystems.successionStep, 5);
  });

  it('ohne Diplomatie (Kapitel 1) verpufft Vertrauen', () => {
    const s = newGame('k1', balance);
    expect(wirk(s, { rival: { margaret: { trust: 10 } } }).diplomacy).toBeUndefined();
  });

  it('die Liste der Ziele sind die Rivalen der Diplomatie plus crane', () => {
    expect([...RIVAL_TARGETS]).toEqual([...DIPLO_RIVALS, 'crane']);
  });
});

describe('Schattenbuch und Delaney (4.11)', () => {
  it('Hitze schreibt eine Spur mit dem Titel des Ereignisses, trace eine eigene Beschriftung', () => {
    const s = k2();
    const vorher = heat(s, balance);
    const r = wirk(wirk(s, { heat: 2 }, 'a', 'Der Tote an Turm vier'), { trace: { severity: 3, label: 'Schweigegeld an Silas Brandt' } });
    expect(heat(r, balance)).toBe(vorher + 5);
    const neue = traces(r, balance).filter((t) => t.key === 'ereignis');
    expect(neue.map((t) => t.label)).toEqual(['Der Tote an Turm vier', 'Schweigegeld an Silas Brandt']);
  });

  it('negative Hitze lässt die schwersten offenen Spuren verblassen (nie unter 0)', () => {
    const s = wirk(k2(), { trace: { severity: 3, label: 'x' } });
    const h = heat(s, balance);
    expect(heat(wirk(s, { heat: -2 }), balance)).toBe(h - 2);
    expect(heat(wirk(s, { trace: { severity: -5 } }), balance)).toBe(Math.max(0, h - 5));
  });

  it('Beweise: je Stufe evidenceStep Punkte, zwischen 0 und 100', () => {
    const s = k2();
    expect(wirk(s, { evidence: 2 }).investigation!.evidence).toBe(2 * balance.eventSystems.evidenceStep);
    expect(wirk(s, { evidence: -1 }).investigation!.evidence).toBe(0);
  });
});

describe('Aktien und Aufsichtsrat (4.8)', () => {
  it('Kapitelstart: Vandermeer sitzt im Rat der Aktiengesellschaft, nicht in der Familienfirma', () => {
    expect(k2().stocks!.board.some((m) => m.id === 'vandermeer')).toBe(true);
    expect(k2('familie', 0).stocks!.board).toEqual([]);
    const s = k2();
    expect(seatStartGuests(s, balance).stocks!.board.filter((m) => m.id === 'vandermeer')).toHaveLength(1);
  });

  it('Treue eines Rats ±n (0–100); fehlt der Rat, verpufft es', () => {
    const s = k2();
    const bankier = s.stocks!.board.find((m) => m.id === 'bankier')!;
    const r = wirk(s, { boardLoyalty: { bankier: -10, silas: 15 } });
    expect(r.stocks!.board.find((m) => m.id === 'bankier')!.loyalty).toBe(bankier.loyalty - 10);
    expect(r.stocks!.board.some((m) => m.id === 'silas')).toBe(false);
  });

  it('boardMember holt einen Gast (einmal) oder Thornes Mann in den Rat', () => {
    const s = k2();
    const mitSilas = wirk(wirk(s, { boardMember: 'silas' }), { boardMember: 'silas' });
    expect(mitSilas.stocks!.board.filter((m) => m.id === 'silas')).toEqual([{ id: 'silas', agenda: 'growth', loyalty: balance.eventSystems.boardGuests.silas.loyalty, since: s.round }]);
    const mitThorne = wirk(s, { boardMember: 'thorne' });
    expect(mitThorne.stocks!.board.filter((m) => m.agenda === 'spy')).toHaveLength(1);
  });

  it('Kontrolle: Prozentpunkte der Aktien zwischen Jacob und den Kleinaktionären', () => {
    const s = k2();
    const r = wirk(s, { control: 3 });
    expect(r.stocks!.jacob).toBe(s.stocks!.jacob + 30);
    expect(r.stocks!.float).toBe(s.stocks!.float - 30);
    expect(control(r.stocks!, balance)).toBeGreaterThan(control(s.stocks!, balance));
    expect(wirk(s, { control: -3 }).stocks!.jacob).toBe(s.stocks!.jacob - 30);
  });

  it('Thorne kauft über Strohmänner (+) und verkauft wieder (−)', () => {
    const s = k2();
    const kauft = wirk(s, { rivalStake: { thorne: 5 } });
    expect(kauft.stocks!.blocks.reduce((x, b) => x + b.shares, 0)).toBe(50);
    const verkauft = wirk(kauft, { rivalStake: { thorne: -2 } });
    expect(verkauft.stocks!.blocks.reduce((x, b) => x + b.shares, 0)).toBe(30);
    expect(verkauft.stocks!.float).toBe(s.stocks!.float - 30);
  });

  it('Kurs: Stimmung der Börse ±x; Dividendendruck kostet Treue der Räte, die Dividende wollen', () => {
    const s = k2();
    expect(wirk(s, { sharePrice: -0.05 }).stocks!.sentiment).toBeCloseTo(s.stocks!.sentiment - 0.05, 5);
    const r = wirk(s, { dividendPressure: 1 });
    for (const m of r.stocks!.board) {
      const alt = s.stocks!.board.find((x) => x.id === m.id)!;
      expect(m.loyalty).toBe(m.agenda === 'dividend' ? Math.max(0, alt.loyalty - balance.eventSystems.dividendPressure) : alt.loyalty);
    }
  });

  it('in der Familienfirma verpuffen Kontrolle, Kurs und Rat', () => {
    const s = k2('familie', 0);
    const r = wirk(s, { control: 5, sharePrice: 0.1, boardMember: 'silas', rivalStake: { thorne: 5 } });
    expect(r.stocks).toEqual(s.stocks);
  });
});

describe('Personal (4.9)', () => {
  it('hire stellt den ersten Bewerber der Stelle ein, fire räumt sie, staffLoyalty ändert die Loyalität', () => {
    const s = k2();
    const eingestellt = wirk(s, { hire: 'secretary' });
    const sek = eingestellt.staff!.hired.find((m) => m.role === 'secretary');
    expect(sek).toBeDefined();
    expect(eingestellt.staff!.candidates.some((c) => c.role === 'secretary')).toBe(false);
    const treuer = wirk(eingestellt, { staffLoyalty: { secretary: 10 } });
    expect(treuer.staff!.hired.find((m) => m.role === 'secretary')!.loyalty).toBe(Math.min(100, sek!.loyalty + 10));
    expect(wirk(treuer, { fire: 'secretary' }).staff!.hired.some((m) => m.role === 'secretary')).toBe(false);
  });
});

describe('Raffinerie, Leitungen, Forschung', () => {
  function mitRaffinerie(): GameState {
    const s = k2();
    return { ...s, refinery: { ...s.refinery!, level: 1 }, oilStock: 20000 };
  }

  it('refineryDown legt die Anlage still, refineryOutput ändert die Kapazität befristet', () => {
    const s = mitRaffinerie();
    expect(wirk(s, { refineryDown: 2 }).refinery!.repairLeft).toBe(2);
    const weniger = wirk(s, { refineryOutput: -0.1 });
    expect(refineryCapacity(weniger, balance)).toBe(Math.round(refineryCapacity(s, balance) * 0.9));
    const spaeter = { ...weniger, round: weniger.round + balance.events.timedRounds };
    expect(refineryCapacity(spaeter, balance)).toBe(refineryCapacity({ ...s, round: spaeter.round }, balance));
  });

  it('productYield und productPrice wirken je Produkt in der Abrechnung der Raffinerie', () => {
    const s = mitRaffinerie();
    const basis = planRun(s, balance, 1000);
    const mehrBenzin = planRun(wirk(s, { productYield: { gasoline: 0.5 } }), balance, 1000);
    expect(mehrBenzin.output.gasoline).toBeGreaterThan(basis.output.gasoline);
    const teurer = planRun(wirk(s, { productPrice: { kerosene: 0.1 } }), balance, 1000);
    expect(teurer.prices.kerosene).toBeGreaterThan(basis.prices.kerosene);
  });

  it('ohne Raffinerie verpuffen die Raffinerie-Wirkungen', () => {
    const s = newGame('k1', balance);
    expect(wirk(s, { refineryDown: 2, refineryOutput: 0.1 })).toEqual(s);
  });

  it('pipelineDown legt die kleine Pipeline still; pipelineThroughput ändert den Durchsatz', () => {
    const s = { ...k2(), logistics: { ...k2().logistics, pipeline: 'ready' as const } };
    const still = wirk(s, { pipelineDown: 2 });
    expect(still.logistics.pipeline).toBe('damaged');
    expect(still.logistics.pipelineRounds).toBe(2);
    const mehr = wirk(s, { pipelineThroughput: 0.2 });
    expect(modeCapacity(mehr, balance, 'pipeline')).toBe(Math.round(modeCapacity(s, balance, 'pipeline') * 1.2));
  });

  it('Forschungspunkte; erreicht die Technik ihre Punkte, ist sie fertig', () => {
    const s = k2();
    const t = balance.research.techs.find((x) => x.id === 'thermal_cracking')!;
    expect(wirk(s, { research: { thermal_cracking: 2 } }).research!.progress.thermal_cracking).toBe(2);
    expect(wirk(s, { research: { thermal_cracking: t.points } }).research!.owned.thermal_cracking).toBe('eigen');
    expect(wirk(s, { research: { thermal_cracking: -3 } }).research!.progress.thermal_cracking).toBe(0);
  });
});

describe('Welt, Gesetze, Kredit, Termine, Erben', () => {
  it('Stimmung und Spannung im Weltmodell, Druck auf ein Gesetz', () => {
    const s = k2();
    const r = wirk(s, { mood: 5, tension: -200, lawPressure: { income_tax: 2 } });
    expect(r.worldModel.mood).toBe(Math.min(100, s.worldModel.mood + 5));
    expect(r.worldModel.tension).toBe(0);
    expect(r.worldModel.laws.bills.income_tax.pressure).toBe((s.worldModel.laws.bills.income_tax?.pressure ?? 0) + 2 * balance.eventSystems.lawPressureStep);
  });

  it('Rating: dauerhaft eine Stufe besser oder schlechter (gilt bei der nächsten Abrechnung)', () => {
    const s = k2();
    const besser = settleLoans(wirk(s, { rating: 1 }), balance);
    const schlechter = settleLoans(wirk(s, { rating: -1 }), balance);
    const normal = settleLoans(s, balance);
    const RATINGS = ['A', 'B', 'C', 'D'];
    expect(RATINGS.indexOf(besser.rating)).toBe(RATINGS.indexOf(normal.rating) - 1);
    expect(RATINGS.indexOf(schlechter.rating)).toBe(Math.min(3, RATINGS.indexOf(normal.rating) + 1));
  });

  it('loan: die Bank leiht den Betrag zum üblichen Zins', () => {
    const s = k2();
    const r = wirk(s, { loan: 40000 });
    expect(r.cash).toBe(s.cash + 40000);
    expect(r.loans.at(-1)).toMatchObject({ source: 'bank', principal: 40000 });
  });

  it('Durchleitungsgebühr: jede Runde in die Kasse, solange eine eigene Leitung läuft', () => {
    const s = wirk(k2(), { transportFee: 300 });
    expect(s.consequences!.transportFee).toBe(300);
    expect(settleEventSystems(s).cash).toBe(s.cash);
    const mitLeitung = { ...s, logistics: { ...s.logistics, pipeline: 'ready' as const } };
    expect(ownLineRunning(mitLeitung)).toBe(true);
    expect(settleEventSystems(mitLeitung).cash).toBe(s.cash + 300);
    expect(wirk(s, { transportFee: -500 }).consequences!.transportFee).toBe(0);
  });

  it('appointmentsNext: Termine der nächsten Runde, danach wieder normal', () => {
    const s = wirk(k2(), { appointmentsNext: 1 });
    const n = settleEventSystems(s);
    expect(n.agenda.budget).toBe(s.agenda.budget + 1);
    expect(n.consequences!.appointmentsNext).toBe(0);
  });

  it('Werte der Erben summieren sich und bleiben innerhalb heirMax', () => {
    const s = wirk(wirk(k2(), { heirValues: { thomas: { loyalty: 2, moral: -1 } } }), { heirValues: { thomas: { loyalty: 20 } } });
    expect(s.consequences!.heirValues.thomas).toEqual({ business: 0, moral: -1, loyalty: balance.eventSystems.heirMax, ambition: 0 });
  });

  it('Folgen und Ruf im Spielstand werden geprüft', () => {
    expect(validConsequences(undefined)).toBe(true);
    expect(validConsequences(newConsequences())).toBe(true);
    expect(validConsequences({ ...newConsequences(), transportFee: 'viel' })).toBe(false);
    expect(validReputation({ public: 5 })).toBe(true);
    expect(validReputation({ beliebt: 5 })).toBe(false);
  });
});

describe('Lesen und Prüfen', () => {
  it('liest gültige Wirkungen und meldet unbekannte Einträge', () => {
    expect(sys({ reputation: { workers: 3 }, rival: { crane: { trust: -10 } }, trace: { severity: 2, label: 'Moss-Zaun' } })).toEqual({
      reputation: { workers: 3 },
      rival: { crane: { trust: -10 } },
      trace: { severity: 2, label: 'Moss-Zaun' },
    });
    const fehler: string[] = [];
    parseSystemEffects({ reputation: { beliebt: 3 }, rival: { crane: { aggression: 3 } }, hire: 'koch', trace: { severity: 9 }, refineryDown: 1.5 }, (_k, t) => fehler.push(t));
    expect(fehler).toHaveLength(5);
  });

  it('Systemwirkungen stehen in YAML unter effects und landen in choice.system', () => {
    const text = `- id: probe\n  title: { de: Probe, en: "" }\n  text: { de: Text, en: "" }\n  chance: 0.1\n  choices:\n    - id: a\n      label: { de: A, en: "" }\n      result: { de: R, en: "" }\n      effects: { cash: -100, reputation: { public: 5 }, boardLoyalty: { bankier: -5 } }\n`;
    const { events, errors } = parseEventFiles([{ file: 'probe.yaml', text }]);
    expect(errors).toEqual([]);
    expect(events[0].choices[0].effects).toEqual({ cash: -100 });
    expect(events[0].choices[0].system).toEqual({ reputation: { public: 5 }, boardLoyalty: { bankier: -5 } });
  });

  it('Querverweise: unbekannter Rat, Gesetz oder Technik ist ein Fehler', () => {
    const ev = [{ id: 'e', choices: [{ id: 'a', system: { boardLoyalty: { niemand: 1 }, lawPressure: { transportpflicht: 1 }, research: { zeitmaschine: 1 } } }] }];
    expect(checkSystemEffects('f', ev, { boardIds: ['bankier'], laws: [{ id: 'income_tax' }], techs: ['rotary'] })).toHaveLength(3);
  });

  it('alle Systemwirkungen der echten Ereignisse verweisen auf Vorhandenes', () => {
    const raete = [...board.map((b) => b.id), ...Object.keys(balance.eventSystems.boardGuests)];
    expect(checkSystemEffects('content/events', catalog, { boardIds: raete, laws: balance.laws, techs: balance.research.techs.map((t) => t.id) })).toEqual([]);
  });

  it('Spürbarkeit: Punkte × eventSystems.relevance in $', () => {
    const w = balance.eventSystems.relevance;
    expect(systemImpact({ reputation: { public: 5, workers: -3 } }, balance)).toBe(8 * w.reputation);
    expect(systemImpact(undefined, balance)).toBe(0);
  });

  it('in den Kapitel-2-Ereignissen steht kein „# TODO-Effekt“ und keine „# TODO-Bedingung“ mehr an einer Wahl', () => {
    const dir = new URL('../../content/events/', import.meta.url);
    for (const f of ['k2-alltag-1-raffinerie', 'k2-alltag-2-pipeline', 'k2-alltag-3-aktien-personal', 'k2-alltag-4-rivalen', 'k2-alltag-5-menschen', 'k2-story-1-nora', 'k2-story-2-silas', 'k2-story-3-ruth']) {
      const text = readFileSync(new URL(`${f}.yaml`, dir), 'utf8');
      expect(text.split('\n').filter((l) => /^\s+#\s*TODO-(Effekt|Bedingung)/.test(l))).toEqual([]);
    }
  });
});

describe('im Spiel', () => {
  it('eine Antwort mit Systemwirkung wirkt über resolveEvent (Silas bekommt den Ratssitz)', () => {
    const ev = catalog.find((e) => e.id === 'k2_silas_rat') as EventDef;
    let s = k2('silasrat');
    s = { ...s, events: { ...s.events, pending: [...s.events.pending, ev.id] } };
    const r = resolveEvent(s, balance, catalog, ev.id, 'sitz');
    if (!r.ok) throw new Error(r.reason);
    const silas = r.state.stocks!.board.find((m) => m.id === 'silas');
    expect(silas?.loyalty).toBe(balance.eventSystems.boardGuests.silas.loyalty + 15);
    expect(reputationOf(r.state, 'workers')).toBe(3);
  });

  it('die Standard-Antwort am Rundenende wirkt auch (autoResolve mit Spielzahlen)', () => {
    const ev = catalog.find((e) => e.id === 'k2_silas_rat') as EventDef;
    let s = k2('silasrat2');
    s = { ...s, events: { ...s.events, pending: [...s.events.pending, ev.id], due: { ...s.events.due, [ev.id]: s.round } } };
    const vand = s.stocks!.board.find((m) => m.id === 'vandermeer')!.loyalty;
    const n = endRound(s, balance, catalog);
    // Standard: Trupps statt Sitz – Vandermeer +10 (danach rechnet der Rat die Runde ab: ±gain/loss).
    const nachher = n.stocks!.board.find((m) => m.id === 'vandermeer')!.loyalty;
    expect(Math.abs(nachher - (vand + 10))).toBeLessThanOrEqual(Math.max(balance.stocks.board.gain, balance.stocks.board.loss) + balance.stocks.thorne.pressure * 3);
  });

  it('befristete Systemwirkungen laufen nach events.timedRounds aus', () => {
    const s = wirk(k2(), { pipelineThroughput: 0.2 }, 'quelle');
    expect(timedEffect(s, 'pipelineThroughput')).toBe(0.2);
    expect(timedEffect({ ...s, round: s.round + balance.events.timedRounds }, 'pipelineThroughput')).toBe(0);
  });
});
