import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  answerEvents,
  balancedBorrowable,
  blindWildcatChance,
  botTable,
  botTurn,
  buildStats,
  buildTable,
  checkTargets,
  investVariant,
  runInvestVariant,
  choiceValue,
  eventPolicy,
  bookRound,
  creditCrisisInChapter,
  crisisTable,
  measuredDecline,
  newLedger,
  pipelineWorth,
  profitPerBarrel,
  ROUTE_KEYS,
  routeShares,
  thorneOfferValue,
  transportTable,
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
import { endRound, newGame, type GameState } from './game';
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

  it('Kreditzyklus (4.4): Pleiten werden nach Seeds mit und ohne Kreditkrise im Kapitel aufgeteilt', () => {
    const rows = runBots(balance, 20);
    const krisen = Array.from({ length: 20 }, (_, i) => creditCrisisInChapter(`${balance.bots.seedPrefix}-${i}`, balance)).filter(Boolean).length;
    for (const r of rows) {
      expect(r.crisis.games).toBe(krisen);
      expect(r.crisis.games + r.calm.games).toBe(r.games);
      expect(r.crisis.bankrupt + r.calm.bankrupt).toBe(Math.round(r.bankruptRate * r.games));
    }
    const tabelle = crisisTable(rows);
    expect(tabelle).toContain('Kreditkrise');
    expect(tabelle.split('\n')).toHaveLength(2 + rows.length);
  }, 60_000);

  it('Kreditkrise im Kapitel: deterministisch je Seed, in manchen Welten ja, in den meisten nein', () => {
    const seeds = Array.from({ length: 150 }, (_, i) => `krise-${i}`);
    const ja = seeds.filter((s) => creditCrisisInChapter(s, balance));
    expect(seeds.filter((s) => creditCrisisInChapter(s, balance))).toEqual(ja);
    expect(ja.length).toBeGreaterThan(0);
    expect(ja.length / seeds.length).toBeLessThan(0.4);
  });

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
      transport: newLedger(),
      pipelineGames: 0,
      goalGames: 0,
      pipelineGoalGames: 0,
      build: { rigs: 10, pumps: 0, extraWells: 0, producing: 0, expanded: 0 },
      seeds: [],
      crisis: { games: 0, bankrupt: 0 },
      calm: { games: 10, bankrupt: 0 },
      ...o,
    });
    const tag = balance.bots.daysPerRound;
    const rows = [
      row('vorsichtig', { meanEmpire: 10_000, winRate: 0.2 }),
      row('gierig', { build: { rigs: 15, pumps: 2, extraWells: 1, producing: 4, expanded: 2 }, meanEmpire: 20_000, bankruptRate: 0.2, winRate: 0.3, finds: { small: [100 * tag, 600 * tag], gusher: [], declines: [0.1] } }),
      row('ausgewogen', { meanEmpire: 30_000, bankruptRate: 0.05, goalRate: 0.4, winRate: 0.5, finds: { small: [], gusher: [800 * tag], declines: [0.14] } }),
      row('zufaellig', {}),
    ];
    const t = Object.fromEntries(checkTargets(rows, 0.15, balance, { none: { meanEmpire: 25_000 }, all: { beatsStandard: 0.7 } }).map((x) => [x.id, x]));
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
    expect(t.expandedShare.value).toBe(0.5);
    expect(t.investGain.value).toBeCloseTo(30_000 / 25_000, 10);
    expect(t.allOutWins.value).toBe(0.7);
    expect(t.allOutWins.ok).toBe(false);
    expect(targetTable(Object.values(t))).toContain('**nein**');
  });

  it('Fertig-Kriterium 2.15: 1.000 Partien je Strategie mit Ereignissen – alle Zielwerte im Toleranzbereich', () => {
    const rows = runBots(balance, balance.bots.games, events);
    expect(rows.map((r) => r.strategy)).toEqual([...STRATEGIES]);
    for (const r of rows) {
      expect(r.games).toBe(1000);
      expect(Number.isFinite(r.meanEmpire)).toBe(true);
    }
    const standard = rows.find((r) => r.strategy === 'ausgewogen')!;
    const variants = {
      none: runInvestVariant(balance, investVariant(balance, 'none'), standard, events),
      all: runInvestVariant(balance, investVariant(balance, 'all'), standard, events),
    };
    const ziele = checkTargets(rows, blindWildcatChance(balance), balance, variants);
    expect(ziele.filter((z) => !z.ok).map((z) => `${z.label}: ${z.value}`)).toEqual([]);
  }, 600_000); // dieselbe Arbeit wie `npm run bots`; auf einem ausgelasteten Rechner gut 4 Minuten
});

