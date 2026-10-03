// Posteingang (2.4, GDD §3): vier Briefarten mit Frist, rotes Siegel und die
// Garantie, dass jede Briefart in jeder Partie vorkommt.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { parseBalance } from './balance';
import { parseEventFile } from './eventContent';
import {
  autoResolve,
  deadlineOf,
  deskEvents,
  deskMail,
  drawEvents,
  drawMail,
  dueMailKinds,
  MAIL_KINDS,
  resolveEvent,
  type EventChoice,
  type EventDef,
  type MailKind,
} from './events';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const inhalte = loadEvents();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

function brief(id: string, mail: MailKind, extra: Partial<EventDef> = {}): EventDef {
  return {
    id,
    title: t(`Brief ${id}`),
    text: t('Text'),
    conditions: {},
    marked: [],
    notMarked: [],
    delay: 1,
    chance: 1,
    once: true,
    routine: false,
    appointments: 1,
    choices: [wahl('ja', { effects: { cash: 10 } }), wahl('nein', { default: true, effects: { cash: -5 } })],
    mail,
    ...extra,
  };
}

function mitPost(mail: Partial<Balance['events']['mail']>): Balance {
  return { ...balance, events: { ...balance.events, mail: { ...balance.events.mail, ...mail } } };
}

/** Briefarten, die in dieser Partie gekommen sind. */
function artenGesehen(state: GameState, katalog: readonly EventDef[]): Set<MailKind> {
  return new Set(state.events.seen.flatMap((id) => katalog.find((e) => e.id === id)?.mail ?? []));
}

describe('Fertig-Kriterium 2.4: jede Briefart kommt mindestens einmal pro Partie', () => {
  it('über 300 Seeds, Jacob lässt alles liegen', () => {
    for (let i = 0; i < 300; i++) {
      let state = newGame(`post-${i}`, balance, inhalte);
      while (!state.finished) state = endRound(state, balance, inhalte);
      expect(state.ending, `Seed post-${i}`).toBe('kapitel');
      expect([...artenGesehen(state, inhalte)].sort(), `Seed post-${i}`).toEqual([...MAIL_KINDS].sort());
    }
  });

  it('über 200 Seeds, Jacob beantwortet jeden Brief sofort mit der ersten möglichen Antwort', () => {
    for (let i = 0; i < 200; i++) {
      let state = newGame(`antwort-${i}`, balance, inhalte);
      while (!state.finished) {
        for (const b of deskMail(state, balance, inhalte)) {
          const c = b.choices.find((x) => x.ok);
          if (!c) continue;
          const r = resolveEvent(state, balance, inhalte, b.id, c.id);
          if (r.ok) state = r.state;
        }
        state = endRound(state, balance, inhalte);
      }
      expect([...artenGesehen(state, inhalte)].sort(), `Seed antwort-${i}`).toEqual([...MAIL_KINDS].sort());
    }
  });

  it('jede Briefart hat in content/ einen Alltagsbrief ohne Bedingungen, der öfter kommen darf', () => {
    for (const kind of MAIL_KINDS) {
      const alltag = inhalte.filter(
        (e) => e.mail === kind && !e.once && Object.keys(e.conditions).length === 0 && e.marked.length === 0 && e.notMarked.length === 0,
      );
      expect(alltag.length, kind).toBeGreaterThanOrEqual(1);
    }
  });

  it('alle Briefe haben Deutsch und Englisch', () => {
    for (const e of inhalte.filter((x) => x.mail)) {
      expect(e.title.en, e.id).not.toBe('');
      expect(e.text.en, e.id).not.toBe('');
    }
  });
});

