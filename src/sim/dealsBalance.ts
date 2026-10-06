// Zahlen der Deals im Adressbuch (0.4.20+31, content/balance.yaml Block „deals“).
// Regeln stehen in src/sim/deals.ts.

import { BalanceError } from './balance';
import { PRODUCTS, type Product } from './refineryBalance';

export interface DealsBalance {
  /** 0.4.20+42: Mengen der Kapitel-1-Deals × diesen Faktor je Kapitel (Index 0 = Kapitel 1). */
  chapterScale: number[];
  bank: {
    /** Zins nachverhandeln: Chance je Rating, Senkung je Erfolg, Untergrenze, Pause nach jedem Versuch. */
    rate: { chance: Record<'A' | 'B' | 'C' | 'D', number>; cut: number; floor: number; cooldown: number };
    /** Stundung: aufgeschobene Zinsen kommen mal (1 + surcharge) auf die Schuld, Pause danach. */
    defer: { surcharge: number; cooldown: number };
    /** Turm verpfänden: so viel mehr Bankrahmen, solange die Bank den Turm als Pfand hält. */
    pledge: { limitBonus: number };
    /** Sonderkredit am Telefon: Beträge, Zinsnachlass, Untergrenze, Frist (Runden), Strafzins danach. */
    offer: { sizes: number[]; discount: number; floor: number; rounds: number; penalty: number };
  };
  /** 0.4.20+35 Lieferverträge der Raffinerie: Produkt, Mengen je Runde, Laufzeit, Aufschlag auf den heutigen Preis, Strafe je fehlendem Barrel. */
  supply: Record<'marine' | 'lubricant' | 'kerosene' | 'gasoline', { product: Product; sizes: number[]; rounds: number; premium: number; shortfall: number }>;
  /** 0.4.20+36 Feuerversicherung: Laufzeiten, Prämie = base + share × Wert, zahlt cover des Schadens, Prämie nach Schaden × (1 + claimRaise). */
  insurance: { rounds: number[]; base: number; share: number; cover: number; claimRaise: number };
  /** 0.4.20+36 Arbeiter: Lohnerhöhung (je fördernder Quelle, Runden, Ruf) und Streik-Anruf (Einigung je Quelle, Streikbrecher, Förderausfall). */
  workers: {
    raise: { perWell: number; rounds: number; reputation: number };
    strike: { dealPerWell: number; dealReputation: number; breakerCost: number; breakerReputation: number; loss: number };
  };
  /** 0.4.20+36 Presse: Anzeigen (Kosten, Ruf, Rückschlag-Chance, Pause) und Interview (Chance, Ruf, Pause). */
  press: { ads: { cost: number; reputation: number; backlash: number; cooldown: number }; interview: { chance: number; reputation: number; cooldown: number } };
  /** 0.4.20+37 Ausrüster: Sammelbestellung (Anzahl Türme, Rabatt, Lieferzeit). */
  outfitter: { rigs: number[]; discount: number; delivery: number };
  /** 0.4.20+37 Lohnbohrer: so viele Mietürme, Runden, Rabatt auf die Miete. */
  crew: { rigs: number; rounds: number; discount: number };
  /** 0.4.20+37 Motorwagen-Werke: Beteiligung (Kosten, Einnahmen je Runde ab Kapitel 3, Chance zu scheitern). */
  motor: { stake: { cost: number; income: number; fail: number } };
  /** 0.4.20+37 Abgeordneter: Spende, Gefallen, Runden bis zur Gegenforderung, Forderung, Ansehensverlust beim Ablehnen. */
  deputy: { donation: number; favors: number; rounds: number; demand: number; refuse: number };
  /** 0.4.20+34 Telefon: Chance je Runde (ab Kapitel 2), dass jemand anruft. */
  phone: { chance: number };
  rail: {
    /** Festtarif: Laufzeiten (Runden), Mindestmenge je Runde per Bahn, Strafe je fehlendem Barrel. */
    fixed: { rounds: number[]; minimum: number; shortfall: number };
    /** Frachtkontingent: Mengen, Rabatt auf den heutigen Tarif, gültig so viele Runden. */
    quota: { sizes: number[]; discount: number; rounds: number };
  };
  crane: {
    /** Vorschuss: Mengen, Abschlag auf Cranes Preis, Lieferfrist (Runden), Strafe auf den Rest. */
    advance: { sizes: number[]; discount: number; rounds: number; penalty: number };
  };
  trader: {
    /** Großabnahme: so viel nimmt der Händler in dieser Runde zusätzlich, Pause danach. */
    bulk: { extra: number; cooldown: number };
  };
  rig: {
    /** Turm verleihen: Laufzeiten, Miete je Runde, Schaden bei Rückgabe (Chance, Reparatur). */
    lend: { rounds: number[]; rent: number; damage: number; repair: number };
  };
  royalty: {
    /** Förderzins nachverhandeln: Annahme-Chance (+ Ruf), Senkung, Untergrenze, Preis = Senkung × Rate × Runden × Preis × Anteil. */
    chance: number;
    cut: number;
    floor: number;
    horizon: number;
    priceShare: number;
    cooldown: number;
  };
  interview: {
    /** Gute Presse mit dieser Chance (weniger nach Gerüchten), Ruf ±shift, Pause danach. */
    chance: number;
    rumourPenalty: number;
    shift: number;
    cooldown: number;
  };
  theft: {
    /** Öldiebe (Kapitel 1): Chance je Runde ab so viel Öl im Tank, Anteil, der verschwindet. */
    chance: number;
    minStock: number;
    loss: number;
  };
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const value = wert(obj, path);
  if (typeof value !== 'number' || Number.isNaN(value)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  if (value < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return value;
}

function anteil(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return value;
}

function ganz(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (!Number.isInteger(value) || value < 1) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 1 sein`);
  return value;
}

function liste(obj: unknown, path: string): number[] {
  const value = wert(obj, path);
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'number' && Number.isInteger(v) && v > 0)) {
    throw new BalanceError(`balance.yaml: "${path}" muss eine Liste ganzer Zahlen über 0 sein`);
  }
  return value as number[];
}

function vertrag(raw: unknown, q: string) {
  const product = wert(raw, `${q}.product`);
  if (typeof product !== 'string' || !(PRODUCTS as readonly string[]).includes(product)) throw new BalanceError(`balance.yaml: "${q}.product" muss ${PRODUCTS.join(', ')} sein`);
  return { product: product as Product, sizes: liste(raw, `${q}.sizes`), rounds: ganz(raw, `${q}.rounds`), premium: zahl(raw, `${q}.premium`), shortfall: zahl(raw, `${q}.shortfall`) };
}

export function parseDealsBalance(raw: unknown): DealsBalance {
  const p = 'deals';
  if (wert(raw, p) === undefined) throw new BalanceError('balance.yaml: Block "deals" fehlt');
  return {
    bank: {
      rate: {
        chance: { A: anteil(raw, `${p}.bank.rate.chance.A`), B: anteil(raw, `${p}.bank.rate.chance.B`), C: anteil(raw, `${p}.bank.rate.chance.C`), D: anteil(raw, `${p}.bank.rate.chance.D`) },
        cut: anteil(raw, `${p}.bank.rate.cut`),
        floor: anteil(raw, `${p}.bank.rate.floor`),
        cooldown: ganz(raw, `${p}.bank.rate.cooldown`),
      },
      defer: { surcharge: zahl(raw, `${p}.bank.defer.surcharge`), cooldown: ganz(raw, `${p}.bank.defer.cooldown`) },
      pledge: { limitBonus: zahl(raw, `${p}.bank.pledge.limitBonus`) },
      offer: {
        sizes: liste(raw, `${p}.bank.offer.sizes`),
        discount: anteil(raw, `${p}.bank.offer.discount`),
        floor: anteil(raw, `${p}.bank.offer.floor`),
        rounds: ganz(raw, `${p}.bank.offer.rounds`),
        penalty: anteil(raw, `${p}.bank.offer.penalty`),
      },
    },
    phone: { chance: anteil(raw, `${p}.phone.chance`) },
    insurance: {
      rounds: liste(raw, `${p}.insurance.rounds`),
      base: zahl(raw, `${p}.insurance.base`),
      share: anteil(raw, `${p}.insurance.share`),
      cover: anteil(raw, `${p}.insurance.cover`),
      claimRaise: zahl(raw, `${p}.insurance.claimRaise`),
    },
    workers: {
      raise: { perWell: zahl(raw, `${p}.workers.raise.perWell`), rounds: ganz(raw, `${p}.workers.raise.rounds`), reputation: zahl(raw, `${p}.workers.raise.reputation`) },
      strike: {
        dealPerWell: zahl(raw, `${p}.workers.strike.dealPerWell`),
        dealReputation: zahl(raw, `${p}.workers.strike.dealReputation`),
        breakerCost: zahl(raw, `${p}.workers.strike.breakerCost`),
        breakerReputation: zahl(raw, `${p}.workers.strike.breakerReputation`),
        loss: anteil(raw, `${p}.workers.strike.loss`),
      },
    },
    press: {
      ads: { cost: zahl(raw, `${p}.press.ads.cost`), reputation: zahl(raw, `${p}.press.ads.reputation`), backlash: anteil(raw, `${p}.press.ads.backlash`), cooldown: ganz(raw, `${p}.press.ads.cooldown`) },
      interview: { chance: anteil(raw, `${p}.press.interview.chance`), reputation: zahl(raw, `${p}.press.interview.reputation`), cooldown: ganz(raw, `${p}.press.interview.cooldown`) },
    },
    supply: {
      marine: vertrag(raw, `${p}.supply.marine`),
      lubricant: vertrag(raw, `${p}.supply.lubricant`),
      kerosene: vertrag(raw, `${p}.supply.kerosene`),
      gasoline: vertrag(raw, `${p}.supply.gasoline`),
    },
    outfitter: { rigs: liste(raw, `${p}.outfitter.rigs`), discount: anteil(raw, `${p}.outfitter.discount`), delivery: ganz(raw, `${p}.outfitter.delivery`) },
    crew: { rigs: ganz(raw, `${p}.crew.rigs`), rounds: ganz(raw, `${p}.crew.rounds`), discount: anteil(raw, `${p}.crew.discount`) },
    motor: { stake: { cost: zahl(raw, `${p}.motor.stake.cost`), income: zahl(raw, `${p}.motor.stake.income`), fail: anteil(raw, `${p}.motor.stake.fail`) } },
    deputy: {
      donation: zahl(raw, `${p}.deputy.donation`),
      favors: zahl(raw, `${p}.deputy.favors`),
      rounds: ganz(raw, `${p}.deputy.rounds`),
      demand: zahl(raw, `${p}.deputy.demand`),
      refuse: zahl(raw, `${p}.deputy.refuse`),
    },
    rail: {
      fixed: { rounds: liste(raw, `${p}.rail.fixed.rounds`), minimum: zahl(raw, `${p}.rail.fixed.minimum`), shortfall: zahl(raw, `${p}.rail.fixed.shortfall`) },
      quota: { sizes: liste(raw, `${p}.rail.quota.sizes`), discount: anteil(raw, `${p}.rail.quota.discount`), rounds: ganz(raw, `${p}.rail.quota.rounds`) },
    },
    chapterScale: liste(raw, `${p}.chapterScale`),
    crane: {
      advance: {
        sizes: liste(raw, `${p}.crane.advance.sizes`),
        discount: anteil(raw, `${p}.crane.advance.discount`),
        rounds: ganz(raw, `${p}.crane.advance.rounds`),
        penalty: zahl(raw, `${p}.crane.advance.penalty`),
      },
    },
    trader: { bulk: { extra: zahl(raw, `${p}.trader.bulk.extra`), cooldown: ganz(raw, `${p}.trader.bulk.cooldown`) } },
    rig: {
      lend: {
        rounds: liste(raw, `${p}.rig.lend.rounds`),
        rent: zahl(raw, `${p}.rig.lend.rent`),
        damage: anteil(raw, `${p}.rig.lend.damage`),
        repair: zahl(raw, `${p}.rig.lend.repair`),
      },
    },
    royalty: {
      chance: anteil(raw, `${p}.royalty.chance`),
      cut: anteil(raw, `${p}.royalty.cut`),
      floor: anteil(raw, `${p}.royalty.floor`),
      horizon: ganz(raw, `${p}.royalty.horizon`),
      priceShare: zahl(raw, `${p}.royalty.priceShare`),
      cooldown: ganz(raw, `${p}.royalty.cooldown`),
    },
    interview: {
      chance: anteil(raw, `${p}.interview.chance`),
      rumourPenalty: anteil(raw, `${p}.interview.rumourPenalty`),
      shift: zahl(raw, `${p}.interview.shift`),
      cooldown: ganz(raw, `${p}.interview.cooldown`),
    },
    theft: { chance: anteil(raw, `${p}.theft.chance`), minStock: zahl(raw, `${p}.theft.minStock`), loss: anteil(raw, `${p}.theft.loss`) },
  };
}
