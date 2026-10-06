// Spielzahlen für Preis- und Transport-Aktionen (Termine als Hauptwerkzeug, Etappe 2).
// Eigene Abschnitte in content/balance.yaml: „priceActions“ (Förderbremse, Liefervertrag,
// Gerüchte, Crane feilschen, Ruf bei den Wildcattern), „transport.negotiation“ (Thorne,
// Brennan, Transportgemeinschaft) und „bots.plans“ (welche Bots welche Karten spielen).
// Der Leser ist eigenständig, damit balance.ts nur ein paar Zeilen dafür braucht.
// Regeln: src/sim/pricing.ts und src/sim/freight.ts.

import { BalanceError } from './balance';

/** Ruf bei den Wildcattern (gilt für Förderbremse und Transportgemeinschaft). */
export interface StandingBalance {
  min: number;
  max: number;
  /** Förderbremse geplatzt. */
  collapse: number;
  /** Verrat zugunsten von Crane. */
  betrayal: number;
  /** Gerücht aufgeflogen. */
  exposed: number;
  /** Ein Pakt hat mindestens heldRounds Runden gehalten. */
  held: number;
  heldRounds: number;
}

export interface CartelBalance {
  /** Beitritt je Wildcatter-Firma: base + Ruf (+ alliance mit Delgados Verband), begrenzt auf min–max. */
  join: { base: number; alliance: number; min: number; max: number };
  /** Drossel der Mitglieder (und Jacobs, wenn er ehrlich mitmacht). */
  cut: number;
  /** Laufzeit in Runden; verlängern kostet einen Termin. */
  rounds: number;
  /** Organisatoren-Klausel: Jacob drosselt nur so viel … */
  organizerCut: number;
  /** … dafür steigt die Betrugschance aller um so viel. */
  organizerCheat: number;
  /** Betrug je Mitglied und Runde: base + perRound · Runden seit Gründung + Zuschläge. */
  cheat: { base: number; perRound: number; unheld: number; bullardFull: number };
  /** Bricht mehr als dieser Anteil der Kartellquellen, platzt der Pakt. */
  breakShare: number;
  /** Nach dem Zusammenbruch fördern die Nachbarn eine Runde so viel mehr (Tanks werden geleert). */
  collapseBoost: number;
  /** So viele Runden will danach niemand mehr einen Pakt. */
  banRounds: number;
  /** Bullard: Chance beizutreten je Haltung, draußen voll auffahren, drinnen brechen. */
  bullard: { handshake: number; neutral: number; feud: number; full: number; break: number; breakFactor: number };
  /** Crane schlägt zurück, wenn der Preis über trigger · Trendpreis steigt. */
  craneTrigger: number;
  /** Kartellgesetz in Kraft: Verfahren je Runde und Strafe. */
  antitrust: { chance: number; fine: number };
}

export interface ContractBalance {
  minQty: number;
  maxQty: number;
  qtyStep: number;
  /** Mögliche Laufzeiten in Runden. */
  rounds: number[];
  /** Festpreis = Posted Price + premium − perRound · Laufzeit. */
  premium: number;
  perRound: number;
  /** Fehlmenge kostet so viel je Barrel. */
  shortfall: number;
  /** Cranes Groll gilt die Laufzeit und so viele Runden danach. */
  grudgeAfter: number;
  /** Bei Bankpanik oder Crash geht der Händler mit dieser Chance pleite. */
  failChance: number;
}

export interface RumourBalance {
  /** Frühestens alle so viele Runden. */
  cooldown: number;
  /** „Quellen versiegen“: Preisschock und nötiger Tank. */
  dry: { shock: number; minTank: number };
  /** Spielspaß K1: So viele Runden wirkt ein Gerücht auf den Preis (Entlarvung: der Rückschlag nur eine Runde). */
  rounds: number;
  /** „Riesenfund bei Bullard“: Preisschock, Pachtpreise, Runden ohne neue Pacht Bullards. */
  bullard: { shock: number; leaseCost: number; rounds: number };
  /** Jedes weitere Gerücht wirkt × wear. */
  wear: number;
  /** Entlarvung: base + perRumour je früheres Gerücht; backlash = Preisschock in der Runde der Entlarvung („Quellen versiegen“). */
  exposed: { base: number; perRumour: number; backlash: number };
}

