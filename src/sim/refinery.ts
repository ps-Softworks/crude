// Raffinerie und Produktmix (4.6, GDD §6) – ab Kapitel 2.
//
//   Leistung = Kapazität × Technikstufe × Produktmix
//
// Jacob baut eine Destillationsanlage (Technikstufe I) und baut sie in Stufen aus.
// Sie steht am Bahnhof (am Ende der kleinen Pipeline). Am Rundenende geht Rohöl,
// das noch im Tank steht, bis zur eingestellten Menge in die Raffinerie – über
// dieselben Transportwege wie beim Verkauf, mit deren freier Kapazität und Tarif.
// Was Jacob in der Runde verkauft hat, ist schon weg. Das ist die Abwägung:
// Rohöl verkaufen (Posted Price minus Fracht) oder raffinieren (Produktpreise
// minus Betriebskosten und Fracht). Aus dem Rohöl werden Kerosin, Schmieröl,
// Heizöl und – als Nebenprodukt, ca. 20 % – Benzin. Den Mix stellt Jacob
// innerhalb der Grenzen der Technikstufe ein. Der Großhandel nimmt alles ab,
// aber jedes Produkt hat eine eigene Nachfragekurve: Wer mehr anbietet, als
// gebraucht wird, drückt den eigenen Preis. Die Nachfrage verschiebt sich mit
// der Welt (Jahr, Technikstand, Außenspannung, Krieg).
//
// Reine Logik, deterministisch: Zufall (Brand) nur über den eigenen Rng der
// Raffinerie (Seed + ":raffinerie"), damit die übrige Welt dieselben Würfel zieht.
// In Kapitel 1 ist state.refinery undefined – dann tut hier nichts etwas.

import type { Balance, TransportMode } from './balance';
import { dateOf, formatDate } from './calendar';
import type { GameState } from './game';
import { Rng, seedFromString, type RngState } from './rng';
import { PRODUCTS, type MixBound, type Product, type ProductMix, type RefineryTech } from './refineryBalance';
import { capacityLeft, modeCapacity, modeUnavailable, netPrice, tariff } from './transport';
import { effectiveDemand } from './world';
import { timedEffect } from './events';

export { PRODUCTS, type Product, type ProductMix } from './refineryBalance';

// --- Zustand -------------------------------------------------------------------

/** Ergebnis einer Raffinerie-Runde (für Kassenbuch, Abwägung und Oberfläche). */
export interface RefineryRun {
  round: number;
  /** Verarbeitete Barrel Rohöl. */
  crude: number;
  /** Erzeugte Barrel je Produkt. */
  output: Record<Product, number>;
  /** Erzielter Preis in $ je Barrel. */
  prices: Record<Product, number>;
  revenue: number;
  /** Betriebskosten (mit Zuschlag für saures Öl). */
  operating: number;
  /** Fracht vom Tank zur Raffinerie über die Transportwege. */
  feed: number;
  /** Förderzins für das raffinierte Öl der Landbesitzer (zum Posted Price). */
  royalty: number;
  /** Fixkosten der fertigen Ausbaustufen. */
  upkeep: number;
  /** Was in der Kasse landet (kann negativ sein). */
  net: number;
}

export interface RefineryState {
  rng: RngState;
  /** Fertige Ausbaustufen; 0 = keine Raffinerie. */
  level: number;
  /** Laufende Baustelle: erste Anlage oder Ausbau. */
  project: 'build' | 'expand' | null;
  /** Runden, bis die Baustelle fertig ist. */
  projectLeft: number;
  /** Technikstufe (1 = Destillation). */
  tech: number;
  /** Eingestellter Produktmix (immer innerhalb der Grenzen der Technikstufe). */
  mix: ProductMix;
  /** Anteil der Kapazität, den Jacob je Runde aus dem Tank raffinieren will (0–1). */
  intake: number;
  /** Runden, die die Anlage nach einem Brand noch stillsteht. */
  repairLeft: number;
  /** Ergebnis der letzten Runde, in der die Raffinerie lief oder kostete. */
  last: RefineryRun | null;
  /** Brände seit dem Bau. */
  fires: number;
}

export type RefineryResult = { ok: true; state: GameState } | { ok: false; reason: string };

