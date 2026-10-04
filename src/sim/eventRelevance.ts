// Wirkung der Ereignis-Antworten (0.2.15+3): Welche Antworten sind spürbar, welche
// fast egal? Philipps Rückmeldung: Einige Entscheidungen fühlen sich irrelevant an.
// Diese Prüfung bewertet jede Antwort und meldet die schwachen. Benutzt von
// npm run check:events (Liste aller Antworten) und npm run check:content (Zusammenfassung).
//
// Eine Antwort ist STARK, wenn mindestens eins gilt:
//   - Ihre Wirkung in $ erreicht die Schwelle (relevance.minShare × relevance.chapterMoney):
//     |Geld| + |Öl| × Trendpreis + |Kraft| × Gewicht + |Familie| × Gewicht (Gewichte des
//     Standard-Bots). Beträge, weil auch „Kraft gegen Familie“ eine spürbare Abwägung ist.
//   - Sie hat eine dauerhafte Wirkung (Bahntarif, eigene Fuhrwerke, Preis, Förderung, Pacht),
//     deren Wert in $ (über relevance.refBarrels bzw. refLeaseSpend) die Schwelle erreicht.
//   - Sie setzt ein Merkzeichen, das später etwas abfragt (ein Ereignis, ein Story-Bogen,
//     das Kapitelende oder die Simulation selbst).
// Eine schwache Antwort ist als GEGENSTÜCK in Ordnung, wenn sie die einzige schwache ihres
// Ereignisses ist und eine andere Antwort stark ist – dann ist sie die Seite „lieber nicht“.
// Alles andere ist SCHWACH, ebenso jedes Merkzeichen, das nichts abfragt (FOLGENLOS) –
// außer es steht in content/relevance.yaml als Merkzeichen für ein späteres Kapitel
// (begründete Ausnahme: zählt nicht als folgenlos, macht die Antwort aber auch nicht stark).
// Feste Termine (routine) haben nur eine Antwort: Ihre Abwägung ist der Termin selbst –
// sie werden aufgelistet, aber nicht bewertet.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import type { EventChoice, EventDef } from './events';
import { RIVAL_MARKS } from './trust';
import { DELANEY_READ_MARKS } from './investigation'; // 4.11 Andockpunkt

export type Verdict = 'stark' | 'gegenstueck' | 'schwach' | 'termin';

export interface ChoiceRelevance {
  event: string;
  choice: string;
  /** Wert der sofortigen Wirkung in $ (Geld, Öl, Kraft, Familie; mit Vorzeichen). */
  value: number;
  /** Wie stark die sofortige Wirkung ist: Summe der Beträge in $. */
  impact: number;
  /** Wert der dauerhaften Wirkungen in $ (Tarif, Fuhrwerke, Preis, Förderung, Pacht). */
  lasting: number;
  /** Merkzeichen, die später etwas abfragen. */
  consequences: string[];
  /** Merkzeichen, die nichts abfragt. */
  deadMarks: string[];
  /** Merkzeichen für ein späteres Kapitel (content/relevance.yaml). */
  laterMarks: string[];
  verdict: Verdict;
}

export interface RelevanceReport {
  threshold: number;
  choices: ChoiceRelevance[];
  /** Schwache Antworten: SCHWACH oder mit folgenlosem Merkzeichen. */
  weak: ChoiceRelevance[];
}

/** Merkzeichen, die die Simulation liest (Rivalen, Wegerechte der Pipeline). */
export function simReadMarks(balance: Balance): string[] {
  return [
    ...Object.values(RIVAL_MARKS),
    ...balance.transport.pipeline.rights.map((r) => r.mark),
    // 4.11 Andockpunkt: Delaney liest die Antworten auf seine Ereignisse, die Spuren und den Leumund.
    ...DELANEY_READ_MARKS,
    ...balance.investigation.traces.map((t) => t.mark),
    ...balance.investigation.goodMarks,
  ];
}

