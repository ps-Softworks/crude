// Einfache Dokumentenprüfung (2.5, GDD §3): Manche Briefe tragen ein Dokument –
// eine Pachturkunde, ein Geologengutachten –, daneben liegt ein Vergleichsstück
// (Grundbuchauszug, Bohrliste der Nachbarbohrung). Beim Eintreffen würfelt der
// Ereignis-Zufall, ob das Dokument gefälscht ist; wenn ja, steht in genau einem
// Feld ein falscher Wert. Mit der Lupe prüft Jacob einzelne Felder – höchstens
// events.documents.maxChecks je Dokument. Wer die Fälschung findet, bekommt
// zusätzliche Antworten (requiresFound). Wer sie übersieht und trotzdem zugreift,
// setzt verdeckte Merkzeichen (marksIfForged) – die Folge kommt Runden später.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { EventDef, EventResult } from './events';
import type { GameState } from './game';
import { DEFAULT_LANG, localize, type Lang, type LocalizedText } from './i18n';
import type { Rng } from './rng';

/** Ein Feld auf dem Dokument, z. B. die Parzellennummer. */
export interface DocumentField {
  id: string;
  label: LocalizedText;
  /** So steht es auf dem echten Dokument. */
  value: LocalizedText;
  /** So steht es im Vergleichsdokument; fehlt es, gibt es nichts zum Vergleichen. */
  reference?: LocalizedText;
  /** So steht es da, wenn genau dieses Feld gefälscht ist. Fehlt es, wird hier nie gefälscht. */
  forged?: LocalizedText;
}

export interface DocumentDef {
  /** Name des Dokuments, z. B. „Pachturkunde“. */
  title: LocalizedText;
  /** Name des Vergleichsdokuments, z. B. „Grundbuchauszug“. */
  reference: LocalizedText;
  /** Chance (0–1), dass es gefälscht ist; fehlt sie, gilt events.documents.forgeryChance. */
  forgeryChance?: number;
  fields: DocumentField[];
}

/** Zustand eines Dokuments im Posteingang. */
export interface DocState {
  /** Gefälschtes Feld oder null, wenn das Dokument echt ist. Verdeckt. */
  forgery: string | null;
  /** Mit der Lupe geprüfte Felder, in der Reihenfolge der Prüfung. */
  checked: string[];
}

/** Würfelt beim Eintreffen, ob und wo das Dokument gefälscht ist. Zieht nur Zufall, wenn es ein Dokument gibt. */
export function rollDocument(event: Pick<EventDef, 'document'>, balance: Balance, rng: Rng): DocState | null {
  const doc = event.document;
  if (!doc) return null;
  const faelschbar = doc.fields.filter((f) => f.forged);
  const chance = doc.forgeryChance ?? balance.events.documents.forgeryChance;
  const gefaelscht = faelschbar.length > 0 && rng.float() < chance;
  return { forgery: gefaelscht ? rng.pick(faelschbar).id : null, checked: [] };
}

/** Ist das Dokument dieses Ereignisses gefälscht? */
export function isForged(state: Pick<GameState, 'events'>, eventId: string): boolean {
  return (state.events.docs[eventId]?.forgery ?? null) !== null;
}

/** Hat Jacob die Fälschung mit der Lupe gefunden? */
export function forgeryFound(state: Pick<GameState, 'events'>, eventId: string): boolean {
  const doc = state.events.docs[eventId];
  return doc !== undefined && doc.forgery !== null && doc.checked.includes(doc.forgery);
}

/**
 * Wie oft die Lupe bei diesem Dokument noch geht. Erschöpft (2.7, Kraft unter
 * agenda.errorsBelow) prüft Jacob agenda.errorsCheckPenalty Felder weniger.
 */