export type RefineryStatus = 'locked' | 'none' | 'building' | 'running' | 'expanding' | 'damaged';

// --- Schnittstelle zur Welt (4.1) ---------------------------------------------

/**
 * Was die Raffinerie vom Weltmodell (state.worldModel, src/sim/world.ts) braucht.
 * Fehlt das Weltmodell, gelten die Werte der Bezugswelt aus
 * balance.refinery.worldDefaults (typische Welt zu Beginn von Kapitel 2).
 */
export interface RefineryWorld {
  /** Jahr der Föderation. */
  year: number;
  /** Technikstand 0–100 (Skala wie worldModel.tech: Start 6–10, logistisch bis ~100). */
  tech: number;
  /** Außenspannung 0–100. */
  tension: number;
  /** Krieg in Übersee. */
  war: boolean;
  /** Ölnachfrage der Welt als Index (Skala wie worldModel: Start 1, wächst bis zur Sättigung). */
  demand: number;
}

function zahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * 4.1 Andockpunkt: liest die Weltgrößen aus state.worldModel (Block A). Die
 * Nachfrage ist effectiveDemand() – Grundnachfrage samt Aufrüstung, Crash und
 * Krieg; sie trägt das allgemeine Wachstum der Ölnachfrage. Ohne Weltmodell
 * (oder bei kaputten Feldern, je Feld) gelten die Werte der Bezugswelt.
 */
export function refineryWorld(state: Pick<GameState, 'round' | 'startYear'> & { worldModel?: unknown }, balance: Balance): RefineryWorld {
  const d = balance.refinery.worldDefaults;
  const w = state.worldModel;
  const o = w && typeof w === 'object' ? (w as Record<string, unknown>) : {};
  const war = typeof o.war === 'boolean' ? o.war : zahl(o.war) ? o.war > 0 : false;
  let demand = d.demand;
  if (zahl(o.demand) && o.demand > 0) {
    const tension = zahl(o.tension) ? o.tension : 0;
    const crash = zahl(o.crash) ? o.crash : 0;
    demand = effectiveDemand({ demand: o.demand, tension, crash, war: war ? 1 : 0 }, balance.worldModel);
  }
  return {
    year: dateOf(state).year,
    tech: zahl(o.tech) ? o.tech : d.tech,
    tension: zahl(o.tension) ? o.tension : d.tension,
    war,
    demand,
  };
}

/**
 * Anteil sauren Rohöls im Tank (GDD §5/§6). Die Geologie kennt noch keine
 * Ölqualität – bis dahin 0. Andockpunkt für eine spätere Qualität der Felder.
 */
export function crudeSourShare(_state: GameState): number {
  return 0;
}

