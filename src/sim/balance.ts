// Spielzahlen aus content/balance.yaml. Die Simulation bekommt ein fertiges
// Objekt; parseBalance prüft es und meldet verständliche Fehler.

export type GeologyType = 'dry' | 'small' | 'gusher';

export interface Zone {
  name: string;
  maxDistance: number;
  dry: number;
  small: number;
  gusher: number;
}

export interface Range {
  min: number;
  max: number;
}

export const LANDOWNER_TYPES = ['neutral', 'gierig', 'verschuldet', 'misstrauisch', 'fromm'] as const;
export type LandownerType = (typeof LANDOWNER_TYPES)[number];

/** Lage einer Parzelle zum nächsten bekannten Fund. */
export interface LeaseLocation {
  name: string;
  label: string;
  /** Höchster Abstand in Feldern (auch diagonal), für den diese Lage gilt. */
  maxDistance: number;
  bonus: number;
  royalty: number;
}

export interface Landowner {
  name: LandownerType;
  label: string;
  weight: number;
  bonusFactor: number;
  royaltyAdd: number;
}

export interface LeaseBalance {
  termRounds: number;
  delayRental: number;
  royaltyMin: number;
  royaltyMax: number;
  bonusRounding: number;
  locations: LeaseLocation[];
  landowners: Landowner[];
  option: { feeShare: number; termRounds: number };
  startOptions: { count: number; termRounds: number };
}

export interface Balance {
  start: { cash: number; year: number; rounds: number };
  map: { width: number; height: number; saltHill: { x: number; y: number } };
  geology: {
    zones: Zone[];
    reserves: { small: Range; gusher: Range };
  };
  lease: LeaseBalance;
}

export class BalanceError extends Error {}

function num(obj: unknown, path: string): number {
  const value = path.split('.').reduce<unknown>(
    (o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined),
    obj,
  );
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  }
  return value;
}

function range(obj: unknown, path: string): Range {
  const r = { min: num(obj, `${path}.min`), max: num(obj, `${path}.max`) };
  if (r.min > r.max) throw new BalanceError(`balance.yaml: "${path}" hat min > max`);
  return r;
}

function list(obj: unknown, path: string): unknown[] {
  const value = path.split('.').reduce<unknown>(
    (o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined),
    obj,
  );
  if (!Array.isArray(value) || value.length === 0) {
    throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist leer`);
  }
  return value;
}

function text(obj: unknown, key: string, path: string): string {
  const value = (obj as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BalanceError(`balance.yaml: "${path}.${key}" fehlt oder ist kein Text`);
  }
  return value;
}

function positiveInt(obj: unknown, path: string): number {
  const value = num(obj, path);
  if (!Number.isInteger(value) || value < 1) {
    throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 1 sein`);
  }
  return value;
}

function share(obj: unknown, path: string): number {
  const value = num(obj, path);
  if (value < 0 || value > 1) {
    throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  }
  return value;
}

