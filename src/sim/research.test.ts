import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BalanceError, type Balance } from './balance';
import { endRound, newGame, type GameState } from './game';
import {
  ACTIVE_TECH_EFFECTS,
  advanceResearch,
  buildWorkshop,
  buyLicense,
  hasTech,
  parseResearchBalance,
  parseResearchContent,
  previewResearch,
  researchUnlocked,
  rivalsHaveTech,
  startResearch,
  stopResearch,
  techDrillCost,
  techDrillRounds,
  techEffect,
  techTier,
  techViews,
  toggleRefuse,
  validResearch,
  worldTech,
  type ResearchState,
} from './research';
import { deserializeGame, serializeGame } from './save';
import { deeperQuote, drillQuote } from './drilling';
import { loadBalance } from './testBalance';

const balance = loadBalance();

type K2 = GameState & { chapter?: number; research?: ResearchState };

/** Eine Partie zu Beginn von Kapitel 2: Der Technikstand der Welt steht auf dem Bezugswert (worldFallback.tech, ≈ Runde 41 nach dem Zeitsprung). */
function kapitel2(extra: Partial<K2> = {}): K2 {
  const g = newGame('forschung', balance);
  return { ...g, cash: 100000, chapter: 2, worldModel: { ...g.worldModel, tech: balance.research.worldFallback.tech }, ...extra };
}

/** Derselbe Zustand mit einem anderen Technikstand im Weltmodell (state.worldModel, 4.1). */
function mitTech(state: K2, tech: number): K2 {
  return { ...state, worldModel: { ...state.worldModel, tech } };
}

function ok(r: { ok: true; state: GameState } | { ok: false; reason: string }): K2 {
  if (!r.ok) throw new Error(r.reason);
  return r.state as K2;
}

function runden(state: GameState, n: number, b: Balance = balance): K2 {
  let s = state;
  for (let i = 0; i < n; i++) s = { ...advanceResearch(s, b), round: s.round + 1 };
  return s as K2;
}

/** Ohne Zufall: jede Runde genau die Punkte der Förderstufe. */
const fest: Balance = { ...balance, research: { ...balance.research, luck: { min: 1, max: 1 } } };

describe('Forschung – Kapitel 1 bleibt unberührt (4.11)', () => {
  it('in Kapitel 1 kommt derselbe Zustand zurück, Werkstatt und Lizenzen gibt es nicht', () => {
    const g = newGame('k1', balance);
    expect(advanceResearch(g, balance)).toBe(g);
    expect(buildWorkshop(g, balance).ok).toBe(false);
    expect((endRound(g, balance) as K2).research).toBeUndefined();
  });

  it('in Kapitel 2 ohne Werkstatt und Patente ändert die Abrechnung nichts', () => {
    const g = kapitel2();
    expect(advanceResearch(g, balance)).toBe(g);
  });
});

