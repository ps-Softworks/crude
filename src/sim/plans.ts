// Planungsbrett (Termine als Hauptwerkzeug, Etappe 1 und 2): Jacob verplant seine
// Termine mit Karten. Jede Karte kostet Termine (Überstunden kosten Kraft), oft Geld,
// manchmal Kraft, und tut etwas Wichtiges: übers Land reiten, einen Geologen
// kartieren lassen, einen Bohrbericht kaufen … Erkundungs-Karten wirken sofort –
// man kann in derselben Runde pachten. Verhandlungen und Pakte (Etappe 2) wirken am
// Rundenende (settlePlans), mit Wurf der Gegenseite; das Ergebnis steht im
// Wochenbericht. Was noch nicht gewirkt hat, lässt sich zurücknehmen.
//
// Die festen Termine aus content/events/ (routine) sind ebenfalls Karten: Sie
// wirken wie bisher über resolveEvent. Eine Karte in balance.yaml mit event ersetzt
// den Termin unter eigenem Namen (Feldinspektion), alle übrigen festen Termine
// liegen automatisch im Reiter „leute“.
//
// Zahlen der Karten: balance.yaml plans.cards, Texte: content/plans.yaml, Regeln je
// Karte: HANDLERS hier (Erkundung), dazu die Preis-Aktionen aus src/sim/pricing.ts (Reiter
// Markt) und die Transport-Aktionen aus src/sim/freight.ts (Reiter Fracht, Etappe 2).
// Karten mit target „option“ bieten mehrere Möglichkeiten (z. B. Laufzeit und Menge eines
// Vertrags). Die Oberfläche liest nur planView.

import { BUYER_HANDLERS } from './buyers';
import { acceptReferral, isCold, isKnown, noteContact, relationOf, shiftRelation } from './network';
import { overtimeFor, refundAppointments, spendAppointments, timeReason } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { routineOffered, resolveEvent, type EventDef } from './events';
import {
  bullardReports,
  explorableNeighbours,
  hasClue,
  hireGeologist,
  knowledgeOf,
  mapParcels,
  payGeologist,
  ride,
  rideNews,
  rideParcels,
  rollClue,
  addClues,
  suggestRide,
  type Clue,
  type ClueKind,
} from './exploration';
import { formatForecast } from './forecast';
import type { GameState } from './game';
import { leaseOf, leaseTerms, optionOf, parcelLabel } from './lease';
import type { PlanHandler } from './planHandler';
import { PRICE_HANDLERS, settlePricing } from './pricing';
import { FREIGHT_HANDLERS, settleFreight } from './freight';
import { DEAL_HANDLERS, dealsOf, ringing } from './deals';
import type { GeologistId, PlanCardBalance, PlanRequires, PlanTab, PlanTarget, PlanTiming } from './plansBalance';
import { Rng, seedFromString } from './rng';
import { RIVAL_MARKS } from './trust';

export type { PlanTab };

/** Eine gebuchte Karte dieser Runde. */
export interface BookedPlan {
  cardId: string;
  target?: string;
  appointments: number;
  /** Davon Überstunden (haben Kraft gekostet). */
  overtime: number;
  cash: number;
  strength: number;
  /** Hat schon gewirkt (sofort-Karten und feste Termine gleich beim Buchen). */
  done: boolean;
}

export interface PlansState {
  /** Runde, zu der booked gehört. */
  round: number;
  booked: BookedPlan[];
  /** Wochenbericht: Ergebnisse vom letzten Rundenende und den Sofort-Karten dieser Runde. */
  report: string[];
}

export function newPlans(round = 1): PlansState {
  return { round, booked: [], report: [] };
}

export type PlanResult = { ok: true; state: GameState } | { ok: false; reason: string };

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function parcelOf(state: GameState, id: string | undefined) {
  return id === undefined ? undefined : state.parcels.find((p) => p.id === id);
}

function label(state: GameState, id: string | undefined): string {
  const p = parcelOf(state, id);
  return p ? parcelLabel(p) : (id ?? '');
}

/** Kurze Namen der Hinweise fürs Protokoll (die Texte im Ranch-Fenster kommen aus content/plans.yaml). */
const HINWEIS: Record<ClueKind, string> = {
  sickerstelle: 'Sickerstelle',
  salzwasser: 'Salzwasser im Brunnen',
  formation: 'Hügelzug',
  brunnen: 'alter Brunnen roch nach Öl',
  kartierung: 'Karte des Geologen günstig',
  bohrbericht: 'Ölsand im Bohrbericht',
  rute: 'die Rute schlug aus',
  seismik: 'Struktur im Seismik-Bild',
};

