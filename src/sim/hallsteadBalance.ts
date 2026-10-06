// Spielzahlen für Nebeninvestments und Lobbyist in Hallstead (4.16, GDD §8, §10, §11).
// Eigener Abschnitt „hallstead“ in content/balance.yaml. Der Leser hier ist
// eigenständig, damit balance.ts nur eine Zeile dafür braucht (Andockpunkt 4.16).

import { BalanceError } from './balance';

/** Nebenwetten außerhalb von Öl (GDD §8). */
export const HOLDING_KINDS = ['land', 'bahn', 'auto', 'zeitung', 'bank'] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

/** Parteien der Föderation – dieselbe Liste wie im Weltmodell (world.ts, 4.1/4.2). */
import { PARTIES as PARTY_IDS, type Party as PartyId } from './world';
export { PARTY_IDS, type PartyId };

/** Merkmale eines Lobbyisten (GDD §11, Auswahl). */
export const LOBBY_TRAITS = ['gewissenhaft', 'trinker', 'genie'] as const;
export type LobbyTrait = (typeof LOBBY_TRAITS)[number];

export interface HoldingKindBalance {
  /** Preis eines Anteils (Tranche) bzw. der ganzen Firma bei single, in $. */
  price: number;
  /** Nur einmal zu haben (eigene Zeitung, eigene Bank). */
  single: boolean;
  /** Ertrag je Runde als Anteil am Wert (negativ = Zuschuss). */
  yield: number;
  /** Grundtrend des Werts je Runde. */
  drift: number;
  /** Wertänderung je Punkt Kreditklima über/unter 50. */
  creditBeta: number;
  /** Wertänderung je Anteil Nachfragewachstum seit der letzten Runde. */
  demandBeta: number;
  /** Zufällige Schwankung je Runde (± noise). */
  noise: number;
  /** Einmaliger Wertverlust, wenn ein Crash beginnt. */
  crashDrop: number;
  /** Schlag aus heiterem Himmel: Feld versiegt (Land), Bankrun (Bank). */
  shock: { chance: number; drop: number; crashOnly: boolean };
}

export interface LobbyCandidateBalance {
  /** Kompetenz 1–5 (GDD §11), im Spiel nur ungefähr sichtbar. */
  competence: number;
  hireCost: number;
  salary: number;
  trait: LobbyTrait;
}

