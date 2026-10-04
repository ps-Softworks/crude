// Texte der Hallstead-Mappe (4.16) aus content/hallstead.yaml: lesen, prüfen,
// und fertige Sätze für die Oberfläche bauen (hallsteadView). Die Oberfläche
// zeigt nur, was hier steht – entschieden wird in holdings.ts und lobby.ts.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { HOLDING_KINDS, LOBBY_TRAITS, PARTY_IDS, type HoldingKind, type LobbyTrait, type PartyId } from './hallsteadBalance';
import { hallsteadUnlocked, worldView, type HallsteadNews, type HallsteadReason } from './hallsteadState';
import { saleProceeds } from './holdings';
import { availableFavors, currentLobbyist } from './lobby';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';

const OBJECT_KEYS = ['name', 'hint', 'locked'] as const;
const TAB_KEYS = ['holdings', 'lobby', 'laws'] as const;
const CRED_KEYS = ['high', 'scratched', 'lost'] as const;
const COMPETENCE_KEYS = ['low', 'mid', 'high'] as const;
export const UI_KEYS = [
  'value', 'invested', 'buy', 'buyMore', 'sell', 'hire', 'fire', 'salary', 'favors', 'favorsHint', 'bribe', 'bribeHint',
  'donate', 'donateHint', 'donationPending', 'government', 'push', 'block', 'water', 'oilFor', 'oilAgainst',
  'pressureFor', 'pressureAgainst', 'watered', 'needLobbyist', 'telegram', 'nothing', 'debugUnlock',
] as const;
export const NEWS_KEYS = ['crash', 'yieldPlus', 'yieldMinus', 'donationWon', 'donationLost', 'lobbyFavors', 'lobbyDrunk', 'salary'] as const;
export const REASON_KEYS: readonly HallsteadReason[] = [
  'locked', 'cash', 'owned', 'notOwned', 'noLobbyist', 'hasLobbyist', 'unknown', 'favors', 'refuses', 'already', 'amount', 'maxed',
];

export type CredibilityWord = (typeof CRED_KEYS)[number];
export type CompetenceWord = (typeof COMPETENCE_KEYS)[number];
type T = LocalizedText;

export interface LawText {
  id: string;
  name: T;
  oil: 'for' | 'against';
}

