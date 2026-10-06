// Spielzahlen der Fernleitungen (4.7, GDD §6) – Abschnitt `bigPipelines` in
// content/balance.yaml. Eigenständig, damit balance.ts nur einen Andockpunkt
// braucht: Dieser Teil kennt balance.ts nicht (kein Kreis beim Laden), Fehler
// kommen als BigPipelineBalanceError und balance.ts macht daraus einen BalanceError.

export type Offer = 'low' | 'fair' | 'generous';
export const OFFERS: readonly Offer[] = ['low', 'fair', 'generous'];

export interface PipelineDestination {
  /** Landmarke aus content/map.yaml (Bahnhof oder Hafen). */
  id: string;
  /**
   * Umgeht die Leitung Thornes Bahn (Hafen)? Dann fließt ihr Öl über den Weg „Pipeline“
   * und Thorne gerät unter Druck. Sonst (Bahnhof) bringt sie das Öl nur zu Thornes
   * Verladestelle: mehr Kapazität auf dem Weg „Bahn“, aber zu Thornes Tarif.
   */
  bypassesRail: boolean;
}

export interface BigPipelineBalance {
  /** Ab diesem Kapitel gibt es Fernleitungen (GDD §13: Kapitel 2). */
  fromChapter: number;
  destinations: PipelineDestination[];
  /** Vermessung je Karteneinheit Trasse. */
  surveyPerUnit: number;
  /** Baukosten je Karteneinheit. */
  costPerUnit: number;
  /** Baufortschritt je Runde in Karteneinheiten … */
  unitsPerRound: number;
  /** … aber immer zwischen minRounds und maxRounds (GDD §6: 1–4 Runden). */
  minRounds: number;
  maxRounds: number;
  /** Kapazität je fertiger Fernleitung in bbl je Runde. */
  capacity: number;
  /** Streckenwärter je Karteneinheit und Runde. */
  upkeepPerUnit: number;
  /** Höchstens so viele Fernleitungen gleichzeitig (geplant, im Bau oder fertig). */
  maxProjects: number;
  /** Anschluss an die kleine Pipeline aus Kapitel 1: Aufweiten ihrer Strecke (die Wegerechte gibt es schon). */
  smallUpgradeCost: number;
  rights: RightsBalance;
  sabotage: SabotageBalance;
  thorne: ThornePressureBalance;
  carrier: CarrierBalance;
  /** Fernleitungen zählen mit diesem Anteil ihrer Baukosten zum Imperiumswert. */
  assetShare: number;
}

export interface RightsBalance {
  /** Fairer Preis eines Wegerechts je Karteneinheit² Ranchfläche. */
  pricePerArea: number;
  /** Mindestpreis eines Wegerechts. */
  minPrice: number;
  /** Grundchance, dass ein Landbesitzer ein faires Angebot annimmt. */
  acceptBase: number;
  /** Preisfaktor je Angebot (niedrig, fair, großzügig). */
  offerFactor: Record<Offer, number>;
  /** Zu- oder Abschlag auf die Chance je Angebot. */
  offerBonus: Record<Offer, number>;
  /** Zu- oder Abschlag je Landbesitzer-Art (Namen aus lease.landowners). */
  landowner: Record<string, number>;
  /** Je Punkt öffentlicher Stimmung über 50 (4.1) steigt die Chance um so viel. */
  moodWeight: number;
  /** Bonus, wenn Jacob als anständiger Verhandler gilt (Merkzeichen fernleitung_ruf_gut). */
  reputationBonus: number;
  /** Abschlag, solange Thorne gegen eine Leitung zum Hafen Stimmung macht. */
  thorneMeddling: number;
  /** Nach so vielen Absagen stellt sich der Besitzer quer (Querkopf). */
  holdoutAfter: number;
  /** Der Querkopf verlangt das Vielfache des fairen Preises. */
  holdoutDemand: number;
  /** Umweg um eine Ranch: so viele Karteneinheiten mehr Trasse. */
  detourLength: number;
  /** Stadtrat (Stadtgebiet): fairer Preis und Grundchance. */
  townPrice: number;
  townAccept: number;
  /** Bahnkreuzung: Thorne verkauft nie freiwillig – Forderung, Gericht oder Enteignung. */
  railDemand: number;
  courtCost: number;
  courtRounds: number;
  courtChance: number;
  /** Enteignung nur mit politischem Einfluss ab diesem Wert (0–100, GDD §6/§10). */
  expropriateInfluence: number;
  /** 0.4.20+9: Politischer Einfluss je Hallstead-Gefallen (4.16), höchstens 100. */
  influencePerFavor: number;
  /** Entschädigung bei Enteignung: Anteil des fairen Preises. */
  expropriateShare: number;
}

