// Personal (4.9, GDD §11 und §3): Ab Kapitel 2 führt Jacob nicht mehr alles
// selbst. Zwei Stellen gibt es zuerst:
//   Sekretärin / Prokurist – mehr Termine je Runde, erledigt Routinepost und den
//     Ölverkauf nach Richtlinie (Delegation statt Mikromanagement).
//   Fixer (Sicherheitschef) – Abwehr gegen Sabotage, schmutzige Aufträge
//     (Spionage, Sabotage beim Rivalen) – und Hitze.
// Jede Person hat Kompetenz (1–5, anfangs nur ungefähr sichtbar), Loyalität
// (0–100), Ehrgeiz (1–5) und 1–2 Merkmale. Löhne und Loyalität folgen der
// Lohn-Richtlinie; wer illoyal und ehrgeizig ist, verrät Jacob.
//
// Diese Datei: Zustand, Spielzahlen (balance.yaml: staff), reine Abfragen und die
// Aktionen des Spielers (einstellen, entlassen, anerkennen, Richtlinien,
// Aufträge). Was am Rundenende passiert, steht in staffRound.ts.
//
// In Kapitel 1 gibt es kein Personal: state.staff bleibt undefined. Erst ab
// staff.unlockChapter (oder per openStaff, z. B. beim Start von Kapitel 2)
// entsteht der Zustand. Eigener Zufall (Seed + ":personal"), damit die Welt mit
// und ohne Personal dieselben Würfel zieht.

import { spendAppointments } from './agenda';
import { BalanceError, type Balance, type Range } from './balance';
import { formatDate } from './calendar';
import type { MailKind } from './events';
import type { GameState } from './game';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf } from './stocks'; // gemeinsamer Kapitel-Helfer (4.8), bis 4.5 state.chapter setzt
import type { WorldState } from './world';

// --- Arten ---------------------------------------------------------------------

