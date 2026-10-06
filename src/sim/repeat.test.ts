// Wiederholungsschutz, Variantengruppen und Entwürfe (2.10a) – und der echte Katalog über viele Seeds.
import { describe, expect, it } from 'vitest';
import type { Lease } from './lease';
import type { Well } from './drilling';
import { parseEventFile } from './eventContent';
import { autoResolve, cooldownOf, cooledDown, drawEvents, type EventDef } from './events';
import { newGame, type GameState } from './game';
import { deserializeGame, serializeGame, SAVE_FORMAT } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

const t = (de: string) => ({ de, en: '' });

function ereignis(id: string, extra: Partial<EventDef> = {}): EventDef {
  return {
    id,
    title: t(id),
    text: t('Text'),
    conditions: {},
    marked: [],
    notMarked: [],
    delay: 1,
    chance: 1,
    once: true,
    routine: false,
    appointments: 1,
    choices: [{ id: 'ja', label: t('ja'), result: t('ok'), requires: {}, effects: {}, default: true, marks: [] }],
    ...extra,
  };
}

/** Runde um Runde: offene Ereignisse bekommen ihre Standard-Wahl, dann wird neu gewürfelt. Liefert die Ankünfte je Runde. */
function ankuenfte(katalog: EventDef[], runden: number, b = balance, seed = 'cool'): string[][] {
  let state = newGame(seed, b);
  const out: string[][] = [];
  for (let round = 1; round <= runden; round++) {
    const vorher = state.events.lastSeen;
    state = drawEvents(autoResolve({ ...state, round }, katalog), b, katalog);
    out.push(Object.keys(state.events.lastSeen).filter((k) => !k.startsWith('@') && state.events.lastSeen[k] === round && vorher[k] !== round));
  }
  return out;
}

describe('Wiederholungsschutz (2.10a)', () => {
  const viele = { ...balance, events: { ...balance.events, maxPerRound: 5 } };

  it('ein wiederkehrendes Ereignis kommt frühestens nach cooldown Runden wieder', () => {
    const runden = ankuenfte([ereignis('a', { once: false, cooldown: 3 })], 10, viele);
    expect(runden.map((r) => r.includes('a'))).toEqual([true, false, false, true, false, false, true, false, false, true]);
  });

  it('ohne eigenen cooldown gilt events.repeatCooldown aus balance.yaml, cooldown 0 schaltet ihn ab', () => {
    expect(cooldownOf({ once: false }, balance)).toBe(balance.events.repeatCooldown);
    expect(cooldownOf({ once: true }, balance)).toBe(0);
    expect(cooldownOf({ once: true, group: 'x' }, balance)).toBe(balance.events.repeatCooldown);
    expect(cooldownOf({ once: false, cooldown: 0 }, balance)).toBe(0);
    const runden = ankuenfte([ereignis('a', { once: false })], 1 + balance.events.repeatCooldown, viele);
    expect(runden.filter((r) => r.includes('a')).length).toBe(2);
    expect(runden.at(-1)).toContain('a');
  });

  it('Varianten einer Gruppe halten gemeinsam Abstand – auch innerhalb derselben Runde', () => {
    const katalog = [ereignis('v1', { group: 'panne', cooldown: 2 }), ereignis('v2', { group: 'panne', cooldown: 2 }), ereignis('v3', { group: 'panne', cooldown: 2 })];
    const runden = ankuenfte(katalog, 6, viele);
    // Die Reihenfolge ist zufällig (2.10b), der Abstand nicht: jede zweite Runde genau eine Variante.
    expect(runden.map((r) => r.length)).toEqual([1, 0, 1, 0, 1, 0]);
    expect(new Set(runden.flat())).toEqual(new Set(['v1', 'v2', 'v3']));
  });

  it('cooledDown prüft Ereignis und Gruppe', () => {
    const state = { round: 5, events: { ...newGame('x', balance).events, lastSeen: { a: 3, '@g': 4 } } };
    expect(cooledDown(state, { id: 'a', once: false, cooldown: 2 }, balance)).toBe(true);
    expect(cooledDown(state, { id: 'a', once: false, cooldown: 3 }, balance)).toBe(false);
    expect(cooledDown(state, { id: 'b', once: true, group: 'g', cooldown: 2 }, balance)).toBe(false);
    expect(cooledDown(state, { id: 'b', once: true, group: 'g', cooldown: 1 }, balance)).toBe(true);
  });

  it('gilt auch für Briefe', () => {
    const post = { ...balance, events: { ...balance.events, mail: { ...balance.events.mail, maxPerRound: 3 } } };
    const runden = ankuenfte([ereignis('brief', { mail: 'info', once: false, cooldown: 2, deadline: 1 })], 6, post);
    expect(runden.map((r) => r.includes('brief'))).toEqual([true, false, true, false, true, false]);
  });

  it('übersteht Sichern und Laden; alte Spielstände (Format 7) bekommen einen leeren Wiederholungsschutz', () => {
    const state = { ...newGame('save', balance), events: { ...newGame('save', balance).events, lastSeen: { a: 1, '@g': 1 } } };
    const geladen = deserializeGame(serializeGame(state, 'test'));
    expect(geladen.ok && geladen.state.events.lastSeen).toEqual({ a: 1, '@g': 1 });
    const alt = JSON.parse(serializeGame(state, 'test'));
    alt.format = SAVE_FORMAT;
    delete alt.state.events.lastSeen;
    const altGeladen = deserializeGame(JSON.stringify(alt));
    expect(altGeladen.ok && altGeladen.state.events.lastSeen).toEqual({});
  });
});

