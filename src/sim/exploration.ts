// Erkundung (Termine als Hauptwerkzeug, Etappe 1): Wer wissen will, wo Öl liegt,
// muss hinsehen. Ein Hinweis ist eine Beobachtung auf einer Ranch – eine
// Sickerstelle am Bach, Salzwasser im Brunnen, ein Hügelzug, die Karte eines
// Geologen, ein Bohrbericht. Ob man ihn sieht, hängt am echten Ergebnis der Ranch
// (Öl oder trocken), aber nie sicher: Jede Hinweisart hat eine Chance, gesehen zu
// werden, wenn Öl da ist, und eine, wenn nicht (balance.yaml exploration.clues).
//
// Gerechnet wird als Quote (wie bei einer Wette): Startwert ist das öffentliche
// Wissen über die Zone (zones.prior). Jeder Hinweis multipliziert die Quote mit
// P(gesehen|Öl) ÷ P(gesehen|trocken) bzw. mit dem Gegenstück, wenn er nicht gesehen
// wurde. Hinweise auf Nachbarranches (gemeinsame Grenze, gleiches Gebiet) wirken mit
// Faktor^neighbourPower – Öl sitzt an Salzrücken, die über die Grenzen laufen.
//
// Hinweise sind fest: Derselbe Hinweis auf derselben Ranch ergibt immer dasselbe
// (Zufall aus seed + ':hinweis:' + Ranch + Art). Zweimal hinsehen bringt nichts Neues,
// Neuladen und Würfeln geht nicht, und der Weltzufall (state.rng) bleibt unberührt.
//
// Was der Spieler sieht, ist die Prognose: Bandbreite um die Chance nach allen
// Hinweisen, so breit, wie die Wissensstufe hergibt (0 Gerücht: keine Zahl, 1 beritten,
// 2 kartiert, 3 Bohrbericht). Ein Geologe verzerrt seine Karten (verdeckt), seine
// Trefferbilanz steht in der Akte. Keine Oberfläche hier.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { forecastAround, zoneChance, type Forecast } from './forecast';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { leaseOf, leaseTerms, optionOf, parcelLabel } from './lease';
import type { ClueKind, ClueOdds, GeologistId } from './plansBalance';
import { Rng, seedFromString } from './rng';

export type { ClueKind, GeologistId };

/** Woher ein Hinweis stammt. */
export const CLUE_SOURCES = ['start', 'ritt', 'farmer', 'geologe', 'bericht', 'tagebuch', 'bohrung', 'rute', 'seismik'] as const;
export type ClueSource = (typeof CLUE_SOURCES)[number];

/** Wissensstufe einer Ranch: 0 Gerücht, 1 beritten, 2 kartiert, 3 Bohrbericht oder Seismik (Kapitel 3). */
export type KnowledgeLevel = 0 | 1 | 2 | 3;

export interface Clue {
  kind: ClueKind;
  source: ClueSource;
  round: number;
  /** Was Jacob gesehen (bzw. gehört) hat. */
  seen: boolean;
  /** Kartierung: Genauigkeit und Verzerrung des Geologen, der sie gemacht hat. */
  accuracy?: number;
  bias?: number;
  geologist?: GeologistId;
  /** Gieriger Farmer: so oft erzählt er von Öl, das er nie sah (die Rechnung weiß das). */
  lie?: number;
}

export interface ParcelKnowledge {
  level: KnowledgeLevel;
  clues: Clue[];
  /** Nachlass auf den Pachtbonus nach einem Gespräch mit einem freundlichen Farmer (0–1). */
  leaseDiscount?: number;
}

/** Ein eingestellter Geologe. Genauigkeit sieht man, die Verzerrung nicht. */
export interface HiredGeologist {
  id: GeologistId;
  accuracy: number;
  /** Verdeckt: Verzerrung seiner Karten in Prozentpunkten. */
  bias: number;
  wage: number;
  since: number;
}

export interface ExplorationState {
  geologist?: HiredGeologist;
  /** Trefferbilanz des Geologen: Karten, die sich beim Bohren bestätigt haben bzw. nicht. */
  record: { hits: number; misses: number };
}

export function newExploration(): ExplorationState {
  return { record: { hits: 0, misses: 0 } };
}

const LEER: ParcelKnowledge = { level: 0, clues: [] };

