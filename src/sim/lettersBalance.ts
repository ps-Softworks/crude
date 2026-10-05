// Spielzahlen für die gekoppelten Briefe (Termine als Hauptwerkzeug, Etappe 3).
// Eigener Abschnitt in content/balance.yaml: „letters“. Regeln: src/sim/letters.ts.
// Der Leser ist eigenständig, damit balance.ts nur zwei Zeilen dafür braucht.

import { BalanceError } from './balance';

export interface LettersBalance {
  /** Ein Merkzeichen aus einem Plan (Ritt, Besuch bei Thorne, Gerücht …) bleibt so viele Runden stehen – so lange kann ein Brief darauf antworten. */
  window: number;
  /** „Öl zurückgehalten“: nach den Verkäufen der Runde stehen noch mindestens so viele Barrel im Tank. */
  holdStock: number;
  /** Ruf bei den Wildcattern: so viel bringt eine Antwort, die ihnen hilft (+) bzw. sie verprellt (−). */
  standing: number;
  /** „Exklusiv jetzt billiger“: Strafe je Barrel über einen anderen Weg (statt transport.thorne.exclusivePenalty). */
  cheapExclusivePenalty: number;
  /** Thornes Frachtvertrag kommt nach Jacobs erstem Besuch, spätestens ab dieser Runde. */
  thorneLatest: number;
}

function wert(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function zahl(obj: unknown, path: string): number {
  const value = wert(obj, path);
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) throw new BalanceError(`balance.yaml: "${path}" fehlt oder ist keine Zahl ab 0`);
  return value;
}

function ganz(obj: unknown, path: string): number {
  const value = zahl(obj, path);
  if (!Number.isInteger(value) || value < 1) throw new BalanceError(`balance.yaml: "${path}" muss eine ganze Zahl ab 1 sein`);
  return value;
}

export function parseLettersBalance(raw: unknown): LettersBalance {
  if (wert(raw, 'letters') === undefined) throw new BalanceError('balance.yaml: Block "letters" fehlt');
  const standing = zahl(raw, 'letters.standing');
  if (standing > 0.3) throw new BalanceError('balance.yaml: "letters.standing" höchstens 0,3 (so weit reicht der Ruf)');
  return {
    window: ganz(raw, 'letters.window'),
    holdStock: zahl(raw, 'letters.holdStock'),
    standing,
    cheapExclusivePenalty: zahl(raw, 'letters.cheapExclusivePenalty'),
    thorneLatest: ganz(raw, 'letters.thorneLatest'),
  };
}
