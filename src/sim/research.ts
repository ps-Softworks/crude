// Forschung bis Technikstufe II (4.11, GDD §5 „Informationsquellen“/„Bohren“,
// §6 „Raffinerie“, §7.1 „Technikstand“).
//
// Ab Kapitel 2 (research.fromChapter) kann Jacob eine Versuchswerkstatt einrichten
// (research.workshop $, einmalig) und darin je Runde an EINER Technik forschen.
// Er wählt eine Förderstufe (research.funding: Kosten und Fortschritt je Runde);
// der Fortschritt schwankt mit dem Zufall (research.luck). Ist die nötige Punktzahl
// (points) erreicht, gehört Jacob die Technik.
//
// Patente (GDD §5): Die Technikstufen entstehen durch die Forschung aller Firmen im
// Weltmodell. Solange der Technikstand der Welt (4.1, world.tech) unter worldAt
// der Technik liegt, hat sie noch niemand: Wer sie dann erforscht, hält das Patent.
// Ist die Welt so weit, verkaufen andere Lizenzen – Jacob kann eine kaufen (license $)
// statt selbst zu forschen. Hält Jacob ein Patent und ist die Welt so weit, zahlen
// die Rivalen Lizenzgebühren (patentIncome je Runde) – es sei denn, Jacob verweigert
// sie (refused): Dann haben die Rivalen die Technik nicht (rivalsHaveTech).
//
// Wirkung: Dieses Modul schaltet frei und liefert Kennzahlen (hasTech, techTier,
// techEffect). Bohrzeit und Bohrkosten wirken schon (drilling.ts über techDrillCost/
// techDrillRounds, ab Kapitel 2). Bohrtiefe, Raffinerie (4.6) und Tanklaster lesen sie
// noch nicht – das ist der Andockpunkt; in Kapitel 1 ändert sich nichts.
//
// Rein und deterministisch: eigener Zufall (Seed + ":forschung").

import { parseDocument } from 'yaml';
import type { Balance, Range } from './balance';
import { BalanceError } from './balance';
import { formatDate } from './calendar';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { LANGUAGES, type LocalizedText } from './i18n';
import { Rng, seedFromString, type RngState } from './rng';
import { chapterOf, worldPort, type WorldPort } from './worldPort';

// --- Spielzahlen (balance.yaml, Abschnitt research) --------------------------------

/** Bereiche, in denen eine Technik wirkt. */
export const TECH_DOMAINS = ['bohren', 'raffinerie', 'transport'] as const;
export type TechDomain = (typeof TECH_DOMAINS)[number];

/**
 * Kennzahlen, die eine Technik anderen Systemen liefert (Summe über alle eigenen Techniken):
 *   drillTime      Anteil Bohrzeit (−0,25 = ein Viertel schneller)
 *   drillCost      Anteil Bohrkosten (−0,1 = 10 % billiger)
 *   depth          zusätzliche erreichbare Tiefe in m
 *   gasolineYield  zusätzliche Benzinausbeute der Raffinerie (0,2 = von 20 % auf 40 %)
 *   trucks         1 = Tanklaster verfügbar
 */
export const TECH_EFFECT_KEYS = ['drillTime', 'drillCost', 'depth', 'gasolineYield', 'trucks'] as const;
export type TechEffectKey = (typeof TECH_EFFECT_KEYS)[number];

export interface TechBalance {
  id: string;
  /** Technikstufe I–V (GDD). */
  tier: number;
  domain: TechDomain;
  /** Forschungspunkte bis zur Erfindung. */
  points: number;
  /** Diese Techniken braucht es vorher. */
  requires: string[];
  /** Ab diesem Technikstand der Welt (0–100) haben andere sie schon: Lizenz statt Patent. */
  worldAt: number;
  /** Preis einer Lizenz in $. */
  license: number;
  effects: Partial<Record<TechEffectKey, number>>;
}

export interface FundingLevel {
  cost: number;
  points: number;
}

