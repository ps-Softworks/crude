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
  // 0.4.20+14: Die Petroleumlampe steht hinten auf dem Tisch und ragt vor die Wand (Tiefe).
  lampe: { left: 45.5, top: 30, width: 6, height: 17 },
  termine: { left: 58, top: 4, width: 10, height: 30 },
  familie: { left: 70.5, top: 6, width: 13, height: 28 },
  // 0.4.20+14: Die Tür reicht bis zum Boden (TISCH.boden); ihr unterer Teil steht hinter dem Tisch.
  tuer: { left: 84.5, top: 1, width: 14.5, height: 59 },
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
  // 4.11 Andockpunkt: Blaupause an der Wand zwischen Lampe und Kalender. 0.4.20+13: Die Schublade (Schattenbuch) ist
  // die rechte Schublade in der Vorderkante des Tischs (SCHUBLADEN), nicht mehr ein Kasten auf der Platte.
  schattenbuch: { left: 64.5, top: 90.8, width: 23.5, height: 7.4 },
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

/**
 * Integration 4.16/4.17: Die untere Reihe zwischen Kladde (bis 45 %) und Raffinerie-Plan (ab 72 %) teilen
 * sich Hallstead-Mappe und Siegelmappe – allein behält jede ihren Platz (AT), zu zweit links/rechts je eine
 * Hälfte. (Bis 0.4.20+12 lag hier auch die Schublade; sie steckt jetzt in der Vorderkante.)
 */
function untereReihe(da: Record<'hallstead' | 'konzern', boolean>): Partial<Record<'hallstead' | 'konzern', Placement>> {
  if (!da.hallstead || !da.konzern) return {};
  return { hallstead: { left: 47, top: 85, width: 11.5, height: 12 }, konzern: AT.hallstead };
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
  // Notiz-Prüfung: Der Fuß des Radios steht wie die Lampe sichtbar auf der Platte (vorher schwebte er an der Kante).
  radio: { left: 43.5, top: 33.5, width: 6.5, height: 12.5 },
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
  ruth: { left: 37, top: 47, width: 25, height: 34 },
  ablage: { left: 37, top: 83, width: 25, height: 15 },
  hallstead: { left: 37.5, top: 83.5, width: 11.75, height: 14 },
  konzern: { left: 49.75, top: 83.5, width: 11.75, height: 14 },
  kassenbuch: { left: 63.5, top: 47, width: 10.5, height: 25 },
  marke: { left: 75, top: 47, width: 11.5, height: 25 },
  personal: { left: 87.5, top: 46, width: 10.5, height: 23 },
  raffinerie: { left: 63.5, top: 75, width: 10.5, height: 22 },
  schattenbuch: AT.schattenbuch,
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

// ---------------------------------------------------------------------------
// Tisch in Perspektive (0.4.20+12): Die Tischplatte ist ein Trapez – hinten an der Wand schmaler, vorn
// breiter, darunter die Vorderkante mit Schubladen. Die Platzpläne oben bleiben, wie sie sind (Prozent der
// ganzen Szene); aufTisch rückt alles, was auf dem Tisch liegt, in die Platte. Reine Darstellung.

/**
 * Wo die Tischplatte liegt, in Prozent der Szene: hinten (Wand) und vorn (Kante), dazu die Einrückung je Seite.
 * boden (0.4.20+14): Hinter dem Tisch geht die Wand weiter bis zur Fußleiste – erst dort beginnt der Boden.
 */
export const TISCH = { hinten: 43, vorn: 89, einzugHinten: 6, einzugVorn: 1, boden: 60 } as const;

/** Einrückung der Platte je Seite in Höhe y (Prozent der Szene). */
export function tischEinzug(y: number): number {
  const t = Math.min(1, Math.max(0, (y - TISCH.hinten) / (TISCH.vorn - TISCH.hinten)));
  return TISCH.einzugHinten + (TISCH.einzugVorn - TISCH.einzugHinten) * t;
}

/**
 * Ein Platz aus dem Plan auf die Tischplatte: Was an der Wand hängt (oberhalb von TISCH.hinten), bleibt.
 * Alles andere wird senkrecht von hinten…100 % auf hinten…vorn gestaucht und waagrecht in die Breite der
 * Platte auf Höhe seiner Mitte gerückt.
 */
export function aufTisch(p: Placement): Placement {
  // Wand (oberhalb der Platte) und Vorderkante (Schubladen, unterhalb) bleiben, wie sie sind.
  if (p.top < TISCH.hinten || p.top >= TISCH.vorn || p.width === 0) return p;
  const k = (TISCH.vorn - TISCH.hinten) / (100 - TISCH.hinten);
  const top = TISCH.hinten + (p.top - TISCH.hinten) * k;
  const height = p.height * k;
  const ein = tischEinzug(top + height / 2);
  const breite = (100 - 2 * ein) / 100;
  const r = (v: number) => Math.round(v * 100) / 100;
  return { left: r(ein + p.left * breite), top: r(top), width: r(p.width * breite), height: r(height) };
}

/**
 * 0.4.20+13: Die drei Schubladen in der Vorderkante, in Prozent der Szene (Kante von TISCH.vorn bis 100 %,
 * links und rechts 1 % Einzug). Die rechte ist die Schublade mit dem Schattenbuch (AT.schattenbuch), sobald es
 * Delaney gibt (Kapitel 2); die beiden anderen sind Zierde.
 */
export const SCHUBLADEN: readonly Placement[] = [
  { left: 12, top: 90.8, width: 23.5, height: 7.4 },
  { left: 38.25, top: 90.8, width: 23.5, height: 7.4 },
  AT.schattenbuch,
];
