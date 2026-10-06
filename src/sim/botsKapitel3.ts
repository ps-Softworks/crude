// Bot-Hilfe für Kapitel 3 (4.19): Der Standard-Bot (bots.ts) kennt die Systeme späterer Kapitel
// nicht. Damit Durchläufe über alle drei Kapitel die Kapitel-3-Systeme wirklich benutzen, legt
// dieser Schritt vor dem Rundenende nach einfachen Regeln Hand an: Marke gründen, Tankstellen in den
// billigsten offenen Regionen bauen (bis die Marke dort vertreten ist), solange über einer Rücklage
// Geld da ist. 0.4.20+6: „vertreten“ heißt Marktanteil (brand.goal.presenceShare) – der Bot baut in so
// vielen Regionen, wie das Ziel verlangt, plus einer, nach, bis der Anteil mit Abstand reicht – 0.4.20+7: nicht, wo die
// Tankstellen zuletzt Verlust machten. Rein, deterministisch, ohne Zufall. In Kapitel 2 baut er die Raffinerie (0.4.19+2), in
// Kapitel 1 kommt derselbe Zustand zurück – die Kapitel-1-Bot-Läufe ändern sich dadurch nicht.

import type { Balance } from './balance';
import { brandOf, brandRegionOpen, brandUnlocked, brandWorldFrom, buildingCount, buildStations, foundBrand, sellStation, stationCost } from './brand';
import { chapterOf } from './chapterOf';
import { feldzugAbsprache, feldzugKredit, feldzugTilgen } from './feldzug';
import type { GameState } from './game';
import { roundFlow } from './timeskip';
import { buildRefinery, crudeVsRefined, expandRefinery, plannedCrude, planRun, PRODUCTS, refineryMixBounds, type ProductMix } from './refinery';

export interface BrandBotPolicy {
  /** So viel $ bleibt immer in der Kasse. */
  reserve: number;
  /** Höchstens so viele Tankstellen je Runde und Region (0.4.20+6: vorher je Runde insgesamt). */
  perRound: number;
  /**
   * 0.4.20+17 Raffinerie-Ausbau: Er baut eine Stufe aus, wenn der Mehrerlös bis Kapitelende die Kosten × diesen
   * Faktor deckt (null = nie ausbauen). Mix und Zufuhr stellt jeder Bot ein.
   */
  refineryExpand?: number | null;
}

/** Bot-Faustregeln für den Marktanteil (0.4.20+6): so viel Abstand über presenceShare, höchstens so viele Tankstellen je Region. */
export const BRAND_BOT_MARGIN = 0.03;
export const BRAND_BOT_MAX_STATIONS = 30;

export const DEFAULT_BRAND_BOT: BrandBotPolicy = { reserve: 15000, perRound: 3 };

/**
 * Kapitel 2 (0.4.19+2): Die Prüfung verlangt eine eigene Raffinerie oder Fernleitung zum Hafen.
 * Der Bot baut die Raffinerie, sobald Bau und Rücklage bezahlbar sind – vorher spielte kein
 * Messwerkzeug die Systeme von Kapitel 2, und die Prüfung wurde in keiner Bot-Partie bestanden.
 */
export function botChapter2Systems(state: GameState, balance: Balance, policy: BrandBotPolicy = DEFAULT_BRAND_BOT): GameState {
  if (state.finished || chapterOf(state) !== 2 || !state.refinery) return state;
  if (state.refinery.level > 0 || state.refinery.project) return runRefinery(state, balance, policy);
  if (state.cash < balance.refinery.buildCost + policy.reserve) return state;
  const r = buildRefinery(state, balance);
  return r.ok ? r.state : state;
}

/**
 * Raffinerie-Betrieb (0.4.20+17, Sitzung „bot runner“): Vorher lief jede Bot-Raffinerie mit dem absichtlich schlechten
 * Start-Mix und voller Zufuhr (Amortisation ~30 statt ~10 Runden, tools/raffinerieLaeufe.ts). Jetzt wählt der Bot
 * je Runde den Mix (Gitter 5 %) und die Zufuhr (5 %-Schritte) mit dem höchsten Mehrerlös gegenüber dem Verkauf als
 * Rohöl – wie ein Spieler, der die Vorschau im Raffinerie-Fenster liest.
 */
export function refineryGain(state: GameState, balance: Balance, crudeNet: number): number {
  const crude = plannedCrude(state, balance);
  if (crude <= 0) return 0;
  const run = planRun(state, balance, crude);
  return run.revenue - run.operating - run.feed - crude * crudeNet;
}

