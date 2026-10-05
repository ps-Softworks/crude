// Kampagnen-Bots (4.20, GDD §15 und §17): Die Bots aus bots.ts spielen nicht nur Kapitel 1, sondern
// die ganze Early-Access-Kampagne – Kapitel 1, Zeitsprung I, Kapitel 2, Zeitsprung II, Kapitel 3 –
// mit Termin-Aktionen (Ritt, Karten), Ereignissen, Börsengang, Direktiven und Weichen, Raffinerie,
// Marke und Börse. Gemessen werden Krisen je Kampagne, Pleitequoten und Imperiumswerte je Kapitel,
// Siegquoten und ob ein Weg (Haltung im Zeitsprung) dominiert. Rein und deterministisch: Jeder
// Zufall kommt aus dem Seed, die Welt läuft mit dem Weltmodell aus world.ts.
//
// Wie jede Strategie die späteren Kapitel spielt, steht in balance.yaml unter bots.campaign; die
// Zielwerte unter bots.campaignTargets. Ausgabe: tools/kampagnenlaeufe.ts → docs/botlaeufe.md.

import { CAMPAIGN_TARGET_IDS, FAMILY_TIMES, STANCES, type Balance, type CampaignBotPolicy, type CampaignTargetId, type FamilyTime, type Stance } from './balance';
import { botTurn, playGame, type Strategy, STRATEGIES } from './bots';
import { botChapterSystems } from './botsKapitel3';
import { canGoPublic, chapterResult, decideIpo, type ChapterResult } from './chapter';
import type { ChapterSystemTexts } from './chapterSystems';
import { chapterOf } from './chapterOf';
import { empireValue } from './empire';
import type { EventDef } from './events';
import { buyStock, exchangeWarning, readClimate, sellPosition } from './exchange';
import { endRound, type GameState } from './game';
import type { Kapitel3Content } from './kapitel3Content';
import { Rng, seedFromString } from './rng';
import { buyBack, control, courtMember, thorneBlocks, thorneStake, totalShares } from './stocks';
import { answerSwitch, runTimeskip, startTimeskip, SWITCH_CHOICES, type Directives, type SwitchId } from './timeskip';
import { skipWorld, type WorldState } from './world';
import { creditCrises } from './worldRun';

/** Texte, die Kapitel 2 und 3 brauchen (Räte des Aufsichtsrats, Kapitel-3-Texte). */
export interface CampaignTexts extends ChapterSystemTexts {
  kapitel3?: Kapitel3Content;
}

/** Krisen der Welt (GDD §15): Kreditkrisen (Bankpanik + Crash), Ölschwemmen, Kriege. */
export interface CrisisCount {
  credit: number;
  gluts: number;
  wars: number;
}

/** Wie ein Kapitel (oder der Sprung davor) für Jacob ausging. */
export interface ChapterOutcome {
  chapter: 1 | 2 | 3;
  /** erreicht, verfehlt, pleite, abgesetzt, geschluckt, haft – „pleite“ auch, wenn Jacob im Sprung davor pleiteging. */
  result: ChapterResult;
  /** Ging die Kampagne im Zeitsprung vor diesem Kapitel zu Ende? */
  inJump: boolean;
  /** Imperiumswert am Kapitelende (0, wenn die Kampagne vorher endete). */
  value: number;
  /** Kreditkrisen der Welt während des Kapitels (ohne den Sprung davor). */
  creditCrisis: boolean;
}

export interface CampaignResult {
  seed: string;
  strategy: Strategy;
  /** Haltung in beiden Zeitsprüngen. */
  stance: Stance;
  /** Je erreichtem Kapitel ein Eintrag; endet die Kampagne früh, fehlen die späteren. */
  chapters: ChapterOutcome[];
  /** Bis zum Ende von Kapitel 3 durchgespielt (auch mit verfehlten Prüfungen)? */
  survived: boolean;
  /** Imperiumswert am Ende der Kampagne; wer vorher ausscheidet, zählt 0. */
  finalValue: number;
  /** Krisen der Welt über die ganze Kampagne (Jahr 0 bis Ende Kapitel 3); nach einem frühen Ende läuft die Welt allein weiter. */
  crises: CrisisCount;
  /** Börse (Kapitel 3): Käufe auf Kredit und Zwangsverkäufe. */
  marginBuys: number;
  liquidations: number;
}

/** Letzte Runde von Kapitel 3: Kapitel 1 + zwei Mal (Zeitsprung + nächstes Kapitel). */
export function campaignEndRound(balance: Balance, chapter1Rounds: number): number {
  return chapter1Rounds + 2 * (balance.timeskip.rounds + balance.timeskip.nextChapterRounds);
}