// --- Hilfen -------------------------------------------------------------------

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function dollars(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

function logged(state: GameState, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Die Technikstufe mit Grenzen und Verlust (unbekannte Stufen: die höchste bekannte). */
export function refineryTech(balance: Balance, stage: number): RefineryTech {
  const techs = balance.refinery.techs;
  return techs[clamp(Math.round(stage), 1, techs.length) - 1];
}

/**
 * Bringt einen Wunsch-Mix in die Grenzen der Technikstufe: Jeder Anteil wird um
 * denselben Betrag verschoben und auf min..max begrenzt, bis die Summe 1 ist.
 * So bleibt das Verhältnis der Wünsche so gut wie möglich erhalten, und ein
 * gültiger Mix kommt unverändert zurück. Fehlende Werte zählen als 0.
 */
export function normalizeMix(wish: Partial<ProductMix>, bounds: Record<Product, MixBound>): ProductMix {
  const w = PRODUCTS.map((p) => (zahl(wish[p]) ? Math.max(0, wish[p] as number) : 0));
  const summe = (t: number) => PRODUCTS.reduce((s, p, i) => s + clamp(w[i] + t, bounds[p].min, bounds[p].max), 0);
  let lo = -2;
  let hi = 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (summe(mid) < 1) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const roh = PRODUCTS.map((p, i) => clamp(w[i] + t, bounds[p].min, bounds[p].max));
  // Auf 0,1 % runden; den Rundungsrest bekommt das Produkt mit dem meisten Spielraum.
  const gerundet = roh.map((v) => Math.round(v * 1000) / 1000);
  const rest = Math.round((1 - gerundet.reduce((s, v) => s + v, 0)) * 1000) / 1000;
  if (rest !== 0) {
    const i = PRODUCTS.map((_, k) => k).reduce((best, k) => {
      const raum = (j: number) => (rest > 0 ? bounds[PRODUCTS[j]].max - gerundet[j] : gerundet[j] - bounds[PRODUCTS[j]].min);
      return raum(k) > raum(best) ? k : best;
    }, 0);
    gerundet[i] = Math.round((gerundet[i] + rest) * 1000) / 1000;
  }
  const out = {} as ProductMix;
  PRODUCTS.forEach((p, i) => (out[p] = gerundet[i]));
  return out;
}

/**
 * Ein Regler wird bewegt: `product` bekommt `value` (so weit es die Grenzen
 * zulassen), die übrigen Produkte teilen sich den Rest – ebenfalls um denselben
 * Betrag verschoben und begrenzt. Ergebnis ist immer ein gültiger Mix.
 */
export function adjustMix(mix: ProductMix, product: Product, value: number, bounds: Record<Product, MixBound>): ProductMix {
  const andere = PRODUCTS.filter((p) => p !== product);
  const minRest = andere.reduce((s, p) => s + bounds[p].min, 0);
  const maxRest = andere.reduce((s, p) => s + bounds[p].max, 0);
  const lo = Math.max(bounds[product].min, 1 - maxRest);
  const hi = Math.min(bounds[product].max, 1 - minRest);
  const x = clamp(zahl(value) ? value : mix[product], lo, hi);
  const rest = 1 - x;
  const summe = (t: number) => andere.reduce((s, p) => s + clamp(mix[p] + t, bounds[p].min, bounds[p].max), 0);
  let a = -2;
  let b = 2;
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2;
    if (summe(mid) < rest) a = mid;
    else b = mid;
  }
  const t = (a + b) / 2;
  const wunsch = { ...mix, [product]: x } as ProductMix;
  for (const p of andere) wunsch[p] = clamp(mix[p] + t, bounds[p].min, bounds[p].max);
  return normalizeMix(wunsch, bounds);
}

// --- Freischalten, Bauen, Einstellen -----------------------------------------

/** Ist die Raffinerie in diesem Kapitel freigeschaltet? (GDD §13: ab Kapitel 2.) */
export function refineryUnlockedFor(chapter: number, balance: Balance): boolean {
  return chapter >= balance.refinery.unlockChapter;
}

/** Leerer Raffinerie-Zustand: freigeschaltet, aber noch nichts gebaut. */
export function newRefinery(seed: string, balance: Balance): RefineryState {
  return {
    rng: seedFromString(`${seed}:raffinerie`),
    level: 0,
    project: null,
    projectLeft: 0,
    tech: 1,
    mix: normalizeMix(balance.refinery.startMix, refineryTech(balance, 1).mix),
    intake: 1,
    repairLeft: 0,
    last: null,
    fires: 0,
  };
}

/**
 * 4.5 Andockpunkt: Beim Start eines Kapitels ab unlockChapter aufrufen (oder im
 * Debug-Menü). Schon freigeschaltet: unverändert. Zieht keinen Weltzufall.
 */
export function unlockRefinery(state: GameState, balance: Balance): GameState {
  if (state.refinery) return state;
  return { ...state, refinery: newRefinery(state.seed, balance) };
}

/** Wo die Raffinerie steht – für Oberfläche und Kapitelprüfung. */
export function refineryStatus(state: Pick<GameState, 'refinery'>): RefineryStatus {
  const r = state.refinery;
  if (!r) return 'locked';
  if (r.level === 0) return r.project === 'build' ? 'building' : 'none';
  if (r.repairLeft > 0) return 'damaged';
  return r.project === 'expand' ? 'expanding' : 'running';
}

/** Kapitelprüfung Kapitel 2 (GDD §13): Hat Jacob eine eigene, fertige Raffinerie? */
export function ownsRefinery(state: Pick<GameState, 'refinery'>): boolean {
  return (state.refinery?.level ?? 0) >= 1;
}

/** Kapazität in bbl Rohöl je Runde; 0, solange gebaut oder repariert wird. */
export function refineryCapacity(state: Pick<GameState, 'refinery'> & Partial<Pick<GameState, 'round' | 'events'>>, balance: Balance): number {
  const r = state.refinery;
  if (!r || r.repairLeft > 0) return 0;
  // 4.12: befristete Systemwirkung refineryOutput (Kessel undicht, neue Brenner …).
  const faktor = state.round !== undefined && state.events ? Math.max(0, 1 + timedEffect({ round: state.round, events: state.events }, 'refineryOutput')) : 1;
  return Math.round(r.level * balance.refinery.unitCapacity * faktor);
}

function sperre(state: GameState): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (!state.refinery) return 'Eine eigene Raffinerie gibt es erst ab Kapitel 2.';
  return null;
}

