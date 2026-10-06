// Spielzahlen der Raffinerie (4.6, GDD §6) aus dem Block „refinery“ in
// content/balance.yaml. Eigene Datei, damit balance.ts nur einen Andockpunkt
// braucht: parseRefineryBalance wirft RefineryBalanceError, balance.ts macht
// daraus einen BalanceError (kein Laufzeit-Import von balance.ts hierher).

/** Die Produkte der Destillation (GDD §6). Reihenfolge = Reihenfolge in der Oberfläche. */
export const PRODUCTS = ['kerosene', 'lubricant', 'fuelOil', 'gasoline'] as const;
export type Product = (typeof PRODUCTS)[number];

/** Anteile je Produkt an der Ausbeute (Summe 1). */
export type ProductMix = Record<Product, number>;

export interface MixBound {
  min: number;
  max: number;
}

/** Eine Technikstufe: Verlust und Spielraum des Produktmix. */
export interface RefineryTech {
  stage: number;
  label: string;
  /** Anteil des Rohöls, der beim Raffinieren verloren geht. */
  loss: number;
  mix: Record<Product, MixBound>;
}

/** Wie sich die Nachfrage nach einem Produkt mit der Welt verschiebt. */
export interface ProductTrend {
  /** Bezugsjahr: hier ist der Jahreseinfluss 0. */
  refYear: number;
  /**
   * Verschiebung je Jahr seit refYear gegenüber der allgemeinen Ölnachfrage
   * (Anteil, z. B. 0,08 = +8 %). Das allgemeine Wachstum trägt der
   * Nachfrage-Index der Welt (Exponent demand), nicht dieser Wert.
   */
  perYear: number;
  /** Je 50 Punkte Technikstand über der Bezugswelt. */
  tech: number;
  /** Je 100 Punkte Außenspannung über der Bezugswelt. */
  tension: number;
  /** Zuschlag im Krieg. */
  war: number;
  /** Exponent auf den Nachfrage-Index der Welt. */
  demand: number;
  /** Untergrenze des Trendfaktors. */
  min: number;
}

export interface ProductBalance {
  /** Grundpreis in $ je Barrel beim Bezugs-Rohölpreis und gedeckter Nachfrage. */
  basePrice: number;
  /** Was der Großhandel je Runde zum Grundpreis abnimmt (bbl). */
  demand: number;
  elasticity: number;
  /**
   * 0.4.20+25: Rohöl im Produkt – je $ Rohölpreis steigt der Produktpreis um so viel (1 = ganz). Der Rest des
   * Grundpreises ist die Raffineriespanne; nur sie hängt an Angebot und Nachfrage.
   */
  crudeLink: number;
  /** Grenzen der Raffineriespanne als Anteil an der Spanne beim Grundpreis. */
  floor: number;
  ceiling: number;
  trend: ProductTrend;
}

export interface RefineryBalance {
  unlockChapter: number;
  buildCost: number;
  buildRounds: number;
  unitCapacity: number;
  maxLevel: number;
  expandCost: number;
  expandRounds: number;
  upkeepPerLevel: number;
  operatingCost: number;
  assetShare: number;
  fire: { chance: number; repairCost: number; repairRounds: number };
  sour: { yieldLoss: number; costAdd: number };
  crudeRef: number;
  worldDefaults: { tech: number; tension: number; demand: number };
  techs: RefineryTech[];
  startMix: ProductMix;
  products: Record<Product, ProductBalance>;
}

export class RefineryBalanceError extends Error {}