function crisesOf(w: WorldState): CrisisCount {
  return { credit: creditCrises(w), gluts: w.counts.gluts, wars: w.counts.wars };
}

/** Die Politik einer Strategie für Kapitel 2/3 (balance.yaml bots.campaign); der Zufalls-Bot würfelt seine. */
export function campaignPolicy(balance: Balance, strategy: Strategy, rng: Rng): CampaignBotPolicy {
  const c = balance.bots.campaign;
  switch (strategy) {
    case 'vorsichtig':
      return c.cautious;
    case 'gierig':
      return c.greedy;
    case 'ausgewogen':
      return c.balanced;
    case 'zufaellig': {
      const stance = STANCES[rng.int(0, STANCES.length - 1)];
      const family = FAMILY_TIMES[rng.int(0, FAMILY_TIMES.length - 1)];
      const anteile = [0, ...balance.chapter.ipo.shares];
      const answers = Object.fromEntries((Object.keys(SWITCH_CHOICES) as SwitchId[]).map((id) => [id, SWITCH_CHOICES[id][rng.int(0, 1)]])) as Record<SwitchId, string>;
      return {
        ...c.balanced,
        perRound: c.balanced.perRound,
        stance,
        family,
        ipo: anteile[rng.int(0, anteile.length - 1)],
        answers,
        systemsChance: c.randomSystemsChance,
        exchange: rng.float() < 0.5 ? null : { share: rng.float(), leverage: balance.exchange.margin.leverages[rng.int(0, balance.exchange.margin.leverages.length - 1)], sellOnWarning: rng.float() < 0.5 },
      };
    }
  }
}

/**
 * Ein Zeitsprung mit den Direktiven und Weichen-Antworten der Politik. Zu teure Antworten ersetzt der
 * Bot durch die andere (wie jumpWith in timeskipBots.ts).
 */
export function campaignJump(state: GameState, balance: Balance, directives: Directives, answers: Readonly<Record<string, string>>, catalog: readonly EventDef[], texts: CampaignTexts): GameState {
  const start = startTimeskip(state, balance, directives);
  if (!start.ok) throw new Error(`campaignJump: ${start.reason}`);
  let s = start.state;
  for (let i = 0; i < 12; i++) {
    const step = runTimeskip(s, balance, catalog, texts);
    if (step.status === 'done') return step.state;
    const wahl = answers[step.id] ?? SWITCH_CHOICES[step.id][0];
    let a = answerSwitch(s, balance, step.id, wahl, catalog, texts);
    if (!a.ok) a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id].find((c) => c !== wahl)!, catalog, texts);
    if (!a.ok) throw new Error(`campaignJump: ${a.reason}`);
    s = a.state;
  }
  throw new Error('campaignJump: zu viele Weichen.');
}

/**
 * Börse (Kapitel 3, GDD §8): Mit Politik kauft der Bot einen Teil seines freien Geldes (über der
 * Rücklage) auf Kredit – höchstens eine Position zugleich, die Aktie mit dem besten letzten Kurs.
 * Wer auf Warnungen hört, verkauft, sobald die Zeitung vor der Blase warnt, und kauft dann nicht nach.
 */
export function exchangeTurn(state: GameState, balance: Balance, policy: CampaignBotPolicy): GameState {
  const ex = state.exchange;
  const p = policy.exchange;
  if (!ex || !p || state.finished || chapterOf(state) < balance.exchange.unlockChapter) return state;
  const warnung = exchangeWarning(ex, balance.exchange, readClimate(state));
  let s = state;
  if (warnung && p.sellOnWarning) {
    for (const pos of ex.positions) {
      const r = sellPosition(s, balance, pos.id);
      if (r.ok) s = r.state;
    }
    return s;
  }
  if ((s.exchange?.positions.length ?? 0) > 0 || ex.crash > 0 || (warnung && p.sellOnWarning)) return s;
  const einsatz = Math.floor((s.cash - policy.reserve) * p.share);
  if (einsatz < balance.exchange.margin.minBuy) return s;
  const aktien = Object.keys(ex.prices).sort();
  const trend = (id: string) => {
    const h = ex.history[id] ?? [];
    return h.length >= 2 ? h[h.length - 1] / Math.max(1e-9, h[h.length - 2]) : 1;
  };
  const beste = aktien.reduce((a, b) => (trend(b) > trend(a) + 1e-12 ? b : a), aktien[0]);
  if (beste === undefined) return s;
  const r = buyStock(s, balance, beste, einsatz, p.leverage);
  return r.ok ? r.state : s;
}

