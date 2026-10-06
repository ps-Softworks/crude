// 0.2.15+10: Der Rundgang zeigt nur auf Gegenstände, die es gibt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBalance } from '../sim/testBalance';
import { parseTour, presentSteps, TOUR_PREF, TOUR_PREF_K2, TOUR_PREF_K3, tourAutoStart, tourFor } from './tour';

const text = readFileSync(new URL('../../content/rundgang.yaml', import.meta.url), 'utf8');

describe('Rundgang der Einstiegshilfe', () => {
  it('zeigt jeden wichtigen Gegenstand genau einmal', () => {
    const schritte = parseTour('content/rundgang.yaml', text);
    const ziele = schritte.map((s) => s.object);
    for (const id of ['ruth', 'karte', 'post', 'tuer', 'kassenbuch', 'fracht', 'glocke']) expect(ziele, id).toContain(id);
    expect(new Set(ziele).size).toBe(ziele.length);
  });

  it('lehnt unbekannte Gegenstände und fehlende Texte ab', () => {
    expect(() => parseTour('x.yaml', 'schritte:\n  - objekt: sofa\n    text: { de: "x", en: "" }')).toThrow(/sofa/);
    expect(() => parseTour('x.yaml', 'schritte:\n  - objekt: post\n    text: { en: "" }')).toThrow(/braucht „text“/);
    expect(() => parseTour('x.yaml', 'nix: 1')).toThrow(/schritte/);
  });
});

const textK2 = readFileSync(new URL('../../content/rundgang-k2.yaml', import.meta.url), 'utf8');

describe('Rundgang Kapitel 2 (0.4.20+2)', () => {
  it('zeigt die neuen Gegenstände von Kapitel 2 genau einmal', () => {
    const ziele = parseTour('content/rundgang-k2.yaml', textK2).map((s) => s.object);
    for (const id of ['raffinerie', 'personal', 'werkstatt', 'schattenbuch', 'fracht', 'kassenbuch', 'konkurrenz', 'karte']) expect(ziele, id).toContain(id);
    expect(new Set(ziele).size).toBe(ziele.length);
  });

  it('jedes Kapitel bekommt seinen Rundgang – mit eigenem Merker', () => {
    const tours = { k1: 'eins', k2: 'zwei', k3: 'drei' };
    expect(tourFor(1, tours)).toEqual({ steps: 'eins', pref: TOUR_PREF, chapter: 1 });
    expect(tourFor(2, tours)).toEqual({ steps: 'zwei', pref: TOUR_PREF_K2, chapter: 2 });
    expect(tourFor(3, tours)).toEqual({ steps: 'drei', pref: TOUR_PREF_K3, chapter: 3 });
    expect(tourFor(4, tours).pref).toBe(TOUR_PREF_K3);
    expect(new Set([TOUR_PREF, TOUR_PREF_K2, TOUR_PREF_K3]).size).toBe(3);
  });

  it('von selbst: Kapitel 1 nur mit Einstiegshilfe, Kapitel 2 immer – aber jeweils nur einmal', () => {
    expect(tourAutoStart(1, true, false)).toBe(true);
    expect(tourAutoStart(1, false, false)).toBe(false);
    expect(tourAutoStart(2, false, false)).toBe(true);
    expect(tourAutoStart(2, true, true)).toBe(false);
    expect(tourAutoStart(1, true, true)).toBe(false);
  });

  it('lässt Schritte weg, deren Gegenstand nicht auf dem Tisch liegt', () => {
    const schritte = parseTour('content/rundgang-k2.yaml', textK2);
    const ohneWerkstatt = presentSteps(schritte, (o) => o !== 'werkstatt');
    expect(ohneWerkstatt.map((s) => s.object)).not.toContain('werkstatt');
    expect(ohneWerkstatt.length).toBe(schritte.length - 1);
  });
});

const textK3 = readFileSync(new URL('../../content/rundgang-k3.yaml', import.meta.url), 'utf8');

describe('Rundgang Kapitel 3 (0.4.20+3)', () => {
  it('zeigt die neuen Gegenstände von Kapitel 3 genau einmal', () => {
    const ziele = parseTour('content/rundgang-k3.yaml', textK3).map((s) => s.object);
    for (const id of ['marke', 'boerse', 'hallstead', 'konzern', 'kassenbuch']) expect(ziele, id).toContain(id);
    expect(new Set(ziele).size).toBe(ziele.length);
  });

  it('kommt in Kapitel 3 einmal von selbst, auch ohne Einstiegshilfe', () => {
    expect(tourAutoStart(3, false, false)).toBe(true);
    expect(tourAutoStart(3, false, true)).toBe(false);
  });
});

describe('Rundgang Kapitel 2: Zahlen passen zu balance.yaml (0.4.20+30)', () => {
  it('nennt die Baukosten der Raffinerie aus balance.yaml', () => {
    const kosten = loadBalance().refinery.buildCost.toLocaleString('de-DE');
    expect(textK2).toContain(`rund ${kosten} $`);
  });
});