describe('Frist und rotes Siegel', () => {
  it('Briefe haben die Frist aus balance.yaml, andere Ereignisse eine Runde, deadline überschreibt', () => {
    expect(deadlineOf({ mail: 'offer' }, balance)).toBe(balance.events.mail.deadlineRounds);
    expect(deadlineOf({}, balance)).toBe(1);
    expect(deadlineOf({ mail: 'info', deadline: 3 }, balance)).toBe(3);
  });

  it('ein Brief mit Frist 2 bleibt eine Runde liegen, trägt dann das rote Siegel und bekommt danach die Standard-Wahl', () => {
    const b = mitPost({ deadlineRounds: 2 });
    const katalog = [brief('a', 'offer')];
    let state = drawMail(newGame('frist', b), b, katalog);
    expect(state.events.pending).toEqual(['a']);
    let karte = deskEvents(state, b, katalog)[0];
    expect(karte).toMatchObject({ mail: 'offer', roundsLeft: 2, urgent: false });

    const cash = state.cash;
    state = autoResolve(state, katalog);
    expect(state.events.pending).toEqual(['a']);
    expect(state.cash).toBe(cash);

    state = { ...state, round: state.round + 1 };
    karte = deskEvents(state, b, katalog)[0];
    expect(karte).toMatchObject({ roundsLeft: 1, urgent: true });

    state = autoResolve(state, katalog);
    expect(state.events.pending).toEqual([]);
    expect(state.events.due).toEqual({});
    expect(state.cash).toBe(cash - 5);
  });

  it('beantworten geht während der ganzen Frist und räumt die Frist ab', () => {
    const katalog = [brief('a', 'demand', { deadline: 3 })];
    const state = drawMail(newGame('antwort', balance), balance, katalog);
    const r = resolveEvent({ ...state, round: state.round + 2 }, balance, katalog, 'a', 'ja');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.events.pending).toEqual([]);
    expect(r.state.events.due).toEqual({});
  });

  it('Besuche ohne Briefart laufen wie bisher am Rundenende ab', () => {
    const besuch: EventDef = { ...brief('b', 'offer'), mail: undefined };
    delete besuch.mail;
    const state = drawEvents(newGame('besuch', balance), balance, [besuch]);
    expect(state.events.pending).toEqual(['b']);
    expect(deskEvents(state, balance, [besuch])[0]).toMatchObject({ roundsLeft: 1, urgent: true });
    expect(deskEvents(state, balance, [besuch])[0].mail).toBeUndefined();
    expect(autoResolve(state, [besuch]).events.pending).toEqual([]);
  });

  it('deskMail zeigt nur Briefe, dringende zuerst', () => {
    const katalog = [brief('lang', 'info', { deadline: 3 }), brief('kurz', 'personal', { deadline: 1 })];
    const state = drawMail(newGame('sort', balance), mitPost({ maxPerRound: 2 }), katalog);
    expect(deskMail(state, balance, katalog).map((e) => e.id)).toEqual(['kurz', 'lang']);
  });
});

describe('Post: wie viele Briefe kommen', () => {
  it('höchstens events.mail.maxPerRound neue Briefe, zusätzlich zu einem Besuch', () => {
    const besuch: EventDef = { ...brief('besuch', 'offer') };
    delete besuch.mail;
    const katalog = [besuch, brief('a', 'offer'), brief('b', 'demand'), brief('c', 'info')];
    const state = drawEvents(newGame('max', balance), mitPost({ maxPerRound: 2 }), katalog);
    expect(state.events.pending).toEqual(['besuch', 'a', 'b']);
    expect(state.log.filter((l) => l.includes('Im Posteingang'))).toHaveLength(2);
  });

  it('ohne Briefe im Katalog zieht die Post keinen Zufall – die Welt bleibt gleich', () => {
    const state = newGame('ruhig', balance);
    expect(drawMail(state, balance, [])).toBe(state);
    expect(drawMail(state, balance, [{ ...brief('x', 'offer'), mail: undefined }])).toBe(state);
  });

  it('gleicher Seed, gleiche Post', () => {
    const katalog = [brief('a', 'offer', { chance: 0.5 }), brief('b', 'demand', { chance: 0.5 })];
    const s = newGame('gleich', balance);
    expect(drawMail(s, balance, katalog)).toEqual(drawMail(s, balance, katalog));
  });

  it('Bedingungen, once und Merkzeichen gelten auch für Briefe', () => {
    const katalog = [brief('a', 'offer', { conditions: { minRound: 5 } }), brief('b', 'offer', { marked: ['x'] })];
    expect(drawMail(newGame('bed', balance), balance, katalog).events.pending).toEqual([]);
    const einmal = [brief('c', 'info')];
    const s = { ...drawMail(newGame('once', balance), balance, einmal), events: { ...newGame('once', balance).events, seen: ['c'] } };
    expect(drawMail(s, balance, einmal).events.pending).toEqual([]);
  });
});