/** Was Jacob über eine Ranch weiß (ohne Eintrag: Stufe 0, keine Hinweise). */
export function knowledgeOf(state: Pick<GameState, 'knowledge'>, parcelId: string): ParcelKnowledge {
  return state.knowledge?.[parcelId] ?? LEER;
}

/** Stufe, die eine Hinweisart mindestens bringt (Wünschelrute: keine). */
function levelOfClue(clue: Clue): KnowledgeLevel {
  if (clue.kind === 'bohrbericht' || clue.kind === 'seismik') return 3;
  if (clue.kind === 'kartierung') return 2;
  if (clue.kind === 'rute') return 0;
  return 1;
}

/** Chancen, einen Hinweis zu sehen (bei Öl / trocken) – mit Genauigkeit und Lügen eingerechnet. */
export function clueOdds(balance: Balance, clue: Pick<Clue, 'kind' | 'accuracy' | 'lie'>): { oil: number; dry: number } {
  const o: ClueOdds = balance.exploration.clues[clue.kind];
  const a = clue.accuracy ?? 0;
  const begrenzt = (x: number) => Math.min(0.99, Math.max(0.01, x));
  let oil = begrenzt(o.oil + (o.oilPerAccuracy ?? 0) * a);
  let dry = begrenzt(o.dry + (o.dryPerAccuracy ?? 0) * a);
  const lie = clue.lie ?? 0;
  if (lie > 0) {
    oil = begrenzt(oil + (1 - oil) * lie);
    dry = begrenzt(dry + (1 - dry) * lie);
  }
  return { oil, dry };
}

/** Faktor auf die Quote: gesehen P(s|Öl)/P(s|trocken), nicht gesehen (1−P(s|Öl))/(1−P(s|trocken)). */
export function clueFactor(balance: Balance, clue: Pick<Clue, 'kind' | 'accuracy' | 'lie' | 'seen'>): number {
  const { oil, dry } = clueOdds(balance, clue);
  return clue.seen ? oil / dry : (1 - oil) / (1 - dry);
}

function parcelOf(state: Pick<GameState, 'parcels'>, parcelId: string): Parcel | undefined {
  return state.parcels.find((p) => p.id === parcelId);
}

/** Nachbarranches im selben Gebiet, ohne den bekannten Fund. */
export function explorableNeighbours(state: Pick<GameState, 'parcels'>, parcel: Parcel): Parcel[] {
  return parcel.neighbors
    .map((id) => parcelOf(state, id))
    .filter((p): p is Parcel => !!p && p.region === parcel.region && !p.discovery);
}

/**
 * Chance nach allen Hinweisen (0–1): Quote der Zone × Faktoren der eigenen Hinweise ×
 * Faktoren der Nachbarhinweise hoch neighbourPower, begrenzt auf qMin–qMax. Kein Zufall.
 */
export function posteriorChance(state: Pick<GameState, 'parcels' | 'knowledge'>, balance: Balance, parcelId: string): number {
  const parcel = parcelOf(state, parcelId);
  if (!parcel) return 0;
  const prior = zoneChance(balance, parcel);
  let logOdds = Math.log(prior / (1 - prior));
  for (const clue of knowledgeOf(state, parcelId).clues) logOdds += Math.log(clueFactor(balance, clue));
  const power = balance.exploration.neighbourPower;
  for (const n of explorableNeighbours(state, parcel)) {
    for (const clue of knowledgeOf(state, n.id).clues) logOdds += power * Math.log(clueFactor(balance, clue));
  }
  // Kein Land ist sicher: nie mehr als die höchste und nie weniger als die kleinste Fundchance einer Ranch.
  const { qMin, qMax } = balance.geology.trends;
  return Math.min(qMax, Math.max(qMin, 1 / (1 + Math.exp(-logOdds))));
}

/** Bandbreite der Prognose in Prozentpunkten je Wissensstufe (kartiert: nach der besten Genauigkeit). */
export function knowledgeWidth(balance: Balance, knowledge: ParcelKnowledge): number {
  const w = balance.exploration.width;
  if (knowledge.level >= 3) return w.report;
  if (knowledge.level === 2) {
    const best = Math.max(0, ...knowledge.clues.filter((c) => c.kind === 'kartierung').map((c) => c.accuracy ?? 0));
    return Math.max(w.report, w.mappedBase - w.mappedPerAccuracy * best);
  }
  return w.rode;
}

