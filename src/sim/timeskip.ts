// Zeitsprünge (4.5, GDD §2 und §13): Nach Kapitel 1 rechnet die Welt die Jahre bis
// Kapitel 2 weiter (Zeitsprung I, Jahr 5–10). Vor dem Sprung legt Jacob Direktiven
// fest (Haltung, Familie); unterwegs unterbrechen Weichen-Telegramme den Sprung,
// wenn die Welt sie hergibt (Bankenpanik bei überhitztem Kreditklima, erste
// Automobile, Öl in Okara, Claras Geburt). Danach zeigt die Chronik „Die Jahre
// dazwischen“, und Kapitel 2 beginnt – vorerst als Platzhalter mit den Systemen
// aus Kapitel 1.
//
// Vereinfachte Regeln je Quartal: Förderung (wie im Spiel, mit Druck und
// Erschöpfung der Felder), Posted Price aus Salt-Hill-Angebot und Weltpreis,
// Verkauf über den billigsten eigenen Weg, Unterhalt und Zinsen, das Weltmodell
// rückt ein Quartal weiter (Salt Hill fließt winzig ein). Je Jahr: tilgen, neue
// Bohrungen nach Haltung, Bullard bohrt, die Familie lebt weiter.
//
// Deterministisch: Der Zufall kommt aus seed + ':zeitsprung1' und den Zufallsströmen
// im Zustand. runTimeskip rechnet den Sprung bei jedem Aufruf von vorn – mit allen
// bisher beantworteten Weichen. Fehlt eine Antwort, hält er dort an. So steht im
// Spielstand nur, was Jacob entschieden hat (state.jump), nie ein halber Sprung.
// Texte: content/timeskip.yaml; Zahlen: balance.yaml → timeskip.

import { parseDocument } from 'yaml';
import { FAMILY_TIMES, STANCES, type Balance, type FamilyTime, type Stance } from './balance';
import { formatDate } from './calendar';
import { canGoPublic } from './chapter';
import { debt, headroom, loanRate, quarterInterestTotal, repay, takeLoan } from './credit';
import { rollOilStage, stageCost, wellsOn, type Well } from './drilling';
import { empireValue } from './empire';
import type { ContentError } from './eventContent';
import { drawEvents, type EventDef } from './events';
import { bondWord, type BondWord } from './family';
import { fieldOf, fieldLabel } from './field';
import { trueChance } from './forecast';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { leaseTerms, type Lease } from './lease';
import { computePrice, jacobSupply, neighbourWells, rivalSupply } from './market';
import { advanceProduction, fieldStatus, fieldWells, initialRate, producingWells } from './production';
import { rivalCandidates, rivalWellIncome, type RivalWell } from './rival';
import { Rng, seedFromString } from './rng';
import { newAgenda } from './agenda';
import { TIMESKIP_MARKS, TIMESKIP_SIM_MARKS } from './timeskipMarks';
import { advanceWorld, creditPhase, saltHillInput, worldPriceFactor, worldRateAdd, type Party, type WorldNews } from './world';

export { FAMILY_TIMES, STANCES, type FamilyTime, type Stance };

// ---------------------------------------------------------------------------
// Typen

/** Die Weichen von Zeitsprung I (GDD §13). */
export const SWITCH_IDS = ['bank_panic', 'automobile', 'okara', 'clara'] as const;
export type SwitchId = (typeof SWITCH_IDS)[number];

/** Die zwei Antworten je Weiche (Schlüssel in content/timeskip.yaml). */
export const SWITCH_CHOICES = {
  bank_panic: ['repay', 'ride'],
  automobile: ['invest', 'ignore'],
  okara: ['lease', 'pass'],
  clara: ['home', 'business'],
} as const satisfies Record<SwitchId, readonly [string, string]>;
export type SwitchChoice<S extends SwitchId = SwitchId> = (typeof SWITCH_CHOICES)[S][number];

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
  value: number;
  ruth: number;
  children: number;
}