/**
 * Alle Merkzeichen, die etwas abfragt: Bedingungen der Ereignisse (marked, notMarked)
 * plus extra (Story-Bögen, Kapitelende, Simulation).
 */
export function readMarks(events: readonly EventDef[], extra: Iterable<string>): Set<string> {
  const out = new Set<string>(extra);
  for (const e of events) for (const m of [...e.marked, ...e.notMarked]) out.add(m);
  return out;
}

/** Schwelle in $, ab der eine Antwort spürbar ist. */
export function relevanceThreshold(balance: Balance): number {
  const r = balance.events.relevance;
  return Math.round(r.chapterMoney * r.minShare);
}

/** Die sofortigen Wirkungen in $: Geld, Öl zum Trendpreis, Kraft und Familie mit den Gewichten des Standard-Bots. */
function wirkungen(choice: Pick<EventChoice, 'effects'>, balance: Balance): number[] {
  const e = choice.effects;
  const w = balance.bots.events.balanced;
  return [
    e.cash ?? 0,
    (e.oilStock ?? 0) * balance.market.basePrice,
    (e.strength ?? 0) * w.strength,
    (e.ruth ?? 0) * w.family,
    (e.thomas ?? 0) * w.family,
  ];
}

/** Sofortige Wirkung in $ mit Vorzeichen (Gewinn minus Verlust). */
export function immediateValue(choice: Pick<EventChoice, 'effects'>, balance: Balance): number {
  return wirkungen(choice, balance).reduce((s, x) => s + x, 0);
}

/** Wie spürbar die sofortige Wirkung ist: Summe der Beträge in $. */
export function immediateImpact(choice: Pick<EventChoice, 'effects'>, balance: Balance): number {
  return wirkungen(choice, balance).reduce((s, x) => s + Math.abs(x), 0);
}

/**
 * Dauerhafte Wirkung in $ (Betrag, Vorzeichen egal – es geht nur um „spürbar“):
 * Bahntarif auf refBarrels über die halbe Kapitellänge, Preis und Förderung auf
 * refBarrels über timedRounds, Pacht auf refLeaseSpend, ein Gespann zum Kaufpreis,
 * Stillstand der Fuhrwerke als Mehrkosten des Mietfuhrwerks.
 */
export function lastingValue(choice: Pick<EventChoice, 'effects'>, balance: Balance): number {
  const e = choice.effects;
  const r = balance.events.relevance;
  const t = balance.transport;
  const runden = balance.events.timedRounds;
  const halbesKapitel = Math.ceil(balance.start.rounds / 2);
  return (
    Math.abs(e.railTariff ?? 0) * r.refBarrels * halbesKapitel +
    Math.abs(e.price ?? 0) * r.refBarrels * runden +
    Math.abs(e.production ?? 0) * r.refBarrels * runden * balance.market.basePrice +
    Math.abs(e.leaseCost ?? 0) * r.refLeaseSpend +
    Math.abs(e.teams ?? 0) * t.teams.hireCost +
    Math.max(0, e.teamsIdle ?? 0) * t.teams.capacity * (t.wagon.costPerBarrel - t.teams.costPerBarrel)
  );
}

/**
 * Bewertet alle Antworten aller Ereignisse. read: Merkzeichen, die etwas abfragt;
 * later: Merkzeichen, die erst ein späteres Kapitel abfragt (begründete Ausnahmen).
 */
