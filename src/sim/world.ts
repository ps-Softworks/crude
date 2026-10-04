// Weltmodell (4.1, GDD §7.1): neun Weltgrößen, je Runde (Quartal) fortgeschrieben.
// Reine Simulation mit eigenem Zufall (Seed + ":welt"), damit Karte, Ereignisse
// und Rivalen mit und ohne Weltmodell dieselben Würfel ziehen.
//
// Die neun Größen und wo sie hier stehen:
//   Angebot & Lager ........ capacity, output, stock, pipeline
//   Nachfrage .............. demand (Grundnachfrage) → effectiveDemand()
//   Kreditklima ............ credit (0–100, 50 = normal), leverage (Verschuldung), crash/panic
//   Öffentliche Stimmung ... mood (0–100)
//   Politische Lage ........ parties, government, electionIn
//   Außenspannung .......... tension (Aldmark–Varenhold, 0–100), war; foreign (Costa Negra, Qasir, 4.4)
//   Technikstand ........... tech (0–100, logistisch)
//   Nationalismus .......... nationalism (0–100)
//   (Ölpreis als Folge) .... price (Weltpreis-Index, Start 1)
//
// Drei Rückkopplungen:
//   1. Preis → Neubohrungen (verzögert um supply.delay Runden) → Kapazität → Preis.
//      Dämpft sich selbst, aber spät: Zwischendurch laufen Tanks voll oder leer.
//   2. Boom (hoher Preis) → Kreditklima → mehr Neubohrungen und Spekulation →
//      Klima steigt weiter (über 50 schaukelt es sich auf) → Auslöser. Wie schlimm
//      es wird, entscheidet die Verschuldung (leverage, 4.4): Erst ein langer Boom
//      baut so viel auf, dass aus dem Auslöser ein Crash wird – sonst nur eine Bankpanik.
//   3. Knappheit (hoher Preis) → Außenspannung → Aufrüstung → Nachfrage → Knappheit.
//      Über etwa 60 ist die Aufrüstung stärker als die Diplomatie → Krieg.
//
// „Knappheit“ heißt überall Weltpreis ÷ Trendpreis (knappheit()): Technik macht Öl
// billiger, ohne dass Firmen weniger bohren, Banken vorsichtiger oder Mächte
// ruhiger werden. Nur der Preis selbst (Kapitel 1: worldPriceFactor) sinkt mit dem Trend.
//
// Kapitel 1 spürt die Welt sanft: worldPriceFactor (Trend des Posted Price) und
// worldRateAdd (Zinsen der Bank). Die Zeitung deutet Zustände an (worldHeadline).

import type { CreditPhase, Range, WorldModelBalance } from './balance';
import { advanceLaws, isLawsState, lawWorldEffects, neutralLaws, newLaws, type LawDef, type LawsState, type LobbyMove } from './laws';
import { Rng, seedFromString, type RngState } from './rng';

import { PARTIES, type Party } from './parties';
export { PARTIES, type Party } from './parties';

/**
 * Öffentliches Handeln (4.2, GDD §7.1/§10): was Jacob (später auch Rivalen) tut und
 * die Zeitung berichtet. Jede Tat verschiebt am Rundenende Stimmung und Parteien
 * (worldModel.acts in balance.yaml). Namen wie in den Ereignissen (public: [field_fire]).
 */
export const PUBLIC_ACTS = [
  'price_war',
  'independents_stand',
  'field_fire',
  'strike',
  'strike_break',
  'charity',
  'support_handel',
  'support_volksbund',
  'support_provinz',
  'press_praise',
  'press_scandal',
] as const;
export type PublicAct = (typeof PUBLIC_ACTS)[number];

/** Ergebnis einer Wahl (4.2): Stimmenanteile = Parteianteile am Wahltag, also aus dem Weltzustand. */
export interface ElectionResult {
  /** Weltrunde, in der gewählt wurde. */
  round: number;
  shares: Record<Party, number>;
  winner: Party;
  /** Wer vorher regierte. */
  previous: Party;
}

/** Was in einer Runde in der Welt geschah – für Zeitung und Auswertung. election = eine andere Partei regiert jetzt, reelection = die regierende Partei bleibt. */
export type WorldNews =
  | 'crash'
  | 'panic'
  | 'recovery'
  | 'war'
  | 'peace'
  | 'election'
  | 'reelection'
  | 'glut'
  | 'nationalization'
  | 'uprising'
  | 'uprising_end'
  | 'embargo'
  | 'embargo_end';

/**
 * Ausland jenseits von Aldmark–Varenhold (4.4, Weltbibel): die instabile Republik
 * Costa Negra im Süden und das Wüstenkönigreich Qasir in der Ferne – beides Förderländer.
 */
export interface ForeignState {
  /** Unruhe in Costa Negra (0–100). */
  costaNegra: number;
  /** Unmut in Qasir (0–100). */
  qasir: number;
  /** Runden Aufstand in Costa Negra (0 = ruhig): ein Teil seiner Förderung fällt aus. */
  uprising: number;
  /** Runden Ölembargo aus Qasir (0 = keins): seine ganze Förderung fehlt der Welt. */
  embargo: number;
}

/** Chronik: wie oft etwas seit Kampagnenbeginn geschah. */
export interface WorldCounts {
  /** Große Kreditcrashs (4.4: nur nach langem Boom mit hoher Verschuldung). */
  crashes: number;
  /** Bankpaniken: Kreditkrisen ohne große Verschuldung (4.4). Kreditkrisen = crashes + panics. */
  panics: number;
  uprisings: number;
  embargoes: number;
  wars: number;
  gluts: number;
  nationalizations: number;
  elections: number;
  /** Wahlen, nach denen eine andere Partei regiert. */
  changes: number;
}

