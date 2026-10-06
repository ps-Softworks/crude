import { describe, expect, it } from 'vitest';
import { endRound, newGame } from '../sim/game';
import { loadBalance } from '../sim/testBalance';
import { serializeGame } from '../sim/save';
import type { SaveStore } from './storage';
import { clearSlot, listSlots, readSlot, SLOT_COUNT, slotKey, slotMetaKey, writeSlot } from './saveSlots';

const balance = loadBalance();

function speicher(): SaveStore & { daten: Map<string, string> } {
  const daten = new Map<string, string>();
  return { daten, read: (n) => daten.get(n) ?? null, write: (n, t) => void daten.set(n, t), remove: (n) => void daten.delete(n) };
}

describe('Speicherplätze', () => {
  it('Schlüssel sind für die Desktop-Hülle zulässig und berühren den Autosave nicht', () => {
    for (let i = 1; i <= SLOT_COUNT; i++) {
      expect(slotKey(i)).toMatch(/^[a-z0-9._-]+$/i);
      expect(slotMetaKey(i)).toMatch(/^[a-z0-9._-]+$/i);
      expect(slotKey(i)).not.toBe('crude.autosave');
    }
  });

  it('leer, speichern, auflisten, laden, überschreiben, leeren', () => {
    const store = speicher();
    expect(listSlots(store)).toEqual([null, null, null]);
    expect(readSlot(store, 1).ok).toBe(false);

    const s1 = newGame('slot', balance);
    const s2 = endRound(s1, balance);
    const info = writeSlot(store, 2, s2, '0.0.0', 1_700_000_000_000);
    expect(info).toMatchObject({ slot: 2, round: 2, chapter: 1, cash: s2.cash, savedAt: 1_700_000_000_000 });

    const liste = listSlots(store);
    expect(liste[0]).toBeNull();
    expect(liste[2]).toBeNull();
    expect(liste[1]).toEqual(info);
    const geladen = readSlot(store, 2);
    expect(geladen.ok && geladen.state.round).toBe(2);

    writeSlot(store, 2, s1, '0.0.0', 5);
    expect(listSlots(store)[1]).toMatchObject({ round: 1, savedAt: 5 });

    clearSlot(store, 2);
    expect(listSlots(store)).toEqual([null, null, null]);
    expect(store.daten.size).toBe(0);
  });

  it('ohne Kurzangaben liest die Liste den Spielstand selbst; Kaputtes zählt als leer', () => {
    const store = speicher();
    store.write(slotKey(1), serializeGame(newGame('ohne-meta', balance), '0.0.0'));
    expect(listSlots(store)[0]).toMatchObject({ slot: 1, round: 1, savedAt: null });
    store.write(slotMetaKey(1), 'kaputt{');
    expect(listSlots(store)[0]).toMatchObject({ slot: 1, round: 1 });
    store.write(slotKey(3), 'kein json');
    expect(listSlots(store)[2]).toBeNull();
  });

  it('unbekannte Plätze werfen', () => {
    const store = speicher();
    expect(() => writeSlot(store, 4, newGame('x', balance), '0', 0)).toThrow();
    expect(() => readSlot(store, 0)).toThrow();
  });
});
