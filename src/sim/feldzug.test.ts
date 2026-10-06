// 0.4.20+8 Cranes Feldzug (src/sim/feldzug.ts): Ankündigung, Preiskrieg, Kriegskasse, Absprache, Thornes Kredit.

import { describe, expect, it } from 'vitest';
import { BalanceError, type Balance } from './balance';
import { botFeldzug } from './botsKapitel3';
import { brandOf, brandWorldFrom, buildStations, regionMarket, stationCost, type BrandState } from './brand';
import { applyEarlyEnding } from './chapter';
import { openChapterSystems } from './chapterSystems';
import { creditLimit } from './credit';
import { empireValue } from './empire';
import { applySystemEffects, parseSystemEffects } from './eventSystems';
import {
  chestWord,
  feldzugAbsprache,
  feldzugKredit,
  feldzugTilgen,
  FELDZUG_MARKS,
  newFeldzug,
  parseFeldzugBalance,
  settleFeldzug,
  thorneOffer,
  validFeldzug,
  type FeldzugState,
} from './feldzug';
import { newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Balance mit geänderten Feldzug-Zahlen. */
function mit(patch: (f: Balance['feldzug']) => Balance['feldzug']): Balance {
  return { ...balance, feldzug: patch(balance.feldzug) };
}
const sicher = mit((f) => ({ ...f, trigger: { ...f.trigger, chance: 1 }, war: { ...f.war, chestMin: 3, chestMax: 3 } }));

/** Kapitel 3, Runde 5, Marke gegründet, Tankstellen in den Regionen. */
function k3(stationen: Record<string, number> = { cordova: 6, okara: 6 }, extra: Partial<GameState> = {}): GameState {
  const s0: GameState = { ...newGame('feldzug', balance), chapter: 3, chapterStart: 1, round: 5, cash: 200000, ...extra };
  const s = openChapterSystems(s0, balance, {});
  const b = brandOf(s, balance);
  const regions = Object.fromEntries(Object.entries(b.regions).map(([id, r]) => [id, { ...r, stations: stationen[id] ?? 0 }]));
  const brand: BrandState = { ...b, founded: true, nameId: 'harlan', regions };
  return { ...s, brand };
}

function imKrieg(s: GameState, b: Balance = sicher): GameState {
  const drohung = settleFeldzug(s, b);
  expect(drohung.feldzug!.phase).toBe('drohung');
  const krieg = settleFeldzug(drohung, b);
  expect(krieg.feldzug!.phase).toBe('krieg');
  return krieg;
}

function ok(r: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!r.ok) throw new Error(`abgelehnt: ${r.reason}`);
  return r.state;
}

describe('Cranes Feldzug – Zahlen', () => {
  it('liest den Block feldzug aus balance.yaml', () => {
    expect(balance.feldzug.fromChapter).toBe(3);
    expect(balance.feldzug.war.chestMax).toBeGreaterThanOrEqual(balance.feldzug.war.chestMin);
  });

  it('meldet eine Kriegskasse, die kürzer als ihr Minimum ist', () => {
    const raw = { feldzug: { ...balance.feldzug, war: { ...balance.feldzug.war, chestMin: 5, chestMax: 2 } } };
    expect(() => parseFeldzugBalance(raw)).toThrow(BalanceError);
  });
});

