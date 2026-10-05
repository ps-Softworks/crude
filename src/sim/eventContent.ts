// Ereignisse aus YAML lesen und prüfen (2.1). Jede Datei in content/events/ ist
// eine Liste von Ereignissen. Fehler kommen mit Datei und Zeilennummer zurück,
// damit man beim Schreiben von Inhalten sofort sieht, wo es hakt. Diese Prüfung
// benutzt sowohl das Spiel beim Laden als auch npm run check:content.

import { LineCounter, parseDocument, type Document } from 'yaml';
import { CONDITION_KEYS, EFFECT_KEYS, MAIL_KINDS, RIVAL_IDS, type Conditions, type EventChoice, type EventDef, type Effects, type MailKind, type RivalId } from './events';
import type { DocumentDef, DocumentField } from './documents';
import { SIM_MARKS } from './family';
import { LANGUAGES, type LocalizedText } from './i18n';
import { RIVAL_SIM_MARKS } from './trust';
import { LOGISTICS_SIM_MARKS } from './logistics';
import { TIMESKIP_SIM_MARKS } from './timeskipMarks';
import { PUBLIC_ACTS, type PublicAct } from './world';
// 4.7 Andockpunkt: Merkzeichen, die die Fernleitungen setzen.
import { BIG_PIPELINE_SIM_MARKS } from './bigPipeline';
import { STAFF_SIM_MARKS } from './staff'; // 4.9 Andockpunkt: Merkzeichen des Personals
import { DIPLOMACY_SIM_MARKS } from './diplomacyCore'; // 4.10 Andockpunkt
import { DELANEY_SIM_MARKS } from './investigation'; // 4.11 Andockpunkt
// Termine als Hauptwerkzeug, Etappe 2: Merkzeichen der Preis- und Transport-Aktionen.
import { PRICING_SIM_MARKS } from './pricing';
import { FREIGHT_SIM_MARKS } from './freight';
// Etappe 3: Merkzeichen aus Jacobs Plänen, auf die gekoppelte Briefe warten.
import { LETTER_SIM_MARKS } from './letters';

export interface ContentError {
  file: string;
  /** Zeile in der Datei, ab 1. */
  line: number;
  message: string;
}

export function formatContentError(error: ContentError): string {
  return `${error.file}:${error.line}: ${error.message}`;
}

export interface ParsedEvents {
  events: EventDef[];
  errors: ContentError[];
}

const EVENT_KEYS = ['id', 'title', 'text', 'conditions', 'marked', 'notMarked', 'delay', 'chance', 'once', 'routine', 'appointments', 'choices', 'mail', 'deadline', 'document', 'certain', 'rival', 'cooldown', 'group', 'draft', 'ranch', 'visitor', 'tableau'];
const CHOICE_KEYS = ['id', 'label', 'result', 'requires', 'effects', 'marks', 'default', 'appointments', 'requiresFound', 'marksIfForged', 'sharp', 'unlocks', 'public'];
const DOCUMENT_KEYS = ['title', 'reference', 'forgeryChance', 'fields'];
const FIELD_KEYS = ['id', 'label', 'value', 'reference', 'forged'];
const ID_MUSTER = /^[a-z0-9_]+$/;

type Pfad = (string | number)[];

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function liste(keys: readonly string[]): string {
  return keys.join(', ');
}

