import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  answerEvents,
  balancedBorrowable,
  blindWildcatChance,
  botTable,
  botTurn,
  checkTargets,
  choiceValue,
  eventPolicy,
  measuredDecline,
  okActions,
  playGame,
  runBots,
  seedWinners,
  STRATEGIES,
  targetTable,
  type BotRow,
} from './bots';
import { BOT_TARGET_IDS } from './balance';
import { creditLimit, debt } from './credit';
import { applyAction } from './desk';
import type { EventDef } from './events';
import { endRound, newGame } from './game';
import { Rng, seedFromString } from './rng';
import { validateState } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const events = loadEvents();
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `test-${i}`);
/** Hat Jacob in dieser Partie selbst bei der Bank geliehen? (takeLoan schreibt das ins Protokoll) */
const bankLoan = (log: string[]) => log.some((z) => z.includes('bei der Bank geliehen'));

describe('Bot-Läufe', () => {
  it('gleicher Seed und gleiche Strategie ergeben dieselbe Partie', () => {
    for (const s of STRATEGIES) {
      expect(playGame('gleich', balance, s)).toEqual(playGame('gleich', balance, s));
    }
  });

  it('der Bot-Zufall fasst den Zufall der Welt nicht an und nutzt nie Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const seed of seeds(10)) {
      const start = newGame(seed, balance);
      const nach = botTurn(start, balance, 'zufaellig', new Rng(seedFromString(`${seed}-bot`)));
      // Nur Bohren würfelt in der Welt; ohne neue Bohrung bleibt state.rng gleich.
      if (nach.wells.length === start.wells.length) expect(nach.rng).toBe(start.rng);
      const ende = playGame(seed, balance, 'zufaellig').state;
      expect(ende.parcels.map((p) => p.reserves)).toEqual(start.parcels.map((p) => p.reserves));
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('jede Strategie spielt bis zum Ende und hinterlässt einen gültigen Spielstand', () => {
    for (const s of STRATEGIES) {
      for (const seed of seeds(5)) {
        const r = playGame(seed, balance, s);
        expect(r.state.finished).toBe(true);
        expect(validateState(r.state).ok).toBe(true);
        expect(r.bankrupt).toBe(r.state.ending === 'pleite');
        expect(r.rounds).toBeLessThanOrEqual(balance.start.rounds);
      }
    }
  });

  it('vorsichtig nimmt nie selbst einen Kredit', () => {
    // Am Rundenende kann die Bank automatisch einspringen (z. B. nach einem Unfall) –
    // das ist Regel, nicht Strategie. Der Bot selbst leiht in seinem Zug nie.
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        const nach = botTurn(state, balance, 'vorsichtig', rng);
        expect(nach.loans.length).toBeLessThanOrEqual(state.loans.length);
        state = endRound(nach, balance);
      }
    }
  });

  it('vorsichtig kauft nur Optionen, deren Bonus danach noch bezahlbar ist', () => {
    const { cashReserve } = balance.bots.cautious;
    let gekauft = 0;
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        const vorher = new Set(state.options.map((o) => o.parcelId));
        const nach = botTurn(state, balance, 'vorsichtig', rng);
        for (const o of nach.options.filter((o) => o.holder === 'jacob' && !vorher.has(o.parcelId))) {
          gekauft++;
          expect(nach.cash - o.bonus).toBeGreaterThanOrEqual(cashReserve);
        }
        state = endRound(nach, balance);
      }
    }
    expect(gekauft).toBeGreaterThan(0);
  });

  it('gierig gibt eine Bohrung auf, wenn auch ein Kredit das Weiterbohren nicht bezahlt', () => {
    // Ohne Aufgeben bliebe der einzige Turm für den Rest des Kapitels blockiert.
    for (const seed of seeds(20)) {
      let state = newGame(seed, balance);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        state = botTurn(state, balance, 'gierig', rng);
        expect(state.wells.filter((w) => w.status === 'decision' || w.status === 'stuck')).toEqual([]);
        state = endRound(state, balance);
      }
    }
  });

  it('gierig leiht in mindestens einer von 20 Partien bei der Bank', () => {
    expect(seeds(20).some((seed) => bankLoan(playGame(seed, balance, 'gierig').state.log))).toBe(true);
  });

  it('zufällig wählt nur Aktionen, die gerade gehen', () => {
    let state = newGame('zufall', balance);
    const rng = new Rng(seedFromString('zufall-bot'));
    for (let i = 0; i < 4; i++) {
      const aktionen = okActions(state, balance);
      expect(aktionen.length).toBeGreaterThan(0);
      for (const a of aktionen) expect(applyAction(state, balance, a.parcelId, a.kind).ok).toBe(true);
      state = botTurn(state, balance, 'zufaellig', rng);
    }
  });

  it('die Tabelle hat Kopfzeile und eine Zeile je Strategie', () => {
    const table = botTable(runBots(balance, 3));
    const zeilen = table.split('\n');
    expect(zeilen[0]).toBe(
      '| Strategie | Partien | Bankrottquote | Kapitelziel | Ø Imperiumswert | Siegquote | Ø Bullard-Kasse | Ø Bullard-Quellen | Ø Termine |',
    );
    expect(zeilen).toHaveLength(2 + STRATEGIES.length);
    for (const s of STRATEGIES) expect(table).toContain(`| ${s} |`);
  });

  it('Siegquote: der höchste Imperiumswert gewinnt, eine Pleite nie, Gleichstand wird geteilt', () => {
    const sieger = seedWinners([
      { strategy: 'vorsichtig', bankrupt: false, empire: -500 },
      { strategy: 'gierig', bankrupt: true, empire: 0 },
      { strategy: 'zufaellig', bankrupt: false, empire: -800 },
    ]);
    expect([...sieger]).toEqual([['vorsichtig', 1]]);
    const geteilt = seedWinners([
      { strategy: 'vorsichtig', bankrupt: false, empire: 100 },
      { strategy: 'gierig', bankrupt: false, empire: 100 },
      { strategy: 'zufaellig', bankrupt: false, empire: 0 },
    ]);
    expect(Object.fromEntries(geteilt)).toEqual({ vorsichtig: 0.5, gierig: 0.5 });
  });

  it('Gate 1: keine Strategie gewinnt immer', () => {
    for (const r of runBots(balance, 100)) expect(r.winRate).toBeLessThan(1);
  }, 60_000);

  it('die Siegquoten aller Strategien ergeben zusammen höchstens 100 % (Seeds ohne Sieger zählen für keinen)', () => {
    const rows = runBots(balance, 20);
    const summe = rows.reduce((s, r) => s + r.winRate, 0);
    expect(summe).toBeGreaterThan(0);
    expect(summe).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('Siegquote (2.15): bleibt auch der Beste unter der Startkasse, gewinnt niemand', () => {
    const ergebnisse = [
      { strategy: 'vorsichtig' as const, bankrupt: false, empire: 400 },
      { strategy: 'gierig' as const, bankrupt: false, empire: -3000 },
    ];
    expect(seedWinners(ergebnisse, 2500).size).toBe(0);
    expect([...seedWinners(ergebnisse)]).toEqual([['vorsichtig', 1]]);
    expect([...seedWinners([{ strategy: 'gierig', bankrupt: false, empire: 2500 }], 2500)]).toEqual([['gierig', 1]]);
    expect(seedWinners([{ strategy: 'gierig', bankrupt: true, empire: 9000 }], 0).size).toBe(0);
  });

  it('docs/botlaeufe.md enthält die Tabelle mit allen vier Strategien und die Zielwerte', () => {
    const md = readFileSync(new URL('../../docs/botlaeufe.md', import.meta.url), 'utf8');
    expect(md).toContain('Bankrottquote');
    for (const s of STRATEGIES) expect(md).toContain(s);
    expect(md).toContain('## Zielwerte Kapitel 1');
    expect(md).toContain('| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |');
    expect(md).not.toContain('**nein**');
  });
});

