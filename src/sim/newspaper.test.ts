import { readFileSync } from 'node:fs';
import { soldThisRound } from './pricing';
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { botTurn } from './bots';
import { endRound, newGame, type GameState } from './game';
import {
  HEADLINE_IDS,
  brandHeadline,
  delaneyHeadline,
  headlineVariant,
  pipelineHeadline,
  expectedPrice,
  makeNewspaper,
  marketOutlook,
  newsItems,
  parseNewspaperContent,
  type Outlook,
} from './newspaper';
import { Rng, seedFromString } from './rng';
import type { RivalWell } from './rival';
import type { Well } from './drilling';
import { loadBalance } from './testBalance';
import { newBigPipelines } from './bigPipeline';
import { newInvestigation, type InvestigationState } from './investigation';
import { newBrand } from './brand';
import { openExchange } from './exchange';
import { parseExchangeContent } from './exchangeContent';

const balance = loadBalance();
const FILE = 'content/newspaper.yaml';
const text = readFileSync(new URL('../../content/newspaper.yaml', import.meta.url), 'utf8');
const parsed = parseNewspaperContent(FILE, text);
const content = parsed.content!;

/** Bullard hat in der letzten Runde n Quellen gefunden (noch volle Anfangsrate). */
function mitBullardFunden(state: GameState, n: number): GameState {
  const neu: RivalWell[] = Array.from({ length: n }, (_, i) => ({
    parcelId: `x${i}`,
    startRound: state.round - 1,
    roundsLeft: 0,
    status: 'found',
    rate: balance.rivals.bullard.ratePerWell,
    royalty: 0.125,
  }));
  return { ...state, rival: { ...state.rival, wells: [...state.rival.wells, ...neu] } };
}

function aenderung(vorher: number, nachher: number): number {
  return (nachher - vorher) / vorher;
}

describe('Zeitung: Inhalte', () => {
  it('content/newspaper.yaml ist vollständig und hat alle Schlagzeilen mit Deutsch und Englisch', () => {
    expect(parsed.errors).toEqual([]);
    for (const id of HEADLINE_IDS) {
      expect(content.headlines[id].title.de).not.toBe('');
      expect(content.headlines[id].text.de).not.toBe('');
      expect(content.headlines[id].title.en).not.toBe('');
    }
  });

  it('meldet fehlende Schlagzeilen und fehlendes Deutsch', () => {
    const kaputt = parseNewspaperContent(
      'x.yaml',
      'name: { de: Blatt, en: Paper }\nheadlines:\n  outlook_fall: { title: { de: "", en: x }, text: { de: y } }\n  quatsch: {}\n',
    );
    expect(kaputt.content).toBeNull();
    const meldungen = kaputt.errors.map((e) => e.message).join('\n');
    expect(meldungen).toContain('outlook_crash');
    expect(meldungen).toContain('outlook_fall.title: deutscher Text fehlt');
    expect(meldungen).toContain('quatsch');
  });

  it('meldet kaputtes YAML', () => {
    expect(parseNewspaperContent('x.yaml', 'name: [').errors.length).toBeGreaterThan(0);
  });

  it('Englisch fehlt → Deutsch wird gezeigt', () => {
    const ohne = {
      ...content,
      headlines: { ...content.headlines, outlook_steady: { title: { de: 'Ruhe', en: '' }, text: { de: 'Nichts.', en: '' } } },
    };
    const state = newGame('ruhe', balance);
    expect(marketOutlook(state, balance)).toBe('steady');
    expect(makeNewspaper(state, balance, ohne, 'en').front.title).toBe('Ruhe');
  });
});

