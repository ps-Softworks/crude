import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BalanceError, type Balance } from './balance';
import { endRound, newGame, type GameState } from './game';
import type { WorldState } from './world';
import { startDiplomacy } from './diplomacy';
import {
  advanceInvestigation,
  applyPressure,
  buyWitness,
  checkInvestigationContent,
  convictionChance,
  DELANEY_CHOICE_MARKS,
  DELANEY_MARKS,
  destroyTrace,
  fineFor,
  heat,
  heatWord,
  investigationView,
  parseInvestigationBalance,
  parseInvestigationContent,
  pressureChance,
  sacrificeScapegoat,
  setLawyer,
  traces,
  validInvestigation,
  type InvestigationBalance,
  type InvestigationState,
  previewInvestigation,
  investigationUnlocked,
  DIPLOMACY_TRACE_KIND,
} from './investigation';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();

type K2 = GameState & { chapter?: number; investigation?: InvestigationState };

/** Derselbe Zustand mit anderen Weltgrößen im Weltmodell (state.worldModel, 4.1/4.2). */
function mitWelt(state: K2, w: Partial<Pick<WorldState, 'mood' | 'government'>>): K2 {
  return { ...state, worldModel: { ...state.worldModel, ...w } };
}

/** Ein Teilzustand ganz ohne Weltmodell (dann gelten die Ersatzwerte aus balance.yaml). */
function ohneWelt(state: K2): K2 {
  return { ...state, worldModel: undefined } as unknown as K2;
}

/** Eine Partie in Kapitel 2 (bis 4.5 das Feld chapter bringt: von Hand gesetzt) mit diesen Merkzeichen aus Kapitel 1. */
function kapitel2(marks: string[] = [], extra: Partial<K2> = {}): K2 {
  const g = newGame('delaney', balance);
  const m: Record<string, number> = {};
  for (const x of marks) m[x] = 3;
  return { ...g, cash: 50000, chapter: 2, events: { ...g.events, marks: m }, ...extra };
}

/** Spielzahlen mit Änderungen; ohne Angabe ermittelt Delaney gleich nach dem Gerücht (rumorRounds 0). */
function mitInv(b: Partial<InvestigationBalance>): Balance {
  return { ...balance, investigation: { ...balance.investigation, rumorRounds: 0, ...b } };
}

function runden(state: GameState, n: number, b: Balance = balance): K2 {
  let s = state;
  for (let i = 0; i < n; i++) s = { ...advanceInvestigation(s, b), round: s.round + 1 };
  return s as K2;
}

function inv(state: GameState): InvestigationState {
  return (state as K2).investigation!;
}

describe('Ermittler – Kapitel 1 bleibt unberührt (4.11)', () => {
  it('in Kapitel 1 kommt derselbe Zustand zurück', () => {
    const g = newGame('k1', balance);
    expect(advanceInvestigation(g, balance)).toBe(g);
  });

  it('eine ganze Runde in Kapitel 1 legt keine Ermittlung an', () => {
    const g = endRound(newGame('k1', balance), balance);
    expect((g as K2).investigation).toBeUndefined();
    expect(g.events.marks[DELANEY_MARKS.arrived]).toBeUndefined();
  });

  it('Gegenmittel gibt es in Kapitel 1 nicht', () => {
    const r = setLawyer(newGame('k1', balance), balance, 2);
    expect(r.ok).toBe(false);
  });
});

describe('Delaney kommt (Kapitel 2)', () => {
  it('die erste Abrechnung legt die Ermittlung an und setzt delaney_im_amt', () => {
    const s = advanceInvestigation(kapitel2(), balance) as K2;
    expect(s.investigation?.stage).toBe('ruhe');
    expect(s.events.marks[DELANEY_MARKS.arrived]).toBe(s.round);
    expect(s.log.at(-1)).toContain('Frank Delaney');
  });

  it('auch endRound rechnet die Ermittlung ab, sobald Kapitel 2 läuft', () => {
    const s = endRound(kapitel2(), balance) as K2;
    expect(s.investigation).toBeDefined();
  });

  it('zur nächsten Runde liegt Delaneys Ankunft in der Post; mit Spuren klopft später Delaney selbst', () => {
    const katalog = loadEvents();
    let s: GameState = endRound(kapitel2(), balance, katalog);
    expect(s.events.pending).toContain('k2_delaney_ankunft');
    s = kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge', 'sheriff_bezahlt']);
    const gesehen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      s = endRound(s, balance, katalog);
      for (const id of s.events.pending) gesehen.add(id);
    }
    expect(gesehen).toContain('k2_nora_geruecht');
    expect(gesehen).toContain('k2_delaney_besuch');
  });

  it('in Kapitel 1 kommt keins von Delaneys Ereignissen', () => {
    const katalog = loadEvents();
    let s: GameState = newGame('k1-delaney', balance, katalog);
    for (let i = 0; i < 15 && !s.finished; i++) {
      s = endRound(s, balance, katalog);
      expect(s.events.pending.filter((id) => id.startsWith('k2_'))).toEqual([]);
    }
  });
});