export function analyzeRelevance(
  events: readonly EventDef[],
  read: ReadonlySet<string>,
  balance: Balance,
  later: ReadonlySet<string> = new Set(),
): RelevanceReport {
  const threshold = relevanceThreshold(balance);
  const choices: ChoiceRelevance[] = [];
  for (const event of events) {
    const roh = event.choices.map((c) => {
      const marks = [...c.marks, ...(c.marksIfForged ?? [])];
      const value = Math.round(immediateValue(c, balance));
      const impact = Math.round(immediateImpact(c, balance));
      const lasting = Math.round(lastingValue(c, balance));
      const consequences = marks.filter((m) => read.has(m));
      const laterMarks = marks.filter((m) => !read.has(m) && later.has(m));
      const deadMarks = marks.filter((m) => !read.has(m) && !later.has(m));
      const strong = impact >= threshold || lasting >= threshold || consequences.length > 0;
      return { event: event.id, choice: c.id, value, impact, lasting, consequences, deadMarks, laterMarks, strong };
    });
    const schwache = roh.filter((r) => !r.strong).length;
    const einStarker = roh.some((r) => r.strong);
    for (const { strong, ...r } of roh) {
      const verdict: Verdict = event.routine ? 'termin' : strong ? 'stark' : einStarker && schwache === 1 ? 'gegenstueck' : 'schwach';
      choices.push({ ...r, verdict });
    }
  }
  const weak = choices.filter((c) => c.verdict === 'schwach' || c.deadMarks.length > 0);
  return { threshold, choices, weak };
}

/** Eine Zeile für die Ausgabe, z. B. „moss_dank/annehmen: 300 $ – stark“. */
export function formatRelevance(c: ChoiceRelevance): string {
  const teile = [c.impact === Math.abs(c.value) ? `${c.value} $` : `${c.value} $ (Wirkung ${c.impact} $)`];
  if (c.lasting > 0) teile.push(`dauerhaft ~${c.lasting} $`);
  if (c.consequences.length > 0) teile.push(`Folge: ${c.consequences.join(', ')}`);
  if (c.laterMarks.length > 0) teile.push(`späteres Kapitel: ${c.laterMarks.join(', ')}`);
  if (c.deadMarks.length > 0) teile.push(`FOLGENLOS: ${c.deadMarks.join(', ')}`);
  const urteil = { stark: 'stark', gegenstueck: 'Gegenstück', schwach: 'SCHWACH', termin: 'fester Termin' }[c.verdict];
  return `${c.event}/${c.choice}: ${teile.join(' · ')} – ${urteil}`;
}

/** Begründete Ausnahmen (content/relevance.yaml): Merkzeichen, die erst ein späteres Kapitel abfragt. */
export interface RelevanceContent {
  later: { mark: string; reason: string }[];
}

/** Liest content/relevance.yaml; Fehler kommen mit Datei zurück. */
export function parseRelevanceContent(file: string, text: string): { content: RelevanceContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  if (doc.errors.length > 0) {
    for (const e of doc.errors) errors.push({ file, line: e.linePos?.[0]?.line ?? 1, message: `YAML kaputt: ${e.message.split('\n')[0]}` });
    return { content: null, errors };
  }
  const raw = doc.toJS() as { later?: unknown } | null;
  const liste = raw?.later;
  if (!Array.isArray(liste)) {
    errors.push({ file, line: 1, message: '„later“ fehlt – eine Liste von { mark, reason }.' });
    return { content: null, errors };
  }
  const later: RelevanceContent['later'] = [];
  liste.forEach((x: unknown, i) => {
    const e = x as { mark?: unknown; reason?: unknown };
    if (typeof e?.mark !== 'string' || !/^[a-z0-9_]+$/.test(e.mark) || typeof e.reason !== 'string' || e.reason.trim() === '') {
      errors.push({ file, line: 1, message: `later Nr. ${i + 1}: braucht mark (Kleinbuchstaben, Ziffern, _) und einen Grund (reason).` });
    } else later.push({ mark: e.mark, reason: e.reason });
  });
  return errors.length > 0 ? { content: null, errors } : { content: { later }, errors };
}

/** Inhaltsprüfung: Jedes Ausnahme-Merkzeichen muss eine Wahl setzen – sonst ist es ein Tippfehler. */
export function checkRelevanceMarks(file: string, content: RelevanceContent, catalog: readonly EventDef[]): ContentError[] {
  const gesetzt = new Set(catalog.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])])));
  return content.later
    .filter((l) => !gesetzt.has(l.mark))
    .map((l) => ({ file, line: 1, message: `later: Das Merkzeichen „${l.mark}“ setzt keine Wahl – Tippfehler?` }));
}
