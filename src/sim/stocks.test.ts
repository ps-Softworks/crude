// 4.8 Aktien, Aufsichtsrat, Anleihen (GDD §8): Freischaltung ab Kapitel 2,
// Aktienbuch und Kontrolle, Thorne und die Strohmänner, Aufsichtsrat mit
// Forderungen, Misstrauensvotum und Stellvertreterkampf, Anleihen, Spielstand,
// Zahlen in balance.yaml und Texte in content/stocks.yaml.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BalanceError, parseBalance, type Balance } from './balance';
import { empireValue } from './empire';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import {
  acceptDemand,
  boardMajority,
  bondCoupons,
  bondDebt,
  bondLimit,
  bondOffer,
  bondRate,
  buyBack,
  chapterOf,
  control,
  courtMember,
  dividendCost,
  investigate,
  isStocksState,
  issueBond,
  canIssueBonds,
  issueShares,
  issueMajority,
  loyalSeats,
  memberMood,
  ownStake,
  stocksAttention,
  payDividend,
  pressCampaign,
  rejectDemand,
  revealed,
  settleStocks,
  startStocks,
  stocksUnlocked,
  stocksWorldOf,
  thorneBlocks,
  thorneShares,
  thorneStake,
  totalShares,
  type StocksResult,
  type StocksState,
} from './stocks';
import { demandHints, demandText, memberLabel, parseStocksContent, strawName, type StocksContent } from './stocksContent';
import { loadBalance, rawBalance } from './testBalance';

const balance = loadBalance();
const FILE = 'content/stocks.yaml';
const stocksText = readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8');

function content(): StocksContent {
  const { content: c, errors } = parseStocksContent(FILE, stocksText, balance.stocks.board.seatsMax);
  if (!c) throw new Error(errors.map((e) => e.message).join('\n'));
  return c;
}
const inhalt = content();

/** Balance mit geänderten stocks-Werten (flach je Unterblock). */
function mit(patch: { [K in keyof Balance['stocks']]?: Partial<Balance['stocks'][K]> }): Balance {
  const s = { ...balance.stocks } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) s[k] = { ...(s[k] as object), ...(v as object) };
  return { ...balance, stocks: s as unknown as Balance['stocks'] };
}

/** Kapitel 2 (4.5 setzt das Feld), Börsengang mit verkauftem Anteil share, volle Kasse.
 *  Das Weltmodell (4.1) steht auf neutralem Kreditklima und neutraler Stimmung, damit die Zahlen gleich bleiben. */
function kapitel2(share: number, seed = 'aktien', cash = 100000): GameState {
  const g = newGame(seed, balance);
  return { ...g, cash, ipo: { share, proceeds: 0 }, chapter: 2, worldModel: { ...g.worldModel, credit: 50, mood: 50 } } as GameState;
}

function ag(share: number, seed = 'aktien', b: Balance = balance, cash = 100000): GameState {
  const s = startStocks(kapitel2(share, seed, cash), b, inhalt.board);
  expect(s.stocks).toBeDefined();
  return s;
}

function ok(r: StocksResult): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function st(g: GameState): StocksState {
  return g.stocks!;
}

/** n Rundenenden der Börse (ohne den Rest der Simulation); die Runde zählt mit. */
function runden(g: GameState, n: number, b: Balance = balance, world: NonNullable<Parameters<typeof settleStocks>[2]> = { credit: 50, mood: 50 }): GameState {
  let s = g;
  for (let i = 0; i < n; i++) s = { ...settleStocks(s, b, world), round: s.round + 1 };
  return s;
}