/**
 * Aktienbuch (Kapitel 2/3, GDD §8): Wer sich wehrt, führt jede Runde den unzufriedensten Rat zum Essen aus,
 * solange er noch nicht sicher auf Jacobs Seite steht, und kauft Aktien von den Kleinaktionären zurück, sobald
 * Thorne mitkauft oder die Kontrolle wackelt – aus dem Geld über der Rücklage, höchstens buyback der Aktien je
 * Runde und nur, solange Thorne keine Sperrminorität hat.
 */
export function stocksTurn(state: GameState, balance: Balance, policy: CampaignBotPolicy): GameState {
  const st = state.stocks;
  if (!st || !st.public || st.ousted > 0 || state.finished || !policy.defend) return state;
  const b = balance.stocks;
  let s = state;
  const unsicher = st.board.filter((m) => m.agenda !== 'spy' && m.loyalty < b.board.loyalFrom + b.board.courtGain).sort((x, y) => x.loyalty - y.loyalty || (x.id < y.id ? -1 : 1));
  if (unsicher.length > 0 && s.cash - b.board.courtCost >= policy.reserve) {
    const r = courtMember(s, balance, unsicher[0].id);
    if (r.ok) s = r.state;
  }
  const a = s.stocks!;
  const gefahr = thorneStake(a) >= policy.defend.thorneFrom || control(a, balance) < policy.defend.controlBelow;
  if (gefahr && !thorneBlocks(a, balance) && a.float > 0) {
    const jeAktie = a.price * (1 + b.buyback.premium);
    const leisten = Math.floor((s.cash - policy.reserve) / Math.max(1e-9, jeAktie));
    const n = Math.min(a.float, Math.floor(totalShares(a) * policy.defend.buyback), leisten);
    if (n >= 1) {
      const r = buyBack(s, balance, n);
      if (r.ok) s = r.state;
    }
  }
  return s;
}

/** Spielt ein Kapitel (2 oder 3) bis zum Ende: botTurn, Kapitelsysteme, Börse, endRound. */
function playChapter(state: GameState, balance: Balance, strategy: Strategy, policy: CampaignBotPolicy, rng: Rng, catalog: readonly EventDef[], texts: CampaignTexts, stats: { marginBuys: number; liquidations: number }): GameState {
  let s = state;
  const grenze = s.totalRounds + 5;
  while (!s.finished) {
    if (s.round > grenze) throw new Error(`Kampagne ${s.seed} (${strategy}) endet Kapitel ${s.chapter} nicht.`);
    let t = botTurn(s, balance, strategy, rng, catalog);
    if (policy.systemsChance >= 1 || rng.float() < policy.systemsChance) t = botChapterSystems(t, balance, { reserve: policy.reserve, perRound: policy.perRound });
    t = stocksTurn(t, balance, policy);
    const vorher = t.exchange?.positions.length ?? 0;
    t = exchangeTurn(t, balance, policy);
    if ((t.exchange?.positions.length ?? 0) > vorher) stats.marginBuys += t.exchange!.positions.some((x) => x.loan > 0) ? 1 : 0;
    s = endRound(t, balance, catalog, texts.kapitel3 ? { kapitel3: texts.kapitel3 } : {});
    stats.liquidations += s.exchange?.liquidated.length ?? 0;
  }
  return s;
}

function creditCount(s: GameState): number {
  return creditCrises(s.worldModel);
}

/** Eine Kampagne über Kapitel 1–3 mit einer Strategie. stance überschreibt die Haltung der Politik (Gegenprobe „Weg“). */
export function playCampaign(seed: string, balance: Balance, strategy: Strategy, catalog: readonly EventDef[], texts: CampaignTexts, stance?: Stance, chapter1?: GameState): CampaignResult {
  const rng = new Rng(seedFromString(`${seed}:kampagne:${strategy}`));
  const basis = campaignPolicy(balance, strategy, rng);
  const policy: CampaignBotPolicy = stance ? { ...basis, stance } : basis;
  const stats = { marginBuys: 0, liquidations: 0 };
  const k1 = chapter1 ?? playGame(seed, balance, strategy, catalog).state;
  const endeRunde = campaignEndRound(balance, k1.totalRounds);
  const chapters: ChapterOutcome[] = [{ chapter: 1, result: chapterResult(k1, balance), inJump: false, value: k1.ending === 'pleite' ? 0 : empireValue(k1, balance), creditCrisis: creditCount(k1) > 0 }];
  const ende = (s: GameState, survived: boolean): CampaignResult => {
    const rest = Math.max(0, endeRunde - s.round);
    const welt = rest > 0 ? skipWorld(s.worldModel, balance.worldModel, rest, {}, balance.laws) : s.worldModel;
    return { seed, strategy, stance: policy.stance, chapters, survived, finalValue: survived ? empireValue(s, balance) : 0, crises: crisesOf(welt), ...stats };
  };
  if (k1.ending !== 'kapitel') return ende(k1, false);
  let s = k1;
  if (policy.ipo > 0 && canGoPublic(s, balance) && s.ipo === null) {
    const anteil = balance.chapter.ipo.shares.reduce((a, b) => (Math.abs(b - policy.ipo) < Math.abs(a - policy.ipo) ? b : a));
    const r = decideIpo(s, balance, anteil);
    if (r.ok) s = r.state;
  } else if (canGoPublic(s, balance) && s.ipo === null) {
    const r = decideIpo(s, balance, 0);
    if (r.ok) s = r.state;
  }
  for (const kapitel of [2, 3] as const) {
    s = campaignJump(s, balance, { stance: policy.stance, family: policy.family }, policy.answers, catalog, texts);
    if (s.finished) {
      chapters.push({ chapter: kapitel, result: s.ending === 'pleite' ? 'pleite' : chapterResult(s, balance), inJump: true, value: 0, creditCrisis: false });
      return ende(s, false);
    }
    const krisenVorher = creditCount(s);
    s = playChapter(s, balance, strategy, policy, rng, catalog, texts, stats);
    const ergebnis = chapterResult(s, balance);
    const weiter = s.ending === 'kapitel';
    chapters.push({ chapter: kapitel, result: ergebnis, inJump: false, value: weiter ? empireValue(s, balance) : 0, creditCrisis: creditCount(s) > krisenVorher });
    if (!weiter) return ende(s, false);
  }
  return ende(s, true);
}