describe('Zeitung: Frühwarnzeichen (GDD §7.2)', () => {
  it('kündigt einen Preisverfall an, bevor er kommt', () => {
    // Bullard hat am Ende der letzten Runde drei Quellen gefunden. Im Markt
    // stecken sie erst am Ende dieser Runde – die Zeitung schreibt es schon heute.
    const heute = mitBullardFunden(newGame('fruehwarnung', balance), 3);
    const preisHeute = heute.postedPrice;
    const zeitung = makeNewspaper(heute, balance, content);
    expect(['outlook_fall', 'outlook_crash']).toContain(zeitung.front.id);
    const h = content.headlines[zeitung.front.id];
    expect([h, ...(h.variants ?? [])].map((f) => f.title.de)).toContain(zeitung.front.title);
    // Noch ist der Preis nicht gefallen …
    expect(heute.priceHistory.at(-1)).toBe(preisHeute);
    // … aber am Ende der Runde.
    const morgen = endRound(heute, balance);
    expect(aenderung(preisHeute, morgen.postedPrice)).toBeLessThanOrEqual(-balance.newspaper.fallFrom);
  });

  it('ein sehr großes Überangebot gibt die schärfere Schlagzeile', () => {
    const heute = mitBullardFunden(newGame('schwemme', balance), 8);
    expect(marketOutlook(heute, balance)).toBe('crash');
    const morgen = endRound(heute, balance);
    expect(aenderung(heute.postedPrice, morgen.postedPrice)).toBeLessThanOrEqual(-balance.newspaper.crashFrom);
  });

  it('ohne neues Angebot bleibt die Titelseite ruhig (die Nachbarn allein sind kein Alarm)', () => {
    // Bullard ohne Geld: Er pachtet und bohrt nicht, nur die Nachbarn bohren weiter.
    const start = newGame('ruhig', balance);
    let state: GameState = { ...start, rival: { ...start.rival, cash: 0 } };
    for (let i = 0; i < 5; i++) {
      expect(marketOutlook(state, balance)).toBe('steady');
      state = endRound(state, balance);
    }
  });

  it('weniger Angebot als bisher → steigender Preis wird angekündigt', () => {
    const knapp: Balance = {
      ...balance,
      market: { ...balance.market, neighbours: { ...balance.market.neighbours, newWellsPerRound: -3 } },
    };
    const heute = endRound(newGame('knapp', knapp), knapp);
    expect(marketOutlook(heute, knapp)).toBe('rise');
    const morgen = endRound(heute, knapp);
    expect(aenderung(heute.postedPrice, morgen.postedPrice)).toBeGreaterThanOrEqual(knapp.newspaper.riseFrom);
  });

  it('die Schätzung trifft den Preis vom Rundenende, wenn nichts Unerwartetes passiert (viele Partien mit Bots)', () => {
    const gesehen = new Set<Outlook>();
    for (let s = 0; s < 15; s++) {
      const seed = `zeitung-${s}`;
      const rng = new Rng(seedFromString(seed + ':bot'));
      let state = newGame(seed, balance);
      while (!state.finished) {
        // Der Spieler handelt, dann endet die Runde. Seit 0.2.15+7 kann ein Zug die Förderung
        // dieser Runde ändern (Pumpe nachrüsten) – die Schätzung gilt für den Stand nach seinen Zügen.
        const gespielt = botTurn(state, balance, 'gierig', rng);
        const outlook = marketOutlook(gespielt, balance);
        gesehen.add(outlook);
        // Etappe 2: Der Preis rechnet mit Jacobs Verkauf – nach seinem Zug steht der fest.
        const schaetzung = expectedPrice(gespielt, balance, soldThisRound(gespielt));
        const naechste = endRound(gespielt, balance);
        expect(naechste.priceHistory.at(-1)).toBe(schaetzung);
        const change = aenderung(state.postedPrice, naechste.priceHistory.at(-1)!);
        // Die Zeitung nimmt an, dass Jacob verkauft, was er fördert; hält er Öl zurück, darf sie danebenliegen.
        const wieAngenommen = expectedPrice(gespielt, balance) === schaetzung;
        if (wieAngenommen && (outlook === 'fall' || outlook === 'crash')) expect(change).toBeLessThanOrEqual(-balance.newspaper.fallFrom + 1e-9);
        if (wieAngenommen && outlook === 'steady') expect(Math.abs(change)).toBeLessThan(balance.newspaper.fallFrom);
        if (naechste.ending === 'pleite') break;
        state = naechste;
      }
    }
    // Die Warnung kommt in echten Partien auch tatsächlich vor.
    expect(gesehen.has('fall') || gesehen.has('crash')).toBe(true);
  });

  it('die Zeitung zeigt nie eine Zahl', () => {
    const state = mitBullardFunden(newGame('zahlen', balance), 3);
    const zeitung = makeNewspaper(state, balance, content);
    for (const h of [zeitung.front, ...zeitung.items]) expect(`${h.title} ${h.text}`).not.toMatch(/\d/);
  });

  it('die Zeitung ändert den Spielstand nicht', () => {
    const state = mitBullardFunden(newGame('rein', balance), 2);
    const kopie = structuredClone(state);
    makeNewspaper(state, balance, content);
    expect(state).toEqual(kopie);
  });
});

