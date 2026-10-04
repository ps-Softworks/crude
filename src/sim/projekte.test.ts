// Konsortialprojekte (4.17): Angebote, Zeichnen, Bau mit Betrug, Fertigstellung
// oder Scheitern, Erträge, Türen über Stand und Konsortium.
import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import type { GameState } from './game';
import { kapitel3Of, type Kapitel3State } from './kapitel3';
import { declineProject, joinBlocker, joinProject, projectDef, projectRisk, projectsValue } from './projekte';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, k3Rounds, ok, withK3 } from './testKapitel3';

const balance = loadBalance();
const P = balance.kapitel3.projekte;

/** Ohne Betrug und ohne Risiko, damit Abläufe planbar sind. */
const SICHER = withK3(balance, (k) => ({ ...k, projekte: { ...k.projekte, fraud: 0, list: k.projekte.list.map((p) => ({ ...p, risk: 0 })) } }));

function patchK(s: GameState, b: Balance, f: (k: Kapitel3State) => Kapitel3State): GameState {
  return { ...s, kapitel3: f(s.kapitel3 ?? kapitel3Of(s, b)!) };
}

/** Ein Angebot für ein bestimmtes Projekt auf den Tisch legen. */
function mitAngebot(id: string, b: Balance = SICHER, extra: (k: Kapitel3State) => Kapitel3State = (k) => k): GameState {
  const s = k3Game(`proj-${id}`, b);
  return patchK(s, b, (k) => extra({ ...k, projekte: { ...k.projekte, offers: [{ id, round: s.round, until: s.round + 1 }], seen: [id] } }));
}

describe('Angebote', () => {
  it('kommen alle offerEvery Runden, jedes Projekt nur einmal, höchstens maxOffers', () => {
    let s = k3Game('ang', balance);
    const gesehen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      s = k3Round(s, balance);
      const offers = s.kapitel3!.projekte.offers;
      expect(offers.length).toBeLessThanOrEqual(P.maxOffers);
      for (const o of offers) gesehen.add(o.id);
    }
    expect(new Set(s.kapitel3!.projekte.seen).size).toBe(s.kapitel3!.projekte.seen.length);
    // Ohne Konsortium nie die Projekte nur für Mitglieder.
    for (const id of gesehen) expect(projectDef(balance, id)!.members).toBe(false);
    expect(gesehen.size).toBeGreaterThan(0);
  });

  it('das erste Angebot kommt zur Runde offerEvery des Kapitels', () => {
    const s = k3Rounds(k3Game('ang-1', balance), balance, P.offerEvery - 2);
    expect(s.kapitel3?.projekte.offers.length ?? 0).toBe(0);
    const t = k3Round(s, balance);
    expect(t.kapitel3!.projekte.offers).toHaveLength(1);
    expect(t.kapitel3!.projekte.offers[0].until).toBe(t.round + P.offerRounds - 1);
  });

  it('verfallen nach offerRounds; ablehnen räumt sofort ab', () => {
    const s = mitAngebot('fernpipeline');
    const t = k3Rounds(s, SICHER, 2);
    expect(t.kapitel3!.projekte.offers.some((o) => o.id === 'fernpipeline')).toBe(false);
    expect(t.kapitel3!.notes.some((n) => n.key === 'projekt_verfallen')).toBe(true);
    const u = ok(declineProject(s, SICHER, 'fernpipeline'));
    expect(u.kapitel3!.projekte.offers).toHaveLength(0);
    expect(declineProject(u, SICHER, 'fernpipeline')).toEqual({ ok: false, reason: 'kein_angebot' });
  });
});