describe('Spuren und Hitze (GDD §4)', () => {
  it('nur gesetzte Merkzeichen sind Spuren; der Zeitsprung lässt sie um jumpFade verblassen, Zeugen nicht', () => {
    const s = advanceInvestigation(kapitel2(['moss_betrogen', 'silas_kronzeuge', 'moss_fair']), balance);
    const t = traces(s, balance);
    expect(t.map((x) => x.id).sort()).toEqual(['moss_betrogen', 'silas_kronzeuge']);
    expect(t.find((x) => x.id === 'moss_betrogen')!.current).toBe(3 - balance.investigation.jumpFade);
    expect(t.find((x) => x.id === 'silas_kronzeuge')!.current).toBe(2);
    expect(heat(s, balance)).toBe(3 - balance.investigation.jumpFade + 2);
  });

  it('die Hitze wird als Wort gezeigt', () => {
    const { warm, hot: heiss, glowing: gluehend } = balance.investigation.heatWords;
    expect(heatWord(warm - 1, balance)).toBe('kuehl');
    expect(heatWord(warm, balance)).toBe('warm');
    expect(heatWord(heiss, balance)).toBe('heiss');
    expect(heatWord(gluehend, balance)).toBe('gluehend');
  });

  it('solange niemand ermittelt, verblasst jede Spur alle fadeEvery Runden um 1 – Zeugen nie', () => {
    const b = mitInv({ jumpFade: 0, rumorAt: 50, probeAt: 50 });
    const s = runden(kapitel2(['moss_betrogen', 'silas_kronzeuge']), balance.investigation.fadeEvery, b);
    const t = traces(s, b);
    expect(t.find((x) => x.id === 'moss_betrogen')!.current).toBe(2);
    expect(t.find((x) => x.id === 'silas_kronzeuge')!.current).toBe(2);
  });
});

