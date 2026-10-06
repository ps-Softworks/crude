// Netzwerk (0.4.20+42, Nachtplan Teil 1): Jacob kennt nicht von Anfang an jede Stelle im Adressbuch.
// Einige kennt er (start), weitere lernt er kennen:
//   - Empfehlung: Steht die Beziehung zu einer bekannten Stelle hoch genug (relation.referralAt), empfiehlt sie
//     ihm eine neue (meet: { referral: <stelle> }). Die Empfehlung liegt im Adressbuch; „Vorstellen lassen“ kostet
//     relation.introAppointments Termine.
//   - Ruf und Größe: Bedingungen wie Imperiumswert, fördernde Quellen, Ruf, Kapitel, Merkzeichen – sind alle
//     Bedingungen eines meet-Eintrags erfüllt, meldet sich die Stelle von selbst.
// Jede bekannte Stelle hat eine Beziehung 0–100. Jede gebuchte Karte der Stelle hebt sie (use), Bruch-Merkzeichen
// (breachMarks) senken sie einmalig, ohne Kontakt sinkt sie langsam (idle/decay bis floor). Gute Beziehung macht
// Angebote besser (relationFactor), unter cold ist die Stelle verärgert: ihre Karten gehen erst nach Versöhnung.
//
// Rein und deterministisch, kein Zufall. Ohne state.network (Spielstände vor 0.4.20+42) gilt jede Stelle als
// bekannt mit neutraler Beziehung – alte Partien spielen sich wie bisher.
import type { Balance } from './balance';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { empireValue } from './empire';
import type { GameState } from './game';
import { producingWells } from './production';
import { reputationOf, REPUTATION_AXES, type ReputationAxis } from './reputation';
import { worldInCrisis } from './world';

/** Eine Bedingung, unter der Jacob eine Stelle kennenlernt. Alle gesetzten Felder müssen gelten. */
export interface MeetRule {
  /** Empfehlung dieser Stelle (Beziehung ≥ relation.referralAt) – sie kommt als Angebot, nicht von selbst. */
  referral?: string;
  /** Ab diesem Kapitel. */
  chapter?: number;
  /** Ab dieser Runde im Kapitel (1 = Kapitelbeginn). */
  round?: number;
  /** Imperiumswert mindestens. */
  empire?: number;
  /** So viele fördernde Quellen mindestens. */
  wells?: number;
  /** Ruf auf einer Achse mindestens. */
  reputation?: { axis: ReputationAxis; min: number };
  /** Merkzeichen gesetzt. */
  mark?: string;
  /** Eigene Raffinerie fertig. */
  refinery?: boolean;
  /** Geldquellen: Das Weltmodell zeigt Krieg oder Krise (worldInCrisis: Krieg, Aufstand, Embargo, Crash, Bankpanik). */
  crisis?: boolean;
  /** Geldquellen: Außenspannung im Weltmodell mindestens. */
  tension?: number;
}

export interface ContactRule {
  /** Von Spielbeginn an bekannt. */
  start: boolean;
  /** Wege, die Stelle kennenzulernen (einer genügt). */
  meet: MeetRule[];
  /** Merkzeichen, die die Beziehung je einmal um relation.breach senken (Verrat, Bruch). */
  breachMarks: string[];
}

export interface NetworkBalance {
  relation: {
    /** Beziehung beim Kennenlernen. */
    start: number;
    /** + je gebuchter Karte der Stelle. */
    use: number;
    /** − je Bruch-Merkzeichen. */
    breach: number;
    /** So viele Runden ohne Kontakt, dann sinkt die Beziehung … */
    idle: number;
    /** … je Runde um so viel … */
    decay: number;
    /** … aber nicht unter diesen Boden. */
    floor: number;
    /** Darunter ist die Stelle verärgert. */
    cold: number;
    /** Ab hier empfiehlt die Stelle weiter. */
    referralAt: number;
    /** Preisfaktor: 1 + bonus · (Beziehung − 50) / 50. */
    bonus: number;
    /** Termine für „Vorstellen lassen“. */
    introAppointments: number;
    /** Versöhnen: Kosten in $ und Beziehung danach. */
    reconcileCash: number;
    reconcileTo: number;
    /** Zeitsprung: Beziehung rückt um diesen Anteil Richtung start. */
    jumpFade: number;
  };
  contacts: Record<string, ContactRule>;
}

