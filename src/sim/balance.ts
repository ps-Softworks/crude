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

export interface Balance {
  start: { cash: number; year: number; rounds: number };
  map: { width: number; height: number; saltHill: { x: number; y: number } };
  geology: {
    zones: Zone[];
    reserves: { small: Range; gusher: Range };
  };
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
  };

  const { width, height, saltHill } = balance.map;
  if (saltHill.x < 0 || saltHill.x >= width || saltHill.y < 0 || saltHill.y >= height) {
    throw new BalanceError('balance.yaml: "map.saltHill" liegt außerhalb der Karte');
  }
  return balance;
}