export const STAFF_ROLES = ['secretary', 'fixer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Merkmale (GDD §11). */
export const STAFF_TRAITS = ['genie', 'trinker', 'gewissenhaft', 'gierig', 'verschwiegen', 'spieler', 'treu', 'ehrgeizig', 'charmant'] as const;
export type StaffTrait = (typeof STAFF_TRAITS)[number];

/** Merkmale, die nicht zusammen in einer Person stecken. */
const UNVERTRAEGLICH: readonly [StaffTrait, StaffTrait][] = [
  ['treu', 'ehrgeizig'],
  ['gewissenhaft', 'gierig'],
];

/** Aufträge an den Fixer (GDD §11: Spionage, Sabotage). */
export const FIXER_ORDERS = ['spy', 'sabotage'] as const;
export type FixerOrder = (typeof FIXER_ORDERS)[number];

/** Die vier Briefarten (wie MAIL_KINDS in events.ts – hier doppelt, damit balance.ts → staff.ts keinen Kreis über events.ts zieht). */
export const STAFF_MAIL_KINDS = ['offer', 'demand', 'info', 'personal'] as const satisfies readonly MailKind[];

/** Post-Richtlinie je Briefart: Jacob prüft selbst – oder das Vorzimmer entscheidet, wenn die Frist abläuft. */
export const MAIL_RULES = ['jacob', 'staff'] as const;
export type MailRule = (typeof MAIL_RULES)[number];

/**
 * Merkzeichen, die das Personal setzt – Ereignisse können darauf reagieren
 * (z. B. „Drohen“ nur mit Fixer, GDD §3). Die ersten drei gelten nur, solange
 * der Zustand anhält, die anderen bleiben.
 */
export const STAFF_MARKS = {
  /** Eine Sekretärin / ein Prokurist ist angestellt. */
  secretary: 'personal_sekretaerin',
  /** Ein Fixer ist angestellt. */
  fixer: 'personal_fixer',
  /** Die Hitze ist hoch (ab fixer.scandalFrom). */
  heat: 'fixer_hitze',
  /** Jemand aus dem Personal hat Jacob verraten (Bücher kopiert, zur Presse). */
  betrayal: 'personal_verrat',
  /** Ein Rivale hat jemanden abgeworben. */
  poached: 'personal_abgeworben',
  /** Ein Ehrgeiziger hat eine eigene Firma gegründet – Stoff für einen neuen Rivalen. */
  ownFirm: 'personal_eigene_firma',
  /** Die Hitze ist in einen Skandal umgeschlagen. */
  scandal: 'fixer_skandal',
  /** Ein Fixer, der zu viel weiß, wurde entlassen. */
  fixerFired: 'fixer_entlassen',
  /** Der Fixer hat Bullard ausspioniert. */
  spied: 'fixer_spionage',
  /** Der Fixer hat Bullard sabotiert. */
  sabotaged: 'fixer_sabotage',
} as const;

/**
 * Merkzeichen, die eine Wahl in content/events/ setzt und das Personal liest –
 * wirken am Rundenende der Runde, in der sie gesetzt wurden (einmal je Partie,
 * weil Merkzeichen ihre erste Runde behalten).
 */
export const STAFF_EVENT_MARKS = {
  /** Anerkennung für das Vorzimmer (z. B. Zulage gegen ein Abwerbeangebot): Loyalität plus. */
  praiseSecretary: 'personal_lob_vorzimmer',
  /** Anerkennung für den Fixer: Loyalität plus. */
  praiseFixer: 'personal_lob_fixer',
  /** Ein Brief schickt den Fixer los: Hitze plus (fixer.eventHeat). */
  heat: 'fixer_auftrag_brief',
} as const;

/** Merkzeichen, die nur gelten, solange der Zustand anhält. */
const ZUSTANDS_MARKS: readonly string[] = [STAFF_MARKS.secretary, STAFF_MARKS.fixer, STAFF_MARKS.heat];

/** Alle Merkzeichen, die die Simulation hier setzt – für die Inhaltsprüfung. */
export const STAFF_SIM_MARKS = Object.values(STAFF_MARKS);

// --- Zustand -------------------------------------------------------------------

/** Ein Mensch, wie er sich bewirbt. Der Name steht in content/staff.yaml (names.<role>[name]). */
export interface StaffPerson {
  role: StaffRole;
  /** Index in die Namensliste der Stelle in content/staff.yaml. */
  name: number;
  /** Kompetenz 1–5 – für den Spieler anfangs nur ungefähr sichtbar. */
  competence: number;
  /**
   * Ruf: die Kompetenz, die man der Person nachsagt (echte ±1). Danach richten sich
   * die sichtbare Spanne und der Lohn – sonst verriete der Lohn die echte Kompetenz.
   */
  claim: number;
  /** Ehrgeiz 1–5. */
  ambition: number;
  traits: StaffTrait[];
}

/** Jemand, der für Jacob arbeitet. */
export interface StaffMember extends StaffPerson {
  /** Loyalität 0–100, für den Spieler nur als Wort sichtbar. */
  loyalty: number;
  hiredRound: number;
  /** Personalakte: Entscheidungen, die gut bzw. schlecht ausgingen (Trefferbilanz, GDD §11). */
  good: number;
  bad: number;
}

export interface SalesPolicy {
  /** Verkauf nach Regel an: Das Vorzimmer verkauft am Rundenende selbst. */
  on: boolean;
  /** Mindestpreis beim Trust in $ je Barrel (GDD §11: „Mindestpreis 1,10 $“). */
  minPrice: number;
  /** Anteil des Tanks je Runde (0–1). */
  share: number;
}

/** Richtlinien statt Mikromanagement (GDD §11). */
export interface StaffPolicies {
  /** Post: je Briefart, wer entscheidet, wenn die Frist abläuft. */
  mail: Record<MailKind, MailRule>;
  /** Post: Antworten, die mehr als so viel $ kosten, gibt das Vorzimmer nie selbst (GDD §11: „über 500 $ selbst prüfen“). */
  mailSpendLimit: number;
  sales: SalesPolicy;
  /** Personal: Lohnstufe (id aus balance.staff.wage.levels). */
  wage: string;
}

/** Was der Fixer über Bullard herausgefunden hat. */
export interface FixerIntel {
  round: number;
  /** Bullards Kasse, auf 100 $ gerundet. */
  cash: number;
  drilling: number;
  found: number;
  leases: number;
}

export interface StaffState {
  /** Eigener Zufall des Personals. */
  rng: RngState;
  /** Angestellt: höchstens eine Person je Stelle. */
  hired: StaffMember[];
  /** Bewerber auf dem Tisch. */
  candidates: StaffPerson[];
  /** Runde, in der die Bewerbungen zuletzt kamen. */
  candidatesRound: number;
  /** Namen („role:index“), die schon vergeben waren – sie bewerben sich nicht noch einmal. */
  used: string[];
  policies: StaffPolicies;
  /** Hitze 0–100 aus schmutzigen Aufträgen; nur als Wort sichtbar. */
  heat: number;
  /** Aufträge dieser Runde (schon bezahlt), werden am Rundenende ausgeführt. */
  orders: FixerOrder[];
  /** Stellen, die in dieser Runde schon Anerkennung bekamen. */
  recognized: StaffRole[];
  /** Stellen, deren Trinker in dieser Runde ausfällt (am Rundenanfang gewürfelt). */
  drunk: StaffRole[];
  /** Letzter Bericht des Fixers über Bullard, oder null. */
  intel: FixerIntel | null;
  /** Was das Personal zuletzt getan hat (neueste zuletzt, höchstens JOURNAL_MAX Zeilen) – für die Personalakte. */
  journal: string[];
}

/** So viele Zeilen behält das Personal-Journal. */
export const JOURNAL_MAX = 12;

// --- Spielzahlen (balance.yaml: staff) -----------------------------------------

export interface WageLevel {
  id: string;
  factor: number;
  /** Loyalität je Runde auf dieser Stufe. */
  loyalty: number;
}

export interface FixerOrderBalance {
  cost: number;
  heat: number;
  /** Erfolgschance bei Kompetenz 1 bzw. 5 (dazwischen gerade Linie). */
  successMin: number;
  successMax: number;
  /** Sabotage: Bullard verliert so viel $ … */
  rivalCash?: number;
  /** … und seine laufenden Bohrungen so viele Runden. */
  delay?: number;
  /** Sabotage misslungen: Hitze zusätzlich. */
  caughtHeat?: number;
}

export interface StaffBalance {
  unlockChapter: number;
  hireAppointments: number;
  recognitionAppointments: number;
  candidatesPerRole: number;
  candidateRefreshRounds: number;
  revealRounds: number;
  namePool: number;
  candidate: { competence: Range; ambition: Range; secondTraitChance: number };
  wage: {
    secretary: number;
    fixer: number;
    competenceStep: number;
    creditSensitivity: number;
    severanceRounds: number;
    levels: WageLevel[];
    startLevel: string;
  };
  loyalty: {
    start: number;
    recognition: number;
    cut: number;
    scapegoat: number;
    illegalOrder: number;
    conscience: number;
    ambitionDrift: number;
    genieSwing: number;
    loyalFloor: number;
    poachBelow: number;
    poachChance: number;
    betrayBelow: number;
    betrayAmbition: number;
    betrayChance: number;
    words: { treu: number; zufrieden: number; unzufrieden: number };
  };
  secretary: {
    extraAppointments: number;
    extraFromCompetence: number;
    drunkChance: number;
    judgementNoise: number;
    greedChance: number;
    greedSkim: number;
    charmBonus: number;
    mailSpendLimit: number;
  };
  sales: { minPrice: number; share: number; misjudgeChance: number };
  fixer: {
    defense: number;
    heatDecay: number;
    heatDecayDiscreet: number;
    scandalFrom: number;
    scandalChance: number;
    scandalFine: number;
    scandalCool: number;
    leakHeat: number;
    eventHeat: number;
    words: { lauwarm: number; heiss: number };
    orders: Record<FixerOrder, FixerOrderBalance>;
  };
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const v = wert(obj, path);
  if (typeof v !== 'number' || Number.isNaN(v)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  return v;
}

function abNull(obj: unknown, path: string): number {
  const v = zahl(obj, path);
  if (v < 0) throw new BalanceError(`balance.yaml: "${path}" darf nicht negativ sein`);
  return v;
}

function ganz(obj: unknown, path: string, min: number): number {
  const v = zahl(obj, path);
  if (!Number.isInteger(v) || v < min) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab ${min} sein`);
  return v;
}

function anteil(obj: unknown, path: string): number {
  const v = zahl(obj, path);
  if (v < 0 || v > 1) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 0 und 1 liegen`);
  return v;
}

function stufen(obj: unknown, path: string): Range {
  const r = { min: ganz(obj, `${path}.min`, 1), max: ganz(obj, `${path}.max`, 1) };
  if (r.min > r.max || r.max > 5) throw new BalanceError(`balance.yaml: "${path}" muss zwischen 1 und 5 liegen (min ≤ max)`);
  return r;
}

function auftrag(obj: unknown, path: string): FixerOrderBalance {
  const o: FixerOrderBalance = {
    cost: abNull(obj, `${path}.cost`),
    heat: abNull(obj, `${path}.heat`),
    successMin: anteil(obj, `${path}.successMin`),
    successMax: anteil(obj, `${path}.successMax`),
  };
  for (const k of ['rivalCash', 'delay', 'caughtHeat'] as const) {
    if (wert(obj, `${path}.${k}`) !== undefined) o[k] = abNull(obj, `${path}.${k}`);
  }
  if (o.successMin > o.successMax) throw new BalanceError(`balance.yaml: "${path}.successMin" darf nicht über successMax liegen`);
  return o;
}

/** Liest den Block staff aus balance.yaml und prüft ihn. */
export function parseStaff(raw: unknown): StaffBalance {
  const s = 'staff';
  if (!wert(raw, s) || typeof wert(raw, s) !== 'object') throw new BalanceError('balance.yaml: Block "staff" fehlt');
  const levelsRaw = wert(raw, `${s}.wage.levels`);
  if (!Array.isArray(levelsRaw) || levelsRaw.length === 0) throw new BalanceError('balance.yaml: "staff.wage.levels" fehlt oder ist leer');
  const levels: WageLevel[] = levelsRaw.map((l, i) => {
    const id = (l as { id?: unknown })?.id;
    if (typeof id !== 'string' || id.trim() === '') throw new BalanceError(`balance.yaml: "staff.wage.levels[${i}].id" fehlt`);
    return { id, factor: abNull(l, 'factor'), loyalty: zahl(l, 'loyalty') };
  });
  const startLevel = wert(raw, `${s}.wage.startLevel`);
  if (typeof startLevel !== 'string' || !levels.some((l) => l.id === startLevel)) {
    throw new BalanceError('balance.yaml: "staff.wage.startLevel" muss eine der Lohnstufen sein');
  }
  const staff: StaffBalance = {
    unlockChapter: ganz(raw, `${s}.unlockChapter`, 1),
    hireAppointments: ganz(raw, `${s}.hireAppointments`, 0),
    recognitionAppointments: ganz(raw, `${s}.recognitionAppointments`, 0),
    candidatesPerRole: ganz(raw, `${s}.candidatesPerRole`, 1),
    candidateRefreshRounds: ganz(raw, `${s}.candidateRefreshRounds`, 1),
    revealRounds: ganz(raw, `${s}.revealRounds`, 0),
    namePool: ganz(raw, `${s}.namePool`, 1),
    candidate: {
      competence: stufen(raw, `${s}.candidate.competence`),
      ambition: stufen(raw, `${s}.candidate.ambition`),
      secondTraitChance: anteil(raw, `${s}.candidate.secondTraitChance`),
    },
    wage: {
      secretary: abNull(raw, `${s}.wage.secretary`),
      fixer: abNull(raw, `${s}.wage.fixer`),
      competenceStep: abNull(raw, `${s}.wage.competenceStep`),
      creditSensitivity: abNull(raw, `${s}.wage.creditSensitivity`),
      severanceRounds: abNull(raw, `${s}.wage.severanceRounds`),
      levels,
      startLevel,
    },
    loyalty: {
      start: abNull(raw, `${s}.loyalty.start`),
      recognition: abNull(raw, `${s}.loyalty.recognition`),
      cut: abNull(raw, `${s}.loyalty.cut`),
      scapegoat: abNull(raw, `${s}.loyalty.scapegoat`),
      illegalOrder: abNull(raw, `${s}.loyalty.illegalOrder`),
      conscience: abNull(raw, `${s}.loyalty.conscience`),
      ambitionDrift: abNull(raw, `${s}.loyalty.ambitionDrift`),
      genieSwing: abNull(raw, `${s}.loyalty.genieSwing`),
      loyalFloor: abNull(raw, `${s}.loyalty.loyalFloor`),
      poachBelow: abNull(raw, `${s}.loyalty.poachBelow`),
      poachChance: anteil(raw, `${s}.loyalty.poachChance`),
      betrayBelow: abNull(raw, `${s}.loyalty.betrayBelow`),
      betrayAmbition: ganz(raw, `${s}.loyalty.betrayAmbition`, 1),
      betrayChance: anteil(raw, `${s}.loyalty.betrayChance`),
      words: {
        treu: abNull(raw, `${s}.loyalty.words.treu`),
        zufrieden: abNull(raw, `${s}.loyalty.words.zufrieden`),
        unzufrieden: abNull(raw, `${s}.loyalty.words.unzufrieden`),
      },
    },
    secretary: {
      extraAppointments: ganz(raw, `${s}.secretary.extraAppointments`, 0),
      extraFromCompetence: ganz(raw, `${s}.secretary.extraFromCompetence`, 1),
      drunkChance: anteil(raw, `${s}.secretary.drunkChance`),
      judgementNoise: abNull(raw, `${s}.secretary.judgementNoise`),
      greedChance: anteil(raw, `${s}.secretary.greedChance`),
      greedSkim: anteil(raw, `${s}.secretary.greedSkim`),
      charmBonus: abNull(raw, `${s}.secretary.charmBonus`),
      mailSpendLimit: abNull(raw, `${s}.secretary.mailSpendLimit`),
    },
    sales: {
      minPrice: abNull(raw, `${s}.sales.minPrice`),
      share: anteil(raw, `${s}.sales.share`),
      misjudgeChance: anteil(raw, `${s}.sales.misjudgeChance`),
    },
    fixer: {
      defense: anteil(raw, `${s}.fixer.defense`),
      heatDecay: abNull(raw, `${s}.fixer.heatDecay`),
      heatDecayDiscreet: abNull(raw, `${s}.fixer.heatDecayDiscreet`),
      scandalFrom: abNull(raw, `${s}.fixer.scandalFrom`),
      scandalChance: anteil(raw, `${s}.fixer.scandalChance`),
      scandalFine: abNull(raw, `${s}.fixer.scandalFine`),
      scandalCool: abNull(raw, `${s}.fixer.scandalCool`),
      leakHeat: abNull(raw, `${s}.fixer.leakHeat`),
      eventHeat: abNull(raw, `${s}.fixer.eventHeat`),
      words: { lauwarm: abNull(raw, `${s}.fixer.words.lauwarm`), heiss: abNull(raw, `${s}.fixer.words.heiss`) },
      orders: { spy: auftrag(raw, `${s}.fixer.orders.spy`), sabotage: auftrag(raw, `${s}.fixer.orders.sabotage`) },
    },
  };
  const w = staff.loyalty.words;
  if (!(w.unzufrieden <= w.zufrieden && w.zufrieden <= w.treu)) {
    throw new BalanceError('balance.yaml: Loyalitätswörter müssen aufsteigen: "unzufrieden" ≤ "zufrieden" ≤ "treu"');
  }
  if (staff.fixer.words.lauwarm > staff.fixer.words.heiss) {
    throw new BalanceError('balance.yaml: "staff.fixer.words.lauwarm" darf nicht über "heiss" liegen');
  }
  if (staff.candidatesPerRole > staff.namePool) {
    throw new BalanceError('balance.yaml: "staff.candidatesPerRole" darf nicht größer als "staff.namePool" sein');
  }
  return staff;
}

// --- Schnittstelle zur Welt (4.1 / 4.5) -----------------------------------------

/**
 * 4.9 Andockpunkt: Was das Personal von der Welt braucht – Kapitel (4.5) und
 * Kreditklima aus dem gemeinsamen Weltmodell (state.worldModel, 4.1).
 * Ersatzwerte für Zustände ohne diese Felder: Kapitel 1, Kreditklima 50.
 */
export interface StaffWorld {
  /** Laufendes Kapitel (ab staff.unlockChapter gibt es Personal). */
  chapter: number;
  /** Kreditklima 0–100, 50 = normal (GDD §7.1): Im Boom steigen die Löhne. */
  credit: number;
}

export const STAFF_WORLD_FALLBACK: StaffWorld = { chapter: 1, credit: 50 };

/**
 * Liest Kapitel (gemeinsamer Helfer chapterOf, state.chapter) und Kreditklima
 * (state.worldModel.credit, das Weltmodell von 4.1), sonst die Ersatzwerte.
 */
export function staffWorld(state: object): StaffWorld {
  const credit = (state as { worldModel?: Partial<Pick<WorldState, 'credit'>> }).worldModel?.credit;
  return {
    chapter: chapterOf(state),
    credit: typeof credit === 'number' && Number.isFinite(credit) ? credit : STAFF_WORLD_FALLBACK.credit,
  };
}

/** Ist das Personal in diesem Kapitel schon dran? */
export function staffUnlocked(state: object, balance: Balance): boolean {
  return staffWorld(state).chapter >= balance.staff.unlockChapter;
}

// --- Abfragen -------------------------------------------------------------------

type MitPersonal = Partial<Pick<GameState, 'staff'>>;

/** Wer auf dieser Stelle arbeitet, oder undefined. */
export function memberOf(state: MitPersonal, role: StaffRole): StaffMember | undefined {
  return state.staff?.hired.find((m) => m.role === role);
}

export function hasTrait(person: Pick<StaffPerson, 'traits'>, trait: StaffTrait): boolean {
  return person.traits.includes(trait);
}

/** Arbeitet diese Stelle in dieser Runde? Angestellt und nicht im Rausch. */
export function onDuty(state: MitPersonal, role: StaffRole): StaffMember | undefined {
  const m = memberOf(state, role);
  return m && !state.staff!.drunk.includes(role) ? m : undefined;
}

export function wageLevel(balance: Balance, id: string): WageLevel {
  return balance.staff.wage.levels.find((l) => l.id === id) ?? balance.staff.wage.levels.find((l) => l.id === balance.staff.wage.startLevel)!;
}

/** Lohnniveau der Welt: 1 = normal; folgt dem Kreditklima (4.1), Ersatzwert 1. */
export function wageIndex(state: object, balance: Balance): number {
  return Math.max(0.5, 1 + (staffWorld(state).credit - 50) * balance.staff.wage.creditSensitivity);
}

/** Lohn je Runde in $ (ganze Dollar): Stelle, Ruf (nicht die echte Kompetenz), Lohnstufe, Lohnniveau. */
export function wageOf(person: Pick<StaffPerson, 'role' | 'claim'>, state: MitPersonal & object, balance: Balance, level = state.staff?.policies.wage ?? balance.staff.wage.startLevel): number {
  const w = balance.staff.wage;
  const basis = w[person.role] * (1 + w.competenceStep * (person.claim - 3));
  return Math.round(Math.max(0, basis * wageLevel(balance, level).factor * wageIndex(state, balance)));
}

/** Alle Löhne dieser Runde zusammen. */
export function payroll(state: MitPersonal & object, balance: Balance): number {
  return (state.staff?.hired ?? []).reduce((s, m) => s + wageOf(m, state, balance), 0);
}

/**
 * Wie gut jemand ist, so weit Jacob es weiß: der Ruf ±1 (die echte Kompetenz liegt
 * darin) – erst nach staff.revealRounds Runden im Dienst genau (GDD §11).
 */
export function competenceShown(person: StaffPerson | StaffMember, state: Pick<GameState, 'round'>, balance: Balance): Range {
  const genau = 'hiredRound' in person && state.round - person.hiredRound >= balance.staff.revealRounds;
  if (genau) return { min: person.competence, max: person.competence };
  return { min: Math.max(1, person.claim - 1), max: Math.min(5, person.claim + 1) };
}

export const LOYALTY_WORDS = ['treu', 'zufrieden', 'unzufrieden', 'abtruennig'] as const;
export type LoyaltyWord = (typeof LOYALTY_WORDS)[number];

/** Loyalität als Wort – nie als Zahl. */
export function loyaltyWord(loyalty: number, balance: Balance): LoyaltyWord {
  const w = balance.staff.loyalty.words;
  if (loyalty >= w.treu) return 'treu';
  if (loyalty >= w.zufrieden) return 'zufrieden';
  if (loyalty >= w.unzufrieden) return 'unzufrieden';
  return 'abtruennig';
}

export const HEAT_WORDS = ['kalt', 'lauwarm', 'heiss'] as const;
export type HeatWord = (typeof HEAT_WORDS)[number];

/** Hitze als Wort – nie als Zahl. */
export function heatWord(heat: number, balance: Balance): HeatWord {
  const w = balance.staff.fixer.words;
  if (heat >= w.heiss) return 'heiss';
  if (heat >= w.lauwarm) return 'lauwarm';
  return 'kalt';
}

/** Hitze 0–100 für andere Systeme (Ermittler, Schattenbuch, Presse) – 0 ohne Personal. 4.9 Andockpunkt. */
export function staffHeat(state: MitPersonal): number {
  return state.staff?.heat ?? 0;
}

/** Termine mehr je Runde durch das Vorzimmer (GDD §3: 5, mit Sekretärin bis zu 7). */
export function extraAppointments(state: MitPersonal, balance: Balance): number {
  const m = onDuty(state, 'secretary');
  if (!m) return 0;
  const s = balance.staff.secretary;
  return s.extraAppointments + (m.competence >= s.extraFromCompetence ? 1 : 0);
}

/** Faktor auf die Sabotage-Chance gegen Jacob: 1 ohne Fixer, darunter mit ihm (je besser, desto kleiner). */
export function fixerDefense(state: MitPersonal, balance: Balance): number {
  const m = onDuty(state, 'fixer');
  return m ? 1 - balance.staff.fixer.defense * (m.competence / 5) : 1;
}

/** Erfolgschance eines Auftrags bei dieser Kompetenz (gerade Linie von 1 bis 5). */
export function orderSuccess(order: FixerOrder, competence: number, balance: Balance): number {
  const o = balance.staff.fixer.orders[order];
  return o.successMin + ((o.successMax - o.successMin) * (competence - 1)) / 4;
}

// --- Bewerber -------------------------------------------------------------------

function nameKey(role: StaffRole, name: number): string {
  return `${role}:${name}`;
}

/** Würfelt einen Bewerber; null, wenn kein Name mehr frei ist. */
function rollPerson(role: StaffRole, staff: Pick<StaffState, 'used' | 'candidates' | 'hired'>, balance: Balance, rng: Rng): StaffPerson | null {
  const b = balance.staff;
  const belegt = new Set([...staff.used, ...staff.candidates.map((c) => nameKey(c.role, c.name)), ...staff.hired.map((m) => nameKey(m.role, m.name))]);
  const frei = Array.from({ length: b.namePool }, (_, i) => i).filter((i) => !belegt.has(nameKey(role, i)));
  if (frei.length === 0) return null;
  const name = rng.pick(frei);
  let competence = rng.int(b.candidate.competence.min, b.candidate.competence.max);
  let ambition = rng.int(b.candidate.ambition.min, b.candidate.ambition.max);
  const traits: StaffTrait[] = [rng.pick(STAFF_TRAITS)];
  if (rng.float() < b.candidate.secondTraitChance) {
    const passt = STAFF_TRAITS.filter((t) => t !== traits[0] && !UNVERTRAEGLICH.some(([a, c]) => (a === t && c === traits[0]) || (c === t && a === traits[0])));
    traits.push(rng.pick(passt));
  }
  // Merkmale prägen die Zahlen (GDD §11): Genie = hohe Kompetenz, Ehrgeizig = hoher Ehrgeiz, Treu = wenig.
  if (traits.includes('genie')) competence = Math.max(4, competence);
  if (traits.includes('ehrgeizig')) ambition = Math.max(4, ambition);
  if (traits.includes('treu')) ambition = Math.min(2, ambition);
  const claim = Math.max(1, Math.min(5, competence + rng.int(-1, 1)));
  return { role, name, competence, claim, ambition, traits };
}

/** Neue Bewerbungen: für jede freie Stelle staff.candidatesPerRole Bewerber. */
function freshCandidates(staff: StaffState, round: number, balance: Balance): StaffState {
  const rng = new Rng(staff.rng);
  const offen = STAFF_ROLES.filter((r) => !staff.hired.some((m) => m.role === r));
  let out: StaffState = { ...staff, candidates: [], candidatesRound: round };
  for (const role of offen) {
    for (let i = 0; i < balance.staff.candidatesPerRole; i++) {
      const p = rollPerson(role, out, balance, rng);
      if (p) out = { ...out, candidates: [...out.candidates, p] };
    }
  }
  return { ...out, rng: rng.state };
}

/** Kommen neue Bewerbungen? Alle staff.candidateRefreshRounds Runden. */
export function refreshCandidates(staff: StaffState, round: number, balance: Balance): StaffState {
  return round - staff.candidatesRound >= balance.staff.candidateRefreshRounds ? freshCandidates(staff, round, balance) : staff;
}

/** Leerer Personalzustand mit ersten Bewerbungen und den Start-Richtlinien aus balance.yaml. */
export function newStaff(seed: string, round: number, balance: Balance): StaffState {
  const b = balance.staff;
  const leer: StaffState = {
    rng: seedFromString(`${seed}:personal`),
    hired: [],
    candidates: [],
    candidatesRound: round,
    used: [],
    policies: {
      mail: { offer: 'jacob', demand: 'jacob', info: 'jacob', personal: 'jacob' },
      mailSpendLimit: b.secretary.mailSpendLimit,
      sales: { on: false, minPrice: b.sales.minPrice, share: b.sales.share },
      wage: b.wage.startLevel,
    },
    heat: 0,
    orders: [],
    recognized: [],
    drunk: [],
    intel: null,
    journal: [],
  };
  return freshCandidates(leer, round, balance);
}

/**
 * 4.9 Andockpunkt (4.5): Personal freischalten – beim Start von Kapitel 2 aufrufen.
 * Hat Jacob schon Personal, bleibt alles, wie es ist.
 */
export function openStaff(state: GameState, balance: Balance): GameState {
  if (state.staff) return state;
  return {
    ...state,
    staff: newStaff(state.seed, state.round, balance),
    log: [...state.log, `${formatDate(state)}: Auf dem Schreibtisch liegen die ersten Bewerbungen – Jacob kann jetzt Personal einstellen.`],
  };
}

// --- Merkzeichen ----------------------------------------------------------------

/** Setzt ein Merkzeichen (behält die erste Runde). */
export function markStaff(state: GameState, mark: string): GameState {
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

/** Hält die Zustands-Merkzeichen (Sekretärin, Fixer, Hitze) passend zum Personal. */
export function syncStaffMarks(state: GameState, balance: Balance): GameState {
  if (!state.staff) return state;
  const soll: Record<string, boolean> = {
    [STAFF_MARKS.secretary]: memberOf(state, 'secretary') !== undefined,
    [STAFF_MARKS.fixer]: memberOf(state, 'fixer') !== undefined,
    [STAFF_MARKS.heat]: state.staff.heat >= balance.staff.fixer.scandalFrom,
  };
  let marks = state.events.marks;
  for (const m of ZUSTANDS_MARKS) {
    const da = marks[m] !== undefined;
    if (soll[m] && !da) marks = { ...marks, [m]: state.round };
    if (!soll[m] && da) {
      marks = { ...marks };
      delete marks[m];
    }
  }
  return marks === state.events.marks ? state : { ...state, events: { ...state.events, marks } };
}

// --- Aktionen des Spielers -------------------------------------------------------

export type StaffResult = { ok: true; state: GameState; message?: string } | { ok: false; reason: string };

export const ROLLE: Record<StaffRole, string> = { secretary: 'Vorzimmer', fixer: 'Sicherheitschef' };
/** Die Stelle im Satz („Jacob entlässt …“). */
const AKK: Record<StaffRole, string> = { secretary: 'seine Kraft im Vorzimmer', fixer: 'seinen Sicherheitschef' };

/** Schreibt ins Protokoll und ins Journal des Personals (state.staff muss da sein). */
export function staffLog(state: GameState, text: string): GameState {
  const zeile = `${formatDate(state)}: ${text}`;
  const journal = [...(state.staff?.journal ?? []), zeile].slice(-JOURNAL_MAX);
  return { ...state, log: [...state.log, zeile], ...(state.staff ? { staff: { ...state.staff, journal } } : {}) };
}

function bereit(state: GameState): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (!state.staff) return 'Personal gibt es erst ab Kapitel 2.';
  return null;
}

function mitPersonal(state: GameState, staff: StaffState): GameState {
  return { ...state, staff };
}

function aendern(state: GameState, role: StaffRole, f: (m: StaffMember) => StaffMember): GameState {
  const staff = state.staff!;
  return mitPersonal(state, { ...staff, hired: staff.hired.map((m) => (m.role === role ? f(m) : m)) });
}

export function clampLoyalty(member: StaffMember, value: number, balance: Balance): number {
  const unten = hasTrait(member, 'treu') ? balance.staff.loyalty.loyalFloor : 0;
  return Math.max(unten, Math.min(100, value));
}

/** Stellt einen Bewerber ein: kostet staff.hireAppointments Termine (Vorstellungsgespräch). Den ersten Lohn gibt es am Rundenende. */
export function hireStaff(state: GameState, balance: Balance, index: number): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  const staff = state.staff!;
  const p = staff.candidates[index];
  if (!p) return { ok: false, reason: 'Diese Bewerbung liegt nicht mehr auf dem Tisch.' };
  if (memberOf(state, p.role)) return { ok: false, reason: `Die Stelle (${ROLLE[p.role]}) ist schon besetzt.` };
  const zeit = spendAppointments(state, balance, balance.staff.hireAppointments);
  if (!zeit.ok) return zeit;
  const member: StaffMember = { ...p, loyalty: balance.staff.loyalty.start, hiredRound: state.round, good: 0, bad: 0 };
  const neu: StaffState = {
    ...zeit.state.staff!,
    hired: [...zeit.state.staff!.hired, member],
    // Die anderen Bewerber für diese Stelle gehen wieder.
    candidates: zeit.state.staff!.candidates.filter((c) => c.role !== p.role),
    used: [...zeit.state.staff!.used, nameKey(p.role, p.name)],
  };
  const out = staffLog(mitPersonal(zeit.state, neu), `Jacob stellt eine neue Kraft ein: ${ROLLE[p.role]}.`);
  return { ok: true, state: syncStaffMarks(out, balance) };
}

