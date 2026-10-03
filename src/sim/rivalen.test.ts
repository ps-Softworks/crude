// 2.8 Rivalen für Kapitel 1: Crane, Thorne und Bullard zwingen Jacob in jeder
// Partie zu Entscheidungen. Hier: sichere Ereignisse, die Inhalte in
// content/events/k1-rivalen.yaml und das Fertig-Kriterium über viele Seeds.

import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { botTurn, STRATEGIES } from './bots';
import { parseEventFile } from './eventContent';
import { drawEvents, resolveEvent, RIVAL_IDS, type EventChoice, type EventDef, type RivalId } from './events';
import { endRound, newGame, type GameState } from './game';
import { Rng, seedFromString } from './rng';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { RIVAL_MARKS, RIVAL_SIM_MARKS } from './trust';

const balance = loadBalance();
const catalog = loadEvents();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(id), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

function ereignis(id: string, extra: Partial<EventDef> = {}): EventDef {
  return { id, title: t(id), text: t('Text'), conditions: {}, marked: [], notMarked: [], delay: 1, chance: 1, once: true, routine: false, appointments: 1, choices: [wahl('ja')], ...extra };
}

describe('Sichere Ereignisse (certain, 2.8)', () => {
  const eins: Balance = { ...balance, events: { ...balance.events, maxPerRound: 1, mail: { ...balance.events.mail, maxPerRound: 1 } } };

  it('kommen ohne Würfel und zählen nicht gegen maxPerRound', () => {
    const katalog = [ereignis('a'), ereignis('b'), ereignis('sicher', { certain: true, chance: 0 })];
    const s = drawEvents(newGame('sicher', balance), eins, katalog);
    expect(s.events.pending).toEqual(['sicher', 'a']);
  });

  it('ziehen keinen Zufall: der Ereigniszufall läuft wie ohne sie', () => {
    const ohne = drawEvents(newGame('zufall', balance), eins, [ereignis('a', { chance: 0.5 })]);
    const mit = drawEvents(newGame('zufall', balance), eins, [ereignis('s', { certain: true }), ereignis('a', { chance: 0.5 })]);
    expect(mit.events.rng).toBe(ohne.events.rng);
  });

  it('sichere Briefe kommen zusätzlich zu den Briefen der Post', () => {
    const katalog = [ereignis('brief', { mail: 'offer' }), ereignis('sicherer_brief', { mail: 'demand', certain: true })];
    const s = drawEvents(newGame('post', balance), eins, katalog);
    expect(s.events.pending).toContain('sicherer_brief');
    expect(s.events.pending).toContain('brief');
  });

  it('warten auf ihre Bedingungen und Merkzeichen', () => {
    const katalog = [ereignis('spaet', { certain: true, conditions: { minRound: 3 } })];
    expect(drawEvents(newGame('spaet', balance), balance, katalog).events.pending).toEqual([]);
    expect(drawEvents({ ...newGame('spaet', balance), round: 3 }, balance, katalog).events.pending).toEqual(['spaet']);
  });

  it('YAML: certain und rival werden gelesen und geprüft, chance darf bei certain fehlen', () => {
    const gut = `- id: zug
  rival: crane
  certain: true
  title: { de: "Zug", en: "" }
  text: { de: "Text", en: "" }
  choices:
    - id: ja
      label: { de: "Ja", en: "" }
      result: { de: "Ja", en: "" }
`;
    const { events, errors } = parseEventFile('a.yaml', gut);
    expect(errors).toEqual([]);
    expect(events[0]).toMatchObject({ certain: true, rival: 'crane', chance: 1 });
    const falsch = parseEventFile('a.yaml', gut.replace('rival: crane', 'rival: rockefeller').replace('certain: true', 'certain: ja'));
    const meldungen = falsch.errors.map((e) => e.message);
    expect(meldungen.some((m) => m.includes('„rival“ muss ein Rivale sein'))).toBe(true);
    expect(meldungen.some((m) => m.includes('„certain“ muss true oder false sein'))).toBe(true);
  });
});