/** Ein abgeschlossener Zeitsprung. */
export interface TimeskipRecord {
  /** 1 = Zeitsprung I. */
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
}

export type TimeskipStep =
  | { status: 'switch'; id: SwitchId; year: number; entries: ChronicleEntry[] }
  | { status: 'done'; state: GameState; record: TimeskipRecord };

export type TimeskipResult = { ok: true; state: GameState } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Kalender und Kapitel

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

/** Ist Kapitel 2 der Platzhalter („im Bau“)? Solange es Kapitel 2 nicht gibt: immer. */
export function chapterUnderConstruction(state: Pick<GameState, 'chapter'>): boolean {
  return (state.chapter ?? 1) >= 2;
}

// ---------------------------------------------------------------------------
// Start und Antworten

/** Warum der Sprung (noch) nicht geht; undefined = er geht. */
export function timeskipBlocked(state: GameState, balance: Balance): string | undefined {
  if ((state.chapter ?? 1) !== 1) return 'Kapitel 2 ist noch im Bau – weiter geht es noch nicht.';
  if (state.ending !== 'kapitel') return 'Der Zeitsprung kommt erst am Ende des Kapitels.';
  if (state.jump) return 'Der Zeitsprung läuft schon.';
  if (canGoPublic(state, balance) && state.ipo === null) return 'Erst über die Aktiengesellschaft entscheiden.';
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
export function answerSwitch(state: GameState, balance: Balance, id: SwitchId, choice: string, catalog: readonly EventDef[] = []): TimeskipResult {
  if (!state.jump) return { ok: false, reason: 'Es läuft kein Zeitsprung.' };
  if (!(SWITCH_CHOICES[id] as readonly string[]).includes(choice)) return { ok: false, reason: 'Diese Antwort gibt es nicht.' };
  const step = runTimeskip(state, balance, catalog);
  if (step.status !== 'switch' || step.id !== id) return { ok: false, reason: 'Diese Weiche steht gerade nicht an.' };
  return { ok: true, state: { ...state, jump: { ...state.jump, answers: { ...state.jump.answers, [id]: choice } } } };
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
  s: GameState;
  rng: Rng;
  balance: Balance;
  directives: Directives;
  answers: Partial<Record<SwitchId, string>>;
  switches: SwitchId[];
  entries: ChronicleEntry[];
  /** Nachbarquellen am Salt Hill (Bruchteile erlaubt). */
  nb: number;
  /** Benzin-Aufschlag je Barrel und ab welcher Runde. */
  premiumFrom: number;
  /** Okara-Einnahmen ab dieser Runde (0 = keine). */
  okaraFrom: number;
  /** Nach „tilgen“ in der Bankenpanik: kein neuer Kredit mehr. */
  noBorrow: boolean;
  /** Nach „weiter auf Pump“: mehr Kredit je Jahr. */
  ride: boolean;
  /** Clara-Weiche „zu Hause“: in diesem Jahr keine neuen Bohrungen. */
  pauseYear: number;
  /** Clara kommt in dieser Runde zur Welt (0 = nicht unterwegs). */
  claraDue: number;
  /** Felder, deren Erschöpfung schon gemeldet ist. */
  leer: Set<string>;
  /** Preise des laufenden Jahres. */
  preise: number[];
}

function eintrag(l: Lauf, kind: ChronicleKind, extra: Omit<ChronicleEntry, 'year' | 'kind'> = {}): void {
  l.entries.push({ year: gameYear(l.s.round), kind, ...extra });
}

function snapshot(state: GameState, balance: Balance): TimeskipSnapshot {
  return {
    cash: Math.round(state.cash),
    debt: Math.round(debt(state)),
    wells: producingWells(state).length,
    value: Math.round(empireValue(state, balance)),
    ruth: Math.round(state.family.ruth),
    children: (state.family.thomasBorn > 0 ? 1 : 0) + ((state.family.claraBorn ?? 0) > 0 ? 1 : 0),
  };
}

function klemmen(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Aufräumen vor dem Sprung: Laufende Bohrungen bringt der Verwalter zu Ende (Ergebnis
 * = Geologie), Optionen verfallen, gemietete Türme gehen zurück, offene Briefe sind erledigt.
 */
function vorbereiten(state: GameState, balance: Balance): GameState {
  const wells = state.wells.map((w): Well => {
    if (w.status !== 'drilling' && w.status !== 'decision' && w.status !== 'stuck') return w;
    if (w.oilStage === null) return { ...w, status: 'dry', roundsLeft: 0 };
    const parcel = state.parcels.find((p) => p.id === w.parcelId);
    const result = parcel?.geology === 'gusher' ? 'gusher' : 'small';
    return {
      ...w,
      status: 'found',
      stage: w.oilStage,
      roundsLeft: 0,
      result,
      production: { initialRate: initialRate(balance, state, { parcelId: w.parcelId, result }), roundsProduced: 0, lastRate: 0, total: 0 },
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

/** Transportkosten je Barrel über den billigsten eigenen Weg (Pipeline, Fuhrwerke, sonst Bahn). */
function frachtJeBarrel(state: GameState, balance: Balance): number {
  const t = balance.transport;
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

/** Kreditkrise: Die Bank kündigt einen Teil der Schulden; reicht das Geld nicht, gehen Quellen weg. */
function kreditkrise(l: Lauf): void {
  const { balance } = l;
  const schulden = debt(l.s);
  if (schulden <= 0) return;
  const faellig = Math.round(schulden * balance.timeskip.crisis.callShare);
  eintrag(l, 'crisis_call', { amount: faellig });
  const fehlt = faellig;
  // Notverkauf: die schwächsten Quellen zuerst, bis das Geld reicht.
  let verkauft = 0;
  let erloes = 0;
  const quellen = producingWells(l.s).sort((a, b) => (a.production?.lastRate ?? 0) - (b.production?.lastRate ?? 0) || (a.id < b.id ? -1 : 1));
  for (const q of quellen) {
    if (l.s.cash >= fehlt) break;
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
  const zahlbar = Math.min(fehlt, Math.max(0, Math.floor(l.s.cash)), Math.floor(debt(l.s)));
  if (zahlbar > 0) {
    const r = repay(l.s, balance, zahlbar);
    if (r.ok) l.s = r.state;
  }
}

/** Ein Kredit für den Verwalter (über die Bank wie im Spiel); gibt den geliehenen Betrag zurück. */
function leihen(l: Lauf, betrag: number): number {
  const amount = Math.floor(Math.min(betrag, headroom(l.s, l.balance)) / 100) * 100;
  if (amount < l.balance.credit.minLoan) return 0;
  const r = takeLoan(l.s, l.balance, amount);
  if (!r.ok) return 0;
  l.s = r.state;
  return amount;
}

/** Weichen am Quartalsanfang; gibt die offene Weiche zurück, wenn Jacob noch antworten muss. */
function weichen(l: Lauf, q: number): SwitchId | null {
  const { balance } = l;
  const t = balance.timeskip;
  const year = gameYear(l.s.round);
  const quartal = (l.s.round - 1) % 4;
  const kandidaten: SwitchId[] = [];
  // Clara (GDD §12: geboren im ersten Zeitsprung): Zufall je Jahr, mehr Familienzeit = wahrscheinlicher.
  if (quartal === 0 && year >= t.family.claraFromYear && !l.switches.includes('clara') && (l.s.family.claraBorn ?? 0) === 0) {
    // Ist Ruth verbittert oder entfremdet, halbiert sich die Chance.
    const chance = t.family.claraChance[l.directives.family] * (l.s.family.ruth >= balance.family.bitterFrom ? 1 : 0.5);
    if (l.rng.float() < chance) kandidaten.push('clara');
  }
  // Okara: ein neues Ölgebiet – kommt mit einer Chance im Jahr okaraFromYear.
  if (quartal === 0 && year === t.switches.okaraFromYear && !l.switches.includes('okara') && l.rng.float() < t.switches.okaraChance) kandidaten.push('okara');
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
        l.s = { ...l.s, cash: l.s.cash - t.switches.automobileCost };
        l.premiumFrom = l.s.round + 4;
        merken(TIMESKIP_MARKS.benzin);
        eintrag(l, 'automobile_invest', { amount: t.switches.automobileCost });
      } else eintrag(l, 'automobile_ignore');
      break;
    case 'okara':
      if (antwort === 'lease') {
        l.s = { ...l.s, cash: l.s.cash - t.switches.okaraCost };
        merken(TIMESKIP_MARKS.okara);
        if (l.rng.float() < t.switches.okaraSuccess) {
          l.okaraFrom = l.s.round + 4;
          merken(TIMESKIP_MARKS.okaraOil);
          eintrag(l, 'okara_found');
        } else eintrag(l, 'okara_dry');
      } else {
        merken(TIMESKIP_MARKS.okaraBullard);
        eintrag(l, 'okara_bullard');
      }
      break;
    case 'clara': {
      const zuHause = antwort === 'home';
      const delta = zuHause ? t.family.claraBond : -t.family.claraBond;
      l.s = { ...l.s, family: { ...l.s.family, ruth: klemmen(l.s.family.ruth + delta) } };
      if (zuHause) l.pauseYear = gameYear(l.s.round);
      l.claraDue = l.s.round + 3;
      eintrag(l, zuHause ? 'clara_home' : 'clara_business');
      break;
    }
  }
  l.s = { ...l.s, events: { ...l.s.events, marks } };
}

/** Jahresende: tilgen, bohren, Bullard, Familie, Notkredit. */
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

  // Neue Bohrungen nach Haltung und Familienzeit (GDD §2: Haltung bestimmt Ertrag und Streuung).
  if (l.pauseYear !== year) {
    let budget = Math.max(0, l.s.cash - t.reserve[stance]) * t.invest[stance] * t.family.growth[family];
    if (!l.noBorrow) {
      const anteil = Math.min(1, t.borrow[stance] + (l.ride ? t.switches.rideBorrow : 0));
      if (anteil > 0) budget += leihen(l, headroom(l.s, balance) * anteil);
    }
    bohren(l, budget);
  }

  // Bullard bohrt weiter (eigener Zufall).
  bullard(l);

  // Familie: Beziehung nach Familienzeit, Clara kommt zur Welt, Thomas wird älter.
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

  // Notkredit: Die Kasse darf am Jahresende nicht im Minus bleiben.
  if (l.s.cash < 0) {
    const betrag = Math.ceil(-l.s.cash / 100) * 100;
    const zins = loanRate(balance, l.s.rating, false, worldRateAdd(l.s.worldModel, balance.worldModel));
    const id = l.s.loans.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    l.s = {
      ...l.s,
      cash: l.s.cash + betrag,
      loans: [...l.s.loans, { id, source: 'bank', principal: betrag, rate: zins, takenRound: l.s.round, collateral: null }],
    };
    eintrag(l, 'emergency_loan', { amount: betrag });
  }
}

/** Kosten einer Bohrung bis zur Stufe stage (alle Stufen bis dahin). */
function bohrkosten(balance: Balance, bisStufe: number): number {
  let summe = 0;
  for (let i = 1; i <= bisStufe; i++) summe += stageCost(balance, i);
  return summe;
}

/** Wie der Verwalter die Fundchance einer Ranch einschätzt (Geologe, sonst die Zone). */
function geschaetzt(state: GameState, balance: Balance, parcelId: string): number {
  const f = state.forecasts[parcelId];
  if (f) return Math.min(1, Math.max(0, f.center / 100));
  const p = state.parcels.find((x) => x.id === parcelId);
  return p ? trueChance(balance, p) : 0;
}

interface Ziel {
  parcelId: string;
  chance: number;
  /** Pacht muss erst gekauft werden. */
  pacht: boolean;
}

/** Neue Bohrungen des Verwalters: eigene ungebohrte Pachten, Nachbohrungen auf eigenen Funden, freie Ranches. */
function bohren(l: Lauf, budget: number): void {
  const { balance } = l;
  const t = balance.timeskip;
  const s = l.s;
  const genommen = new Set([...s.leases.map((x) => x.parcelId), ...s.wells.map((w) => w.parcelId), ...s.rival.wells.map((w) => w.parcelId)]);
  const ziele: Ziel[] = [];
  for (const lease of s.leases) {
    if (lease.holder !== 'jacob') continue;
    const auf = wellsOn(s, lease.parcelId);
    const parcel = s.parcels.find((p) => p.id === lease.parcelId);
    if (!parcel) continue;
    if (!lease.drilled && auf.length === 0) ziele.push({ parcelId: lease.parcelId, chance: geschaetzt(s, balance, lease.parcelId), pacht: false });
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
    ziele.push({ parcelId: p.id, chance: geschaetzt(s, balance, p.id), pacht: true });
  }
  const auswahl = ziele
    .filter((z) => z.chance >= t.minChance[l.directives.stance])
    .sort((a, b) => b.chance - a.chance || (a.parcelId < b.parcelId ? -1 : a.parcelId > b.parcelId ? 1 : 0));
  const letzte = balance.drilling.stages.length;
  let funde = 0;
  let trocken = 0;
  let rest = budget;
  for (const ziel of auswahl) {
    if (funde + trocken >= t.maxNewWells) break;
    const parcel = l.s.parcels.find((p) => p.id === ziel.parcelId)!;
    const terms = ziel.pacht ? leaseTerms(l.s, balance, ziel.parcelId) : null;
    const pacht = terms?.bonus ?? 0;
    // Planen mit der teuersten Bohrung (alle Stufen): sonst reicht das Geld am Ende nicht.
    if (rest < pacht + bohrkosten(balance, letzte)) continue;
    const auf = wellsOn(l.s, ziel.parcelId);
    const quelle = auf.find((w) => w.status === 'found');
    const oilStage = quelle ? quelle.stage : rollOilStage(balance, parcel, l.rng.float());
    const kosten = pacht + bohrkosten(balance, oilStage ?? letzte);
    rest -= kosten;
    const leases: Lease[] = terms
      ? [
          ...l.s.leases,
          { parcelId: ziel.parcelId, holder: 'jacob', bonus: terms.bonus, royalty: terms.royalty, startRound: l.s.round, expiresAfterRound: l.s.round, drilled: true },
        ]
      : l.s.leases.map((x) => (x.parcelId === ziel.parcelId && x.holder === 'jacob' ? { ...x, drilled: true } : x));
    const result = parcel.geology === 'gusher' ? 'gusher' : 'small';
    const well: Well = {
      id: `${ziel.parcelId}#${auf.length + 1}`,
      parcelId: ziel.parcelId,
      stage: oilStage ?? letzte,
      status: oilStage === null ? 'dry' : 'found',
      roundsLeft: 0,
      spent: kosten - pacht,
      oilStage,
      startRound: l.s.round,
      ...(oilStage === null
        ? {}
        : { result, production: { initialRate: initialRate(balance, l.s, { parcelId: ziel.parcelId, result }), roundsProduced: 0, lastRate: 0, total: 0 } }),
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
    .sort((a, b) => trueChance(balance, b) - trueChance(balance, a) || (a.id < b.id ? -1 : 1));
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
  const aufschlag = l.premiumFrom > 0 && l.s.round >= l.premiumFrom ? t.switches.automobilePremium : 0;
  const eigen = Math.max(0, l.s.oilStock - l.s.royaltyOil);
  const erloes = Math.round(eigen * Math.max(0, preis + aufschlag - frachtJeBarrel(l.s, balance)));
  const okara = l.okaraFrom > 0 && l.s.round >= l.okaraFrom ? Math.round(t.switches.okaraIncome * worldPriceFactor(welt, balance.worldModel)) : 0;
  const unterhalt = producingWells(l.s).length * t.upkeepPerWell + l.s.logistics.teams * balance.transport.teams.wagePerRound;
  const zinsen = quarterInterestTotal(l.s);
  l.s = { ...l.s, oilStock: 0, royaltyOil: 0, cash: Math.round((l.s.cash + erloes + okara - unterhalt - zinsen) * 100) / 100 };
  // Bullard verkauft, seine Quellen lassen nach.
  const decline = balance.production.decline;
  const einnahmen = l.s.rival.wells.reduce((sum, w) => sum + rivalWellIncome(w, balance, preis), 0);
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
 * zum Ende. Am Ende beginnt Kapitel 2 (Platzhalter): Runde nach dem Sprung, frische
 * Termine, neue Ereignisse aus dem Katalog.
 */
export function runTimeskip(start: GameState, balance: Balance, catalog: readonly EventDef[] = []): TimeskipStep {
  if (!start.jump) throw new Error('runTimeskip: Es läuft kein Zeitsprung.');
  const t = balance.timeskip;
  const vorher = snapshot(start, balance);
  const ersteRunde = start.round + 1;
  const l: Lauf = {
    s: vorbereiten(start, balance),
    rng: new Rng(seedFromString(`${start.seed}:zeitsprung1`)),
    balance,
    directives: start.jump.directives,
    answers: start.jump.answers,
    switches: [],
    entries: [],
    nb: neighbourWells(balance.market, start.round, start.neighbourOffset ?? 0),
    premiumFrom: 0,
    okaraFrom: 0,
    noBorrow: false,
    ride: false,
    pauseYear: 0,
    claraDue: 0,
    leer: new Set(start.fields.filter((f) => fieldWells(start, f.id).length > 0 && fieldStatus(start, balance, f).remaining <= 0).map((f) => f.id)),
    preise: [],
  };
  for (let q = 1; q <= t.rounds; q++) {
    l.s = { ...l.s, round: start.round + q };
    const offen = weichen(l, q);
    if (offen) return { status: 'switch', id: offen, year: gameYear(l.s.round), entries: l.entries };
    quartal(l);
    if (q % 4 === 0) jahresende(l);
  }
  // Ruths Stimmung am Ende – ein Wort für die Chronik.
  eintrag(l, 'ruth_word', { word: bondWord(l.s.family.ruth, balance) });

  // Kapitel 2 beginnt (Platzhalter): Jahr 11, Jacob 35.
  const round = start.round + t.rounds + 1;
  const ziel = Math.max(0, Math.round(l.nb));
  // Wer aufgibt, steht noch im letzten Jahr des Sprungs in der Chronik.
  wildcatterNachSprung(l, ziel);
  l.s = { ...l.s, round };
  const s = l.s;
  const pipeline = s.logistics.pipeline === 'building' || s.logistics.pipeline === 'damaged' ? 'ready' : s.logistics.pipeline;
  const record: TimeskipRecord = {
    number: 1,
    fromYear: gameYear(ersteRunde),
    toYear: gameYear(start.round + t.rounds),
    directives: { ...start.jump.directives },
    answers: { ...start.jump.answers },
    switches: [...l.switches],
    entries: l.entries,
    before: vorher,
    after: snapshot(s, balance),
    read: false,
  };
  const date = formatDate({ round, startYear: s.startYear });
  const kapitel2: GameState = {
    ...s,
    chapter: 2,
    chapterStart: round,
    totalRounds: round + t.nextChapterRounds - 1,
    neighbourOffset: ziel - neighbourWells(balance.market, round),
    finished: false,
    ending: null,
    jump: null,
    timeskips: [...(start.timeskips ?? []), record],
    // Unbebohrte Pachten sind in sechs Jahren verfallen.
    leases: s.leases.filter((x) => x.drilled),
    logistics: { ...s.logistics, pipeline, pipelineRounds: pipeline === 'ready' ? 0 : s.logistics.pipelineRounds, traderSold: 0 },
    shipped: { wagon: 0, rail: 0, teams: 0, pipeline: 0 },
    strength: s.strengthMax,
    agenda: newAgenda(s.strengthMax, balance),
    family: { ...s.family, time: 0 },
    missedPayments: 0,
    log: [
      ...start.log,
      `${formatDate(start)}: Jacob übergibt das Tagesgeschäft für sechs Jahre an einen Verwalter.`,
      `${date}: Kapitel 2 beginnt – Jacob ist ${jacobAge({ round })}. (Kapitel 2 ist noch im Bau.)`,
    ],
    roundLogStart: start.log.length,
  };
  return { status: 'done', state: drawEvents(kapitel2, balance, catalog), record };
}

/** Bequem für die Oberfläche: Weiche beantworten und gleich weiterrechnen. Fertig → Kapitel 2. */
export function continueTimeskip(state: GameState, balance: Balance, catalog: readonly EventDef[] = []): GameState {
  if (!state.jump) return state;
  const step = runTimeskip(state, balance, catalog);
  return step.status === 'done' ? step.state : state;
}

// ---------------------------------------------------------------------------
// Inhalte: content/timeskip.yaml

type Texte<K extends string> = Record<K, LocalizedText>;

export interface TimeskipContent {
  draft: boolean;
  start: Texte<'title' | 'text' | 'button' | 'blockedIpo'>;
  directives: {
    title: LocalizedText;
    text: LocalizedText;
    stance: { label: LocalizedText } & Record<Stance, { label: LocalizedText; text: LocalizedText }>;
    family: { label: LocalizedText } & Record<FamilyTime, { label: LocalizedText; text: LocalizedText }>;
    send: LocalizedText;
    back: LocalizedText;
  };
  switches: { telegram: LocalizedText } & { [S in SwitchId]: { title: LocalizedText; text: LocalizedText; choices: Record<string, LocalizedText> } };
  chronicle: Texte<'title' | 'paper' | 'year' | 'quiet' | 'balance' | 'continue'> & {
    entries: Record<ChronicleKind, LocalizedText>;
    /** Einzahl, wenn {n} = 1 ist (z. B. „eine neue Quelle“); fehlt sie, gilt der Text aus entries. */
    one: Partial<Record<ChronicleKind, LocalizedText>>;
  };
  chapter2: Texte<'badge' | 'title' | 'text' | 'endTitle' | 'endText'>;
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
    fehler('Die Datei braucht start, directives, switches, chronicle und chapter2.');
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
  const switches = { telegram: sprachtext(sw.telegram, 'switches.telegram') } as TimeskipContent['switches'];
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
    ...texte(c, ['title', 'paper', 'year', 'quiet', 'balance', 'continue'] as const, 'chronicle'),
    entries: texte(e, CHRONICLE_KINDS, 'chronicle.entries'),
    one: Object.fromEntries(Object.keys(o).filter((k) => !fremd.includes(k)).map((k) => [k, sprachtext(o[k], `chronicle.one.${k}`)])) as Partial<Record<ChronicleKind, LocalizedText>>,
  };
  const chapter2 = texte(block(raw, 'chapter2', 'chapter2'), ['badge', 'title', 'text', 'endTitle', 'endText'] as const, 'chapter2');
  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, start, directives, switches, chronicle, chapter2 }, errors };
}
