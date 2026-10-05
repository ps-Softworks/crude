// Kampagnen-Bots (4.20): Regeln der Bots über Kapitel 1–3 und der Auswertung.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TARGET_IDS, parseBalance, type Balance, type CampaignBotPolicy } from './balance';
import {
  campaignEndRound,
  campaignPolicy,
  campaignTargetValues,
  campaignWinners,
  chapterRows,
  checkCampaignTargets,
  exchangeTurn,
  playCampaign,
  stocksTurn,
  type CampaignReport,
  type CampaignResult,
} from './campaignBots';
import { empireValue } from './empire';
import { exchangeEquity, openExchange } from './exchange';
import { newGame, type GameState } from './game';
import { Rng } from './rng';
import { startStocks, thorneStake } from './stocks';
import { parseStocksContent } from './stocksContent';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { loadKapitel3Texts } from './testKapitel3';
import { SWITCH_CHOICES, type SwitchId } from './timeskip';
import { skipWorld } from './world';
import { creditCrises } from './worldRun';

const balance = loadBalance();
const catalog = loadEvents();
const board = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board;
const texts = { stocksBoard: board, kapitel3: loadKapitel3Texts() };
const POLICIES = ['cautious', 'greedy', 'balanced'] as const;

function policy(patch: Partial<CampaignBotPolicy> = {}): CampaignBotPolicy {
  return { ...balance.bots.campaign.balanced, ...patch };
}

describe('Kampagnen-Politik in balance.yaml (bots.campaign)', () => {
  it('jede Strategie beantwortet jede Weiche beider Zeitsprünge mit einer gültigen Antwort', () => {
    for (const name of POLICIES) {
      const p = balance.bots.campaign[name];
      for (const id of Object.keys(SWITCH_CHOICES) as SwitchId[]) {
        expect(SWITCH_CHOICES[id] as readonly string[], `${name}.${id}`).toContain(p.answers[id]);
      }
      expect(Object.keys(p.answers).every((k) => k in SWITCH_CHOICES), name).toBe(true);
    }
  });

  it('die Strategien haben ihren Charakter: gierig wagt, vorsichtig nicht', () => {
    const c = balance.bots.campaign;
    expect(c.greedy.stance).toBe('aggressive');
    expect(c.cautious.stance).toBe('cautious');
    expect(c.balanced.stance).toBe('balanced');
    expect(c.cautious.exchange).toBeNull();
    expect(c.greedy.exchange!.leverage).toBeGreaterThan(c.balanced.exchange!.leverage);
    expect(c.greedy.exchange!.sellOnWarning).toBe(false);
    expect(c.balanced.exchange!.sellOnWarning).toBe(true);
    expect(c.greedy.ipo).toBeGreaterThan(c.cautious.ipo);
  });

  it('kaputte Werte lehnt das Laden ab', () => {
    const raw = rawBalance();
    const bots = raw.bots as Record<string, unknown>;
    const campaign = bots.campaign as Record<string, unknown>;
    const mitPolitik = (p: Record<string, unknown>) => ({ ...raw, bots: { ...bots, campaign: { ...campaign, greedy: { ...(campaign.greedy as object), ...p } } } });
    expect(() => parseBalance(mitPolitik({ stance: 'tollkühn' }))).toThrow(/bots.campaign.greedy.stance/);
    expect(() => parseBalance(mitPolitik({ answers: undefined }))).toThrow(/answers/);
    expect(() => parseBalance(mitPolitik({ exchange: { share: 0.5, leverage: 5 } }))).toThrow(/sellOnWarning/);
    const ziele = bots.campaignTargets as Record<string, unknown>;
    expect(() => parseBalance({ ...raw, bots: { ...bots, campaignTargets: { ...ziele, winRate: { min: 0.5, max: 0.4 } } } })).toThrow(/min darf nicht über max/);
  });

  it('zu jeder Kennzahl gibt es einen Zielbereich', () => {
    for (const id of CAMPAIGN_TARGET_IDS) expect(balance.bots.campaignTargets[id].min).toBeLessThanOrEqual(balance.bots.campaignTargets[id].max);
  });

  it('der Zufalls-Bot würfelt seine Politik aus dem Seed – gleich gewürfelt, gleiche Politik', () => {
    const a = campaignPolicy(balance, 'zufaellig', new Rng(7));
    const b = campaignPolicy(balance, 'zufaellig', new Rng(7));
    expect(a).toEqual(b);
    for (const id of Object.keys(SWITCH_CHOICES) as SwitchId[]) expect(SWITCH_CHOICES[id] as readonly string[]).toContain(a.answers[id]);
    expect(a.systemsChance).toBe(balance.bots.campaign.randomSystemsChance);
  });
});

