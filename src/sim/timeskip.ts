// Zeitsprünge (4.5, GDD §2 und §13): Nach Kapitel 1 rechnet die Welt die Jahre bis
// Kapitel 2 weiter (Zeitsprung I, Jahr 5–10). Vor dem Sprung legt Jacob Direktiven
// fest (Haltung, Familie); unterwegs unterbrechen Weichen-Telegramme den Sprung,
// wenn die Welt sie hergibt (Bankenpanik bei überhitztem Kreditklima, erste
// Automobile, Öl in Okara, Claras Geburt). Danach zeigt die Chronik „Die Jahre
// dazwischen“, und Kapitel 2 „Der Herausforderer“ beginnt (4.12) – mit Quellen, Kasse,
// Firma bzw. Aktiengesellschaft und Familie aus dem Sprung und allen Kapitel-2-Systemen.
//
// Zeitsprung II (4.19, Jahr 15–20) läuft mit denselben Regeln je Quartal – dazu die Firma aus
// Kapitel 2: Eine fertige Raffinerie bringt je Barrel mehr, eine eigene Fernleitung zum Hafen spart
// Fracht, Baustellen (Raffinerie, Fernleitungen) bringt der Verwalter zu Ende, Anleihen löst er
// durch Bankkredite ab. Weichen (GDD §13): Kriegsgefahr in Übersee (Export trotz Risiko?), ein
// Heizölvertrag mit der Marine, Senator Gradys Reserveland (Skandal-Saat) und Thomas' College.
// Danach beginnt Kapitel 3 „Der Konzernherr“ mit allen Kapitel-3-Systemen und den Rivalen K3.
//
// Vereinfachte Regeln je Quartal: Förderung (wie im Spiel, mit Druck und
// Erschöpfung der Felder), Posted Price aus Salt-Hill-Angebot und Weltpreis,
// Verkauf über den billigsten eigenen Weg, Unterhalt und Zinsen, das Weltmodell
// rückt ein Quartal weiter (Salt Hill fließt winzig ein), Kreditkrisen kündigen Kredite.
// Je Jahr: tilgen, neue Bohrungen nach Haltung und Familienzeit (wagemutig auch in einem
// Nachbarbezirk), Bullard bohrt, die Familie lebt weiter; bleibt die Kasse im Minus:
// Notkredit bis zum Bankrahmen, Notverkauf, sonst Pleite (der Sprung endet dort).
// Benzinanlage und Okara bleiben als Beteiligungen (src/sim/ventures.ts).
//
// Deterministisch: Der Zufall kommt aus eigenen Strömen je Zweck (seed + ':zeitsprung1:bohren',
// ':clara', ':okara') und den Zufallsströmen im Zustand. runTimeskip rechnet den Sprung bei jedem Aufruf von vorn – mit allen
// bisher beantworteten Weichen. Fehlt eine Antwort, hält er dort an. So steht im
// Spielstand nur, was Jacob entschieden hat (state.jump), nie ein halber Sprung.
// Texte: content/timeskip.yaml; Zahlen: balance.yaml → timeskip.

import { jumpNetwork } from './network';
import { parseDocument } from 'yaml';
import { FAMILY_TIMES, STANCES, type Balance, type FamilyTime, type Stance } from './balance';
import { formatDate } from './calendar';
import { canGoPublic, chapterPassed } from './chapter';
import { creditLimit, debt, headroom, loanRate, quarterInterestTotal, refreshRating, repay, takeLoan } from './credit';
import { deepFindReserves, nextWellId, rollOilStage, stageCost, wellsOn, type Well } from './drilling';
import { empireValue } from './empire';
import type { ContentError } from './eventContent';
import { drawEvents, marksIntoNextChapter, type EventDef } from './events';
import { openChapterSystems, type ChapterSystemTexts } from './chapterSystems';
import { chapterOf } from './chapterOf';
import { regionChapter } from './worldMap';
import { bondWord, type BondWord } from './family';
import { fieldOf, fieldLabel } from './field';
// Etappe 1: Ohne Prognose schätzt der Verwalter nach dem öffentlichen Zonenwissen, nie nach der verdeckten Wahrheit.
import { zoneChance } from './forecast';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { leaseTerms, type Lease } from './lease';
import { computePrice, jacobSupply, neighbourWells, rivalSupply } from './market';
import { advanceProduction, fieldStatus, fieldWells, initialRate, producingWells } from './production';
import { rivalCandidates, rivalChance, rivalWellIncome, type RivalWell } from './rival';
import { Rng, seedFromString } from './rng';
import { newAgenda } from './agenda';
import { hearsayAroundFinds, learnFromWells } from './exploration';
import { newPricing } from './pricing'; // Etappe 2
import { newFreight } from './freight'; // Etappe 2
import { openRegions, unlockRegion } from './regions';
import { fuelPremium, okaraIncome } from './ventures';
import { TIMESKIP_MARKS, TIMESKIP_SIM_MARKS } from './timeskipMarks';
import { ownsHarborPipeline } from './bigPipeline';
import { finishSmallPipeline } from './logistics';
import { applySystemEffects } from './eventSystems';
import { startRivalsK3 } from './rivalsK3';
import { advanceWorld, creditPhase, saltHillInput, worldPriceFactor, worldRateAdd, type Party, type WorldNews } from './world';

export { FAMILY_TIMES, STANCES, type FamilyTime, type Stance };

// ---------------------------------------------------------------------------
// Typen

/** Die Weichen der Zeitsprünge (GDD §13): die ersten vier gehören zu Zeitsprung I, die anderen zu Zeitsprung II. */
export const SWITCH_IDS = ['bank_panic', 'automobile', 'okara', 'clara', 'war_export', 'navy', 'grady', 'college'] as const;
export type SwitchId = (typeof SWITCH_IDS)[number];

/** Die zwei Antworten je Weiche (Schlüssel in content/timeskip.yaml). */
export const SWITCH_CHOICES = {
  bank_panic: ['repay', 'ride'],
  automobile: ['invest', 'ignore'],
  okara: ['lease', 'pass'],
  clara: ['home', 'business'],
  war_export: ['export', 'hold'],
  navy: ['accept', 'decline'],
  grady: ['take', 'refuse'],
  college: ['college', 'company'],
} as const satisfies Record<SwitchId, readonly [string, string]>;
export type SwitchChoice<S extends SwitchId = SwitchId> = (typeof SWITCH_CHOICES)[S][number];

/** Welche Weichen zu welchem Zeitsprung gehören. */
export const JUMP_SWITCHES: Record<number, readonly SwitchId[]> = {
  1: ['bank_panic', 'automobile', 'okara', 'clara'],
  2: ['war_export', 'navy', 'grady', 'college'],
};

/** Der letzte Zeitsprung im Early-Access-Umfang: danach kommt Kapitel 3, Kapitel 4 folgt. */
export const LAST_JUMP = 2;

/** Titel der Kapitel (für das Protokoll; die Oberfläche nimmt die Texte aus content/timeskip.yaml). */
export const CHAPTER_TITLES: Record<number, string> = { 1: 'Der Wildcatter', 2: 'Der Herausforderer', 3: 'Der Konzernherr' };

/** Was in der Chronik stehen kann (Texte unter chronicle.entries). */
export const CHRONICLE_KINDS = [
  'world_crash',
  'world_panic',
  'world_recovery',
  'world_war',
  'world_peace',
  'world_election',
  'world_reelection',
  'world_glut',
  'world_nationalization',
  'world_uprising',
  'world_embargo',
  'law_passed',
  'law_failed',
  'price',
  'wells_found',
  'wells_dry',
  'field_empty',
  'debt_repaid',
  'crisis_call',
  'fire_sale',
  'emergency_loan',
  'bankrupt',
  'region_opened',
  'bullard_wells',
  'wildcatters_quit',
  'panic_repay',
  'panic_nodebt',
  'panic_ride',
  'automobile_invest',
  'automobile_ignore',
  'okara_found',
  'okara_dry',
  'okara_bullard',
  'clara_born',
  'clara_home',
  'clara_business',
  'thomas_school',
  'ruth_word',
  // Zeitsprung II (4.19)
  'projects_finished',
  'bonds_refinanced',
  'war_export',
  'war_hold',
  'war_tanker',
  'navy_accept',
  'navy_decline',
  'grady_take',
  'grady_refuse',
  'college_go',
  'college_firm',
] as const;
export type ChronicleKind = (typeof CHRONICLE_KINDS)[number];

/** Merkzeichen, die der Zeitsprung setzt (src/sim/timeskipMarks.ts). */
export { TIMESKIP_MARKS, TIMESKIP_SIM_MARKS };

/** Direktiven vor dem Sprung (GDD §2). Budget und Führung kommen mit späteren Kapiteln. */
export interface Directives {
  stance: Stance;
  family: FamilyTime;
}

/** Ein laufender Sprung im Spielstand: nur Entscheidungen, keine Zwischenstände. */
export interface JumpState {
  directives: Directives;
  answers: Partial<Record<SwitchId, string>>;
}

/** Eine Zeile der Chronik. Namen (Partei, Gesetz) und Beträge setzt die Oberfläche ein. */
export interface ChronicleEntry {
  /** Spieljahr seit Spielbeginn (Jahr 1 = 88 der Föderation). */
  year: number;
  kind: ChronicleKind;
  n?: number;
  amount?: number;
  name?: string;
  party?: Party;
  law?: string;
  price?: number;
  word?: BondWord;
}

/** Stand vor und nach dem Sprung – für die Bilanz der Chronik. */
export interface TimeskipSnapshot {
  cash: number;
  debt: number;
  wells: number;
  /** 0.4.20+2: Förderung je Runde (bbl); fehlt in älteren Spielständen. */
  flow?: number;
  value: number;
  ruth: number;
  children: number;
}

/** Ein abgeschlossener Zeitsprung. */
export interface TimeskipRecord {
  /** 1 = Zeitsprung I (nach Kapitel 1), 2 = Zeitsprung II (nach Kapitel 2). */
  number: number;
  /** Erstes und letztes Spieljahr des Sprungs. */
  fromYear: number;
  toYear: number;
  directives: Directives;
  answers: Partial<Record<SwitchId, string>>;
  /** Weichen in der Reihenfolge, in der sie kamen. */
  switches: SwitchId[];
  entries: ChronicleEntry[];
  before: TimeskipSnapshot;
  after: TimeskipSnapshot;
  /** Die Chronik wurde gelesen (danach geht es an den Schreibtisch). */
  read: boolean;
  /** Die Firma ging im Sprung pleite – das Spiel endet nach der Chronik. */
  bankrupt?: boolean;
  /**
   * 0.4.19+3: Schwächung nach verfehlter Kapitelprüfung (missedPenalty), damit die Chronik sie zeigt:
   * so viel $ weg aus der Kasse, Kraft zum Kapitelstart statt der vollen. Fehlt = keine Schwächung.
   */
  penalty?: { cash: number; strength: number; strengthMax: number };
}