describe('Freischaltung (Kapitel 2)', () => {
  it('in Kapitel 1 bleibt alles unsichtbar: kein Aktienbuch, keine Abrechnung', () => {
    const g = { ...newGame('k1', balance), ipo: { share: 0.49, proceeds: 0 } };
    expect(chapterOf(g)).toBe(1);
    expect(stocksUnlocked(g, balance)).toBe(false);
    expect(startStocks(g, balance, inhalt.board)).toBe(g);
    expect(settleStocks(g, balance)).toBe(g);
    expect(endRound(g, balance).stocks).toBeUndefined();
  });

  it('ab Kapitel 2 legt startStocks Aktienbuch und Aufsichtsrat an – genau einmal', () => {
    const g = ag(0.33);
    expect(stocksUnlocked(g, balance)).toBe(true);
    expect(st(g).public).toBe(true);
    expect(totalShares(st(g))).toBe(balance.stocks.totalShares);
    expect(ownStake(st(g))).toBeCloseTo(0.67, 2);
    expect(startStocks(g, balance, inhalt.board)).toBe(g);
    expect(g.log.at(-1)).toContain('Aktiengesellschaft');
  });

  it('force legt das Aktienbuch auch ohne Kapitelnummer an (Debug, Tests)', () => {
    const g = { ...newGame('k1', balance), ipo: { share: 0.2, proceeds: 0 } };
    expect(startStocks(g, balance, inhalt.board, { force: true }).stocks?.public).toBe(true);
  });

  it('die Familienfirma bekommt kein Aktienbuch und keine neuen Anleihen', () => {
    const g = startStocks(kapitel2(0), balance, inhalt.board);
    expect(st(g).public).toBe(false);
    expect(st(g).board).toHaveLength(0);
    expect(control(st(g), balance)).toBe(1);
    expect(issueShares(g, balance, 10).ok).toBe(false);
    expect(payDividend(g, balance, 0).ok).toBe(false);
    const r = issueBond(g, balance, balance.stocks.bonds.sizes[0], balance.stocks.bonds.terms[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Aktiengesellschaft');
    expect(canIssueBonds(g)).toBe(false);
  });

  it('alte Anleihen einer Familienfirma laufen weiter, nur neue gibt es nicht', () => {
    const g0 = startStocks(kapitel2(0), balance, inhalt.board);
    const alt = { id: 1, principal: 10000, rate: 0.08, issued: 1, maturity: 4 };
    const g = { ...g0, stocks: { ...st(g0), bonds: [alt], nextBond: 2 } };
    expect(bondDebt(g.stocks)).toBe(10000);
    expect(bondCoupons(g.stocks)).toBeGreaterThan(0);
    expect(issueBond(g, balance, balance.stocks.bonds.sizes[0], balance.stocks.bonds.terms[0]).ok).toBe(false);
  });

  it('der Aufsichtsrat hat 5–9 Sitze, mehr verkaufte Aktien = mehr Sitze', () => {
    expect(st(ag(0.2)).board).toHaveLength(5);
    expect(st(ag(0.33)).board).toHaveLength(6);
    expect(st(ag(0.49)).board).toHaveLength(7);
    expect(st(ag(0.2)).board.map((m) => m.id)).toEqual(inhalt.board.slice(0, 5).map((m) => m.id));
  });

  it('endRound rechnet die Börse mit ab (Andockpunkt in game.ts)', () => {
    const g = ag(0.49);
    const n = endRound(g, balance);
    expect(st(n).priceHistory).toHaveLength(2);
  });
});

describe('Thorne und die Strohmänner (Fertig-Kriterium 4.8)', () => {
  const SEEDS = Array.from({ length: 12 }, (_, i) => `thorne-${i}`);

  it('zu viele verkaufte Aktien (49 %) lassen Thorne über Strohmänner einsteigen', () => {
    for (const seed of SEEDS) {
      const g = runden(ag(0.49, seed), 12);
      expect(thorneShares(st(g)), seed).toBeGreaterThan(0);
      expect(st(g).blocks.length).toBeGreaterThan(0);
      // Seine Aktien kommen aus dem Streubesitz, Jacobs bleiben unberührt.
      expect(st(g).jacob).toBe(Math.round(balance.stocks.totalShares * 0.51));
    }
  });

  it('wer die Mehrheit fest hält (20 % oder 33 % verkauft), bleibt Thorne los', () => {
    for (const seed of SEEDS) {
      for (const share of [0.2, 0.33]) {
        expect(thorneShares(st(runden(ag(share, seed), 12))), `${seed} ${share}`).toBe(0);
      }
    }
  });

  it('wer nach einem vorsichtigen Börsengang neue Aktien ausgibt, öffnet Thorne doch noch die Tür', () => {
    let g = ag(0.33, 'nachschuss');
    g = ok(issueShares(g, balance, 120));
    expect(1 - ownStake(st(g))).toBeGreaterThanOrEqual(balance.stocks.thorne.minOutside);
    expect(thorneShares(st(runden(g, 12)))).toBeGreaterThan(0);
  });

  it('die Strohmänner stehen unter falschem Namen im Aktienbuch, bis die Detektei sie enttarnt', () => {
    let g = runden(ag(0.49, 'detektei'), 12);
    const block = st(g).blocks[0];
    expect(revealed(st(g), block.since)).toBe(false);
    expect(inhalt.straw).toContain(strawName(inhalt, block));
    const vorher = g.cash;
    g = ok(investigate(g, balance));
    expect(g.cash).toBe(vorher - balance.stocks.thorne.investigateCost);
    expect(revealed(st(g), block.since)).toBe(true);
    expect(g.log.at(-1)).toContain('Thorne');
  });

  it('Thorne kauft nie mehr als maxStake und lässt den Kleinaktionären floatKeep', () => {
    const b = mit({ thorne: { buyChance: 1, buyShare: 0.2 } });
    const g = runden(ag(0.49, 'gier', b), 20, b);
    expect(thorneStake(st(g))).toBeLessThanOrEqual(b.stocks.thorne.maxStake + 1e-9);
    expect(st(g).float).toBeGreaterThanOrEqual(Math.ceil(totalShares(st(g)) * b.stocks.thorne.floatKeep));
  });

  it('wer Thorne in Kapitel 1 abgewiesen hat, wird schneller aufgekauft', () => {
    const b = mit({ thorne: { buyChance: 1 } });
    const normal = ag(0.49, 'groll', b);
    const feind = { ...normal, events: { ...normal.events, marks: { ...normal.events.marks, thorne_abgelehnt: 3 } } };
    expect(thorneShares(st(runden(feind, 1, b)))).toBeGreaterThan(thorneShares(st(runden(normal, 1, b))));
  });

  it('mit genug Aktien schickt Thorne seinen Mann in den Aufsichtsrat – Jacobs Kontrolle sinkt', () => {
    const b = mit({ thorne: { buyChance: 1, buyShare: 0.12 } });
    const g0 = ag(0.49, 'sitz', b);
    const g = runden(g0, 1, b);
    expect(thorneStake(st(g))).toBeGreaterThanOrEqual(b.stocks.thorne.seatPer);
    const spione = st(g).board.filter((m) => m.agenda === 'spy');
    expect(spione).toHaveLength(1);
    expect(memberLabel(inhalt, spione[0], false).role).toBe(inhalt.thorne.cover.de);
    expect(memberLabel(inhalt, spione[0], true).role).toBe(inhalt.thorne.revealed.de);
    expect(control(st(g), b)).toBeLessThan(control(st(g0), b));
    // Thornes Mann lässt sich nicht umstimmen.
    expect(courtMember(g, b, spione[0].id).ok).toBe(false);
  });

  it('Thornes Mann bearbeitet den Rat: Jacob verliert die Mehrheit, die er ohne Thorne behält', () => {
    // Agenden ohne Wirkung (gain/loss 0): Was die Räte verlieren, kommt nur von Thornes Mann.
    const b = mit({ thorne: { buyChance: 1, buyShare: 0.12 }, demands: { chance: 0, spyChance: 0 }, board: { gain: 0, loss: 0 } });
    const ohne = mit({ thorne: { buyChance: 0 }, demands: { chance: 0, spyChance: 0 }, board: { gain: 0, loss: 0 } });
    const g0 = ag(0.49, 'druck', b);
    expect(boardMajority(st(g0), b)).toBe(true);
    const mitThorne = runden(g0, 12, b);
    const ohneThorne = runden(g0, 12, ohne);
    expect(st(mitThorne).board.some((m) => m.agenda === 'spy')).toBe(true);
    expect(boardMajority(st(ohneThorne), ohne)).toBe(true);
    expect(boardMajority(st(mitThorne), b)).toBe(false);
  });

  it('bei neuen Aktien stimmen Thornes Leute mit Jacob – sie wollen die Verwässerung', () => {
    const g0 = ag(0.49, 'verwaesserung');
    // 7 echte Räte, davon 3 loyal, dazu 2 Männer Thornes: keine Mehrheit für Jacob, aber für neue Aktien.
    const board = [
      ...st(g0).board.map((m, i) => ({ ...m, loyalty: i < 3 ? 90 : 10 })),
      { id: 'thorne-1', agenda: 'spy' as const, loyalty: 0, since: g0.round },
      { id: 'thorne-2', agenda: 'spy' as const, loyalty: 0, since: g0.round },
    ];
    const g = { ...g0, stocks: { ...st(g0), board } };
    expect(boardMajority(st(g), balance)).toBe(false);
    expect(issueMajority(st(g), balance)).toBe(true);
    expect(issueShares(g, balance, 10).ok).toBe(true);
  });

  it('Sperrminorität: ab blockFrom blockiert Thorne Rückkäufe', () => {
    const b = mit({ thorne: { buyChance: 1, buyShare: 0.15 } });
    const g0 = ag(0.49, 'sperre', b);
    expect(buyBack(g0, b, 1).ok).toBe(true);
    const g = runden(g0, 2, b);
    expect(thorneStake(st(g))).toBeGreaterThanOrEqual(b.stocks.thorne.blockFrom);
    expect(thorneBlocks(st(g), b)).toBe(true);
    expect(buyBack(g, b, 1).ok).toBe(false);
  });

  it('die typische Falle schnappt zu: 49 % verkauft, Thornes Forderung erfüllt – Jacob wird abgesetzt; ohne Thorne nicht', () => {
    const ruhig = { price: { noise: 0, reversion: 0, profitWeight: 0 }, demands: { chance: 0, spyChance: 0 }, board: { gain: 0, loss: 0 } };
    const b = mit({ ...ruhig, thorne: { buyChance: 1, buyShare: 0.26 } });
    const ohne = mit({ ...ruhig, thorne: { buyChance: 0 } });
    const krise = { credit: 50, mood: 10 };
    /** Börsengang 49 %, eine Runde, dann 150 neue Aktien (Thornes Mann stimmt dafür) und eine Krise. */
    function verlauf(bal: Balance): GameState {
      let g = runden(ag(0.49, 'falle', bal), 1, bal);
      g = ok(issueShares(g, bal, 150));
      g = runden(g, 1, bal, krise);
      expect(st(g).proxy !== null).toBe(bal === b);
      if (st(g).proxy) {
        // Jacob versucht es mit Rückkäufen – die Sperrminorität hält dagegen.
        expect(buyBack(g, bal, 10).ok).toBe(false);
        g = ok(pressCampaign(g, bal));
      }
      return runden(g, bal.stocks.vote.proxyRounds + 1, bal, krise);
    }
    const mitThorne = verlauf(b);
    expect(thorneStake(st(mitThorne))).toBeGreaterThanOrEqual(b.stocks.thorne.blockFrom);
    expect(st(mitThorne).ousted).toBeGreaterThan(0);
    const ohneThorne = verlauf(ohne);
    expect(st(ohneThorne).ousted).toBe(0);
  });
});

describe('Kontrolle und Aktienbuch', () => {
  it('Kontrolle = eigene Anteile + der Teil des Streubesitzes, den loyale Räte mitbringen', () => {
    const g = ag(0.49);
    const s = st(g);
    const erwartet = 0.51 + 0.49 * balance.stocks.board.weight * (loyalSeats(s, balance) / s.board.length);
    expect(control(s, balance)).toBeCloseTo(erwartet, 6);
    const untreu: StocksState = { ...s, board: s.board.map((m) => ({ ...m, loyalty: 0 })) };
    expect(control(untreu, balance)).toBeCloseTo(0.51, 6);
  });

  it('neue Aktien bringen Geld und verwässern Jacobs Anteil', () => {
    const g = ag(0.2);
    const n = ok(issueShares(g, balance, 100));
    expect(st(n).float).toBe(st(g).float + 100);
    expect(n.cash).toBe(g.cash + Math.round(100 * st(g).price * (1 - balance.stocks.issue.discount)));
    expect(ownStake(st(n))).toBeLessThan(ownStake(st(g)));
    expect(st(n).sentiment).toBeLessThan(st(g).sentiment);
  });

  it('neue Aktien brauchen die Mehrheit im Aufsichtsrat und eine Höchstmenge', () => {
    const g = ag(0.2);
    expect(issueShares(g, balance, 1000).ok).toBe(false);
    const untreu = { ...g, stocks: { ...st(g), board: st(g).board.map((m) => ({ ...m, loyalty: 0 })) } };
    expect(boardMajority(st(untreu), balance)).toBe(false);
    const r = issueShares(untreu, balance, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Mehrheit');
  });

  it('Rückkauf zieht Aktien der Kleinaktionäre ein und hebt Jacobs Anteil', () => {
    const g = ag(0.49);
    const n = ok(buyBack(g, balance, 50));
    expect(st(n).float).toBe(st(g).float - 50);
    expect(ownStake(st(n))).toBeGreaterThan(ownStake(st(g)));
    expect(n.cash).toBe(g.cash - Math.round(50 * st(g).price * (1 + balance.stocks.buyback.premium)));
    expect(buyBack(g, balance, st(g).float + 1).ok).toBe(false);
    expect(buyBack({ ...g, cash: 0 }, balance, 10).ok).toBe(false);
  });

  it('Dividende: aus der Kasse geht nur der Teil der fremden Aktionäre, einmal je Runde', () => {
    const g = ag(0.33);
    const d = dividendCost(g, balance, 0)!;
    expect(d.cost).toBe(Math.round(d.amount * 0.33));
    const n = ok(payDividend(g, balance, 0));
    expect(n.cash).toBe(g.cash - d.cost);
    expect(st(n).dividendsTotal).toBe(d.amount);
    expect(payDividend(n, balance, 1).ok).toBe(false);
    expect(payDividend({ ...g, cash: 0 }, balance, 0).ok).toBe(false);
  });

  it('zu lange ohne Dividende drückt den Kurs; Dividende hebt ihn', () => {
    const ruhig = mit({ price: { noise: 0, profitWeight: 0 } });
    const start = ag(0.33, 'div', ruhig);
    const ohne = runden(start, ruhig.stocks.dividend.graceRounds + 2, ruhig);
    let mitDiv = start;
    for (let i = 0; i < ruhig.stocks.dividend.graceRounds + 2; i++) {
      mitDiv = ok(payDividend(mitDiv, ruhig, 0));
      mitDiv = runden(mitDiv, 1, ruhig);
    }
    expect(st(ohne).sentiment).toBeLessThan(1);
    expect(st(mitDiv).sentiment).toBeGreaterThan(st(ohne).sentiment);
  });

  it('der Bankier wird treuer mit Dividende und untreu ohne', () => {
    const g = ag(0.33);
    const bankier = (x: GameState) => st(x).board.find((m) => m.id === 'bankier')!.loyalty;
    const ohne = runden({ ...g, stocks: { ...st(g), dividendRound: g.round - 10 } }, 1);
    const mitDiv = runden(ok(payDividend(g, balance, 0)), 1);
    expect(bankier(ohne)).toBe(bankier(g) - balance.stocks.board.loss);
    expect(bankier(mitDiv)).toBe(bankier(g) + balance.stocks.board.gain);
  });

  it('Kreditklima (4.1) wirkt auf die Stimmung der Börse; ohne Weltmodell gelten Ersatzwerte', () => {
    const ruhig = mit({ price: { noise: 0, profitWeight: 0, reversion: 0 } });
    const g = ag(0.33, 'klima', ruhig);
    const boom = runden(g, 1, ruhig, { credit: 90, mood: 50 });
    const klemme = runden(g, 1, ruhig, { credit: 10, mood: 50 });
    expect(st(boom).sentiment).toBeGreaterThan(st(klemme).sentiment);
    expect(stocksWorldOf({})).toEqual({ credit: 50, mood: 50 });
    expect(stocksWorldOf({ worldModel: { credit: 80, mood: 20 } })).toEqual({ credit: 80, mood: 20 });
    // Im echten Spiel liest die Börse das Weltmodell von main (state.worldModel, 4.1).
    const echt = newGame('klima-echt', balance);
    expect(stocksWorldOf(echt)).toEqual({ credit: echt.worldModel.credit, mood: echt.worldModel.mood });
  });

  it('0.4.20+9: Solange ein Crash nachwirkt (Börse oder Kreditcrash der Welt), fällt auch Harlan Oil', () => {
    expect(stocksWorldOf({ worldModel: { credit: 50, mood: 50, crash: 3 } }).crash).toBe(true);
    expect(stocksWorldOf({ worldModel: { credit: 50, mood: 50, crash: 0 }, exchange: { crash: 2 } }).crash).toBe(true);
    expect(stocksWorldOf({ worldModel: { credit: 50, mood: 50, crash: 0 }, exchange: { crash: 0 } }).crash).toBeUndefined();
    const ruhig = mit({ price: { noise: 0, profitWeight: 0, reversion: 0 } });
    const g = ag(0.33, 'crash', ruhig);
    const normal = runden(g, 1, ruhig, { credit: 50, mood: 50 });
    const crash = runden(g, 1, ruhig, { credit: 50, mood: 50, crash: true });
    expect(st(normal).sentiment - st(crash).sentiment).toBeCloseTo(balance.stocks.price.crashWeight, 9);
    expect(st(crash).price).toBeLessThan(st(normal).price);
    // Ohne Gewicht wirkt der Crash nicht.
    const ohne = mit({ price: { noise: 0, profitWeight: 0, reversion: 0, crashWeight: 0 } });
    expect(st(runden(ag(0.33, 'crash', ohne), 1, ohne, { credit: 50, mood: 50, crash: true })).sentiment).toBeCloseTo(st(runden(ag(0.33, 'crash', ohne), 1, ohne)).sentiment, 9);
  });

  it('wie ein Rat zu Jacob steht, gibt es nur als Wort; Thornes Mann ist immer dagegen', () => {
    const ab = balance.stocks.board.loyalFrom;
    const rat = { id: 'bankier', agenda: 'dividend' as const, since: 1 };
    expect(memberMood({ ...rat, loyalty: ab + 30 }, balance)).toBe('treu');
    expect(memberMood({ ...rat, loyalty: ab }, balance)).toBe('dafuer');
    expect(memberMood({ ...rat, loyalty: ab - 10 }, balance)).toBe('schwankt');
    expect(memberMood({ ...rat, loyalty: 0 }, balance)).toBe('dagegen');
    expect(memberMood({ id: 'thorne-1', agenda: 'spy', loyalty: 100, since: 1 }, balance)).toBe('dagegen');
    for (const m of ['treu', 'dafuer', 'schwankt', 'dagegen'] as const) expect(inhalt.moods[m].de).not.toBe('');
  });

  it('das Kassenbuch meldet offene Forderungen und den Stellvertreterkampf', () => {
    const g = ag(0.33);
    expect(stocksAttention(g)).toBeNull();
    expect(stocksAttention(newGame('k1', balance))).toBeNull();
    const d = { member: 'bankier', kind: 'dividend' as const, target: 1, baseline: 0, due: 9, accepted: false };
    expect(stocksAttention({ stocks: { ...st(g), demand: d } })).toBe('demand');
    expect(stocksAttention({ stocks: { ...st(g), demand: { ...d, accepted: true } } })).toBeNull();
    expect(stocksAttention({ stocks: { ...st(g), demand: d, proxy: { until: 5, press: 0, pressRound: 0 } } })).toBe('proxy');
  });

  it('Rat umstimmen kostet Geld, bringt Treue und geht einmal je Runde', () => {
    const g = ag(0.33);
    const id = st(g).board[0].id;
    const n = ok(courtMember(g, balance, id));
    expect(n.cash).toBe(g.cash - balance.stocks.board.courtCost);
    expect(st(n).board[0].loyalty).toBe(Math.min(100, st(g).board[0].loyalty + balance.stocks.board.courtGain));
    expect(courtMember(n, balance, st(g).board[1].id).ok).toBe(false);
  });
});

describe('Forderungen des Aufsichtsrats', () => {
  const immer = mit({ demands: { chance: 1 } });

  /** AG, in der der Rat mit der Agenda agenda der unzufriedenste ist. */
  function unzufrieden(agenda: string, b: Balance = immer, treue = 5): GameState {
    const g = ag(0.33, 'forderung', b);
    return { ...g, stocks: { ...st(g), board: st(g).board.map((m) => (m.agenda === agenda ? { ...m, loyalty: treue } : { ...m, loyalty: 90 })) } };
  }

  it('der unzufriedenste Rat stellt eine Forderung nach seiner Agenda, mit Frist', () => {
    const g = runden(unzufrieden('dividend'), 1, immer);
    const d = st(g).demand!;
    expect(d.kind).toBe('dividend');
    expect(d.due).toBe(g.round - 1 + immer.stocks.demands.dueRounds);
    const wer = st(g).board.find((m) => m.id === d.member)!;
    expect(demandText(inhalt, d, memberLabel(inhalt, wer, false).name)).toContain(String(d.due));
  });

  it('abgelehnt: der Rat ist verärgert', () => {
    const g = runden(unzufrieden('dividend'), 1, immer);
    const d = st(g).demand!;
    const vorher = st(g).board.find((m) => m.id === d.member)!.loyalty;
    const n = ok(rejectDemand(g, immer));
    expect(st(n).demand).toBeNull();
    expect(st(n).board.find((m) => m.id === d.member)!.loyalty).toBe(Math.max(0, vorher - immer.stocks.demands.rejectLoss));
  });

  it('zugesagt und erfüllt: Treue steigt', () => {
    let g = runden(unzufrieden('dividend'), 1, immer);
    const d = st(g).demand!;
    g = ok(acceptDemand(g));
    g = ok(payDividend(g, immer, 1));
    expect(st(g).dividendsTotal - d.baseline).toBeGreaterThanOrEqual(d.target);
    const vorher = st(g).board.find((m) => m.id === d.member)!.loyalty;
    g = runden(g, 1, mit({ demands: { chance: 0 } }));
    expect(st(g).demand).toBeNull();
    // Dividende erfüllt auch die Agenda (+gain) – dazu die Belohnung für die Forderung.
    expect(st(g).board.find((m) => m.id === d.member)!.loyalty).toBe(Math.min(100, vorher + balance.stocks.board.gain + balance.stocks.demands.fulfillGain));
  });

  it('Zusagen lohnt sich: zugesagt und erfüllt bringt mehr als still erfüllt', () => {
    const g = runden(unzufrieden('dividend'), 1, immer);
    const d = st(g).demand!;
    const ruhig = mit({ demands: { chance: 0 } });
    const zugesagt = runden(ok(payDividend(ok(acceptDemand(g)), immer, 1)), 1, ruhig);
    const still = runden(ok(payDividend(g, immer, 1)), 1, ruhig);
    const treue = (x: GameState) => st(x).board.find((m) => m.id === d.member)!.loyalty;
    expect(st(zugesagt).demand).toBeNull();
    expect(st(still).demand).toBeNull();
    expect(treue(zugesagt)).toBeGreaterThan(treue(still));
    expect(treue(zugesagt) - treue(still)).toBe(balance.stocks.demands.fulfillGain - balance.stocks.demands.quietGain);
  });

  it('nach einer Zusage abzulehnen ist Wortbruch – so teuer wie eine verpasste Frist', () => {
    const g = runden(unzufrieden('dividend'), 1, immer);
    const d = st(g).demand!;
    const vorher = st(g).board.find((m) => m.id === d.member)!.loyalty;
    const n = ok(rejectDemand(ok(acceptDemand(g)), immer));
    expect(st(n).demand).toBeNull();
    expect(st(n).board.find((m) => m.id === d.member)!.loyalty).toBe(Math.max(0, vorher - immer.stocks.demands.failLoss));
    expect(n.log.at(-1)).toContain('Wortbruch');
  });

  it('mit Thornes Mann im Rat kommen weiterhin Forderungen der echten Räte', () => {
    const b = mit({ demands: { chance: 1, spyChance: 0 } });
    let g = unzufrieden('dividend', b, 40);
    const spion = { id: 'thorne-1', agenda: 'spy' as const, loyalty: 0, since: g.round };
    g = { ...g, stocks: { ...st(g), board: [...st(g).board, spion] } };
    const n = runden(g, 1, b);
    expect(st(n).demand?.member).not.toBe('thorne-1');
    expect(st(n).demand?.kind).toBe('dividend');
    // Über viele Seeds und Runden mit gewöhnlicher Chance: echte Räte fordern öfter als Thornes Mann.
    let echte = 0;
    let seine = 0;
    for (let i = 0; i < 12; i++) {
      let x = ag(0.49, `spion-${i}`);
      x = { ...x, stocks: { ...st(x), board: [...st(x).board, { ...spion, since: x.round }] } };
      for (let r = 0; r < 12; r++) {
        x = runden(x, 1);
        const d = st(x).demand;
        // Nur neu gestellte Forderungen zählen (jede wird gleich abgelehnt).
        if (d && d.due === x.round - 1 + balance.stocks.demands.dueRounds) {
          if (st(x).board.find((m) => m.id === d.member)?.agenda === 'spy') seine++;
          else echte++;
        }
        if (d) x = ok(rejectDemand(x, balance));
      }
    }
    expect(echte).toBeGreaterThan(seine);
    expect(seine).toBeGreaterThan(0);
  });

  it('Thornes Mann fordert neue Aktien; wer ablehnt, spürt es am Kurs', () => {
    const b = mit({ demands: { chance: 0, spyChance: 1 }, price: { noise: 0, profitWeight: 0, reversion: 0, creditWeight: 0, moodWeight: 0 }, dividend: { graceRounds: 99 } });
    let g = ag(0.49, 'spionforderung', b);
    g = { ...g, stocks: { ...st(g), board: [...st(g).board, { id: 'thorne-1', agenda: 'spy', loyalty: 0, since: g.round }] } };
    g = runden(g, 1, b);
    const d = st(g).demand!;
    expect(d.member).toBe('thorne-1');
    expect(d.kind).toBe('issue');
    const vorher = st(g).sentiment;
    const n = ok(rejectDemand(g, b));
    expect(st(n).sentiment).toBeCloseTo(vorher - b.stocks.demands.spyPenalty, 6);
    // Ignorieren bis zur Frist kostet dasselbe.
    const ignoriert = runden(g, b.stocks.demands.dueRounds, mit({ demands: { chance: 0, spyChance: 0 }, price: { noise: 0, profitWeight: 0, reversion: 0, creditWeight: 0, moodWeight: 0 }, dividend: { graceRounds: 99 } }));
    expect(st(ignoriert).sentiment).toBeLessThan(vorher - b.stocks.demands.spyPenalty + 1e-6);
  });

  it('zugesagt und Frist verstrichen: Treue fällt stärker, als wenn Jacob nur geschwiegen hätte', () => {
    let g = runden(unzufrieden('price', immer, 60), 1, immer);
    const d = st(g).demand!;
    expect(d.kind).toBe('buyback');
    const still = mit({ demands: { chance: 0 }, price: { noise: 0, profitWeight: 0, reversion: 0, creditWeight: 0, moodWeight: 0 }, dividend: { graceRounds: 99 } });
    const zugesagt = runden(ok(acceptDemand(g)), immer.stocks.demands.dueRounds, still);
    const geschwiegen = runden(g, immer.stocks.demands.dueRounds, still);
    expect(st(zugesagt).demand).toBeNull();
    expect(st(geschwiegen).demand).toBeNull();
    const treue = (x: GameState) => st(x).board.find((m) => m.id === d.member)!.loyalty;
    expect(treue(geschwiegen) - treue(zugesagt)).toBe(immer.stocks.demands.failLoss - immer.stocks.demands.rejectLoss);
    expect(zugesagt.log.some((l) => l.includes('Wort nicht gehalten'))).toBe(true);
  });

  it('die Witwe verlangt weniger Schulden, sobald es Schulden gibt', () => {
    const g0 = unzufrieden('safety');
    expect(st(runden(g0, 1, immer)).demand).toBeNull();
    const verschuldet = ok(issueBond(g0, immer, immer.stocks.bonds.sizes[0], immer.stocks.bonds.terms[0]));
    const d = st(runden(verschuldet, 1, immer)).demand!;
    expect(d.kind).toBe('debt');
    expect(d.target).toBe(Math.round(immer.stocks.bonds.sizes[0] * (1 - immer.stocks.demands.debtCut)));
  });
});

describe('Misstrauensvotum und Stellvertreterkampf', () => {
  /** Jacob unter 50 %, Rat untreu, Kurs stürzt (Stimmung im Keller). */
  function wackelig(): { g: GameState; b: Balance } {
    const b = mit({ price: { noise: 0, reversion: 0, profitWeight: 0 }, demands: { chance: 0 }, thorne: { buyChance: 0 } });
    let g = ag(0.49, 'votum', b);
    g = ok(issueShares(g, b, 50));
    g = { ...g, stocks: { ...st(g), board: st(g).board.map((m) => ({ ...m, loyalty: 0 })), sentiment: 0.5 } };
    return { g, b };
  }

  it('unter 50 % Kontrolle und mit fallendem Kurs droht die Absetzung', () => {
    const { g, b } = wackelig();
    expect(control(st(g), b)).toBeLessThan(0.5);
    const n = runden(g, 1, b, { credit: 50, mood: 10 });
    expect(st(n).proxy).not.toBeNull();
    expect(n.log.at(-1)).toContain('Stellvertreterkampf');
  });

  it('hält die Mehrheit im Rat zu Jacob, scheitert der Antrag', () => {
    const { g, b } = wackelig();
    const treu = { ...g, stocks: { ...st(g), board: st(g).board.map((m) => ({ ...m, loyalty: 100 })), float: 0, jacob: st(g).jacob } };
    // Streubesitz 0: loyale Räte bringen keine Stimmen, Kontrolle bleibt unter 50 % – aber die Mehrheit im Rat hält.
    const bloecke = { ...treu, stocks: { ...st(treu), blocks: [{ shares: st(g).float, straw: 0, since: 1 }] } };
    expect(control(st(bloecke), b)).toBeLessThan(0.5);
    const n = runden(bloecke, 1, b, { credit: 50, mood: 10 });
    expect(st(n).proxy).toBeNull();
    expect(n.log.at(-1)).toContain('scheitert');
  });

  it('Stellvertreterkampf verloren = abgesetzt; danach geht nichts mehr', () => {
    const { g, b } = wackelig();
    let n = runden(g, 1, b, { credit: 50, mood: 10 });
    n = runden(n, b.stocks.vote.proxyRounds, b, { credit: 50, mood: 10 });
    expect(st(n).ousted).toBeGreaterThan(0);
    expect(n.log.some((l) => l.includes('setzt Jacob ab'))).toBe(true);
    expect(buyBack(n, b, 1).ok).toBe(false);
    expect(settleStocks(n, b)).toBe(n);
  });

  it('mit Rückkäufen und Presse lässt sich der Kampf gewinnen', () => {
    const { g, b } = wackelig();
    let n = runden(g, 1, b, { credit: 50, mood: 10 });
    n = ok(pressCampaign(n, b));
    expect(pressCampaign(n, b).ok).toBe(false);
    n = ok(buyBack(n, b, 80));
    n = runden(n, b.stocks.vote.proxyRounds, b, { credit: 50, mood: 60 });
    expect(st(n).ousted).toBe(0);
    expect(st(n).proxy).toBeNull();
    expect(n.log.some((l) => l.includes('gewonnen'))).toBe(true);
  });

  it('ohne Stellvertreterkampf keine Pressekampagne', () => {
    expect(pressCampaign(ag(0.33), balance).ok).toBe(false);
  });
});

describe('Anleihen', () => {
  it('Zins nach Rating und Kreditklima; mit Rating D zeichnet niemand', () => {
    const B = balance.stocks.bonds;
    expect(bondRate(balance, 'A')).toBeCloseTo(B.baseRate + B.spreads.A, 6);
    expect(bondRate(balance, 'C')).toBeGreaterThan(bondRate(balance, 'B')!);
    expect(bondRate(balance, 'B', { credit: 0, mood: 50 })).toBeCloseTo(B.baseRate + B.spreads.B + B.climateSpread, 6);
    expect(bondRate(balance, 'B', { credit: 100, mood: 50 })).toBeGreaterThanOrEqual(B.minRate);
    expect(bondRate(balance, 'D')).toBeNull();
    const g = ag(0.2);
    expect(issueBond({ ...g, rating: 'D' }, balance, B.sizes[0], B.terms[0]).ok).toBe(false);
  });

  it('Ausgabe bringt die Summe abzüglich Provision; der Imperiumswert sinkt nur um die Provision', () => {
    const g = ag(0.2);
    const B = balance.stocks.bonds;
    const n = ok(issueBond(g, balance, B.sizes[0], B.terms[0]));
    expect(n.cash).toBe(g.cash + Math.round(B.sizes[0] * (1 - B.fee)));
    expect(empireValue(n, balance)).toBeCloseTo(empireValue(g, balance) - B.sizes[0] * B.fee, 2);
    expect(issueBond(g, balance, 12345, B.terms[0]).ok).toBe(false);
    expect(issueBond(g, balance, B.sizes[0], 99).ok).toBe(false);
  });

  it('der Kupon läuft jede Runde – auch in der Krise –, am Ende kommt die ganze Summe zurück', () => {
    const B = balance.stocks.bonds;
    let g = ok(issueBond(ag(0.2), balance, B.sizes[0], B.terms[0]));
    const kupon = bondCoupons(st(g));
    expect(kupon).toBeCloseTo((B.sizes[0] * st(g).bonds[0].rate) / 4, 2);
    const vorher = g.cash;
    g = { ...settleStocks(g, balance, { credit: 0, mood: 0 }), round: g.round + 1 };
    expect(g.cash).toBeCloseTo(vorher - kupon, 2);
    g = runden(g, B.terms[0] - 1, mit({ demands: { chance: 0 } }));
    expect(st(g).bonds).toHaveLength(0);
    expect(g.log.some((l) => l.includes('fällig'))).toBe(true);
  });

  it('eine große Anleihe braucht bei der AG die Mehrheit im Rat', () => {
    // Imperiumswert 150.000 $: Rahmen 75.000 $, Mehrheit ab 37.500 $.
    const g = ag(0.2, 'gross', balance, 150000);
    const untreu = { ...g, stocks: { ...st(g), board: st(g).board.map((m) => ({ ...m, loyalty: 0 })) } };
    const gross = Math.max(...balance.stocks.bonds.sizes);
    expect(gross).toBeGreaterThan(balance.stocks.board.bigDecision * empireValue(g, balance));
    expect(issueBond(untreu, balance, gross, balance.stocks.bonds.terms[0]).ok).toBe(false);
    expect(issueBond(g, balance, gross, balance.stocks.bonds.terms[0]).ok).toBe(true);
  });

  it('höchstens eine Anleihe je Runde – zwanzig Klicks bringen nicht zwanzig Anleihen', () => {
    const B = balance.stocks.bonds;
    let g = ag(0.2, 'serie', balance, 400000);
    g = ok(issueBond(g, balance, B.sizes[0], B.terms[0]));
    const zweite = issueBond(g, balance, B.sizes[0], B.terms[0]);
    expect(zweite.ok).toBe(false);
    if (!zweite.ok) expect(zweite.reason).toContain('Diese Runde');
    // In der nächsten Runde geht es wieder.
    expect(issueBond({ ...g, round: g.round + 1 }, balance, B.sizes[0], B.terms[0]).ok).toBe(true);
  });

  it('der Rahmen rechnet alle laufenden Anleihen mit; darüber wird abgelehnt', () => {
    const B = balance.stocks.bonds;
    // Imperiumswert 101.000 $ → Rahmen 50.500 $ (die Provision drückt ihn leicht): zweimal 25.000 $ geht, die dritte nicht.
    let g = ag(0.2, 'rahmen', balance, 101000);
    expect(bondLimit(g, balance)).toBe(Math.round(B.limitShare * 101000));
    g = ok(issueBond(g, balance, 25000, B.terms[0]));
    g = ok(issueBond({ ...g, round: g.round + 1 }, balance, 25000, B.terms[0]));
    expect(bondDebt(st(g))).toBe(50000);
    const dritte = issueBond({ ...g, round: g.round + 2 }, balance, B.sizes[0], B.terms[0]);
    expect(dritte.ok).toBe(false);
    if (!dritte.ok) expect(dritte.reason).toContain('höchstens');
    // Familienfirma: kein Rat und keine neuen Anleihen.
    const f = startStocks(kapitel2(0, 'familie-rahmen', 10000), balance, inhalt.board);
    expect(bondLimit(f, balance)).toBe(B.limitMin);
    expect(issueBond(f, balance, 25000, B.terms[0]).ok).toBe(false);
  });

  it('die Mehrheitsprüfung gilt für die Summe aller Anleihen, nicht nur für die neue', () => {
    const B = balance.stocks.bonds;
    // Imperiumswert 150.000 $: Mehrheit ab 37.500 $. Zwei Anleihen über 25.000 $ sind zusammen 50.000 $.
    let g = ag(0.2, 'summe', balance, 150000);
    g = ok(issueBond(g, balance, 25000, B.terms[0]));
    const untreu = { ...g, round: g.round + 1, stocks: { ...st(g), board: st(g).board.map((m) => ({ ...m, loyalty: 0 })) } };
    expect(issueBond(untreu, balance, 25000, B.terms[0]).ok).toBe(false);
    expect(issueBond({ ...g, round: g.round + 1 }, balance, 25000, B.terms[0]).ok).toBe(true);
  });

  it('je mehr Anleihen laufen, desto höher der Zins', () => {
    const B = balance.stocks.bonds;
    let g = ag(0.2, 'quote', balance, 200000);
    const erste = bondOffer(g, balance, 25000);
    g = ok(issueBond(g, balance, 25000, B.terms[0]));
    expect(st(g).bonds[0].rate).toBe(erste.rate);
    const zweite = bondOffer({ ...g, round: g.round + 1 }, balance, 25000);
    expect(zweite.rate!).toBeGreaterThan(erste.rate!);
    expect(zweite.rate! - bondRate(balance, g.rating)!).toBeCloseTo(B.loadSpread * zweite.load, 4);
  });
});

describe('Zufall, Spielstand, Zahlen und Texte', () => {
  it('gleicher Seed, gleicher Verlauf', () => {
    expect(runden(ag(0.49, 'gleich'), 10)).toEqual(runden(ag(0.49, 'gleich'), 10));
  });

  it('Spielstand mit Aktienbuch übersteht Sichern und Laden; kaputtes Aktienbuch wird abgelehnt', () => {
    const g = runden(ag(0.49, 'speichern'), 6);
    const r = deserializeGame(serializeGame(g, 'test'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.stocks).toEqual(g.stocks);
    expect(isStocksState(st(g))).toBe(true);
    const kaputt = deserializeGame(serializeGame({ ...g, stocks: { ...st(g), board: [{ id: 'x', agenda: 'gier' }] } as unknown as StocksState }, 'test'));
    expect(kaputt.ok).toBe(false);
    // Kapitel-1-Stände ohne Aktienbuch laden weiter.
    expect(deserializeGame(serializeGame(newGame('k1', balance), 'test')).ok).toBe(true);
  });

  it('balance.yaml: Block stocks ist Pflicht und wird geprüft', () => {
    const ohne = { ...rawBalance() } as Record<string, unknown>;
    delete ohne.stocks;
    expect(() => parseBalance(ohne)).toThrow(BalanceError);
    const raw = rawBalance() as { stocks: { board: Record<string, unknown> } };
    const verdreht = { ...raw, stocks: { ...raw.stocks, board: { ...raw.stocks.board, seatsMin: 10 } } };
    expect(() => parseBalance(verdreht)).toThrow(BalanceError);
  });

  it('content/stocks.yaml ist vollständig, mit Englisch, und Fehler werden gemeldet', () => {
    expect(inhalt.board.length).toBeGreaterThanOrEqual(balance.stocks.board.seatsMax);
    expect(inhalt.board.every((m) => m.name.en !== '' && m.role.en !== '')).toBe(true);
    expect(Object.values(inhalt.demands).every((d) => d.en !== '')).toBe(true);
    const { content: c, errors } = parseStocksContent(FILE, 'board: []\nstraw: []\n');
    expect(c).toBeNull();
    expect(errors.map((e) => e.message).join('\n')).toMatch(/mindestens 9 Räte[\s\S]*thorne[\s\S]*straw/);
    const doppelt = parseStocksContent(FILE, stocksText.replace('id: witwe', 'id: bankier'));
    expect(doppelt.errors.some((e) => e.message.includes('doppelt'))).toBe(true);
  });
});

describe('Folgen in Worten (Lesehilfe)', () => {
  it('Forderungs-Hinweise nennen die Zahlen aus balance.yaml', () => {
    const D = balance.stocks.demands;
    const h = demandHints(inhalt, balance, false, 'de');
    expect(h.accept).toContain(`um ${D.fulfillGain}`);
    expect(h.accept).toContain(`um ${D.failLoss}`);
    expect(h.reject).toContain(`um ${D.rejectLoss}`);
    expect(h.reject).toContain(`+${D.quietGain}`);
    expect(h.withdraw).toContain(String(D.failLoss));
    expect(h.court).toContain(String(balance.stocks.board.courtGain));
    expect(demandHints(inhalt, balance, true, 'de').reject).toContain(String(D.spyPenalty));
    expect(JSON.stringify(h)).not.toMatch(/\{\w+\}/);
  });
});