/**
 * Entlässt jemanden: Abfindung staff.wage.severanceRounds Rundenlöhne. Die
 * Kollegen nehmen es übel (Sündenbock, GDD §11). Ein Fixer, der bei Hitze geht,
 * weiß zu viel (Merkzeichen fixer_entlassen).
 */
export function dismissStaff(state: GameState, balance: Balance, role: StaffRole): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  const m = memberOf(state, role);
  if (!m) return { ok: false, reason: 'Diese Stelle ist nicht besetzt.' };
  const abfindung = Math.round(wageOf(m, state, balance) * balance.staff.wage.severanceRounds);
  const staff = state.staff!;
  const rest = staff.hired
    .filter((x) => x.role !== role)
    .map((x) => ({ ...x, loyalty: clampLoyalty(x, x.loyalty - balance.staff.loyalty.scapegoat, balance) }));
  let out: GameState = staffLog(
    {
      ...state,
      cash: state.cash - abfindung,
      staff: {
        ...staff,
        hired: rest,
        recognized: staff.recognized.filter((r) => r !== role),
        drunk: staff.drunk.filter((r) => r !== role),
        orders: role === 'fixer' ? [] : staff.orders,
      },
    },
    `Jacob entlässt ${AKK[role]} – ${abfindung.toLocaleString('de-DE')} $ Abfindung.`,
  );
  if (role === 'fixer' && staff.heat > 0) out = markStaff(out, STAFF_MARKS.fixerFired);
  return { ok: true, state: syncStaffMarks(out, balance) };
}