describe('Zeitung: Kurzmeldungen', () => {
  it('ohne Neuigkeiten: Kleinanzeigen', () => {
    expect(newsItems(newGame('leer', balance), balance)).toEqual(['classifieds']);
  });

  it('Bullards neuer Fund kommt in die Zeitung, ein alter nicht mehr', () => {
    const state = mitBullardFunden(newGame('bullard', balance), 1);
    expect(newsItems(state, balance)).toContain('rival_find');
    const alt = { ...state, rival: { ...state.rival, wells: state.rival.wells.map((w) => ({ ...w, rate: 100 })) } };
    expect(newsItems(alt, balance)).not.toContain('rival_find');
  });

  it('Jacobs neuer Fund: Gusher vor kleinem Fund', () => {
    const base = newGame('jacob', balance);
    const quelle = (result: 'small' | 'gusher', roundsProduced: number): Well =>
      ({
        parcelId: `q${result}${roundsProduced}`,
        stage: 1,
        status: 'found',
        roundsLeft: 0,
        spent: 1000,
        oilStage: 1,
        result,
        production: { initialRate: 1000, roundsProduced, lastRate: 0, total: 0 },
        startRound: 1,
      }) as Well;
    expect(newsItems({ ...base, wells: [quelle('small', 0)] }, balance)).toEqual(['jacob_find']);
    expect(newsItems({ ...base, wells: [quelle('small', 0), quelle('gusher', 0)] }, balance)).toEqual(['jacob_gusher']);
    expect(newsItems({ ...base, wells: [quelle('gusher', 2)] }, balance)).toEqual(['classifieds']);
  });

  it('Preissprung der letzten Runde wird gemeldet; höchstens maxItems Meldungen', () => {
    const base = mitBullardFunden(newGame('preis', balance), 1);
    const gesenkt = { ...base, priceHistory: [1, 0.8] };
    expect(newsItems(gesenkt, balance)[0]).toBe('price_cut');
    expect(newsItems({ ...base, priceHistory: [0.8, 1] }, balance)[0]).toBe('price_raise');
    const eine: Balance = { ...balance, newspaper: { ...balance.newspaper, maxItems: 1 } };
    expect(newsItems(gesenkt, eine)).toEqual(['price_cut']);
  });
});

