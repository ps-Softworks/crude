// Integration Phase 4: ein Aufruf für den Kapitelstart (4.5 Zeitsprung).
//
// Die Systeme aus 4.6–4.17 wurden parallel gebaut. Jedes hat eine eigene Freischaltung –
// manche entstehen von selbst beim ersten Rundenende im neuen Kapitel, andere (Raffinerie,
// Aktien, Diplomatie) nur, wenn jemand sie beim Kapitelstart anlegt. Damit der Zeitsprung
// nicht zehn Funktionen kennen muss, legt openChapterSystems alles an, was im Kapitel
// `state.chapter` dazugehört – erst dann sieht der Spieler in der ersten Runde des neuen
// Kapitels schon die Bewerbungen, den Raffinerie-Plan und das Aktienbuch.
//
// Rein und deterministisch: kein Zufall (jedes System sät seinen eigenen Zufall aus dem Seed),
// in Kapitel 1 kommt derselbe Zustand zurück. Mehrfach aufrufen schadet nicht.

import type { Balance } from './balance';
import { unlockBigPipelines } from './bigPipeline';
import { brandOf, brandUnlocked, brandWorldFrom } from './brand';
import { diplomacyUnlocked, startDiplomacy } from './diplomacy';
import { openExchange } from './exchange';
import type { GameState } from './game';
import { investigationUnlocked, newInvestigation } from './investigation';
import { ensureKapitel3 } from './kapitel3';
import { refineryUnlockedFor, unlockRefinery } from './refinery';
import { seatStartGuests } from './eventSystems';
import { newResearch, researchUnlocked } from './research';
import { openStaff, staffUnlocked } from './staff';
import { chapterOf, startStocks, type BoardSeatDef } from './stocks';

export interface ChapterSystemTexts {
  /** Räte für den Aufsichtsrat (content/stocks.yaml, `board`) – ohne sie entsteht kein Aktienbuch. */
  stocksBoard?: readonly BoardSeatDef[];
}

/**
 * Legt alle Phase-4-Systeme an, die im Kapitel `state.chapter` freigeschaltet sind.
 * 4.5 ruft das nach dem Zeitsprung auf, nachdem `chapter`, `round` und `startYear` gesetzt sind.
 */
export function openChapterSystems(state: GameState, balance: Balance, texts: ChapterSystemTexts = {}): GameState {
  const kapitel = chapterOf(state);
  if (kapitel <= 1) return state;
  let s = state;
  // Kapitel 2 (4.6–4.11)
  if (refineryUnlockedFor(kapitel, balance)) s = unlockRefinery(s, balance);
  s = unlockBigPipelines(s, balance);
  if (texts.stocksBoard && !s.stocks) s = seatStartGuests(startStocks(s, balance, texts.stocksBoard), balance);
  if (staffUnlocked(s, balance)) s = openStaff(s, balance);
  if (diplomacyUnlocked(balance, kapitel)) s = startDiplomacy(s, balance, kapitel);
  if (!s.investigation && investigationUnlocked(s, balance)) s = { ...s, investigation: newInvestigation(s, balance) };
  if (!s.research && researchUnlocked(s, balance)) s = { ...s, research: newResearch(s.seed) };
  // Kapitel 3 (4.14–4.17); Hallstead entsteht erst mit der ersten Handlung dort.
  if (!s.brand && brandUnlocked(brandWorldFrom(s), balance)) s = { ...s, brand: brandOf(s, balance) };
  if (kapitel >= balance.exchange.unlockChapter) s = openExchange(s, balance);
  s = ensureKapitel3(s, balance);
  return s;
}