/** Persönliche Anerkennung (GDD §11): ein Termin, einmal je Runde und Person, Loyalität plus. */
export function recognizeStaff(state: GameState, balance: Balance, role: StaffRole): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  const m = memberOf(state, role);
  if (!m) return { ok: false, reason: 'Diese Stelle ist nicht besetzt.' };
  if (state.staff!.recognized.includes(role)) return { ok: false, reason: 'Dafür hat Jacob sich in dieser Runde schon Zeit genommen.' };
  const zeit = spendAppointments(state, balance, balance.staff.recognitionAppointments);
  if (!zeit.ok) return zeit;
  const gelobt = aendern(zeit.state, role, (x) => ({ ...x, loyalty: clampLoyalty(x, x.loyalty + balance.staff.loyalty.recognition, balance) }));
  const gemerkt = mitPersonal(gelobt, { ...gelobt.staff!, recognized: [...gelobt.staff!.recognized, role] });
  return { ok: true, state: staffLog(gemerkt, `Jacob nimmt sich Zeit für ${AKK[role]} – ein gutes Wort, ein Glas, ein Händedruck.`) };
}

/** Post-Richtlinie für eine Briefart. */
export function setMailRule(state: GameState, kind: MailKind, rule: MailRule): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  if (!(STAFF_MAIL_KINDS as readonly string[]).includes(kind) || !MAIL_RULES.includes(rule)) return { ok: false, reason: 'Diese Richtlinie gibt es nicht.' };
  const p = state.staff!.policies;
  return { ok: true, state: mitPersonal(state, { ...state.staff!, policies: { ...p, mail: { ...p.mail, [kind]: rule } } }) };
}