/** Fester Zufallswert für eine Ranch und einen Schlüssel – gleiche Eingabe, gleiches Ergebnis. */
function fest(seed: string, key: string): Rng {
  return new Rng(seedFromString(`${seed}:${key}`));
}

/**
 * Prognose aus dem Wissensstand: Mitte = Chance nach allen Hinweisen + Verzerrung
 * des Geologen (nur auf seinen Karten, Stufe 2) + festes Rauschen (± noiseShare · Breite,
 * je Ranch und Stufe aus dem Seed). null unter Stufe 1 – ein Gerücht hat keine Zahl.
 */
export function knowledgeForecast(state: Pick<GameState, 'seed' | 'parcels' | 'knowledge'>, balance: Balance, parcelId: string): Forecast | null {
  const k = knowledgeOf(state, parcelId);
  if (k.level < 1) return null;
  // Startquelle (0.4.20+19): Silas hat das Öl selbst gesehen – die Prognose sagt es offen.
  if (state.parcels.find((p) => p.id === parcelId)?.sure) return { parcelId, low: 100, high: 100, center: 100, sure: true };
  const width = knowledgeWidth(balance, k);
  const karte = k.level === 2 ? k.clues.filter((c) => c.kind === 'kartierung').sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0] : undefined;
  const bias = karte?.bias ?? 0;
  const error = (fest(state.seed, `prognose:${parcelId}:${k.level}`).float() * 2 - 1) * width * balance.exploration.noiseShare;
  return clampToGeology(balance, forecastAround(balance, parcelId, 100 * posteriorChance(state, balance, parcelId) + bias + error, width));
}

/**
 * Das Band bleibt im Rahmen dessen, was die Geologie hergibt (qMin–qMax, 0.4.19+2): Kein Feld hat
 * mehr als qMax Fundchance – „60–100 %“ versprach mehr, als es gibt. Auf das Raster gerundet.
 */
function clampToGeology(balance: Balance, f: Forecast): Forecast {
  const { rounding } = balance.forecast;
  const { qMin, qMax } = balance.geology.trends;
  const unten = Math.floor((qMin * 100) / rounding) * rounding;
  const oben = Math.ceil((qMax * 100) / rounding) * rounding;
  let low = Math.min(Math.max(f.low, unten), oben);
  let high = Math.min(Math.max(f.high, unten), oben);
  if (low >= high) {
    if (high + rounding <= oben) high = low + rounding;
    else low = high - rounding;
  }
  return { ...f, low, high };
}

/**
 * Seismik schärft die Erkundung (Kapitel 3, 4.17): Liegt für eine Ranch ein Bericht des
 * Seismik-Trupps vor und noch kein Bohrbericht, ist sein Band die Prognose – er rechnet
 * schon alles ein, was Jacob vorher wusste (src/sim/seismik.ts). Ein Bohrbericht (gekauft,
 * Tagebuch oder eigene Bohrung) sieht mehr als jede Messung und geht wieder vor.
 */
export function seismikForecast(state: Pick<GameState, 'knowledge' | 'kapitel3'>, parcelId: string): Forecast | null {
  const r = state.kapitel3?.seismik.reports[parcelId];
  if (!r || knowledgeOf(state, parcelId).clues.some((c) => c.kind === 'bohrbericht')) return null;
  return { parcelId, low: r.low, high: r.high, center: (r.low + r.high) / 2 };
}

/**
 * Prognosen neu rechnen: jede Ranch ab Stufe 1 bekommt die Prognose aus ihrem
 * Wissensstand (Nachbarhinweise verschieben sie mit), vermessene Ranches das Band des
 * Seismik-Berichts. Ranches, auf denen Jacob gerade bohrt, behalten ihre Prognose – die
 * gehört dann der Bohrung (tiefer bohren, src/sim/drilling.ts). Unter Stufe 1 gibt es keine.
 */
export function refreshForecasts(state: GameState, balance: Balance): GameState {
  const gebohrt = new Set(state.wells.filter((w) => w.status === 'drilling' || w.status === 'decision' || w.status === 'stuck').map((w) => w.parcelId));
  const forecasts: Record<string, Forecast> = {};
  for (const [id, f] of Object.entries(state.forecasts)) if (gebohrt.has(id)) forecasts[id] = f;
  for (const p of state.parcels) {
    if (p.discovery || gebohrt.has(p.id)) continue;
    const f = seismikForecast(state, p.id) ?? knowledgeForecast(state, balance, p.id);
    if (f) forecasts[p.id] = f;
  }
  return { ...state, forecasts };
}

