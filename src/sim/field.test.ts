import { describe, expect, it } from 'vitest';
import { assignFields, buildFields, fieldLabel, fieldOf } from './field';
import { newGame } from './game';
import type { Parcel } from './geology';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Kleines Testraster: 'o' = Öl, '.' = trocken, eine Zeile je Kartenreihe. */
function welt(karte: string[]): Parcel[] {
  return karte.flatMap((zeile, y) =>
    [...zeile].map((zeichen, x) => ({
      id: `p-${x}-${y}`,
      x,
      y,
      zone: 'test',
      geology: zeichen === 'o' ? ('small' as const) : ('dry' as const),
      reserves: zeichen === 'o' ? 1000 : 0,
      landowner: 'neutral' as const,
      discovery: false,
    })),
  );
}

describe('Lagerstätten finden', () => {
  it('verbindet Nachbarn zu einem Feld und addiert die Reserven', () => {
    const fields = buildFields(welt(['o.o.', 'ooo.', 'o.o.']));
    expect(fields).toHaveLength(1);
    expect(fields[0].parcelIds).toEqual(['p-0-0', 'p-2-0', 'p-0-1', 'p-1-1', 'p-2-1', 'p-0-2', 'p-2-2']);
    expect(fields[0].reserves).toBe(7000);
  });

  it('zählt Diagonalen als verbunden', () => {
    const fields = buildFields(welt(['o..', '.o.', '..o']));
    expect(fields).toHaveLength(1);
    expect(fields[0].parcelIds).toHaveLength(3);
  });

  it('trennt Öl, das sich nicht berührt', () => {
    const fields = buildFields(welt(['oo', 'oo', '..', 'oo']));
    expect(fields).toHaveLength(2);
    expect(fields[0].parcelIds).toEqual(['p-0-0', 'p-1-0', 'p-0-1', 'p-1-1']);
    expect(fields[1].parcelIds).toEqual(['p-0-3', 'p-1-3']);
  });

  it('lässt trockene Parzellen außen vor', () => {
    const fields = buildFields(welt(['oo', 'o.']));
    expect(fields).toHaveLength(1);
    expect(fields[0].parcelIds).toEqual(['p-0-0', 'p-1-0', 'p-0-1']);
  });

  it('setzt den Mittelpunkt auf das Feld', () => {
    const [feld] = buildFields(welt(['...', '.o.', '...']));
    expect([feld.x, feld.y]).toEqual([1, 1]);
    expect(feld.parcelIds).toContain('p-1-1');
  });

  it('vergibt IDs in Kartenreihenfolge, von oben links', () => {
    const fields = buildFields(welt(['.o.', '...', 'o..']));
    expect(fields.map((f) => [f.id, f.parcelIds])).toEqual([
      ['f-0', ['p-1-0']],
      ['f-1', ['p-0-2']],
    ]);
  });

  it('braucht keinen Zufall: zweimal dieselbe Karte ergibt dieselben Felder', () => {
    const once = buildFields(newGame('harlan', balance).parcels);
    const twice = buildFields(newGame('harlan', balance).parcels);
    expect(once).toEqual(twice);
    expect(once.length).toBeGreaterThan(0);
  });

  it('ändert den alten Zustand nicht', () => {
    const parcels = newGame('unveraendert', balance).parcels;
    const kopie = structuredClone(parcels);
    buildFields(parcels);
    expect(parcels).toEqual(kopie);
  });
});

describe('Lagerstätten auf der echten Karte', () => {
  const state = newGame('harlan', balance);

  it('gibt jeder ölführenden Parzelle genau ein Feld, das auch sie enthält', () => {
    for (const parcel of state.parcels) {
      if (parcel.reserves === 0) continue;
      expect(parcel.fieldId).toBeDefined();
      const field = fieldOf(state, parcel.id)!;
      expect(field.parcelIds).toContain(parcel.id);
    }
  });

  it('lässt trockene Parzellen ohne Feld', () => {
    const trocken = state.parcels.filter((p) => p.reserves === 0);
    expect(trocken.length).toBeGreaterThan(0);
    for (const parcel of trocken) {
      expect(parcel.fieldId).toBeUndefined();
      expect(fieldOf(state, parcel.id)).toBeUndefined();
    }
  });

  it('vergibt keine Parzelle doppelt und verliert keine Reserve', () => {
    const vergeben = state.fields.flatMap((f) => f.parcelIds);
    expect(new Set(vergeben).size).toBe(vergeben.length);
    const oelParzellen = state.parcels.filter((p) => p.reserves > 0);
    expect(vergeben).toHaveLength(oelParzellen.length);
    const summe = (list: { reserves: number }[]) => list.reduce((s, p) => s + p.reserves, 0);
    expect(summe(state.fields)).toBe(summe(oelParzellen));
  });

  it('findet ein Feld mit mehreren Parzellen (GDD §5: eine Lagerstätte über viele Parzellen)', () => {
    expect(Math.max(...state.fields.map((f) => f.parcelIds.length))).toBeGreaterThan(1);
  });

  it('liefert für andere Seeds andere Felder', () => {
    const anders = newGame('brandt', balance);
    expect(anders.fields).not.toEqual(state.fields);
  });
});

describe('Feld-IDs an den Parzellen', () => {
  it('setzt die ID überall, wo Öl ist, und sonst nirgends', () => {
    const parcels = welt(['oo', 'o.']);
    const fields = buildFields(parcels);
    const mitFeld = assignFields(parcels, fields);
    expect(mitFeld.filter((p) => p.fieldId !== undefined).map((p) => p.id)).toEqual(['p-0-0', 'p-1-0', 'p-0-1']);
    expect(fieldOf({ fields, parcels: mitFeld }, 'p-0-0')?.id).toBe('f-0');
    expect(fieldOf({ fields, parcels: mitFeld }, 'p-1-1')).toBeUndefined();
  });

  it('verändert die übergebenen Parzellen nicht', () => {
    const parcels = newGame('kopie', balance).parcels;
    const kopie = structuredClone(parcels);
    assignFields(parcels, buildFields(parcels));
    expect(parcels).toEqual(kopie);
  });
});

describe('Feld-Namen', () => {
  it('nennt das Feld nach seinem Mittelpunkt, ab 1 gezählt', () => {
    expect(fieldLabel({ id: 'f-0', parcelIds: [], reserves: 0, x: 0, y: 0, peakWells: 0 })).toBe('Feld 1/1');
    expect(fieldLabel({ id: 'f-3', parcelIds: [], reserves: 0, x: 6, y: 4, peakWells: 0 })).toBe('Feld 7/5');
  });
});