/** Liest eine Datei mit Ereignissen. Bei Fehlern sind die Ereignisse leer. */
export function parseEventFile(file: string, text: string): ParsedEvents {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];

  if (doc.errors.length > 0) {
    for (const e of doc.errors) {
      const line = e.linePos?.[0]?.line ?? lineCounter.linePos(e.pos[0]).line;
      errors.push({ file, line, message: `YAML kaputt: ${e.message.split('\n')[0]}` });
    }
    return { events: [], errors };
  }

  /** Zeile eines Eintrags; fehlt er, die Zeile des nächsten Elternteils. */
  function zeile(pfad: Pfad): number {
    for (let n = pfad.length; n >= 0; n--) {
      const node = n === 0 ? doc.contents : (doc as Document).getIn(pfad.slice(0, n), true);
      const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
      if (range) return lineCounter.linePos(range[0]).line;
    }
    return 1;
  }

  function fehler(pfad: Pfad, message: string): void {
    errors.push({ file, line: zeile(pfad), message });
  }

  const raw: unknown = doc.toJS();
  if (raw === null || raw === undefined) return { events: [], errors };
  if (!Array.isArray(raw)) {
    fehler([], 'Die Datei muss eine Liste von Ereignissen sein (jedes beginnt mit „- id: …“).');
    return { events: [], errors };
  }

  function sprachtext(obj: Record<string, unknown>, key: string, pfad: Pfad, wer: string): LocalizedText | null {
    const value = obj[key];
    if (!istObjekt(value)) {
      fehler([...pfad, key], `${wer}: „${key}“ fehlt oder hat keine Sprachschlüssel (de: …, en: …).`);
      return null;
    }
    let ok = true;
    for (const k of Object.keys(value)) {
      if (!(LANGUAGES as readonly string[]).includes(k)) {
        fehler([...pfad, key, k], `${wer}: „${key}“ hat die unbekannte Sprache „${k}“ (erlaubt: ${liste(LANGUAGES)}).`);
        ok = false;
      }
    }
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler([...pfad, key], `${wer}: „${key}.de“ fehlt – der deutsche Text ist Pflicht.`);
      ok = false;
    }
    const en = value.en;
    if (en === undefined || (en !== null && typeof en !== 'string')) {
      fehler([...pfad, key], `${wer}: „${key}.en“ fehlt – darf leer sein (en: ""), muss aber da sein.`);
      ok = false;
    }
    return ok ? { de: value.de as string, en: typeof en === 'string' ? en : '' } : null;
  }

  function zahlen<K extends string>(
    obj: Record<string, unknown>,
    key: string,
    erlaubt: readonly K[],
    pfad: Pfad,
    wer: string,
  ): Partial<Record<K, number>> | null {
    const value = obj[key];
    if (value === undefined || value === null) return {};
    if (!istObjekt(value)) {
      fehler([...pfad, key], `${wer}: „${key}“ muss eine Liste von Name: Zahl sein.`);
      return null;
    }
    const out: Partial<Record<K, number>> = {};
    let ok = true;
    for (const [k, v] of Object.entries(value)) {
      if (!(erlaubt as readonly string[]).includes(k)) {
        fehler([...pfad, key, k], `${wer}: unbekannter Eintrag „${k}“ in „${key}“ (erlaubt: ${liste(erlaubt)}).`);
        ok = false;
      } else if (typeof v !== 'number' || !Number.isFinite(v)) {
        fehler([...pfad, key, k], `${wer}: „${key}.${k}“ muss eine Zahl sein.`);
        ok = false;
      } else {
        out[k as K] = v;
      }
    }
    return ok ? out : null;
  }

  /** Eine Liste von Merkzeichen, z. B. [moss_betrogen]. Fehlt sie, ist sie leer. */
  function namen(obj: Record<string, unknown>, key: string, pfad: Pfad, wer: string): string[] | null {
    const value = obj[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      fehler([...pfad, key], `${wer}: „${key}“ muss eine Liste sein, z. B. ${key}: [moss_betrogen].`);
      return null;
    }
    let ok = true;
    value.forEach((v, i) => {
      if (typeof v !== 'string' || !ID_MUSTER.test(v)) {
        fehler([...pfad, key, i], `${wer}: Merkzeichen in „${key}“ dürfen nur Kleinbuchstaben, Ziffern und _ enthalten.`);
        ok = false;
      }
    });
    return ok ? (value as string[]) : null;
  }

  /** Termine (2.3): eine ganze Zahl ab 0. Fehlt sie, gilt ersatz. */
  function termine(obj: Record<string, unknown>, pfad: Pfad, wer: string, ersatz: number | undefined): number | undefined | null {
    const value = obj.appointments;
    if (value === undefined || value === null) return ersatz;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      fehler([...pfad, 'appointments'], `${wer}: „appointments“ muss eine ganze Zahl ab 0 sein (Termine).`);
      return null;
    }
    return value;
  }

  function unbekannt(obj: Record<string, unknown>, erlaubt: string[], pfad: Pfad, wer: string): boolean {
    let ok = true;
    for (const k of Object.keys(obj)) {
      if (!erlaubt.includes(k)) {
        fehler([...pfad, k], `${wer}: unbekanntes Feld „${k}“ (erlaubt: ${liste(erlaubt)}).`);
        ok = false;
      }
    }
    return ok;
  }

  function wahl(raw: unknown, pfad: Pfad, ereignis: string): EventChoice | null {
    if (!istObjekt(raw)) {
      fehler(pfad, `${ereignis}: Jede Wahl braucht id, label und result.`);
      return null;
    }
    const id = raw.id;
    const wer = typeof id === 'string' ? `${ereignis}, Wahl „${id}“` : ereignis;
    let ok = unbekannt(raw, CHOICE_KEYS, pfad, wer);
    if (typeof id !== 'string' || !ID_MUSTER.test(id)) {
      fehler([...pfad, 'id'], `${wer}: „id“ fehlt oder enthält mehr als Kleinbuchstaben, Ziffern und _.`);
      ok = false;
    }
    const label = sprachtext(raw, 'label', pfad, wer);
    const result = sprachtext(raw, 'result', pfad, wer);
    const requires = zahlen(raw, 'requires', CONDITION_KEYS, pfad, wer) as Conditions | null;
    const effects = zahlen(raw, 'effects', EFFECT_KEYS, pfad, wer) as Effects | null;
    const marks = namen(raw, 'marks', pfad, wer);
    const appointments = termine(raw, pfad, wer, undefined);
    if (appointments === null) ok = false;
    if (raw.default !== undefined && typeof raw.default !== 'boolean') {
      fehler([...pfad, 'default'], `${wer}: „default“ muss true oder false sein.`);
      ok = false;
    }
    if (raw.requiresFound !== undefined && typeof raw.requiresFound !== 'boolean') {
      fehler([...pfad, 'requiresFound'], `${wer}: „requiresFound“ muss true oder false sein.`);
      ok = false;
    }
    if (raw.sharp !== undefined && typeof raw.sharp !== 'boolean') {
      fehler([...pfad, 'sharp'], `${wer}: „sharp“ muss true oder false sein.`);
      ok = false;
    }
    const marksIfForged = namen(raw, 'marksIfForged', pfad, wer);
    // Gebiete (0.2.15+5): Diese Wahl schaltet Gebiete aus content/map.yaml frei.
    const unlocks = namen(raw, 'unlocks', pfad, wer);
    // Öffentliches Handeln (4.2): Namen aus PUBLIC_ACTS (Zahlen in balance.yaml, worldModel.acts).
    const oeffentlich = namen(raw, 'public', pfad, wer);
    if (oeffentlich) {
      const fremd = oeffentlich.filter((a) => !(PUBLIC_ACTS as readonly string[]).includes(a));
      if (fremd.length > 0) {
        fehler([...pfad, 'public'], `${wer}: unbekannte Tat ${fremd.map((a) => `„${a}“`).join(', ')} in „public“ (erlaubt: ${liste(PUBLIC_ACTS)}).`);
        ok = false;
      }
    }
    if (!ok || !label || !result || !requires || !effects || !marks || !marksIfForged || !unlocks || !oeffentlich) return null;
    const choice: EventChoice = { id: id as string, label, result, requires, effects, default: raw.default === true, marks };
    if (appointments !== undefined && appointments !== null) choice.appointments = appointments;
    if (raw.requiresFound === true) choice.requiresFound = true;
    if (marksIfForged.length > 0) choice.marksIfForged = marksIfForged;
    if (raw.sharp === true) choice.sharp = true;
    if (unlocks.length > 0) choice.unlocks = unlocks;
    if (oeffentlich.length > 0) choice.public = oeffentlich as PublicAct[];
    return choice;
  }

  /** Dokumentenprüfung (2.5): das Dokument eines Briefs mit seinen Feldern. */
  function dokument(raw: unknown, pfad: Pfad, ereignis: string): DocumentDef | null {
    const wer = `${ereignis}, Dokument`;
    if (!istObjekt(raw)) {
      fehler(pfad, `${wer}: „document“ braucht title, reference und fields.`);
      return null;
    }
    let ok = unbekannt(raw, DOCUMENT_KEYS, pfad, wer);
    const title = sprachtext(raw, 'title', pfad, wer);
    const reference = sprachtext(raw, 'reference', pfad, wer);
    const chance = raw.forgeryChance;
    if (chance !== undefined && (typeof chance !== 'number' || chance < 0 || chance > 1)) {
      fehler([...pfad, 'forgeryChance'], `${wer}: „forgeryChance“ muss zwischen 0 und 1 liegen.`);
      ok = false;
    }
    const fieldsRaw = raw.fields;
    const fields: DocumentField[] = [];
    if (!Array.isArray(fieldsRaw) || fieldsRaw.length === 0) {
      fehler([...pfad, 'fields'], `${wer}: „fields“ fehlt – ein Dokument braucht mindestens ein Feld.`);
      ok = false;
    } else {
      fieldsRaw.forEach((f, i) => {
        const fp = [...pfad, 'fields', i];
        if (!istObjekt(f)) {
          fehler(fp, `${wer}: Jedes Feld braucht id, label und value.`);
          ok = false;
          return;
        }
        const fid = f.id;
        const fwer = typeof fid === 'string' ? `${wer}, Feld „${fid}“` : wer;
        if (!unbekannt(f, FIELD_KEYS, fp, fwer)) ok = false;
        if (typeof fid !== 'string' || !ID_MUSTER.test(fid)) {
          fehler([...fp, 'id'], `${fwer}: „id“ fehlt oder enthält mehr als Kleinbuchstaben, Ziffern und _.`);
          ok = false;
        } else if (fields.some((x) => x.id === fid)) {
          fehler([...fp, 'id'], `${fwer}: Das Feld gibt es doppelt.`);
          ok = false;
        }
        const label = sprachtext(f, 'label', fp, fwer);
        const value = sprachtext(f, 'value', fp, fwer);
        const ref = f.reference === undefined ? undefined : sprachtext(f, 'reference', fp, fwer);
        const forged = f.forged === undefined ? undefined : sprachtext(f, 'forged', fp, fwer);
        if (!label || !value || ref === null || forged === null) {
          ok = false;
          return;
        }
        const field: DocumentField = { id: fid as string, label, value };
        if (ref) field.reference = ref;
        if (forged) field.forged = forged;
        fields.push(field);
      });
    }
    if (!ok || !title || !reference) return null;
    const def: DocumentDef = { title, reference, fields };
    if (chance !== undefined) def.forgeryChance = chance as number;
    return def;
  }

  function ereignis(raw: unknown, pfad: Pfad): EventDef | null {
    if (!istObjekt(raw)) {
      fehler(pfad, 'Ein Ereignis muss Felder haben (id, title, text, chance, choices).');
      return null;
    }
    const id = raw.id;
    const wer = typeof id === 'string' ? `Ereignis „${id}“` : `Ereignis Nr. ${(pfad[0] as number) + 1}`;
    let ok = unbekannt(raw, EVENT_KEYS, pfad, wer);
    if (typeof id !== 'string' || !ID_MUSTER.test(id)) {
      fehler([...pfad, 'id'], `${wer}: „id“ fehlt oder enthält mehr als Kleinbuchstaben, Ziffern und _.`);
      ok = false;
    }
    const title = sprachtext(raw, 'title', pfad, wer);
    const body = sprachtext(raw, 'text', pfad, wer);
    const conditions = zahlen(raw, 'conditions', CONDITION_KEYS, pfad, wer) as Conditions | null;
    const marked = namen(raw, 'marked', pfad, wer);
    const notMarked = namen(raw, 'notMarked', pfad, wer);
    const delay = raw.delay ?? 1;
    if (typeof delay !== 'number' || !Number.isInteger(delay) || delay < 0) {
      fehler([...pfad, 'delay'], `${wer}: „delay“ muss eine ganze Zahl ab 0 sein (Runden nach dem Merkzeichen).`);
      ok = false;
    }
    if (raw.routine !== undefined && typeof raw.routine !== 'boolean') {
      fehler([...pfad, 'routine'], `${wer}: „routine“ muss true oder false sein.`);
      ok = false;
    }
    const routine = raw.routine === true;
    const appointments = termine(raw, pfad, wer, 1);
    if (appointments === null) ok = false;
    // Feste Termine und sichere Ereignisse (2.8) werden nicht gewürfelt: chance darf fehlen.
    const chance = raw.chance ?? (routine || raw.certain === true ? 1 : undefined);
    if (typeof chance !== 'number' || chance < 0 || chance > 1) {
      fehler([...pfad, 'chance'], `${wer}: „chance“ fehlt oder liegt nicht zwischen 0 und 1.`);
      ok = false;
    }
    if (raw.once !== undefined && typeof raw.once !== 'boolean') {
      fehler([...pfad, 'once'], `${wer}: „once“ muss true oder false sein.`);
      ok = false;
    }
    // Posteingang (2.4): Briefart und Frist.
    const mail = raw.mail;
    if (mail !== undefined && !(MAIL_KINDS as readonly unknown[]).includes(mail)) {
      fehler([...pfad, 'mail'], `${wer}: „mail“ muss eine Briefart sein (${liste(MAIL_KINDS)}).`);
      ok = false;
    }
    if (mail !== undefined && routine) {
      fehler([...pfad, 'mail'], `${wer}: Ein fester Termin (routine) kann kein Brief (mail) sein.`);
      ok = false;
    }
    const deadline = raw.deadline;
    if (deadline !== undefined && (typeof deadline !== 'number' || !Number.isInteger(deadline) || deadline < 1)) {
      fehler([...pfad, 'deadline'], `${wer}: „deadline“ muss eine ganze Zahl ab 1 sein (Frist in Runden).`);
      ok = false;
    }
    // Rivalen (2.8): sicher kommende Ereignisse und wer dahintersteckt.
    if (raw.certain !== undefined && typeof raw.certain !== 'boolean') {
      fehler([...pfad, 'certain'], `${wer}: „certain“ muss true oder false sein.`);
      ok = false;
    }
    if (raw.certain === true && routine) {
      fehler([...pfad, 'certain'], `${wer}: Ein fester Termin (routine) kann nicht „certain“ sein.`);
      ok = false;
    }
    const rival = raw.rival;
    if (rival !== undefined && !(RIVAL_IDS as readonly unknown[]).includes(rival)) {
      fehler([...pfad, 'rival'], `${wer}: „rival“ muss ein Rivale sein (${liste(RIVAL_IDS)}).`);
      ok = false;
    }
    // Wiederholungsschutz und Entwürfe (2.10a).
    const cooldown = raw.cooldown;
    if (cooldown !== undefined && (typeof cooldown !== 'number' || !Number.isInteger(cooldown) || cooldown < 0)) {
      fehler([...pfad, 'cooldown'], `${wer}: „cooldown“ muss eine ganze Zahl ab 0 sein (Runden Abstand).`);
      ok = false;
    }
    const group = raw.group;
    if (group !== undefined && (typeof group !== 'string' || !ID_MUSTER.test(group))) {
      fehler([...pfad, 'group'], `${wer}: „group“ darf nur Kleinbuchstaben, Ziffern und _ enthalten.`);
      ok = false;
    }
    if ((cooldown !== undefined || group !== undefined) && (routine || raw.certain === true)) {
      fehler([...pfad, cooldown !== undefined ? 'cooldown' : 'group'], `${wer}: Feste Termine (routine) und sichere Ereignisse (certain) haben keinen Wiederholungsschutz (cooldown, group).`);
      ok = false;
    }
    if (cooldown !== undefined && raw.once !== false && group === undefined) {
      fehler([...pfad, 'cooldown'], `${wer}: „cooldown“ wirkt nur bei „once: false“ oder mit „group“ – ein einmaliges Ereignis kommt ohnehin nicht wieder.`);
      ok = false;
    }
    // Karte (0.2.15+5): Figur, um deren Ranch es geht (figures in content/map.yaml).
    const ranch = raw.ranch;
    if (ranch !== undefined && (typeof ranch !== 'string' || !ID_MUSTER.test(ranch))) {
      fehler([...pfad, 'ranch'], `${wer}: „ranch“ muss die id einer Figur aus content/map.yaml sein (z. B. moss).`);
      ok = false;
    }
    // Auftritt (0.2.15+10): wer am Schreibtisch vorspricht (Figur aus content/figures.yaml)
    // oder ob das Ereignis als Vollbild-Szene kommt. Nur Darstellung – die Simulation
    // liest es nicht. Briefe und feste Termine haben ihren eigenen Platz.
    const visitor = raw.visitor;
    if (visitor !== undefined && (typeof visitor !== 'string' || !ID_MUSTER.test(visitor))) {
      fehler([...pfad, 'visitor'], `${wer}: „visitor“ muss die id einer Figur aus content/figures.yaml sein (z. B. silas).`);
      ok = false;
    }
    if (raw.tableau !== undefined && typeof raw.tableau !== 'boolean') {
      fehler([...pfad, 'tableau'], `${wer}: „tableau“ muss true oder false sein.`);
      ok = false;
    }
    if ((visitor !== undefined || raw.tableau === true) && (mail !== undefined || routine)) {
      fehler([...pfad, visitor !== undefined ? 'visitor' : 'tableau'], `${wer}: Briefe (mail) und feste Termine (routine) haben keinen Auftritt (visitor, tableau).`);
      ok = false;
    }
    if (visitor !== undefined && raw.tableau === true) {
      fehler([...pfad, 'tableau'], `${wer}: Entweder „visitor“ oder „tableau“ – nicht beides.`);
      ok = false;
    }
    if (raw.draft !== undefined && typeof raw.draft !== 'boolean') {
      fehler([...pfad, 'draft'], `${wer}: „draft“ muss true oder false sein.`);
      ok = false;
    }
    // Dokumentenprüfung (2.5).
    let document: DocumentDef | undefined;
    if (raw.document !== undefined) {
      const d = dokument(raw.document, [...pfad, 'document'], wer);
      if (d) document = d;
      else ok = false;
    }
    const choicesRaw = raw.choices;
    let choices: EventChoice[] = [];
    if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) {
      fehler([...pfad, 'choices'], `${wer}: „choices“ fehlt – ein Ereignis braucht mindestens eine Wahl.`);
      ok = false;
    } else {
      const gelesen = choicesRaw.map((c, i) => wahl(c, [...pfad, 'choices', i], wer));
      if (gelesen.some((c) => c === null)) ok = false;
      choices = gelesen.filter((c): c is EventChoice => c !== null);
      const ids = choices.map((c) => c.id);
      ids.forEach((cid, i) => {
        if (ids.indexOf(cid) !== i) {
          fehler([...pfad, 'choices', i, 'id'], `${wer}: Die Wahl „${cid}“ gibt es doppelt.`);
          ok = false;
        }
      });
      if (!document && raw.document === undefined) {
        choices.forEach((c, i) => {
          if (c.requiresFound || c.marksIfForged) {
            fehler([...pfad, 'choices', i], `${wer}: „requiresFound“ und „marksIfForged“ gehen nur bei einem Ereignis mit „document“.`);
            ok = false;
          }
        });
      }
      if (choices.filter((c) => c.default).length > 1) {
        fehler([...pfad, 'choices'], `${wer}: Höchstens eine Wahl darf „default: true“ haben.`);
        ok = false;
      }
    }
    if (!ok || !title || !body || !conditions || !marked || !notMarked) return null;
    const def: EventDef = {
      id: id as string,
      title,
      text: body,
      conditions,
      marked,
      notMarked,
      delay: delay as number,
      chance: chance as number,
      once: raw.once !== false,
      routine,
      appointments: appointments as number,
      choices,
    };
    if (mail !== undefined) def.mail = mail as MailKind;
    if (deadline !== undefined) def.deadline = deadline as number;
    if (document) def.document = document;
    if (raw.certain === true) def.certain = true;
    if (rival !== undefined) def.rival = rival as RivalId;
    if (ranch !== undefined) def.ranch = ranch as string;
    if (visitor !== undefined) def.visitor = visitor as string;
    if (raw.tableau === true) def.tableau = true;
    if (cooldown !== undefined) def.cooldown = cooldown as number;
    if (group !== undefined) def.group = group as string;
    if (raw.draft === true) def.draft = true;
    return def;
  }

  const events: EventDef[] = [];
  raw.forEach((entry, i) => {
    const event = ereignis(entry, [i]);
    if (!event) return;
    if (events.some((e) => e.id === event.id)) {
      fehler([i, 'id'], `Ereignis „${event.id}“ gibt es in dieser Datei doppelt.`);
      return;
    }
    events.push(event);
  });
  return errors.length > 0 ? { events: [], errors } : { events, errors };
}

