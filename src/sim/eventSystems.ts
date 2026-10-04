// Systemwirkungen der Ereignisse (4.12): Ab Kapitel 2 greifen Antworten in die Systeme
// der Firma ein – Ruf, Rivalen, Schattenbuch, Aufsichtsrat, Personal, Raffinerie,
// Fernleitung, Gesetze, Weltmodell, Familie. Bis 4.12 standen diese Wünsche nur als
// „# TODO-Effekt“ neben einer vorläufigen Wirkung in Geld in content/events/.
//
// Wie Kapitel-1-Wirkungen stehen sie unter `effects:` einer Wahl; eventContent.ts trennt
// sie von den Zahlen (choice.effects) und legt sie als choice.system ab. Diese Datei
// prüft sie (parseSystemEffects, checkSystemEffects) und reicht sie an die Systeme
// weiter (applySystemEffects). Fehlt das System (Kapitel 1, Familienfirma ohne
// Aufsichtsrat, keine Raffinerie …), verpufft die Wirkung, die es braucht – alles
// andere gilt trotzdem. Kein Zufall, keine Rundenzählung außer der Abrechnung
// settleEventSystems (Durchleitungsgebühr, Termine der nächsten Runde).
//
// Zahlen: balance.yaml → eventSystems. Beschreibung für die Schreiber: content/events/README.md.

import type { Balance } from './balance';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import { changeRelation, type DiploRival } from './diplomacyCore';
import type { ContentError } from './eventContent';
import type { TimedKey } from './events';
import type { GameState } from './game';
import { PRODUCTS, type Product } from './refineryBalance';
import { freshBill, type LawDef } from './laws';
import { AGENDAS, type BoardMember } from './stocks';
import { clampLoyalty, memberOf, staffLog, syncStaffMarks, type StaffRole } from './staff';
import { bankRate } from './credit';
import { traces } from './investigation';
import { NEUTRAL_REPUTATION, REPUTATION_AXES, type Reputation } from './reputation';

export { REPUTATION_AXES, reputationOf, reputationWord, validReputation, type Reputation, type ReputationAxis } from './reputation';

// --- Arten -------------------------------------------------------------------------

/** Rivalen, die eine Wirkung treffen kann; crane = der Trust (vor der Nachfolge beide Erben, danach der Sieger). */
// Wörtlich statt aus DIPLO_RIVALS zusammengesetzt: Module mit Ringverweisen dürfen beim Laden keine fremden Werte lesen (Test prüft die Liste).
export const RIVAL_TARGETS = ['margaret', 'pruett', 'bullard', 'thorne', 'delgado', 'crane'] as const;
export type RivalTarget = (typeof RIVAL_TARGETS)[number];
export const RIVAL_FIELDS = ['trust', 'grudge', 'strength'] as const;
export type RivalField = (typeof RIVAL_FIELDS)[number];

/** Personal (4.9): Stelle oder alle Angestellten. */
export const STAFF_TARGETS = ['secretary', 'fixer', 'all'] as const;
export type StaffTarget = (typeof STAFF_TARGETS)[number];
export const STAFF_HIRE_ROLES = ['secretary', 'fixer'] as const;

/** Erben (GDD §12): Werte, die Erziehung und Vorbild prägen. */
export const HEIRS = ['thomas', 'clara'] as const;
export type Heir = (typeof HEIRS)[number];
export const HEIR_VALUES = ['business', 'moral', 'loyalty', 'ambition'] as const;
export type HeirValue = (typeof HEIR_VALUES)[number];
export type HeirValues = Record<HeirValue, number>;

/** Alle Systemwirkungen, die unter `effects:` stehen dürfen. */
export const SYSTEM_EFFECT_KEYS = [
  'reputation',
  'rival',
  'heat',
  'trace',
  'evidence',
  'boardLoyalty',
  'boardMember',
  'control',
  'sharePrice',
  'rivalStake',
  'dividendPressure',
  'staffLoyalty',
  'hire',
  'fire',
  'research',
  'refineryDown',
  'refineryOutput',
  'productYield',
  'productPrice',
  'pipelineDown',
  'pipelineThroughput',
  'transportFee',
  'lawPressure',
  'mood',
  'tension',
  'rating',
  'loan',
  'appointmentsNext',
  'heirValues',
] as const;
export type SystemEffectKey = (typeof SYSTEM_EFFECT_KEYS)[number];