/** Erste Anlage bauen (Technikstufe I, Destillation). */
export function buildRefinery(state: GameState, balance: Balance): RefineryResult {
  const nein = sperre(state);
  if (nein) return { ok: false, reason: nein };
  const r = state.refinery!;
  const b = balance.refinery;
  if (r.level > 0 || r.project) return { ok: false, reason: 'Die Raffinerie steht schon oder ist im Bau.' };
  if (b.buildCost > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(b.buildCost)} $ nötig).` };
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - b.buildCost),
      refinery: { ...r, project: 'build', projectLeft: b.buildRounds },
      log: logged(state, `Der Bau der Raffinerie beginnt (${dollars(b.buildCost)} $, ${b.buildRounds} Runden).`),
    },
  };
}

/** Eine weitere Ausbaustufe; die alte Anlage läuft währenddessen weiter. */
export function expandRefinery(state: GameState, balance: Balance): RefineryResult {
  const nein = sperre(state);
  if (nein) return { ok: false, reason: nein };
  const r = state.refinery!;
  const b = balance.refinery;
  if (r.level === 0) return { ok: false, reason: 'Erst muss die Raffinerie stehen.' };
  if (r.project) return { ok: false, reason: 'Es wird schon ausgebaut.' };
  if (r.level >= b.maxLevel) return { ok: false, reason: 'Größer geht es nicht.' };
  if (b.expandCost > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(b.expandCost)} $ nötig).` };
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash - b.expandCost),
      refinery: { ...r, project: 'expand', projectLeft: b.expandRounds },
      log: logged(state, `Die Raffinerie wird ausgebaut (${dollars(b.expandCost)} $, ${b.expandRounds} Runden).`),
    },
  };
}

/** Produktmix einstellen; der Wunsch wird in die Grenzen der Technikstufe gebracht. */
export function setRefineryMix(state: GameState, balance: Balance, wish: Partial<ProductMix>): RefineryResult {
  const nein = sperre(state);
  if (nein) return { ok: false, reason: nein };
  const r = state.refinery!;
  return { ok: true, state: { ...state, refinery: { ...r, mix: normalizeMix(wish, refineryTech(balance, r.tech).mix) } } };
}

/** Wie viel der Kapazität je Runde aus dem Tank in die Raffinerie geht (0–1, auf 5 % gerundet). */
export function setRefineryIntake(state: GameState, intake: number): RefineryResult {
  const nein = sperre(state);
  if (nein) return { ok: false, reason: nein };
  if (!zahl(intake)) return { ok: false, reason: 'Ungültige Menge.' };
  const r = state.refinery!;
  return { ok: true, state: { ...state, refinery: { ...r, intake: Math.round(clamp(intake, 0, 1) * 20) / 20 } } };
}

// --- Preise und Absatz ----------------------------------------------------------

/**
 * Nachfrage-Faktor eines Produkts aus der Welt (1 = im Bezugsjahr in der
 * Bezugswelt). Das allgemeine Wachstum kommt allein über den Nachfrage-Index
 * der Welt (hoch trend.demand); perYear verschiebt nur den Anteil des Produkts
 * an dieser Ölnachfrage (Kerosin verliert, Benzin gewinnt), damit das Wachstum
 * nicht doppelt zählt. Dazu Technikstand, Außenspannung und Krieg gegenüber
 * der Bezugswelt.
 */