describe('Zeitung: Weltmeldungen haben Vorrang vor Platzmangel (4.1)', () => {
  const quelle = {
    parcelId: 'neu',
    stage: 1,
    status: 'found',
    roundsLeft: 0,
    spent: 1000,
    oilStage: 1,
    result: 'small',
    production: { initialRate: 1000, roundsProduced: 0, lastRate: 0, total: 0 },
    startRound: 1,
  } as Well;
  // Drei Meldungen aus Salt Hill: Preissturz, Jacobs Fund, Bullards Fund – die Zeitung ist voll (maxItems 3).
  const voll = { ...mitBullardFunden(newGame('voll', balance), 1), priceHistory: [1, 0.8], wells: [quelle] };
  const mitWelt = (news: GameState['worldModel']['news']): GameState => ({ ...voll, worldModel: { ...voll.worldModel, news } });

  it('drei lokale Meldungen füllen die Zeitung', () => {
    expect(balance.newspaper.maxItems).toBe(3);
    expect(newsItems(voll, balance)).toEqual(['price_cut', 'jacob_find', 'rival_find']);
  });

  it('ein Crash, Krieg, eine Verstaatlichung oder ein Riesenfund fällt nie weg, sondern steht vorn', () => {
    expect(newsItems(mitWelt(['crash']), balance)).toEqual(['world_crash', 'price_cut', 'jacob_find']);
    expect(newsItems(mitWelt(['war']), balance)[0]).toBe('world_war');
    expect(newsItems(mitWelt(['nationalization']), balance)[0]).toBe('world_nationalization');
    expect(newsItems(mitWelt(['glut', 'peace']), balance)[0]).toBe('world_glut');
    const eine: Balance = { ...balance, newspaper: { ...balance.newspaper, maxItems: 1 } };
    expect(newsItems(mitWelt(['crash']), eine)).toEqual(['world_crash']);
  });

  it('kleine Weltmeldungen (Wahl, Frieden, Stimmungen) stehen hinten an und weichen bei voller Zeitung', () => {
    expect(newsItems(mitWelt(['peace']), balance)).toEqual(['price_cut', 'jacob_find', 'rival_find']);
    const ruhig = { ...newGame('ruhig', balance), priceHistory: [1, 0.8] };
    expect(newsItems({ ...ruhig, worldModel: { ...ruhig.worldModel, news: ['peace'] } }, balance)).toEqual(['price_cut', 'world_peace']);
  });
});

describe('Zeitung: Spielzahlen', () => {
  it('balance.yaml: newspaper muss da sein und crashFrom ≥ fallFrom', async () => {
    const { parseBalance, BalanceError } = await import('./balance');
    const ohne = structuredClone(balance) as unknown as Record<string, unknown>;
    delete ohne.newspaper;
    expect(() => parseBalance(ohne)).toThrow(/newspaper/);
    const verdreht = structuredClone(balance);
    verdreht.newspaper.crashFrom = 0.01;
    expect(() => parseBalance(verdreht)).toThrow(BalanceError);
  });
});

describe('Kurzmeldung zu Cranes Abschlag (2.8)', () => {
  it('erscheint in der ersten Runde des Abschlags, nicht davor und nicht danach', () => {
    const base = newGame('abschlag', balance);
    const mit = (round: number): GameState => ({ ...base, round, events: { ...base.events, marks: { crane_abschlag: 6 } } });
    expect(newsItems(mit(6), balance)).not.toContain('crane_cut');
    expect(newsItems(mit(7), balance)).toContain('crane_cut');
    expect(newsItems(mit(8), balance)).not.toContain('crane_cut');
  });
});

