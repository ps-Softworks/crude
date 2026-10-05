// Gekoppelte Briefe (Termine als Hauptwerkzeug, Etappe 3). Philipps Kritik: Briefe fühlen sich
// irrelevant an. In Kapitel 1 kommen viele Briefe darum nur noch als Antwort auf das, was Jacob mit
// seinen Terminen plant – er reitet übers Land, spricht bei Thorne vor, streut ein Gerücht, gründet
// eine Förderbremse. Dafür setzt die Simulation am Rundenende Merkzeichen, auf die die Briefe in
// content/events/ mit „marked“ warten:
//
//   Plan-Merkzeichen   gesetzt, wenn es passiert (Runde = letztes Mal), nach letters.window Runden
//                      wieder weg – ein Brief antwortet so nur auf frische Pläne.
//   Lage-Merkzeichen   stehen, solange etwas läuft (Förderbremse, Liefervertrag, Brennan,
//                      Transportgemeinschaft, voller Tank); Runde = seit wann. Danach weg.
//   dauerhaft          thorne_meldet_sich: Thorne schickt seinen Frachtvertrag – nach Jacobs erstem
//                      Besuch, spätestens zur Runde letters.thorneLatest (Rivalenzug 2.8: in jeder Partie).
//
// Umgekehrt liest die Simulation ein paar Antworten in Briefen: Hales Gutachten und gekaufte
// Bohrlisten werden Hinweise auf einer Ranch (in der Runde der Antwort; die Merkzeichen bleiben,
// spätere Kapitel lesen sie), Nora verzeiht, der Liefervertrag endet, abgesprungene Wildcatter
// kommen zurück, der Ruf bei den Wildcattern steigt oder sinkt. Diese wiederholbaren Merkzeichen
// löscht die Simulation, sobald sie gewirkt haben (so kann dieselbe Antwort später wieder wirken).
// Nur Kapitel 1. Zufall: eigener Strang aus dem Seed (`${seed}:brief:…`), der Weltzufall bleibt.
// Zahlen: balance.yaml letters.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { addClues, knowledgeOf, rollClue, type Clue } from './exploration';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { leaseOf, optionOf, parcelLabel } from './lease';
import { LOGISTICS_MARKS } from './logistics';
import type { EventDef } from './events';
import { FREIGHT_SIM_MARKS } from './freight';
import { PRICING_SIM_MARKS, shiftStanding } from './pricing';
import { Rng, seedFromString } from './rng';
import { RIVAL_MARKS } from './trust';

/** Merkzeichen, die die Simulation aus Jacobs Plänen setzt. */
export const LETTER_MARKS = {
  // Plan-Merkzeichen (frisch, letters.window Runden)
  /** Jacob hat eine Erkundungs-Karte gespielt (Ritt, Farmer, Geologe, Bohrbericht, Tagebuch, Rute). */
  explored: 'erkundet',
  /** Jacob hat bei Thorne vorgesprochen … */
  thorneVisit: 'thorne_besucht',
  /** … und ist abgeblitzt (kein Zugeständnis). */
  thorneRebuff: 'thorne_abfuhr',
  /** Jacob hat ein Gerücht gestreut. */
  rumour: 'geruecht_gestreut',
  /** Jacob hat die Förderbremse mit Organisatoren-Klausel gegründet (drosselt selbst nur halb). */
  organizer: 'kartell_klausel',
  /** Mitglieder sind aus der Transportgemeinschaft abgesprungen. */
  poolLeft: 'gemeinschaft_abgesprungen',
  /** Jacob hat dem Händler weniger geliefert, als der Vertrag verlangt. */
  shortfall: 'liefervertrag_fehlmenge',
  // Lage-Merkzeichen (solange es gilt)
  cartelRunning: 'foerderbremse_laeuft',
  contractRunning: 'liefervertrag_laeuft',
  brennanRunning: 'brennan_faehrt',
  poolRunning: 'gemeinschaft_laeuft',
  /** Nach den Verkäufen steht noch viel Öl im Tank (letters.holdStock). */
  holding: 'oel_zurueckgehalten',
  // Dauerhaft (bleibt stehen)
  /** Thorne meldet sich mit seinem Frachtvertrag: nach Jacobs erstem Besuch, spätestens zu letters.thorneLatest. */
  thorneMet: 'thorne_meldet_sich',
} as const;

const PULSE: readonly string[] = [
  LETTER_MARKS.explored,
  LETTER_MARKS.thorneVisit,
  LETTER_MARKS.thorneRebuff,
  LETTER_MARKS.rumour,
  LETTER_MARKS.organizer,
  LETTER_MARKS.poolLeft,
  LETTER_MARKS.shortfall,
];

