// Transport-Aktionen (Termine als Hauptwerkzeug, Etappe 2): Jacob drückt die Frachtkosten
// mit Terminen auf dem Planungsbrett (Reiter Fracht).
//
//   Bei Thorne vorsprechen   Druck gegen Widerstand. Druckmittel (je 1 Punkt, als Liste mit
//                            Haken): gebündelte Bahnmenge ab 8.000 und ab 20.000 bbl, Ausweichwege
//                            (Gespanne, Brennan, Pipeline) für die Hälfte der Bahnmenge, eine
//                            glaubwürdige Pipeline, ein Kartellgesetz in der Debatte. Widerstand:
//                            2 + 1 je Zugeständnis der letzten 4 Runden (+1, wenn Bullard in Fehde
//                            Jacobs Mengen verrät), dazu Thornes Laune −1/0/+1. Eine Abfuhr hebt den
//                            Tarif sofort (Spielspaß K1). Hing ein Zugeständnis an Ausweichwegen oder
//                            Pipeline, zählt Thorne in den Folgerunden stichprobenartig nach; fährt Jacob
//                            in so einer Runde doch das meiste per Bahn, merkt Thorne den Bluff.
//   Brennan unter Vertrag    Fuhrleute zu festem Preis statt der Mietfuhrwerke – mit Mindestmenge.
//   Transportgemeinschaft    Wildcatter bündeln ihre Fracht mit Jacob (Druck auf Thorne), auf Wunsch
//                            mit gemeinsamer Pipeline. Solange sie läuft, gibt Thorne Rabatt auf Jacobs
//                            Bahnfracht – gegen eine Zusage: Wird die gemeinsame Mindestmenge verfehlt,
//                            kostet das Strafe. Mitglieder springen ab, wenn Jacob sich nicht kümmert.
//   Exklusivvertrag kündigen Teuer, und nur mit genug Druck.
//
// Ersetzt die alte Drohung mit der Pipeline (logistics.ts). Zufall: je Runde ein eigener Strang
// aus dem Seed (`${seed}:fracht:${runde}:…`). Zahlen: balance.yaml transport.negotiation.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { pipelineBuildCost, pipelineCredible } from './logistics';
import type { PlanHandler } from './planHandler';
import { bullardFeud, wildcatterStanding } from './pricing';
import { Rng, seedFromString } from './rng';
import { exclusiveActive, markRound, RIVAL_MARKS, volumeDealActive } from './trust';

/** Merkzeichen der Transport-Aktionen. */
export const FREIGHT_MARKS = {
  /** Brennans Fuhrleute fahren für Jacob (Brief „Thorne bietet Brennan mehr“). */
  brennan: 'brennan_vertrag',
  /** Antwort auf den Brief: Thorne hat Brennan abgeworben – der Vertrag endet. */
  brennanLost: 'brennan_abgeworben',
  /** Thorne hat einen Bluff durchschaut. */
  bluff: 'thorne_bluff',
  /** Jacob hat eine Transportgemeinschaft gegründet. */
  pool: 'transportgemeinschaft',
} as const;

/** Merkzeichen, die die Simulation selbst setzt (brennan_abgeworben setzt eine Antwort im Brief). */
export const FREIGHT_SIM_MARKS: readonly string[] = [FREIGHT_MARKS.brennan, FREIGHT_MARKS.bluff, FREIGHT_MARKS.pool];

/** Antworten aus content/events/, die die Transport-Aktionen lesen. */
export const FREIGHT_READ_MARKS: readonly string[] = [FREIGHT_MARKS.brennanLost];

