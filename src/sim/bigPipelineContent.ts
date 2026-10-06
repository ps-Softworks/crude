// Briefe der Fernleitungen (4.7): Texte aus content/pipelines.yaml prüfen und
// einen Brief der Simulation (PipelineLetter) in Text verwandeln. Kein Zufall,
// keine Regel – nur Inhalte.

import { parseDocument } from 'yaml';
import { LANDOWNER_TYPES } from './balance';
import type { LetterKind, PipelineLetter } from './bigPipeline';
import type { ContentError } from './eventContent';
import { DEFAULT_LANG, LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';

export const LETTER_KINDS: readonly LetterKind[] = ['accepted', 'refused', 'holdout', 'courtWon', 'courtLost', 'thorneCut', 'sabotage', 'ready', 'intimidated'];

/** Erlaubte Absender je Art: default plus Landbesitzer-Arten, Stadtrat und Thorne. */
const SENDERS: readonly string[] = ['default', ...LANDOWNER_TYPES, 'stadt', 'thorne'];

/** Texte der Oberfläche (Abschnitt „ui“): jeder Schlüssel ist Pflicht. */
export const UI_KEYS = [
  'noProjects',
  'sketchLabel',
  'statusOpen',
  'statusAsked',
  'statusGranted',
  'statusRefused',
  'statusHoldout',
  'statusDetour',
  'statusExpropriated',
  'statusCourt',
  'ownLand',
  'demands',
  'verdict',
  'offerLow',
  'offerFair',
  'offerGenerous',
  'chanceGood',
  'chanceUnsure',
  'chancePoor',
  'chanceAtFair',
  'miles',
  'roundOne',
  'roundMany',
  'planTitle',
  'from',
  'to',
  'fromSmall',
  'fromSmallLocked',
  'planSummary',
  'hintBypass',
  'hintRail',
  'survey',
  'benefitGain',
  'benefitNone',
  'pay',
  'detour',
  'sue',
  'expropriate',
  'projectTitle',
  'rightsOpenOne',
  'rightsOpenMany',
  'rightsDone',
  'buildCost',
  'building',
  'readyHarbor',
  'readyRail',
  'damaged',
  'startBuild',
  'abandon',
  'guardsOff',
  'guardsOn',
  'sabotageRisk',
  'tariffLine',
  'pressureFull',
  'pressurePartial',
  'pressureLine',
  'fixedCosts',
  'postTitle',
  'letterRound',
  'debugOn',
  'debugUnlock',
] as const;
export type UiKey = (typeof UI_KEYS)[number];

export type PipelineContent = { letters: Record<LetterKind, Record<string, LocalizedText>>; ui: Record<UiKey, LocalizedText> };

function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parsePipelineContent(file: string, text: string): { content: PipelineContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  const zeile = (needle: string) => Math.max(1, text.split('\n').findIndex((l) => l.includes(needle)) + 1);
  if (!istObjekt(raw) || !istObjekt(raw.letters)) {
    fehler('Die Datei braucht „letters“.');
    return { content: null, errors };
  }
  const letters: Partial<Record<LetterKind, Record<string, LocalizedText>>> = {};
  const unbekannt = Object.keys(raw.letters).filter((k) => !(LETTER_KINDS as readonly string[]).includes(k));
  for (const k of unbekannt) fehler(`letters: unbekannte Art „${k}“ (erlaubt: ${LETTER_KINDS.join(', ')}).`, zeile(`${k}:`));
  for (const kind of LETTER_KINDS) {
    const block = raw.letters[kind];
    if (!istObjekt(block)) {
      fehler(`letters.${kind} fehlt.`);
      continue;
    }
    const out: Record<string, LocalizedText> = {};
    for (const [sender, value] of Object.entries(block)) {
      const wo = `letters.${kind}.${sender}`;
      if (!SENDERS.includes(sender)) {
        fehler(`${wo}: unbekannter Absender (erlaubt: ${SENDERS.join(', ')}).`, zeile(`${sender}:`));
        continue;
      }
      if (!istObjekt(value) || typeof value.de !== 'string' || value.de.trim() === '') {
        fehler(`${wo}: deutscher Text fehlt.`, zeile(`${sender}:`));
        continue;
      }
      const fremd = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
      if (fremd.length > 0) fehler(`${wo}: unbekannte Sprache ${fremd.join(', ')}.`, zeile(`${sender}:`));
      if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
      out[sender] = { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
    }
    if (!out.default) fehler(`letters.${kind}: „default“ fehlt.`);
    letters[kind] = out;
  }
  const ui: Partial<Record<UiKey, LocalizedText>> = {};
  const uiRaw = raw.ui;
  if (!istObjekt(uiRaw)) fehler('Die Datei braucht „ui“.');
  else {
    for (const k of Object.keys(uiRaw)) if (!(UI_KEYS as readonly string[]).includes(k)) fehler(`ui: unbekannter Schlüssel „${k}“.`, zeile(`${k}:`));
    for (const key of UI_KEYS) {
      const value = uiRaw[key];
      if (!istObjekt(value) || typeof value.de !== 'string' || value.de === '') {
        fehler(`ui.${key}: deutscher Text fehlt.`, zeile(`${key}:`));
        continue;
      }
      const fremd = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
      if (fremd.length > 0) fehler(`ui.${key}: unbekannte Sprache ${fremd.join(', ')}.`, zeile(`${key}:`));
      if (value.en !== undefined && typeof value.en !== 'string') fehler(`ui.${key}: englischer Text muss Text sein.`);
      ui[key] = { de: value.de, en: typeof value.en === 'string' ? value.en : '' };
    }
  }
  return errors.length > 0 ? { content: null, errors } : { content: { letters: letters as PipelineContent['letters'], ui: ui as PipelineContent['ui'] }, errors };
}

function betrag(amount: number, kind: LetterKind): string {
  return kind === 'thorneCut'
    ? amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount.toLocaleString('de-DE', { maximumFractionDigits: 0 });
}

/** Der Text eines Briefs: Absender-Variante, sonst default; Platzhalter gefüllt. */
export function letterText(content: PipelineContent, letter: PipelineLetter, lang: Lang = DEFAULT_LANG): string {
  const varianten = content.letters[letter.kind];
  const text = varianten[letter.party] ?? varianten.default;
  return localize(text, lang)
    .replaceAll('{owner}', letter.owner)
    .replaceAll('{ranch}', letter.ranch)
    .replaceAll('{amount}', betrag(letter.amount, letter.kind));
}

/** Ein Oberflächentext mit gefüllten Platzhaltern ({name}). */
export function uiText(content: PipelineContent, key: UiKey, vars: Record<string, string | number> = {}, lang: Lang = DEFAULT_LANG): string {
  let text = localize(content.ui[key], lang);
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
