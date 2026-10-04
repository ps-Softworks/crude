// Technikstufe III – Reflexionsseismik (4.17, GDD §5): Lizenz, Trupps, Bericht
// mit schmaler Bandbreite und Größenklasse.
import { describe, expect, it } from 'vitest';
import type { GameState } from './game';
import { newGame } from './game';
import { kapitel3Of, previewKapitel3, worldOf, type SeismikReport } from './kapitel3';
import { answerInvitation } from './konsortium';
import { Rng } from './rng';
import { bestForecast, buyLicense, chapterTechStage, hireCrew, licenseCost, makeReport, orderSurvey, sizeClassOf, surveyBlocker, techStage, worldTechStage } from './seismik';
import { loadBalance } from './testBalance';
import { K3_TECH, k3Game, k3Round, ok, withK3, withTech } from './testKapitel3';

const balance = loadBalance();
const S = balance.kapitel3.seismik;

function mitLizenz(seed = 'seis'): GameState {
  return ok(buyLicense(k3Game(seed, balance), balance));
}

function ranch(s: GameState, oil: boolean) {
  const p = s.parcels.find((x) => !x.discovery && (oil ? x.geology !== 'dry' && x.reserves > 0 : x.geology === 'dry'));
  if (!p) throw new Error('keine passende Ranch');
  return p;
}

describe('Technikstufe', () => {
  it('folgt dem Technikstand der Welt (techStages), wo das Kapitel nichts garantiert', () => {
    const s = { ...withTech(newGame('stufe', balance), 0), chapter: 1 } as GameState;
    expect(worldTechStage(s, balance)).toBe(1);
    expect(worldTechStage(withTech(s, S.techStages[1]), balance)).toBe(2);
    expect(worldTechStage(withTech(s, S.techStages[2]), balance)).toBe(3);
    expect(worldTechStage(withTech(s, 95), balance)).toBe(5);
    expect(techStage(withTech(s, S.techStages[2]), balance)).toBe(3);
  });

  it('Kapitel 3 garantiert Stufe III, auch wenn die Welt langsam forscht (4.1: Runde ~81 erst tech 20–30)', () => {
    const s = k3Game('stufe3', balance);
    expect(worldOf(s, balance).tech).toBe(K3_TECH);
    expect(worldTechStage(s, balance)).toBeLessThan(S.stage);
    expect(chapterTechStage(s, balance)).toBe(S.chapterStages[2]);
    expect(techStage(s, balance)).toBe(S.stage);
    expect(techStage(withTech(s, 0), balance)).toBe(S.stage);
  });

  it('die echte Weltkurve aus 4.1 (Start 6–10, +1,7 % logistisch) reicht vor Kapitel 3 nicht für Stufe III – erst das Kapitel', () => {
    // Nachgerechnet wie nextTech in world.ts: die langsamste Welt zu Kapitel-3-Beginn (Runde 81).
    let tech = 6;
    for (let r = 0; r < 80; r++) tech += 0.017 * tech * (1 - tech / 100);
    const langsam = { ...withTech(newGame('kurve', balance), tech), chapter: 3 } as GameState;
    expect(worldTechStage(langsam, balance)).toBeLessThan(S.stage);
    expect(ok(buyLicense({ ...langsam, cash: 1_000_000 } as GameState, balance)).kapitel3!.seismik.license).toBe(true);
  });

  it('Mindeststufe je Kapitel; spätere Kapitel nehmen die letzte, die Debug-Probe zählt als Kapitel 3', () => {
    const s = withTech(newGame('kap', balance), 0);
    expect(chapterTechStage({ ...s, chapter: 2 } as GameState, balance)).toBe(S.chapterStages[1]);
    expect(chapterTechStage({ ...s, chapter: 99 } as GameState, balance)).toBe(S.chapterStages[S.chapterStages.length - 1]);
    expect(chapterTechStage(s, balance)).toBe(S.chapterStages[0]);
    expect(techStage(previewKapitel3(s, balance), balance)).toBe(S.stage);
  });

  it('eigene Forschung (4.11) hebt die Stufe, senkt sie nie', () => {
    const s = { ...withTech(newGame('forschung', balance), 0), chapter: 1 } as GameState;
    expect(techStage({ ...s, research: { stage: 4 } } as GameState, balance)).toBe(4);
    expect(techStage({ ...k3Game('f2', balance), research: { stage: 1 } } as GameState, balance)).toBe(3);
  });
});

