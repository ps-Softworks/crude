// Wirkung der Ereignis-Antworten (0.2.15+3): Welche Antworten sind spürbar?
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventChoice, EventDef } from './events';
import {
  analyzeRelevance,
  checkRelevanceMarks,
  immediateImpact,
  immediateValue,
  lastingValue,
  parseRelevanceContent,
  readMarks,
  relevanceThreshold,
  simReadMarks,
} from './eventRelevance';
import { loadBalance } from './testBalance';
import { loadEvents, loadLaterMarks, loadReadMarks } from './testEvents';

const balance = loadBalance();
const T = relevanceThreshold(balance);

function wahl(id: string, effects: EventChoice['effects'] = {}, marks: string[] = []): EventChoice {
  return { id, label: { de: id, en: '' }, result: { de: id, en: '' }, requires: {}, effects, default: false, marks };
}

function ereignis(id: string, choices: EventChoice[], extra: Partial<EventDef> = {}): EventDef {
  return {
    id,
    title: { de: id, en: '' },
    text: { de: id, en: '' },
    conditions: {},
    chance: 0.1,
    once: true,
    marked: [],
    notMarked: [],
    delay: 1,
    routine: false,
    appointments: 1,
    choices,
    ...extra,
  };
}

function urteil(events: EventDef[], read = readMarks(events, []), later = new Set<string>()) {
  const r = analyzeRelevance(events, read, balance, later);
  return Object.fromEntries(r.choices.map((c) => [`${c.event}/${c.choice}`, c.verdict]));
}

describe('Wirkung der Antworten (0.2.15+3)', () => {
  it('Schwelle = minShare × chapterMoney aus balance.yaml (2 % von 10.000 $ = 200 $)', () => {
    expect(T).toBe(Math.round(balance.events.relevance.chapterMoney * balance.events.relevance.minShare));
    expect(T).toBe(200);
  });

  it('sofortige Wirkung: Geld, Öl zum Trendpreis, Kraft und Familie mit den Gewichten des Standard-Bots; Beträge zählen', () => {
    const w = balance.bots.events.balanced;
    const c = wahl('x', { cash: -100, oilStock: 50, strength: 4, ruth: -3 });
    expect(immediateValue(c, balance)).toBeCloseTo(-100 + 50 * balance.market.basePrice + 4 * w.strength - 3 * w.family, 6);
    expect(immediateImpact(c, balance)).toBeCloseTo(100 + 50 * balance.market.basePrice + 4 * w.strength + 3 * w.family, 6);
  });

  it('dauerhafte Wirkung: Tarif, Preis, Förderung, Pacht und Fuhrwerke in $', () => {
    const r = balance.events.relevance;
    expect(lastingValue(wahl('t', { railTariff: -0.01 }), balance)).toBeCloseTo(0.01 * r.refBarrels * Math.ceil(balance.start.rounds / 2), 6);
    expect(lastingValue(wahl('p', { price: 0.02 }), balance)).toBeCloseTo(0.02 * r.refBarrels * balance.events.timedRounds, 6);
    expect(lastingValue(wahl('l', { leaseCost: -0.2 }), balance)).toBeCloseTo(0.2 * r.refLeaseSpend, 6);
    expect(lastingValue(wahl('g', { teams: -1 }), balance)).toBe(balance.transport.teams.hireCost);
    expect(lastingValue(wahl('x', { cash: 1000 }), balance)).toBe(0);
  });

  it('stark: genug Wirkung, dauerhafte Wirkung oder ein Merkzeichen mit Folge', () => {
    const folge = ereignis('folge', [wahl('a')], { marked: ['gelesen'] });
    const v = urteil([
      ereignis('e', [wahl('geld', { cash: -T }), wahl('preis', { price: 0.02 }), wahl('mark', {}, ['gelesen'])]),
      folge,
    ]);
    expect(v['e/geld']).toBe('stark');
    expect(v['e/preis']).toBe('stark');
    expect(v['e/mark']).toBe('stark');
  });

  it('eine einzelne schwache Antwort neben einer starken ist das Gegenstück; zwei schwache oder nur schwache sind SCHWACH', () => {
    const v = urteil([
      ereignis('eins', [wahl('stark', { cash: -300 }), wahl('nichts')]),
      ereignis('zwei', [wahl('stark', { cash: -300 }), wahl('wenig', { cash: -50 }), wahl('nichts')]),
      ereignis('keins', [wahl('wenig', { strength: -3 }), wahl('nichts')]),
    ]);
    expect(v['eins/nichts']).toBe('gegenstueck');
    expect(v['zwei/wenig']).toBe('schwach');
    expect(v['zwei/nichts']).toBe('schwach');
    expect(v['keins/wenig']).toBe('schwach');
  });

  it('Merkzeichen ohne Abfrage sind folgenlos – außer sie stehen als späteres Kapitel in den Ausnahmen', () => {
    const events = [ereignis('e', [wahl('a', { cash: -500 }, ['tot']), wahl('b', { cash: -500 }, ['spaeter'])])];
    const r = analyzeRelevance(events, readMarks(events, []), balance, new Set(['spaeter']));
    expect(r.weak.map((c) => c.choice)).toEqual(['a']);
    expect(r.choices.find((c) => c.choice === 'b')!.laterMarks).toEqual(['spaeter']);
  });

  it('ein Ausnahme-Merkzeichen allein macht eine Antwort nicht stark', () => {
    const v = urteil([ereignis('e', [wahl('a', {}, ['spaeter']), wahl('b')])], undefined, new Set(['spaeter']));
    expect(v['e/a']).toBe('schwach');
  });

  it('feste Termine werden aufgelistet, aber nicht bewertet', () => {
    const v = urteil([ereignis('t', [wahl('gehen', { strength: 1 })], { routine: true })]);
    expect(v['t/gehen']).toBe('termin');
  });

  it('die Simulation liest die Merkzeichen der Rivalen und der Wegerechte', () => {
    const m = simReadMarks(balance);
    expect(m).toContain('crane_abschlag');
    expect(m).toContain('wegerecht_moss');
  });

  it('content/relevance.yaml: jede Ausnahme hat einen Grund, und jedes Merkzeichen setzt eine Wahl', () => {
    const text = readFileSync(new URL('../../content/relevance.yaml', import.meta.url), 'utf8');
    const { content, errors } = parseRelevanceContent('content/relevance.yaml', text);
    expect(errors).toEqual([]);
    expect(content!.later.length).toBeGreaterThan(0);
    expect(checkRelevanceMarks('content/relevance.yaml', content!, loadEvents())).toEqual([]);
    expect(parseRelevanceContent('x', 'later:\n  - { mark: Falsch }').errors).toHaveLength(1);
  });

  it('echte Inhalte: keine schwache Antwort mehr (Philipps Rückmeldung: Entscheidungen sollen spürbar sein)', () => {
    const events = loadEvents();
    const r = analyzeRelevance(events, loadReadMarks(events, balance), balance, loadLaterMarks());
    expect(r.weak.map((c) => `${c.event}/${c.choice}`)).toEqual([]);
  });
});