describe('Garantie: spätestens alle guaranteeRounds Runden jede Briefart', () => {
  it('fällig ist eine Art erst nach guaranteeRounds Runden ohne Brief – die am längsten wartende zuerst', () => {
    const b = mitPost({ guaranteeRounds: 4 });
    const s = newGame('faellig', b);
    expect(dueMailKinds({ ...s, round: 3 }, b)).toEqual([]);
    expect(dueMailKinds({ ...s, round: 4 }, b)).toEqual(['offer', 'demand', 'info', 'personal']);
    const ev = { ...s.events, lastMail: { offer: 1, demand: 3 } };
    expect(dueMailKinds({ ...s, round: 6, events: ev }, b)).toEqual(['info', 'personal', 'offer']);
    expect(dueMailKinds({ ...s, round: 7, events: ev }, b)).toEqual(['info', 'personal', 'offer', 'demand']);
  });

  it('ein fälliger Brief kommt auch mit Chance 0', () => {
    const b = mitPost({ guaranteeRounds: 3 });
    const katalog = [brief('a', 'personal', { chance: 0, once: false })];
    const s = newGame('garantie', b);
    expect(drawMail({ ...s, round: 2 }, b, katalog).events.pending).toEqual([]);
    const da = drawMail({ ...s, round: 3 }, b, katalog);
    expect(da.events.pending).toEqual(['a']);
    expect(da.events.lastMail).toEqual({ personal: 3 });
    expect(da.events.due).toEqual({ a: 3 + b.events.mail.deadlineRounds - 1 });
  });

  it('die Garantie nimmt nur Briefe, die gerade kommen können', () => {
    const b = mitPost({ guaranteeRounds: 1 });
    const katalog = [brief('gesperrt', 'info', { chance: 0, conditions: { minCash: 1e9 } }), brief('frei', 'info', { chance: 0 })];
    expect(drawMail(newGame('nur', b), b, katalog).events.pending).toEqual(['frei']);
  });
});

describe('Inhalte und Zahlen', () => {
  const GUT = `- id: brief
  mail: demand
  deadline: 2
  title: { de: "Ein Brief", en: "" }
  text: { de: "Post.", en: "" }
  chance: 0.5
  choices:
    - id: lesen
      label: { de: "Lesen", en: "" }
      result: { de: "Gelesen.", en: "" }
`;

  it('mail und deadline werden gelesen', () => {
    const { events, errors } = parseEventFile('a.yaml', GUT);
    expect(errors).toEqual([]);
    expect(events[0]).toMatchObject({ mail: 'demand', deadline: 2 });
    expect(parseEventFile('a.yaml', GUT.replace('  mail: demand\n  deadline: 2\n', '')).events[0].mail).toBeUndefined();
  });

  it('falsche Briefart, kaputte Frist und Brief als fester Termin werden gemeldet', () => {
    const meldungen = (text: string) => parseEventFile('a.yaml', text).errors.map((e) => `${e.line}: ${e.message}`);
    expect(meldungen(GUT.replace('mail: demand', 'mail: rechnung'))).toContain(
      '2: Ereignis „brief“: „mail“ muss eine Briefart sein (offer, demand, info, personal).',
    );
    expect(meldungen(GUT.replace('deadline: 2', 'deadline: 0'))[0]).toMatch(/^3: .*„deadline“ muss eine ganze Zahl ab 1/);
    expect(meldungen(GUT.replace('  chance: 0.5', '  routine: true'))[0]).toMatch(/kann kein Brief/);
  });

  it('balance.yaml braucht den Block events.mail mit ganzen Zahlen ab 1', () => {
    const raw = rawBalance() as any;
    expect(parseBalance(raw).events.mail).toEqual({ maxPerRound: 1, deadlineRounds: 2, guaranteeRounds: 6 });
    expect(() => parseBalance({ ...raw, events: { maxPerRound: 1 } })).toThrow(/events.mail/);
    expect(() => parseBalance({ ...raw, events: { ...raw.events, mail: { ...raw.events.mail, deadlineRounds: 0 } } })).toThrow(
      /events.mail.deadlineRounds/,
    );
  });
});

describe('Spielstand mit Posteingang', () => {
  it('der Spielstand sichert Fristen und Briefarten und lädt sie zurück', () => {
    let state = newGame('save', balance, inhalte);
    for (let i = 0; i < 7; i++) state = endRound(state, balance, inhalte);
    expect(SAVE_FORMAT).toBeGreaterThanOrEqual(4);
    expect(Object.keys(state.events.lastMail).length).toBeGreaterThan(0);
    const geladen = deserializeGame(serializeGame(state, '0.2.4'));
    expect(geladen.ok && geladen.state).toEqual(state);
  });

  it('Spielstände aus Format 3 laden mit Ersatzwerten', () => {
    const state = newGame('alt', balance, inhalte);
    const { due: _due, lastMail: _last, docs: _docs, ...alt } = state.events;
    const text = JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.2.3', savedRound: 1, state: { ...state, events: alt } });
    const geladen = deserializeGame(text);
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect(geladen.state.events).toMatchObject({ due: {}, lastMail: {} });
  });

  it('kaputte Fristen werden abgelehnt', () => {
    const state = newGame('kaputt', balance);
    const text = JSON.stringify({ format: SAVE_FORMAT, appVersion: 'x', savedRound: 1, state: { ...state, events: { ...state.events, due: { a: 'bald' } } } });
    expect(deserializeGame(text).ok).toBe(false);
  });
});