describe('Werkstatt und Forschung (GDD §5, §6)', () => {
  it('die Werkstatt kostet einmal research.workshop und ist Voraussetzung', () => {
    const g = kapitel2();
    expect(startResearch(g, balance, 'rotary', 0).ok).toBe(false);
    const w = ok(buildWorkshop(g, balance));
    expect(w.cash).toBe(g.cash - balance.research.workshop);
    expect(buildWorkshop(w, balance).ok).toBe(false);
    expect(startResearch(w, balance, 'rotary', 0).ok).toBe(true);
  });

  it('je Runde kostet die Förderstufe Geld und bringt Punkte; ist die Punktzahl erreicht, gehört Jacob die Technik', () => {
    const t = fest.research.techs.find((x) => x.id === 'tanklaster')!;
    const stufe = fest.research.funding[1];
    let s = ok(startResearch(ok(buildWorkshop(kapitel2(), fest)), fest, 'tanklaster', 1));
    const vorher = s.cash;
    s = runden(s, 1, fest);
    expect(s.cash).toBe(vorher - stufe.cost);
    const n = Math.ceil(t.points / stufe.points);
    s = runden(s, n - 1, fest);
    expect(hasTech(s, 'tanklaster')).toBe(true);
    expect(s.research!.project).toBeNull();
    expect(techEffect(s, fest, 'trucks')).toBe(1);
  });

  it('erst die Voraussetzung: Rollenmeißel braucht Drehbohren', () => {
    const w = ok(buildWorkshop(kapitel2(), balance));
    expect(startResearch(w, balance, 'rollenmeissel', 0).ok).toBe(false);
    const v = techViews(w, balance).find((x) => x.id === 'rollenmeissel')!;
    expect(v.status).toBe('gesperrt');
    expect(v.missing).toEqual(['rotary']);
  });

  it('anhalten behält den Fortschritt; ohne Geld wartet die Werkstatt', () => {
    let s = ok(startResearch(ok(buildWorkshop(kapitel2(), fest)), fest, 'thermal_cracking', 0));
    s = runden(s, 2, fest);
    const stand = s.research!.progress.thermal_cracking;
    expect(stand).toBe(2 * fest.research.funding[0].points);
    s = ok(stopResearch(s, fest));
    s = runden(s, 2, fest);
    expect(s.research!.progress.thermal_cracking).toBe(stand);
    s = { ...ok(startResearch(s, fest, 'thermal_cracking', 0)), cash: 10 };
    const pleite = runden(s, 1, fest);
    expect(pleite.research!.progress.thermal_cracking).toBe(stand);
    expect(pleite.cash).toBe(10);
  });

  it('der Fortschritt schwankt mit dem Zufall, aber deterministisch', () => {
    const start = ok(startResearch(ok(buildWorkshop(kapitel2(), balance)), balance, 'thermal_cracking', 0));
    const a = runden(start, 3);
    const b = runden(start, 3);
    expect(a.research).toEqual(b.research);
    const p = a.research!.progress.thermal_cracking;
    const L = balance.research.luck;
    expect(p).toBeGreaterThanOrEqual(3 * balance.research.funding[0].points * L.min - 0.01);
    expect(p).toBeLessThanOrEqual(3 * balance.research.funding[0].points * L.max + 0.01);
  });
});

describe('Patente und Lizenzen (GDD §5)', () => {
  it('wer zuerst erfindet, hält das Patent; hat die Welt die Technik schon, gibt es nur „eigen“', () => {
    const s = ok(startResearch(ok(buildWorkshop(kapitel2(), fest)), fest, 'tanklaster', 1));
    const frueh = runden(s, 5, fest);
    expect(frueh.research!.owned.tanklaster).toBe('patent');
    const spaet = runden(mitTech(s, 90), 5, fest);
    expect(spaet.research!.owned.tanklaster).toBe('eigen');
  });

  it('eine Lizenz gibt es erst, wenn andere die Technik haben', () => {
    const g = kapitel2();
    expect(worldTech(g, balance)).toBe(balance.research.worldFallback.tech);
    expect(buyLicense(g, balance, 'thermal_cracking').ok).toBe(false);
    const welt = mitTech(g, 60);
    const l = ok(buyLicense(welt, balance, 'thermal_cracking'));
    expect(l.research!.owned.thermal_cracking).toBe('lizenz');
    expect(l.cash).toBe(welt.cash - balance.research.techs.find((t) => t.id === 'thermal_cracking')!.license);
    expect(techTier(l, balance, 'raffinerie')).toBe(2);
    expect(techTier(l, balance, 'bohren')).toBe(1);
  });

  it('Lizenzgebühren für eigene Patente, sobald die Welt so weit ist – außer Jacob verweigert sie', () => {
    let s = ok(startResearch(ok(buildWorkshop(kapitel2(), fest)), fest, 'tanklaster', 1));
    s = runden(s, 5, fest);
    expect(s.research!.owned.tanklaster).toBe('patent');
    const rueckstaendig = s;
    expect(advanceResearch(rueckstaendig, fest)).toBe(rueckstaendig);
    expect(rivalsHaveTech(rueckstaendig, fest, 'tanklaster')).toBe(false);
    const weit = mitTech(s, 60);
    expect(advanceResearch(weit, fest).cash).toBe(weit.cash + fest.research.patentIncome);
    expect(rivalsHaveTech(weit, fest, 'tanklaster')).toBe(true);
    const verweigert = ok(toggleRefuse(weit, fest, 'tanklaster'));
    expect(advanceResearch(verweigert, fest).cash).toBe(verweigert.cash);
    expect(rivalsHaveTech(verweigert, fest, 'tanklaster')).toBe(false);
    expect(toggleRefuse(weit, fest, 'rotary').ok).toBe(false);
  });

  it('Kennzahlen summieren sich über alle eigenen Techniken', () => {
    const welt = mitTech(kapitel2(), 60);
    const s = ok(buyLicense(ok(buyLicense(welt, balance, 'rotary')), balance, 'rollenmeissel'));
    const t = (id: string) => balance.research.techs.find((x) => x.id === id)!;
    expect(techEffect(s, balance, 'drillTime')).toBeCloseTo((t('rotary').effects.drillTime ?? 0) + (t('rollenmeissel').effects.drillTime ?? 0), 6);
    expect(techTier(s, balance)).toBe(2);
    expect(hasTech(s, 'thermal_cracking')).toBe(false);
  });
});