describe('Prüfprogramm: cooldown, group, draft (2.10a)', () => {
  const kopf = `- id: e
  title: { de: "T", en: "" }
  text: { de: "T", en: "" }
  chance: 0.5
`;
  const wahl = `  choices:
    - id: ja
      label: { de: "Ja", en: "" }
      result: { de: "Ok", en: "" }
`;
  const lies = (extra: string) => parseEventFile('x.yaml', kopf + extra + wahl);

  it('liest cooldown, group und draft', () => {
    const { events, errors } = lies('  once: false\n  cooldown: 4\n  group: panne\n  draft: true\n');
    expect(errors).toEqual([]);
    expect(events[0]).toMatchObject({ cooldown: 4, group: 'panne', draft: true, once: false });
  });

  it('meldet unsinnigen Wiederholungsschutz mit Zeile', () => {
    const meldungen = (extra: string) => lies(extra).errors.map((e) => `${e.line}: ${e.message}`);
    expect(meldungen('  cooldown: 3\n')[0]).toMatch(/^5: .*„cooldown“ wirkt nur bei „once: false“ oder mit „group“/);
    expect(meldungen('  once: false\n  cooldown: -1\n')[0]).toMatch(/„cooldown“ muss eine ganze Zahl ab 0 sein/);
    expect(meldungen('  group: Panne\n')[0]).toMatch(/„group“ darf nur Kleinbuchstaben/);
    expect(meldungen('  certain: true\n  group: panne\n')[0]).toMatch(/keinen Wiederholungsschutz/);
    expect(meldungen('  draft: ja\n')[0]).toMatch(/„draft“ muss true oder false sein/);
  });
});

// Spielspaß K1 (Weichen statt Alltagspost): Die Alltagsereignisse 1–67 (2.10a/b) sind gestrichen – Kapitel 1 hat nur noch
// Weichen. Geprüft wird weiter, dass im ganzen Katalog nichts ungewollt wiederkommt.
describe('Wiederholung im echten Katalog', () => {
  const katalog = loadEvents();
  const quelle = { status: 'found' } as Well;
  const pacht = { holder: 'jacob' } as Lease;

  it('jedes wiederkehrende Ereignis im ganzen Katalog hat einen Abstand von mindestens einer Runde', () => {
    for (const e of katalog.filter((x) => !x.once && !x.routine)) expect(cooldownOf(e, balance), e.id).toBeGreaterThanOrEqual(1);
  });

  // Merkzeichen, auf die Kapitel-1-Ereignisse warten – in der Hälfte der Partien gleich gesetzt.
  const merkzeichen = [...new Set(katalog.filter((e) => (e.conditions.minChapter ?? 1) <= 1).flatMap((e) => e.marked))].filter((m) => m !== 'thomas_geboren');

  /** Eine Partie über 16 Runden; Variante je Seed: viel oder wenig Geld, mit oder ohne Vorgeschichte. */
  function partie(i: number): { id: string; round: number }[] {
    const cash = i % 2 === 0 ? 3000 : 350;
    const vorgeschichte = i % 4 < 2 ? Object.fromEntries(merkzeichen.map((m) => [m, 1])) : {};
    const start = newGame(`wdh-${i}`, balance, katalog);
    let state: GameState = { ...start, cash, oilStock: 800, wells: [quelle], leases: [pacht, pacht], events: { ...start.events, marks: { ...start.events.marks, ...vorgeschichte } } };
    const out: { id: string; round: number }[] = [];
    const merke = (s: GameState, vorher: Record<string, number>) => {
      for (const [id, r] of Object.entries(s.events.lastSeen)) if (!id.startsWith('@') && r === s.round && vorher[id] !== r) out.push({ id, round: r });
    };
    merke(state, {});
    for (let round = 2; round <= 16; round++) {
      const marks = round >= 3 ? { ...state.events.marks, thomas_geboren: state.events.marks.thomas_geboren ?? 3 } : state.events.marks;
      const vorher = state.events.lastSeen;
      state = drawEvents(autoResolve({ ...state, round, cash, oilStock: 800, events: { ...state.events, marks } }, katalog), balance, katalog);
      merke(state, vorher);
      // Nie zweimal dasselbe Ereignis gleichzeitig auf dem Schreibtisch.
      expect(new Set(state.events.pending).size).toBe(state.events.pending.length);
    }
    return out;
  }

  it('über viele Seeds keine ungewollte Wiederholung: einmalige nie doppelt, wiederkehrende und Varianten mit Abstand', () => {
    const def = new Map(katalog.map((e) => [e.id, e]));
    for (let i = 0; i < 150; i++) {
      const zuletzt = new Map<string, number>();
      for (const { id, round } of partie(i)) {
        const e = def.get(id)!;
        const vorher = zuletzt.get(id);
        if (e.once) expect(vorher, `${id} kam zweimal`).toBeUndefined();
        const abstand = cooldownOf(e, balance);
        if (vorher !== undefined) expect(round - vorher, `${id} zu früh wieder`).toBeGreaterThanOrEqual(abstand);
        if (e.group) {
          const g = zuletzt.get(`@${e.group}`);
          if (g !== undefined) expect(round - g, `Gruppe ${e.group} zu früh wieder (${id})`).toBeGreaterThanOrEqual(abstand);
          zuletzt.set(`@${e.group}`, round);
        }
        zuletzt.set(id, round);
      }
    }
  });
});