function gesehenText(state: GameState, eintraege: { parcelId: string; clues: Clue[] }[]): string {
  const gesehen = eintraege.flatMap((e) => e.clues.filter((c) => c.seen).map((c) => `${HINWEIS[c.kind]} auf ${label(state, e.parcelId)}`));
  return gesehen.length > 0 ? gesehen.join(', ') : 'nichts, was auf Öl deutet';
}

/**
 * 0.4.19+3: Was der Ritt an der Prognose geändert hat, je Ranch („Moss-Farm 40–80 % → 55–95 %“) –
 * sonst fühlte sich Erkundung folgenlos an, obwohl sie es nicht ist.
 */
function prognoseText(vorher: GameState, nachher: GameState, ids: string[]): string {
  const kurz = (f: { low: number; high: number; sure?: boolean }) => (f.sure ? 'Öl sicher' : `${f.low}–${f.high} %`);
  const teile = ids.map((id) => {
    const a = vorher.forecasts[id];
    const b = nachher.forecasts[id];
    if (!b) return `${label(nachher, id)} ohne Prognose`;
    if (!a) return `${label(nachher, id)} neu ${kurz(b)}`;
    return a.low === b.low && a.high === b.high ? `${label(nachher, id)} bleibt ${kurz(b)}` : `${label(nachher, id)} ${kurz(a)} → ${kurz(b)}`;
  });
  return `Fundchance: ${teile.join(', ')}.`;
}

/** Regel einer Karte (src/sim/planHandler.ts). */
type Handler = PlanHandler;

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

const GEOLOGEN_NAME: Record<GeologistId, string> = { standard: 'ein Geologe aus Port Ellis', hallstead: 'Dr. Merriweather aus Hallstead', hale: 'Hale' };

function geologeHandler(id: GeologistId): Handler {
  return {
    lock: (s) => (s.exploration?.geologist?.id === id ? 'Dieser Geologe arbeitet schon für Jacob.' : null),
    apply: (s, b) => {
      const n = hireGeologist(s, b, id);
      const g = n.exploration.geologist!;
      return log(n, `Eingestellt: ${GEOLOGEN_NAME[id]} (Genauigkeit ${g.accuracy}, ${money(g.wage)} Lohn je Runde).`);
    },
  };
}