/** Gleiche Hinweise zählen nur einmal: je Art einer (Kartierung je Geologe). Eigene Bohrung ersetzt Berichte. */
function sameClue(a: Clue, b: Clue): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'kartierung' || a.geologist === b.geologist;
}

/** Hat Jacob diesen Hinweis auf der Ranch schon? */
export function hasClue(state: Pick<GameState, 'knowledge'>, parcelId: string, kind: ClueKind, geologist?: GeologistId): boolean {
  return knowledgeOf(state, parcelId).clues.some((c) => c.kind === kind && (kind !== 'kartierung' || c.geologist === geologist));
}

/**
 * Trägt Hinweise auf einer Ranch ein: Doppeltes zählt nicht, die Stufe steigt
 * (nie fällt sie), danach werden die Prognosen neu gerechnet. Eine eigene Bohrung
 * (source bohrung) ersetzt einen gekauften Bericht – sie ist die Wahrheit.
 */
export function addClues(state: GameState, balance: Balance, parcelId: string, clues: readonly Clue[], extra: Partial<ParcelKnowledge> = {}): GameState {
  return refreshForecasts(addCluesRaw(state, parcelId, clues, extra), balance);
}

function addCluesRaw(state: GameState, parcelId: string, clues: readonly Clue[], extra: Partial<ParcelKnowledge> = {}): GameState {
  const alt = knowledgeOf(state, parcelId);
  let liste = [...alt.clues];
  for (const c of clues) {
    const vorhanden = liste.findIndex((d) => sameClue(c, d));
    if (vorhanden < 0) liste.push(c);
    else if (c.source === 'bohrung' && liste[vorhanden].source !== 'bohrung') liste = liste.map((d, i) => (i === vorhanden ? c : d));
  }
  const level = Math.max(alt.level, ...clues.map(levelOfClue)) as KnowledgeLevel;
  return { ...state, knowledge: { ...state.knowledge, [parcelId]: { ...alt, ...extra, level, clues: liste } } };
}

/** Echtes Ergebnis der Ranch: Öl (klein oder Gusher) oder trocken. */
function hatOel(parcel: Parcel): boolean {
  return parcel.geology !== 'dry';
}

/**
 * Würfelt einen Hinweis – fest aus dem Seed (seed:hinweis:Ranch:Art[:salt]). Gesehen
 * mit P(gesehen|Öl) bzw. P(gesehen|trocken); ein Lügner (lie > 0) erzählt außerdem
 * mit dieser Chance von einem Hinweis, den es nicht gab.
 */
export function rollClue(
  state: Pick<GameState, 'seed' | 'round'>,
  balance: Balance,
  parcel: Parcel,
  kind: ClueKind,
  source: ClueSource,
  opts: { accuracy?: number; bias?: number; geologist?: GeologistId; lie?: number } = {},
): Clue {
  const salt = kind === 'kartierung' ? `:${opts.geologist ?? ''}` : '';
  const rng = fest(state.seed, `hinweis:${parcel.id}:${kind}${salt}`);
  const echt = clueOdds(balance, { kind, accuracy: opts.accuracy });
  const gesehen = rng.float() < (hatOel(parcel) ? echt.oil : echt.dry);
  const gelogen = !gesehen && (opts.lie ?? 0) > 0 && rng.float() < (opts.lie ?? 0);
  const clue: Clue = { kind, source, round: state.round, seen: gesehen || gelogen };
  if (opts.accuracy !== undefined) clue.accuracy = opts.accuracy;
  if (opts.bias !== undefined) clue.bias = opts.bias;
  if (opts.geologist !== undefined) clue.geologist = opts.geologist;
  if ((opts.lie ?? 0) > 0) clue.lie = opts.lie;
  return clue;
}

/** Die drei Beobachtungen eines Ritts übers Land. */
export const RIDE_CLUES: readonly ClueKind[] = ['sickerstelle', 'salzwasser', 'formation'];