/** Merkzeichen, die die Simulation selbst setzt (für die Inhaltsprüfung). */
export const LETTER_SIM_MARKS: readonly string[] = Object.values(LETTER_MARKS);

/** Antworten in Briefen, die die Simulation liest. */
export const LETTER_ACTIONS = {
  /** Hales Gutachten gekauft (dok_hale_gutachten) … */
  haleBought: 'hale_gutachten_gekauft',
  /** … und es war gefälscht: Der Hinweis führt auf eine trockene Ranch. */
  haleForged: 'hale_gutachten_falsch',
  /** Bohrliste eines Bohrmeisters gekauft (geruecht_fund, kann wiederkommen). */
  reportBought: 'bohrliste_gekauft',
  /** Pikes Bohrliste gekauft (dok_pike_urkunde; Name aus der Zeit, als Pike eine Pacht verkaufte) … */
  pikeBought: 'pike_pacht_gekauft',
  /** … und sie war gefälscht: wertlos. Kapitel 3 (Daniels Akte) liest das Merkzeichen weiter. */
  pikeForged: 'pike_urkunde_falsch',
  /** Nora verzeiht das aufgeflogene Gerücht: Sie warnt im Courier wieder vor. */
  noraReconciled: 'nora_versoehnt',
  /** Liefervertrag mit dem Händler gegen Abfindung aufgelöst. */
  contractEnded: 'liefervertrag_aufgeloest',
  /** Die Abgesprungenen kommen in die Transportgemeinschaft zurück. */
  poolBack: 'gemeinschaft_zurueck',
  /** Ruf bei den Wildcattern steigt bzw. sinkt um letters.standing. */
  helped: 'wildcatter_geholfen',
  snubbed: 'wildcatter_verprellt',
  /** „Exklusiv jetzt billiger“ unterschrieben: Strafe letters.cheapExclusivePenalty (bleibt stehen, transport.ts liest es). */
  cheapExclusive: 'thorne_exklusiv_billig',
} as const;

/** Antworten, die die Simulation liest (für npm run check:events: keine folgenlosen Merkzeichen). */
export const LETTER_READ_MARKS: readonly string[] = Object.values(LETTER_ACTIONS);

/**
 * Merkzeichen aus Jacobs Plänen – für Messung und Tests („Brief hängt an einem Plan“): die Plan- und
 * Lage-Merkzeichen von hier (ohne thorne_meldet_sich – Thorne meldet sich spätestens von selbst),
 * alles, was die Preis- und Transport-Aktionen setzen, und die vermessene Pipeline-Route.
 */
export function planMarks(): string[] {
  // Als Funktion, nicht als Konstante: letters.ts und freight.ts importieren sich über transport.ts gegenseitig.
  return [
    ...LETTER_SIM_MARKS.filter((m) => m !== LETTER_MARKS.thorneMet),
    ...PRICING_SIM_MARKS,
    ...FREIGHT_SIM_MARKS,
    // Jacob hat eine Pipeline-Route vermessen lassen (Frachtfenster): Die Landbesitzer schreiben.
    LOGISTICS_MARKS.surveyed,
  ];
}

/**
 * Welche Ereignisse hängen an Jacobs Plänen? Direkt (marked enthält ein Plan-Merkzeichen) oder über eine
 * Kette: Ein Merkzeichen, das nur Antworten gekoppelter Ereignisse setzen, zählt mit (Nora will ein
 * Gespräch → Noras Artikel).
 */
export function coupledEvents(catalog: readonly EventDef[], plan: Iterable<string> = planMarks()): Set<string> {
  const marken = new Set(plan);
  const setzer = new Map<string, Set<string>>();
  for (const e of catalog) for (const c of e.choices) for (const m of [...c.marks, ...(c.marksIfForged ?? [])]) setzer.set(m, (setzer.get(m) ?? new Set()).add(e.id));
  const gekoppelt = new Set<string>();
  for (let neu = true; neu; ) {
    neu = false;
    for (const e of catalog) {
      if (gekoppelt.has(e.id)) continue;
      const nur = (m: string) => marken.has(m) || (setzer.has(m) && [...setzer.get(m)!].every((id) => gekoppelt.has(id)));
      if (e.marked.some(nur)) {
        gekoppelt.add(e.id);
        neu = true;
      }
    }
  }
  return gekoppelt;
}

function hasMark(state: Pick<GameState, 'events'>, mark: string): boolean {
  return state.events.marks[mark] !== undefined;
}

