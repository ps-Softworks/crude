// Cranes Feldzug (0.4.20+8, GDD §13 Kapitel 3: „Margaret Crane führt den Kampf um die Marke“,
// Weltlage „Preiskampf an der Zapfsäule“). Die echte Bedrohung in Kapitel 3 – auch für den, der
// ohne Schulden spielt: Sie trifft das Tankstellennetz mit seinen festen Kosten.
//
//   ruhe ...... Wächst Harlans Netz über trigger.stations Tankstellen (frühestens in Runde
//               trigger.notBefore des Kapitels), kündigt Margaret mit trigger.chance je Runde
//               den Feldzug an (Merkzeichen k3_feldzug_drohung → ihr Besuch).
//   drohung ... Eine Runde Zeit: dagegenhalten oder gleich über Preise reden.
//   krieg ..... In jeder Region mit Harlan-Tankstellen verkauft Crane billig, Jacobs Marge an der
//               Zapfsäule schrumpft auf war.margin (dumping, liest brand.ts), und Thornes Leute im
//               Kreditausschuss halbieren den Bankrahmen (bank.limitFactor, liest credit.ts).
//               Cranes Kriegskasse reicht für chestMin–chestMax Runden (gewürfelt, Jacob sieht nur
//               ein Wort). Ist sie leer, gibt Margaret auf: Sie schließt einen Teil ihrer Tankstellen
//               in Harlans Regionen, Harlans Ruf steigt. Hat Harlan keine Tankstelle mehr, ist der
//               Krieg ebenfalls vorbei – verloren.
//   vorbei .... Einmal je Kapitel.
//
// Zwei bequeme Auswege mit Haken:
//   Absprache . Gleiche Preise und Gebiete mit Crane: Der Krieg endet sofort, Harlan behält nur seine
//               pact.keepRegions stärksten Regionen (die übrigen Tankstellen kauft Crane zum Restwert), baut
//               bis Kapitelende keine Tankstellen mehr, und es entsteht eine Spur im Schattenbuch (Delaney).
//   Thornes Kredit  Sinkt die Kasse im Krieg unter thorne.offerBelow, bietet Pettibone von der
//               Treuhandbank Geld an, besichert mit der Mehrheit an Harlan Oil. Ist es zur Frist nicht
//               samt Zins in der Kasse, zieht Thorne das Pfand: Ende „Geschluckt“ – auch für die
//               Familienfirma.
//
// Reine Funktionen, eigener Zufall (Seed + ":feldzug"). Vor Kapitel 3 und ohne gegründete Marke
// gibt es state.feldzug nicht – dann kommt derselbe Zustand zurück. Zahlen: balance.yaml → feldzug.

import { BalanceError, type Balance } from './balance';
import { stationCost, type BrandState } from './brand';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { empireValue } from './empire';
import type { GameState } from './game';
import { Rng, seedFromString, type RngState } from './rng';

export const FELDZUG_PHASES = ['ruhe', 'drohung', 'krieg', 'vorbei'] as const;
export type FeldzugPhase = (typeof FELDZUG_PHASES)[number];
export const FELDZUG_OUTCOMES = ['durchgehalten', 'absprache', 'aufgegeben', 'kapitelende'] as const;
export type FeldzugOutcome = (typeof FELDZUG_OUTCOMES)[number];

/** Merkzeichen für die Ereignisse (content/events/k3-feldzug.yaml). */
export const FELDZUG_MARKS = {
  threat: 'k3_feldzug_drohung',
  war: 'k3_feldzug_krieg',
  thorne: 'k3_feldzug_thorne',
  held: 'k3_feldzug_durchgehalten',
  pact: 'k3_feldzug_absprache',
  lost: 'k3_feldzug_aufgegeben',
} as const;
export const FELDZUG_SIM_MARKS: readonly string[] = Object.values(FELDZUG_MARKS);

export interface FeldzugLoan {
  /** Ausgezahlt. */
  amount: number;
  /** Zur Frist samt Zins fällig. */
  owed: number;
  /** Fällig am Ende dieser Runde. */
  due: number;
}

export interface FeldzugState {
  rng: RngState;
  phase: FeldzugPhase;
  /** Runde, in der die Phase begann. */
  since: number;
  /** So viele Runden hält Crane den Krieg noch durch. */
  chest: number;
  /** So viele waren es zu Beginn (für das Wort „voll/halb/knapp“). */
  chestStart: number;
  /** Faktor auf Jacobs Marge an der Zapfsäule (1 = kein Krieg). */
  dumping: number;
  outcome: FeldzugOutcome | null;
  /** Preisabsprache: keine neuen Tankstellen bis Kapitelende. */
  pact: boolean;
  /** Pettibone hat Thornes Geld angeboten. */
  loanOffered: boolean;
  loan: FeldzugLoan | null;
  /** Thorne hat das Pfand gezogen – Ende „Geschluckt“. */
  swallowed: boolean;
}

