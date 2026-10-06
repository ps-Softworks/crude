// Termine als Hauptwerkzeug, Etappe 3: Briefe und Ereignisse ausdünnen, zusammenlegen und an Jacobs Pläne koppeln
// (Plan Etappe 3, Tests: Katalog, gekoppelte Briefe, Gruppen-Sperre, kein Brief ohne Wirkung; dazu die Regeln aus
// src/sim/letters.ts und die Post-Regeln aus events.ts).
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { parseEventFile, parseEventFiles } from './eventContent';
import { immediateImpact, lastingValue } from './eventRelevance';
import { cooldownOf, drawEvents, drawMail, resolveEvent, type EventChoice, type EventDef } from './events';
import { knowledgeOf } from './exploration';
import { endRound, newGame, type GameState } from './game';
import { cheapExclusive, coupledEvents, LETTER_ACTIONS, LETTER_MARKS, letterTarget, planMarks, settleLetters } from './letters';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { EVENTS_DIR, loadEvents, loadLaterMarks, loadReadMarks, readEventFiles } from './testEvents';
import { exclusiveSurcharge } from './transport';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const katalog = loadEvents();
const L = balance.letters;

/** Kapitel-1-Ereignisse aus content/events/k1-*.yaml. */
const k1: EventDef[] = readEventFiles(EVENTS_DIR)
  .filter((f) => f.file.includes('/k1-'))
  .flatMap((f) => parseEventFile(f.file, f.text).events)
  .filter((e) => (e.conditions.minChapter ?? 1) <= 1);

function spiel(seed: string, patch: Partial<GameState> = {}): GameState {
  return { ...newGame(seed, balance, katalog), cash: 5000, ...patch };
}

function mitMarken(s: GameState, marks: Record<string, number>): GameState {
  return { ...s, events: { ...s.events, marks: { ...s.events.marks, ...marks } } };
}

describe('Katalog Kapitel 1 (Plan Etappe 3)', () => {
  it('ist um mindestens 25 % kleiner: höchstens 92 Ereignisse (vorher 122)', () => {
    expect(k1.length).toBeLessThanOrEqual(92);
  });

  it('die gestrichenen Ereignisse fehlen', () => {
    const gestrichen = ['pension_miete', 'post_mietstall', 'post_seil', 'poker', 'kumpel', 'prediger', 'faesser_angebot', 'saloon_serviette', 'sheriff_schutz', 'post_oelkauf', 'wechsel_angebot', 'wechsel_geplatzt', 'rutengaenger', 'post_geologe', 'dok_hale_echt_folge', 'dok_hale_falsch_folge'];
    const ids = new Set(katalog.map((e) => e.id));
    for (const id of gestrichen) expect(ids.has(id), id).toBe(false);
  });

  it('die neuen Antworten auf Jacobs Pläne sind da', () => {
    const ids = new Set(k1.map((e) => e.id));
    for (const id of ['haendler_mahnung', 'nora_entlarvt', 'thorne_nachgezaehlt', 'thorne_exklusiv_billiger', 'gemeinschaft_abgesprungen', 'kartell_verdacht', 'brennan_abwerben']) expect(ids.has(id), id).toBe(true);
  });
});

