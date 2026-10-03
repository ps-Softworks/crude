import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { nextStep } from './desk';
import type { Well } from './drilling';
import {
  applyEffects,
  autoResolve,
  conditionsMet,
  deskEvents,
  drawEvents,
  resolveEvent,
  unmetReason,
  type EventChoice,
  type EventDef,
} from './events';
import { endRound, newGame, type GameState } from './game';
import { localize } from './i18n';
import { deserializeGame, serializeGame, validateState } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, ...extra };
}

function ereignis(id: string, extra: Partial<EventDef> = {}): EventDef {
  return { id, title: t(`Titel ${id}`), text: t('Text'), conditions: {}, chance: 1, once: true, choices: [wahl('ja')], ...extra };
}

const quelle = { status: 'found' } as Well;

describe('Sprachschlüssel', () => {
  it('zeigt die gewünschte Sprache und fällt bei leerem Text auf Deutsch zurück', () => {
    expect(localize({ de: 'Brief', en: 'Letter' }, 'en')).toBe('Letter');
    expect(localize({ de: 'Brief', en: '' }, 'en')).toBe('Brief');
    expect(localize({ de: 'Brief', en: 'Letter' })).toBe('Brief');
  });
});

describe('Bedingungen', () => {
  const state = { ...newGame('bed', balance), round: 3, cash: 500, oilStock: 100 };

  it('min ist eine Untergrenze, max eine Obergrenze', () => {
    expect(conditionsMet(state, { minRound: 3, maxRound: 3, minCash: 500, maxCash: 500, minOilStock: 100 })).toBe(true);
    expect(conditionsMet(state, { minRound: 4 })).toBe(false);
    expect(conditionsMet(state, { maxCash: 499 })).toBe(false);
    expect(conditionsMet(state, {})).toBe(true);
  });

  it('zählt fördernde Quellen und eigene Pachten', () => {
    expect(conditionsMet(state, { minProducingWells: 1 })).toBe(false);
    expect(conditionsMet({ ...state, wells: [quelle] }, { minProducingWells: 1, maxProducingWells: 1 })).toBe(true);
    expect(conditionsMet(state, { minLeases: 1 })).toBe(false);
  });

  it('nennt den Grund, warum eine Wahl gesperrt ist', () => {
    expect(unmetReason(state, { minCash: 1000 })).toBe('Dafür fehlt das Geld (1.000 $ nötig).');
    expect(unmetReason(state, { minOilStock: 500 })).toBe('Dafür fehlt Öl im Tank (500 bbl nötig).');
    expect(unmetReason(state, { minCash: 100 })).toBeNull();
  });
});

describe('Effekte', () => {
  const state = { ...newGame('eff', balance), cash: 1000, oilStock: 300, royaltyOil: 200, railTariff: 0.25 };

  it('addieren auf Kasse, Tank und Bahntarif', () => {
    const nach = applyEffects(state, { cash: -150, oilStock: 100, railTariff: -0.05 });
    expect(nach.cash).toBe(850);
    expect(nach.oilStock).toBe(400);
    expect(nach.railTariff).toBe(0.2);
  });

  it('Tank und Tarif fallen nie unter null, das Förderzins-Öl nie über den Tank', () => {
    const nach = applyEffects(state, { oilStock: -1000, railTariff: -1 });
    expect(nach.oilStock).toBe(0);
    expect(nach.royaltyOil).toBe(0);
    expect(nach.railTariff).toBe(0);
    expect(applyEffects(state, { oilStock: -150 }).royaltyOil).toBe(150);
  });
});