describe('Kampagne spielen (Kapitel 1 → Sprung I → Kapitel 2 → Sprung II → Kapitel 3)', () => {
  it('Kapitel 3 endet in Runde 16 + 2 × (24 + 16) = 96', () => {
    expect(campaignEndRound(balance, 16)).toBe(96);
  });

  const r1 = playCampaign('bot-5', balance, 'ausgewogen', catalog, texts);
  it('der Standard-Bot spielt eine starke Kampagne bis zum Ende von Kapitel 3 – deterministisch', () => {
    expect(r1.chapters.map((c) => c.chapter)).toEqual([1, 2, 3]);
    expect(r1.survived).toBe(true);
    expect(r1.finalValue).toBeGreaterThan(0);
    expect(playCampaign('bot-5', balance, 'ausgewogen', catalog, texts)).toEqual(r1);
  });

  it('frühes Ende: keine weiteren Kapitel, Endwert 0, die Welt läuft ohne Jacob bis Runde 96 weiter', () => {
    const g = newGame('frueh', balance);
    const pleite: GameState = { ...g, finished: true, ending: 'pleite', round: 10 };
    const r = playCampaign('frueh', balance, 'ausgewogen', catalog, texts, undefined, pleite);
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].result).toBe('pleite');
    expect(r.survived).toBe(false);
    expect(r.finalValue).toBe(0);
    const welt = skipWorld(pleite.worldModel, balance.worldModel, 96 - 10, {}, balance.laws);
    expect(r.crises).toEqual({ credit: creditCrises(welt), gluts: welt.counts.gluts, wars: welt.counts.wars });
  });

  it('eine verfehlte Kapitelprüfung beendet die Kampagne nicht', () => {
    // Spielspaß K1: Mit den Preis- und Fracht-Karten verfehlt der Standard-Bot seltener – darum mehr Seeds zur Auswahl.
    const hatVerfehlt = (r: typeof r1) => r.chapters.some((c) => c.result === 'verfehlt');
    let verfehlt = hatVerfehlt(r1) ? r1 : undefined;
    for (const seed of ['bot-0', 'bot-3', 'bot-1', 'bot-2', 'bot-4', 'bot-6', 'bot-7', 'bot-8']) {
      if (verfehlt) break;
      const r = playCampaign(seed, balance, 'ausgewogen', catalog, texts);
      if (hatVerfehlt(r)) verfehlt = r;
    }
    expect(verfehlt).toBeDefined();
    const i = verfehlt!.chapters.findIndex((c) => c.result === 'verfehlt');
    expect(i < verfehlt!.chapters.length - 1 || verfehlt!.survived).toBe(true);
  });

  it('die Haltung im Zeitsprung lässt sich für die Gegenprobe überschreiben', () => {
    const r = playCampaign('bot-5', balance, 'ausgewogen', catalog, texts, 'aggressive');
    expect(r.stance).toBe('aggressive');
    expect(r1.stance).toBe(balance.bots.campaign.balanced.stance);
  });
});

