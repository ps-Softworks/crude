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
  delaneyOutcome,
  delaneyTable,
  dirtyTurn,
  staffTurn,
  researchTurn,
  checkCampaignTargets,
  bondsTurn,
  coverDues,
  dueSoon,
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
import { bondDebt, bondLimit, startStocks, thorneStake } from './stocks';
import { parseStocksContent } from './stocksContent';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { loadKapitel3Texts } from './testKapitel3';
import { SWITCH_CHOICES, type SwitchId } from './timeskip';
import { skipWorld } from './world';
import { creditCrises } from './worldRun';
import { DELANEY_MARKS, newInvestigation } from './investigation';
import { ensureKapitel3 } from './kapitel3';
import { newStaff } from './staff';

const balance = loadBalance();
const catalog = loadEvents();
const board = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board;
const texts = { stocksBoard: board, kapitel3: loadKapitel3Texts() };
const POLICIES = ['cautious', 'greedy', 'balanced', 'cheat'] as const;

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

  it('nur der betrügerische Bot zieht schmutzige Hebel; sein Lobbyist ist ein Kandidat, der Umschläge nimmt', () => {
    const c = balance.bots.campaign;
    for (const name of ['cautious', 'greedy', 'balanced'] as const) expect(c[name].dirty ?? null).toBeNull();
    expect(campaignPolicy(balance, 'zufaellig', new Rng(3)).dirty).toBeNull();
    const d = c.cheat.dirty!;
    expect(campaignPolicy(balance, 'betruegerisch', new Rng(1))).toBe(c.cheat);
    expect(c.cheat.feldzug!.pact).toBe(true);
    expect(c.cheat.answers.grady).toBe('take');
    expect(d.konsortium).toBe('ausspielen');
    const kandidat = balance.hallstead.lobby.candidates[d.lobbyist!];
    expect(kandidat).toBeDefined();
    expect(kandidat.trait).not.toBe('gewissenhaft');
    const raw = rawBalance();
    const bots = raw.bots as Record<string, unknown>;
    const campaign = bots.campaign as Record<string, unknown>;
    const mit = (dirty: unknown) => ({ ...raw, bots: { ...bots, campaign: { ...campaign, cheat: { ...(campaign.cheat as object), dirty } } } });
    expect(() => parseBalance(mit({ ...d, konsortium: 'verraten' }))).toThrow(/konsortium/);
    expect(() => parseBalance(mit({ ...d, fixer: 'ja' }))).toThrow(/fixer/);
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
    // Spielspaß K1: Seit dem Tieferbohren mit Gewinnschwelle besteht der Standard-Bot Kapitel 1 öfter –
    // darum ein unerreichbares Kapitelziel, statt auf einen Seed zu hoffen, der es verfehlt.
    const streng = { ...balance, chapter: { ...balance.chapter, goalValue: 1e12, goalWells: 999 } };
    const verfehlt = [r1, playCampaign('bot-0', streng, 'ausgewogen', catalog, texts)].find((r) => r.chapters.some((c) => c.result === 'verfehlt'));
    expect(verfehlt).toBeDefined();
    const i = verfehlt!.chapters.findIndex((c) => c.result === 'verfehlt');
    expect(i < verfehlt!.chapters.length - 1 || verfehlt!.survived).toBe(true);
  });

  it('die Haltung im Zeitsprung lässt sich für die Gegenprobe überschreiben', () => {
    const r = playCampaign('bot-5', balance, 'ausgewogen', catalog, texts, 'aggressive');
    expect(r.stance).toBe('aggressive');
    expect(r1.stance).toBe(balance.bots.campaign.balanced.stance);
  });

  it('der Beobachter sieht jede Runde von Kapitel 2 und 3, ohne das Ergebnis zu ändern', () => {
    const runden: number[] = [];
    const r = playCampaign('bot-5', balance, 'ausgewogen', catalog, texts, undefined, undefined, (vorher, nachher) => {
      runden.push(vorher.round);
      expect(nachher.round).toBeGreaterThanOrEqual(vorher.round);
    });
    expect(r).toEqual(r1);
    expect(runden.length).toBe(2 * 16);
    expect(new Set(runden).size).toBe(runden.length);
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

  it('antizyklisch (afterCrash): kauft nur, solange die Börse nach einem Crash am Boden liegt', () => {
    const p = policy({ reserve: 10000, exchange: { share: 0.5, leverage: 1, sellOnWarning: true, afterCrash: true } });
    expect(exchangeTurn(k3(50000), balance, p).exchange!.positions).toHaveLength(0);
    const amBoden: GameState = { ...k3(50000), exchange: { ...k3(50000).exchange!, crash: 3 } };
    const s = exchangeTurn(amBoden, balance, p);
    expect(s.exchange!.positions).toHaveLength(1);
    expect(s.exchange!.positions[0].loan).toBe(0);
    // ohne afterCrash kauft niemand in den Crash hinein
    expect(exchangeTurn(amBoden, balance, policy({ reserve: 10000, exchange: { share: 0.5, leverage: 1, sellOnWarning: true } })).exchange!.positions).toHaveLength(0);
  });

  it('das Depot zählt zum Imperiumswert (Kurswert minus Maklerkredit)', () => {
    const vorher = k3(50000);
    const s = exchangeTurn(vorher, balance, policy({ reserve: 0, exchange: { share: 0.5, leverage: 2, sellOnWarning: true } }));
    expect(exchangeEquity(s)).toBeGreaterThan(0);
    // Nur die Maklergebühr geht verloren.
    expect(empireValue(s, balance)).toBeCloseTo(empireValue(vorher, balance) - 25000 * 2 * balance.exchange.margin.fee, 0);
  });
});

