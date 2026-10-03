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

/** Kreditwürdigkeit, von gut nach schlecht. */
export const RATINGS = ['A', 'B', 'C', 'D'] as const;
export type Rating = (typeof RATINGS)[number];

/** Bankkredit und Notkredit (GDD §8, §15). */
export interface CreditBalance {
  /** Rating, mit dem das Spiel startet. */
  startRating: Rating;
  /** Kleinster Kredit am Stück. */
  minLoan: number;
  /** Bankrahmen ohne Pfand. */
  limitBase: number;
  /** Rahmen je fördernder Quelle. */
  limitPerWell: number;
  /** Jahreszins je Rating. */
  rates: Record<Rating, number>;
  /** Eine fördernde Quelle als Pfand senkt den Zins um so viel. */
  collateralDiscount: number;
  /** Ohne Sicherheit steigt der Zins um so viel. */
  unsecuredAdd: number;
  /** Anteil der Schulden am Bankrahmen, bis zu dem das Rating B bleibt. */
  usageC: number;
  /** Anteil der Schulden am Bankrahmen, ab dem es D ist. */
  usageD: number;
  /** Fehlzahlungen, ab denen das Rating auf C fällt. */
  missedC: number;
  /** Fehlzahlungen, ab denen das Rating D ist. */
  missedD: number;
  /** Der Geldverleiher: leiht sofort, ohne Sicherheit, aber zu einem Wucherzins. */
  emergency: { limit: number; rate: number };
}

/** Bankrott: Frist, bevor es Konkurs gibt. */
/** Imperiumswert (GDD §4). */
/** Kapitelprüfung und Kapitelende (2.11, GDD §13, §8). */
export interface ChapterBalance {
  /** Ziel: Imperiumswert ab so viel $ … */
  goalValue: number;
  /** … oder so viele fördernde Quellen. */
  goalWells: number;
  ipo: {
    /** Anteile (0–1), die Jacob beim Börsengang verkaufen kann. */
    shares: number[];
    /** Anleger zahlen Imperiumswert × Anteil × priceFactor. */
    priceFactor: number;
  };
}

export interface EmpireBalance {
  /** Anteil, mit dem die förderbaren Barrel im Boden zählen. */
  reserveFactor: number;
}

/** Bot-Läufe (GDD §17): Zahlen für die drei Strategien in src/sim/bots.ts. */
export interface BotsBalance {
  /** Partien je Strategie. */
  games: number;
  /** Seeds sind `${seedPrefix}-0`, `${seedPrefix}-1`, … */
  seedPrefix: string;
  /** vorsichtig: Fundchance ab minChance, Rücklage cashReserve, höchstens Stufe maxStage. */
  cautious: { minChance: number; cashReserve: number; maxStage: number };
  /** gierig: pachtet ab minChance. */
  /** maxUndrilled: so viele ungebohrte Pachten hält er höchstens – mehr schafft der Turm nicht. */
  greedy: { minChance: number; maxUndrilled: number };
  /** zufällig: so viele Aktionen je Runde. */
  random: { actionsPerRound: number };
  /** ausgewogen (2.15, Standard-Bot): wie vorsichtig, leiht aber bis maxDebtShare des Bankrahmens. */
  balanced: { minChance: number; cashReserve: number; maxStage: number; maxDebtShare: number; maxUndrilled: number };
  /** Tage je Runde (Quartal) – für die Anfangsrate in bbl/Tag. */
  daysPerRound: number;
  /** Wie die Bots Ereignisse bewerten (2.15). */
  events: Record<'cautious' | 'greedy' | 'balanced', BotEventWeights>;
  /** Zielwerte Kapitel 1 (2.15): Toleranzbereich je Kennzahl. */
  targets: Record<BotTargetId, { min: number; max: number }>;
}

/** Bewertung einer Ereignis-Antwort durch einen Bot (2.15). */
export interface BotEventWeights {
  /** $ je Kraftpunkt. */
  strength: number;
  /** $ je Beziehungspunkt (Ruth, Thomas). */
  family: number;
  /** $ je Termin, den die Antwort kostet. */
  appointment: number;
  /** Überstunden nur ab dieser Kraft. */
  overtimeFrom: number;
}

