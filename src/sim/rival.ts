// Rivale Bullard (GDD §9.2, §9.3): pachtet und bohrt nebenan mit einer
// einfachen Nutzen-KI. Eigene Kasse, eigener Zufallsstrom – Jacobs Zufall
// bleibt unberührt. Reine Funktionen, deterministisch.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { stageCost } from './drilling';
import { trueChance } from './forecast';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { chebyshev, leaseTerms, parcelLabel, type Lease } from './lease';
import { Rng, seedFromString, type RngState } from './rng';

/** Eine Bohrung von Bullard. Vereinfacht: ein Bohrgang, Ergebnis = Geologie. */
export interface RivalWell {
  parcelId: string;
  /** Runde, in der die Bohrung begann. */
  startRound: number;
  /** Runden bis zum Ergebnis (nur solange gebohrt wird). */
  roundsLeft: number;
  status: 'drilling' | 'found' | 'dry';
  /** Förderung in Barrel je Runde (nur fündige Quellen; fällt je Runde um production.decline). */
  rate?: number;
  /** Förderzins der Pacht, auf der die Quelle steht (Anteil am Erlös für den Landbesitzer). */
  royalty?: number;
}

export interface RivalState {
  id: 'bullard';
  cash: number;
  /** Bullards eigener Zufallsstrom (unabhängig von Jacobs rng). */
  rng: RngState;
  wells: RivalWell[];
}

/**
 * Bullard zu Spielbeginn. Sein Zufall kommt aus seed + ':bullard', damit
 * bestehende Seeds (Karte, Startoptionen, Bohrungen) sich nicht verschieben.
 */
export function newRival(seed: string, balance: Balance): RivalState {
  return {
    id: 'bullard',
    cash: balance.rivals.bullard.startCash,
    rng: seedFromString(seed + ':bullard'),
    wells: [],
  };
}

/** Jacobs fündige Quellen als Parzellen. */
function jacobFinds(state: GameState): Parcel[] {
  const ids = new Set(state.wells.filter((w) => w.status === 'found').map((w) => w.parcelId));
  return state.parcels.filter((p) => ids.has(p.id));
}

function nextTo(parcel: Parcel, others: readonly Parcel[]): boolean {
  return others.some((o) => o.id !== parcel.id && chebyshev(parcel, o) <= 1);
}

/** Parzellen, auf denen Jacob eine Pacht oder eine Quelle hat. */
function jacobLand(state: GameState): Parcel[] {
  const ids = new Set([
    ...state.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId),
    ...state.wells.map((w) => w.parcelId),
  ]);
  return state.parcels.filter((p) => ids.has(p.id));
}

/**
 * Bullards Bild der Fundchance – nicht die Wahrheit: Zonenwissen (wie die
 * wahre Grundchance der Zone) plus Aufschlag neben einer fündigen Quelle Jacobs.
 */
export function rivalChance(state: GameState, balance: Balance, parcel: Parcel): number {
  const c = trueChance(balance, parcel) + (nextTo(parcel, jacobFinds(state)) ? balance.rivals.bullard.nearFindChance : 0);
  return Math.min(1, Math.max(0, c));
}

/**
 * Nutzen einer Pacht für Bullard (GDD §9.3):
 *   U = c · valuePerFind · (1 + (risk − 3) · riskWeight) − (Bonus + Bohrkosten Stufe 1)
 *       + (grenzt an Jacobs Pacht oder Quelle ? aggression · nearJacobBonus : 0)
 *       + (roll − 0.5) · noise · risk / 5
 */
export function rivalUtility(state: GameState, balance: Balance, parcel: Parcel, roll: number): number {
  const b = balance.rivals.bullard;
  const { risk, aggression } = b.personality;
  const cost = leaseTerms(state, balance, parcel.id).bonus + stageCost(balance, 1);
  const value = rivalChance(state, balance, parcel) * b.valuePerFind * (1 + (risk - 3) * b.riskWeight);
  const neighbour = nextTo(parcel, jacobLand(state)) ? aggression * b.nearJacobBonus : 0;
  const noise = (roll - 0.5) * b.noise * (risk / 5);
  return value - cost + neighbour + noise;
}

/** Auf ganze Cent runden. */
function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bullards Erlös je Barrel bei einem Posted Price (GDD §7.3, wie bei Jacob):
 *   Preis · (1 − Förderzins) − Transport, nie unter null
 * (liegt der Preis darunter, lässt er das Öl im Boden statt draufzuzahlen).
 */
export function rivalNetPerBarrel(price: number, royalty: number, transportPerBarrel: number): number {
  return Math.max(0, price * (1 - royalty) - transportPerBarrel);
}

/**
 * Einnahmen einer fündigen Bullard-Quelle in dieser Runde:
 *   Förderung · (Preis · (1 − Förderzins) − Transport), auf Cent gerundet.
 */
export function rivalWellIncome(well: RivalWell, balance: Balance, price: number): number {
  if (well.status !== 'found') return 0;
  const b = balance.rivals.bullard;
  const rate = well.rate ?? b.ratePerWell;
  const royalty = well.royalty ?? balance.lease.royaltyMin;
  return cents(rate * rivalNetPerBarrel(price, royalty, b.transportPerBarrel));
}

