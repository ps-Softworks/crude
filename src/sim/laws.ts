// Gesetzeskatalog (4.3, GDD §10): Gesetze haben kein festes Jahr. Jedes Gesetz
// sammelt Druck, solange seine Gründe im Weltmodell erfüllt sind (Weltgrößen,
// Stimmung, Regierung, Sitze im Parlament). Über seiner Schwelle kommt es mit
// etwas Glück als Antrag ins Parlament, wird debattiert und abgestimmt – die
// Fraktionen stimmen nach ihren Sitzen und ihrer Haltung, dazu Zu- und Abschläge
// aus der Lage und ein wenig Zufall. Was durchkommt, gilt ab da und wirkt jede
// Runde auf die Welt (effects.world) und auf Regeln, die spätere Kapitel lesen
// (effects.rules). Die Gesetze selbst stehen als YAML in content/laws/, die Zahlen
// des Ablaufs in balance.yaml (worldModel.laws).
//
// Reine Simulation mit eigenem Zufall (Seed + ":gesetze"): Das Weltmodell würfelt
// mit und ohne Gesetze genau gleich. Die Datei kennt world.ts nicht – das
// Weltmodell reicht ihr den Weltzustand als LawView herein.

import { LineCounter, parseDocument, type Document } from 'yaml';
import type { LawsBalance, Range } from './balance';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { PARTIES, type Party } from './parties';
import type { PoliticsContent } from './politics';
import { Rng, seedFromString, type RngState } from './rng';

/** Weltgrößen, nach denen ein Gesetz fragen kann (Bereich min/max). Sitze je Partei kommen dazu (handel, volksbund, provinz). */
export const LAW_NUMBERS = ['scarcity', 'credit', 'mood', 'tension', 'nationalism', 'tech', 'trustShare'] as const;
export type LawNumber = (typeof LAW_NUMBERS)[number];

/** Wirkung auf die Welt, jede Runde, solange das Gesetz gilt. */
/** 0.4.20+18: supplyShift (Angebot in Weltnachfrage, negativ = weniger Öl → Preis steigt), leverageShift (Verschuldung). */
export const LAW_WORLD_EFFECTS = ['creditShift', 'moodShift', 'tensionShift', 'nationalismShift', 'trustShift', 'supplyShift', 'leverageShift'] as const;
export type LawWorldEffect = (typeof LAW_WORLD_EFFECTS)[number];

/**
 * Regeln für das Spiel (lawRules, Wirkung in lawEffects.ts):
 * incomeTax = Steuersatz auf Gewinne, cartelBan = 1 heißt Absprachen verboten,
 * breakupFrom = ab diesem landesweiten Tankstellen-Marktanteil wird zerschlagen.
 * 0.4.20+18: incomeTaxAdd = Aufschlag auf die Einkommensteuer, depletionAllowance = steuerfreier Anteil des Gewinns,
 * commonCarrier = 1 heißt Transportpflicht für Fernleitungen, quotaShare = erlaubter Anteil der Förderung,
 * quotaFine = Bußgeld $ je Barrel heißes Öl, quotaCatch = Chance je Runde, dass der Inspektor es findet, wageRise = Lohnaufschlag (Personal, Gespanne),
 * creditLimit = Faktor auf den Bankrahmen, drillCostRise = Aufschlag auf Bohrkosten,
 * storageCostRise = Aufschlag auf Lagerkosten, spillFine = Bußgeld $ je ausgelaufenem Barrel,
 * spillFineCap = höchstens dieser Anteil der Kasse je Runde (0.4.20+23: das Bußgeld allein macht niemanden pleite).
 */
export const LAW_RULES = [
  'incomeTax', 'cartelBan', 'breakupFrom',
  'incomeTaxAdd', 'depletionAllowance', 'commonCarrier', 'quotaShare', 'quotaFine', 'quotaCatch', 'wageRise', 'creditLimit', 'drillCostRise', 'storageCostRise', 'spillFine', 'spillFineCap',
] as const;
export type LawRule = (typeof LAW_RULES)[number];

/** Lobby (vorbereitet, ab Kapitel 2): fordern, verhindern, verwässern, verzögern (GDD §10). */
export const LOBBY_ACTIONS = ['demand', 'block', 'weaken', 'delay'] as const;
export type LobbyAction = (typeof LOBBY_ACTIONS)[number];

/** Was die Zeitung über ein Gesetz meldet: Antrag, Debatte, angenommen, abgelehnt. */
export const LAW_NEWS = ['proposed', 'debate', 'passed', 'failed'] as const;
export type LawNewsKind = (typeof LAW_NEWS)[number];

