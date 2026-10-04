import { describe, expect, it } from 'vitest';
import { choiceIndex, isTypingTarget, keyForSheet, keyToAction, SHORTCUTS, type KeyContext } from './keys';

const tisch: KeyContext = { view: 'desk', sheetOpen: false, debugTools: false };

describe('Tastenkürzel', () => {
  it('belegt keine Taste doppelt', () => {
    const tasten = SHORTCUTS.map((s) => `${s.shift ? 'shift+' : ''}${s.key}`);
    expect(new Set(tasten).size).toBe(tasten.length);
  });

  it('öffnet die Fenster vom Schreibtisch aus', () => {
    expect(keyToAction({ key: 'b' }, tisch)).toEqual({ kind: 'open', sheet: 'post' });
    expect(keyToAction({ key: 'B' }, tisch)).toEqual({ kind: 'open', sheet: 'post' });
    expect(keyToAction({ key: 'v' }, tisch)).toEqual({ kind: 'open', sheet: 'fracht', tab: 'verkauf' });
    expect(keyToAction({ key: 'e' }, tisch)).toEqual({ kind: 'open', sheet: 'glocke' });
    expect(keyToAction({ key: 'k' }, tisch)).toEqual({ kind: 'map' });
    expect(keyToAction({ key: '?', shiftKey: true }, tisch)).toEqual({ kind: 'help' });
  });

  it('ignoriert Tasten mit Strg, Alt oder Cmd und unbekannte Tasten', () => {
    expect(keyToAction({ key: 'b', ctrlKey: true }, tisch)).toBeNull();
    expect(keyToAction({ key: 'b', metaKey: true }, tisch)).toBeNull();
    expect(keyToAction({ key: 'q' }, tisch)).toBeNull();
    expect(keyToAction({ key: 'Enter' }, tisch)).toBeNull();
  });

  it('greift nicht bei offenem Fenster, auf der Karte oder beim Besucher', () => {
    expect(keyToAction({ key: 'b' }, { ...tisch, sheetOpen: true })).toBeNull();
    expect(keyToAction({ key: 'b' }, { ...tisch, view: 'map' })).toBeNull();
    expect(keyToAction({ key: 'b' }, { ...tisch, visitorOpen: true })).toBeNull();
  });

  it('greift nicht, solange ein Eingabefeld oder Regler den Fokus hat', () => {
    expect(keyToAction({ key: 'g', target: { tagName: 'INPUT', type: 'range' } }, tisch)).toBeNull();
    expect(keyToAction({ key: 'g', target: { tagName: 'INPUT', type: 'number' } }, tisch)).toBeNull();
    expect(keyToAction({ key: 'g', target: { tagName: 'INPUT' } }, tisch)).toBeNull();
    expect(keyToAction({ key: 'g', target: { tagName: 'TEXTAREA' } }, tisch)).toBeNull();
    expect(keyToAction({ key: 'g', target: { tagName: 'DIV', getAttribute: () => 'slider' } }, tisch)).toBeNull();
    // Ein Knopf oder Haken hat den Fokus: das Kürzel gilt.
    expect(keyToAction({ key: 'g', target: { tagName: 'BUTTON' } }, tisch)).toEqual({ kind: 'open', sheet: 'kassenbuch' });
    expect(keyToAction({ key: 'g', target: { tagName: 'INPUT', type: 'checkbox' } }, tisch)).not.toBeNull();
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('öffnet den Debug-Reiter nur mit Umschalt und nur mit Debug-Bereich', () => {
    expect(keyToAction({ key: 'D', shiftKey: true }, tisch)).toBeNull();
    expect(keyToAction({ key: 'D', shiftKey: true }, { ...tisch, debugTools: true })).toEqual({ kind: 'debug' });
    expect(keyToAction({ key: 'd' }, { ...tisch, debugTools: true })).toBeNull();
  });

  it('wählt mit 1–4 eine Antwort, aber nicht im Eingabefeld', () => {
    expect(choiceIndex({ key: '1' })).toBe(0);
    expect(choiceIndex({ key: '4' })).toBe(3);
    expect(choiceIndex({ key: '5' })).toBeNull();
    expect(choiceIndex({ key: '0' })).toBeNull();
    expect(choiceIndex({ key: 'a' })).toBeNull();
    expect(choiceIndex({ key: '2', target: { tagName: 'INPUT', type: 'number' } })).toBeNull();
  });

  it('nennt das Kürzel eines Fensters fürs Namensschild', () => {
    expect(keyForSheet('post')).toBe('B');
    expect(keyForSheet('fracht')).toBe('F');
    expect(keyForSheet('menu')).toBeUndefined();
  });
});
