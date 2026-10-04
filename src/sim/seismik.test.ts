// Technikstufe III – Reflexionsseismik (4.17, GDD §5): Lizenz, Trupps, Bericht
// mit schmaler Bandbreite und Größenklasse.
import { describe, expect, it } from 'vitest';
import type { GameState } from './game';
import { newGame } from './game';
import { kapitel3Of } from './kapitel3';
import { answerInvitation } from './konsortium';
import { Rng } from './rng';
import { bestForecast, buyLicense, hireCrew, licenseCost, makeReport, orderSurvey, sizeClassOf, surveyBlocker, techStage } from './seismik';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, ok, withK3 } from './testKapitel3';

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
  it('folgt dem Technikstand der Welt (Ersatzwert 50 = Stufe III)', () => {
    const s = k3Game('stufe', balance);
    expect(techStage(s, balance)).toBe(3);
    expect(techStage({ ...s, worldModel: { tech: 10 } } as GameState, balance)).toBe(1);
    expect(techStage({ ...s, worldModel: { tech: S.techStages[1] } } as GameState, balance)).toBe(2);
    expect(techStage({ ...s, worldModel: { tech: 95 } } as GameState, balance)).toBe(5);
  });

  it('eigene Forschung (4.11) hebt die Stufe, senkt sie nie', () => {
    const s = { ...k3Game('forschung', balance), worldModel: { tech: 10 } } as GameState;
    expect(techStage({ ...s, research: { stage: 3 } } as GameState, balance)).toBe(3);
    expect(techStage({ ...k3Game('f2', balance), research: { stage: 1 } } as GameState, balance)).toBe(3);
  });
});

describe('Lizenz und Trupps', () => {
  it('ohne Stufe III keine Lizenz', () => {
    const s = { ...k3Game('lz', balance), worldModel: { tech: 30 } } as GameState;
    expect(buyLicense(s, balance)).toEqual({ ok: false, reason: 'technik' });
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

  it('sieht die wirkliche Falle: Ranches mit Öl schätzt sie deutlich höher als trockene', () => {
    let oel = 0;
    let trocken = 0;
    let nOel = 0;
    let nTrocken = 0;
    for (let i = 0; i < 20; i++) {
      const s = newGame(`br-${i}`, balance);
      const rng = new Rng(i);
      for (const p of s.parcels.filter((x) => !x.discovery)) {
        const r = makeReport(balance, p, 1, rng);
        if (p.geology === 'dry') {
          trocken += (r.low + r.high) / 2;
          nTrocken++;
        } else {
          oel += (r.low + r.high) / 2;
          nOel++;
        }
      }
    }
    expect(oel / nOel - trocken / nTrocken).toBeGreaterThan(40);
  });

  it('Größe: die wahre Klasse liegt immer in der Spanne, höchstens zwei Klassen breit', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 10; i++) {
      const s = newGame(`gr-${i}`, balance);
      for (const p of s.parcels.filter((x) => !x.discovery && x.geology !== 'dry' && x.reserves > 0)) {
        const r = makeReport(balance, p, 1, rng);
        const echt = sizeClassOf(balance, p.reserves);
        expect(r.sizeLow).not.toBeNull();
        expect(r.sizeLow!).toBeLessThanOrEqual(echt);
        expect(r.sizeHigh!).toBeGreaterThanOrEqual(echt);
        expect(r.sizeHigh! - r.sizeLow!).toBeLessThanOrEqual(1);
      }
    }
  });

  it('trockene Ranch: meist keine Struktur, ohne falseTrap nie', () => {
    const b = withK3(balance, (k) => ({ ...k, seismik: { ...k.seismik, falseTrap: 0 } }));
    const s = newGame('tr', b);
    const rng = new Rng(5);
    for (const p of s.parcels.filter((x) => !x.discovery && x.geology === 'dry')) {
      expect(makeReport(b, p, 1, rng).sizeLow).toBeNull();
    }
  });

  it('zieht genau drei Zufallszahlen', () => {
    const s = newGame('drei', balance);
    const p = ranch(s, true);
    const rng = new Rng(11);
    makeReport(balance, p, 1, rng);
    const ref = new Rng(11);
    ref.float();
    ref.float();
    ref.float();
    expect(rng.state).toBe(ref.state);
  });

  it('Größenklassen nach balance.yaml', () => {
    expect(sizeClassOf(balance, 0)).toBe(0);
    expect(sizeClassOf(balance, S.sizeClasses[2].from)).toBe(2);
    expect(sizeClassOf(balance, 1e12)).toBe(S.sizeClasses.length - 1);
  });
});
