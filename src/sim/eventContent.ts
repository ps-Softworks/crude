// Ereignisse aus YAML lesen und prüfen (2.1). Jede Datei in content/events/ ist
// eine Liste von Ereignissen. Fehler kommen mit Datei und Zeilennummer zurück,
// damit man beim Schreiben von Inhalten sofort sieht, wo es hakt. Diese Prüfung
// benutzt sowohl das Spiel beim Laden als auch npm run check:content.

import { LineCounter, parseDocument, type Document } from 'yaml';
import { CONDITION_KEYS, EFFECT_KEYS, type Conditions, type EventChoice, type EventDef, type Effects } from './events';
import { LANGUAGES, type LocalizedText } from './i18n';

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

const EVENT_KEYS = ['id', 'title', 'text', 'conditions', 'chance', 'once', 'choices'];
const CHOICE_KEYS = ['id', 'label', 'result', 'requires', 'effects', 'default'];
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
    if (raw.default !== undefined && typeof raw.default !== 'boolean') {
      fehler([...pfad, 'default'], `${wer}: „default“ muss true oder false sein.`);
      ok = false;
    }
    if (!ok || !label || !result || !requires || !effects) return null;
    return { id: id as string, label, result, requires, effects, default: raw.default === true };
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
    const chance = raw.chance;
    if (typeof chance !== 'number' || chance < 0 || chance > 1) {
      fehler([...pfad, 'chance'], `${wer}: „chance“ fehlt oder liegt nicht zwischen 0 und 1.`);
      ok = false;
    }
    if (raw.once !== undefined && typeof raw.once !== 'boolean') {
      fehler([...pfad, 'once'], `${wer}: „once“ muss true oder false sein.`);
      ok = false;
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
      if (choices.filter((c) => c.default).length > 1) {
        fehler([...pfad, 'choices'], `${wer}: Höchstens eine Wahl darf „default: true“ haben.`);
        ok = false;
      }
    }
    if (!ok || !title || !body || !conditions) return null;
    return { id: id as string, title, text: body, conditions, chance: chance as number, once: raw.once !== false, choices };
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
  return errors.length > 0 ? { events: [], errors } : { events, errors };
}

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