// 0.4.20+9: Varianten, neue Meldungen und Börsenseite aus der Simulation.
describe('Zeitung: Fassungen derselben Schlagzeile (0.4.20+9)', () => {
  it('Marktschlagzeilen haben mehrere Fassungen mit Deutsch und Englisch', () => {
    for (const id of ['outlook_crash', 'outlook_fall', 'outlook_rise', 'outlook_steady', 'price_cut', 'price_raise'] as const) {
      const v = content.headlines[id].variants ?? [];
      expect(v.length).toBeGreaterThanOrEqual(3);
      for (const f of v) {
        expect(f.title.de).not.toBe('');
        expect(f.text.en).not.toBe('');
        expect(f.title.de).not.toMatch(/\d/);
      }
    }
  });

  it('dieselbe Fassung erscheint nie zweimal hintereinander, und gleich gerechnet kommt dasselbe heraus', () => {
    for (const seed of ['a', 'b', 'zeitung']) {
      for (const n of [2, 3, 4]) {
        let vorher = -1;
        const gesehen = new Set<number>();
        for (let r = 1; r <= 60; r++) {
          const v = headlineVariant(seed, 'outlook_steady', r, n);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(n);
          expect(v).not.toBe(vorher);
          expect(headlineVariant(seed, 'outlook_steady', r, n)).toBe(v);
          gesehen.add(v);
          vorher = v;
        }
        expect(gesehen.size).toBe(n);
      }
    }
    expect(headlineVariant('a', 'x', 5, 1)).toBe(0);
  });

  it('bei gleichem Markt wechselt die Titelseite von Runde zu Runde', () => {
    const g = newGame('ruhe', balance);
    // Gleiche Lage, nur die Runde zählt weiter (der Markt kann trotzdem kippen – verglichen wird nur bei gleicher Aussicht).
    const titel = Array.from({ length: 12 }, (_, i) => makeNewspaper({ ...g, round: i + 1 }, balance, content).front);
    let gleich = 0;
    for (let i = 1; i < titel.length; i++) {
      if (titel[i].id !== titel[i - 1].id) continue;
      gleich += 1;
      expect(titel[i].title).not.toBe(titel[i - 1].title);
    }
    expect(gleich).toBeGreaterThan(0);
  });

  it('kaputte Fassungen werden gemeldet', () => {
    const kaputt = parseNewspaperContent(FILE, text.replace('    variants:\n      - title:', '    variants:\n      - titel:'));
    expect(kaputt.content).toBeNull();
    expect(kaputt.errors.some((e) => e.message.includes('variants'))).toBe(true);
  });
});

describe('Zeitung: Fernleitung, Delaney, Benzinpreiskampf (0.4.20+9)', () => {
  const base = { ...newGame('neu', balance), round: 10 };
  const brief = (kind: 'ready' | 'sabotage', round: number) => ({ round, kind, projectId: 'f1', rightId: '', party: 'bau' as const, owner: '', ranch: '', amount: 0 });

  it('Fernleitung fertig oder gesprengt – nur in der Ausgabe nach der Runde', () => {
    const bp = newBigPipelines(base.seed);
    expect(pipelineHeadline({ ...base, bigPipelines: { ...bp, letters: [brief('ready', 9)] } })).toBe('pipeline_built');
    expect(pipelineHeadline({ ...base, bigPipelines: { ...bp, letters: [brief('sabotage', 9), brief('ready', 9)] } })).toBe('pipeline_built');
    expect(pipelineHeadline({ ...base, bigPipelines: { ...bp, letters: [brief('sabotage', 9)] } })).toBe('pipeline_damaged');
    expect(pipelineHeadline({ ...base, bigPipelines: { ...bp, letters: [brief('sabotage', 8)] } })).toBeNull();
    expect(pipelineHeadline(base)).toBeNull();
    expect(newsItems({ ...base, bigPipelines: { ...bp, letters: [brief('ready', 9)] } }, balance)).toContain('pipeline_built');
  });

  it('Delaney: jede neue Stufe und jeder Ausgang der letzten Runde hat eine Meldung', () => {
    const inv = newInvestigation(base, balance);
    const mit = (stage: InvestigationState['stage'], since: number, verdict: InvestigationState['verdict'] = null) => ({ ...base, investigation: { ...inv, stage, since, verdict } });
    expect(delaneyHeadline(mit('geruecht', 9))).toBe('delaney_rumor');
    expect(delaneyHeadline(mit('vorermittlung', 9))).toBe('delaney_probe');
    expect(delaneyHeadline(mit('anklage', 9))).toBe('delaney_charge');
    expect(delaneyHeadline(mit('abgeschlossen', 9, 'eingestellt'))).toBe('delaney_dropped');
    expect(delaneyHeadline(mit('abgeschlossen', 9, 'vergleich'))).toBe('delaney_settled');
    expect(delaneyHeadline(mit('abgeschlossen', 9, 'freispruch'))).toBe('delaney_acquitted');
    expect(delaneyHeadline(mit('abgeschlossen', 9, 'geldstrafe'))).toBe('delaney_convicted');
    expect(delaneyHeadline(mit('abgeschlossen', 9, 'schwere_strafe'))).toBe('delaney_convicted');
    // Ältere Stufe, Rückkehr zur Ruhe, kein Fall: nichts.
    expect(delaneyHeadline(mit('anklage', 8))).toBeNull();
    expect(delaneyHeadline(mit('ruhe', 9))).toBeNull();
    expect(delaneyHeadline(base)).toBeNull();
    expect(newsItems(mit('anklage', 9), balance)).toContain('delaney_charge');
  });

  it('Benzinpreiskampf: Beginn vor Ende, gelesen aus der letzten Markenabrechnung', () => {
    const b = newBrand(base.seed, balance);
    expect(brandHeadline({ brand: { ...b, news: [{ kind: 'priceWarStart', region: 'x' }] } })).toBe('brand_price_war');
    expect(brandHeadline({ brand: { ...b, news: [{ kind: 'priceWarEnd', region: 'y' }, { kind: 'priceWarStart', region: 'x' }] } })).toBe('brand_price_war');
    expect(brandHeadline({ brand: { ...b, news: [{ kind: 'priceWarEnd', region: 'y' }] } })).toBe('brand_price_war_end');
    expect(brandHeadline({ brand: { ...b, news: [{ kind: 'opened', region: 'y', count: 1 }] } })).toBeNull();
    expect(brandHeadline({})).toBeNull();
  });
});

