// Spielzahlen der Börse (4.15, GDD §8 „Kauf auf Kredit“, §7.2 „Kreditcrash“):
// Abschnitt `exchange` in content/balance.yaml. Eigenständig gelesen, damit
// balance.ts nur einen schmalen Andockpunkt braucht (keine Hilfsfunktionen von dort).

/** Bereich min–max. */
export interface ExchangeRange {
  min: number;
  max: number;
}

export const EXCHANGE_SECTORS = ['rail', 'bank', 'oil', 'auto', 'steel'] as const;
export type ExchangeSector = (typeof EXCHANGE_SECTORS)[number];

export interface ExchangeSectorBalance {
  /** Wie stark die Aktie dem Markt folgt (1 = wie der Index). */
  beta: number;
  /** Eigene Schwankung je Runde (±). */
  idio: number;
  /** Dividende je Runde als Anteil des Kurswerts. */
  dividend: number;
}

export interface ExchangeStockBalance {
  id: string;
  sector: ExchangeSector;
  /** Kurs in $ je Aktie bei Öffnung der Börse. */
  start: number;
}

export interface ExchangeBalance {
  /** Ab diesem Kapitel gibt es die Börse (GDD §14: Kapitel 3). */
  unlockChapter: number;
  startIndex: number;
  /** So viele Kurse je Aktie bleiben für den Ticker gemerkt. */
  history: number;
  /** Tiefer fällt kein Kurs (in $). */
  minPrice: number;
  market: { drift: number; boom: number; noise: number };
  fever: {
    start: ExchangeRange;
    revert: number;
    speculation: number;
    climate: number;
    momentum: number;
    margin: number;
    noise: number;
  };
  /** Ab diesem Börsenfieber warnt die Zeitung. */
  warnFrom: number;
  /** Ab hier schreibt sie von steigenden Zinsen (zweite Warnstufe). */
  alarmFrom: number;
  /** Kreditklima (4.4) ab hier warnt die Zeitung ebenfalls. */
  warnCredit: number;
  /** Ab hier spricht die Zeitung von Boom (nur Stimmung, keine Warnung). */
  boomFrom: number;
  /** Bis hier spricht sie von Flaute. */
  gloomTo: number;
  crash: {
    from: number;
    chance: number;
    slope: number;
    minWarnings: number;
    drop: ExchangeRange;
    tail: number;
    rounds: ExchangeRange;
    after: number;
  };
  margin: {
    leverages: number[];
    maxLeverage: number;
    call: number;
    liquidate: number;
    rate: number;
    rateClimate: number;
    minBuy: number;
    heatScale: number;
    creditShift: number;
    fee: number;
  };
  sectors: Record<ExchangeSector, ExchangeSectorBalance>;
  stocks: ExchangeStockBalance[];
}

export class ExchangeBalanceError extends Error {}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const value = get(obj, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" fehlt oder ist keine Zahl`);
  return value;
}

function nichtNegativ(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" darf nicht negativ sein`);
  return value;
}

function anteil(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0 || value > 1) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" muss zwischen 0 und 1 liegen`);
  return value;
}

function ganz(obj: unknown, path: string, min: number): number {
  const value = zahl(obj, path);
  if (!Number.isInteger(value) || value < min) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" muss eine ganze Zahl ab ${min} sein`);
  return value;
}

function bereich(obj: unknown, path: string): ExchangeRange {
  const r = { min: zahl(obj, `${path}.min`), max: zahl(obj, `${path}.max`) };
  if (r.min > r.max) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" hat min > max`);
  return r;
}

function fieberwert(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0 || value > 100) throw new ExchangeBalanceError(`balance.yaml: "exchange.${path}" muss zwischen 0 und 100 liegen`);
  return value;
}