describe('Wirkung beim Bohren (Drehbohren, Rollenmeißel – ab Kapitel 2)', () => {
  const t = (id: string) => balance.research.techs.find((x) => x.id === id)!;
  const mitTechnik = (ids: string[], extra: Partial<K2> = {}): K2 => {
    const owned: Record<string, 'lizenz'> = {};
    for (const id of ids) owned[id] = 'lizenz';
    return kapitel2({ research: { ...newResearchState(), owned }, ...extra });
  };
  const newResearchState = (): ResearchState => ({ rng: 1, workshop: false, project: null, funding: 0, progress: {}, owned: {}, refused: [] });

  it('ohne Technik und in Kapitel 1 bleiben Kosten und Dauer gleich', () => {
    expect(techDrillCost(kapitel2(), balance, 1000)).toBe(1000);
    expect(techDrillRounds(kapitel2(), balance, 2)).toBe(2);
    const k1 = { ...mitTechnik(['rotary', 'rollenmeissel']), chapter: 1 };
    expect(techDrillCost(k1, balance, 1000)).toBe(1000);
    expect(techDrillRounds(k1, balance, 2)).toBe(2);
  });

  it('Drehbohren macht schneller, Rollenmeißel zusätzlich billiger; mindestens eine Runde', () => {
    const rot = mitTechnik(['rotary']);
    const beide = mitTechnik(['rotary', 'rollenmeissel']);
    const zeit = (t('rotary').effects.drillTime ?? 0) + (t('rollenmeissel').effects.drillTime ?? 0);
    expect(techDrillRounds(rot, balance, 4)).toBe(Math.ceil(4 * (1 + (t('rotary').effects.drillTime ?? 0)) - 0.5));
    expect(techDrillRounds(rot, balance, 4)).toBeLessThan(4);
    expect(techDrillRounds(beide, balance, 2)).toBe(Math.max(1, Math.ceil(2 * (1 + zeit) - 0.5)));
    expect(techDrillRounds(beide, balance, 1)).toBe(1);
    expect(techDrillCost(rot, balance, 1000)).toBe(1000);
    expect(techDrillCost(beide, balance, 1000)).toBe(Math.round(1000 * (1 + (t('rollenmeissel').effects.drillCost ?? 0))));
  });

  it('das Bohren liest die Wirkung: Angebot für die nächste Bohrung und für tiefer bohren', () => {
    const ohne = kapitel2();
    const beide = mitTechnik(['rotary', 'rollenmeissel']);
    const parcel = ohne.parcels[0].id;
    const a = drillQuote(ohne, balance, parcel);
    const b = drillQuote(beide, balance, parcel);
    expect(b.cost).toBeLessThan(a.cost);
    expect(b.rounds).toBeLessThanOrEqual(a.rounds);
    const well = { stage: 1, rigId: ohne.rigs[0].id } as Parameters<typeof deeperQuote>[2];
    expect(deeperQuote(beide, balance, well)!.cost).toBeLessThan(deeperQuote(ohne, balance, well)!.cost);
  });

  it('nur Bohrzeit und Bohrkosten wirken schon; Tiefe, Benzinausbeute, Tanklaster warten auf ihre Systeme', () => {
    expect([...ACTIVE_TECH_EFFECTS].sort()).toEqual(['drillCost', 'drillTime']);
  });
});

