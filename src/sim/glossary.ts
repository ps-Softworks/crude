// Glossar (0.4.20+42): Begriffe der Epoche und des Spiels aus content/glossar.yaml.
// Keine Spielregel – nur Lesen und Prüfen der Texte, die die Oberfläche zeigt.

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import { LANGUAGES, type LocalizedText } from './i18n';

export interface GlossaryEntry {
  id: string;
  term: LocalizedText;
  text: LocalizedText;
  /** Kennungen verwandter Begriffe. */
  see: string[];
}

export interface Glossary {
  entries: GlossaryEntry[];
}

const ID = /^[a-z][a-z0-9_]*$/;

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Liest content/glossar.yaml; Fehler mit Datei und (wo möglich) Zeile. */
export function parseGlossary(file: string, text: string): { content: Glossary | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string) => errors.push({ file, line: 1, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) errors.push({ file, line: e.linePos?.[0]?.line ?? 1, message: `YAML kaputt: ${e.message.split('\n')[0]}` });
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  const liste = istObjekt(raw) ? raw.begriffe : undefined;
  if (!Array.isArray(liste) || liste.length === 0) {
    fehler('begriffe: fehlt oder ist keine Liste.');
    return { content: null, errors };
  }

  const entries: GlossaryEntry[] = [];
  const ids = new Set<string>();
  liste.forEach((e: unknown, i: number) => {
    const wo = `begriffe[${i}]`;
    if (!istObjekt(e)) return fehler(`${wo}: kein Eintrag.`);
    const id = e.id;
    if (typeof id !== 'string' || !ID.test(id)) return fehler(`${wo}: id fehlt oder ist ungültig (nur a–z, Ziffern, _).`);
    if (ids.has(id)) return fehler(`${wo}: id „${id}“ kommt doppelt vor.`);
    ids.add(id);
    const sprachtext = (feld: 'term' | 'text'): LocalizedText | null => {
      const v = e[feld];
      if (!istObjekt(v)) {
        fehler(`${id}.${feld}: fehlt oder braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
        return null;
      }
      const fremd = Object.keys(v).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
      if (fremd.length > 0) fehler(`${id}.${feld}: unbekannte Sprache ${fremd.join(', ')}.`);
      // Anders als sonst im Spiel: Das Glossar liefert beide Sprachen vollständig.
      for (const lang of LANGUAGES) {
        if (typeof v[lang] !== 'string' || (v[lang] as string).trim() === '') {
          fehler(`${id}.${feld}: Text (${lang}) fehlt.`);
          return null;
        }
      }
      return { de: v.de as string, en: v.en as string };
    };
    const term = sprachtext('term');
    const erklaerung = sprachtext('text');
    if (erklaerung) {
      const saetze = erklaerung.de.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== '').length;
      if (saetze > 3) fehler(`${id}.text: höchstens zwei, im Notfall drei Sätze (sind ${saetze}).`);
    }
    const see = e.see === undefined ? [] : e.see;
    if (!Array.isArray(see) || !see.every((s) => typeof s === 'string')) return fehler(`${id}.see: muss eine Liste von Kennungen sein.`);
    if (term && erklaerung) entries.push({ id, term, text: erklaerung, see: see as string[] });
  });
  for (const e of entries) {
    for (const s of e.see) {
      if (s === e.id) fehler(`${e.id}.see: verweist auf sich selbst.`);
      else if (!ids.has(s)) fehler(`${e.id}.see: unbekannter Begriff „${s}“.`);
    }
  }
  if (errors.length > 0) return { content: null, errors };
  return { content: { entries }, errors };
}

/** Alphabetisch nach dem deutschen Begriff (Umlaute einsortiert wie ihre Grundbuchstaben). */
export function sortedGlossary(glossary: Glossary): GlossaryEntry[] {
  return [...glossary.entries].sort((a, b) => a.term.de.localeCompare(b.term.de, 'de'));
}

/** Treffer für die Suche: im Begriff oder in der Erklärung, ohne Groß-/Kleinschreibung. */
export function searchGlossary(entries: readonly GlossaryEntry[], query: string): GlossaryEntry[] {
  const q = query.trim().toLocaleLowerCase('de');
  if (q === '') return [...entries];
  return entries.filter((e) => [e.term.de, e.term.en, e.text.de].some((t) => t.toLocaleLowerCase('de').includes(q)));
}
