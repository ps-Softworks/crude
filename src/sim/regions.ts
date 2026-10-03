// Gebiete (0.2.15+5): Die Karte von Cordova ist in Gebiete geteilt (content/map.yaml).
// In Kapitel 1 ist nur Salt Hill offen; die Nachbarbezirke sind sichtbar, aber
// gesperrt. Freigeschaltet wird ein Gebiet später über Ereignisse – eine Antwort
// mit unlocks: [gebiet] (siehe content/events/README.md). Das Ereignis setzt nur
// den Schalter; openRegions erzeugt danach die Ranches des Gebiets aus dem Seed.

import type { Balance } from './balance';
import type { EventDef } from './events';
import { formatDate } from './calendar';
import { assignFields, buildFields } from './field';
import { makeForecasts } from './forecast';
import type { GameState } from './game';
import { generateParcels } from './geology';
import { Rng, seedFromString } from './rng';
import { regionById, type WorldMap } from './worldMap';

/** Ist das Gebiet offen? */
export function regionUnlocked(state: Pick<GameState, 'regions'>, regionId: string): boolean {
  return state.regions.includes(regionId);
}

/** Schalter umlegen: Das Gebiet gilt ab jetzt als offen (Ranches kommen mit openRegions). */
export function unlockRegion(state: GameState, regionId: string): GameState {
  if (regionUnlocked(state, regionId)) return state;
  return { ...state, regions: [...state.regions, regionId] };
}

/**
 * Offene bohrbare Gebiete ohne Ranches bekommen jetzt ihre Ranches, Felder und
 * Prognosen – mit eigenem Zufall je Gebiet, damit Jacobs Zufall und die schon
 * bekannten Ranches unberührt bleiben. Unbekannte Gebiete werden ignoriert.
 */
export function openRegions(state: GameState, balance: Balance): GameState {
  const neu = state.regions.filter((id) => {
    const region = regionById(balance.world, id);
    return region?.kind === 'drillable' && !state.parcels.some((p) => p.region === id);
  });
  if (neu.length === 0) return state;
  let next = state;
  for (const regionId of neu) {
    const geologie = generateParcels(balance, state.seed, [regionId]);
    const felder = buildFields(geologie).map((f, i) => ({ ...f, id: `f-${next.fields.length + i}` }));
    const parcels = assignFields(geologie, felder);
    const rng = new Rng(seedFromString(`${state.seed}:prognose:${regionId}`));
    const forecasts = makeForecasts(balance, parcels, balance.forecast.geologist, rng);
    const name = regionById(balance.world, regionId)!.name.de;
    next = {
      ...next,
      parcels: [...next.parcels, ...parcels],
      fields: [...next.fields, ...felder],
      forecasts: { ...next.forecasts, ...forecasts },
      log: [...next.log, `${formatDate(next)}: Neues Land: ${name} ist offen – ${parcels.length} Ranches und Farmen warten auf Pächter.`],
    };
  }
  return next;
}

/**
 * Prüft Verweise der Ereignisse auf die Karte: ranch muss eine Figur aus
 * content/map.yaml sein, unlocks ein Gebiet daraus. Gibt Fehlertexte zurück.
 */
export function mapRefErrors(events: readonly EventDef[], world: WorldMap): string[] {
  const figuren = new Set(world.figures.map((f) => f.id));
  const gebiete = new Set(world.regions.map((r) => r.id));
  const fehler: string[] = [];
  for (const e of events) {
    if (e.ranch !== undefined && !figuren.has(e.ranch)) {
      fehler.push(`Ereignis „${e.id}“: ranch „${e.ranch}“ ist keine Figur aus content/map.yaml (${[...figuren].join(', ')}).`);
    }
    for (const c of e.choices) {
      for (const g of c.unlocks ?? []) {
        if (!gebiete.has(g)) fehler.push(`Ereignis „${e.id}“, Wahl „${c.id}“: unlocks „${g}“ ist kein Gebiet aus content/map.yaml.`);
      }
    }
  }
  return fehler;
}
