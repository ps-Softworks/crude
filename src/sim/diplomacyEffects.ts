// Was die Diplomatie (4.10) für Jacob in einer Runde bewirkt – auf Preis und
// Pachtkosten. Alles zusammen steht als eine befristete Nachwirkung in events.timed
// (Quelle „diplomatie“): jacobPrice (trust.ts) und leaseTerms (lease.ts) rechnen sie mit.
//
//   price     = Nachfolge (Margaret-Partner + / Pruett − / zerschlagen +; Partner = laufender
//               Liefervertrag oder Kreuzbeteiligung mit Margaret, oder Vertrauen ≥ partnerTrust)
//             + Preisabsprachen + Liefervertrag + Verband (× Stärke) + Nachwirkungen
//   leaseCost = − Gebietsabsprachen + Außenseiter-Aufschlag (zu groß für den Verband) + Nachwirkungen
//
// Außerdem Schnittstellen für andere Systeme: Hitze (4.11), Übernahmeschutz (4.8),
// Stimmung (4.2).

import type { Balance } from './balance';
import { round2, writeTimed, type DiploGame, type DiplomacyState, type Pact } from './diplomacyCore';
import { empireValue } from './empire';
import type { GameState } from './game';

export function pactActive(p: Pick<Pact, 'startRound' | 'endRound'>, round: number): boolean {
  return p.startRound <= round && round <= p.endRound;
}

/** Preis- und Gebietsabsprachen sind Kartellabsprachen (GDD §9.4: illegal, sobald ein Kartellgesetz gilt). */
export function isCartel(p: Pick<Pact, 'kind'>): boolean {
  return p.kind === 'price' || p.kind === 'territory';
}

/** Stärke des Verbands 0–1: Mitglieder / fullMembers. */
export function guildStrength(d: Pick<DiplomacyState, 'guild'>, balance: Balance): number {
  return Math.min(1, d.guild.members / balance.diplomacy.guild.fullMembers);
}

/** Ist Jacob für Delgado selbst ein Trust geworden? (Imperiumswert ≥ tooBigValue) */
export function tooBig(state: GameState, balance: Balance): boolean {
  return empireValue(state, balance) >= balance.diplomacy.guild.tooBigValue;
}

/**
 * Ist Jacob Margarets Partner? Eine laufende Absprache mit ihr (Liefervertrag oder
 * Kreuzbeteiligung) macht ihn dazu, auch wenn das Vertrauen langsam verblasst – sonst
 * zählt das Vertrauen (≥ succession.partnerTrust).
 */
export function margaretPartner(d: Pick<DiplomacyState, 'pacts' | 'relations'>, balance: Balance, round: number): boolean {
  if (d.pacts.some((x) => x.rival === 'margaret' && (x.kind === 'supply' || x.kind === 'cross') && pactActive(x, round))) return true;
  return d.relations.margaret.trust >= balance.diplomacy.succession.partnerTrust;
}

/** Wirkung der Diplomatie in einer Runde (round = für welche Runde). */
export function diplomacyEffects(state: DiploGame, balance: Balance, round: number): { price: number; leaseCost: number } {
  const d = state.diplomacy;
  const s = balance.diplomacy.succession;
  const p = balance.diplomacy.pacts;
  const aktiv = d.pacts.filter((x) => pactActive(x, round));
  let price = 0;
  let leaseCost = 0;

  switch (d.succession.outcome) {
    case 'margaret':
      if (margaretPartner(d, balance, round)) price += s.margaretPremium;
      break;
    case 'pruett':
      if (!aktiv.some((x) => x.rival === 'pruett' && x.kind === 'price')) price -= s.pruettCut;
      break;
    case 'zerschlagen':
      price += s.breakupPremium;
      break;
    default:
      break;
  }
  for (const x of aktiv) {
    if (x.kind === 'price') price += p.pricePremium;
    if (x.kind === 'supply') price += p.supplyPremium;
    if (x.kind === 'territory') leaseCost -= p.territoryLeaseCost;
  }
  if (d.guild.founded > 0) {
    if (d.guild.member) price += balance.diplomacy.guild.premium * guildStrength(d, balance);
    else if (tooBig(state, balance)) leaseCost += balance.diplomacy.guild.outsiderLeaseCost;
  }
  for (const a of d.aftermath) {
    if (a.from <= round && round <= a.until) {
      if (a.key === 'price') price += a.value;
      else leaseCost += a.value;
    }
  }
  return { price: round2(price), leaseCost: Math.round(leaseCost * 10000) / 10000 };
}

/** Schreibt die Wirkung für eine Runde nach events.timed (nach jeder Aktion und am Rundenende). */
export function refreshEffects<T extends DiploGame>(state: T, balance: Balance, round: number): T {
  return writeTimed(state, diplomacyEffects(state, balance, round), round);
}

/**
 * Hitze aus der Diplomatie (für 4.11 Schattenbuch): Summe der Spuren. // 4.11 Andockpunkt
 * Die Spuren verblassen hier nicht – das übernimmt das Schattenbuch.
 */
export function diplomacyHeat(state: GameState): number {
  return (state.diplomacy?.traces ?? []).reduce((sum, t) => sum + t.severity, 0);
}

/**
 * Schutz vor feindlicher Übernahme aus Kreuzbeteiligungen (für 4.8 Aktien): // 4.8 Andockpunkt
 * crossShield je laufender Kreuzbeteiligung, höchstens 0,75.
 */
export function takeoverShield(state: GameState, balance: Balance): number {
  const d = state.diplomacy;
  if (!d) return 0;
  const n = d.pacts.filter((x) => x.kind === 'cross' && pactActive(x, state.round)).length;
  return Math.min(0.75, round2(n * balance.diplomacy.pacts.crossShield));
}

/**
 * Was die Diplomatie in die Welt gibt (für 4.2 Stimmung): // 4.2 Andockpunkt
 * Jede laufende Kartellabsprache drückt die Stimmung um cartelMood.
 */
export function diplomacyMoodShift(state: GameState, balance: Balance): number {
  const d = state.diplomacy;
  if (!d) return 0;
  return -d.pacts.filter((x) => isCartel(x) && pactActive(x, state.round)).length * balance.diplomacy.pacts.cartelMood;
}
