// Fehlersuche „fast nie Öl trotz guter Prognose“: spielt den echten Ablauf wie ein
// Spieler (pachten, bohren, Runden mit Ereignissen, bergen, tiefer bohren,
// speichern und laden) über viele Seeds und vergleicht die Trefferquote mit der Theorie.
import { describe, expect, it } from 'vitest';
import { startDrilling } from './drilling';
import { newGame } from './game';
import { generateParcels } from './geology';
import { buyLease } from './lease';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { playDrillRun, type DrillRecord } from './testDrillRun';
import { loadEvents } from './testEvents';
import { shownChance } from './tutorial';

const balance = loadBalance();
const catalog = loadEvents();
const stufe1 = balance.drilling.stages[0].oilShare;

function seeds(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

function mittel(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

describe('Bohr-Trefferquote im echten Spielablauf', () => {
  it('erste Bohrung auf einer Ranch mit Prognose ≥ 60 % trifft so oft, wie die Theorie sagt', () => {
    const erste: DrillRecord[] = [];
    let aufStartoption = 0;
    for (const seed of seeds(500, 'quote')) {
      const { records } = playDrillRun(seed, balance, { catalog });
      // 0.4.20+19: Die Startquelle ist sicheres Öl – sie zählt nicht. Die Eichung der Prognose gilt für das übrige Land:
      // gemessen wird die erste Bohrung auf einer anderen Ranch.
      const sicher = newGame(seed, balance, catalog).parcels.find((p) => p.sure)?.id;
      if (records.some((r) => r.parcelId === sicher)) aufStartoption++;
      const andere = records.find((r) => r.parcelId !== sicher);
      if (andere) erste.push(andere);
    }
    expect(aufStartoption).toBeGreaterThan(0);
    const gut = erste.filter((r) => r.shown >= 60);
    expect(gut.length).toBeGreaterThan(250);
    // Etappe 1: Die Prognose rechnet mit Hinweisen, die am echten Ausgang hängen – ihre Mitte ist die Theorie.
    const chance = mittel(gut.map((r) => r.shown / 100));
    expect(chance).toBeGreaterThan(0.6);
    // Prognose ≥ 60 % heißt wirklich so oft Öl unter der Ranch, wie die Prognose sagt
    // (Toleranz gut drei Standardabweichungen bei etwa 330 Ranches) …
    expect(Math.abs(mittel(gut.map((r) => (r.dry ? 0 : 1))) - chance)).toBeLessThan(0.08);
    // … und die erste Stufe trifft davon den Anteil oilShare (Unfälle wiederholen die Stufe, Werkzeug wird geborgen).
    const ersteStufe = mittel(gut.map((r) => (r.foundStage === 1 ? 1 : 0)));
    expect(Math.abs(ersteStufe - chance * stufe1)).toBeLessThan(0.08);
    expect(ersteStufe).toBeGreaterThan(0.35);
  }, 120_000);

  it('Speichern und Laden nach jeder Aktion ändert keinen einzigen Bohrausgang', () => {
    for (const seed of seeds(40, 'laden')) {
      const ohne = playDrillRun(seed, balance, { catalog });
      const mit = playDrillRun(seed, balance, { catalog, saveLoad: true });
      expect(mit.records).toEqual(ohne.records);
      expect(mit.state.wells).toEqual(ohne.state.wells);
      expect(mit.state.rng).toBe(ohne.state.rng);
      expect(mit.state.cash).toBe(ohne.state.cash);
    }
  }, 120_000);

  it('Geologie, Reserven, Zonen und Prognosen überstehen Speichern und Laden unverändert', () => {
    const start = newGame('laden-geologie', balance, catalog);
    const geladen = deserializeGame(serializeGame(start, 'test'));
    expect(geladen.ok).toBe(true);
    if (!geladen.ok) return;
    expect(geladen.state.parcels).toEqual(start.parcels);
    expect(geladen.state.forecasts).toEqual(start.forecasts);
    expect(geladen.state.rng).toBe(start.rng);
  });

  it('nichts im Spielablauf (Ereignisse, Weltmodell, Gesetze, Bullard, Wildcatter) verändert die verdeckte Geologie', () => {
    for (const seed of seeds(30, 'geologie')) {
      const { state } = playDrillRun(seed, balance, { catalog, rounds: 30 });
      const frisch = generateParcels(balance, seed, state.regions);
      const vorher = new Map(frisch.map((p) => [p.id, p]));
      for (const p of state.parcels) {
        const f = vorher.get(p.id)!;
        // Spielspaß K1: Nur Jacobs eigener tiefer Fund vergrößert den Vorrat – um genau den findFactor seiner Tiefe.
        const ersterFund = state.wells.find((w) => w.parcelId === p.id && w.status === 'found');
        const faktor = ersterFund ? balance.drilling.stages[ersterFund.stage - 1].findFactor : 1;
        // Die Startquelle (0.4.20+19) bekommt ihr Öl bei Spielbeginn – danach ändert sich auch dort nichts mehr.
        const roh = p.sure ? { geology: 'small', reserves: balance.lease.startOptions.sureReserves } : f;
        expect([p.geology, p.reserves, p.zone, p.x, p.y]).toEqual([roh.geology, roh.reserves + Math.round(roh.reserves * (faktor - 1)), f.zone, f.x, f.y]);
      }
    }
  }, 120_000);

  it('jede Bohrung würfelt neu: der Zufall wird in den Zustand zurückgeschrieben', () => {
    const start = newGame('wurf', balance);
    const ranch = start.parcels
      .filter((p) => !p.discovery)
      .sort((a, b) => shownChance(start, b.id) - shownChance(start, a.id))
      .find((p) => buyLease(start, balance, p.id).ok)!;
    const gepachtet = buyLease(start, balance, ranch.id);
    if (!gepachtet.ok) throw new Error(gepachtet.reason);
    const gebohrt = startDrilling(gepachtet.state, balance, ranch.id);
    if (!gebohrt.ok) throw new Error(gebohrt.reason);
    expect(gebohrt.state.rng).not.toBe(gepachtet.state.rng);
    expect(gebohrt.state.wells[0].stage).toBe(1);
  });
});