function withMarks(state: GameState, marks: Record<string, number>): GameState {
  return { ...state, events: { ...state.events, marks } };
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

/**
 * Eine freie Ranch für einen Brief-Hinweis: weniger bekannt als maxLevel, nicht entdeckt, nicht
 * gepachtet – am liebsten eine, die Jacob schon beritten hat (dorthin schaut er ja). dry: nur
 * trockene (gefälschtes Gutachten). Fest aus dem Seed, Runde und Art.
 */
export function letterTarget(state: GameState, maxLevel: number, tag: string, dry?: boolean): Parcel | null {
  const frei = state.parcels.filter(
    (p) =>
      !p.discovery &&
      !leaseOf(state, p.id) &&
      !optionOf(state, p.id) &&
      knowledgeOf(state, p.id).level < maxLevel &&
      (dry === undefined || (p.geology === 'dry') === dry),
  );
  if (frei.length === 0) return null;
  const beritten = frei.filter((p) => knowledgeOf(state, p.id).level >= 1);
  const auswahl = [...(beritten.length > 0 ? beritten : frei)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Rng(seedFromString(`${state.seed}:brief:${tag}:${state.round}`)).pick(auswahl);
}

/** Hales Gutachten: echt ein Hinweis wie von Hale kartiert, gefälscht ein „gesehen“ auf einer trockenen Ranch. */
function haleSurvey(state: GameState, balance: Balance, forged: boolean): GameState {
  const hale = balance.exploration.geologists.hale;
  const ziel = (forged ? letterTarget(state, 2, 'hale', true) : null) ?? letterTarget(state, 2, 'hale');
  if (!ziel) return log(state, 'Hales Gutachten beschreibt eine Ranch, die längst vergeben ist.');
  const clue: Clue = forged
    ? { kind: 'kartierung', source: 'bericht', round: state.round, seen: true, accuracy: hale.accuracy, geologist: 'hale' }
    : rollClue(state, balance, ziel, 'kartierung', 'bericht', { accuracy: hale.accuracy, geologist: 'hale' });
  if (hale.bias !== undefined) clue.bias = hale.bias;
  const n = addClues(state, balance, ziel.id, [clue]);
  return log(n, `Hales Gutachten gehört zur Ranch ${parcelLabel(ziel)}: ${clue.seen ? '„Ölsand in geringer Tiefe“' : '„kein Ölsand zu erwarten“'}.`);
}

/** Eine gekaufte Bohrliste: Bohrbericht (Stufe 3) auf einer Ranch, fest aus dem Seed. */
function boughtReport(state: GameState, balance: Balance, tag: string, wer: string): GameState {
  const ziel = letterTarget(state, 3, tag);
  if (!ziel) return log(state, `${wer} Bohrliste gehört zu einer Ranch, die längst vergeben ist.`);
  const clue = rollClue(state, balance, ziel, 'bohrbericht', 'bericht');
  const n = addClues(state, balance, ziel.id, [clue]);
  return log(n, `${wer} Bohrliste gehört zur Ranch ${parcelLabel(ziel)}: ${clue.seen ? 'Ölsand in der Probebohrung' : 'nur Salzwasser und Schiefer'}.`);
}

/**
 * Rundenende (nach dem Planungsbrett): Plan- und Lage-Merkzeichen setzen bzw. löschen, dann die
 * Antworten aus Briefen wirken lassen. vorher = Zustand vor dem Abrechnen des Bretts (dort stehen
 * die gebuchten Karten der Runde), state = danach.
 */
export function settleLetters(vorher: GameState, state: GameState, balance: Balance): GameState {
  if (chapterOf(state) !== 1) return state;
  const L = balance.letters;
  const r = state.round;
  const marks = { ...state.events.marks };
  const frisch = (m: string) => {
    marks[m] = r;
  };
  const lage = (m: string, aktiv: boolean) => {
    if (aktiv && marks[m] === undefined) marks[m] = r;
    if (!aktiv) delete marks[m];
  };

  // Plan-Merkzeichen: was Jacob diese Runde getan hat.
  const gebucht = vorher.plans?.round === vorher.round ? vorher.plans.booked : [];
  if (gebucht.some((b) => balance.plans.cards[b.cardId]?.tab === 'land' && !balance.plans.cards[b.cardId]?.event)) frisch(LETTER_MARKS.explored);
  const fv = vorher.freight;
  const fn = state.freight;
  if (fv && fn && fn.visits > fv.visits) {
    frisch(LETTER_MARKS.thorneVisit);
    if (fn.concessions.length === fv.concessions.length) frisch(LETTER_MARKS.thorneRebuff);
  }
  const pv = vorher.pricing;
  const pn = state.pricing;
  if (pv && pn && pn.rumours.lastRound === vorher.round && pv.rumours.lastRound !== vorher.round) frisch(LETTER_MARKS.rumour);
  if (pn?.cartel && pn.cartel.since === vorher.round && pn.cartel.organizer) frisch(LETTER_MARKS.organizer);
  let n: GameState = state;
  if (fv && fn && fv.pool.length > 0) {
    const weg = fv.pool.filter((m) => !fn.pool.includes(m));
    if (weg.length > 0) {
      frisch(LETTER_MARKS.poolLeft);
      n = { ...n, freight: { ...fn, poolLeft: weg } };
    }
  }
  const c = pv?.contract;
  if (c && c.buyer === 'haendler' && vorher.round >= c.from && vorher.round <= c.until && vorher.logistics.traderSold < c.qty) frisch(LETTER_MARKS.shortfall);

  // Thorne meldet sich nach dem ersten Besuch – spätestens so, dass sein Brief in Runde letters.thorneLatest kommen kann.
  if (marks[LETTER_MARKS.thorneMet] === undefined && (marks[LETTER_MARKS.thorneVisit] === r || r + 1 >= L.thorneLatest)) marks[LETTER_MARKS.thorneMet] = r;

  // Lage-Merkzeichen: was gerade läuft.
  lage(LETTER_MARKS.cartelRunning, !!pn?.cartel);
  lage(LETTER_MARKS.contractRunning, pn?.contract?.buyer === 'haendler');
  lage(LETTER_MARKS.brennanRunning, !!fn?.brennan && fn.brennan.until > r);
  lage(LETTER_MARKS.poolRunning, (fn?.pool.length ?? 0) > 0);
  lage(LETTER_MARKS.holding, state.oilStock >= L.holdStock);

  // Alte Plan-Merkzeichen räumen: Ein Brief antwortet nur auf frische Pläne.
  for (const m of PULSE) if (marks[m] !== undefined && r - marks[m] >= L.window) delete marks[m];

  // Antworten aus Briefen.
  const A = LETTER_ACTIONS;
  const erledigt: string[] = [];
  n = withMarks(n, marks);
  // Einmalige Briefe: wirken in der Runde der Antwort, die Merkzeichen bleiben stehen.
  const jetzt = (m: string) => n.events.marks[m] === r;
  if (jetzt(A.haleBought)) n = haleSurvey(n, balance, hasMark(n, A.haleForged));
  if (jetzt(A.pikeBought)) {
    n = hasMark(n, A.pikeForged) ? log(n, 'Ruth hält Pikes Bohrliste gegen das Bohrregister: erfunden, Zeile für Zeile. Die 300 $ sind fort.') : boughtReport(n, balance, 'pike', 'Pikes');
  }
  if (hasMark(n, A.reportBought)) {
    n = boughtReport(n, balance, 'bohrmeister', 'Die');
    erledigt.push(A.reportBought);
  }
  if (hasMark(n, A.noraReconciled)) {
    if (n.pricing) n = { ...n, pricing: { ...n.pricing, noraBurned: false } };
    erledigt.push(A.noraReconciled);
  }
  if (hasMark(n, A.contractEnded)) {
    const k = n.pricing?.contract;
    if (n.pricing && k && k.buyer === 'haendler') {
      n = log({ ...n, pricing: { ...n.pricing, contract: null, contractResults: [...n.pricing.contractResults, k.gain] } }, 'Der Liefervertrag mit dem Händler ist aufgelöst.');
    }
    erledigt.push(A.contractEnded);
  }
  if (hasMark(n, A.poolBack)) {
    const f = n.freight;
    const zurueck = f?.poolLeft ?? [];
    if (f && zurueck.length > 0) {
      n = log({ ...n, freight: { ...f, pool: [...f.pool, ...zurueck.filter((m) => !f.pool.includes(m))], poolLeft: [], poolHeldRound: r } }, `${zurueck.join(', ')} ${zurueck.length === 1 ? 'verlädt' : 'verladen'} wieder mit Jacob.`);
    }
    erledigt.push(A.poolBack);
  }
  if (hasMark(n, A.helped)) {
    n = shiftStanding(n, balance, L.standing);
    erledigt.push(A.helped);
  }
  if (hasMark(n, A.snubbed)) {
    n = shiftStanding(n, balance, -L.standing);
    erledigt.push(A.snubbed);
  }
  // „Exklusiv jetzt billiger“: Der neue Vertrag beginnt jetzt (Merkzeichen behalten sonst die Runde, in der sie zuerst kamen).
  const neu = { ...n.events.marks };
  if (neu[A.cheapExclusive] === r) {
    neu[RIVAL_MARKS.thorneContract] = r;
    neu[RIVAL_MARKS.thorneExclusive] = r;
  }
  for (const m of erledigt) delete neu[m];
  return withMarks(n, neu);
}

/** Läuft der billigere Exklusivvertrag aus dem Brief? Dann gilt seine Strafe (transport.ts). */
export function cheapExclusive(state: Partial<Pick<GameState, 'events'>>): boolean {
  return state.events?.marks?.[LETTER_ACTIONS.cheapExclusive] !== undefined;
}