const LAND_HANDLERS: Record<string, Handler> = {
  ritt: {
    lock: (s, _b, t) => (rideNews(s, t!) ? null : 'Hier ist Jacob schon überall geritten – es gibt nichts Neues zu sehen.'),
    apply: (s, b, t) => {
      const ziele = rideParcels(s, t!);
      const n = ride(s, b, t!);
      const eintraege = ziele.map((p) => ({ parcelId: p.id, clues: knowledgeOf(n, p.id).clues.filter((c) => c.round === s.round && c.source === 'ritt') }));
      return log(n, `Ritt übers Land (${ziele.map(parcelLabel).join(', ')}): ${gesehenText(n, eintraege)}. ${prognoseText(s, n, ziele.map((p) => p.id))}`);
    },
  },
  farmer: {
    lock: (s, _b, t) => (hasClue(s, t!, 'brunnen') ? 'Der alte Farmer hat schon alles erzählt, was er weiß.' : null),
    apply: (s, b, t) => {
      const p = parcelOf(s, t)!;
      const lie = p.landowner === 'gierig' ? b.exploration.greedyLie : 0;
      const clue = rollClue(s, b, p, 'brunnen', 'farmer', { lie });
      const freundlich = b.exploration.friendlyOwners.includes(p.landowner);
      const n = addClues(s, b, p.id, [clue], freundlich ? { leaseDiscount: b.exploration.friendlyDiscount } : {});
      const rabatt = freundlich ? ` Er würde Jacob ${Math.round(b.exploration.friendlyDiscount * 100)} % vom Pachtbonus nachlassen.` : '';
      return log(n, `Gespräch mit dem alten Farmer auf ${parcelLabel(p)}: ${clue.seen ? 'Sein Brunnen roch einmal nach Öl.' : 'Sein Brunnen gab immer nur Wasser.'}${rabatt}`);
    },
  },
  geologe_einstellen: geologeHandler('standard'),
  geologe_hallstead: geologeHandler('hallstead'),
  geologe_hale: geologeHandler('hale'),
  geologe_besprechung: {
    lock: (s, _b, t) => {
      const g = s.exploration?.geologist;
      if (!g) return 'Ohne Geologen gibt es keine Karte.';
      return hasClue(s, t!, 'kartierung', g.id) ? 'Diese Ranch hat er schon kartiert.' : null;
    },
    apply: (s, b, t) => {
      const g = s.exploration.geologist!;
      const ziel = parcelOf(s, t)!;
      const vorher = new Set(explorableNeighbours(s, ziel).filter((p) => hasClue(s, p.id, 'kartierung', g.id)).map((p) => p.id));
      const n = mapParcels(s, b, t!);
      const kartiert = [ziel, ...explorableNeighbours(s, ziel).filter((p) => !vorher.has(p.id) && hasClue(n, p.id, 'kartierung', g.id))];
      return log(n, `Der Geologe kartiert ${kartiert.map(parcelLabel).join(' und ')}.`);
    },
  },
  bohrbericht: {
    lock: (s, _b, t) => (bullardReports(s).some((r) => r.parcel.id === t) ? null : 'Hier hat niemand gebohrt, dessen Bericht zu kaufen wäre.'),
    cost: (s, b, t) => {
      const r = bullardReports(s).find((x) => x.parcel.id === t);
      return r?.found ? b.exploration.reportCost.found : b.exploration.reportCost.dry;
    },
    apply: (s, b, t) => {
      const p = parcelOf(s, t)!;
      const clue = rollClue(s, b, p, 'bohrbericht', 'bericht');
      const n = addClues(s, b, p.id, [clue]);
      return log(n, `Bohrbericht von ${parcelLabel(p)} gekauft: ${clue.seen ? 'Ölsand in der Tiefe.' : 'nur Salzwasser und Fels.'}`);
    },
  },
  tagebuch: {
    lock: (s) => (bullardReports(s).length === 0 ? 'Bullard hat noch nichts gebohrt, was in seinem Tagebuch stünde.' : null),
    apply: (s, b) => {
      const ziele = bullardReports(s).slice(0, b.exploration.diary.ranches);
      let n = s;
      for (const r of ziele) n = addClues(n, b, r.parcel.id, [rollClue(s, b, r.parcel, 'bohrbericht', 'tagebuch')]);
      const eintraege = ziele.map((r) => ({ parcelId: r.parcel.id, clues: knowledgeOf(n, r.parcel.id).clues.filter((c) => c.source === 'tagebuch') }));
      n = log(n, `Nachts in Bullards Bohrhütte: das Tagebuch über ${ziele.map((r) => parcelLabel(r.parcel)).join(', ')} – ${gesehenText(n, eintraege)}.`);
      const erwischt = new Rng(seedFromString(`${s.seed}:tagebuch:${s.round}`)).float() < b.exploration.diary.caught;
      if (!erwischt) return n;
      const marks = { ...n.events.marks };
      if (marks[RIVAL_MARKS.bullardFeud] === undefined) marks[RIVAL_MARKS.bullardFeud] = s.round;
      return log({ ...n, events: { ...n.events, marks } }, 'Bullards Vormann hat Jacob gesehen. Bullard spricht von Diebstahl – das gibt Fehde.');
    },
  },
  rute: {
    apply: (s, b, t) => {
      const p = parcelOf(s, t)!;
      const clue = rollClue(s, b, p, 'rute', 'rute');
      return log(addClues(s, b, p.id, [clue]), `Der Rutengänger läuft ${parcelLabel(p)} ab: ${clue.seen ? 'Die Rute schlägt aus.' : 'Die Rute bleibt still.'} Die Männer lachen, Jacob auch.`);
    },
  },
};

/** Alle Regeln: Erkundung (Etappe 1), Preis- und Transport-Aktionen (Etappe 2). */
// 0.4.20+31: erst beim ersten Gebrauch zusammensetzen – die Regel-Dateien importieren sich im Kreis
// (game ↔ plans ↔ deals/freight/transport), beim Laden des Moduls können sie noch fehlen.
let alle: Record<string, Handler> | null = null;
function handlers(): Record<string, Handler> {
  alle ??= { ...LAND_HANDLERS, ...PRICE_HANDLERS, ...FREIGHT_HANDLERS, ...DEAL_HANDLERS, ...BUYER_HANDLERS };
  return alle;
}

/** Eine Karte, wie das Brett sie kennt: aus balance.yaml oder ein fester Termin. */
export interface PlanCardDef extends PlanCardBalance {
  id: string;
  /** Fester Termin, der automatisch zur Karte wurde (Reiter „leute“). */
  auto?: boolean;
}

