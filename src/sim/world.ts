// Weltmodell (4.1, GDD §7.1): neun Weltgrößen, je Runde (Quartal) fortgeschrieben.
// Reine Simulation mit eigenem Zufall (Seed + ":welt"), damit Karte, Ereignisse
// und Rivalen mit und ohne Weltmodell dieselben Würfel ziehen.
//
// Die neun Größen und wo sie hier stehen:
//   Angebot & Lager ........ capacity, output, stock, pipeline
//   Nachfrage .............. demand (Grundnachfrage) → effectiveDemand()
//   Kreditklima ............ credit (0–100, 50 = normal)
//   Öffentliche Stimmung ... mood (0–100)
//   Politische Lage ........ parties, government, electionIn
//   Außenspannung .......... tension (0–100), war
//   Technikstand ........... tech (0–100, logistisch)
//   Nationalismus .......... nationalism (0–100)
//   (Ölpreis als Folge) .... price (Weltpreis-Index, Start 1)
//
// Drei Rückkopplungen:
//   1. Preis → Neubohrungen (verzögert um supply.delay Runden) → Kapazität → Preis.
//      Dämpft sich selbst, aber spät: Zwischendurch laufen Tanks voll oder leer.
//   2. Boom (hoher Preis) → Kreditklima → mehr Neubohrungen und Spekulation →
//      Klima steigt weiter (über 50 schaukelt es sich auf) → Crash.
//   3. Knappheit (hoher Preis) → Außenspannung → Aufrüstung → Nachfrage → Knappheit.
//      Über etwa 60 ist die Aufrüstung stärker als die Diplomatie → Krieg.
//
// „Knappheit“ heißt überall Weltpreis ÷ Trendpreis (knappheit()): Technik macht Öl
// billiger, ohne dass Firmen weniger bohren, Banken vorsichtiger oder Mächte
// ruhiger werden. Nur der Preis selbst (Kapitel 1: worldPriceFactor) sinkt mit dem Trend.
//
// Kapitel 1 spürt die Welt sanft: worldPriceFactor (Trend des Posted Price) und
// worldRateAdd (Zinsen der Bank). Die Zeitung deutet Zustände an (worldHeadline).

import type { Range, WorldModelBalance } from './balance';
import { Rng, seedFromString, type RngState } from './rng';

export const PARTIES = ['handel', 'volksbund', 'provinz'] as const;
/** Handelspartei, Volksbund, Provinzliga (GDD §7.1). */
export type Party = (typeof PARTIES)[number];

/**
 * Öffentliches Handeln (4.2, GDD §7.1/§10): was Jacob (später auch Rivalen) tut und
 * die Zeitung berichtet. Jede Tat verschiebt am Rundenende Stimmung und Parteien
 * (worldModel.acts in balance.yaml). Namen wie in den Ereignissen (public: [field_fire]).
 */
export const PUBLIC_ACTS = [
  'price_war',
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
export type WorldNews = 'crash' | 'recovery' | 'war' | 'peace' | 'election' | 'reelection' | 'glut' | 'nationalization';

/** Chronik: wie oft etwas seit Kampagnenbeginn geschah. */
export interface WorldCounts {
  crashes: number;
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
}

/**
 * Was Spieler und Rivalen in die Welt geben. Alles optional, 0 = keine Wirkung.
 * extraSupply in Einheiten der Weltnachfrage (1 = eine ganze Weltnachfrage).
 */
export interface WorldInput {
  extraSupply?: number;
  creditShift?: number;
  /** Stimmungspunkte, sofort auf die Stimmung (danach kehrt sie mit mood.speed zu ihrem Ziel zurück). */
  moodShift?: number;
  /** Verschiebung der Parteianteile vor dem Normieren (4.2). */
  partyShift?: Partial<Record<Party, number>>;
  tensionShift?: number;
  nationalismShift?: number;
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
  return { crashes: 0, wars: 0, gluts: 0, nationalizations: 0, elections: 0, changes: 0 };
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
  return startState(rng.state, wb, { tech, credit, mood, tension, nationalism, parties, electionIn });
}

/**
 * Gleichgewicht ohne Zufall: Die Kapazität deckt die Nachfrage dieser Runde (mit
 * Aufrüstung) bei normaler Auslastung, das Lager ist normal, und die Pipeline
 * liefert genau das Wachstum der nächsten delay Runden. So bleibt der Preis bei 1,
 * bis Zufall und Rückkopplungen ihn bewegen – Krisen kommen nicht in allen Welten
 * zur selben Zeit.
 */
function startState(rng: RngState, wb: StartBalance, v: StartValues): WorldState {
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
    war: 0,
    news: [],
    counts: noCounts(),
    acts: [],
    actsDone: [],
    lastElection: null,
  };
}

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
  };
  return startState(seedFromString(`${seed}:welt`), snapshot, {
    tech: 8,
    credit: 50,
    mood: 54,
    tension: 19,
    nationalism: 14,
    parties: { handel: 0.38, volksbund: 0.31, provinz: 0.31 },
    electionIn: 16,
  });
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
  return { moodShift: clamp(mood, -a.maxMood, a.maxMood), partyShift };
}