export interface WorldState {
  rng: RngState;
  /** Fortgeschriebene Runden seit Kampagnenbeginn (0 = Ausgangslage). */
  round: number;
  /** Grundnachfrage (Start 1), ohne Krieg, Crash und Aufrüstung. */
  demand: number;
  /** Förderkapazität aller Firmen. */
  capacity: number;
  /** Förderung der letzten Runde (Index, Nachfrage 1 = gedeckt). */
  output: number;
  /** Lager in Quartalsbedarf. */
  stock: number;
  /** Neubohrungen im Bau; die vorderste fördert zuerst. */
  pipeline: number[];
  /** Weltpreis-Index (Start 1). */
  price: number;
  credit: number;
  mood: number;
  tension: number;
  tech: number;
  /** Technikstand zu Kampagnenbeginn: Bezug für den Trendpreis. */
  techStart: number;
  nationalism: number;
  /** Anteile der Parteien, Summe 1. */
  parties: Record<Party, number>;
  government: Party;
  /** Runden bis zur nächsten Wahl. */
  electionIn: number;
  /** Runden, die ein Crash noch nachwirkt (0 = keiner). */
  crash: number;
  /** Runden, die eine Bankpanik noch nachwirkt (0 = keine, 4.4). */
  panic: number;
  /** Verschuldung der Firmen und Spekulation auf Kredit (0–100, 4.4): wächst in langen Booms. */
  leverage: number;
  /** Costa Negra und Qasir (4.4). */
  foreign: ForeignState;
  /** Runden Krieg in Übersee (0 = Frieden). */
  war: number;
  /** Was in der letzten fortgeschriebenen Runde geschah. */
  news: WorldNews[];
  counts: WorldCounts;
  /** Öffentliches Handeln dieser Runde (4.2), wirkt am Rundenende. */
  acts: PublicAct[];
  /** Was in der letzten fortgeschriebenen Runde gewirkt hat – für die Zeitung. */
  actsDone: PublicAct[];
  /** Letzte Wahl (4.2); null = in dieser Kampagne noch keine. */
  lastElection: ElectionResult | null;
  /** Gesetzgebung (4.3): Druck, Anträge, beschlossene Gesetze, Sitze, Marktanteil des Trusts. Eigener Zufall. */
  laws: LawsState;
}

/**
 * Was Spieler und Rivalen in die Welt geben. Alles optional, 0 = keine Wirkung.
 * extraSupply in Einheiten der Weltnachfrage (1 = eine ganze Weltnachfrage).
 */