describe('Bot-Läufe: Transportwege (0.2.15+4)', () => {
  /** Spiel mit n fördernden Quellen, die zusammen rate Barrel je Runde liefern. */
  function mitFoerderung(rate: number, round = 2, seed = 'wege'): GameState {
    const state = newGame(seed, balance);
    const wells = state.parcels.slice(0, 2).map((p) => ({
      id: `${p.id}#1`,
      parcelId: p.id,
      stage: 1,
      status: 'found' as const,
      roundsLeft: 0,
      spent: 1000,
      oilStage: 1,
      result: 'small' as const,
      production: { initialRate: rate / 2, roundsProduced: 2, lastRate: rate / 2, total: rate },
      startRound: 1,
    }));
    return { ...state, round, wells };
  }
  const spiele = (strategy: (typeof STRATEGIES)[number], n = 30) => seeds(n).map((seed) => playGame(seed, balance, strategy, events));

  it('Pipeline lohnt nur mit Förderung, genug Restzeit und Bereitschaft (payback > 0)', () => {
    const viel = { ...mitFoerderung(30_000), railTariff: 0.55 };
    expect(pipelineWorth(viel, balance, 1)).toBe(true);
    expect(pipelineWorth(viel, balance, 0)).toBe(false);
    expect(pipelineWorth(mitFoerderung(0), balance, 1)).toBe(false);
    expect(pipelineWorth({ ...viel, round: viel.totalRounds - 2 }, balance, 1)).toBe(false);
    expect(pipelineWorth({ ...viel, logistics: { ...viel.logistics, pipeline: 'ready' } }, balance, 1)).toBe(false);
  });

  it('Thornes Vertrag: Mengenrabatt lohnt erst ab der Mindestmenge, Exklusiv kostet ohne Förderung nur', () => {
    const { minVolume } = balance.transport.thorne;
    expect(thorneOfferValue(mitFoerderung(minVolume * 2), balance, 'volume')).toBeGreaterThan(0);
    expect(thorneOfferValue(mitFoerderung(minVolume / 5), balance, 'volume')).toBeLessThan(0);
    expect(thorneOfferValue(mitFoerderung(0), balance, 'exclusive')).toBeLessThan(0);
  });

  it('Buchführung: Löhne gehen auf die Fuhrwerke, Streckenwärter auf die Pipeline, Reparatur nach Sabotage auch', () => {
    const s = mitFoerderung(10_000);
    const vorher: GameState = { ...s, logistics: { ...s.logistics, teams: 2, pipeline: 'ready', guards: true } };
    const nachher: GameState = { ...vorher, logistics: { ...vorher.logistics, pipeline: 'damaged' } };
    const ledger = newLedger();
    bookRound(vorher, nachher, balance, ledger);
    const t = balance.transport;
    expect(ledger.teams.costs).toBe(2 * t.teams.wagePerRound);
    expect(ledger.pipeline.costs).toBe(t.pipeline.upkeepPerRound + t.pipeline.guardsPerRound + t.pipeline.repairCost);
    expect(ledger.rail.costs).toBe(0);
  });

  it('Kennzahlen je Weg: Anteile ergeben 100 %, Gewinn je Barrel = (Erlös − Kosten) ÷ Barrel', () => {
    const l = newLedger();
    l.rail = { barrels: 300, net: 120, costs: 0 };
    l.teams = { barrels: 100, net: 50, costs: 20 };
    const a = routeShares(l);
    expect(a.rail).toBeCloseTo(0.75, 10);
    expect(a.teams).toBeCloseTo(0.25, 10);
    expect(profitPerBarrel(l.teams)).toBeCloseTo(0.3, 10);
    expect(profitPerBarrel(l.pipeline)).toBeNull();
  });

  it('jede Partie führt Buch: verkaufte Barrel stecken in den Wegen, Händler-Barrel sind ein Teil davon', () => {
    for (const s of STRATEGIES) {
      for (const r of spiele(s, 8)) {
        const wege = (['wagon', 'rail', 'teams', 'pipeline'] as const).reduce((x, m) => x + r.transport[m].barrels, 0);
        expect(r.transport.trader.barrels).toBeLessThanOrEqual(wege);
        for (const k of ROUTE_KEYS) expect(Number.isFinite(r.transport[k].net)).toBe(true);
      }
    }
  });

  it('vorsichtig verkauft nie an den Händler und droht Thorne nie', () => {
    for (const r of spiele('vorsichtig')) {
      expect(r.transport.trader.barrels).toBe(0);
      expect(r.state.logistics.threatRound).toBe(0);
    }
  });

  it('gierig verkauft an den Händler und baut in manchen Partien eine Pipeline; ausgewogen nutzt eigene Fuhrwerke', () => {
    const gierig = spiele('gierig', 40);
    expect(gierig.some((r) => r.transport.trader.barrels > 0)).toBe(true);
    expect(gierig.some((r) => r.pipeline)).toBe(true);
    expect(spiele('ausgewogen', 40).some((r) => r.transport.teams.barrels > 0)).toBe(true);
  });

  it('die planenden Bots mit Marge verkaufen nie mit Verlust nach Fracht und Förderzins', () => {
    for (const s of ['vorsichtig', 'ausgewogen'] as const) {
      for (const r of spiele(s, 15)) {
        expect(r.state.log.some((z) => / verkauft.* – -[0-9]/.test(z))).toBe(false);
      }
    }
  });

  it('die Transporttabelle hat eine Zeile je Weg und den Händler', () => {
    const rows = runBots(balance, 3, events);
    const t = transportTable(rows).split('\n');
    expect(t).toHaveLength(2 + ROUTE_KEYS.length);
    expect(t[0]).toContain('Ø Gewinn je bbl');
    expect(t.some((z) => z.startsWith('| Pipeline'))).toBe(true);
    expect(t.some((z) => z.startsWith('| davon an den Händler'))).toBe(true);
  });
});