/** Post-Richtlinie: bis zu welchem Betrag das Vorzimmer selbst antworten darf. */
export function setMailSpendLimit(state: GameState, limit: number): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  if (!Number.isFinite(limit) || limit < 0) return { ok: false, reason: 'Der Betrag muss 0 oder mehr sein.' };
  const p = state.staff!.policies;
  return { ok: true, state: mitPersonal(state, { ...state.staff!, policies: { ...p, mailSpendLimit: Math.round(limit) } }) };
}

/** Verkaufs-Richtlinie (GDD §11: „Mindestpreis 1,10 $“). */
export function setSalesPolicy(state: GameState, change: Partial<SalesPolicy>): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  const alt = state.staff!.policies.sales;
  const sales: SalesPolicy = { ...alt, ...change };
  if (!Number.isFinite(sales.minPrice) || sales.minPrice < 0) return { ok: false, reason: 'Der Mindestpreis muss 0 oder mehr sein.' };
  if (!Number.isFinite(sales.share) || sales.share <= 0 || sales.share > 1) return { ok: false, reason: 'Der Anteil muss zwischen 0 und 100 % liegen.' };
  sales.minPrice = Math.round(sales.minPrice * 100) / 100;
  return { ok: true, state: mitPersonal(state, { ...state.staff!, policies: { ...state.staff!.policies, sales } }) };
}