export interface WorldInput {
  extraSupply?: number;
  creditShift?: number;
  /**
   * Dauerhafter Eingriff: verschiebt das Ziel der Stimmung um so viele Punkte. Wirkt je Runde
   * mit mood.speed – bleibt er bestehen, liegt die Stimmung im Gleichgewicht genau so viel höher.
   */
  moodShift?: number;
  /**
   * Einmaliger Stoß (4.2, Jacobs Taten): so viele Punkte sofort auf die Stimmung; danach zieht
   * mood.speed sie zum Ziel zurück. skipWorld gibt ihn nur in der ersten Runde mit.
   */
  moodKick?: number;
  /** Verschiebung der Parteianteile vor dem Normieren (4.2), einmalig wie moodKick. */
  partyShift?: Partial<Record<Party, number>>;
  tensionShift?: number;
  nationalismShift?: number;
  /** Lobby im Parlament (4.3, vorbereitet für Kapitel 2): einmalig wie moodKick. */
  lobby?: LobbyMove[];
  /** Verschuldung verschieben (4.4, vorbereitet für Aktien auf Kredit ab Kapitel 3): dauerhaft wie creditShift. */
  leverageShift?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function between(rng: Rng, r: Range): number {
  return r.min + rng.float() * (r.max - r.min);
}

/** Ganze Zahl in r aus einer schon gezogenen Zufallszahl in [0, 1). */
function pickInt(u: number, r: Range): number {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  return Math.min(hi, lo + Math.floor(u * (hi - lo + 1)));
}

function noCounts(): WorldCounts {
  return { crashes: 0, panics: 0, uprisings: 0, embargoes: 0, wars: 0, gluts: 0, nationalizations: 0, elections: 0, changes: 0 };
}

/** Partei mit dem größten Anteil; bei Gleichstand die zuerst genannte. */
export function leadingParty(parties: Record<Party, number>): Party {
  return PARTIES.reduce((best, p) => (parties[p] > parties[best] ? p : best), PARTIES[0]);
}

/** Anteile auf Summe 1 bringen, keine Partei unter minShare (wer darunter fiele, bekommt genau minShare). */
function normalizeParties(raw: Record<Party, number>, minShare: number): Record<Party, number> {
  const unten = new Set<Party>();
  for (;;) {
    const frei = PARTIES.filter((p) => !unten.has(p));
    const rest = 1 - minShare * unten.size;
    const summe = frei.reduce((s, p) => s + Math.max(1e-9, raw[p]), 0);
    const out = Object.fromEntries(PARTIES.map((p) => [p, unten.has(p) ? minShare : (rest * Math.max(1e-9, raw[p])) / summe])) as Record<Party, number>;
    const neu = frei.filter((p) => out[p] < minShare);
    if (neu.length === 0) return out;
    for (const p of neu) unten.add(p);
  }
}

/** Technikstand nach einer Runde (logistisch, nähert sich 100, ohne es je zu erreichen). */
function nextTech(tech: number, wb: Pick<WorldModelBalance, 'tech'>): number {
  return clamp(tech + wb.tech.rate * tech * (1 - tech / 100), 0, 100);
}

/** Wachstum der Grundnachfrage je Runde bei diesem Technikstand und dieser Nachfrage. */
function demandGrowth(tech: number, demand: number, wb: Pick<WorldModelBalance, 'demand'>): number {
  const d = wb.demand;
  return d.growth * (1 + (d.techBoost * tech) / 100) * (1 - demand / d.cap);
}

/**
 * Anteil der Kapazität, den die Firmen neu bohren, damit nach supply.delay Runden
 * genug fördert: Ersatz für Erschöpftes plus Wachstum – mitgewachsen über den Verzug,
 * sonst liefe das Angebot dem Wachstum immer hinterher (und der Preis stiege still).
 */
function steadyInvest(growth: number, wb: WorldModelBalance): number {
  // Heute begonnen, fördert die Bohrung ab Runde delay; bis dahin ist die Kapazität delay − 1 Runden gewachsen.
  return (wb.supply.depletion + growth) * (1 + growth) ** (wb.supply.delay - 1);
}

/** Die Spielzahlen, die eine Ausgangslage braucht. */
type StartBalance = Pick<WorldModelBalance, 'demand' | 'tech'> & {
  supply: Pick<WorldModelBalance['supply'], 'utilBase' | 'depletion' | 'delay' | 'stockNorm'>;
  credit: { leverage: Pick<WorldModelBalance['credit']['leverage'], 'base' | 'build' | 'decay' | 'start' | 'bubbleFrom'> };
};

/** Was sich eine Ausgangslage aussucht; der Rest (Angebot, Lager, Pipeline) folgt daraus im Gleichgewicht. */
interface StartValues {
  tech: number;
  credit: number;
  mood: number;
  tension: number;
  nationalism: number;
  parties: Record<Party, number>;
  electionIn: number;
  costaNegra: number;
  qasir: number;
}

/**
 * Verschuldung zu einem Kreditklima (4.4): share = 1 ist das Gleichgewicht, das sich
 * aufbaute, wenn das Klima schon lange so wäre. Eine neue Welt startet mit
 * leverage.start davon – passend zu ihrer Phase des Zyklus, aber noch ohne Blase.
 */
export function steadyLeverage(credit: number, lev: Pick<WorldModelBalance['credit']['leverage'], 'base' | 'build' | 'decay'>, share = 1): number {
  if (lev.decay <= 0) return lev.base;
  return clamp(lev.base + (share * (lev.build * Math.max(0, credit - 50))) / 50 / lev.decay, 0, 100);
}

/**
 * Verschuldung beim Start (neue Welt, alter Spielstand): leverage.start des
 * Gleichgewichts, aber immer knapp unter leverage.bubbleFrom – eine Blase muss
 * sich erst im Spiel aufbauen, sonst käme der nächste Auslöser sofort als Crash.
 */
export function startLeverage(credit: number, lev: Pick<WorldModelBalance['credit']['leverage'], 'base' | 'build' | 'decay' | 'start' | 'bubbleFrom'>): number {
  return Math.min(steadyLeverage(credit, lev, lev.start), Math.max(lev.base, lev.bubbleFrom - 1));
}

/** Ausgangslage einer Kampagne: Jede Welt ist neu (GDD §7.2), der Preis startet im Gleichgewicht bei 1. */
export function newWorld(seed: string, wb: WorldModelBalance): WorldState {
  const rng = new Rng(seedFromString(`${seed}:welt`));
  const s = wb.start;
  const tech = between(rng, s.tech);
  const credit = between(rng, s.credit);
  const mood = between(rng, s.mood);
  const tension = between(rng, s.tension);
  const nationalism = between(rng, s.nationalism);
  const parties = normalizeParties(
    { handel: between(rng, s.handel), volksbund: between(rng, s.volksbund), provinz: between(rng, s.provinz) },
    wb.politics.minShare,
  );
  const electionIn = rng.int(1, wb.politics.electionEvery);
  const costaNegra = between(rng, wb.foreign.costaNegra.start);
  const qasir = between(rng, wb.foreign.qasir.start);
  return { ...startState(rng.state, wb, { tech, credit, mood, tension, nationalism, parties, electionIn, costaNegra, qasir }), laws: newLaws(seed, wb.laws, parties) };
}

/**
 * Gleichgewicht ohne Zufall: Die Kapazität deckt die Nachfrage dieser Runde (mit
 * Aufrüstung) bei normaler Auslastung, das Lager ist normal, und die Pipeline
 * liefert genau das Wachstum der nächsten delay Runden. So bleibt der Preis bei 1,
 * bis Zufall und Rückkopplungen ihn bewegen – Krisen kommen nicht in allen Welten
 * zur selben Zeit.
 */
function startState(rng: RngState, wb: StartBalance, v: StartValues): Omit<WorldState, 'laws'> {
  const s = wb.supply;
  const nachfrage = effectiveDemand({ demand: 1, tension: v.tension, crash: 0, war: 0 }, wb);
  const capacity = nachfrage / s.utilBase;
  const g = demandGrowth(nextTech(v.tech, wb), 1, wb);
  // Bohrung i (vorne = 0) wurde vor delay − i Runden begonnen; fertig wird sie in Runde i + 1.
  const pipeline = Array.from({ length: s.delay }, (_, i) => (s.depletion + g) * capacity * (1 + g) ** i);
  return {
    rng,
    round: 0,
    demand: 1,
    capacity,
    output: nachfrage,
    stock: s.stockNorm,
    pipeline,
    price: 1,
    credit: v.credit,
    mood: v.mood,
    tension: v.tension,
    tech: v.tech,
    techStart: v.tech,
    nationalism: v.nationalism,
    parties: v.parties,
    government: leadingParty(v.parties),
    electionIn: v.electionIn,
    crash: 0,
    panic: 0,
    leverage: startLeverage(v.credit, wb.credit.leverage),
    foreign: { costaNegra: v.costaNegra, qasir: v.qasir, uprising: 0, embargo: 0 },
    war: 0,
    news: [],
    counts: noCounts(),
    acts: [],
    actsDone: [],
    lastElection: null,
  };
}

/** Momentaufnahme (Stand 0.4.4) für Ersatzwerte: Verschuldung und Ausland einer ruhigen Welt. */
const NEUTRAL_LEVERAGE = { base: 25, build: 5, decay: 0.04, start: 0.5, bubbleFrom: 45 };
const NEUTRAL_FOREIGN: ForeignState = { costaNegra: 25, qasir: 15, uprising: 0, embargo: 0 };

/**
 * Ersatzwert für Spielstände ohne Weltmodell (vor Format 14). Das Laden kennt
 * balance.yaml nicht, darum steht hier eine Momentaufnahme der Spielzahlen
 * (Stand 0.4.1): Mitte der Startbereiche, Angebot im Gleichgewicht. Weichen die
 * Spielzahlen später ab, gleicht advanceWorld die Pipeline an supply.delay an
 * (pipelineFor), und die Welt schwingt in wenigen Runden auf die neuen Werte ein.
 */
export function neutralWorld(seed: string): WorldState {
  const snapshot: StartBalance = {
    supply: { utilBase: 0.85, depletion: 0.02, delay: 6, stockNorm: 0.25 },
    demand: { growth: 0.012, cap: 9, techBoost: 0.6, crashDrop: 0.08, warBoost: 0.12, armsDemand: 0.06 },
    tech: { rate: 0.017 },
    credit: { leverage: NEUTRAL_LEVERAGE },
  };
  const parties = { handel: 0.38, volksbund: 0.31, provinz: 0.31 };
  const welt = startState(seedFromString(`${seed}:welt`), snapshot, {
    tech: 8,
    credit: 50,
    mood: 54,
    tension: 19,
    nationalism: 14,
    parties,
    electionIn: 16,
    costaNegra: NEUTRAL_FOREIGN.costaNegra,
    qasir: NEUTRAL_FOREIGN.qasir,
  });
  return { ...welt, laws: neutralLaws(seed, parties) };
}

/**
 * Pipeline auf supply.delay Einträge bringen, bevor eine Runde sie fortschreibt –
 * für Spielstände, die mit einem anderen delay gespeichert wurden. Zu lang: Die
 * überzähligen vorderen Bohrungen werden sofort fertig (zurückgegeben als done).
 * Zu kurz: vorne mit dem Durchschnitt auffüllen, damit weiter jede Runde etwas fertig wird.
 */
export function pipelineFor(pipeline: readonly number[], delay: number): { pipeline: number[]; done: number } {
  const p = [...pipeline];
  let done = 0;
  while (p.length > delay) done += p.shift()!;
  if (p.length < delay) {
    const mittel = p.length > 0 ? p.reduce((a, b) => a + b, 0) / p.length : 0;
    p.unshift(...Array.from({ length: delay - p.length }, () => mittel));
  }
  return { pipeline: p, done };
}

/** Nachfrage dieser Runde: Grundnachfrage mit Aufrüstung, Crash und Krieg. */
export function effectiveDemand(w: Pick<WorldState, 'demand' | 'tension' | 'crash' | 'war'>, wb: Pick<WorldModelBalance, 'demand'>): number {
  const d = wb.demand;
  return w.demand * (1 + (d.armsDemand * w.tension) / 100) * (w.crash > 0 ? 1 - d.crashDrop : 1) * (w.war > 0 ? 1 + d.warBoost : 1);
}

/** Trendpreis T: Technik macht das Fördern billiger. */
export function trendPrice(w: Pick<WorldState, 'tech' | 'techStart'>, wb: WorldModelBalance): number {
  return Math.max(wb.price.trendMin, 1 - (wb.price.techCost * (w.tech - w.techStart)) / 100);
}

/** Knappheit: Weltpreis ÷ Trendpreis (1 = normal). Danach richten sich Bohren, Fördern, Banken, Spannung, Stimmung und Politik. */
export function knappheit(w: Pick<WorldState, 'price' | 'tech' | 'techStart'>, wb: WorldModelBalance): number {
  return w.price / trendPrice(w, wb);
}

/** Weltpreis aus Nachfrage, möglicher Förderung und Lager (GDD §7.3: P = T · (N/A)^ε · Lagerdruck). */
export function worldPrice(demand: number, supply: number, stock: number, trend: number, wb: WorldModelBalance): number {
  const s = wb.supply;
  const ratio = demand / Math.max(supply, 1e-6);
  const lager = Math.exp((-s.stockWeight * (stock - s.stockNorm)) / s.stockNorm);
  return clamp(trend * ratio ** s.elasticity * lager, wb.price.min, wb.price.max);
}

/** Anteil Qasirs an der Weltförderung (4.4): wächst mit dem Ölhunger der Welt. */
export function qasirShare(demand: number, wb: Pick<WorldModelBalance, 'foreign'>): number {
  const q = wb.foreign.qasir;
  return clamp(q.shareBase + q.shareGrowth * Math.max(0, demand - 1), 0, q.shareMax);
}

/**
 * Anteil der Weltförderung, der gerade ausfällt (4.4): Aufstand in Costa Negra
 * (share × loss), Ölembargo aus Qasir (dessen ganzer Anteil). Fehlt das Ausland, fällt nichts aus.
 */
export function foreignOffline(w: Pick<WorldState, 'demand'> & { foreign?: ForeignState }, wb: Pick<WorldModelBalance, 'foreign'>): number {
  const f = w.foreign;
  if (!f) return 0;
  const cn = wb.foreign.costaNegra;
  return Math.min(0.9, (f.uprising > 0 ? cn.share * cn.loss : 0) + (f.embargo > 0 ? qasirShare(w.demand, wb) : 0));
}

/**
 * Phase des Kreditzyklus (4.4, GDD §7.2): Crash und Panik gehen vor; „überhitzt“
 * heißt hohe Verschuldung bei mutigen Banken – dann wird ein Auslöser zum Crash.
 */
export function creditPhase(w: Pick<WorldState, 'credit' | 'crash'> & { panic?: number; leverage?: number }, wb: Pick<WorldModelBalance, 'credit'>): CreditPhase {
  const c = wb.credit;
  if (w.crash > 0) return 'crash';
  if ((w.panic ?? 0) > 0) return 'panic';
  if ((w.leverage ?? 0) >= c.leverage.bubbleFrom && w.credit >= 50) return 'overheated';
  if (w.credit >= c.boomFrom) return 'boom';
  if (w.credit <= c.tightFrom) return 'tight';
  return 'normal';
}

/**
 * Was öffentliches Handeln in die Welt gibt (4.2): Stimmung und Parteianteile laut
 * worldModel.acts. Das Programm der Regierung gewichtet Verfehlungen (Stimmung
 * nach unten) mit scrutiny – unter dem Volksbund wiegt ein Feldbrand schwerer als
 * unter der Handelspartei. Je Runde höchstens ± acts.maxMood bzw. ± acts.maxParty.
 */
export function actsInput(acts: readonly PublicAct[], government: Party, wb: Pick<WorldModelBalance, 'acts' | 'programs'>): WorldInput {
  if (acts.length === 0) return {};
  const a = wb.acts;
  const scrutiny = wb.programs[government].scrutiny;
  let mood = 0;
  const parties: Record<Party, number> = { handel: 0, volksbund: 0, provinz: 0 };
  for (const act of acts) {
    const e = a[act];
    mood += e.mood < 0 ? e.mood * scrutiny : e.mood;
    for (const p of PARTIES) parties[p] += e[p];
  }
  const partyShift = Object.fromEntries(PARTIES.map((p) => [p, clamp(parties[p], -a.maxParty, a.maxParty)])) as Record<Party, number>;
  return { moodKick: clamp(mood, -a.maxMood, a.maxMood), partyShift };
}

/** Zwei Eingriffe zusammenlegen (Salt Hill und öffentliches Handeln). */
export function mergeInput(a: WorldInput, b: WorldInput): WorldInput {
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  const out: WorldInput = {};
  const extraSupply = sum(a.extraSupply, b.extraSupply);
  const creditShift = sum(a.creditShift, b.creditShift);
  const leverageShift = sum(a.leverageShift, b.leverageShift);
  const moodShift = sum(a.moodShift, b.moodShift);
  const moodKick = sum(a.moodKick, b.moodKick);
  const tensionShift = sum(a.tensionShift, b.tensionShift);
  const nationalismShift = sum(a.nationalismShift, b.nationalismShift);
  if (extraSupply !== undefined) out.extraSupply = extraSupply;
  if (creditShift !== undefined) out.creditShift = creditShift;
  if (leverageShift !== undefined) out.leverageShift = leverageShift;
  if (moodShift !== undefined) out.moodShift = moodShift;
  if (moodKick !== undefined) out.moodKick = moodKick;
  if (tensionShift !== undefined) out.tensionShift = tensionShift;
  if (nationalismShift !== undefined) out.nationalismShift = nationalismShift;
  if (a.lobby || b.lobby) out.lobby = [...(a.lobby ?? []), ...(b.lobby ?? [])];
  if (a.partyShift || b.partyShift) {
    out.partyShift = Object.fromEntries(PARTIES.map((p) => [p, (a.partyShift?.[p] ?? 0) + (b.partyShift?.[p] ?? 0)])) as Record<Party, number>;
  }
  return out;
}

/** Was geltende Gesetze (4.3) jede Runde in die Welt geben; den Marktanteil des Trusts verschieben sie in advanceLaws. */
export function lawsInput(laws: LawsState | undefined, catalog: readonly LawDef[]): WorldInput {
  const e = lawWorldEffects(laws, catalog);
  const out: WorldInput = {};
  if (e.creditShift !== undefined) out.creditShift = e.creditShift;
  if (e.moodShift !== undefined) out.moodShift = e.moodShift;
  if (e.tensionShift !== undefined) out.tensionShift = e.tensionShift;
  if (e.nationalismShift !== undefined) out.nationalismShift = e.nationalismShift;
  return out;
}

/**
 * Eine Runde Welt. Jede Runde zieht genau gleich viele Zufallszahlen, damit ein
 * Krieg nicht den Würfel für die nächste Wahl verschiebt. laws = Gesetzeskatalog
 * (content/laws/, 4.3): Geltende Gesetze wirken auf die Welt, danach tagt das
 * Parlament mit eigenem Zufall – ohne Katalog bleibt es still.
 */
export function advanceWorld(input: WorldState, wb: WorldModelBalance, externIn: WorldInput = {}, laws: readonly LawDef[] = []): WorldState {
  // Öffentliches Handeln dieser Runde (4.2) wirkt jetzt und steht danach in actsDone.
  const taten = input.acts ?? [];
  const gesetze = input.laws ?? neutralLaws(String(input.rng), input.parties);
  const extern = mergeInput(mergeInput(externIn, actsInput(taten, input.government, wb)), lawsInput(gesetze, laws));
  const rng = new Rng(input.rng);
  const u = Array.from({ length: 20 }, () => rng.float());
  const sym = (i: number) => 2 * u[i] - 1;
  const s = wb.supply;
  const news: WorldNews[] = [];
  const counts = { ...input.counts };

  // Technikstand: logistisch, nähert sich 100, ohne es je zu erreichen.
  const tech = nextTech(input.tech, wb);

  // Nachfrage: wächst bis zur Sättigung, Technik (Automobile) beschleunigt.
  const demand = input.demand * (1 + demandGrowth(tech, input.demand, wb));

  // Angebot: fertige Neubohrungen dazu, erschöpfte Quellen ab, ab und zu ein Riesenfund.
  const angeglichen = pipelineFor(input.pipeline, s.delay);
  let pipeline = angeglichen.pipeline;
  const fertig = pipeline.shift()! + angeglichen.done;
  let capacity = input.capacity * (1 - s.depletion) + fertig;
  if (u[0] < s.findChance) {
    capacity *= 1 + s.findSize.min + u[1] * (s.findSize.max - s.findSize.min);
    news.push('glut');
    counts.gluts += 1;
  }

  // Nationalismus in Förderländern: steigt mit dem Ölhunger der Welt, Verstaatlichung kostet Kapazität.
  const n = wb.nationalism;
  let nationalism = clamp(
    input.nationalism + n.revert * (n.base - input.nationalism) + n.drift * input.demand + n.tension * input.tension + n.noise * sym(2) + (extern.nationalismShift ?? 0),
    0,
    100,
  );
  if (nationalism >= n.nationalizeFrom && u[3] < n.nationalizeChance) {
    capacity *= 1 - n.nationalizeLoss;
    nationalism = n.after;
    news.push('nationalization');
    counts.nationalizations += 1;
  }

  // Preis: aus der Nachfrage dieser Runde, der möglichen Förderung bei normaler Auslastung und dem Lager.
  // Aufstand in Costa Negra oder Embargo aus Qasir (4.4): Ein Teil der Weltförderung fehlt.
  const extra = extern.extraSupply ?? 0;
  const ausland = input.foreign ?? NEUTRAL_FOREIGN;
  const ausfall = foreignOffline({ demand: input.demand, foreign: ausland }, wb);
  const nachfrage = effectiveDemand({ demand, tension: input.tension, crash: input.crash, war: input.war }, wb);
  const trend = trendPrice({ tech, techStart: input.techStart }, wb);
  const price = worldPrice(nachfrage, capacity * (1 - ausfall) * s.utilBase + extra, input.stock, trend, wb);
  const knapp = price / trend;

  // Förderung: bei knappem Öl voll auslasten, bei Überfluss drosseln; was nicht verkauft wird, geht ins Lager.
  const util = clamp(s.utilBase + s.utilSlope * (knapp - 1), s.utilMin, 1);
  const output = Math.max(0, capacity * (1 - ausfall) * util + extra);
  const stock = clamp(input.stock + (output - nachfrage) / nachfrage, 0, s.stockMax);

  // Schleife 2: Kreditklima. Boom macht Banken mutig, über 50 schaukelt Spekulation es auf.
  const c = wb.credit;
  const lev = c.leverage;
  const govCredit = c[input.government];
  const panicIn = input.panic ?? 0;
  const leverageIn = input.leverage ?? lev.base;
  let credit = input.credit;
  if (input.crash > 0 || panicIn > 0) {
    credit += c.revert * (50 - credit) + govCredit;
  } else {
    credit += c.boom * (knapp - 1) + c.speculation * Math.max(0, credit - 50) + c.revert * (50 - credit) + govCredit;
  }
  credit = clamp(credit + c.noise * sym(4) + (extern.creditShift ?? 0), 0, 100);
  let crash = input.crash;
  let panic = panicIn;
  let leverage = leverageIn;
  let gekippt = false;
  if (crash > 0) {
    crash -= 1;
    if (crash === 0) news.push('recovery');
  } else if (panic > 0) {
    panic -= 1;
    if (panic === 0) news.push('recovery');
  } else {
    // Überhitzung: Ab crashFrom kann ein Auslöser das Klima kippen (eine große Pleite, ein Skandal, ein Zinsschritt).
    const chance = credit >= c.crashFrom ? c.crashChance + (c.crashSlope * (credit - c.crashFrom)) / Math.max(1, 100 - c.crashFrom) : 0;
    const sturz = (input.price - price) / input.price >= c.priceTrigger && credit > c.priceTriggerFrom;
    if (u[5] < chance || sturz) {
      gekippt = true;
      if (leverageIn >= lev.crashFrom) {
        // 4.4: Nach einem langen Boom sind alle verschuldet – Banken kündigen Kredite, Kurse stürzen.
        credit *= c.after;
        crash = pickInt(u[6], c.rounds);
        pipeline = pipeline.map((x) => x * c.pipelineCut);
        leverage = leverageIn * lev.crashAfter;
        news.push('crash');
        counts.crashes += 1;
      } else {
        // Ohne große Verschuldung bleibt es eine Bankpanik: Zinssprung, kurze Angst, dann geht es weiter.
        credit *= c.panicAfter;
        panic = pickInt(u[6], c.panicRounds);
        pipeline = pipeline.map((x) => x * c.panicPipelineCut);
        leverage = leverageIn * lev.panicAfter;
        news.push('panic');
        counts.panics = (counts.panics ?? 0) + 1;
      }
    }
  }
  // Verschuldung (4.4): wächst, solange die Banken mutig sind (Klima über 50), baut sich sonst langsam ab.
  if (!gekippt) {
    const aufbau = crash > 0 || panic > 0 ? 0 : (lev.build * Math.max(0, credit - 50)) / 50;
    leverage = clamp(leverage + aufbau - lev.decay * (leverage - lev.base) + (extern.leverageShift ?? 0), 0, 100);
  }

  // Schleife 1 (+ Kredit): Neubohrungen nach Knappheit, verstärkt oder gebremst vom Kreditklima.
  const kredit = 1 + (s.creditInvest * (credit - 50)) / 50;
  // Die Firmen bohren für das erwartete Wachstum der Nachfrage mit (steadyInvest), sonst liefe das Angebot immer hinterher.
  const wachstum = demand / input.demand - 1;
  const anteil = clamp(steadyInvest(wachstum, wb) + s.investSlope * (knapp - 1), 0, s.investMax);
  pipeline.push(capacity * anteil * Math.max(0, kredit) * (crash > 0 ? c.investCut : panic > 0 ? c.panicInvestCut : 1));

  // Stimmung: teures Öl, Arbeitslosigkeit im Crash und Krieg drücken, Wohlstand hebt.
  const m = wb.mood;
  const ziel = 50 - m.price * (knapp - 1) - (crash > 0 ? m.crash : panic > 0 ? m.panic : 0) - (input.war > 0 ? m.war : 0) + (m.boom * (credit - 50)) / 50 + (extern.moodShift ?? 0);
  // Taten (moodKick, 4.2) stoßen die Stimmung sofort an; danach zieht das Ziel sie langsam zurück.
  const mood = clamp(input.mood + m.speed * (ziel - input.mood) + m.noise * sym(7) + (extern.moodKick ?? 0), 0, 100);

  // Politik: Unzufriedene wählen Volksbund, Zufriedene die Handelspartei, billiges Öl treibt kleine Förderer zur Provinzliga.
  const pol = wb.politics;
  const gap = (mood - 50) / 50;
  const billig = Math.max(0, 1 - knapp);
  const roh: Record<Party, number> = {
    handel: input.parties.handel + pol.drift * gap - (pol.drift * billig) / 2 + pol.noise * sym(8) + pol.revert * (1 / 3 - input.parties.handel),
    volksbund: input.parties.volksbund - pol.drift * gap - (pol.drift * billig) / 2 + pol.noise * sym(9) + pol.revert * (1 / 3 - input.parties.volksbund),
    provinz: input.parties.provinz + pol.drift * billig + pol.noise * sym(10) + pol.revert * (1 / 3 - input.parties.provinz),
  };
  roh[input.government] -= pol.fatigue;
  for (const p of PARTIES) roh[p] += extern.partyShift?.[p] ?? 0;
  const parties = normalizeParties(roh, pol.minShare);
  let government = input.government;
  let electionIn = input.electionIn - 1;
  let lastElection = input.lastElection ?? null;
  if (electionIn <= 0) {
    // Wahltag (4.2): Die Stimmen sind die Parteianteile dieser Runde – Stimmung, Ölpreis und Jacobs Handeln stecken darin.
    const sieger = leadingParty(parties);
    if (sieger !== government) counts.changes += 1;
    news.push(sieger !== government ? 'election' : 'reelection');
    lastElection = { round: input.round + 1, shares: parties, winner: sieger, previous: government };
    government = sieger;
    electionIn = pol.electionEvery;
    counts.elections += 1;
  }

  // Schleife 3: Außenspannung. Knappheit und Aufrüstung heizen, Diplomatie kühlt.
  const t = wb.tension;
  let tension = clamp(
    input.tension +
      t.revert * (t.base - input.tension) +
      t.scarcity * Math.max(0, knapp - t.scarcityFrom) +
      t.arms * Math.max(0, input.tension - t.armsFrom) +
      t.nationalism * Math.max(0, nationalism - t.nationalismFrom) +
      t.noise * sym(11) +
      (extern.tensionShift ?? 0),
    0,
    100,
  );
  let war = input.war;
  if (war > 0) {
    war -= 1;
    tension = Math.max(tension, t.warFrom);
    if (war === 0) {
      tension = t.afterWar;
      news.push('peace');
    }
  } else if (tension >= t.warFrom) {
    const chance = t.warChance + (t.warSlope * (tension - t.warFrom)) / Math.max(1, 100 - t.warFrom);
    if (u[12] < chance) {
      war = pickInt(u[13], t.warRounds);
      news.push('war');
      counts.wars += 1;
    }
  }

  // Ausland (4.4): Costa Negra wird unruhig bei billigem Öl, Nationalismus und Einmischung der Großmächte;
  // Qasir wird verstimmt, wenn die Mächte um sein Öl werben, im Krieg und bei Nationalismus.
  const cn = wb.foreign.costaNegra;
  const q = wb.foreign.qasir;
  let costaNegra = clamp(
    ausland.costaNegra +
      cn.revert * (cn.base - ausland.costaNegra) +
      cn.poverty * Math.max(0, cn.povertyFrom - knapp) +
      cn.nationalism * Math.max(0, nationalism - cn.nationalismFrom) +
      cn.meddling * Math.max(0, tension - cn.meddlingFrom) +
      cn.noise * sym(14),
    0,
    100,
  );
  let uprising = ausland.uprising;
  if (uprising > 0) {
    uprising -= 1;
    if (uprising === 0) news.push('uprising_end');
  } else if (costaNegra >= cn.uprisingFrom) {
    const chance = cn.uprisingChance + (cn.uprisingSlope * (costaNegra - cn.uprisingFrom)) / Math.max(1, 100 - cn.uprisingFrom);
    if (u[15] < chance) {
      uprising = pickInt(u[16], cn.rounds);
      costaNegra = cn.after;
      news.push('uprising');
      counts.uprisings = (counts.uprisings ?? 0) + 1;
    }
  }
  let qasir = clamp(
    ausland.qasir +
      q.revert * (q.base - ausland.qasir) +
      q.courting * Math.max(0, tension - q.courtingFrom) +
      (war > 0 ? q.war : 0) +
      q.nationalism * Math.max(0, nationalism - q.nationalismFrom) +
      q.noise * sym(17),
    0,
    100,
  );
  let embargo = ausland.embargo;
  if (embargo > 0) {
    embargo -= 1;
    if (embargo === 0) news.push('embargo_end');
  } else if (qasir >= q.embargoFrom) {
    const chance = q.embargoChance + (q.embargoSlope * (qasir - q.embargoFrom)) / Math.max(1, 100 - q.embargoFrom);
    if (u[18] < chance) {
      embargo = pickInt(u[19], q.rounds);
      qasir = q.after;
      news.push('embargo');
      counts.embargoes = (counts.embargoes ?? 0) + 1;
    }
  }

  // Gesetzgebung (4.3): Das Parlament sieht die Welt nach dieser Runde. Kreditkrise = Crash oder Bankpanik (4.4).
  const kreditkrise = crash > 0 || panic > 0;
  const gewaehlt = lastElection && lastElection.round === input.round + 1 ? lastElection.shares : null;
  const lawsNext = advanceLaws(
    gesetze,
    { round: input.round + 1, scarcity: knapp, credit, mood, tension, nationalism, tech, government, war: war > 0, crash: kreditkrise },
    laws,
    wb.laws,
    { crashing: kreditkrise, glut: news.includes('glut'), election: gewaehlt, lobby: extern.lobby ?? [] },
    lawWorldEffects(gesetze, laws).trustShift ?? 0,
  );

  return {
    ...input,
    rng: rng.state,
    round: input.round + 1,
    demand,
    capacity,
    output,
    stock,
    pipeline,
    price,
    credit,
    mood,
    tension,
    tech,
    nationalism,
    parties,
    government,
    electionIn,
    crash,
    panic,
    leverage,
    foreign: { costaNegra, qasir, uprising, embargo },
    war,
    news,
    counts,
    acts: [],
    actsDone: [...taten],
    lastElection,
    laws: lawsNext,
  };
}

/**
 * Mehrere Runden am Stück, etwa für einen Zeitsprung (GDD §2) – ohne Spieler.
 * Dauerhafte Eingriffe (extraSupply, creditShift, moodShift, tensionShift, nationalismShift)
 * wirken jede Runde; einmalige Stöße (moodKick, partyShift) nur in der ersten.
 */
export function skipWorld(world: WorldState, wb: WorldModelBalance, rounds: number, extern: WorldInput = {}, laws: readonly LawDef[] = []): WorldState {
  const { moodKick: _kick, partyShift: _party, lobby: _lobby, ...dauerhaft } = extern;
  let w = world;
  for (let i = 0; i < rounds; i++) w = advanceWorld(w, wb, i === 0 ? extern : dauerhaft, laws);
  return w;
}

// --- Kapitel 1: sanfte Wirkung -----------------------------------------------

/** Faktor auf den Trendpreis am Salt Hill: 1 + Gewicht × (Weltpreis − 1), höchstens ± priceMaxDev. Ohne Weltmodell 1. */
export function worldPriceFactor(world: Pick<WorldState, 'price'> | undefined, wb: WorldModelBalance): number {
  if (!world) return 1;
  const k = wb.chapter1;
  const roh = 1 + k.priceWeight * (world.price - 1);
  return Math.round(clamp(roh, 1 - k.priceMaxDev, 1 + k.priceMaxDev) * 10000) / 10000;
}

/**
 * Zinsaufschlag der Bank (Jahreszins, auch negativ): lockeres Kreditklima macht
 * Geld billiger, enges teurer, im Crash kommt der Zinssprung dazu, in der Bankpanik
 * ein kleinerer (4.4). Überhitzt das Klima, heben die Banken die Zinsen schon vorher
 * (Frühwarnzeichen „steigende Zinsen“, GDD §7.2). Ohne Weltmodell 0.
 */
export function worldRateAdd(world: (Pick<WorldState, 'credit' | 'crash'> & { panic?: number; leverage?: number }) | undefined, wb: WorldModelBalance): number {
  if (!world) return 0;
  const k = wb.chapter1;
  const phase = creditPhase(world, wb);
  const sprung = phase === 'crash' ? k.crashRate : phase === 'panic' ? k.panicRate : phase === 'overheated' ? k.bubbleRate : 0;
  const roh = (-k.rateWeight * (world.credit - 50)) / 50 + sprung;
  // Auf Viertelpunkte gerundet, wie eine Bank ihre Sätze aushängt.
  return Math.round(clamp(roh, -k.rateMaxAdd, k.rateMaxAdd) * 400) / 400;
}

/**
 * Faktor auf den Bankrahmen (4.4): Im Boom und erst recht in der Blase leihen die
 * Banken großzügiger, bei knappem Geld weniger, in Panik und Crash kürzen sie die
 * Rahmen. Ohne Weltmodell 1.
 */
export function worldLimitFactor(world: (Pick<WorldState, 'credit' | 'crash'> & { panic?: number; leverage?: number }) | undefined, wb: WorldModelBalance): number {
  if (!world) return 1;
  return wb.chapter1.limit[creditPhase(world, wb)];
}

/** Salt Hill in Weltnachfrage-Einheiten: Überangebot dort (mehr gefördert als gebraucht) drückt die Welt ein klein wenig. */
export function saltHillInput(saltHillSupply: number, saltHillDemand: number, wb: WorldModelBalance): WorldInput {
  return { extraSupply: (saltHillSupply - saltHillDemand) / wb.chapter1.nationalBarrels };
}

/** Prüft für das Laden, ob ein Weltzustand vollständig ist. */
export function isWorldState(value: unknown): value is WorldState {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  const zahl = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const ZAHLEN = ['rng', 'round', 'demand', 'capacity', 'output', 'stock', 'price', 'credit', 'mood', 'tension', 'tech', 'techStart', 'nationalism', 'electionIn', 'crash', 'panic', 'leverage', 'war'];
  if (!ZAHLEN.every((k) => zahl(w[k]))) return false;
  const f = w.foreign as Record<string, unknown> | undefined;
  if (typeof f !== 'object' || f === null || !['costaNegra', 'qasir', 'uprising', 'embargo'].every((k) => zahl(f[k]))) return false;
  if (!Array.isArray(w.pipeline) || !w.pipeline.every(zahl)) return false;
  if (!Array.isArray(w.news) || !w.news.every((x) => typeof x === 'string')) return false;
  const p = w.parties as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null || !PARTIES.every((k) => zahl(p[k]))) return false;
  if (!PARTIES.includes(w.government as Party)) return false;
  const c = w.counts as Record<string, unknown> | undefined;
  if (typeof c !== 'object' || c === null || !Object.keys(noCounts()).every((k) => zahl(c[k]))) return false;
  const taten = (x: unknown) => Array.isArray(x) && x.every((a) => PUBLIC_ACTS.includes(a as PublicAct));
  if (!taten(w.acts) || !taten(w.actsDone)) return false;
  if (!isLawsState(w.laws)) return false;
  const e = w.lastElection as Record<string, unknown> | null | undefined;
  if (e === null) return true;
  if (typeof e !== 'object' || e === undefined) return false;
  const s = e.shares as Record<string, unknown> | undefined;
  return (
    zahl(e.round) &&
    typeof s === 'object' &&
    s !== null &&
    PARTIES.every((k) => zahl(s[k])) &&
    PARTIES.includes(e.winner as Party) &&
    PARTIES.includes(e.previous as Party)
  );
}