export function demandFactor(product: Product, world: RefineryWorld, balance: Balance): number {
  const t = balance.refinery.products[product].trend;
  const d = balance.refinery.worldDefaults;
  const linear =
    1 +
    t.perYear * (world.year - t.refYear) +
    (t.tech * (world.tech - d.tech)) / 50 +
    (t.tension * (world.tension - d.tension)) / 100 +
    (world.war ? t.war : 0);
  return Math.max(t.min, linear) * (world.demand / d.demand) ** t.demand;
}

/** Was der Großhandel in dieser Lage zum Grundpreis abnimmt (bbl je Runde). */
export function productDemand(product: Product, world: RefineryWorld, balance: Balance): number {
  return Math.round(balance.refinery.products[product].demand * demandFactor(product, world, balance));
}

/**
 * Preis in $ je Barrel, wenn Jacob `sold` Barrel anbietet. Ein Teil des Preises
 * folgt dem Rohölpreis (crudeLink), der Rest ist fest. Mehr Angebot als
 * Nachfrage drückt den Preis (Elastizität), weniger hebt ihn – begrenzt auf
 * floor..ceiling des Grundpreises.
 */
export function productPrice(product: Product, sold: number, postedPrice: number, world: RefineryWorld, balance: Balance): number {
  const p = balance.refinery.products[product];
  const bindung = 1 - p.crudeLink + (p.crudeLink * postedPrice) / balance.refinery.crudeRef;
  const knapp = (productDemand(product, world, balance) / Math.max(sold, 1)) ** p.elasticity;
  return cents(p.basePrice * bindung * clamp(knapp, p.floor, p.ceiling));
}

// --- Zufuhr über die Transportwege (GDD §6: Felder → Raffinerie) ----------------

/** Die Wege aus Kapitel 1, in dieser Reihenfolge bei gleichem Tarif. */
const FEED_MODES: readonly TransportMode[] = ['pipeline', 'teams', 'rail', 'wagon'];

/** Wie das Rohöl einer Runde zur Raffinerie kommt. */
export interface RefineryFeed {
  /** Barrel je Weg. */
  byMode: Record<TransportMode, number>;
  /** Barrel insgesamt (≤ gewünschte Menge, begrenzt durch die freie Kapazität der Wege). */
  barrels: number;
  /** Fracht in $ (Tarife wie beim Verkauf, mit Bahntarif, Mengenrabatt und Thornes Exklusivstrafe). */
  cost: number;
}

// 4.7 Andockpunkt: Fernleitungen geben den Wegen Kapazität dazu (transport.modeCapacity) – auch für die Zufuhr.
type FeedLage = Pick<GameState, 'round' | 'logistics' | 'shipped' | 'railTariff' | 'postedPrice'> & Partial<Pick<GameState, 'events' | 'bigPipelines'>>;

/** Die Wege, die diese Runde noch Rohöl zur Raffinerie bringen können, billigster zuerst. */
function feedModes(state: FeedLage, balance: Balance): TransportMode[] {
  return FEED_MODES.filter((m) => !modeUnavailable(state, m) && capacityLeft(state, balance, m) > 0)
    .map((m, i) => ({ m, i, t: tariff(state, balance, m) }))
    .sort((x, y) => x.t - y.t || x.i - y.i)
    .map((x) => x.m);
}

/**
 * Die Raffinerie steht am Bahnhof, am Ende der kleinen Pipeline – dort, wo sonst
 * Crane das Rohöl abnimmt. Das Öl vom Feld muss also über dieselben Wege wie
 * beim Verkauf: Es teilt sich die Kapazität dieser Runde mit den Verkäufen und
 * zahlt denselben Tarif (billigster freier Weg zuerst). Gesperrte Wege
 * (Pipeline nach Sabotage, stillstehende Fuhrwerke) fallen weg.
 */