describe('Cranes Feldzug – Ablauf', () => {
  it('rührt sich vor Kapitel 3 und ohne Marke nicht', () => {
    const k1 = { ...k3(), chapter: 1 };
    expect(settleFeldzug(k1, sicher)).toBe(k1);
    const ohneMarke = { ...k3(), brand: { ...k3().brand!, founded: false } };
    expect(settleFeldzug(ohneMarke, sicher)).toBe(ohneMarke);
  });

  it('kündigt erst ab trigger.stations Tankstellen und ab notBefore an – mit Merkzeichen für Margarets Besuch', () => {
    const klein = settleFeldzug(k3({ cordova: 3 }), sicher);
    expect(klein.feldzug!.phase).toBe('ruhe');
    const frueh = settleFeldzug(k3(undefined, { round: 1 }), sicher);
    expect(frueh.feldzug!.phase).toBe('ruhe');
    const s = settleFeldzug(k3(), sicher);
    expect(s.feldzug!.phase).toBe('drohung');
    expect(s.events.marks[FELDZUG_MARKS.threat]).toBe(s.round);
  });

  it('im Krieg: Crane billig, Jacobs Marge gedrückt, Bankrahmen halbiert', () => {
    const vorher = k3();
    const s = imKrieg(vorher);
    for (const id of ['cordova', 'okara']) expect(s.brand!.regions[id].crane.price).toBe('billig');
    expect(s.brand!.regions.mittelland.crane.price).toBe('normal');
    const ohne = regionMarket(brandOf(vorher, balance), balance, 'cordova', brandWorldFrom(vorher));
    const mitKrieg = regionMarket(brandOf(s, balance), balance, 'cordova', brandWorldFrom(s));
    expect(brandWorldFrom(s).dumping).toBe(balance.feldzug.war.margin);
    expect(mitKrieg.margin).toBeLessThan(ohne.margin);
    expect(mitKrieg.profit).toBeLessThan(ohne.profit);
    expect(creditLimit(s, balance)).toBeLessThan(creditLimit(vorher, balance));
  });

  it('endet nach der Kriegskasse: durchgehalten – Crane schließt Tankstellen, Ruf steigt, Preise normal', () => {
    let s = imKrieg(k3());
    const craneVorher = s.brand!.regions.cordova.crane.stations;
    for (let i = 0; i < 3; i++) s = settleFeldzug(s, sicher);
    expect(s.feldzug!.phase).toBe('vorbei');
    expect(s.feldzug!.outcome).toBe('durchgehalten');
    expect(s.feldzug!.dumping).toBe(1);
    expect(s.brand!.regions.cordova.crane.price).toBe('normal');
    expect(s.brand!.regions.cordova.crane.stations).toBeLessThan(craneVorher);
    expect(s.reputation?.public).toBe(balance.feldzug.held.reputation);
    expect(s.events.marks[FELDZUG_MARKS.held]).toBe(s.round);
    // Einmal je Kapitel.
    expect(settleFeldzug(s, sicher).feldzug!.phase).toBe('vorbei');
  });

  it('endet verloren, wenn Harlan keine Tankstelle mehr hat', () => {
    const s = imKrieg(k3());
    const leer: GameState = { ...s, brand: { ...s.brand!, regions: Object.fromEntries(Object.entries(s.brand!.regions).map(([id, r]) => [id, { ...r, stations: 0 }])) } };
    const t = settleFeldzug(leer, sicher);
    expect(t.feldzug!.outcome).toBe('aufgegeben');
  });

  it('endet mit dem Kapitel', () => {
    const s = imKrieg(k3());
    const t = settleFeldzug({ ...s, round: s.totalRounds }, sicher);
    expect(t.feldzug!.outcome).toBe('kapitelende');
  });

  it('zeigt Cranes Kasse nur als Wort', () => {
    expect(chestWord({ chest: 8, chestStart: 8 })).toBe('voll');
    expect(chestWord({ chest: 4, chestStart: 8 })).toBe('halb');
    expect(chestWord({ chest: 1, chestStart: 8 })).toBe('knapp');
  });

  it('ist bei gleichem Seed gleich', () => {
    const a = settleFeldzug(settleFeldzug(k3(), balance), balance);
    const b = settleFeldzug(settleFeldzug(k3(), balance), balance);
    expect(a.feldzug).toEqual(b.feldzug);
  });
});

