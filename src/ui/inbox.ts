// Was auf dem Schreibtisch liegt (0.2.15+9): verteilt die offenen Ereignisse aus
// src/sim auf Briefe, Besucher, Vorfälle, Tableaus und Termine und zählt für die
// Abzeichen. Reines Filtern und Zählen – welche Ereignisse offen sind, wann eine
// Frist abläuft und was eine Antwort kostet, entscheidet allein die Simulation.

import type { AgendaView } from '../sim/agenda';
import type { DeskEvent } from '../sim/events';
import type { GameState } from '../sim/game';
import { roundsLeft } from '../sim/lease';
import type { SheetId } from './sceneState';
import { waitingText } from './visitors';

/** Wie ein Ereignis ohne Brief auftritt (Feld „visitor“ bzw. „tableau“ in content/events, ab 0.2.15+10). */
export type Appearance = { kind: 'visitor'; figure: string; name: string } | { kind: 'tableau' };

export interface Inbox {
  /** Briefe, dringende zuerst (Reihenfolge aus deskMail). */
  letters: DeskEvent[];
  /** Besucher – wessen Frist zuerst abläuft, steht vorn (sonst in der Reihenfolge, in der sie kamen). */
  visitors: DeskEvent[];
  tableaus: DeskEvent[];
  /** Alles ohne Brief und ohne Auftritt: Zettel am Notizspieß. */
  incidents: DeskEvent[];
  /** Feste Termine, die diese Runde noch gingen. */
  routines: DeskEvent[];
  /** Die Besetzung, nach der verteilt wurde (Name und Figur der Besucher). */
  appearances: Readonly<Record<string, Appearance>>;
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
    // Nur sortiert, keine Regel: Frist (roundsLeft aus src/sim) zuerst; sort ist stabil.
    visitors: ohneBrief.filter((e) => appearances[e.id]?.kind === 'visitor').sort((a, b) => a.roundsLeft - b.roundsLeft),
    tableaus: ohneBrief.filter((e) => appearances[e.id]?.kind === 'tableau'),
    incidents: ohneBrief.filter((e) => !appearances[e.id]),
    routines: [...routines],
    appearances,
  };
}

/** Der Schlüssel, unter dem ein Ereignis in der „gesehen“-Liste der Szene steht. */
export function seenKey(eventId: string): string {
  return `ev:${eventId}`;
}

/** Ereignisse, die in dieser Runde noch niemand angesehen hat. */
export function unseen(list: readonly DeskEvent[], seen: readonly string[]): DeskEvent[] {
  return list.filter((e) => !seen.includes(seenKey(e.id)));
}

export interface Badge {
  count: number;
  /** Mindestens eine Frist läuft in dieser Runde ab. */
  urgent: boolean;
  /** Mindestens eins ist neu (noch nicht angesehen). */
  fresh: boolean;
}

function badge(list: readonly DeskEvent[], seen: readonly string[] | null): Badge {
  return { count: list.length, urgent: list.some((e) => e.urgent), fresh: seen !== null && unseen(list, seen).length > 0 };
}

export interface InboxBadges {
  post: Badge;
  vorfaelle: Badge;
  termine: Badge;
  tuer: Badge;
}

/** Zahlen für die Abzeichen; mit `seen` auch, ob etwas neu ist. */
export function inboxBadges(inbox: Inbox, seen: readonly string[] | null = null): InboxBadges {
  return {
    post: badge(inbox.letters, seen),
    vorfaelle: badge([...inbox.incidents, ...inbox.tableaus], seen),
    termine: badge(inbox.routines, seen),
    tuer: badge(inbox.visitors, seen),
  };
}

/** Welche Ereignisse ein Fenster zeigt – sie gelten mit dem Öffnen als gesehen. */
export function eventsShownIn(inbox: Inbox, sheet: SheetId): DeskEvent[] {
  if (sheet === 'post') return inbox.letters;
  if (sheet === 'vorfaelle') return [...inbox.incidents, ...inbox.tableaus];
  if (sheet === 'termine') return inbox.routines;
  if (sheet === 'wartende') return inbox.visitors;
  return [];
}