export interface HallsteadContent {
  object: Record<(typeof OBJECT_KEYS)[number], T>;
  tabs: Record<(typeof TAB_KEYS)[number], T>;
  holdings: Record<HoldingKind, { name: T; text: T; shock?: T }>;
  newspaper: { campaign: T; campaignDone: T; credibility: Record<CredibilityWord, T> };
  bank: { discount: T };
  lobbyists: Record<string, { name: T; text: T }>;
  traits: Record<LobbyTrait, T>;
  competence: Record<CompetenceWord, T>;
  parties: Record<PartyId, T>;
  laws: LawText[];
  ui: Record<(typeof UI_KEYS)[number], T>;
  news: Record<(typeof NEWS_KEYS)[number], T>;
  reasons: Record<HallsteadReason, T>;
}

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Liest content/hallstead.yaml. Fehler mit Datei und (wo möglich) Zeile. */
export function parseHallsteadContent(file: string, text: string): { content: HallsteadContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht die Blöcke object, tabs, holdings, newspaper, bank, lobbyists, traits, competence, parties, laws, ui, news, reasons.');
    return { content: null, errors };
  }

  function sprachtext(value: unknown, wo: string): T | null {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return null;
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: deutscher Text fehlt.`);
      return null;
    }
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
  }

  function block<K extends string>(value: unknown, wo: string, ids: readonly K[]): Record<K, T> {
    const out = {} as Record<K, T>;
    if (!istObjekt(value)) {
      fehler(`„${wo}“ fehlt.`);
      return out;
    }
    const unbekannt = Object.keys(value).filter((k) => !(ids as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`„${wo}“: unbekannte Einträge ${unbekannt.join(', ')}.`);
    for (const id of ids) {
      const t = sprachtext(value[id], `${wo}.${id}`);
      if (t) out[id] = t;
    }
    return out;
  }

  const holdings = {} as HallsteadContent['holdings'];
  if (!istObjekt(raw.holdings)) fehler('„holdings“ fehlt.');
  else {
    for (const k of HOLDING_KINDS) {
      const e = raw.holdings[k];
      if (!istObjekt(e)) {
        fehler(`holdings.${k} fehlt.`);
        continue;
      }
      const name = sprachtext(e.name, `holdings.${k}.name`);
      const txt = sprachtext(e.text, `holdings.${k}.text`);
      const shock = e.shock === undefined ? undefined : sprachtext(e.shock, `holdings.${k}.shock`) ?? undefined;
      if (name && txt) holdings[k] = { name, text: txt, ...(shock ? { shock } : {}) };
    }
    const fremd = Object.keys(raw.holdings).filter((k) => !(HOLDING_KINDS as readonly string[]).includes(k));
    if (fremd.length > 0) fehler(`„holdings“: unbekannte Arten ${fremd.join(', ')}. Erlaubt: ${HOLDING_KINDS.join(', ')}.`);
  }

  const np = istObjekt(raw.newspaper) ? raw.newspaper : {};
  if (!istObjekt(raw.newspaper)) fehler('„newspaper“ fehlt.');
  const campaign = sprachtext(np.campaign, 'newspaper.campaign');
  const campaignDone = sprachtext(np.campaignDone, 'newspaper.campaignDone');
  const credibility = block(np.credibility, 'newspaper.credibility', CRED_KEYS);
  const bank = block(raw.bank, 'bank', ['discount'] as const);

  const lobbyists: HallsteadContent['lobbyists'] = {};
  if (!istObjekt(raw.lobbyists) || Object.keys(raw.lobbyists).length === 0) fehler('„lobbyists“ fehlt oder ist leer.');
  else {
    for (const [id, e] of Object.entries(raw.lobbyists)) {
      if (!istObjekt(e)) {
        fehler(`lobbyists.${id}: braucht name und text.`);
        continue;
      }
      const name = sprachtext(e.name, `lobbyists.${id}.name`);
      const txt = sprachtext(e.text, `lobbyists.${id}.text`);
      if (name && txt) lobbyists[id] = { name, text: txt };
    }
  }

  const laws: LawText[] = [];
  if (!istObjekt(raw.laws) || Object.keys(raw.laws).length === 0) fehler('„laws“ fehlt oder ist leer.');
  else {
    for (const [id, e] of Object.entries(raw.laws)) {
      if (!istObjekt(e)) {
        fehler(`laws.${id}: braucht name und oil.`);
        continue;
      }
      const name = sprachtext(e.name, `laws.${id}.name`);
      if (e.oil !== 'for' && e.oil !== 'against') fehler(`laws.${id}.oil: muss for oder against sein.`);
      else if (name) laws.push({ id, name, oil: e.oil });
    }
  }

  const content: HallsteadContent = {
    object: block(raw.object, 'object', OBJECT_KEYS),
    tabs: block(raw.tabs, 'tabs', TAB_KEYS),
    holdings,
    newspaper: { campaign: campaign!, campaignDone: campaignDone!, credibility },
    bank: bank as { discount: T },
    lobbyists,
    traits: block(raw.traits, 'traits', LOBBY_TRAITS),
    competence: block(raw.competence, 'competence', COMPETENCE_KEYS),
    parties: block(raw.parties, 'parties', PARTY_IDS),
    laws,
    ui: block(raw.ui, 'ui', UI_KEYS),
    news: block(raw.news, 'news', NEWS_KEYS),
    reasons: block(raw.reasons, 'reasons', REASON_KEYS),
  };
  return errors.length > 0 ? { content: null, errors } : { content, errors };
}

/** Passen Texte und Zahlen zusammen? Jeder Kandidat braucht Texte und umgekehrt; jede Art mit Schlag einen Schlag-Text. */
export function checkHallsteadContent(file: string, content: HallsteadContent, balance: Balance): ContentError[] {
  const errors: ContentError[] = [];
  const kandidaten = Object.keys(balance.hallstead.lobby.candidates);
  for (const id of kandidaten) if (!content.lobbyists[id]) errors.push({ file, line: 1, message: `lobbyists.${id} fehlt (Kandidat in balance.yaml).` });
  for (const id of Object.keys(content.lobbyists)) {
    if (!kandidaten.includes(id)) errors.push({ file, line: 1, message: `lobbyists.${id}: kein Kandidat dieses Namens in balance.yaml (hallstead.lobby.candidates).` });
  }
  for (const k of HOLDING_KINDS) {
    if (balance.hallstead.holdings.kinds[k].shock.chance > 0 && !content.holdings[k]?.shock) {
      errors.push({ file, line: 1, message: `holdings.${k}.shock fehlt (balance.yaml gibt dieser Art einen Schlag).` });
    }
  }
  return errors;
}

/** Setzt {name}, {amount} … in einen Text ein. */
export function fillText(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Glaubwürdigkeit als Wort (die Zahl sieht der Spieler nicht). */
export function credibilityWord(credibility: number, balance: Balance): CredibilityWord {
  const nb = balance.hallstead.newspaper;
  if (credibility < nb.lostBelow) return 'lost';
  if (credibility < nb.scratchedBelow) return 'scratched';
  return 'high';
}

/** Kompetenz nur ungefähr (GDD §11): 1–2 unerfahren, 3 brauchbar, 4–5 erfahren. */
export function competenceWord(competence: number): CompetenceWord {
  if (competence <= 2) return 'low';
  if (competence >= 4) return 'high';
  return 'mid';
}

// --- Fertige Sicht für das Fenster ---

export interface HoldingRow {
  kind: HoldingKind;
  name: string;
  text: string;
  price: number;
  single: boolean;
  owned: boolean;
  value: number;
  invested: number;
  proceeds: number;
}

export interface CandidateRow {
  id: string;
  name: string;
  text: string;
  trait: string;
  competence: string;
  hireCost: number;
  salary: number;
}

export interface LawRow {
  id: string;
  name: string;
  oil: string;
  /** Satz zum Druck, oder null. */
  pressure: string | null;
  watered: boolean;
}

export interface HallsteadView {
  unlocked: boolean;
  holdings: HoldingRow[];
  newspaper: { owned: boolean; credibility: string; campaignDone: boolean };
  bankDiscount: string | null;
  lobbyist: CandidateRow | null;
  candidates: CandidateRow[];
  favors: number;
  canBribe: boolean;
  government: string;
  donations: string[];
  laws: LawRow[];
  telegram: string[];
  /** Steht im Telegramm etwas Besonderes (Crash, Schlag, Wahlausgang, Ausfall) – nicht nur Gehalt und Ertrag? */
  telegramNews: boolean;
}

function geld(v: number): string {
  return `${Math.round(v).toLocaleString('de-DE')} $`;
}

function rundenText(n: number, lang: Lang): string {
  if (lang === 'en') return n === 1 ? '1 round' : `${n} rounds`;
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

/** Eine Telegramm-Zeile aus einer Meldung. */
export function newsLine(n: HallsteadNews, c: HallsteadContent, lang: Lang): string {
  const L = (t: T) => localize(t, lang);
  switch (n.key) {
    case 'crash':
      return fillText(L(c.news.crash), { name: L(c.holdings[n.kind].name), amount: geld(n.amount) });
    case 'shock': {
      const t = c.holdings[n.kind].shock;
      return t ? fillText(L(t), { amount: geld(n.amount) }) : fillText(L(c.news.crash), { name: L(c.holdings[n.kind].name), amount: geld(n.amount) });
    }
    case 'yield':
      return fillText(L(n.amount >= 0 ? c.news.yieldPlus : c.news.yieldMinus), { amount: geld(Math.abs(n.amount)) });
    case 'donationWon':
      return fillText(L(c.news.donationWon), { party: L(c.parties[n.party]), favors: Math.round(n.favors * 10) / 10 });
    case 'donationLost':
      return fillText(L(c.news.donationLost), { party: L(c.parties[n.party]), amount: geld(n.amount) });
    case 'lobbyFavors':
      return fillText(L(c.news.lobbyFavors), { favors: (Math.round(n.favors * 10) / 10).toLocaleString('de-DE') });
    case 'lobbyDrunk':
      return L(c.news.lobbyDrunk);
    case 'salary':
      return fillText(L(c.news.salary), { amount: geld(n.amount) });
  }
}

/** Alles, was das Fenster zeigt – fertig formuliert. */
export function hallsteadView(state: GameState, balance: Balance, c: HallsteadContent, lang: Lang = 'de'): HallsteadView {
  const L = (t: T) => localize(t, lang);
  const h = state.hallstead;
  const hb = balance.hallstead;
  const holdings: HoldingRow[] = HOLDING_KINDS.map((kind) => {
    const pos = h?.holdings.positions[kind];
    return {
      kind,
      name: L(c.holdings[kind].name),
      text: L(c.holdings[kind].text),
      price: hb.holdings.kinds[kind].price,
      single: hb.holdings.kinds[kind].single,
      owned: !!pos,
      value: pos?.value ?? 0,
      invested: pos?.invested ?? 0,
      proceeds: saleProceeds(state, balance, kind),
    };
  });
  const cand = (id: string): CandidateRow => {
    const b = hb.lobby.candidates[id];
    return {
      id,
      name: L(c.lobbyists[id]?.name ?? { de: id, en: id }),
      text: L(c.lobbyists[id]?.text ?? { de: '', en: '' }),
      trait: L(c.traits[b.trait]),
      competence: L(c.competence[competenceWord(b.competence)]),
      hireCost: b.hireCost,
      salary: b.salary,
    };
  };
  const wer = currentLobbyist(state, balance);
  const welt = worldView(state, balance);
  const credibility = h?.holdings.credibility ?? hb.newspaper.credibilityStart;
  const laws: LawRow[] = c.laws.map((law) => {
    const p = h?.lobby.pressure[law.id] ?? 0;
    return {
      id: law.id,
      name: L(law.name),
      oil: L(law.oil === 'for' ? c.ui.oilFor : c.ui.oilAgainst),
      pressure: p >= 1 ? L(c.ui.pressureFor) : p <= -1 ? L(c.ui.pressureAgainst) : null,
      watered: (h?.lobby.water[law.id] ?? 0) > 0,
    };
  });
  return {
    unlocked: hallsteadUnlocked(state, balance),
    holdings,
    newspaper: {
      owned: !!h?.holdings.positions.zeitung,
      credibility: L(c.newspaper.credibility[credibilityWord(credibility, balance)]),
      campaignDone: h?.holdings.campaignRound === state.round,
    },
    bankDiscount: h?.holdings.positions.bank ? fillText(L(c.bank.discount), { amount: hb.bankRateDiscount }) : null,
    lobbyist: wer ? cand(wer.id) : null,
    candidates: Object.keys(hb.lobby.candidates).map(cand),
    favors: availableFavors(state),
    canBribe: !!wer && wer.trait !== 'gewissenhaft',
    government: fillText(L(c.ui.government), { party: L(c.parties[welt.government]) }),
    donations: (h?.lobby.donations ?? []).map((d) =>
      fillText(L(c.ui.donationPending), { amount: geld(d.amount), party: L(c.parties[d.party]), rounds: rundenText(Math.max(1, d.electionRound - state.round + 1), lang) }),
    ),
    laws,
    telegram: (h?.news ?? []).map((n) => newsLine(n, c, lang)),
    telegramNews: (h?.news ?? []).some((n) => n.key !== 'salary' && n.key !== 'yield' && n.key !== 'lobbyFavors'),
  };
}
