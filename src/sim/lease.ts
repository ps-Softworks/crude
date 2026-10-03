// Pacht (GDD §5, §15): Wer bohren will, braucht eine Pacht. Bonus und
// Förderzins hängen von der Lage zum nächsten bekannten Fund und vom
// Landbesitzer ab. Ungebohrte Pachten kosten Verzögerungszins und verfallen
// nach Ablauf der Laufzeit.

import type { Balance, Landowner, LeaseLocation } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import type { Parcel } from './geology';
import type { Rng } from './rng';

/** Wer eine Pacht oder Option hält. Der Rivale kommt mit 1.12 dazu. */
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

export interface Point {
  x: number;
  y: number;
}

/** Abstand in Feldern, Diagonalen zählen wie gerade Schritte. */
export function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Alle bekannten Funde. Vorerst nur Salt Hill; ab 1.6 kommen eigene Funde dazu. */
export function knownDiscoveries(state: Pick<GameState, 'parcels'>): Parcel[] {
  return state.parcels.filter((p) => p.discovery);
}

/** Lage einer Stelle zum nächsten der übergebenen Funde. Ohne Funde: letzte Lage. */
export function locationFor(balance: Balance, discoveries: readonly Point[], point: Point): LeaseLocation {
  const d = discoveries.reduce((min, f) => Math.min(min, chebyshev(f, point)), Infinity);
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
  if (!parcel) throw new Error(`Parzelle "${parcelId}" gibt es nicht.`);
  const location = locationFor(balance, knownDiscoveries(state), parcel);
  const landowner = landownerOf(balance, parcel);
  const { royaltyMin, royaltyMax, option } = balance.lease;
  const bonus = roundBonus(balance, location.bonus * landowner.bonusFactor);
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

/** Kurzname einer Parzelle für Log und Meldungen, wie auf der Karte (ab 1 gezählt). */
export function parcelLabel(parcel: Point): string {
  return `${parcel.x + 1}/${parcel.y + 1}`;
}

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Gemeinsame Prüfungen für Pacht und Option. Gibt einen Grund zurück, wenn es nicht geht. */
function blockReason(state: GameState, parcelId: string): string | undefined {
  if (state.finished) return 'Das Kapitel ist beendet.';
  const parcel = parcelById(state, parcelId);
  if (!parcel) return 'Diese Parzelle gibt es nicht.';
  if (parcel.discovery) return 'Salt Hill ist schon erschlossen – hier gibt es nichts zu pachten.';
  const lease = leaseOf(state, parcelId);
  if (lease) return lease.holder === 'jacob' ? 'Du hast diese Parzelle schon gepachtet.' : 'Diese Parzelle ist schon verpachtet.';
  const option = optionOf(state, parcelId);
  if (option) {
    return option.holder === 'jacob'
      ? 'Du hast schon eine Option auf diese Parzelle – löse sie ein.'
      : 'Auf dieser Parzelle liegt schon eine Option.';
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
      log: [...state.log, `${formatDate(state)}: Pacht auf Parzelle ${parcelLabel(parcel)} für ${money(terms.bonus)} abgeschlossen.`],
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
        `${formatDate(state)}: Option auf Parzelle ${parcelLabel(parcel)} für ${money(terms.optionFee)} gekauft (Bonus ${money(terms.bonus)} gesichert).`,
      ],
    },
  };
}

/** Option einlösen: gesicherter Bonus wird fällig, daraus wird eine normale Pacht. */
export function exerciseOption(state: GameState, balance: Balance, parcelId: string): LeaseResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist beendet.' };
  const option = optionOf(state, parcelId);
  if (!option || option.holder !== 'jacob') return { ok: false, reason: 'Du hast keine Option auf diese Parzelle.' };
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
      log: [...state.log, `${formatDate(state)}: Option auf Parzelle ${parcelLabel(parcel)} eingelöst – die Pacht läuft.`],
    },
  };
}

/** Startoptionen: freie Optionen auf verschiedenen Randlage-Parzellen, per Seed gewählt. */
export function startOptions(state: GameState, balance: Balance, rng: Rng): LeaseOption[] {
  const { count, termRounds } = balance.lease.startOptions;
  const outermost = balance.lease.locations[balance.lease.locations.length - 1];
  const discoveries = knownDiscoveries(state);
  const candidates = state.parcels.filter(
    (p) => !p.discovery && locationFor(balance, discoveries, p).name === outermost.name,
  );
  if (candidates.length < count) {
    throw new Error(`Zu wenige Randlage-Parzellen für ${count} Startoptionen.`);
  }
  const options: LeaseOption[] = [];
  for (let i = 0; i < count; i++) {
    const parcel = rng.pick(candidates);
    candidates.splice(candidates.indexOf(parcel), 1);
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
      log.push(`${date}: Die Pacht auf Parzelle ${label(lease.parcelId)} ist ungenutzt abgelaufen.`);
    } else {
      running.push(lease);
    }
  }

  const options: LeaseOption[] = [];
  for (const option of state.options) {
    if (option.expiresAfterRound <= state.round) {
      log.push(`${date}: Die Option auf Parzelle ${label(option.parcelId)} ist verfallen.`);
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
    } else if (lease.holder === 'jacob' && cash >= rent) {
      // Verzögerungszins NUR für Jacobs Pachten
      cash -= rent;
      leases.push(lease);
    } else if (lease.holder === 'jacob') {
      log.push(`${date}: Kein Geld für den Verzögerungszins – die Pacht auf Parzelle ${label(lease.parcelId)} ist verfallen.`);
    } else {
      // Bullards Pachten laufen ohne Zins
      leases.push(lease);
    }
  }

  const paid = state.cash - cash;
  if (paid > 0) {
    const n = paid / rent;
    log.push(`${date}: Verzögerungszins ${money(paid)} für ${n} ungebohrte ${n === 1 ? 'Pacht' : 'Pachten'}.`);
  }

  return { ...state, cash, leases, options, log };
}