export interface FreightState {
  /** Brennans Vertrag: erste und letzte Runde. */
  brennan: { from: number; until: number } | null;
  /** Mitglieder der Transportgemeinschaft (Firmennamen, „Bullard“). */
  pool: string[];
  /** Etappe 3: Wer zuletzt abgesprungen ist – der Brief „Die Gemeinschaft bröckelt“ kann sie zurückholen (letters.ts). Fehlt in alten Ständen. */
  poolLeft?: string[];
  /** Gemeinsame Pipeline vereinbart. */
  poolPipeline: boolean;
  poolSince: number;
  poolHeldRound: number;
  /** Runden, in denen Thorne nachgegeben hat. */
  concessions: number[];
  /** Bis einschließlich dieser Runde erhöht Thorne nicht. */
  freezeUntil: number;
  /** Bis einschließlich dieser Runde erhöht Thorne öfter (Abfuhr, Groll nach Bluff). */
  hikeDoubleUntil: number;
  /** Sondertarif: Tarif, letzte Runde, Tarif davor. */
  special: { tariff: number; until: number; before: number } | null;
  /** Bluff-Prüfung: Bahnmenge und Gesamtmenge der Folgerunden. */
  bluffCheck: { from: number; until: number; rail: number; total: number } | null;
  /** Runde, in der Jacob den Exklusivvertrag gekündigt hat (0 = nie). */
  exclusiveEnded: number;
  /** Bahnmenge der Vorrunde (bbl). */
  railLast: number;
  /** Akte und Messung: Besuche, Tarifsenkung insgesamt, riskierte und erwischte Bluffs. */
  visits: number;
  cutTotal: number;
  bluffsRisked: number;
  bluffsCaught: number;
}

export function newFreight(): FreightState {
  return {
    brennan: null,
    pool: [],
    poolPipeline: false,
    poolSince: 0,
    poolHeldRound: 0,
    concessions: [],
    freezeUntil: 0,
    hikeDoubleUntil: 0,
    special: null,
    bluffCheck: null,
    exclusiveEnded: 0,
    railLast: 0,
    visits: 0,
    cutTotal: 0,
    bluffsRisked: 0,
    bluffsCaught: 0,
  };
}

type Lage = Pick<GameState, 'round'> & Partial<Pick<GameState, 'freight'>>;

