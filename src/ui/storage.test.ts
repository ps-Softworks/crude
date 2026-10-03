import { describe, expect, it } from 'vitest';
import { pickSaveStore, type DesktopBridge } from './storage';

function fakeLocalStorage(): Storage {
  const daten = new Map<string, string>();
  return {
    get length() {
      return daten.size;
    },
    clear: () => daten.clear(),
    getItem: (k) => daten.get(k) ?? null,
    key: (i) => [...daten.keys()][i] ?? null,
    removeItem: (k) => void daten.delete(k),
    setItem: (k, v) => void daten.set(k, v),
  };
}

function fakeDesktop(): DesktopBridge & { dateien: Map<string, string> } {
  const dateien = new Map<string, string>();
  return {
    dateien,
    readSave: (n) => dateien.get(n) ?? null,
    writeSave: (n, t) => (dateien.set(n, t), true),
    removeSave: (n) => dateien.delete(n),
  };
}

describe('Speicherort für Spielstände', () => {
  it('nutzt im Browser den localStorage', () => {
    const ls = fakeLocalStorage();
    const store = pickSaveStore({ localStorage: ls });
    store.write('crude.autosave', 'abc');
    expect(ls.getItem('crude.autosave')).toBe('abc');
    expect(store.read('crude.autosave')).toBe('abc');
    store.remove('crude.autosave');
    expect(store.read('crude.autosave')).toBeNull();
  });

  it('nutzt in der Desktop-Fassung die Datei im Benutzerordner, nicht den localStorage', () => {
    const ls = fakeLocalStorage();
    const desktop = fakeDesktop();
    const store = pickSaveStore({ localStorage: ls, crudeDesktop: desktop });
    store.write('crude.autosave', 'xyz');
    expect(desktop.dateien.get('crude.autosave')).toBe('xyz');
    expect(ls.getItem('crude.autosave')).toBeNull();
    expect(store.read('crude.autosave')).toBe('xyz');
    store.remove('crude.autosave');
    expect(store.read('crude.autosave')).toBeNull();
  });

  it('meldet einen gescheiterten Schreibvorgang der Desktop-Hülle als Fehler', () => {
    const desktop = { ...fakeDesktop(), writeSave: () => false };
    const store = pickSaveStore({ crudeDesktop: desktop });
    expect(() => store.write('crude.autosave', 'x')).toThrow();
  });
});