describe('Gekoppelte Briefe (Plan Etappe 3: „kommen nur noch als Reaktion auf ein Merkzeichen aus Jacobs Plänen“)', () => {
  const plan = new Set(planMarks());
  const gekoppelt = coupledEvents(katalog);
  // Die Tabelle aus dem Plan (ohne die beiden festen Rivalenzüge, siehe docs/plan-termine-messung.md).
  const KOPPLUNG: Record<string, string[]> = {
    foerderbremse: ['bullard_treue', 'bullard_verrat', 'kartell_verdacht'],
    haendler: ['crane_vorkauf', 'geruecht_tanks', 'haendler_mahnung'],
    geruecht: ['nora_interview', 'nora_artikel', 'nora_entlarvt'],
    thorne: ['geruecht_tarif', 'thorne_waggons', 'thorne_nachgezaehlt', 'thorne_exklusiv_billiger'],
    brennan: ['fuhre_aufschlag', 'fuhrleute_bestochen', 'brennan_abwerben'],
    gemeinschaft: ['pickett_pleite', 'tilly_tank', 'gemeinschaft_abgesprungen'],
    erkundung: ['geruecht_fund', 'dok_hale_gutachten', 'dok_pike_urkunde'],
  };

  it('jeder Brief aus der Tabelle hängt an einem Merkzeichen aus Jacobs Plänen', () => {
    for (const [plan_, ids] of Object.entries(KOPPLUNG)) for (const id of ids) expect(gekoppelt.has(id), `${plan_}: ${id}`).toBe(true);
  });

  it('direkt gekoppelte Briefe nennen ein Plan-Merkzeichen in marked', () => {
    for (const e of k1.filter((x) => gekoppelt.has(x.id) && x.id !== 'nora_artikel')) expect(e.marked.some((m) => plan.has(m)), e.id).toBe(true);
    // Noras Artikel hängt über die Kette: nora_interview setzt nur der gekoppelte Brief „Nora will ein Gespräch“.
    expect(k1.find((e) => e.id === 'nora_artikel')!.marked).toEqual(['nora_interview']);
  });

  it('ohne Pläne kommt keiner davon: Jacob tut 20 Partien lang nichts', () => {
    const direkt = new Set(Object.values(KOPPLUNG).flat());
    for (let i = 0; i < 20; i++) {
      let s = newGame(`ohne-plaene-${i}`, balance, katalog);
      while (!s.finished) s = endRound(s, balance, katalog);
      expect(s.events.seen.filter((id) => direkt.has(id)), `Seed ${i}`).toEqual([]);
    }
  });

  it('ein Plan-Merkzeichen allein reicht: mit „erkundet“ kann der Bohrmeister schreiben', () => {
    const brief = katalog.find((e) => e.id === 'geruecht_fund')!;
    let s = mitMarken(spiel('erkundet', { round: 3 }), { [LETTER_MARKS.explored]: 2 });
    let kam = false;
    for (let r = 3; r < 12 && !kam; r++) {
      s = drawMail({ ...s, round: r }, balance, [brief]);
      kam = s.events.pending.includes('geruecht_fund');
    }
    expect(kam).toBe(true);
  });
});

describe('Gruppen: höchstens einmal in 4 Runden (Plan Etappe 3)', () => {
  it('die Gruppen in Kapitel 1 halten 4 Runden Abstand – Trupp, Tank, Thomas', () => {
    const gruppen = new Map<string, EventDef[]>();
    for (const e of k1) if (e.group) gruppen.set(e.group, [...(gruppen.get(e.group) ?? []), e]);
    expect([...gruppen.keys()].sort()).toEqual(['tank', 'thomas', 'trupp']);
    for (const [name, liste] of gruppen) {
      expect(liste.length, name).toBeGreaterThanOrEqual(2);
      for (const e of liste) expect(cooldownOf(e, balance), e.id).toBe(4);
    }
  });

  it('nach einer Variante kommt 4 Runden lang keine andere derselben Gruppe', () => {
    const viele: Balance = { ...balance, events: { ...balance.events, maxPerRound: 5 } };
    const a: EventDef = { ...katalog.find((e) => e.id === 'blitz_tank')!, chance: 1, conditions: {} };
    const b: EventDef = { ...katalog.find((e) => e.id === 'diebe_tank')!, chance: 1, conditions: {}, notMarked: [] };
    let s = spiel('gruppe', { oilStock: 1000 });
    const runden: number[] = [];
    for (let r = 1; r <= 10; r++) {
      s = drawEvents({ ...s, round: r, events: { ...s.events, pending: [] } }, viele, [a, b]);
      if (s.events.lastSeen['@tank'] === r) runden.push(r);
    }
    expect(runden).toEqual([1, 5]);
  });

  it('Inhaltsprüfung: Varianten einer Gruppe in Kapitel 1 brauchen denselben Abstand', () => {
    const datei = (id: string, cd: number) => `- id: ${id}\n  group: probe\n  cooldown: ${cd}\n  chance: 0.1\n  title: { de: "T", en: "" }\n  text: { de: "T", en: "" }\n  choices:\n    - id: ja\n      label: { de: "Ja", en: "" }\n      result: { de: "Ja", en: "" }\n`;
    const r = parseEventFiles([{ file: 'a.yaml', text: datei('eins', 4) + datei('zwei', 3) }]);
    expect(r.errors.map((e) => e.message).join(' ')).toMatch(/Gruppe „probe“: Alle Varianten brauchen denselben Abstand/);
    expect(parseEventFiles([{ file: 'a.yaml', text: datei('eins', 4) + datei('zwei', 4) }]).errors).toEqual([]);
  });
});

