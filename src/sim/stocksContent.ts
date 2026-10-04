// 4.8 Aktien, Aufsichtsrat, Anleihen: liest content/stocks.yaml (Räte, Thornes Mann,
// Strohmänner, Agenden, Forderungstexte) und setzt Namen für die Anzeige ein.

import { parseDocument } from 'yaml';
import type { ContentError } from './eventContent';
import { LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import { AGENDAS, DEMAND_KINDS, MEMBER_MOODS, type MemberMood, type BoardMember, type BoardSeatDef, type Demand, type DemandKind, type ShareBlock } from './stocks';

export interface BoardSeatContent extends BoardSeatDef {
  name: LocalizedText;
  role: LocalizedText;
}

export interface StocksContent {
  draft: boolean;
  board: BoardSeatContent[];
  thorne: { name: LocalizedText; cover: LocalizedText; revealed: LocalizedText };
  straw: string[];
  agendas: Record<(typeof AGENDAS)[number], LocalizedText>;
  demands: Record<DemandKind, LocalizedText>;
  moods: Record<MemberMood, LocalizedText>;
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/stocks.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseStocksContent(file: string, text: string, minSeats = 9): { content: StocksContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht board, thorne, straw, agendas, demands und moods.');
    return { content: null, errors };
  }
  const leer: LocalizedText = { de: '', en: '' };
  function sprachtext(value: unknown, wo: string): LocalizedText {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return leer;
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') {
      fehler(`${wo}: deutscher Text fehlt.`);
      return leer;
    }
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: value.de.trim(), en: typeof value.en === 'string' ? value.en.trim() : '' };
  }
  if (raw.draft !== undefined && typeof raw.draft !== 'boolean') fehler('draft: muss true oder false sein.');

  const board: BoardSeatContent[] = [];
  if (!Array.isArray(raw.board)) fehler('board: muss eine Liste von Räten sein.');
  else {
    const ids = new Set<string>();
    raw.board.forEach((m: unknown, i) => {
      const wo = `board[${i}]`;
      if (!istObjekt(m)) return void fehler(`${wo}: muss ein Rat mit id, agenda, loyalty, name und role sein.`);
      const id = typeof m.id === 'string' && /^[a-z0-9_]+$/.test(m.id) ? m.id : '';
      if (!id) fehler(`${wo}.id: Kennung aus Kleinbuchstaben fehlt.`);
      else if (ids.has(id)) fehler(`${wo}.id: „${id}“ kommt doppelt vor.`);
      ids.add(id);
      if (!(AGENDAS as readonly unknown[]).includes(m.agenda)) fehler(`${wo}.agenda: erlaubt sind ${AGENDAS.join(', ')}.`);
      if (typeof m.loyalty !== 'number' || m.loyalty < 0 || m.loyalty > 100) fehler(`${wo}.loyalty: Zahl von 0 bis 100.`);
      board.push({
        id,
        agenda: m.agenda as BoardSeatContent['agenda'],
        loyalty: typeof m.loyalty === 'number' ? m.loyalty : 50,
        name: sprachtext(m.name, `${wo}.name`),
        role: sprachtext(m.role, `${wo}.role`),
      });
    });
    if (board.length < minSeats) fehler(`board: mindestens ${minSeats} Räte nötig (so viele Sitze kann der Aufsichtsrat haben).`);
  }

  const t = istObjekt(raw.thorne) ? raw.thorne : {};
  if (!istObjekt(raw.thorne)) fehler('Block „thorne“ fehlt.');
  const thorne = { name: sprachtext(t.name, 'thorne.name'), cover: sprachtext(t.cover, 'thorne.cover'), revealed: sprachtext(t.revealed, 'thorne.revealed') };

  const straw = Array.isArray(raw.straw) ? raw.straw.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  if (straw.length === 0) fehler('straw: Liste mit Namen der Strohmänner fehlt.');

  const a = istObjekt(raw.agendas) ? raw.agendas : {};
  if (!istObjekt(raw.agendas)) fehler('Block „agendas“ fehlt.');
  const agendas = {} as StocksContent['agendas'];
  for (const k of AGENDAS) agendas[k] = sprachtext(a[k], `agendas.${k}`);

  const d = istObjekt(raw.demands) ? raw.demands : {};
  if (!istObjekt(raw.demands)) fehler('Block „demands“ fehlt.');
  const demands = {} as StocksContent['demands'];
  for (const k of DEMAND_KINDS) demands[k] = sprachtext(d[k], `demands.${k}`);

  const mo = istObjekt(raw.moods) ? raw.moods : {};
  if (!istObjekt(raw.moods)) fehler('Block „moods“ fehlt.');
  const moods = {} as StocksContent['moods'];
  for (const k of MEMBER_MOODS) moods[k] = sprachtext(mo[k], `moods.${k}`);

  if (errors.length > 0) return { content: null, errors };
  return { content: { draft: raw.draft === true, board, thorne, straw, agendas, demands, moods }, errors };
}

/** Name des Strohmanns eines Blocks. */
export function strawName(content: StocksContent, block: Pick<ShareBlock, 'straw'>): string {
  return content.straw[block.straw % content.straw.length];
}

/** Name, Rolle und Agenda eines Rats für die Anzeige. Thornes Leute zeigen ihre Tarnung, bis sie enttarnt sind. */
export function memberLabel(content: StocksContent, member: BoardMember, isRevealed: boolean, lang?: Lang): { name: string; role: string; agenda: string } {
  if (member.agenda === 'spy') {
    const nr = Number(member.id.split('-')[1] ?? 1);
    const name = nr <= 1 ? localize(content.thorne.name, lang) : `${localize(content.thorne.name, lang).split(' ')[0]}s Partner ${nr - 1}`;
    return { name, role: localize(isRevealed ? content.thorne.revealed : content.thorne.cover, lang), agenda: isRevealed ? localize(content.thorne.revealed, lang) : localize(content.agendas.price, lang) };
  }
  const def = content.board.find((b) => b.id === member.id);
  return {
    name: def ? localize(def.name, lang) : member.id,
    role: def ? localize(def.role, lang) : '',
    agenda: localize(content.agendas[member.agenda], lang),
  };
}

/** Text einer Forderung mit eingesetzten Werten. */
export function demandText(content: StocksContent, demand: Demand, memberName: string, lang?: Lang): string {
  const betrag = `${demand.target.toLocaleString('de-DE')} $`;
  const werte: Record<string, string> = { name: memberName, betrag, anzahl: String(demand.target), runde: String(demand.due) };
  return localize(content.demands[demand.kind], lang).replace(/\{(\w+)\}/g, (ganz, key: string) => werte[key] ?? ganz);
}