/** Lohn-Richtlinie (GDD §11: „Löhne 10 % über Markt“). Eine Kürzung kostet sofort Loyalität. */
export function setWageLevel(state: GameState, balance: Balance, id: string): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  const neu = balance.staff.wage.levels.find((l) => l.id === id);
  if (!neu) return { ok: false, reason: 'Diese Lohnstufe gibt es nicht.' };
  const alt = wageLevel(balance, state.staff!.policies.wage);
  const staff = state.staff!;
  const gekuerzt = neu.factor < alt.factor;
  const hired = gekuerzt ? staff.hired.map((m) => ({ ...m, loyalty: clampLoyalty(m, m.loyalty - balance.staff.loyalty.cut, balance) })) : staff.hired;
  const out = mitPersonal(state, { ...staff, hired, policies: { ...staff.policies, wage: id } });
  return { ok: true, state: gekuerzt && hired.length > 0 ? staffLog(out, 'Jacob kürzt die Löhne. Im Büro wird es still.') : out };
}

/** Schmutzige Aufträge zählen als illegaler Befehl (Gewissenhafte verweigern). */
export function isIllegal(order: FixerOrder): boolean {
  return order === 'sabotage';
}

/**
 * Auftrag an den Fixer (GDD §11): wird sofort bezahlt und am Rundenende
 * ausgeführt; je Auftrag einmal je Runde. Ein gewissenhafter Fixer verweigert
 * illegale Befehle – das kostet Loyalität, aber kein Geld.
 */
