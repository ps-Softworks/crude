// Spielzahlen aus content/balance.yaml. Die Simulation bekommt ein fertiges
// Objekt; parseBalance prüft es und meldet verständliche Fehler.
// Seit 0.2.15+5 gehört die Karte (content/map.yaml) mit dazu: parseGameData.

import { parseStocksBalance, type StocksBalance } from './stocksBalance'; // 4.8 Andockpunkt
import { parseDiplomacy, type DiplomacyBalance } from './diplomacyBalance'; // 4.10 Andockpunkt
// 4.15 Andockpunkt: Börse und Kauf auf Kredit.
import { parseExchangeBalance, type ExchangeBalance } from './exchangeBalance';
import { parseWorldMap, type WorldMap } from './worldMap';
import { PARTIES, PUBLIC_ACTS, type Party, type PublicAct } from './world';
import type { LawDef } from './laws';
// 4.6 Andockpunkt: Raffinerie (Zahlen und Prüfung in refineryBalance.ts).
import { parseRefineryBalance, type RefineryBalance } from './refineryBalance';
// 4.7 Andockpunkt: Fernleitungen.
import { parseBigPipelineBalance, type BigPipelineBalance } from './bigPipelineBalance';
import { parseStaff, type StaffBalance } from './staff'; // 4.9 Andockpunkt: Personal
// 4.11 Andockpunkt: Ermittler und Forschung lesen ihre Abschnitte selbst.
import { parseInvestigationBalance, type InvestigationBalance } from './investigation';
import { parseResearchBalance, type ResearchBalance } from './research';

// 4.14 Andockpunkt: Marke und Tankstellen – Zahlen liest src/sim/brand.ts selbst.
import { parseBrandBalance, type BrandBalance } from './brand';
// 4.16 Andockpunkt
import { parseHallstead, type HallsteadBalance } from './hallsteadBalance';
// Termine als Hauptwerkzeug (Etappe 1): Erkundung und Planungsbrett.
import { parseExplorationBalance, parsePlansBalance, type ExplorationBalance, type PlansBalance } from './plansBalance';
// Termine als Hauptwerkzeug, Etappe 2: Preis- und Transport-Aktionen.
import { parseBotPlans, parseFreightBalance, parsePriceActions, type BotPlans, type FreightBalance, type PriceActionsBalance } from './pricingBalance';
// Termine als Hauptwerkzeug, Etappe 3: gekoppelte Briefe.
import { parseLettersBalance, type LettersBalance } from './lettersBalance';
// 4.17 Andockpunkt: Kapitel 3 (Seismik, Konsortium, Projekte, Stand) prüft seinen Block selbst.
import { parseKapitel3Balance, type Kapitel3Balance } from './kapitel3Balance';
import { parseRivalsK3Balance, type RivalsK3Balance } from './rivalsK3';
import { parseFeldzugBalance, type FeldzugBalance } from './feldzug';
import { parseEventSystemsBalance, type EventSystemsBalance } from './eventSystems'; // 4.12

export type GeologyType = 'dry' | 'small' | 'gusher';

export interface Zone {
  name: string;
  maxDistance: number;
  /** Grundwert der Fundchance in dieser Zone (Etappe 1, öffentliches Wissen); vorher 1 − dry. */
  base: number;
  /** Öffentliches Wissen: Ø Fundchance der Zone – Startwert der Erkundung, Bullards Bild. */
  prior: number;
  /** Verhältnis kleiner Fund : Gusher, wenn Öl da ist (Summe beliebig > 0). */
  small: number;
  gusher: number;
}

/** Salzrücken (Etappe 1): Linien je Gebiet, an denen das Öl sitzt. */
export interface TrendBalance {
  perRegion: number;
  /** Bis zu diesem Abstand (Karteneinheiten) gilt eine Ranch als „auf dem Rücken“. */
  radius: number;
  bonus: number;
  offTrend: number;
  noise: number;
  qMin: number;
  qMax: number;
  /** Die Linie läuft durch einen Punkt in diesem Abstand vom Salzdom … */
  offsetMin: number;
  offsetMax: number;
  /** … und reicht so weit zu beiden Seiten. */
  halfLength: number;
}

export interface Range {
  min: number;
  max: number;
}

/** Größenklasse der Hofstellen: Anteil und Gewicht (in Abstand²) für die Zerlegung. */
export interface RanchSize {
  share: number;
  weight: number;
}

/** Ranches und Farmen (0.2.15+5): wie das bohrbare Land zerlegt wird. */
export interface RanchBalance {
  /** Abstand der Hofstellen in Karteneinheiten. */
  spacing: number;
  /** Zufälliger Versatz als Anteil des Abstands (0–1). */
  jitter: number;
  /** Runden Lloyd-Glättung. */
  relax: number;
  /** Kleiner als das wird kein Grundstück – das Land geht an die Nachbarn. */
  minArea: number;
  /** Kürzeste gemeinsame Kante, die als Nachbarschaft zählt. */
  minEdge: number;
  /** Fläche je Bohrplatz; zugleich die Fläche, für die Reserven und Pachtbonus aus balance.yaml gelten. */
  slotArea: number;
  maxSlots: number;
  sizes: RanchSize[];
}

export const LANDOWNER_TYPES = ['neutral', 'gierig', 'verschuldet', 'misstrauisch', 'fromm'] as const;
export type LandownerType = (typeof LANDOWNER_TYPES)[number];