export interface FeldzugBalance {
  fromChapter: number;
  trigger: { stations: number; notBefore: number; chance: number };
  war: { margin: number; chestMin: number; chestMax: number; craneAwareness: number };
  bank: { limitFactor: number };
  held: { craneClose: number; reputation: number };
  pact: { trace: number; keepRegions: number };
  thorne: { offerBelow: number; share: number; min: number; interest: number; rounds: number };
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(raw: unknown, path: string, min = 0, max = Infinity): number {
  const v = wert(raw, `feldzug.${path}`);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "feldzug.${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "feldzug.${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

function ganz(raw: unknown, path: string, min: number): number {
  const v = zahl(raw, path, min);
  if (!Number.isInteger(v)) throw new BalanceError(`balance.yaml: "feldzug.${path}" muss eine ganze Zahl ab ${min} sein`);
  return v;
}

/** Liest den Block feldzug aus balance.yaml. */
export function parseFeldzugBalance(raw: unknown): FeldzugBalance {
  if (!wert(raw, 'feldzug')) throw new BalanceError('balance.yaml: Block "feldzug" fehlt');
  const b: FeldzugBalance = {
    fromChapter: ganz(raw, 'fromChapter', 1),
    trigger: { stations: ganz(raw, 'trigger.stations', 1), notBefore: ganz(raw, 'trigger.notBefore', 1), chance: zahl(raw, 'trigger.chance', 0, 1) },
    war: { margin: zahl(raw, 'war.margin', 0, 1), chestMin: ganz(raw, 'war.chestMin', 1), chestMax: ganz(raw, 'war.chestMax', 1), craneAwareness: zahl(raw, 'war.craneAwareness', 0, 100) },
    bank: { limitFactor: zahl(raw, 'bank.limitFactor', 0, 1) },
    held: { craneClose: zahl(raw, 'held.craneClose', 0, 1), reputation: zahl(raw, 'held.reputation', 0, 100) },
    pact: { trace: ganz(raw, 'pact.trace', 1), keepRegions: ganz(raw, 'pact.keepRegions', 0) },
    thorne: { offerBelow: zahl(raw, 'thorne.offerBelow'), share: zahl(raw, 'thorne.share', 0, 1), min: zahl(raw, 'thorne.min'), interest: zahl(raw, 'thorne.interest', 0, 5), rounds: ganz(raw, 'thorne.rounds', 1) },
  };
  if (b.war.chestMax < b.war.chestMin) throw new BalanceError('balance.yaml: "feldzug.war.chestMax" muss mindestens chestMin sein');
  if (b.pact.trace > 5) throw new BalanceError('balance.yaml: "feldzug.pact.trace" ist eine Spur-Schwere 1–5');
  return b;
}

// ---------------------------------------------------------------------------
// Hilfen

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function mitLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

function mitMarke(state: GameState, mark: string): GameState {
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

function geld(n: number): string {
  return `${Math.round(n).toLocaleString('de-DE')} $`;
}

/** Fertige Tankstellen und Tankstellen im Bau, über alle Regionen. */
export function harlanStations(brand: BrandState | undefined): number {
  if (!brand?.founded) return 0;
  return Object.values(brand.regions).reduce((s, r) => s + r.stations + r.building.reduce((x, b) => x + b.count, 0), 0);
}

export function newFeldzug(seed: string): FeldzugState {
  return { rng: seedFromString(`${seed}:feldzug`), phase: 'ruhe', since: 0, chest: 0, chestStart: 0, dumping: 1, outcome: null, pact: false, loanOffered: false, loan: null, swallowed: false };
}

/** Faktor auf Jacobs Marge an der Zapfsäule (brand.ts). 1 ohne Krieg. */
export function feldzugDumping(state: object): number {
  const f = (state as { feldzug?: FeldzugState }).feldzug;
  return f && f.phase === 'krieg' ? f.dumping : 1;
}

/** Faktor auf den Bankrahmen (credit.ts): Im Krieg sitzt Thorne im Kreditausschuss. */
export function feldzugLimitFactor(state: object, balance: Pick<Balance, 'feldzug'>): number {
  const f = (state as { feldzug?: FeldzugState }).feldzug;
  return f && f.phase === 'krieg' ? balance.feldzug.bank.limitFactor : 1;
}

/** Hat Harlan sich mit Crane abgesprochen (keine neuen Tankstellen bis Kapitelende)? */
export function feldzugPact(state: object): boolean {
  return (state as { feldzug?: FeldzugState }).feldzug?.pact === true;
}

export type ChestWord = 'voll' | 'halb' | 'knapp';

/** Wie lange Crane noch durchhält – nie als Zahl, nur als Wort. */
export function chestWord(f: Pick<FeldzugState, 'chest' | 'chestStart'>): ChestWord {
  const anteil = f.chestStart > 0 ? f.chest / f.chestStart : 0;
  if (anteil > 0.6) return 'voll';
  if (anteil > 0.3) return 'halb';
  return 'knapp';
}

/** Was Thornes Treuhandbank leiht: share des Imperiumswerts, mindestens min, auf 1.000 $ gerundet. */
export function thorneOffer(state: GameState, balance: Balance): { amount: number; owed: number } {
  const t = balance.feldzug.thorne;
  const amount = Math.max(t.min, Math.round((Math.max(0, empireValue(state, balance)) * t.share) / 1000) * 1000);
  return { amount, owed: cents(amount * (1 + t.interest)) };
}

/** Crane setzt in jeder Region mit Harlan-Tankstellen billig (krieg) bzw. wieder normal (Ende). */
function cranePreise(brand: BrandState, krieg: boolean, balance: Balance, extraAwareness = 0): BrandState {
  const regions = Object.fromEntries(
    Object.entries(brand.regions).map(([id, r]) => {
      const harlan = r.stations + r.building.reduce((x, b) => x + b.count, 0) > 0;
      if (krieg && harlan) {
        return [id, { ...r, crane: { ...r.crane, price: 'billig' as const, warRounds: Math.max(r.crane.warRounds, 2), awareness: Math.min(100, r.crane.awareness + extraAwareness) } }];
      }
      if (!krieg && r.crane.price === 'billig') {
        return [id, { ...r, crane: { ...r.crane, price: 'normal' as const, warRounds: 0, cooldown: balance.brand.crane.cooldown } }];
      }
      return [id, r];
    }),
  );
  return { ...brand, regions };
}

function beenden(state: GameState, balance: Balance, f: FeldzugState, outcome: FeldzugOutcome): GameState {
  let out: GameState = { ...state, feldzug: { ...f, phase: 'vorbei', since: state.round, outcome, dumping: 1, chest: 0 } };
  if (out.brand) out = { ...out, brand: cranePreise(out.brand, false, balance) };
  return out;
}

// ---------------------------------------------------------------------------
// Aktionen

export type FeldzugRefusal = 'keinFeldzug' | 'vorbei' | 'keinAngebot' | 'schonGeliehen' | 'keinKredit' | 'geld';
export type FeldzugResult = { ok: true; state: GameState } | { ok: false; reason: FeldzugRefusal };

/** Preisabsprache mit Margaret: Der Krieg endet (oder beginnt nicht), Spur für Delaney, kein Ausbau mehr. */
export function feldzugAbsprache(state: GameState, balance: Balance): FeldzugResult {
  const f = state.feldzug;
  if (!f || f.phase === 'ruhe') return { ok: false, reason: 'keinFeldzug' };
  if (f.phase === 'vorbei') return { ok: false, reason: 'vorbei' };
  let out = beenden(state, balance, f, 'absprache');
  out = { ...out, feldzug: { ...out.feldzug!, pact: true } };
  // Gebietsaufteilung: Harlan behält seine pact.keepRegions stärksten Regionen (Anteil der letzten Abrechnung) und
  // verkauft Crane die übrigen Tankstellen (fertige und im Bau) zum Restwert (brand.station.resale).
  const brand = out.brand;
  let erloes = 0;
  let abgegeben = 0;
  if (brand?.founded) {
    const mitNetz = Object.entries(brand.regions)
      .filter(([, r]) => r.stations + r.building.reduce((x, b) => x + b.count, 0) > 0)
      .sort(([a, x], [b, y]) => (y.last?.share ?? 0) - (x.last?.share ?? 0) || y.stations - x.stations || (a < b ? -1 : 1));
    const regions = { ...brand.regions };
    for (const [id, r] of mitNetz.slice(balance.feldzug.pact.keepRegions)) {
      const n = r.stations + r.building.reduce((x, b) => x + b.count, 0);
      erloes += n * stationCost(balance, id) * balance.brand.station.resale;
      abgegeben += n;
      regions[id] = { ...r, stations: 0, building: [], crane: { ...r.crane, stations: Math.min(balance.brand.station.maxPerRegion, r.crane.stations + n) } };
    }
    out = { ...out, cash: cents(out.cash + erloes), brand: { ...brand, regions } };
  }
  const inv = out.investigation;
  if (inv) {
    const spur = { id: `ereignis_${inv.extra.length + 1}`, kind: 'ereignis' as const, severity: balance.feldzug.pact.trace, round: state.round, label: 'Preisabsprache mit Crane Eastern' };
    out = { ...out, investigation: { ...inv, extra: [...inv.extra, spur] } };
  }
  out = mitMarke(out, FELDZUG_MARKS.pact);
  const gebiete = abgegeben > 0 ? ` Crane übernimmt ${abgegeben} Harlan-Tankstellen außerhalb der ${balance.feldzug.pact.keepRegions === 1 ? 'besten Region' : `${balance.feldzug.pact.keepRegions} besten Regionen`} für ${geld(erloes)}.` : '';
  return { ok: true, state: mitLog(out, `Harlan und Crane Eastern nehmen ab Montag dieselben Preise – auf den Cent. Unterschrieben hat niemand.${gebiete} Neue Tankstellen baut Harlan nicht mehr.`) };
}

/** Thornes Geld annehmen: sofort in der Kasse, zur Frist samt Zins fällig – sonst ist die Firma weg. */
export function feldzugKredit(state: GameState, balance: Balance): FeldzugResult {
  const f = state.feldzug;
  if (!f || f.phase === 'ruhe' || f.phase === 'drohung') return { ok: false, reason: 'keinFeldzug' };
  if (f.loan) return { ok: false, reason: 'schonGeliehen' };
  if (!f.loanOffered || f.phase !== 'krieg') return { ok: false, reason: 'keinAngebot' };
  const { amount, owed } = thorneOffer(state, balance);
  const due = state.round + balance.feldzug.thorne.rounds;
  const out: GameState = { ...state, cash: cents(state.cash + amount), feldzug: { ...f, loan: { amount, owed, due } } };
  return { ok: true, state: mitLog(out, `Pettibone zahlt ${geld(amount)} aus. Bis Runde ${due} müssen ${geld(owed)} zurück – Pfand ist die Mehrheit an Harlan Oil.`) };
}

/** Thornes Kredit vorzeitig zurückzahlen. */
export function feldzugTilgen(state: GameState): FeldzugResult {
  const f = state.feldzug;
  if (!f?.loan) return { ok: false, reason: 'keinKredit' };
  if (state.cash < f.loan.owed) return { ok: false, reason: 'geld' };
  const out: GameState = { ...state, cash: cents(state.cash - f.loan.owed), feldzug: { ...f, loan: null } };
  return { ok: true, state: mitLog(out, `Harlan zahlt Thornes Treuhandbank ${geld(f.loan.owed)} zurück. Pettibone gibt das Pfand heraus, ohne zu lächeln.`) };
}

// ---------------------------------------------------------------------------
// Rundenende

function kapitelRunde(state: GameState): number {
  return state.round - state.chapterStart + 1;
}

/** Thornes Frist: Geld da → zurück, sonst zieht er das Pfand. */
function kreditFrist(state: GameState, f: FeldzugState): GameState {
  const loan = f.loan;
  if (!loan || state.round < loan.due) return state;
  if (state.cash >= loan.owed) {
    return mitLog({ ...state, cash: cents(state.cash - loan.owed), feldzug: { ...f, loan: null } }, `Thornes Kredit ist fällig: ${geld(loan.owed)} gehen an die Treuhandbank zurück.`);
  }
  return mitLog({ ...state, feldzug: { ...f, loan: null, swallowed: true } }, `Thornes Kredit ist fällig, und ${geld(loan.owed)} sind nicht in der Kasse. Pettibone zieht das Pfand: die Mehrheit an Harlan Oil.`);
}

/**
 * Rundenende (nach den Rivalen von Kapitel 3, vor der Pleiteprüfung): Ankündigung, Krieg, Ende,
 * Thornes Angebot und Frist. Vor Kapitel 3 und ohne gegründete Marke unverändert.
 */
export function settleFeldzug(input: GameState, balance: Balance): GameState {
  const b = balance.feldzug;
  if (input.finished || chapterOf(input) < b.fromChapter || !input.brand?.founded) return input;
  let f = input.feldzug ?? newFeldzug(input.seed);
  const rng = new Rng(f.rng);
  // Ein Wurf je Runde, immer – so bleibt der Zufall unabhängig davon, was Jacob tut.
  const wurf = rng.float();
  const kasse = b.war.chestMin + Math.floor(rng.float() * (b.war.chestMax - b.war.chestMin + 1));
  f = { ...f, rng: rng.state };
  let out: GameState = { ...input, feldzug: f };
  const netz = harlanStations(out.brand);

  if (f.phase === 'ruhe') {
    if (netz >= b.trigger.stations && kapitelRunde(out) >= b.trigger.notBefore && kapitelRunde(out) < out.totalRounds - out.chapterStart + 1 && wurf < b.trigger.chance) {
      out = { ...out, feldzug: { ...f, phase: 'drohung', since: out.round } };
      out = mitLog(mitMarke(out, FELDZUG_MARKS.threat), 'Margaret Crane lässt ausrichten, Crane Eastern werde „die Preise an der Zapfsäule überprüfen“. In jeder Stadt, in der Harlan Tankstellen hat.');
    }
  } else if (f.phase === 'drohung') {
    out = { ...out, feldzug: { ...f, phase: 'krieg', since: out.round, chest: kasse, chestStart: kasse, dumping: b.war.margin } };
    out = { ...out, brand: cranePreise(out.brand!, true, balance, b.war.craneAwareness) };
    out = mitLog(mitMarke(out, FELDZUG_MARKS.war), 'Crane Eastern verkauft Benzin unter Einstandspreis – überall, wo Harlan eine Tankstelle hat. Die Banken in Cordova werden plötzlich vorsichtig.');
  } else if (f.phase === 'krieg') {
    const rest = f.chest - 1;
    if (netz === 0) {
      out = mitLog(mitMarke(beenden(out, balance, f, 'aufgegeben'), FELDZUG_MARKS.lost), 'Harlan hat keine Tankstelle mehr. Margaret Crane hat gewonnen und hebt die Preise wieder an.');
    } else if (rest <= 0) {
      let brand = cranePreise(out.brand!, false, balance);
      brand = {
        ...brand,
        regions: Object.fromEntries(
          Object.entries(brand.regions).map(([id, r]) => [id, r.stations > 0 ? { ...r, crane: { ...r.crane, stations: Math.max(0, r.crane.stations - Math.round(r.crane.stations * b.held.craneClose)) } } : r]),
        ),
      };
      out = beenden({ ...out, brand }, balance, f, 'durchgehalten');
      out = { ...out, reputation: { ...(out.reputation ?? {}), public: Math.min(100, (out.reputation?.public ?? 0) + b.held.reputation) } };
      out = mitLog(mitMarke(out, FELDZUG_MARKS.held), 'Cranes Kriegskasse ist leer. Margaret hebt die Preise und schließt Tankstellen neben unseren. Harlan hat standgehalten.');
    } else {
      out = { ...out, feldzug: { ...f, chest: rest }, brand: cranePreise(out.brand!, true, balance) };
      if (!f.loanOffered && out.cash < b.thorne.offerBelow) {
        out = { ...out, feldzug: { ...out.feldzug!, loanOffered: true } };
        out = mitLog(mitMarke(out, FELDZUG_MARKS.thorne), 'Ein Mr. Pettibone von der Thorne Rail & Trust Bank lässt anfragen, ob Harlan Oil „Überbrückung“ brauche.');
      }
    }
  }

  // Letzte Runde des Kapitels: Der Krieg endet mit dem Kapitel (Thornes Frist gilt weiter, wenn sie fällig ist).
  const fz = out.feldzug!;
  if (out.round >= out.totalRounds && (fz.phase === 'krieg' || fz.phase === 'drohung')) out = beenden(out, balance, fz, 'kapitelende');
  return kreditFrist(out, out.feldzug!);
}

// ---------------------------------------------------------------------------
// Spielstand

/** Prüft state.feldzug beim Laden (darf fehlen). */
export function validFeldzug(v: unknown): boolean {
  if (v === undefined) return true;
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const zahlen = ['rng', 'since', 'chest', 'chestStart', 'dumping'].every((k) => typeof o[k] === 'number' && Number.isFinite(o[k] as number));
  if (!zahlen || !FELDZUG_PHASES.includes(o.phase as FeldzugPhase)) return false;
  if (!(o.outcome === null || FELDZUG_OUTCOMES.includes(o.outcome as FeldzugOutcome))) return false;
  if (!['pact', 'loanOffered', 'swallowed'].every((k) => typeof o[k] === 'boolean')) return false;
  const l = o.loan;
  if (l === null) return true;
  return typeof l === 'object' && l !== null && ['amount', 'owed', 'due'].every((k) => typeof (l as Record<string, unknown>)[k] === 'number');
}