describe('Anleihen (Kapitel 2/3): bondsTurn (0.4.20+6)', () => {
  const firma = (cash = 50000): GameState => {
    const g = newGame('anleihen-bot', balance);
    return startStocks({ ...g, cash, ipo: { share: 0, proceeds: 0 }, chapter: 2, rating: 'B', worldModel: { ...g.worldModel, credit: 50, mood: 50 } } as GameState, balance, board);
  };

  it('ohne Anleihen-Politik oder in Kapitel 1 gibt er keine aus', () => {
    const s = firma();
    expect(bondsTurn(s, balance, policy({ bonds: null }))).toBe(s);
    const k1 = { ...s, chapter: 1 };
    expect(bondsTurn(k1, balance, policy({ bonds: { load: 1 } }))).toBe(k1);
  });

  it('gibt je Runde eine Anleihe aus, bis load × Rahmen erreicht ist – kürzeste Laufzeit, Geld in die Kasse', () => {
    const p = policy({ bonds: { load: 0.8 } });
    let s = firma();
    const ziel = 0.8 * bondLimit(s, balance);
    const erste = bondsTurn(s, balance, p);
    expect(bondDebt(erste.stocks)).toBeGreaterThan(0);
    expect(erste.cash).toBeGreaterThan(s.cash);
    expect(erste.stocks!.bonds[0].maturity - erste.stocks!.bonds[0].issued + 1).toBe(Math.min(...balance.stocks.bonds.terms));
    // Dieselbe Runde: keine zweite.
    expect(bondsTurn(erste, balance, p).stocks!.bonds).toHaveLength(1);
    for (let i = 0; i < 20; i++) {
      s = bondsTurn({ ...s, round: s.round + 1 }, balance, p);
      expect(bondDebt(s.stocks)).toBeLessThanOrEqual(Math.max(ziel, 0.8 * bondLimit(s, balance)) + 1e-6);
    }
    expect(bondDebt(s.stocks)).toBeGreaterThan(0);
  });

  it('Anschlussfinanzierung: eine diese Runde fällige Anleihe zählt nicht mehr – er gibt rechtzeitig eine neue aus', () => {
    const start = firma();
    const b0 = bondsTurn(start, balance, policy({ bonds: { load: 0.8 } })).stocks!.bonds[0];
    // Rahmen genau für eine Anleihe dieser Größe
    const p = policy({ bonds: { load: b0.principal / bondLimit(start, balance) } });
    const erste = bondsTurn(start, balance, p);
    const b = erste.stocks!.bonds[0];
    expect(b.principal).toBe(b0.principal);
    const davor = { ...erste, round: b.maturity - 1 };
    expect(bondsTurn(davor, balance, p).stocks!.bonds).toHaveLength(1);
    expect(bondsTurn({ ...erste, round: b.maturity }, balance, p).stocks!.bonds).toHaveLength(2);
  });
});

