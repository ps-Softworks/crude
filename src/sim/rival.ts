// Rivale Bullard (GDD §9.2, §9.3): pachtet und bohrt nebenan mit einer
// einfachen Nutzen-KI. Eigene Kasse, eigener Zufallsstrom – Jacobs Zufall
// bleibt unberührt. Reine Funktionen, deterministisch.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { stageCost } from './drilling';
import { trueChance, zoneChance } from './forecast';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { adjacent, leaseTerms, parcelLabel, type Lease } from './lease';
import { Rng, seedFromString, type RngState } from './rng';
import { markRound, RIVAL_MARKS } from './trust';
// Etappe 2: Nach dem Gerücht „Riesenfund bei Bullard“ wartet Bullard mit neuen Pachten ab.
import { bullardShy } from './pricing';

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
  return others.some((o) => o.id !== parcel.id && adjacent(parcel, o));
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
 * Bullards Haltung zu Jacob (2.8, GDD §9.3: Gedächtnis). Sie kommt aus Jacobs
 * Antwort im Saloon (Merkzeichen): Handschlag = Pakt, Beleidigung = Fehde.
 * Ein gebrochener Handschlag ist Verrat und damit für immer Fehde.
 */
export type BullardStance = 'neutral' | 'pakt' | 'fehde';

export function bullardStance(state: Pick<GameState, 'events'>): BullardStance {
  if (markRound(state, RIVAL_MARKS.bullardBetrayed) !== undefined || markRound(state, RIVAL_MARKS.bullardFeud) !== undefined) {
    return 'fehde';
  }
  return markRound(state, RIVAL_MARKS.bullardPact) !== undefined ? 'pakt' : 'neutral';
}

/**
 * Verrat (2.8): Solange der Handschlag gilt, pachtet Jacob nichts direkt neben
 * Bullards Pachten und Quellen. Tut er es doch (Pacht ab der Runde des
 * Handschlags), ist das die Parzelle, an der Bullard es merkt – sonst null.
 */
export function betrayalParcel(state: GameState): Parcel | null {
  const pakt = markRound(state, RIVAL_MARKS.bullardPact);
  if (pakt === undefined || bullardStance(state) !== 'pakt') return null;
  const seineIds = new Set([
    ...state.leases.filter((l) => l.holder === 'bullard').map((l) => l.parcelId),
    ...state.rival.wells.map((w) => w.parcelId),
  ]);
  const seine = state.parcels.filter((p) => seineIds.has(p.id));
  const neue = state.leases
    .filter((l) => l.holder === 'jacob' && l.startRound >= pakt)
    .map((l) => state.parcels.find((p) => p.id === l.parcelId)!)
    .filter((p) => p && nextTo(p, seine))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return neue[0] ?? null;
}

/**
 * Bullards Bild der Fundchance – nicht die Wahrheit: Zonenwissen (das öffentliche
 * Wissen der Zone, Etappe 1) plus ein Teil (insight) dessen, was die Ranch wirklich
 * besser oder schlechter ist – ein alter Wildcatter kennt das Land –, plus Aufschlag
 * neben einer fündigen Quelle Jacobs.
 */
export function rivalChance(state: GameState, balance: Balance, parcel: Parcel): number {
  const zone = zoneChance(balance, parcel);
  const c = zone + balance.rivals.bullard.insight * (trueChance(balance, parcel) - zone) + (nextTo(parcel, jacobFinds(state)) ? balance.rivals.bullard.nearFindChance : 0);
  return Math.min(1, Math.max(0, c));
}

/**
 * Nutzen einer Pacht für Bullard (GDD §9.3):
 *   U = c · valuePerFind · (1 + (risk − 3) · riskWeight) − (Bonus + Bohrkosten Stufe 1)
 *       + (grenzt an Jacobs Pacht oder Quelle ? aggression · nearJacobBonus (· feudFactor bei Fehde) : 0)
 *       + (roll − 0.5) · noise · risk / 5
 */