export interface SystemEffects {
  /** Ruf je Achse ±n (−100…100). industryRespect hebt zugleich den Branchen-Respekt der Diplomatie. */
  reputation?: Partial<Reputation>;
  /** Rivalen (4.10): Vertrauen ±n, Groll ±n; strength: Bullards Kasse bzw. Margarets/Pruetts Anteil im Crane-Aufsichtsrat. */
  rival?: Partial<Record<RivalTarget, Partial<Record<RivalField, number>>>>;
  /** Hitze ±n: neue Spur mit dieser Schwere im Schattenbuch (4.11) bzw. so viele Stufen weniger an den offenen Spuren. */
  heat?: number;
  /** Spur mit Schwere und Beschriftung im Schattenbuch (negativ: Spuren verblassen). */
  trace?: { severity: number; label?: string };
  /** Delaneys Beweise ±n Stufen (eventSystems.evidenceStep Punkte je Stufe). */
  evidence?: number;
  /** Treue eines Rats ±n (4.8). Fehlt der Rat im Aufsichtsrat, verpufft es. */
  boardLoyalty?: Record<string, number>;
  /** Ein Gast (eventSystems.boardGuests) oder „thorne“ (sein Mann) zieht in den Aufsichtsrat ein. */
  boardMember?: string;
  /** Kontrolle in Prozentpunkten: Aktien zwischen Jacob und den Kleinaktionären (+ Jacob kauft, − er gibt ab). */
  control?: number;
  /** Stimmung der Börse ±x (× eventSystems.sharePrice); sie zieht von selbst wieder zur 1 zurück. */
  sharePrice?: number;
  /** Rivale kauft (+) oder verkauft (−) Harlan-Aktien, in Prozentpunkten. Nur Thorne kauft über Strohmänner. */
  rivalStake?: Partial<Record<'thorne', number>>;
  /** Druck des Rats auf Dividende: Räte mit Agenda Dividende verlieren n × eventSystems.dividendPressure Treue. */
  dividendPressure?: number;
  /** Loyalität des Personals ±n (4.9). */
  staffLoyalty?: Partial<Record<StaffTarget, number>>;
  /** Stelle besetzen mit dem ersten Bewerber dafür (ohne Vorstellungstermin). */
  hire?: (typeof STAFF_HIRE_ROLES)[number];
  /** Stelle räumen (mit Abfindung, wie im Personalfenster). */
  fire?: (typeof STAFF_HIRE_ROLES)[number];
  /** Forschungspunkte je Technik (4.11, ids aus balance.yaml → research.techs). */
  research?: Record<string, number>;
  /** Raffinerie steht n Runden still (4.6). */
  refineryDown?: number;
  /** Raffinerie-Kapazität ±x, befristet (events.timedRounds). */
  refineryOutput?: number;
  /** Ausbeute je Produkt ±x, befristet. */
  productYield?: Partial<Record<Product, number>>;
  /** Preis je Produkt ±x (Anteil), befristet. */
  productPrice?: Partial<Record<Product, number>>;
  /** Eigene Leitung steht n Runden still (erst eine Fernleitung, sonst die kleine Pipeline). */
  pipelineDown?: number;
  /** Kapazität der eigenen Leitungen ±x, befristet. */
  pipelineThroughput?: number;
  /** Durchleitungsgebühr für fremdes Öl: ±n $ je Runde, solange eine eigene Leitung läuft (bis Kapitelende). */
  transportFee?: number;
  /** Druck auf ein Gesetz (content/laws, id) ±n × eventSystems.lawPressureStep. */
  lawPressure?: Record<string, number>;
  /** Öffentliche Stimmung bzw. Außenspannung im Weltmodell ±n (0–100). */
  mood?: number;
  tension?: number;
  /** Kreditwürdigkeit ±n Stufen (+ = besser), dauerhaft bis Kapitelende. */
  rating?: number;
  /** Die Bank leiht so viel $ zum üblichen Zins – auch ohne freien Rahmen. */
  loan?: number;
  /** Termine in der nächsten Runde ±n. */
  appointmentsNext?: number;
  /** Werte der Erben ±n (−10…10). */
  heirValues?: Partial<Record<Heir, Partial<HeirValues>>>;
}

/** Was Systemwirkungen dauerhaft hinterlassen (state.consequences). Fehlt, solange nichts davon geschah. */
export interface EventConsequences {
  /** Durchleitungsgebühr in $ je Runde (nie unter 0). */
  transportFee: number;
  /** Stufen, um die das Rating besser (+) oder schlechter (−) ist. */
  ratingShift: number;
  /** Termine, die die nächste Runde mehr (+) oder weniger (−) hat. */
  appointmentsNext: number;
  /** Werte der Erben. */
  heirValues: Partial<Record<Heir, HeirValues>>;
}

// --- Spielzahlen ---------------------------------------------------------------------

export interface BoardGuest {
  agenda: (typeof AGENDAS)[number];
  loyalty: number;
}