export function planFeed(state: FeedLage, balance: Balance, wanted: number): RefineryFeed {
  const byMode: Record<TransportMode, number> = { wagon: 0, rail: 0, teams: 0, pipeline: 0 };
  let rest = Math.max(0, Math.floor(wanted));
  let cost = 0;
  for (const m of feedModes(state, balance)) {
    if (rest <= 0) break;
    const n = Math.min(rest, capacityLeft(state, balance, m));
    byMode[m] = n;
    cost += n * tariff(state, balance, m);
    rest -= n;
  }
  const barrels = FEED_MODES.reduce((s, m) => s + byMode[m], 0);
  return { byMode, barrels, cost: cents(cost) };
}

/** Wie viele Barrel die Wege diese Runde noch zur Raffinerie bringen können. */
export function feedCapacity(state: FeedLage, balance: Balance): number {
  return feedModes(state, balance).reduce((s, m) => s + capacityLeft(state, balance, m), 0);
}

/**
 * Fracht für `crude` Barrel zur Raffinerie. Passt die Menge nicht mehr auf die
 * Wege (nur in Vorschauen, etwa bei leerem Tank), zählt der Rest zum teuersten
 * Tarif der Wege – dann ist die Vorschau eher vorsichtig.
 */
function feedCost(state: FeedLage, balance: Balance, crude: number): number {
  const feed = planFeed(state, balance, crude);
  const rest = Math.max(0, Math.floor(crude) - feed.barrels);
  if (rest === 0) return feed.cost;
  const tarife = FEED_MODES.filter((m) => !modeUnavailable(state, m) && modeCapacity(state, balance, m) > 0).map((m) => tariff(state, balance, m));
  return cents(feed.cost + rest * (tarife.length > 0 ? Math.max(...tarife) : tariff(state, balance, 'wagon')));
}

/** Barrel Rohöl, die am Ende dieser Runde in die Raffinerie gehen würden: Einstellung, Tank und freie Wege. */
export function plannedCrude(state: Pick<GameState, 'refinery' | 'oilStock'> & FeedLage, balance: Balance): number {
  const r = state.refinery;
  if (!r) return 0;
  const wunsch = Math.min(Math.floor(r.intake * refineryCapacity(state, balance) + 1e-9), Math.floor(state.oilStock + 1e-9));
  return Math.max(0, Math.min(wunsch, feedCapacity(state, balance)));
}

/** Begrenzen die Wege die Zufuhr? (Mehr eingestellt und im Tank, als die Wege noch schaffen.) */
export function feedLimited(state: Pick<GameState, 'refinery' | 'oilStock'> & FeedLage, balance: Balance): boolean {
  const r = state.refinery;
  if (!r) return false;
  const wunsch = Math.min(Math.floor(r.intake * refineryCapacity(state, balance) + 1e-9), Math.floor(state.oilStock + 1e-9));
  return wunsch > feedCapacity(state, balance);
}

/**
 * Rechnet eine Raffinerie-Runde mit `crude` Barrel durch, ohne etwas zu ändern.
 * Fixkosten (upkeep) zählen mit, sobald eine Stufe fertig ist.
 */
export function planRun(
  state: GameState,
  balance: Balance,
  crude: number,
  opts: { world?: RefineryWorld; sourShare?: number } = {},
): RefineryRun {
  const r = state.refinery;
  const b = balance.refinery;
  const world = opts.world ?? refineryWorld(state, balance);
  const sour = clamp(opts.sourShare ?? crudeSourShare(state), 0, 1);
  const tech = refineryTech(balance, r?.tech ?? 1);
  const mix = r?.mix ?? normalizeMix(b.startMix, tech.mix);
  const menge = Math.max(0, Math.floor(crude));
  const ausbeute = menge * Math.max(0, 1 - tech.loss - sour * b.sour.yieldLoss);
  const output = {} as Record<Product, number>;
  const prices = {} as Record<Product, number>;
  let revenue = 0;
  for (const p of PRODUCTS) {
    // 4.12: befristete Systemwirkungen productYield/productPrice (Anteil je Produkt).
    output[p] = Math.round(ausbeute * mix[p] * Math.max(0, 1 + timedEffect(state, `productYield:${p}`)));
    prices[p] = cents(productPrice(p, output[p], state.postedPrice, world, balance) * Math.max(0, 1 + timedEffect(state, `productPrice:${p}`)));
    revenue += output[p] * prices[p];
  }
  const royaltyBarrels = state.oilStock > 0 ? (menge * state.royaltyOil) / state.oilStock : 0;
  const run = {
    round: state.round,
    crude: menge,
    output,
    prices,
    revenue: cents(revenue),
    operating: cents(menge * (b.operatingCost + sour * b.sour.costAdd)),
    feed: feedCost(state, balance, menge),
    royalty: cents(royaltyBarrels * state.postedPrice),
    upkeep: cents((r?.level ?? 0) * b.upkeepPerLevel),
    net: 0,
  };
  run.net = cents(run.revenue - run.operating - run.feed - run.royalty - run.upkeep);
  return run;
}

