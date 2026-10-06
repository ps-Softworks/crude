// Pacht (GDD §5, §15): Wer bohren will, braucht eine Pacht. Bonus und
// Förderzins hängen von der Lage zum nächsten bekannten Fund und vom
// Landbesitzer ab. Ungebohrte Pachten kosten Verzögerungszins und verfallen
// nach Ablauf der Laufzeit.

import type { Balance, Landowner, LeaseLocation } from './balance';
import { formatDate } from './calendar';
import { timedEffect } from './events';
import type { GameState } from './game';
import { areaFactor, type Parcel } from './geology';
import type { Rng } from './rng';

/** Wer eine Pacht oder Option hält: Jacob oder der Rivale Bullard (ab 1.12). */
export type Holder = 'jacob' | 'bullard';

export interface Lease {
  parcelId: string;
  holder: Holder;
  /** Einmal gezahlter Bonus in $. */
  bonus: number;
  /** Förderzins (Anteil der Förderung für den Landbesitzer), wird mit dem Verkauf in 1.8 abgezogen. */
  royalty: number;
  startRound: number;
  /** Letzte Runde, in der die Pacht noch gilt (sofern nicht gebohrt). */
  expiresAfterRound: number;
  /** Gebohrte Pachten verfallen nie. Wird ab 1.6 gesetzt. */
  drilled: boolean;
}

export interface LeaseOption {
  parcelId: string;
  holder: Holder;
  /** Gesicherter Bonus, der beim Einlösen fällig wird. */
  bonus: number;
  /** Gesicherter Förderzins. */
  royalty: number;
  /** Gezahlte Optionsgebühr. */
  fee: number;
  /** Startoption, die Jacob geschenkt bekommt. */
  free: boolean;
  expiresAfterRound: number;
}

export interface LeaseTerms {
  location: LeaseLocation;
  landowner: Landowner;
  bonus: number;
  royalty: number;
  optionFee: number;
}

export type LeaseResult = { ok: true; state: GameState } | { ok: false; reason: string };

/**
 * Abstand in Nachbarschaftsschritten (0.2.15+5): 0 = eine der Ranches selbst,
 * 1 = gemeinsame Grenze, 2 = Nachbar eines Nachbarn … Ohne Verbindung: Infinity.
 */
export function stepsBetween(parcels: readonly Parcel[], from: readonly Pick<Parcel, 'id'>[], to: Pick<Parcel, 'id'>): number {
  if (from.length === 0) return Infinity;
  const byId = new Map(parcels.map((p) => [p.id, p]));
  const dist = new Map<string, number>(from.map((p) => [p.id, 0]));
  const offen = from.map((p) => p.id);
  for (let i = 0; i < offen.length; i++) {
    const id = offen[i];
    const d = dist.get(id)!;
    if (id === to.id) return d;
    for (const n of byId.get(id)?.neighbors ?? []) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        offen.push(n);
      }
    }
  }
  return Infinity;
}

/** Haben die beiden Ranches eine gemeinsame Grenze? */
export function adjacent(a: Pick<Parcel, 'id' | 'neighbors'>, b: Pick<Parcel, 'id'>): boolean {
  return a.neighbors.includes(b.id);
}

/** Alle bekannten Funde. Vorerst nur Salt Hill; ab 1.6 kommen eigene Funde dazu. */
export function knownDiscoveries(state: Pick<GameState, 'parcels'>): Parcel[] {
  return state.parcels.filter((p) => p.discovery);
}

/** Lage einer Ranch zum nächsten der übergebenen Funde (in Nachbarschaftsschritten). Ohne Funde: letzte Lage. */
export function locationFor(balance: Balance, parcels: readonly Parcel[], discoveries: readonly Parcel[], parcel: Parcel): LeaseLocation {
  const d = stepsBetween(parcels, discoveries, parcel);
  const locations = balance.lease.locations;
  return locations.find((l) => d <= l.maxDistance) ?? locations[locations.length - 1];
}

/** Rundet auf das Raster aus balance.yaml (z. B. 10 $). Kleine Rechenreste werden vorher geglättet. */
export function roundBonus(balance: Balance, value: number): number {
  const step = balance.lease.bonusRounding;
  return Math.round(Number((value / step).toFixed(6))) * step;
}

export function landownerOf(balance: Balance, parcel: Parcel): Landowner {
  const owner = balance.lease.landowners.find((o) => o.name === parcel.landowner);
  if (!owner) throw new Error(`Unbekannter Landbesitzer "${parcel.landowner}".`);
  return owner;
}

function parcelById(state: Pick<GameState, 'parcels'>, parcelId: string): Parcel | undefined {
  return state.parcels.find((p) => p.id === parcelId);
}