/** Bedingung: alle genannten Punkte müssen stimmen. */
export type LawCondition = Partial<Record<LawNumber | Party, Partial<Range>>> & {
  government?: Party[];
  war?: boolean;
  crash?: boolean;
  /** 0.4.20+18: Diese Gesetze gelten schon (alle). */
  inForce?: string[];
};

/** Ein Grund: Stimmt die Bedingung, kommen add Punkte dazu (Druck je Runde bzw. Zustimmung bei der Abstimmung). */
export interface LawReason {
  when: LawCondition;
  add: number;
}

export interface LawText {
  title: LocalizedText;
  text: LocalizedText;
}

export interface LawDef {
  id: string;
  file: string;
  name: LocalizedText;
  /** Ein Satz: was das Gesetz bewirkt. */
  summary: LocalizedText;
  /** Ab diesem Druck kann der Antrag kommen. */
  threshold: number;
  /** Druckpunkte je Runde aus der Lage der Welt. */
  pressure: LawReason[];
  /** Zustimmung je Fraktion (Anteil ihrer Abgeordneten, die mit Ja stimmen). */
  votes: Record<Party, number>;
  /** Zu- oder Abschläge auf die Zustimmung aus der Lage am Tag der Abstimmung. */
  swing: LawReason[];
  effects: { world: Partial<Record<LawWorldEffect, number>>; rules: Partial<Record<LawRule, number>> };
  /** Vorbereitet: Welche Lobby-Züge es gibt, mit Beschriftung; verwässert ersetzt rules. */
  lobby: Partial<Record<LobbyAction, { label: LocalizedText; rules?: Partial<Record<LawRule, number>> }>>;
  news: Record<LawNewsKind, LawText>;
  /** Entwurf: Texte und Zahlen soll Philipp noch ansehen. */
  draft: boolean;
}

/** Stand eines Gesetzes in dieser Kampagne. */
export interface BillState {
  /** idle = nicht im Parlament, debate = Antrag liegt vor, passed = gilt. */
  stage: 'idle' | 'debate' | 'passed';
  pressure: number;
  /** In der Debatte: Runden bis zur Abstimmung. */
  voteIn: number;
  /** Runden Ruhe nach einer Niederlage. */
  cooldown: number;
  /** Wie oft das Gesetz schon eingebracht wurde. */
  proposals: number;
  /** Weltrunde, in der es beschlossen wurde. */
  passedRound: number | null;
  /** Zustimmung der letzten Abstimmung (0–1). */
  lastVote: number | null;
  /** Lobby (vorbereitet): verwässert und Abschlag auf die Zustimmung in dieser Debatte. */
  weakened: boolean;
  lobbyVote: number;
}

export interface LawNewsItem {
  law: string;
  kind: LawNewsKind;
  /** Abstimmung: Zustimmung 0–1. */
  yes?: number;
  /** Debatte: Wie es aussieht. */
  outlook?: 'likely' | 'close' | 'unlikely';
}

export interface LawsState {
  rng: RngState;
  /** Marktanteil des größten Konzerns im Land (Crane Trust), 0–1. */
  trustShare: number;
  /** Sitze im Parlament seit der letzten Wahl (Summe 1). */
  seats: Record<Party, number>;
  bills: Record<string, BillState>;
  /** Was in der letzten Runde im Parlament geschah – für die Zeitung. */
  news: LawNewsItem[];
}

/** Was das Weltmodell den Gesetzen zeigt: der Zustand nach der Runde. */
export interface LawView {
  round: number;
  scarcity: number;
  credit: number;
  mood: number;
  tension: number;
  nationalism: number;
  tech: number;
  government: Party;
  war: boolean;
  crash: boolean;
}

/** Was in dieser Runde außerdem geschah. */
export interface LawRoundInput {
  /** Crash wirkt (Pleiten, der Trust kauft auf). */
  crashing: boolean;
  /** Riesenfund in dieser Runde. */
  glut: boolean;
  /** Ergebnis einer Wahl in dieser Runde → neue Sitze. */
  election: Record<Party, number> | null;
  /** Lobby-Züge (vorbereitet). */
  lobby: readonly LobbyMove[];
  /** 0.4.20+17: Jacobs Einfluss je Gesetz (−1 verhindern … +1 fordern), schon nach Firmengröße gewichtet. */
  influence?: Readonly<Record<string, number>>;
  /** 0.4.20+17: Verwässerung je Gesetz (0 … 1) – ab lobby.weakenFrom gilt das Gesetz beim Beschluss aufgeweicht. */
  water?: Readonly<Record<string, number>>;
}