/** Parzellen, die Bullard pachten könnte: frei, nicht Salt Hill, nicht schon einmal von ihm gebohrt. Sortiert nach id. */
export function rivalCandidates(state: GameState, _balance: Balance): Parcel[] {
  const taken = new Set([
    ...state.leases.map((l) => l.parcelId),
    ...state.options.map((o) => o.parcelId),
    ...state.wells.map((w) => w.parcelId),
    ...state.rival.wells.map((w) => w.parcelId),
  ]);
  return state.parcels
    .filter((p) => !p.discovery && !taken.has(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Bullards Zug am Rundenende, direkt nach der Pacht-Abrechnung:
 *   a) laufende Bohrungen kommen voran, Ergebnis = Geologie der Parzelle
 *      (ein Fund startet mit ratePerWell Barrel je Runde);
 *   b) Quellen, die schon vor dieser Runde fündig waren, verkaufen ihre Förderung
 *      zum Posted Price der Runde (salePrice) abzüglich Förderzins und Transport;
 *      danach fällt ihre Rate um production.decline (wie bei Jacob). Neue Funde
 *      liefern erst ab der nächsten Runde;
 *   c) neue Pachten nach Nutzen (je Kandidat genau ein Zufallswert);
 *   d) Geduld 1: jede ungebohrte eigene Pacht wird sofort angebohrt, wenn das Geld reicht.
 * `before` ist der Stand vor der Pacht-Abrechnung: Hatte Jacob dort eine Option
 * oder Pacht, die gerade verfallen ist, schnappt Bullard sie ihm weg.
 * `salePrice` ist der Posted Price, zu dem in dieser Runde verkauft wird (vor dem
 * Marktschritt am Rundenende – derselbe Preis, zu dem auch Jacob verkauft).
 */
export function advanceRival(
  state: GameState,
  balance: Balance,
  before: Pick<GameState, 'leases' | 'options'> = state,
  salePrice: number = state.postedPrice,
): GameState {
  const b = balance.rivals.bullard;
  const date = formatDate(state);
  const log = [...state.log];
  const label = (parcelId: string) => {
    const parcel = state.parcels.find((p) => p.id === parcelId);
    return parcel ? parcelLabel(parcel) : parcelId;
  };

  // b) Einnahmen der Quellen, die schon vor dieser Runde förderten; danach Rückgang.
  let cash = state.rival.cash;
  const decline = balance.production.decline;
  const producing = state.rival.wells.map((well) => {
    if (well.status !== 'found') return well;
    cash += rivalWellIncome(well, balance, salePrice);
    return { ...well, rate: (well.rate ?? b.ratePerWell) * (1 - decline) };
  });
  cash = cents(cash);

  // a) Bohrungen
  const wells: RivalWell[] = producing.map((well) => {
    if (well.status !== 'drilling') return well;
    const roundsLeft = well.roundsLeft - 1;
    if (roundsLeft > 0) return { ...well, roundsLeft };
    const parcel = state.parcels.find((p) => p.id === well.parcelId)!;
    const status = parcel.geology === 'dry' ? 'dry' : 'found';
    log.push(
      status === 'found'
        ? `${date}: Bullard stößt auf Parzelle ${parcelLabel(parcel)} auf Öl.`
        : `${date}: Bullard bohrt auf Parzelle ${parcelLabel(parcel)} trocken.`,
    );
    if (status === 'dry') return { ...well, roundsLeft: 0, status };
    const royalty = state.leases.find((l) => l.parcelId === well.parcelId && l.holder === 'bullard')?.royalty;
    return { ...well, roundsLeft: 0, status, rate: b.ratePerWell, royalty: royalty ?? balance.lease.royaltyMin };
  });

  // c) Pachten: jeder Kandidat bekommt genau einen Zufallswert, in id-Reihenfolge.
  const rng = new Rng(state.rival.rng);
  const bids = rivalCandidates(state, balance).map((parcel) => ({
    parcel,
    utility: rivalUtility(state, balance, parcel, rng.float()),
  }));
  bids.sort((x, y) => y.utility - x.utility || (x.parcel.id < y.parcel.id ? -1 : 1));

  const leases: Lease[] = [...state.leases];
  let bought = 0;
  for (const { parcel, utility } of bids) {
    if (bought >= b.actionsPerRound || utility <= b.minUtility) break;
    const terms = leaseTerms(state, balance, parcel.id);
    if (terms.bonus > cash) continue;
    cash -= terms.bonus;
    leases.push({
      parcelId: parcel.id,
      holder: 'bullard',
      bonus: terms.bonus,
      royalty: terms.royalty,
      startRound: state.round,
      expiresAfterRound: state.round + balance.lease.termRounds - 1,
      drilled: false,
    });
    bought++;
    const hadIt =
      before.options.some((o) => o.parcelId === parcel.id && o.holder === 'jacob') ||
      before.leases.some((l) => l.parcelId === parcel.id && l.holder === 'jacob');
    log.push(
      hadIt || nextTo(parcel, jacobFinds(state))
        ? `${date}: Bullard pachtet Parzelle ${parcelLabel(parcel)} – Bullard schnappt dir Parzelle ${parcelLabel(parcel)} weg!`
        : `${date}: Bullard pachtet Parzelle ${parcelLabel(parcel)}.`,
    );
  }

  // d) Bohren (Geduld 1 = sofort, auch auf der gerade gekauften Pacht)
  const cost = stageCost(balance, 1);
  const drilled = leases.map((lease) => {
    if (lease.holder !== 'bullard' || lease.drilled || cash < cost) return lease;
    cash -= cost;
    wells.push({ parcelId: lease.parcelId, startRound: state.round, roundsLeft: b.drillRounds, status: 'drilling' });
    log.push(`${date}: Bullard bohrt auf Parzelle ${label(lease.parcelId)}.`);
    return { ...lease, drilled: true };
  });

  return { ...state, leases: drilled, log, rival: { ...state.rival, cash, rng: rng.state, wells } };
}