/** Konditionen für eine Pacht auf dieser Parzelle, wenn man sie jetzt abschließt. */
export function leaseTerms(state: GameState, balance: Balance, parcelId: string): LeaseTerms {
  const parcel = parcelById(state, parcelId);
  if (!parcel) throw new Error(`Ranch "${parcelId}" gibt es nicht.`);
  const location = locationFor(balance, state.parcels, knownDiscoveries(state), parcel);
  const landowner = landownerOf(balance, parcel);
  const { royaltyMin, royaltyMax, option } = balance.lease;
  // Nachwirkung aus Ereignissen (0.2.15+3): leaseCost macht Pachten befristet teurer oder billiger.
  // Größere Ranches kosten mehr (0.2.15+5): Der Lagebonus gilt je ranches.slotArea Fläche.
  const flaeche = areaFactor(balance, parcel);
  // Erkundung (Etappe 1): Ein freundlicher Farmer lässt nach dem Gespräch etwas nach.
  const nachlass = 1 - (state.knowledge?.[parcelId]?.leaseDiscount ?? 0);
  const bonus = roundBonus(balance, location.bonus * flaeche * landowner.bonusFactor * Math.max(0, 1 + timedEffect(state, 'leaseCost')) * nachlass);
  const royalty = Math.min(royaltyMax, Math.max(royaltyMin, location.royalty + landowner.royaltyAdd));
  const optionFee = roundBonus(balance, bonus * option.feeShare);
  return { location, landowner, bonus, royalty, optionFee };
}

export function leaseOf(state: Pick<GameState, 'leases'>, parcelId: string): Lease | undefined {
  return state.leases.find((l) => l.parcelId === parcelId);
}

export function optionOf(state: Pick<GameState, 'options'>, parcelId: string): LeaseOption | undefined {
  return state.options.find((o) => o.parcelId === parcelId);
}

/** Wie viele Runden noch übrig sind, die aktuelle mitgezählt (0 = abgelaufen). */
export function roundsLeft(state: Pick<GameState, 'round'>, item: { expiresAfterRound: number }): number {
  return Math.max(0, item.expiresAfterRound - state.round + 1);
}

/** Name einer Ranch für Log und Meldungen, z. B. „Moss-Farm“. */
export function parcelLabel(parcel: Pick<Parcel, 'name'>): string {
  return parcel.name;
}

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Gemeinsame Prüfungen für Pacht und Option. Gibt einen Grund zurück, wenn es nicht geht. */
function blockReason(state: GameState, parcelId: string): string | undefined {
  if (state.finished) return 'Das Kapitel ist beendet.';
  const parcel = parcelById(state, parcelId);
  if (!parcel) return 'Diese Ranch gibt es nicht.';
  if (parcel.discovery) return 'Salt Hill ist schon erschlossen – hier gibt es nichts zu pachten.';
  const lease = leaseOf(state, parcelId);
  if (lease) return lease.holder === 'jacob' ? 'Du hast diese Ranch schon gepachtet.' : 'Diese Ranch ist schon verpachtet.';
  const option = optionOf(state, parcelId);
  if (option) {
    return option.holder === 'jacob'
      ? 'Du hast schon eine Option auf diese Ranch – löse sie ein.'
      : 'Auf dieser Ranch liegt schon eine Option.';
  }
  return undefined;
}

/** Pacht kaufen: Bonus wird sofort aus der Kasse bezahlt. */
export function buyLease(state: GameState, balance: Balance, parcelId: string): LeaseResult {
  const blocked = blockReason(state, parcelId);
  if (blocked) return { ok: false, reason: blocked };
  const terms = leaseTerms(state, balance, parcelId);
  if (state.cash < terms.bonus) {
    return { ok: false, reason: `Nicht genug Geld: Der Bonus kostet ${money(terms.bonus)}, in der Kasse sind ${money(state.cash)}.` };
  }
  const parcel = parcelById(state, parcelId)!;
  const lease: Lease = {
    parcelId,
    holder: 'jacob',
    bonus: terms.bonus,
    royalty: terms.royalty,
    startRound: state.round,
    expiresAfterRound: state.round + balance.lease.termRounds - 1,
    drilled: false,
  };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - terms.bonus,
      leases: [...state.leases, lease],
      log: [...state.log, `${formatDate(state)}: Pacht auf ${parcelLabel(parcel)} für ${money(terms.bonus)} abgeschlossen.`],
    },
  };
}

/** Pachtoption kaufen: kleine Gebühr, sichert Bonus und Förderzins für kurze Zeit. */
export function buyOption(state: GameState, balance: Balance, parcelId: string): LeaseResult {
  const blocked = blockReason(state, parcelId);
  if (blocked) return { ok: false, reason: blocked };
  const terms = leaseTerms(state, balance, parcelId);
  if (state.cash < terms.optionFee) {
    return {
      ok: false,
      reason: `Nicht genug Geld: Die Option kostet ${money(terms.optionFee)}, in der Kasse sind ${money(state.cash)}.`,
    };
  }
  const parcel = parcelById(state, parcelId)!;
  const option: LeaseOption = {
    parcelId,
    holder: 'jacob',
    bonus: terms.bonus,
    royalty: terms.royalty,
    fee: terms.optionFee,
    free: false,
    expiresAfterRound: state.round + balance.lease.option.termRounds - 1,
  };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - terms.optionFee,
      options: [...state.options, option],
      log: [
        ...state.log,
        `${formatDate(state)}: Option auf ${parcelLabel(parcel)} für ${money(terms.optionFee)} gekauft (Bonus ${money(terms.bonus)} gesichert).`,
      ],
    },
  };
}