export interface LobbyMove {
  law: string;
  action: LobbyAction;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ein Gesetz, das noch nie im Parlament war (auch für Druck aus Ereignissen, 4.12). */
export function freshBill(): BillState {
  return { stage: 'idle', pressure: 0, voteIn: 0, cooldown: 0, proposals: 0, passedRound: null, lastVote: null, weakened: false, lobbyVote: 0 };
}

/**
 * Abstimmungsergebnis in ganzen Prozent, passend zum Ausgang: Angenommen ist ein
 * Gesetz erst über 50 %, also zeigt die Zeitung dann mindestens 51 : 49; ein
 * Gleichstand (50 : 50) ist abgelehnt.
 */
export function votePercent(yes: number, passed: boolean): number {
  const ja = Math.round(yes * 100);
  return passed ? Math.max(51, ja) : Math.min(50, ja);
}

/** Gesetze zu Kampagnenbeginn: nichts beschlossen, eigener Zufall, Marktanteil des Trusts aus dem Seed. */
export function newLaws(seed: string, lb: LawsBalance, parties: Record<Party, number>): LawsState {
  const rng = new Rng(seedFromString(`${seed}:gesetze`));
  const trustShare = lb.trust.start.min + rng.float() * (lb.trust.start.max - lb.trust.start.min);
  return { rng: rng.state, trustShare, seats: { ...parties }, bills: {}, news: [] };
}

/** Ersatzwert für Spielstände ohne Gesetze (vor Format 16): nichts beschlossen, Trust-Anteil in der Mitte (Stand 0.4.3). */
export function neutralLaws(seed: string, parties: Record<Party, number>): LawsState {
  return { rng: seedFromString(`${seed}:gesetze`), trustShare: 0.38, seats: { ...parties }, bills: {}, news: [] };
}

function inRange(value: number, r: Partial<Range>): boolean {
  return (r.min === undefined || value >= r.min) && (r.max === undefined || value <= r.max);
}

/** Stimmt die Bedingung im Weltzustand? */
export function conditionMet(c: LawCondition, view: LawView, laws: Pick<LawsState, 'trustShare' | 'seats'> & { bills?: LawsState['bills'] }): boolean {
  for (const k of LAW_NUMBERS) {
    const r = c[k];
    if (!r) continue;
    const wert = k === 'trustShare' ? laws.trustShare : view[k];
    if (!inRange(wert, r)) return false;
  }
  for (const p of PARTIES) {
    const r = c[p];
    if (r && !inRange(laws.seats[p], r)) return false;
  }
  if (c.government && !c.government.includes(view.government)) return false;
  if (c.war !== undefined && c.war !== view.war) return false;
  if (c.crash !== undefined && c.crash !== view.crash) return false;
  if (c.inForce && !c.inForce.every((id) => laws.bills?.[id]?.stage === 'passed')) return false;
  return true;
}

/** Summe der Punkte aller erfüllten Gründe. */
export function reasonPoints(reasons: readonly LawReason[], view: LawView, laws: Pick<LawsState, 'trustShare' | 'seats'> & { bills?: LawsState['bills'] }): number {
  return reasons.reduce((s, r) => (conditionMet(r.when, view, laws) ? s + r.add : s), 0);
}

/** Zustimmung ohne Zufall: Sitze × Haltung der Fraktionen, dazu die Lage (swing) und die Lobby. */
export function expectedYes(def: LawDef, view: LawView, laws: Pick<LawsState, 'trustShare' | 'seats'> & { bills?: LawsState['bills'] }, lobbyVote = 0): number {
  const fraktionen = PARTIES.reduce((s, p) => s + laws.seats[p] * def.votes[p], 0);
  return clamp(fraktionen + reasonPoints(def.swing, view, laws) + lobbyVote, 0, 1);
}

/**
 * Eine Runde im Parlament. Jede Runde zieht gleich viele Zufallszahlen (1 + 3 je
 * Gesetz im Katalog), damit ein Antrag nicht den Würfel eines anderen Gesetzes verschiebt.
 * trustShift: Wirkung beschlossener Gesetze auf den Marktanteil des Trusts.
 */
export function advanceLaws(input: LawsState, view: LawView, catalog: readonly LawDef[], lb: LawsBalance, round: LawRoundInput, trustShift = 0): LawsState {
  const rng = new Rng(input.rng);
  const seats = round.election ? { ...round.election } : input.seats;
  const t = lb.trust;
  const trustShare = clamp(
    input.trustShare +
      t.revert * (t.base - input.trustShare) +
      t.government[view.government] +
      (t.credit * (view.credit - 50)) / 50 +
      (round.crashing ? t.crash : 0) +
      (round.glut ? t.glut : 0) +
      t.noise * (2 * rng.float() - 1) +
      trustShift,
    t.min,
    t.max,
  );
  const lage = { trustShare, seats, bills: input.bills };
  const bills: Record<string, BillState> = {};
  for (const [id, b] of Object.entries(input.bills)) bills[id] = { ...b };
  // Lobby (vorbereitet): nur Züge, die das Gesetz anbietet.
  for (const move of round.lobby) {
    const def = catalog.find((d) => d.id === move.law);
    if (!def || !def.lobby[move.action]) continue;
    const b = (bills[def.id] ??= freshBill());
    if (move.action === 'demand' && b.stage === 'idle') b.pressure += lb.lobby.demand;
    if (move.action === 'block' && b.stage === 'debate') b.lobbyVote -= lb.lobby.block;
    if (move.action === 'delay' && b.stage === 'debate') b.voteIn += lb.lobby.delay;
    if (move.action === 'weaken' && b.stage === 'debate') b.weakened = true;
  }
  const news: LawNewsItem[] = [];
  let offen = catalog.filter((d) => bills[d.id]?.stage === 'debate').length;
  for (const def of catalog) {
    const u = [rng.float(), rng.float(), rng.float()];
    const b = (bills[def.id] ??= freshBill());
    if (b.stage === 'passed') continue;
    const einfluss = clamp(round.influence?.[def.id] ?? 0, -1, 1);
    b.pressure = Math.max(0, b.pressure * lb.decay + reasonPoints(def.pressure, view, lage) + einfluss * lb.lobby.influencePressure);
    const lobbyStimmen = b.lobbyVote + einfluss * lb.lobby.influenceVote;
    if (b.stage === 'debate') {
      b.voteIn -= 1;
      if (b.voteIn > 0) {
        // Letzte Runde vor der Abstimmung: Die Zeitung berichtet aus der Debatte, wie es aussieht.
        if (b.voteIn === 1) {
          const erwartet = expectedYes(def, view, lage, lobbyStimmen);
          const outlook = Math.abs(erwartet - 0.5) < lb.closeVote ? 'close' : erwartet > 0.5 ? 'likely' : 'unlikely';
          news.push({ law: def.id, kind: 'debate', outlook });
        }
        continue;
      }
      // Abstimmung: Sitze × Haltung, Lage, Lobby und ein wenig Zufall.
      const yes = clamp(expectedYes(def, view, lage, lobbyStimmen) + lb.voteNoise * (2 * u[1] - 1), 0, 1);
      b.lastVote = yes;
      b.lobbyVote = 0;
      offen -= 1;
      if (yes > 0.5) {
        b.stage = 'passed';
        b.passedRound = view.round;
        if ((round.water?.[def.id] ?? 0) >= lb.lobby.weakenFrom) b.weakened = true;
        news.push({ law: def.id, kind: 'passed', yes });
      } else {
        b.stage = 'idle';
        b.weakened = false;
        b.cooldown = lb.cooldown;
        b.pressure *= lb.failPressure;
        news.push({ law: def.id, kind: 'failed', yes });
      }
      continue;
    }
    if (b.cooldown > 0) {
      b.cooldown -= 1;
      continue;
    }
    if (b.pressure >= def.threshold * lb.thresholdScale && offen < lb.maxOpen && u[0] < lb.proposeChance) {
      b.stage = 'debate';
      const r = lb.debateRounds;
      b.voteIn = Math.min(r.max, r.min + Math.floor(u[2] * (r.max - r.min + 1)));
      b.proposals += 1;
      offen += 1;
      news.push({ law: def.id, kind: 'proposed' });
    }
  }
  return { rng: rng.state, trustShare, seats, bills, news };
}

/**
 * 0.4.20+18: Wert einer Gesetzesregel in einem Spielstand (state.worldModel.laws), oder fallback ohne geltendes
 * Gesetz. Für die Systeme, die eine Regel lesen (Bankrahmen, Löhne, Bohrkosten, Lager …).
 */
export function lawRule(state: object, catalog: readonly LawDef[] | undefined, rule: LawRule, fallback = 0): number {
  const s = state as { worldModel?: { laws?: Pick<LawsState, 'bills'> } | null; chapter?: number };
  const laws = s.worldModel?.laws;
  // 0.4.20+19: Kapitel 1 bleibt sanft – die Regeln treffen Jacobs Firma erst ab Kapitel 2 (die Welt spürt sie immer).
  if (!laws || !catalog || (s.chapter ?? 1) < 2) return fallback;
  return lawRules(laws, catalog)[rule] ?? fallback;
}

/** Gilt dieses Gesetz? */
export function lawInForce(laws: Pick<LawsState, 'bills'> | undefined, id: string): boolean {
  return laws?.bills[id]?.stage === 'passed';
}

/** Wirkung aller geltenden Gesetze auf die Welt (je Runde, zusammengezählt). */
export function lawWorldEffects(laws: Pick<LawsState, 'bills'> | undefined, catalog: readonly LawDef[]): Partial<Record<LawWorldEffect, number>> {
  const out: Partial<Record<LawWorldEffect, number>> = {};
  for (const def of catalog) {
    if (!lawInForce(laws, def.id)) continue;
    for (const k of LAW_WORLD_EFFECTS) {
      const v = def.effects.world[k];
      if (v !== undefined) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

/**
 * Regeln aller geltenden Gesetze für das Spiel (incomeTax, cartelBan, breakupFrom).
 * Verwässert (Lobby) ersetzt die Regeln durch die der Lobby-Zeile „weaken“.
 * Kapitel 1 liest sie noch nicht; ab Kapitel 2 rechnen Steuer und Kartellrecht damit.
 */
export function lawRules(laws: Pick<LawsState, 'bills'> | undefined, catalog: readonly LawDef[]): Partial<Record<LawRule, number>> {
  const out: Partial<Record<LawRule, number>> = {};
  for (const def of catalog) {
    const b = laws?.bills[def.id];
    if (b?.stage !== 'passed') continue;
    Object.assign(out, def.effects.rules, b.weakened ? def.lobby.weaken?.rules ?? {} : {});
  }
  return out;
}

// --- Zeitung -----------------------------------------------------------------

const NEWS_PRIORITY: readonly LawNewsKind[] = ['passed', 'failed', 'proposed', 'debate'];

/** Eine Gesetzesmeldung für die Zeitung, mit Abstimmungsergebnis nach der Abstimmung. */
export interface LawReport {
  law: string;
  kind: LawNewsKind;
  title: string;
  text: string;
  /** Abstimmung: Ja/Nein in ganzen Prozent (Summe 100), gerundet passend zum Ausgang (angenommen ≥ 51). */
  vote: { title: string; yesLabel: string; noLabel: string; yes: number; no: number } | null;
}

/** Die wichtigste Meldung aus dem Parlament der letzten Runde (beschlossen vor abgelehnt vor Antrag vor Debatte), sonst null. */
export function lawReport(laws: Pick<LawsState, 'news'> | undefined, catalog: readonly LawDef[], content: PoliticsContent, lang?: Lang): LawReport | null {
  const news = laws?.news ?? [];
  for (const kind of NEWS_PRIORITY) {
    const item = news.find((n) => n.kind === kind && catalog.some((d) => d.id === n.law));
    if (!item) continue;
    const def = catalog.find((d) => d.id === item.law)!;
    const t = content.laws;
    const text = localize(def.news[kind].text, lang);
    const ausblick = item.outlook ? ` ${localize(t.outlook[item.outlook], lang)}` : '';
    const ja = item.yes === undefined ? null : votePercent(item.yes, kind === 'passed');
    return {
      law: def.id,
      kind,
      title: localize(def.news[kind].title, lang),
      text: text + ausblick,
      vote: ja === null ? null : { title: localize(t.voteTitle, lang), yesLabel: localize(t.yes, lang), noLabel: localize(t.no, lang), yes: ja, no: 100 - ja },
    };
  }
  return null;
}

// --- Spielstand ----------------------------------------------------------------

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Prüft für das Laden, ob ein Gesetzeszustand vollständig ist. */
export function isLawsState(value: unknown): value is LawsState {
  if (!istObjekt(value)) return false;
  if (!zahl(value.rng) || !zahl(value.trustShare)) return false;
  const s = value.seats;
  if (!istObjekt(s) || !PARTIES.every((p) => zahl(s[p]))) return false;
  if (!istObjekt(value.bills)) return false;
  for (const b of Object.values(value.bills)) {
    if (!istObjekt(b) || !['idle', 'debate', 'passed'].includes(b.stage as string)) return false;
    if (![b.pressure, b.voteIn, b.cooldown, b.proposals, b.lobbyVote].every(zahl) || typeof b.weakened !== 'boolean') return false;
    if (b.passedRound !== null && !zahl(b.passedRound)) return false;
    if (b.lastVote !== null && !zahl(b.lastVote)) return false;
  }
  return Array.isArray(value.news) && value.news.every((n) => istObjekt(n) && typeof n.law === 'string' && LAW_NEWS.includes(n.kind as LawNewsKind));
}

// --- Inhalte: content/laws/*.yaml ----------------------------------------------

const LAW_KEYS = ['id', 'name', 'summary', 'threshold', 'pressure', 'votes', 'swing', 'effects', 'lobby', 'news', 'draft'];
const CONDITION_KEYS = [...LAW_NUMBERS, ...PARTIES, 'government', 'war', 'crash', 'inForce'];
const ID_MUSTER = /^[a-z0-9_]+$/;

type Pfad = (string | number)[];

/** Liest eine Gesetzesdatei (ein Gesetz je Datei). Bei Fehlern ist law null. */
export function parseLawFile(file: string, text: string): { law: LawDef | null; errors: ContentError[] } {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  if (doc.errors.length > 0) {
    for (const e of doc.errors) errors.push({ file, line: e.linePos?.[0]?.line ?? lineCounter.linePos(e.pos[0]).line, message: `YAML kaputt: ${e.message.split('\n')[0]}` });
    return { law: null, errors };
  }
  function zeile(pfad: Pfad): number {
    for (let n = pfad.length; n >= 0; n--) {
      const node = n === 0 ? doc.contents : (doc as Document).getIn(pfad.slice(0, n), true);
      const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
      if (range) return lineCounter.linePos(range[0]).line;
    }
    return 1;
  }
  const fehler = (pfad: Pfad, message: string) => errors.push({ file, line: zeile(pfad), message });
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler([], 'Eine Gesetzesdatei beschreibt genau ein Gesetz (beginnt mit „id: …“).');
    return { law: null, errors };
  }
  const id = typeof raw.id === 'string' ? raw.id : '?';
  const wer = `Gesetz „${id}“`;
  for (const k of Object.keys(raw)) if (!LAW_KEYS.includes(k)) fehler([k], `${wer}: unbekannter Eintrag „${k}“ (erlaubt: ${LAW_KEYS.join(', ')}).`);
  if (typeof raw.id !== 'string' || !ID_MUSTER.test(raw.id)) fehler(['id'], `${wer}: „id“ fehlt oder enthält andere Zeichen als a–z, 0–9 und _.`);

  function sprachtext(value: unknown, pfad: Pfad): LocalizedText | null {
    const wo = pfad.join('.');
    if (!istObjekt(value)) {
      fehler(pfad, `${wer}: „${wo}“ fehlt oder hat keine Sprachschlüssel (de: …, en: …).`);
      return null;
    }
    let ok = true;
    for (const k of Object.keys(value)) {
      if (!(LANGUAGES as readonly string[]).includes(k)) {
        fehler([...pfad, k], `${wer}: „${wo}“ hat die unbekannte Sprache „${k}“.`);
        ok = false;
      }
    }
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(pfad, `${wer}: „${wo}.de“ fehlt – der deutsche Text ist Pflicht.`);
      ok = false;
    }
    if (value.en === undefined || (value.en !== null && typeof value.en !== 'string')) {
      fehler(pfad, `${wer}: „${wo}.en“ fehlt – darf leer sein (en: ""), muss aber da sein.`);
      ok = false;
    }
    return ok ? { de: value.de as string, en: typeof value.en === 'string' ? value.en : '' } : null;
  }

  function zahlFeld(value: unknown, pfad: Pfad, min = -Infinity, max = Infinity): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      const grenzen = Number.isFinite(min) && Number.isFinite(max) ? ` zwischen ${min} und ${max}` : Number.isFinite(min) ? ` ab ${min}` : '';
      fehler(pfad, `${wer}: „${pfad.join('.')}“ muss eine Zahl${grenzen} sein.`);
      return null;
    }
    return value;
  }