describe('Ablauf: Gerücht → Vorermittlung → Anklage → Urteil (GDD §10)', () => {
  const schmutzig = ['moss_betrogen', 'bullard_rache', 'silas_kronzeuge', 'sheriff_bezahlt'];

  it('Gerücht ab rumorAt, Vorermittlung ab probeAt – mit Beweisen für jeden Zeugen', () => {
    const b = mitInv({ jumpFade: 0 });
    let s = runden(kapitel2(schmutzig), 1, b);
    expect(inv(s).stage).toBe('geruecht');
    expect(s.events.marks[DELANEY_MARKS.rumor]).toBeDefined();
    s = runden(s, 1, b);
    expect(inv(s).stage).toBe('vorermittlung');
    expect(s.events.marks[DELANEY_MARKS.probe]).toBeDefined();
    expect(inv(s).evidence).toBe(balance.investigation.evidence.perWitness);
  });

  it('Delaney lässt das Gerücht erst rumorRounds Runden laufen, bevor er ermittelt', () => {
    const b = mitInv({ jumpFade: 0, rumorRounds: 2 });
    let s = runden(kapitel2(schmutzig), 2, b);
    expect(inv(s).stage).toBe('geruecht');
    s = runden(s, 1, b);
    expect(inv(s).stage).toBe('vorermittlung');
  });

  it('wenig Hitze: Delaney bleibt beim Gerücht oder in Ruhe', () => {
    const s = runden(kapitel2(['courier_gekauft']), 4);
    expect(inv(s).stage).toBe('ruhe');
  });

  it('in der Vorermittlung wachsen die Beweise mit der Hitze, ein Anwalt bremst', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(schmutzig), 2, b);
    const h = heat(s, b);
    const ohne = inv(runden(s, 1, b)).evidence;
    expect(ohne).toBeCloseTo(inv(s).evidence + b.investigation.evidence.perHeat * h, 5);
    const mitAnwalt = setLawyer(s, b, 3);
    if (!mitAnwalt.ok) throw new Error(mitAnwalt.reason);
    const gebremst = inv(runden(mitAnwalt.state, 1, b)).evidence;
    expect(gebremst).toBeCloseTo(ohne - 3 * b.investigation.evidence.lawyerCut, 5);
  });

  it('der Anwalt kostet am Rundenende je Stufe', () => {
    const s = runden(kapitel2(), 1);
    const r = setLawyer(s, balance, 2);
    if (!r.ok) throw new Error(r.reason);
    const nach = advanceInvestigation(r.state, balance);
    expect(nach.cash).toBe(r.state.cash - 2 * balance.investigation.lawyer.costPerLevel);
  });

  it('Anklage ab chargeAt, Urteil nach trialDelay Runden: verurteilt kostet Geld und erledigt die Spuren', () => {
    const b = mitInv({ jumpFade: 0, trial: { ...balance.investigation.trial, min: 1, max: 1 } });
    let s = runden(kapitel2(schmutzig), 2, b);
    let n = 0;
    while (inv(s).stage === 'vorermittlung' && n++ < 30) s = runden(s, 1, b);
    expect(inv(s).stage).toBe('anklage');
    expect(s.events.marks[DELANEY_MARKS.charge]).toBeDefined();
    const strafe = fineFor(s, b);
    expect(strafe.amount).toBeGreaterThan(0);
    const vorher = s.cash;
    s = runden(s, b.investigation.trialDelay, b);
    expect(inv(s).stage).toBe('abgeschlossen');
    expect(['geldstrafe', 'schwere_strafe']).toContain(inv(s).verdict);
    expect(s.events.marks[DELANEY_MARKS.convicted]).toBeDefined();
    expect(s.cash).toBe(vorher - strafe.amount);
    expect(heat(s, b)).toBe(0);
  });

  it('freigesprochen: keine Strafe, die Spuren sind trotzdem erledigt', () => {
    const b = mitInv({ jumpFade: 0, trial: { ...balance.investigation.trial, min: 0, max: 0 } });
    let s = runden(kapitel2(schmutzig), 2, b);
    while (inv(s).stage === 'vorermittlung') s = runden(s, 1, b);
    const vorher = s.cash;
    s = runden(s, b.investigation.trialDelay, b);
    expect(inv(s).verdict).toBe('freispruch');
    expect(s.events.marks[DELANEY_MARKS.acquitted]).toBeDefined();
    expect(s.cash).toBe(vorher);
    expect(heat(s, b)).toBe(0);
  });

  it('nach einem Fall ruht Delaney cooldown Runden, dann kann ein neuer beginnen', () => {
    const b = mitInv({ jumpFade: 0, trial: { ...balance.investigation.trial, min: 0, max: 0 } });
    let s = runden(kapitel2(schmutzig), 2, b);
    while (inv(s).stage !== 'abgeschlossen') s = runden(s, 1, b);
    s = runden(s, b.investigation.cooldown, b);
    expect(inv(s).stage).toBe('ruhe');
    expect(inv(s).cases).toBe(1);
  });

  it('sinkt die Hitze in der Vorermittlung und sind keine Beweise mehr da, stellt Delaney ein', () => {
    const b = mitInv({ jumpFade: 0, evidence: { ...balance.investigation.evidence, perWitness: 0 } });
    let s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 2, b);
    expect(inv(s).stage).toBe('vorermittlung');
    // Beide Spuren vernichten (ohne Zeugen dabei) – Hitze unter probeAt; ein starker Anwalt frisst die Beweise.
    for (const id of ['moss_betrogen', 'bullard_rache']) {
      const r = destroyTrace(s, mitInv({ ...b.investigation, destroy: { ...b.investigation.destroy, chance: 0, cut: 5 } }), id);
      if (!r.ok) throw new Error(r.reason);
      s = r.state as K2;
    }
    const r = setLawyer(s, b, 5);
    if (!r.ok) throw new Error(r.reason);
    s = runden(r.state, 3, b);
    expect(inv(s).verdict).toBe('eingestellt');
    expect(s.events.marks[DELANEY_MARKS.dropped]).toBeDefined();
  });

  it('Hitze 0 und kein Anwalt: die Beweise verfallen, Delaney stellt ein – kein ewiger Fall', () => {
    const b = mitInv({ jumpFade: 0, evidence: { ...balance.investigation.evidence, perWitness: 0 } });
    let s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 3, b);
    expect(inv(s).stage).toBe('vorermittlung');
    expect(inv(s).evidence).toBeGreaterThan(0);
    const ohneZeugen = mitInv({ ...b.investigation, destroy: { ...b.investigation.destroy, chance: 0, cut: 5 } });
    for (const id of ['moss_betrogen', 'bullard_rache']) {
      const r = destroyTrace(s, ohneZeugen, id);
      if (!r.ok) throw new Error(r.reason);
      s = r.state as K2;
    }
    expect(heat(s, b)).toBe(0);
    expect(inv(s).lawyer).toBe(0);
    const vorher = inv(s).evidence;
    s = runden(s, 1, b);
    expect(inv(s).evidence).toBe(Math.max(0, vorher - b.investigation.evidence.transferredDecay));
    let n = 0;
    while (inv(s).stage === 'vorermittlung' && n++ < 20) s = runden(s, 1, b);
    expect(inv(s).verdict).toBe('eingestellt');
    expect(n).toBeLessThanOrEqual(Math.ceil(vorher / b.investigation.evidence.transferredDecay));
  });

  it('ein Anwalt, der jeden Zuwachs abfängt: ohne Beweise gibt Delaney auf, auch wenn die Hitze bleibt', () => {
    // moss + bullard = Hitze 6 → Zuwachs 15 je Runde; Anwalt 5 fängt 15 ab.
    const b = mitInv({ jumpFade: 0, evidence: { ...balance.investigation.evidence, perWitness: 0 } });
    let s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 1, b);
    expect(inv(s).stage).toBe('geruecht');
    const r = setLawyer(s, b, 5);
    if (!r.ok) throw new Error(r.reason);
    s = runden(r.state, 1, b);
    expect(inv(s).stage).toBe('vorermittlung');
    expect(heat(s, b)).toBeGreaterThanOrEqual(b.investigation.probeAt);
    s = runden(s, 1, b);
    expect(inv(s).verdict).toBe('eingestellt');
  });

  it('nach dem Urteil ist der Anwalt entlassen: keine Anwaltskosten mehr, eine Zeile im Protokoll', () => {
    const b = mitInv({ jumpFade: 0, trial: { ...balance.investigation.trial, min: 1, max: 1 } });
    let s = runden(kapitel2(schmutzig), 2, b);
    expect(inv(s).stage).toBe('vorermittlung');
    // wie bei Delaneys Besuch ignoriert: Standard-Wahl „Anwalt“ (Stufe lawyer.summoned)
    s = { ...s, events: { ...s.events, marks: { ...s.events.marks, [DELANEY_CHOICE_MARKS.lawyer]: s.round } } };
    s = runden(s, 1, b);
    expect(inv(s).lawyer).toBe(b.investigation.lawyer.summoned);
    let n = 0;
    while (inv(s).stage !== 'abgeschlossen' && n++ < 40) s = runden(s, 1, b);
    expect(inv(s).stage).toBe('abgeschlossen');
    expect(inv(s).lawyer).toBe(0);
    expect(s.log.some((l) => l.includes('Ashby & Lowe'))).toBe(true);
    const nach = advanceInvestigation(s, b);
    expect(nach.cash).toBe(s.cash);
  });
});