/** Ritt-Hinweise für eine Ranch (ohne einzutragen). */
export function rideClues(state: Pick<GameState, 'seed' | 'round'>, balance: Balance, parcel: Parcel, source: ClueSource = 'ritt'): Clue[] {
  return RIDE_CLUES.map((kind) => rollClue(state, balance, parcel, kind, source));
}

/**
 * Die Ranches eines Ritts: das Ziel und bis zu zwei Nachbarn im selben Gebiet –
 * die am wenigsten bekannten zuerst, bei Gleichstand nach Kennung.
 */
export function rideParcels(state: Pick<GameState, 'parcels' | 'knowledge'>, parcelId: string): Parcel[] {
  const ziel = parcelOf(state, parcelId);
  if (!ziel) return [];
  const nachbarn = explorableNeighbours(state, ziel)
    .sort((a, b) => knowledgeOf(state, a.id).level - knowledgeOf(state, b.id).level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 2);
  return [ziel, ...nachbarn];
}

/** Ritt übers Land: Ziel und zwei Nachbarn bekommen Sickerstelle, Salzwasser und Formation (Stufe ≥ 1). */
export function ride(state: GameState, balance: Balance, parcelId: string, source: ClueSource = 'ritt'): GameState {
  let next = state;
  for (const p of rideParcels(state, parcelId)) next = addCluesRaw(next, p.id, rideClues(state, balance, p, source));
  return refreshForecasts(next, balance);
}

/**
 * Wohin reiten? Die freie Ranch, deren Ritt (sie und zwei Nachbarn) die meiste
 * unbekannte, freie und vielversprechende Fläche abdeckt, deren Pachtbonus höchstens
 * budget kostet – nach dem öffentlichen Wissen der Zone, nie nach der Wahrheit.
 * Für Bots und den Einstieg; null, wenn kein Ritt mehr etwas Neues zeigt.
 */
export function suggestRide(state: GameState, balance: Balance, budget: number): string | null {
  const frei = (p: Parcel) => !p.discovery && !leaseOf(state, p.id) && !optionOf(state, p.id);
  let best: { id: string; score: number } | null = null;
  for (const p of state.parcels) {
    if (!frei(p) || !rideNews(state, p.id)) continue;
    const score = rideParcels(state, p.id)
      .filter((q) => knowledgeOf(state, q.id).level === 0 && frei(q) && leaseTerms(state, balance, q.id).bonus <= budget)
      .reduce((sum, q) => sum + zoneChance(balance, q), 0);
    if (score > 0 && (!best || score > best.score || (score === best.score && p.id < best.id))) best = { id: p.id, score };
  }
  return best?.id ?? null;
}

/** Bringt ein Ritt hier noch etwas Neues? */
export function rideNews(state: Pick<GameState, 'parcels' | 'knowledge'>, parcelId: string): boolean {
  return rideParcels(state, parcelId).some((p) => RIDE_CLUES.some((k) => !hasClue(state, p.id, k)));
}

/**
 * Wissen zu Spielbeginn: kein Gratis-Wissen über die ganze Karte. Nur die
 * Startoptionen und die Nachbarn des bekannten Funds sind beritten (Stufe 1) –
 * darüber reden alle in Port Ellis.
 */
export function initialKnowledge(state: GameState, balance: Balance): GameState {
  return refreshForecasts(withStartClues(state, balance, state.options.filter((o) => o.holder === 'jacob').map((o) => o.parcelId)), balance);
}

/**
 * Wissen zu Spielbeginn ohne Prognosen: Ritt-Hinweise (Quelle „start“) auf den übergebenen
 * Ranches und auf den Nachbarn des Salt-Hill-Funds. Kein Zufall – jeder Hinweis kommt fest
 * aus dem Seed, darum lässt sich vorab rechnen, was eine Startoption zeigen wird (0.4.20+1).
 */
export function withStartClues(state: GameState, balance: Balance, parcelIds: Iterable<string>): GameState {
  const ids = new Set<string>(parcelIds);
  for (const fund of state.parcels.filter((p) => p.discovery)) {
    for (const n of explorableNeighbours(state, fund)) ids.add(n.id);
  }
  let next: GameState = { ...state, knowledge: state.knowledge ?? {} };
  for (const p of state.parcels) {
    if (ids.has(p.id)) next = addCluesRaw(next, p.id, rideClues(state, balance, p, 'start'));
  }
  return next;
}