describe('Nachwirkungen früher folgenloser Merkzeichen (0.2.15+3)', () => {
  const events = loadEvents();
  const ev = (id: string) => events.find((e) => e.id === id)!;

  it('Schutz vor Dieben: Sheriff, eigener Nachtwächter oder Eli als Wächter', () => {
    expect(ev('diebe_tank').notMarked).toEqual(expect.arrayContaining(['sheriff_bezahlt', 'sheriff_umgangen', 'eli_waechter']));
  });

  it('Bullard sägt kein Seil an, wenn Jacob beim Brand geholfen hat oder den Drohzettel hat', () => {
    expect(ev('bullard_seil').notMarked).toEqual(expect.arrayContaining(['brand_geholfen', 'drohung_aufgehoben', 'drohung_sheriff']));
  });

  it('Trupp: gedeckt → kein Streik, Sonntag gegeben → keine Lohnforderung, Crabb entlassen → kein Sonntagsstreit, Kerrigan im Lager → kein Diebstahl', () => {
    expect(ev('streik').notMarked).toContain('trupp_gedeckt');
    expect(ev('trupp_lohn').notMarked).toContain('trupp_sonntag');
    expect(ev('trupp_sonntag').notMarked).toContain('crabb_entlassen');
    expect(ev('crabb_lager').notMarked).toContain('kerrigan_lager');
  });

  it('Folgeereignisse: Bullards Rache, Kerrigans Zusammenbruch, Moss nach der Entschuldigung', () => {
    expect(ev('bullard_rache_folge').marked).toEqual(['bullard_rache']);
    expect(ev('kerrigan_zusammenbruch').marked).toEqual(['kerrigan_verheizt']);
    expect(ev('wegerecht_moss_versoehnt').marked).toEqual(['pipeline_geplant', 'daniel_entschuldigung']);
    expect(ev('wegerecht_moss_feind').notMarked).toContain('daniel_entschuldigung');
  });

  it('Bohlenweg: Wer ihn baut, bleibt nicht mehr im Schlamm stecken', () => {
    expect(ev('fuhre_schlamm').notMarked).toContain('bohlenweg');
    expect(ev('fuhre_schlamm').choices.find((c) => c.id === 'bohlen')!.marks).toEqual(['bohlenweg']);
  });
});