function freightOf(state: Partial<Pick<GameState, 'freight'>>): FreightState {
  return state.freight ?? newFreight();
}

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function dollar(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} $`;
}

function money(v: number): string {
  return `${Math.round(v).toLocaleString('de-DE')} $`;
}

function bbl(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

function runden(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

function rng(state: Pick<GameState, 'seed' | 'round'>, tag: string): Rng {
  return new Rng(seedFromString(`${state.seed}:fracht:${state.round}:${tag}`));
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

function withFreight(state: GameState, patch: Partial<FreightState>): GameState {
  return { ...state, freight: { ...freightOf(state), ...patch } };
}

function setMark(state: GameState, mark: string): GameState {
  if (state.events.marks[mark] !== undefined) return state;
  return { ...state, events: { ...state.events, marks: { ...state.events.marks, [mark]: state.round } } };
}

// --- Brennan ---------------------------------------------------------------------------

/** Fahren Brennans Fuhrleute in dieser Runde für Jacob? (transport.ts: Mietfuhrwerk billiger, mehr Platz) */
export function brennanActive(state: Lage): boolean {
  const b = freightOf(state).brennan;
  return b !== null && state.round >= b.from && state.round <= b.until;
}

// --- Transportgemeinschaft ----------------------------------------------------------------

/** Zusage je Firma zur Transportgemeinschaft. */
export function poolJoinChance(state: GameState, balance: Balance): number {
  const p = balance.freight.pool;
  const zusage =
    p.base +
    (state.railTariff - p.tariffRef) +
    wildcatterStanding(state) +
    (markRound(state, RIVAL_MARKS.alliance) !== undefined ? p.alliance : 0) +
    (bullardFeud(state) ? p.feud : 0);
  return clamp(zusage, p.min, p.max);
}

/** Was die Gemeinschaft vom Zustand braucht (die Frachtrechnung in transport.ts hat nicht immer alles). */
type PoolLage = Partial<Pick<GameState, 'freight' | 'wildcatters' | 'rival'>>;

function memberWells(state: PoolLage, names: readonly string[]): number {
  const firmen = (state.wildcatters?.firms ?? []).filter((f) => names.includes(f.name)).reduce((s, f) => s + f.wells, 0);
  const bullard = names.includes('Bullard') ? (state.rival?.wells ?? []).filter((w) => w.status === 'found').length : 0;
  return firmen + bullard;
}

/** Bahnmenge der Gemeinschaftsmitglieder je Runde (bbl). */
export function poolVolume(state: PoolLage, balance: Balance): number {
  const p = balance.freight.pool;
  return Math.round(memberWells(state, freightOf(state).pool) * p.perWell * p.wellShare);
}

/**
 * Spielspaß K1: Rabatt auf Jacobs Bahnfracht, solange die Gemeinschaft läuft ($ je bbl):
 * discountStep je volle discountPer bbl Gemeinschaftsmenge, höchstens discountMax (transport.ts).
 */
export function poolDiscount(state: PoolLage, balance: Balance): number {
  const p = balance.freight.pool;
  if (freightOf(state).pool.length === 0) return 0;
  return cents(Math.min(p.discountMax, Math.floor(poolVolume(state, balance) / p.discountPer) * p.discountStep));
}

/**
 * Spielspaß K1: Strafe für die verfehlte Zusage an Thorne in dieser Runde ($): Jacobs Bahnfracht plus
 * Gemeinschaftsmenge unter pool.minimum kostet shortfall je fehlendem Barrel – erst ab der Runde nach
 * der Gründung. Rechnet mit den Mitgliedern vor dem Abspringen am Rundenende (sie haben noch verladen).
 */
export function poolPenalty(state: Pick<GameState, 'round' | 'shipped'> & PoolLage, balance: Balance): { missing: number; fine: number } {
  const fr = freightOf(state);
  const p = balance.freight.pool;
  if (fr.pool.length === 0 || state.round <= fr.poolSince) return { missing: 0, fine: 0 };
  const fehlt = Math.max(0, p.minimum - state.shipped.rail - poolVolume(state, balance));
  return { missing: fehlt, fine: cents(fehlt * p.shortfall) };
}

/** Spielspaß K1: Brennans Strafe für die Mindestmenge in dieser Runde ($, 0 ohne laufenden Vertrag). */
export function brennanPenalty(state: Pick<GameState, 'round' | 'shipped'> & Partial<Pick<GameState, 'freight'>>, balance: Balance): { missing: number; fine: number } {
  if (!brennanActive(state)) return { missing: 0, fine: 0 };
  const fehlt = Math.max(0, balance.freight.brennan.minimum - state.shipped.wagon);
  return { missing: fehlt, fine: cents(fehlt * balance.freight.brennan.shortfall) };
}

/** Anteil der eigenen Pipeline, den das Fremdöl der Gemeinschaft belegt (0 ohne gemeinsame Pipeline). */
export function poolPipelineShare(state: Partial<Pick<GameState, 'freight'>>, balance: Balance): number {
  const f = freightOf(state);
  return f.poolPipeline && f.pool.length > 0 ? balance.freight.pool.foreignShare : 0;
}

export { pipelineBuildCost };

// --- Druck und Widerstand -----------------------------------------------------------------

export interface FreightLever {
  key: 'bundle' | 'bundleBig' | 'fallback' | 'pipeline' | 'antitrust';
  label: string;
  ok: boolean;
  /** Kann ein Bluff sein: Hält Jacob nicht, was der Hebel verspricht, merkt Thorne es. */
  bluff: boolean;
}

/** Gebündelte Bahnmenge: eigene der Vorrunde + Gemeinschaft + Mindestmenge aus dem Mengenrabatt. */
export function bundledVolume(state: GameState, balance: Balance): number {
  const mindest = volumeDealActive(state, balance) ? balance.transport.thorne.minVolume : 0;
  return freightOf(state).railLast + poolVolume(state, balance) + mindest;
}

/** Ausweichkapazität: eigene Gespanne, Brennan, Pipeline (bbl je Runde). */
export function fallbackCapacity(state: GameState, balance: Balance): number {
  const t = balance.transport;
  const lg = state.logistics;
  const pipe = lg.pipeline === 'ready' ? t.pipeline.capacity : 0;
  return lg.teams * t.teams.capacity + (brennanActive(state) ? balance.freight.brennan.capacity : 0) + pipe;
}

/** Druckmittel gegen Thorne, je 1 Punkt. */
export function freightLevers(state: GameState, balance: Balance): FreightLever[] {
  const f = balance.freight;
  const menge = bundledVolume(state, balance);
  const bahn = freightOf(state).railLast;
  return [
    { key: 'bundle', label: `gebündelt mindestens ${bbl(f.bundle[0])} bbl per Bahn`, ok: menge >= f.bundle[0], bluff: false },
    { key: 'bundleBig', label: `gebündelt mindestens ${bbl(f.bundle[1] ?? f.bundle[0])} bbl`, ok: menge >= (f.bundle[1] ?? Infinity), bluff: false },
    { key: 'fallback', label: `Ausweichwege für mindestens die Hälfte der Bahnmenge`, ok: bahn > 0 && fallbackCapacity(state, balance) >= f.fallbackShare * bahn, bluff: true },
    { key: 'pipeline', label: 'eine Pipeline, an die Thorne glaubt', ok: pipelineCredible(state, balance), bluff: true },
    { key: 'antitrust', label: 'Kartellgesetz in der Debatte', ok: state.worldModel?.laws?.bills?.antitrust?.stage === 'debate', bluff: false },
  ];
}

export function freightPressure(state: GameState, balance: Balance): number {
  return freightLevers(state, balance).filter((l) => l.ok).length;
}

/** Thornes Widerstand ohne Laune: Grundwert + Zugeständnisse der letzten Runden + Bullards Verrat. */
export function thorneResistance(state: GameState, balance: Balance): number {
  const r = balance.freight.resistance;
  const zugestaendnisse = freightOf(state).concessions.filter((c) => state.round - c < r.concessionRounds).length;
  return r.base + r.perConcession * zugestaendnisse + (bullardFeud(state) ? r.feud : 0);
}

/** Widerstand in Worten (ohne Zahl). */
export function resistanceWord(state: GameState, balance: Balance): string {
  const w = thorneResistance(state, balance) - balance.freight.resistance.base;
  if (w <= 0) return 'Thorne ist gelassen';
  if (w === 1) return 'Thorne ist gereizt';
  return 'Thorne ist verärgert';
}

/** Ergebnisstufe 0–3 aus Druck − Widerstand + Laune. */
function stufe(x: number): 0 | 1 | 2 | 3 {
  return x <= 0 ? 0 : x >= 3 ? 3 : (x as 1 | 2);
}

/** Was die Ergebnisstufen bedeuten (für die Karte und das Frachtfenster). */
export function outcomeTexts(balance: Balance): string[] {
  const f = balance.freight;
  return [
    `≤ 0: Abfuhr – der Tarif steigt sofort um ${dollar(f.rebuff.raise)}, und Thorne erhöht ${runden(f.rebuff.rounds)} lang öfter`,
    `1: Tarif −${dollar(f.cuts[0])}`,
    `2: Tarif −${dollar(f.cuts[1])}, ${runden(f.freeze[1])} keine Erhöhung`,
    `≥ 3: Tarif −${dollar(f.cuts[2])} und ${runden(f.freeze[2])} Ruhe – oder Sondertarif ${dollar(f.special.tariff)} für ${runden(f.special.rounds)}`,
  ];
}

/**
 * Bei Thorne vorsprechen (Rundenende). Ergebnis nach Druck − Widerstand + Laune. Hing das
 * Zugeständnis an einem Hebel, der ein Bluff sein kann, prüft Thorne die nächsten Runden nach.
 */
export function visitThorne(state: GameState, balance: Balance, special: boolean): GameState {
  const f = balance.freight;
  const th = balance.transport.thorne;
  const fr = freightOf(state);
  if (exclusiveActive(state, balance)) return log(state, 'Thorne empfängt Jacob nicht: „Wir haben einen Exklusivvertrag, Mr. Harlan.“');
  const hebel = freightLevers(state, balance);
  const druck = hebel.filter((l) => l.ok).length;
  const bluffbar = hebel.filter((l) => l.ok && l.bluff).length;
  const w = rng(state, 'thorne').float();
  const laune = w < f.mood.down ? -1 : w >= 1 - f.mood.up ? 1 : 0;
  const widerstand = thorneResistance(state, balance);
  const ergebnis = stufe(druck - widerstand + laune);
  const ohneBluff = stufe(druck - bluffbar - widerstand + laune);
  const stimmung = laune < 0 ? ' Thorne hat schlechte Laune.' : laune > 0 ? ' Thorne ist bester Laune.' : '';
  let n = withFreight(state, { visits: fr.visits + 1 });
  if (ergebnis === 0) {
    // Spielspaß K1: Die Abfuhr kostet sofort – Thorne hebt den Tarif, statt nur öfter zu erhöhen.
    const teurer = Math.max(state.railTariff, Math.min(th.maxTariff, cents(state.railTariff + f.rebuff.raise)));
    n = withFreight({ ...n, railTariff: teurer }, { hikeDoubleUntil: state.round + f.rebuff.rounds - 1 });
    const folge = teurer > state.railTariff ? ` Für die Frechheit hebt er den Tarif sofort auf ${dollar(teurer)}` : ' Er';
    return log(n, `Thorne hört sich Jacob an und schüttelt den Kopf.${stimmung} „Kommen Sie wieder, wenn Sie mir etwas zu bieten haben.“${folge} – und wird ihn bald wieder anheben.`);
  }
  const vorher = state.railTariff;
  let tarif = vorher;
  let patch: Partial<FreightState> = { concessions: [...fr.concessions, state.round] };
  let text: string;
  if (ergebnis === 3 && special) {
    tarif = Math.min(vorher, f.special.tariff);
    patch = { ...patch, special: { tariff: tarif, until: state.round + f.special.rounds, before: vorher }, freezeUntil: Math.max(fr.freezeUntil, state.round + f.special.rounds - 1) };
    text = `Thorne gibt nach: Sondertarif ${dollar(tarif)} je Barrel, fest für ${runden(f.special.rounds)}.`;
  } else {
    // 4.7 Andockpunkt: Liegt der Tarif schon unter minTariff (Fernleitung zum Hafen, Kapitel 2), hebt die Senkung ihn nicht an.
    tarif = Math.min(vorher, Math.max(th.minTariff, cents(vorher - f.cuts[ergebnis - 1])));
    const ruhe = f.freeze[ergebnis - 1];
    if (ruhe > 0) patch = { ...patch, freezeUntil: Math.max(fr.freezeUntil, state.round + ruhe - 1) };
    text = `Thorne gibt nach: Der Bahntarif sinkt auf ${dollar(tarif)} je Barrel${ruhe > 0 ? `, ${runden(ruhe)} keine Erhöhung` : ''}.`;
  }
  patch = { ...patch, cutTotal: cents(fr.cutTotal + vorher - tarif) };
  if (ohneBluff < ergebnis) {
    patch = { ...patch, bluffCheck: { from: state.round + 1, until: state.round + f.bluff.rounds, rail: 0, total: 0 }, bluffsRisked: fr.bluffsRisked + 1 };
    text += ' Er wird am Bahnhof nachzählen lassen, ob Jacob seine Drohung ernst meint.';
  }
  return log(withFreight({ ...n, railTariff: tarif }, patch), `${text}${stimmung}`);
}

// --- Rundenende ----------------------------------------------------------------------------

/**
 * Rundenende vor dem Markt (die Verkäufe der Runde stehen fest): Bahnmenge merken, Brennans
 * Mindestmenge, Bluff-Prüfung, Gemeinschaft (Abspringen, Durchleitung), Sondertarif und
 * Brennans Vertrag laufen aus.
 */
export function settleFreight(state: GameState, balance: Balance): GameState {
  const f = balance.freight;
  const fr = freightOf(state);
  const gesamt = Object.values(state.shipped).reduce((s, v) => s + v, 0);
  let n = withFreight(state, { railLast: state.shipped.rail });
  // Brennan: Mindestmenge, abgeworben, Ende.
  if (fr.brennan && brennanActive(state)) {
    const abgeworben = markRound(state, FREIGHT_MARKS.brennanLost);
    if (abgeworben !== undefined && abgeworben >= fr.brennan.from) {
      n = log(withFreight(n, { brennan: null }), 'Brennans Fuhrleute fahren ab sofort für Thorne. Der Vertrag ist dahin.');
    } else {
      const { missing: fehlt, fine: strafe } = brennanPenalty(state, balance);
      if (fehlt > 0) n = log({ ...n, cash: cents(n.cash - strafe) }, `Brennan: ${bbl(fehlt)} bbl unter der Mindestmenge – ${money(strafe)} für die wartenden Fuhrleute.`);
      if (state.round >= fr.brennan.until) n = log(withFreight(n, { brennan: null }), 'Brennans Vertrag läuft aus.');
    }
  }
  // Bluff-Prüfung (Spielspaß K1): Je Runde lässt Thorne mit Chance check am Bahnhof nachzählen. Ging in so
  // einer Runde mehr als railShare per Bahn, ist der Bluff aufgeflogen – sonst endet die Prüfung nach der letzten Runde.
  const bc = fr.bluffCheck;
  if (bc && state.round >= bc.from && state.round <= bc.until) {
    const pruef = { ...bc, rail: bc.rail + state.shipped.rail, total: bc.total + gesamt };
    const zaehlt = rng(state, 'bluff').float() < f.bluff.check;
    if (zaehlt && gesamt > 0 && state.shipped.rail / gesamt > f.bluff.railShare) {
      const tarif = Math.min(balance.transport.thorne.maxTariff, cents(n.railTariff + f.bluff.penalty));
      n = withFreight({ ...n, railTariff: tarif }, { bluffCheck: null, bluffsCaught: fr.bluffsCaught + 1, hikeDoubleUntil: Math.max(fr.hikeDoubleUntil, state.round + f.rebuff.rounds - 1) });
      n = setMark(log(n, `Thornes Leute haben am Bahnhof nachgezählt: Fast alles ging weiter per Bahn. „Ihre Drohung war Luft, Mr. Harlan.“ Der Tarif steigt auf ${dollar(tarif)}.`), FREIGHT_MARKS.bluff);
    } else n = withFreight(n, { bluffCheck: state.round < bc.until ? pruef : null });
  }
  // Transportgemeinschaft (Spielspaß K1): Zusage an Thorne verfehlt – Strafe, bevor jemand abspringt.
  const strafe = poolPenalty(state, balance);
  if (strafe.fine > 0) {
    n = log({ ...n, cash: cents(n.cash - strafe.fine) }, `Transportgemeinschaft: ${bbl(strafe.missing)} bbl unter der Zusage an Thorne – ${money(strafe.fine)} Strafe.`);
  }
  // Transportgemeinschaft: Wer sich vernachlässigt fühlt, springt ab; Durchleitung durch die Pipeline.
  const fp = freightOf(n);
  if (fp.pool.length > 0 && state.round > fp.poolSince && fp.poolHeldRound < state.round) {
    const r = rng(state, 'pool');
    const weg = fp.pool.filter(() => r.float() < f.pool.leave);
    if (weg.length > 0) {
      const bleiben = fp.pool.filter((m) => !weg.includes(m));
      n = log(withFreight(n, { pool: bleiben }), `${weg.join(', ')} ${weg.length === 1 ? 'springt' : 'springen'} aus der Transportgemeinschaft ab.${bleiben.length === 0 ? ' Die Gemeinschaft ist zerfallen.' : ''}`);
    }
  }
  if (poolPipelineShare(n, balance) > 0 && n.logistics.pipeline === 'ready') {
    // Durchgeleitet wird, was die Mitglieder fördern – höchstens der vereinbarte Anteil der Pipeline.
    const fremd = Math.min(Math.round(balance.transport.pipeline.capacity * f.pool.foreignShare), poolVolume(n, balance));
    const geld = cents(fremd * f.pool.transitFee);
    n = log({ ...n, cash: cents(n.cash + geld) }, `Pipeline: ${bbl(fremd)} bbl Öl der Gemeinschaft durchgeleitet, ${money(geld)} Durchleitungsgebühr.`);
  }
  // Sondertarif läuft aus: Thorne verlangt wieder den alten Tarif.
  const sp = freightOf(n).special;
  if (sp && state.round >= sp.until) {
    n = log(withFreight({ ...n, railTariff: Math.max(n.railTariff, sp.before) }, { special: null }), `Der Sondertarif ist ausgelaufen – Thorne verlangt wieder ${dollar(Math.max(n.railTariff, sp.before))}.`);
  }
  return n;
}

// --- Karten des Planungsbretts (Reiter Fracht) -----------------------------------------------

function thorneLock(state: GameState, balance: Balance): string | null {
  if (exclusiveActive(state, balance)) return 'Mit Exklusivvertrag empfängt Thorne Jacob nicht zum Feilschen.';
  return null;
}

export const FREIGHT_HANDLERS: Record<string, PlanHandler> = {
  thorne_vorsprechen: {
    lock: (s, b) => thorneLock(s, b),
    options: (_s, b) => [
      { id: 'senkung', label: `Bei vollem Erfolg: Tarif −${dollar(b.freight.cuts[2])} und Ruhe`, reason: null },
      { id: 'sondertarif', label: `Bei vollem Erfolg: Sondertarif ${dollar(b.freight.special.tariff)} fest für ${runden(b.freight.special.rounds)}`, reason: null },
    ],
    detail: (s, b) => {
      const hebel = freightLevers(s, b).filter((l) => l.ok);
      return `Druckmittel: ${hebel.length > 0 ? hebel.map((l) => l.label).join(', ') : 'keins'}. ${resistanceWord(s, b)}.`;
    },
    apply: (s, b, t) => visitThorne(s, b, t === 'sondertarif'),
  },
  brennan: {
    visible: (s) => !brennanActive(s),
    warning: (s, b) =>
      exclusiveActive(s, b) ? `Achtung: Exklusivvertrag mit Thorne – jedes Barrel über Brennan kostet ${dollar(b.transport.thorne.exclusivePenalty)} Strafe.` : null,
    detail: (_s, b) =>
      `${dollar(b.freight.brennan.costPerBarrel)} je bbl, bis ${bbl(b.freight.brennan.capacity)} bbl je Runde, ${runden(b.freight.brennan.rounds)}; unter ${bbl(b.freight.brennan.minimum)} bbl kostet jedes fehlende ${dollar(b.freight.brennan.shortfall)}.`,
    apply: (s, b) => {
      const br = b.freight.brennan;
      const n = withFreight(s, { brennan: { from: s.round, until: s.round + br.rounds - 1 } });
      return setMark(log(n, `Brennan und seine Fuhrleute fahren ab sofort für Jacob: ${dollar(br.costPerBarrel)} je Barrel, bis ${bbl(br.capacity)} bbl je Runde, ${runden(br.rounds)}.`), FREIGHT_MARKS.brennan);
    },
  },
  transportgemeinschaft: {
    visible: (s) => freightOf(s).pool.length === 0,
    options: (_s, b) => [
      { id: 'ohne', label: 'Nur die Fracht bündeln', reason: null },
      { id: 'pipeline', label: `Dazu eine gemeinsame Pipeline (−${Math.round(b.freight.pool.pipelineDiscount * 100)} % Bau, ${Math.round(b.freight.pool.foreignShare * 100)} % Fremdöl)`, reason: null },
    ],
    detail: (s, b) => {
      const p = b.freight.pool;
      return `Jede Firma sagt mit etwa ${Math.round(poolJoinChance(s, b) * 100)} % zu. Thorne gibt ${dollar(p.discountStep)} Rabatt je ${bbl(p.discountPer)} bbl der Gemeinschaft (bis ${dollar(p.discountMax)}) auf Jacobs Bahnfracht – gegen die Zusage, gemeinsam mindestens ${bbl(p.minimum)} bbl je Runde per Bahn zu verladen; jedes fehlende Barrel kostet ${dollar(p.shortfall)}.`;
    },
    apply: (s, b, t) => {
      if (freightOf(s).pool.length > 0) return log(s, 'Die Transportgemeinschaft gibt es schon.');
      const r = rng(s, 'gemeinschaft');
      const chance = poolJoinChance(s, b);
      const firmen = s.wildcatters.firms.filter(() => r.float() < chance).map((x) => x.name);
      const bullard = markRound(s, RIVAL_MARKS.bullardPact) !== undefined && !bullardFeud(s) ? ['Bullard'] : [];
      const pool = [...firmen, ...bullard];
      if (pool.length === 0) return log(s, 'Keiner der Wildcatter will seine Fässer mit Jacobs zusammen verladen. Die Transportgemeinschaft kommt nicht zustande.');
      const n = withFreight(s, { pool, poolPipeline: t === 'pipeline', poolSince: s.round, poolHeldRound: s.round });
      return setMark(
        log(
          n,
          `Transportgemeinschaft gegründet: ${pool.join(', ')} verladen mit Jacob – zusammen ${bbl(poolVolume(n, b))} bbl je Runde mehr auf Thornes Bahn. Thorne gibt dafür ${dollar(poolDiscount(n, b))} Rabatt je Barrel, solange gemeinsam mindestens ${bbl(b.freight.pool.minimum)} bbl je Runde fahren.${t === 'pipeline' ? ' Eine Pipeline bauen sie gemeinsam.' : ''}`,
        ),
        FREIGHT_MARKS.pool,
      );
    },
  },
  gemeinschaft_halten: {
    visible: (s) => freightOf(s).pool.length > 0 && freightOf(s).poolSince < s.round,
    lock: (s) => (freightOf(s).poolHeldRound === s.round ? 'Die Gemeinschaft ist für diese Runde schon gehalten.' : null),
    apply: (s) => (freightOf(s).pool.length === 0 ? log(s, 'Die Transportgemeinschaft gibt es nicht mehr.') : log(withFreight(s, { poolHeldRound: s.round }), 'Jacob hilft beim Verladen und hält die Transportgemeinschaft zusammen.')),
  },
  exklusiv_kuendigen: {
    visible: (s, b) => exclusiveActive(s, b),
    lock: (s, b) => (freightPressure(s, b) < b.freight.cancelPressure ? `Ohne Druck (mindestens ${b.freight.cancelPressure} Druckmittel) lacht Thorne über die Kündigung.` : null),
    apply: (s) => log(withFreight(s, { exclusiveEnded: s.round }), 'Jacob kündigt den Exklusivvertrag. Thorne lässt ihn gehen – teuer, aber frei.'),
  },
};

// --- Ansicht -----------------------------------------------------------------------------------

export interface FreightView {
  levers: FreightLever[];
  pressure: number;
  resistanceWord: string;
  /** Erwartete Ergebnisstufe bei normaler Laune (0–3) und die Bedeutung aller Stufen. */
  expected: number;
  outcomes: string[];
  brennan: { roundsLeft: number } | null;
  /** Spielspaß K1: discount = Rabatt auf Jacobs Bahnfracht, minimum = Zusage an Thorne (gemeinsam je Runde). */
  pool: { members: string[]; volume: number; pipeline: boolean; discount: number; minimum: number } | null;
  special: { tariff: number; roundsLeft: number } | null;
  freezeRounds: number;
  bluffWatch: boolean;
}

/** Was das Frachtfenster über die Verhandlungen zeigt – die Oberfläche rechnet nichts. */
export function freightView(state: GameState, balance: Balance): FreightView {
  const fr = freightOf(state);
  const levers = freightLevers(state, balance);
  const pressure = levers.filter((l) => l.ok).length;
  return {
    levers,
    pressure,
    resistanceWord: resistanceWord(state, balance),
    expected: stufe(pressure - thorneResistance(state, balance)),
    outcomes: outcomeTexts(balance),
    brennan: fr.brennan && brennanActive(state) ? { roundsLeft: fr.brennan.until - state.round + 1 } : null,
    pool:
      fr.pool.length > 0
        ? { members: fr.pool, volume: poolVolume(state, balance), pipeline: fr.poolPipeline, discount: poolDiscount(state, balance), minimum: balance.freight.pool.minimum }
        : null,
    special: fr.special ? { tariff: fr.special.tariff, roundsLeft: Math.max(0, fr.special.until - state.round + 1) } : null,
    freezeRounds: Math.max(0, fr.freezeUntil - state.round + 2),
    bluffWatch: fr.bluffCheck !== null,
  };
}

/** Prüft einen Fracht-Zustand aus dem Spielstand. */
export function isFreightState(value: unknown): value is FreightState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const zahlen = ['poolSince', 'poolHeldRound', 'freezeUntil', 'hikeDoubleUntil', 'exclusiveEnded', 'railLast', 'visits', 'cutTotal', 'bluffsRisked', 'bluffsCaught'];
  if (!zahlen.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k] as number))) return false;
  if (!Array.isArray(v.pool) || !Array.isArray(v.concessions) || typeof v.poolPipeline !== 'boolean') return false;
  if (v.poolLeft !== undefined && (!Array.isArray(v.poolLeft) || !v.poolLeft.every((m) => typeof m === 'string'))) return false;
  const b = v.brennan as Record<string, unknown> | null;
  if (b !== null && (typeof b !== 'object' || typeof b.from !== 'number' || typeof b.until !== 'number')) return false;
  return true;
}