export interface EventSystemsBalance {
  evidenceStep: number;
  lawPressureStep: number;
  bullardStrength: number;
  successionStep: number;
  sharePrice: number;
  dividendPressure: number;
  heirMax: number;
  /** Gäste, die eine Wirkung in den Aufsichtsrat holen kann (Silas, Vandermeer …). */
  boardGuests: Record<string, BoardGuest>;
  /** Gäste, die ab Kapitelbeginn im Rat sitzen, wenn Harlan Oil eine Aktiengesellschaft ist. */
  boardStartGuests: string[];
  /** Wirkung des Rufs: je Punkt (−100…100). */
  reputation: {
    /** Öffentlichkeit: Verurteilungschance vor Gericht − public × jury. */
    jury: number;
    /** Politik: Chance des politischen Drucks auf Delaney + politics × pressure. */
    pressure: number;
    /** Arbeiter: eigene Förderung × (1 + workers × production). */
    production: number;
    /** Furcht: Rivalen schlagen erst bei Groll ≥ revengeGrudge + industryFear × revenge zurück. */
    revenge: number;
  };
  /** check:events: So viel $ ist ein Punkt der Wirkung wert. */
  relevance: Record<string, number>;
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function zahl(obj: unknown, path: string, min = -Infinity, max = Infinity): number {
  const v = wert(obj, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl`);
  if (v < min || v > max) throw new BalanceError(`balance.yaml: "${path}" muss zwischen ${min} und ${max} liegen`);
  return v;
}

/** Liest den Block eventSystems aus balance.yaml. */
export function parseEventSystemsBalance(raw: unknown): EventSystemsBalance {
  const p = 'eventSystems';
  if (!wert(raw, p) || typeof wert(raw, p) !== 'object') throw new BalanceError('balance.yaml: Block "eventSystems" fehlt');
  const gaeste = wert(raw, `${p}.boardGuests`);
  if (!gaeste || typeof gaeste !== 'object' || Array.isArray(gaeste)) throw new BalanceError(`balance.yaml: "${p}.boardGuests" fehlt`);
  const boardGuests: Record<string, BoardGuest> = {};
  for (const [id, g] of Object.entries(gaeste as Record<string, unknown>)) {
    const agenda = wert(g, 'agenda');
    if (!(AGENDAS as readonly unknown[]).includes(agenda)) throw new BalanceError(`balance.yaml: "${p}.boardGuests.${id}.agenda" muss ${AGENDAS.join(', ')} sein`);
    boardGuests[id] = { agenda: agenda as BoardGuest['agenda'], loyalty: zahl(g, 'loyalty', 0, 100) };
  }
  const start = wert(raw, `${p}.boardStartGuests`) ?? [];
  if (!Array.isArray(start) || !start.every((g) => typeof g === 'string' && boardGuests[g])) throw new BalanceError(`balance.yaml: "${p}.boardStartGuests" muss Gäste aus boardGuests nennen`);
  const rel = wert(raw, `${p}.relevance`);
  if (!rel || typeof rel !== 'object') throw new BalanceError(`balance.yaml: "${p}.relevance" fehlt`);
  const relevance: Record<string, number> = {};
  for (const k of SYSTEM_EFFECT_KEYS) relevance[k] = zahl(rel, k, 0);
  return {
    evidenceStep: zahl(raw, `${p}.evidenceStep`, 0, 100),
    lawPressureStep: zahl(raw, `${p}.lawPressureStep`, 0),
    bullardStrength: zahl(raw, `${p}.bullardStrength`, 0),
    successionStep: zahl(raw, `${p}.successionStep`, 0, 1),
    sharePrice: zahl(raw, `${p}.sharePrice`, 0),
    dividendPressure: zahl(raw, `${p}.dividendPressure`, 0, 100),
    heirMax: zahl(raw, `${p}.heirMax`, 1),
    boardGuests,
    boardStartGuests: start as string[],
    reputation: {
      jury: zahl(raw, `${p}.reputation.jury`, 0, 0.01),
      pressure: zahl(raw, `${p}.reputation.pressure`, 0, 0.01),
      production: zahl(raw, `${p}.reputation.production`, 0, 0.01),
      revenge: zahl(raw, `${p}.reputation.revenge`, 0, 1),
    },
    relevance,
  };
}

// --- Lesen (content/events) ------------------------------------------------------------

const ID = /^[a-z0-9_]+$/;

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function endlich(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Prüft die Systemwirkungen einer Wahl (alle Schlüssel aus SYSTEM_EFFECT_KEYS, die unter
 * `effects:` stehen). fehler(key, text) meldet je Fund; zurück kommt, was gültig ist, oder
 * null, wenn etwas nicht stimmt. Querverweise (Räte, Gesetze, Techniken) prüft checkSystemEffects.
 */
export function parseSystemEffects(raw: Record<string, unknown>, fehler: (key: string, text: string) => void): SystemEffects | null {
  let ok = true;
  const out: SystemEffects = {};
  const falsch = (key: string, text: string) => {
    fehler(key, text);
    ok = false;
  };
  const zahlBei = (key: string): number | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!endlich(v)) {
      falsch(key, `„${key}“ muss eine Zahl sein.`);
      return undefined;
    }
    return v;
  };
  /** Tabelle Name: Zahl, Namen aus erlaubt (oder jede id, wenn erlaubt fehlt). */
  const tabelle = <K extends string>(key: string, erlaubt?: readonly K[]): Partial<Record<K, number>> | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (!istObjekt(v) || Object.keys(v).length === 0) {
      falsch(key, `„${key}“ muss eine Tabelle Name: Zahl sein, z. B. ${key}: { ${erlaubt?.[0] ?? 'name'}: 5 }.`);
      return undefined;
    }
    const t: Partial<Record<K, number>> = {};
    for (const [k, n] of Object.entries(v)) {
      if (erlaubt ? !(erlaubt as readonly string[]).includes(k) : !ID.test(k)) falsch(key, `unbekannter Eintrag „${k}“ in „${key}“${erlaubt ? ` (erlaubt: ${erlaubt.join(', ')})` : ''}.`);
      else if (!endlich(n)) falsch(key, `„${key}.${k}“ muss eine Zahl sein.`);
      else t[k as K] = n;
    }
    return t;
  };
  const wahlAus = <T extends string>(key: string, erlaubt: readonly T[] | null): T | undefined => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !ID.test(v) || (erlaubt && !(erlaubt as readonly string[]).includes(v))) {
      falsch(key, `„${key}“ muss ${erlaubt ? `eins von ${erlaubt.join(', ')}` : 'eine Kennung'} sein.`);
      return undefined;
    }
    return v as T;
  };

  const reputation = tabelle('reputation', REPUTATION_AXES);
  if (reputation) out.reputation = reputation;
  if (raw.rival !== undefined) {
    if (!istObjekt(raw.rival)) falsch('rival', '„rival“ muss eine Tabelle sein, z. B. rival: { bullard: { trust: 10 } }.');
    else {
      const r: SystemEffects['rival'] = {};
      for (const [wer, felder] of Object.entries(raw.rival)) {
        if (!(RIVAL_TARGETS as readonly string[]).includes(wer)) {
          falsch('rival', `unbekannter Rivale „${wer}“ (erlaubt: ${RIVAL_TARGETS.join(', ')}).`);
          continue;
        }
        if (!istObjekt(felder) || Object.keys(felder).length === 0) {
          falsch('rival', `„rival.${wer}“ braucht trust, grudge oder strength.`);
          continue;
        }
        const f: Partial<Record<RivalField, number>> = {};
        for (const [k, n] of Object.entries(felder)) {
          if (!(RIVAL_FIELDS as readonly string[]).includes(k)) falsch('rival', `„rival.${wer}.${k}“ gibt es nicht (erlaubt: ${RIVAL_FIELDS.join(', ')}).`);
          else if (!endlich(n)) falsch('rival', `„rival.${wer}.${k}“ muss eine Zahl sein.`);
          else if (k === 'strength' && !['bullard', 'margaret', 'pruett'].includes(wer)) falsch('rival', `„strength“ gibt es nur für bullard, margaret und pruett.`);
          else f[k as RivalField] = n;
        }
        r[wer as RivalTarget] = f;
      }
      out.rival = r;
    }
  }
  const heat = zahlBei('heat');
  if (heat !== undefined) out.heat = heat;
  if (raw.trace !== undefined) {
    const t = raw.trace;
    if (!istObjekt(t) || !endlich(t.severity) || !Number.isInteger(t.severity) || Math.abs(t.severity) > 5 || (t.label !== undefined && typeof t.label !== 'string')) {
      falsch('trace', '„trace“ braucht severity (ganze Zahl −5…5) und darf label (Text) haben.');
    } else {
      const unbekannt = Object.keys(t).filter((k) => k !== 'severity' && k !== 'label');
      if (unbekannt.length > 0) falsch('trace', `„trace“ kennt ${unbekannt.join(', ')} nicht (erlaubt: severity, label).`);
      out.trace = { severity: t.severity, ...(typeof t.label === 'string' ? { label: t.label } : {}) };
    }
  }
  for (const key of ['evidence', 'control', 'sharePrice', 'dividendPressure', 'refineryOutput', 'pipelineThroughput', 'transportFee', 'mood', 'tension', 'rating', 'appointmentsNext'] as const) {
    const v = zahlBei(key);
    if (v !== undefined) out[key] = v;
  }
  for (const key of ['refineryDown', 'pipelineDown', 'loan'] as const) {
    const v = zahlBei(key);
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 0) falsch(key, `„${key}“ muss eine ganze Zahl ab 0 sein.`);
    else out[key] = v;
  }
  const board = tabelle('boardLoyalty');
  if (board) out.boardLoyalty = board as Record<string, number>;
  const member = wahlAus('boardMember', null);
  if (member) out.boardMember = member;
  const stake = tabelle('rivalStake', ['thorne'] as const);
  if (stake) out.rivalStake = stake;
  const staff = tabelle('staffLoyalty', STAFF_TARGETS);
  if (staff) out.staffLoyalty = staff;
  const hire = wahlAus('hire', STAFF_HIRE_ROLES);
  if (hire) out.hire = hire;
  const fire = wahlAus('fire', STAFF_HIRE_ROLES);
  if (fire) out.fire = fire;
  const research = tabelle('research');
  if (research) out.research = research as Record<string, number>;
  const yieldT = tabelle('productYield', PRODUCTS);
  if (yieldT) out.productYield = yieldT;
  const price = tabelle('productPrice', PRODUCTS);
  if (price) out.productPrice = price;
  const laws = tabelle('lawPressure');
  if (laws) out.lawPressure = laws as Record<string, number>;
  if (raw.heirValues !== undefined) {
    if (!istObjekt(raw.heirValues)) falsch('heirValues', '„heirValues“ muss eine Tabelle sein, z. B. heirValues: { thomas: { loyalty: 1 } }.');
    else {
      const h: SystemEffects['heirValues'] = {};
      for (const [wer, werte] of Object.entries(raw.heirValues)) {
        if (!(HEIRS as readonly string[]).includes(wer)) {
          falsch('heirValues', `unbekannter Erbe „${wer}“ (erlaubt: ${HEIRS.join(', ')}).`);
          continue;
        }
        if (!istObjekt(werte)) {
          falsch('heirValues', `„heirValues.${wer}“ braucht ${HEIR_VALUES.join(', ')}.`);
          continue;
        }
        const w: Partial<HeirValues> = {};
        for (const [k, n] of Object.entries(werte)) {
          if (!(HEIR_VALUES as readonly string[]).includes(k)) falsch('heirValues', `„heirValues.${wer}.${k}“ gibt es nicht (erlaubt: ${HEIR_VALUES.join(', ')}).`);
          else if (!endlich(n)) falsch('heirValues', `„heirValues.${wer}.${k}“ muss eine Zahl sein.`);
          else w[k as HeirValue] = n;
        }
        h[wer as Heir] = w;
      }
      out.heirValues = h;
    }
  }
  return ok ? out : null;
}

/** Hat die Wahl irgendeine Systemwirkung? */
export function hasSystemEffects(sys: SystemEffects | undefined): sys is SystemEffects {
  return sys !== undefined && Object.keys(sys).length > 0;
}

/** Querverweise für die Inhaltsprüfung: Räte, Gesetze und Techniken müssen es geben. */
export interface SystemRefs {
  /** Räte aus content/stocks.yaml (board) und die Gäste aus balance.yaml. */
  boardIds: readonly string[];
  laws: readonly Pick<LawDef, 'id'>[];
  techs: readonly string[];
}

/** Inhaltsprüfung: Verweist eine Systemwirkung auf etwas, das es nicht gibt? */
export function checkSystemEffects(
  file: string,
  events: readonly { id: string; choices: readonly { id: string; system?: SystemEffects }[] }[],
  refs: SystemRefs,
): ContentError[] {
  const errors: ContentError[] = [];
  const rat = new Set([...refs.boardIds, 'thorne']);
  const gesetze = new Set(refs.laws.map((l) => l.id));
  const techniken = new Set(refs.techs);
  for (const e of events) {
    for (const c of e.choices) {
      const s = c.system;
      if (!s) continue;
      const wer = `${e.id}, Wahl „${c.id}“`;
      for (const m of Object.keys(s.boardLoyalty ?? {})) if (!rat.has(m)) errors.push({ file, line: 1, message: `${wer}: Rat „${m}“ in boardLoyalty gibt es nicht (content/stocks.yaml oder eventSystems.boardGuests).` });
      if (s.boardMember && !rat.has(s.boardMember)) errors.push({ file, line: 1, message: `${wer}: boardMember „${s.boardMember}“ gibt es nicht.` });
      for (const g of Object.keys(s.lawPressure ?? {})) if (!gesetze.has(g)) errors.push({ file, line: 1, message: `${wer}: Gesetz „${g}“ in lawPressure gibt es nicht (content/laws/).` });
      for (const t of Object.keys(s.research ?? {})) if (!techniken.has(t)) errors.push({ file, line: 1, message: `${wer}: Technik „${t}“ in research gibt es nicht (balance.yaml → research.techs).` });
    }
  }
  return errors;
}

// --- Wirkung ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rund(v: number, stellen = 2): number {
  const f = 10 ** stellen;
  return Math.round(v * f) / f;
}

export function newConsequences(): EventConsequences {
  return { transportFee: 0, ratingShift: 0, appointmentsNext: 0, heirValues: {} };
}

function folgen(state: GameState): EventConsequences {
  return state.consequences ?? newConsequences();
}

function mitLog(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

/** Befristete Systemwirkung (Raffinerie, Leitungen, Produkte) in events.timed eintragen – dieselbe Quelle ersetzt ihre alte. */
function befristet(state: GameState, key: string, value: number, source: string, rounds: number): GameState {
  if (value === 0) return state;
  const until = state.round + rounds - 1;
  const rest = (state.events.timed ?? []).filter((t) => t.until >= state.round && !(t.source === source && t.key === key));
  return { ...state, events: { ...state.events, timed: [...rest, { key: key as TimedKey, value, until, source }] } };
}

function ruf(state: GameState, delta: Partial<Reputation>): GameState {
  const r = { ...NEUTRAL_REPUTATION, ...(state.reputation ?? {}) };
  for (const axis of REPUTATION_AXES) {
    const d = delta[axis];
    if (d) r[axis] = clamp(rund(r[axis] + d, 1), -100, 100);
  }
  let out: GameState = { ...state, reputation: r };
  // Branchen-Respekt der Diplomatie (0–100) ist dieselbe Größe: wie sehr die Rivalen Jacobs Wort trauen.
  if (delta.industryRespect && out.diplomacy) out = { ...out, diplomacy: { ...out.diplomacy, respect: clamp(rund(out.diplomacy.respect + delta.industryRespect), 0, 100) } };
  return out;
}

/** Wen „crane“ trifft: vor der Entscheidung beide Erben, danach den Sieger (zerschlagen: beide). */
function craneZiele(state: GameState): DiploRival[] {
  const ausgang = state.diplomacy?.succession.outcome;
  return ausgang === 'margaret' ? ['margaret'] : ausgang === 'pruett' ? ['pruett'] : ['margaret', 'pruett'];
}

function rivalen(state: GameState, balance: Balance, wirkung: NonNullable<SystemEffects['rival']>): GameState {
  const b = balance.eventSystems;
  let out = state;
  for (const [ziel, f] of Object.entries(wirkung) as [RivalTarget, Partial<Record<RivalField, number>>][]) {
    const wen: DiploRival[] = ziel === 'crane' ? craneZiele(out) : [ziel];
    if (out.diplomacy && (f.trust || f.grudge)) {
      let d = out.diplomacy;
      for (const r of wen) d = changeRelation(d, r, { trust: f.trust ?? 0, grudge: f.grudge ?? 0 });
      out = { ...out, diplomacy: d };
    }
    if (f.strength) {
      if (ziel === 'bullard') {
        out = { ...out, rival: { ...out.rival, cash: Math.max(0, Math.round(out.rival.cash + f.strength * b.bullardStrength)) } };
      } else if (out.diplomacy && out.diplomacy.succession.outcome === null && (ziel === 'margaret' || ziel === 'pruett')) {
        // Margarets Anteil im Crane-Aufsichtsrat; Stärke für Pruett heißt weniger für Margaret.
        const schritt = f.strength * b.successionStep * (ziel === 'margaret' ? 1 : -1);
        const s = out.diplomacy.succession;
        out = { ...out, diplomacy: { ...out.diplomacy, succession: { ...s, share: clamp(rund(s.share + schritt, 3), 0, 1) } } };
      }
    }
  }
  return out;
}

/** Hitze bzw. Spur ins Schattenbuch (4.11); negativ: die offenen Spuren verblassen um so viele Stufen. */
function spur(state: GameState, balance: Balance, severity: number, label: string): GameState {
  const inv = state.investigation;
  if (!inv || severity === 0) return state;
  if (severity > 0) {
    const id = `ereignis_${inv.extra.length + 1}`;
    return { ...state, investigation: { ...inv, extra: [...inv.extra, { id, kind: 'ereignis', severity: Math.min(5, Math.round(severity)), round: state.round, ...(label ? { label } : {}) }] } };
  }
  // Verblassen: die schwersten noch offenen Spuren zuerst (Zeugen verblassen nie).
  let rest = Math.round(-severity);
  const faded = { ...inv.faded };
  const offen = traces(state, balance)
    .filter((t) => !t.closed && !t.witness && t.current > 0)
    .sort((a, b) => b.current - a.current);
  for (const t of offen) {
    if (rest <= 0) break;
    const weg = Math.min(rest, t.current);
    faded[t.id] = (faded[t.id] ?? 0) + weg;
    rest -= weg;
  }
  return { ...state, investigation: { ...inv, faded } };
}

function aktien(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  const s0 = state.stocks;
  if (!s0 || s0.ousted > 0) return state;
  const b = balance.eventSystems;
  let s = s0;
  const total = s.jacob + s.float + s.blocks.reduce((x, k) => x + k.shares, 0);
  // Kontrolle: Aktien zwischen Jacob und den Kleinaktionären (nur in der AG).
  if (s.public && sys.control && total > 0) {
    const menge = Math.round((sys.control / 100) * total);
    const n = menge > 0 ? Math.min(menge, s.float) : -Math.min(-menge, s.jacob);
    s = { ...s, jacob: s.jacob + n, float: s.float - n };
  }
  // Thorne kauft über Strohmänner (+) oder verkauft (−; erst die jüngsten Blöcke).
  const thorne = sys.rivalStake?.thorne;
  if (s.public && thorne && total > 0) {
    const menge = Math.round((thorne / 100) * total);
    if (menge > 0) {
      const n = Math.min(menge, s.float);
      if (n > 0) s = { ...s, float: s.float - n, blocks: [...s.blocks, { shares: n, straw: (state.round * 7 + s.blocks.length) % 100, since: state.round }] };
    } else {
      let rest = -menge;
      const blocks = [...s.blocks];
      let zurueck = 0;
      while (rest > 0 && blocks.length > 0) {
        const letzter = blocks[blocks.length - 1];
        const weg = Math.min(rest, letzter.shares);
        rest -= weg;
        zurueck += weg;
        if (weg === letzter.shares) blocks.pop();
        else blocks[blocks.length - 1] = { ...letzter, shares: letzter.shares - weg };
      }
      s = { ...s, blocks, float: s.float + zurueck };
    }
  }
  if (sys.sharePrice && s.public) {
    const B = balance.stocks.price;
    s = { ...s, sentiment: clamp(rund(s.sentiment + sys.sharePrice * b.sharePrice, 3), B.sentimentMin, B.sentimentMax) };
  }
  // Ein Gast oder Thornes Mann zieht in den Rat (nur in der AG, solange ein Sitz frei ist oder ein Rat weicht).
  if (sys.boardMember && s.public) {
    const id = sys.boardMember;
    let neu: BoardMember | null = null;
    if (id === 'thorne') {
      const nr = s.board.filter((m) => m.agenda === 'spy').length + 1;
      neu = { id: `thorne-${nr}`, agenda: 'spy', loyalty: 0, since: state.round };
    } else if (!s.board.some((m) => m.id === id) && b.boardGuests[id]) {
      neu = { id, agenda: b.boardGuests[id].agenda, loyalty: b.boardGuests[id].loyalty, since: state.round };
    }
    if (neu) {
      const andere = s.board.filter((m) => m.agenda !== 'spy');
      if (s.board.length < balance.stocks.board.seatsMax || andere.length === 0) s = { ...s, board: [...s.board, neu] };
      else {
        const raus = andere.reduce((a, c) => (c.loyalty < a.loyalty ? c : a));
        s = { ...s, board: s.board.map((m) => (m.id === raus.id ? neu! : m)), demand: s.demand?.member === raus.id ? null : s.demand };
      }
    }
  }
  if (sys.boardLoyalty) {
    const t = sys.boardLoyalty;
    s = { ...s, board: s.board.map((m) => (m.agenda !== 'spy' && t[m.id] ? { ...m, loyalty: clamp(Math.round(m.loyalty + t[m.id]), 0, 100) } : m)) };
  }
  if (sys.dividendPressure) {
    const minus = sys.dividendPressure * b.dividendPressure;
    s = { ...s, board: s.board.map((m) => (m.agenda === 'dividend' ? { ...m, loyalty: clamp(Math.round(m.loyalty - minus), 0, 100) } : m)) };
  }
  return s === s0 ? state : { ...state, stocks: s };
}

function personal(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  if (!state.staff) return state;
  let out = state;
  if (sys.fire && memberOf(out, sys.fire)) {
    const rolle: StaffRole = sys.fire;
    const staff = out.staff!;
    out = staffLog({ ...out, staff: { ...staff, hired: staff.hired.filter((m) => m.role !== rolle), orders: rolle === 'fixer' ? [] : staff.orders } }, `${rolle === 'fixer' ? 'Der Sicherheitschef' : 'Das Vorzimmer'} räumt den Schreibtisch.`);
  }
  if (sys.hire && !memberOf(out, sys.hire)) {
    const staff = out.staff!;
    const p = staff.candidates.find((c) => c.role === sys.hire);
    if (p) {
      const member = { ...p, loyalty: balance.staff.loyalty.start, hiredRound: out.round, good: 0, bad: 0 };
      out = staffLog(
        { ...out, staff: { ...staff, hired: [...staff.hired, member], candidates: staff.candidates.filter((c) => c.role !== p.role), used: [...staff.used, `${p.role}:${p.name}`] } },
        `Jacob stellt eine neue Kraft ein: ${p.role === 'fixer' ? 'Sicherheitschef' : 'Vorzimmer'}.`,
      );
    }
  }
  if (sys.staffLoyalty) {
    const t = sys.staffLoyalty;
    const staff = out.staff!;
    out = { ...out, staff: { ...staff, hired: staff.hired.map((m) => ({ ...m, loyalty: clampLoyalty(m, Math.round(m.loyalty + (t[m.role] ?? 0) + (t.all ?? 0)), balance) })) } };
  }
  return out === state ? state : syncStaffMarks(out, balance);
}

function raffinerie(state: GameState, sys: SystemEffects, source: string, rounds: number): GameState {
  let out = state;
  const r = out.refinery;
  if (r && sys.refineryDown && r.level > 0) out = { ...out, refinery: { ...r, repairLeft: Math.max(r.repairLeft, sys.refineryDown) } };
  if (r && sys.refineryOutput) out = befristet(out, 'refineryOutput', sys.refineryOutput, source, rounds);
  for (const p of PRODUCTS) {
    if (r && sys.productYield?.[p]) out = befristet(out, `productYield:${p}`, sys.productYield[p]!, source, rounds);
    if (r && sys.productPrice?.[p]) out = befristet(out, `productPrice:${p}`, sys.productPrice[p]!, source, rounds);
  }
  return out;
}

function leitung(state: GameState, sys: SystemEffects, source: string, rounds: number): GameState {
  let out = state;
  if (sys.pipelineDown) {
    const bp = out.bigPipelines;
    const fertig = bp?.projects.find((p) => p.status === 'ready');
    if (bp && fertig) {
      out = { ...out, bigPipelines: { ...bp, projects: bp.projects.map((p) => (p.id === fertig.id ? { ...p, status: 'damaged' as const, roundsLeft: Math.max(p.roundsLeft, sys.pipelineDown!) } : p)) } };
    } else if (out.logistics.pipeline === 'ready') {
      out = { ...out, logistics: { ...out.logistics, pipeline: 'damaged', pipelineRounds: sys.pipelineDown } };
    }
  }
  if (sys.pipelineThroughput) out = befristet(out, 'pipelineThroughput', sys.pipelineThroughput, source, rounds);
  return out;
}

function welt(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  const w = state.worldModel;
  if (!w) return state;
  let neu = w;
  if (sys.mood) neu = { ...neu, mood: clamp(neu.mood + sys.mood, 0, 100) };
  if (sys.tension) neu = { ...neu, tension: clamp(neu.tension + sys.tension, 0, 100) };
  if (sys.lawPressure && neu.laws) {
    const bills = { ...neu.laws.bills };
    for (const [id, n] of Object.entries(sys.lawPressure)) {
      // Ein Gesetz aus dem Katalog, das noch nie Druck hatte, beginnt bei null (wie in advanceLaws).
      const bill = bills[id] ?? (balance.laws.some((l) => l.id === id) ? freshBill() : undefined);
      if (bill && bill.stage !== 'passed') bills[id] = { ...bill, pressure: Math.max(0, rund(bill.pressure + n * balance.eventSystems.lawPressureStep)) };
    }
    neu = { ...neu, laws: { ...neu.laws, bills } };
  }
  return neu === w ? state : { ...state, worldModel: neu };
}

function forschung(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  const r = state.research;
  if (!r || !sys.research) return state;
  let progress = { ...r.progress };
  let owned = { ...r.owned };
  let project = r.project;
  let out: GameState = state;
  for (const [id, n] of Object.entries(sys.research)) {
    const tech = balance.research.techs.find((t) => t.id === id);
    if (!tech || owned[id] !== undefined) continue;
    const punkte = Math.max(0, rund((progress[id] ?? 0) + n));
    progress = { ...progress, [id]: punkte };
    if (punkte >= tech.points) {
      owned = { ...owned, [id]: 'eigen' };
      if (project === id) project = null;
      out = mitLog(out, 'Ein Durchbruch in der Werkstatt – die neue Technik ist fertig.');
    }
  }
  return { ...out, research: { ...r, progress, owned, project } };
}

function kredit(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  let out = state;
  if (sys.loan && sys.loan > 0) {
    const pfand = out.wells.find((w) => w.status === 'found' && !out.loans.some((l) => l.collateral === w.parcelId));
    const zins = bankRate(out, balance, pfand !== undefined);
    const id = out.loans.reduce((m, l) => Math.max(m, l.id), 0) + 1;
    out = mitLog(
      { ...out, cash: out.cash + sys.loan, loans: [...out.loans, { id, source: 'bank', principal: sys.loan, rate: zins, takenRound: out.round, collateral: pfand?.parcelId ?? null }] },
      `Die Bank leiht Harlan Oil ${sys.loan.toLocaleString('de-DE')} $.`,
    );
  }
  if (sys.rating) {
    const c = folgen(out);
    out = { ...out, consequences: { ...c, ratingShift: clamp(c.ratingShift + Math.round(sys.rating), -3, 3) } };
  }
  return out;
}

function erben(state: GameState, balance: Balance, sys: SystemEffects): GameState {
  if (!sys.heirValues) return state;
  const c = folgen(state);
  const heirValues = { ...c.heirValues };
  const max = balance.eventSystems.heirMax;
  for (const [wer, werte] of Object.entries(sys.heirValues) as [Heir, Partial<HeirValues>][]) {
    const alt: HeirValues = heirValues[wer] ?? { business: 0, moral: 0, loyalty: 0, ambition: 0 };
    const neu = { ...alt };
    for (const k of HEIR_VALUES) if (werte[k]) neu[k] = clamp(alt[k] + werte[k]!, -max, max);
    heirValues[wer] = neu;
  }
  return { ...state, consequences: { ...c, heirValues } };
}

/**
 * Wendet die Systemwirkungen einer Antwort an (Quelle = Ereignis-id, für befristete Wirkungen
 * und die Beschriftung neuer Spuren). Reihenfolge ohne Bedeutung – jede Wirkung trifft ihr eigenes System.
 */
export function applySystemEffects(state: GameState, sys: SystemEffects | undefined, balance: Balance, source = '', label = ''): GameState {
  if (!hasSystemEffects(sys)) return state;
  const rounds = balance.events.timedRounds;
  let out = state;
  if (sys.reputation) out = ruf(out, sys.reputation);
  if (sys.rival) out = rivalen(out, balance, sys.rival);
  if (sys.heat) out = spur(out, balance, sys.heat, label);
  if (sys.trace) out = spur(out, balance, sys.trace.severity, sys.trace.label ?? label);
  if (sys.evidence && out.investigation) {
    const inv = out.investigation;
    out = { ...out, investigation: { ...inv, evidence: clamp(rund(inv.evidence + sys.evidence * balance.eventSystems.evidenceStep, 1), 0, 100) } };
  }
  out = aktien(out, balance, sys);
  out = personal(out, balance, sys);
  out = raffinerie(out, sys, source, rounds);
  out = leitung(out, sys, source, rounds);
  out = welt(out, balance, sys);
  out = forschung(out, balance, sys);
  out = kredit(out, balance, sys);
  out = erben(out, balance, sys);
  if (sys.transportFee) {
    const c = folgen(out);
    out = { ...out, consequences: { ...c, transportFee: Math.max(0, Math.round(c.transportFee + sys.transportFee)) } };
  }
  if (sys.appointmentsNext) {
    const c = folgen(out);
    out = { ...out, consequences: { ...c, appointmentsNext: c.appointmentsNext + Math.round(sys.appointmentsNext) } };
  }
  return out;
}

/** Kapitelstart (4.12): Die Gäste aus boardStartGuests ziehen in den Rat ein (nur in der AG). */
export function seatStartGuests(state: GameState, balance: Balance): GameState {
  if (!state.stocks?.public) return state;
  return balance.eventSystems.boardStartGuests.reduce((s, id) => aktien(s, balance, { boardMember: id }), state);
}

// --- Abrechnung je Runde ------------------------------------------------------------------

/** Läuft eine eigene Leitung (kleine Pipeline oder Fernleitung), durch die fremdes Öl fließen kann? */
export function ownLineRunning(state: Pick<GameState, 'logistics'> & Partial<Pick<GameState, 'bigPipelines'>>): boolean {
  return state.logistics.pipeline === 'ready' || (state.bigPipelines?.projects ?? []).some((p) => p.status === 'ready');
}

/**
 * Rundenende (4.12 Andockpunkt in endRound, nach dem Personal): Die Durchleitungsgebühr kommt in
 * die Kasse, solange eine eigene Leitung läuft; Termine aus „appointmentsNext“ gelten für die
 * neue Runde (das Personal hat ihre Termine schon gesetzt). Ohne Folgen unverändert.
 */
export function settleEventSystems(state: GameState): GameState {
  const c = state.consequences;
  if (!c) return state;
  let out = state;
  if (c.transportFee > 0 && ownLineRunning(out)) {
    out = mitLog({ ...out, cash: rund(out.cash + c.transportFee) }, `Fremdes Öl in der eigenen Leitung: ${c.transportFee.toLocaleString('de-DE')} $ Durchleitungsgebühr.`);
  }
  if (c.appointmentsNext !== 0) {
    out = { ...out, agenda: { ...out.agenda, budget: Math.max(0, out.agenda.budget + c.appointmentsNext) }, consequences: { ...c, appointmentsNext: 0 } };
  }
  return out;
}

// --- Spürbarkeit (check:events) -------------------------------------------------------------

/** Wie spürbar die Systemwirkungen einer Wahl sind, in $ (Beträge × eventSystems.relevance). */
export function systemImpact(sys: SystemEffects | undefined, balance: Balance): number {
  if (!hasSystemEffects(sys)) return 0;
  const w = balance.eventSystems.relevance;
  const summe = (t: Record<string, number | undefined> | undefined) => Object.values(t ?? {}).reduce<number>((s, v) => s + Math.abs(v ?? 0), 0);
  let x = 0;
  x += summe(sys.reputation) * w.reputation;
  x += Object.values(sys.rival ?? {}).reduce((s, f) => s + summe(f), 0) * w.rival;
  x += Math.abs(sys.heat ?? 0) * w.heat;
  x += Math.abs(sys.trace?.severity ?? 0) * w.trace;
  x += Math.abs(sys.evidence ?? 0) * w.evidence;
  x += summe(sys.boardLoyalty) * w.boardLoyalty;
  x += (sys.boardMember ? 1 : 0) * w.boardMember;
  x += Math.abs(sys.control ?? 0) * w.control;
  x += Math.abs(sys.sharePrice ?? 0) * 100 * w.sharePrice;
  x += summe(sys.rivalStake) * w.rivalStake;
  x += Math.abs(sys.dividendPressure ?? 0) * w.dividendPressure;
  x += summe(sys.staffLoyalty) * w.staffLoyalty;
  x += (sys.hire ? 1 : 0) * w.hire + (sys.fire ? 1 : 0) * w.fire;
  x += summe(sys.research) * w.research;
  x += Math.abs(sys.refineryDown ?? 0) * w.refineryDown;
  x += Math.abs(sys.refineryOutput ?? 0) * 100 * w.refineryOutput;
  x += summe(sys.productYield) * 100 * w.productYield;
  x += summe(sys.productPrice) * 100 * w.productPrice;
  x += Math.abs(sys.pipelineDown ?? 0) * w.pipelineDown;
  x += Math.abs(sys.pipelineThroughput ?? 0) * 100 * w.pipelineThroughput;
  x += Math.abs(sys.transportFee ?? 0) * w.transportFee;
  x += summe(sys.lawPressure) * w.lawPressure;
  x += Math.abs(sys.mood ?? 0) * w.mood + Math.abs(sys.tension ?? 0) * w.tension;
  x += Math.abs(sys.rating ?? 0) * w.rating;
  x += Math.abs(sys.loan ?? 0) * w.loan;
  x += Math.abs(sys.appointmentsNext ?? 0) * w.appointmentsNext;
  x += Object.values(sys.heirValues ?? {}).reduce((s, f) => s + summe(f), 0) * w.heirValues;
  return Math.round(x);
}

// --- Spielstand -----------------------------------------------------------------------------

/** Prüft state.consequences beim Laden (darf fehlen). */
export function validConsequences(v: unknown): boolean {
  if (v === undefined) return true;
  if (!istObjekt(v) || !endlich(v.transportFee) || !endlich(v.ratingShift) || !endlich(v.appointmentsNext) || !istObjekt(v.heirValues)) return false;
  return Object.entries(v.heirValues).every(([k, w]) => (HEIRS as readonly string[]).includes(k) && istObjekt(w) && HEIR_VALUES.every((h) => endlich(w[h])));
}