/** Was der Verwalter beim Telegramm in der Hand hat: Kasse, Schulden, freier Bankrahmen (0 nach dem Tilgungs-Schwur). */
export interface SwitchFunds {
  cash: number;
  debt: number;
  credit: number;
}

export type TimeskipStep =
  | { status: 'switch'; id: SwitchId; year: number; entries: ChronicleEntry[]; funds: SwitchFunds }
  | { status: 'done'; state: GameState; record: TimeskipRecord };

export type TimeskipResult = { ok: true; state: GameState } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Kalender und Kapitel

/**
 * 0.4.19+3: Bis wann das Kapitel nach diesem Sprung läuft – in Föderationsjahren wie Kalender und Kopfleiste
 * (z. B. „Winter 101“), statt „Jahr 14“ in Spieljahren.
 */
export function chapterGoalDate(record: Pick<TimeskipRecord, 'toYear'>, state: Pick<GameState, 'startYear'>, balance: Balance): string {
  return formatDate({ round: record.toYear * 4 + balance.timeskip.nextChapterRounds, startYear: state.startYear });
}

/** Spieljahr seit Spielbeginn: Runde 1–4 = Jahr 1. */
export function gameYear(round: number): number {
  return Math.floor((round - 1) / 4) + 1;
}

/** Jacobs Alter: 25 in Jahr 1 (GDD §13: 35 in Kapitel 2). */
export function jacobAge(state: Pick<GameState, 'round'>): number {
  return 24 + gameYear(state.round);
}

/** Runde innerhalb des laufenden Kapitels (Kapitel 1: wie round). */
export function chapterRound(state: Pick<GameState, 'round' | 'chapterStart'>): number {
  return state.round - (state.chapterStart ?? 1) + 1;
}

/** Runden des laufenden Kapitels. */
export function chapterRounds(state: Pick<GameState, 'totalRounds' | 'chapterStart'>): number {
  return state.totalRounds - (state.chapterStart ?? 1) + 1;
}

/** Ist das Kapitel noch im Bau? Kapitel 2 ist seit 4.12 spielbar, Kapitel 3 seit 4.19; Kapitel 4 folgt. */
export function chapterUnderConstruction(state: Pick<GameState, 'chapter'>): boolean {
  return chapterOf(state) > LAST_JUMP + 1;
}

/** Welcher Zeitsprung am Ende dieses Kapitels kommt (1 nach Kapitel 1, 2 nach Kapitel 2). */
export function jumpNumber(state: Pick<GameState, 'chapter'>): number {
  return chapterOf(state);
}

// ---------------------------------------------------------------------------
// Start und Antworten

/** Warum der Sprung (noch) nicht geht; undefined = er geht. */
export function timeskipBlocked(state: GameState, balance: Balance): string | undefined {
  if (jumpNumber(state) > LAST_JUMP) return 'Kapitel 4 folgt – der Early-Access-Umfang endet mit Kapitel 3.';
  if (state.ending !== 'kapitel') return 'Der Zeitsprung kommt erst am Ende des Kapitels.';
  if (state.jump) return 'Der Zeitsprung läuft schon.';
  if (chapterOf(state) === 1 && canGoPublic(state, balance) && state.ipo === null) return 'Erst über die Aktiengesellschaft entscheiden.';
  return undefined;
}

/** Direktiven festlegen: Der Sprung beginnt (state.jump). */
export function startTimeskip(state: GameState, balance: Balance, directives: Directives): TimeskipResult {
  const blocked = timeskipBlocked(state, balance);
  if (blocked) return { ok: false, reason: blocked };
  if (!STANCES.includes(directives.stance) || !FAMILY_TIMES.includes(directives.family)) return { ok: false, reason: 'Diese Direktive kennt der Verwalter nicht.' };
  return { ok: true, state: { ...state, jump: { directives: { ...directives }, answers: {} } } };
}

/** Eine Weiche beantworten. Sie muss gerade anstehen (runTimeskip hält an ihr). */
export function answerSwitch(state: GameState, balance: Balance, id: SwitchId, choice: string, catalog: readonly EventDef[] = [], texts: ChapterSystemTexts = {}): TimeskipResult {
  if (!state.jump) return { ok: false, reason: 'Es läuft kein Zeitsprung.' };
  if (!(SWITCH_CHOICES[id] as readonly string[]).includes(choice)) return { ok: false, reason: 'Diese Antwort gibt es nicht.' };
  const step = runTimeskip(state, balance, catalog, texts);
  if (step.status !== 'switch' || step.id !== id) return { ok: false, reason: 'Diese Weiche steht gerade nicht an.' };
  const blockiert = switchChoice(step.funds, balance, id, choice).blocked;
  if (blockiert) return { ok: false, reason: blockiert };
  return { ok: true, state: { ...state, jump: { ...state.jump, answers: { ...state.jump.answers, [id]: choice } } } };
}

/** Was eine Antwort kostet (Benzinanlage, Pachten in Okara); 0 = nichts. */
export function switchCost(balance: Balance, id: SwitchId, choice: string): number {
  const t = balance.timeskip.switches;
  if (id === 'automobile' && choice === 'invest') return t.automobileCost;
  if (id === 'okara' && choice === 'lease') return t.okaraCost;
  if (id === 'grady' && choice === 'take') return balance.timeskip.second.gradyCost;
  if (id === 'college' && choice === 'college') return balance.timeskip.second.collegeCost;
  return 0;
}

/**
 * Geht eine Antwort mit dem Geld, das der Verwalter hat? Reicht die Kasse nicht, nimmt er
 * den Rest auf Kredit (onCredit, mindestens credit.minLoan); reicht auch der freie
 * Bankrahmen nicht, ist die Antwort gesperrt (blocked = Grund).
 */
export function switchChoice(funds: SwitchFunds, balance: Balance, id: SwitchId, choice: string): { cost: number; onCredit: boolean; blocked: string | null } {
  const cost = switchCost(balance, id, choice);
  const kasse = Math.max(0, funds.cash);
  if (cost <= kasse) return { cost, onCredit: false, blocked: null };
  const kredit = Math.max(balance.credit.minLoan, Math.ceil((cost - kasse) / 100) * 100);
  if (kredit <= funds.credit) return { cost, onCredit: true, blocked: null };
  return { cost, onCredit: true, blocked: 'Dafür reichen Kasse und Bankrahmen nicht.' };
}

/** Die Chronik ist gelesen – es geht an den Schreibtisch. */
export function markChronicleRead(state: GameState): GameState {
  const letzte = state.timeskips[state.timeskips.length - 1];
  if (!letzte || letzte.read) return state;
  return { ...state, timeskips: [...state.timeskips.slice(0, -1), { ...letzte, read: true }] };
}

/** Die Chronik, die noch gelesen werden will (nach dem Sprung), oder null. */
export function unreadChronicle(state: Pick<GameState, 'timeskips'>): TimeskipRecord | null {
  const letzte = state.timeskips?.[state.timeskips.length - 1];
  return letzte && !letzte.read ? letzte : null;
}

// ---------------------------------------------------------------------------
// Der Sprung

interface Lauf {
  /** Welcher Zeitsprung (1 oder 2). */
  nr: number;
  s: GameState;
  /** Eigene Zufallsströme je Zweck (sonst entschiede die Zahl der Probebohrungen mit, ob es in Okara Öl gibt). */
  rngBohren: Rng;
  rngClara: Rng;
  rngOkara: Rng;
  /** Zeitsprung II: Tanker im Krieg, Gradys Angebot. */
  rngKrieg: Rng;
  rngGrady: Rng;
  balance: Balance;
  directives: Directives;
  answers: Partial<Record<SwitchId, string>>;
  switches: SwitchId[];
  entries: ChronicleEntry[];
  /** Letztes Spieljahr des Sprungs: Spätestens dann kommt die Clara-Weiche. */
  letztesJahr: number;
  /** Nachbarquellen am Salt Hill (Bruchteile erlaubt). */
  nb: number;
  /** Kam in Okara Öl? (Gewürfelt, sobald die Weiche kommt – egal, wer die Pachten nimmt.) */
  okaraOil: boolean;
  /** Nach „tilgen“ in der Bankenpanik: kein neuer Kredit mehr. */
  noBorrow: boolean;
  /** Nach „weiter auf Pump“: mehr Kredit je Jahr, und in der Kreditkrise kündigt die Bank mehr. */
  ride: boolean;
  /** Clara-Weiche „zu Hause“: in diesem Jahr keine neuen Bohrungen. */
  pauseYear: number;
  /** Kreditkündigung: bis einschließlich dieses Jahres keine neuen Bohrungen. */
  stopUntil: number;
  /** Clara kommt in dieser Runde zur Welt (0 = nicht unterwegs). */
  claraDue: number;
  /** Vom Verwalter erschlossene Nachbarbezirke: Dort bohrt er nach der Zonenkarte, ohne Geologen. */
  expanded: string[];
  /** Die Firma ist pleite – der Sprung endet hier. */
  pleite: boolean;
  /** Felder, deren Erschöpfung schon gemeldet ist. */
  leer: Set<string>;
  /** Preise des laufenden Jahres. */
  preise: number[];
  /** Zeitsprung II: Export trotz Kriegsgefahr. */
  warExport: boolean;
  /** Zeitsprung II: Marinevertrag zahlt ab dieser Runde (0 = keiner). */
  navySince: number;
  /** Zeitsprung II: Gradys Reserveland zahlt ab dieser Runde (0 = keins). */
  gradySince: number;
  /** 0.4.20+2: So viele neue Quellen darf der Verwalter je Jahr finden (timeskip.manager; 0.4.19+3 galt das für den ganzen Sprung). */
  fundeJahr: number;
  /** 0.4.19+3: Höchste Anfangsrate einer neuen Quelle des Verwalters (bbl je Runde). */
  rateCap: number;
}

