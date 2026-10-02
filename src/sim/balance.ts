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

/** Die beiden verdeckten Werte eines Geologen (GDD §5). */
export interface Geologist {
  /** Genauigkeit 1–5: 1 = sehr breite, 5 = sehr schmale Bandbreite. */
  accuracy: number;
  /** Verzerrung in Prozentpunkten: verschiebt jede Prognose nach oben oder unten. */
  bias: number;
}

export interface ForecastBalance {
  /** Breiteste Bandbreite in Prozentpunkten (Genauigkeit 1). */
  widthMax: number;
  /** Schmalste Bandbreite in Prozentpunkten (Genauigkeit 5). */
  widthMin: number;
  /** Bandbreiten und Grenzen werden auf dieses Raster gerundet (z. B. 5 %). */
  rounding: number;
  geologist: Geologist;
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

/** Eine Bohrstufe: Stufe 1 = Zieltiefe, jede weitere = "tiefer bohren". */
export interface DrillStage {
  /** Tiefe in Metern. */
  depth: number;
  /** Kosten der Stufe in $. */
  cost: number;
  /** Dauer in Runden. */
  rounds: number;
  /** Anteil der nicht trockenen Parzellen, deren Öl in dieser Stufe liegt. */
  oilShare: number;
  /** Unfall-Chance beim Abschluss der Stufe. */
  accident: number;
  /** Chance, dass das Werkzeug klemmt. */
  stuck: number;
}

export interface DrillingBalance {
  rigs: number;
  accidentCost: number;
  fishingCost: number;
  stages: DrillStage[];
}

/** Förderung (GDD §5): Ratengang, gemeinsames Feld, Druckverlust durch Nachbarn. */
export interface ProductionBalance {
  /**
   * Anfangsrate einer Quelle als Anteil der Reserve ihrer Parzelle, je Art von
   * Fund.
   */
  initialRateShare: { small: number; gusher: number };
  /** Rückgang der Rate je Quartal, z. B. 0.12 = 12 % (GDD: 8–15 %). */
  decline: number;
  /** So viele Quellen im Feld fördern noch ohne Druckverlust. */
  freeWells: number;
  /** Druckverlust, den jede Quelle über freeWells hinaus allen anderen macht. */
  pressureLossPerWell: number;
  /** Tiefster Druckfaktor: darunter geht er nicht, egal wie viele Quellen bohren. */
  pressureMin: number;
  /** Ausbeuteverlust des Feldes je Quelle über freeWells (Höchststand). */
  recoveryLossPerWell: number;
  /** Höchster Ausbeuteverlust des Feldes (Überförderung). */
  recoveryLossMax: number;
}

export type TransportMode = 'wagon' | 'rail';
export const TRANSPORT_MODES: readonly TransportMode[] = ['wagon', 'rail'];

export interface TransportModeBalance {
  label: string;
  /** Fracht in $ je Barrel (bei der Bahn: Starttarif). */
  costPerBarrel: number;
  /** Höchstens so viele Barrel je Runde. */
  capacity: number;
}

/** Transport (GDD §6): Fuhrwerk oder Thornes Bahn. */
export interface TransportBalance {
  wagon: TransportModeBalance;
  rail: TransportModeBalance;
  thorne: {
    /** Chance je Runde mit Bahnfracht, dass Thorne den Tarif erhöht. */
    hikeChance: number;
    /** Erhöhung in $ je Barrel. */
    hikeStep: number;
    /** Höchster Bahntarif in $ je Barrel. */
    maxTariff: number;
  };
}

export interface MarketBalance {
  basePrice: number;
  demand: number;
  elasticity: number;
  shock: number;
  regionalDiscount: number;
  priceMin: number;
  priceMax: number;
  neighbours: { startWells: number; newWellsPerRound: number; ratePerWell: number };
  newsThreshold: number;
}

export interface Balance {
  start: { cash: number; year: number; rounds: number };
  map: { width: number; height: number; saltHill: { x: number; y: number } };
  geology: {
    zones: Zone[];
    reserves: { small: Range; gusher: Range };
  };
  lease: LeaseBalance;
  forecast: ForecastBalance;
  drilling: DrillingBalance;
  production: ProductionBalance;
  market: MarketBalance;
  transport: TransportBalance;
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

function integerInRange(obj: unknown, path: string, min: number, max: number): number {
  const value = num(obj, path);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl zwischen ${min} und ${max} sein`);
  }
  return value;
}

function parseForecast(raw: unknown): ForecastBalance {
  const block = (raw as { forecast?: unknown })?.forecast;
  if (!block || typeof block !== 'object') {
    throw new BalanceError('balance.yaml: Block "forecast" fehlt');
  }
  const widthMin = num(raw, 'forecast.widthMin');
  const widthMax = num(raw, 'forecast.widthMax');
  if (widthMin <= 0) {
    throw new BalanceError('balance.yaml: "forecast.widthMin" muss größer als 0 sein');
  }
  if (widthMin > widthMax) {
    throw new BalanceError('balance.yaml: "forecast.widthMin" ist größer als "forecast.widthMax"');
  }
  if (widthMax > 100) {
    throw new BalanceError('balance.yaml: "forecast.widthMax" darf nicht größer als 100 sein');
  }
  const bias = num(raw, 'forecast.geologist.bias');
  if (bias < -15 || bias > 15) {
    throw new BalanceError('balance.yaml: "forecast.geologist.bias" muss zwischen -15 und +15 liegen');
  }
  return {
    widthMin,
    widthMax,
    rounding: positiveInt(raw, 'forecast.rounding'),
    geologist: {
      accuracy: integerInRange(raw, 'forecast.geologist.accuracy', 1, 5),
      bias,
    },
  };
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

function parseDrilling(raw: unknown): DrillingBalance {
  const stages: DrillStage[] = list(raw, 'drilling.stages').map((_, i) => {
    const path = `drilling.stages.${i}`;
    const stage: DrillStage = {
      depth: num(raw, `${path}.depth`),
      cost: num(raw, `${path}.cost`),
      rounds: positiveInt(raw, `${path}.rounds`),
      oilShare: share(raw, `${path}.oilShare`),
      accident: share(raw, `${path}.accident`),
      stuck: share(raw, `${path}.stuck`),
    };
    if (stage.accident + stage.stuck > 1) {
      throw new BalanceError(`balance.yaml: Bohrstufe ${i + 1} – accident + stuck ist größer als 1`);
    }
    return stage;
  });
  const sum = stages.reduce((s, st) => s + st.oilShare, 0);
  if (Math.abs(sum - 1) > 1e-6) {
    throw new BalanceError(`balance.yaml: Summe von "drilling.stages.*.oilShare" ergibt ${sum.toFixed(3)} statt 1`);
  }
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].cost <= stages[i - 1].cost) {
      throw new BalanceError('balance.yaml: Bohrkosten müssen mit jeder Stufe steigen');
    }
    if (stages[i].accident <= stages[i - 1].accident) {
      throw new BalanceError('balance.yaml: Unfall-Chance muss mit jeder Stufe steigen');
    }
  }
  const accidentCost = num(raw, 'drilling.accidentCost');
  const fishingCost = num(raw, 'drilling.fishingCost');
  if (accidentCost < 0 || fishingCost < 0) {
    throw new BalanceError('balance.yaml: Unfall- und Bergungskosten dürfen nicht negativ sein');
  }
  return { rigs: positiveInt(raw, 'drilling.rigs'), accidentCost, fishingCost, stages };
}

function parseProduction(raw: unknown): ProductionBalance {
  const block = (raw as { production?: unknown })?.production;
  if (!block || typeof block !== 'object') {
    throw new BalanceError('balance.yaml: Block "production" fehlt');
  }
  const initialRateShare = {
    small: share(raw, 'production.initialRateShare.small'),
    gusher: share(raw, 'production.initialRateShare.gusher'),
  };
  const decline = share(raw, 'production.decline');
  const freeWells = positiveInt(raw, 'production.freeWells');
  const pressureLossPerWell = share(raw, 'production.pressureLossPerWell');
  const pressureMin = num(raw, 'production.pressureMin');
  const recoveryLossPerWell = share(raw, 'production.recoveryLossPerWell');
  const recoveryLossMax = share(raw, 'production.recoveryLossMax');
  if (pressureMin < 0 || pressureMin > 1) {
    throw new BalanceError('balance.yaml: "production.pressureMin" muss zwischen 0 und 1 liegen');
  }
  if (recoveryLossPerWell > recoveryLossMax) {
    throw new BalanceError(
      'balance.yaml: "production.recoveryLossPerWell" ist größer als "production.recoveryLossMax"',
    );
  }
  return {
    initialRateShare,
    decline,
    freeWells,
    pressureLossPerWell,
    pressureMin,
    recoveryLossPerWell,
    recoveryLossMax,
  };
}

function parseMarket(raw: unknown): MarketBalance {
  const positive = (path: string): number => {
    const value = num(raw, path);
    if (value <= 0) throw new BalanceError(`balance.yaml: "${path}" muss größer als 0 sein`);
    return value;
  };
  const wholeNonNegative = (path: string): number => {
    const value = num(raw, path);
    if (!Number.isInteger(value) || value < 0) {
      throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 0 sein`);
    }
    return value;
  };
  const basePrice = positive('market.basePrice');
  const demand = positive('market.demand');
  const elasticity = positive('market.elasticity');
  const shock = positive('market.shock');
  const regionalDiscount = num(raw, 'market.regionalDiscount');
  if (regionalDiscount < 0) throw new BalanceError('balance.yaml: "market.regionalDiscount" darf nicht negativ sein');
  const priceMin = positive('market.priceMin');
  const priceMax = num(raw, 'market.priceMax');
  if (priceMin > basePrice) {
    throw new BalanceError('balance.yaml: "market.priceMin" darf nicht über "market.basePrice" liegen');
  }
  if (priceMax < basePrice) {
    throw new BalanceError('balance.yaml: "market.priceMax" darf nicht unter "market.basePrice" liegen');
  }
  const neighbours = {
    startWells: wholeNonNegative('market.neighbours.startWells'),
    newWellsPerRound: wholeNonNegative('market.neighbours.newWellsPerRound'),
    ratePerWell: positive('market.neighbours.ratePerWell'),
  };
  const newsThreshold = share(raw, 'market.newsThreshold');
  return { basePrice, demand, elasticity, shock, regionalDiscount, priceMin, priceMax, neighbours, newsThreshold };
}