/**
 * Liest alle Ereignis-Dateien. Eine ID darf es nur einmal geben – auch über
 * Dateien hinweg. Die Reihenfolge der Dateien bestimmt die Reihenfolge im Katalog.
 */
export function parseEventFiles(files: readonly { file: string; text: string }[]): ParsedEvents {
  const events: EventDef[] = [];
  const errors: ContentError[] = [];
  const herkunft = new Map<string, string>();
  for (const { file, text } of files) {
    const parsed = parseEventFile(file, text);
    errors.push(...parsed.errors);
    for (const event of parsed.events) {
      const frueher = herkunft.get(event.id);
      if (frueher) {
        const line = text.split('\n').findIndex((l) => new RegExp(`id:\\s*['"]?${event.id}['"]?\\s*$`).test(l)) + 1;
        errors.push({ file, line: Math.max(1, line), message: `Ereignis „${event.id}“ gibt es schon in ${frueher}.` });
      } else {
        herkunft.set(event.id, file);
        events.push(event);
      }
    }
  }
  // Ein Merkzeichen, das keine Wahl setzt, ist fast immer ein Tippfehler – das
  // Ereignis käme sonst nie (bzw. würde nie gesperrt).
  // Merkzeichen der Simulation selbst (2.7: thomas_geboren, 2.8: bullard_verraten) zählen auch als gesetzt.
  // 4.7 Andockpunkt: BIG_PIPELINE_SIM_MARKS. 4.9 Andockpunkt: STAFF_SIM_MARKS. 4.10 Andockpunkt: DIPLOMACY_SIM_MARKS.
  // 4.11 Andockpunkt: DELANEY_SIM_MARKS (Delaney im Amt, Gerücht, Vorermittlung, Anklage, Urteil).
  // Zeitsprung I (4.5): TIMESKIP_SIM_MARKS (Clara, Benzin, Okara …); Zeitsprung II (noch nicht gebaut): ZEITSPRUNG_MARKS.
  const gesetzt = new Set<string>([...SIM_MARKS, ...RIVAL_SIM_MARKS, ...LOGISTICS_SIM_MARKS, ...BIG_PIPELINE_SIM_MARKS, ...STAFF_SIM_MARKS, ...DIPLOMACY_SIM_MARKS, ...DELANEY_SIM_MARKS, ...TIMESKIP_SIM_MARKS, ...ZEITSPRUNG_MARKS, ...PRICING_SIM_MARKS, ...FREIGHT_SIM_MARKS, ...LETTER_SIM_MARKS, ...events.flatMap((e) => e.choices.flatMap((c) => [...c.marks, ...(c.marksIfForged ?? [])]))]);
  for (const event of events) {
    for (const m of [...event.marked, ...event.notMarked]) {
      if (gesetzt.has(m)) continue;
      const file = herkunft.get(event.id)!;
      const text = files.find((f) => f.file === file)?.text ?? '';
      const line = text.split('\n').findIndex((l) => /^\s*(marked|notMarked)\s*:/.test(l) && l.includes(m)) + 1;
      errors.push({
        file,
        line: Math.max(1, line),
        message: `Ereignis „${event.id}“: Das Merkzeichen „${m}“ setzt keine Wahl (marks: [${m}]) – Tippfehler?`,
      });
    }
  }
  errors.push(...groupErrors(events, files, herkunft));
  return errors.length > 0 ? { events: [], errors } : { events, errors };
}