function fail(path: string, what: string): never {
  throw new RefineryBalanceError(`balance.yaml: "refinery.${path}" ${what}`);
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function num(obj: unknown, path: string): number {
  const v = get(obj, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'fehlt oder ist keine Zahl');
  return v;
}

function nonNeg(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (v < 0) fail(path, 'darf nicht negativ sein');
  return v;
}

function positive(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (v <= 0) fail(path, 'muss größer als 0 sein');
  return v;
}

function int(obj: unknown, path: string, min: number): number {
  const v = num(obj, path);
  if (!Number.isInteger(v) || v < min) fail(path, `muss eine ganze Zahl ab ${min} sein`);
  return v;
}

function share(obj: unknown, path: string): number {
  const v = num(obj, path);
  if (v < 0 || v > 1) fail(path, 'muss zwischen 0 und 1 liegen');
  return v;
}

function parseTech(raw: unknown, i: number): RefineryTech {
  const p = `techs.${i}`;
  const label = get(raw, `${p}.label`);
  if (typeof label !== 'string' || label.trim() === '') fail(`${p}.label`, 'fehlt oder ist kein Text');
  const mix = {} as Record<Product, MixBound>;
  for (const prod of PRODUCTS) {
    const b = { min: share(raw, `${p}.mix.${prod}.min`), max: share(raw, `${p}.mix.${prod}.max`) };
    if (b.min > b.max) fail(`${p}.mix.${prod}`, 'hat min > max');
    mix[prod] = b;
  }
  const lo = PRODUCTS.reduce((s, k) => s + mix[k].min, 0);
  const hi = PRODUCTS.reduce((s, k) => s + mix[k].max, 0);
  if (lo > 1 + 1e-9 || hi < 1 - 1e-9) fail(`${p}.mix`, 'passt nicht: Summe der min muss ≤ 1 und Summe der max ≥ 1 sein');
  const loss = share(raw, `${p}.loss`);
  if (loss >= 1) fail(`${p}.loss`, 'muss kleiner als 1 sein');
  return { stage: int(raw, `${p}.stage`, 1), label, loss, mix };
}

function parseProduct(raw: unknown, prod: Product): ProductBalance {
  const p = `products.${prod}`;
  const t = `${p}.trend`;
  const floor = nonNeg(raw, `${p}.floor`);
  const ceiling = positive(raw, `${p}.ceiling`);
  if (floor > ceiling) fail(p, 'hat floor > ceiling');
  return {
    basePrice: positive(raw, `${p}.basePrice`),
    demand: positive(raw, `${p}.demand`),
    elasticity: nonNeg(raw, `${p}.elasticity`),
    crudeLink: share(raw, `${p}.crudeLink`),
    floor,
    ceiling,
    trend: {
      refYear: num(raw, `${t}.refYear`),
      perYear: num(raw, `${t}.perYear`),
      tech: num(raw, `${t}.tech`),
      tension: num(raw, `${t}.tension`),
      war: num(raw, `${t}.war`),
      demand: num(raw, `${t}.demand`),
      min: nonNeg(raw, `${t}.min`),
    },
  };
}

/** Liest den Block „refinery“ (raw = der Block selbst). */
export function parseRefineryBalance(raw: unknown): RefineryBalance {
  if (!raw || typeof raw !== 'object') throw new RefineryBalanceError('balance.yaml: Block "refinery" fehlt');
  const techsRaw = get(raw, 'techs');
  if (!Array.isArray(techsRaw) || techsRaw.length === 0) fail('techs', 'fehlt oder ist leer');
  const techs = techsRaw.map((_, i) => parseTech(raw, i));
  techs.forEach((t, i) => {
    if (t.stage !== i + 1) fail(`techs.${i}.stage`, `muss ${i + 1} sein (Stufen der Reihe nach)`);
  });
  const startMix = {} as ProductMix;
  for (const prod of PRODUCTS) startMix[prod] = share(raw, `startMix.${prod}`);
  const sum = PRODUCTS.reduce((s, k) => s + startMix[k], 0);
  if (Math.abs(sum - 1) > 1e-6) fail('startMix', `ergibt ${sum.toFixed(3)} statt 1`);
  for (const prod of PRODUCTS) {
    const b = techs[0].mix[prod];
    if (startMix[prod] < b.min - 1e-9 || startMix[prod] > b.max + 1e-9) fail(`startMix.${prod}`, 'liegt außerhalb des Spielraums der Stufe I');
  }
  const products = {} as Record<Product, ProductBalance>;
  for (const prod of PRODUCTS) products[prod] = parseProduct(raw, prod);
  const crudeRef = positive(raw, 'crudeRef');
  for (const prod of PRODUCTS) {
    const pr = products[prod];
    if (pr.basePrice <= pr.crudeLink * crudeRef) fail(`products.${prod}`, 'braucht basePrice > crudeLink × crudeRef (sonst gibt es keine Raffineriespanne)');
  }
  return {
    unlockChapter: int(raw, 'unlockChapter', 1),
    buildCost: nonNeg(raw, 'buildCost'),
    buildRounds: int(raw, 'buildRounds', 1),
    unitCapacity: int(raw, 'unitCapacity', 1),
    maxLevel: int(raw, 'maxLevel', 1),
    expandCost: nonNeg(raw, 'expandCost'),
    expandRounds: int(raw, 'expandRounds', 1),
    upkeepPerLevel: nonNeg(raw, 'upkeepPerLevel'),
    operatingCost: nonNeg(raw, 'operatingCost'),
    assetShare: share(raw, 'assetShare'),
    fire: { chance: share(raw, 'fire.chance'), repairCost: nonNeg(raw, 'fire.repairCost'), repairRounds: int(raw, 'fire.repairRounds', 1) },
    sour: { yieldLoss: share(raw, 'sour.yieldLoss'), costAdd: nonNeg(raw, 'sour.costAdd') },
    crudeRef,
    worldDefaults: { tech: num(raw, 'worldDefaults.tech'), tension: num(raw, 'worldDefaults.tension'), demand: positive(raw, 'worldDefaults.demand') },
    techs,
    startMix,
    products,
  };
}