describe('Technikstand: Skala wie das Weltmodell von main (4.1)', () => {
  it('liest den Technikstand aus state.worldModel', () => {
    const g = mitTech(kapitel2(), 30);
    expect(worldTech(g, balance)).toBe(30);
    expect(buyLicense(g, balance, 'thermal_cracking').ok).toBe(true);
  });

  it('Ersatzwert ≈ Beginn von Kapitel 2: Drehbohren ist verbreitet (Lizenz), Stufe II ist noch patentierbar', () => {
    const views = techViews(kapitel2(), balance);
    const v = (id: string) => views.find((x) => x.id === id)!;
    expect(v('rotary').licensable).toBe(true);
    for (const id of ['rollenmeissel', 'thermal_cracking', 'tanklaster']) expect(v(id).licensable).toBe(false);
  });

  it('alle Stufe-II-Techniken werden bis Kapitel 3 (Technikstand ≈ 22–35) verbreitet – Lizenzgebühren sind erreichbar', () => {
    const wb = balance.research;
    expect(wb.worldFallback.tech).toBeGreaterThanOrEqual(6);
    expect(wb.worldFallback.tech).toBeLessThanOrEqual(22);
    for (const t of wb.techs) expect(t.worldAt).toBeLessThanOrEqual(25);
  });

  it('die Werkstatt zeigt, ob ein Patent Lizenzgebühren bringt', () => {
    let s = ok(startResearch(ok(buildWorkshop(kapitel2(), fest)), fest, 'tanklaster', 1));
    s = runden(s, 5, fest);
    const v = (g: GameState) => techViews(g, fest).find((x) => x.id === 'tanklaster')!;
    expect(v(s).paying).toBe(false);
    const weit = mitTech(s, 40);
    expect(v(weit).paying).toBe(true);
    expect(advanceResearch(weit, fest).cash).toBe(weit.cash + fest.research.patentIncome);
    expect(v(ok(toggleRefuse(weit, fest, 'tanklaster'))).paying).toBe(false);
  });
});

describe('Forschung – Spielstand, Inhalte, Spielzahlen', () => {
  it('Spielstand mit Forschung lässt sich sichern und laden; kaputte Forschung wird abgelehnt', () => {
    const s = runden(ok(startResearch(ok(buildWorkshop(kapitel2(), balance)), balance, 'rotary', 0)), 2);
    expect(validResearch(s.research)).toBe(true);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    const kaputt = { ...s, research: { ...s.research!, owned: { rotary: 'geklaut' } } };
    expect(deserializeGame(serializeGame(kaputt as GameState, 'test')).ok).toBe(false);
  });

  it('content/research.yaml hat zu jeder Technik und Förderstufe einen Text', () => {
    const text = readFileSync(new URL('../../content/research.yaml', import.meta.url), 'utf8');
    expect(parseResearchContent('content/research.yaml', text, balance).errors).toEqual([]);
    const fehlt = parseResearchContent('x', 'techs: { rotary: { name: { de: a }, text: { de: b } } }\ndomains: { bohren: { de: a }, raffinerie: { de: a }, transport: { de: a } }\nfunding: [{ de: a }]', balance);
    expect(fehlt.errors.length).toBeGreaterThan(0);
  });

  it('balance.yaml: Voraussetzungen stehen weiter oben, Kennzahlen sind bekannt', () => {
    const roh = () => parse(readFileSync(new URL('../../content/balance.yaml', import.meta.url), 'utf8'));
    expect(() => parseResearchBalance(roh())).not.toThrow();
    const r1 = roh();
    r1.research.techs[0].requires = ['rollenmeissel'];
    expect(() => parseResearchBalance(r1)).toThrow(BalanceError);
    const r2 = roh();
    r2.research.techs[0].effects = { fliegen: 1 };
    expect(() => parseResearchBalance(r2)).toThrow(BalanceError);
    const r3 = roh();
    r3.research.techs[1].domain = 'zauberei';
    expect(() => parseResearchBalance(r3)).toThrow(BalanceError);
  });

  it('Debug-Vorschau: schaltet die Werkstatt schon in Kapitel 1 frei – ohne Vorschau bleibt sie aus; der Spielstand bleibt gültig', () => {
    const k1 = newGame('vorschau', balance);
    expect(researchUnlocked(k1, balance)).toBe(false);
    const v = previewResearch(k1);
    expect(researchUnlocked(v, balance)).toBe(true);
    expect(previewResearch(v)).toBe(v);
    const w = ok(buildWorkshop({ ...v, cash: 100000 }, balance));
    expect(w.research!.workshop).toBe(true);
    expect(validResearch(w.research)).toBe(true);
    expect(deserializeGame(serializeGame(w, 'test')).ok).toBe(true);
  });
});