// --- Auswertung ----------------------------------------------------------------

export interface CampaignChapterRow {
  chapter: 1 | 2 | 3;
  /** Kampagnen, die dieses Kapitel begonnen haben (Kapitel 1: alle). */
  started: number;
  /** Anteil aller Kampagnen, die in diesem Kapitel (oder im Sprung davor) ausscheiden. */
  out: number;
  /** davon pleite (auch im Sprung), davon im Sprung, abgesetzt/geschluckt, Haft. */
  bankrupt: number;
  jumpBankrupt: number;
  /** Pleitequote in diesem Kapitel (mit Sprung) unter den Kampagnen, die das Kapitel davor bestanden haben; Kapitel 1: alle. */
  bankruptAfterPass: number;
  afterPass: number;
  ousted: number;
  prison: number;
  /** Anteil aller Kampagnen, die die Kapitelprüfung bestehen. */
  goal: number;
  /** Ø, Median und 90 % des Imperiumswerts am Kapitelende (nur Kampagnen, die es erreichen). */
  mean: number;
  p50: number;
  p90: number;
  /** Pleitequote im Kapitel unter den Gestarteten, getrennt nach Welten mit bzw. ohne Kreditkrise im Kapitel. */
  crisisGames: number;
  crisisBankrupt: number;
  calmGames: number;
  calmBankrupt: number;
}

export interface CampaignRow {
  strategy: Strategy;
  games: number;
  chapters: CampaignChapterRow[];
  /** Bis Ende Kapitel 3 durchgespielt. */
  survived: number;
  /** Anteil aller Kampagnen, die irgendwann pleitegehen. */
  bankrupt: number;
  meanFinal: number;
  /** Anteil der Seeds mit dem höchsten Endwert (Gleichstand geteilt; ohne Überlebende: kein Sieger). */
  winRate: number;
  marginBuys: number;
  liquidations: number;
  results: CampaignResult[];
}