function eintrag(l: Lauf, kind: ChronicleKind, extra: Omit<ChronicleEntry, 'year' | 'kind'> = {}): void {
  l.entries.push({ year: gameYear(l.s.round), kind, ...extra });
}

/** Förderung je Runde: letzte Rate aller fördernden Quellen (bbl). */
export function roundFlow(state: Pick<GameState, 'wells'>): number {
  return state.wells.reduce((sum, w) => sum + (w.status === 'found' ? (w.production?.lastRate ?? 0) : 0), 0);
}

function snapshot(state: GameState, balance: Balance): TimeskipSnapshot {
  return {
    cash: Math.round(state.cash),
    debt: Math.round(debt(state)),
    wells: producingWells(state).length,
    flow: Math.round(roundFlow(state)),
    value: Math.round(empireValue(state, balance)),
    ruth: Math.round(state.family.ruth),
    children: (state.family.thomasBorn > 0 ? 1 : 0) + ((state.family.claraBorn ?? 0) > 0 ? 1 : 0),
  };
}

/**
 * Ausgangslage des neuen Kapitels (0.4.19+2): „schwach“, wenn die Firma nach dem Sprung zu wenige
 * fördernde Quellen hat oder ihr Imperiumswert unter der Schwelle des Kapitels liegt
 * (balance.yaml timeskip.weakStart) – dann passt „eine ernstzunehmende Firma“ nicht.
 */
export function weakStart(record: Pick<TimeskipRecord, 'number' | 'after'>, balance: Balance): boolean {
  const w = balance.timeskip.weakStart;
  const schwelle = record.number >= 2 ? w.value3 : w.value2;
  return record.after.wells < w.wells || record.after.value < schwelle;
}