/** Liest den Abschnitt `exchange` aus den rohen balance.yaml-Daten. */
export function parseExchangeBalance(raw: unknown): ExchangeBalance {
  const b = get(raw, 'exchange');
  if (!b || typeof b !== 'object') throw new ExchangeBalanceError('balance.yaml: Abschnitt "exchange" fehlt');

  const sectors = {} as Record<ExchangeSector, ExchangeSectorBalance>;
  for (const s of EXCHANGE_SECTORS) {
    sectors[s] = { beta: nichtNegativ(b, `sectors.${s}.beta`), idio: nichtNegativ(b, `sectors.${s}.idio`), dividend: anteil(b, `sectors.${s}.dividend`) };
  }

  const stocksRaw = get(b, 'stocks');
  if (!Array.isArray(stocksRaw) || stocksRaw.length === 0) throw new ExchangeBalanceError('balance.yaml: "exchange.stocks" fehlt oder ist leer');
  const stocks: ExchangeStockBalance[] = stocksRaw.map((s, i) => {
    const id = (s as { id?: unknown })?.id;
    const sector = (s as { sector?: unknown })?.sector;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) throw new ExchangeBalanceError(`balance.yaml: "exchange.stocks[${i}].id" fehlt oder ist kein Kürzel (a–z, 0–9, _)`);
    if (typeof sector !== 'string' || !(EXCHANGE_SECTORS as readonly string[]).includes(sector)) {
      throw new ExchangeBalanceError(`balance.yaml: Aktie "${id}" hat keine bekannte Branche (${EXCHANGE_SECTORS.join(', ')})`);
    }
    const start = zahl(s, 'start');
    if (start <= 0) throw new ExchangeBalanceError(`balance.yaml: Aktie "${id}" braucht einen Startkurs über 0`);
    return { id, sector: sector as ExchangeSector, start };
  });
  const ids = new Set(stocks.map((s) => s.id));
  if (ids.size !== stocks.length) throw new ExchangeBalanceError('balance.yaml: "exchange.stocks" enthält eine Aktie doppelt');

  const leveragesRaw = get(b, 'margin.leverages');
  if (!Array.isArray(leveragesRaw) || leveragesRaw.length === 0) throw new ExchangeBalanceError('balance.yaml: "exchange.margin.leverages" fehlt oder ist leer');
  const maxLeverage = ganz(b, 'margin.maxLeverage', 1);
  const leverages = leveragesRaw.map((l, i) => {
    if (typeof l !== 'number' || !Number.isInteger(l) || l < 1 || l > maxLeverage) {
      throw new ExchangeBalanceError(`balance.yaml: "exchange.margin.leverages[${i}]" muss eine ganze Zahl von 1 bis maxLeverage sein`);
    }
    return l;
  });

  const balance: ExchangeBalance = {
    unlockChapter: ganz(b, 'unlockChapter', 1),
    startIndex: zahl(b, 'startIndex'),
    history: ganz(b, 'history', 2),
    minPrice: nichtNegativ(b, 'minPrice'),
    market: { drift: zahl(b, 'market.drift'), boom: nichtNegativ(b, 'market.boom'), noise: nichtNegativ(b, 'market.noise') },
    fever: {
      start: bereich(b, 'fever.start'),
      revert: anteil(b, 'fever.revert'),
      speculation: anteil(b, 'fever.speculation'),
      climate: nichtNegativ(b, 'fever.climate'),
      momentum: nichtNegativ(b, 'fever.momentum'),
      margin: nichtNegativ(b, 'fever.margin'),
      noise: nichtNegativ(b, 'fever.noise'),
    },
    warnFrom: fieberwert(b, 'warnFrom'),
    alarmFrom: fieberwert(b, 'alarmFrom'),
    warnCredit: fieberwert(b, 'warnCredit'),
    boomFrom: fieberwert(b, 'boomFrom'),
    gloomTo: fieberwert(b, 'gloomTo'),
    crash: {
      from: fieberwert(b, 'crash.from'),
      chance: anteil(b, 'crash.chance'),
      slope: anteil(b, 'crash.slope'),
      minWarnings: ganz(b, 'crash.minWarnings', 1),
      drop: bereich(b, 'crash.drop'),
      tail: anteil(b, 'crash.tail'),
      rounds: bereich(b, 'crash.rounds'),
      after: anteil(b, 'crash.after'),
    },
    margin: {
      leverages,
      maxLeverage,
      call: anteil(b, 'margin.call'),
      liquidate: anteil(b, 'margin.liquidate'),
      rate: anteil(b, 'margin.rate'),
      rateClimate: anteil(b, 'margin.rateClimate'),
      minBuy: nichtNegativ(b, 'margin.minBuy'),
      heatScale: zahl(b, 'margin.heatScale'),
      creditShift: nichtNegativ(b, 'margin.creditShift'),
      fee: anteil(b, 'margin.fee'),
    },
    sectors,
    stocks,
  };
  // Die Zeitung muss warnen können, bevor es kracht – sonst wäre der Crash ohne Vorzeichen.
  if (balance.warnFrom > balance.crash.from) throw new ExchangeBalanceError('balance.yaml: "exchange.warnFrom" muss kleiner oder gleich "exchange.crash.from" sein (erst die Warnung, dann der Crash)');
  if (balance.alarmFrom < balance.warnFrom) throw new ExchangeBalanceError('balance.yaml: "exchange.alarmFrom" muss mindestens "exchange.warnFrom" sein');
  if (balance.margin.liquidate > balance.margin.call) throw new ExchangeBalanceError('balance.yaml: "exchange.margin.liquidate" muss kleiner oder gleich "exchange.margin.call" sein');
  if (balance.margin.heatScale <= 0) throw new ExchangeBalanceError('balance.yaml: "exchange.margin.heatScale" muss größer als 0 sein');
  if (balance.crash.drop.max >= 1) throw new ExchangeBalanceError('balance.yaml: "exchange.crash.drop.max" muss unter 1 liegen');
  if (!Number.isInteger(balance.crash.rounds.min) || balance.crash.rounds.min < 1 || !Number.isInteger(balance.crash.rounds.max)) {
    throw new ExchangeBalanceError('balance.yaml: "exchange.crash.rounds" braucht ganze Zahlen ab 1');
  }
  return balance;
}