describe('Bot-Läufe mit Ereignissen (2.15)', () => {
  it('mit Ereignissen: gleicher Seed, gleiche Partie; jede Strategie spielt bis zum Ende mit gültigem Spielstand', () => {
    for (const s of STRATEGIES) {
      expect(playGame('ev-gleich', balance, s, events)).toEqual(playGame('ev-gleich', balance, s, events));
      for (const seed of seeds(4)) {
        const r = playGame(seed, balance, s, events);
        expect(r.state.finished).toBe(true);
        expect(r.state.ending).not.toBe('verkauft');
        expect(validateState(r.state).ok).toBe(true);
      }
    }
  });

  it('die planenden Bots beantworten Ereignisse und nehmen feste Termine wahr', () => {
    for (const s of ['vorsichtig', 'gierig', 'ausgewogen'] as const) {
      const log = playGame('ev-antwort', balance, s, events).state.log;
      // Antworten ohne „Ohne Antwort:“ kommen nur von resolveEvent – also vom Bot.
      const termine = events.filter((e) => e.routine).map((e) => e.title.de);
      expect(log.some((z) => termine.some((t) => z.includes(`: ${t} – `)))).toBe(true);
    }
  });

  it('kein Bot verkauft an den Crane Trust', () => {
    const crane = events.find((e) => e.choices.some((c) => c.marks.includes(RIVAL_MARKS.craneSold)));
    expect(crane).toBeDefined();
    for (const s of STRATEGIES) {
      for (const seed of seeds(8)) expect(playGame(seed, balance, s, events).state.events.marks[RIVAL_MARKS.craneSold]).toBeUndefined();
    }
  });

  const probe: EventDef = {
    id: 'probe',
    title: { de: 'Probe', en: 'Probe' },
    text: { de: 'Probe', en: 'Probe' },
    conditions: {},
    chance: 1,
    once: false,
    marked: [],
    notMarked: [],
    delay: 0,
    routine: true,
    appointments: 1,
    choices: [
      { id: 'geld', label: { de: 'Geld', en: 'Money' }, result: { de: 'x', en: 'x' }, requires: {}, effects: { cash: 100 }, default: false, marks: [] },
      { id: 'teuer', label: { de: 'teuer', en: 'dear' }, result: { de: 'x', en: 'x' }, requires: {}, effects: { cash: -400 }, default: false, marks: [] },
      {
        id: 'verkauf',
        label: { de: 'verkaufen', en: 'sell' },
        result: { de: 'x', en: 'x' },
        requires: {},
        effects: { cash: 99999 },
        default: false,
        marks: [RIVAL_MARKS.craneSold],
      },
      { id: 'lang', label: { de: 'lang', en: 'long' }, result: { de: 'x', en: 'x' }, requires: {}, effects: { cash: 300 }, default: false, marks: [], appointments: 6 },
    ],
  };

  it('Bewertung: Geld zählt, minus Termine; Verkauf an Crane nie; Rücklage und Überstunden-Grenze gelten', () => {
    const start = newGame('bewertung', balance);
    const vorsichtig = eventPolicy(balance, 'vorsichtig');
    const [geld, teuer, verkauf, lang] = probe.choices;
    expect(choiceValue(start, balance, probe, geld, vorsichtig)).toBe(100 - vorsichtig.appointment);
    expect(choiceValue(start, balance, probe, verkauf, vorsichtig)).toBeNull();
    // 400 $ ausgeben ginge unter die Rücklage von vorsichtig – der gierige Bot hat keine.
    const knapp = { ...start, cash: vorsichtig.reserve + 300 };
    expect(choiceValue(knapp, balance, probe, teuer, vorsichtig)).toBeNull();
    expect(choiceValue(knapp, balance, probe, teuer, eventPolicy(balance, 'gierig'))).not.toBeNull();
    // 6 Termine heißen Überstunden: vorsichtig macht nie welche, gierig nur bei genug Kraft.
    expect(choiceValue(start, balance, probe, lang, vorsichtig)).toBeNull();
    const gierig = eventPolicy(balance, 'gierig');
    expect(choiceValue(start, balance, probe, lang, gierig)).not.toBeNull();
    expect(choiceValue({ ...start, strength: gierig.overtimeFrom - 1 }, balance, probe, lang, gierig)).toBeNull();
  });

  it('answerEvents nimmt die beste Antwort und hört auf, wenn nichts mehr etwas bringt', () => {
    const start = newGame('antworten', balance);
    // Gierig nimmt die lange Antwort (300 $ trotz Überstunde), vorsichtig macht keine Überstunden und nimmt 100 $.
    expect(answerEvents(start, balance, [probe], eventPolicy(balance, 'gierig')).cash).toBe(start.cash + 300);
    const nach = answerEvents(start, balance, [probe], eventPolicy(balance, 'vorsichtig'));
    expect(nach.cash).toBe(start.cash + 100);
    expect(nach.agenda.done).toEqual(['probe']);
    expect(nach.events.marks[RIVAL_MARKS.craneSold]).toBeUndefined();
    // Bringt eine Antwort weniger als ihre Termine kosten, bleibt alles liegen.
    const teuer = { ...probe, choices: [{ ...probe.choices[0], effects: { cash: 1 } }] };
    expect(answerEvents(start, balance, [teuer], eventPolicy(balance, 'vorsichtig'))).toBe(start);
  });

  it('ausgewogen leiht selbst nie über maxDebtShare des Bankrahmens', () => {
    const { maxDebtShare } = balance.bots.balanced;
    let geliehen = false;
    for (const seed of seeds(15)) {
      let state = newGame(seed, balance, events);
      const rng = new Rng(seedFromString(`${seed}-bot`));
      while (!state.finished) {
        const nach = botTurn(state, balance, 'ausgewogen', rng, events);
        if (debt(nach) > debt(state)) {
          geliehen = true;
          expect(debt(nach)).toBeLessThanOrEqual(Math.max(debt(state), maxDebtShare * creditLimit(nach, balance)) + 1e-6);
        }
        expect(balancedBorrowable(nach, balance)).toBeGreaterThanOrEqual(0);
        state = endRound(nach, balance, events);
      }
    }
    expect(geliehen).toBe(true);
  });

  it('gemessener Rückgang: aus Anfangsrate und letzter Förderung, erst ab zwei Förderrunden', () => {
    expect(measuredDecline({ initialRate: 1000, roundsProduced: 1, lastRate: 1000 })).toBeNull();
    expect(measuredDecline({ initialRate: 1000, roundsProduced: 3, lastRate: 810 })).toBeCloseTo(0.1, 10);
    expect(measuredDecline({ initialRate: 1000, roundsProduced: 3, lastRate: 0 })).toBeNull();
  });

  it('blinde Wildcat-Chance liegt zwischen 0 und dem Ölanteil der ersten Stufe und ist ärmer als der Kern', () => {
    const c = blindWildcatChance(balance, 30);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(balance.drilling.stages[0].oilShare * (1 - balance.geology.zones[0].dry));
  });

  it('checkTargets misst jede Kennzahl und markiert, was außerhalb liegt', () => {
    const row = (strategy: BotRow['strategy'], o: Partial<BotRow>): BotRow => ({
      strategy,
      games: 10,
      bankruptRate: 0,
      goalRate: 0,
      meanEmpire: 0,
      winRate: 0,
      rivalCash: 0,
      rivalWells: 0,
      meanAppointments: 5,
      sickShare: 0,
      finds: { small: [], gusher: [], declines: [] },
      ...o,
    });
    const tag = balance.bots.daysPerRound;
    const rows = [
      row('vorsichtig', { meanEmpire: 10_000, winRate: 0.2 }),
      row('gierig', { meanEmpire: 20_000, bankruptRate: 0.2, winRate: 0.3, finds: { small: [100 * tag, 600 * tag], gusher: [], declines: [0.1] } }),
      row('ausgewogen', { meanEmpire: 30_000, bankruptRate: 0.05, goalRate: 0.4, winRate: 0.5, finds: { small: [], gusher: [800 * tag], declines: [0.14] } }),
      row('zufaellig', {}),
    ];
    const t = Object.fromEntries(checkTargets(rows, 0.15, balance).map((x) => [x.id, x]));
    expect(Object.keys(t)).toEqual([...BOT_TARGET_IDS]);
    expect(t.winRate.value).toBe(0.5);
    expect(t.winRate.ok).toBe(false);
    expect(t.cautiousBehind.value).toBeCloseTo(1 / 3, 10);
    expect(t.smallRateInRange.value).toBe(0.5);
    expect(t.gusherFactor.value).toBeCloseTo(800 / 350, 10);
    expect(t.decline.value).toBeCloseTo(0.12, 10);
    expect(t.standardGoal.value).toBe(0.4);
    expect(t.appointments.value).toBe(5);
    expect(t.wildcatHit.ok).toBe(true);
    expect(targetTable(Object.values(t))).toContain('**nein**');
  });

  it('Fertig-Kriterium 2.15: 1.000 Partien je Strategie mit Ereignissen – alle Zielwerte im Toleranzbereich', () => {
    const rows = runBots(balance, balance.bots.games, events);
    expect(rows.map((r) => r.strategy)).toEqual([...STRATEGIES]);
    for (const r of rows) {
      expect(r.games).toBe(1000);
      expect(Number.isFinite(r.meanEmpire)).toBe(true);
    }
    const ziele = checkTargets(rows, blindWildcatChance(balance), balance);
    expect(ziele.filter((z) => !z.ok).map((z) => `${z.label}: ${z.value}`)).toEqual([]);
  }, 240_000);
});
