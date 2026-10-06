import { describe, expect, it } from 'vitest';
import type { DeeperOutlook } from '../sim/deeper';
import { deeperShort, schwelleText } from './deeperText';

const WETTE: DeeperOutlook = { stage: 2, depth: 600, cost: 1100, risk: 46, valueSmall: 15000, valueGusher: 50000, value: 20000, breakEven: 0.0573, chance: 0.09, expected: 654 };

describe('Texte zum Tieferbohren', () => {
  it('Schwelle in ganzen Prozent, kleine Werte als „unter 1 %“', () => {
    expect(schwelleText(0.0573)).toBe('etwa 6 %');
    expect(schwelleText(0.003)).toBe('unter 1 %');
  });

  it('Kurzform mit Geologe, ohne Prognose und zu spät im Kapitel', () => {
    expect(deeperShort(WETTE)).toBe('600 m lohnt ab etwa 6 %, Geologe 9 %');
    expect(deeperShort({ ...WETTE, chance: null })).toBe('600 m lohnt ab etwa 6 %');
    expect(deeperShort({ ...WETTE, breakEven: 1 })).toBe('ein Fund in 600 m käme zu spät');
    expect(deeperShort(null)).toBeNull();
  });
});
