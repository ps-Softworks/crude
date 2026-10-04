import { describe, expect, it } from 'vitest';
import { escape, initialScene, ruthTarget, sceneReducer, seen, targetObject, type SceneAction, type SceneState } from './sceneState';

function nach(...actions: SceneAction[]): SceneState {
  return actions.reduce(sceneReducer, initialScene);
}

describe('Szenenzustand', () => {
  it('öffnet ein Fenster mit Reiter und schließt es wieder', () => {
    const s = nach({ type: 'open', sheet: 'fracht', tab: 'verkauf' });
    expect(s.sheet).toEqual({ id: 'fracht', tab: 'verkauf' });
    expect(nach({ type: 'open', sheet: 'fracht' }, { type: 'close' }).sheet).toBeNull();
  });

  it('hält immer nur ein Fenster offen', () => {
    const s = nach({ type: 'open', sheet: 'post' }, { type: 'open', sheet: 'kassenbuch' });
    expect(s.sheet?.id).toBe('kassenbuch');
  });

  it('springt mit „zurück“ ins vorige Fenster samt Reiter', () => {
    const s = nach({ type: 'open', sheet: 'post', back: { sheet: 'glocke' } }, { type: 'back' });
    expect(s.sheet).toEqual({ id: 'glocke' });
    const t = nach({ type: 'open', sheet: 'kassenbuch', back: { sheet: 'fracht', tab: 'lager' } }, { type: 'back' });
    expect(t.sheet).toEqual({ id: 'fracht', tab: 'lager' });
    expect(nach({ type: 'open', sheet: 'post' }, { type: 'back' }).sheet).toBeNull();
  });

  it('wechselt den Reiter nur bei offenem Fenster', () => {
    expect(nach({ type: 'tab', tab: 'wege' }).sheet).toBeNull();
    expect(nach({ type: 'open', sheet: 'fracht' }, { type: 'tab', tab: 'wege' }).sheet?.tab).toBe('wege');
  });

  it('merkt sich, was in dieser Runde angesehen wurde, und vergisst es zur nächsten Runde', () => {
    const s = nach({ type: 'round', round: 3, autoNewspaper: false }, { type: 'open', sheet: 'zeitung' }, { type: 'close' });
    expect(seen(s, 'zeitung')).toBe(true);
    expect(seen(sceneReducer(s, { type: 'round', round: 4, autoNewspaper: false }), 'zeitung')).toBe(false);
  });

  it('schlägt zu Rundenbeginn höchstens die Zeitung auf', () => {
    const s = nach({ type: 'round', round: 2, autoNewspaper: true });
    expect(s.sheet?.id).toBe('zeitung');
    expect(seen(s, 'zeitung')).toBe(true);
    // Dieselbe Runde noch einmal: nichts passiert.
    const t = sceneReducer({ ...s, sheet: null }, { type: 'round', round: 2, autoNewspaper: true });
    expect(t.sheet).toBeNull();
    // Abgeschaltet: kein Fenster.
    expect(nach({ type: 'round', round: 2, autoNewspaper: false }).sheet).toBeNull();
  });

  it('drängt die Zeitung nicht über ein offenes Fenster', () => {
    const s = nach({ type: 'open', sheet: 'kassenbuch' }, { type: 'round', round: 5, autoNewspaper: true });
    expect(s.sheet?.id).toBe('kassenbuch');
  });

  it('zeigt eine Ranch auf der Karte und schließt dabei das Fenster', () => {
    const s = nach({ type: 'open', sheet: 'akte' }, { type: 'showOnMap', id: 'p1' });
    expect(s).toMatchObject({ view: 'map', ranch: 'p1', sheet: null });
  });

  it('vergisst die Ranch beim Wechsel zurück zum Schreibtisch', () => {
    const s = nach({ type: 'showOnMap', id: 'p1' }, { type: 'view', view: 'desk' });
    expect(s).toMatchObject({ view: 'desk', ranch: null });
  });

  describe('Esc-Reihenfolge', () => {
    const voll: SceneState = { ...initialScene, view: 'map', ranch: 'p1', sheet: { id: 'kassenbuch' }, visitor: 'silas_schnaps' };

    it('schickt erst den Besucher vor die Tür, dann schließt es Fenster, Ranch, Karte', () => {
      const a = escape(voll);
      expect(a).toMatchObject({ visitor: null, sheet: { id: 'kassenbuch' }, ranch: 'p1', view: 'map' });
      const b = escape(a);
      expect(b).toMatchObject({ sheet: null, ranch: 'p1', view: 'map' });
      const c = escape(b);
      expect(c).toMatchObject({ ranch: null, view: 'map' });
      const d = escape(c);
      expect(d.view).toBe('desk');
      expect(escape(d)).toBe(d);
    });

    it('läuft auch über den Reducer', () => {
      expect(sceneReducer(voll, { type: 'escape' }).visitor).toBeNull();
    });
  });

  it('setzt beim neuen Spiel alles zurück', () => {
    const s = nach({ type: 'showOnMap', id: 'p1' }, { type: 'round', round: 4, autoNewspaper: false }, { type: 'reset' });
    expect(s).toEqual(initialScene);
  });
});

describe('Ruths Zettel', () => {
  const leer = { tutorial: null, stepParcelIds: [], openTargets: [], finished: false } as const;

  it('folgt dem Einstieg zu Verkauf, Kassenbuch, Glocke oder Ranch', () => {
    expect(ruthTarget({ ...leer, tutorial: { kind: 'sell' } })).toEqual({ kind: 'sheet', sheet: 'fracht', tab: 'verkauf' });
    expect(ruthTarget({ ...leer, tutorial: { kind: 'loan' } })).toEqual({ kind: 'sheet', sheet: 'kassenbuch' });
    expect(ruthTarget({ ...leer, tutorial: { kind: 'endRound' } })).toEqual({ kind: 'sheet', sheet: 'glocke' });
    expect(ruthTarget({ ...leer, tutorial: { kind: 'lease', parcelId: 'p7' } })).toEqual({ kind: 'ranch', parcelId: 'p7' });
  });

  it('zeigt ohne Einstieg auf die Ranch des nächsten Schritts, sonst aufs erste Offene, sonst auf die Glocke', () => {
    expect(ruthTarget({ ...leer, stepParcelIds: ['p2', 'p3'] })).toEqual({ kind: 'ranch', parcelId: 'p2' });
    expect(ruthTarget({ ...leer, openTargets: ['tuer', 'post'] })).toEqual({ kind: 'sheet', sheet: 'post' });
    expect(ruthTarget(leer)).toEqual({ kind: 'sheet', sheet: 'glocke' });
    expect(ruthTarget({ ...leer, finished: true })).toBeNull();
  });

  it('lässt den passenden Gegenstand leuchten', () => {
    expect(targetObject({ kind: 'ranch', parcelId: 'p1' })).toBe('karte');
    expect(targetObject({ kind: 'sheet', sheet: 'kassenbuch' })).toBe('kassenbuch');
    expect(targetObject(null)).toBeNull();
  });
});
