import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { botTurn } from './bots';
import { endRound, newGame, type GameState } from './game';
import {
  HEADLINE_IDS,
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
    expect(zeitung.front.title).toBe(content.headlines[zeitung.front.id].title.de);
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
        const outlook = marketOutlook(state, balance);
        gesehen.add(outlook);
        // Der Spieler handelt, dann endet die Runde: Seine Züge ändern die Förderung dieser Runde nicht.
        const gespielt = botTurn(state, balance, 'gierig', rng);
        const schaetzung = expectedPrice(state, balance);
        const naechste = endRound(gespielt, balance);
        expect(naechste.priceHistory.at(-1)).toBe(schaetzung);
        const change = aenderung(state.postedPrice, naechste.priceHistory.at(-1)!);
        if (outlook === 'fall' || outlook === 'crash') expect(change).toBeLessThanOrEqual(-balance.newspaper.fallFrom + 1e-9);
        if (outlook === 'steady') expect(Math.abs(change)).toBeLessThan(balance.newspaper.fallFrom);
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
