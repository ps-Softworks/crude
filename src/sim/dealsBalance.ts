// Zahlen der Deals im Adressbuch (0.4.20+31, content/balance.yaml Block „deals“).
// Regeln stehen in src/sim/deals.ts.

import { BalanceError } from './balance';

export interface DealsBalance {
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
    rail: {
      fixed: { rounds: liste(raw, `${p}.rail.fixed.rounds`), minimum: zahl(raw, `${p}.rail.fixed.minimum`), shortfall: zahl(raw, `${p}.rail.fixed.shortfall`) },
      quota: { sizes: liste(raw, `${p}.rail.quota.sizes`), discount: anteil(raw, `${p}.rail.quota.discount`), rounds: ganz(raw, `${p}.rail.quota.rounds`) },
    },
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