/** Kennzahlen mit Zielwert (2.15, GDD §15/§17); gemessen in src/sim/bots.ts. */
export const BOT_TARGET_IDS = [
  'winRate',
  'standardBankrupt',
  'greedyBankrupt',
  'cautiousBehind',
  'standardGoal',
  'smallRateInRange',
  'gusherFactor',
  'decline',
  'wildcatHit',
  'appointments',
] as const;
export type BotTargetId = (typeof BOT_TARGET_IDS)[number];

export interface BankruptcyBalance {
  graceRounds: number;
}


/** Rivale-Persönlichkeit: Werte von 1–5 (GDD §9.2). */
export interface RivalPersonality {
  /** Risikoneigung: 1 = konservativ, 5 = abenteuerlustig. */
  risk: number;
  /** Aggressivität: 1 = passiv, 5 = kämpferisch. */
  aggression: number;
  /** Treue zu Verträgen: 1 = treulos, 5 = zuverlässig. */
  loyalty: number;
  /** Nachtragsfähigkeit: 1 = vergesslich, 5 = rachsüchtig. */
  grudge: number;
  /** Geduld: 1 = ungeduldig, 5 = geduldig. */
  patience: number;
}

/** Rivale Bullard: Pacht- und Bohrparameter. */
export interface RivalBalance {
  name: string;
  personality: RivalPersonality;
  startCash: number;
  actionsPerRound: number;
  valuePerFind: number;
  riskWeight: number;
  nearJacobBonus: number;
  nearFindChance: number;
  noise: number;
  minUtility: number;
  drillRounds: number;
  ratePerWell: number;
  transportPerBarrel: number;
  /** Fehde mit Jacob (2.8): Nachbarschaftsbonus × feudFactor. */
  feudFactor: number;
}

/** Crane Trust (2.8): Posted-Price-Druck und Übernahmeangebot. */
export interface CraneBalance {
  name: string;
  /** Abschlag in $ je Barrel auf Jacobs Verkäufe. */
  priceCut: number;
  /** So viele Runden gilt der Abschlag. */
  cutRounds: number;
  /** Mit Delgados Verband zahlt Jacob nur diesen Anteil des Abschlags. */
  allianceFactor: number;
  /** Übernahmeangebot = Imperiumswert × takeoverPremium … */
  takeoverPremium: number;
  /** … nach einer Treueerklärung × loyalPremium … */
  loyalPremium: number;
  /** … mindestens takeoverMin $. */
  takeoverMin: number;
}

/** Thorne Rail (2.8): Frachtvertrag. */
export interface ThorneBalance {
  name: string;
  /** Frachtvertrag: so viele Runden keine Tariferhöhung. */
  contractRounds: number;
  /** Vertrag abgelehnt: Erhöhungschance × refusedHikeFactor. */
  refusedHikeFactor: number;
}

/** Kleine Wildcatter im Hintergrund (2.8). */
export interface WildcattersBalance {
  min: number;
  max: number;
  names: string[];
}

/** Rivalen im Spiel. */
export interface RivalsBalance {
  bullard: RivalBalance;
  crane: CraneBalance;
  thorne: ThorneBalance;
  wildcatters: WildcattersBalance;
}
export interface Balance {
  rivals: RivalsBalance;
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
  credit: CreditBalance;
  bankruptcy: BankruptcyBalance;
  empire: EmpireBalance;
  chapter: ChapterBalance;
  bots: BotsBalance;
  events: EventsBalance;
  agenda: AgendaBalance;
  family: FamilyBalance;
  newspaper: NewspaperBalance;
  tutorial: TutorialBalance;
}

/** Einstieg (2.13): Tutorial-Hinweise in den ersten Runden. */
export interface TutorialBalance {
  /** Spätestens nach dieser Runde schweigen die Hinweise. */
  lastRound: number;
  /** Die Hinweise enden, sobald eine eigene Quelle so viele Runden gefördert hat (2 = nach der ersten Verkaufsrunde). */
  endAfterProducedRounds: number;
  /** Tiefer bohren rät der Hinweis nur, wenn der Geologe der nächsten Stufe mindestens so viel % gibt. */
  deeperMinChance: number;
  /** Kredite, die der Hinweis vorschlägt, werden auf so viele $ aufgerundet. */
  loanRounding: number;
}