describe('Ausbau nach Charakter (0.2.15+7)', () => {
  // 60 Partien je Strategie mit Ereignissen: Wer rüstet nach, wer mietet Türme, wer pumpt?
  const spiele = (s: 'vorsichtig' | 'gierig' | 'ausgewogen') => Array.from({ length: 60 }, (_, i) => playGame(`bot-${i}`, balance, s, events).state);

  it('vorsichtig: nie ein zweiter Turm, nie eine Dampfmaschine; gierig mietet Türme; ausgewogen rüstet nach und pumpt', () => {
    const vorsichtig = spiele('vorsichtig');
    const gierig = spiele('gierig');
    const ausgewogen = spiele('ausgewogen');
    expect(vorsichtig.every((s) => s.rigs.length === 1 && !s.rigs[0].steam)).toBe(true);
    expect(gierig.every((s) => s.rigs.length <= balance.bots.invest.greedy.rigs && s.rigs.every((r) => !r.rods))).toBe(true);
    expect(gierig.some((s) => s.log.some((l) => l.includes('mietet einen Bohrturm')))).toBe(true);
    expect(gierig.flatMap((s) => s.rigs).every((r) => r.kind !== 'owned')).toBe(true);
    expect(ausgewogen.some((s) => s.rigs[0].steam && s.rigs[0].rods)).toBe(true);
    expect(ausgewogen.some((s) => s.wells.some((w) => w.pump))).toBe(true);
  }, 120_000);
});

describe('Ausbau messen und Gegenproben (0.2.15+8)', () => {
  it('buildStats zählt Pumpen, weitere fündige Bohrlöcher und ausgebaute Ranches', () => {
    const state = newGame('ausbau', balance);
    const well = (id: string, parcelId: string, status: 'found' | 'dry', pump = false) =>
      ({ id, parcelId, stage: 1, status, roundsLeft: 0, spent: 0, oilStage: 1, startRound: 1, pump }) as GameState['wells'][number];
    const s: GameState = {
      ...state,
      wells: [
        well('a#1', 'a', 'found'),
        well('a#2', 'a', 'found'),
        well('b#1', 'b', 'found', true),
        well('c#1', 'c', 'found'),
        well('c#2', 'c', 'dry'),
        well('d#1', 'd', 'dry'),
      ],
    };
    expect(buildStats(s, 3)).toEqual({ rigs: 3, pumps: 1, extraWells: 1, producing: 3, expanded: 2 });
  });

  it('Gegenproben: „nie ausbauen“ baut nichts, „alles ausbauen“ pumpt mehr als der Standard-Bot', () => {
    const n = 40;
    const seedsOf = (strategy: 'ausgewogen') =>
      Array.from({ length: n }, (_, i) => playGame(`${balance.bots.seedPrefix}-${i}`, balance, strategy, events));
    const games = seedsOf('ausgewogen');
    const standard = {
      seeds: games.map((g) => ({ empire: g.empire, bankrupt: g.bankrupt })),
    } as BotRow;
    const nie = runInvestVariant(balance, investVariant(balance, 'none'), standard, events);
    const alles = runInvestVariant(balance, investVariant(balance, 'all'), standard, events);
    expect(nie.games).toBe(n);
    expect(nie.build.pumps + nie.build.extraWells + nie.build.expanded).toBe(0);
    expect(nie.build.rigs).toBe(n);
    const pumpenStandard = games.reduce((s, g) => s + g.build.pumps, 0);
    expect(alles.build.pumps).toBeGreaterThan(pumpenStandard);
    expect(alles.beatsStandard).toBeGreaterThanOrEqual(0);
    expect(alles.beatsStandard).toBeLessThanOrEqual(1);
  }, 120_000);

  it('die Ausbau-Tabelle hat je Strategie und Gegenprobe eine Zeile', () => {
    const rows = runBots(balance, 3, events);
    const standard = rows.find((r) => r.strategy === 'ausgewogen')!;
    const v = { none: runInvestVariant(balance, investVariant(balance, 'none'), standard, events), all: runInvestVariant(balance, investVariant(balance, 'all'), standard, events) };
    const t = buildTable(rows, v).split('\n');
    expect(t).toHaveLength(2 + STRATEGIES.length + 2);
    expect(t[0]).toContain('Ø Pumpen');
    expect(t.at(-1)).toContain('alles ausbauen');
  }, 60_000);
});