/** Lage einer Parzelle zum nächsten bekannten Fund. */
export interface LeaseLocation {
  name: string;
  label: string;
  /** Höchster Abstand in Nachbarschaftsschritten (gemeinsame Grenze = 1), für den diese Lage gilt. */
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
  /**
   * Freie Startoptionen. Die erste liegt auf einer guten Ranch (0.4.20+1): wahre Fundchance
   * mindestens minChance (0–1) und angezeigte Prognose-Mitte mindestens minForecast (in %).
   */
  startOptions: { count: number; termRounds: number; minChance: number; minForecast: number };
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

/**
 * Bohrtürme (0.2.15+7, GDD §5): Jacob startet mit Silas' geliehenem
 * Seilschlag-Turm; weitere kauft (Lieferzeit) oder mietet er (Miete je Runde).
 * Dampfmaschine und Stahlgestänge machen einen Turm billiger und sicherer.
 */
export interface RigsBalance {
  /** Türme zu Spielbeginn – der erste ist Silas' geliehener. */
  start: number;
  /** Höchstens so viele Türme insgesamt (gekauft, gemietet, geliehen). */
  max: number;
  /** Kauf: Preis in $ und Runden bis zur Lieferung (0 = sofort). */
  buy: { cost: number; deliveryRounds: number };
  /** Miete: $ je Runde, ab sofort, Rückgabe jederzeit (wenn er nicht bohrt). */
  rent: { costPerRound: number };
  /** Buchwert gekaufter Türme im Imperiumswert als Anteil vom Kaufpreis. */
  assetShare: number;
  /** Dampfmaschine: Stufenkosten mal costFactor, roundsLess Runden schneller je Stufe (mindestens 1). */
  steam: { cost: number; costFactor: number; roundsLess: number };
  /** Stahlgestänge: Unfall- und Klemm-Chance mal riskFactor. */
  rods: { cost: number; riskFactor: number };
}

/** Pumpe an einer Quelle (0.2.15+7): mehr Rate, weniger Druckverlust, dafür Unterhalt. */
export interface PumpBalance {
  cost: number;
  /** $ je Runde, solange die Quelle fördert. */
  upkeep: number;
  /** Rate der Quelle mal rateFactor. */
  rateFactor: number;
  /** Anteil des Druckverlusts im Feld, den die Pumpe ausgleicht (0–1). */
  pressureKeep: number;
}

export interface DrillingBalance {
  rigs: RigsBalance;
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
  /** Pumpen an fündigen Quellen (0.2.15+7). */
  pump: PumpBalance;
}

/**
 * Transportwege (GDD §6): gemietetes Fuhrwerk, Thornes Bahn, eigene Fuhrwerke
 * und – nach dem Bau – die eigene Pipeline (0.2.15+2).
 */
export type TransportMode = 'wagon' | 'rail' | 'teams' | 'pipeline';
export const TRANSPORT_MODES: readonly TransportMode[] = ['wagon', 'rail', 'teams', 'pipeline'];

/** Käufer (0.2.15+2): der Crane Trust oder der unabhängige Händler in Port Ellis. */
export type Buyer = 'crane' | 'trader';
export const BUYERS: readonly Buyer[] = ['crane', 'trader'];

export interface TransportModeBalance {
  label: string;
  /** Fracht in $ je Barrel (bei der Bahn: Starttarif). */
  costPerBarrel: number;
  /** Höchstens so viele Barrel je Runde (eigene Fuhrwerke: je Gespann). */
  capacity: number;
}

/** Eigene Fuhrwerke: Fixkosten je Runde, billig je Barrel. */
export interface TeamsBalance extends TransportModeBalance {
  wagePerRound: number;
  hireCost: number;
  resale: number;
  maxTeams: number;
}

/** Kleine Pipeline zum Bahnhof/Hafen. */
export interface PipelineBalance extends TransportModeBalance {
  surveyCost: number;
  buildCost: number;
  buildRounds: number;
  upkeepPerRound: number;
  /** Wegerechte, die alle da sein müssen: Merkzeichen und Name. */
  /** Wegerechte: Merkzeichen, Name für den Schreibtisch und (0.2.15+5) die Figur, deren Ranch die Route kreuzt. */
  rights: { mark: string; label: string; figure?: string }[];
  sabotageChance: number;
  sabotageFactor: number;
  repairCost: number;
  repairRounds: number;
  guardsPerRound: number;
  guardsFactor: number;
}

/** Transport (GDD §6): Wege, Thorne, zweiter Käufer, Lager. */
export interface TransportBalance {
  wagon: TransportModeBalance;
  rail: TransportModeBalance;
  teams: TeamsBalance;
  pipeline: PipelineBalance;
  thorne: {
    /** Chance je Runde mit Bahnfracht, dass Thorne den Tarif erhöht. */
    hikeChance: number;
    /** Erhöhung in $ je Barrel. */
    hikeStep: number;
    /** Höchster Bahntarif in $ je Barrel. */
    maxTariff: number;
    volumeDiscount: number;
    minVolume: number;
    shortfallPenalty: number;
    exclusivePenalty: number;
    minTariff: number;
  };
  trader: { label: string; premium: number; capacity: number; grudgeCut: number; grudgeRounds: number };
  storage: {
    startCapacity: number;
    tankCapacity: number;
    tankCost: number;
    maxTanks: number;
    costPerBarrel: number;
    shrink: number;
    fireChance: number;
    fireLoss: number;
  };
  /** Anteil der Anlagekosten, der zum Imperiumswert zählt. */
  assetShare: number;
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
  /** Schrittweite der Regler für Kredit und Tilgung. */
  sliderStep: number;
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
  /** Runden ohne versäumte Zahlung, nach denen eine schlechte Note aus Ereignissen (ratingShift < 0) um eine Stufe verblasst (0.4.19+2; 0 = nie). */
  shiftRecoveryRounds: number;
  /**
   * Kreditkrise im Kapitel (4.20, GDD §8: „In Kreditkrisen kündigen Banken Kredite“): Bricht eine Bankpanik oder ein
   * Crash aus, kündigt die Bank share + leverage × Auslastung (Bankschulden ÷ Grundrahmen, höchstens 1) der Bankkredite –
   * sofort fällig, auch ins Minus der Kasse.
   */
  crisisCall: { share: number; leverage: number };
}

/** Bankrott: Frist, bevor es Konkurs gibt. */
/** Zeitsprünge (4.5, GDD §2/§13): vereinfachte Regeln zwischen den Kapiteln. */
export const STANCES = ['aggressive', 'balanced', 'cautious'] as const;
export type Stance = (typeof STANCES)[number];
export const FAMILY_TIMES = ['little', 'some', 'much'] as const;
export type FamilyTime = (typeof FAMILY_TIMES)[number];

export interface TimeskipBalance {
  /** Ausgangslage „schwach“ (0.4.19+2): weniger fördernde Quellen oder weniger Imperiumswert (K2/K3) nach dem Sprung. */
  weakStart: { wells: number; value2: number; value3: number };
  /** Quartale im Zeitsprung I. */
  rounds: number;
  /** Runden des nächsten Kapitels (Platzhalter). */
  nextChapterRounds: number;
  reserve: Record<Stance, number>;
  invest: Record<Stance, number>;
  minChance: Record<Stance, number>;
  borrow: Record<Stance, number>;
  repay: Record<Stance, number>;
  /** Höchstens so viele neue Bohrungen je Jahr, je Haltung. */
  maxNewWells: Record<Stance, number>;
  /** Nachbarbezirke, die der Verwalter höchstens erschließt, wenn am offenen Land nichts mehr lohnt. */
  expand: Record<Stance, number>;
  /** $ je erschlossenem Bezirk. */
  expandCost: number;
  upkeepPerWell: number;
  /**
   * 0.4.19+3: Deckel für die Bohrungen des Verwalters – höchstens so viele neue Quellen je Sprung wie vorher
   * förderten (mindestens minNewWells), Anfangsrate höchstens der Schnitt von Jacobs Quellen (mindestens minRate).
   */
  manager: { minNewWells: number; minRate: number };
  family: {
    bond: Record<FamilyTime, number>;
    growth: Record<FamilyTime, number>;
    /** Faktor auf maxNewWells (abgerundet, mindestens 1). */
    wells: Record<FamilyTime, number>;
    /** Faktor auf den Verkaufserlös (Aufsicht: Preise, Schwund, Diebstahl). */
    revenue: Record<FamilyTime, number>;
    /** Chance je Jahr für die Clara-Weiche – nur der Zeitpunkt; im letzten Jahr kommt sie sicher. */
    claraChance: Record<FamilyTime, number>;
    claraFromYear: number;
    claraStart: number;
    claraBond: number;
  };
  neighbours: { decline: number; entryPrice: number; entryRate: number };
  crisis: { callShare: number; callLeverage: number; rideCall: number; rideStopYears: number; fireSale: number };
  switches: {
    panicRepay: number;
    rideBorrow: number;
    automobileYear: number;
    automobileCost: number;
    automobilePremium: number;
    okaraFromYear: number;
    okaraChance: number;
    okaraCost: number;
    okaraSuccess: number;
    okaraIncome: number;
    okaraValueQuarters: number;
  };
  rival: { drillChance: number; drillCost: number };
  /** Zeitsprung II (4.19). */
  second: {
    refineryMargin: number;
    harborFreight: number;
    warFromYear: number;
    warTension: number;
    warPremium: number;
    warLossChance: number;
    warLossCost: number;
    navyYear: number;
    /** $ je verkauftem Barrel über dem Marktpreis (Festpreis der Marine). */
    navyPremium: number;
    gradyYear: number;
    gradyChance: number;
    gradyCost: number;
    gradyIncome: number;
    gradyTrace: number;
    collegeYear: number;
    collegeCost: number;
    collegeBond: number;
  };
}

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
  /** Kapitel 2 (4.12, GDD §13/§14): Kapitelprüfung und frühes Ende „Geschluckt“. */
  chapter2: {
    goalValue: number;
    goalControl: number;
    swallowedControl: number;
  };
  /** Kapitel 3 (4.19, GDD §13): mindestens dieses Rating am Kapitelende (die Marke prüft brand.goal). */
  chapter3: {
    minRating: Rating;
  };
  /**
   * Verfehlte Kapitelprüfung (0.4.19+2, GDD §2: „startet das nächste Kapitel geschwächt“):
   * Am Start des nächsten Kapitels fehlt dieser Anteil der Kasse (Verwalter, misstrauische Bank)
   * und Jacob hat so viel Kraft weniger.
   */
  missed: { cashShare: number; strength: number };
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
  /** Zeitsprung I (4.5): so viele Kapitelenden des Standard-Bots springen mit allen Direktiven. */
  timeskipEnds: number;
  /** vorsichtig: Fundchance ab minChance, Rücklage cashReserve, höchstens Stufe maxStage. */
  cautious: { minChance: number; cashReserve: number; maxStage: number };
  /** gierig: pachtet ab minChance. */
  /** maxUndrilled: so viele ungebohrte Pachten hält er höchstens – mehr schafft der Turm nicht. */
  greedy: { minChance: number; maxUndrilled: number };
  /** zufällig: so viele Aktionen je Runde; mit logisticsChance je Runde eine zufällige Anschaffung (0.2.15+4). */
  random: { actionsPerRound: number; logisticsChance: number };
  /**
   * ausgewogen (2.15, Standard-Bot): wie vorsichtig, leiht aber bis maxDebtShare des Bankrahmens;
   * im Notfall (nur trockene Löcher, kein Land) bis emergencyDebtShare.
   */
  balanced: { minChance: number; cashReserve: number; maxStage: number; maxDebtShare: number; emergencyDebtShare: number; maxUndrilled: number };
  /** Tage je Runde (Quartal) – für die Anfangsrate in bbl/Tag. */
  daysPerRound: number;
  /** Wie die Bots Ereignisse bewerten (2.15). */
  events: Record<'cautious' | 'greedy' | 'balanced', BotEventWeights>;
  /** Wie die planenden Bots Lager und Transportwege nutzen (0.2.15+4). */
  transport: Record<'cautious' | 'greedy' | 'balanced', BotTransport>;
  /** Grobe Schätzung in $, was die Wegerechte für die Pipeline zusammen kosten (Planung der Bots). */
  rightsEstimate: number;
  /** Wie die planenden Bots in Türme, Bohrlöcher und Pumpen investieren (0.2.15+7). */
  invest: Record<'cautious' | 'greedy' | 'balanced', BotInvest>;
  /**
   * Erkundung (Etappe 1): Solange der Bot weniger als known bezahlbare freie Ranches kennt, die
   * mindestens until versprechen, reitet er bis zu rides Mal je Runde übers Land (Karte „Übers Land reiten“).
   */
  explore: Record<'cautious' | 'greedy' | 'balanced', { rides: number; until: number; known: number }>;
  /** Zielwerte Kapitel 1 (2.15): Toleranzbereich je Kennzahl. */
  targets: Record<BotTargetId, { min: number; max: number }>;
  /** Kampagnen-Bots (4.20): wie jede Strategie Zeitsprünge, Kapitel 2 und Kapitel 3 spielt. */
  campaign: {
    /** Kampagnen je Strategie (npm run kampagne). */
    games: number;
    cautious: CampaignBotPolicy;
    greedy: CampaignBotPolicy;
    balanced: CampaignBotPolicy;
    /** Zufalls-Bot: Chance je Runde, dass er Raffinerie, Marke und Tankstellen anfasst. */
    randomSystemsChance: number;
  };
  /** Zielwerte Kapitel 1–3 (4.20, GDD §15/§17): Toleranzbereich je Kennzahl (src/sim/campaignBots.ts). */
  campaignTargets: Record<CampaignTargetId, { min: number; max: number }>;
}

