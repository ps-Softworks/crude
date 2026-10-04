// 4.10: Die Pinnwand zeigt die Diplomatie erst ab Kapitel 2.
import { describe, expect, it } from 'vitest';
import { startDiplomacy } from '../sim/diplomacy';
import { newGame } from '../sim/game';
import { balance } from './balance';
import { diplomacyPin, diplomacyTabs } from './sheets/DiplomacySheet';

describe('Pinnwand: Diplomatie', () => {
  it('in Kapitel 1 keine Reiter und kein Zettel', () => {
    const k1 = newGame('pin', balance);
    expect(diplomacyTabs(k1)).toEqual([]);
    expect(diplomacyPin(k1)).toBeNull();
  });

  it('ab Kapitel 2 vier Reiter und ein Zettel zur Nachfolge', () => {
    const k2 = startDiplomacy(newGame('pin', balance), balance, 2);
    expect(diplomacyTabs(k2).map((t) => t.id)).toEqual(['nachfolge', 'absprachen', 'uebernahmen', 'verband']);
    expect(diplomacyPin(k2)).toContain('Crane-Nachfolge');
  });
});