/** Zeitung (2.6, GDD §7.2): ab welcher erwarteten Preisänderung welche Schlagzeile kommt. */
export interface NewspaperBalance {
  /** Erwarteter Preisverfall (Anteil) ab dem „Volle Tanks“ erscheint. */
  fallFrom: number;
  /** Erwarteter Preisverfall ab dem „Tanks laufen über“ erscheint (≥ fallFrom). */
  crashFrom: number;
  /** Erwarteter Preisanstieg ab dem „Leere Tanks“ erscheint. */
  riseFrom: number;
  /** Höchstens so viele Kurzmeldungen unter der Titelseite. */
  maxItems: number;
}

/** Termine und Kraft (2.3, GDD §3 und §4). */
export interface AgendaBalance {
  /** Termine je Runde bei voller Kraft. */
  appointments: number;
  /** So viele Termine gehen zusätzlich als Überstunden. */
  maxOvertime: number;
  /** Kraft, die jede Überstunde kostet. */
  overtimeCost: number;
  /** Kraft zurück nach einer Runde ohne Überstunden. */
  restBonus: number;
  /** Unter dieser Kraft gibt es weniger Termine … */
  tiredBelow: number;
  /** … und zwar so viele weniger. */
  tiredPenalty: number;
  /** Kraft bei Spielbeginn und Höchstwert (Kapitel 1). */
  strengthStart: number;
  strengthMax: number;
  /** Schwellen (2.7): Unter errorsBelow fehlen die besten Antworten und die Lupe prüft errorsCheckPenalty Felder weniger. */
  errorsBelow: number;
  errorsCheckPenalty: number;
  /** Unter sickBelow am Rundenende wird Jacob krank – 1 bis sickRoundsMax Runden. */
  sickBelow: number;
  sickRoundsMax: number;
  /** Bei Kraft 0: Zusammenbruch, so viele Runden krank. */
  collapseRounds: number;
  /** Kraft je Runde im Krankenbett. */
  sickRecovery: number;
}

/** Familie (2.7, GDD §12): Ruth, Thomas und was Familienzeit an Kraft gibt. */
export interface FamilyBalance {
  ruthStart: number;
  /** Runde, zu deren Beginn Thomas geboren wird. */
  thomasBirthRound: number;
  thomasStart: number;
  /** Beziehung weniger je Runde ohne Familienzeit. */
  neglect: number;
  /** Kraft nach Familienzeit: von strengthFrom (Beziehung 0) bis strengthTo (Beziehung 100). */
  strengthFrom: number;
  strengthTo: number;
  /** Ab hier zufrieden, vernachlässigt, verbittert; darunter entfremdet. */
  contentFrom: number;
  neglectedFrom: number;
  bitterFrom: number;
}

/** Ereignis-System (2.1): wie viele neue Ereignisse höchstens je Runde kommen. */
export interface EventsBalance {
  maxPerRound: number;
  /**
   * Wiederholungsschutz (2.10a): So viele Runden muss ein wiederkehrendes Ereignis
   * (once: false) oder eine Variante derselben Gruppe (group) mindestens Abstand halten,
   * wenn das Ereignis keinen eigenen cooldown hat.
   */
  repeatCooldown: number;
  /** Posteingang (2.4). */
  mail: MailBalance;
  /** Dokumentenprüfung (2.5). */
  documents: DocumentsBalance;
}

/** Einfache Dokumentenprüfung (2.5, GDD §3). */
export interface DocumentsBalance {
  /** Chance, dass ein Dokument gefälscht ist, wenn das Ereignis nichts anderes sagt. */
  forgeryChance: number;
  /** So viele Felder darf die Lupe je Dokument prüfen. */
  maxChecks: number;
}