/** Wie ein Bot die späteren Kapitel spielt (4.20, src/sim/campaignBots.ts). */
export interface CampaignBotPolicy {
  /** Direktiven in beiden Zeitsprüngen. */
  stance: Stance;
  family: FamilyTime;
  /** Anteil, den er am Ende von Kapitel 1 an der Börse verkauft (0 = Familienfirma; sonst der nächste erlaubte Anteil). */
  ipo: number;
  /** Antwort je Weiche der Zeitsprünge (Weichen-id → Antwort, geprüft in campaignBots.test.ts; zu teure Antworten ersetzt er durch die andere). */
  answers: Readonly<Record<string, string>>;
  /** So viel $ bleiben in der Kasse, bevor er Raffinerie, Marke, Tankstellen oder Aktien kauft. */
  reserve: number;
  /** Höchstens so viele Tankstellen je Runde. */
  perRound: number;
  /** Chance je Runde, dass er Raffinerie, Marke und Tankstellen anfasst (planende Bots: 1). */
  systemsChance: number;
  /** Börse (Kapitel 3): Anteil des freien Geldes je Kauf, Hebel, verkauft bei Warnung der Zeitung – oder null (nie). */
  exchange: { share: number; leverage: number; sellOnWarning: boolean } | null;
  /**
   * Anleihen (Kapitel 2/3, 0.4.20+6): gibt je Runde eine Anleihe aus (größte, die passt; kürzeste Laufzeit), solange
   * alle Anleihen zusammen unter load × Anleihen-Rahmen bleiben – Wachstum auf Pump (GDD §15). Fehlt/null: nie.
   */
  bonds?: { load: number } | null;
  /**
   * Aktienbuch (Kapitel 2/3): Räte umstimmen und Aktien zurückkaufen, sobald Thorne thorneFrom der Aktien hält
   * oder die Kontrolle unter controlBelow fällt – höchstens buyback der Aktien je Runde; null = wehrt sich nicht.
   */
  defend: { thorneFrom: number; controlBelow: number; buyback: number } | null;
  /**
   * Cranes Feldzug (Kapitel 3, 0.4.20+8): pact = nimmt Margarets Preisliste, loan = nimmt Thornes Geld, sobald die
   * Kasse unter die Rücklage fällt, sellBelow = verkauft im Krieg Tankstellen (schlechteste Region zuerst), solange die
   * Kasse darunter liegt. Fehlt/null: hält einfach durch.
   */
  feldzug?: { pact: boolean; loan: boolean; sellBelow: number } | null;
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

/** Investitions-Charakter eines Bots (0.2.15+7, src/sim/bots.ts). */
export interface BotInvest {
  /** Pumpe nur, wenn sie sich in höchstens so vielen Runden bezahlt macht (0 = nie). */
  pumpPayback: number;
  /** Weiteres Bohrloch nur bei Amortisation in höchstens so vielen Runden (0 = nie). */
  wellPayback: number;
  /** So viele Türme hält er höchstens (Silas' Turm mitgezählt). */
  rigs: number;
  /** Zusätzliche Türme mieten statt kaufen. */
  rent: boolean;
  /** Dampfmaschine nachrüsten. */
  steam: boolean;
  /** Stahlgestänge nachrüsten. */
  rods: boolean;
}

/** Transport-Charakter eines Bots (0.2.15+4, src/sim/bots.ts). */
export interface BotTransport {
  /** Händler in Port Ellis: nie, immer (wenn er mehr zahlt) oder nach Rechnung (Aufschlag gegen Cranes Groll). */
  trader: 'never' | 'always' | 'calc';
  /** Eigene Fuhrwerke: nie, nur wenn alle Wege voll sind, oder sobald sie billiger sind als die Bahn. */
  teams: 'never' | 'overflow' | 'cheaper';
  /** Tanks bauen, bevor die nächste Förderung überläuft. */
  tanks: boolean;
  /** Pipeline nur, wenn die erwartete Ersparnis das Wievielfache der Kosten bringt; 0 = nie. */
  pipelinePayback: number;
  /** Thornes Frachtvertrag: Exklusiv, Mengenrabatt (nur wenn die Menge reicht), nach Rechnung oder ablehnen. */
  thorne: 'exclusive' | 'volume' | 'calc' | 'refuse';
  /** Wachleute an der Pipeline: nie, immer oder nur, wenn Jacob Feinde hat. */
  guards: 'never' | 'always' | 'enemies';
  /** Steigt der Preis, bleibt dieser Anteil des Tanks liegen (Timing); 0 = immer alles verkaufen. */
  holdShare: number;
  /** Nur verkaufen, wenn nach Fracht und Förderzins etwas übrig bleibt; false: Hauptsache, der Preis deckt die Fracht. */
  margin: boolean;
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
  'routeShare',
  'pipelineSuccess',
  'expandedShare',
  'investGain',
  'allOutWins',
] as const;
export type BotTargetId = (typeof BOT_TARGET_IDS)[number];

/** Kennzahlen mit Zielwert über Kapitel 1–3 (4.20, GDD §15/§17); gemessen in src/sim/campaignBots.ts. */
export const CAMPAIGN_TARGET_IDS = [
  'creditCrises',
  'gluts',
  'wars',
  'standardSurvives',
  'standardBankruptK2',
  'standardBankruptK3',
  'greedyBankrupt',
  'greedyCrisisRisk',
  'standardGoalK2',
  'standardGoalK3',
  'growthK2',
  'growthK3',
  'cautiousBehind',
  'winRate',
  'fairWinRate',
  'stanceWin',
] as const;
export type CampaignTargetId = (typeof CAMPAIGN_TARGET_IDS)[number];

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
  /** Etappe 1: So viel von der Wahrheit (q − Zonenwissen) ahnt Bullard – ein alter Wildcatter kennt das Land (0 = nichts, 1 = alles). */
  insight: number;
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
/** Weltmodell (4.1, GDD §7.1): Zahlen der neun Weltgrößen, Details in content/balance.yaml. */
/** Wirkung einer öffentlichen Tat (4.2): Stimmungspunkte und Anteile je Partei (vor dem Normieren). */
export type ActEffect = { mood: number } & Record<Party, number>;

/** Gesetzgebung (4.3): Druck, Antrag, Debatte, Abstimmung; dazu der Marktanteil des Trusts und (vorbereitet) die Lobby. */
export interface LawsBalance {
  /** Druck je Runde = alter Druck × decay + Druckpunkte der erfüllten Gründe. */
  decay: number;
  /** Chance je Runde auf einen Antrag, sobald der Druck die Schwelle des Gesetzes erreicht. */
  proposeChance: number;
  /** Höchstens so viele Anträge gleichzeitig im Parlament. */
  maxOpen: number;
  /** Runden vom Antrag bis zur Abstimmung. */
  debateRounds: Range;
  voteNoise: number;
  /** „Knapp“ in der Debatte, wenn die erwartete Zustimmung näher als so viel an 50 % liegt. */
  closeVote: number;
  /** Nach einer Niederlage: so viele Runden kein neuer Antrag, Druck × failPressure. */
  cooldown: number;
  failPressure: number;
  /**
   * Marktanteil des größten Konzerns (Crane Trust). government = Verschiebung je Runde
   * unter dieser Regierung (Handel lässt wachsen, Volksbund beaufsichtigt), credit =
   * Übernahmen bei billigem Geld: × (Kreditklima − 50) ÷ 50 je Runde.
   */
  trust: { start: Range; base: number; revert: number; government: Record<Party, number>; credit: number; crash: number; glut: number; noise: number; min: number; max: number };
  /** Vorbereitet (ab Kapitel 2): Stärke der Lobby-Züge. */
  lobby: { demand: number; block: number; delay: number };
}

export interface WorldModelBalance {
  start: {
    tech: Range;
    credit: Range;
    mood: Range;
    tension: Range;
    nationalism: Range;
    handel: Range;
    volksbund: Range;
    provinz: Range;
  };
  supply: {
    elasticity: number;
    stockNorm: number;
    stockMax: number;
    stockWeight: number;
    utilBase: number;
    utilSlope: number;
    utilMin: number;
    depletion: number;
    investSlope: number;
    investMax: number;
    delay: number;
    creditInvest: number;
    findChance: number;
    findSize: Range;
  };
  demand: { growth: number; cap: number; techBoost: number; crashDrop: number; warBoost: number; armsDemand: number };
  price: { min: number; max: number; techCost: number; trendMin: number };
  tech: { rate: number };
  credit: {
    boom: number;
    speculation: number;
    revert: number;
    noise: number;
    handel: number;
    volksbund: number;
    provinz: number;
    crashFrom: number;
    crashChance: number;
    crashSlope: number;
    priceTrigger: number;
    priceTriggerFrom: number;
    after: number;
    pipelineCut: number;
    investCut: number;
    rounds: Range;
    /** 4.4 Kreditzyklus: Phasen-Schwellen, Bankpanik und Verschuldung (leverage). */
    boomFrom: number;
    tightFrom: number;
    panicAfter: number;
    panicRounds: Range;
    panicPipelineCut: number;
    panicInvestCut: number;
    leverage: { base: number; build: number; decay: number; start: number; bubbleFrom: number; crashFrom: number; crashAfter: number; panicAfter: number };
  };
  mood: { speed: number; price: number; crash: number; panic: number; war: number; boom: number; noise: number };
  politics: { drift: number; noise: number; minShare: number; fatigue: number; revert: number; electionEvery: number };
  /**
   * Öffentliches Handeln (4.2): je Tat Stimmungspunkte und Verschiebung der
   * Parteianteile; je Runde höchstens ± maxMood bzw. ± maxParty je Partei.
   */
  acts: { maxMood: number; maxParty: number } & Record<PublicAct, ActEffect>;
  /** Parteiprogramme (4.2): scrutiny = Gewicht der Verfehlungen (Stimmung nach unten), solange die Partei regiert. */
  programs: Record<Party, { scrutiny: number }>;
  /** Gesetzgebung (4.3, GDD §10): Ablauf im Parlament; die Gesetze selbst stehen in content/laws/ (Balance.laws). */
  laws: LawsBalance;
  tension: {
    base: number;
    revert: number;
    scarcity: number;
    scarcityFrom: number;
    arms: number;
    armsFrom: number;
    nationalism: number;
    nationalismFrom: number;
    noise: number;
    warFrom: number;
    warChance: number;
    warSlope: number;
    warRounds: Range;
    afterWar: number;
  };
  nationalism: {
    base: number;
    revert: number;
    drift: number;
    tension: number;
    noise: number;
    nationalizeFrom: number;
    nationalizeChance: number;
    nationalizeLoss: number;
    after: number;
  };
  /** 4.4 Außenspannung jenseits von Aldmark–Varenhold: Costa Negra (Aufstand) und Qasir (Embargo). */
  foreign: { costaNegra: CostaNegraBalance; qasir: QasirBalance };
  chapter1: {
    priceWeight: number;
    priceMaxDev: number;
    rateWeight: number;
    crashRate: number;
    /** 4.4: Zinsaufschlag in der Bankpanik und bei Überhitzung. */
    panicRate: number;
    bubbleRate: number;
    rateMaxAdd: number;
    /** 4.4: Faktor auf den Bankrahmen je Phase des Kreditzyklus. */
    limit: Record<CreditPhase, number>;
    nationalBarrels: number;
  };
  /**
   * pollFrom (4.2): so viele Runden vor der Wahl bringt die Zeitung eine Umfrage;
   * pollClose: Liegen die beiden Ersten näher als so viel Anteil beieinander, meldet sie „Kopf an Kopf“.
   */
  news: { creditEasy: number; creditTight: number; moodAngry: number; tensionHigh: number; unrestHigh: number; qasirHigh: number; pollFrom: number; pollClose: number };
}

/** Phasen des Kreditzyklus (4.4, GDD §7.2): Boom → Überhitzung → Panik oder Crash. */
export const CREDIT_PHASES = ['crash', 'panic', 'tight', 'normal', 'boom', 'overheated'] as const;
export type CreditPhase = (typeof CREDIT_PHASES)[number];

export interface CostaNegraBalance {
  start: Range;
  base: number;
  revert: number;
  poverty: number;
  povertyFrom: number;
  nationalism: number;
  nationalismFrom: number;
  meddling: number;
  meddlingFrom: number;
  noise: number;
  uprisingFrom: number;
  uprisingChance: number;
  uprisingSlope: number;
  rounds: Range;
  after: number;
  share: number;
  loss: number;
}

export interface QasirBalance {
  start: Range;
  base: number;
  revert: number;
  courting: number;
  courtingFrom: number;
  war: number;
  nationalism: number;
  nationalismFrom: number;
  noise: number;
  embargoFrom: number;
  embargoChance: number;
  embargoSlope: number;
  rounds: Range;
  after: number;
  shareBase: number;
  shareGrowth: number;
  shareMax: number;
}

export interface Balance {
  rivals: RivalsBalance;
  /** Rivalen-Diplomatie und Crane-Nachfolge (4.10, src/sim/diplomacyBalance.ts). */
  diplomacy: DiplomacyBalance; // 4.10 Andockpunkt
  start: { cash: number; year: number; rounds: number };
  /** Karte aus content/map.yaml (beim Laden als raw.world übergeben). */
  world: WorldMap;
  ranches: RanchBalance;
  geology: {
    zones: Zone[];
    trends: TrendBalance;
    reserves: { small: Range; gusher: Range };
  };
  lease: LeaseBalance;
  forecast: ForecastBalance;
  /** Erkundung (Etappe 1): Hinweise, Wissensstufen, Geologen. */
  exploration: ExplorationBalance;
  /** Planungsbrett (Etappe 1): Zahlen der Karten. */
  plans: PlansBalance;
  /** Preis-Aktionen (Etappe 2): Förderbremse, Liefervertrag, Gerüchte, Crane, Ruf bei den Wildcattern. */
  priceActions: PriceActionsBalance;
  /** Transport-Aktionen (Etappe 2, balance.yaml transport.negotiation): Thorne, Brennan, Transportgemeinschaft. */
  freight: FreightBalance;
  /** Welche Preis- und Fracht-Karten die Bots spielen (balance.yaml bots.plans). */
  botPlans: Record<'cautious' | 'greedy' | 'balanced', BotPlans>;
  /** Gekoppelte Briefe (Etappe 3, src/sim/letters.ts). */
  letters: LettersBalance;
  drilling: DrillingBalance;
  production: ProductionBalance;
  market: MarketBalance;
  transport: TransportBalance;
  credit: CreditBalance;
  bankruptcy: BankruptcyBalance;
  empire: EmpireBalance;
  chapter: ChapterBalance;
  timeskip: TimeskipBalance;
  bots: BotsBalance;
  events: EventsBalance;
  agenda: AgendaBalance;
  family: FamilyBalance;
  newspaper: NewspaperBalance;
  tutorial: TutorialBalance;
  // 4.16 Andockpunkt: Nebeninvestments und Lobbyist in Hallstead.
  hallstead: HallsteadBalance;
  worldModel: WorldModelBalance;
  /** Gesetzeskatalog aus content/laws/ (4.3), beim Laden über parseGameData übergeben; ohne ihn tagt kein Parlament. */
  laws: readonly LawDef[];
  /** 4.6 Andockpunkt: Raffinerie und Produktmix (ab Kapitel 2). */
  refinery: RefineryBalance;
  /** 4.7 Andockpunkt: Fernleitungen (Kapitel 2+), Abschnitt bigPipelines. */
  bigPipelines: BigPipelineBalance;
  /** Aktien, Aufsichtsrat, Anleihen ab Kapitel 2 (GDD §8). */
  stocks: StocksBalance; // 4.8 Andockpunkt
  /** 4.9 Andockpunkt: Personal (Kapitel 2). */
  staff: StaffBalance;
  // 4.11 Andockpunkt: Ermittler (Delaney, Hitze) und Forschung (Technikstufe II), ab Kapitel 2.
  investigation: InvestigationBalance;
  research: ResearchBalance;
  /** 4.14 Andockpunkt: Marke und Tankstellen (Kapitel 3). */
  brand: BrandBalance;
  // 4.15 Andockpunkt: Börse und Kauf auf Kredit (eigener Abschnitt, gelesen in exchangeBalance.ts).
  exchange: ExchangeBalance;
  /** 4.17 Andockpunkt: Kapitel 3 – Seismik, Konsortium, Projekte, Stand (src/sim/kapitel3Balance.ts). */
  kapitel3: Kapitel3Balance;
  /** Rivalen in Kapitel 3 (4.19). */
  rivalsK3: RivalsK3Balance;
  /** 0.4.20+8: Cranes Feldzug in Kapitel 3 (src/sim/feldzug.ts). */
  feldzug: FeldzugBalance;
  /** 4.12: Systemwirkungen der Ereignisse (src/sim/eventSystems.ts). */
  eventSystems: EventSystemsBalance;
}

/** Einstieg (2.13): Tutorial-Hinweise in den ersten Runden. */
export interface TutorialBalance {
  /** Spätestens nach dieser Runde schweigen die Hinweise. */
  lastRound: number;
  /** Die Hinweise enden, sobald eine eigene Quelle so viele Runden gefördert hat (2 = nach der ersten Verkaufsrunde). */
  endAfterProducedRounds: number;
  /** Tiefer bohren rät der Hinweis nur, wenn der Geologe der nächsten Stufe mindestens so viel % gibt. */
  deeperMinChance: number;
  /** So viele $ Pacht ist dem Hinweis ein Prozentpunkt Schätzung wert (teure Pacht nur, wenn sie deutlich besser aussieht). */
  dollarsPerPoint: number;
  /** Kredite, die der Hinweis vorschlägt, werden auf so viele $ aufgerundet. */
  loanRounding: number;
  /** Etappe 1: Liegt die beste bezahlbare Empfehlung unter so viel %, rät der Hinweis erst zum Ritt übers Land. */
  exploreBelow: number;
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
  /** Befristete Nachwirkungen (0.2.15+3): price, production, leaseCost gelten so viele Runden (die Antwortrunde mitgezählt). */
  timedRounds: number;
  /** Prüfung schwacher Antworten (0.2.15+3, tools/ereignisWirkung.ts). */
  relevance: RelevanceBalance;
}

/** Ab wann eine Ereignis-Antwort als spürbar gilt (0.2.15+3). */
export interface RelevanceBalance {
  /** Typisches Geld eines Kapitels in $ – Bezugsgröße für die Schwelle. */
  chapterMoney: number;
  /** Anteil davon, ab dem eine Wirkung spürbar ist (0,02 = 2 %). */
  minShare: number;
  /** Typische Barrel, die Jacob je Runde verkauft – um Preis, Förderung und Tarif in $ umzurechnen. */
  refBarrels: number;
  /** Typischer Pachtbonus in $, den Jacob in timedRounds Runden zahlt – für leaseCost. */
  refLeaseSpend: number;
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
  /** Etappe 3: Höchstens so viele Briefe je Rivale und Runde (sichere Briefe kommen trotzdem, zählen aber mit). */
  perRival: number;
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
      minChance: share(raw, 'lease.startOptions.minChance'),
      minForecast: num(raw, 'lease.startOptions.minForecast'),
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
  const rigs: RigsBalance = {
    start: positiveInt(raw, 'drilling.rigs.start'),
    max: positiveInt(raw, 'drilling.rigs.max'),
    buy: { cost: nonNegative(raw, 'drilling.rigs.buy.cost'), deliveryRounds: nonNegative(raw, 'drilling.rigs.buy.deliveryRounds') },
    rent: { costPerRound: nonNegative(raw, 'drilling.rigs.rent.costPerRound') },
    assetShare: share(raw, 'drilling.rigs.assetShare'),
    steam: {
      cost: nonNegative(raw, 'drilling.rigs.steam.cost'),
      costFactor: share(raw, 'drilling.rigs.steam.costFactor'),
      roundsLess: nonNegative(raw, 'drilling.rigs.steam.roundsLess'),
    },
    rods: { cost: nonNegative(raw, 'drilling.rigs.rods.cost'), riskFactor: share(raw, 'drilling.rigs.rods.riskFactor') },
  };
  if (rigs.start > rigs.max) throw new BalanceError('balance.yaml: "drilling.rigs.start" darf nicht über "drilling.rigs.max" liegen');
  if (!Number.isInteger(rigs.buy.deliveryRounds) || !Number.isInteger(rigs.steam.roundsLess)) {
    throw new BalanceError('balance.yaml: Lieferzeit und Dampf-Ersparnis der Türme müssen ganze Runden sein');
  }
  return { rigs, accidentCost, fishingCost, stages };
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
    pump: parsePump(raw),
  };
}