describe('Antworten auf Delaneys Ereignisse', () => {
  const C = DELANEY_CHOICE_MARKS;

  it('Anwalt auf Abruf und Verweis auf den Anwalt heben die Anwaltsstufe – je einmal', () => {
    // Der Anwalt auf Abruf kostet nichts, solange niemand ermittelt …
    expect(inv(runden(kapitel2([C.earlyLawyer]), 3)).lawyer).toBe(0);
    // … und kommt mit der Vorermittlung.
    const b = mitInv({ jumpFade: 0 });
    let s = runden(kapitel2([C.earlyLawyer, 'moss_betrogen', 'bullard_rache']), 2, b);
    expect(inv(s).stage).toBe('vorermittlung');
    expect(inv(s).lawyer).toBe(balance.investigation.lawyer.early);
    s = { ...s, events: { ...s.events, marks: { ...s.events.marks, [C.lawyer]: s.round } } };
    s = runden(s, 1, b);
    expect(inv(s).lawyer).toBe(balance.investigation.lawyer.summoned);
    const r = setLawyer(s, b, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(inv(runden(r.state, 1, b)).lawyer).toBe(0);
  });

  it('offen geantwortet: mehr Beweise, aber halbe Strafe', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge']), 2, b);
    const offen = { ...s, events: { ...s.events, marks: { ...s.events.marks, [C.candid]: s.round } } };
    expect(fineFor(offen, b).amount).toBe(Math.round(fineFor(s, b).amount * b.investigation.fine.candidFactor));
    const nach = inv(advanceInvestigation(offen, b)).evidence;
    const ohne = inv(advanceInvestigation(s, b)).evidence;
    expect(nach).toBeCloseTo(ohne + b.investigation.evidence.candid, 5);
  });

  it('Kronzeuge gegen den Trust: viel weniger Beweise', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge', 'sheriff_bezahlt']), 3, b);
    const k = { ...s, events: { ...s.events, marks: { ...s.events.marks, [C.crown]: s.round } } };
    expect(inv(advanceInvestigation(k, b)).evidence).toBeLessThan(inv(advanceInvestigation(s, b)).evidence);
  });

  it('hinausgeworfen gräbt Delaney schneller, Noras Crane-Geschichte lenkt ihn ab', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 2, b);
    const mit = (m: string) => ({ ...s, events: { ...s.events, marks: { ...s.events.marks, [m]: s.round } } });
    const normal = inv(advanceInvestigation(s, b)).evidence;
    expect(inv(advanceInvestigation(mit(C.hostile), b)).evidence).toBeGreaterThan(normal);
    expect(inv(advanceInvestigation(mit(C.noraCrane), b)).evidence).toBeLessThan(normal);
  });

  it('ein Vergleich schließt den Fall ohne Urteil', () => {
    const b = mitInv({ jumpFade: 0 });
    let s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 2, b);
    s = { ...s, events: { ...s.events, marks: { ...s.events.marks, [C.settle]: s.round } } };
    s = runden(s, 1, b);
    expect(inv(s).verdict).toBe('vergleich');
    expect(heat(s, b)).toBe(0);
  });

  it('Interview, Leumund und bester Anwalt senken die Verurteilungschance, schlechte Stimmung hebt sie', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache']), 3, b);
    const p = convictionChance(s, b);
    const mit = (m: string) => ({ ...s, events: { ...s.events, marks: { ...s.events.marks, [m]: s.round } } });
    expect(convictionChance(mit(C.interview), b)).toBeLessThan(p);
    expect(convictionChance(mit(C.fight), b)).toBeLessThan(p);
    expect(convictionChance(mit('moss_fair'), b)).toBeLessThan(p);
    // Stimmung aus dem Weltmodell (state.worldModel.mood, 4.1)
    const q = convictionChance(mitWelt(s, { mood: 50 }), b);
    expect(convictionChance(mitWelt(s, { mood: 10 }), b)).toBeGreaterThan(q);
    expect(convictionChance(mitWelt(s, { mood: 90 }), b)).toBeLessThan(q);
  });
});

