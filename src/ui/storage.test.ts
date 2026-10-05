import { afterEach, describe, expect, it } from 'vitest';
import { pickSaveStore, readPref, writePref, type DesktopBridge } from './storage';

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

describe('Vorlieben ohne Speicher (0.4.20+1)', () => {
  const g = globalThis as { window?: unknown };
  const vorher = g.window;
  afterEach(() => {
    g.window = vorher;
  });

  it('merkt sich die Wahl bis zum Neuladen, wenn der localStorage gesperrt ist (abgeschottetes iframe)', () => {
    g.window = {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    expect(readPref('crude.test.rundgang')).toBeNull();
    expect(() => writePref('crude.test.rundgang', 'gesehen')).not.toThrow();
    // Sonst finge der Rundgang nach jedem Ende von vorn an.
    expect(readPref('crude.test.rundgang')).toBe('gesehen');
  });

  it('liest mit Speicher, was im Speicher steht', () => {
    const ls = fakeLocalStorage();
    g.window = { localStorage: ls };
    writePref('crude.test.reiter', 'b');
    expect(ls.getItem('crude.test.reiter')).toBe('b');
    ls.setItem('crude.test.reiter', 'c');
    expect(readPref('crude.test.reiter')).toBe('c');
  });
});