/** Zwei Eingriffe zusammenlegen (Salt Hill und öffentliches Handeln). */
export function mergeInput(a: WorldInput, b: WorldInput): WorldInput {
  const sum = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  const out: WorldInput = {};
  const extraSupply = sum(a.extraSupply, b.extraSupply);
  const creditShift = sum(a.creditShift, b.creditShift);
  const moodShift = sum(a.moodShift, b.moodShift);
  const tensionShift = sum(a.tensionShift, b.tensionShift);
  const nationalismShift = sum(a.nationalismShift, b.nationalismShift);
  if (extraSupply !== undefined) out.extraSupply = extraSupply;
  if (creditShift !== undefined) out.creditShift = creditShift;
  if (moodShift !== undefined) out.moodShift = moodShift;
  if (tensionShift !== undefined) out.tensionShift = tensionShift;
  if (nationalismShift !== undefined) out.nationalismShift = nationalismShift;
  if (a.partyShift || b.partyShift) {
    out.partyShift = Object.fromEntries(PARTIES.map((p) => [p, (a.partyShift?.[p] ?? 0) + (b.partyShift?.[p] ?? 0)])) as Record<Party, number>;
  }
  return out;
}

/**
 * Eine Runde Welt. Jede Runde zieht genau gleich viele Zufallszahlen, damit ein
 * Krieg nicht den Würfel für die nächste Wahl verschiebt.
 */
