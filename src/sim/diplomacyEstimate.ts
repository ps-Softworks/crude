// Lese-Hilfe für die Pinnwand „Konkurrenz“: Was ein Angebot oder ein Vorschlag Jacob
// bei heutiger Lage in $ je Runde bringt (Schätzung, keine Regel). Gerechnet wird mit denselben
// Zahlen wie die Wirkung selbst (diplomacyEffects.ts, balance.diplomacy.pacts):
//   price      pricePremium $ je Barrel × Förderung je Runde
//   supply     supplyPremium $ je Barrel × Förderung je Runde
//   territory  territoryLeaseCost × typische Pachtausgaben je Runde (events.relevance.refLeaseSpend ÷ timedRounds)
//   cross      kein Ertrag (nur Schutz vor Übernahmen) → null
// Spur: Preis- und Gebietsabsprachen sind Kartelle; gilt ein Kartellgesetz, entsteht beim
// Abschluss eine Spur der Schwere cartelHeat im Schattenbuch (diplomacyPacts.ts, trace()).

import type { Balance } from './balance';
import type { OfferKind } from './diplomacyCore';
import { isCartel } from './diplomacyEffects';
import type { GameState } from './game';
import { fieldOf } from './field';
import { producingWells, wellRate } from './production';

/** Barrel, die Jacobs Quellen in der nächsten Runde liefern (ohne Förderbremse). */
export function barrelsPerRound(state: Pick<GameState, 'wells' | 'parcels' | 'fields'>, balance: Balance): number {
  const wells = producingWells(state);
  let sum = 0;
  for (const w of wells) {
    const feld = fieldOf(state, w.parcelId);
    const nachbarn = feld ? wells.filter((x) => fieldOf(state, x.parcelId)?.id === feld.id).length : 1;
    sum += wellRate(balance, w, nachbarn);
  }
  return sum;
}

export interface OfferEstimate {
  /** Geschätzter Gewinn in $ je Runde (auf volle $ gerundet); null = kein laufender Ertrag. */
  perRound: number | null;
  /** So viele Runden gilt die Absprache. */
  rounds: number;
  /** Preis je Barrel, auf dem die Schätzung beruht (nur Preis-/Liefervertrag), sonst null. */
  perBarrel: number | null;
  /** Kartellabsprache: Mit Kartellgesetz entsteht beim Abschluss eine Spur im Schattenbuch. */
  cartel: boolean;
  /** Schwere dieser Spur. */
  traceSeverity: number;
}

/** Schätzung für ein Angebot oder einen Vorschlag der Art `kind`; null bei Kaufangebot (kein Pakt). */
export function estimateOffer(state: GameState, balance: Balance, kind: OfferKind): OfferEstimate | null {
  if (kind === 'buyout') return null;
  const p = balance.diplomacy.pacts;
  let perBarrel: number | null = null;
  let perRound: number | null = null;
  if (kind === 'price' || kind === 'supply') {
    perBarrel = kind === 'price' ? p.pricePremium : p.supplyPremium;
    perRound = Math.round(perBarrel * barrelsPerRound(state, balance));
  } else if (kind === 'territory') {
    const r = balance.events.relevance;
    perRound = Math.round((p.territoryLeaseCost * r.refLeaseSpend) / balance.events.timedRounds);
  }
  return { perRound, rounds: p.rounds, perBarrel, cartel: isCartel({ kind }), traceSeverity: p.cartelHeat };
}
