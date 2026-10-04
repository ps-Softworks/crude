// Was in Kapitel 3 (4.17) auf eine Entscheidung wartet – für das Abzeichen der
// Siegelmappe am Schreibtisch. Nur gezählt, nichts entschieden.

import type { Balance } from './balance';
import type { GameState } from './game';
import { kapitel3Of } from './kapitel3';
import { invitationOpen, rescueAvailable } from './konsortium';

export interface Kapitel3Pending {
  /** Vales Einladung liegt offen. */
  invitation: boolean;
  /** Vale verlangt einen Gefallen. */
  favor: boolean;
  /** Vale bietet Rettung an (Pleitefrist). */
  rescue: boolean;
  /** Offene Projektangebote. */
  offers: number;
  /** Seismik-Berichte, die in dieser Runde gekommen sind. */
  reports: number;
  /** Eine Frist läuft in dieser Runde ab (Einladung, Gefallen oder Angebot). */
  urgent: boolean;
  /** Alles zusammen, für die Zahl am Gegenstand. */
  total: number;
}

export function kapitel3Pending(state: GameState, balance: Balance): Kapitel3Pending | null {
  const k3 = kapitel3Of(state, balance);
  if (!k3) return null;
  const r = state.round;
  const invitation = invitationOpen(k3);
  const favor = k3.konsortium.favor !== null;
  const rescue = rescueAvailable(state, balance);
  const offers = k3.projekte.offers.length;
  const reports = Object.values(k3.seismik.reports).filter((x) => x.round === r).length;
  const urgent =
    (invitation && k3.konsortium.inviteDeadline <= r) || (favor && k3.konsortium.favor!.deadline <= r) || k3.projekte.offers.some((o) => o.until <= r) || rescue;
  return { invitation, favor, rescue, offers, reports, urgent, total: Number(invitation) + Number(favor) + Number(rescue) + offers + reports };
}
