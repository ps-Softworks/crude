// Platzplan des Schreibtischs (0.4.20+10): wo welcher Gegenstand liegt, je Kapitel.
// Reine Darstellung, keine Spielregel. Kapitel 1 und 2 behalten genau den alten Plan
// (mit geteilten Plätzen, wenn der Debug-Knopf Systeme vorab freischaltet). Ab Kapitel 3
// steht ein neuer Tisch (Mahagoni, GDD §3): jeder Gegenstand hat seinen eigenen Platz,
// die Kurstafel hängt an der Wand (statt Lampe), Hallstead- und Siegelmappe liegen in
// einer eigenen Ablage unter Ruths Zettel, dazu ein Radio als Zierde.

import type { SheetId } from '../sceneState';
import type { Placement } from './DeskObject';

/** Was neben den Fenster-Gegenständen einen Platz braucht: Wandkarte, Tür, Ruths Zettel, Zierde. */
export type DeskSpot = Exclude<SheetId, 'bericht' | 'menu' | 'wartende'> | 'karte' | 'tuer' | 'ruth' | 'lampe' | 'radio' | 'ablage';

/** Gegenstände, die erst mit einem System auf den Tisch kommen. */
export interface DeskPresent {
  raffinerie: boolean;
  personal: boolean;
  schattenbuch: boolean;
  werkstatt: boolean;
  marke: boolean;
  boerse: boolean;
  hallstead: boolean;
  konzern: boolean;
}

/** Feste Gegenstände (immer da) – die Reihenfolge ist egal. */
export const DESK_BASE = ['karte', 'konkurrenz', 'termine', 'familie', 'tuer', 'zeitung', 'post', 'vorfaelle', 'kassenbuch', 'akte', 'fracht', 'protokoll', 'glocke', 'ruth'] as const;

/** Wo was liegt in Kapitel 1 und 2, in Prozent der Bühne (unter der Kopfleiste). */
const AT: Record<DeskSpot, Placement> = {
  karte: { left: 2, top: 4, width: 22, height: 34 },
  konkurrenz: { left: 26, top: 6, width: 15, height: 28 },
  lampe: { left: 45, top: 8, width: 6, height: 26 },
  termine: { left: 58, top: 4, width: 10, height: 30 },
  familie: { left: 70.5, top: 6, width: 13, height: 28 },
  tuer: { left: 86, top: 0, width: 12, height: 42 },
  zeitung: { left: 2.5, top: 48, width: 15, height: 24 },
  post: { left: 19, top: 47, width: 13, height: 25 },
  vorfaelle: { left: 33.5, top: 46, width: 8.5, height: 26 },
  ruth: { left: 45, top: 47, width: 26, height: 36 },
  kassenbuch: { left: 73, top: 47, width: 12, height: 25 },
  akte: { left: 3, top: 75, width: 14, height: 22 },
  fracht: { left: 19, top: 75, width: 15, height: 22 },
  protokoll: { left: 36, top: 76, width: 9, height: 21 },
  glocke: { left: 86, top: 70, width: 12, height: 27 },
  // 4.6 Andockpunkt: Raffinerie-Plan zwischen Ruths Zettel und Glocke (ab Kapitel 2).
  raffinerie: { left: 72, top: 75, width: 13, height: 22 },
  // 4.9 Andockpunkt: Personalakten rechts neben dem Kassenbuch, zwischen Tür und Glocke (der Platz unter dem Kassenbuch gehört der Raffinerie).
  personal: { left: 86.5, top: 46, width: 11.5, height: 22 },
  // 4.11 Andockpunkt: Schublade unter Ruths Zettel (zwischen Kladde und Raffinerie-Plan), Blaupause an der Wand zwischen Lampe und Kalender.
  schattenbuch: { left: 47, top: 85, width: 22, height: 12 },
  werkstatt: { left: 51.5, top: 8, width: 6, height: 24 },
  // 4.14 Andockpunkt: rechts neben dem Kassenbuch, über der Glocke (Platzplan in docs/phase4/4.14.md).
  // Liegen Personalakten und Vertrieb beide da, teilen sie sich die Spalte (RECHTE_SPALTE_GETEILT).
  marke: { left: 86, top: 47, width: 12, height: 21 },
  // 4.15 Andockpunkt: Börsenticker unter dem Kassenbuch (mit Raffinerie geteilt, UNTER_KASSENBUCH_GETEILT).
  boerse: { left: 72.5, top: 75, width: 12.5, height: 22 },
  // 4.16/4.17 Andockpunkt: Hallstead- und Siegelmappe in der unteren Reihe zwischen Kladde und Raffinerie-Plan.
  hallstead: { left: 59, top: 85, width: 11.5, height: 12 },
  konzern: { left: 59, top: 85, width: 11.5, height: 12 },
  // Gibt es nur ab Kapitel 3.
  radio: { left: 0, top: 0, width: 0, height: 0 },
  ablage: { left: 0, top: 0, width: 0, height: 0 },
};