export interface CraneBalance {
  points: { contract: number; freight: number; cartel: number; alliance: number; share: number; antitrust: number; tank: number };
  /** Ab so vielen Gespannen (oder mit Pipeline) zählt „eigene Wege“. */
  freightTeams: number;
  /** Marktanteil am Salt Hill ab so viel. */
  shareMin: number;
  tankMin: number;
  /** Abfuhr (1 Punkt): Der nächste Abschlag kommt sicher und dauert so viel länger. */
  rebuffExtra: number;
  /** Ab 3 Punkten: Aufschlag je Barrel für so viele Runden. */
  deal: { bonus: number; rounds: number };
  /** Ab 4 Punkten: fester Abnahmevertrag zu Posted Price + premium. */
  contract: { premium: number; rounds: number };
  /** Spielspaß K1: Cranes Laune −1 mit down, +1 mit up, sonst 0 – zählt wie ein Punkt mehr oder weniger. */
  mood: { down: number; up: number };
  /** Spielspaß K1: Cranes Gegendruck – base Punkte immer, recent mehr, wenn er in den letzten rounds Runden schon nachgegeben hat. */
  resistance: { base: number; recent: number; rounds: number };
}

export interface PriceActionsBalance {
  standing: StandingBalance;
  cartel: CartelBalance;
  contract: ContractBalance;
  rumour: RumourBalance;
  crane: CraneBalance;
}

export interface FreightBalance {
  /** Druckmittel: gebündelte Bahnmenge ab diesen Grenzen (je 1 Punkt). */
  bundle: number[];
  /** Ausweichkapazität ab diesem Anteil der Bahnmenge der Vorrunde. */
  fallbackShare: number;
  resistance: { base: number; perConcession: number; concessionRounds: number; feud: number };
  /** Thornes Laune: −1 mit down, +1 mit up, sonst 0. */
  mood: { down: number; up: number };
  /** Tarifsenkung bei Ergebnis 1, 2, ≥ 3. */
  cuts: number[];
  /** Runden ohne Erhöhung bei Ergebnis 1, 2, ≥ 3. */
  freeze: number[];
  /** Ab 3: Sondertarif statt Senkung. */
  special: { tariff: number; rounds: number };
  /** Abfuhr (≤ 0) und Groll nach erwischtem Bluff: Erhöhungschance × factor für rounds Runden; bei der Abfuhr steigt der Tarif sofort um raise. */
  rebuff: { factor: number; rounds: number; raise: number };
  /** Bluff-Prüfung: so viele Folgerunden; je Runde zählt Thorne mit Chance check nach – Bahnanteil der Runde über railShare: Aufschlag penalty. */
  bluff: { rounds: number; railShare: number; penalty: number; check: number };
  brennan: { costPerBarrel: number; capacity: number; rounds: number; minimum: number; shortfall: number; raise: number };
  pool: {
    base: number;
    tariffRef: number;
    alliance: number;
    feud: number;
    min: number;
    max: number;
    perWell: number;
    wellShare: number;
    leave: number;
    pipelineDiscount: number;
    foreignShare: number;
    transitFee: number;
    /** Spielspaß K1: Rabatt auf Jacobs Bahnfracht – discountStep $ je discountPer bbl Gemeinschaftsmenge, höchstens discountMax. */
    discountPer: number;
    discountStep: number;
    discountMax: number;
    /** Zusage an Thorne: gemeinsam (Jacobs Bahnfracht + Gemeinschaft) mindestens minimum bbl je Runde, sonst shortfall $ je fehlendem Barrel. */
    minimum: number;
    shortfall: number;
  };
  /** Exklusivvertrag kündigen: nur ab so viel Druck. */
  cancelPressure: number;
}