/** Alle Karten: die aus balance.yaml und je fester Termin ohne eigene Karte eine im Reiter „leute“. */
export function planCards(balance: Balance, catalog: readonly EventDef[]): PlanCardDef[] {
  const eigene = Object.entries(balance.plans.cards).map(([id, c]) => ({ id, ...c }));
  const vergeben = new Set(eigene.map((c) => c.event).filter(Boolean));
  const termine: PlanCardDef[] = catalog
    .filter((e) => e.routine && !vergeben.has(e.id))
    .map((e) => ({ id: e.id, contact: '', tab: 'leute', appointments: e.appointments, cash: 0, strength: 0, target: 'none', timing: 'sofort', event: e.id, requires: {}, auto: true }));
  return [...eigene, ...termine];
}

function requiresMet(state: GameState, r: PlanRequires): boolean {
  const marks = state.events.marks;
  if (r.marked && !r.marked.every((m) => marks[m] !== undefined)) return false;
  if (r.notMarked && r.notMarked.some((m) => marks[m] !== undefined)) return false;
  if (r.minRound !== undefined && state.round < r.minRound) return false;
  if (r.minChapter !== undefined && chapterOf(state) < r.minChapter) return false;
  if (r.maxChapter !== undefined && chapterOf(state) > r.maxChapter) return false;
  return true;
}

/** 0.4.20+42: Kennt Jacob die Stelle der Karte (und reicht die Beziehung)? Feste Termine ohne Stelle gehen immer. */
function contactOpen(state: GameState, card: PlanCardDef): boolean {
  if (!card.contact) return true;
  if (!isKnown(state, card.contact)) return false;
  return card.requires.minRelation === undefined || relationOf(state, card.contact) >= card.requires.minRelation;
}

function eventOf(catalog: readonly EventDef[], id: string | undefined): EventDef | undefined {
  return id === undefined ? undefined : catalog.find((e) => e.id === id);
}

/** Ist die Karte auf der Hand? Feste Termine: wenn sie im Kalender stehen könnten (oder schon wahrgenommen sind). */
function onHand(state: GameState, card: PlanCardDef, catalog: readonly EventDef[], balance?: Balance): boolean {
  if (state.finished || !requiresMet(state, card.requires) || !contactOpen(state, card)) return false;
  // 0.4.20+34: Anrufe liegen nur in der Runde auf der Hand, in der das Telefon für sie geklingelt hat.
  if (card.call !== undefined && !ringing(state, card.id)) return false;
  if (card.event === undefined) {
    const h = card.handler ? handlers()[card.handler] : undefined;
    return !(h?.visible && balance && !h.visible(state, balance));
  }
  const e = eventOf(catalog, card.event);
  if (!e) return false;
  return routineOffered(state, e) || state.agenda.done.includes(e.id);
}

/** Termine einer Karte (feste Termine: wie im Ereignis). */
function cardAppointments(card: PlanCardDef, catalog: readonly EventDef[]): number {
  const e = eventOf(catalog, card.event);
  return e ? (e.choices[0]?.appointments ?? e.appointments) : card.appointments;
}

/** Was die Karte gerade kostet ($) – manche Preise hängen von der Lage ab (Bohrbericht). */
export function cardCash(state: GameState, balance: Balance, card: PlanCardDef, target?: string): number {
  const h = card.handler ? handlers()[card.handler] : undefined;
  return h?.cost ? h.cost(state, balance, target) : card.cash;
}

/** Möglichkeiten einer Karte mit target „option“ (sonst leer). */
export function cardOptions(state: GameState, balance: Balance, card: PlanCardDef) {
  const h = card.handler ? handlers()[card.handler] : undefined;
  return card.target === 'option' && h?.options ? h.options(state, balance) : [];
}

/** Warum das Ziel nicht taugt, oder null. */
function targetReason(state: GameState, card: PlanCardDef, target?: string, balance?: Balance): string | null {
  if (card.target === 'option') {
    if (target === undefined) return 'Erst eine Möglichkeit wählen.';
    const o = balance ? cardOptions(state, balance, card).find((x) => x.id === target) : undefined;
    if (!o) return 'Diese Möglichkeit gibt es nicht.';
    return o.reason;
  }
  if (card.target !== 'ranch') return null;
  const p = parcelOf(state, target);
  if (!p) return 'Erst eine Ranch wählen.';
  if (p.discovery) return 'Salt Hill ist erschlossen – da gibt es nichts zu erkunden.';
  return null;
}

/**
 * Warum die Karte gerade nicht geht, oder null: Ziel, Regel der Karte, schon
 * gebucht, Zeit, Geld. Ohne Ziel bei einer Ranch-Karte zählt nur, was für alle gilt.
 */
