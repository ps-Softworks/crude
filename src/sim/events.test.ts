import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { nextStep } from './desk';
import type { Well } from './drilling';
import {
  applyEffects,
  autoResolve,
  chapterMet,
  conditionsMet,
  defaultChoice,
  deskEvents,
  deskRoutines,
  drawEvents,
  marksIntoNextChapter,
  marksMet,
  resolveEvent,
  unmetReason,
  type EventChoice,
  type EventDef,
} from './events';
import { endRound, newGame, type GameState } from './game';
import { localize } from './i18n';
import { deserializeGame, SAVE_FORMAT, serializeGame, validateState } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

function t(de: string) {
  return { de, en: '' };
}

function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}

function ereignis(id: string, extra: Partial<EventDef> = {}): EventDef {
  return { id, title: t(`Titel ${id}`), text: t('Text'), conditions: {}, marked: [], notMarked: [], delay: 1, chance: 1, once: true, routine: false, appointments: 1, choices: [wahl('ja')], ...extra };
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

  it('Kapitel: ohne Angabe gilt Kapitel 1, minChapter/maxChapter grenzen ein', () => {
    // Seit 4.5 steht das Kapitel im Spielstand (neues Spiel: 1); fehlt es in einem Teilzustand, gilt Kapitel 1.
    expect(state.chapter).toBe(1);
    const { chapter: _ohne, ...ohneKapitel } = state;
    expect(conditionsMet(ohneKapitel, { minChapter: 2 })).toBe(false);
    expect(conditionsMet(ohneKapitel, { maxChapter: 1 })).toBe(true);
    expect(conditionsMet(state, { minChapter: 1, maxChapter: 1 })).toBe(true);
    expect(conditionsMet(state, { minChapter: 2 })).toBe(false);
    expect(conditionsMet({ ...state, chapter: 2 }, { minChapter: 2, maxChapter: 2 })).toBe(true);
    expect(conditionsMet({ ...state, chapter: 3 }, { minChapter: 2, maxChapter: 2 })).toBe(false);
    expect(conditionsMet(state, { minChapter: 3 })).toBe(false);
    expect(conditionsMet({ ...state, chapter: 3 }, { minChapter: 3, maxChapter: 3 })).toBe(true);
    expect(conditionsMet({ ...state, chapter: 3 }, { maxChapter: 2 })).toBe(false);
    expect(conditionsMet({ ...state, chapter: 4 }, { minChapter: 3, maxChapter: 3 })).toBe(false);
  });

  it('Integration: Raffinerie, eigene Leitungen und Aktiengesellschaft als Bedingung', () => {
    // Ohne die Kapitel-2-Systeme ist alles 0.
    expect(conditionsMet(state, { minRefineryLevel: 1 })).toBe(false);
    expect(conditionsMet(state, { minPipelines: 1 })).toBe(false);
    expect(conditionsMet(state, { minPublicShare: 1 })).toBe(false);
    // Raffinerie: erst die fertige Stufe zählt, nicht die Baustelle.
    const bau = { ...state, refinery: { level: 0 } } as unknown as GameState;
    expect(conditionsMet(bau, { minRefineryLevel: 1 })).toBe(false);
    expect(conditionsMet({ ...state, refinery: { level: 2 } } as unknown as GameState, { minRefineryLevel: 1 })).toBe(true);
    // Leitungen: kleine Pipeline aus Kapitel 1 und fertige Fernleitungen zählen zusammen.
    const klein = { ...state, logistics: { ...state.logistics, pipeline: 'ready' } } as GameState;
    expect(conditionsMet(klein, { minPipelines: 1 })).toBe(true);
    const fern = { ...klein, bigPipelines: { projects: [{ status: 'ready' }, { status: 'building' }] } } as unknown as GameState;
    expect(conditionsMet(fern, { minPipelines: 2 })).toBe(true);
    expect(conditionsMet(fern, { minPipelines: 3 })).toBe(false);
    // Aktien: nur als Aktiengesellschaft, in Prozent der verkauften Aktien.
    expect(conditionsMet({ ...state, ipo: { share: 0.4, proceeds: 0 }, stocks: { public: false } } as unknown as GameState, { minPublicShare: 1 })).toBe(false);
    expect(conditionsMet({ ...state, ipo: { share: 0.4, proceeds: 0 }, stocks: { public: true } } as unknown as GameState, { minPublicShare: 40 })).toBe(true);
  });

  it('kein Ereignis aus content/events/k2-* oder k3-* kann in Kapitel 1 kommen', () => {
    const spaeter = loadEvents().filter((e) => /^k[23]_/.test(e.id));
    for (const e of spaeter) {
      // Integration: Die Ereignisse der Kapitel-2-Systeme (4.9 Personal, 4.10 Diplomatie, 4.11 Delaney)
      // hängen an Merkzeichen, die nur die Simulation ab ihrem Kapitel setzt (oder der Debug-Knopf
      // zur Probe) – sie tragen minChapter: 1 (jedes Kapitel). Alle anderen grenzen das Kapitel selbst ein.
      // (4.19: die Besuche zum Nachfolgekampf tragen zusätzlich maxChapter: 2.)
      if (e.conditions.minChapter === 1 && (e.conditions.maxChapter === undefined || e.conditions.maxChapter >= 2)) {
        expect(e.marked.length, e.id).toBeGreaterThan(0);
        expect(marksMet({ ...state, round: 8 }, e), e.id).toBe(false);
        continue;
      }
      expect(e.conditions.minChapter, e.id).toBeGreaterThanOrEqual(2);
      expect(conditionsMet({ ...state, round: 8, cash: 1e9, oilStock: 1e9, strength: 50 }, e.conditions), e.id).toBe(false);
    }
  });

  it('Kapitel (Phase 4): ohne Angabe ist der Spielstand in Kapitel 1; minChapter/maxChapter grenzen ein', () => {
    expect(state.chapter).toBe(1);
    expect(conditionsMet(state, { minChapter: 2 })).toBe(false);
    expect(conditionsMet(state, { maxChapter: 1 })).toBe(true);
    const k2 = { ...state, chapter: 2 };
    expect(conditionsMet(k2, { minChapter: 2, maxChapter: 2 })).toBe(true);
    expect(conditionsMet(k2, { maxChapter: 1 })).toBe(false);
    expect(conditionsMet({ ...state, chapter: 3 }, { minChapter: 2, maxChapter: 2 })).toBe(false);
  });

  it('Kapitel 2-Ereignisse kommen in Kapitel 1 nie auf den Schreibtisch, in Kapitel 2 schon', () => {
    const k2 = ereignis('k2_test', { conditions: { minChapter: 2, maxChapter: 2 } });
    let k1State: GameState = newGame('kapitel', balance, [k2]);
    for (let round = 1; round <= 16; round++) k1State = drawEvents(autoResolve({ ...k1State, round }, [k2]), balance, [k2]);
    expect(k1State.events.seen).not.toContain('k2_test');
    const k2State = drawEvents({ ...newGame('kapitel', balance, [k2]), chapter: 2 }, balance, [k2]);
    expect(k2State.events.seen).toContain('k2_test');
  });

  it('Ereignisse späterer Kapitel ändern das Würfeln in Kapitel 1 nicht (gleicher Seed, gleiche Ereignisse)', () => {
    const k1 = [ereignis('a', { chance: 0.5, once: false, cooldown: 0 }), ereignis('b', { chance: 0.5, once: false, cooldown: 0 })];
    const k2 = Array.from({ length: 30 }, (_, i) => ereignis(`k2_${i}`, { conditions: { minChapter: 2, maxChapter: 2 } }));
    const lauf = (katalog: EventDef[]) => {
      let s: GameState = newGame('gleich', balance, katalog);
      const out: string[][] = [];
      for (let round = 1; round <= 16; round++) {
        s = drawEvents(autoResolve({ ...s, round }, katalog), balance, katalog);
        out.push([...s.events.pending]);
      }
      return out;
    };
    expect(lauf([...k1, ...k2])).toEqual(lauf(k1));
  });

  it('Spielstand: chapter darf fehlen, muss sonst eine Zahl sein', () => {
    expect(validateState({ ...state }).ok).toBe(true);
    expect(validateState({ ...state, chapter: 2 }).ok).toBe(true);
    expect(validateState({ ...state, chapter: 'zwei' }).ok).toBe(false);
  });

  it('Ereignisse für Kapitel 3 kommen nie in Kapitel 1, Kapitel 1 bleibt unverändert (Phase 4)', () => {
    const katalog = loadEvents();
    const k3 = katalog.filter((e) => e.id.startsWith('k3_'));
    expect(k3.length).toBeGreaterThan(0);
    for (const e of k3) {
      expect(e.conditions.minChapter, e.id).toBe(3);
      expect(e.conditions.maxChapter, e.id).toBe(3);
      for (let round = 1; round <= balance.start.rounds; round++) expect(conditionsMet({ ...state, round }, e.conditions), e.id).toBe(false);
    }
    // Kapitel-1-Ereignisse brauchen keine Kapitel-Angabe: Ohne minChapter gelten sie nur in Kapitel 1.
    // (Die Fernleitungs-Ereignisse aus 4.7 gehören zu Kapitel 2 und tragen minChapter: 1; der Familienabend
    // mit den Kindern aus 4.5 steht bei den festen Terminen, gilt aber nur in Kapitel 2.)
    const k1 = katalog.filter((x) => !/^k[2-9]_/.test(x.id) && !x.id.startsWith('fernleitung_') && x.id !== 'termin_familie_k2');
    expect(k1.length).toBeGreaterThan(0);
    for (const e of k1) {
      expect(e.conditions.minChapter, e.id).toBeUndefined();
      expect(chapterMet(state, e.conditions), e.id).toBe(true);
      expect(chapterMet({ chapter: 3 }, e.conditions), e.id).toBe(false);
    }
    const abend = katalog.find((x) => x.id === 'termin_familie_k2')!;
    expect(chapterMet(state, abend.conditions)).toBe(false);
    expect(chapterMet({ chapter: 2 }, abend.conditions)).toBe(true);
    expect(chapterMet({ chapter: 3 }, abend.conditions)).toBe(false);
  });

  it('sichere Kapitel-1-Ereignisse (thomas_geburt, Silas, Moss, Rivalen …) tragen ausdrücklich maxChapter: 1', () => {
    const sicher = loadEvents().filter((e) => e.certain && !/^k[2-9]_/.test(e.id) && !e.id.startsWith('fernleitung_'));
    expect(sicher.map((e) => e.id)).toContain('thomas_geburt');
    for (const e of sicher) {
      expect(e.conditions.maxChapter, e.id).toBe(1);
      expect(chapterMet({ chapter: 2 }, e.conditions), e.id).toBe(false);
    }
  });

  it('chapterMet: ohne minChapter nur Kapitel 1 (bis maxChapter), mit minChapter offen nach oben (Phase 4)', () => {
    expect(chapterMet({}, {})).toBe(true);
    expect(chapterMet({ chapter: 2 }, {})).toBe(false);
    expect(chapterMet({ chapter: 3 }, {})).toBe(false);
    expect(chapterMet({ chapter: 2 }, { maxChapter: 2 })).toBe(true);
    expect(chapterMet({ chapter: 3 }, { maxChapter: 2 })).toBe(false);
    expect(chapterMet({ chapter: 1 }, { minChapter: 3 })).toBe(false);
    expect(chapterMet({ chapter: 4 }, { minChapter: 3 })).toBe(true);
    expect(chapterMet({ chapter: 4 }, { minChapter: 3, maxChapter: 3 })).toBe(false);
  });

  it('nach dem Zeitsprung in Kapitel 3 kommen keine Kapitel-1-Ereignisse und -Briefe mehr (Phase 4)', () => {
    const alle = loadEvents();
    for (const seed of ['k3-a', 'k3-b', 'k3-c']) {
      const g = newGame(seed, balance, alle);
      let s: GameState = { ...g, chapter: 3, events: { ...g.events, pending: [], due: {}, docs: {} } };
      for (let r = 0; r < 12 && !s.finished; r++) {
        s = drawEvents({ ...autoResolve(s, alle), round: s.round + 1 }, balance, alle);
        for (const id of s.events.pending) expect(id, seed).toMatch(/^k3_/);
        expect(deskRoutines(s, balance, alle).map((e) => e.id).filter((id) => !/^k[2-9]_/.test(id)), seed).toEqual([]);
      }
      // Nicht leer geprüft: Kapitel-3-Ereignisse kommen tatsächlich.
      expect(s.events.seen.some((id) => id.startsWith('k3_')), seed).toBe(true);
    }
  });

  it('Ereignisse späterer Kapitel ändern keine Partie in Kapitel 1 – gleicher Seed, gleiche Ereignisse (Phase 4)', () => {
    const alle = loadEvents();
    const nurK1 = alle.filter((e) => !/^k[2-9]_/.test(e.id));
    expect(nurK1.length).toBeLessThan(alle.length);
    for (const seed of ['kapitel-a', 'kapitel-b', 'kapitel-c']) {
      let mit = newGame(seed, balance, alle);
      let ohne = newGame(seed, balance, nurK1);
      for (let r = 0; r < balance.start.rounds && !mit.finished; r++) {
        mit = endRound(mit, balance, alle);
        ohne = endRound(ohne, balance, nurK1);
      }
      expect(mit.events.seen, seed).toEqual(ohne.events.seen);
      expect(mit.log, seed).toEqual(ohne.log);
    }
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

  it('ein Ereignis für Kapitel 2 kommt in Kapitel 1 nicht – auch nicht, wenn es sicher ist', () => {
    const state = newGame('kap', balance);
    const k2 = [ereignis('a', { conditions: { minChapter: 2 } }), ereignis('b', { conditions: { minChapter: 2 }, certain: true })];
    expect(drawEvents(state, balance, k2).events.pending).toEqual([]);
    expect(drawEvents({ ...state, chapter: 2 }, balance, k2).events.pending).toContain('b');
  });

  it('Kapitel-2-Story-Bögen (k2-story-*): Ruths Abend kommt in Kapitel 2 sicher, Ruths Wunsch je nach Kapitel-1-Merkzeichen in genau einer Fassung', () => {
    const k2 = loadEvents().filter((e) => e.id.startsWith('k2_'));
    const start = { ...newGame('k2', balance), chapter: 2 };
    expect(drawEvents(start, balance, k2).events.pending).toContain('k2_ruth_abend');
    const basis = ['k2_ruth_wunsch', 'k2_ruth_datum', 'k2_ruth_sitz'];
    const fassungen = [...basis, ...basis.map((id) => `${id}_familie`)];
    // 0.4.19+2: Als Aktiengesellschaft (mit Aufsichtsrat) die Rats-Fassung, als Familienfirma die ohne Rat.
    const ag = { ...start, stocks: { ...(start.stocks ?? {}), public: true } as GameState['stocks'], ipo: { share: 0.33, proceeds: 0 } };
    for (const [firma, endung] of [[ag, ''], [start, '_familie']] as const) {
      for (const [mark, erwartet] of [[null, 'k2_ruth_wunsch'], ['ruth_vertroestet', 'k2_ruth_datum'], ['ruth_teilhaberin', 'k2_ruth_sitz']] as const) {
        const marks = mark ? { [mark]: 0 } : {};
        const runde4 = { ...firma, round: 4, events: { ...firma.events, marks } };
        const offen = drawEvents(runde4, balance, k2).events.pending.filter((id) => fassungen.includes(id));
        expect(offen, `${String(mark)}${endung}`).toEqual([`${erwartet}${endung}`]);
      }
    }
  });

  it('Zeitsprung: späte Kapitel-1-Merkzeichen (Runde 12) gelten in Kapitel 2 ab Runde 1 als gesetzt', () => {
    const k2 = loadEvents().filter((e) => e.id.startsWith('k2_'));
    const start = { ...newGame('k2-spaet', balance), chapter: 2 };
    const spaet = { ...start.events, marks: { silas_fair: 12, ruth_vertroestet: 12, nora_bestechung: 14 } };
    // Ohne Übertrag zählte delay ab Kapitel-1-Runde 12 – die Szenen kämen erst spät oder nie.
    const ohne = drawEvents({ ...start, round: 4, events: spaet }, balance, k2).events.pending;
    expect(ohne).not.toContain('k2_silas_rat');
    expect(ohne).not.toContain('k2_ruth_datum');
    const uebertragen = marksIntoNextChapter(spaet);
    expect(Object.values(uebertragen.marks)).toEqual([0, 0, 0]);
    expect(Object.keys(uebertragen.marks)).toEqual(Object.keys(spaet.marks));
    const mit = drawEvents({ ...start, round: 4, events: uebertragen }, balance, k2).events.pending;
    // Familienfirma (newGame ohne Börsengang): die Fassungen ohne Aufsichtsrat (0.4.19+2).
    expect(mit).toContain('k2_silas_bank');
    expect(mit).toContain('k2_ruth_datum_familie');
    expect(mit).not.toContain('k2_ruth_wunsch_familie');
    expect(mit).not.toContain('k2_silas_rat');
    expect(drawEvents({ ...start, round: 2, events: uebertragen }, balance, k2).events.pending).toContain('k2_nora_absatz');
  });

  it('Chance 0 kommt nie, gleicher Seed würfelt gleich', () => {
    const state = newGame('chance', balance);
    expect(drawEvents(state, balance, [ereignis('a', { chance: 0 })]).events.pending).toEqual([]);
    const katalog = [ereignis('a', { chance: 0.5 })];
    expect(drawEvents(state, balance, katalog)).toEqual(drawEvents(state, balance, katalog));
  });

  it('höchstens maxPerRound neue je Runde, in zufälliger Reihenfolge (2.10b)', () => {
    const zwei: Balance = { ...balance, events: { ...balance.events, maxPerRound: 2 } };
    const eins: Balance = { ...balance, events: { ...balance.events, maxPerRound: 1 } };
    const katalog = [ereignis('a'), ereignis('b'), ereignis('c')];
    expect(drawEvents(newGame('max', balance), eins, katalog).events.pending.length).toBe(1);
    expect(drawEvents(newGame('max', balance), zwei, katalog).events.pending.length).toBe(2);
    // Kein Vorrang für Ereignisse vorn im Katalog (sonst kämen späte Dateien kaum je vor).
    const erste = Array.from({ length: 300 }, (_, i) => drawEvents(newGame(`fair-${i}`, balance), eins, katalog).events.pending[0]);
    for (const id of ['a', 'b', 'c']) {
      const anteil = erste.filter((x) => x === id).length / erste.length;
      expect(anteil, id).toBeGreaterThan(0.2);
      expect(anteil, id).toBeLessThan(0.47);
    }
    // Gleicher Seed, gleiche Reihenfolge.
    expect(drawEvents(newGame('max', balance), eins, katalog).events.pending).toEqual(drawEvents(newGame('max', balance), eins, katalog).events.pending);
  });

  it('once-Ereignisse kommen einmal, andere wieder – aber nie doppelt gleichzeitig', () => {
    const einmal = [ereignis('a')];
    let state = drawEvents(newGame('once', balance), balance, einmal);
    state = autoResolve(state, einmal);
    expect(drawEvents(state, balance, einmal).events.pending).toEqual([]);
    const oefter = [ereignis('b', { once: false, cooldown: 0 })];
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
    const r = resolveEvent(start, balance, katalog, 'a', 'kaufen');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(900);
    expect(r.state.oilStock).toBe(start.oilStock + 50);
    expect(r.state.events.pending).toEqual([]);
    expect(r.state.log.at(-1)).toMatch(/Titel a – Ergebnis kaufen$/);
  });

  it('gesperrte, unbekannte und nicht offene Antworten gehen nicht', () => {
    expect(resolveEvent(start, balance, katalog, 'a', 'teuer')).toEqual({ ok: false, reason: 'Dafür fehlt das Geld (1.000.000 $ nötig).' });
    expect(resolveEvent(start, balance, katalog, 'a', 'vielleicht').ok).toBe(false);
    expect(resolveEvent(start, balance, katalog, 'b', 'nein').ok).toBe(false);
    expect(resolveEvent({ ...start, finished: true }, balance, katalog, 'a', 'nein').ok).toBe(false);
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
    const [karte] = deskEvents(start, balance, katalog);
    expect(karte).toMatchObject({ id: 'a', title: 'Titel a', text: 'Text' });
    expect(karte.choices.map((c) => [c.id, c.ok])).toEqual([
      ['teuer', false],
      ['kaufen', true],
      ['nein', true],
    ]);
    expect(deskEvents(start, balance, [])).toEqual([]);
  });

  it('die Standardantwort ist markiert – default, sonst die erste mögliche (0.2.15+11)', () => {
    const [karte] = deskEvents(start, balance, katalog);
    expect(karte.choices.filter((c) => c.fallback).map((c) => c.id)).toEqual(['nein']);
    expect(defaultChoice(start, katalog[0])?.id).toBe('nein');
    // Ohne default: die erste mögliche – die teure ist gesperrt.
    const ohne = ereignis('a', { choices: [wahl('teuer', { requires: { minCash: 1_000_000 } }), wahl('kaufen')] });
    expect(defaultChoice(start, ohne)?.id).toBe('kaufen');
    expect(deskEvents(start, balance, [ohne])[0].choices.filter((c) => c.fallback).map((c) => c.id)).toEqual(['kaufen']);
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

describe('Nachwirkung: Merkzeichen (2.2)', () => {
  const katalog = [
    ereignis('anlass', { choices: [wahl('fair', { marks: ['fair'] }), wahl('betrug', { marks: ['betrug'], default: true })] }),
    ereignis('dank', { marked: ['fair'], delay: 2 }),
    ereignis('rache', { marked: ['betrug'], delay: 1 }),
    ereignis('ohne_betrug', { notMarked: ['betrug'] }),
  ];
  const start = { ...newGame('marken', balance), events: { ...newGame('marken', balance).events, pending: ['anlass'], seen: ['anlass'] } };

  it('eine Wahl setzt ihre Merkzeichen mit der Runde, verdeckt und nur beim ersten Mal', () => {
    const r = resolveEvent({ ...start, round: 3 }, balance, katalog, 'anlass', 'fair');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.events.marks).toEqual({ fair: 3 });
    expect(r.state.log.at(-1)).not.toMatch(/fair:/);
    const spaeter = applyMarksAgain(r.state);
    expect(spaeter.events.marks).toEqual({ fair: 3 });
  });

  /** Dieselbe Wahl in einer späteren Runde noch einmal. */
  function applyMarksAgain(state: GameState): GameState {
    const r = resolveEvent({ ...state, round: 7, events: { ...state.events, pending: ['anlass'] } }, balance, katalog, 'anlass', 'fair');
    if (!r.ok) throw new Error(r.reason);
    return r.state;
  }

  it('auch die Standard-Wahl ohne Antwort setzt Merkzeichen', () => {
    expect(autoResolve(start, katalog).events.marks).toEqual({ betrug: 1 });
  });

  it('marked wartet auf das Merkzeichen und delay Runden', () => {
    const marks = (m: Record<string, number>, round: number): GameState => ({ ...start, round, events: { ...start.events, pending: [], seen: ['anlass'], marks: m } });
    expect(marksMet(marks({}, 5), katalog[1])).toBe(false);
    expect(marksMet(marks({ fair: 3 }, 4), katalog[1])).toBe(false);
    expect(marksMet(marks({ fair: 3 }, 5), katalog[1])).toBe(true);
    expect(drawEvents(marks({ fair: 3 }, 4), balance, katalog.slice(0, 2)).events.pending).toEqual([]);
    expect(drawEvents(marks({ fair: 3 }, 5), balance, katalog.slice(0, 2)).events.pending).toEqual(['dank']);
  });

  it('notMarked sperrt, sobald das Merkzeichen gesetzt ist', () => {
    const ohne: GameState = { ...start, events: { ...start.events, pending: [] } };
    expect(marksMet(ohne, katalog[3])).toBe(true);
    expect(marksMet({ ...ohne, events: { ...ohne.events, marks: { betrug: 1 } } }, katalog[3])).toBe(false);
  });

  it('über endRound: Betrug in Runde 1 bringt die Rache ab Runde 2, nie den Dank', () => {
    const kat = [katalog[0], katalog[1], katalog[2]];
    let state = endRound(start, balance, kat);
    expect(state.round).toBe(2);
    expect(state.events.marks).toEqual({ betrug: 1 });
    expect(state.events.pending).toEqual(['rache']);
    for (let i = 0; i < 4; i++) state = endRound(state, balance, kat);
    expect(state.events.seen).not.toContain('dank');
  });

  it('Merkzeichen überstehen Sichern und Laden; alte Spielstände bekommen leere Merkzeichen', () => {
    const state = autoResolve(start, katalog);
    const geladen = deserializeGame(serializeGame(state, '0.2.2'));
    expect(geladen.ok && geladen.state.events.marks).toEqual({ betrug: 1 });
    const { marks: _weg, ...altEvents } = state.events;
    const alt = JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.2.1', savedRound: 1, state: { ...state, events: altEvents } });
    const altGeladen = deserializeGame(alt);
    expect(altGeladen.ok && altGeladen.state.events.marks).toEqual({});
    expect(validateState({ ...state, events: { ...state.events, marks: { x: 'eins' } } }).ok).toBe(false);
  });
});

describe('die Probe-Ereignisse für Kapitel 1 aus content/events/', () => {
  const katalog = loadEvents();
  const ANLAESSE = ['moss_schulden', 'nora_brand', 'ruth_buecher', 'silas_schnaps', 'vale_umschlag'];

  /** Runde um Runde würfeln, ohne zu antworten (Standard-Wahl), in einer Lage, in der fast alles geht. */
  function lauf(seed: string, cash: number): GameState {
    let state: GameState = { ...newGame(seed, balance, katalog), cash, oilStock: 1000, wells: [quelle] };
    for (let round = 1; round <= 12; round++) {
      state = drawEvents(autoResolve({ ...state, round, cash }, katalog), balance, katalog);
    }
    return state;
  }

  it('alle fünf Anlässe erscheinen auf dem Schreibtisch', () => {
    const gesehen = new Set(Array.from({ length: 20 }, (_, i) => [lauf(`probe-${i}`, 300), lauf(`probe-${i}`, 5000)].flatMap((s) => s.events.seen)).flat());
    for (const id of ANLAESSE) expect(gesehen).toContain(id);
  });

  it('Moss: fair geholfen bringt später den Dank, betrogen den Zaun – nie beides', () => {
    let state: GameState = { ...newGame('moss', balance, katalog), round: 4, cash: 1000, events: { ...newGame('moss', balance).events, pending: ['moss_schulden'] } };
    const fair = resolveEvent(state, balance, katalog, 'moss_schulden', 'leihen');
    const betrug = resolveEvent(state, balance, katalog, 'moss_schulden', 'papier');
    if (!fair.ok || !betrug.ok) throw new Error('Wahl ging nicht');
    expect(fair.state.cash).toBe(700);
    expect(fair.state.events.marks).toEqual({ moss_fair: 4 });
    expect(betrug.state.events.marks).toEqual({ moss_betrogen: 4, moss_feind: 4 });
    const moss = katalog.filter((e) => e.id.startsWith('moss_'));
    const kommt = (s: GameState, round: number) =>
      moss.filter((e) => e.id !== 'moss_schulden' && conditionsMet({ ...s, round }, e.conditions) && marksMet({ ...s, round }, e)).map((e) => e.id);
    expect(kommt(betrug.state, 5)).toEqual([]);
    expect(kommt(betrug.state, 6)).toEqual(['moss_wagenweg']);
    expect(kommt(fair.state, 6)).toEqual([]);
    expect(kommt(fair.state, 7)).toEqual(['moss_dank']);
    state = { ...betrug.state, round: 6, oilStock: 500, cash: 0, events: { ...betrug.state.events, pending: ['moss_wagenweg'] } };
    expect(autoResolve(state, katalog).oilStock).toBe(300);
  });

  it('Vale kommt nur bei knapper Kasse, und ohne Antwort behält Jacob das Geld', () => {
    const vale = katalog.find((e) => e.id === 'vale_umschlag')!;
    const state = { ...newGame('vale', balance), round: 3 };
    expect(conditionsMet({ ...state, cash: 400 }, vale.conditions)).toBe(true);
    expect(conditionsMet({ ...state, cash: 401 }, vale.conditions)).toBe(false);
    const nach = autoResolve({ ...state, cash: 100, events: { ...state.events, pending: ['vale_umschlag'] } }, katalog);
    expect(nach.cash).toBe(600);
    expect(nach.events.marks).toEqual({ vale_geld: 3 });
  });
});

describe('Bedingungen Familienfirma, Claras Alter, Beziehung zu Thomas (0.4.19+2)', () => {
  it('maxPublicShare 0 gilt nur für die Familienfirma, minPublicShare 1 nur für die Aktiengesellschaft', () => {
    const familie = newGame('bed-familie', balance);
    const ag = { ...familie, stocks: { ...(familie.stocks ?? {}), public: true } as GameState['stocks'], ipo: { share: 0.2, proceeds: 0 } };
    expect(conditionsMet(familie, { maxPublicShare: 0 })).toBe(true);
    expect(conditionsMet(familie, { minPublicShare: 1 })).toBe(false);
    expect(conditionsMet(ag, { maxPublicShare: 0 })).toBe(false);
    expect(conditionsMet(ag, { minPublicShare: 1 })).toBe(true);
  });

  it('Claras Alter zählt ab ihrer Geburt in ganzen Jahren, vorher −1; Thomas-Beziehung 0–100', () => {
    const s = newGame('bed-clara', balance);
    expect(conditionsMet(s, { maxClaraAge: -1 })).toBe(true);
    const geboren = { ...s, round: 30, family: { ...s.family, claraBorn: 22, thomas: 30 } };
    expect(conditionsMet(geboren, { minClaraAge: 2, maxClaraAge: 2 })).toBe(true);
    expect(conditionsMet(geboren, { minClaraAge: 3 })).toBe(false);
    expect(conditionsMet(geboren, { maxThomasBond: 34 })).toBe(true);
    expect(conditionsMet(geboren, { minThomasBond: 35 })).toBe(false);
  });
});