function quantil(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function schnitt(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Siegquote je Strategie über dieselben Seeds: höchster Endwert gewinnt, Pleite zählt 0. */
export function campaignWinners(byStrategy: readonly (readonly CampaignResult[])[]): number[] {
  const wins = byStrategy.map(() => 0);
  const n = byStrategy[0]?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const werte = byStrategy.map((rs) => rs[i].finalValue);
    const best = Math.max(...werte);
    if (best <= 0) continue;
    const sieger = werte.map((v, j) => (v === best ? j : -1)).filter((j) => j >= 0);
    for (const j of sieger) wins[j] += 1 / sieger.length;
  }
  return wins.map((w) => w / Math.max(1, n));
}

export function chapterRows(results: readonly CampaignResult[]): CampaignChapterRow[] {
  const n = Math.max(1, results.length);
  return ([1, 2, 3] as const).map((k): CampaignChapterRow => {
    const hier = results.map((r) => r.chapters.find((c) => c.chapter === k)).filter((c): c is ChapterOutcome => c !== undefined);
    const nachErfolg = k === 1 ? hier : results.filter((r) => r.chapters.find((c) => c.chapter === k - 1)?.result === 'erreicht').map((r) => r.chapters.find((c) => c.chapter === k)!);
    const raus = hier.filter((c) => c.result !== 'erreicht' && c.result !== 'verfehlt');
    const fertig = hier.filter((c) => c.result === 'erreicht' || c.result === 'verfehlt');
    const gespielt = hier.filter((c) => !c.inJump);
    const krise = gespielt.filter((c) => c.creditCrisis);
    const ruhig = gespielt.filter((c) => !c.creditCrisis);
    const pleite = (cs: readonly ChapterOutcome[]) => cs.filter((c) => c.result === 'pleite').length;
    const werte = fertig.map((c) => c.value);
    return {
      chapter: k,
      started: hier.length,
      out: raus.length / n,
      bankrupt: pleite(raus) / n,
      jumpBankrupt: pleite(raus.filter((c) => c.inJump)) / n,
      bankruptAfterPass: nachErfolg.length ? pleite(nachErfolg) / nachErfolg.length : 0,
      afterPass: nachErfolg.length,
      ousted: raus.filter((c) => c.result === 'abgesetzt' || c.result === 'geschluckt').length / n,
      prison: raus.filter((c) => c.result === 'haft').length / n,
      goal: hier.filter((c) => c.result === 'erreicht').length / n,
      mean: schnitt(werte),
      p50: quantil(werte, 0.5),
      p90: quantil(werte, 0.9),
      crisisGames: krise.length,
      crisisBankrupt: krise.length ? pleite(krise) / krise.length : 0,
      calmGames: ruhig.length,
      calmBankrupt: ruhig.length ? pleite(ruhig) / ruhig.length : 0,
    };
  });
}

export function campaignRow(strategy: Strategy, results: readonly CampaignResult[], winRate: number): CampaignRow {
  return {
    strategy,
    games: results.length,
    chapters: chapterRows(results),
    survived: schnitt(results.map((r) => (r.survived ? 1 : 0))),
    bankrupt: schnitt(results.map((r) => (r.chapters.some((c) => c.result === 'pleite') ? 1 : 0))),
    meanFinal: schnitt(results.map((r) => r.finalValue)),
    winRate,
    marginBuys: schnitt(results.map((r) => r.marginBuys)),
    liquidations: schnitt(results.map((r) => r.liquidations)),
    results: [...results],
  };
}

/** Gegenprobe „Weg“: der Standard-Bot mit jeder Haltung auf denselben Seeds. */
export interface StanceVariant {
  stance: Stance;
  survived: number;
  meanFinal: number;
  /** Anteil der Seeds, in denen diese Haltung den höchsten Endwert hat. */
  winRate: number;
}

/** Gegenprobe „gleicher Start“: jede Strategie spielt Kapitel 2 und 3 vom Kapitelende des Standard-Bots aus. */
export interface FairStartRow {
  strategy: Strategy;
  survived: number;
  meanFinal: number;
  winRate: number;
}

export interface CampaignReport {
  games: number;
  rows: CampaignRow[];
  stances: StanceVariant[];
  fair: FairStartRow[];
  /**
   * Krisen je Kampagne je Strategie (die Welt hängt vom Seed und vom Handeln ab: Kauf auf Kredit heizt
   * Börse und Kreditklima an). Der Zielwert gilt für die Welten des vorsichtigen Bots – er kauft nie auf
   * Kredit, das kommt GDD §15 „ohne Eingreifen des Spielers“ am nächsten.
   */
  crises: Record<Strategy, { credit: number[]; gluts: number[]; wars: number[] }>;
}

/** Alle Kampagnen: jede Strategie auf denselben Seeds wie npm run bots, dazu die Haltungs-Gegenprobe. */
export function runCampaignBots(balance: Balance, games: number, catalog: readonly EventDef[], texts: CampaignTexts, onProgress?: (done: number) => void): CampaignReport {
  const seeds = Array.from({ length: games }, (_, i) => `${balance.bots.seedPrefix}-${i}`);
  const je: CampaignResult[][] = STRATEGIES.map(() => []);
  const haltung: Record<Stance, CampaignResult[]> = { aggressive: [], balanced: [], cautious: [] };
  const gleich: CampaignResult[][] = STRATEGIES.map(() => []);
  const standardIndex = STRATEGIES.indexOf('ausgewogen');
  seeds.forEach((seed, i) => {
    const k1Standard = playGame(seed, balance, 'ausgewogen', catalog).state;
    STRATEGIES.forEach((strategy, j) => {
      const k1 = j === standardIndex ? k1Standard : playGame(seed, balance, strategy, catalog).state;
      const r = playCampaign(seed, balance, strategy, catalog, texts, undefined, k1);
      je[j].push(r);
      if (j === standardIndex) {
        for (const st of STANCES) haltung[st].push(st === r.stance ? r : playCampaign(seed, balance, strategy, catalog, texts, st, k1));
      }
    });
    // Gleicher Start: alle vom Kapitelende des Standard-Bots (für ihn selbst ist das seine Kampagne).
    STRATEGIES.forEach((strategy, j) => gleich[j].push(j === standardIndex ? je[j][i] : playCampaign(seed, balance, strategy, catalog, texts, undefined, k1Standard)));
    onProgress?.(i + 1);
  });
  const fairWins = campaignWinners(gleich);
  const fair = STRATEGIES.map((strategy, j): FairStartRow => ({
    strategy,
    survived: schnitt(gleich[j].map((r) => (r.survived ? 1 : 0))),
    meanFinal: schnitt(gleich[j].map((r) => r.finalValue)),
    winRate: fairWins[j],
  }));
  const wins = campaignWinners(je);
  const rows = STRATEGIES.map((s, j) => campaignRow(s, je[j], wins[j]));
  const hWins = campaignWinners(STANCES.map((st) => haltung[st]));
  const stances = STANCES.map((stance, j): StanceVariant => ({
    stance,
    survived: schnitt(haltung[stance].map((r) => (r.survived ? 1 : 0))),
    meanFinal: schnitt(haltung[stance].map((r) => r.finalValue)),
    winRate: hWins[j],
  }));
  const crises = Object.fromEntries(
    STRATEGIES.map((s, j) => [s, { credit: je[j].map((r) => r.crises.credit), gluts: je[j].map((r) => r.crises.gluts), wars: je[j].map((r) => r.crises.wars) }]),
  ) as CampaignReport['crises'];
  return { games, rows, stances, fair, crises };
}

// --- Zielwerte -----------------------------------------------------------------

export { CAMPAIGN_TARGET_IDS, type CampaignTargetId };

export interface CampaignTargetRow {
  id: CampaignTargetId;
  label: string;
  source: string;
  min: number;
  max: number;
  value: number;
  ok: boolean;
  unit: 'share' | 'ratio' | 'count';
}

const LABEL: Record<CampaignTargetId, { label: string; source: string; unit: CampaignTargetRow['unit'] }> = {
  creditCrises: { label: 'Ø Kreditkrisen je Kampagne (Kapitel 1–3, 24 Jahre; Welten ohne Kauf auf Kredit)', source: 'GDD §15: 2–4 je Kampagne (73 Jahre) → anteilig', unit: 'count' },
  gluts: { label: 'Ø Ölschwemmen je Kampagne (Kapitel 1–3)', source: 'GDD §15: 1–3 je Kampagne → anteilig', unit: 'count' },
  wars: { label: 'Ø Kriege je Kampagne (Kapitel 1–3)', source: 'GDD §15: 0–2 je Kampagne → anteilig', unit: 'count' },
  standardSurvives: { label: 'Standard-Bot spielt bis Ende Kapitel 3', source: 'GDD §17: übersteht Kapitel 4 in 55–70 % → bis Kapitel 3 etwas mehr', unit: 'share' },
  standardBankruptK2: { label: 'Pleitequote Standard-Bot in Kapitel 2 (mit Sprung I), wenn Kapitel 1 bestanden', source: 'Krisen fordern Opfer, aber wer das Kapitel davor geschafft hat, überlebt meist', unit: 'share' },
  standardBankruptK3: { label: 'Pleitequote Standard-Bot in Kapitel 3 (mit Sprung II), wenn Kapitel 2 bestanden', source: 'wie Kapitel 2', unit: 'share' },
  greedyBankrupt: { label: 'Pleitequote gierig über die Kampagne', source: 'GDD §15: wer im Boom zu viele Schulden macht, stirbt im Crash', unit: 'share' },
  greedyCrisisRisk: { label: 'Pleite gierig in Kapitel 1 mit Kreditkrise ÷ ohne', source: 'GDD §8/§15: in der Krise kündigt die Bank, der Crash trifft die Verschuldeten (über 1)', unit: 'ratio' },
  standardGoalK2: { label: 'Kapitelziel 2 Standard-Bot', source: 'Kapitelprüfung erreichbar, aber nicht geschenkt', unit: 'share' },
  standardGoalK3: { label: 'Kapitelziel 3 Standard-Bot', source: 'Kapitelprüfung erreichbar, aber nicht geschenkt', unit: 'share' },
  growthK2: { label: 'Ø Imperium Ende Kapitel 2 ÷ Ende Kapitel 1 (Standard-Bot)', source: 'GDD §13: aus der Firma wird ein Herausforderer', unit: 'ratio' },
  growthK3: { label: 'Ø Imperium Ende Kapitel 3 ÷ Ende Kapitel 2 (Standard-Bot)', source: 'GDD §13: aus dem Herausforderer wird ein Konzern', unit: 'ratio' },
  cautiousBehind: { label: 'Ø Endwert vorsichtig ÷ bester Ø der Mutigeren', source: 'GDD §15: wer nie Schulden macht, wird überholt (unter 1)', unit: 'ratio' },
  winRate: { label: 'Höchste Siegquote einer Strategie (Endwert Kapitel 3)', source: 'GDD §17: keine Einzelstrategie gewinnt in mehr als 40 %', unit: 'share' },
  fairWinRate: { label: 'Höchste Siegquote einer Strategie bei gleichem Start (Kapitel 2/3 ab Kapitelende des Standard-Bots)', source: 'GDD §17 auf Kapitel 2 und 3 allein: kein Weg dominiert', unit: 'share' },
  stanceWin: { label: 'Höchste Siegquote einer Haltung im Zeitsprung (Standard-Bot)', source: 'kein dominanter Weg: keine Haltung gewinnt fast immer', unit: 'share' },
};

function row(report: CampaignReport, s: Strategy): CampaignRow {
  return report.rows.find((r) => r.strategy === s)!;
}

export function campaignTargetValues(report: CampaignReport): Record<CampaignTargetId, number> {
  const std = row(report, 'ausgewogen');
  const gier = row(report, 'gierig');
  const vor = row(report, 'vorsichtig');
  const k = (r: CampaignRow, c: 1 | 2 | 3) => r.chapters[c - 1];
  // Nur Kapitel 1: Ab Kapitel 2 ist der gierige Bot reich und hat kaum noch Bankschulden – dort zeigt die Tabelle je Kapitel die Werte.
  const gierKrise = [k(gier, 1)];
  const mitKrise = gierKrise.reduce((s, c) => s + c.crisisBankrupt * c.crisisGames, 0) / Math.max(1, gierKrise.reduce((s, c) => s + c.crisisGames, 0));
  const ohneKrise = gierKrise.reduce((s, c) => s + c.calmBankrupt * c.calmGames, 0) / Math.max(1, gierKrise.reduce((s, c) => s + c.calmGames, 0));
  return {
    creditCrises: schnitt(report.crises.vorsichtig.credit),
    gluts: schnitt(report.crises.vorsichtig.gluts),
    wars: schnitt(report.crises.vorsichtig.wars),
    standardSurvives: std.survived,
    standardBankruptK2: k(std, 2).bankruptAfterPass,
    standardBankruptK3: k(std, 3).bankruptAfterPass,
    greedyBankrupt: gier.bankrupt,
    greedyCrisisRisk: ohneKrise > 0 ? mitKrise / ohneKrise : mitKrise > 0 ? 10 : 1,
    standardGoalK2: k(std, 2).goal,
    standardGoalK3: k(std, 3).goal,
    growthK2: k(std, 1).mean > 0 ? k(std, 2).mean / k(std, 1).mean : 0,
    growthK3: k(std, 2).mean > 0 ? k(std, 3).mean / k(std, 2).mean : 0,
    cautiousBehind: Math.max(std.meanFinal, gier.meanFinal) > 0 ? vor.meanFinal / Math.max(std.meanFinal, gier.meanFinal) : 0,
    winRate: Math.max(...report.rows.map((r) => r.winRate)),
    fairWinRate: Math.max(...report.fair.map((r) => r.winRate)),
    stanceWin: Math.max(...report.stances.map((s) => s.winRate)),
  };
}

export function checkCampaignTargets(report: CampaignReport, balance: Balance): CampaignTargetRow[] {
  const werte = campaignTargetValues(report);
  return CAMPAIGN_TARGET_IDS.map((id) => {
    const { min, max } = balance.bots.campaignTargets[id];
    const value = werte[id];
    return { id, ...LABEL[id], min, max, value, ok: value >= min - 1e-9 && value <= max + 1e-9 };
  });
}

// --- Tabellen ------------------------------------------------------------------

const geld = (x: number) => `${Math.round(x).toLocaleString('de-DE')} $`;
const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const HALTUNG: Record<Stance, string> = { aggressive: 'wagemutig', balanced: 'ausgewogen', cautious: 'vorsichtig' };
const FAMILIE: Record<FamilyTime, string> = { little: 'die Firma zuerst', some: 'wie bisher', much: 'viel Zeit zu Hause' };

function wert(unit: CampaignTargetRow['unit'], x: number): string {
  return unit === 'share' ? prozent(x) : zahl(x);
}

export function campaignTables(report: CampaignReport): { overview: string; chapters: string; crises: string; stances: string; fair: string } {
  const overview = [
    '| Strategie | Kampagnen | bis Ende Kapitel 3 | je pleite | Ø Endwert | Siegquote | Ø Käufe auf Kredit | Ø Zwangsverkäufe |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.rows.map((r) => `| ${r.strategy} | ${r.games.toLocaleString('de-DE')} | ${prozent(r.survived)} | ${prozent(r.bankrupt)} | ${geld(r.meanFinal)} | ${prozent(r.winRate)} | ${zahl(r.marginBuys)} | ${zahl(r.liquidations)} |`),
  ].join('\n');
  const chapters = [
    '| Strategie | Kapitel | begonnen | scheidet aus | davon pleite | pleite schon im Sprung | abgesetzt/geschluckt | Haft | pleite nach bestandenem Vorkapitel | Kapitelziel | Ø Imperium | Median | 90 % |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.rows.flatMap((r) =>
      r.chapters.map((c) => `| ${r.strategy} | ${c.chapter} | ${c.started.toLocaleString('de-DE')} | ${prozent(c.out)} | ${prozent(c.bankrupt)} | ${prozent(c.jumpBankrupt)} | ${prozent(c.ousted)} | ${prozent(c.prison)} | ${c.chapter === 1 ? '–' : `${prozent(c.bankruptAfterPass)} (von ${c.afterPass})`} | ${prozent(c.goal)} | ${geld(c.mean)} | ${geld(c.p50)} | ${geld(c.p90)} |`),
    ),
  ].join('\n');
  const crises = [
    '| Strategie | Kapitel | Welten mit Kreditkrise | Pleitequote dort | Welten ohne | Pleitequote dort |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.rows.flatMap((r) => r.chapters.map((c) => `| ${r.strategy} | ${c.chapter} | ${c.crisisGames} | ${prozent(c.crisisBankrupt)} | ${c.calmGames} | ${prozent(c.calmBankrupt)} |`)),
  ].join('\n');
  const verteilung = (xs: readonly number[]) => `${quantil(xs, 0.1)} · ${quantil(xs, 0.5)} · ${quantil(xs, 0.9)}`;
  const krisen = [
    '| Welten von | Ø Kreditkrisen (Bankpanik + Crash) | 10 % · 50 % · 90 % | Ø Ölschwemmen | 10 % · 50 % · 90 % | Ø Kriege | 10 % · 50 % · 90 % |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.rows.map((r) => {
      const c = report.crises[r.strategy];
      return `| ${r.strategy} | ${zahl(schnitt(c.credit))} | ${verteilung(c.credit)} | ${zahl(schnitt(c.gluts))} | ${verteilung(c.gluts)} | ${zahl(schnitt(c.wars))} | ${verteilung(c.wars)} |`;
    }),
  ].join('\n');
  const stances = [
    '| Haltung (Standard-Bot) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |',
    '| --- | ---: | ---: | ---: |',
    ...report.stances.map((s) => `| ${HALTUNG[s.stance]} | ${prozent(s.survived)} | ${geld(s.meanFinal)} | ${prozent(s.winRate)} |`),
  ].join('\n');
  const fair = [
    '| Strategie (ab Kapitelende des Standard-Bots) | bis Ende Kapitel 3 | Ø Endwert | Siegquote |',
    '| --- | ---: | ---: | ---: |',
    ...report.fair.map((f) => `| ${f.strategy} | ${prozent(f.survived)} | ${geld(f.meanFinal)} | ${prozent(f.winRate)} |`),
  ].join('\n');
  return { overview, chapters: `${chapters}\n\n${crises}`, crises: krisen, stances, fair };
}