function parsePump(raw: unknown): PumpBalance {
  const rateFactor = num(raw, 'production.pump.rateFactor');
  if (rateFactor < 1) throw new BalanceError('balance.yaml: "production.pump.rateFactor" muss mindestens 1 sein');
  return {
    cost: nonNegative(raw, 'production.pump.cost'),
    upkeep: nonNegative(raw, 'production.pump.upkeep'),
    rateFactor,
    pressureKeep: share(raw, 'production.pump.pressureKeep'),
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
  const t = 'transport.teams';
  const teams: TeamsBalance = {
    ...parseTransportMode(raw, 'teams'),
    wagePerRound: nonNegative(raw, `${t}.wagePerRound`),
    hireCost: nonNegative(raw, `${t}.hireCost`),
    resale: share(raw, `${t}.resale`),
    maxTeams: positiveInt(raw, `${t}.maxTeams`),
  };
  const p = 'transport.pipeline';
  const rights = list(raw, `${p}.rights`);
  if (rights.some((r) => typeof (r as { mark?: unknown })?.mark !== 'string' || !/^[a-z0-9_]+$/.test((r as { mark: string }).mark))) {
    throw new BalanceError(`balance.yaml: "${p}.rights" muss eine Liste mit mark (Merkzeichen) und label sein`);
  }
  const pipeline: PipelineBalance = {
    ...parseTransportMode(raw, 'pipeline'),
    surveyCost: nonNegative(raw, `${p}.surveyCost`),
    buildCost: nonNegative(raw, `${p}.buildCost`),
    buildRounds: positiveInt(raw, `${p}.buildRounds`),
    upkeepPerRound: nonNegative(raw, `${p}.upkeepPerRound`),
    rights: rights.map((r, i) => {
      const recht: { mark: string; label: string; figure?: string } = { mark: (r as { mark: string }).mark, label: text(r, 'label', `${p}.rights.${i}`) };
      const figure = (r as { figure?: unknown }).figure;
      if (figure !== undefined) recht.figure = text(r, 'figure', `${p}.rights.${i}`);
      return recht;
    }),
    sabotageChance: share(raw, `${p}.sabotageChance`),
    sabotageFactor: nonNegative(raw, `${p}.sabotageFactor`),
    repairCost: nonNegative(raw, `${p}.repairCost`),
    repairRounds: positiveInt(raw, `${p}.repairRounds`),
    guardsPerRound: nonNegative(raw, `${p}.guardsPerRound`),
    guardsFactor: share(raw, `${p}.guardsFactor`),
  };
  const h = 'transport.thorne';
  const thorne = {
    hikeChance,
    hikeStep,
    maxTariff,
    volumeDiscount: nonNegative(raw, `${h}.volumeDiscount`),
    minVolume: nonNegative(raw, `${h}.minVolume`),
    shortfallPenalty: nonNegative(raw, `${h}.shortfallPenalty`),
    exclusivePenalty: nonNegative(raw, `${h}.exclusivePenalty`),
    minTariff: nonNegative(raw, `${h}.minTariff`),
  };
  if (thorne.minTariff > rail.costPerBarrel) {
    throw new BalanceError('balance.yaml: "transport.thorne.minTariff" liegt über dem Starttarif der Bahn');
  }
  const r = 'transport.trader';
  const traderBlock = (raw as { transport?: Record<string, unknown> })?.transport?.trader;
  const trader = {
    label: text(traderBlock, 'label', r),
    premium: nonNegative(raw, `${r}.premium`),
    capacity: positiveInt(raw, `${r}.capacity`),
    grudgeCut: nonNegative(raw, `${r}.grudgeCut`),
    grudgeRounds: positiveInt(raw, `${r}.grudgeRounds`),
  };
  const s = 'transport.storage';
  const storage = {
    startCapacity: positiveInt(raw, `${s}.startCapacity`),
    tankCapacity: positiveInt(raw, `${s}.tankCapacity`),
    tankCost: nonNegative(raw, `${s}.tankCost`),
    maxTanks: positiveInt(raw, `${s}.maxTanks`),
    costPerBarrel: nonNegative(raw, `${s}.costPerBarrel`),
    shrink: share(raw, `${s}.shrink`),
    fireChance: share(raw, `${s}.fireChance`),
    fireLoss: share(raw, `${s}.fireLoss`),
  };
  return { wagon, rail, teams, pipeline, thorne, trader, storage, assetShare: share(raw, 'transport.assetShare') };
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
    sliderStep: positiveInt(raw, 'credit.sliderStep'),
    limitBase: num(raw, 'credit.limitBase'),
    limitPerWell: num(raw, 'credit.limitPerWell'),
    rates,
    collateralDiscount: nonNegativeShare(raw, 'credit.collateralDiscount'),
    unsecuredAdd: nonNegativeShare(raw, 'credit.unsecuredAdd'),
    usageC,
    usageD,
    missedC,
    missedD,
    shiftRecoveryRounds: nonNegativeInt(raw, 'credit.shiftRecoveryRounds'),
    crisisCall: { share: nonNegativeShare(raw, 'credit.crisisCall.share'), leverage: nonNegativeShare(raw, 'credit.crisisCall.leverage') },
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

/** Ganze Zahl ≥ 0. */
function nonNegativeInt(obj: unknown, path: string): number {
  const value = num(obj, path);
  if (!Number.isInteger(value) || value < 0) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 0 sein`);
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
    insight: share(raw, `${p}.insight`),
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

function ratingAt(raw: unknown, path: string): Rating {
  const v = path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), raw);
  if (!(RATINGS as readonly unknown[]).includes(v)) throw new BalanceError(`balance.yaml: "${path}" muss ${RATINGS.join(', ')} sein`);
  return v as Rating;
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
    chapter2: {
      goalValue: num(raw, 'chapter.chapter2.goalValue'),
      goalControl: share(raw, 'chapter.chapter2.goalControl'),
      swallowedControl: share(raw, 'chapter.chapter2.swallowedControl'),
    },
    chapter3: { minRating: ratingAt(raw, 'chapter.chapter3.minRating') },
    missed: { cashShare: share(raw, 'chapter.missed.cashShare'), strength: nonNegative(raw, 'chapter.missed.strength') },
  };
}

function parseTimeskip(raw: unknown): TimeskipBalance {
  const block = (raw as { timeskip?: unknown })?.timeskip;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "timeskip" fehlt');
  const p = (key: string) => `timeskip.${key}`;
  const jeHaltung = (key: string, lesen: (o: unknown, path: string) => number) =>
    Object.fromEntries(STANCES.map((s) => [s, lesen(raw, p(`${key}.${s}`))])) as Record<Stance, number>;
  const jeFamilie = (key: string, lesen: (o: unknown, path: string) => number) =>
    Object.fromEntries(FAMILY_TIMES.map((f) => [f, lesen(raw, p(`family.${key}.${f}`))])) as Record<FamilyTime, number>;
  const jahr = (key: string) => {
    const v = positiveInt(raw, p(key));
    if (v < 5 || v > 10) throw new BalanceError(`balance.yaml: "${p(key)}" muss ein Jahr im Zeitsprung I (5–10) sein`);
    return v;
  };
  const jahr2 = (key: string) => {
    const v = positiveInt(raw, p(key));
    if (v < 15 || v > 20) throw new BalanceError(`balance.yaml: "${p(key)}" muss ein Jahr im Zeitsprung II (15–20) sein`);
    return v;
  };
  const t: TimeskipBalance = {
    rounds: positiveInt(raw, p('rounds')),
    nextChapterRounds: positiveInt(raw, p('nextChapterRounds')),
    reserve: jeHaltung('reserve', nonNegative),
    invest: jeHaltung('invest', share),
    minChance: jeHaltung('minChance', share),
    borrow: jeHaltung('borrow', share),
    repay: jeHaltung('repay', share),
    maxNewWells: jeHaltung('maxNewWells', positiveInt),
    expand: jeHaltung('expand', nonNegativeInt),
    expandCost: nonNegative(raw, p('expandCost')),
    weakStart: { wells: nonNegativeInt(raw, p('weakStart.wells')), value2: nonNegative(raw, p('weakStart.value2')), value3: nonNegative(raw, p('weakStart.value3')) },
    upkeepPerWell: nonNegative(raw, p('upkeepPerWell')),
    manager: { minNewWells: nonNegativeInt(raw, p('manager.minNewWells')), minRate: nonNegative(raw, p('manager.minRate')) },
    family: {
      bond: jeFamilie('bond', num),
      growth: jeFamilie('growth', nonNegative),
      wells: jeFamilie('wells', nonNegative),
      revenue: jeFamilie('revenue', nonNegative),
      claraChance: jeFamilie('claraChance', share),
      claraFromYear: jahr('family.claraFromYear'),
      claraStart: nonNegative(raw, p('family.claraStart')),
      claraBond: nonNegative(raw, p('family.claraBond')),
    },
    neighbours: {
      decline: share(raw, p('neighbours.decline')),
      entryPrice: nonNegative(raw, p('neighbours.entryPrice')),
      entryRate: nonNegative(raw, p('neighbours.entryRate')),
    },
    crisis: {
      callShare: share(raw, p('crisis.callShare')),
      callLeverage: nonNegative(raw, p('crisis.callLeverage')),
      rideCall: share(raw, p('crisis.rideCall')),
      rideStopYears: nonNegativeInt(raw, p('crisis.rideStopYears')),
      fireSale: share(raw, p('crisis.fireSale')),
    },
    switches: {
      panicRepay: share(raw, p('switches.panicRepay')),
      rideBorrow: share(raw, p('switches.rideBorrow')),
      automobileYear: jahr('switches.automobileYear'),
      automobileCost: nonNegative(raw, p('switches.automobileCost')),
      automobilePremium: nonNegative(raw, p('switches.automobilePremium')),
      okaraFromYear: jahr('switches.okaraFromYear'),
      okaraChance: share(raw, p('switches.okaraChance')),
      okaraCost: nonNegative(raw, p('switches.okaraCost')),
      okaraSuccess: share(raw, p('switches.okaraSuccess')),
      okaraIncome: nonNegative(raw, p('switches.okaraIncome')),
      okaraValueQuarters: nonNegative(raw, p('switches.okaraValueQuarters')),
    },
    rival: { drillChance: share(raw, p('rival.drillChance')), drillCost: nonNegative(raw, p('rival.drillCost')) },
    second: {
      refineryMargin: nonNegative(raw, p('second.refineryMargin')),
      harborFreight: nonNegative(raw, p('second.harborFreight')),
      warFromYear: jahr2('second.warFromYear'),
      warTension: nonNegative(raw, p('second.warTension')),
      warPremium: nonNegative(raw, p('second.warPremium')),
      warLossChance: share(raw, p('second.warLossChance')),
      warLossCost: nonNegative(raw, p('second.warLossCost')),
      navyYear: jahr2('second.navyYear'),
      navyPremium: nonNegative(raw, p('second.navyPremium')),
      gradyYear: jahr2('second.gradyYear'),
      gradyChance: share(raw, p('second.gradyChance')),
      gradyCost: nonNegative(raw, p('second.gradyCost')),
      gradyIncome: nonNegative(raw, p('second.gradyIncome')),
      gradyTrace: positiveInt(raw, p('second.gradyTrace')),
      collegeYear: jahr2('second.collegeYear'),
      collegeCost: nonNegative(raw, p('second.collegeCost')),
      collegeBond: nonNegative(raw, p('second.collegeBond')),
    },
  };
  if (t.rounds % 4 !== 0) throw new BalanceError('balance.yaml: "timeskip.rounds" muss ganze Jahre (Vielfaches von 4) umfassen');
  if (t.family.claraStart > 100) throw new BalanceError('balance.yaml: "timeskip.family.claraStart" muss zwischen 0 und 100 liegen');
  return t;
}

function parseBots(raw: unknown): BotsBalance {
  const block = (raw as { bots?: unknown })?.bots;
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "bots" fehlt');
  return {
    games: positiveInt(raw, 'bots.games'),
    seedPrefix: text(block, 'seedPrefix', 'bots'),
    timeskipEnds: positiveInt(raw, 'bots.timeskipEnds'),
    cautious: {
      minChance: share(raw, 'bots.cautious.minChance'),
      cashReserve: nonNegative(raw, 'bots.cautious.cashReserve'),
      maxStage: positiveInt(raw, 'bots.cautious.maxStage'),
    },
    greedy: { minChance: share(raw, 'bots.greedy.minChance'), maxUndrilled: positiveInt(raw, 'bots.greedy.maxUndrilled') },
    random: { actionsPerRound: positiveInt(raw, 'bots.random.actionsPerRound'), logisticsChance: share(raw, 'bots.random.logisticsChance') },
    balanced: {
      minChance: share(raw, 'bots.balanced.minChance'),
      cashReserve: nonNegative(raw, 'bots.balanced.cashReserve'),
      maxStage: positiveInt(raw, 'bots.balanced.maxStage'),
      maxDebtShare: share(raw, 'bots.balanced.maxDebtShare'),
      emergencyDebtShare: share(raw, 'bots.balanced.emergencyDebtShare'),
      maxUndrilled: positiveInt(raw, 'bots.balanced.maxUndrilled'),
    },
    daysPerRound: positiveInt(raw, 'bots.daysPerRound'),
    events: {
      cautious: parseBotWeights(raw, 'cautious'),
      greedy: parseBotWeights(raw, 'greedy'),
      balanced: parseBotWeights(raw, 'balanced'),
    },
    transport: {
      cautious: parseBotTransport(raw, 'cautious'),
      greedy: parseBotTransport(raw, 'greedy'),
      balanced: parseBotTransport(raw, 'balanced'),
    },
    rightsEstimate: nonNegative(raw, 'bots.rightsEstimate'),
    explore: {
      cautious: { rides: nonNegativeInt(raw, 'bots.explore.cautious.rides'), until: share(raw, 'bots.explore.cautious.until'), known: positiveInt(raw, 'bots.explore.cautious.known') },
      greedy: { rides: nonNegativeInt(raw, 'bots.explore.greedy.rides'), until: share(raw, 'bots.explore.greedy.until'), known: positiveInt(raw, 'bots.explore.greedy.known') },
      balanced: { rides: nonNegativeInt(raw, 'bots.explore.balanced.rides'), until: share(raw, 'bots.explore.balanced.until'), known: positiveInt(raw, 'bots.explore.balanced.known') },
    },
    invest: {
      cautious: parseBotInvest(raw, 'cautious'),
      greedy: parseBotInvest(raw, 'greedy'),
      balanced: parseBotInvest(raw, 'balanced'),
    },
    targets: Object.fromEntries(
      BOT_TARGET_IDS.map((id) => {
        const min = num(raw, `bots.targets.${id}.min`);
        const max = num(raw, `bots.targets.${id}.max`);
        if (min > max) throw new BalanceError(`balance.yaml: "bots.targets.${id}": min darf nicht über max liegen`);
        return [id, { min, max }];
      }),
    ) as Record<BotTargetId, { min: number; max: number }>,
    campaign: {
      games: positiveInt(raw, 'bots.campaign.games'),
      cautious: parseCampaignPolicy(raw, 'cautious'),
      greedy: parseCampaignPolicy(raw, 'greedy'),
      balanced: parseCampaignPolicy(raw, 'balanced'),
      randomSystemsChance: share(raw, 'bots.campaign.randomSystemsChance'),
    },
    campaignTargets: Object.fromEntries(
      CAMPAIGN_TARGET_IDS.map((id) => {
        const min = num(raw, `bots.campaignTargets.${id}.min`);
        const max = num(raw, `bots.campaignTargets.${id}.max`);
        if (min > max) throw new BalanceError(`balance.yaml: "bots.campaignTargets.${id}": min darf nicht über max liegen`);
        return [id, { min, max }];
      }),
    ) as Record<CampaignTargetId, { min: number; max: number }>,
  };
}

function parseCampaignPolicy(raw: unknown, name: string): CampaignBotPolicy {
  const p = `bots.campaign.${name}`;
  const answers = path(raw, `${p}.answers`);
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new BalanceError(`balance.yaml: "${p}.answers" fehlt (Weiche → Antwort)`);
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v !== 'string' || v === '') throw new BalanceError(`balance.yaml: "${p}.answers.${k}" muss eine Antwort sein`);
  }
  const ex = path(raw, `${p}.exchange`);
  let exchange: CampaignBotPolicy['exchange'] = null;
  if (ex !== null && ex !== undefined) {
    const sell = path(raw, `${p}.exchange.sellOnWarning`);
    if (typeof sell !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.exchange.sellOnWarning" muss true oder false sein`);
    exchange = { share: share(raw, `${p}.exchange.share`), leverage: positiveInt(raw, `${p}.exchange.leverage`), sellOnWarning: sell };
  }
  const def = path(raw, `${p}.defend`);
  const defend: CampaignBotPolicy['defend'] =
    def === null || def === undefined
      ? null
      : { thorneFrom: share(raw, `${p}.defend.thorneFrom`), controlBelow: share(raw, `${p}.defend.controlBelow`), buyback: share(raw, `${p}.defend.buyback`) };
  return {
    stance: choice(raw, `${p}.stance`, STANCES),
    family: choice(raw, `${p}.family`, FAMILY_TIMES),
    ipo: share(raw, `${p}.ipo`),
    answers: { ...(answers as Record<string, string>) },
    reserve: nonNegative(raw, `${p}.reserve`),
    perRound: positiveInt(raw, `${p}.perRound`),
    systemsChance: 1,
    exchange,
    bonds: path(raw, `${p}.bonds`) === undefined || path(raw, `${p}.bonds`) === null ? null : { load: share(raw, `${p}.bonds.load`) },
    defend,
    feldzug: parseFeldzugPolicy(raw, `${p}.feldzug`),
  };
}

