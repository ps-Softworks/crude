// Rivale Bullard: pachtet, bohrt und fördert nebenan mit Jacob.
// GDD §9.2, §15.

import type { Balance } from './balance';
import { Rng, seedFromString, type RngState } from './rng';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { parcelLabel } from './lease';
import { trueChance } from './forecast';
import { stageCost } from './drilling';
import { leaseTerms, chebyshev, type Holder } from './lease';
import { formatDate } from './calendar';

/** Eine Bullard-Quelle mit Bohr-Fortschritt. */
export interface RivalWell {
  parcelId: string;
  /** Runde, in der die Bohrung gestartet wurde. */
  startRound: number;
  /** Verbleibende Runden bis zur Fertigstellung. */
  roundsLeft: number;
  /** Status: "drilling" = bohrt noch, "found" = fertig und Öl, "dry" = fertig und trocken. */
  status: 'drilling' | 'found' | 'dry';
}

/** Bullards Spielzustand. */
export interface RivalState {
  id: 'bullard';
  cash: number;
  /** Bullards eigener Zufallsstrom (unabhängig von Jacobs rng). */
  rng: RngState;
  /** Bohrungen und abgeschlossene Quellen. */
  wells: RivalWell[];
}

/**
 * Neuer Rivalstaat für das Spiel.
 * Der Rivale bekommt seinen eigenen Zufallsstrom (seed + ':bullard'),
 * damit bestehende Tests sich nicht verschieben.
 */
export function newRival(seed: string, balance: Balance): RivalState {
  return {
    id: 'bullard',
    cash: balance.rivals.bullard.startCash,
    rng: seedFromString(seed + ':bullard'),
    wells: [],
  };
}

/**
 * Bullards Schätzung der Fundchance für eine Parzelle.
 * Basis: wahre Chance (aus Zonenwissen) + Aufschlag neben einer fündigen Jacob-Pacht.
 */
export function rivalChance(state: GameState, balance: Balance, parcel: Parcel): number {
  const c = trueChance(balance, parcel);
  const bullardBalance = balance.rivals.bullard;

  // Prüfe, ob die Parzelle nahe (Chebyshev ≤ 1) bei einer gebohrten Jacob-Pacht liegt
  let near_found = false;
  for (const lease of state.leases) {
    if (lease.holder === 'jacob' && lease.drilled) {
      const neighbor = state.parcels.find(p => p.id === lease.parcelId);
      if (neighbor && neighbor.geology !== 'dry' && chebyshev(parcel, neighbor) <= 1) {
        near_found = true;
        break;
      }
    }
  }

  const result = c + (near_found ? bullardBalance.nearFindChance : 0);
  return Math.min(1, Math.max(0, result));
}

/**
 * Bullards Nutzen-Berechnung für eine Parzelle.
 * U = c · valuePerFind · (1 + (risk − 3) · riskWeight) − cost
 *     + (grenzt an Jacob-Pacht ? aggression · nearJacobBonus : 0)
 *     + (roll − 0.5) · noise · risk / 5
 */
export function rivalUtility(state: GameState, balance: Balance, parcel: Parcel, roll: number): number {
  const bullardBalance = balance.rivals.bullard;
  const personality = bullardBalance.personality;

  // Kosten: Paketbonus + Bohrstufe 1
  const terms = leaseTerms(state, balance, parcel.id);
  const cost = terms.bonus + stageCost(balance, 1);

  // Chance und Gewinn
  const c = rivalChance(state, balance, parcel);
  const riskFactor = 1 + (personality.risk - 3) * bullardBalance.riskWeight;
  const value = c * bullardBalance.valuePerFind * riskFactor;

  // Prüfe auf Nachbarn-Bonus (Jacob-Pacht)
  let neighborBonus = 0;
  for (const lease of state.leases) {
    if (lease.holder === 'jacob') {
      const neighbor = state.parcels.find(p => p.id === lease.parcelId);
      if (neighbor && chebyshev(parcel, neighbor) <= 1) {
        neighborBonus = personality.aggression * bullardBalance.nearJacobBonus;
        break;
      }
    }
  }

  // Zufallsstreuung
  const noise = (roll - 0.5) * bullardBalance.noise * personality.risk / 5;

  return value - cost + neighborBonus + noise;
}

/**
 * Liste von Parzellen, die Bullard pachten könnte.
 * Ausgeschlossen: Salt Hill, bereits verpachtete/optionierten, entdeckt.
 */