  function bedingung(value: unknown, pfad: Pfad): LawCondition | null {
    if (!istObjekt(value)) {
      fehler(pfad, `${wer}: „${pfad.join('.')}“ braucht eine Bedingung, z. B. { mood: { max: 45 } }.`);
      return null;
    }
    const out: LawCondition = {};
    let ok = true;
    for (const [k, v] of Object.entries(value)) {
      const p = [...pfad, k];
      if (!CONDITION_KEYS.includes(k)) {
        fehler(p, `${wer}: unbekannte Bedingung „${k}“ (erlaubt: ${CONDITION_KEYS.join(', ')}).`);
        ok = false;
      } else if (k === 'government') {
        const liste = typeof v === 'string' ? [v] : v;
        if (!Array.isArray(liste) || liste.length === 0 || !liste.every((x) => (PARTIES as readonly string[]).includes(x as string))) {
          fehler(p, `${wer}: „government“ nennt eine oder mehrere Parteien (${PARTIES.join(', ')}).`);
          ok = false;
        } else out.government = liste as Party[];
      } else if (k === 'inForce') {
        const liste = typeof v === 'string' ? [v] : v;
        if (!Array.isArray(liste) || liste.length === 0 || !liste.every((x) => typeof x === 'string' && x.trim() !== '')) {
          fehler(p, `${wer}: „inForce“ nennt eines oder mehrere Gesetze (ids), die schon gelten.`);
          ok = false;
        } else out.inForce = liste as string[];
      } else if (k === 'war' || k === 'crash') {
        if (typeof v !== 'boolean') {
          fehler(p, `${wer}: „${k}“ ist true oder false.`);
          ok = false;
        } else out[k] = v;
      } else {
        if (!istObjekt(v) || Object.keys(v).length === 0 || Object.keys(v).some((x) => x !== 'min' && x !== 'max') || ![v.min, v.max].every((x) => x === undefined || zahl(x))) {
          fehler(p, `${wer}: „${k}“ braucht einen Bereich wie { min: 0.4 } oder { max: 45 }.`);
          ok = false;
        } else if (v.min !== undefined && v.max !== undefined && (v.min as number) > (v.max as number)) {
          fehler(p, `${wer}: „${k}“ – min liegt über max.`);
          ok = false;
        } else out[k as LawNumber | Party] = { ...(v.min !== undefined ? { min: v.min as number } : {}), ...(v.max !== undefined ? { max: v.max as number } : {}) };
      }
    }
    return ok ? out : null;
  }