export function cardReason(state: GameState, balance: Balance, catalog: readonly EventDef[], card: PlanCardDef, target?: string): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (!onHand(state, card, catalog, balance)) return 'Diese Karte liegt gerade nicht auf der Hand.';
  if (card.event !== undefined && state.agenda.done.includes(card.event)) return 'Diese Runde schon wahrgenommen.';
  if (card.contact && isCold(state, balance, card.contact)) return 'Die Stelle ist verärgert – erst versöhnen.';
  if ((card.target === 'ranch' || card.target === 'option') && target !== undefined) {
    const t = targetReason(state, card, target, balance);
    if (t) return t;
  }
  const h = card.handler ? handlers()[card.handler] : undefined;
  if (h?.lock && (card.target !== 'ranch' || target !== undefined)) {
    const r = h.lock(state, balance, target);
    if (r) return r;
  }
  // Ranch-Karten je Ranch einmal; alle anderen Karten (auch mit Möglichkeiten) einmal je Runde.
  const gebucht = (b: BookedPlan) => b.cardId === card.id && !b.done && (card.target !== 'ranch' || b.target === target);
  if ((state.plans?.round === state.round ? state.plans.booked : []).some(gebucht)) return 'Diese Karte ist für diese Runde schon gebucht.';
  const zeit = timeReason(state, balance, cardAppointments(card, catalog));
  if (zeit) return zeit;
  const preis = cardCash(state, balance, card, target);
  if (state.cash < preis) return `Nicht genug Geld: Das kostet ${money(preis)}, in der Kasse sind ${money(state.cash)}.`;
  return null;
}

/**
 * Bucht eine Karte: Termine belegen (Überstunden kosten Kraft), Geld und Kraft
 * abziehen; sofort-Karten wirken gleich, rundenende-Karten warten auf settlePlans.
 * Feste Termine gehen über resolveEvent – genau wie bisher.
 */
export function bookCard(state: GameState, balance: Balance, catalog: readonly EventDef[], cardId: string, target?: string): PlanResult {
  const card = planCards(balance, catalog).find((c) => c.id === cardId);
  if (!card) return { ok: false, reason: 'Diese Karte gibt es nicht.' };
  const reason = cardReason(state, balance, catalog, card, target) ?? (card.target === 'ranch' || card.target === 'option' ? targetReason(state, card, target, balance) : null);
  if (reason) return { ok: false, reason };
  const plans = state.plans.round === state.round ? state.plans : newPlans(state.round);
  const n = cardAppointments(card, catalog);
  const overtime = overtimeFor(state, n);
  if (card.event !== undefined) {
    const e = eventOf(catalog, card.event)!;
    const r = resolveEvent(state, balance, catalog, e.id, e.choices[0].id);
    if (!r.ok) return r;
    const eintrag: BookedPlan = { cardId, appointments: n, overtime, cash: 0, strength: 0, done: true };
    const gepflegt = card.contact ? noteContact(r.state, balance, card.contact) : r.state;
    return { ok: true, state: { ...gepflegt, plans: { ...plans, booked: [...plans.booked, eintrag] } } };
  }
  const h = handlers()[card.handler!];
  if (!h) return { ok: false, reason: `Karte „${cardId}“ hat keine Regel.` };
  const belegt = spendAppointments(state, balance, n);
  if (!belegt.ok) return belegt;
  const cash = cardCash(state, balance, card, target);
  let next: GameState = {
    ...belegt.state,
    cash: belegt.state.cash - cash,
    strength: Math.min(state.strengthMax, Math.max(0, belegt.state.strength + card.strength)),
  };
  // Die tatsächliche Änderung merken (Kraft ist auf 0..strengthMax begrenzt), damit
  // Zurücknehmen genau das rückgängig macht – sonst ließe sich Kraft „erbuchen“.
  const eintrag: BookedPlan = { cardId, appointments: n, overtime, cash, strength: next.strength - belegt.state.strength, done: card.timing === 'sofort' };
  if (target !== undefined) eintrag.target = target;
  let report = plans.report;
  if (card.timing === 'sofort') {
    const vorher = next.log.length;
    next = h.apply(next, balance, target);
    report = [...report, ...next.log.slice(vorher)];
  }
  // 0.4.20+42: Jedes Geschäft pflegt die Beziehung zur Stelle.
  if (card.contact) next = noteContact(next, balance, card.contact);
  return { ok: true, state: { ...next, plans: { ...plans, booked: [...plans.booked, eintrag], report } } };
}