describe('Lizenz und Trupps', () => {
  it('ohne Stufe III keine Lizenz', () => {
    const b = withK3(balance, (k) => ({ ...k, seismik: { ...k.seismik, chapterStages: [1, 1, 2] } }));
    const s = withTech(k3Game('lz', b), b.kapitel3.seismik.techStages[2] - 1);
    expect(buyLicense(s, b)).toEqual({ ok: false, reason: 'technik' });
    expect(surveyBlocker(s, b, s.parcels[0].id)).toBe('technik');
    expect(buyLicense(withTech(s, b.kapitel3.seismik.techStages[2]), b).ok).toBe(true);
  });

  it('Kapitel 1: gesperrt', () => {
    expect(buyLicense(newGame('lz1', balance), balance)).toEqual({ ok: false, reason: 'gesperrt' });
  });

  it('Lizenz kostet licenseCost, einmal', () => {
    const s0 = k3Game('lz2', balance);
    const s = ok(buyLicense(s0, balance));
    expect(s.cash).toBe(s0.cash - S.licenseCost);
    expect(s.kapitel3!.seismik.license).toBe(true);
    expect(buyLicense(s, balance)).toEqual({ ok: false, reason: 'lizenz_da' });
    expect(buyLicense({ ...s0, cash: 10 }, balance)).toEqual({ ok: false, reason: 'geld' });
  });

  it('Konsortium-Mitglieder bekommen die Lizenz umsonst', () => {
    let s = k3Game('lz3', balance);
    s = { ...s, kapitel3: { ...kapitel3Of(s, balance)!, konsortium: { ...kapitel3Of(s, balance)!.konsortium, invitedRound: 1 } } };
    s = ok(answerInvitation(s, balance, 'annehmen'));
    expect(licenseCost(s.kapitel3!, balance)).toBe(0);
    const cash = s.cash;
    s = ok(buyLicense(s, balance));
    expect(s.cash).toBe(cash);
  });

  it('weitere Trupps bis maxCrews', () => {
    let s = mitLizenz('crew');
    expect(hireCrew(k3Game('crew0', balance), balance)).toEqual({ ok: false, reason: 'lizenz_fehlt' });
    for (let i = S.crews; i < S.maxCrews; i++) s = ok(hireCrew(s, balance));
    expect(s.kapitel3!.seismik.crews).toBe(S.maxCrews);
    expect(hireCrew(s, balance)).toEqual({ ok: false, reason: 'max_trupps' });
  });
});

describe('Vermessung', () => {
  it('Trupp schicken kostet surveyCost; der Bericht kommt nach surveyRounds', () => {
    const s0 = mitLizenz('verm');
    const p = ranch(s0, true);
    const s = ok(orderSurvey(s0, balance, p.id));
    expect(s.cash).toBe(s0.cash - S.surveyCost);
    expect(surveyBlocker(s, balance, p.id)).toBe('laeuft_schon');
    let t = s;
    for (let i = 0; i < S.surveyRounds; i++) t = k3Round(t, balance);
    const r = t.kapitel3!.seismik.reports[p.id];
    expect(r).toBeDefined();
    expect(r.round).toBe(s.round + S.surveyRounds);
    expect(t.kapitel3!.seismik.surveys).toHaveLength(0);
    expect(t.kapitel3!.notes.some((n) => n.key === 'seismik_bericht' && n.vars?.ranch === p.id)).toBe(true);
    expect(surveyBlocker(t, balance, p.id)).toBe('schon_vermessen');
  });

  it('Sperren: ohne Lizenz, Fundstelle, alle Trupps unterwegs, kein Geld', () => {
    const ohne = k3Game('sperre', balance);
    const p = ranch(ohne, true);
    expect(surveyBlocker(ohne, balance, p.id)).toBe('lizenz_fehlt');
    const s = mitLizenz('sperre');
    const fund = s.parcels.find((x) => x.discovery)!;
    expect(surveyBlocker(s, balance, fund.id)).toBe('parzelle');
    expect(surveyBlocker(s, balance, 'gibt-es-nicht')).toBe('parzelle');
    const andere = s.parcels.filter((x) => !x.discovery);
    let t = s;
    for (let i = 0; i < S.crews; i++) t = ok(orderSurvey(t, balance, andere[i].id));
    expect(surveyBlocker(t, balance, andere[S.crews].id)).toBe('kein_trupp');
    expect(surveyBlocker({ ...s, cash: 0 }, balance, p.id)).toBe('geld');
  });

  it('beste Schätzung: Seismik vor Geologe', () => {
    const s0 = mitLizenz('best');
    const p = ranch(s0, true);
    expect(bestForecast(s0, p.id)).toEqual(s0.forecasts[p.id]);
    const t = k3Round(ok(orderSurvey(s0, balance, p.id)), balance);
    const r = t.kapitel3!.seismik.reports[p.id];
    expect(bestForecast(t, p.id)).toMatchObject({ low: r.low, high: r.high });
  });
});