export function advanceWorld(input: WorldState, wb: WorldModelBalance, externIn: WorldInput = {}): WorldState {
  // Öffentliches Handeln dieser Runde (4.2) wirkt jetzt und steht danach in actsDone.
  const taten = input.acts ?? [];
  const extern = mergeInput(externIn, actsInput(taten, input.government, wb));
  const rng = new Rng(input.rng);
  const u = Array.from({ length: 14 }, () => rng.float());
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
  const extra = extern.extraSupply ?? 0;
  const nachfrage = effectiveDemand({ demand, tension: input.tension, crash: input.crash, war: input.war }, wb);
  const trend = trendPrice({ tech, techStart: input.techStart }, wb);
  const price = worldPrice(nachfrage, capacity * s.utilBase + extra, input.stock, trend, wb);
  const knapp = price / trend;

  // Förderung: bei knappem Öl voll auslasten, bei Überfluss drosseln; was nicht verkauft wird, geht ins Lager.
  const util = clamp(s.utilBase + s.utilSlope * (knapp - 1), s.utilMin, 1);
  const output = Math.max(0, capacity * util + extra);
  const stock = clamp(input.stock + (output - nachfrage) / nachfrage, 0, s.stockMax);

  // Schleife 2: Kreditklima. Boom macht Banken mutig, über 50 schaukelt Spekulation es auf.
  const c = wb.credit;
  const govCredit = c[input.government];
  let credit = input.credit;
  if (input.crash > 0) {
    credit += c.revert * (50 - credit) + govCredit;
  } else {
    credit += c.boom * (knapp - 1) + c.speculation * Math.max(0, credit - 50) + c.revert * (50 - credit) + govCredit;
  }
  credit = clamp(credit + c.noise * sym(4) + (extern.creditShift ?? 0), 0, 100);
  let crash = input.crash;
  if (crash > 0) {
    crash -= 1;
    if (crash === 0) news.push('recovery');
  } else {
    const chance = credit >= c.crashFrom ? c.crashChance + (c.crashSlope * (credit - c.crashFrom)) / Math.max(1, 100 - c.crashFrom) : 0;
    const sturz = (input.price - price) / input.price >= c.priceTrigger && credit > c.priceTriggerFrom;
    if (u[5] < chance || sturz) {
      credit *= c.after;
      crash = pickInt(u[6], c.rounds);
      pipeline = pipeline.map((x) => x * c.pipelineCut);
      news.push('crash');
      counts.crashes += 1;
    }
  }

  // Schleife 1 (+ Kredit): Neubohrungen nach Knappheit, verstärkt oder gebremst vom Kreditklima.
  const kredit = 1 + (s.creditInvest * (credit - 50)) / 50;
  // Die Firmen bohren für das erwartete Wachstum der Nachfrage mit (steadyInvest), sonst liefe das Angebot immer hinterher.
  const wachstum = demand / input.demand - 1;
  const anteil = clamp(steadyInvest(wachstum, wb) + s.investSlope * (knapp - 1), 0, s.investMax);
  pipeline.push(capacity * anteil * Math.max(0, kredit) * (crash > 0 ? c.investCut : 1));

  // Stimmung: teures Öl, Arbeitslosigkeit im Crash und Krieg drücken, Wohlstand hebt.
  const m = wb.mood;
  const ziel = 50 - m.price * (knapp - 1) - (crash > 0 ? m.crash : 0) - (input.war > 0 ? m.war : 0) + (m.boom * (credit - 50)) / 50;
  // Eingriffe (Jacobs Handeln, 4.2) verschieben die Stimmung sofort; danach zieht das Ziel sie langsam zurück.
  const mood = clamp(input.mood + m.speed * (ziel - input.mood) + m.noise * sym(7) + (extern.moodShift ?? 0), 0, 100);

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
    war,
    news,
    counts,
    acts: [],
    actsDone: [...taten],
    lastElection,
  };
}

/** Mehrere Runden am Stück, etwa für einen Zeitsprung (GDD §2) – ohne Spieler. */
export function skipWorld(world: WorldState, wb: WorldModelBalance, rounds: number, extern: WorldInput = {}): WorldState {
  let w = world;
  for (let i = 0; i < rounds; i++) w = advanceWorld(w, wb, extern);
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
 * Geld billiger, enges teurer, im Crash kommt der Zinssprung dazu. Ohne Weltmodell 0.
 */
export function worldRateAdd(world: Pick<WorldState, 'credit' | 'crash'> | undefined, wb: WorldModelBalance): number {
  if (!world) return 0;
  const k = wb.chapter1;
  const roh = (-k.rateWeight * (world.credit - 50)) / 50 + (world.crash > 0 ? k.crashRate : 0);
  // Auf Viertelpunkte gerundet, wie eine Bank ihre Sätze aushängt.
  return Math.round(clamp(roh, -k.rateMaxAdd, k.rateMaxAdd) * 400) / 400;
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
  const ZAHLEN = ['rng', 'round', 'demand', 'capacity', 'output', 'stock', 'price', 'credit', 'mood', 'tension', 'tech', 'techStart', 'nationalism', 'electionIn', 'crash', 'war'];
  if (!ZAHLEN.every((k) => zahl(w[k]))) return false;
  if (!Array.isArray(w.pipeline) || !w.pipeline.every(zahl)) return false;
  if (!Array.isArray(w.news) || !w.news.every((x) => typeof x === 'string')) return false;
  const p = w.parties as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null || !PARTIES.every((k) => zahl(p[k]))) return false;
  if (!PARTIES.includes(w.government as Party)) return false;
  const c = w.counts as Record<string, unknown> | undefined;
  if (typeof c !== 'object' || c === null || !Object.keys(noCounts()).every((k) => zahl(c[k]))) return false;
  const taten = (x: unknown) => Array.isArray(x) && x.every((a) => PUBLIC_ACTS.includes(a as PublicAct));
  if (!taten(w.acts) || !taten(w.actsDone)) return false;
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