describe('Zeitung: Börsenseite aus der Simulation (0.4.20+9)', () => {
  const boerse = parseExchangeContent(
    'content/exchange.yaml',
    readFileSync(new URL('../../content/exchange.yaml', import.meta.url), 'utf8'),
    balance.exchange.stocks.map((s) => s.id),
  ).content!;

  it('ohne Börse oder ohne Börsentexte keine Börsenseite', () => {
    const g = newGame('boerse', balance);
    expect(makeNewspaper(g, balance, content, undefined, undefined, boerse).exchange).toBeNull();
    const mitBoerse = openExchange(g, balance);
    expect(makeNewspaper(mitBoerse, balance, content).exchange).toBeNull();
  });

  it('mit Börse baut makeNewspaper die Seite samt Kurszettel; Harlan Oil erst nach dem Börsengang', () => {
    const g = openExchange(newGame('boerse', balance), balance);
    const seite = makeNewspaper(g, balance, content, undefined, undefined, boerse).exchange!;
    expect(seite.title).toBe(boerse.headlines[seite.id].title.de);
    expect(seite.quotes.map((q) => q.id)).toEqual(balance.exchange.stocks.map((s) => s.id));
    expect(seite.quotes.some((q) => q.own)).toBe(false);
    const ag = { ...g, stocks: { public: true, price: 12, priceHistory: [10, 12] } as unknown as GameState['stocks'] };
    const eigene = makeNewspaper(ag, balance, content, undefined, undefined, boerse).exchange!.quotes.at(-1)!;
    expect(eigene.id).toBe('own');
    expect(eigene.name).toBe(boerse.own.de);
    expect(eigene.price).toBe(12);
    expect(eigene.change).toBeCloseTo(0.2, 9);
    expect(eigene.own).toBe(true);
    const familie = { ...g, stocks: { public: false, price: 12, priceHistory: [10, 12] } as unknown as GameState['stocks'] };
    expect(makeNewspaper(familie, balance, content, undefined, undefined, boerse).exchange!.quotes.some((q) => q.own)).toBe(false);
  });
});
