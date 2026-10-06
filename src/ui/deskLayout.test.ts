// Platzplan des Schreibtischs (0.4.20+10): Kapitel 1/2 unverändert, ab Kapitel 3 jeder Gegenstand mit eigenem Platz.
import { describe, expect, it } from 'vitest';
import type { Placement } from './scene/DeskObject';
import { aufTisch, DESK_BASE, deskLayout, sharedColumn, TISCH, tischEinzug, type DeskPresent } from './scene/deskLayout';

const NICHTS: DeskPresent = { raffinerie: false, personal: false, schattenbuch: false, werkstatt: false, marke: false, boerse: false, hallstead: false, konzern: false };
const ALLES: DeskPresent = { raffinerie: true, personal: true, schattenbuch: true, werkstatt: true, marke: true, boerse: true, hallstead: true, konzern: true };

function ueberlappt(a: Placement, b: Placement): boolean {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return x > 0.01 && y > 0.01;
}

describe('Schreibtisch-Platzplan', () => {
  it('Kapitel 1: der alte Plan, Gegenstände ohne System fehlen', () => {
    const plan = deskLayout(1, NICHTS);
    expect(plan.zeitung).toEqual({ left: 2.5, top: 48, width: 15, height: 24 });
    expect(plan.ruth).toEqual({ left: 45, top: 47, width: 26, height: 36 });
    expect(plan.lampe).toEqual({ left: 45, top: 8, width: 6, height: 26 });
    expect(plan.glocke).toEqual({ left: 86, top: 70, width: 12, height: 27 });
    expect(plan.raffinerie).toBeUndefined();
    expect(plan.boerse).toBeUndefined();
    expect(plan.radio).toBeUndefined();
    expect(Object.keys(plan).sort()).toEqual([...DESK_BASE, 'lampe'].sort());
  });

  it('Kapitel 2: allein behält jeder seinen Platz', () => {
    const plan = deskLayout(2, { ...NICHTS, raffinerie: true, personal: true, schattenbuch: true, werkstatt: true });
    expect(plan.raffinerie).toEqual({ left: 72, top: 75, width: 13, height: 22 });
    expect(plan.personal).toEqual({ left: 86.5, top: 46, width: 11.5, height: 22 });
    expect(plan.schattenbuch).toEqual({ left: 47, top: 85, width: 22, height: 12 });
    expect(plan.werkstatt).toEqual({ left: 51.5, top: 8, width: 6, height: 24 });
  });

  it('Kapitel 1/2 mit allen Systemen vorab: die alten geteilten Plätze', () => {
    const plan = deskLayout(1, ALLES);
    expect(plan.raffinerie).toEqual({ left: 72, top: 74, width: 13, height: 11.5 });
    expect(plan.boerse).toEqual({ left: 72, top: 86, width: 13, height: 11 });
    expect(plan.personal).toEqual({ left: 86.5, top: 44, width: 11.5, height: 12.5 });
    expect(plan.marke).toEqual({ left: 86.5, top: 57, width: 11.5, height: 12.5 });
    expect(plan.schattenbuch).toEqual({ left: 45.5, top: 85, width: 7, height: 12 });
    expect(plan.hallstead).toEqual({ left: 53, top: 85, width: 9.5, height: 12 });
    expect(plan.konzern).toEqual({ left: 63, top: 85, width: 8.5, height: 12 });
    expect(sharedColumn(1, ALLES)).toBe(true);
    // Zu zweit: links die Hälfte, rechts der alte Platz der Mappe.
    const zwei = deskLayout(2, { ...NICHTS, schattenbuch: true, konzern: true });
    expect(zwei.schattenbuch).toEqual({ left: 47, top: 85, width: 11.5, height: 12 });
    expect(zwei.konzern).toEqual({ left: 59, top: 85, width: 11.5, height: 12 });
    expect(deskLayout(2, { ...NICHTS, boerse: true }).boerse).toEqual({ left: 72.5, top: 75, width: 12.5, height: 22 });
  });

  it('Kapitel 3: jeder Gegenstand hat einen eigenen Platz, nichts überdeckt sich, alles im Bild', () => {
    const plan = deskLayout(3, ALLES);
    const ids = [...DESK_BASE, ...Object.keys(ALLES), 'radio', 'ablage'];
    expect(Object.keys(plan).sort()).toEqual([...ids].sort());
    expect(plan.lampe).toBeUndefined();
    expect(sharedColumn(3, ALLES)).toBe(false);
    const eintraege = Object.entries(plan) as [string, Placement][];
    for (const [id, at] of eintraege) {
      expect(at.left, id).toBeGreaterThanOrEqual(0);
      expect(at.top, id).toBeGreaterThanOrEqual(0);
      expect(at.left + at.width, id).toBeLessThanOrEqual(100);
      expect(at.top + at.height, id).toBeLessThanOrEqual(100);
      // Lesbar: kein Gegenstand mehr in der Größe der alten geteilten Plätze (höchstens 12 % hoch).
      if (id !== 'radio') expect(at.height, id).toBeGreaterThanOrEqual(13);
    }
    for (let i = 0; i < eintraege.length; i++)
      for (let j = i + 1; j < eintraege.length; j++) {
        const [a, pa] = eintraege[i];
        const [b, pb] = eintraege[j];
        // Die Ablage ist der Untergrund der beiden Mappen.
        if ((a === 'ablage' && (b === 'hallstead' || b === 'konzern')) || (b === 'ablage' && (a === 'hallstead' || a === 'konzern'))) continue;
        expect(ueberlappt(pa, pb), `${a} ↔ ${b}`).toBe(false);
      }
  });

  it('Kapitel 3: die Mappen liegen in der Ablage, die Kurstafel hängt an der Wand', () => {
    const plan = deskLayout(3, ALLES);
    const ablage = plan.ablage!;
    for (const id of ['hallstead', 'konzern'] as const) {
      const at = plan[id]!;
      expect(at.left).toBeGreaterThanOrEqual(ablage.left);
      expect(at.left + at.width).toBeLessThanOrEqual(ablage.left + ablage.width);
      expect(at.top).toBeGreaterThanOrEqual(ablage.top);
    }
    // Wand endet bei 43 % der Bühne.
    expect(plan.boerse!.top + plan.boerse!.height).toBeLessThanOrEqual(43);
  });

  it('Kapitel 3 ohne Zusatzsysteme: nur die festen Gegenstände plus Radio und Ablage', () => {
    expect(Object.keys(deskLayout(3, NICHTS)).sort()).toEqual([...DESK_BASE, 'radio', 'ablage'].sort());
  });
});