describe('Kein Brief ohne Wirkung (Plan Etappe 3)', () => {
  it('jede Antwort in Kapitel 1 kostet oder bringt ≥ 100 $, setzt ein Merkzeichen mit Folge oder bewegt eine Beziehung', () => {
    const read = loadReadMarks(katalog, balance);
    const later = loadLaterMarks();
    const ohne: string[] = [];
    for (const e of k1) {
      if (e.routine) continue;
      // Briefe, die wiederkommen, bis Jacob antwortet (Wegerechte): „später“ verschiebt die Entscheidung nur.
      const kommtWieder = !e.once && (e.certain === true || e.chance === 1);
      for (const c of e.choices) {
        const marken = [...c.marks, ...(c.marksIfForged ?? [])].filter((m) => read.has(m) || later.has(m));
        const familie = [c.effects.ruth, c.effects.thomas, c.effects.clara].some((x) => (x ?? 0) !== 0);
        const wirkt = immediateImpact(c, balance) >= 100 || lastingValue(c, balance) >= 100 || marken.length > 0 || familie;
        if (!wirkt && !(kommtWieder && c.default)) ohne.push(`${e.id}/${c.id}`);
      }
    }
    expect(ohne).toEqual([]);
  });
});

describe('Post: höchstens ein Brief je Rivale und Runde, Antworten zuerst', () => {
  const t = (de: string) => ({ de, en: '' });
  const wahl: EventChoice = { id: 'ja', label: t('ja'), result: t('ok'), requires: {}, effects: {}, default: true, marks: [] };
  const brief = (id: string, extra: Partial<EventDef> = {}): EventDef => ({
    id, title: t(id), text: t('Text'), conditions: {}, marked: [], notMarked: [], delay: 1, chance: 1, once: true, routine: false, appointments: 1, choices: [wahl], mail: 'offer', ...extra,
  });
  const drei: Balance = { ...balance, events: { ...balance.events, mail: { ...balance.events.mail, maxPerRound: 3 } } };

  it('zwei Thorne-Briefe kommen nie in derselben Runde – auch nicht neben einem sicheren', () => {
    const s = drawMail(spiel('rivale'), drei, [brief('a', { rival: 'thorne' }), brief('b', { rival: 'thorne' }), brief('c', { rival: 'crane' })]);
    expect(s.events.pending.filter((id) => id === 'a' || id === 'b')).toHaveLength(1);
    expect(s.events.pending).toContain('c');
    const sicher = drawMail(spiel('rivale'), drei, [brief('s', { rival: 'thorne', certain: true }), brief('a', { rival: 'thorne' })]);
    expect(sicher.events.pending).toEqual(['s']);
  });

  it('in Kapitel 1 gehen Antworten (Briefe mit Merkzeichen) den Alltagsbriefen vor', () => {
    const s0 = mitMarken(spiel('antworten'), { probe: 0 });
    for (let i = 0; i < 20; i++) {
      const s = drawMail({ ...s0, seed: `antworten-${i}`, events: { ...s0.events, rng: s0.events.rng + i } }, balance, [brief('alltag'), brief('antwort', { marked: ['probe'] })]);
      expect(s.events.pending).toEqual(['antwort']);
    }
  });

  it('Kapitel 1: sicher kommt nur die Witwe am Bahndamm (Wegerecht) mit Thorne im Hintergrund – daneben lässt perRival keinen zweiten Thorne-Brief zu', () => {
    expect(k1.filter((e) => e.mail && e.rival === 'thorne' && e.certain).map((e) => e.id)).toEqual(['wegerecht_bahndamm']);
    expect(balance.events.mail.perRival).toBe(1);
  });
});