/** 4.15: Raffinerie und Börsenticker teilen sich den Platz unter dem Kassenbuch übereinander. */
const UNTER_KASSENBUCH_GETEILT: Record<'raffinerie' | 'boerse', Placement> = {
  raffinerie: { left: 72, top: 74, width: 13, height: 11.5 },
  boerse: { left: 72, top: 86, width: 13, height: 11 },
};

/** Personal und Vertrieb gleichzeitig auf dem Tisch: übereinander zwischen Tür (bis 42 %) und Glocke (ab 70 %). */
const RECHTE_SPALTE_GETEILT: Record<'personal' | 'marke', Placement> = {
  personal: { left: 86.5, top: 44, width: 11.5, height: 12.5 },
  marke: { left: 86.5, top: 57, width: 11.5, height: 12.5 },
};

/** 4.16: Liegt die Hallstead-Mappe auf dem Tisch, rückt die Schublade (4.11) in die linke Hälfte ihrer Reihe. */
const SCHUBLADE_GETEILT: Placement = { left: 47, top: 85, width: 11.5, height: 12 };

type UntereReihe = 'schattenbuch' | 'hallstead' | 'konzern';

/**
 * Integration 4.11/4.16/4.17: Die untere Reihe zwischen Kladde (bis 45 %) und Raffinerie-Plan
 * (ab 72 %) teilen sich Schublade, Hallstead-Mappe und Siegelmappe. Allein behält jeder seinen
 * Platz (AT), zu zweit links/rechts je eine Hälfte, zu dritt je ein Drittel (46–71 %).
 */
function untereReihe(da: Record<UntereReihe, boolean>): Partial<Record<UntereReihe, Placement>> {
  const liste = (['schattenbuch', 'hallstead', 'konzern'] as const).filter((id) => da[id]);
  if (liste.length <= 1) return {};
  if (liste.length === 2) {
    const [links, rechts] = liste;
    return { [links]: SCHUBLADE_GETEILT, [rechts]: AT.hallstead };
  }
  return {
    schattenbuch: { left: 46, top: 85, width: 8, height: 12 },
    hallstead: { left: 54.5, top: 85, width: 8, height: 12 },
    konzern: { left: 63, top: 85, width: 8, height: 12 },
  };
}

/**
 * Kapitel 3: der Mahagoni-Tisch. Wand wie gehabt, nur hängt die Kurstafel, wo vorher die Lampe
 * stand, und das Radio steht hinten auf der Tischkante. Auf dem Tisch zwei Reihen: links
 * Zeitung/Briefe/Vorfälle und Akte/Fracht/Kladde (etwas schmaler), in der Mitte Ruths Zettel mit
 * der Ablage darunter, rechts Kassenbuch/Vertrieb/Personal und Raffinerie/Schublade/Glocke.
 */