describe('Bericht (makeReport)', () => {
  it('Bandbreite höchstens width breit (plus Raster), auf rounding gerundet', () => {
    const s = k3Game('br', balance);
    const rng = new Rng(7);
    for (const p of s.parcels.filter((x) => !x.discovery)) {
      const r = makeReport(balance, p, 1, rng);
      expect(r.high - r.low).toBeLessThanOrEqual(S.width + S.rounding);
      expect(r.high).toBeGreaterThan(r.low);
      expect(r.low % S.rounding).toBe(0);
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.high).toBeLessThanOrEqual(100);
    }
  });

  /** Berichte für alle Ranches aus n Partien, getrennt nach Öl und trocken. */
  function berichte(b = balance, n = 40) {
    const oel: SeismikReport[] = [];
    const trocken: SeismikReport[] = [];
    for (let i = 0; i < n; i++) {
      const s = newGame(`br-${i}`, b);
      const rng = new Rng(i + 1);
      for (const p of s.parcels.filter((x) => !x.discovery)) {
        const r = makeReport(b, p, 1, rng);
        (p.geology !== 'dry' && p.reserves > 0 ? oel : trocken).push(r);
      }
    }
    return { oel, trocken };
  }
  const mitte = (r: { low: number; high: number }) => (r.low + r.high) / 2;
  const schnitt = (rs: { low: number; high: number }[]) => rs.reduce((a, r) => a + mitte(r), 0) / rs.length;

  it('sieht die wirkliche Falle zum Teil: Ranches mit Öl schätzt sie im Schnitt höher als trockene', () => {
    const { oel, trocken } = berichte();
    expect(schnitt(oel) - schnitt(trocken)).toBeGreaterThan(10);
  });

  it('kein Orakel (GDD §5 „gut“): die Bänder von Öl- und trockenen Ranches überlappen deutlich', () => {
    const { oel, trocken } = berichte();
    const ueberlapp = (r: { low: number; high: number }, andere: { low: number; high: number }[]) => andere.some((o) => o.low < r.high && r.low < o.high);
    // Ein nennenswerter Teil der trockenen Ranches bekommt ein Band, das auch eine Ranch mit Öl hätte bekommen können …
    const trockenWieOel = trocken.filter((r) => ueberlapp(r, oel)).length / trocken.length;
    expect(trockenWieOel).toBeGreaterThan(0.5);
    // … und umgekehrt. Auch eine trockene Ranch kann höher geschätzt werden als eine mit Öl.
    const oelWieTrocken = oel.filter((r) => ueberlapp(r, trocken)).length / oel.length;
    expect(oelWieTrocken).toBeGreaterThan(0.5);
    const hohesTrocken = trocken.filter((r) => mitte(r) >= 55).length / trocken.length;
    const niedrigesOel = oel.filter((r) => mitte(r) < 55).length / oel.length;
    expect(hohesTrocken).toBeGreaterThan(0.06);
    expect(niedrigesOel).toBeGreaterThan(0.1);
  });

  it('Fehlmessung: falseTrap hebt bei trockenen Ranches auch die Chance, missTrap senkt sie bei Öl', () => {
    const ohne = withK3(balance, (k) => ({ ...k, seismik: { ...k.seismik, falseTrap: 0, missTrap: 0 } }));
    const immer = withK3(balance, (k) => ({ ...k, seismik: { ...k.seismik, falseTrap: 1, missTrap: 1 } }));
    const a = berichte(ohne, 15);
    const b = berichte(immer, 15);
    expect(schnitt(b.trocken) - schnitt(a.trocken)).toBeGreaterThan(20);
    expect(schnitt(a.oel) - schnitt(b.oel)).toBeGreaterThan(20);
    // Übersehene Falle: keine Struktur im Bild.
    expect(b.oel.every((r) => r.sizeLow === null)).toBe(true);
  });

  it('zieht genau vier Zufallszahlen – bei Öl wie bei trocken', () => {
    const s = newGame('vier', balance);
    for (const p of [ranch(s, true), ranch(s, false)]) {
      const rng = new Rng(11);
      makeReport(balance, p, 1, rng);
      const ref = new Rng(11);
      for (let i = 0; i < 4; i++) ref.float();
      expect(rng.state).toBe(ref.state);
    }
  });

  it('Größenklassen nach balance.yaml', () => {
    expect(sizeClassOf(balance, 0)).toBe(0);
    expect(sizeClassOf(balance, S.sizeClasses[2].from)).toBe(2);
    expect(sizeClassOf(balance, 1e12)).toBe(S.sizeClasses.length - 1);
  });
});
