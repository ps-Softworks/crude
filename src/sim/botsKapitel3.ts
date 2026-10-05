// Bot-Hilfe für Kapitel 3 (4.19): Der Standard-Bot (bots.ts) kennt die Systeme späterer Kapitel
// nicht. Damit Durchläufe über alle drei Kapitel die Kapitel-3-Systeme wirklich benutzen, legt
// dieser Schritt vor dem Rundenende nach einfachen Regeln Hand an: Marke gründen, Tankstellen in den
// billigsten offenen Regionen bauen (bis die Marke dort vertreten ist), solange über einer Rücklage
// Geld da ist. 0.4.20+6: „vertreten“ heißt Marktanteil (brand.goal.presenceShare) – der Bot baut in so
// vielen Regionen, wie das Ziel verlangt, plus einer, nach, bis der Anteil mit Abstand reicht. Rein, deterministisch, ohne Zufall. In Kapitel 2 baut er die Raffinerie (0.4.19+2), in
// Kapitel 1 kommt derselbe Zustand zurück – die Kapitel-1-Bot-Läufe ändern sich dadurch nicht.

import type { Balance } from './balance';
import { brandOf, brandRegionOpen, brandUnlocked, brandWorldFrom, buildingCount, buildStations, foundBrand, stationCost } from './brand';
import { chapterOf } from './chapterOf';
import type { GameState } from './game';
import { buildRefinery } from './refinery';

export interface BrandBotPolicy {
  /** So viel $ bleibt immer in der Kasse. */
  reserve: number;
  /** Höchstens so viele Tankstellen je Runde und Region (0.4.20+6: vorher je Runde insgesamt). */
  perRound: number;
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
  if (state.refinery.level > 0 || state.refinery.project) return state;
  if (state.cash < balance.refinery.buildCost + policy.reserve) return state;
  const r = buildRefinery(state, balance);
  return r.ok ? r.state : state;
}

/** Ein Zug des Bots an den Systemen späterer Kapitel: Raffinerie (Kapitel 2), Marke und Tankstellen (Kapitel 3). */
export function botChapterSystems(state: GameState, balance: Balance, policy: BrandBotPolicy = DEFAULT_BRAND_BOT): GameState {
  if (chapterOf(state) === 2) return botChapter2Systems(state, balance, policy);
  if (state.finished || chapterOf(state) < 3) return state;
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
    const bestand = r.stations + buildingCount(brand, rb.id);
    if (bestand >= BRAND_BOT_MAX_STATIONS) continue;
    const n = Math.min(policy.perRound, BRAND_BOT_MAX_STATIONS - bestand, Math.floor((s.cash - policy.reserve) / stationCost(balance, rb.id)));
    if (n <= 0) break;
    const res = buildStations(s, balance, world, rb.id, n);
    if (res.ok) s = res.state;
  }
  return s;
}
