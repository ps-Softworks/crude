// Parteien, Stimmung, Wahlen (4.2, GDD §7.1 und §10). Die Regeln selbst stehen im
// Weltmodell (world.ts: actsInput, Wahltag in advanceWorld); hier steht, wie
// Jacobs Handeln dorthin kommt (recordAct), was die Zeitung daraus macht
// (Umfrage, Wahlergebnis) und wie content/politics.yaml gelesen wird
// (Parteinamen und Programme – reine Texte, keine Zahlen).

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { leadingParty, PARTIES, type Party, type PublicAct, type WorldState } from './world';

/**
 * Jacob tut etwas, worüber man redet (Feldbrand, Front gegen den Trust, Streik, Spende,
 * Presse): Die Tat wartet im Weltmodell und wirkt am Rundenende auf Stimmung und
 * Parteien. Ohne Weltmodell (alte Teststände) bleibt alles, wie es ist.
 */
export function recordAct(state: GameState, act: PublicAct): GameState {
  if (!state.worldModel) return state;
  return { ...state, worldModel: { ...state.worldModel, acts: [...(state.worldModel.acts ?? []), act] } };
}

/** Reihenfolge, in der die Zeitung über Jacobs Handeln berichtet: das Lauteste zuerst. */
export const ACT_PRIORITY: readonly PublicAct[] = [
  'field_fire',
  'strike_break',
  'price_war',
  'press_scandal',
  'independents_stand',
  'strike',
  'support_handel',
  'support_volksbund',
  'support_provinz',
  'press_praise',
  'charity',
];

/** Worüber die Zeitung zu Beginn der Runde berichtet: die lauteste Tat der letzten Runde, sonst nichts. */
export function loudestAct(world: Pick<WorldState, 'actsDone'> | undefined): PublicAct | null {
  const done = world?.actsDone ?? [];
  return ACT_PRIORITY.find((a) => done.includes(a)) ?? null;
}

/** Umfrage (4.2): Wer vorn liegt, wenn die Wahl höchstens pollFrom Runden entfernt ist; sonst null. */
export function pollLeader(world: Pick<WorldState, 'electionIn' | 'parties'> | undefined, pollFrom: number): Party | null {
  if (!world || world.electionIn > pollFrom) return null;
  return leadingParty(world.parties);
}

/** Kopf an Kopf (4.2): Liegen die beiden Ersten näher als pollClose beieinander? */
export function pollIsClose(parties: Record<Party, number>, pollClose: number): boolean {
  const [erste, zweite] = PARTIES.map((p) => parties[p]).sort((a, b) => b - a);
  return erste - zweite < pollClose;
}

/** Hat in der letzten fortgeschriebenen Runde eine Wahl stattgefunden? */
export function electionJustHeld(world: Pick<WorldState, 'news' | 'lastElection'> | undefined): boolean {
  return !!world?.lastElection && (world.news.includes('election') || world.news.includes('reelection'));
}

// --- Inhalte: content/politics.yaml ---------------------------------------------

export interface PartyText {
  name: LocalizedText;
  /** Zwei bis vier Programmpunkte. */
  program: LocalizedText[];
}

export interface PoliticsContent {
  /** Überschrift des Wahlergebnisses in der Zeitung. */
  electionTitle: LocalizedText;
  /** Überschrift über dem Programm der Sieger. */
  programTitle: LocalizedText;
  parties: Record<Party, PartyText>;
}

/** Eine Zeile des Wahlergebnisses. */
export interface ElectionLine {
  party: Party;
  name: string;
  /** Stimmen in ganzen Prozent (Summe 100). */
  percent: number;
  winner: boolean;
}

export interface ElectionReport {
  title: string;
  lines: ElectionLine[];
  programTitle: string;
  program: string[];
}

/** Prozente, die zusammen genau 100 ergeben (größte Reste bekommen die Rundung). */
export function roundedPercents(shares: Record<Party, number>): Record<Party, number> {
  const summe = PARTIES.reduce((s, p) => s + shares[p], 0) || 1;
  const roh = PARTIES.map((p) => ({ p, v: (100 * shares[p]) / summe }));
  const out = Object.fromEntries(roh.map(({ p, v }) => [p, Math.floor(v)])) as Record<Party, number>;
  let rest = 100 - PARTIES.reduce((s, p) => s + out[p], 0);
  for (const { p } of [...roh].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))) {
    if (rest <= 0) break;
    out[p] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Wahlergebnis für die Zeitung, nur in der Ausgabe direkt nach der Wahl. Ein
 * amtliches Ergebnis ist eine öffentliche Zahl – anders als Stimmung oder
 * Kreditklima, die die Zeitung nur andeutet.
 */
export function electionReport(world: WorldState | undefined, content: PoliticsContent, lang?: Lang): ElectionReport | null {
  if (!world || !electionJustHeld(world)) return null;
  const e = world.lastElection!;
  const prozent = roundedPercents(e.shares);
  const lines = [...PARTIES]
    .sort((a, b) => e.shares[b] - e.shares[a])
    .map((p) => ({ party: p, name: localize(content.parties[p].name, lang), percent: prozent[p], winner: p === e.winner }));
  return {
    title: localize(content.electionTitle, lang),
    lines,
    programTitle: localize(content.programTitle, lang),
    program: content.parties[e.winner].program.map((t) => localize(t, lang)),
  };
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/politics.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parsePoliticsContent(file: string, text: string): { content: PoliticsContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „electionTitle“, „programTitle“ und „parties“.');
    return { content: null, errors };
  }
  function sprachtext(value: unknown, wo: string): LocalizedText | null {
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
  const unbekannt = Object.keys(raw).filter((k) => !['electionTitle', 'programTitle', 'parties'].includes(k));
  if (unbekannt.length > 0) fehler(`Unbekannte Einträge: ${unbekannt.join(', ')}.`);
  const electionTitle = sprachtext(raw.electionTitle, 'electionTitle');
  const programTitle = sprachtext(raw.programTitle, 'programTitle');
  const partiesRaw = raw.parties;
  if (!istObjekt(partiesRaw)) {
    fehler('„parties“ fehlt.');
    return { content: null, errors };
  }
  const fremd = Object.keys(partiesRaw).filter((k) => !(PARTIES as readonly string[]).includes(k));
  if (fremd.length > 0) fehler(`Unbekannte Partei(en): ${fremd.join(', ')}. Erlaubt: ${PARTIES.join(', ')}.`);
  const parties: Partial<Record<Party, PartyText>> = {};
  for (const p of PARTIES) {
    const eintrag = partiesRaw[p];
    if (!istObjekt(eintrag)) {
      fehler(`Partei „${p}“ fehlt.`);
      continue;
    }
    const name = sprachtext(eintrag.name, `${p}.name`);
    const programm = eintrag.program;
    if (!Array.isArray(programm) || programm.length < 2 || programm.length > 4) {
      fehler(`${p}.program: braucht zwei bis vier Programmpunkte.`);
      continue;
    }
    const punkte = programm.map((t, i) => sprachtext(t, `${p}.program[${i}]`));
    if (name && punkte.every((t): t is LocalizedText => t !== null)) parties[p] = { name, program: punkte };
  }
  if (errors.length > 0 || !electionTitle || !programTitle) return { content: null, errors };
  return { content: { electionTitle, programTitle, parties: parties as Record<Party, PartyText> }, errors };
}