/** Nimmt eine gebuchte Karte zurück, solange sie noch nicht gewirkt hat: Termine, Geld und Kraft kommen zurück. */
export function unbookCard(state: GameState, balance: Balance, index: number): PlanResult {
  const b = state.plans.booked[index];
  if (!b || state.plans.round !== state.round) return { ok: false, reason: 'Diese Buchung gibt es nicht.' };
  if (b.done) return { ok: false, reason: 'Das ist schon geschehen – zurücknehmen geht nicht mehr.' };
  // 0.4.20+42: Zurücknehmen nimmt auch die Beziehungspflege zurück – sonst ließe sie sich erbuchen.
  const stelle = balance.plans.cards[b.cardId]?.contact;
  const ohnePflege = stelle ? shiftRelation(state, stelle, -balance.network.relation.use) : state;
  const zurueck = refundAppointments(ohnePflege, balance, b.appointments, b.overtime);
  return {
    ok: true,
    state: {
      ...zurueck,
      cash: zurueck.cash + b.cash,
      strength: Math.min(state.strengthMax, Math.max(0, zurueck.strength - b.strength)),
      plans: { ...state.plans, booked: state.plans.booked.filter((_, i) => i !== index) },
    },
  };
}

/**
 * Rundenende: Karten, die am Rundenende wirken, wirken jetzt (Ergebnisse in den
 * Wochenbericht), dann bekommt der Geologe seinen Lohn. Danach ist das Brett für die
 * nächste Runde leer; der Wochenbericht bleibt bis dahin liegen.
 */
export function settlePlans(state: GameState, balance: Balance): GameState {
  const plans = state.plans ?? newPlans(state.round);
  let next = state;
  const vorher = next.log.length;
  if (plans.round === state.round) {
    for (const b of plans.booked) {
      if (b.done) continue;
      const card = balance.plans.cards[b.cardId];
      const h = card?.handler ? handlers()[card.handler] : undefined;
      if (h) next = h.apply(next, balance, b.target);
    }
  }
  // Etappe 2: Förderbremse, Liefervertrag und Fracht-Verträge rechnen ab – auch das steht im Wochenbericht.
  next = settleFreight(settlePricing(next, balance), balance);
  const report = next.log.slice(vorher);
  next = payGeologist(next);
  return { ...next, plans: { round: state.round + 1, booked: [], report } };
}

/** Hängt die Protokollzeilen ab Index from an den Wochenbericht (was nach dem Markt geschah, Etappe 2). */
export function appendReport(state: GameState, from: number): GameState {
  const neu = state.log.slice(from);
  if (neu.length === 0 || !state.plans) return state;
  return { ...state, plans: { ...state.plans, report: [...state.plans.report, ...neu] } };
}

/** Ein Ziel einer Ranch-Karte, wie die Auswahl es zeigt. */
export interface PlanTargetView {
  parcelId: string;
  label: string;
  level: number;
  ok: boolean;
  reason?: string;
  /** Lage nach öffentlichem Wissen (Am Fund, Nachbar, …) und Pachtbonus, wenn die Ranch frei ist (0.4.19+2). */
  detail: string;
}

/** Eine Karte auf dem Brett. */
export interface PlanCardView {
  id: string;
  /** Stelle im Adressbuch (0.4.20+42; leer bei festen Terminen ohne eigene Karte). */
  contact: string;
  tab: PlanTab;
  appointments: number;
  /** Geld, das sie kostet (beim Bohrbericht: der billigste Preis). */
  cash: number;
  strength: number;
  target: PlanTarget;
  timing: PlanTiming;
  /** Fester Termin (Ereignis-ID), sonst undefined. */
  event?: string;
  /** Automatisch aus einem festen Termin entstanden (Titel aus dem Ereignis). */
  auto: boolean;
  /** Warum sie gerade nicht geht (für alle Ziele), oder null. */
  reason: string | null;
  /** Ranch-Karten: mögliche Ziele. */
  targets: PlanTargetView[];
  /** Karten mit Möglichkeiten (Etappe 2): z. B. Laufzeit und Menge eines Vertrags. */
  options: { id: string; label: string; ok: boolean; reason?: string }[];
  /** Lage in einem Satz (Druckmittel, Beitrittschance …), oder null. */
  detail: string | null;
  /** Warnung, die nicht sperrt, oder null. */
  warning: string | null;
}

/** Ein Feld im Kalender: was den Termin belegt. */
export interface PlanSlot {
  kind: 'plan' | 'termin' | 'post' | 'frei';
  /** Karte bzw. fester Termin. */
  cardId?: string;
  target?: string;
  /** Rote Nachtfelder: Überstunden. */
  overtime: boolean;
  /** Buchung, die sich zurücknehmen lässt (Index in plans.booked). */
  undo?: number;
}