export interface ResearchBalance {
  fromChapter: number;
  /** Versuchswerkstatt einrichten (einmalig, $). */
  workshop: number;
  funding: FundingLevel[];
  luck: Range;
  /** Lizenzgebühren der Rivalen je Runde und Patent, sobald die Welt so weit ist. */
  patentIncome: number;
  /** Ersatz, solange es kein Weltmodell gibt (Technikstand). */
  worldFallback: WorldPort;
  techs: TechBalance[];
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

function ganz(obj: unknown, path: string, min: number, max = Infinity): number {
  const v = zahl(obj, path, min, max);
  if (!Number.isInteger(v)) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl sein`);
  return v;
}

const KENNUNG = /^[a-z0-9_]+$/;

/** Liest den Abschnitt research aus balance.yaml (4.11). */
export function parseResearchBalance(raw: unknown): ResearchBalance {
  const p = 'research';
  if (!wert(raw, p) || typeof wert(raw, p) !== 'object') throw new BalanceError('balance.yaml: Abschnitt "research" fehlt');
  const fundingRaw = wert(raw, `${p}.funding`);
  if (!Array.isArray(fundingRaw) || fundingRaw.length === 0) throw new BalanceError(`balance.yaml: "${p}.funding" fehlt oder ist leer`);
  const funding: FundingLevel[] = fundingRaw.map((f, i) => {
    const level = { cost: zahl(f, 'cost', 0), points: zahl(f, 'points', 0) };
    if (level.points <= 0) throw new BalanceError(`balance.yaml: "${p}.funding" Nr. ${i + 1}: points muss über 0 liegen`);
    return level;
  });
  const techsRaw = wert(raw, `${p}.techs`);
  if (!Array.isArray(techsRaw) || techsRaw.length === 0) throw new BalanceError(`balance.yaml: "${p}.techs" fehlt oder ist leer`);
  const ids: string[] = [];
  const techs: TechBalance[] = techsRaw.map((t, i) => {
    const id = (t as { id?: unknown })?.id;
    if (typeof id !== 'string' || !KENNUNG.test(id)) throw new BalanceError(`balance.yaml: "${p}.techs" Nr. ${i + 1} braucht eine id (Kleinbuchstaben, Ziffern, _)`);
    if (ids.includes(id)) throw new BalanceError(`balance.yaml: Technik "${id}" steht doppelt in "${p}.techs"`);
    const wo = `${p}.techs.${id}`;
    const domain = (t as { domain?: unknown }).domain;
    if (!(TECH_DOMAINS as readonly unknown[]).includes(domain)) throw new BalanceError(`balance.yaml: "${wo}.domain" muss ${TECH_DOMAINS.join(', ')} sein`);
    const requires = (t as { requires?: unknown }).requires ?? [];
    if (!Array.isArray(requires) || !requires.every((r) => typeof r === 'string')) throw new BalanceError(`balance.yaml: "${wo}.requires" muss eine Liste von Technik-ids sein`);
    // Voraussetzungen müssen weiter oben stehen – so gibt es keine Kreise.
    for (const r of requires as string[]) if (!ids.includes(r)) throw new BalanceError(`balance.yaml: "${wo}.requires" nennt "${r}" – die Technik muss weiter oben stehen`);
    const effRaw = (t as { effects?: unknown }).effects ?? {};
    if (typeof effRaw !== 'object' || effRaw === null) throw new BalanceError(`balance.yaml: "${wo}.effects" muss eine Tabelle sein`);
    const effects: Partial<Record<TechEffectKey, number>> = {};
    for (const [k, v] of Object.entries(effRaw)) {
      if (!(TECH_EFFECT_KEYS as readonly string[]).includes(k)) throw new BalanceError(`balance.yaml: "${wo}.effects.${k}" unbekannt (erlaubt: ${TECH_EFFECT_KEYS.join(', ')})`);
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new BalanceError(`balance.yaml: "${wo}.effects.${k}" muss eine Zahl sein`);
      effects[k as TechEffectKey] = v;
    }
    ids.push(id);
    return {
      id,
      tier: ganz(t, 'tier', 1, 5),
      domain: domain as TechDomain,
      points: zahl(t, 'points', 0.1),
      requires: requires as string[],
      worldAt: zahl(t, 'worldAt', 0, 100),
      license: zahl(t, 'license', 0),
      effects,
    };
  });
  const luck = { min: zahl(raw, `${p}.luck.min`, 0), max: zahl(raw, `${p}.luck.max`, 0) };
  if (luck.min > luck.max) throw new BalanceError(`balance.yaml: "${p}.luck" hat min > max`);
  return {
    fromChapter: ganz(raw, `${p}.fromChapter`, 1),
    workshop: zahl(raw, `${p}.workshop`, 0),
    funding,
    luck,
    patentIncome: zahl(raw, `${p}.patentIncome`, 0),
    worldFallback: { mood: 50, tech: zahl(raw, `${p}.worldFallback.tech`, 0, 100), government: null },
    techs,
  };
}

// --- Zustand -------------------------------------------------------------------

/** Wie Jacob an eine Technik kam: als Erster erfunden (Patent), nachgeforscht oder als Lizenz gekauft. */
export type TechSource = 'patent' | 'eigen' | 'lizenz';
const SOURCES: readonly TechSource[] = ['patent', 'eigen', 'lizenz'];

export interface ResearchState {
  rng: RngState;
  workshop: boolean;
  /** Technik, an der gerade geforscht wird. */
  project: string | null;
  /** Gewählte Förderstufe (Index in research.funding). */
  funding: number;
  /** Erreichte Punkte je Technik – bleiben, wenn Jacob pausiert. */
  progress: Record<string, number>;
  owned: Record<string, TechSource>;
  /** Patente, für die Jacob keine Lizenz vergibt. */
  refused: string[];
}

type MitForschung = GameState & { research?: ResearchState };

export function researchUnlocked(state: object, balance: Pick<Balance, 'research'>): boolean {
  return chapterOf(state) >= balance.research.fromChapter;
}

export function newResearch(seed: string): ResearchState {
  return { rng: seedFromString(`${seed}:forschung`), workshop: false, project: null, funding: 0, progress: {}, owned: {}, refused: [] };
}

function forschung(state: GameState): ResearchState {
  return (state as MitForschung).research ?? newResearch(state.seed);
}

// --- Abfragen für andere Systeme (Andockpunkte) ------------------------------------

/** Hat Jacob diese Technik (erforscht, Patent oder Lizenz)? */
export function hasTech(state: GameState, id: string): boolean {
  return (state as MitForschung).research?.owned[id] !== undefined;
}

/** Technikstufe in einem Bereich (oder insgesamt): die höchste Stufe einer eigenen Technik, mindestens I. */
export function techTier(state: GameState, balance: Pick<Balance, 'research'>, domain?: TechDomain): number {
  const owned = (state as MitForschung).research?.owned ?? {};
  return balance.research.techs.filter((t) => owned[t.id] !== undefined && (!domain || t.domain === domain)).reduce((m, t) => Math.max(m, t.tier), 1);
}

/** Summe einer Kennzahl über alle eigenen Techniken (0, wenn keine wirkt). */
export function techEffect(state: GameState, balance: Pick<Balance, 'research'>, key: TechEffectKey): number {
  const owned = (state as MitForschung).research?.owned ?? {};
  return balance.research.techs.filter((t) => owned[t.id] !== undefined).reduce((s, t) => s + (t.effects[key] ?? 0), 0);
}

/**
 * Kennzahlen, die schon wirken: Bohrzeit und Bohrkosten (drilling.ts über techDrillCost/techDrillRounds).
 * depth, gasolineYield und trucks warten auf ihre Systeme (Bohrtiefe, Raffinerie 4.6, Tanklaster).
 */
export const ACTIVE_TECH_EFFECTS: readonly TechEffectKey[] = ['drillTime', 'drillCost'];

/** Bohrkosten mit Jacobs Techniken (ab Kapitel 2; vorher und ohne Technik unverändert). */
export function techDrillCost(state: object, balance: Pick<Balance, 'research'>, cost: number): number {
  if (!researchUnlocked(state, balance)) return cost;
  const anteil = techEffect(state as GameState, balance, 'drillCost');
  return anteil === 0 ? cost : Math.round(cost * Math.max(0.1, 1 + anteil));
}

/** Bohrdauer in Runden mit Jacobs Techniken (ab Kapitel 2), mindestens 1; halbe Runden zählen zugunsten von Jacob. */
export function techDrillRounds(state: object, balance: Pick<Balance, 'research'>, rounds: number): number {
  if (!researchUnlocked(state, balance)) return rounds;
  const anteil = techEffect(state as GameState, balance, 'drillTime');
  if (anteil === 0) return rounds;
  return Math.max(1, Math.ceil(rounds * Math.max(0.1, 1 + anteil) - 0.5));
}

/** Technikstand der Welt (4.1) oder der Ersatzwert. */
export function worldTech(state: GameState, balance: Pick<Balance, 'research'>): number {
  return worldPort(state, balance.research.worldFallback).tech;
}

/** Haben die Rivalen diese Technik? Ja, sobald die Welt so weit ist – außer Jacob hält das Patent und verweigert die Lizenz. */
export function rivalsHaveTech(state: GameState, balance: Pick<Balance, 'research'>, id: string): boolean {
  const t = balance.research.techs.find((x) => x.id === id);
  if (!t || worldTech(state, balance) < t.worldAt) return false;
  const r = (state as MitForschung).research;
  return !(r?.owned[id] === 'patent' && r.refused.includes(id));
}

// --- Was geht ----------------------------------------------------------------------

export type TechStatus = 'gesperrt' | 'offen' | 'laeuft' | 'eigen';

export interface TechView {
  id: string;
  tier: number;
  domain: TechDomain;
  status: TechStatus;
  source: TechSource | null;
  /** Anteil erforscht 0–1. */
  progress: number;
  /** Fehlende Voraussetzungen. */
  missing: string[];
  /** Andere haben sie schon: Lizenz kaufbar, kein Patent mehr möglich. */
  licensable: boolean;
  license: number;
  refused: boolean;
  /** Jacobs Patent bringt diese Runde Lizenzgebühren (die Welt braucht die Technik, Jacob verweigert nicht). */
  paying: boolean;
}

export function techViews(state: GameState, balance: Pick<Balance, 'research'>): TechView[] {
  const r = forschung(state);
  const welt = worldTech(state, balance);
  return balance.research.techs.map((t) => {
    const missing = t.requires.filter((x) => r.owned[x] === undefined);
    const source = r.owned[t.id] ?? null;
    const status: TechStatus = source ? 'eigen' : r.project === t.id ? 'laeuft' : missing.length > 0 ? 'gesperrt' : 'offen';
    return {
      id: t.id,
      tier: t.tier,
      domain: t.domain,
      status,
      source,
      progress: Math.min(1, (r.progress[t.id] ?? 0) / t.points),
      missing,
      licensable: !source && welt >= t.worldAt,
      license: t.license,
      refused: r.refused.includes(t.id),
      paying: source === 'patent' && !r.refused.includes(t.id) && welt >= t.worldAt,
    };
  });
}

// --- Aktionen ---------------------------------------------------------------------

export type ResearchResult = { ok: true; state: GameState } | { ok: false; reason: string };

function zeile(state: GameState, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function grund(state: GameState, balance: Pick<Balance, 'research'>, kosten = 0): string | null {
  if (!researchUnlocked(state, balance)) return 'Das gibt es erst ab Kapitel 2.';
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (kosten > state.cash) return `Dafür fehlt das Geld (${kosten.toLocaleString('de-DE')} $ nötig).`;
  return null;
}

function mit(state: GameState, r: ResearchState, extra: Partial<GameState> = {}): GameState {
  return { ...state, ...extra, research: r } as GameState;
}

/** Die Versuchswerkstatt einrichten (einmalig). */
export function buildWorkshop(state: GameState, balance: Balance): ResearchResult {
  const r = forschung(state);
  if (r.workshop) return { ok: false, reason: 'Die Werkstatt steht schon.' };
  const nein = grund(state, balance, balance.research.workshop);
  if (nein) return { ok: false, reason: nein };
  return {
    ok: true,
    state: mit(state, { ...r, workshop: true }, {
      cash: cents(state.cash - balance.research.workshop),
      log: zeile(state, 'Hinter dem Lager entsteht eine Versuchswerkstatt: Esse, Drehbank, zwei Mechaniker.'),
    }),
  };
}

/** An einer Technik forschen (eine zur Zeit; der Fortschritt einer anderen bleibt erhalten). */
export function startResearch(state: GameState, balance: Balance, id: string, funding: number): ResearchResult {
  const nein = grund(state, balance);
  if (nein) return { ok: false, reason: nein };
  const r = forschung(state);
  if (!r.workshop) return { ok: false, reason: 'Erst braucht es eine Werkstatt.' };
  const t = balance.research.techs.find((x) => x.id === id);
  if (!t) return { ok: false, reason: 'Diese Technik gibt es nicht.' };
  if (r.owned[id]) return { ok: false, reason: 'Die Technik hat Jacob schon.' };
  if (t.requires.some((x) => r.owned[x] === undefined)) return { ok: false, reason: 'Dafür fehlt noch eine andere Technik.' };
  if (!Number.isInteger(funding) || funding < 0 || funding >= balance.research.funding.length) return { ok: false, reason: 'Diese Förderstufe gibt es nicht.' };
  if (r.project === id && r.funding === funding) return { ok: false, reason: 'Daran wird schon so geforscht.' };
  return { ok: true, state: mit(state, { ...r, project: id, funding }) };
}

/** Die Forschung anhalten – der Fortschritt bleibt. */
export function stopResearch(state: GameState, balance: Balance): ResearchResult {
  const nein = grund(state, balance);
  if (nein) return { ok: false, reason: nein };
  const r = forschung(state);
  if (!r.project) return { ok: false, reason: 'Es wird gerade an nichts geforscht.' };
  return { ok: true, state: mit(state, { ...r, project: null }) };
}

/** Eine Lizenz kaufen – nur, wenn andere die Technik schon haben. */
export function buyLicense(state: GameState, balance: Balance, id: string): ResearchResult {
  const t = balance.research.techs.find((x) => x.id === id);
  if (!t) return { ok: false, reason: 'Diese Technik gibt es nicht.' };
  const nein = grund(state, balance, t.license);
  if (nein) return { ok: false, reason: nein };
  const r = forschung(state);
  if (r.owned[id]) return { ok: false, reason: 'Die Technik hat Jacob schon.' };
  if (worldTech(state, balance) < t.worldAt) return { ok: false, reason: 'Noch hat niemand diese Technik – es gibt keine Lizenz zu kaufen.' };
  if (t.requires.some((x) => r.owned[x] === undefined)) return { ok: false, reason: 'Dafür fehlt noch eine andere Technik.' };
  const neu: ResearchState = { ...r, owned: { ...r.owned, [id]: 'lizenz' }, project: r.project === id ? null : r.project };
  return { ok: true, state: mit(state, neu, { cash: cents(state.cash - t.license), log: zeile(state, `Jacob kauft eine Lizenz (${t.license.toLocaleString('de-DE')} $).`) }) };
}

/** Lizenz für ein eigenes Patent verweigern oder wieder vergeben. */
export function toggleRefuse(state: GameState, balance: Balance, id: string): ResearchResult {
  const nein = grund(state, balance);
  if (nein) return { ok: false, reason: nein };
  const r = forschung(state);
  if (r.owned[id] !== 'patent') return { ok: false, reason: 'Darauf hält Jacob kein Patent.' };
  const refused = r.refused.includes(id) ? r.refused.filter((x) => x !== id) : [...r.refused, id];
  return { ok: true, state: mit(state, { ...r, refused }) };
}

// --- Rundenabrechnung -----------------------------------------------------------

/**
 * Rundenabrechnung der Forschung (4.11). In Kapitel 1 (und ohne Werkstatt und Patente)
 * unverändert dasselbe Objekt. Erst kostet die Förderung, dann wächst der Fortschritt;
 * ist die Technik fertig, gehört sie Jacob (Patent, wenn die Welt sie noch nicht hat).
 * Danach zahlen die Rivalen für Jacobs Patente, sofern er Lizenzen vergibt.
 */
export function advanceResearch(input: GameState, balance: Balance): GameState {
  if (!researchUnlocked(input, balance) || input.finished) return input;
  const r0 = (input as MitForschung).research;
  if (!r0) return input;
  const rb = balance.research;
  let r = r0;
  let cash = input.cash;
  const log: string[] = [];
  const rng = new Rng(r.rng);
  const datum = formatDate(input);
  let changed = false;

  const t = r.project ? rb.techs.find((x) => x.id === r.project) : undefined;
  if (t && r.workshop) {
    changed = true;
    const stufe = rb.funding[r.funding] ?? rb.funding[0];
    if (cash >= stufe.cost) {
      cash = cents(cash - stufe.cost);
      const glueck = rb.luck.min + rng.float() * (rb.luck.max - rb.luck.min);
      const punkte = Math.round(((r.progress[t.id] ?? 0) + stufe.points * glueck) * 100) / 100;
      r = { ...r, progress: { ...r.progress, [t.id]: punkte } };
      if (punkte >= t.points) {
        const patent = worldTech(input, balance) < t.worldAt;
        r = { ...r, owned: { ...r.owned, [t.id]: patent ? 'patent' : 'eigen' }, project: null };
        log.push(
          `${datum}: ${patent ? 'Die Werkstatt hat es geschafft – und niemand war schneller. Jacob meldet ein Patent an.' : 'Die Werkstatt hat es geschafft. Andere haben es schon, aber jetzt hat es auch Jacob.'}`,
        );
      }
    } else {
      log.push(`${datum}: Für die Werkstatt fehlt diese Runde das Geld – die Mechaniker warten.`);
    }
  }

  // Lizenzgebühren der Rivalen für Jacobs Patente (GDD §5).
  const welt = worldTech(input, balance);
  const zahlende = rb.techs.filter((x) => r.owned[x.id] === 'patent' && !r.refused.includes(x.id) && welt >= x.worldAt).length;
  if (zahlende > 0 && rb.patentIncome > 0) {
    cash = cents(cash + zahlende * rb.patentIncome);
    changed = true;
  }

  if (!changed) return input;
  r = { ...r, rng: rng.state };
  return { ...input, cash, research: r, log: log.length > 0 ? [...input.log, ...log] : input.log } as GameState;
}

// --- Spielstand -----------------------------------------------------------------

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Prüft den Forschungszustand eines geladenen Spielstands (4.11 Andockpunkt in save.ts). */
export function validResearch(v: unknown): boolean {
  if (!istObjekt(v)) return false;
  if (!istZahl(v.rng) || !istZahl(v.funding) || typeof v.workshop !== 'boolean') return false;
  if (v.project !== null && typeof v.project !== 'string') return false;
  if (!istObjekt(v.progress) || !Object.values(v.progress).every(istZahl)) return false;
  if (!istObjekt(v.owned) || !Object.values(v.owned).every((s) => (SOURCES as readonly unknown[]).includes(s))) return false;
  return Array.isArray(v.refused) && v.refused.every((x) => typeof x === 'string');
}

// --- Texte (content/research.yaml) --------------------------------------------------

export interface ResearchContent {
  techs: Record<string, { name: LocalizedText; text: LocalizedText }>;
  domains: Record<TechDomain, LocalizedText>;
  funding: LocalizedText[];
  /** Name je Kennzahl (Bohrzeit, Bohrkosten, …) für die Anzeige der Wirkung. */
  effects: Record<TechEffectKey, LocalizedText>;
  /** Hinweis bei Kennzahlen, die noch nicht wirken (nicht in ACTIVE_TECH_EFFECTS). */
  pending: LocalizedText;
}

/** Liest content/research.yaml; prüft gegen balance.yaml, dass jede Technik und jede Förderstufe einen Text hat. */
export function parseResearchContent(file: string, text: string, balance?: Pick<Balance, 'research'>): { content: ResearchContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw = doc.toJS() as Record<string, unknown> | null;
  const sprachtext = (value: unknown, wo: string): LocalizedText | null => {
    if (!istObjekt(value) || typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: braucht einen deutschen Text (de) und optional en.`);
      return null;
    }
    const fremd = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (fremd.length > 0) fehler(`${wo}: unbekannte Sprache ${fremd.join(', ')}.`);
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  };
  const techs: ResearchContent['techs'] = {};
  const techsRaw = raw?.techs;
  if (!istObjekt(techsRaw)) fehler('„techs“ fehlt.');
  else
    for (const [id, v] of Object.entries(techsRaw)) {
      const name = sprachtext(istObjekt(v) ? v.name : undefined, `techs.${id}.name`);
      const body = sprachtext(istObjekt(v) ? v.text : undefined, `techs.${id}.text`);
      if (name && body) techs[id] = { name, text: body };
    }
  const domains: Partial<Record<TechDomain, LocalizedText>> = {};
  const domRaw = raw?.domains;
  if (!istObjekt(domRaw)) fehler('„domains“ fehlt.');
  else
    for (const d of TECH_DOMAINS) {
      const t = sprachtext(domRaw[d], `domains.${d}`);
      if (t) domains[d] = t;
    }
  const funding: LocalizedText[] = [];
  const fundRaw = raw?.funding;
  if (!Array.isArray(fundRaw)) fehler('„funding“ fehlt – je Förderstufe aus balance.yaml ein Name.');
  else
    fundRaw.forEach((f, i) => {
      const t = sprachtext(f, `funding Nr. ${i + 1}`);
      if (t) funding.push(t);
    });
  const effects: Partial<Record<TechEffectKey, LocalizedText>> = {};
  const effRaw = raw?.effects;
  if (!istObjekt(effRaw)) fehler('„effects“ fehlt – je Kennzahl ein Name.');
  else
    for (const k of TECH_EFFECT_KEYS) {
      const t = sprachtext(effRaw[k], `effects.${k}`);
      if (t) effects[k] = t;
    }
  const pending = sprachtext(raw?.pending, 'pending');
  if (balance) {
    for (const t of balance.research.techs) if (!techs[t.id] && istObjekt(techsRaw) && !(t.id in techsRaw)) fehler(`techs.${t.id}: Text fehlt (Technik aus balance.yaml).`);
    for (const id of Object.keys(techs)) if (!balance.research.techs.some((t) => t.id === id)) fehler(`techs.${id}: Diese Technik steht nicht in balance.yaml.`);
    if (Array.isArray(fundRaw) && fundRaw.length !== balance.research.funding.length) {
      fehler(`funding: ${fundRaw.length} Namen, aber ${balance.research.funding.length} Förderstufen in balance.yaml.`);
    }
  }
  if (errors.length > 0) return { content: null, errors };
  return {
    content: { techs, domains: domains as Record<TechDomain, LocalizedText>, funding, effects: effects as Record<TechEffectKey, LocalizedText>, pending: pending as LocalizedText },
    errors,
  };
}