describe('Vorausschau (0.4.20+17): dueSoon und coverDues', () => {
  const g = newGame('vorschau', balance);
  const mitAnleihen = (round: number): GameState =>
    ({ ...g, round, stocks: { bonds: [{ id: 1, principal: 10000, rate: 0.05, issued: 1, maturity: 12 }, { id: 2, principal: 25000, rate: 0.05, issued: 1, maturity: 20 }] } }) as unknown as GameState;

  it('zählt Anleihen und Thornes Kredit, die in den nächsten zwei Runden fällig werden', () => {
    expect(dueSoon(mitAnleihen(9))).toBe(0);
    expect(dueSoon(mitAnleihen(10))).toBe(10000);
    expect(dueSoon(mitAnleihen(12))).toBe(10000);
    const thorne = (due: number) => ({ ...mitAnleihen(11), feldzug: { loan: { amount: 50000, owed: 65000, due } } }) as unknown as GameState;
    expect(dueSoon(thorne(13))).toBe(75000);
    expect(dueSoon(thorne(14))).toBe(10000);
    expect(dueSoon(g)).toBe(0);
  });

  it('reicht das Geld nicht für die Rücklage, verkauft er sein Depot – sonst nicht', () => {
    const k3 = (cash: number): GameState => ({ ...openExchange({ ...newGame('vorschau-boerse', balance), chapter: 3 } as GameState, balance), cash });
    const gekauft = exchangeTurn(k3(50000), balance, policy({ reserve: 10000, exchange: { share: 0.5, leverage: 2, sellOnWarning: true } }));
    expect(gekauft.exchange!.positions).toHaveLength(1);
    expect(coverDues(gekauft, balance, 20000)).toBe(gekauft);
    const knapp = coverDues(gekauft, balance, 40000);
    expect(knapp.exchange!.positions).toHaveLength(0);
    expect(knapp.cash).toBeGreaterThan(gekauft.cash);
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

describe('Forschungs-Variante (researchTurn)', () => {
  const k2 = (cash = 100_000): GameState => ({ ...newGame('forschung', balance), chapter: 2, cash });
  it('ohne policy.research oder in Kapitel 1 forscht er nicht', () => {
    const s = k2();
    expect(researchTurn(s, balance, policy())).toBe(s);
    const k1 = newGame('k1', balance);
    expect(researchTurn(k1, balance, policy({ research: { research: ['rotary'], funding: 1, licenses: [] } }))).toBe(k1);
  });
  it('baut die Werkstatt und erforscht die erste fehlende Technik – nicht unter der Rücklage', () => {
    const t = researchTurn(k2(), balance, policy({ research: { research: ['rotary'], funding: 1, licenses: [] } }));
    expect(t.research!.workshop).toBe(true);
    expect(t.research!.project).toBe('rotary');
    const arm = k2(1000);
    expect(researchTurn(arm, balance, policy({ research: { research: ['rotary'], funding: 1, licenses: [] } })).research?.workshop ?? false).toBe(false);
  });
});

describe('Personal-Variante (staffTurn)', () => {
  const k2 = (cash = 100_000): GameState => {
    const g = newGame('personal', balance);
    return { ...g, chapter: 2, cash, staff: newStaff('personal', g.round, balance) };
  };
  it('ohne policy.staff, in Kapitel 1 oder unter der Rücklage stellt er niemanden ein', () => {
    const s = k2();
    expect(staffTurn(s, balance, policy())).toBe(s);
    const arm = k2(100);
    expect(staffTurn(arm, balance, policy({ staff: ['secretary'] }))).toBe(arm);
  });
  it('stellt die gewünschte Rolle ein, wenn eine Bewerbung vorliegt – nur einmal', () => {
    const s = k2();
    const t = staffTurn(s, balance, policy({ staff: ['secretary'] }));
    const da = s.staff!.candidates.some((c) => c.role === 'secretary');
    expect(t.staff!.hired.some((m) => m.role === 'secretary')).toBe(da);
    expect(staffTurn(t, balance, policy({ staff: ['secretary'] })).staff!.hired.filter((m) => m.role === 'secretary').length).toBe(da ? 1 : 0);
  });
});

describe('Schmutzige Hebel (dirtyTurn)', () => {
  const cheat = balance.bots.campaign.cheat;
  const k2 = (): GameState => {
    const g = newGame('schmutz', balance);
    return { ...g, chapter: 2, cash: 100_000, staff: newStaff('schmutz', g.round, balance) };
  };

  it('ohne dirty und in Kapitel 1 bleibt alles, wie es ist', () => {
    const s = k2();
    expect(dirtyTurn(s, balance, policy())).toBe(s);
    const k1 = newGame('k1', balance);
    expect(dirtyTurn(k1, balance, cheat)).toBe(k1);
  });

  it('stellt einen Sicherheitschef ein, der nicht gewissenhaft ist, und lässt bei Bullard sabotieren', () => {
    const s = k2();
    const kandidat = s.staff!.candidates.find((c) => c.role === 'fixer' && !c.traits.includes('gewissenhaft'));
    const t = dirtyTurn(s, balance, cheat);
    if (!kandidat) {
      expect(t.staff!.hired.some((m) => m.role === 'fixer')).toBe(false);
      return;
    }
    expect(t.staff!.hired.find((m) => m.role === 'fixer')!.name).toBe(kandidat.name);
    expect(t.staff!.orders).toContain('sabotage');
    expect(t.cash).toBe(s.cash - balance.staff.fixer.orders.sabotage.cost);
    // Ist das Personal schon zu heiß, keine Sabotage mehr.
    const heiss = { ...t, staff: { ...t.staff!, orders: [], heat: cheat.dirty!.sabotageBelow } };
    expect(dirtyTurn(heiss, balance, cheat).staff!.orders).toEqual([]);
  });

  it('ermittelt Delaney: Anwalt und einmal politischer Druck – nur über der Rücklage', () => {
    const s0 = k2();
    const inv = { ...newInvestigation(s0, balance), stage: 'vorermittlung' as const, evidence: 20 };
    const s: GameState = { ...s0, staff: undefined, investigation: inv };
    const t = dirtyTurn(s, balance, cheat);
    expect(t.investigation!.lawyer).toBe(cheat.dirty!.lawyer);
    expect(t.investigation!.pressure).toBe(true);
    expect(t.cash).toBe(s.cash - balance.investigation.pressure.cost);
    // Zweites Mal im selben Fall kein Druck mehr.
    expect(dirtyTurn(t, balance, cheat).cash).toBe(t.cash);
    const arm: GameState = { ...s, cash: cheat.reserve + balance.investigation.pressure.cost - 1 };
    expect(dirtyTurn(arm, balance, cheat).investigation!.pressure).toBe(false);
  });

  it('Kapitel 3: Lobbyist einstellen, Vales Einladung ausspielen, Gefallen vortäuschen', () => {
    const g = newGame('k3', balance);
    const s0: GameState = ensureKapitel3({ ...g, chapter: 3, cash: 100_000 }, balance);
    const k3 = s0.kapitel3!;
    const s: GameState = { ...s0, kapitel3: { ...k3, konsortium: { ...k3.konsortium, invitedRound: s0.round, inviteDeadline: s0.round + 1 } } };
    const t = dirtyTurn(s, balance, cheat);
    expect(t.hallstead?.lobby.lobbyist?.id).toBe(cheat.dirty!.lobbyist);
    expect(t.kapitel3!.konsortium.path).toBe('doppelspiel');
    const mitGefallen: GameState = { ...t, kapitel3: { ...t.kapitel3!, konsortium: { ...t.kapitel3!.konsortium, favor: { id: 'drosseln', round: t.round, deadline: t.round + 1 } } } };
    const u = dirtyTurn(mitGefallen, balance, cheat);
    expect(u.kapitel3!.konsortium.favor).toBeNull();
    expect(u.cash).toBe(mitGefallen.cash);
  });

  it('delaneyOutcome liest die Merkzeichen der Ermittlung', () => {
    const g = newGame('akte', balance);
    const leer = delaneyOutcome(g, balance);
    expect(leer).toEqual({ probe: false, charge: false, convicted: false, forcedSale: false, prison: false, heat: 0, exposed: false });
    const m = { ...g.events.marks, [DELANEY_MARKS.probe]: 1, [DELANEY_MARKS.convicted]: 2, [DELANEY_MARKS.prison]: 3 };
    const d = delaneyOutcome({ ...g, events: { ...g.events, marks: m } }, balance);
    expect(d.probe && d.convicted && d.prison).toBe(true);
    expect(d.charge || d.forcedSale).toBe(false);
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
    feldzug: 'keiner',
    thorneLoans: 0,
    delaney: { probe: false, charge: false, convicted: false, forcedSale: false, prison: false, heat: 0, exposed: false },
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
      feldzug: 'keiner',
      thorneLoans: 0,
      results: [],
    });
    const leer = { credit: [1], gluts: [1], wars: [0] };
    const report: CampaignReport = {
      games: 1,
      rows: [row('vorsichtig', 50), row('gierig', 100), row('ausgewogen', 200), row('betruegerisch', 150), row('zufaellig', 0)],
      stances: [{ stance: 'aggressive', survived: 1, meanFinal: 1, winRate: 0.5 }],
      fair: [{ strategy: 'gierig', survived: 1, meanFinal: 1, winRate: 0.45 }],
      crises: { vorsichtig: leer, gierig: { credit: [3], gluts: [0], wars: [0] }, ausgewogen: leer, betruegerisch: leer, zufaellig: leer },
    };
    const werte = campaignTargetValues(report);
    expect(werte.creditCrises).toBe(1);
    expect(werte.cautiousBehind).toBe(0.25);
    expect(werte.stanceWin).toBe(0.5);
    expect(werte.cheatPrison).toBe(0);
    expect(delaneyTable(report).split('\n')).toHaveLength(2 + report.rows.length);
    const ziele = checkCampaignTargets(report, balance);
    expect(ziele.map((t) => t.id)).toEqual([...CAMPAIGN_TARGET_IDS]);
    expect(ziele.find((t) => t.id === 'fairWinRate')!.ok).toBe(0.45 <= balance.bots.campaignTargets.fairWinRate.max);
    const eng: Balance = { ...balance, bots: { ...balance.bots, campaignTargets: { ...balance.bots.campaignTargets, creditCrises: { min: 2, max: 3 } } } };
    expect(checkCampaignTargets(report, eng).find((t) => t.id === 'creditCrises')!.ok).toBe(false);
  });
});