export function orderFixer(state: GameState, balance: Balance, order: FixerOrder): StaffResult {
  const fehlt = bereit(state);
  if (fehlt) return { ok: false, reason: fehlt };
  if (!FIXER_ORDERS.includes(order)) return { ok: false, reason: 'Diesen Auftrag gibt es nicht.' };
  const m = memberOf(state, 'fixer');
  if (!m) return { ok: false, reason: 'Dafür braucht Jacob einen Fixer.' };
  if (state.staff!.orders.includes(order)) return { ok: false, reason: 'Dieser Auftrag läuft in dieser Runde schon.' };
  const o = balance.staff.fixer.orders[order];
  if (state.cash < o.cost) return { ok: false, reason: `Dafür fehlt das Geld (${o.cost.toLocaleString('de-DE')} $ nötig).` };
  if (isIllegal(order) && hasTrait(m, 'gewissenhaft')) {
    const out = aendern(state, 'fixer', (x) => ({ ...x, loyalty: clampLoyalty(x, x.loyalty - balance.staff.loyalty.illegalOrder, balance) }));
    const message = 'Der Sicherheitschef verweigert den Auftrag. „Nicht mit mir, Mr. Harlan.“';
    return { ok: true, message, state: staffLog(out, message) };
  }
  const out = mitPersonal({ ...state, cash: state.cash - o.cost }, { ...state.staff!, orders: [...state.staff!.orders, order] });
  return { ok: true, state: staffLog(out, `Jacob gibt dem Sicherheitschef einen Auftrag (${o.cost.toLocaleString('de-DE')} $).`) };
}