/** Die Namen der Wartenden, in ihrer Reihenfolge. */
export function visitorNames(inbox: Inbox): string[] {
  return inbox.visitors.map((e) => {
    const a = inbox.appearances[e.id];
    return a?.kind === 'visitor' ? a.name : e.title;
  });
}

/** Eine Zeile in „Noch offen“ an der Glocke. */
export interface OpenItem {
  /** Wohin „Hingehen“ führt. */
  target: SheetId | 'tuer' | 'karte';
  text: string;
  urgent: boolean;
  /** Bei target 'karte': diese Ranch zeigen. */
  parcelId?: string;
}

/** Land, das nach dieser Runde verfällt (0.2.15+12): Jacobs Optionen und ungebohrte Pachten mit nur noch einer Runde. */
export interface LandDeadlines {
  options: number;
  leases: number;
  /** Die erste betroffene Ranch (für „Hingehen“), sonst null. */
  parcelId: string | null;
}

/** Nur gezählt – wann etwas verfällt, steht in src/sim (expiresAfterRound, roundsLeft). */
export function landDeadlines(game: Pick<GameState, 'round' | 'options' | 'leases'>): LandDeadlines {
  const optionen = game.options.filter((o) => o.holder === 'jacob' && roundsLeft(game, o) <= 1);
  const pachten = game.leases.filter((l) => l.holder === 'jacob' && !l.drilled && roundsLeft(game, l) <= 1);
  return { options: optionen.length, leases: pachten.length, parcelId: optionen[0]?.parcelId ?? pachten[0]?.parcelId ?? null };
}

function anzahl(n: number, eins: string, viele: string): string {
  return n === 1 ? `1 ${eins}` : `${n} ${viele}`;
}

/** Pleitefrist (insolvency.ts): bis zu welcher Runde Geld herein muss – 0 = keine Frist. Nur gelesen. */
export function bankruptcyDeadlineOf(game: Pick<GameState, 'bankruptcyDeadline' | 'finished'>): number {
  return game.finished ? 0 : game.bankruptcyDeadline;
}

/** Was vor dem Rundenende noch offen liegt. Gesperrt wird nichts. Die Pleitefrist steht immer vorn. */
export function openItems(inbox: Inbox, agenda: Pick<AgendaView, 'left'>, land: LandDeadlines | null = null, bankruptcyDeadline = 0, referrals = 0): OpenItem[] {
  const items: OpenItem[] = [];
  if (bankruptcyDeadline > 0) {
    items.push({ target: 'kassenbuch', text: `Bankrott droht! Bis Runde ${bankruptcyDeadline} muss Geld herein → Kassenbuch`, urgent: true });
  }
  if (inbox.visitors.length > 0) {
    items.push({
      target: 'tuer',
      text: `${waitingText(visitorNames(inbox))} vor der Tür`,
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
  if (land && land.parcelId && land.options + land.leases > 0) {
    const teile = [
      land.options > 0 && anzahl(land.options, 'Option', 'Optionen'),
      land.leases > 0 && anzahl(land.leases, 'ungebohrte Pacht', 'ungebohrte Pachten'),
    ].filter(Boolean);
    const n = land.options + land.leases;
    items.push({
      target: 'karte',
      parcelId: land.parcelId,
      text: `${teile.join(' und ')} ${n === 1 ? 'verfällt' : 'verfallen'} nach dieser Runde → Wandkarte`,
      urgent: true,
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
    const n = inbox.routines.length;
    items.push({
      target: 'termine',
      text: `${anzahl(n, 'fester Termin', 'feste Termine')} im Kalender ${n === 1 ? 'wartet' : 'warten'} noch (freiwillig, ${anzahl(agenda.left, 'Termin', 'Termine')} frei)`,
      urgent: false,
    });
  }
  // 0.4.20+44: Empfehlungen im Adressbuch – neue Kontakte warten aufs Vorstellen.
  if (referrals > 0) {
    items.push({ target: 'termine', text: `${anzahl(referrals, 'Empfehlung', 'Empfehlungen')} im Adressbuch – jemand will dich vorstellen`, urgent: false });
  }
  return items;
}