describe('Cranes Feldzug – Auswege', () => {
  it('Preisabsprache: Krieg vorbei, Spur im Schattenbuch, keine neuen Tankstellen', () => {
    const s = imKrieg(k3());
    expect(s.investigation).toBeDefined();
    const spuren = s.investigation!.extra.length;
    const t = ok(feldzugAbsprache(s, sicher));
    expect(t.feldzug!.outcome).toBe('absprache');
    expect(t.feldzug!.pact).toBe(true);
    expect(t.brand!.regions.cordova.crane.price).toBe('normal');
    expect(t.investigation!.extra.length).toBe(spuren + 1);
    expect(t.investigation!.extra.at(-1)!.severity).toBe(balance.feldzug.pact.trace);
    const bau = buildStations(t, balance, brandWorldFrom(t), 'cordova', 1);
    expect(bau.ok ? null : bau.reason).toBe('pact');
    expect(feldzugAbsprache(t, sicher).ok).toBe(false);
  });

  it('Preisabsprache teilt die Gebiete: Harlan behält die stärksten Regionen, Crane kauft den Rest zum Restwert', () => {
    const s = imKrieg(k3({ cordova: 6, okara: 4, mittelland: 2 }));
    const mitAnteil: GameState = {
      ...s,
      brand: {
        ...s.brand!,
        regions: Object.fromEntries(Object.entries(s.brand!.regions).map(([id, r]) => [id, { ...r, last: { demand: 1, sales: 0, craneSales: 0, share: { cordova: 0.4, okara: 0.3, mittelland: 0.1 }[id] ?? 0, craneShare: 0, profit: 0, priceWar: false } }])),
      },
    };
    const craneVorher = mitAnteil.brand!.regions.mittelland.crane.stations;
    const t = ok(feldzugAbsprache(mitAnteil, balance));
    expect(balance.feldzug.pact.keepRegions).toBe(2);
    expect(t.brand!.regions.cordova.stations).toBe(6);
    expect(t.brand!.regions.okara.stations).toBe(4);
    expect(t.brand!.regions.mittelland.stations).toBe(0);
    expect(t.brand!.regions.mittelland.crane.stations).toBe(craneVorher + 2);
    expect(t.cash).toBeCloseTo(mitAnteil.cash + 2 * stationCost(balance, 'mittelland') * balance.brand.station.resale, 2);
  });

  it('Preisabsprache geht schon bei der Ankündigung, aber nicht in Ruhe', () => {
    expect(feldzugAbsprache(k3(), sicher).ok).toBe(false);
    const drohung = settleFeldzug(k3(), sicher);
    expect(ok(feldzugAbsprache(drohung, sicher)).feldzug!.outcome).toBe('absprache');
  });

  it('Thorne bietet an, wenn die Kasse im Krieg unter offerBelow fällt', () => {
    const s = imKrieg(k3());
    expect(feldzugKredit(s, sicher).ok).toBe(false);
    const knapp = settleFeldzug({ ...s, cash: 1000 }, sicher);
    expect(knapp.feldzug!.loanOffered).toBe(true);
    expect(knapp.events.marks[FELDZUG_MARKS.thorne]).toBe(knapp.round);
    const { amount, owed } = thorneOffer(knapp, sicher);
    expect(amount).toBeGreaterThanOrEqual(balance.feldzug.thorne.min);
    expect(owed).toBeCloseTo(amount * (1 + balance.feldzug.thorne.interest), 2);
    const geliehen = ok(feldzugKredit(knapp, sicher));
    expect(geliehen.cash).toBe(knapp.cash + amount);
    expect(geliehen.feldzug!.loan).toEqual({ amount, owed, due: knapp.round + balance.feldzug.thorne.rounds });
    expect(feldzugKredit(geliehen, sicher).ok).toBe(false);
    expect(empireValue(geliehen, balance)).toBeCloseTo(empireValue(knapp, balance) + amount - owed, 0);
  });

  function mitKredit(): GameState {
    const knapp = settleFeldzug({ ...imKrieg(k3()), cash: 1000 }, sicher);
    return ok(feldzugKredit(knapp, sicher));
  }

  it('Thornes Frist: Geld da → zurückgezahlt', () => {
    const s = mitKredit();
    const owed = s.feldzug!.loan!.owed;
    const t = settleFeldzug({ ...s, round: s.feldzug!.loan!.due, cash: owed + 500 }, sicher);
    expect(t.feldzug!.loan).toBeNull();
    expect(t.cash).toBeCloseTo(500, 2);
    expect(t.feldzug!.swallowed).toBe(false);
  });

  it('Thornes Frist: Geld fehlt → Thorne zieht das Pfand, Ende „Geschluckt“ (auch für die Familienfirma)', () => {
    const s = mitKredit();
    expect(s.stocks?.public ?? false).toBe(false);
    const t = settleFeldzug({ ...s, round: s.feldzug!.loan!.due, cash: 100 }, sicher);
    expect(t.feldzug!.swallowed).toBe(true);
    const ende = applyEarlyEnding(t, balance);
    expect(ende.finished).toBe(true);
    expect(ende.ending).toBe('geschluckt');
  });

  it('Thornes Kredit vorzeitig tilgen', () => {
    const s = mitKredit();
    expect(feldzugTilgen(s).ok).toBe(false);
    const reich = { ...s, cash: s.feldzug!.loan!.owed + 10 };
    const t = ok(feldzugTilgen(reich));
    expect(t.feldzug!.loan).toBeNull();
    expect(t.cash).toBeCloseTo(10, 2);
  });

  it('Ereignis-Wirkung feldzug: absprache und kredit', () => {
    const lies = (raw: Record<string, unknown>) => {
      const fehler: string[] = [];
      const effects = parseSystemEffects(raw, (k, text) => fehler.push(`${k}: ${text}`));
      return { effects: effects ?? undefined, fehler };
    };
    const { effects, fehler } = lies({ feldzug: 'absprache' });
    expect(fehler).toEqual([]);
    const t = applySystemEffects(imKrieg(k3()), effects, sicher);
    expect(t.feldzug!.outcome).toBe('absprache');
    expect(lies({ feldzug: 'quatsch' }).fehler.length).toBeGreaterThan(0);
    const knapp = settleFeldzug({ ...imKrieg(k3()), cash: 1000 }, sicher);
    const geliehen = applySystemEffects(knapp, lies({ feldzug: 'kredit' }).effects, sicher);
    expect(geliehen.feldzug!.loan).not.toBeNull();
  });
});