/** Die Abwägung je Barrel Rohöl: verkaufen oder raffinieren. */
export interface CrudeVsRefined {
  /** Bester Erlös je Barrel beim Verkauf an den Trust nach Fracht (ohne Förderzins). */
  crudeNet: number;
  /** Über welchen Weg (null: kein Weg frei). */
  crudeMode: TransportMode | null;
  /** Erlös je Barrel Rohöl in der Raffinerie nach Betriebskosten und Zufuhr (ohne Förderzins und Fixkosten). */
  refinedNet: number;
  /** Mit dieser Menge gerechnet (bbl). */
  crude: number;
  /** refinedNet − crudeNet: positiv = raffinieren lohnt. */
  advantage: number;
  /**
   * Was die letzten Barrel (die letzten 5 % der Kapazität) in der Raffinerie
   * bringen, nach Betriebskosten und Fracht. Liegt das unter crudeNet, drückt
   * die Menge die Produktpreise so sehr, dass Verkaufen für diese Barrel besser ist.
   */
  marginalNet: number;
}

/**
 * Vergleicht beide Wege für die Menge, die diese Runde in die Raffinerie ginge
 * (ohne Öl im Tank: volle Kapazität). Der Förderzins fällt auf beiden Wegen an
 * und die Fixkosten laufen sowieso – beide bleiben außen vor.
 */
export function crudeVsRefined(state: GameState, balance: Balance, world?: RefineryWorld): CrudeVsRefined {
  const MODES: TransportMode[] = ['wagon', 'rail', 'teams', 'pipeline'];
  let crudeNet = -Infinity;
  let crudeMode: TransportMode | null = null;
  for (const m of MODES) {
    if (modeUnavailable(state, m) || modeCapacity(state, balance, m) <= 0) continue;
    const n = netPrice(state, balance, m, 'crane');
    if (n > crudeNet) {
      crudeNet = n;
      crudeMode = m;
    }
  }
  const geplant = plannedCrude(state, balance);
  const voll = Math.max(refineryCapacity(state, balance), balance.refinery.unitCapacity);
  const frei = feedCapacity(state, balance);
  const crude = geplant > 0 ? geplant : frei > 0 ? Math.min(voll, frei) : voll;
  const run = planRun(state, balance, crude, { world });
  const refinedNet = crude > 0 ? cents((run.revenue - run.operating - run.feed) / crude) : 0;
  const schritt = Math.min(crude, Math.max(1, Math.round(0.05 * Math.max(refineryCapacity(state, balance), balance.refinery.unitCapacity))));
  const weniger = planRun(state, balance, crude - schritt, { world });
  const marginalNet =
    schritt > 0 ? cents((run.revenue - run.operating - run.feed - (weniger.revenue - weniger.operating - weniger.feed)) / schritt) : 0;
  const cn = crudeMode ? crudeNet : 0;
  return { crudeNet: cn, crudeMode, refinedNet, crude, advantage: cents(refinedNet - cn), marginalNet };
}

// --- Rundenende -----------------------------------------------------------------

/**
 * Rundenende (4.6 Andockpunkt in endRound, vor dem Lager): Erst raffiniert die
 * Anlage, was aus dem Tank über die freien Transportwege kommt (planFeed), und
 * verkauft die Produkte an den Großhandel;
 * Fixkosten fallen für jede fertige Stufe an. Dann kann sie brennen (nur wenn
 * sie lief; gewürfelt wird jede Runde mit fertiger Anlage, damit der Zufall
 * gleich bleibt). Dann laufen Reparatur und Baustelle weiter. Ohne Raffinerie
 * (Kapitel 1) bleibt der Zustand unverändert.
 */