/** Ersatzwerte (4.2) für Weltzustände aus Format 14: noch kein öffentliches Handeln, keine Wahl gemerkt. */
export function withPoliticsDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const w = value as Record<string, unknown>;
  return { ...w, acts: w.acts ?? [], actsDone: w.actsDone ?? [], lastElection: w.lastElection === undefined ? null : w.lastElection };
}

/**
 * Ersatzwert (4.3) für Weltzustände aus Format 14/15: noch kein Gesetz, nichts im
 * Parlament, Sitze = heutige Parteianteile, Trust-Anteil in der Mitte, Zufall aus dem Seed.
 */
export function withLawDefaults(value: unknown, seed: string): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const w = value as Record<string, unknown>;
  if (w.laws !== undefined) return w;
  const p = w.parties as Record<Party, number> | undefined;
  const parties = p && PARTIES.every((k) => typeof p[k] === 'number') ? p : { handel: 1 / 3, volksbund: 1 / 3, provinz: 1 / 3 };
  return { ...w, laws: neutralLaws(seed, parties) };
}

/**
 * Ersatzwerte (4.4) für Weltzustände aus Format 14–16: keine Bankpanik, Verschuldung
 * passend zum gespeicherten Kreditklima (aber nie schon überhitzt, siehe startLeverage),
 * ein ruhiges Ausland, neue Zähler bei 0.
 * Das Laden kennt balance.yaml nicht – darum eine Momentaufnahme der Spielzahlen.
 */
export function withCreditForeignDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const w = value as Record<string, unknown>;
  const credit = typeof w.credit === 'number' ? w.credit : 50;
  const counts = typeof w.counts === 'object' && w.counts !== null ? (w.counts as Record<string, unknown>) : {};
  return {
    ...w,
    panic: w.panic ?? 0,
    leverage: w.leverage ?? startLeverage(credit, NEUTRAL_LEVERAGE),
    foreign: w.foreign ?? { ...NEUTRAL_FOREIGN },
    counts: { ...counts, panics: counts.panics ?? 0, uprisings: counts.uprisings ?? 0, embargoes: counts.embargoes ?? 0 },
  };
}