/** Mitte des angezeigten Prognosebands einer Ranch (in %), 0 ohne Prognose. */
export function forecastMid(state: Pick<GameState, 'seed' | 'parcels' | 'knowledge'>, balance: Balance, parcelId: string): number {
  const f = knowledgeForecast(state, balance, parcelId);
  return f ? (f.low + f.high) / 2 : 0;
}

/**
 * Gerede um bekannte Funde (nach einem Zeitsprung, Kapitel 2 und 3): Wo Jacob, sein
 * Verwalter oder Bullard Öl gefunden haben, reden alle über die Nachbarranches – wie zu
 * Spielbeginn in Port Ellis. Unbekannte Nachbarn im selben Gebiet werden beritten (Stufe 1,
 * Quelle „start“). Was Jacob schon wusste, bleibt, wie es ist; neues Land ohne Funde bleibt
 * Gerücht – dort hilft nur hinreiten (oder in Kapitel 3 die Seismik). Kein Zufall.
 */
export function hearsayAroundFinds(state: GameState, balance: Balance): GameState {
  const funde = new Set<string>([...state.wells, ...state.rival.wells].filter((w) => w.status === 'found').map((w) => w.parcelId));
  for (const p of state.parcels) if (p.discovery) funde.add(p.id);
  let next = state;
  for (const id of [...funde].sort()) {
    const fund = parcelOf(state, id);
    if (!fund) continue;
    for (const n of explorableNeighbours(state, fund)) {
      if (knowledgeOf(next, n.id).level > 0) continue;
      next = addCluesRaw(next, n.id, rideClues(state, balance, n, 'start'));
    }
  }
  return next === state ? state : refreshForecasts(next, balance);
}

/**
 * Nach einer eigenen Bohrung weiß Jacob, was da unten ist: Ein Fund oder ein
 * endgültig trockenes Loch wird zum Bohrbericht der Ranch (Stufe 3) und wirkt auf
 * die Nachbarn. War die Ranch von einem Geologen kartiert, zählt das in seine
 * Trefferbilanz (Karte ab 50 % = „hier ist Öl“). Kein Zufall.
 */
export function learnFromWells(state: GameState, balance: Balance): GameState {
  let next = state;
  let { hits, misses } = state.exploration?.record ?? { hits: 0, misses: 0 };
  const geologe = state.exploration?.geologist;
  let neu = false;
  for (const parcel of state.parcels) {
    const auf = state.wells.filter((w) => w.parcelId === parcel.id);
    if (auf.length === 0) continue;
    const fund = auf.some((w) => w.status === 'found');
    const trocken = !fund && auf.every((w) => w.status === 'dry');
    if (!fund && !trocken) continue;
    const k = knowledgeOf(next, parcel.id);
    if (k.clues.some((c) => c.source === 'bohrung')) continue;
    const karte = k.clues.find((c) => c.kind === 'kartierung' && geologe && c.geologist === geologe.id);
    if (karte) {
      // Was die Karte vor der Bohrung sagte: Prognose aus dem Wissensstand, ab 50 % „hier ist Öl“.
      const f = knowledgeForecast(next, balance, parcel.id);
      const sagteOel = f ? (f.low + f.high) / 2 >= 50 : karte.seen;
      if (sagteOel === fund) hits++;
      else misses++;
    }
    next = addCluesRaw(next, parcel.id, [{ kind: 'bohrbericht', source: 'bohrung', round: state.round, seen: fund }]);
    neu = true;
  }
  if (!neu) return state;
  return refreshForecasts({ ...next, exploration: { ...(next.exploration ?? newExploration()), record: { hits, misses } } }, balance);
}

/** Einen Geologen einstellen (ersetzt den bisherigen). Verzerrung fest aus dem Seed, wenn sie zufällig ist. */
export function hireGeologist(state: GameState, balance: Balance, id: GeologistId): GameState {
  const offer = balance.exploration.geologists[id];
  const bias =
    offer.bias !== undefined
      ? offer.bias
      : Math.round((fest(state.seed, `geologe:${id}`).float() * 2 - 1) * (offer.biasMax ?? 0));
  const geologist: HiredGeologist = { id, accuracy: offer.accuracy, bias, wage: offer.wage, since: state.round };
  return { ...state, exploration: { ...(state.exploration ?? newExploration()), geologist, record: { hits: 0, misses: 0 } } };
}