/**
 * Gruppen in Kapitel 1 (Etappe 3: Briefe zusammenlegen): Varianten einer Gruppe halten gemeinsam Abstand –
 * „höchstens einmal in N Runden“. Das geht nur, wenn alle denselben Abstand (cooldown) nennen;
 * sonst hinge es davon ab, welche Variante zuletzt kam.
 */
function groupErrors(events: readonly EventDef[], files: readonly { file: string; text: string }[], herkunft: Map<string, string>): ContentError[] {
  const out: ContentError[] = [];
  const gruppen = new Map<string, EventDef[]>();
  // Nur Kapitel 1 (ohne minChapter): Die Gruppen der Kapitel 2/3 sind Entwurf und noch nicht nachgezogen
  // (k2_raffinerie mischt 4 und 5 Runden).
  for (const e of events) if (e.group && e.conditions.minChapter === undefined) gruppen.set(e.group, [...(gruppen.get(e.group) ?? []), e]);
  for (const [name, liste] of gruppen) {
    const abstaende = new Set(liste.map((e) => e.cooldown ?? 'Standard'));
    if (abstaende.size <= 1) continue;
    const e = liste[liste.length - 1];
    const file = herkunft.get(e.id)!;
    const text = files.find((f) => f.file === file)?.text ?? '';
    const line = text.split('\n').findIndex((l) => new RegExp(`id:\\s*['"]?${e.id}['"]?\\s*$`).test(l)) + 1;
    out.push({
      file,
      line: Math.max(1, line),
      message: `Gruppe „${name}“: Alle Varianten brauchen denselben Abstand (cooldown) – gefunden ${[...abstaende].join(', ')} (${liste.map((x) => x.id).join(', ')}).`,
    });
  }
  return out;
}

/**
 * Merkzeichen, die Zeitsprung II (Story-Bibel §2, noch nicht gebaut) setzen soll, aber noch keine
 * Wahl: Kapitel-3-Ereignisse fragen sie schon ab (k3_reserveland, k3_reserveland_folge). Eine feste
 * Liste statt eines Präfixes, damit Tippfehler weiter auffallen. Sobald die Zeitsprung-Ereignisse
 * die Merkzeichen selbst setzen, kann der Eintrag weg.
 */
export const ZEITSPRUNG_MARKS: readonly string[] = ['zs2_grady_reserveland', 'zs2_grady_abgelehnt'];

export class ContentLoadError extends Error {
  constructor(public errors: ContentError[]) {
    super(`Inhalte sind kaputt:\n${errors.map(formatContentError).join('\n')}`);
  }
}

/** Wie parseEventFiles, wirft aber bei Fehlern – für das Spiel beim Laden. */
export function loadEventCatalog(files: readonly { file: string; text: string }[]): EventDef[] {
  const parsed = parseEventFiles(files);
  if (parsed.errors.length > 0) throw new ContentLoadError(parsed.errors);
  return parsed.events;
}