describe('Gegenmittel im Schattenbuch', () => {
  it('Absprachen mit Rivalen (4.10) zählen als Spuren: Hitze steigt, Vernichten wirkt', () => {
    const g = startDiplomacy(kapitel2(), balance, 2);
    const ohne = heat(g, balance);
    const mitAbsprache = { ...g, diplomacy: { ...g.diplomacy!, traces: [{ source: 'kartell_bullard', severity: 3, round: g.round }] } };
    const t = traces(mitAbsprache, balance).find((x) => x.key === DIPLOMACY_TRACE_KIND)!;
    expect(t.current).toBe(3);
    expect(heat(mitAbsprache, balance)).toBe(ohne + 3);
    const s = runden(mitAbsprache, 1);
    const sicher = mitInv({ destroy: { ...balance.investigation.destroy, chance: 0 } });
    const r = destroyTrace(s, sicher, t.id);
    if (!r.ok) throw new Error(r.reason);
    expect(traces(r.state, sicher).find((x) => x.id === t.id)!.current).toBeLessThan(traces(s, sicher).find((x) => x.id === t.id)!.current);
  });

  it('Spur vernichten mindert die Schwere und kostet Geld; mit Pech entsteht eine Spur „Vertuschung“', () => {
    const s = runden(kapitel2(['bullard_rache']), 1);
    const sicher = mitInv({ destroy: { ...balance.investigation.destroy, chance: 0 } });
    const r = destroyTrace(s, sicher, 'bullard_rache');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(s.cash - balance.investigation.destroy.cost);
    expect(heat(r.state, sicher)).toBe(Math.max(0, heat(s, sicher) - balance.investigation.destroy.cut));
    const pech = mitInv({ destroy: { ...balance.investigation.destroy, chance: 1 } });
    const r2 = destroyTrace(s, pech, 'bullard_rache');
    if (!r2.ok) throw new Error(r2.reason);
    expect(traces(r2.state, pech).some((t) => t.key === 'vertuschung')).toBe(true);
  });

  it('einen Zeugen kann man nicht verbrennen – nur kaufen, und das ist eine neue Spur', () => {
    const s = runden(kapitel2(['silas_kronzeuge']), 1);
    expect(destroyTrace(s, balance, 'silas_kronzeuge').ok).toBe(false);
    const r = buyWitness(s, balance, 'silas_kronzeuge');
    if (!r.ok) throw new Error(r.reason);
    const t = traces(r.state, balance);
    expect(t.find((x) => x.id === 'silas_kronzeuge')!.current).toBe(0);
    expect(t.find((x) => x.key === 'zeugenkauf')!.current).toBe(balance.investigation.witness.severity);
    expect(r.state.cash).toBe(s.cash - balance.investigation.witness.cost);
  });

  it('Sündenbock: nur während Delaney ermittelt, einmal je Fall, kostet Kraft', () => {
    const b = mitInv({ jumpFade: 0 });
    const ruhig = runden(kapitel2(), 1, b);
    expect(sacrificeScapegoat(ruhig, b).ok).toBe(false);
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge']), 2, b);
    const r = sacrificeScapegoat(s, b);
    if (!r.ok) throw new Error(r.reason);
    expect(inv(r.state).evidence).toBe(Math.max(0, inv(s).evidence - b.investigation.scapegoat.evidenceCut));
    expect(r.state.strength).toBe(s.strength - b.investigation.scapegoat.strength);
    expect(r.state.events.marks[DELANEY_MARKS.scapegoat]).toBeDefined();
    expect(sacrificeScapegoat(r.state, b).ok).toBe(false);
  });

  it('politischer Druck: hängt von der Regierung ab; gelingt er, ist Delaney versetzt und die Beweise verfallen', () => {
    const b = mitInv({ jumpFade: 0 });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge']), 2, b);
    expect(pressureChance(mitWelt(s, { government: 'handel' }), b)).toBe(b.investigation.pressure.chance.handel);
    expect(pressureChance(mitWelt(s, { government: 'volksbund' }), b)).toBe(b.investigation.pressure.chance.volksbund);
    expect(pressureChance(mitWelt(s, { government: 'provinz' }), b)).toBe(b.investigation.pressure.chance.provinz);
    expect(pressureChance(ohneWelt(s), b)).toBe(b.investigation.pressure.chance.none);
    const sicher = mitInv({ ...b.investigation, pressure: { ...b.investigation.pressure, chance: { handel: 1, volksbund: 1, provinz: 1, none: 1 } } });
    const r = applyPressure(s, sicher);
    if (!r.ok) throw new Error(r.reason);
    expect(investigationView(r.state, sicher).transferred).toBe(true);
    const nach = runden(r.state, 1, sicher);
    expect(inv(nach).evidence).toBe(Math.max(0, inv(s).evidence - b.investigation.evidence.transferredDecay));
    expect(applyPressure(nach, sicher).ok).toBe(false);
  });

  it('misslingt der Druck, gibt es mehr Beweise und eine Spur „Einflussnahme“', () => {
    const b = mitInv({ jumpFade: 0, pressure: { ...balance.investigation.pressure, chance: { handel: 0, volksbund: 0, provinz: 0, none: 0 } } });
    const s = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge']), 2, b);
    const r = applyPressure(s, b);
    if (!r.ok) throw new Error(r.reason);
    expect(inv(r.state).evidence).toBe(Math.min(100, inv(s).evidence + b.investigation.pressure.failEvidence));
    expect(traces(r.state, b).some((t) => t.key === 'einflussnahme')).toBe(true);
  });

  it('ohne Geld geht nichts', () => {
    const s = { ...runden(kapitel2(['bullard_rache', 'silas_kronzeuge']), 1), cash: 0 };
    expect(destroyTrace(s, balance, 'bullard_rache').ok).toBe(false);
    expect(buyWitness(s, balance, 'silas_kronzeuge').ok).toBe(false);
  });
});

