import { describe, expect, it } from 'vitest';
import { parseEventFile } from './eventContent';
import { resolveEvent, type EventDef } from './events';
import { endRound, newGame, type GameState } from './game';
import { rightsStatus } from './logistics';
import { mapRefErrors, openRegions, regionUnlocked, unlockRegion } from './regions';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

/** Ein Gerücht, dessen Antwort die Hollins-Prärie freischaltet. */
const GERUECHT = `- id: geruecht_hollins
  title: { de: "Gerücht aus der Prärie", en: "" }
  text: { de: "In Hollins soll Öl aus dem Brunnen kommen.", en: "" }
  chance: 1
  choices:
    - id: hinreiten
      label: { de: "Hinreiten", en: "" }
      result: { de: "Jacob reitet hin.", en: "" }
      unlocks: [hollins]
      default: true
`;

function katalog(): EventDef[] {
  const { events, errors } = parseEventFile('geruecht.yaml', GERUECHT);
  expect(errors).toEqual([]);
  return events;
}

describe('Gebiete (0.2.15+5)', () => {
  it('in Kapitel 1 sind nur Salt Hill und Port Ellis offen, die Nachbarbezirke gesperrt', () => {
    const state = newGame('gebiete', balance);
    expect(state.regions).toEqual(['salthill', 'portellis']);
    expect(regionUnlocked(state, 'hollins')).toBe(false);
    expect(state.parcels.every((p) => p.region === 'salthill')).toBe(true);
  });

  it('unlockRegion legt nur den Schalter um; openRegions bringt die Ranches – ohne Salt Hill zu verändern', () => {
    const state = newGame('freischalten', balance);
    const offen = unlockRegion(state, 'hollins');
    expect(offen.regions).toContain('hollins');
    expect(offen.parcels).toEqual(state.parcels);
    const mitLand = openRegions(offen, balance);
    const neu = mitLand.parcels.filter((p) => p.region === 'hollins');
    expect(neu.length).toBeGreaterThan(10);
    expect(mitLand.parcels.slice(0, state.parcels.length)).toEqual(state.parcels);
    expect(mitLand.fields.slice(0, state.fields.length)).toEqual(state.fields);
    expect(neu.every((p) => mitLand.forecasts[p.id] !== undefined)).toBe(true);
    expect(new Set(mitLand.fields.map((f) => f.id)).size).toBe(mitLand.fields.length);
    expect(mitLand.rng).toBe(state.rng);
    expect(mitLand.log.at(-1)).toMatch(/Neues Land: Hollins-Prärie ist offen/);
    // Zweimal öffnen ändert nichts mehr; gleicher Seed = gleiche neue Ranches.
    expect(openRegions(mitLand, balance)).toBe(mitLand);
    expect(openRegions(unlockRegion(newGame('freischalten', balance), 'hollins'), balance).parcels).toEqual(mitLand.parcels);
  });

  it('eine Ereignis-Antwort mit unlocks schaltet das Gebiet frei – auch als Standard-Wahl am Rundenende', () => {
    const events = katalog();
    let state: GameState = newGame('geruecht', balance);
    state = { ...state, events: { ...state.events, pending: ['geruecht_hollins'] } };
    const r = resolveEvent(state, balance, events, 'geruecht_hollins', 'hinreiten');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.regions).toContain('hollins');
    expect(r.state.parcels.some((p) => p.region === 'hollins')).toBe(true);

    const liegen = endRound(state, balance, events);
    expect(liegen.regions).toContain('hollins');
    expect(liegen.parcels.some((p) => p.region === 'hollins')).toBe(true);
  });

  it('Prüfung: ranch und unlocks müssen auf content/map.yaml zeigen', () => {
    const [e] = katalog();
    expect(mapRefErrors([e], balance.world)).toEqual([]);
    const falsch = { ...e, ranch: 'niemand', choices: e.choices.map((c) => ({ ...c, unlocks: ['atlantis'] })) };
    const fehler = mapRefErrors([falsch], balance.world);
    expect(fehler).toHaveLength(2);
    expect(fehler[0]).toMatch(/ranch „niemand“/);
    expect(fehler[1]).toMatch(/unlocks „atlantis“/);
  });

  it('alle echten Ereignisse verweisen nur auf Figuren und Gebiete, die es gibt; Moss, Pruitt und Hale haben Ereignisse', () => {
    const echte = loadEvents();
    expect(mapRefErrors(echte, balance.world)).toEqual([]);
    const figuren = new Set(echte.map((e) => e.ranch).filter((r) => r !== undefined));
    expect(figuren).toEqual(new Set(['moss', 'pruitt', 'hale']));
  });
});

describe('Wegerechte zeigen auf echte Ranches (0.2.15+5)', () => {
  it('die Pipeline-Wegerechte nennen die Ranch von Moss und Witwe Pruitt', () => {
    const state = newGame('wegerecht', balance);
    const rechte = rightsStatus(state, balance);
    const moss = state.parcels.find((p) => p.figure === 'moss')!;
    const pruitt = state.parcels.find((p) => p.figure === 'pruitt')!;
    expect(rechte.map((r) => r.parcelId)).toEqual([moss.id, pruitt.id]);
    expect(rechte[0].label).toBe(`Moss-Farm (Ezekiel Moss)`);
    expect(rechte[1].label).toContain('Witwe Pruitts Weide');
  });
});