export function campaignTargetTable(targets: readonly CampaignTargetRow[]): string {
  return [
    '| Kennzahl | Ziel (Quelle) | Toleranz | Ist | im Rahmen |',
    '| --- | --- | ---: | ---: | :---: |',
    ...targets.map((t) => `| ${t.label} | ${t.source} | ${wert(t.unit, t.min)} – ${wert(t.unit, t.max)} | ${wert(t.unit, t.value)} | ${t.ok ? 'ja' : '**nein**'} |`),
  ].join('\n');
}

/** Beschreibung der Kampagnen-Politik je Strategie (für docs/botlaeufe.md). */
export function policyLine(p: CampaignBotPolicy): string {
  const boerse = p.exchange ? `Börse ${prozent(p.exchange.share)} des freien Geldes mit Hebel ${p.exchange.leverage}${p.exchange.sellOnWarning ? ', verkauft bei Warnung' : ', hält trotz Warnung'}` : 'keine Börse';
  const weichen = Object.keys(p.answers).map((id) => `${id} → ${p.answers[id]}`).join(', ');
  return `Haltung ${HALTUNG[p.stance]}, Familie „${FAMILIE[p.family]}“, Börsengang ${p.ipo > 0 ? prozent(p.ipo) : 'nein'}, Rücklage ${geld(p.reserve)}, bis ${p.perRound} Tankstellen je Runde, ${boerse}; Weichen: ${weichen}`;
}