/** Option einlösen: gesicherter Bonus wird fällig, daraus wird eine normale Pacht. */
export function exerciseOption(state: GameState, balance: Balance, parcelId: string): LeaseResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const option = optionOf(state, parcelId);
  if (!option || option.holder !== 'jacob') return { ok: false, reason: 'Du hast keine Option auf diese Ranch.' };
  if (state.cash < option.bonus) {
    return {
      ok: false,
      reason: `Nicht genug Geld: Der gesicherte Bonus kostet ${money(option.bonus)}, in der Kasse sind ${money(state.cash)}.`,
    };
  }
  const parcel = parcelById(state, parcelId)!;
  const lease: Lease = {
    parcelId,
    holder: option.holder,
    bonus: option.bonus,
    royalty: option.royalty,
    startRound: state.round,
    expiresAfterRound: state.round + balance.lease.termRounds - 1,
    drilled: false,
  };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - option.bonus,
      options: state.options.filter((o) => o !== option),
      leases: [...state.leases, lease],
      log: [...state.log, `${formatDate(state)}: Option auf ${parcelLabel(parcel)} eingelöst – die Pacht läuft.`],
    },
  };
}

/**
 * Startoptionen: freie Optionen auf verschiedenen Ranches in Randlage, per Seed gewählt.
 * Die erste wird die Startquelle (0.4.20+24, makeSureStart in game.ts): sicheres Öl in 300 m.
 * Die übrigen bleiben Zufall. Jede Option verbraucht genau einen Zufallswert, wie zuvor.
 */
export function startOptions(state: GameState, balance: Balance, rng: Rng): LeaseOption[] {
  const { count, termRounds } = balance.lease.startOptions;
  const outermost = balance.lease.locations[balance.lease.locations.length - 1];
  const discoveries = knownDiscoveries(state);
  const lage = (p: Parcel) => locationFor(balance, state.parcels, discoveries, p).name;
  const candidates = state.parcels.filter((p) => !p.discovery && lage(p) === outermost.name);
  if (candidates.length < count) {
    throw new Error(`Zu wenige Ranches in Randlage für ${count} Startoptionen.`);
  }
  const options: LeaseOption[] = [];
  for (let i = 0; i < count; i++) {
    const parcel = rng.pick(candidates);
    const index = candidates.indexOf(parcel);
    if (index >= 0) candidates.splice(index, 1);
    options.push({
      parcelId: parcel.id,
      holder: 'jacob',
      bonus: 0,
      royalty: leaseTerms(state, balance, parcel.id).royalty,
      fee: 0,
      free: true,
      expiresAfterRound: state.round + termRounds - 1,
    });
  }
  return options;
}

/**
 * Abrechnung am Rundenende: erst verfallen abgelaufene Pachten und Optionen,
 * dann kostet jede weiterlaufende ungebohrte Pacht Verzögerungszins. Wer ihn
 * nicht zahlen kann, verliert diese Pacht sofort.
 */
export function settleLeases(state: GameState, balance: Balance): GameState {
  const date = formatDate(state);
  const log = [...state.log];
  const label = (parcelId: string) => {
    const parcel = parcelById(state, parcelId);
    return parcel ? parcelLabel(parcel) : parcelId;
  };

  const running: Lease[] = [];
  for (const lease of state.leases) {
    if (!lease.drilled && lease.expiresAfterRound <= state.round) {
      const wessen = lease.holder === 'jacob' ? 'Die Pacht' : 'Bullards Pacht';
      log.push(`${date}: ${wessen} auf ${label(lease.parcelId)} ist ungenutzt abgelaufen.`);
    } else {
      running.push(lease);
    }
  }

  const options: LeaseOption[] = [];
  for (const option of state.options) {
    if (option.expiresAfterRound <= state.round) {
      log.push(`${date}: Die Option auf ${label(option.parcelId)} ist verfallen.`);
    } else {
      options.push(option);
    }
  }

  let cash = state.cash;
  const leases: Lease[] = [];
  const rent = balance.lease.delayRental;
  for (const lease of running) {
    if (lease.drilled) {
      leases.push(lease);
    } else if (lease.holder !== 'jacob') {
      // Verzögerungszins zahlt nur Jacob – Bullards Pachten laufen ohne Zins.
      leases.push(lease);
    } else if (cash >= rent) {
      cash -= rent;
      leases.push(lease);
    } else {
      log.push(`${date}: Kein Geld für den Verzögerungszins – die Pacht auf ${label(lease.parcelId)} ist verfallen.`);
    }
  }

  const paid = state.cash - cash;
  if (paid > 0) {
    const n = paid / rent;
    log.push(`${date}: Verzögerungszins ${money(paid)} für ${n} ungebohrte ${n === 1 ? 'Pacht' : 'Pachten'}.`);
  }

  return { ...state, cash, leases, options, log };
}