describe('Börse (Kapitel 3): exchangeTurn', () => {
  const k3 = (cash: number): GameState => ({ ...openExchange({ ...newGame('boerse-bot', balance), chapter: 3 } as GameState, balance), cash });

  it('kauft einen Anteil des freien Geldes auf Kredit – höchstens eine Position', () => {
    const p = policy({ reserve: 10000, exchange: { share: 0.5, leverage: 5, sellOnWarning: true } });
    const s = exchangeTurn(k3(50000), balance, p);
    expect(s.exchange!.positions).toHaveLength(1);
    expect(s.exchange!.positions[0].stake).toBe(20000);
    expect(s.exchange!.positions[0].loan).toBe(80000);
    expect(s.cash).toBe(30000);
    expect(exchangeTurn(s, balance, p).exchange!.positions).toHaveLength(1);
  });

  it('ohne Börsen-Politik, ohne Börse oder unter dem kleinsten Einsatz kauft er nichts', () => {
    expect(exchangeTurn(k3(50000), balance, policy({ exchange: null }))).toEqual(k3(50000));
    const k2 = { ...newGame('k2', balance), chapter: 2, cash: 50000 } as GameState;
    expect(exchangeTurn(k2, balance, policy())).toBe(k2);
    const arm = k3(10100);
    expect(exchangeTurn(arm, balance, policy({ reserve: 10000, exchange: { share: 0.5, leverage: 2, sellOnWarning: true } }))).toBe(arm);
  });

  it('warnt die Zeitung vor der Blase, verkauft der vorsichtige Spekulant – der gierige hält', () => {
    const p = { share: 0.5, leverage: 5 };
    const vorsicht = policy({ reserve: 10000, exchange: { ...p, sellOnWarning: true } });
    const gier = policy({ reserve: 10000, exchange: { ...p, sellOnWarning: false } });
    const gekauft = exchangeTurn(k3(50000), balance, vorsicht);
    const heiss: GameState = { ...gekauft, exchange: { ...gekauft.exchange!, fever: 95 } };
    expect(exchangeTurn(heiss, balance, vorsicht).exchange!.positions).toHaveLength(0);
    expect(exchangeTurn(heiss, balance, gier).exchange!.positions).toHaveLength(1);
  });

  it('das Depot zählt zum Imperiumswert (Kurswert minus Maklerkredit)', () => {
    const vorher = k3(50000);
    const s = exchangeTurn(vorher, balance, policy({ reserve: 0, exchange: { share: 0.5, leverage: 2, sellOnWarning: true } }));
    expect(exchangeEquity(s)).toBeGreaterThan(0);
    // Nur die Maklergebühr geht verloren.
    expect(empireValue(s, balance)).toBeCloseTo(empireValue(vorher, balance) - 25000 * 2 * balance.exchange.margin.fee, 0);
  });
});

describe('Aktienbuch (Kapitel 2/3): stocksTurn', () => {
  const ag = (share: number, cash = 200000): GameState => {
    const g = newGame('aktien-bot', balance);
    return startStocks({ ...g, cash, ipo: { share, proceeds: 0 }, chapter: 2, worldModel: { ...g.worldModel, credit: 50, mood: 50 } } as GameState, balance, board);
  };

  it('führt den unsichersten Rat zum Essen aus', () => {
    const s = ag(0.33);
    const lauwarm = { ...s, stocks: { ...s.stocks!, board: s.stocks!.board.map((m, i) => ({ ...m, loyalty: i === 0 ? 40 : 90 })) } };
    const t = stocksTurn(lauwarm, balance, policy({ reserve: 0 }));
    expect(t.stocks!.board[0].loyalty).toBe(40 + balance.stocks.board.courtGain);
    expect(t.cash).toBe(lauwarm.cash - balance.stocks.board.courtCost);
  });

  it('kauft Aktien zurück, sobald Thorne mitkauft – nicht, wer sich nicht wehrt', () => {
    const s = ag(0.49);
    const mitThorne: GameState = { ...s, stocks: { ...s.stocks!, float: s.stocks!.float - 150, blocks: [{ shares: 150, straw: 0, since: s.round }] } };
    expect(thorneStake(mitThorne.stocks!)).toBeGreaterThanOrEqual(balance.bots.campaign.balanced.defend!.thorneFrom);
    const p = policy({ reserve: 0 });
    const t = stocksTurn(mitThorne, balance, p);
    expect(t.stocks!.float).toBeLessThan(mitThorne.stocks!.float);
    expect(stocksTurn(mitThorne, balance, policy({ defend: null }))).toBe(mitThorne);
  });

  it('Familienfirma: nichts zu tun', () => {
    const s = ag(0);
    expect(stocksTurn(s, balance, policy())).toBe(s);
  });
});