describe('Ereignisse würfeln', () => {
  it('ohne Katalog gibt es keine Ereignisse, und die Welt ist mit Katalog dieselbe', () => {
    const ohne = newGame('welt', balance);
    const mit = newGame('welt', balance, [ereignis('a')]);
    expect(ohne.events.pending).toEqual([]);
    expect(mit.events.pending).toEqual(['a']);
    expect(mit.rng).toBe(ohne.rng);
    expect(mit.parcels).toEqual(ohne.parcels);
    expect(mit.options).toEqual(ohne.options);
    expect(endRound(ohne, balance).rng).toBe(endRound(mit, balance, [ereignis('a')]).rng);
  });

  it('ein Ereignis kommt nur, wenn die Bedingungen stimmen, und steht im Protokoll', () => {
    const state = newGame('bed', balance);
    expect(drawEvents(state, balance, [ereignis('a', { conditions: { minRound: 2 } })]).events.pending).toEqual([]);
    const nach = drawEvents(state, balance, [ereignis('a', { conditions: { maxRound: 1 } })]);
    expect(nach.events.pending).toEqual(['a']);
    expect(nach.events.seen).toEqual(['a']);
    expect(nach.log.at(-1)).toMatch(/Auf dem Schreibtisch: Titel a\.$/);
  });

  it('Chance 0 kommt nie, gleicher Seed würfelt gleich', () => {
    const state = newGame('chance', balance);
    expect(drawEvents(state, balance, [ereignis('a', { chance: 0 })]).events.pending).toEqual([]);
    const katalog = [ereignis('a', { chance: 0.5 })];
    expect(drawEvents(state, balance, katalog)).toEqual(drawEvents(state, balance, katalog));
  });

  it('höchstens maxPerRound neue je Runde, in der Reihenfolge des Katalogs', () => {
    const zwei: Balance = { ...balance, events: { maxPerRound: 2 } };
    const katalog = [ereignis('a'), ereignis('b'), ereignis('c')];
    expect(drawEvents(newGame('max', balance), { ...balance, events: { maxPerRound: 1 } }, katalog).events.pending).toEqual(['a']);
    expect(drawEvents(newGame('max', balance), zwei, katalog).events.pending).toEqual(['a', 'b']);
  });

  it('once-Ereignisse kommen einmal, andere wieder – aber nie doppelt gleichzeitig', () => {
    const einmal = [ereignis('a')];
    let state = drawEvents(newGame('once', balance), balance, einmal);
    state = autoResolve(state, einmal);
    expect(drawEvents(state, balance, einmal).events.pending).toEqual([]);
    const oefter = [ereignis('b', { once: false })];
    state = drawEvents(newGame('once', balance), balance, oefter);
    expect(drawEvents(state, balance, oefter).events.pending).toEqual(['b']);
    state = autoResolve(state, oefter);
    expect(drawEvents(state, balance, oefter).events.pending).toEqual(['b']);
  });

  it('nach dem Kapitelende kommt nichts mehr', () => {
    const state = { ...newGame('ende', balance), finished: true };
    expect(drawEvents(state, balance, [ereignis('a')]).events.pending).toEqual([]);
  });
});

