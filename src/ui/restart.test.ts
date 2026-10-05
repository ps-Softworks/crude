import { afterEach, describe, expect, it } from 'vitest';
import { newGame } from '../sim/game';
import { loadBalance } from '../sim/testBalance';
import { clearAutosave, loadAutosave, writeAutosave } from './autosave';
import { confirmKey } from './confirm';
import { freshSeed, withoutSeedParam } from './restart';

const balance = loadBalance();
const g = globalThis as { window?: unknown };
const vorher = g.window;
afterEach(() => {
  g.window = vorher;
});

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

describe('Neues Spiel (0.4.20+1)', () => {
  it('zieht einen neuen Seed, nie den alten', () => {
    expect(freshSeed('abc', () => 'xyz')).toBe('xyz');
    const folge = ['abc', 'abc', 'neu'];
    expect(freshSeed('abc', () => folge.shift()!)).toBe('neu');
    expect(freshSeed('abc', () => 'abc')).not.toBe('abc');
    const seeds = new Set(Array.from({ length: 50 }, () => freshSeed('abc')));
    expect(seeds.has('abc')).toBe(false);
    expect(seeds.size).toBeGreaterThan(40);
  });

  it('neuer Seed heißt neue Welt', () => {
    const alt = newGame('alt', balance);
    const neu = newGame(freshSeed('alt'), balance);
    expect(neu.seed).not.toBe(alt.seed);
    expect(neu.round).toBe(1);
  });

  it('nimmt ?seed= aus der Adresse, sonst käme nach dem Neuladen die alte Welt zurück', () => {
    expect(withoutSeedParam('https://x.test/spiel/?seed=abc&debug=1')).toBe('https://x.test/spiel/?debug=1');
    expect(withoutSeedParam('https://x.test/spiel/?debug=1')).toBeNull();
    expect(withoutSeedParam('kein url')).toBeNull();
  });

  it('löscht den Autosave, danach startet der nächste Besuch neu', () => {
    const ls = fakeLocalStorage();
    g.window = { localStorage: ls };
    expect(writeAutosave(newGame('gespeichert', balance))).toBe(true);
    expect(loadAutosave()?.seed).toBe('gespeichert');
    clearAutosave();
    expect(loadAutosave()).toBeNull();
    expect(ls.length).toBe(0);
  });

  it('läuft auch, wenn der localStorage gesperrt ist (abgeschottetes iframe)', () => {
    g.window = {
      get localStorage(): Storage {
        throw new Error('SecurityError: The document is sandboxed and lacks the allow-same-origin flag.');
      },
    };
    expect(() => clearAutosave()).not.toThrow();
    expect(loadAutosave()).toBeNull();
    expect(writeAutosave(newGame('ohne-speicher', balance))).toBe(false);
  });
});

describe('Rückfrage im Spiel (statt window.confirm)', () => {
  it('Esc bricht ab, Enter bestätigt – auf „Abbrechen“ löst Enter den Knopf selbst aus', () => {
    expect(confirmKey('Escape', false)).toBe('cancel');
    expect(confirmKey('Escape', true)).toBe('cancel');
    expect(confirmKey('Enter', false)).toBe('confirm');
    expect(confirmKey('Enter', true)).toBeNull();
    expect(confirmKey('a', false)).toBeNull();
    expect(confirmKey('Tab', false)).toBeNull();
  });
});
