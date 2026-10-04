// 4.8 Aktien, Aufsichtsrat, Anleihen: liest den Block „stocks“ aus content/balance.yaml.
// Eigenes Modul ohne Laufzeit-Abhängigkeit zu balance.ts (keine Import-Schleife):
// balance.ts reicht seine Fehlerklasse als makeError herein.

/** Ratings, für die es Anleihen gibt (D: niemand zeichnet). */
export type BondRating = 'A' | 'B' | 'C';

export interface StocksBalance {
  /** Ab diesem Kapitel gibt es Aktienbuch und Anleihen. */
  fromChapter: number;
  /** Aktien beim Börsengang. */
  totalShares: number;
  price: {
    min: number;
    sentimentMin: number;
    sentimentMax: number;
    profitWeight: number;
    creditWeight: number;
    moodWeight: number;
    noise: number;
    reversion: number;
  };
  dividend: { rates: number[]; graceRounds: number; missPenalty: number; bonus: number };
  issue: { maxShare: number; discount: number; dilutionPenalty: number };
  buyback: { premium: number; bonus: number };
  board: {
    seatsMin: number;
    seatsMax: number;
    seatsBase: number;
    seatsPerShare: number;
    loyalFrom: number;
    weight: number;
    gain: number;
    loss: number;
    maxDebtRatio: number;
    courtCost: number;
    courtGain: number;
    bigDecision: number;
  };
  demands: {
    chance: number;
    dueRounds: number;
    dividendShare: number;
    debtCut: number;
    buybackShare: number;
    issueShare: number;
    fulfillGain: number;
    failLoss: number;
    rejectLoss: number;
  };
  thorne: {
    minOutside: number;
    buyChance: number;
    buyShare: number;
    hostileFactor: number;
    hostileMarks: string[];
    cheapBelow: number;
    floatKeep: number;
    maxStake: number;
    seatPer: number;
    maxSeats: number;
    investigateCost: number;
  };
  vote: { lookback: number; dropFrom: number; moodBelow: number; proxyRounds: number; pressCost: number; pressBonus: number };
  bonds: {
    sizes: number[];
    terms: number[];
    baseRate: number;
    spreads: Record<BondRating, number>;
    climateSpread: number;
    minRate: number;
    fee: number;
  };
}