describe('Tisch in Perspektive (0.4.20+12)', () => {
  it('Wandgegenstände bleiben, wo sie sind', () => {
    const karte = { left: 2, top: 4, width: 22, height: 34 };
    expect(aufTisch(karte)).toEqual(karte);
  });

  it('Gegenstände auf dem Tisch landen in der Platte: zwischen hinterer Kante und Vorderkante, innerhalb des Trapezes', () => {
    for (const kapitel of [1, 3]) {
      const plan = deskLayout(kapitel, ALLES);
      for (const p of Object.values(plan) as Placement[]) {
        if (p.top < TISCH.hinten || p.width === 0) continue;
        const q = aufTisch(p);
        expect(q.top).toBeGreaterThanOrEqual(TISCH.hinten);
        expect(q.top + q.height).toBeLessThanOrEqual(TISCH.vorn + 0.01);
        const ein = tischEinzug(q.top + q.height / 2);
        expect(q.left).toBeGreaterThanOrEqual(ein - 0.01);
        expect(q.left + q.width).toBeLessThanOrEqual(100 - ein + 0.01);
      }
    }
  });

  it('die Platte ist hinten schmaler als vorn, und was sich vorher nicht überdeckt hat, überdeckt sich auch danach nicht', () => {
    expect(tischEinzug(TISCH.hinten)).toBeGreaterThan(tischEinzug(TISCH.vorn));
    const plan = Object.values(deskLayout(3, ALLES)) as Placement[];
    for (let i = 0; i < plan.length; i++)
      for (let j = i + 1; j < plan.length; j++) {
        if (!ueberlappt(plan[i], plan[j])) expect(ueberlappt(aufTisch(plan[i]), aufTisch(plan[j]))).toBe(false);
      }
  });
});
