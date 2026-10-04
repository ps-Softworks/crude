import { describe, expect, it } from 'vitest';
import { AUTO_BESUCH, autoVisitor, escape, initialScene, restoreScene, ruthTarget, sceneReducer, seen, storeScene, targetObject, type SceneAction, type SceneState } from './sceneState';

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

  it('nach der Glocke: erst der Rundenbericht, dann die Zeitung, dann ein Besuch (0.2.15+11)', () => {
    const s = nach({ type: 'round', round: 3, autoNewspaper: true, report: true });
    expect(s.sheet).toEqual({ id: 'bericht', then: 'zeitung' });
    expect(autoVisitor(s, { tableaus: [], visitors: ['silas'], autoNewspaper: true, newspaper: true, busy: false })).toBeNull();
    const zeitung = sceneReducer(s, { type: 'close' });
    expect(zeitung.sheet?.id).toBe('zeitung');
    expect(seen(zeitung, 'zeitung')).toBe(true);
    const frei = sceneReducer(zeitung, { type: 'escape' });
    expect(frei.sheet).toBeNull();
    expect(autoVisitor(frei, { tableaus: [], visitors: ['silas'], autoNewspaper: true, newspaper: true, busy: false })).toBe('silas');
    // Ohne Zeitung: nur der Bericht; Esc schließt ihn ganz.
    const ohne = nach({ type: 'round', round: 3, autoNewspaper: false, report: true });
    expect(ohne.sheet).toEqual({ id: 'bericht' });
    expect(sceneReducer(ohne, { type: 'escape' }).sheet).toBeNull();
  });

  it('ein Fenster kann mit einer bestimmten Karte vorn aufgehen (0.2.15+11)', () => {
    expect(nach({ type: 'open', sheet: 'post', focus: 'witwe' }).sheet).toEqual({ id: 'post', focus: 'witwe' });
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

  it('bittet einen Besucher herein: Fenster zu, gilt als gesehen, kein Besuch mehr von selbst', () => {
    const s = nach({ type: 'open', sheet: 'post' }, { type: 'visitor', id: 'silas_schnaps' });
    expect(s).toMatchObject({ visitor: 'silas_schnaps', sheet: null });
    expect(seen(s, 'ev:silas_schnaps')).toBe(true);
    expect(seen(s, AUTO_BESUCH)).toBe(true);
    // „Bitten Sie zu warten“: nur hinaus – das Ereignis bleibt in der Simulation offen.
    expect(sceneReducer(s, { type: 'visitor', id: null }).visitor).toBeNull();
  });

  it('merkt sich Gesehenes ohne Doppel', () => {
    const s = nach({ type: 'seen', keys: ['ev:a', 'ev:b'] }, { type: 'seen', keys: ['ev:a'] });
    expect(s.seen).toEqual(['ev:a', 'ev:b']);
    expect(sceneReducer(s, { type: 'seen', keys: ['ev:b'] })).toBe(s);
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
    expect(ruthTarget({ ...leer, openTargets: ['post', 'tuer'] })).toEqual({ kind: 'sheet', sheet: 'post' });
    expect(ruthTarget({ ...leer, openTargets: ['tuer', 'post'] })).toEqual({ kind: 'tuer' });
    expect(ruthTarget(leer)).toEqual({ kind: 'sheet', sheet: 'glocke' });
    expect(ruthTarget({ ...leer, finished: true })).toBeNull();
  });

  it('lässt den passenden Gegenstand leuchten', () => {
    expect(targetObject({ kind: 'ranch', parcelId: 'p1' })).toBe('karte');
    expect(targetObject({ kind: 'sheet', sheet: 'kassenbuch' })).toBe('kassenbuch');
    expect(targetObject({ kind: 'tuer' })).toBe('tuer');
    expect(targetObject(null)).toBeNull();
  });
});

describe('Besuch von selbst (gegen die Fensterflut)', () => {
  const basis = { tableaus: [] as string[], visitors: ['silas_schnaps', 'ruth_sorge'], autoNewspaper: true, newspaper: true, busy: false };
  const runde = nach({ type: 'round', round: 3, autoNewspaper: true });

  it('wartet, bis die Zeitung gelesen und zu ist, dann kommt der Erste herein', () => {
    expect(runde.sheet?.id).toBe('zeitung');
    expect(autoVisitor(runde, basis)).toBeNull();
    const zu = sceneReducer(runde, { type: 'close' });
    expect(autoVisitor(zu, basis)).toBe('silas_schnaps');
  });

  it('kommt nur einmal je Runde – danach warten alle still', () => {
    const zu = sceneReducer(runde, { type: 'close' });
    const drin = sceneReducer(zu, { type: 'visitor', id: 'silas_schnaps' });
    const raus = sceneReducer(drin, { type: 'visitor', id: null });
    expect(autoVisitor(raus, basis)).toBeNull();
    // Nächste Runde wieder.
    const weiter = sceneReducer(sceneReducer(raus, { type: 'round', round: 4, autoNewspaper: true }), { type: 'close' });
    expect(autoVisitor(weiter, basis)).toBe('silas_schnaps');
  });

  it('eine Szene geht vor, ohne Zeitung kommt der Besuch sofort, nie aber über Fenster, Karte oder Übergang', () => {
    const zu = sceneReducer(runde, { type: 'close' });
    expect(autoVisitor(zu, { ...basis, tableaus: ['brand_nachbar'] })).toBe('brand_nachbar');
    const ohne = nach({ type: 'round', round: 3, autoNewspaper: false });
    expect(autoVisitor(ohne, { ...basis, autoNewspaper: false })).toBe('silas_schnaps');
    expect(autoVisitor(ohne, { ...basis, newspaper: false })).toBe('silas_schnaps');
    expect(autoVisitor(sceneReducer(ohne, { type: 'open', sheet: 'post' }), { ...basis, autoNewspaper: false })).toBeNull();
    expect(autoVisitor(sceneReducer(ohne, { type: 'view', view: 'map' }), { ...basis, autoNewspaper: false })).toBeNull();
    expect(autoVisitor(ohne, { ...basis, autoNewspaper: false, busy: true })).toBeNull();
    expect(autoVisitor(ohne, { ...basis, autoNewspaper: false, visitors: [] })).toBeNull();
  });
});

describe('Gesehenes über ein Neuladen hinweg', () => {
  it('gilt nur für dieselbe Partie und Runde', () => {
    const s = nach({ type: 'round', round: 5, autoNewspaper: true }, { type: 'seen', keys: ['ev:post_seil'] });
    const text = storeScene(s, 'seed-a:5');
    const zurueck = restoreScene(text, 'seed-a:5');
    expect(zurueck).toMatchObject({ round: 5, seen: ['zeitung', 'ev:post_seil'], sheet: null, visitor: null });
    // Dieselbe Runde nach dem Neuladen: die Zeitung schlägt sich nicht noch einmal auf.
    expect(sceneReducer(zurueck, { type: 'round', round: 5, autoNewspaper: true }).sheet).toBeNull();
    expect(restoreScene(text, 'seed-a:6')).toEqual(initialScene);
    expect(restoreScene(text, 'seed-b:5')).toEqual(initialScene);
    expect(restoreScene('kaputt{', 'seed-a:5')).toEqual(initialScene);
    expect(restoreScene(null, 'seed-a:5')).toEqual(initialScene);
  });
});