export interface PlanView {
  slots: PlanSlot[];
  cards: PlanCardView[];
  report: string[];
}

/** Was das Brett zeigt – alles aus der Simulation, die Oberfläche rechnet nichts. */
export function planView(state: GameState, balance: Balance, catalog: readonly EventDef[]): PlanView {
  const plans = state.plans?.round === state.round ? state.plans : newPlans(state.round);
  const karten = planCards(balance, catalog).filter((c) => onHand(state, c, catalog, balance));
  const ranches = state.parcels.filter((p) => !p.discovery);
  // 0.4.19+3: Für den Ritt steht der Vorschlag des Einstiegs (suggestRide) oben – vorher lag dort meist eine schon
  // berittene, unbezahlbare Ranch am Fund, und „Buchen“ verschenkte den halben Ritt.
  const rittVorschlag = suggestRide(state, balance, state.cash);
  const cards: PlanCardView[] = karten.map((c) => {
    const ritt = c.handler === 'ritt';
    const targets: PlanTargetView[] =
      c.target === 'ranch'
        ? ranches
            .map((p) => {
              const r = cardReason(state, balance, catalog, c, p.id);
              const terms = leaseTerms(state, balance, p.id);
              const frei = !leaseOf(state, p.id) && !optionOf(state, p.id);
              const f = state.forecasts[p.id];
              const teile = [terms.location.label, frei ? `Pacht ${terms.bonus.toLocaleString('de-DE')} $` : 'vergeben'];
              if (f) teile.push(formatForecast(f));
              const neu = ritt ? rideNews(state, p.id) : true;
              if (ritt && !neu) teile.push('nichts Neues zu sehen');
              const vorschlag = ritt && p.id === rittVorschlag;
              if (vorschlag) teile.unshift('Vorschlag');
              const nähe = balance.lease.locations.findIndex((l) => l.name === terms.location.name);
              const bezahlbar = frei && terms.bonus <= state.cash;
              const level = knowledgeOf(state, p.id).level;
              return { parcelId: p.id, label: parcelLabel(p), level, ok: r === null, ...(r ? { reason: r } : {}), detail: teile.join(' · '), nähe, vorschlag, neu, bezahlbar };
            })
            // Ritt: Vorschlag, dann wo es Neues zu sehen gibt, bezahlbar, unbekannt. Sonst: nah am Fund zuerst (0.4.19+2).
            .sort(
              (a, b) =>
                Number(b.ok) - Number(a.ok) ||
                Number(b.vorschlag) - Number(a.vorschlag) ||
                (ritt ? Number(b.neu) - Number(a.neu) || Number(b.bezahlbar) - Number(a.bezahlbar) || a.level - b.level : 0) ||
                a.nähe - b.nähe ||
                a.label.localeCompare(b.label, 'de'),
            )
            .map(({ nähe: _n, vorschlag: _v, neu: _neu, bezahlbar: _b, ...t }) => t)
        : [];
    const options =
      c.target === 'option'
        ? cardOptions(state, balance, c).map((o) => {
            const r = cardReason(state, balance, catalog, c, o.id);
            return { id: o.id, label: o.label, ok: r === null, ...(r ? { reason: r } : {}) };
          })
        : [];
    const allgemein = cardReason(state, balance, catalog, c);
    const reason =
      allgemein ??
      (c.target === 'ranch' && !targets.some((t) => t.ok) ? (targets[0]?.reason ?? 'Kein passendes Ziel.') : null) ??
      (c.target === 'option' && !options.some((o) => o.ok) ? (options[0]?.reason ?? 'Keine Möglichkeit passt.') : null);
    const h = c.handler ? handlers()[c.handler] : undefined;
    const view: PlanCardView = {
      id: c.id,
      contact: c.contact,
      tab: c.tab,
      appointments: cardAppointments(c, catalog),
      cash: c.handler === 'bohrbericht' ? balance.exploration.reportCost.dry : c.cash,
      strength: c.strength,
      target: c.target,
      timing: c.timing,
      auto: c.auto === true,
      reason,
      targets,
      options,
      detail: h?.detail ? h.detail(state, balance) : null,
      warning: h?.warning ? h.warning(state, balance) : null,
    };
    if (c.event !== undefined) view.event = c.event;
    return view;
  });
  // Kalender: gebuchte Karten, dann wahrgenommene feste Termine ohne Buchung, der Rest belegt Briefe und Besuche.
  const slots: PlanSlot[] = [];
  const gezaehlt = new Set<string>();
  plans.booked.forEach((b, i) => {
    const card = karten.find((c) => c.id === b.cardId) ?? planCards(balance, catalog).find((c) => c.id === b.cardId);
    if (card?.event) gezaehlt.add(card.event);
    for (let k = 0; k < b.appointments; k++) {
      const slot: PlanSlot = { kind: card?.event ? 'termin' : 'plan', cardId: b.cardId, overtime: false };
      if (b.target !== undefined) slot.target = b.target;
      if (!b.done) slot.undo = i;
      slots.push(slot);
    }
  });
  for (const id of state.agenda.done) {
    if (gezaehlt.has(id)) continue;
    const e = eventOf(catalog, id);
    const card = planCards(balance, catalog).find((c) => c.event === id);
    for (let k = 0; k < (e ? (e.choices[0]?.appointments ?? e.appointments) : 0); k++) slots.push({ kind: 'termin', cardId: card?.id ?? id, overtime: false });
  }
  while (slots.length < state.agenda.used) slots.push({ kind: 'post', overtime: false });
  slots.length = Math.min(slots.length, state.agenda.used);
  const gesamt = state.agenda.budget + balance.agenda.maxOvertime;
  while (slots.length < gesamt) slots.push({ kind: 'frei', overtime: false });
  slots.forEach((s, i) => (s.overtime = i >= state.agenda.budget));
  return { slots, cards, report: state.plans?.report ?? [] };
}