/** Posteingang (2.4, GDD §3). */
export interface MailBalance {
  /** Höchstens so viele neue Briefe je Runde (zusätzlich zu den übrigen Ereignissen). */
  maxPerRound: number;
  /** Standard-Frist eines Briefs in Runden (die Ankunftsrunde mitgezählt). */
  deadlineRounds: number;
  /** Kam von einer Briefart so viele Runden keiner, bringt die Post sicher einen. */
  guaranteeRounds: number;
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

/** Rating-Namen wie "B"; erlaubt sind nur A bis D. */
function ratingText(obj: unknown, key: string, path: string): Rating {
  const value = (obj as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== 'string' || !(RATINGS as readonly string[]).includes(value)) {
    throw new BalanceError(`balance.yaml: "${path}" muss ein Rating sein (${RATINGS.join(', ')})`);
  }
  return value as Rating;
}

/** Prozentwert, der nicht negativ sein darf. */
function nonNegativeShare(obj: unknown, path: string): number {
  const value = num(obj, path);
  if (value < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  if (value > 1) throw new BalanceError(`balance.yaml: "${path}" darf nicht über 1 liegen`);
  return value;
}

function parseCredit(raw: unknown): CreditBalance {
  const block = (raw as { credit?: unknown })?.credit;
  if (!block || typeof block !== 'object') {
    throw new BalanceError('balance.yaml: Block "credit" fehlt');
  }
  const rates = {} as Record<Rating, number>;
  for (const r of RATINGS) {
    rates[r] = nonNegativeShare(raw, `credit.rates.${r}`);
    if (r !== 'A') {
      const besser = RATINGS[RATINGS.indexOf(r) - 1];
      if (rates[r] <= rates[besser]) {
        throw new BalanceError(`balance.yaml: "credit.rates.${r}" muss größer als "credit.rates.${besser}" sein`);
      }
    }
  }
  const usageC = nonNegativeShare(raw, 'credit.usageC');
  const usageD = nonNegativeShare(raw, 'credit.usageD');
  if (usageC >= usageD) {
    throw new BalanceError('balance.yaml: "credit.usageC" muss kleiner als "credit.usageD" sein');
  }
  const missedC = positiveInt(raw, 'credit.missedC');
  const missedD = positiveInt(raw, 'credit.missedD');
  if (missedC >= missedD) {
    throw new BalanceError('balance.yaml: "credit.missedC" muss kleiner als "credit.missedD" sein');
  }
  return {
    startRating: ratingText(block, 'startRating', 'credit.startRating'),
    minLoan: positiveInt(raw, 'credit.minLoan'),
    limitBase: num(raw, 'credit.limitBase'),
    limitPerWell: num(raw, 'credit.limitPerWell'),
    rates,
    collateralDiscount: nonNegativeShare(raw, 'credit.collateralDiscount'),
    unsecuredAdd: nonNegativeShare(raw, 'credit.unsecuredAdd'),
    usageC,
    usageD,
    missedC,
    missedD,
    emergency: {
      limit: num(raw, 'credit.emergency.limit'),
      rate: nonNegativeShare(raw, 'credit.emergency.rate'),
    },
  };
}


/** Zahl ≥ 0. */
function nonNegative(obj: unknown, path: string): number {
  const value = num(obj, path);
  if (value < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return value;
}

function parseRivals(raw: unknown): RivalsBalance {
  const block = (raw as { rivals?: { bullard?: unknown } })?.rivals;
  if (!block || typeof block !== 'object' || !block.bullard || typeof block.bullard !== 'object') {
    throw new BalanceError('balance.yaml: Block "rivals.bullard" fehlt');
  }
  const p = 'rivals.bullard';
  const trait = (key: string) => integerInRange(raw, `${p}.personality.${key}`, 1, 5);
  const bullard: RivalBalance = {
    name: text(block.bullard, 'name', p),
    personality: {
      risk: trait('risk'),
      aggression: trait('aggression'),
      loyalty: trait('loyalty'),
      grudge: trait('grudge'),
      patience: trait('patience'),
    },
    startCash: nonNegative(raw, `${p}.startCash`),
    actionsPerRound: positiveInt(raw, `${p}.actionsPerRound`),
    valuePerFind: nonNegative(raw, `${p}.valuePerFind`),
    riskWeight: share(raw, `${p}.riskWeight`),
    nearJacobBonus: nonNegative(raw, `${p}.nearJacobBonus`),
    nearFindChance: share(raw, `${p}.nearFindChance`),
    noise: nonNegative(raw, `${p}.noise`),
    minUtility: nonNegative(raw, `${p}.minUtility`),
    drillRounds: positiveInt(raw, `${p}.drillRounds`),
    ratePerWell: nonNegative(raw, `${p}.ratePerWell`),
    transportPerBarrel: nonNegative(raw, `${p}.transportPerBarrel`),
    feudFactor: nonNegative(raw, `${p}.feudFactor`),
  };
  const r = raw as { rivals: Record<string, unknown> };
  const c = 'rivals.crane';
  const crane: CraneBalance = {
    name: text(r.rivals.crane, 'name', c),
    priceCut: nonNegative(raw, `${c}.priceCut`),
    cutRounds: positiveInt(raw, `${c}.cutRounds`),
    allianceFactor: share(raw, `${c}.allianceFactor`),
    takeoverPremium: nonNegative(raw, `${c}.takeoverPremium`),
    loyalPremium: nonNegative(raw, `${c}.loyalPremium`),
    takeoverMin: nonNegative(raw, `${c}.takeoverMin`),
  };
  const t = 'rivals.thorne';
  const thorne: ThorneBalance = {
    name: text(r.rivals.thorne, 'name', t),
    contractRounds: positiveInt(raw, `${t}.contractRounds`),
    refusedHikeFactor: nonNegative(raw, `${t}.refusedHikeFactor`),
  };
  const w = 'rivals.wildcatters';
  const names = list(raw, `${w}.names`);
  if (!names.every((n) => typeof n === 'string' && n.trim() !== '')) {
    throw new BalanceError(`balance.yaml: "${w}.names" darf nur Namen enthalten`);
  }
  const wildcatters: WildcattersBalance = {
    min: positiveInt(raw, `${w}.min`),
    max: positiveInt(raw, `${w}.max`),
    names: names as string[],
  };
  if (wildcatters.min > wildcatters.max) throw new BalanceError(`balance.yaml: "${w}" hat min > max`);
  if (new Set(wildcatters.names).size < wildcatters.max) {
    throw new BalanceError(`balance.yaml: "${w}.names" braucht mindestens ${wildcatters.max} verschiedene Namen`);
  }
  return { bullard, crane, thorne, wildcatters };
}

function parseBankruptcy(raw: unknown): BankruptcyBalance {
  const block = (raw as { bankruptcy?: unknown })?.bankruptcy;
  if (!block || typeof block !== 'object') {
    throw new BalanceError('balance.yaml: Block "bankruptcy" fehlt');
  }
  return { graceRounds: positiveInt(raw, 'bankruptcy.graceRounds') };
}

function parseEmpire(raw: unknown): EmpireBalance {
  const block = (raw as { empire?: unknown })?.empire;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "empire" fehlt');
  return { reserveFactor: share(raw, 'empire.reserveFactor') };
}

function parseChapter(raw: unknown): ChapterBalance {
  const block = (raw as { chapter?: unknown })?.chapter;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "chapter" fehlt');
  const shares = list(raw, 'chapter.ipo.shares');
  if (!shares.every((s) => typeof s === 'number' && s > 0 && s < 0.5)) {
    throw new BalanceError('balance.yaml: "chapter.ipo.shares" darf nur Anteile über 0 und unter 0,5 enthalten (Jacob behält die Mehrheit)');
  }
  return {
    goalValue: num(raw, 'chapter.goalValue'),
    goalWells: positiveInt(raw, 'chapter.goalWells'),
    ipo: { shares: shares as number[], priceFactor: share(raw, 'chapter.ipo.priceFactor') },
  };
}

function parseBots(raw: unknown): BotsBalance {
  const block = (raw as { bots?: unknown })?.bots;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "bots" fehlt');
  return {
    games: positiveInt(raw, 'bots.games'),
    seedPrefix: text(block, 'seedPrefix', 'bots'),
    cautious: {
      minChance: share(raw, 'bots.cautious.minChance'),
      cashReserve: nonNegative(raw, 'bots.cautious.cashReserve'),
      maxStage: positiveInt(raw, 'bots.cautious.maxStage'),
    },
    greedy: { minChance: share(raw, 'bots.greedy.minChance'), maxUndrilled: positiveInt(raw, 'bots.greedy.maxUndrilled') },
    random: { actionsPerRound: positiveInt(raw, 'bots.random.actionsPerRound') },
    balanced: {
      minChance: share(raw, 'bots.balanced.minChance'),
      cashReserve: nonNegative(raw, 'bots.balanced.cashReserve'),
      maxStage: positiveInt(raw, 'bots.balanced.maxStage'),
      maxDebtShare: share(raw, 'bots.balanced.maxDebtShare'),
      maxUndrilled: positiveInt(raw, 'bots.balanced.maxUndrilled'),
    },
    daysPerRound: positiveInt(raw, 'bots.daysPerRound'),
    events: {
      cautious: parseBotWeights(raw, 'cautious'),
      greedy: parseBotWeights(raw, 'greedy'),
      balanced: parseBotWeights(raw, 'balanced'),
    },
    targets: Object.fromEntries(
      BOT_TARGET_IDS.map((id) => {
        const min = num(raw, `bots.targets.${id}.min`);
        const max = num(raw, `bots.targets.${id}.max`);
        if (min > max) throw new BalanceError(`balance.yaml: "bots.targets.${id}": min darf nicht über max liegen`);
        return [id, { min, max }];
      }),
    ) as Record<BotTargetId, { min: number; max: number }>,
  };
}

function parseBotWeights(raw: unknown, name: string): BotEventWeights {
  const p = `bots.events.${name}`;
  return {
    strength: nonNegative(raw, `${p}.strength`),
    family: nonNegative(raw, `${p}.family`),
    appointment: nonNegative(raw, `${p}.appointment`),
    overtimeFrom: nonNegative(raw, `${p}.overtimeFrom`),
  };
}

function parseTutorial(raw: unknown): TutorialBalance {
  const block = (raw as { tutorial?: unknown })?.tutorial;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "tutorial" fehlt');
  return {
    lastRound: positiveInt(raw, 'tutorial.lastRound'),
    endAfterProducedRounds: positiveInt(raw, 'tutorial.endAfterProducedRounds'),
    deeperMinChance: integerInRange(raw, 'tutorial.deeperMinChance', 0, 100),
    loanRounding: positiveInt(raw, 'tutorial.loanRounding'),
  };
}

function parseNewspaper(raw: unknown): NewspaperBalance {
  const block = (raw as { newspaper?: unknown })?.newspaper;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "newspaper" fehlt');
  const newspaper: NewspaperBalance = {
    fallFrom: share(raw, 'newspaper.fallFrom'),
    crashFrom: share(raw, 'newspaper.crashFrom'),
    riseFrom: share(raw, 'newspaper.riseFrom'),
    maxItems: positiveInt(raw, 'newspaper.maxItems'),
  };
  if (newspaper.crashFrom < newspaper.fallFrom) {
    throw new BalanceError('balance.yaml: "newspaper.crashFrom" darf nicht unter "newspaper.fallFrom" liegen');
  }
  return newspaper;
}

function parseEvents(raw: unknown): EventsBalance {
  const block = (raw as { events?: unknown })?.events;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "events" fehlt');
  const maxPerRound = positiveInt(raw, 'events.maxPerRound');
  if (!(block as { mail?: unknown }).mail || typeof (block as { mail?: unknown }).mail !== 'object') {
    throw new BalanceError('balance.yaml: Block "events.mail" fehlt');
  }
  if (!(block as { documents?: unknown }).documents || typeof (block as { documents?: unknown }).documents !== 'object') {
    throw new BalanceError('balance.yaml: Block "events.documents" fehlt');
  }
  return {
    maxPerRound,
    repeatCooldown: positiveInt(raw, 'events.repeatCooldown'),
    mail: {
      maxPerRound: positiveInt(raw, 'events.mail.maxPerRound'),
      deadlineRounds: positiveInt(raw, 'events.mail.deadlineRounds'),
      guaranteeRounds: positiveInt(raw, 'events.mail.guaranteeRounds'),
    },
    documents: {
      forgeryChance: share(raw, 'events.documents.forgeryChance'),
      maxChecks: positiveInt(raw, 'events.documents.maxChecks'),
    },
  };
}

function parseFamily(raw: unknown): FamilyBalance {
  const block = (raw as { family?: unknown })?.family;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "family" fehlt');
  const beziehung = (path: string) => {
    const value = nonNegative(raw, path);
    if (value > 100) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 100 liegen`);
    return value;
  };
  const family: FamilyBalance = {
    ruthStart: beziehung('family.ruthStart'),
    thomasBirthRound: positiveInt(raw, 'family.thomasBirthRound'),
    thomasStart: beziehung('family.thomasStart'),
    neglect: nonNegative(raw, 'family.neglect'),
    strengthFrom: nonNegative(raw, 'family.strengthFrom'),
    strengthTo: nonNegative(raw, 'family.strengthTo'),
    contentFrom: beziehung('family.contentFrom'),
    neglectedFrom: beziehung('family.neglectedFrom'),
    bitterFrom: beziehung('family.bitterFrom'),
  };
  if (!(family.bitterFrom <= family.neglectedFrom && family.neglectedFrom <= family.contentFrom)) {
    throw new BalanceError('balance.yaml: "family.bitterFrom" ≤ "family.neglectedFrom" ≤ "family.contentFrom" muss gelten');
  }
  if (family.strengthFrom > family.strengthTo) {
    throw new BalanceError('balance.yaml: "family.strengthFrom" darf nicht über "family.strengthTo" liegen');
  }
  return family;
}

function parseAgenda(raw: unknown): AgendaBalance {
  const block = (raw as { agenda?: unknown })?.agenda;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "agenda" fehlt');
  const ganz = (path: string) => {
    const value = nonNegative(raw, path);
    if (!Number.isInteger(value)) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl sein`);
    return value;
  };
  const agenda: AgendaBalance = {
    appointments: positiveInt(raw, 'agenda.appointments'),
    maxOvertime: ganz('agenda.maxOvertime'),
    overtimeCost: nonNegative(raw, 'agenda.overtimeCost'),
    restBonus: nonNegative(raw, 'agenda.restBonus'),
    tiredBelow: nonNegative(raw, 'agenda.tiredBelow'),
    tiredPenalty: ganz('agenda.tiredPenalty'),
    strengthStart: nonNegative(raw, 'agenda.strengthStart'),
    strengthMax: positiveInt(raw, 'agenda.strengthMax'),
    errorsBelow: nonNegative(raw, 'agenda.errorsBelow'),
    errorsCheckPenalty: ganz('agenda.errorsCheckPenalty'),
    sickBelow: nonNegative(raw, 'agenda.sickBelow'),
    sickRoundsMax: positiveInt(raw, 'agenda.sickRoundsMax'),
    collapseRounds: positiveInt(raw, 'agenda.collapseRounds'),
    sickRecovery: nonNegative(raw, 'agenda.sickRecovery'),
  };
  if (!(agenda.sickBelow <= agenda.errorsBelow && agenda.errorsBelow <= agenda.tiredBelow)) {
    throw new BalanceError('balance.yaml: Kraft-Schwellen müssen aufsteigen: "agenda.sickBelow" ≤ "agenda.errorsBelow" ≤ "agenda.tiredBelow"');
  }
  if (agenda.strengthStart > agenda.strengthMax) {
    throw new BalanceError('balance.yaml: "agenda.strengthStart" darf nicht über "agenda.strengthMax" liegen');
  }
  if (agenda.tiredPenalty >= agenda.appointments) {
    throw new BalanceError('balance.yaml: "agenda.tiredPenalty" muss kleiner als "agenda.appointments" sein');
  }
  return agenda;
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
    credit: parseCredit(raw),
    bankruptcy: parseBankruptcy(raw),
    rivals: parseRivals(raw),
    empire: parseEmpire(raw),
    chapter: parseChapter(raw),
    bots: parseBots(raw),
    events: parseEvents(raw),
    agenda: parseAgenda(raw),
    family: parseFamily(raw),
    newspaper: parseNewspaper(raw),
    tutorial: parseTutorial(raw),
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
