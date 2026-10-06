// 4.2 Parteien, Stimmung, Wahlen (GDD §7.1, §10): Jacobs öffentliches Handeln
// verschiebt Stimmung und Parteien, Wahlen bringen ein Ergebnis aus dem
// Weltzustand, die Zeitung berichtet. Fertig-Kriterium: Preiskampf und Feldbrand
// verschieben die Stimmung messbar (Preiskampf über recordAct; in Kapitel 1 gibt es
// keinen echten, dort steht Jacob mit den Unabhängigen gegen den Trust).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Balance, WorldModelBalance } from './balance';
import { parseBalance } from './balance';
import { parseEventFile } from './eventContent';
import { resolveEvent } from './events';
import { endRound, newGame, type GameState } from './game';
import { settleStorage } from './logistics';
import { makeNewspaper, newsItems, parseNewspaperContent } from './newspaper';
import {
  ACT_PRIORITY,
  electionReport,
  loudestAct,
  parsePoliticsContent,
  pollIsClose,
  pollLeader,
  recordAct,
  roundedPercents,
} from './politics';
import { deserializeGame, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { actsInput, advanceWorld, isWorldState, leadingParty, newWorld, PARTIES, PUBLIC_ACTS, skipWorld, type Party, type WorldState } from './world';
import { worldHeadline } from './worldNews';

const balance = loadBalance();
const wb = balance.worldModel;
const catalog = loadEvents();
const politik = parsePoliticsContent('content/politics.yaml', readFileSync(new URL('../../content/politics.yaml', import.meta.url), 'utf8')).content!;
const zeitung = parseNewspaperContent('content/newspaper.yaml', readFileSync(new URL('../../content/newspaper.yaml', import.meta.url), 'utf8')).content!;

/** Neue Partie ohne Zufallsereignisse, mit einem Ereignis aus content/events auf dem Tisch. */
function mitEreignis(seed: string, eventId: string, extra: Partial<GameState> = {}): GameState {
  const g = { ...newGame(seed, balance), ...extra };
  return { ...g, events: { ...g.events, pending: [eventId] } };
}

function antworten(state: GameState, eventId: string, choiceId: string): GameState {
  const r = resolveEvent(state, balance, catalog, eventId, choiceId);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Welt mit fester Regierung (für die Strenge des Programms). */
function regiert(world: WorldState, government: Party): WorldState {
  return { ...world, government };
}

describe('Fertig-Kriterium 4.2: Jacobs Handeln verschiebt die Stimmung messbar', () => {
  // Spielspaß K1 (Weichen statt Alltagspost): „Feuer am Salt Hill“ ist gestrichen – der Feldbrand kommt weiter von selbst
  // (Tankbrand), darum hier direkt über recordAct.
  it('Feldbrand drückt die Stimmung, Volksbund gewinnt Anteil, Handelspartei verliert', () => {
    for (const seed of ['brand-1', 'brand-2', 'brand-3']) {
      const start = newGame(seed, balance);
      const brand = endRound(recordAct(start, 'field_fire'), balance);
      const ruhig = endRound(start, balance);
      const erwartet = actsInput(['field_fire'], start.worldModel.government, wb).moodKick!;
      expect(erwartet).toBeLessThan(-1);
      expect(brand.worldModel.mood - ruhig.worldModel.mood).toBeCloseTo(erwartet, 9);
      expect(brand.worldModel.parties.volksbund).toBeGreaterThan(ruhig.worldModel.parties.volksbund);
      expect(brand.worldModel.parties.handel).toBeLessThan(ruhig.worldModel.parties.handel);
    }
  });

  it('Front gegen den Trust (crane_abschlag: Delgados Verband) ist beliebt und stärkt Provinzliga und Volksbund', () => {
    const start = mitEreignis('verband', 'crane_abschlag', { round: 6, cash: 1000 });
    const verband = endRound(antworten(start, 'crane_abschlag', 'verband'), balance);
    const hinnehmen = endRound(antworten(start, 'crane_abschlag', 'hinnehmen'), balance);
    expect(verband.worldModel.actsDone).toEqual(['independents_stand']);
    const erwartet = actsInput(['independents_stand'], start.worldModel.government, wb).moodKick!;
    expect(erwartet).toBeGreaterThanOrEqual(0);
    expect(verband.worldModel.mood - hinnehmen.worldModel.mood).toBeCloseTo(erwartet, 9);
    expect(verband.worldModel.parties.provinz).toBeGreaterThan(hinnehmen.worldModel.parties.provinz);
    expect(verband.worldModel.parties.volksbund).toBeGreaterThan(hinnehmen.worldModel.parties.volksbund);
    expect(verband.worldModel.parties.handel).toBeLessThan(hinnehmen.worldModel.parties.handel);
  });

  it('echter Preiskampf (ab Kapitel 2 über recordAct): billiges Öl hebt die Stimmung, die Provinzliga gewinnt', () => {
    const start = newGame('preiskampf', balance);
    const kampf = endRound(recordAct(start, 'price_war'), balance);
    const ruhig = endRound(start, balance);
    expect(wb.acts.price_war.mood).toBeGreaterThan(0);
    expect(kampf.worldModel.mood - ruhig.worldModel.mood).toBeCloseTo(wb.acts.price_war.mood, 9);
    expect(kampf.worldModel.parties.provinz).toBeGreaterThan(ruhig.worldModel.parties.provinz);
    // In Kapitel 1 trägt keine Antwort einen Preiskampf – Jacob kann dort noch niemanden unterbieten.
    expect(catalog.some((e) => e.choices.some((c) => c.public?.includes('price_war')))).toBe(false);
  });

  it('eine Spende hebt die Stimmung', () => {
    // Spielspaß K1 (Weichen statt Alltagspost): Elis Mutter ist gestrichen – die Spende direkt über recordAct.
    const start = newGame('kirche', balance);
    const spende = endRound(recordAct(start, 'charity'), balance);
    const tuer = endRound(start, balance);
    expect(spende.worldModel.mood - tuer.worldModel.mood).toBeCloseTo(wb.acts.charity.mood, 9);
  });

  it('die Wirkung klingt ab: Die Stimmung kehrt mit mood.speed zu ihrem Ziel zurück', () => {
    const start = newGame('abklingen', balance);
    const brand = endRound(recordAct(start, 'field_fire'), balance);
    const ruhig = endRound(start, balance);
    const d1 = brand.worldModel.mood - ruhig.worldModel.mood;
    const d2 = endRound(brand, balance).worldModel.mood - endRound(ruhig, balance).worldModel.mood;
    expect(d1).toBeLessThan(0);
    expect(Math.abs(d2)).toBeLessThan(Math.abs(d1));
    expect(Math.abs(d2)).toBeGreaterThan(0);
  });

  it('ein Tankbrand im Lager zählt von selbst als Feldbrand', () => {
    const feuer: Balance = { ...balance, transport: { ...balance.transport, storage: { ...balance.transport.storage, fireChance: 1 } } };
    const kein: Balance = { ...balance, transport: { ...balance.transport, storage: { ...balance.transport.storage, fireChance: 0 } } };
    const s = { ...newGame('tankbrand', balance), oilStock: 500 };
    expect(settleStorage(s, feuer).worldModel.acts).toEqual(['field_fire']);
    expect(settleStorage(s, kein).worldModel.acts).toEqual([]);
    // Im ganzen Rundenende: Der Brand wirkt noch in derselben Runde auf die Stimmung.
    const brennt = endRound(s, feuer);
    expect(brennt.worldModel.actsDone).toEqual(['field_fire']);
    expect(brennt.worldModel.mood).toBeLessThan(endRound(s, kein).worldModel.mood);
  });
});

describe('Öffentliches Handeln im Weltmodell (actsInput)', () => {
  it('jede Tat aus balance.yaml wirkt mit ihren Zahlen (Regierung Provinzliga, Strenge 1)', () => {
    expect(wb.programs.provinz.scrutiny).toBe(1);
    for (const act of PUBLIC_ACTS) {
      const e = actsInput([act], 'provinz', wb);
      expect(e.moodKick).toBeCloseTo(Math.max(-wb.acts.maxMood, Math.min(wb.acts.maxMood, wb.acts[act].mood)), 9);
      for (const p of PARTIES) expect(e.partyShift![p]).toBeCloseTo(wb.acts[act][p], 9);
    }
  });

  it('Parteiprogramm: Unter dem Volksbund wiegt ein Feldbrand schwerer als unter der Handelspartei', () => {
    const volk = actsInput(['field_fire'], 'volksbund', wb).moodKick!;
    const handel = actsInput(['field_fire'], 'handel', wb).moodKick!;
    expect(volk).toBeCloseTo(wb.acts.field_fire.mood * wb.programs.volksbund.scrutiny, 9);
    expect(handel).toBeCloseTo(wb.acts.field_fire.mood * wb.programs.handel.scrutiny, 9);
    expect(volk).toBeLessThan(handel);
    // Gutes wird nicht gewichtet.
    expect(actsInput(['charity'], 'volksbund', wb).moodKick).toBe(wb.acts.charity.mood);
    // Im Weltmodell: gleiche Welt, andere Regierung → anderer Ausschlag.
    const w = { ...newWorld('programm', wb), electionIn: 10 };
    const diff = (g: Party) => advanceWorld({ ...regiert(w, g), acts: ['field_fire'] }, wb).mood - advanceWorld(regiert(w, g), wb).mood;
    expect(diff('volksbund')).toBeLessThan(diff('handel'));
  });

  it('je Runde höchstens ± maxMood und ± maxParty', () => {
    const viel = actsInput(Array(10).fill('field_fire'), 'volksbund', wb);
    expect(viel.moodKick).toBe(-wb.acts.maxMood);
    expect(viel.partyShift!.volksbund).toBe(wb.acts.maxParty);
    const eng: WorldModelBalance = { ...wb, acts: { ...wb.acts, maxMood: 1 } };
    expect(actsInput(['field_fire'], 'provinz', eng).moodKick).toBe(-1);
  });

  it('nach der Runde sind die Taten verbraucht und stehen in actsDone', () => {
    const w = { ...newWorld('verbraucht', wb), acts: ['strike', 'charity'] as const };
    const n = advanceWorld({ ...w, acts: [...w.acts] }, wb);
    expect(n.acts).toEqual([]);
    expect(n.actsDone).toEqual(['strike', 'charity']);
    expect(advanceWorld(n, wb).actsDone).toEqual([]);
  });

  it('Taten ziehen keinen Zufall: Die Welt würfelt mit und ohne sie gleich', () => {
    const w = newWorld('zufall', wb);
    expect(advanceWorld({ ...w, acts: ['price_war'] }, wb).rng).toBe(advanceWorld(w, wb).rng);
  });

  it('Eingriffe: moodShift verschiebt dauerhaft das Ziel, moodKick stößt einmal an – auch über einen Zeitsprung', () => {
    // Ohne Rückwirkung der Stimmung auf die Parteien: Beide Läufe würfeln und regieren gleich.
    const still: WorldModelBalance = { ...wb, politics: { ...wb.politics, drift: 0 } };
    const w = newWorld('eingriff', still);
    const basis = skipWorld(w, still, 80);
    // Dauerhaft +5 aufs Ziel: im Gleichgewicht genau 5 Punkte mehr, nicht 5 / mood.speed.
    const dauer = skipWorld(w, still, 80, { moodShift: 5 });
    expect(dauer.mood - basis.mood).toBeCloseTo(5, 2);
    // Eine Runde: moodShift wirkt mit mood.speed, moodKick voll.
    expect(advanceWorld(w, still, { moodShift: 4 }).mood - advanceWorld(w, still).mood).toBeCloseTo(4 * still.mood.speed, 9);
    expect(advanceWorld(w, still, { moodKick: 4 }).mood - advanceWorld(w, still).mood).toBeCloseTo(4, 9);
    // Ein Stoß im Zeitsprung wirkt nur in der ersten Runde und ist nach 80 Runden verklungen.
    const stoss = skipWorld(w, still, 80, { moodKick: 5 });
    expect(Math.abs(stoss.mood - basis.mood)).toBeLessThan(0.01);
    expect(skipWorld(w, still, 1, { moodKick: 5 }).mood - skipWorld(w, still, 1).mood).toBeCloseTo(5, 9);
  });

  it('Spenden für eine Partei verschieben die Anteile zu ihr', () => {
    const w = { ...newWorld('spende', wb), electionIn: 10 };
    const mit = advanceWorld({ ...w, acts: ['support_volksbund', 'support_volksbund'] }, wb);
    const ohne = advanceWorld(w, wb);
    expect(mit.parties.volksbund).toBeGreaterThan(ohne.parties.volksbund);
    expect(mit.mood).toBe(ohne.mood);
  });
});

describe('Wahlen mit Ergebnis aus dem Weltzustand', () => {
  it('am Wahltag wird das Ergebnis gemerkt: Anteile, Sieger, Vorgänger', () => {
    const w = { ...newWorld('wahltag', wb), electionIn: 1 };
    const n = advanceWorld(w, wb);
    expect(n.lastElection).not.toBeNull();
    const e = n.lastElection!;
    expect(e.round).toBe(n.round);
    expect(e.previous).toBe(w.government);
    expect(e.winner).toBe(n.government);
    expect(e.winner).toBe(leadingParty(e.shares));
    expect(PARTIES.reduce((s, p) => s + e.shares[p], 0)).toBeCloseTo(1, 9);
    expect(e.shares).toEqual(n.parties);
    // Zwischen den Wahlen bleibt das Ergebnis stehen.
    expect(advanceWorld(n, wb).lastElection).toEqual(e);
  });

  it('Jacobs Handeln kann eine knappe Wahl kippen', () => {
    // Gleichstand Handelspartei/Volksbund am Vorabend, ohne Zufall in den Anteilen.
    const ruhig: WorldModelBalance = { ...wb, politics: { ...wb.politics, noise: 0, drift: 0, fatigue: 0, revert: 0 } };
    const w: WorldState = { ...newWorld('knapp', ruhig), electionIn: 1, government: 'handel', parties: { handel: 0.4, volksbund: 0.399, provinz: 0.201 } };
    expect(advanceWorld(w, ruhig).lastElection!.winner).toBe('handel');
    const gekippt = advanceWorld({ ...w, acts: ['strike_break'] }, ruhig);
    expect(gekippt.lastElection!.winner).toBe('volksbund');
    expect(gekippt.news).toContain('election');
  });

  it('Wahlen kommen in festen Abständen (politics.electionEvery)', () => {
    let w = { ...newWorld('abstand', wb), electionIn: 3 };
    const runden: number[] = [];
    for (let i = 0; i < 40; i++) {
      w = advanceWorld(w, wb);
      if (w.news.includes('election') || w.news.includes('reelection')) runden.push(w.round);
    }
    expect(runden).toEqual([3, 3 + wb.politics.electionEvery, 3 + 2 * wb.politics.electionEvery]);
  });

  it('Prozente ergeben zusammen genau 100', () => {
    expect(roundedPercents({ handel: 1 / 3, volksbund: 1 / 3, provinz: 1 / 3 })).toEqual({ handel: 34, volksbund: 33, provinz: 33 });
    const r = roundedPercents({ handel: 0.415, volksbund: 0.355, provinz: 0.23 });
    expect(r.handel + r.volksbund + r.provinz).toBe(100);
  });
});

describe('Zeitung: Umfrage, Wahlergebnis, Jacobs Handeln', () => {
  it('kurz vor der Wahl (news.pollFrom) eine Umfrage mit dem, der vorn liegt', () => {
    const w = { ...newWorld('umfrage', wb), news: [], crash: 0, credit: 50, tension: 10, mood: 50 };
    const vorn = leadingParty(w.parties);
    expect(pollLeader({ ...w, electionIn: wb.news.pollFrom }, wb.news.pollFrom)).toBe(vorn);
    expect(pollLeader({ ...w, electionIn: wb.news.pollFrom + 1 }, wb.news.pollFrom)).toBeNull();
    const klar = { ...w, parties: { handel: 0.25, volksbund: 0.45, provinz: 0.3 } };
    expect(worldHeadline({ ...klar, electionIn: 1 }, wb)).toBe('world_poll_volksbund');
    expect(worldHeadline({ ...klar, electionIn: wb.news.pollFrom + 1 }, wb)).toBeNull();
  });

  it('Kopf an Kopf (news.pollClose): Die Umfrage sagt, wenn eine Tat die Wahl kippen kann', () => {
    const w = { ...newWorld('kopf', wb), news: [], crash: 0, credit: 50, tension: 10, mood: 50, electionIn: 1 };
    const knapp = { handel: 0.4, volksbund: 0.4 - wb.news.pollClose / 2, provinz: 0.2 + wb.news.pollClose / 2 };
    expect(pollIsClose(knapp, wb.news.pollClose)).toBe(true);
    expect(worldHeadline({ ...w, parties: knapp }, wb)).toBe('world_poll_close_handel');
    const deutlich = { handel: 0.4, volksbund: 0.4 - 2 * wb.news.pollClose, provinz: 0.2 + 2 * wb.news.pollClose };
    expect(pollIsClose(deutlich, wb.news.pollClose)).toBe(false);
    expect(worldHeadline({ ...w, parties: deutlich }, wb)).toBe('world_poll_handel');
    for (const p of PARTIES) expect(zeitung.headlines[`world_poll_close_${p}`].title.de).toMatch(/Kopf an Kopf/);
  });

  it('nach der Wahl druckt die Zeitung Ergebnis und Programm der Sieger, sonst nicht', () => {
    const g = newGame('wahlzeitung', balance);
    const nachWahl = { ...g, worldModel: advanceWorld({ ...g.worldModel, electionIn: 1 }, wb) };
    const z = makeNewspaper(nachWahl, balance, zeitung, 'de', politik);
    expect(z.election).not.toBeNull();
    const e = z.election!;
    expect(e.lines.map((l) => l.percent).reduce((a, b) => a + b, 0)).toBe(100);
    expect(e.lines[0].winner).toBe(true);
    expect(e.lines[0].party).toBe(nachWahl.worldModel.government);
    expect(e.program).toEqual(politik.parties[nachWahl.worldModel.government].program.map((t) => t.de));
    expect(makeNewspaper(g, balance, zeitung, 'de', politik).election).toBeNull();
    expect(makeNewspaper(nachWahl, balance, zeitung).election).toBeNull();
    expect(electionReport(undefined, politik)).toBeNull();
  });

  it('nach einem Feldbrand berichtet die Zeitung in der nächsten Runde', () => {
    const g = newGame('brandzeitung', balance);
    const danach = endRound(recordAct(g, 'field_fire'), balance);
    expect(newsItems({ ...danach, priceHistory: [danach.postedPrice] }, balance)).toContain('public_field_fire');
    expect(newsItems(endRound(danach, balance), balance)).not.toContain('public_field_fire');
  });

  it('die lauteste Tat zuerst; jede Tat hat eine Meldung', () => {
    expect(loudestAct({ actsDone: ['charity', 'field_fire'] })).toBe('field_fire');
    expect(loudestAct({ actsDone: [] })).toBeNull();
    expect([...ACT_PRIORITY].sort()).toEqual([...PUBLIC_ACTS].sort());
    for (const a of PUBLIC_ACTS) expect(zeitung.headlines[`public_${a}`].title.de).not.toBe('');
  });
});

describe('Inhalte und Spielstand', () => {
  it('content/politics.yaml: drei Parteien mit Namen und Programm', () => {
    for (const p of PARTIES) {
      expect(politik.parties[p].name.de).not.toBe('');
      expect(politik.parties[p].program.length).toBeGreaterThanOrEqual(2);
    }
    const kaputt = parsePoliticsContent('p.yaml', 'electionTitle: { de: A }\nprogramTitle: { de: B }\nparties:\n  handel: { name: { de: H }, program: [{ de: x }, { de: y }] }\n');
    expect(kaputt.content).toBeNull();
    expect(kaputt.errors.map((e) => e.message).join(' ')).toMatch(/volksbund/);
  });

  it('Ereignisse: public wird gelesen, unbekannte Taten sind ein Fehler', () => {
    const gut = `- id: feuer\n  title: { de: F, en: '' }\n  text: { de: T, en: '' }\n  chance: 0.1\n  choices:\n    - id: a\n      label: { de: A, en: '' }\n      result: { de: R, en: '' }\n      public: [field_fire, press_scandal]\n`;
    const { events, errors } = parseEventFile('a.yaml', gut);
    expect(errors).toEqual([]);
    expect(events[0].choices[0].public).toEqual(['field_fire', 'press_scandal']);
    const schlecht = parseEventFile('a.yaml', gut.replace('press_scandal', 'aufruhr'));
    expect(schlecht.errors.map((e) => e.message).join(' ')).toMatch(/aufruhr/);
  });

  it('die getaggten Antworten in content/events tragen ihre Tat', () => {
    const tat = (ev: string, ch: string) => catalog.find((e) => e.id === ev)!.choices.find((c) => c.id === ch)!.public;
    expect(tat('crane_abschlag', 'verband')).toEqual(['independents_stand']);
    expect(tat('nora_interview', 'erzaehlen')).toEqual(['press_praise']);
  });

  it('Spielstand: Taten und Wahlergebnis überstehen Speichern und Laden', () => {
    const g = recordAct(newGame('speichern', balance), 'strike');
    const mitWahl = { ...g, worldModel: { ...advanceWorld({ ...g.worldModel, electionIn: 1 }, wb), acts: ['strike' as const] } };
    const r = deserializeGame(serializeGame(mitWahl, 'test'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.worldModel.acts).toEqual(['strike']);
      expect(r.state.worldModel.lastElection).toEqual(mitWahl.worldModel.lastElection);
    }
  });

  it('Spielstand Format 14 (ohne Taten und Wahl) lädt mit Ersatzwerten', () => {
    const g = newGame('alt14', balance);
    const { acts: _a, actsDone: _d, lastElection: _l, ...alteWelt } = g.worldModel;
    const text = JSON.stringify({ format: 14, appVersion: '0.4.1', savedRound: 1, state: { ...g, worldModel: alteWelt } });
    const r = deserializeGame(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.worldModel.acts).toEqual([]);
      expect(r.state.worldModel.actsDone).toEqual([]);
      expect(r.state.worldModel.lastElection).toBeNull();
    }
  });

  it('isWorldState lehnt unbekannte Taten und kaputte Wahlergebnisse ab', () => {
    const w = newWorld('pruefen', wb);
    expect(isWorldState(w)).toBe(true);
    expect(isWorldState({ ...w, acts: ['aufruhr'] })).toBe(false);
    expect(isWorldState({ ...w, lastElection: { round: 1, shares: { handel: 1 }, winner: 'handel', previous: 'handel' } })).toBe(false);
  });

  it('balance.yaml: fehlende Tat oder Programm ist ein Fehler', () => {
    const raw = rawBalance() as { worldModel: Record<string, Record<string, unknown>> };
    const ohneTat = structuredClone(raw);
    delete ohneTat.worldModel.acts.strike;
    expect(() => parseBalance(ohneTat)).toThrow(/worldModel\.acts\.strike/);
    const ohneProgramm = structuredClone(raw);
    delete ohneProgramm.worldModel.programs.volksbund;
    expect(() => parseBalance(ohneProgramm)).toThrow(/worldModel\.programs\.volksbund/);
  });
});