export function advanceRefinery(input: GameState, balance: Balance, world?: RefineryWorld): GameState {
  const r0 = input.refinery;
  if (!r0) return input;
  const b = balance.refinery;
  let state = input;
  let r: RefineryState = { ...r0 };
  let lief = false;

  if (r.level > 0) {
    const crude = plannedCrude(state, balance);
    const feed = planFeed(state, balance, crude);
    const run = planRun(state, balance, crude, { world });
    const royaltyBarrels = state.oilStock > 0 ? (crude * state.royaltyOil) / state.oilStock : 0;
    lief = crude > 0;
    // Die Zufuhr belegt die Wege wie eine Lieferung: Bahnfracht zählt für Thornes
    // Tariferhöhung und die Mindestabnahme (advanceTransport läuft danach).
    const shipped = { ...state.shipped };
    for (const m of FEED_MODES) shipped[m] = (shipped[m] ?? 0) + feed.byMode[m];
    state = {
      ...state,
      shipped,
      oilStock: Math.max(0, state.oilStock - crude),
      royaltyOil: Math.max(0, state.royaltyOil - royaltyBarrels),
      cash: cents(state.cash + run.net),
      log: lief
        ? logged(
            state,
            `Die Raffinerie verarbeitet ${crude.toLocaleString('de-DE')} Barrel Rohöl – ${dollars(run.revenue)} $ Erlös, ${dollars(run.net)} $ nach allen Kosten.`,
          )
        : logged(state, `Die Raffinerie steht still – Fixkosten ${dollars(run.upkeep)} $.`),
    };
    r.last = run;

    const rng = new Rng(r.rng);
    const wurf = rng.float();
    r.rng = rng.state;
    if (r.repairLeft > 0) {
      r.repairLeft -= 1;
      if (r.repairLeft === 0) state = { ...state, log: logged(state, 'Die Raffinerie ist repariert und läuft wieder.') };
    } else if (lief && wurf < b.fire.chance) {
      r.repairLeft = b.fire.repairRounds;
      r.fires += 1;
      state = {
        ...state,
        cash: cents(state.cash - b.fire.repairCost),
        log: logged(state, `Feuer in der Raffinerie! Die Reparatur kostet ${dollars(b.fire.repairCost)} $, ${b.fire.repairRounds} Runden Stillstand.`),
      };
    }
  }

  if (r.project && r.projectLeft > 0) {
    r.projectLeft -= 1;
    if (r.projectLeft === 0) {
      const erste = r.project === 'build';
      r = { ...r, level: r.level + 1, project: null };
      state = {
        ...state,
        log: logged(state, erste ? 'Die Raffinerie ist fertig – ab der nächsten Runde wird raffiniert.' : 'Der Ausbau der Raffinerie ist fertig.'),
      };
    }
  }
  return { ...state, refinery: r };
}

// --- Buchwert und Spielstand ----------------------------------------------------

/** Buchwert der Anlage im Imperiumswert (fertige Stufen und laufende Baustelle). */
export function refineryAssets(state: Pick<GameState, 'refinery'>, balance: Balance): number {
  const r = state.refinery;
  if (!r) return 0;
  const b = balance.refinery;
  const stufen = r.level + (r.project ? 1 : 0);
  if (stufen === 0) return 0;
  return cents(b.assetShare * (b.buildCost + (stufen - 1) * b.expandCost));
}

/** Prüft einen gespeicherten Raffinerie-Zustand (save.ts). */
export function isRefineryState(v: unknown): v is RefineryState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const mix = o.mix as Record<string, unknown> | undefined;
  return (
    ['rng', 'level', 'projectLeft', 'tech', 'intake', 'repairLeft', 'fires'].every((k) => zahl(o[k])) &&
    (o.project === null || o.project === 'build' || o.project === 'expand') &&
    !!mix &&
    typeof mix === 'object' &&
    PRODUCTS.every((p) => zahl(mix[p])) &&
    (o.last === null || (typeof o.last === 'object' && o.last !== null && zahl((o.last as Record<string, unknown>).net)))
  );
}