export function rivalCandidates(state: GameState, balance: Balance): Parcel[] {
  const saltHill = balance.map.saltHill;
  const candidates: Parcel[] = [];

  for (const parcel of state.parcels) {
    // Salt Hill ausschließen
    if (parcel.x === saltHill.x && parcel.y === saltHill.y) continue;

    // Discovery ausschließen
    if (parcel.discovery) continue;

    // Pacht oder Option ausschließen
    const hasPacht = state.leases.some(l => l.parcelId === parcel.id);
    const hasOption = state.options.some(o => o.parcelId === parcel.id);
    if (hasPacht || hasOption) continue;

    // Bullards eigene Quellen nicht wieder pachten
    const hasBullardWell = state.rival.wells.some(w => w.parcelId === parcel.id && w.status !== 'drilling');
    if (hasBullardWell) continue;

    candidates.push(parcel);
  }

  // Nach ID sortieren
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Bullards Runde: Bohrungen abwickeln, Einkommen, neue Pachten kaufen.
 */
export function advanceRival(state: GameState, balance: Balance): GameState {
  const log = [...state.log];
  const bullardBalance = balance.rivals.bullard;
  let rival = { ...state.rival };
  let leases = [...state.leases];
  let cash = rival.cash;

  const date = formatDate(state);

  // a) Bohrungen fortschreiten
  const newWells: RivalWell[] = [];
  for (const well of rival.wells) {
    const parcel = state.parcels.find(p => p.id === well.parcelId);
    if (!parcel) continue;

    const updatedWell = { ...well, roundsLeft: well.roundsLeft - 1 };

    if (updatedWell.roundsLeft === 0 && well.status === 'drilling') {
      // Fertig: status = Geologie der Parzelle
      updatedWell.status = parcel.geology === 'dry' ? 'dry' : 'found';

      if (updatedWell.status === 'found') {
        log.push(`${date}: Bullard stößt auf Parzelle ${parcelLabel(parcel)} auf Öl.`);
      } else {
        log.push(`${date}: Bullard stößt auf Parzelle ${parcelLabel(parcel)} trocken.`);
      }
    }

    newWells.push(updatedWell);
  }
  rival.wells = newWells;

  // b) Einnahmen aus fündigen Quellen
  const foundCount = rival.wells.filter(w => w.status === 'found').length;
  const income = foundCount * bullardBalance.incomePerWell;
  cash += income;
  if (income > 0) {
    log.push(`${date}: Bullard kassiert $${income} aus ${foundCount} Quelle${foundCount === 1 ? '' : 'n'}.`);
  }

  // c) Neue Bohrungen starten (Geduld 1 = sofort)
  const drillingCost = stageCost(balance, 1);
  const toBeDrilled = leases.filter(l => l.holder === 'bullard' && !l.drilled).map(l => l.parcelId);
  for (const parcelId of toBeDrilled) {
    if (cash >= drillingCost) {
      cash -= drillingCost;
      // Pacht als gebohrt markieren
      leases = leases.map(l =>
        l.parcelId === parcelId && l.holder === 'bullard' ? { ...l, drilled: true } : l
      );
      // Neue Well eintragen
      rival.wells.push({
        parcelId,
        startRound: state.round,
        roundsLeft: bullardBalance.drillRounds,
        status: 'drilling',
      });
    }
  }

  // d) Neue Pachten kaufen - RNG generieren
  const rng = new Rng(rival.rng);
  const candidates = rivalCandidates(state, balance);
  const bids: { parcel: Parcel; utility: number; roll: number }[] = [];

  for (const parcel of candidates) {
    const roll = rng.float();
    const utility = rivalUtility(state, balance, parcel, roll);
    bids.push({ parcel, utility, roll });
  }

  // Sortiere nach Nutzen (absteigend), bei Gleichstand nach id (aufsteigend)
  bids.sort((a, b) => {
    if (b.utility !== a.utility) return b.utility - a.utility;
    return a.parcel.id.localeCompare(b.parcel.id);
  });

  // Kaufe bis zu actionsPerRound beste Pachten
  let pachedCount = 0;
  for (const bid of bids) {
    if (pachedCount >= bullardBalance.actionsPerRound) break;
    if (bid.utility <= bullardBalance.minUtility) break;

    const terms = leaseTerms(state, balance, bid.parcel.id);
    if (cash < terms.bonus) break; // Nicht genug Geld

    // Pacht kaufen
    cash -= terms.bonus;
    leases.push({
      parcelId: bid.parcel.id,
      holder: 'bullard' as Holder,
      bonus: terms.bonus,
      royalty: terms.royalty,
      startRound: state.round,
      expiresAfterRound: state.round + balance.lease.termRounds - 1,
      drilled: false,
    });

    // Log-Meldungen
    const prefix = `${date}: Bullard pachtet Parzelle ${parcelLabel(bid.parcel)}.`;

    // Prüfe, ob Jacob dort eine Option/Pacht hatte
    let snappedFromJacob = false;
    const hadOption = state.options.some(o => o.parcelId === bid.parcel.id && o.holder === 'jacob');
    const hadLease = state.leases.some(l => l.parcelId === bid.parcel.id && l.holder === 'jacob');

    if (hadOption || hadLease) {
      snappedFromJacob = true;
    }

    if (snappedFromJacob) {
      log.push(`${prefix} Bullard schnappt dir Parzelle ${parcelLabel(bid.parcel)} weg!`);
    } else {
      log.push(prefix);
    }

    pachedCount++;
  }

  rival.cash = cash;
  rival.rng = rng.state; // Speichern des aktualisierten RNG-Zustands

  return { ...state, rival, leases, log };
}