/** Prüft balance.yaml plans.cards: Jede Regel gibt es, jeder feste Termin ist ein routine-Ereignis. Fehlertexte. */
export function planRefErrors(balance: Balance, catalog: readonly EventDef[]): string[] {
  const fehler: string[] = [];
  for (const [id, c] of Object.entries(balance.plans.cards)) {
    if (c.handler !== undefined && !handlers()[c.handler]) fehler.push(`plans.cards.${id}: Regel „${c.handler}“ gibt es nicht (${Object.keys(handlers()).join(', ')}).`);
    if (c.event !== undefined && !catalog.some((e) => e.id === c.event && e.routine)) fehler.push(`plans.cards.${id}: „${c.event}“ ist kein fester Termin (routine) in content/events/.`);
  }
  return fehler;
}

/** Termine, die diese Runde in Erkundungs-Karten (Reiter „land“, ohne feste Termine) stecken. */
export function exploreAppointments(state: GameState, balance: Balance): number {
  if (!state.plans || state.plans.round !== state.round) return 0;
  return state.plans.booked.filter((b) => balance.plans.cards[b.cardId]?.tab === 'land' && !balance.plans.cards[b.cardId]?.event).reduce((s, b) => s + b.appointments, 0);
}

/**
 * 0.4.20+34 Telefon (ab Kapitel 2): Zu Beginn einer Runde klingelt es mit deals.phone.chance – eine der
 * Anruf-Karten (call), die gerade ginge, gewichtet nach call. Die Karte liegt dann nur diese Runde auf der Hand.
 */
export function ringPhone(state: GameState, balance: Balance, catalog: readonly EventDef[]): GameState {
  if (chapterOf(state) < 2 || state.finished) return state;
  // 0.4.20+37: Ein fälliger Gefallen geht vor – der Abgeordnete ruft sicher an.
  const schuld = state.deals?.favorDebt;
  if (schuld && state.round >= schuld.due) return { ...state, deals: { ...dealsOf(state), call: { card: 'abgeordneter_gefallen', round: state.round } } };
  const rng = new Rng(seedFromString(`${state.seed}:telefon:${state.round}`));
  if (rng.float() >= balance.deals.phone.chance) return state;
  const moeglich = planCards(balance, catalog).filter((c) => {
    if (c.call === undefined || !requiresMet(state, c.requires) || !contactOpen(state, c)) return false;
    const h = c.handler ? handlers()[c.handler] : undefined;
    if (h?.visible && !h.visible(state, balance)) return false;
    return !h?.lock || h.lock(state, balance) === null;
  });
  if (moeglich.length === 0) return state;
  const summe = moeglich.reduce((s, c) => s + (c.call ?? 0), 0);
  let w = rng.float() * summe;
  const karte = moeglich.find((c) => (w -= c.call ?? 0) < 0) ?? moeglich[moeglich.length - 1];
  return { ...state, deals: { ...dealsOf(state), call: { card: karte.id, round: state.round } } };
}

/** 0.4.20+42: „Vorstellen lassen“ – eine Empfehlung annehmen; kostet network.relation.introAppointments Termine (Überstunden wie beim Buchen). */
export function introduce(state: GameState, balance: Balance, to: string): PlanResult {
  return acceptReferral(state, balance, to, (s, n) => spendAppointments(s, balance, n));
}