function parseFeldzugPolicy(raw: unknown, p: string): CampaignBotPolicy['feldzug'] {
  const f = path(raw, p);
  if (f === null || f === undefined) return null;
  const flag = (k: string) => {
    const v = path(raw, `${p}.${k}`);
    if (typeof v !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.${k}" muss true oder false sein`);
    return v;
  };
  return { pact: flag('pact'), loan: flag('loan'), sellBelow: nonNegative(raw, `${p}.sellBelow`) };
}

function choice<T extends string>(obj: unknown, path: string, allowed: readonly T[]): T {
  const value = path.split('.').reduce<unknown>(
    (o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined),
    obj,
  );
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BalanceError(`balance.yaml: "${path}" muss eins davon sein: ${allowed.join(', ')}`);
  }
  return value as T;
}

function parseBotTransport(raw: unknown, name: string): BotTransport {
  const p = `bots.transport.${name}`;
  const tanks = path(raw, `${p}.tanks`);
  const margin = path(raw, `${p}.margin`);
  if (typeof margin !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.margin" muss true oder false sein`);
  if (typeof tanks !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.tanks" muss true oder false sein`);
  return {
    trader: choice(raw, `${p}.trader`, ['never', 'always', 'calc'] as const),
    teams: choice(raw, `${p}.teams`, ['never', 'overflow', 'cheaper'] as const),
    tanks,
    pipelinePayback: nonNegative(raw, `${p}.pipelinePayback`),
    thorne: choice(raw, `${p}.thorne`, ['exclusive', 'volume', 'calc', 'refuse'] as const),
    guards: choice(raw, `${p}.guards`, ['never', 'always', 'enemies'] as const),
    holdShare: share(raw, `${p}.holdShare`),
    margin,
  };
}

function parseBotInvest(raw: unknown, name: string): BotInvest {
  const p = `bots.invest.${name}`;
  const flag = (key: string): boolean => {
    const v = path(raw, `${p}.${key}`);
    if (typeof v !== 'boolean') throw new BalanceError(`balance.yaml: "${p}.${key}" muss true oder false sein`);
    return v;
  };
  return {
    pumpPayback: nonNegative(raw, `${p}.pumpPayback`),
    wellPayback: nonNegative(raw, `${p}.wellPayback`),
    rigs: positiveInt(raw, `${p}.rigs`),
    rent: flag('rent'),
    steam: flag('steam'),
    rods: flag('rods'),
  };
}

function path(obj: unknown, p: string): unknown {
  return p.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
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
    dollarsPerPoint: positiveInt(raw, 'tutorial.dollarsPerPoint'),
    loanRounding: positiveInt(raw, 'tutorial.loanRounding'),
    exploreBelow: nonNegative(raw, 'tutorial.exploreBelow'),
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
      perRival: positiveInt(raw, 'events.mail.perRival'),
    },
    documents: {
      forgeryChance: share(raw, 'events.documents.forgeryChance'),
      maxChecks: positiveInt(raw, 'events.documents.maxChecks'),
    },
    timedRounds: positiveInt(raw, 'events.timedRounds'),
    relevance: {
      chapterMoney: nonNegative(raw, 'events.relevance.chapterMoney'),
      minShare: share(raw, 'events.relevance.minShare'),
      refBarrels: nonNegative(raw, 'events.relevance.refBarrels'),
      refLeaseSpend: nonNegative(raw, 'events.relevance.refLeaseSpend'),
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

function parseRanches(raw: unknown): RanchBalance {
  const r: RanchBalance = {
    spacing: num(raw, 'ranches.spacing'),
    jitter: share(raw, 'ranches.jitter'),
    relax: num(raw, 'ranches.relax'),
    minArea: num(raw, 'ranches.minArea'),
    minEdge: num(raw, 'ranches.minEdge'),
    slotArea: num(raw, 'ranches.slotArea'),
    maxSlots: positiveInt(raw, 'ranches.maxSlots'),
    sizes: list(raw, 'ranches.sizes').map((_, i) => ({
      share: share(raw, `ranches.sizes.${i}.share`),
      weight: num(raw, `ranches.sizes.${i}.weight`),
    })),
  };
  if (r.spacing <= 0 || r.slotArea <= 0 || r.minArea < 0 || r.minEdge < 0) {
    throw new BalanceError('balance.yaml: "ranches.spacing" und "ranches.slotArea" müssen größer als 0 sein');
  }
  if (!Number.isInteger(r.relax) || r.relax < 0) throw new BalanceError('balance.yaml: "ranches.relax" muss eine ganze Zahl ab 0 sein');
  if (r.sizes.some((c) => c.weight < 0)) throw new BalanceError('balance.yaml: "ranches.sizes" – Gewichte dürfen nicht negativ sein');
  return r;
}

/**
 * Weltmodell (4.1): Alle Zahlen eines Blocks sind Pflicht. Grundregel: nicht
 * negativ; Anteile (Chancen, Rückkehr, Gewichte) zwischen 0 und 1; Skalen 0–100.
 * Vorzeichen frei sind nur die Regierungswirkungen aufs Kreditklima und die Wirkungen öffentlichen Handelns (acts, 4.2).
 */
function parseWorldModel(raw: unknown): WorldModelBalance {
  const w = 'worldModel';
  const block = (raw as Record<string, unknown> | undefined)?.[w];
  if (!block || typeof block !== 'object') throw new BalanceError('balance.yaml: Block "worldModel" fehlt');
  const nn = (p: string) => nonNegative(raw, `${w}.${p}`);
  const sh = (p: string) => share(raw, `${w}.${p}`);
  const free = (p: string) => num(raw, `${w}.${p}`);
  const scale = (p: string) => {
    const v = num(raw, `${w}.${p}`);
    if (v < 0 || v > 100) throw new BalanceError(`balance.yaml: "${w}.${p}" muss zwischen 0 und 100 liegen`);
    return v;
  };
  const rng = (p: string, lo: number, hi: number) => {
    const r = range(raw, `${w}.${p}`);
    if (r.min < lo || r.max > hi) throw new BalanceError(`balance.yaml: "${w}.${p}" muss zwischen ${lo} und ${hi} liegen`);
    return r;
  };
  const wm: WorldModelBalance = {
    start: {
      tech: rng('start.tech', 0, 100),
      credit: rng('start.credit', 0, 100),
      mood: rng('start.mood', 0, 100),
      tension: rng('start.tension', 0, 100),
      nationalism: rng('start.nationalism', 0, 100),
      handel: rng('start.handel', 0, 1),
      volksbund: rng('start.volksbund', 0, 1),
      provinz: rng('start.provinz', 0, 1),
    },
    supply: {
      elasticity: nn('supply.elasticity'),
      stockNorm: nn('supply.stockNorm'),
      stockMax: nn('supply.stockMax'),
      stockWeight: nn('supply.stockWeight'),
      utilBase: sh('supply.utilBase'),
      utilSlope: nn('supply.utilSlope'),
      utilMin: sh('supply.utilMin'),
      depletion: sh('supply.depletion'),
      investSlope: nn('supply.investSlope'),
      investMax: sh('supply.investMax'),
      delay: positiveInt(raw, `${w}.supply.delay`),
      creditInvest: sh('supply.creditInvest'),
      findChance: sh('supply.findChance'),
      findSize: rng('supply.findSize', 0, 1),
    },
    demand: {
      growth: sh('demand.growth'),
      cap: nn('demand.cap'),
      techBoost: nn('demand.techBoost'),
      crashDrop: sh('demand.crashDrop'),
      warBoost: nn('demand.warBoost'),
      armsDemand: nn('demand.armsDemand'),
    },
    price: { min: nn('price.min'), max: nn('price.max'), techCost: sh('price.techCost'), trendMin: sh('price.trendMin') },
    tech: { rate: sh('tech.rate') },
    credit: {
      boom: nn('credit.boom'),
      speculation: sh('credit.speculation'),
      revert: sh('credit.revert'),
      noise: nn('credit.noise'),
      handel: free('credit.handel'),
      volksbund: free('credit.volksbund'),
      provinz: free('credit.provinz'),
      crashFrom: scale('credit.crashFrom'),
      crashChance: sh('credit.crashChance'),
      crashSlope: sh('credit.crashSlope'),
      priceTrigger: sh('credit.priceTrigger'),
      priceTriggerFrom: scale('credit.priceTriggerFrom'),
      after: sh('credit.after'),
      pipelineCut: sh('credit.pipelineCut'),
      investCut: sh('credit.investCut'),
      rounds: rng('credit.rounds', 1, 1000),
      boomFrom: scale('credit.boomFrom'),
      tightFrom: scale('credit.tightFrom'),
      panicAfter: sh('credit.panicAfter'),
      panicRounds: rng('credit.panicRounds', 1, 1000),
      panicPipelineCut: sh('credit.panicPipelineCut'),
      panicInvestCut: sh('credit.panicInvestCut'),
      leverage: {
        base: scale('credit.leverage.base'),
        build: nn('credit.leverage.build'),
        decay: sh('credit.leverage.decay'),
        start: sh('credit.leverage.start'),
        bubbleFrom: scale('credit.leverage.bubbleFrom'),
        crashFrom: scale('credit.leverage.crashFrom'),
        crashAfter: sh('credit.leverage.crashAfter'),
        panicAfter: sh('credit.leverage.panicAfter'),
      },
    },
    mood: {
      speed: sh('mood.speed'),
      price: nn('mood.price'),
      crash: nn('mood.crash'),
      panic: nn('mood.panic'),
      war: nn('mood.war'),
      boom: nn('mood.boom'),
      noise: nn('mood.noise'),
    },
    politics: {
      drift: sh('politics.drift'),
      noise: sh('politics.noise'),
      minShare: sh('politics.minShare'),
      fatigue: sh('politics.fatigue'),
      revert: sh('politics.revert'),
      electionEvery: positiveInt(raw, `${w}.politics.electionEvery`),
    },
    tension: {
      base: scale('tension.base'),
      revert: sh('tension.revert'),
      scarcity: nn('tension.scarcity'),
      scarcityFrom: nn('tension.scarcityFrom'),
      arms: sh('tension.arms'),
      armsFrom: scale('tension.armsFrom'),
      nationalism: sh('tension.nationalism'),
      nationalismFrom: scale('tension.nationalismFrom'),
      noise: nn('tension.noise'),
      warFrom: scale('tension.warFrom'),
      warChance: sh('tension.warChance'),
      warSlope: sh('tension.warSlope'),
      warRounds: rng('tension.warRounds', 1, 1000),
      afterWar: scale('tension.afterWar'),
    },
    foreign: {
      costaNegra: {
        start: rng('foreign.costaNegra.start', 0, 100),
        base: scale('foreign.costaNegra.base'),
        revert: sh('foreign.costaNegra.revert'),
        poverty: nn('foreign.costaNegra.poverty'),
        povertyFrom: nn('foreign.costaNegra.povertyFrom'),
        nationalism: sh('foreign.costaNegra.nationalism'),
        nationalismFrom: scale('foreign.costaNegra.nationalismFrom'),
        meddling: sh('foreign.costaNegra.meddling'),
        meddlingFrom: scale('foreign.costaNegra.meddlingFrom'),
        noise: nn('foreign.costaNegra.noise'),
        uprisingFrom: scale('foreign.costaNegra.uprisingFrom'),
        uprisingChance: sh('foreign.costaNegra.uprisingChance'),
        uprisingSlope: sh('foreign.costaNegra.uprisingSlope'),
        rounds: rng('foreign.costaNegra.rounds', 1, 1000),
        after: scale('foreign.costaNegra.after'),
        share: sh('foreign.costaNegra.share'),
        loss: sh('foreign.costaNegra.loss'),
      },
      qasir: {
        start: rng('foreign.qasir.start', 0, 100),
        base: scale('foreign.qasir.base'),
        revert: sh('foreign.qasir.revert'),
        courting: sh('foreign.qasir.courting'),
        courtingFrom: scale('foreign.qasir.courtingFrom'),
        war: nn('foreign.qasir.war'),
        nationalism: sh('foreign.qasir.nationalism'),
        nationalismFrom: scale('foreign.qasir.nationalismFrom'),
        noise: nn('foreign.qasir.noise'),
        embargoFrom: scale('foreign.qasir.embargoFrom'),
        embargoChance: sh('foreign.qasir.embargoChance'),
        embargoSlope: sh('foreign.qasir.embargoSlope'),
        rounds: rng('foreign.qasir.rounds', 1, 1000),
        after: scale('foreign.qasir.after'),
        shareBase: sh('foreign.qasir.shareBase'),
        shareGrowth: sh('foreign.qasir.shareGrowth'),
        shareMax: sh('foreign.qasir.shareMax'),
      },
    },
    nationalism: {
      base: scale('nationalism.base'),
      revert: sh('nationalism.revert'),
      drift: nn('nationalism.drift'),
      tension: sh('nationalism.tension'),
      noise: nn('nationalism.noise'),
      nationalizeFrom: scale('nationalism.nationalizeFrom'),
      nationalizeChance: sh('nationalism.nationalizeChance'),
      nationalizeLoss: sh('nationalism.nationalizeLoss'),
      after: scale('nationalism.after'),
    },
    chapter1: {
      priceWeight: sh('chapter1.priceWeight'),
      priceMaxDev: sh('chapter1.priceMaxDev'),
      rateWeight: sh('chapter1.rateWeight'),
      crashRate: sh('chapter1.crashRate'),
      panicRate: sh('chapter1.panicRate'),
      bubbleRate: sh('chapter1.bubbleRate'),
      rateMaxAdd: sh('chapter1.rateMaxAdd'),
      limit: Object.fromEntries(CREDIT_PHASES.map((p) => [p, nn(`chapter1.limit.${p}`)])) as Record<CreditPhase, number>,
      nationalBarrels: nn('chapter1.nationalBarrels'),
    },
    news: {
      creditEasy: scale('news.creditEasy'),
      creditTight: scale('news.creditTight'),
      moodAngry: scale('news.moodAngry'),
      tensionHigh: scale('news.tensionHigh'),
      unrestHigh: scale('news.unrestHigh'),
      qasirHigh: scale('news.qasirHigh'),
      pollFrom: integerInRange(raw, `${w}.news.pollFrom`, 0, 1000),
      pollClose: sh('news.pollClose'),
    },
    acts: {
      maxMood: nn('acts.maxMood'),
      maxParty: sh('acts.maxParty'),
      ...(Object.fromEntries(
        PUBLIC_ACTS.map((a) => [a, { mood: free(`acts.${a}.mood`), ...Object.fromEntries(PARTIES.map((p) => [p, free(`acts.${a}.${p}`)])) }]),
      ) as Record<PublicAct, ActEffect>),
    },
    programs: Object.fromEntries(PARTIES.map((p) => [p, { scrutiny: nn(`programs.${p}.scrutiny`) }])) as Record<Party, { scrutiny: number }>,
    laws: {
      decay: sh('laws.decay'),
      proposeChance: sh('laws.proposeChance'),
      maxOpen: positiveInt(raw, `${w}.laws.maxOpen`),
      debateRounds: rng('laws.debateRounds', 1, 1000),
      voteNoise: sh('laws.voteNoise'),
      closeVote: sh('laws.closeVote'),
      cooldown: integerInRange(raw, `${w}.laws.cooldown`, 0, 1000),
      failPressure: sh('laws.failPressure'),
      trust: {
        start: rng('laws.trust.start', 0, 1),
        base: sh('laws.trust.base'),
        revert: sh('laws.trust.revert'),
        government: Object.fromEntries(PARTIES.map((p) => [p, free(`laws.trust.government.${p}`)])) as Record<Party, number>,
        credit: free('laws.trust.credit'),
        crash: sh('laws.trust.crash'),
        glut: sh('laws.trust.glut'),
        noise: sh('laws.trust.noise'),
        min: sh('laws.trust.min'),
        max: sh('laws.trust.max'),
      },
      lobby: { demand: nn('laws.lobby.demand'), block: sh('laws.lobby.block'), delay: integerInRange(raw, `${w}.laws.lobby.delay`, 0, 100) },
    },
  };
  if (!Number.isInteger(wm.laws.debateRounds.min) || !Number.isInteger(wm.laws.debateRounds.max)) {
    throw new BalanceError('balance.yaml: "worldModel.laws.debateRounds" braucht ganze Runden');
  }
  if (wm.laws.trust.min > wm.laws.trust.max) throw new BalanceError('balance.yaml: "worldModel.laws.trust" – min darf nicht über max liegen');
  if (wm.price.min <= 0 || wm.price.min > 1 || wm.price.max < 1) {
    throw new BalanceError('balance.yaml: "worldModel.price" – min muss in (0, 1] liegen, max mindestens 1');
  }
  if (wm.supply.stockMax < wm.supply.stockNorm || wm.supply.stockNorm <= 0) {
    throw new BalanceError('balance.yaml: "worldModel.supply.stockNorm" muss über 0 und höchstens stockMax sein');
  }
  if (wm.supply.utilMin > wm.supply.utilBase) {
    throw new BalanceError('balance.yaml: "worldModel.supply.utilMin" darf nicht über utilBase liegen');
  }
  if (wm.demand.cap <= 1) throw new BalanceError('balance.yaml: "worldModel.demand.cap" muss über 1 liegen');
  if (wm.chapter1.nationalBarrels <= 0) throw new BalanceError('balance.yaml: "worldModel.chapter1.nationalBarrels" muss über 0 liegen');
  if (wm.politics.minShare * 3 >= 1) throw new BalanceError('balance.yaml: "worldModel.politics.minShare" muss unter 1/3 liegen');
  if (wm.credit.tightFrom >= wm.credit.boomFrom) throw new BalanceError('balance.yaml: "worldModel.credit.tightFrom" muss unter boomFrom liegen');
  if (wm.credit.leverage.bubbleFrom > wm.credit.leverage.crashFrom) {
    throw new BalanceError('balance.yaml: "worldModel.credit.leverage.bubbleFrom" darf nicht über crashFrom liegen – sonst kommt der Crash ohne Frühwarnung');
  }
  if (wm.news.unrestHigh > wm.foreign.costaNegra.uprisingFrom) {
    throw new BalanceError('balance.yaml: "worldModel.news.unrestHigh" darf nicht über foreign.costaNegra.uprisingFrom liegen – sonst kommt der Aufstand ohne Frühwarnung');
  }
  if (wm.news.qasirHigh > wm.foreign.qasir.embargoFrom) {
    throw new BalanceError('balance.yaml: "worldModel.news.qasirHigh" darf nicht über foreign.qasir.embargoFrom liegen – sonst kommt das Embargo ohne Frühwarnung');
  }
  for (const r of [wm.credit.panicRounds, wm.foreign.costaNegra.rounds, wm.foreign.qasir.rounds]) {
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) throw new BalanceError('balance.yaml: Rundenbereiche im Weltmodell (panicRounds, foreign.*.rounds) brauchen ganze Runden');
  }
  return wm;
}

/** Die Karte aus content/map.yaml; Fehler dort kommen als BalanceError mit „map.yaml:“ davor. */
function parseWorld(raw: unknown): WorldMap {
  const world = (raw as { world?: unknown })?.world;
  if (world === undefined) throw new BalanceError('Karte fehlt: content/map.yaml muss als "world" mitgeladen werden');
  try {
    return parseWorldMap(world, LANDOWNER_TYPES);
  } catch (e) {
    throw new BalanceError(e instanceof Error ? e.message : String(e));
  }
}

/** 4.6 Andockpunkt: Block „refinery“; Fehler kommen als BalanceError. */
function parseRefinery(raw: unknown): RefineryBalance {
  try {
    return parseRefineryBalance((raw as { refinery?: unknown })?.refinery);
  } catch (e) {
    throw new BalanceError(e instanceof Error ? e.message : String(e));
  }
}

/** 4.7 Andockpunkt: Fehler im Abschnitt bigPipelines kommen als BalanceError. */
function parseBigPipelines(raw: unknown): BigPipelineBalance {
  try {
    return parseBigPipelineBalance(raw, LANDOWNER_TYPES);
  } catch (e) {
    throw new BalanceError(e instanceof Error ? e.message : String(e));
  }
}

/** 4.14 Andockpunkt: Fehler im Block „brand“ kommen wie alle anderen als BalanceError. */
function parseBrand(raw: unknown): BrandBalance {
  try {
    return parseBrandBalance(raw);
  } catch (e) {
    throw new BalanceError(e instanceof Error ? e.message : String(e));
  }
}

/** Spielzahlen und Karte zusammen: balance.yaml und map.yaml als rohe YAML-Daten. */
export function parseGameData(balanceRaw: unknown, mapRaw: unknown, laws: readonly LawDef[] = []): Balance {
  return { ...parseBalance({ ...(balanceRaw as object), world: mapRaw }), laws };
}

/** Salzrücken (Etappe 1). */
function parseTrends(raw: unknown): TrendBalance {
  const p = 'geology.trends';
  const t: TrendBalance = {
    perRegion: nonNegativeInt(raw, `${p}.perRegion`),
    radius: nonNegative(raw, `${p}.radius`),
    bonus: num(raw, `${p}.bonus`),
    offTrend: num(raw, `${p}.offTrend`),
    noise: nonNegative(raw, `${p}.noise`),
    qMin: share(raw, `${p}.qMin`),
    qMax: share(raw, `${p}.qMax`),
    offsetMin: nonNegative(raw, `${p}.offsetMin`),
    offsetMax: nonNegative(raw, `${p}.offsetMax`),
    halfLength: nonNegative(raw, `${p}.halfLength`),
  };
  if (t.qMin > t.qMax) throw new BalanceError(`balance.yaml: "${p}.qMin" ist größer als "${p}.qMax"`);
  if (t.offsetMin > t.offsetMax) throw new BalanceError(`balance.yaml: "${p}.offsetMin" ist größer als "${p}.offsetMax"`);
  return t;
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
      base: num(z, 'base'),
      prior: num(z, 'prior'),
      small: num(z, 'small'),
      gusher: num(z, 'gusher'),
    };
    if (zone.base < 0 || zone.base > 1 || zone.prior <= 0 || zone.prior >= 1) {
      throw new BalanceError(`balance.yaml: Zone "${zone.name}" – "base" muss zwischen 0 und 1 liegen, "prior" echt dazwischen`);
    }
    if (zone.small < 0 || zone.gusher < 0 || zone.small + zone.gusher <= 0) {
      throw new BalanceError(`balance.yaml: Zone "${zone.name}" – small und gusher dürfen nicht negativ sein und nicht beide 0`);
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
    world: parseWorld(raw),
    ranches: parseRanches(raw),
    geology: {
      zones,
      trends: parseTrends(raw),
      reserves: {
        small: range(raw, 'geology.reserves.small'),
        gusher: range(raw, 'geology.reserves.gusher'),
      },
    },
    lease: parseLease(raw),
    forecast: parseForecast(raw),
    exploration: parseExplorationBalance(raw),
    plans: parsePlansBalance(raw),
    priceActions: parsePriceActions(raw),
    freight: parseFreightBalance(raw),
    botPlans: parseBotPlans(raw),
    letters: parseLettersBalance(raw),
    drilling: parseDrilling(raw),
    production: parseProduction(raw),
    market: parseMarket(raw),
    transport: parseTransport(raw),
    credit: parseCredit(raw),
    bankruptcy: parseBankruptcy(raw),
    rivals: parseRivals(raw),
    diplomacy: parseDiplomacy(raw), // 4.10 Andockpunkt
    empire: parseEmpire(raw),
    chapter: parseChapter(raw),
    timeskip: parseTimeskip(raw),
    bots: parseBots(raw),
    events: parseEvents(raw),
    agenda: parseAgenda(raw),
    family: parseFamily(raw),
    newspaper: parseNewspaper(raw),
    tutorial: parseTutorial(raw),
    // 4.16 Andockpunkt
    hallstead: parseHallstead(raw),
    worldModel: parseWorldModel(raw),
    laws: [],
    // 4.6 Andockpunkt: Raffinerie.
    refinery: parseRefinery(raw),
    // 4.7 Andockpunkt: Fernleitungen – eigener Parser in bigPipelineBalance.ts.
    bigPipelines: parseBigPipelines(raw),
    stocks: parseStocksBalance(raw, (m) => new BalanceError(m)), // 4.8 Andockpunkt
    staff: parseStaff(raw), // 4.9 Andockpunkt
    // 4.11 Andockpunkt
    investigation: parseInvestigationBalance(raw),
    research: parseResearchBalance(raw),
    // 4.14 Andockpunkt: Marke und Tankstellen (Kapitel 3).
    brand: parseBrand(raw),
    // 4.15 Andockpunkt: Börse und Kauf auf Kredit.
    exchange: parseExchangeBalance(raw),
    kapitel3: parseKapitel3Balance(raw), // 4.17 Andockpunkt
    rivalsK3: parseRivalsK3Balance(raw), // 4.19 Andockpunkt
    feldzug: parseFeldzugBalance(raw), // 0.4.20+8
    eventSystems: parseEventSystemsBalance(raw), // 4.12
  };

  for (const r of balance.transport.pipeline.rights) {
    if (r.figure && !balance.world.figures.some((f) => f.id === r.figure)) {
      throw new BalanceError(`balance.yaml: Wegerecht "${r.mark}" verweist auf die Figur "${r.figure}", die es in map.yaml nicht gibt`);
    }
  }
  // 4.7 Andockpunkt: Ziele der Fernleitungen müssen Bahnhöfe oder Häfen der Karte sein.
  for (const d of balance.bigPipelines.destinations) {
    if (!balance.world.landmarks.some((l) => l.id === d.id && l.at)) {
      throw new BalanceError(`balance.yaml: Fernleitungs-Ziel "${d.id}" ist kein Bahnhof oder Hafen in map.yaml`);
    }
  }
  const { count } = balance.lease.startOptions;
  if (!Number.isInteger(count) || count < 0) {
    throw new BalanceError('balance.yaml: "lease.startOptions.count" muss eine ganze Zahl ab 0 sein und auf die Karte passen');
  }
  const { minForecast } = balance.lease.startOptions;
  if (minForecast < 0 || minForecast > 100) {
    throw new BalanceError('balance.yaml: "lease.startOptions.minForecast" muss zwischen 0 und 100 (Prozent) liegen');
  }
  return balance;
}