export function checksLeft(state: Pick<GameState, 'events'> & Partial<Pick<GameState, 'strength'>>, balance: Balance, eventId: string): number {
  const muede = state.strength !== undefined && state.strength < balance.agenda.errorsBelow;
  const max = balance.events.documents.maxChecks - (muede ? balance.agenda.errorsCheckPenalty : 0);
  return Math.max(0, max - (state.events.docs[eventId]?.checked.length ?? 0));
}

/**
 * Lupe: Jacob prüft ein Feld des Dokuments gegen das Vergleichsstück. Kostet
 * keinen Termin, geht aber nur maxChecks-mal je Dokument. Eine gefundene
 * Fälschung kommt ins Protokoll.
 */
export function inspectField(
  state: GameState,
  balance: Balance,
  catalog: readonly EventDef[],
  eventId: string,
  fieldId: string,
  lang: Lang = DEFAULT_LANG,
): EventResult {
  if (state.finished) return { ok: false, reason: 'Das Kapitel ist zu Ende.' };
  const event = catalog.find((e) => e.id === eventId);
  const doc = state.events.docs[eventId];
  if (!event?.document || !doc || !state.events.pending.includes(eventId)) {
    return { ok: false, reason: 'Dieses Dokument liegt nicht auf dem Schreibtisch.' };
  }
  const field = event.document.fields.find((f) => f.id === fieldId);
  if (!field) return { ok: false, reason: 'Dieses Feld gibt es nicht.' };
  if (doc.checked.includes(fieldId)) return { ok: false, reason: 'Dieses Feld ist schon geprüft.' };
  if (checksLeft(state, balance, eventId) <= 0) {
    return {
      ok: false,
      reason: state.strength < balance.agenda.errorsBelow ? 'Jacobs Augen brennen – mehr prüft er heute nicht.' : 'Für mehr fehlt die Zeit – die Lupe bleibt liegen.',
    };
  }
  const docs = { ...state.events.docs, [eventId]: { ...doc, checked: [...doc.checked, fieldId] } };
  const log =
    doc.forgery === fieldId
      ? [
          ...state.log,
          `${formatDate(state)}: Fälschung entdeckt – ${localize(event.document.title, lang)}: ${localize(field.label, lang)} stimmt nicht mit ${localize(event.document.reference, lang)} überein.`,
        ]
      : state.log;
  return { ok: true, state: { ...state, log, events: { ...state.events, docs } } };
}

/** Wie das Feld nach der Lupe aussieht. */
export type FieldVerdict = 'unchecked' | 'ok' | 'forged';

export interface DeskDocumentField {
  id: string;
  label: string;
  /** Der Wert, wie er auf dem Dokument steht – bei einer Fälschung der falsche. */
  value: string;
  reference?: string;
  verdict: FieldVerdict;
}

export interface DeskDocument {
  title: string;
  reference: string;
  fields: DeskDocumentField[];
  checksLeft: number;
}

/** Das Dokument, wie der Schreibtisch es zeigt. Ob es gefälscht ist, verrät nur ein geprüftes Feld. */
export function deskDocument(
  state: Pick<GameState, 'events'>,
  balance: Balance,
  event: EventDef,
  lang: Lang = DEFAULT_LANG,
): DeskDocument | undefined {
  const def = event.document;
  const doc = state.events.docs[event.id];
  if (!def || !doc) return undefined;
  return {
    title: localize(def.title, lang),
    reference: localize(def.reference, lang),
    checksLeft: checksLeft(state, balance, event.id),
    fields: def.fields.map((f) => {
      const falsch = doc.forgery === f.id && f.forged;
      const verdict: FieldVerdict = !doc.checked.includes(f.id) ? 'unchecked' : doc.forgery === f.id ? 'forged' : 'ok';
      return {
        id: f.id,
        label: localize(f.label, lang),
        value: localize(falsch ? f.forged! : f.value, lang),
        ...(f.reference ? { reference: localize(f.reference, lang) } : {}),
        verdict,
      };
    }),
  };
}