describe('Zeichnen', () => {
  it('kostet Anteil × Kosten sofort', () => {
    const s = mitAngebot('fernpipeline');
    const def = projectDef(SICHER, 'fernpipeline')!;
    const share = P.shares[0];
    const t = ok(joinProject(s, SICHER, 'fernpipeline', share));
    expect(t.cash).toBe(s.cash - share * def.cost);
    const stake = t.kapitel3!.projekte.stakes[0];
    expect(stake).toMatchObject({ id: 'fernpipeline', share, status: 'bau', readyRound: s.round + def.rounds });
    expect(t.kapitel3!.projekte.offers).toHaveLength(0);
  });

  it('Sperren: Anteil, Geld, Mitglieder, Stand, kein Angebot', () => {
    const s = mitAngebot('fernpipeline');
    const k = s.kapitel3!;
    expect(joinBlocker(s, SICHER, k, 'fernpipeline', 0.33)).toBe('anteil');
    expect(joinBlocker({ ...s, cash: 0 }, SICHER, k, 'fernpipeline', P.shares[0])).toBe('geld');
    expect(joinBlocker(s, SICHER, k, 'grossraffinerie', P.shares[0])).toBe('kein_angebot');
    const nurMitglieder = mitAngebot('costa_negra');
    expect(joinProject(nurMitglieder, SICHER, 'costa_negra', P.shares[0])).toEqual({ ok: false, reason: 'nur_mitglieder' });
    const mitglied = mitAngebot('costa_negra', SICHER, (x) => ({ ...x, konsortium: { ...x.konsortium, path: 'mitglied' } }));
    expect(joinProject(mitglied, SICHER, 'costa_negra', P.shares[0]).ok).toBe(true);
    const raffinerie = mitAngebot('grossraffinerie');
    expect(projectDef(SICHER, 'grossraffinerie')!.minRank).toBeGreaterThan(0);
    expect(joinProject(raffinerie, SICHER, 'grossraffinerie', P.shares[0])).toEqual({ ok: false, reason: 'rang' });
    const angesehen = mitAngebot('grossraffinerie', SICHER, (x) => ({ ...x, stand: { ...x.stand, admitted: true } }));
    expect(joinProject(angesehen, SICHER, 'grossraffinerie', P.shares[0]).ok).toBe(true);
  });
});

describe('Bau und Betrieb', () => {
  it('ohne Risiko läuft das Projekt nach rounds Runden und zahlt Anteil × Ertrag je Runde', () => {
    const s = ok(joinProject(mitAngebot('seismik_kampagne'), SICHER, 'seismik_kampagne', P.shares[1]));
    const def = projectDef(SICHER, 'seismik_kampagne')!;
    const fertig = k3Rounds(s, SICHER, def.rounds);
    expect(fertig.kapitel3!.projekte.stakes[0].status).toBe('laeuft');
    const cash = fertig.cash;
    const danach = k3Rounds(fertig, SICHER, 2);
    // Ohne neue Zeichnungen kommt nur der Ertrag dazu.
    expect(danach.cash).toBe(cash + 2 * Math.round(P.shares[1] * def.income));
    expect(danach.kapitel3!.projekte.stakes[0].earned).toBe(2 * Math.round(P.shares[1] * def.income));
  });

  it('mit vollem Risiko scheitert es, das Geld ist weg', () => {
    const b = withK3(SICHER, (k) => ({ ...k, projekte: { ...k.projekte, list: k.projekte.list.map((p) => ({ ...p, risk: 1 })) } }));
    const s = ok(joinProject(mitAngebot('seismik_kampagne', b), b, 'seismik_kampagne', P.shares[0]));
    const t = k3Rounds(s, b, projectDef(b, 'seismik_kampagne')!.rounds + 2);
    expect(t.kapitel3!.projekte.stakes[0].status).toBe('gescheitert');
    expect(t.kapitel3!.notes.some((n) => n.key === 'projekt_gescheitert')).toBe(true);
    expect(projectsValue(t)).toBe(0);
  });

  it('Betrug eines Partners verzögert um eine Runde je Baurunde', () => {
    const b = withK3(SICHER, (k) => ({ ...k, projekte: { ...k.projekte, fraud: 1 } }));
    const s = ok(joinProject(mitAngebot('seismik_kampagne', b), b, 'seismik_kampagne', P.shares[0]));
    const t = k3Rounds(s, b, 3);
    const stake = t.kapitel3!.projekte.stakes[0];
    expect(stake.status).toBe('bau');
    expect(stake.readyRound).toBe(s.round + projectDef(b, 'seismik_kampagne')!.rounds + 3);
  });

  it('Mitglieder des Konsortiums tragen weniger Risiko', () => {
    const k = kapitel3Of(k3Game('risk', balance), balance)!;
    const def = projectDef(balance, 'fernpipeline')!;
    expect(projectRisk(k, balance, def)).toBe(def.risk);
    expect(projectRisk({ ...k, konsortium: { ...k.konsortium, path: 'mitglied' } }, balance, def)).toBeCloseTo(def.risk * P.memberRisk);
  });

  it('Buchwert: eingezahlte Anteile ohne Gescheiterte', () => {
    const s = ok(joinProject(mitAngebot('fernpipeline'), SICHER, 'fernpipeline', P.shares[0]));
    expect(projectsValue(s)).toBe(P.shares[0] * projectDef(SICHER, 'fernpipeline')!.cost);
    expect(projectsValue(k3Game('leer', balance))).toBe(0);
  });
});