function parseLease(raw: unknown): LeaseBalance {
  const royaltyMin = share(raw, 'lease.royaltyMin');
  const royaltyMax = share(raw, 'lease.royaltyMax');
  if (royaltyMin > royaltyMax) {
    throw new BalanceError('balance.yaml: "lease.royaltyMin" ist größer als "lease.royaltyMax"');
  }
  const delayRental = num(raw, 'lease.delayRental');
  if (delayRental < 0) throw new BalanceError('balance.yaml: "lease.delayRental" darf nicht negativ sein');

  const locations: LeaseLocation[] = list(raw, 'lease.locations').map((l, i) => {
    const path = `lease.locations.${i}`;
    const location: LeaseLocation = {
      name: text(l, 'name', path),
      label: text(l, 'label', path),
      maxDistance: num(raw, `${path}.maxDistance`),
      bonus: num(raw, `${path}.bonus`),
      royalty: share(raw, `${path}.royalty`),
    };
    if (location.bonus < 0) {
      throw new BalanceError(`balance.yaml: Lage "${location.name}" hat einen negativen Bonus`);
    }
    return location;
  });
  for (let i = 1; i < locations.length; i++) {
    if (locations[i].maxDistance <= locations[i - 1].maxDistance) {
      throw new BalanceError('balance.yaml: Pacht-Lagen müssen nach maxDistance aufsteigend sortiert sein');
    }
  }

  const landowners: Landowner[] = list(raw, 'lease.landowners').map((o, i) => {
    const path = `lease.landowners.${i}`;
    const name = text(o, 'name', path);
    if (!(LANDOWNER_TYPES as readonly string[]).includes(name)) {
      throw new BalanceError(
        `balance.yaml: unbekannter Landbesitzer "${name}" (erlaubt: ${LANDOWNER_TYPES.join(', ')})`,
      );
    }
    const owner: Landowner = {
      name: name as LandownerType,
      label: text(o, 'label', path),
      weight: num(raw, `${path}.weight`),
      bonusFactor: num(raw, `${path}.bonusFactor`),
      royaltyAdd: num(raw, `${path}.royaltyAdd`),
    };
    if (owner.weight <= 0) {
      throw new BalanceError(`balance.yaml: Landbesitzer "${name}" braucht ein Gewicht größer als 0`);
    }
    if (owner.bonusFactor <= 0) {
      throw new BalanceError(`balance.yaml: Landbesitzer "${name}" braucht einen bonusFactor größer als 0`);
    }
    return owner;
  });
  for (const type of LANDOWNER_TYPES) {
    const count = landowners.filter((o) => o.name === type).length;
    if (count !== 1) {
      throw new BalanceError(
        `balance.yaml: Landbesitzer "${type}" muss genau einmal vorkommen (gefunden: ${count})`,
      );
    }
  }

  return {
    termRounds: positiveInt(raw, 'lease.termRounds'),
    delayRental,
    royaltyMin,
    royaltyMax,
    bonusRounding: positiveInt(raw, 'lease.bonusRounding'),
    locations,
    landowners,
    option: {
      feeShare: share(raw, 'lease.option.feeShare'),
      termRounds: positiveInt(raw, 'lease.option.termRounds'),
    },
    startOptions: {
      count: num(raw, 'lease.startOptions.count'),
      termRounds: positiveInt(raw, 'lease.startOptions.termRounds'),
    },
  };
}

export function parseBalance(raw: unknown): Balance {
  const zonesRaw = (raw as { geology?: { zones?: unknown } })?.geology?.zones;
  if (!Array.isArray(zonesRaw) || zonesRaw.length === 0) {
    throw new BalanceError('balance.yaml: "geology.zones" fehlt oder ist leer');
  }
  const zones: Zone[] = zonesRaw.map((z, i) => {
    const zone: Zone = {
      name: String((z as { name?: unknown }).name ?? `Zone ${i + 1}`),
      maxDistance: num(z, 'maxDistance'),
      dry: num(z, 'dry'),
      small: num(z, 'small'),
      gusher: num(z, 'gusher'),
    };
    const sum = zone.dry + zone.small + zone.gusher;
    if (Math.abs(sum - 1) > 1e-6) {
      throw new BalanceError(
        `balance.yaml: Zone "${zone.name}" – dry + small + gusher ergibt ${sum.toFixed(3)} statt 1`,
      );
    }
    return zone;
  });
  for (let i = 1; i < zones.length; i++) {
    if (zones[i].maxDistance <= zones[i - 1].maxDistance) {
      throw new BalanceError('balance.yaml: Zonen müssen nach maxDistance aufsteigend sortiert sein');
    }
  }

  const balance: Balance = {
    start: {
      cash: num(raw, 'start.cash'),
      year: num(raw, 'start.year'),
      rounds: num(raw, 'start.rounds'),
    },
    map: {
      width: num(raw, 'map.width'),
      height: num(raw, 'map.height'),
      saltHill: { x: num(raw, 'map.saltHill.x'), y: num(raw, 'map.saltHill.y') },
    },
    geology: {
      zones,
      reserves: {
        small: range(raw, 'geology.reserves.small'),
        gusher: range(raw, 'geology.reserves.gusher'),
      },
    },
    lease: parseLease(raw),
  };

  const { width, height, saltHill } = balance.map;
  if (saltHill.x < 0 || saltHill.x >= width || saltHill.y < 0 || saltHill.y >= height) {
    throw new BalanceError('balance.yaml: "map.saltHill" liegt außerhalb der Karte');
  }
  const { count } = balance.lease.startOptions;
  if (!Number.isInteger(count) || count < 0 || count > width * height - 1) {
    throw new BalanceError('balance.yaml: "lease.startOptions.count" muss eine ganze Zahl ab 0 sein und auf die Karte passen');
  }
  return balance;
}
