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
  researchDirection,
  DIRECTION_TEXTS,
  TECH_DOMAINS,
  previewResearch,
  researchUnlocked,
  rivalsHaveTech,
  startResearch,
  stopResearch,
  techDrillCost,
  techDrillRounds,
  techEffect,
  techGasolineYield,
  techStage,
  TECH_EFFECT_KEYS,
  techTier,
  techViews,
  toggleRefuse,
  validResearch,
  worldTech,
  type ResearchState,
} from './research';
import { deserializeGame, serializeGame } from './save';
import { deeperQuote, drillQuote } from './drilling';
import { refineryMixBounds, refineryTech, setRefineryMix, unlockRefinery } from './refinery';
import { routePlan, teamCapacity } from './logistics';
import { modeCapacity } from './transport';
import { researchHeadline } from './newspaper';
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
    expect(techEffect(s, fest, 'trucks')).toBe(t.effects.trucks);
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

  it('0.4.20+9: alle Kennzahlen wirken – auch Tiefe, Benzinausbeute und Tanklaster', () => {
    expect([...ACTIVE_TECH_EFFECTS].sort()).toEqual([...TECH_EFFECT_KEYS].sort());
  });
});

describe('0.4.20+9: Bohrtiefe, Cracken und Tanklaster wirken (ab Kapitel 2)', () => {
  const leer = (): ResearchState => ({ rng: 1, workshop: false, project: null, funding: 0, progress: {}, owned: {}, refused: [] });
  const mit = (ids: string[], extra: Partial<K2> = {}): K2 => {
    const owned: Record<string, 'lizenz'> = {};
    for (const id of ids) owned[id] = 'lizenz';
    return kapitel2({ research: { ...leer(), owned }, ...extra });
  };
  const st = balance.drilling.stages;

  it('Bohrtiefe: eine Stufe ist so sicher wie eine um die Mehrtiefe flachere, Kosten und Ölanteil bleiben', () => {
    const ohne = kapitel2();
    for (let i = 1; i <= st.length; i++) expect(techStage(ohne, balance, i)).toBe(st[i - 1]);
    const rot = mit(['rotary']);
    const tiefe = balance.research.techs.find((x) => x.id === 'rotary')!.effects.depth!;
    // Stufe 2 liegt um `tiefe` m flacher: zwischen Stufe 1 und 2 gemittelt
    const t = (st[1].depth - tiefe - st[0].depth) / (st[1].depth - st[0].depth);
    const s2 = techStage(rot, balance, 2);
    expect(s2.accident).toBeCloseTo(st[0].accident + (st[1].accident - st[0].accident) * t, 4);
    expect(s2.stuck).toBeLessThan(st[1].stuck);
    expect(s2.cost).toBe(st[1].cost);
    expect(s2.oilShare).toBe(st[1].oilShare);
    expect(s2.depth).toBe(st[1].depth);
    // Stufe 1 wird nie sicherer als sie ist (es gibt nichts Flacheres)
    expect(techStage(rot, balance, 1)).toEqual(st[0]);
    // beide Techniken (+300 m): Stufe 2 wie Stufe 1, Stufe 3 wie Stufe 2
    const beide = mit(['rotary', 'rollenmeissel']);
    expect(techStage(beide, balance, 2).accident).toBe(st[0].accident);
    expect(techStage(beide, balance, 3).stuck).toBe(st[1].stuck);
    // in Kapitel 1 nicht
    expect(techStage({ ...rot, chapter: 1 }, balance, 2)).toBe(st[1]);
  });

  it('Bohrtiefe: das Angebot „tiefer bohren“ nennt das kleinere Unfallrisiko', () => {
    const ohne = kapitel2();
    const rot = mit(['rotary']);
    const well = { stage: 1, rigId: ohne.rigs[0].id } as Parameters<typeof deeperQuote>[2];
    expect(deeperQuote(ohne, balance, well)!.accident).toBe(st[1].accident);
    expect(deeperQuote(rot, balance, well)!.accident).toBeLessThan(st[1].accident);
  });

  it('Cracken: der Benzin-Höchstanteil im Mix steigt, Jacob kann mehr Benzin einstellen', () => {
    const mehr = balance.research.techs.find((x) => x.id === 'thermal_cracking')!.effects.gasolineYield!;
    const grund = refineryTech(balance, 1).mix.gasoline.max;
    const ohne = unlockRefinery(kapitel2(), balance);
    const mitC = unlockRefinery(mit(['thermal_cracking']), balance);
    expect(techGasolineYield(ohne, balance)).toBe(0);
    expect(refineryMixBounds(ohne, balance, 1)).toBe(refineryTech(balance, 1).mix);
    expect(refineryMixBounds(mitC, balance, 1).gasoline.max).toBeCloseTo(grund + mehr, 6);
    const wunsch = { kerosene: 0.35, lubricant: 0.05, fuelOil: 0.1, gasoline: 0.5 };
    const a = setRefineryMix(ohne, balance, wunsch);
    const b = setRefineryMix(mitC, balance, wunsch);
    if (!a.ok || !b.ok) throw new Error('Mix');
    expect(a.state.refinery!.mix.gasoline).toBeLessThanOrEqual(grund);
    expect(b.state.refinery!.mix.gasoline).toBeGreaterThan(grund);
    expect(b.state.refinery!.mix.gasoline).toBeLessThanOrEqual(grund + mehr + 1e-9);
    // in Kapitel 1 nicht
    expect(refineryMixBounds({ ...mitC, chapter: 1 }, balance, 1).gasoline.max).toBe(grund);
  });

  it('Tanklaster: jedes eigene Gespann schafft mehr, auch im Wegevergleich', () => {
    const f = 1 + balance.research.techs.find((x) => x.id === 'tanklaster')!.effects.trucks!;
    const je = balance.transport.teams.capacity;
    const gespanne = (g: K2): K2 => ({ ...g, logistics: { ...g.logistics, teams: 2 } });
    const ohne = gespanne(kapitel2());
    const mitT = gespanne(mit(['tanklaster']));
    expect(teamCapacity(ohne, balance)).toBe(je);
    expect(teamCapacity(mitT, balance)).toBe(Math.round(je * f));
    expect(modeCapacity(ohne, balance, 'teams')).toBe(2 * je);
    expect(modeCapacity(mitT, balance, 'teams')).toBe(2 * Math.round(je * f));
    const weg = (g: K2) => routePlan(g, balance, 4 * je).routes.find((r) => r.mode === 'teams')!;
    expect(weg(mitT).teams).toBeLessThan(weg(ohne).teams!);
    // in Kapitel 1 nicht
    expect(teamCapacity({ ...mitT, chapter: 1 }, balance)).toBe(je);
  });
});