export function rivalUtility(state: GameState, balance: Balance, parcel: Parcel, roll: number): number {
  const b = balance.rivals.bullard;
  const { risk, aggression } = b.personality;
  const cost = leaseTerms(state, balance, parcel.id).bonus + stageCost(balance, 1);
  // Bullard bohrt je Ranch nur ein Loch mit fester Rate (ratePerWell) – große Ranches sind für ihn
  // nicht mehr wert, nur teurer (0.2.15+5). Er sucht deshalb eher kleine Farmen in guter Lage.
  const value = rivalChance(state, balance, parcel) * b.valuePerFind * (1 + (risk - 3) * b.riskWeight);
  // Fehde (2.8): Er sucht Jacobs Nähe erst recht.
  const groll = bullardStance(state) === 'fehde' ? b.feudFactor : 1;
  const neighbour = nextTo(parcel, jacobLand(state)) ? aggression * b.nearJacobBonus * groll : 0;
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

/**
 * Parzellen, die Bullard pachten könnte: frei, nicht Salt Hill, nicht schon einmal
 * von ihm gebohrt. Mit Handschlag (2.8) nichts direkt neben Jacobs Land. Sortiert nach id.
 */
export function rivalCandidates(state: GameState, _balance: Balance): Parcel[] {
  const taken = new Set([
    ...state.leases.map((l) => l.parcelId),
    ...state.options.map((o) => o.parcelId),
    ...state.wells.map((w) => w.parcelId),
    ...state.rival.wells.map((w) => w.parcelId),
  ]);
  const pakt = bullardStance(state) === 'pakt';
  const jacobs = pakt ? jacobLand(state) : [];
  return state.parcels
    .filter((p) => !p.discovery && !taken.has(p.id))
    .filter((p) => !pakt || !nextTo(p, jacobs))
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

  // Verrat (2.8): Hat Jacob trotz Handschlag neben Bullard gepachtet, merkt der es jetzt – für immer.
  const verrat = betrayalParcel(state);
  if (verrat) {
    log.push(`${date}: Bullard erfährt, dass du neben ihm ${parcelLabel(verrat)} gepachtet hast. Der Handschlag gilt nicht mehr.`);
    state = { ...state, events: { ...state.events, marks: { ...state.events.marks, [RIVAL_MARKS.bullardBetrayed]: state.round } } };
  }
  const fehde = bullardStance(state) === 'fehde';
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
        ? `${date}: Bullard stößt auf ${parcelLabel(parcel)} auf Öl.`
        : `${date}: Bullard bohrt auf ${parcelLabel(parcel)} trocken.`,
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
    if (bought >= b.actionsPerRound || utility <= b.minUtility || bullardShy(state)) break;
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
        ? `${date}: Bullard pachtet ${parcelLabel(parcel)} – Bullard schnappt dir ${parcelLabel(parcel)} weg!`
        : fehde && nextTo(parcel, jacobLand(state))
          ? `${date}: Bullard pachtet aus Groll ${parcelLabel(parcel)} direkt neben deinem Land.`
          : `${date}: Bullard pachtet ${parcelLabel(parcel)}.`,
    );
  }

  // d) Bohren (Geduld 1 = sofort, auch auf der gerade gekauften Pacht)
  const cost = stageCost(balance, 1);
  const drilled = leases.map((lease) => {
    if (lease.holder !== 'bullard' || lease.drilled || cash < cost) return lease;
    cash -= cost;
    wells.push({ parcelId: lease.parcelId, startRound: state.round, roundsLeft: b.drillRounds, status: 'drilling' });
    log.push(`${date}: Bullard bohrt auf ${label(lease.parcelId)}.`);
    return { ...lease, drilled: true };
  });

  return { ...state, leases: drilled, log, rival: { ...state.rival, cash, rng: rng.state, wells } };
}