function klemmen(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Aufräumen vor dem Sprung: Laufende Bohrungen bringt der Verwalter zu Ende (Ergebnis
 * = Geologie), Optionen verfallen, gemietete Türme gehen zurück, offene Briefe sind erledigt.
 */
function vorbereiten(state: GameState, balance: Balance): GameState {
  // Spielspaß K1: Ein tiefer Fund vergrößert Vorrat von Ranch und Feld (deepFindReserves).
  let lager: Pick<GameState, 'parcels' | 'fields'> = { parcels: state.parcels, fields: state.fields };
  const wells = state.wells.map((w): Well => {
    if (w.status !== 'drilling' && w.status !== 'decision' && w.status !== 'stuck') return w;
    if (w.oilStage === null) return { ...w, status: 'dry', roundsLeft: 0 };
    const parcel = state.parcels.find((p) => p.id === w.parcelId);
    const result = parcel?.geology === 'gusher' ? 'gusher' : 'small';
    lager = deepFindReserves({ ...lager, wells: state.wells }, balance, w.parcelId, w.oilStage);
    return {
      ...w,
      status: 'found',
      stage: w.oilStage,
      roundsLeft: 0,
      result,
      production: { initialRate: initialRate(balance, lager, { parcelId: w.parcelId, result }), roundsProduced: 0, lastRate: 0, total: 0 },
    };
  });
  // Bullards laufende Bohrungen: Ergebnis = Geologie.
  const rivalWells = state.rival.wells.map((w): RivalWell => {
    if (w.status !== 'drilling') return w;
    const parcel = state.parcels.find((p) => p.id === w.parcelId);
    return parcel && parcel.geology !== 'dry'
      ? { ...w, roundsLeft: 0, status: 'found', rate: balance.rivals.bullard.ratePerWell, royalty: w.royalty ?? balance.lease.royaltyMin }
      : { ...w, roundsLeft: 0, status: 'dry' };
  });
  return {
    ...state,
    ...lager,
    finished: false,
    ending: null,
    sick: 0,
    wells,
    rival: { ...state.rival, wells: rivalWells },
    options: [],
    rigs: state.rigs.filter((r) => r.kind !== 'rented'),
    bankruptcyDeadline: 0,
    events: { ...state.events, pending: [], due: {}, docs: {}, timed: [] },
  };
}

/**
 * Zeitsprung II: Die Firma aus Kapitel 2 geht an den Verwalter. Baustellen (Raffinerie,
 * Fernleitungen) bringt er zu Ende, Anleihen löst er durch einen Bankkredit ab, offene
 * Forderungen im Rat und Angebote der Rivalen sind in sechs Jahren erledigt.
 */
function firmaUebergeben(l: Lauf): void {
  const { balance } = l;
  let fertig = 0;
  const r = l.s.refinery;
  if (r && r.project) {
    fertig += 1;
    l.s = { ...l.s, refinery: { ...r, level: r.project === 'build' ? Math.max(1, r.level) : r.level + 1, project: null, projectLeft: 0, repairLeft: 0 } };
  } else if (r && r.repairLeft > 0) l.s = { ...l.s, refinery: { ...r, repairLeft: 0 } };
  const bp = l.s.bigPipelines;
  if (bp) {
    const offen = bp.projects.filter((p) => p.status === 'building' || p.status === 'damaged').length;
    fertig += offen;
    if (offen > 0) l.s = { ...l.s, bigPipelines: { ...bp, projects: bp.projects.map((p) => (p.status === 'building' || p.status === 'damaged' ? { ...p, status: 'ready' as const, roundsLeft: 0 } : p)) } };
  }
  if (fertig > 0) eintrag(l, 'projects_finished', { n: fertig });
  const st = l.s.stocks;
  if (st) {
    const anleihen = Math.round(st.bonds.reduce((sum, b) => sum + b.principal, 0));
    if (anleihen > 0) {
      const zins = loanRate(balance, l.s.rating, false, worldRateAdd(l.s.worldModel, balance.worldModel));
      const id = l.s.loans.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      l.s = { ...l.s, loans: [...l.s.loans, { id, source: 'bank', principal: anleihen, rate: zins, takenRound: l.s.round, collateral: null }] };
      eintrag(l, 'bonds_refinanced', { amount: anleihen });
    }
    l.s = { ...l.s, stocks: { ...l.s.stocks!, bonds: [], demand: null, proxy: null } };
  }
  if (l.s.diplomacy) l.s = { ...l.s, diplomacy: { ...l.s.diplomacy, offers: [] } };
}

/** Transportkosten je Barrel über den billigsten eigenen Weg (Pipeline, Fuhrwerke, sonst Bahn). */
function frachtJeBarrel(state: GameState, balance: Balance): number {
  const t = balance.transport;
  // Zeitsprung II: Eine eigene Fernleitung zum Hafen ist der billigste Weg.
  if (ownsHarborPipeline(state)) return Math.min(balance.timeskip.second.harborFreight, state.railTariff);
  if (state.logistics.pipeline === 'ready') return t.pipeline.costPerBarrel;
  if (state.logistics.teams > 0) return Math.min(t.teams.costPerBarrel, state.railTariff);
  return state.railTariff;
}

/** Weltmeldungen eines Quartals für die Chronik. */
function weltMeldungen(l: Lauf, news: readonly WorldNews[]): void {
  const w = l.s.worldModel;
  for (const n of news) {
    switch (n) {
      case 'crash':
      case 'panic':
      case 'recovery':
      case 'war':
      case 'peace':
      case 'glut':
      case 'nationalization':
      case 'uprising':
      case 'embargo':
        eintrag(l, `world_${n}`);
        break;
      case 'election':
        eintrag(l, 'world_election', { party: w.government });
        break;
      case 'reelection':
        eintrag(l, 'world_reelection', { party: w.government });
        break;
      default:
        break;
    }
  }
  for (const item of w.laws?.news ?? []) {
    if (item.kind === 'passed') eintrag(l, 'law_passed', { law: item.law });
    if (item.kind === 'failed') eintrag(l, 'law_failed', { law: item.law });
  }
}

/** Notverkauf: die schwächsten Quellen zuerst an den Trust, bis die Kasse ziel erreicht. */
function notverkauf(l: Lauf, ziel: number): void {
  const { balance } = l;
  let verkauft = 0;
  let erloes = 0;
  const quellen = producingWells(l.s).sort((a, b) => (a.production?.lastRate ?? 0) - (b.production?.lastRate ?? 0) || (a.id < b.id ? -1 : 1));
  for (const q of quellen) {
    if (l.s.cash >= ziel) break;
    const wert = Math.round((q.production?.lastRate ?? 0) * 8 * l.s.postedPrice * balance.timeskip.crisis.fireSale);
    erloes += wert;
    verkauft += 1;
    l.s = { ...l.s, cash: l.s.cash + wert, wells: l.s.wells.filter((w) => w.id !== q.id) };
    if (wellsOn(l.s, q.parcelId).length === 0) {
      l.s = {
        ...l.s,
        leases: l.s.leases.filter((x) => !(x.parcelId === q.parcelId && x.holder === 'jacob')),
        loans: l.s.loans.map((x) => (x.collateral === q.parcelId ? { ...x, collateral: null } : x)),
      };
    }
  }
  if (verkauft > 0) eintrag(l, 'fire_sale', { n: verkauft, amount: erloes });
}

/**
 * Anteil der Schulden, den die Bank in einer Kreditkrise kündigt: Grundanteil plus Auslastung
 * des Bankrahmens (Schulden ÷ Rahmen) × callLeverage, nach „weiter auf Pump“ plus rideCall –
 * höchstens alles.
 */
export function crisisCallShare(balance: Balance, schulden: number, rahmen: number, ride: boolean): number {
  const c = balance.timeskip.crisis;
  const auslastung = rahmen > 0 ? schulden / rahmen : 1;
  return Math.min(1, c.callShare + c.callLeverage * auslastung + (ride ? c.rideCall : 0));
}

/**
 * Kreditkrise (GDD §15: wer im Boom zu viele Schulden macht, stirbt): Die Bank kündigt einen
 * Teil der Schulden – je höher der Bankrahmen ausgelastet ist, desto mehr, nach „weiter auf
 * Pump“ noch mehr. Gezahlt wird aus der Kasse über der Rücklage (die rührt der Verwalter nicht
 * an); was fehlt, bringen Quellen zum Notpreis. Im Jahr der Kündigung bohrt der Verwalter nicht.
 * Wer auf Pump weitergebohrt hat, bekommt danach keinen Kredit mehr und bohrt rideStopYears
 * Jahre länger nicht.
 */
function kreditkrise(l: Lauf): void {
  const { balance } = l;
  const c = balance.timeskip.crisis;
  const reserve = balance.timeskip.reserve[l.directives.stance];
  const schulden = debt(l.s);
  if (schulden <= 0) return;
  const faellig = Math.round(schulden * crisisCallShare(balance, schulden, creditLimit(l.s, balance), l.ride));
  eintrag(l, 'crisis_call', { amount: faellig });
  l.stopUntil = Math.max(l.stopUntil, gameYear(l.s.round) + (l.ride ? c.rideStopYears : 0));
  if (l.ride) l.noBorrow = true;
  notverkauf(l, faellig + reserve);
  const zahlbar = Math.min(faellig, Math.max(0, Math.floor(l.s.cash)), Math.floor(debt(l.s)));
  if (zahlbar > 0) {
    const r = repay(l.s, balance, zahlbar);
    if (r.ok) l.s = r.state;
  }
}

/** Ein Kredit für den Verwalter über die Bank (auf 100 $ aufgerundet, mindestens credit.minLoan); gibt den Betrag zurück. */
function leihen(l: Lauf, betrag: number): number {
  if (betrag <= 0) return 0;
  const frei = headroom(l.s, l.balance);
  const amount = Math.min(Math.max(l.balance.credit.minLoan, Math.ceil(betrag / 100) * 100), Math.floor(frei / 100) * 100);
  if (amount < l.balance.credit.minLoan) return 0;
  const r = takeLoan(l.s, l.balance, amount);
  if (!r.ok) return 0;
  l.s = r.state;
  return amount;
}

/** Was der Verwalter für eine Weiche noch aufbringen kann: Kasse und (ohne Tilgungs-Schwur) der freie Bankrahmen. */
function mittel(l: Lauf): SwitchFunds {
  return { cash: Math.round(l.s.cash), debt: Math.round(debt(l.s)), credit: l.noBorrow ? 0 : Math.floor(headroom(l.s, l.balance) / 100) * 100 };
}

/** Eine Weichen-Ausgabe bezahlen: aus der Kasse, was fehlt, auf Kredit. */
function bezahlen(l: Lauf, kosten: number): void {
  if (kosten <= 0) return;
  if (l.s.cash < kosten) leihen(l, kosten - Math.max(0, l.s.cash));
  l.s = { ...l.s, cash: l.s.cash - kosten };
}

/** Weichen am Quartalsanfang; gibt die offene Weiche zurück, wenn Jacob noch antworten muss. */
function weichen(l: Lauf, q: number): SwitchId | null {
  if (l.nr >= 2) return weichenII(l);
  const { balance } = l;
  const t = balance.timeskip;
  const year = gameYear(l.s.round);
  const quartal = (l.s.round - 1) % 4;
  const kandidaten: SwitchId[] = [];
  // Clara (Weltbibel, GDD §12: geboren im ersten Zeitsprung) – sicher. Gewürfelt wird nur der
  // Zeitpunkt (mehr Familienzeit = früher); im letzten Jahr kommt die Nachricht in jedem Fall.
  if (quartal === 0 && year >= t.family.claraFromYear && !l.switches.includes('clara') && (l.s.family.claraBorn ?? 0) === 0) {
    const wurf = l.rngClara.float();
    if (year >= l.letztesJahr || wurf < t.family.claraChance[l.directives.family]) kandidaten.push('clara');
  }
  // Okara: ein neues Ölgebiet – kommt mit einer Chance im Jahr okaraFromYear. Ob dort Öl ist,
  // steht im selben Augenblick fest (eigener Zufall, unabhängig von Jacobs Antwort).
  if (quartal === 0 && year === t.switches.okaraFromYear && !l.switches.includes('okara')) {
    const kommt = l.rngOkara.float() < t.switches.okaraChance;
    l.okaraOil = l.rngOkara.float() < t.switches.okaraSuccess;
    if (kommt) kandidaten.push('okara');
  }
  // Die ersten Automobile: immer, im Jahr automobileYear.
  if (quartal === 0 && year === t.switches.automobileYear && !l.switches.includes('automobile')) kandidaten.push('automobile');
  // Bankenpanik: nur, wenn das Kreditklima überhitzt (GDD §13).
  if (q > 1 && !l.switches.includes('bank_panic') && creditPhase(l.s.worldModel, balance.worldModel) === 'overheated') kandidaten.push('bank_panic');
  for (const id of kandidaten) {
    l.switches.push(id);
    const antwort = l.answers[id];
    if (antwort === undefined) return id;
    weicheAnwenden(l, id, antwort);
  }
  return null;
}

/** Weichen von Zeitsprung II (GDD §13): Kriegsgefahr, Marine, Grady, College. */
function weichenII(l: Lauf): SwitchId | null {
  const t2 = l.balance.timeskip.second;
  const year = gameYear(l.s.round);
  const quartal = (l.s.round - 1) % 4;
  const kandidaten: SwitchId[] = [];
  const neu = (id: SwitchId) => !l.switches.includes(id);
  // Kriegsgefahr in Übersee: nur, wenn die Welt sie hergibt (Außenspannung oder Krieg).
  const w = l.s.worldModel;
  // Export und Marine nur mit eigenem Öl (0.4.19+2): Ohne fördernde Quelle hat Harlan Oil nichts zu verkaufen.
  const oel = producingWells(l.s).length > 0;
  if (oel && neu('war_export') && year >= t2.warFromYear && (w.tension >= t2.warTension || w.war > 0)) kandidaten.push('war_export');
  // Die Marine stellt auf Öl um – im Jahr navyYear (wer dann fördert, bekommt das Angebot).
  if (oel && neu('navy') && quartal === 0 && year === t2.navyYear) kandidaten.push('navy');
  // Senator Grady: mit einer Chance, sicher, wenn er Jacob einen Gefallen schuldet.
  if (neu('grady') && quartal === 0 && year === t2.gradyYear) {
    const wurf = l.rngGrady.float();
    if (l.s.events.marks.k2_grady_spende !== undefined || wurf < t2.gradyChance) kandidaten.push('grady');
  }
  // Thomas geht aufs College (Story-Bibel: fast immer).
  if (neu('college') && quartal === 0 && year >= t2.collegeYear && l.s.family.thomasBorn > 0) kandidaten.push('college');
  for (const id of kandidaten) {
    l.switches.push(id);
    const antwort = l.answers[id];
    if (antwort === undefined) return id;
    weicheAnwenden(l, id, antwort);
  }
  return null;
}

function weicheAnwenden(l: Lauf, id: SwitchId, antwort: string): void {
  const t = l.balance.timeskip;
  const marks = { ...l.s.events.marks };
  const merken = (m: string) => {
    if (marks[m] === undefined) marks[m] = l.s.round;
  };
  switch (id) {
    case 'bank_panic':
      if (antwort === 'repay') {
        const ziel = Math.floor(Math.min(debt(l.s) * t.switches.panicRepay, Math.max(0, l.s.cash)));
        if (ziel > 0) {
          const r = repay(l.s, l.balance, ziel);
          if (r.ok) l.s = r.state;
        }
        l.noBorrow = true;
        merken(TIMESKIP_MARKS.panicRepaid);
        if (ziel > 0) eintrag(l, 'panic_repay', { amount: ziel });
        else eintrag(l, 'panic_nodebt');
      } else {
        l.ride = true;
        eintrag(l, 'panic_ride');
      }
      break;
    case 'automobile':
      if (antwort === 'invest') {
        bezahlen(l, t.switches.automobileCost);
        l.s = { ...l.s, ventures: { ...l.s.ventures, benzin: { since: l.s.round + 4 } } };
        merken(TIMESKIP_MARKS.benzin);
        eintrag(l, 'automobile_invest', { amount: t.switches.automobileCost });
      } else eintrag(l, 'automobile_ignore');
      break;
    case 'okara': {
      const jacob = antwort === 'lease';
      if (jacob) bezahlen(l, t.switches.okaraCost);
      // Die Pachten bleiben – mit Einnahmen ab dem Jahr danach, auch in Kapitel 2 (src/sim/ventures.ts).
      l.s = { ...l.s, ventures: { ...l.s.ventures, okara: { holder: jacob ? 'jacob' : 'bullard', oil: l.okaraOil, since: l.s.round + 4 } } };
      if (jacob) {
        merken(TIMESKIP_MARKS.okara);
        if (l.okaraOil) merken(TIMESKIP_MARKS.okaraOil);
        eintrag(l, l.okaraOil ? 'okara_found' : 'okara_dry');
      } else {
        merken(TIMESKIP_MARKS.okaraBullard);
        eintrag(l, 'okara_bullard');
      }
      break;
    }
    case 'clara': {
      const zuHause = antwort === 'home';
      const delta = zuHause ? t.family.claraBond : -t.family.claraBond;
      l.s = { ...l.s, family: { ...l.s.family, ruth: klemmen(l.s.family.ruth + delta) } };
      if (zuHause) l.pauseYear = gameYear(l.s.round);
      l.claraDue = l.s.round + 3;
      eintrag(l, zuHause ? 'clara_home' : 'clara_business');
      break;
    }
    case 'war_export':
      if (antwort === 'export') {
        l.warExport = true;
        merken(TIMESKIP_MARKS.warExport);
        eintrag(l, 'war_export');
      } else eintrag(l, 'war_hold');
      break;
    case 'navy':
      if (antwort === 'accept') {
        l.navySince = l.s.round + 1;
        merken(TIMESKIP_MARKS.navy);
        eintrag(l, 'navy_accept', { price: l.balance.timeskip.second.navyPremium });
      } else eintrag(l, 'navy_decline');
      break;
    case 'grady':
      if (antwort === 'take') {
        const t2 = l.balance.timeskip.second;
        bezahlen(l, t2.gradyCost);
        l.gradySince = l.s.round + 4;
        merken(TIMESKIP_MARKS.grady);
        // Skandal-Saat: eine Spur im Schattenbuch, die Daniel Moss oder Nora finden können.
        l.s = applySystemEffects(l.s, { trace: { severity: t2.gradyTrace, label: 'Reserveland' } }, l.balance, 'zeitsprung2', 'Reserveland');
        eintrag(l, 'grady_take', { amount: t2.gradyCost });
      } else {
        merken(TIMESKIP_MARKS.gradyRefused);
        eintrag(l, 'grady_refuse');
      }
      break;
    case 'college': {
      const t2 = l.balance.timeskip.second;
      const college = antwort === 'college';
      if (college) bezahlen(l, t2.collegeCost);
      const f = l.s.family;
      l.s = { ...l.s, family: { ...f, thomas: klemmen(f.thomas + (college ? t2.collegeBond : -t2.collegeBond)) } };
      l.s = applySystemEffects(l.s, { heirValues: { thomas: college ? { business: 1, moral: 1 } : { business: 2, loyalty: 1, moral: -1 } } }, l.balance);
      merken(college ? TIMESKIP_MARKS.college : TIMESKIP_MARKS.noCollege);
      eintrag(l, college ? 'college_go' : 'college_firm', college ? { amount: t2.collegeCost } : {});
      break;
    }
  }
  l.s = { ...l.s, events: { ...l.s.events, marks } };
}

/**
 * Am Jahresende darf die Kasse nicht im Minus bleiben: zuerst ein Notkredit, aber nur
 * bis zum Bankrahmen; reicht das nicht, verkauft der Verwalter Quellen zum Notpreis;
 * reicht auch das nicht, ist die Firma pleite (GDD §2: frühes Ende).
 */
function zahlungsfaehig(l: Lauf): void {
  const { balance } = l;
  if (l.s.cash >= 0) return;
  const frei = Math.floor(headroom(l.s, balance) / 100) * 100;
  const betrag = Math.min(Math.ceil(-l.s.cash / 100) * 100, frei);
  if (betrag > 0) {
    const zins = loanRate(balance, l.s.rating, false, worldRateAdd(l.s.worldModel, balance.worldModel));
    const id = l.s.loans.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    l.s = {
      ...l.s,
      cash: l.s.cash + betrag,
      loans: [...l.s.loans, { id, source: 'bank', principal: betrag, rate: zins, takenRound: l.s.round, collateral: null }],
    };
    eintrag(l, 'emergency_loan', { amount: betrag });
  }
  if (l.s.cash < 0) notverkauf(l, 0);
  if (l.s.cash < 0) {
    l.pleite = true;
    eintrag(l, 'bankrupt', { amount: Math.round(-l.s.cash) });
  }
}

/** Jahresende: tilgen, bohren, Bullard, Familie, Zahlungsfähigkeit. */
function jahresende(l: Lauf): void {
  const { balance } = l;
  const t = balance.timeskip;
  const { stance, family } = l.directives;
  const year = gameYear(l.s.round);

  // Preis des Jahres für die Chronik.
  if (l.preise.length > 0) eintrag(l, 'price', { price: Math.round((l.preise.reduce((a, b) => a + b, 0) / l.preise.length) * 100) / 100 });
  l.preise = [];

  // Tilgen nach Haltung.
  const ueberschuss = Math.max(0, l.s.cash - t.reserve[stance]);
  const tilgung = Math.floor(Math.min(debt(l.s), ueberschuss * t.repay[stance]));
  if (tilgung > 0) {
    const r = repay(l.s, balance, tilgung);
    if (r.ok) {
      l.s = r.state;
      eintrag(l, 'debt_repaid', { amount: tilgung });
    }
  }

  // Neue Bohrungen nach Haltung und Familienzeit (GDD §2) – nicht im Jahr der Geburt (zu Hause)
  // und nicht im Jahr einer Kreditkündigung.
  if (l.pauseYear !== year && year > l.stopUntil) bohren(l);

  // Bullard bohrt weiter (eigener Zufall).
  bullard(l);

  // Zeitsprung II: Wer trotz Kriegsgefahr exportiert, verliert manchmal einen Tanker – nur, solange er Öl verschifft.
  if (l.warExport && producingWells(l.s).length > 0) {
    const t2 = balance.timeskip.second;
    if (l.rngKrieg.float() < t2.warLossChance) {
      l.s = { ...l.s, cash: l.s.cash - t2.warLossCost };
      eintrag(l, 'war_tanker', { amount: t2.warLossCost });
    }
  }

  // Familie: Beziehung nach Familienzeit, Thomas wird älter.
  const bond = t.family.bond[family];
  const f = l.s.family;
  l.s = {
    ...l.s,
    family: {
      ...f,
      ruth: klemmen(f.ruth + bond),
      thomas: f.thomasBorn > 0 ? klemmen(f.thomas + bond) : f.thomas,
      ...((f.claraBorn ?? 0) > 0 ? { clara: klemmen((f.clara ?? 0) + bond) } : {}),
    },
  };
  if (l.s.family.thomasBorn > 0 && gameYear(l.s.family.thomasBorn) + 6 === year) eintrag(l, 'thomas_school');

  // Felder, die leer geworden sind.
  for (const field of l.s.fields) {
    if (l.leer.has(field.id) || fieldWells(l.s, field.id).length === 0) continue;
    if (fieldStatus(l.s, balance, field).remaining <= 0) {
      l.leer.add(field.id);
      eintrag(l, 'field_empty', { name: fieldLabel(field) });
    }
  }

  zahlungsfaehig(l);
}

/** Kosten einer Bohrung bis zur Stufe stage (alle Stufen bis dahin). */
function bohrkosten(balance: Balance, bisStufe: number): number {
  let summe = 0;
  for (let i = 1; i <= bisStufe; i++) summe += stageCost(balance, i);
  return summe;
}

/**
 * Wie der Verwalter die Fundchance einer Ranch einschätzt: nach dem Geologen, sonst nach der
 * Zone. In einem Bezirk, den er selbst erschlossen hat, gibt es noch keinen Geologen – dort
 * bohrt er nach der Zonenkarte (das macht die Expansion zum Wagnis).
 */
function geschaetzt(l: Lauf, parcelId: string): number {
  const p = l.s.parcels.find((x) => x.id === parcelId);
  const f = l.s.forecasts[parcelId];
  if (f && !(p && l.expanded.includes(p.region))) return Math.min(1, Math.max(0, f.center / 100));
  return p ? zoneChance(l.balance, p) : 0;
}

interface Ziel {
  parcelId: string;
  chance: number;
  /** Pacht muss erst gekauft werden. */
  pacht: boolean;
}

/**
 * Deckel des Verwalters: je Jahr höchstens so viele neue Quellen, wie vor dem Sprung förderten (mindestens
 * manager.minNewWells), und Anfangsraten höchstens im Schnitt von Jacobs Quellen (mindestens manager.minRate).
 * So hängt der Sprung an dem, was vorher gespielt wurde, nicht an einem Gusher. 0.4.20+2: Der Quellen-Deckel
 * gilt je Jahr statt für den ganzen Sprung – sonst förderte die Firma nach sechs Jahren nur noch die Hälfte
 * und das Geld lag ungenutzt in der Kasse.
 */
export function verwalterDeckel(start: Pick<GameState, 'wells'>, balance: Balance): { fundeJahr: number; rateCap: number } {
  const m = balance.timeskip.manager;
  const quellen = producingWells(start);
  const raten = quellen.map((w) => w.production?.initialRate ?? 0).filter((r) => r > 0);
  const schnitt = raten.length > 0 ? raten.reduce((a, b) => a + b, 0) / raten.length : 0;
  return { fundeJahr: Math.max(m.minNewWells, quellen.length), rateCap: Math.max(m.minRate, Math.round(schnitt)) };
}

/** Bohrziele des Verwalters: eigene ungebohrte Pachten, Nachbohrungen auf eigenen Funden, freie Ranches – ab der Mindestchance seiner Haltung. */
function bohrziele(l: Lauf): Ziel[] {
  const { balance } = l;
  const s = l.s;
  const genommen = new Set([...s.leases.map((x) => x.parcelId), ...s.wells.map((w) => w.parcelId), ...s.rival.wells.map((w) => w.parcelId)]);
  const ziele: Ziel[] = [];
  for (const lease of s.leases) {
    if (lease.holder !== 'jacob') continue;
    const auf = wellsOn(s, lease.parcelId);
    const parcel = s.parcels.find((p) => p.id === lease.parcelId);
    if (!parcel) continue;
    if (!lease.drilled && auf.length === 0) ziele.push({ parcelId: lease.parcelId, chance: geschaetzt(l, lease.parcelId), pacht: false });
    else if (auf.some((w) => w.status === 'found') && auf.length < parcel.slots) {
      // Nachbohren nur, solange das Feld nicht überfördert wird.
      const feld = fieldOf(s, lease.parcelId);
      const n = feld ? fieldWells(s, feld.id).length : auf.length;
      const rest = feld ? fieldStatus(s, balance, feld).remaining : 0;
      if (n < balance.production.freeWells && rest > 0) ziele.push({ parcelId: lease.parcelId, chance: 1, pacht: false });
    }
  }
  for (const p of s.parcels) {
    if (p.discovery || genommen.has(p.id) || !s.regions.includes(p.region)) continue;
    ziele.push({ parcelId: p.id, chance: geschaetzt(l, p.id), pacht: true });
  }
  return ziele
    .filter((z) => z.chance >= balance.timeskip.minChance[l.directives.stance])
    .sort((a, b) => b.chance - a.chance || (a.parcelId < b.parcelId ? -1 : a.parcelId > b.parcelId ? 1 : 0));
}

/**
 * Neue Bohrungen des Verwalters (GDD §2: die Haltung bestimmt Ertrag und Streuung). Budget:
 * Überschuss über der Rücklage × Anteil × Familienfaktor, dazu ein Kredit über einen Anteil
 * des freien Bankrahmens (nur, wenn es etwas zu bohren gibt). Höchstens
 * maxNewWells × Familienfaktor Bohrungen. Lohnt am offenen Land nichts mehr, erschließt
 * er (je nach Haltung) einen Nachbarbezirk.
 */
function bohren(l: Lauf): void {
  const { balance } = l;
  const t = balance.timeskip;
  const { stance, family } = l.directives;
  const eigen = Math.max(0, l.s.cash - t.reserve[stance]) * t.invest[stance] * t.family.growth[family];
  // Auf Pump (GDD §15): Ein Teil des freien Bankrahmens wird jedes Jahr geliehen, sobald es
  // etwas zu bohren gibt – was nicht verbohrt wird, bleibt als Polster in der Kasse. Das ist
  // das Risiko der mutigen Haltung: In einer Kreditkrise kündigt die Bank nach Auslastung.
  const kreditAnteil = l.noBorrow ? 0 : Math.min(1, t.borrow[stance] + (l.ride ? t.switches.rideBorrow : 0));
  const geliehen = kreditAnteil > 0 && bohrziele(l).length > 0 ? leihen(l, Math.floor((headroom(l.s, balance) * kreditAnteil) / 100) * 100) : 0;
  const budget = eigen + geliehen;
  const hoechstens = Math.max(1, Math.floor(t.maxNewWells[stance] * t.family.wells[family]));
  // Spielspaß K1: höchstens bis timeskip.deepestStage – liegt das Öl tiefer, gibt der Verwalter die Bohrung auf.
  const letzte = Math.min(t.deepestStage, balance.drilling.stages.length);
  const vollBohrung = bohrkosten(balance, letzte);
  let rest = budget;
  let ziele = bohrziele(l);
  // Nachbarbezirke: erst, wenn am offenen Land kaum noch etwas lohnt (weniger als die Hälfte dessen, was er bohren darf).
  while (ziele.length < hoechstens / 2 && l.expanded.length < t.expand[stance] && rest >= t.expandCost + vollBohrung) {
    // 0.4.20+41: nur Gebiete, die spätestens im nächsten Kapitel aufgehen (map.yaml chapter).
    const bezirk = balance.world.regions.find((r) => r.kind === 'drillable' && !l.s.regions.includes(r.id) && regionChapter(r) <= chapterOf(l.s) + 1);
    if (!bezirk) break;
    l.s = openRegions(unlockRegion(l.s, bezirk.id), balance);
    l.s = { ...l.s, cash: l.s.cash - t.expandCost };
    rest -= t.expandCost;
    l.expanded.push(bezirk.id);
    eintrag(l, 'region_opened', { name: bezirk.id, amount: t.expandCost });
    ziele = bohrziele(l);
  }
  let funde = 0;
  let trocken = 0;
  for (const ziel of ziele) {
    if (funde + trocken >= hoechstens || funde >= l.fundeJahr) break;
    const parcel = l.s.parcels.find((p) => p.id === ziel.parcelId)!;
    const terms = ziel.pacht ? leaseTerms(l.s, balance, ziel.parcelId) : null;
    const pacht = terms?.bonus ?? 0;
    // Planen mit der teuersten Bohrung (alle Stufen): sonst reicht das Geld am Ende nicht.
    if (rest < pacht + vollBohrung) continue;
    const auf = wellsOn(l.s, ziel.parcelId);
    const quelle = auf.find((w) => w.status === 'found');
    const gewuerfelt = quelle ? quelle.stage : rollOilStage(balance, parcel, l.rngBohren.float());
    const oilStage = gewuerfelt !== null && gewuerfelt > letzte && !quelle ? null : gewuerfelt;
    const kosten = pacht + bohrkosten(balance, oilStage ?? letzte);
    rest -= kosten;
    const leases: Lease[] = terms
      ? [
          ...l.s.leases,
          { parcelId: ziel.parcelId, holder: 'jacob', bonus: terms.bonus, royalty: terms.royalty, startRound: l.s.round, expiresAfterRound: l.s.round, drilled: true },
        ]
      : l.s.leases.map((x) => (x.parcelId === ziel.parcelId && x.holder === 'jacob' ? { ...x, drilled: true } : x));
    const result = parcel.geology === 'gusher' ? 'gusher' : 'small';
    // Spielspaß K1: Ein tiefer Fund vergrößert Vorrat von Ranch und Feld (deepFindReserves).
    if (oilStage !== null) l.s = { ...l.s, ...deepFindReserves(l.s, balance, ziel.parcelId, oilStage) };
    const well: Well = {
      id: nextWellId(l.s, ziel.parcelId),
      parcelId: ziel.parcelId,
      stage: oilStage ?? letzte,
      status: oilStage === null ? 'dry' : 'found',
      roundsLeft: 0,
      spent: kosten - pacht,
      oilStage,
      startRound: l.s.round,
      ...(oilStage === null
        ? {}
        : { result, production: { initialRate: Math.min(l.rateCap, initialRate(balance, l.s, { parcelId: ziel.parcelId, result })), roundsProduced: 0, lastRate: 0, total: 0 } }),
    };
    if (oilStage === null) trocken += 1;
    else funde += 1;
    l.s = { ...l.s, cash: l.s.cash - kosten, leases, wells: [...l.s.wells, well] };
  }
  if (funde > 0) eintrag(l, 'wells_found', { n: funde });
  if (trocken > 0) eintrag(l, 'wells_dry', { n: trocken });
}

/** Bullard während des Sprungs: bohrt je Jahr mit einer Chance eine neue Quelle (sein eigener Zufall). */
function bullard(l: Lauf): void {
  const { balance } = l;
  const t = balance.timeskip.rival;
  const rng = new Rng(l.s.rival.rng);
  const kandidaten = rivalCandidates(l.s, balance)
    .filter((p) => l.s.regions.includes(p.region))
    .sort((a, b) => rivalChance(l.s, balance, b) - rivalChance(l.s, balance, a) || (a.id < b.id ? -1 : 1));
  const wurf = rng.float();
  const wahl = rng.int(0, Math.max(0, Math.min(2, kandidaten.length - 1)));
  const parcel = kandidaten[wahl];
  let rival = { ...l.s.rival, rng: rng.state };
  let leases = l.s.leases;
  if (parcel && wurf < t.drillChance) {
    const terms = leaseTerms(l.s, balance, parcel.id);
    const kosten = terms.bonus + t.drillCost;
    if (rival.cash >= kosten) {
      const fund = rollOilStage(balance, parcel, rng.float()) !== null;
      const well: RivalWell = fund
        ? { parcelId: parcel.id, startRound: l.s.round, roundsLeft: 0, status: 'found', rate: balance.rivals.bullard.ratePerWell, royalty: terms.royalty }
        : { parcelId: parcel.id, startRound: l.s.round, roundsLeft: 0, status: 'dry' };
      rival = { ...rival, rng: rng.state, cash: rival.cash - kosten, wells: [...rival.wells, well] };
      leases = [...leases, { parcelId: parcel.id, holder: 'bullard', bonus: terms.bonus, royalty: terms.royalty, startRound: l.s.round, expiresAfterRound: l.s.round, drilled: true }];
      if (fund) eintrag(l, 'bullard_wells', { n: 1 });
    }
  }
  l.s = { ...l.s, rival, leases };
}

/** Ein Quartal des Sprungs. */
function quartal(l: Lauf): void {
  const { balance } = l;
  const t = balance.timeskip;
  // Clara kommt zur Welt (nach der Weiche, drei Quartale später).
  if (l.claraDue > 0 && l.s.round >= l.claraDue) {
    l.claraDue = 0;
    const clara = klemmen(t.family.claraStart + (l.answers.clara === 'home' ? t.family.claraBond : 0));
    const marks = l.s.events.marks[TIMESKIP_MARKS.clara] === undefined ? { ...l.s.events.marks, [TIMESKIP_MARKS.clara]: l.s.round } : l.s.events.marks;
    l.s = { ...l.s, family: { ...l.s.family, clara, claraBorn: l.s.round }, events: { ...l.s.events, marks } };
    eintrag(l, 'clara_born');
  }
  // Förderung wie im Spiel: Druck, Feld-Erschöpfung.
  l.s = advanceProduction(l.s, balance);
  // Posted Price aus dem Angebot am Salt Hill und dem Welttrend von heute.
  const rate = balance.rivals.bullard.ratePerWell;
  const angebot = jacobSupply(l.s) + l.nb * balance.market.neighbours.ratePerWell + rivalSupply(l.s, rate);
  const preis = computePrice(balance.market, angebot, worldPriceFactor(l.s.worldModel, balance.worldModel));
  l.preise.push(preis);
  // Die Welt rückt ein Quartal weiter; Salt Hill fließt (winzig) ein.
  const welt = advanceWorld(l.s.worldModel, balance.worldModel, saltHillInput(angebot, balance.market.demand, balance.worldModel), balance.laws);
  l.s = { ...l.s, worldModel: welt, postedPrice: preis, priceHistory: [...l.s.priceHistory, preis] };
  weltMeldungen(l, welt.news);
  // Verkauf: alles im Tank, über den billigsten eigenen Weg; das Förderzins-Öl geht an die Landbesitzer.
  // Die Benzinanlage zahlt ihren Aufschlag, Okara seine Einnahmen (src/sim/ventures.ts).
  // Zeitsprung II: Eine fertige Raffinerie verkauft Produkte statt Rohöl (je Stufe mehr je Barrel).
  const aufschlag = fuelPremium(l.s, balance) + (l.nr >= 2 && l.s.refinery ? l.s.refinery.level * t.second.refineryMargin : 0);
  const eigen = Math.max(0, l.s.oilStock - l.s.royaltyOil);
  // Familienzeit (GDD §2): Ohne Jacobs Aufsicht bringt das Öl weniger ein (family.revenue).
  const krieg = l.warExport ? 1 + t.second.warPremium : 1;
  // Zeitsprung II: Die Marine zahlt einen Festpreis über dem Markt – je verkauftem Barrel, nicht pauschal (0.4.19+2).
  const marine = l.navySince > 0 && l.s.round >= l.navySince ? t.second.navyPremium : 0;
  const erloes = Math.round(eigen * Math.max(0, preis + aufschlag + marine - frachtJeBarrel(l.s, balance)) * t.family.revenue[l.directives.family] * krieg);
  // Gradys Reserveland zahlt je Quartal (eine Beteiligung, kein eigenes Öl).
  const vertraege = l.gradySince > 0 && l.s.round >= l.gradySince ? t.second.gradyIncome : 0;
  const okara = okaraIncome(l.s, balance, 'jacob') + vertraege;
  const unterhalt = producingWells(l.s).length * t.upkeepPerWell + l.s.logistics.teams * balance.transport.teams.wagePerRound;
  const zinsen = quarterInterestTotal(l.s);
  l.s = { ...l.s, oilStock: 0, royaltyOil: 0, cash: Math.round((l.s.cash + erloes + okara - unterhalt - zinsen) * 100) / 100 };
  // Bullard verkauft, seine Quellen lassen nach; hat er Okara, zahlt es an ihn.
  const decline = balance.production.decline;
  const einnahmen = l.s.rival.wells.reduce((sum, w) => sum + rivalWellIncome(w, balance, preis), 0) + okaraIncome(l.s, balance, 'bullard');
  l.s = {
    ...l.s,
    rival: {
      ...l.s.rival,
      cash: Math.round((l.s.rival.cash + einnahmen) * 100) / 100,
      wells: l.s.rival.wells.map((w) => (w.status === 'found' ? { ...w, rate: (w.rate ?? rate) * (1 - decline) } : w)),
    },
  };
  // Nachbarn: Quellen versiegen, Wildcatter geben auf; bei gutem Preis kommen neue.
  const n = t.neighbours;
  l.nb = Math.max(0, l.nb * (1 - n.decline) + (n.entryRate * Math.max(0, preis - n.entryPrice)) / 0.3);
  // Kreditkrise in der Welt: Die Bank kündigt Kredite.
  if (welt.news.includes('crash') || welt.news.includes('panic')) kreditkrise(l);
}

/** Wildcatter am Ende des Sprungs: Ihre Quellen schrumpfen oder wachsen auf die neue Zahl; wer keine mehr hat, gibt auf. */
function wildcatterNachSprung(l: Lauf, ziel: number): void {
  const firms = l.s.wildcatters.firms.map((f) => ({ ...f }));
  if (firms.length === 0) return;
  const rng = new Rng(l.s.wildcatters.rng);
  let summe = firms.reduce((s, f) => s + f.wells, 0);
  while (summe > ziel) {
    const mit = firms.map((f, i) => (f.wells > 0 ? i : -1)).filter((i) => i >= 0);
    const idx = mit[rng.int(0, mit.length - 1)];
    firms[idx].wells -= 1;
    summe -= 1;
  }
  while (summe < ziel) {
    firms[rng.int(0, firms.length - 1)].wells += 1;
    summe += 1;
  }
  const bleiben = firms.filter((f) => f.wells > 0);
  for (const f of firms) if (f.wells === 0) eintrag(l, 'wildcatters_quit', { name: f.name });
  l.s = { ...l.s, wildcatters: { rng: rng.state, firms: bleiben.length > 0 ? bleiben : firms.slice(0, 1) } };
}

/**
 * Rechnet den Zeitsprung von vorn bis zur nächsten unbeantworteten Weiche oder bis
 * zum Ende. Am Ende beginnt Kapitel 2: Runde nach dem Sprung, frische Termine, die
 * Merkzeichen gelten als vor Kapitelbeginn gesetzt (marksIntoNextChapter), die
 * Kapitel-2-Systeme gehen auf (openChapterSystems: Raffinerie, Fernleitungen, Aktienbuch,
 * Personal, Diplomatie, Ermittler, Forschung), dann neue Ereignisse aus dem Katalog.
 * texts.stocksBoard (content/stocks.yaml) braucht das Aktienbuch für den Aufsichtsrat.
 * Geht die Firma unterwegs pleite, endet das Spiel dort (nach der Chronik).
 */
export function runTimeskip(start: GameState, balance: Balance, catalog: readonly EventDef[] = [], texts: ChapterSystemTexts = {}): TimeskipStep {
  if (!start.jump) throw new Error('runTimeskip: Es läuft kein Zeitsprung.');
  const t = balance.timeskip;
  const nr = jumpNumber(start);
  const vorher = snapshot(start, balance);
  const ersteRunde = start.round + 1;
  const strom = (zweck: string) => new Rng(seedFromString(`${start.seed}:zeitsprung${nr}:${zweck}`));
  const l: Lauf = {
    nr,
    s: vorbereiten(start, balance),
    rngBohren: strom('bohren'),
    rngClara: strom('clara'),
    rngOkara: strom('okara'),
    rngKrieg: strom('krieg'),
    rngGrady: strom('grady'),
    balance,
    directives: start.jump.directives,
    answers: start.jump.answers,
    switches: [],
    entries: [],
    letztesJahr: gameYear(start.round + t.rounds),
    nb: neighbourWells(balance.market, start.round, start.neighbourOffset ?? 0),
    okaraOil: false,
    noBorrow: false,
    ride: false,
    pauseYear: 0,
    stopUntil: 0,
    claraDue: 0,
    expanded: [],
    pleite: false,
    leer: new Set(start.fields.filter((f) => fieldWells(start, f.id).length > 0 && fieldStatus(start, balance, f).remaining <= 0).map((f) => f.id)),
    preise: [],
    warExport: false,
    navySince: 0,
    gradySince: 0,
    ...verwalterDeckel(start, balance),
  };
  if (nr >= 2) {
    l.s = { ...l.s, round: ersteRunde };
    firmaUebergeben(l);
  }
  for (let q = 1; q <= t.rounds; q++) {
    l.s = { ...l.s, round: start.round + q };
    const offen = weichen(l, q);
    if (offen) return { status: 'switch', id: offen, year: gameYear(l.s.round), entries: l.entries, funds: mittel(l) };
    quartal(l);
    if (q % 4 === 0) jahresende(l);
    if (l.pleite) break;
  }
  // Ruths Stimmung am Ende – ein Wort für die Chronik.
  eintrag(l, 'ruth_word', { word: bondWord(l.s.family.ruth, balance) });
  const record = (s: GameState): TimeskipRecord => ({
    number: nr,
    fromYear: gameYear(ersteRunde),
    toYear: gameYear(l.s.round),
    directives: { ...start.jump!.directives },
    answers: { ...start.jump!.answers },
    switches: [...l.switches],
    entries: l.entries,
    before: vorher,
    after: snapshot(s, balance),
    read: false,
  });

  // Pleite im Sprung (GDD §2: frühes Ende): Das Spiel endet in diesem Jahr; nach der Chronik kommt der Pleite-Bildschirm.
  if (l.pleite) {
    const date = formatDate(l.s);
    const pleite: GameState = {
      ...l.s,
      totalRounds: l.s.round,
      finished: true,
      ending: 'pleite',
      jump: null,
      log: [
        ...start.log,
        `${formatDate(start)}: Jacob übergibt das Tagesgeschäft für sechs Jahre an einen Verwalter.`,
        `${date}: Die Kasse ist leer, die Bank leiht nichts mehr, die Quellen sind verkauft. Jacob Harlan ist pleite – die Bank nimmt die Firma in Zwangsverwaltung.`,
      ],
      roundLogStart: start.log.length,
    };
    const r: TimeskipRecord = { ...record(pleite), bankrupt: true };
    return { status: 'done', state: { ...pleite, timeskips: [...(start.timeskips ?? []), r] }, record: r };
  }

  // Das nächste Kapitel beginnt: Kapitel 2 in Jahr 11 (Jacob 35), Kapitel 3 in Jahr 21 (Jacob 45).
  const kapitel = nr + 1;
  const round = start.round + t.rounds + 1;
  const ziel = Math.max(0, Math.round(l.nb));
  // Wer aufgibt, steht noch im letzten Jahr des Sprungs in der Chronik.
  wildcatterNachSprung(l, ziel);
  // 0.4.20+39: Eine vermessene kleine Pipeline ohne alle Wegerechte bliebe sonst für immer liegen (die Briefe
  // der Landbesitzer gibt es nur in Kapitel 1) – der Verwalter kauft die Rechte und baut sie, wenn das Geld reicht.
  const kleinePipeline = finishSmallPipeline(l.s, balance, t.pipelineRight, t.reserve[l.directives.stance], start.round + t.rounds);
  l.s = kleinePipeline.state;
  const r0 = record(l.s);
  l.s = { ...l.s, round };
  const s = l.s;
  const pipeline = s.logistics.pipeline === 'building' || s.logistics.pipeline === 'damaged' ? 'ready' : s.logistics.pipeline;
  const date = formatDate({ round, startYear: s.startYear });
  // Verfehlte Prüfung (GDD §2): Das nächste Kapitel beginnt geschwächt – weniger Kasse, weniger Kraft.
  const schwach = missedPenalty(start, s, balance);
  // 0.4.19+3: Die Chronik zeigt die Schwächung als eigene Zeile (vorher nur in der Kladde – 53.000 $ verschwanden ohne Grund).
  const r: TimeskipRecord = schwach.line
    ? { ...r0, penalty: { cash: Math.round(s.cash - schwach.cash), strength: schwach.strength, strengthMax: s.strengthMax } }
    : r0;
  const naechstes: GameState = {
    ...s,
    chapter: kapitel,
    chapterStart: round,
    totalRounds: round + t.nextChapterRounds - 1,
    // 0.4.20+42: Kontakte bleiben, Beziehungen verblassen ein Stück, offene Empfehlungen verfallen.
    network: jumpNetwork(s.network, balance, round),
    neighbourOffset: ziel - neighbourWells(balance.market, round),
    finished: false,
    ending: null,
    jump: null,
    timeskips: [...(start.timeskips ?? []), r],
    // Unbebohrte Pachten sind in sechs Jahren verfallen.
    leases: s.leases.filter((x) => x.drilled),
    logistics: { ...s.logistics, pipeline, pipelineRounds: pipeline === 'ready' ? 0 : s.logistics.pipelineRounds, traderSold: 0 },
    shipped: { wagon: 0, rail: 0, teams: 0, pipeline: 0 },
    cash: schwach.cash,
    strength: schwach.strength,
    agenda: newAgenda(schwach.strength, balance),
    family: { ...s.family, time: 0 },
    missedPayments: 0,
    // 0.4.19+2: Nach sechs Jahren sind alte schlechte Noten der Bank vergessen (ratingShift < 0 → 0); gute bleiben.
    ...(s.consequences && s.consequences.ratingShift < 0 ? { consequences: { ...s.consequences, ratingShift: 0 } } : {}),
    // Etappe 2: Pakte, Verträge und Verhandlungen aus Kapitel 1 sind nach sechs Jahren erledigt; der Ruf bleibt.
    pricing: newPricing(),
    freight: newFreight(),
    log: [
      ...start.log,
      `${formatDate(start)}: Jacob übergibt das Tagesgeschäft für sechs Jahre an einen Verwalter.`,
      `${date}: Kapitel ${kapitel} „${CHAPTER_TITLES[kapitel] ?? ''}“ beginnt – Jacob ist ${jacobAge({ round })}.`,
      ...(schwach.line ? [`${date}: ${schwach.line}`] : []),
      ...(kleinePipeline.cost > 0 ? [`${date}: Der Verwalter hat die fehlenden Wegerechte gekauft und die Pipeline gebaut (${Math.round(kleinePipeline.cost).toLocaleString('de-DE')} $).`] : []),
    ],
    roundLogStart: start.log.length,
    // Die Dividendenfrist im Rat zählt ab Kapitelbeginn.
    ...(s.stocks ? { stocks: { ...s.stocks, dividendRound: round - 1 } } : {}),
  };
  // Kapitelstart (Integration Phase 4): Merkzeichen ins neue Kapitel, dann alle Systeme des Kapitels anlegen;
  // in Kapitel 3 dazu die Ausgangslage der Rivalen (4.19, src/sim/rivalsK3.ts).
  const mitMarken0: GameState = { ...naechstes, events: marksIntoNextChapter(naechstes.events, round - 1) };
  // Erkundung über den Sprung (Termine als Hauptwerkzeug): Altes Wissen bleibt; was der Verwalter gebohrt hat,
  // steht gleich als Bohrbericht auf der Karte, und um bekannte Funde – auch im neuen Land – redet man.
  const mitMarken = hearsayAroundFinds(learnFromWells(mitMarken0, balance), balance);
  const offen = startRivalsK3(openChapterSystems(mitMarken, balance, texts), balance);
  // Das Rating gilt ab der ersten Runde des neuen Kapitels – nicht erst nach dem ersten Rundenende (0.4.19+2).
  return { status: 'done', state: drawEvents(refreshRating(offen, balance), balance, catalog), record: r };
}

/**
 * Schwächung nach einer verfehlten Kapitelprüfung (GDD §2, balance.yaml chapter.missed): Ein Teil der
 * Kasse ist weg, und Jacob beginnt mit weniger Kraft. Wer die Prüfung bestanden hat, startet wie immer.
 */
export function missedPenalty(ende: GameState, s: GameState, balance: Balance): { cash: number; strength: number; line: string | null } {
  const voll = { cash: s.cash, strength: s.strengthMax, line: null };
  if (ende.ending !== 'kapitel' || chapterPassed(ende, balance)) return voll;
  const { cashShare, strength } = balance.chapter.missed;
  const weg = s.cash > 0 ? Math.round(s.cash * cashShare * 100) / 100 : 0;
  const kraft = Math.max(0, s.strengthMax - strength);
  const betrag = `${Math.round(weg).toLocaleString('de-DE')} $`;
  return {
    cash: Math.round((s.cash - weg) * 100) / 100,
    strength: kraft,
    line: `Das verfehlte Kapitelziel hängt nach: Die Bank verlangt Sicherheiten (${betrag} aus der Kasse), und Jacob beginnt müde (Kraft ${kraft} statt ${s.strengthMax}).`,
  };
}

/** Bequem für die Oberfläche: Weiche beantworten und gleich weiterrechnen. Fertig → Kapitel 2 (oder Pleite). */
export function continueTimeskip(state: GameState, balance: Balance, catalog: readonly EventDef[] = [], texts: ChapterSystemTexts = {}): GameState {
  if (!state.jump) return state;
  const step = runTimeskip(state, balance, catalog, texts);
  return step.status === 'done' ? step.state : state;
}

// ---------------------------------------------------------------------------
// Inhalte: content/timeskip.yaml

type Texte<K extends string> = Record<K, LocalizedText>;

export interface TimeskipContent {
  draft: boolean;
  start: Texte<'title' | 'text' | 'button' | 'blockedIpo'>;
  /** Zeitsprung II (4.19): Angebot am Ende von Kapitel 2. */
  start2: Texte<'title' | 'text' | 'button'>;
  directives: {
    title: LocalizedText;
    text: LocalizedText;
    stance: { label: LocalizedText } & Record<Stance, { label: LocalizedText; text: LocalizedText }>;
    family: { label: LocalizedText } & Record<FamilyTime, { label: LocalizedText; text: LocalizedText }>;
    send: LocalizedText;
    back: LocalizedText;
  };
  switches: Texte<'telegram' | 'funds' | 'onCredit' | 'blocked'> & { [S in SwitchId]: { title: LocalizedText; text: LocalizedText; choices: Record<string, LocalizedText> } };
  chronicle: Texte<'title' | 'paper' | 'year' | 'quiet' | 'balance' | 'continue' | 'end' | 'penalty' | 'penaltyLabel'> & {
    entries: Record<ChronicleKind, LocalizedText>;
    /** Einzahl, wenn {n} = 1 ist (z. B. „eine neue Quelle“); fehlt sie, gilt der Text aus entries. */
    one: Partial<Record<ChronicleKind, LocalizedText>>;
  };
  /** Kapitel 2 (4.12): Stempel unter der Chronik, Überschrift und Ziel zum Kapitelstart. */
  chapter2: Texte<'badge' | 'title' | 'text' | 'textWeak'>;
  /** Kapitel 3 (4.19): Stempel unter der Chronik von Zeitsprung II, Überschrift und Ziel. */
  chapter3: Texte<'badge' | 'title' | 'text' | 'textWeak'>;
  /** Ein Kapitel nach dem Early-Access-Umfang (Kopfleiste, „im Bau“). */
  preview: Texte<'badge' | 'text'>;
  /** 0.4.20+2: Bericht des Verwalters unter der Chronik von Zeitsprung I (src/sim/managerReport.ts). */
  report: Texte<'title' | 'flowFell' | 'flowHeld' | 'ideas' | 'refinery' | 'harbor' | 'land' | 'tooExpensive' | 'flowLabel' | 'page' | 'next' | 'nextBalance' | 'back'>;
}

/** Setzt Platzhalter wie {betrag} in einen Text ein. */
export function fillTimeskipText(text: LocalizedText, values: Record<string, string>, lang?: Lang): string {
  return localize(text, lang).replace(/\{(\w+)\}/g, (ganz, key: string) => values[key] ?? ganz);
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/timeskip.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseTimeskipContent(file: string, text: string): { content: TimeskipContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht start, start2, directives, switches, chronicle, chapter2, chapter3, preview und report.');
    return { content: null, errors };
  }
  const leer: LocalizedText = { de: '', en: '' };
  const sprachtext = (value: unknown, wo: string): LocalizedText => {
    if (!istObjekt(value)) {
      fehler(`${wo}: fehlt oder braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return leer;
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: deutscher Text fehlt.`);
      return leer;
    }
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: value.de.trim(), en: typeof value.en === 'string' ? value.en.trim() : '' };
  };
  const block = (obj: Record<string, unknown>, key: string, wo: string): Record<string, unknown> => {
    const v = obj[key];
    if (!istObjekt(v)) {
      fehler(`${wo}: Block fehlt.`);
      return {};
    }
    return v;
  };
  const texte = <K extends string>(obj: Record<string, unknown>, keys: readonly K[], wo: string): Texte<K> =>
    Object.fromEntries(keys.map((k) => [k, sprachtext(obj[k], `${wo}.${k}`)])) as Texte<K>;
  const wahl = (obj: Record<string, unknown>, wo: string) => ({ label: sprachtext(obj.label, `${wo}.label`), text: sprachtext(obj.text, `${wo}.text`) });

  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');
  const start = texte(block(raw, 'start', 'start'), ['title', 'text', 'button', 'blockedIpo'] as const, 'start');
  const start2 = texte(block(raw, 'start2', 'start2'), ['title', 'text', 'button'] as const, 'start2');
  const d = block(raw, 'directives', 'directives');
  const ds = block(d, 'stance', 'directives.stance');
  const df = block(d, 'family', 'directives.family');
  const directives = {
    title: sprachtext(d.title, 'directives.title'),
    text: sprachtext(d.text, 'directives.text'),
    stance: {
      label: sprachtext(ds.label, 'directives.stance.label'),
      ...(Object.fromEntries(STANCES.map((s) => [s, wahl(block(ds, s, `directives.stance.${s}`), `directives.stance.${s}`)])) as Record<Stance, { label: LocalizedText; text: LocalizedText }>),
    },
    family: {
      label: sprachtext(df.label, 'directives.family.label'),
      ...(Object.fromEntries(FAMILY_TIMES.map((f) => [f, wahl(block(df, f, `directives.family.${f}`), `directives.family.${f}`)])) as Record<
        FamilyTime,
        { label: LocalizedText; text: LocalizedText }
      >),
    },
    send: sprachtext(d.send, 'directives.send'),
    back: sprachtext(d.back, 'directives.back'),
  };
  const sw = block(raw, 'switches', 'switches');
  const switches = texte(sw, ['telegram', 'funds', 'onCredit', 'blocked'] as const, 'switches') as TimeskipContent['switches'];
  for (const id of SWITCH_IDS) {
    const b = block(sw, id, `switches.${id}`);
    switches[id] = {
      title: sprachtext(b.title, `switches.${id}.title`),
      text: sprachtext(b.text, `switches.${id}.text`),
      choices: Object.fromEntries(SWITCH_CHOICES[id].map((c) => [c, sprachtext(b[c], `switches.${id}.${c}`)])),
    };
  }
  const c = block(raw, 'chronicle', 'chronicle');
  const e = block(c, 'entries', 'chronicle.entries');
  const unbekannt = Object.keys(e).filter((k) => !(CHRONICLE_KINDS as readonly string[]).includes(k));
  if (unbekannt.length > 0) fehler(`chronicle.entries: unbekannte Einträge ${unbekannt.join(', ')} – Tippfehler?`);
  const o = c.one === undefined ? {} : block(c, 'one', 'chronicle.one');
  const fremd = Object.keys(o).filter((k) => !(CHRONICLE_KINDS as readonly string[]).includes(k));
  if (fremd.length > 0) fehler(`chronicle.one: unbekannte Einträge ${fremd.join(', ')} – Tippfehler?`);
  const chronicle = {
    ...texte(c, ['title', 'paper', 'year', 'quiet', 'balance', 'continue', 'end', 'penalty', 'penaltyLabel'] as const, 'chronicle'),
    entries: texte(e, CHRONICLE_KINDS, 'chronicle.entries'),
    one: Object.fromEntries(Object.keys(o).filter((k) => !fremd.includes(k)).map((k) => [k, sprachtext(o[k], `chronicle.one.${k}`)])) as Partial<Record<ChronicleKind, LocalizedText>>,
  };
  const chapter2 = texte(block(raw, 'chapter2', 'chapter2'), ['badge', 'title', 'text', 'textWeak'] as const, 'chapter2');
  const chapter3 = texte(block(raw, 'chapter3', 'chapter3'), ['badge', 'title', 'text', 'textWeak'] as const, 'chapter3');
  const preview = texte(block(raw, 'preview', 'preview'), ['badge', 'text'] as const, 'preview');
  const report = texte(block(raw, 'report', 'report'), ['title', 'flowFell', 'flowHeld', 'ideas', 'refinery', 'harbor', 'land', 'tooExpensive', 'flowLabel', 'page', 'next', 'nextBalance', 'back'] as const, 'report');
  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, start, start2, directives, switches, chronicle, chapter2, chapter3, preview, report }, errors };
}