export interface SabotageBalance {
  /** Chance je Runde während des Baus … */
  building: number;
  /** … und im Betrieb … */
  ready: number;
  /** … plus so viel je Karteneinheit Trasse. */
  perUnit: number;
  /** Faktor, wenn die Leitung Thornes Bahn umgeht (Hafen). */
  thorneFactor: number;
  /** Faktor dazu, wenn Jacob Thornes Unterhändler hinausgeworfen hat. */
  thorneFeudFactor: number;
  /** Faktor, solange Thorne stillhält (Waffenstillstand). */
  truceFactor: number;
  /** Faktor bei Fehde mit Bullard (oder Verrat). */
  rivalFactor: number;
  /** Faktor nach Einschüchterung der Landbesitzer (Rache). */
  revengeFactor: number;
  /** Wachleute: Kosten je Karteneinheit und Runde, Faktor auf die Chance. */
  guardsPerUnit: number;
  guardsFactor: number;
  /** Reparatur: Anteil der Baukosten, Runden Stillstand; im Bau eine Runde Verzug. */
  repairShare: number;
  repairRounds: number;
  /** Höchstens diese Chance je Runde. */
  maxChance: number;
}

export interface ThornePressureBalance {
  /** Tarifsenkung je Runde bei vollem Druck in $ je Barrel. */
  cut: number;
  /**
   * Eigener Boden für Kapitel 2: so tief senkt Thorne unter Druck (unter
   * transport.thorne.minTariff aus Kapitel 1, damit die Senkung über mehrere Runden wirkt).
   */
  minTariff: number;
  /** Fertige Kapazität zum Hafen (bbl je Runde), ab der der Druck voll ist. */
  fullPressureCapacity: number;
}

export interface CarrierBalance {
  /** Transportpflicht (4.3): Gebühr je fremdem Barrel … */
  fee: number;
  /** … und so viele fremde Barrel je Runde und Fernleitung (Konkurrenzöl). */
  volume: number;
}

export class BigPipelineBalanceError extends Error {}

function fehler(text: string): never {
  throw new BigPipelineBalanceError(`balance.yaml: ${text}`);
}

function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const v = at(obj, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) fehler(`"bigPipelines.${path}" fehlt oder ist keine Zahl`);
  return v;
}

function abNull(obj: unknown, path: string): number {
  const v = zahl(obj, path);
  if (v < 0) fehler(`"bigPipelines.${path}" darf nicht negativ sein`);
  return v;
}

function anteil(obj: unknown, path: string): number {
  const v = zahl(obj, path);
  if (v < 0 || v > 1) fehler(`"bigPipelines.${path}" muss zwischen 0 und 1 liegen`);
  return v;
}

function ganz(obj: unknown, path: string, min: number): number {
  const v = zahl(obj, path);
  if (!Number.isInteger(v) || v < min) fehler(`"bigPipelines.${path}" muss eine ganze Zahl ab ${min} sein`);
  return v;
}

function jeAngebot(obj: unknown, path: string, check: (o: unknown, p: string) => number): Record<Offer, number> {
  return { low: check(obj, `${path}.low`), fair: check(obj, `${path}.fair`), generous: check(obj, `${path}.generous`) };
}

/**
 * Liest den Abschnitt bigPipelines aus balance.yaml. landowners: erlaubte
 * Landbesitzer-Arten (balance.ts LANDOWNER_TYPES) – jede braucht einen Wert.
 */