/** Welche Preis- und Fracht-Karten ein Bot spielt (Etappe 2; die Feinarbeit ist Etappe 4). */
export interface BotPlans {
  cartel: boolean;
  contract: boolean;
  rumour: boolean;
  crane: boolean;
  thorne: boolean;
  brennan: boolean;
  pool: boolean;
  /** Spielspaß K1: blufft bewusst – hält sich nach einem Zugeständnis nicht an Thornes Bahngrenze. */
  bluff: boolean;
}

export const BOT_PLAN_KEYS = ['cartel', 'contract', 'rumour', 'crane', 'thorne', 'brennan', 'pool', 'bluff'] as const;

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const value = wert(obj, path);
  if (typeof value !== 'number' || Number.isNaN(value)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  return value;
}

function anteil(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0 || value > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return value;
}

function nn(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (value < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return value;
}

function ganz(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (!Number.isInteger(value) || value < 1) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 1 sein`);
  return value;
}

function zahlen(obj: unknown, path: string, laenge?: number): number[] {
  const value = wert(obj, path);
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'number' && v >= 0)) {
    throw new BalanceError(`balance.yaml: "${path}" muss eine Liste nicht negativer Zahlen sein`);
  }
  if (laenge !== undefined && value.length !== laenge) throw new BalanceError(`balance.yaml: "${path}" braucht genau ${laenge} Zahlen`);
  return value as number[];
}

export function parsePriceActions(raw: unknown): PriceActionsBalance {
  const p = 'priceActions';
  if (wert(raw, p) === undefined) throw new BalanceError('balance.yaml: Block "priceActions" fehlt');
  const s = `${p}.standing`;
  const standing: StandingBalance = {
    min: zahl(raw, `${s}.min`),
    max: zahl(raw, `${s}.max`),
    collapse: zahl(raw, `${s}.collapse`),
    betrayal: zahl(raw, `${s}.betrayal`),
    exposed: zahl(raw, `${s}.exposed`),
    held: zahl(raw, `${s}.held`),
    heldRounds: ganz(raw, `${s}.heldRounds`),
  };
  if (standing.min > 0 || standing.max < 0) throw new BalanceError('balance.yaml: "priceActions.standing" min ≤ 0 ≤ max');
  const c = `${p}.cartel`;
  const cartel: CartelBalance = {
    join: { base: anteil(raw, `${c}.join.base`), alliance: anteil(raw, `${c}.join.alliance`), min: anteil(raw, `${c}.join.min`), max: anteil(raw, `${c}.join.max`) },
    cut: anteil(raw, `${c}.cut`),
    rounds: ganz(raw, `${c}.rounds`),
    organizerCut: anteil(raw, `${c}.organizerCut`),
    organizerCheat: anteil(raw, `${c}.organizerCheat`),
    cheat: {
      base: anteil(raw, `${c}.cheat.base`),
      perRound: anteil(raw, `${c}.cheat.perRound`),
      unheld: anteil(raw, `${c}.cheat.unheld`),
      bullardFull: anteil(raw, `${c}.cheat.bullardFull`),
    },
    breakShare: anteil(raw, `${c}.breakShare`),
    collapseBoost: anteil(raw, `${c}.collapseBoost`),
    banRounds: ganz(raw, `${c}.banRounds`),
    bullard: {
      handshake: anteil(raw, `${c}.bullard.handshake`),
      neutral: anteil(raw, `${c}.bullard.neutral`),
      feud: anteil(raw, `${c}.bullard.feud`),
      full: anteil(raw, `${c}.bullard.full`),
      break: anteil(raw, `${c}.bullard.break`),
      breakFactor: nn(raw, `${c}.bullard.breakFactor`),
    },
    craneTrigger: nn(raw, `${c}.craneTrigger`),
    antitrust: { chance: anteil(raw, `${c}.antitrust.chance`), fine: nn(raw, `${c}.antitrust.fine`) },
  };
  if (cartel.join.min > cartel.join.max) throw new BalanceError('balance.yaml: "priceActions.cartel.join" min ≤ max');
  const k = `${p}.contract`;
  const contract: ContractBalance = {
    minQty: nn(raw, `${k}.minQty`),
    maxQty: nn(raw, `${k}.maxQty`),
    qtyStep: ganz(raw, `${k}.qtyStep`),
    rounds: zahlen(raw, `${k}.rounds`),
    premium: zahl(raw, `${k}.premium`),
    perRound: nn(raw, `${k}.perRound`),
    shortfall: nn(raw, `${k}.shortfall`),
    grudgeAfter: nn(raw, `${k}.grudgeAfter`),
    failChance: anteil(raw, `${k}.failChance`),
  };
  if (contract.minQty > contract.maxQty) throw new BalanceError('balance.yaml: "priceActions.contract" minQty ≤ maxQty');
  const r = `${p}.rumour`;
  const rumour: RumourBalance = {
    cooldown: ganz(raw, `${r}.cooldown`),
    dry: { shock: nn(raw, `${r}.dry.shock`), minTank: nn(raw, `${r}.dry.minTank`) },
    rounds: ganz(raw, `${r}.rounds`),
    bullard: { shock: zahl(raw, `${r}.bullard.shock`), leaseCost: zahl(raw, `${r}.bullard.leaseCost`), rounds: ganz(raw, `${r}.bullard.rounds`) },
    wear: anteil(raw, `${r}.wear`),
    exposed: { base: anteil(raw, `${r}.exposed.base`), perRumour: anteil(raw, `${r}.exposed.perRumour`), backlash: zahl(raw, `${r}.exposed.backlash`) },
  };
  const w = `${p}.crane`;
  const crane: CraneBalance = {
    points: {
      contract: nn(raw, `${w}.points.contract`),
      freight: nn(raw, `${w}.points.freight`),
      cartel: nn(raw, `${w}.points.cartel`),
      alliance: nn(raw, `${w}.points.alliance`),
      share: nn(raw, `${w}.points.share`),
      antitrust: nn(raw, `${w}.points.antitrust`),
      tank: nn(raw, `${w}.points.tank`),
    },
    freightTeams: nn(raw, `${w}.freightTeams`),
    shareMin: anteil(raw, `${w}.shareMin`),
    tankMin: nn(raw, `${w}.tankMin`),
    rebuffExtra: nn(raw, `${w}.rebuffExtra`),
    deal: { bonus: nn(raw, `${w}.deal.bonus`), rounds: ganz(raw, `${w}.deal.rounds`) },
    contract: { premium: zahl(raw, `${w}.contract.premium`), rounds: ganz(raw, `${w}.contract.rounds`) },
    mood: { down: anteil(raw, `${w}.mood.down`), up: anteil(raw, `${w}.mood.up`) },
    resistance: { base: nn(raw, `${w}.resistance.base`), recent: nn(raw, `${w}.resistance.recent`), rounds: ganz(raw, `${w}.resistance.rounds`) },
  };
  if (crane.mood.down + crane.mood.up > 1) throw new BalanceError('balance.yaml: "priceActions.crane.mood" down + up ≤ 1');
  return { standing, cartel, contract, rumour, crane };
}

export function parseFreightBalance(raw: unknown): FreightBalance {
  // Ein schon gelesenes Balance-Objekt (Tests lesen es erneut) trägt den Block unter „freight“.
  const p = wert(raw, 'transport.negotiation') === undefined && wert(raw, 'freight') !== undefined ? 'freight' : 'transport.negotiation';
  if (wert(raw, p) === undefined) throw new BalanceError('balance.yaml: Block "transport.negotiation" fehlt');
  const b = `${p}.brennan`;
  const o = `${p}.pool`;
  const out: FreightBalance = {
    bundle: zahlen(raw, `${p}.bundle`),
    fallbackShare: nn(raw, `${p}.fallbackShare`),
    resistance: {
      base: nn(raw, `${p}.resistance.base`),
      perConcession: nn(raw, `${p}.resistance.perConcession`),
      concessionRounds: ganz(raw, `${p}.resistance.concessionRounds`),
      feud: nn(raw, `${p}.resistance.feud`),
    },
    mood: { down: anteil(raw, `${p}.mood.down`), up: anteil(raw, `${p}.mood.up`) },
    cuts: zahlen(raw, `${p}.cuts`, 3),
    freeze: zahlen(raw, `${p}.freeze`, 3),
    special: { tariff: nn(raw, `${p}.special.tariff`), rounds: ganz(raw, `${p}.special.rounds`) },
    rebuff: { factor: nn(raw, `${p}.rebuff.factor`), rounds: ganz(raw, `${p}.rebuff.rounds`), raise: nn(raw, `${p}.rebuff.raise`) },
    bluff: { rounds: ganz(raw, `${p}.bluff.rounds`), railShare: anteil(raw, `${p}.bluff.railShare`), penalty: nn(raw, `${p}.bluff.penalty`), check: anteil(raw, `${p}.bluff.check`) },
    brennan: {
      costPerBarrel: nn(raw, `${b}.costPerBarrel`),
      capacity: nn(raw, `${b}.capacity`),
      rounds: ganz(raw, `${b}.rounds`),
      minimum: nn(raw, `${b}.minimum`),
      shortfall: nn(raw, `${b}.shortfall`),
      raise: nn(raw, `${b}.raise`),
    },
    pool: {
      base: anteil(raw, `${o}.base`),
      tariffRef: nn(raw, `${o}.tariffRef`),
      alliance: anteil(raw, `${o}.alliance`),
      feud: zahl(raw, `${o}.feud`),
      min: anteil(raw, `${o}.min`),
      max: anteil(raw, `${o}.max`),
      perWell: nn(raw, `${o}.perWell`),
      wellShare: anteil(raw, `${o}.wellShare`),
      leave: anteil(raw, `${o}.leave`),
      pipelineDiscount: anteil(raw, `${o}.pipelineDiscount`),
      foreignShare: anteil(raw, `${o}.foreignShare`),
      transitFee: nn(raw, `${o}.transitFee`),
      discountPer: ganz(raw, `${o}.discountPer`),
      discountStep: nn(raw, `${o}.discountStep`),
      discountMax: nn(raw, `${o}.discountMax`),
      minimum: nn(raw, `${o}.minimum`),
      shortfall: nn(raw, `${o}.shortfall`),
    },
    cancelPressure: nn(raw, `${p}.cancelPressure`),
  };
  if (out.mood.down + out.mood.up > 1) throw new BalanceError('balance.yaml: "transport.negotiation.mood" down + up ≤ 1');
  return out;
}

export function parseBotPlans(raw: unknown): Record<'cautious' | 'greedy' | 'balanced', BotPlans> {
  const out = {} as Record<'cautious' | 'greedy' | 'balanced', BotPlans>;
  for (const name of ['cautious', 'greedy', 'balanced'] as const) {
    // Ein schon gelesenes Balance-Objekt trägt den Block unter „botPlans“.
    const q = wert(raw, 'bots.plans') === undefined && wert(raw, 'botPlans') !== undefined ? `botPlans.${name}` : `bots.plans.${name}`;
    const plans = {} as BotPlans;
    for (const key of BOT_PLAN_KEYS) {
      const v = wert(raw, `${q}.${key}`);
      if (typeof v !== 'boolean') throw new BalanceError(`balance.yaml: "${q}.${key}" muss true oder false sein`);
      plans[key] = v;
    }
    out[name] = plans;
  }
  return out;
}
