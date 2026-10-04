// Was auf dem Schreibtisch liegt (0.2.15+9): verteilt die offenen Ereignisse aus
// src/sim auf Briefe, Besucher, Vorfälle, Tableaus und Termine und zählt für die
// Abzeichen. Reines Filtern und Zählen – welche Ereignisse offen sind, wann eine
// Frist abläuft und was eine Antwort kostet, entscheidet allein die Simulation.

import type { AgendaView } from '../sim/agenda';
import type { DeskEvent } from '../sim/events';
import type { SheetId } from './sceneState';

/** Wie ein Ereignis ohne Brief auftritt (ab Etappe 2 aus content/visitors.yaml). */
export type Appearance = { kind: 'visitor'; figure: string } | { kind: 'tableau' };

export interface Inbox {
  /** Briefe, dringende zuerst (Reihenfolge aus deskMail). */
  letters: DeskEvent[];
  /** Besucher in der Reihenfolge, in der sie auf dem Schreibtisch liegen. */
  visitors: DeskEvent[];
  tableaus: DeskEvent[];
  /** Alles ohne Brief und ohne Auftritt: Zettel am Notizspieß. */
  incidents: DeskEvent[];
  /** Feste Termine, die diese Runde noch gingen. */
  routines: DeskEvent[];
}

export function sortInbox(
  pending: readonly DeskEvent[],
  mail: readonly DeskEvent[],
  routines: readonly DeskEvent[],
  appearances: Readonly<Record<string, Appearance>> = {},
): Inbox {
  const ohneBrief = pending.filter((e) => !e.mail);
  return {
    letters: [...mail],
    visitors: ohneBrief.filter((e) => appearances[e.id]?.kind === 'visitor'),
    tableaus: ohneBrief.filter((e) => appearances[e.id]?.kind === 'tableau'),
    incidents: ohneBrief.filter((e) => !appearances[e.id]),
    routines: [...routines],
  };
}

export interface Badge {
  count: number;
  /** Mindestens eine Frist läuft in dieser Runde ab. */
  urgent: boolean;
}

function badge(list: readonly DeskEvent[]): Badge {
  return { count: list.length, urgent: list.some((e) => e.urgent) };
}

export interface InboxBadges {
  post: Badge;
  vorfaelle: Badge;
  termine: Badge;
  tuer: Badge;
}

export function inboxBadges(inbox: Inbox): InboxBadges {
  return {
    post: badge(inbox.letters),
    vorfaelle: badge([...inbox.incidents, ...inbox.tableaus]),
    termine: badge(inbox.routines),
    tuer: badge(inbox.visitors),
  };
}

/** Eine Zeile in „Noch offen“ an der Glocke. */
export interface OpenItem {
  /** Wohin „Hingehen“ führt. */
  target: SheetId | 'tuer';
  text: string;
  urgent: boolean;
}

function anzahl(n: number, eins: string, viele: string): string {
  return n === 1 ? `1 ${eins}` : `${n} ${viele}`;
}

/** Was vor dem Rundenende noch offen liegt. Gesperrt wird nichts. */
export function openItems(inbox: Inbox, agenda: Pick<AgendaView, 'left'>): OpenItem[] {
  const items: OpenItem[] = [];
  if (inbox.visitors.length > 0) {
    items.push({
      target: 'tuer',
      text: `${anzahl(inbox.visitors.length, 'Besucher wartet', 'Besucher warten')} vor der Tür`,
      urgent: inbox.visitors.some((e) => e.urgent),
    });
  }
  if (inbox.letters.length > 0) {
    const dringend = inbox.letters.filter((e) => e.urgent).length;
    items.push({
      target: 'post',
      text: `${anzahl(inbox.letters.length, 'Brief', 'Briefe')} unbeantwortet${dringend > 0 ? ` – ${dringend === 1 ? 'einer' : dringend} mit Frist in dieser Runde` : ''}`,
      urgent: dringend > 0,
    });
  }
  const vorfaelle = [...inbox.incidents, ...inbox.tableaus];
  if (vorfaelle.length > 0) {
    items.push({
      target: 'vorfaelle',
      text: `${anzahl(vorfaelle.length, 'Vorfall', 'Vorfälle')} am Notizspieß`,
      urgent: vorfaelle.some((e) => e.urgent),
    });
  }
  if (inbox.routines.length > 0 && agenda.left > 0) {
    items.push({
      target: 'termine',
      text: `${anzahl(agenda.left, 'Termin', 'Termine')} frei – ${anzahl(inbox.routines.length, 'fester Termin', 'feste Termine')} im Kalender`,
      urgent: false,
    });
  }
  return items;
}