describe('Antworten', () => {
  const katalog = [
    ereignis('a', {
      choices: [
        wahl('teuer', { requires: { minCash: 1_000_000 }, effects: { cash: -1_000_000 } }),
        wahl('kaufen', { effects: { cash: -100, oilStock: 50 } }),
        wahl('nein', { default: true }),
      ],
    }),
  ];
  const start = drawEvents({ ...newGame('antwort', balance), cash: 1000 }, balance, katalog);

  it('eine Antwort wirkt, kommt ins Protokoll und erledigt das Ereignis', () => {
    const r = resolveEvent(start, katalog, 'a', 'kaufen');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(900);
    expect(r.state.oilStock).toBe(start.oilStock + 50);
    expect(r.state.events.pending).toEqual([]);
    expect(r.state.log.at(-1)).toMatch(/Titel a – Ergebnis kaufen$/);
  });

  it('gesperrte, unbekannte und nicht offene Antworten gehen nicht', () => {
    expect(resolveEvent(start, katalog, 'a', 'teuer')).toEqual({ ok: false, reason: 'Dafür fehlt das Geld (1.000.000 $ nötig).' });
    expect(resolveEvent(start, katalog, 'a', 'vielleicht').ok).toBe(false);
    expect(resolveEvent(start, katalog, 'b', 'nein').ok).toBe(false);
    expect(resolveEvent({ ...start, finished: true }, katalog, 'a', 'nein').ok).toBe(false);
  });

  it('ohne Antwort gilt am Rundenende die Standard-Wahl', () => {
    const nach = endRound(start, balance, katalog);
    expect(nach.log).toContainEqual(expect.stringMatching(/Ohne Antwort: Titel a – Ergebnis nein$/));
    expect(nach.cash).toBe(endRound({ ...start, events: { ...start.events, pending: [] } }, balance).cash);
  });

  it('ist die Standard-Wahl gesperrt, gilt die erste mögliche; fehlt das Ereignis, verfällt es', () => {
    const gesperrt = [ereignis('a', { choices: [wahl('teuer', { requires: { minCash: 1e9 }, default: true }), wahl('billig')] })];
    expect(autoResolve(start, gesperrt).log.at(-1)).toMatch(/Ergebnis billig$/);
    const unbekannt = autoResolve(start, []);
    expect(unbekannt.events.pending).toEqual([]);
    expect(unbekannt.log).toEqual(start.log);
  });

  it('der Schreibtisch zeigt Texte und sagt, welche Wahl gesperrt ist', () => {
    const [karte] = deskEvents(start, katalog);
    expect(karte).toMatchObject({ id: 'a', title: 'Titel a', text: 'Text' });
    expect(karte.choices.map((c) => [c.id, c.ok])).toEqual([
      ['teuer', false],
      ['kaufen', true],
      ['nein', true],
    ]);
    expect(deskEvents(start, [])).toEqual([]);
  });

  it('der nächste Schritt weist auf das offene Ereignis hin', () => {
    expect(nextStep(start, balance)?.text).toBe('Auf dem Schreibtisch liegt etwas, das auf deine Antwort wartet.');
  });
});

describe('Spielstand mit Ereignissen', () => {
  it('offene Ereignisse überstehen Sichern und Laden', () => {
    const state = newGame('save', balance, [ereignis('a')]);
    const geladen = deserializeGame(serializeGame(state, '0.2.1'));
    expect(geladen.ok && geladen.state.events).toEqual(state.events);
  });

  it('ein Zustand ohne Ereignisse ist unvollständig', () => {
    const { events: _weg, ...ohne } = newGame('save', balance);
    expect(validateState(ohne).ok).toBe(false);
  });
});

describe('die drei Testereignisse aus content/events/', () => {
  const katalog = loadEvents();

  /** Eine Lage, in der alle drei möglich sind, und dann Runde um Runde würfeln. */
  function lauf(seed: string): GameState {
    let state: GameState = { ...newGame(seed, balance, katalog), cash: 5000, oilStock: 1000, wells: [quelle] };
    for (let i = 0; i < 4; i++) {
      state = drawEvents(autoResolve(state, katalog), balance, katalog);
    }
    return state;
  }

  it('alle drei erscheinen auf dem Schreibtisch', () => {
    const gesehen = new Set(Array.from({ length: 10 }, (_, i) => lauf(`test-${i}`).events.seen).flat());
    expect([...gesehen].sort()).toEqual(['pension_miete', 'serviettenhandel', 'thorne_vertrag']);
  });

  it('ihre Effekte wirken: Serviette verkauft Öl, Thornes Vertrag senkt den Tarif', () => {
    const state: GameState = {
      ...newGame('wirkung', balance),
      cash: 1000,
      oilStock: 600,
      events: { ...newGame('wirkung', balance).events, pending: ['serviettenhandel', 'thorne_vertrag'] },
    };
    const verkauft = resolveEvent(state, katalog, 'serviettenhandel', 'verkaufen');
    if (!verkauft.ok) throw new Error(verkauft.reason);
    expect(verkauft.state.oilStock).toBe(100);
    expect(verkauft.state.cash).toBe(1250);
    const vertrag = resolveEvent(verkauft.state, katalog, 'thorne_vertrag', 'unterschreiben');
    if (!vertrag.ok) throw new Error(vertrag.reason);
    expect(vertrag.state.cash).toBe(1050);
    expect(vertrag.state.railTariff).toBe(Math.round((state.railTariff - 0.05) * 100) / 100);
  });
});