/** Liest balance.yaml → stocks. makeError baut die Fehlerklasse von balance.ts. */
export function parseStocksBalance(raw: unknown, makeError: (message: string) => Error): StocksBalance {
  const fail = (message: string): never => {
    throw makeError(`balance.yaml: ${message}`);
  };
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), raw);
  const num = (path: string): number => {
    const v = get(`stocks.${path}`);
    if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`"stocks.${path}" fehlt oder ist keine Zahl`);
    return v;
  };
  const nonNeg = (path: string): number => {
    const v = num(path);
    return v < 0 ? fail(`"stocks.${path}" darf nicht negativ sein`) : v;
  };
  const share = (path: string): number => {
    const v = num(path);
    return v < 0 || v > 1 ? fail(`"stocks.${path}" muss zwischen 0 und 1 liegen`) : v;
  };
  const int = (path: string, min = 1): number => {
    const v = num(path);
    return !Number.isInteger(v) || v < min ? fail(`"stocks.${path}" muss eine ganze Zahl ab ${min} sein`) : v;
  };
  const numList = (path: string, check: (v: number) => boolean, what: string): number[] => {
    const v = get(`stocks.${path}`);
    if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'number' && check(x))) {
      return fail(`"stocks.${path}" muss eine Liste aus ${what} sein`);
    }
    return v as number[];
  };

  const block = get('stocks');
  if (!block || typeof block !== 'object') fail('Block "stocks" fehlt');

  const marks = get('stocks.thorne.hostileMarks');
  if (!Array.isArray(marks) || !marks.every((m) => typeof m === 'string' && /^[a-z0-9_]+$/.test(m))) {
    fail('"stocks.thorne.hostileMarks" muss eine Liste von Merkzeichen sein');
  }

  const s: StocksBalance = {
    fromChapter: int('fromChapter', 2),
    totalShares: int('totalShares', 100),
    price: {
      min: nonNeg('price.min'),
      sentimentMin: nonNeg('price.sentimentMin'),
      sentimentMax: nonNeg('price.sentimentMax'),
      profitWeight: nonNeg('price.profitWeight'),
      creditWeight: nonNeg('price.creditWeight'),
      moodWeight: nonNeg('price.moodWeight'),
      noise: share('price.noise'),
      reversion: share('price.reversion'),
    },
    dividend: {
      rates: numList('dividend.rates', (x) => x > 0 && x < 1, 'Anteilen über 0 und unter 1'),
      graceRounds: int('dividend.graceRounds'),
      missPenalty: share('dividend.missPenalty'),
      bonus: share('dividend.bonus'),
    },
    issue: { maxShare: share('issue.maxShare'), discount: share('issue.discount'), dilutionPenalty: nonNeg('issue.dilutionPenalty') },
    buyback: { premium: share('buyback.premium'), bonus: nonNeg('buyback.bonus') },
    board: {
      seatsMin: int('board.seatsMin'),
      seatsMax: int('board.seatsMax'),
      seatsBase: int('board.seatsBase', 0),
      seatsPerShare: nonNeg('board.seatsPerShare'),
      loyalFrom: nonNeg('board.loyalFrom'),
      weight: share('board.weight'),
      gain: nonNeg('board.gain'),
      loss: nonNeg('board.loss'),
      maxDebtRatio: nonNeg('board.maxDebtRatio'),
      courtCost: nonNeg('board.courtCost'),
      courtGain: nonNeg('board.courtGain'),
      bigDecision: share('board.bigDecision'),
    },
    demands: {
      chance: share('demands.chance'),
      dueRounds: int('demands.dueRounds'),
      dividendShare: share('demands.dividendShare'),
      debtCut: share('demands.debtCut'),
      buybackShare: share('demands.buybackShare'),
      issueShare: share('demands.issueShare'),
      fulfillGain: nonNeg('demands.fulfillGain'),
      failLoss: nonNeg('demands.failLoss'),
      rejectLoss: nonNeg('demands.rejectLoss'),
    },
    thorne: {
      minOutside: share('thorne.minOutside'),
      buyChance: share('thorne.buyChance'),
      buyShare: share('thorne.buyShare'),
      hostileFactor: nonNeg('thorne.hostileFactor'),
      hostileMarks: marks as string[],
      cheapBelow: nonNeg('thorne.cheapBelow'),
      floatKeep: share('thorne.floatKeep'),
      maxStake: share('thorne.maxStake'),
      seatPer: share('thorne.seatPer'),
      maxSeats: int('thorne.maxSeats', 0),
      investigateCost: nonNeg('thorne.investigateCost'),
    },
    vote: {
      lookback: int('vote.lookback'),
      dropFrom: share('vote.dropFrom'),
      moodBelow: nonNeg('vote.moodBelow'),
      proxyRounds: int('vote.proxyRounds'),
      pressCost: nonNeg('vote.pressCost'),
      pressBonus: share('vote.pressBonus'),
    },
    bonds: {
      sizes: numList('bonds.sizes', (x) => x > 0, 'Beträgen über 0'),
      terms: numList('bonds.terms', (x) => Number.isInteger(x) && x >= 1, 'ganzen Runden ab 1'),
      baseRate: share('bonds.baseRate'),
      spreads: { A: share('bonds.spreads.A'), B: share('bonds.spreads.B'), C: share('bonds.spreads.C') },
      climateSpread: share('bonds.climateSpread'),
      minRate: share('bonds.minRate'),
      fee: share('bonds.fee'),
    },
  };
  if (s.board.seatsMin > s.board.seatsMax) fail('"stocks.board.seatsMin" ist größer als seatsMax');
  if (s.price.sentimentMin > 1 || s.price.sentimentMax < 1) fail('"stocks.price" – die faire Stimmung 1 muss zwischen sentimentMin und sentimentMax liegen');
  if (s.thorne.minOutside <= 0) fail('"stocks.thorne.minOutside" muss über 0 liegen');
  return s;
}
