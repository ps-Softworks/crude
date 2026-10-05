// Nur für Tests und Werkzeuge: spielt den Bohr-Ablauf so, wie ein Spieler ihn
// spielt – übers Land reiten (Etappe 1), Ranch mit der besten Prognose pachten, bohren, Runde beenden (offene
// Ereignisse bekommen ihre Standard-Antwort), klemmendes Werkzeug bergen, bei
// „trocken“ tiefer bohren, auf Wunsch nach jeder Runde speichern und laden.
// Damit lässt sich die Trefferquote im echten Spielablauf mit der Theorie vergleichen.

import type { Balance } from './balance';
import { activeWells, drillDeeper, fishWell, startDrilling, wellsOn } from './drilling';
import type { EventDef } from './events';
import { trueChance } from './forecast';
import { endRound, newGame, type GameState } from './game';
import { buyLease, exerciseOption, leaseOf, optionOf } from './lease';
import { deserializeGame, serializeGame } from './save';
import { shownChance } from './tutorial';
import { suggestRide } from './exploration';
import { bookCard } from './plans';

export interface DrillRunOptions {
  /** Offene Ereignisse mit Standard-Antwort (sonst Partie ohne Ereignisse). */
  catalog?: readonly EventDef[];
  /** Nach jeder Aktion und jedem Rundenende speichern und neu laden (wie ein Neuladen der Seite). */
  saveLoad?: boolean;
  /** Nach einer trockenen Stufe tiefer bohren. */
  deeper?: boolean;
  /** So viele Runden höchstens. */
  rounds?: number;
  /** Etappe 1: vor der Wahl so oft übers Land reiten (Standard 2), wie ein Spieler es täte. */
  rides?: number;
}

/** Eine angebohrte Ranch: was der Spieler sah, was wirklich darunter lag, was herauskam. */
export interface DrillRecord {
  parcelId: string;
  /** Mitte der angezeigten Bandbreite in %. */
  shown: number;
  /** Wahre Fundchance der Ranch (q). */
  chance: number;
  dry: boolean;
  /** Stufe, in der das Öl kam; 0 = nichts gefunden. */
  foundStage: number;
}

function reload(state: GameState): GameState {
  const geladen = deserializeGame(serializeGame(state, 'test'));
  if (!geladen.ok) throw new Error(geladen.reason);
  return geladen.state;
}

/** Spielt eine Partie mit einem Turm: immer, wenn er frei ist, die Ranch mit der besten Prognose. */
export function playDrillRun(seed: string, balance: Balance, options: DrillRunOptions = {}): { records: DrillRecord[]; state: GameState } {
  const catalog = options.catalog ?? [];
  const deeper = options.deeper ?? true;
  const merke = (s: GameState) => (options.saveLoad ? reload(s) : s);
  let state = merke(newGame(seed, balance, catalog));
  const records: DrillRecord[] = [];
  for (let r = 0; r < (options.rounds ?? 12) && !state.finished; r++) {
    if (activeWells(state).length === 0) {
      // Etappe 1: Erst übers Land reiten – ohne Erkundung kennt der Spieler kaum eine Ranch.
      for (let i = 0; i < (options.rides ?? 2); i++) {
        const ziel = suggestRide(state, balance, state.cash);
        const ritt = ziel ? bookCard(state, balance, catalog, 'ritt', ziel) : null;
        if (!ritt?.ok) break;
        state = merke(ritt.state);
      }
      const s = state;
      const kandidaten = s.parcels
        .filter((p) => !p.discovery && !leaseOf(s, p.id) && (optionOf(s, p.id)?.holder ?? 'jacob') === 'jacob')
        .sort((a, b) => shownChance(s, b.id) - shownChance(s, a.id) || (a.id < b.id ? -1 : 1));
      for (const p of kandidaten) {
        const pacht = optionOf(s, p.id) ? exerciseOption(s, balance, p.id) : buyLease(s, balance, p.id);
        if (!pacht.ok) continue;
        const bohrung = startDrilling(merke(pacht.state), balance, p.id);
        if (!bohrung.ok) continue;
        records.push({ parcelId: p.id, shown: shownChance(s, p.id), chance: trueChance(balance, p), dry: p.geology === 'dry', foundStage: 0 });
        state = merke(bohrung.state);
        break;
      }
    }
    for (const w of state.wells) {
      const weiter =
        w.status === 'stuck' ? fishWell(state, balance, w.parcelId) : w.status === 'decision' && deeper ? drillDeeper(state, balance, w.parcelId) : null;
      if (weiter?.ok) state = merke(weiter.state);
    }
    state = merke(endRound(state, balance, catalog));
    for (const rec of records) {
      const erste = wellsOn(state, rec.parcelId)[0];
      if (rec.foundStage === 0 && erste?.status === 'found') rec.foundStage = erste.stage;
    }
  }
  return { records, state };
}