export function parseBigPipelineBalance(raw: unknown, landowners: readonly string[]): BigPipelineBalance {
  const b = (raw as { bigPipelines?: unknown })?.bigPipelines;
  if (!b || typeof b !== 'object') fehler('"bigPipelines" fehlt');
  const ziele = at(b, 'destinations');
  if (!Array.isArray(ziele) || ziele.length === 0) fehler('"bigPipelines.destinations" fehlt oder ist leer');
  const destinations = ziele.map((d, i): PipelineDestination => {
    const o = d as Record<string, unknown>;
    if (typeof o?.id !== 'string' || o.id.trim() === '') fehler(`"bigPipelines.destinations.${i}.id" fehlt`);
    if (typeof o.bypassesRail !== 'boolean') fehler(`"bigPipelines.destinations.${i}.bypassesRail" muss true oder false sein`);
    return { id: o.id, bypassesRail: o.bypassesRail };
  });
  const minRounds = ganz(b, 'minRounds', 1);
  const maxRounds = ganz(b, 'maxRounds', 1);
  if (minRounds > maxRounds) fehler('"bigPipelines.minRounds" ist größer als "maxRounds"');
  const landowner: Record<string, number> = {};
  for (const name of landowners) landowner[name] = zahl(b, `rights.landowner.${name}`);
  const rights: RightsBalance = {
    pricePerArea: abNull(b, 'rights.pricePerArea'),
    minPrice: abNull(b, 'rights.minPrice'),
    acceptBase: anteil(b, 'rights.acceptBase'),
    offerFactor: jeAngebot(b, 'rights.offerFactor', abNull),
    offerBonus: jeAngebot(b, 'rights.offerBonus', zahl),
    landowner,
    moodWeight: abNull(b, 'rights.moodWeight'),
    reputationBonus: abNull(b, 'rights.reputationBonus'),
    thorneMeddling: abNull(b, 'rights.thorneMeddling'),
    holdoutAfter: ganz(b, 'rights.holdoutAfter', 1),
    holdoutDemand: abNull(b, 'rights.holdoutDemand'),
    detourLength: abNull(b, 'rights.detourLength'),
    townPrice: abNull(b, 'rights.townPrice'),
    townAccept: anteil(b, 'rights.townAccept'),
    railDemand: abNull(b, 'rights.railDemand'),
    courtCost: abNull(b, 'rights.courtCost'),
    courtRounds: ganz(b, 'rights.courtRounds', 1),
    courtChance: anteil(b, 'rights.courtChance'),
    expropriateInfluence: zahl(b, 'rights.expropriateInfluence'),
    influencePerFavor: abNull(b, 'rights.influencePerFavor'),
    expropriateShare: abNull(b, 'rights.expropriateShare'),
  };
  if (rights.offerFactor.low > rights.offerFactor.fair || rights.offerFactor.fair > rights.offerFactor.generous) {
    fehler('"bigPipelines.rights.offerFactor" muss von low über fair zu generous steigen');
  }
  const sabotage: SabotageBalance = {
    building: anteil(b, 'sabotage.building'),
    ready: anteil(b, 'sabotage.ready'),
    perUnit: abNull(b, 'sabotage.perUnit'),
    thorneFactor: abNull(b, 'sabotage.thorneFactor'),
    thorneFeudFactor: abNull(b, 'sabotage.thorneFeudFactor'),
    truceFactor: abNull(b, 'sabotage.truceFactor'),
    rivalFactor: abNull(b, 'sabotage.rivalFactor'),
    revengeFactor: abNull(b, 'sabotage.revengeFactor'),
    guardsPerUnit: abNull(b, 'sabotage.guardsPerUnit'),
    guardsFactor: anteil(b, 'sabotage.guardsFactor'),
    repairShare: anteil(b, 'sabotage.repairShare'),
    repairRounds: ganz(b, 'sabotage.repairRounds', 1),
    maxChance: anteil(b, 'sabotage.maxChance'),
  };
  const fullPressureCapacity = zahl(b, 'thorne.fullPressureCapacity');
  if (fullPressureCapacity <= 0) fehler('"bigPipelines.thorne.fullPressureCapacity" muss größer als 0 sein');
  return {
    fromChapter: ganz(b, 'fromChapter', 1),
    destinations,
    surveyPerUnit: abNull(b, 'surveyPerUnit'),
    costPerUnit: abNull(b, 'costPerUnit'),
    unitsPerRound: (() => {
      const v = zahl(b, 'unitsPerRound');
      if (v <= 0) fehler('"bigPipelines.unitsPerRound" muss größer als 0 sein');
      return v;
    })(),
    minRounds,
    maxRounds,
    capacity: ganz(b, 'capacity', 1),
    upkeepPerUnit: abNull(b, 'upkeepPerUnit'),
    maxProjects: ganz(b, 'maxProjects', 1),
    smallUpgradeCost: abNull(b, 'smallUpgradeCost'),
    rights,
    sabotage,
    thorne: { cut: abNull(b, 'thorne.cut'), minTariff: abNull(b, 'thorne.minTariff'), fullPressureCapacity },
    carrier: { fee: abNull(b, 'carrier.fee'), volume: abNull(b, 'carrier.volume') },
    assetShare: anteil(b, 'assetShare'),
  };
}