  function gruende(value: unknown, pfad: Pfad, pflicht: boolean): LawReason[] | null {
    if (value === undefined || value === null) {
      if (pflicht) fehler(pfad, `${wer}: „${pfad[0]}“ fehlt – mindestens ein Grund aus dem Weltzustand.`);
      return pflicht ? null : [];
    }
    if (!Array.isArray(value) || (pflicht && value.length === 0)) {
      fehler(pfad, `${wer}: „${pfad.join('.')}“ ist eine Liste von Gründen (- when: …, add: …).`);
      return null;
    }
    const out: LawReason[] = [];
    let ok = true;
    value.forEach((g, i) => {
      const p = [...pfad, i];
      if (!istObjekt(g) || Object.keys(g).some((k) => k !== 'when' && k !== 'add')) {
        fehler(p, `${wer}: Jeder Grund hat genau „when“ und „add“.`);
        ok = false;
        return;
      }
      const when = bedingung(g.when, [...p, 'when']);
      const add = zahlFeld(g.add, [...p, 'add']);
      if (when && add !== null) out.push({ when, add });
      else ok = false;
    });
    return ok ? out : null;
  }

  function zahlenMap<K extends string>(value: unknown, pfad: Pfad, erlaubt: readonly K[], min = -Infinity, max = Infinity): Partial<Record<K, number>> | null {
    if (value === undefined || value === null) return {};
    if (!istObjekt(value)) {
      fehler(pfad, `${wer}: „${pfad.join('.')}“ ist eine Liste von Name: Zahl.`);
      return null;
    }
    const out: Partial<Record<K, number>> = {};
    let ok = true;
    for (const [k, v] of Object.entries(value)) {
      if (!(erlaubt as readonly string[]).includes(k)) {
        fehler([...pfad, k], `${wer}: unbekannter Eintrag „${k}“ in „${pfad.join('.')}“ (erlaubt: ${erlaubt.join(', ')}).`);
        ok = false;
        continue;
      }
      const n = zahlFeld(v, [...pfad, k], min, max);
      if (n === null) ok = false;
      else out[k as K] = n;
    }
    return ok ? out : null;
  }