/** Kartierung durch den eingestellten Geologen: Ziel und der am wenigsten bekannte Nachbar (Stufe 2). */
export function mapParcels(state: GameState, balance: Balance, parcelId: string): GameState {
  const g = state.exploration?.geologist;
  const ziel = parcelOf(state, parcelId);
  if (!g || !ziel) return state;
  const weitere = explorableNeighbours(state, ziel)
    .filter((p) => !hasClue(state, p.id, 'kartierung', g.id))
    .sort((a, b) => knowledgeOf(state, a.id).level - knowledgeOf(state, b.id).level || (a.id < b.id ? -1 : 1))
    .slice(0, balance.exploration.mapNeighbours);
  let next = state;
  for (const p of [ziel, ...weitere]) {
    next = addCluesRaw(next, p.id, [rollClue(state, balance, p, 'kartierung', 'geologe', { accuracy: g.accuracy, bias: g.bias, geologist: g.id })]);
  }
  return refreshForecasts(next, balance);
}

/** Lohn des Geologen am Rundenende (vor den Zinsen). Ohne Geologen nichts. */
export function payGeologist(state: GameState): GameState {
  const g = state.exploration?.geologist;
  if (!g || g.wage <= 0) return state;
  return {
    ...state,
    cash: state.cash - g.wage,
    log: [...state.log, `${formatDate(state)}: Lohn für den Geologen: ${g.wage.toLocaleString('de-DE')} $.`],
  };
}

/** Bullards abgeschlossene Bohrungen, die Jacob noch nicht aus einem Bericht kennt – die jüngsten zuerst. */
export function bullardReports(state: GameState): { parcel: Parcel; found: boolean }[] {
  const out: { parcel: Parcel; found: boolean; round: number }[] = [];
  for (const w of state.rival.wells) {
    if (w.status === 'drilling') continue;
    const parcel = parcelOf(state, w.parcelId);
    if (!parcel || knowledgeOf(state, parcel.id).level >= 3 || out.some((o) => o.parcel.id === parcel.id)) continue;
    out.push({ parcel, found: w.status === 'found', round: w.startRound });
  }
  return out.sort((a, b) => b.round - a.round || (a.parcel.id < b.parcel.id ? -1 : 1)).map(({ parcel, found }) => ({ parcel, found }));
}

/** Ein Eintrag der Hinweisliste im Ranch-Fenster. */
export interface ClueView {
  kind: ClueKind;
  source: ClueSource;
  round: number;
  seen: boolean;
  /** Gesehen auf dieser Nachbarranch (sonst auf der Ranch selbst). */
  neighbour?: string;
}

/** Was das Ranch-Fenster über den Wissensstand zeigt. */
export interface KnowledgeView {
  level: KnowledgeLevel;
  /** Prognose (ab Stufe 1), sonst null. */
  forecast: Forecast | null;
  /** Breite der Bandbreite in Prozentpunkten (ab Stufe 1). */
  width: number | null;
  clues: ClueView[];
  /** Nachlass auf den Pachtbonus (freundlicher Farmer), 0 = keiner. */
  leaseDiscount: number;
}

export function knowledgeView(state: GameState, balance: Balance, parcelId: string): KnowledgeView {
  const k = knowledgeOf(state, parcelId);
  const parcel = parcelOf(state, parcelId);
  const eigene: ClueView[] = k.clues.map((c) => ({ kind: c.kind, source: c.source, round: c.round, seen: c.seen }));
  const nachbar: ClueView[] = parcel
    ? explorableNeighbours(state, parcel).flatMap((n) =>
        knowledgeOf(state, n.id)
          .clues.filter((c) => c.kind === 'bohrbericht' && c.seen)
          .map((c) => ({ kind: c.kind, source: c.source, round: c.round, seen: c.seen, neighbour: parcelLabel(n) })),
      )
    : [];
  return {
    level: k.level,
    forecast: k.level >= 1 ? (state.forecasts[parcelId] ?? null) : null,
    width: k.level >= 1 ? knowledgeWidth(balance, k) : null,
    clues: [...eigene, ...nachbar].sort((a, b) => a.round - b.round),
    leaseDiscount: k.leaseDiscount ?? 0,
  };
}