export interface KnownContact {
  /** Runde des Kennenlernens. */
  since: number;
  relation: number;
  /** Letzte Runde mit Kontakt (gebuchte Karte, Kennenlernen, Versöhnung). */
  last: number;
}

export interface NetworkState {
  known: Record<string, KnownContact>;
  /** Offene Empfehlungen: to = neue Stelle, from = wer empfiehlt. */
  referrals: { to: string; from: string; round: number }[];
  /** Bruch-Merkzeichen, die schon gewirkt haben. */
  breached: string[];
}

export const RELATION_STAGES = ['verärgert', 'kühl', 'neutral', 'gut', 'eng'] as const;
export type RelationStage = (typeof RELATION_STAGES)[number];

// --- balance.yaml ------------------------------------------------------------------

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function zahl(raw: unknown, path: string, min = -Infinity, max = Infinity): number {
  const v = path.split('.').reduce<unknown>((o, k) => (obj(o) ? o[k] : undefined), raw);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

const MEET_KEYS = ['referral', 'chapter', 'round', 'empire', 'wells', 'reputation', 'mark', 'refinery', 'crisis', 'tension'];

/** Liest network aus balance.yaml; Stellen-Kennungen prüft checkNetwork gegen die Karten. */
export function parseNetworkBalance(raw: unknown): NetworkBalance {
  const r = 'network.relation';
  const relation: NetworkBalance['relation'] = {
    start: zahl(raw, `${r}.start`, 0, 100),
    use: zahl(raw, `${r}.use`, 0, 100),
    breach: zahl(raw, `${r}.breach`, 0, 100),
    idle: zahl(raw, `${r}.idle`, 1),
    decay: zahl(raw, `${r}.decay`, 0, 100),
    floor: zahl(raw, `${r}.floor`, 0, 100),
    cold: zahl(raw, `${r}.cold`, 0, 100),
    referralAt: zahl(raw, `${r}.referralAt`, 0, 100),
    bonus: zahl(raw, `${r}.bonus`, 0, 1),
    introAppointments: zahl(raw, `${r}.introAppointments`, 0, 5),
    reconcileCash: zahl(raw, `${r}.reconcileCash`, 0),
    reconcileTo: zahl(raw, `${r}.reconcileTo`, 0, 100),
    jumpFade: zahl(raw, `${r}.jumpFade`, 0, 1),
  };
  const block = obj(raw) && obj(raw.network) ? raw.network.contacts : undefined;
  if (!obj(block)) throw new BalanceError('balance.yaml: "network.contacts" fehlt');
  const contacts: Record<string, ContactRule> = {};
  for (const [id, c] of Object.entries(block)) {
    const wo = `network.contacts.${id}`;
    if (!obj(c)) throw new BalanceError(`balance.yaml: "${wo}" muss ein Block sein`);
    const unbekannt = Object.keys(c).filter((k) => !['start', 'meet', 'breachMarks'].includes(k));
    if (unbekannt.length > 0) throw new BalanceError(`balance.yaml: "${wo}": unbekannt ${unbekannt.join(', ')}`);
    const meet: MeetRule[] = [];
    const roh = c.meet === undefined ? [] : c.meet;
    if (!Array.isArray(roh)) throw new BalanceError(`balance.yaml: "${wo}.meet" muss eine Liste sein`);
    roh.forEach((m, i) => {
      const w = `${wo}.meet[${i}]`;
      if (!obj(m) || Object.keys(m).length === 0) throw new BalanceError(`balance.yaml: "${w}" braucht mindestens eine Bedingung`);
      const falsch = Object.keys(m).filter((k) => !MEET_KEYS.includes(k));
      if (falsch.length > 0) throw new BalanceError(`balance.yaml: "${w}": unbekannt ${falsch.join(', ')}. Erlaubt: ${MEET_KEYS.join(', ')}`);
      const rule: MeetRule = {};
      if (m.referral !== undefined) {
        if (typeof m.referral !== 'string') throw new BalanceError(`balance.yaml: "${w}.referral" muss eine Stelle sein`);
        rule.referral = m.referral;
      }
      for (const k of ['chapter', 'round', 'empire', 'wells', 'tension'] as const) {
        if (m[k] !== undefined) rule[k] = zahl(m, k, 0);
      }
      if (m.mark !== undefined) {
        if (typeof m.mark !== 'string') throw new BalanceError(`balance.yaml: "${w}.mark" muss ein Merkzeichen sein`);
        rule.mark = m.mark;
      }
      if (m.refinery !== undefined) rule.refinery = m.refinery === true;
      if (m.crisis !== undefined) rule.crisis = m.crisis === true;
      if (m.reputation !== undefined) {
        const rep = m.reputation;
        if (!obj(rep) || typeof rep.axis !== 'string' || !(REPUTATION_AXES as readonly string[]).includes(rep.axis)) {
          throw new BalanceError(`balance.yaml: "${w}.reputation" braucht axis (${REPUTATION_AXES.join('/')}) und min`);
        }
        rule.reputation = { axis: rep.axis as ReputationAxis, min: zahl(rep, 'min') };
      }
      meet.push(rule);
    });
    const breachMarks = c.breachMarks === undefined ? [] : c.breachMarks;
    if (!Array.isArray(breachMarks) || breachMarks.some((x) => typeof x !== 'string')) throw new BalanceError(`balance.yaml: "${wo}.breachMarks" muss eine Liste sein`);
    const start = c.start === true;
    if (!start && meet.length === 0) throw new BalanceError(`balance.yaml: "${wo}" braucht start: true oder mindestens einen meet-Eintrag`);
    contacts[id] = { start, meet, breachMarks: breachMarks as string[] };
  }
  return { relation, contacts };
}

/** Passen Netzwerk und Karten zusammen? Jede Karte hat eine bekannte Stelle, Empfehlungen zeigen auf Stellen, keine Schleife ohne Start. */
export function checkNetwork(balance: Pick<Balance, 'network' | 'plans'>): string[] {
  const errors: string[] = [];
  const ids = new Set(Object.keys(balance.network.contacts));
  for (const [card, c] of Object.entries(balance.plans.cards)) {
    if (!ids.has(c.contact)) errors.push(`plans.cards.${card}: Stelle „${c.contact}“ fehlt in network.contacts.`);
  }
  for (const [id, c] of Object.entries(balance.network.contacts)) {
    for (const m of c.meet) {
      if (m.referral !== undefined && !ids.has(m.referral)) errors.push(`network.contacts.${id}: Empfehlung von unbekannter Stelle „${m.referral}“.`);
      if (m.referral === id) errors.push(`network.contacts.${id}: empfiehlt sich selbst.`);
    }
  }
  // Erreichbar: Start-Stellen und alles, was ohne Empfehlung oder über erreichbare Empfehler kommt.
  const erreichbar = new Set([...ids].filter((id) => balance.network.contacts[id].start));
  let neu = true;
  while (neu) {
    neu = false;
    for (const [id, c] of Object.entries(balance.network.contacts)) {
      if (erreichbar.has(id)) continue;
      if (c.meet.some((m) => m.referral === undefined || erreichbar.has(m.referral))) {
        erreichbar.add(id);
        neu = true;
      }
    }
  }
  for (const id of ids) if (!erreichbar.has(id)) errors.push(`network.contacts.${id}: nie erreichbar (nur Empfehlungen von Stellen, die man nie kennenlernt).`);
  return errors;
}

// --- Zustand ---------------------------------------------------------------------------

type NetState = Pick<GameState, 'network'>;

/** Neues Netzwerk: die Start-Stellen. */
export function newNetwork(balance: Pick<Balance, 'network'>, round = 1): NetworkState {
  const known: Record<string, KnownContact> = {};
  for (const [id, c] of Object.entries(balance.network.contacts)) {
    if (c.start) known[id] = { since: round, relation: balance.network.relation.start, last: round };
  }
  return { known, referrals: [], breached: [] };
}

/** Kennt Jacob diese Stelle? Ohne Netzwerk (alter Spielstand) kennt er alle. */
export function isKnown(state: NetState, contact: string): boolean {
  return !state.network || state.network.known[contact] !== undefined;
}

/** Beziehung zu einer Stelle (unbekannt: 0; ohne Netzwerk: neutral 50). */
export function relationOf(state: NetState, contact: string): number {
  if (!state.network) return 50;
  return state.network.known[contact]?.relation ?? 0;
}

/** Stufe für die Anzeige. */
export function relationStage(balance: Pick<Balance, 'network'>, relation: number): RelationStage {
  const r = balance.network.relation;
  if (relation < r.cold) return 'verärgert';
  if (relation < 45) return 'kühl';
  if (relation < 60) return 'neutral';
  if (relation < 80) return 'gut';
  return 'eng';
}

/** Ist die Stelle verärgert (Karten gesperrt bis zur Versöhnung)? */
export function isCold(state: NetState, balance: Pick<Balance, 'network'>, contact: string): boolean {
  return isKnown(state, contact) && relationOf(state, contact) < balance.network.relation.cold;
}

/** Preisfaktor durch die Beziehung: 1 bei 50, bis 1 ± bonus bei 100 bzw. 0. */
export function relationFactor(state: NetState, balance: Pick<Balance, 'network'>, contact: string): number {
  return 1 + (balance.network.relation.bonus * (relationOf(state, contact) - 50)) / 50;
}

function mitNetz(state: GameState, network: NetworkState): GameState {
  return { ...state, network };
}

function clamp(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** Eine gebuchte Karte dieser Stelle: Beziehung + use, Kontakt notiert. */
export function noteContact(state: GameState, balance: Pick<Balance, 'network'>, contact: string): GameState {
  const net = state.network;
  const k = net?.known[contact];
  if (!net || !k) return state;
  return mitNetz(state, { ...net, known: { ...net.known, [contact]: { ...k, relation: clamp(k.relation + balance.network.relation.use), last: state.round } } });
}

/** Beziehung direkt ändern (Bruch, Ereignis). */
export function shiftRelation(state: GameState, contact: string, delta: number): GameState {
  const net = state.network;
  const k = net?.known[contact];
  if (!net || !k) return state;
  return mitNetz(state, { ...net, known: { ...net.known, [contact]: { ...k, relation: clamp(k.relation + delta) } } });
}

/** Ist eine meet-Bedingung (ohne den Empfehlungs-Teil) erfüllt? */
export function meetConditionsHold(state: GameState, balance: Balance, m: MeetRule): boolean {
  const kapitel = chapterOf(state);
  if (m.chapter !== undefined && kapitel < m.chapter) return false;
  if (m.round !== undefined && state.round - (state.chapterStart ?? 1) + 1 < m.round) return false;
  if (m.wells !== undefined && producingWells(state).length < m.wells) return false;
  if (m.mark !== undefined && state.events.marks[m.mark] === undefined) return false;
  if (m.refinery && !(state.refinery && state.refinery.level > 0)) return false;
  if (m.crisis && !worldInCrisis(state.worldModel)) return false;
  if (m.tension !== undefined && (state.worldModel?.tension ?? 0) < m.tension) return false;
  if (m.reputation && reputationOf(state, m.reputation.axis) < m.reputation.min) return false;
  if (m.empire !== undefined && empireValue(state, balance) < m.empire) return false;
  return true;
}

/**
 * Zu Rundenbeginn: Bruch-Merkzeichen wirken, Beziehungen ohne Kontakt sinken, Stellen melden sich
 * (Ruf/Größe) oder werden empfohlen. Neue Stellen und Empfehlungen stehen im Protokoll.
 */
export function advanceNetwork(state: GameState, balance: Balance, names: Record<string, string> = {}): GameState {
  const net = state.network;
  if (!net) return state;
  const r = balance.network.relation;
  const known: Record<string, KnownContact> = { ...net.known };
  const breached = [...net.breached];
  const log: string[] = [];
  const datum = formatDate(state);
  const name = (id: string) => names[id] ?? id;
  for (const [id, c] of Object.entries(balance.network.contacts)) {
    const k = known[id];
    if (!k) continue;
    let rel = k.relation;
    for (const m of c.breachMarks) {
      const key = `${id}:${m}`;
      if (state.events.marks[m] !== undefined && !breached.includes(key)) {
        breached.push(key);
        rel -= r.breach;
      }
    }
    if (state.round - k.last > r.idle && rel > r.floor) rel = Math.max(r.floor, rel - r.decay);
    if (rel !== k.relation) known[id] = { ...k, relation: clamp(rel) };
  }
  const referrals = net.referrals.filter((x) => known[x.to] === undefined);
  for (const [id, c] of Object.entries(balance.network.contacts)) {
    if (known[id]) continue;
    for (const m of c.meet) {
      if (!meetConditionsHold(state, balance, m)) continue;
      if (m.referral === undefined) {
        known[id] = { since: state.round, relation: r.start, last: state.round };
        log.push(`${datum}: Neuer Kontakt – ${name(id)} meldet sich bei Jacob.`);
        break;
      }
      const von = known[m.referral];
      if (von && von.relation >= r.referralAt && !referrals.some((x) => x.to === id)) {
        referrals.push({ to: id, from: m.referral, round: state.round });
        log.push(`${datum}: Empfehlung – ${name(m.referral)} will Jacob mit ${name(id)} bekannt machen.`);
        break;
      }
    }
  }
  return { ...state, network: { known, referrals, breached }, log: log.length > 0 ? [...state.log, ...log] : state.log };
}

export type NetworkResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Empfehlung annehmen: kostet Termine, danach ist die Stelle bekannt (Beziehung start, etwas besser durch den Empfehler). */
export function acceptReferral(state: GameState, balance: Balance, to: string, spend: (s: GameState, n: number) => NetworkResult): NetworkResult {
  const net = state.network;
  const ref = net?.referrals.find((x) => x.to === to);
  if (!net || !ref) return { ok: false, reason: 'Diese Empfehlung gibt es nicht.' };
  if (state.finished) return { ok: false, reason: 'Das Spiel ist vorbei.' };
  const r = balance.network.relation;
  const belegt = spend(state, r.introAppointments);
  if (!belegt.ok) return belegt;
  const s = belegt.state;
  const n = s.network!;
  return {
    ok: true,
    state: {
      ...s,
      network: {
        ...n,
        known: { ...n.known, [to]: { since: s.round, relation: clamp(r.start + r.use), last: s.round } },
        referrals: n.referrals.filter((x) => x.to !== to),
      },
    },
  };
}

/** Eine verärgerte Stelle versöhnen: kostet Geld, Beziehung danach reconcileTo. */
export function reconcile(state: GameState, balance: Balance, contact: string): NetworkResult {
  const r = balance.network.relation;
  if (!isCold(state, balance, contact) || !state.network) return { ok: false, reason: 'Hier gibt es nichts zu versöhnen.' };
  if (state.cash < r.reconcileCash) return { ok: false, reason: `Nicht genug Geld: Versöhnen kostet ${r.reconcileCash} $.` };
  const k = state.network.known[contact];
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - r.reconcileCash,
      network: { ...state.network, known: { ...state.network.known, [contact]: { ...k, relation: r.reconcileTo, last: state.round } } },
    },
  };
}

/** Zeitsprung: Beziehungen rücken Richtung start, offene Empfehlungen verfallen, Kontaktrunden zählen ab Kapitelbeginn. */
export function jumpNetwork(network: NetworkState | undefined, balance: Pick<Balance, 'network'>, round: number): NetworkState | undefined {
  if (!network) return network;
  const r = balance.network.relation;
  const known: Record<string, KnownContact> = {};
  for (const [id, k] of Object.entries(network.known)) {
    known[id] = { ...k, relation: clamp(k.relation + (r.start - k.relation) * r.jumpFade), last: round };
  }
  return { known, referrals: [], breached: network.breached };
}

/** Alle Stellen bekannt, Beziehung neutral (Debug-Vorschau und Tests einzelner Deals). */
export function knowAll(balance: Pick<Balance, 'network'>, round = 1): NetworkState {
  const known: Record<string, KnownContact> = {};
  for (const id of Object.keys(balance.network.contacts)) known[id] = { since: round, relation: balance.network.relation.start, last: round };
  return { known, referrals: [], breached: [] };
}
