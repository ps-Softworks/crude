// Bot-Hilfe für Kapitel 3 (4.19): Der Standard-Bot (bots.ts) kennt die Systeme späterer Kapitel
// nicht. Damit Durchläufe über alle drei Kapitel die Kapitel-3-Systeme wirklich benutzen, legt
// dieser Schritt vor dem Rundenende nach einfachen Regeln Hand an: Marke gründen, Tankstellen in den
// billigsten offenen Regionen bauen (bis die Marke dort vertreten ist), solange über einer Rücklage
// Geld da ist. Rein, deterministisch, ohne Zufall. In Kapitel 1 und 2 kommt derselbe Zustand zurück –
// die Kapitel-1-Bot-Läufe ändern sich dadurch nicht.

import type { Balance } from './balance';
import { brandOf, brandRegionOpen, brandUnlocked, brandWorldFrom, buildingCount, buildStations, foundBrand, stationCost } from './brand';
import { chapterOf } from './chapterOf';
import type { GameState } from './game';

export interface BrandBotPolicy {
  /** So viel $ bleibt immer in der Kasse. */
  reserve: number;
  /** Höchstens so viele Tankstellen je Runde. */
  perRound: number;
}

export const DEFAULT_BRAND_BOT: BrandBotPolicy = { reserve: 15000, perRound: 3 };

/** Ein Zug des Bots an den Kapitel-3-Systemen (Marke und Tankstellen). */
export function botChapterSystems(state: GameState, balance: Balance, policy: BrandBotPolicy = DEFAULT_BRAND_BOT): GameState {
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
  const ziel = balance.brand.goal.presenceStations;
  const regionen = balance.brand.regions.filter((rb) => brandRegionOpen(world, balance, rb.id)).sort((a, b) => stationCost(balance, a.id) - stationCost(balance, b.id) || (a.id < b.id ? -1 : 1));
  let gebaut = 0;
  for (const rb of regionen) {
    const brand = brandOf(s, balance);
    const r = brand.regions[rb.id];
    const fehlt = ziel - r.stations - buildingCount(brand, rb.id);
    if (fehlt <= 0) continue;
    const n = Math.min(fehlt, policy.perRound - gebaut, Math.floor((s.cash - policy.reserve) / stationCost(balance, rb.id)));
    if (n <= 0) break;
    const res = buildStations(s, balance, world, rb.id, n);
    if (!res.ok) continue;
    s = res.state;
    gebaut += n;
    if (gebaut >= policy.perRound) break;
  }
  return s;
}
