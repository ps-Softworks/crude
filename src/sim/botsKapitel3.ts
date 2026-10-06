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
import { bestRefinerySetting, buildRefinery, crudeSupply, expandRefinery, plannedCrude, planRun, refineryExpansion } from './refinery';

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
 * Start-Mix und voller Zufuhr. Jetzt stellt der Bot je Runde Mix und Zufuhr mit dem höchsten Mehrerlös gegenüber dem
 * Verkauf als Rohöl ein (bestRefinerySetting) – wie ein Spieler, der die Vorschau im Raffinerie-Fenster liest.
 */
export function refineryGain(state: GameState, balance: Balance, crudeNet: number): number {
  const crude = plannedCrude(state, balance);
  if (crude <= 0) return 0;
  const run = planRun(state, balance, crude);
  return run.revenue - run.operating - run.feed - crude * crudeNet;
}

export function tuneRefinery(state: GameState, balance: Balance): GameState {
  const r = state.refinery;
  if (!r || r.level === 0 || state.finished) return state;
  // 0.4.20+18: Die Simulation rechnet die beste Einstellung selbst (Raster 5 % + Feinsuche, Benzin für die eigenen Tankstellen).
  const best = bestRefinerySetting(state, balance, { maxCrude: crudeSupply(state, balance) + Math.floor(state.oilStock) });
  if (JSON.stringify(best.mix) === JSON.stringify(r.mix) && best.intake === r.intake) return state;
  return { ...state, refinery: { ...r, mix: best.mix, intake: best.intake } };
}

/** Mix und Zufuhr einstellen, dann ausbauen, wenn der Mehrerlös bis Kapitelende die Kosten × refineryExpand deckt. */
export function runRefinery(state: GameState, balance: Balance, policy: BrandBotPolicy): GameState {
  const s = tuneRefinery(state, balance);
  const r = s.refinery;
  const faktor = policy.refineryExpand;
  const b = balance.refinery;
  if (!r || faktor == null || r.project || r.level === 0 || s.cash < b.expandCost + policy.reserve) return s;
  const aus = refineryExpansion(s, balance, { maxCrude: crudeSupply(s, balance) + Math.floor(s.oilStock) });
  // Horizont: Rest des Kapitels, in Kapitel 2 dazu Kapitel 3 (die Anlage läuft weiter; Zeitsprung II nicht mitgezählt).
  const rest = s.totalRounds - s.round - b.expandRounds + (chapterOf(s) === 2 ? balance.timeskip.nextChapterRounds : 0);
  if (!aus || aus.payback === null || aus.gain * rest < aus.cost * faktor) return s;
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