export interface HallsteadBalance {
  /** Ab diesem Kapitel liegt die Hallstead-Mappe auf dem Tisch. */
  unlockChapter: number;
  /** Ohne Weltmodell: Wahl alle so viele Runden. */
  fallbackElectionEvery: number;
  holdings: {
    sellFee: number;
    kinds: Record<HoldingKind, HoldingKindBalance>;
  };
  /** Eigene Bank: Jahreszins um so viel billiger (0.02 = zwei Punkte, wie credit.collateralDiscount). */
  bankRateDiscount: number;
  newspaper: {
    credibilityStart: number;
    campaignCost: number;
    recovery: number;
    moodPerCampaign: number;
    favorsPerCampaign: number;
    /** Glaubwürdigkeit darunter: angekratzt. */
    scratchedBelow: number;
    /** Glaubwürdigkeit darunter: verspielt. */
    lostBelow: number;
  };
  lobby: {
    favorsPerCompetence: number;
    government: Record<PartyId, number>;
    maxFavors: number;
    pushCost: number;
    pushStep: number;
    waterCost: number;
    waterStep: number;
    maxWater: number;
    decay: number;
    maxShift: number;
    /** heatDecay (0.4.20+16): Anteil der Umschlag-Hitze, der je Runde verblasst. */
    bribe: { cost: number; favors: number; heat: number; heatDecay: number };
    donation: { min: number; perFavor: number; winMultiplier: number };
    drunkChance: number;
    genieSpread: number;
    candidates: Record<string, LobbyCandidateBalance>;
  };
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function num(obj: unknown, path: string): number {
  const value = get(obj, path);
  if (typeof value !== 'number' || Number.isNaN(value)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  return value;
}

function nonNeg(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (v < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return v;
}

function share(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (v < 0 || v > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return v;
}

function posInt(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (!Number.isInteger(v) || v < 1) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 1 sein`);
  return v;
}

function bool(obj: unknown, path: string): boolean {
  const v = get(obj, path);
  if (typeof v !== 'boolean') throw new BalanceError(`balance.yaml: "${path}" muss true oder false sein`);
  return v;
}

function parseKind(raw: unknown, kind: HoldingKind): HoldingKindBalance {
  const p = `hallstead.holdings.kinds.${kind}`;
  if (!get(raw, p) || typeof get(raw, p) !== 'object') throw new BalanceError(`balance.yaml: Block "${p}" fehlt`);
  return {
    price: nonNeg(raw, `${p}.price`),
    single: bool(raw, `${p}.single`),
    yield: num(raw, `${p}.yield`),
    drift: num(raw, `${p}.drift`),
    creditBeta: num(raw, `${p}.creditBeta`),
    demandBeta: num(raw, `${p}.demandBeta`),
    noise: share(raw, `${p}.noise`),
    crashDrop: share(raw, `${p}.crashDrop`),
    shock: { chance: share(raw, `${p}.shock.chance`), drop: share(raw, `${p}.shock.drop`), crashOnly: bool(raw, `${p}.shock.crashOnly`) },
  };
}

/** Liest den Block „hallstead“ aus balance.yaml (4.16). */
export function parseHallstead(raw: unknown): HallsteadBalance {
  const block = get(raw, 'hallstead');
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "hallstead" fehlt');
  const kinds = Object.fromEntries(HOLDING_KINDS.map((k) => [k, parseKind(raw, k)])) as Record<HoldingKind, HoldingKindBalance>;
  const candRaw = get(raw, 'hallstead.lobby.candidates');
  if (!candRaw || typeof candRaw !== 'object' || Object.keys(candRaw).length === 0) {
    throw new BalanceError('balance.yaml: "hallstead.lobby.candidates" fehlt oder ist leer');
  }
  const candidates: Record<string, LobbyCandidateBalance> = {};
  for (const id of Object.keys(candRaw)) {
    const p = `hallstead.lobby.candidates.${id}`;
    const competence = posInt(raw, `${p}.competence`);
    if (competence > 5) throw new BalanceError(`balance.yaml: "${p}.competence" muss zwischen 1 und 5 liegen`);
    const trait = get(raw, `${p}.trait`);
    if (!(LOBBY_TRAITS as readonly unknown[]).includes(trait)) {
      throw new BalanceError(`balance.yaml: "${p}.trait" muss eins von ${LOBBY_TRAITS.join(', ')} sein`);
    }
    candidates[id] = { competence, hireCost: nonNeg(raw, `${p}.hireCost`), salary: nonNeg(raw, `${p}.salary`), trait: trait as LobbyTrait };
  }
  const result: HallsteadBalance = {
    unlockChapter: posInt(raw, 'hallstead.unlockChapter'),
    fallbackElectionEvery: posInt(raw, 'hallstead.fallbackElectionEvery'),
    holdings: { sellFee: share(raw, 'hallstead.holdings.sellFee'), kinds },
    bankRateDiscount: share(raw, 'hallstead.bankRateDiscount'),
    newspaper: {
      credibilityStart: nonNeg(raw, 'hallstead.newspaper.credibilityStart'),
      campaignCost: nonNeg(raw, 'hallstead.newspaper.campaignCost'),
      recovery: nonNeg(raw, 'hallstead.newspaper.recovery'),
      moodPerCampaign: nonNeg(raw, 'hallstead.newspaper.moodPerCampaign'),
      favorsPerCampaign: nonNeg(raw, 'hallstead.newspaper.favorsPerCampaign'),
      scratchedBelow: nonNeg(raw, 'hallstead.newspaper.scratchedBelow'),
      lostBelow: nonNeg(raw, 'hallstead.newspaper.lostBelow'),
    },
    lobby: {
      favorsPerCompetence: nonNeg(raw, 'hallstead.lobby.favorsPerCompetence'),
      government: Object.fromEntries(PARTY_IDS.map((p) => [p, nonNeg(raw, `hallstead.lobby.government.${p}`)])) as Record<PartyId, number>,
      maxFavors: posInt(raw, 'hallstead.lobby.maxFavors'),
      pushCost: posInt(raw, 'hallstead.lobby.pushCost'),
      pushStep: nonNeg(raw, 'hallstead.lobby.pushStep'),
      waterCost: posInt(raw, 'hallstead.lobby.waterCost'),
      waterStep: share(raw, 'hallstead.lobby.waterStep'),
      maxWater: share(raw, 'hallstead.lobby.maxWater'),
      decay: share(raw, 'hallstead.lobby.decay'),
      maxShift: share(raw, 'hallstead.lobby.maxShift'),
      bribe: {
        cost: nonNeg(raw, 'hallstead.lobby.bribe.cost'),
        favors: nonNeg(raw, 'hallstead.lobby.bribe.favors'),
        heat: nonNeg(raw, 'hallstead.lobby.bribe.heat'),
        heatDecay: share(raw, 'hallstead.lobby.bribe.heatDecay'),
      },
      donation: {
        min: nonNeg(raw, 'hallstead.lobby.donation.min'),
        perFavor: nonNeg(raw, 'hallstead.lobby.donation.perFavor'),
        winMultiplier: nonNeg(raw, 'hallstead.lobby.donation.winMultiplier'),
      },
      drunkChance: share(raw, 'hallstead.lobby.drunkChance'),
      genieSpread: share(raw, 'hallstead.lobby.genieSpread'),
      candidates,
    },
  };
  if (result.newspaper.credibilityStart > 100) throw new BalanceError('balance.yaml: "hallstead.newspaper.credibilityStart" darf nicht über 100 liegen');
  if (result.newspaper.lostBelow > result.newspaper.scratchedBelow) {
    throw new BalanceError('balance.yaml: "hallstead.newspaper.lostBelow" darf nicht über scratchedBelow liegen');
  }
  if (result.lobby.donation.perFavor <= 0) throw new BalanceError('balance.yaml: "hallstead.lobby.donation.perFavor" muss größer als 0 sein');
  return result;
}