// --- Spielstand -------------------------------------------------------------------

function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function istPerson(v: unknown): boolean {
  return (
    istObjekt(v) &&
    STAFF_ROLES.includes(v.role as StaffRole) &&
    istZahl(v.name) &&
    istZahl(v.competence) &&
    istZahl(v.claim) &&
    istZahl(v.ambition) &&
    Array.isArray(v.traits) &&
    v.traits.every((t) => STAFF_TRAITS.includes(t as StaffTrait))
  );
}

/** 4.9 Andockpunkt (save.ts): Ist das ein vollständiger Personalzustand? */
export function isStaffState(v: unknown): v is StaffState {
  if (!istObjekt(v) || !istZahl(v.rng) || !istZahl(v.heat) || !istZahl(v.candidatesRound)) return false;
  if (!Array.isArray(v.candidates) || !v.candidates.every(istPerson)) return false;
  if (!Array.isArray(v.hired) || !v.hired.every((m) => istPerson(m) && istObjekt(m) && istZahl(m.loyalty) && istZahl(m.hiredRound) && istZahl(m.good) && istZahl(m.bad))) {
    return false;
  }
  if (!Array.isArray(v.used) || !Array.isArray(v.journal) || !Array.isArray(v.orders) || !Array.isArray(v.recognized) || !Array.isArray(v.drunk)) return false;
  if (!v.orders.every((o) => FIXER_ORDERS.includes(o as FixerOrder))) return false;
  const intel = v.intel;
  if (intel !== null && !(istObjekt(intel) && ['round', 'cash', 'drilling', 'found', 'leases'].every((k) => istZahl(intel[k])))) return false;
  const p = v.policies;
  if (!istObjekt(p) || !istObjekt(p.mail) || !istZahl(p.mailSpendLimit) || typeof p.wage !== 'string' || !istObjekt(p.sales)) return false;
  const mail = p.mail;
  if (!STAFF_MAIL_KINDS.every((k) => MAIL_RULES.includes(mail[k] as MailRule))) return false;
  const s = p.sales;
  return typeof s.on === 'boolean' && istZahl(s.minPrice) && istZahl(s.share);
}