  const name = sprachtext(raw.name, ['name']);
  const summary = sprachtext(raw.summary, ['summary']);
  const threshold = zahlFeld(raw.threshold, ['threshold'], 0);
  const pressure = gruende(raw.pressure, ['pressure'], true);
  const swing = gruende(raw.swing, ['swing'], false);
  const votesRaw = zahlenMap(raw.votes, ['votes'], PARTIES, 0, 1);
  if (votesRaw && !PARTIES.every((p) => votesRaw[p] !== undefined)) fehler(['votes'], `${wer}: „votes“ braucht die Zustimmung aller Fraktionen (${PARTIES.join(', ')}) als Anteil 0–1.`);
  let effects: LawDef['effects'] | null = null;
  if (!istObjekt(raw.effects)) fehler(['effects'], `${wer}: „effects“ fehlt (world und/oder rules).`);
  else {
    for (const k of Object.keys(raw.effects)) if (k !== 'world' && k !== 'rules') fehler(['effects', k], `${wer}: unbekannter Eintrag „${k}“ in „effects“ (erlaubt: world, rules).`);
    const world = zahlenMap(raw.effects.world, ['effects', 'world'], LAW_WORLD_EFFECTS);
    const rules = zahlenMap(raw.effects.rules, ['effects', 'rules'], LAW_RULES, 0, 1);
    if (world && rules) {
      if (Object.keys(world).length + Object.keys(rules).length === 0) fehler(['effects'], `${wer}: Ein Gesetz ohne Wirkung – „effects“ ist leer.`);
      effects = { world, rules };
    }
  }
  const lobby: LawDef['lobby'] = {};
  if (raw.lobby !== undefined && raw.lobby !== null) {
    if (!istObjekt(raw.lobby)) fehler(['lobby'], `${wer}: „lobby“ nennt Züge (${LOBBY_ACTIONS.join(', ')}) mit Beschriftung.`);
    else
      for (const [k, v] of Object.entries(raw.lobby)) {
        if (!(LOBBY_ACTIONS as readonly string[]).includes(k)) {
          fehler(['lobby', k], `${wer}: unbekannter Lobby-Zug „${k}“ (erlaubt: ${LOBBY_ACTIONS.join(', ')}).`);
          continue;
        }
        if (!istObjekt(v) || Object.keys(v).some((x) => x !== 'label' && x !== 'rules') || (v.rules !== undefined && k !== 'weaken')) {
          fehler(['lobby', k], `${wer}: Lobby-Zug „${k}“ hat „label“ (de/en)${k === 'weaken' ? ' und optional „rules“ (verwässerte Regeln)' : ''}.`);
          continue;
        }
        const label = sprachtext(v.label, ['lobby', k, 'label']);
        const rules = zahlenMap(v.rules, ['lobby', k, 'rules'], LAW_RULES, 0, 1);
        if (label && rules) lobby[k as LobbyAction] = Object.keys(rules).length > 0 ? { label, rules } : { label };
      }
  }
  const news: Partial<Record<LawNewsKind, LawText>> = {};
  if (!istObjekt(raw.news)) fehler(['news'], `${wer}: „news“ fehlt (Zeitungsmeldungen ${LAW_NEWS.join(', ')}).`);
  else {
    for (const k of Object.keys(raw.news)) if (!(LAW_NEWS as readonly string[]).includes(k)) fehler(['news', k], `${wer}: unbekannte Meldung „${k}“ (erlaubt: ${LAW_NEWS.join(', ')}).`);
    for (const k of LAW_NEWS) {
      const n = raw.news[k];
      if (!istObjekt(n)) {
        fehler(['news'], `${wer}: Meldung „news.${k}“ fehlt (title, text).`);
        continue;
      }
      const title = sprachtext(n.title, ['news', k, 'title']);
      const body = sprachtext(n.text, ['news', k, 'text']);
      if (title && body) news[k] = { title, text: body };
    }
  }
  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler(['draft'], `${wer}: „draft“ ist true oder false.`);
  if (errors.length > 0 || !name || !summary || threshold === null || !pressure || !swing || !votesRaw || !effects) return { law: null, errors };
  return {
    law: {
      id,
      file,
      name,
      summary,
      threshold,
      pressure,
      votes: votesRaw as Record<Party, number>,
      swing,
      effects,
      lobby,
      news: news as Record<LawNewsKind, LawText>,
      draft: raw.draft === true,
    },
    errors,
  };
}

/** Liest alle Gesetzesdateien; doppelte ids sind ein Fehler. Reihenfolge = Dateiname (bestimmt die Würfelreihenfolge). */
export function parseLawFiles(files: readonly { file: string; text: string }[]): { laws: LawDef[]; errors: ContentError[] } {
  const laws: LawDef[] = [];
  const errors: ContentError[] = [];
  for (const f of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    const r = parseLawFile(f.file, f.text);
    errors.push(...r.errors);
    if (!r.law) continue;
    const doppelt = laws.find((l) => l.id === r.law!.id);
    if (doppelt) errors.push({ file: f.file, line: 1, message: `Gesetz „${r.law.id}“ gibt es schon in ${doppelt.file}.` });
    else laws.push(r.law);
  }
  return { laws, errors };
}

/** Für Spiel und Werkzeuge: Gesetze laden, bei Fehlern anhalten (npm run check:content zeigt vorher, wo es hakt). */
export function loadLawCatalog(files: readonly { file: string; text: string }[]): LawDef[] {
  const { laws, errors } = parseLawFiles(files);
  if (errors.length > 0) throw new Error(errors.map((e) => `${e.file}:${e.line}: ${e.message}`).join('\n'));
  return laws;
}