describe('Cranes Feldzug – Bots', () => {
  it('Absprache-Bot nimmt die Preisliste', () => {
    const s = settleFeldzug(k3(), sicher);
    const t = botFeldzug(s, sicher, { pact: true, loan: false, sellBelow: 0 }, 0);
    expect(t.feldzug!.outcome).toBe('absprache');
  });

  it('Betrügerischer Bot: mit pactAfter erst nach so vielen Runden Krieg', () => {
    const p = { pact: true, loan: false, sellBelow: 0, pactAfter: 2 };
    const drohung = settleFeldzug(k3(), sicher);
    expect(botFeldzug(drohung, sicher, p, 0).feldzug!.outcome).toBeNull();
    const krieg = imKrieg(k3());
    const seit = krieg.feldzug!.since;
    expect(botFeldzug({ ...krieg, round: seit + 1 }, sicher, p, 0).feldzug!.outcome).toBeNull();
    expect(botFeldzug({ ...krieg, round: seit + 2 }, sicher, p, 0).feldzug!.outcome).toBe('absprache');
  });

  it('verkauft im Krieg Tankstellen, solange die Kasse unter sellBelow liegt', () => {
    const s = { ...imKrieg(k3()), cash: 0 };
    const t = botFeldzug(s, sicher, { pact: false, loan: false, sellBelow: 20000 }, 0);
    const vorher = Object.values(s.brand!.regions).reduce((x, r) => x + r.stations, 0);
    const nachher = Object.values(t.brand!.regions).reduce((x, r) => x + r.stations, 0);
    expect(nachher).toBeLessThan(vorher);
    expect(t.cash).toBeGreaterThanOrEqual(20000);
  });

  it('nimmt Thornes Geld unter der Rücklage und zahlt es zurück, sobald es reicht', () => {
    const knapp = settleFeldzug({ ...imKrieg(k3()), cash: 1000 }, sicher);
    const t = botFeldzug(knapp, sicher, { pact: false, loan: true, sellBelow: 0 }, 15000);
    expect(t.feldzug!.loan).not.toBeNull();
    const reich = { ...t, cash: t.feldzug!.loan!.owed + 20000 };
    expect(botFeldzug(reich, sicher, { pact: false, loan: true, sellBelow: 0 }, 15000).feldzug!.loan).toBeNull();
  });
});

describe('Cranes Feldzug – Spielstand', () => {
  it('prüft den Zustand und überlebt Speichern und Laden', () => {
    expect(validFeldzug(undefined)).toBe(true);
    expect(validFeldzug(newFeldzug('x'))).toBe(true);
    expect(validFeldzug({ ...newFeldzug('x'), phase: 'quatsch' })).toBe(false);
    const f: FeldzugState = { ...newFeldzug('x'), loan: { amount: 1, owed: 2, due: 3 } };
    expect(validFeldzug(f)).toBe(true);
    const s = imKrieg(k3());
    const r = deserializeGame(serializeGame(s, 'test'));
    expect(r.ok && r.state.feldzug).toEqual(s.feldzug);
  });
});
