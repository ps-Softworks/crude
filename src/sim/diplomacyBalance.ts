// Spielzahlen der Rivalen-Diplomatie (4.10): Block „diplomacy“ in content/balance.yaml.
// Eigene Datei, damit das Modul allein steht – balance.ts ruft nur parseDiplomacy auf
// (4.10 Andockpunkt). Die Prüfungen sind dieselben wie dort: fehlt etwas oder passt
// es nicht, gibt es einen BalanceError mit dem Pfad in balance.yaml.

import { BalanceError, type RivalPersonality } from './balance';

/** Rivalen der Diplomatie (GDD §9.2, Kapitel 2). */
export const DIPLO_RIVALS = ['margaret', 'pruett', 'bullard', 'thorne', 'delgado'] as const;
export type DiploRival = (typeof DIPLO_RIVALS)[number];

/** Arten von Absprachen (GDD §9.4 Kooperation). */
export const PACT_KINDS = ['price', 'territory', 'supply', 'cross'] as const;
export type PactKind = (typeof PACT_KINDS)[number];

export interface DiploRivalBalance {
  /** Fehlt bei Bullard: dessen Persönlichkeit steht unter rivals.bullard. */
  personality?: RivalPersonality;
  kinds: PactKind[];
}

export interface DiplomacyBalance {
  unlockChapter: number;
  relations: {
    trustDrift: number;
    grudgeDecay: number;
    respectStart: number;
    betrayalTrust: number;
    betrayalGrudge: number;
    betrayalRespect: number;
    revengeGrudge: number;
    revengeChance: number;
    revengeRounds: number;
    revengePrice: number;
    revengeLeaseCost: number;
    revengeRail: number;
    revengeRelief: number;
    reconcileGrudge: number;
  };
  rivals: Record<DiploRival, DiploRivalBalance>;
  carryOver: {
    bullardPactTrust: number;
    bullardFeudGrudge: number;
    craneLoyalTrust: number;
    delgadoMemberTrust: number;
    thorneContractTrust: number;
    thorneRefusedGrudge: number;
  };
  succession: {
    rounds: number;
    boardSeats: number;
    startShare: number;
    creditDrift: number;
    noise: number;
    backCost: number;
    backShift: number;
    backAppointments: number;
    visitShift: number;
    farewellTrust: number;
    winnerTrust: number;
    loserGrudge: number;
    doubleGameTrust: number;
    congratsTrust: number;
    partnerTrust: number;
    margaretPremium: number;
    pruettCut: number;
    breakupPremium: number;
    breakup: { law: number; volksbund: number; mood: number; decay: number; push: number; pushCost: number; maxWithoutLaw: number };
  };
  pacts: {
    appointments: number;
    acceptThreshold: number;
    respectWeight: number;
    loyaltyWeight: number;
    acceptTrust: number;
    declineGrudge: number;
    rounds: number;
    pricePremium: number;
    territoryLeaseCost: number;
    supplyPremium: number;
    supplyBullardGrudge: number;
    crossCost: number;
    crossShield: number;
    cartelHeat: number;
    cartelMood: number;
    breakChance: number;
    breakRounds: number;
    offerChance: number;
    offerMaxGrudge: number;
    offerMargin: number;
    offerRounds: number;
  };
  takeovers: {
    appointments: number;
    pricePerWell: number;
    premium: number;
    barrelsPerWell: number;
    costPerBarrel: number;
    crisisCredit: number;
    pruettBuyChance: number;
    distressPremium: number;
    distressMin: number;
    crisisHelpTrust: number;
    crisisHelpGrudge: number;
  };
  guild: {
    foundDelay: number;
    startMembers: number;
    fullMembers: number;
    growChance: number;
    dues: number;
    premium: number;
    leaveTrust: number;
    tooBigValue: number;
    fightGrudge: number;
    outsiderLeaseCost: number;
  };
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(raw: unknown, path: string): number {
  const v = get(raw, path);
  if (typeof v !== 'number' || Number.isNaN(v)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  return v;
}

function abNull(raw: unknown, path: string): number {
  const v = zahl(raw, path);
  if (v < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return v;
}

function anteil(raw: unknown, path: string): number {
  const v = zahl(raw, path);
  if (v < 0 || v > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return v;
}

function ganz(raw: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const v = zahl(raw, path);
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ${max === Number.MAX_SAFE_INTEGER ? `ab ${min}` : `zwischen ${min} und ${max}`} sein`);
  }
  return v;
}

/** Alle Zahlenfelder eines Blocks auf einmal: Schlüssel → Prüfung. */
function block<T extends Record<string, number>>(raw: unknown, p: string, felder: Record<keyof T, (raw: unknown, path: string) => number>): T {
  const out = {} as Record<string, number>;
  for (const key of Object.keys(felder)) out[key] = felder[key as keyof T](raw, `${p}.${key}`);
  return out as T;
}

const ab1 = (raw: unknown, path: string) => ganz(raw, path, 1);
const ab0 = (raw: unknown, path: string) => ganz(raw, path, 0);
const punkte = (raw: unknown, path: string) => {
  const v = abNull(raw, path);
  if (v > 100) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 100 liegen`);
  return v;
};

function persoenlichkeit(raw: unknown, p: string): RivalPersonality {
  const t = (k: string) => ganz(raw, `${p}.personality.${k}`, 1, 5);
  return { risk: t('risk'), aggression: t('aggression'), loyalty: t('loyalty'), grudge: t('grudge'), patience: t('patience') };
}

/** Liest den Block „diplomacy“ aus balance.yaml. */
export function parseDiplomacy(raw: unknown): DiplomacyBalance {
  const d = 'diplomacy';
  if (!get(raw, d) || typeof get(raw, d) !== 'object') throw new BalanceError('balance.yaml: Block "diplomacy" fehlt');

  const rivals = {} as Record<DiploRival, DiploRivalBalance>;
  for (const id of DIPLO_RIVALS) {
    const p = `${d}.rivals.${id}`;
    const kinds = get(raw, `${p}.kinds`);
    if (!Array.isArray(kinds) || !kinds.every((k) => (PACT_KINDS as readonly unknown[]).includes(k))) {
      throw new BalanceError(`balance.yaml: "${p}.kinds" muss eine Liste aus ${PACT_KINDS.join(', ')} sein`);
    }
    rivals[id] = {
      kinds: kinds as PactKind[],
      ...(id === 'bullard' ? {} : { personality: persoenlichkeit(raw, p) }),
    };
  }

  const succession = {
    ...block<Omit<DiplomacyBalance['succession'], 'breakup'>>(raw, `${d}.succession`, {
      rounds: ab1,
      boardSeats: ab1,
      startShare: anteil,
      creditDrift: anteil,
      noise: anteil,
      backCost: abNull,
      backShift: anteil,
      backAppointments: ab0,
      visitShift: anteil,
      farewellTrust: punkte,
      winnerTrust: punkte,
      loserGrudge: punkte,
      doubleGameTrust: punkte,
      congratsTrust: punkte,
      partnerTrust: punkte,
      margaretPremium: abNull,
      pruettCut: abNull,
      breakupPremium: abNull,
    }),
    breakup: block<DiplomacyBalance['succession']['breakup']>(raw, `${d}.succession.breakup`, {
      law: anteil,
      volksbund: anteil,
      mood: anteil,
      decay: anteil,
      push: anteil,
      pushCost: abNull,
      maxWithoutLaw: anteil,
    }),
  };

  const out: DiplomacyBalance = {
    unlockChapter: ab1(raw, `${d}.unlockChapter`),
    relations: block<DiplomacyBalance['relations']>(raw, `${d}.relations`, {
      trustDrift: punkte,
      grudgeDecay: punkte,
      respectStart: punkte,
      betrayalTrust: punkte,
      betrayalGrudge: punkte,
      betrayalRespect: punkte,
      revengeGrudge: punkte,
      revengeChance: anteil,
      revengeRounds: ab1,
      revengePrice: abNull,
      revengeLeaseCost: anteil,
      revengeRail: abNull,
      revengeRelief: punkte,
      reconcileGrudge: punkte,
    }),
    rivals,
    carryOver: block<DiplomacyBalance['carryOver']>(raw, `${d}.carryOver`, {
      bullardPactTrust: punkte,
      bullardFeudGrudge: punkte,
      craneLoyalTrust: punkte,
      delgadoMemberTrust: punkte,
      thorneContractTrust: punkte,
      thorneRefusedGrudge: punkte,
    }),
    succession,
    pacts: block<DiplomacyBalance['pacts']>(raw, `${d}.pacts`, {
      appointments: ab0,
      acceptThreshold: zahl,
      respectWeight: abNull,
      loyaltyWeight: abNull,
      acceptTrust: punkte,
      declineGrudge: punkte,
      rounds: ab1,
      pricePremium: abNull,
      territoryLeaseCost: anteil,
      supplyPremium: abNull,
      supplyBullardGrudge: punkte,
      crossCost: abNull,
      crossShield: anteil,
      cartelHeat: (r, p) => ganz(r, p, 0, 5),
      cartelMood: abNull,
      breakChance: anteil,
      breakRounds: ab1,
      offerChance: anteil,
      offerMaxGrudge: punkte,
      offerMargin: abNull,
      offerRounds: ab1,
    }),
    takeovers: block<DiplomacyBalance['takeovers']>(raw, `${d}.takeovers`, {
      appointments: ab0,
      pricePerWell: abNull,
      premium: abNull,
      barrelsPerWell: abNull,
      costPerBarrel: abNull,
      crisisCredit: punkte,
      pruettBuyChance: anteil,
      distressPremium: abNull,
      distressMin: abNull,
      crisisHelpTrust: punkte,
      crisisHelpGrudge: punkte,
    }),
    guild: block<DiplomacyBalance['guild']>(raw, `${d}.guild`, {
      foundDelay: ab0,
      startMembers: ab1,
      fullMembers: ab1,
      growChance: anteil,
      dues: abNull,
      premium: abNull,
      leaveTrust: punkte,
      tooBigValue: abNull,
      fightGrudge: punkte,
      outsiderLeaseCost: anteil,
    }),
  };
  if (out.succession.startShare <= 0 || out.succession.startShare >= 1) {
    throw new BalanceError('balance.yaml: "diplomacy.succession.startShare" muss zwischen 0 und 1 liegen (ohne die Grenzen)');
  }
  return out;
}