describe('Ermittler – Determinismus und Spielstand', () => {
  it('gleicher Seed, gleiche Entscheidungen: gleicher Ausgang', () => {
    const a = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge', 'delaney_interview']), 12);
    const b = runden(kapitel2(['moss_betrogen', 'bullard_rache', 'silas_kronzeuge', 'delaney_interview']), 12);
    expect(a.investigation).toEqual(b.investigation);
    expect(a.cash).toBe(b.cash);
  });

  it('Spielstand mit Ermittlung lässt sich sichern und laden; kaputte Ermittlung wird abgelehnt', () => {
    const s = runden(kapitel2(['moss_betrogen']), 2);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect((geladen.state as K2).investigation).toEqual(s.investigation);
    expect(validInvestigation(s.investigation)).toBe(true);
    const kaputt = { ...s, investigation: { ...s.investigation!, stage: 'galgen' } };
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
  });
});

describe('Ermittler – Inhalte und Spielzahlen', () => {
  it('content/investigation.yaml ist vollständig und passt zu balance.yaml und den Ereignissen', () => {
    const text = readFileSync(new URL('../../content/investigation.yaml', import.meta.url), 'utf8');
    const { content, errors } = parseInvestigationContent('content/investigation.yaml', text);
    expect(errors).toEqual([]);
    expect(checkInvestigationContent('content/investigation.yaml', content!, balance, loadEvents())).toEqual([]);
  });

  it('meldet fehlende Texte und unbekannte Stufen', () => {
    const { errors } = parseInvestigationContent('x', 'traces: {}\nstages: { ruhe: { de: "a" }, galgen: { de: "b" } }\nheat: {}\nverdicts: {}');
    expect(errors.length).toBeGreaterThan(3);
    const leer = parseInvestigationContent('x', 'traces: {}\nstages: { ruhe: { de: a }, geruecht: { de: a }, vorermittlung: { de: a }, anklage: { de: a }, abgeschlossen: { de: a } }\nheat: { kuehl: { de: a }, warm: { de: a }, heiss: { de: a }, gluehend: { de: a } }\nverdicts: { eingestellt: { de: a }, freispruch: { de: a }, vergleich: { de: a }, geldstrafe: { de: a }, schwere_strafe: { de: a } }');
    expect(leer.errors).toEqual([]);
    expect(checkInvestigationContent('x', leer.content!, balance, loadEvents()).length).toBeGreaterThan(0);
  });

  it('balance.yaml: Spuren mit Schwere 1–5, kein Merkzeichen doppelt, Schwellen steigen', () => {
    const roh = () => parse(readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8'));
    expect(() => parseInvestigationBalance(roh())).not.toThrow();
    const r1 = roh();
    r1.investigation.traces[0].severity = 7;
    expect(() => parseInvestigationBalance(r1)).toThrow(BalanceError);
    const r2 = roh();
    r2.investigation.traces.push({ ...r2.investigation.traces[0] });
    expect(() => parseInvestigationBalance(r2)).toThrow(BalanceError);
    const r3 = roh();
    r3.investigation.probeAt = 1;
    expect(() => parseInvestigationBalance(r3)).toThrow(BalanceError);
    const r4 = roh();
    delete r4.investigation;
    expect(() => parseInvestigationBalance(r4)).toThrow(BalanceError);
  });

  it('Debug-Vorschau: Delaney schon in Kapitel 1 – ohne Vorschau bleibt Kapitel 1 unberührt; der Spielstand bleibt gültig', () => {
    const k1 = newGame('vorschau', balance);
    expect(investigationUnlocked(k1, balance)).toBe(false);
    expect(endRound(k1, balance, loadEvents()).investigation).toBeUndefined();
    const v = previewInvestigation(k1, balance);
    expect(investigationUnlocked(v, balance)).toBe(true);
    expect(previewInvestigation(v, balance)).toBe(v);
    expect(validInvestigation(v.investigation)).toBe(true);
    expect(deserializeGame(serializeGame(v, 'test')).ok).toBe(true);
  });
});