function refineryMixes(state: GameState, balance: Balance): ProductMix[] {
  const b = refineryMixBounds(state, balance, state.refinery!.tech);
  const stufen = (p: (typeof PRODUCTS)[number]) => {
    const xs: number[] = [];
    for (let v = Math.ceil(b[p].min * 20 - 1e-9); v <= Math.floor(b[p].max * 20 + 1e-9); v++) xs.push(v);
    return xs;
  };
  const [a, c, d, rest] = PRODUCTS;
  const out: ProductMix[] = [];
  for (const x of stufen(a))
    for (const y of stufen(c))
      for (const z of stufen(d)) {
        const w = 20 - x - y - z;
        if (w < b[rest].min * 20 - 1e-9 || w > b[rest].max * 20 + 1e-9) continue;
        out.push({ [a]: x / 20, [c]: y / 20, [d]: z / 20, [rest]: w / 20 } as ProductMix);
      }
  return out;
}

/** Zum Zug des Bots ist der Tank meist leer (verkauft wird am Rundenende) – gerechnet wird mit dem Öl dieser Runde dazu. */
export function withRoundOil(state: GameState): GameState {
  return { ...state, oilStock: state.oilStock + roundFlow(state) };
}

export function tuneRefinery(state: GameState, balance: Balance): GameState {
  const r = state.refinery;
  if (!r || r.level === 0 || state.finished) return state;
  const blick = withRoundOil(state);
  const crudeNet = crudeVsRefined(blick, balance).crudeNet;
  const mit = (s: GameState, mix: ProductMix, intake: number): GameState => ({ ...s, refinery: { ...r, mix, intake } });
  let best = { mix: r.mix, intake: r.intake, gain: refineryGain(blick, balance, crudeNet) };
  // Abwechselnd Mix und Zufuhr verbessern (zweimal): Welcher Mix am besten ist, hängt von der Menge ab (Preisdruck).
  const mixe = refineryMixes(state, balance);
  for (let runde = 0; runde < 2; runde++) {
    const zufuhr = runde === 0 ? [1, 0.5] : [best.intake];
    for (const intake of zufuhr)
      for (const mix of mixe) {
        const g = refineryGain(mit(blick, mix, intake), balance, crudeNet);
        if (g > best.gain + 1e-6) best = { mix, intake, gain: g };
      }
    for (let i = 0; i <= 20; i++) {
      const g = refineryGain(mit(blick, best.mix, i / 20), balance, crudeNet);
      if (g > best.gain + 1e-6) best = { ...best, intake: i / 20, gain: g };
    }
  }
  if (best.mix === r.mix && best.intake === r.intake) return state;
  return mit(state, best.mix, best.intake);
}

/** Mix und Zufuhr einstellen, dann ausbauen, wenn der Mehrerlös bis Kapitelende die Kosten × refineryExpand deckt. */
export function runRefinery(state: GameState, balance: Balance, policy: BrandBotPolicy): GameState {
  let s = tuneRefinery(state, balance);
  const r = s.refinery;
  const faktor = policy.refineryExpand;
  const b = balance.refinery;
  if (!r || faktor == null || r.project || r.level === 0 || r.level >= b.maxLevel || s.cash < b.expandCost + policy.reserve) return s;
  const crudeNet = crudeVsRefined(withRoundOil(s), balance).crudeNet;
  const groesser = tuneRefinery({ ...s, refinery: { ...r, level: r.level + 1 } }, balance);
  const mehr = refineryGain(withRoundOil(groesser), balance, crudeNet) - refineryGain(withRoundOil(s), balance, crudeNet) - b.upkeepPerLevel;
  const rest = s.totalRounds - s.round - b.expandRounds;
  if (mehr <= 0 || mehr * rest < b.expandCost * faktor) return s;
  const e = expandRefinery(s, balance);
  return e.ok ? e.state : s;
}