describe('Technikstand: Skala wie das Weltmodell von main (4.1)', () => {
  it('liest den Technikstand aus state.worldModel', () => {
    const g = mitTech(kapitel2(), 30);
    expect(worldTech(g, balance)).toBe(30);
    expect(buyLicense(g, balance, 'thermal_cracking').ok).toBe(true);
  });

  it('Ersatzwert ≈ Beginn von Kapitel 2: alle Techniken sind noch patentierbar (0.4.20+29), Lizenzen gibt es erst später', () => {
    const views = techViews(kapitel2(), balance);
    for (const v of views) expect(v.licensable).toBe(false);
  });

  it('alle Stufe-II-Techniken werden bis Kapitel 3 (Technikstand ≈ 22–35) verbreitet – Lizenzgebühren sind erreichbar', () => {
    const wb = balance.research;
    expect(wb.worldFallback.tech).toBeGreaterThanOrEqual(6);
    expect(wb.worldFallback.tech).toBeLessThanOrEqual(22);
    for (const t of wb.techs) expect(t.worldAt).toBeLessThanOrEqual(30);
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

describe('0.4.20+29: eine Forschungsrichtung je Kapitel', () => {
  const werkstatt = () => ok(buildWorkshop(kapitel2(), fest));

  it('die erste Förderung wählt die Richtung; andere Bereiche sind bis Kapitelende gesperrt', () => {
    let s = werkstatt();
    expect(researchDirection(s)).toBeNull();
    s = ok(startResearch(s, fest, 'rotary', 0));
    expect(researchDirection(s)).toBe('bohren');
    const r = startResearch(s, fest, 'tanklaster', 0);
    expect(r.ok).toBe(false);
    expect(techViews(s, fest).find((v) => v.id === 'tanklaster')!.directionLocked).toBe(true);
    s = ok(stopResearch(s, fest));
    expect(startResearch(s, fest, 'thermal_cracking', 0).ok).toBe(false);
    expect(startResearch(s, fest, 'rotary', 1).ok).toBe(true);
  });

  it('im nächsten Kapitel ist die Wahl wieder frei', () => {
    let s = ok(startResearch(werkstatt(), fest, 'rotary', 0));
    s = { ...s, chapter: 3 } as K2;
    expect(researchDirection(s)).toBeNull();
    expect(techViews(s, fest).every((v) => !v.directionLocked)).toBe(true);
    s = ok(stopResearch(s, fest));
    expect(researchDirection(ok(startResearch(s, fest, 'tanklaster', 0)))).toBe('transport');
  });

  it('Lizenzen außerhalb der Richtung kosten den Aufschlag, innerhalb und vor der Wahl nicht', () => {
    const t = fest.research.techs.find((x) => x.id === 'thermal_cracking')!;
    const welt = mitTech(werkstatt(), 60);
    expect(techViews(welt, fest).find((v) => v.id === 'thermal_cracking')!.license).toBe(t.license);
    const gewaehlt = ok(startResearch(welt, fest, 'rotary', 0));
    const v = techViews(gewaehlt, fest).find((x) => x.id === 'thermal_cracking')!;
    expect(v.surcharge).toBe(true);
    expect(v.license).toBe(Math.round(t.license * fest.research.licenseOffDirection));
    const gekauft = ok(buyLicense(gewaehlt, fest, 'thermal_cracking'));
    expect(gekauft.cash).toBe(gewaehlt.cash - v.license);
    expect(techViews(gewaehlt, fest).find((x) => x.id === 'rotary')!.surcharge).toBe(false);
  });

  it('ein laufendes Projekt aus einem alten Stand setzt die Richtung beim nächsten Rundenabschluss', () => {
    const s = ok(startResearch(werkstatt(), fest, 'tanklaster', 0));
    const alt = { ...s, research: { ...s.research!, direction: undefined } } as K2;
    expect(researchDirection(runden(alt, 1, fest))).toBe('transport');
  });

  it('Abschluss: Protokollzeile, Merkzeichen und Zeitungsmeldung in der Folgerunde', () => {
    let s = ok(startResearch(werkstatt(), fest, 'tanklaster', 1));
    s = runden(s, 4, fest);
    expect(s.research!.done).toMatchObject({ id: 'tanklaster', patent: true });
    expect(s.log.some((z) => z.includes('Werkstatt hat es geschafft'))).toBe(true);
    const nachher = { ...s, round: s.research!.done!.round + 1 };
    expect(researchHeadline(nachher)).toBe('research_patent');
    expect(researchHeadline({ ...s, round: s.research!.done!.round + 2 })).toBeNull();
    expect(researchHeadline({ ...nachher, research: { ...s.research!, done: { ...s.research!.done!, patent: false } } })).toBe('research_done');
  });

  it('Spielstand: alte Stände ohne direction/done laden, kaputte Richtung wird abgelehnt', () => {
    const s = ok(startResearch(werkstatt(), fest, 'rotary', 0));
    const geladen = deserializeGame(serializeGame(s, '0'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect((geladen.state as K2).research!.direction).toEqual({ chapter: 2, domain: 'bohren' });
    const alt = { ...s.research! } as Record<string, unknown>;
    delete alt.direction;
    expect(validResearch(alt)).toBe(true);
    expect(validResearch({ ...alt, direction: { chapter: 2, domain: 'quatsch' } })).toBe(false);
    expect(validResearch({ ...alt, done: { id: 'x', round: 'a', patent: true } })).toBe(false);
  });

  it('Patent-Check: zu Beginn von Kapitel 2 ist je Richtung mindestens eine Technik bei früher Förderung patentierbar', () => {
    const wb = balance.research;
    const rate = balance.worldModel.tech.rate;
    const kraeftig = wb.funding[wb.funding.length - 1];
    const ersteJeBereich = TECH_DOMAINS.map((d) => wb.techs.find((t) => t.domain === d && t.requires.length === 0)!);
    const anteil: Record<string, number> = {};
    const N = 200;
    for (const t of ersteJeBereich) {
      // Schlechtester Zufall: luck.min. So viele Runden braucht die Werkstatt mindestens mit kräftiger Förderung.
      const runden_ = Math.ceil(t.points / (kraeftig.points * wb.luck.min));
      let patent = 0;
      for (let i = 0; i < N; i++) {
        let tech = newGame(`welt${i}`, balance).worldModel!.tech;
        for (let r = 0; r < 40 + runden_; r++) tech += rate * tech * (1 - tech / 100);
        if (tech < t.worldAt) patent++;
      }
      anteil[t.id] = patent / N;
      expect(patent / N, `${t.id}: Patent in ${runden_} Runden ab Kapitelbeginn`).toBeGreaterThanOrEqual(0.8);
    }
    expect(Object.keys(anteil)).toHaveLength(3);
  });

  it('Texte der Werkstatt (direction) stehen in research.yaml auf Deutsch und Englisch', () => {
    const c = parseResearchContent('content/research.yaml', readFileSync('content/research.yaml', 'utf8'), balance);
    expect(c.errors).toEqual([]);
    for (const k of DIRECTION_TEXTS) {
      expect(c.content!.direction[k].de).not.toBe('');
      expect(c.content!.direction[k].en).not.toBe('');
    }
  });
});