const KAPITEL3: Record<DeskSpot, Placement> = {
  karte: AT.karte,
  konkurrenz: AT.konkurrenz,
  boerse: { left: 42.5, top: 4, width: 8.5, height: 25 },
  radio: { left: 43.5, top: 30, width: 6.5, height: 13 },
  werkstatt: AT.werkstatt,
  termine: AT.termine,
  familie: AT.familie,
  tuer: AT.tuer,
  zeitung: { left: 2, top: 48, width: 12, height: 24 },
  post: { left: 15, top: 47, width: 11, height: 25 },
  vorfaelle: { left: 27, top: 46, width: 8.5, height: 26 },
  akte: { left: 2, top: 75, width: 11.5, height: 22 },
  fracht: { left: 14, top: 75, width: 13, height: 22 },
  protokoll: { left: 28, top: 76, width: 8, height: 21 },
  ruth: { left: 37, top: 46, width: 25, height: 35 },
  ablage: { left: 37, top: 83, width: 25, height: 15 },
  hallstead: { left: 37.5, top: 83.5, width: 11.75, height: 14 },
  konzern: { left: 49.75, top: 83.5, width: 11.75, height: 14 },
  kassenbuch: { left: 63.5, top: 47, width: 10.5, height: 25 },
  marke: { left: 75, top: 47, width: 11.5, height: 25 },
  personal: { left: 87.5, top: 46, width: 10.5, height: 23 },
  raffinerie: { left: 63.5, top: 75, width: 10.5, height: 22 },
  schattenbuch: { left: 75, top: 79, width: 10.5, height: 18 },
  glocke: { left: 86.5, top: 72, width: 11.5, height: 25 },
  // Lampe gibt es auf dem Mahagoni-Tisch nicht mehr (dort hängt die Kurstafel).
  lampe: AT.radio,
};

/** Ab welchem Kapitel der Mahagoni-Tisch steht. */
export const MAHAGONI_AB = 3;

/**
 * Platz je Gegenstand auf dem Tisch dieses Kapitels – nur für das, was da ist.
 * Kapitel 1/2: der alte Plan samt geteilten Plätzen; ab Kapitel 3: jeder seinen eigenen.
 */
export function deskLayout(chapter: number, da: DeskPresent): Partial<Record<DeskSpot, Placement>> {
  const extra = (Object.keys(da) as (keyof DeskPresent)[]).filter((id) => da[id]);
  if (chapter >= MAHAGONI_AB) {
    const plan: Partial<Record<DeskSpot, Placement>> = {};
    for (const id of [...DESK_BASE, ...extra, 'radio', 'ablage'] as const) plan[id] = KAPITEL3[id];
    return plan;
  }
  const plan: Partial<Record<DeskSpot, Placement>> = {};
  for (const id of [...DESK_BASE, ...extra, 'lampe'] as const) plan[id] = AT[id];
  const reihe = untereReihe(da);
  if (reihe.schattenbuch && da.schattenbuch) plan.schattenbuch = reihe.schattenbuch;
  if (reihe.hallstead && da.hallstead) plan.hallstead = reihe.hallstead;
  if (reihe.konzern && da.konzern) plan.konzern = reihe.konzern;
  if (da.raffinerie && da.boerse) {
    plan.raffinerie = UNTER_KASSENBUCH_GETEILT.raffinerie;
    plan.boerse = UNTER_KASSENBUCH_GETEILT.boerse;
  }
  if (da.personal && da.marke) {
    plan.personal = RECHTE_SPALTE_GETEILT.personal;
    plan.marke = RECHTE_SPALTE_GETEILT.marke;
  }
  return plan;
}

/** Teilen sich zwei Gegenstände einen Platz (Kapitel 1/2 mit Vorab-Freischaltung)? Dann Abzeichen in die Ecke. */
export function sharedColumn(chapter: number, da: DeskPresent): boolean {
  return chapter < MAHAGONI_AB && da.personal && da.marke;
}