/** Ein Zug des Bots an den Systemen späterer Kapitel: Raffinerie (Kapitel 2), Marke und Tankstellen (Kapitel 3). */
export function botChapterSystems(state: GameState, balance: Balance, policy: BrandBotPolicy = DEFAULT_BRAND_BOT): GameState {
  if (chapterOf(state) === 2) return botChapter2Systems(state, balance, policy);
  if (state.finished || chapterOf(state) < 3) return state;
  state = runRefinery(state, balance, policy);
  const world = brandWorldFrom(state);
  if (!brandUnlocked(world, balance)) return state;
  let s = state;
  if (!brandOf(s, balance).founded) {
    if (s.cash < balance.brand.foundCost + policy.reserve) return s;
    const r = foundBrand(s, balance, world, 'harlan', 'Harlan');
    if (!r.ok) return s;
    s = r.state;
  }
  const goal = balance.brand.goal;
  const regionen = balance.brand.regions
    .filter((rb) => brandRegionOpen(world, balance, rb.id))
    .sort((a, b) => stationCost(balance, a.id) - stationCost(balance, b.id) || (a.id < b.id ? -1 : 1))
    .slice(0, goal.regions + 1);
  // 0.4.20+6: perRound gilt je Region – ein reicher Konzern baut in mehreren Regionen zugleich.
  for (const rb of regionen) {
    const brand = brandOf(s, balance);
    const r = brand.regions[rb.id];
    const anteil = r.last?.share ?? 0;
    if (r.stations > 0 && anteil >= goal.presenceShare + BRAND_BOT_MARGIN) continue;
    // 0.4.20+7: Wo die Tankstellen zuletzt Verlust machten, baut er nicht weiter (Crane hält dagegen).
    if (r.stations > 0 && (r.last?.profit ?? 0) < 0) continue;
    const bestand = r.stations + buildingCount(brand, rb.id);
    if (bestand >= BRAND_BOT_MAX_STATIONS) continue;
    const n = Math.min(policy.perRound, BRAND_BOT_MAX_STATIONS - bestand, Math.floor((s.cash - policy.reserve) / stationCost(balance, rb.id)));
    if (n <= 0) break;
    const res = buildStations(s, balance, world, rb.id, n);
    if (res.ok) s = res.state;
  }
  return s;
}

/** Wie ein Bot auf Cranes Feldzug antwortet (0.4.20+8, balance.yaml → bots.campaign.*.feldzug). */
export interface FeldzugBotPolicy {
  pact: boolean;
  loan: boolean;
  sellBelow: number;
  /** Betrügerischer Bot: die Absprache erst nach so vielen Runden Krieg (fehlt/0 = schon bei der Drohung). */
  pactAfter?: number;
}

/**
 * Cranes Feldzug (0.4.20+8): Wer Absprachen mag, nimmt Margarets Preisliste. Sonst hält er durch – nimmt mit loan
 * Thornes Geld, sobald die Kasse unter die Rücklage fällt, zahlt es zurück, sobald es samt Rücklage da ist, und
 * verkauft im Krieg Tankstellen (Region mit dem schlechtesten letzten Gewinn zuerst), solange die Kasse unter
 * sellBelow liegt. Rein, deterministisch, ohne Zufall.
 */
export function botFeldzug(state: GameState, balance: Balance, policy: FeldzugBotPolicy | null | undefined, reserve: number): GameState {
  const f = state.feldzug;
  if (!f || !policy || state.finished) return state;
  let s = state;
  const warten = policy.pactAfter ?? 0;
  if (policy.pact && ((f.phase === 'drohung' && warten === 0) || (f.phase === 'krieg' && s.round - f.since >= warten))) {
    const r = feldzugAbsprache(s, balance);
    if (r.ok) return r.state;
  }
  if (s.feldzug?.loan && s.cash >= s.feldzug.loan.owed + reserve) {
    const r = feldzugTilgen(s);
    if (r.ok) s = r.state;
  }
  // Thornes Frist naht (diese Runde fällig): Tankstellen verkaufen, bis das Geld für ihn da ist.
  const frist = s.feldzug?.loan && s.round >= s.feldzug.loan.due ? s.feldzug.loan.owed : 0;
  if (s.feldzug?.phase !== 'krieg' && frist === 0) return s;
  if (policy.loan && s.feldzug?.phase === 'krieg' && s.cash < reserve) {
    const r = feldzugKredit(s, balance);
    if (r.ok) s = r.state;
  }
  const world = brandWorldFrom(s);
  const ziel = Math.max(s.feldzug?.phase === 'krieg' ? policy.sellBelow : 0, frist);
  for (let i = 0; i < 200 && s.cash < ziel; i++) {
    const brand = brandOf(s, balance);
    const regionen = Object.entries(brand.regions)
      .filter(([, r]) => r.stations > 0)
      .sort(([a, x], [b, y]) => (x.last?.profit ?? 0) - (y.last?.profit ?? 0) || (a < b ? -1 : 1));
    if (regionen.length === 0) break;
    const r = sellStation(s, balance, world, regionen[0][0]);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}