describe('Rivalen-Inhalte in content/events/', () => {
  it('jedes Merkzeichen, das die Simulation liest, setzt eine Wahl (oder die Simulation selbst)', () => {
    const gesetzt = new Set([...RIVAL_SIM_MARKS, ...catalog.flatMap((e) => e.choices.flatMap((c) => c.marks))]);
    for (const m of Object.values(RIVAL_MARKS)) expect(gesetzt, m).toContain(m);
  });

  it('jeder der drei hat ein sicheres Ereignis ohne Merkzeichen-Bedingung mit echter Wahl (≥ 2 Antworten, verschiedene Folgen)', () => {
    for (const rival of RIVAL_IDS) {
      const zuege = catalog.filter((e) => e.rival === rival && e.certain && e.marked.length === 0);
      expect(zuege.length, rival).toBeGreaterThan(0);
      for (const e of zuege) {
        expect(e.choices.length).toBeGreaterThanOrEqual(2);
        const folgen = new Set(e.choices.map((c) => JSON.stringify([c.marks, c.effects])));
        expect(folgen.size, e.id).toBe(e.choices.length);
        // Wer nicht antwortet, bekommt die Standard-Wahl – auch das ist eine Folge.
        expect(e.choices.some((c) => c.default)).toBe(true);
      }
    }
  });
});

/** Rivalen, deren Ereignisse in dieser Partie auf dem Schreibtisch lagen. */
function rivalenGesehen(state: GameState): Set<RivalId> {
  const out = new Set<RivalId>();
  for (const id of state.events.seen) {
    const e = catalog.find((x) => x.id === id);
    if (e?.rival && e.choices.length >= 2) out.add(e.rival);
  }
  return out;
}

describe('Fertig-Kriterium 2.8: jeder Rivale erzwingt in jeder Partie mindestens eine Entscheidung', () => {
  it('Jacob tut nichts (alle Antworten verfallen): 30 Seeds, alle drei Rivalen kommen', () => {
    for (let i = 0; i < 30; i++) {
      let s = newGame(`rivalen-${i}`, balance, catalog);
      while (!s.finished) s = endRound(s, balance, catalog);
      expect(s.ending, `Seed ${i}`).toBe('kapitel');
      expect([...rivalenGesehen(s)].sort(), `Seed rivalen-${i}`).toEqual(['bullard', 'crane', 'thorne']);
      // Ohne Antwort gelten die Standard-Wahlen: Bullard in Fehde, Thorne abgelehnt, Crane-Abschlag.
      expect(s.events.marks[RIVAL_MARKS.bullardFeud]).toBeDefined();
      expect(s.events.marks[RIVAL_MARKS.thorneRefused]).toBeDefined();
      expect(s.events.marks[RIVAL_MARKS.craneCut]).toBeDefined();
    }
  });

  it('mit den Bot-Strategien (Ereignisse bleiben liegen): jede Partie, die Runde 6 erreicht, sieht alle drei', () => {
    let geprueft = 0;
    for (const strategy of STRATEGIES) {
      for (let i = 0; i < 10; i++) {
        const seed = `rivalen-bot-${i}`;
        const rng = new Rng(seedFromString(`${seed}:${strategy}`));
        let s = newGame(seed, balance, catalog);
        let runde6 = false;
        while (!s.finished) {
          if (s.round >= 6) runde6 = true;
          s = endRound(botTurn(s, balance, strategy, rng), balance, catalog);
        }
        if (!runde6) continue;
        geprueft++;
        expect([...rivalenGesehen(s)].sort(), `${strategy} ${seed}`).toEqual(['bullard', 'crane', 'thorne']);
      }
    }
    expect(geprueft).toBeGreaterThanOrEqual(20);
  });

  it('Jacobs Antwort zählt: Handschlag mit Bullard, Vertrag mit Thorne, Verband gegen Crane', () => {
    let s = newGame('antworten', balance, catalog);
    const antworten: Record<string, string> = { bullard_saloon: 'handschlag', thorne_frachtvertrag: 'unterschreiben', crane_abschlag: 'verband' };
    while (!s.finished && s.round < 8) {
      for (const id of [...s.events.pending]) {
        if (!antworten[id]) continue;
        const r = resolveEvent({ ...s, cash: Math.max(s.cash, 1000) }, balance, catalog, id, antworten[id]);
        if (!r.ok) throw new Error(r.reason);
        s = r.state;
      }
      s = endRound(s, balance, catalog);
    }
    expect(s.events.marks[RIVAL_MARKS.bullardPact]).toBeDefined();
    expect(s.events.marks[RIVAL_MARKS.bullardFeud]).toBeUndefined();
    expect(s.events.marks[RIVAL_MARKS.thorneContract]).toBeDefined();
    expect(s.events.marks[RIVAL_MARKS.alliance]).toBeDefined();
  });
});