describe('Auswertung', () => {
  const r = (finalValue: number, survived = finalValue > 0): CampaignResult => ({
    seed: 's',
    strategy: 'ausgewogen',
    stance: 'balanced',
    chapters: [],
    survived,
    finalValue,
    crises: { credit: 0, gluts: 0, wars: 0 },
    marginBuys: 0,
    liquidations: 0,
  });

  it('Siegquote: höchster Endwert gewinnt, Gleichstand wird geteilt, ohne Überlebende kein Sieger', () => {
    const w = campaignWinners([[r(10), r(5), r(0)], [r(20), r(5), r(0)]]);
    expect(w[0]).toBeCloseTo(1 / 6);
    expect(w[1]).toBeCloseTo(1 / 2);
  });

  it('Kapitelzeilen: Ausscheiden, Pleite im Sprung und Pleite nach bestandenem Vorkapitel', () => {
    const k = (chapter: 1 | 2 | 3, result: CampaignResult['chapters'][number]['result'], inJump = false, value = 100) => ({ chapter, result, inJump, value, creditCrisis: false });
    const rows = chapterRows([
      { ...r(100), chapters: [k(1, 'erreicht'), k(2, 'pleite', true, 0)] },
      { ...r(100), chapters: [k(1, 'verfehlt'), k(2, 'verfehlt'), k(3, 'erreicht')] },
    ]);
    expect(rows[1].out).toBe(0.5);
    expect(rows[1].jumpBankrupt).toBe(0.5);
    expect(rows[1].bankruptAfterPass).toBe(1);
    expect(rows[2].goal).toBe(0.5);
    expect(rows[0].goal).toBe(0.5);
  });

  it('Zielwerte: Werte und „im Rahmen“ kommen aus balance.yaml', () => {
    const row = (strategy: CampaignResult['strategy'], meanFinal: number) => ({
      strategy,
      games: 1,
      chapters: chapterRows([]),
      survived: 0.75,
      bankrupt: 0.25,
      meanFinal,
      winRate: 0.3,
      marginBuys: 0,
      liquidations: 0,
      results: [],
    });
    const leer = { credit: [1], gluts: [1], wars: [0] };
    const report: CampaignReport = {
      games: 1,
      rows: [row('vorsichtig', 50), row('gierig', 100), row('ausgewogen', 200), row('zufaellig', 0)],
      stances: [{ stance: 'aggressive', survived: 1, meanFinal: 1, winRate: 0.5 }],
      fair: [{ strategy: 'gierig', survived: 1, meanFinal: 1, winRate: 0.45 }],
      crises: { vorsichtig: leer, gierig: { credit: [3], gluts: [0], wars: [0] }, ausgewogen: leer, zufaellig: leer },
    };
    const werte = campaignTargetValues(report);
    expect(werte.creditCrises).toBe(1);
    expect(werte.cautiousBehind).toBe(0.25);
    expect(werte.stanceWin).toBe(0.5);
    const ziele = checkCampaignTargets(report, balance);
    expect(ziele.map((t) => t.id)).toEqual([...CAMPAIGN_TARGET_IDS]);
    expect(ziele.find((t) => t.id === 'fairWinRate')!.ok).toBe(0.45 <= balance.bots.campaignTargets.fairWinRate.max);
    const eng: Balance = { ...balance, bots: { ...balance.bots, campaignTargets: { ...balance.bots.campaignTargets, creditCrises: { min: 2, max: 3 } } } };
    expect(checkCampaignTargets(report, eng).find((t) => t.id === 'creditCrises')!.ok).toBe(false);
  });
});