describe('Plan-Merkzeichen am Rundenende (src/sim/letters.ts)', () => {
  it('ein Ritt setzt „erkundet“; nach letters.window Runden ist es wieder weg', () => {
    const s = spiel('ritt', { round: 2 });
    const vorher: GameState = { ...s, plans: { round: 2, booked: [{ cardId: 'ritt', target: s.parcels[0].id, appointments: 2, overtime: 0, cash: 0, strength: -3, done: true }], report: [] } };
    const nach = settleLetters(vorher, { ...vorher, plans: { round: 3, booked: [], report: [] } }, balance);
    expect(nach.events.marks[LETTER_MARKS.explored]).toBe(2);
    const spaeter = settleLetters({ ...nach, round: 2 + L.window }, { ...nach, round: 2 + L.window }, balance);
    expect(spaeter.events.marks[LETTER_MARKS.explored]).toBeUndefined();
  });

  it('Besuch bei Thorne: „thorne_besucht“, ohne Zugeständnis auch „thorne_abfuhr“; Thorne meldet sich', () => {
    const s = spiel('thorne', { round: 2 });
    const nach = settleLetters(s, { ...s, freight: { ...s.freight, visits: 1 } }, balance);
    expect(nach.events.marks[LETTER_MARKS.thorneVisit]).toBe(2);
    expect(nach.events.marks[LETTER_MARKS.thorneRebuff]).toBe(2);
    expect(nach.events.marks[LETTER_MARKS.thorneMet]).toBe(2);
    const zug = settleLetters(s, { ...s, freight: { ...s.freight, visits: 1, concessions: [2] } }, balance);
    expect(zug.events.marks[LETTER_MARKS.thorneRebuff]).toBeUndefined();
  });

  it('ohne Besuch meldet sich Thorne spätestens so, dass sein Vertrag ab letters.thorneLatest kommen kann', () => {
    const frueh = spiel('spaet', { round: L.thorneLatest - 2 });
    expect(settleLetters(frueh, frueh, balance).events.marks[LETTER_MARKS.thorneMet]).toBeUndefined();
    const s = spiel('spaet', { round: L.thorneLatest - 1 });
    expect(settleLetters(s, s, balance).events.marks[LETTER_MARKS.thorneMet]).toBe(L.thorneLatest - 1);
  });

  it('Lage-Merkzeichen stehen, solange etwas läuft: voller Tank, Brennan, Gemeinschaft', () => {
    const s = spiel('lage', { round: 5, oilStock: L.holdStock });
    const voll = settleLetters(s, { ...s, freight: { ...s.freight, brennan: { from: 4, until: 8 }, pool: ['Pickett'] } }, balance);
    expect(voll.events.marks[LETTER_MARKS.holding]).toBe(5);
    expect(voll.events.marks[LETTER_MARKS.brennanRunning]).toBe(5);
    expect(voll.events.marks[LETTER_MARKS.poolRunning]).toBe(5);
    const leer = settleLetters({ ...voll, round: 6 }, { ...voll, round: 6, oilStock: 0, freight: { ...voll.freight, brennan: null, pool: [] } }, balance);
    for (const m of [LETTER_MARKS.holding, LETTER_MARKS.brennanRunning, LETTER_MARKS.poolRunning]) expect(leer.events.marks[m], m).toBeUndefined();
  });

  it('Abgesprungene merkt sich die Gemeinschaft; die Antwort „zurückholen“ bringt sie wieder', () => {
    const s = spiel('pool', { round: 6 });
    const vorher = { ...s, freight: { ...s.freight, pool: ['Pickett', 'Haskell & Dunn'] } };
    const nach = settleLetters(vorher, { ...vorher, freight: { ...vorher.freight, pool: ['Pickett'] } }, balance);
    expect(nach.events.marks[LETTER_MARKS.poolLeft]).toBe(6);
    expect(nach.freight!.poolLeft).toEqual(['Haskell & Dunn']);
    const antwort = mitMarken({ ...nach, round: 7 }, { [LETTER_ACTIONS.poolBack]: 7 });
    const zurueck = settleLetters(antwort, antwort, balance);
    expect(zurueck.freight!.pool).toEqual(['Pickett', 'Haskell & Dunn']);
    expect(zurueck.freight!.poolLeft).toEqual([]);
    expect(zurueck.events.marks[LETTER_ACTIONS.poolBack]).toBeUndefined();
  });

  it('Fehlmenge beim Händler setzt „liefervertrag_fehlmenge“; „aufgelöst“ beendet den Vertrag', () => {
    const s = spiel('haendler', { round: 5 });
    const vertrag = { buyer: 'haendler' as const, qty: 3000, price: 0.9, from: 4, until: 8, gain: 120 };
    const mit = { ...s, pricing: { ...s.pricing!, contract: vertrag }, logistics: { ...s.logistics, traderSold: 1000 } };
    expect(settleLetters(mit, mit, balance).events.marks[LETTER_MARKS.shortfall]).toBe(5);
    const antwort = mitMarken(mit, { [LETTER_ACTIONS.contractEnded]: 5 });
    const aus = settleLetters(antwort, antwort, balance);
    expect(aus.pricing!.contract).toBeNull();
    expect(aus.pricing!.contractResults.at(-1)).toBe(120);
  });

  it('Nora verzeiht: Sie warnt wieder vor; Ruf bei den Wildcattern steigt bzw. sinkt um letters.standing', () => {
    const s = spiel('nora', { round: 8 });
    const verbrannt = mitMarken({ ...s, pricing: { ...s.pricing!, noraBurned: true } }, { [LETTER_ACTIONS.noraReconciled]: 8, [LETTER_ACTIONS.helped]: 8 });
    const nach = settleLetters(verbrannt, verbrannt, balance);
    expect(nach.pricing!.noraBurned).toBe(false);
    expect(nach.wildcatterStanding).toBeCloseTo(L.standing, 9);
    const weg = mitMarken(nach, { [LETTER_ACTIONS.snubbed]: 8 });
    expect(settleLetters(weg, weg, balance).wildcatterStanding).toBeCloseTo(0, 9);
  });

  it('Hales Gutachten: echt ein Hinweis wie von Hale kartiert; gefälscht ein „Ölsand“ auf einer trockenen Ranch', () => {
    const s = spiel('hale', { round: 6 });
    const echt = mitMarken(s, { [LETTER_ACTIONS.haleBought]: 6 });
    const e = settleLetters(echt, echt, balance);
    const zielE = Object.entries(e.knowledge).find(([, k]) => k.clues.some((c) => c.source === 'bericht' && c.geologist === 'hale'));
    expect(zielE).toBeDefined();
    expect(zielE![1].level).toBeGreaterThanOrEqual(2);
    const falsch = mitMarken(s, { [LETTER_ACTIONS.haleBought]: 6, [LETTER_ACTIONS.haleForged]: 6 });
    const f = settleLetters(falsch, falsch, balance);
    const [id, k] = Object.entries(f.knowledge).find(([, x]) => x.clues.some((c) => c.source === 'bericht' && c.geologist === 'hale'))!;
    expect(k.clues.find((c) => c.source === 'bericht')!.seen).toBe(true);
    expect(f.parcels.find((p) => p.id === id)!.geology).toBe('dry');
    // Wirkt nur in der Runde der Antwort – später nicht noch einmal.
    const spaeter = settleLetters({ ...f, round: 7 }, { ...f, round: 7 }, balance);
    expect(spaeter.knowledge).toEqual(f.knowledge);
  });

  it('gekaufte Bohrliste: Bohrbericht (Stufe 3) auf einer Ranch, die Jacob am liebsten schon beritten hat', () => {
    const s = spiel('bohrliste', { round: 4 });
    const ziel = letterTarget(s, 3, 'probe');
    expect(ziel).not.toBeNull();
    const antwort = mitMarken(s, { [LETTER_ACTIONS.reportBought]: 4 });
    const nach = settleLetters(antwort, antwort, balance);
    expect(Object.values(nach.knowledge).some((k) => k.level === 3 && k.clues.some((c) => c.kind === 'bohrbericht' && c.source === 'bericht'))).toBe(true);
    expect(nach.events.marks[LETTER_ACTIONS.reportBought]).toBeUndefined();
    // Fest aus dem Seed: zweimal dieselbe Antwort, dieselbe Ranch.
    expect(settleLetters(antwort, antwort, balance).knowledge).toEqual(nach.knowledge);
    // Weltzufall unberührt.
    expect(nach.rng).toEqual(s.rng);
    // Beritten geht vor.
    const beritten = s.parcels.find((p) => !p.discovery && knowledgeOf(s, p.id).level === 1);
    if (beritten) expect(knowledgeOf(s, letterTarget(s, 3, 'probe')!.id).level).toBe(1);
  });

  it('„Exklusiv jetzt billiger“: der Vertrag beginnt neu, andere Wege kosten letters.cheapExclusivePenalty', () => {
    const s = spiel('exklusiv', { round: 9 });
    const antwort = mitMarken(s, { [RIVAL_MARKS.thorneContract]: 9, [RIVAL_MARKS.thorneExclusive]: 9, [LETTER_ACTIONS.cheapExclusive]: 9 });
    const nach = settleLetters(antwort, antwort, balance);
    expect(cheapExclusive(nach)).toBe(true);
    expect(exclusiveSurcharge(nach, balance, 'wagon')).toBe(L.cheapExclusivePenalty);
    expect(exclusiveSurcharge(nach, balance, 'rail')).toBe(0);
    const normal = mitMarken(s, { [RIVAL_MARKS.thorneContract]: 9, [RIVAL_MARKS.thorneExclusive]: 9 });
    expect(exclusiveSurcharge(normal, balance, 'wagon')).toBe(balance.transport.thorne.exclusivePenalty);
  });

  it('der Brief „Thorne hat nachgezählt“ lässt sich beantworten: Aufschlag abkaufen senkt den Tarif um 0,10 $', () => {
    const s = mitMarken(spiel('nachgezaehlt', { round: 8, railTariff: 0.5 }), { thorne_bluff: 7 });
    const mitBrief = { ...s, events: { ...s.events, pending: ['thorne_nachgezaehlt'], due: { thorne_nachgezaehlt: 9 } } };
    const r = resolveEvent(mitBrief, balance, katalog, 'thorne_nachgezaehlt', 'abkaufen');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.railTariff).toBeCloseTo(0.4, 9);
  });

  it('ab Kapitel 2 setzt die Simulation keine Plan-Merkzeichen', () => {
    const s = spiel('k2', { round: 41, chapter: 2, chapterStart: 41, oilStock: 99999 });
    expect(settleLetters(s, s, balance)).toBe(s);
  });
});

describe('Spielstand (Etappe 3)', () => {
  it('Format 22: die Abgesprungenen überstehen Sichern und Laden; ältere Stände laden ohne sie', () => {
    expect(SAVE_FORMAT).toBe(23);
    const s = spiel('speichern');
    const mit = { ...s, freight: { ...s.freight!, poolLeft: ['Pickett'] } };
    const geladen = deserializeGame(serializeGame(mit, '0.4.5+1'));
    expect(geladen.ok && geladen.state.freight!.poolLeft).toEqual(['Pickett']);
    const alt = JSON.parse(serializeGame(s, '0.4.5+1')) as { format: number; state: Record<string, unknown> };
    alt.format = 21;
    const altGeladen = deserializeGame(JSON.stringify(alt));
    expect(altGeladen.ok).toBe(true);
    const kaputt = { ...alt, format: 22, state: { ...alt.state, freight: { ...(alt.state.freight as object), poolLeft: [3] } } };
    expect(deserializeGame(JSON.stringify(kaputt)).ok).toBe(false);
  });
});