function parseTransportMode(raw: unknown, mode: TransportMode): TransportModeBalance {
  const path = `transport.${mode}`;
  const block = (raw as { transport?: Record<string, unknown> })?.transport?.[mode];
  if (!block || typeof block !== 'object') throw new BalanceError(`balance.yaml: Block "${path}" fehlt`);
  const costPerBarrel = num(raw, `${path}.costPerBarrel`);
  if (costPerBarrel < 0) throw new BalanceError(`balance.yaml: "${path}.costPerBarrel" darf nicht negativ sein`);
  return { label: text(block, 'label', path), costPerBarrel, capacity: positiveInt(raw, `${path}.capacity`) };
}

function parseTransport(raw: unknown): TransportBalance {
  const wagon = parseTransportMode(raw, 'wagon');
  const rail = parseTransportMode(raw, 'rail');
  if (rail.costPerBarrel >= wagon.costPerBarrel) {
    throw new BalanceError('balance.yaml: Bahn muss billiger als Fuhrwerk sein');
  }
  const hikeChance = share(raw, 'transport.thorne.hikeChance');
  const hikeStep = num(raw, 'transport.thorne.hikeStep');
  if (hikeStep <= 0) throw new BalanceError('balance.yaml: "transport.thorne.hikeStep" muss größer als 0 sein');
  const maxTariff = num(raw, 'transport.thorne.maxTariff');
  if (maxTariff < rail.costPerBarrel) {
    throw new BalanceError('balance.yaml: "transport.thorne.maxTariff" ist kleiner als der Bahntarif');
  }
  return { wagon, rail, thorne: { hikeChance, hikeStep, maxTariff } };
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
    forecast: parseForecast(raw),
    drilling: parseDrilling(raw),
    production: parseProduction(raw),
    market: parseMarket(raw),
    transport: parseTransport(raw),
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
