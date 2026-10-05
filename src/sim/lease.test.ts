import { describe, expect, it } from 'vitest';
import type { Balance, LandownerType } from './balance';
import { endRound, newGame, type GameState } from './game';
import {
  buyLease,
  buyOption,
  exerciseOption,
  leaseOf,
  leaseTerms,
  locationFor,
  optionOf,
  roundsLeft,
  stepsBetween,
  type LeaseResult,
} from './lease';
import { forecastMid, withStartClues } from './exploration';
import { trueChance } from './forecast';
import { loadBalance } from './testBalance';
import { fakeParcel } from './testParcels';

const balance = loadBalance();

/**
 * Eine feste Karte für alle Tests hier (Seed „pacht“), jede Ranch auf genau eine
 * Standardfläche (ranches.slotArea) gesetzt – so gelten die Bonuszahlen aus balance.yaml 1:1.
 */
const KARTE = newGame('pacht', balance);
const KARTE_PARCELS = KARTE.parcels.map((p) => ({ ...p, area: balance.ranches.slotArea }));

/** Spiel ohne Startoptionen, damit Tests freie Ranches sicher wählen können. */
function game(seed = 'pacht', cash = 100000): GameState {
  const state = newGame(seed, balance);
  return { ...state, cash, options: [], parcels: KARTE_PARCELS, fields: KARTE.fields };
}

/** Setzt den Besitzer einer Parzelle fest, um gezielt rechnen zu können. */
function withOwner(state: GameState, parcelId: string, landowner: LandownerType): GameState {
  return { ...state, parcels: state.parcels.map((p) => (p.id === parcelId ? { ...p, landowner } : p)) };
}

function ok(result: LeaseResult): GameState {
  if (!result.ok) throw new Error(`Erwartet ok, bekommen: ${result.reason}`);
  return result.state;
}

function rounds(state: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) state = endRound(state, balance);
  return state;
}

// Ranches in festen Abständen (Nachbarschaftsschritten) zu Salt Hill auf der Karte „pacht“.
const SALT = KARTE.parcels.find((p) => p.discovery)!;
const schritte = (id: string) => stepsBetween(KARTE.parcels, [SALT], { id });
const SALT_HILL = SALT.id;
const AM_FUND = KARTE.parcels.find((p) => schritte(p.id) === 1)!.id;
const NACHBAR = KARTE.parcels.find((p) => schritte(p.id) === 2)!.id;
const [RAND, RAND2] = KARTE.parcels.filter((p) => schritte(p.id) >= 3).map((p) => p.id);

/** Eine Kette a – b – c – d – e: jede Ranch grenzt nur an ihre Nachbarn in der Reihe. */
const KETTE = ['a', 'b', 'c', 'd', 'e'].map((id, i, alle) =>
  fakeParcel(id, { neighbors: [alle[i - 1], alle[i + 1]].filter((n): n is string => n !== undefined) }),
);
const kette = (id: string) => KETTE.find((p) => p.id === id)!;

describe('Lage zum nächsten Fund', () => {
  it('misst den Abstand in Nachbarschaftsschritten (gemeinsame Grenze = 1)', () => {
    expect(stepsBetween(KETTE, [kette('a')], kette('a'))).toBe(0);
    expect(stepsBetween(KETTE, [kette('a')], kette('b'))).toBe(1);
    expect(stepsBetween(KETTE, [kette('a')], kette('e'))).toBe(4);
    expect(stepsBetween(KETTE, [], kette('e'))).toBe(Infinity);
    expect(stepsBetween([fakeParcel('x'), fakeParcel('y')], [fakeParcel('x')], fakeParcel('y'))).toBe(Infinity);
  });

  it('Abstand ≤ 1: Am Fund, ≤ 2: Nachbar, sonst Randlage', () => {
    const at = (id: string) => locationFor(balance, KETTE, [kette('a')], kette(id)).label;
    expect(at('a')).toBe('Am Fund');
    expect(at('b')).toBe('Am Fund');
    expect(at('c')).toBe('Nachbar eines Funds');
    expect(at('d')).toBe('Randlage');
  });

  it('nimmt den nächsten von mehreren Funden', () => {
    expect(locationFor(balance, KETTE, [kette('a'), kette('e')], kette('d')).label).toBe('Am Fund');
    expect(locationFor(balance, KETTE, [kette('a'), kette('e')], kette('c')).label).toBe('Nachbar eines Funds');
  });

  it('ohne bekannte Funde ist alles Randlage', () => {
    expect(locationFor(balance, KETTE, [], kette('a')).label).toBe('Randlage');
  });

  it('Salt Hill ist die einzige Entdeckungsquelle und liegt im Kern', () => {
    const state = newGame('fund', balance);
    const finds = state.parcels.filter((p) => p.discovery);
    expect(finds).toHaveLength(1);
    expect(finds[0].zone).toBe('kern');
    expect(finds[0].name).toBe('Salt-Hill-Quelle');
  });

  it('auf der echten Karte gibt es alle drei Lagen', () => {
    expect([AM_FUND, NACHBAR, RAND, RAND2].every((id) => id !== undefined)).toBe(true);
  });
});

describe('Größere Ranches kosten mehr (0.2.15+5)', () => {
  it('der Bonus wächst mit der Fläche: doppelte Fläche, doppelter Bonus', () => {
    const mitFlaeche = (area: number) => {
      const g = game();
      return { ...g, parcels: g.parcels.map((p) => (p.id === RAND ? { ...p, area, landowner: 'neutral' as const } : p)) };
    };
    const klein = leaseTerms(mitFlaeche(balance.ranches.slotArea), balance, RAND).bonus;
    const gross = leaseTerms(mitFlaeche(2 * balance.ranches.slotArea), balance, RAND).bonus;
    expect(klein).toBe(80);
    expect(gross).toBe(160);
  });

  it('auf der echten Karte: in derselben Lage kostet die größere Ranch mehr', () => {
    const echt = { ...newGame('pacht', balance), options: [] };
    const rand = echt.parcels
      .filter((p) => !p.discovery && stepsBetween(echt.parcels, [SALT], p) >= 3)
      .map((p) => ({ ...p, landowner: 'neutral' as const }));
    const state = { ...echt, parcels: echt.parcels.map((p) => rand.find((r) => r.id === p.id) ?? p) };
    const sortiert = [...rand].sort((a, b) => a.area - b.area);
    const bonus = (id: string) => leaseTerms(state, balance, id).bonus;
    expect(bonus(sortiert[sortiert.length - 1].id)).toBeGreaterThan(bonus(sortiert[0].id));
  });
});

describe('Konditionen: Bonus und Förderzins', () => {
  const cases: [string, LandownerType, number, number][] = [
    // Parzelle, Besitzer, Bonus, Förderzins
    [RAND, 'neutral', 80, 0.125],
    [RAND, 'gierig', 100, 0.155],
    [RAND, 'verschuldet', 100, 0.1], // 0,095 → Untergrenze 10 %
    [RAND, 'misstrauisch', 120, 0.125],
    [RAND, 'fromm', 70, 0.125], // 72 → 70
    [NACHBAR, 'neutral', 500, 1 / 6],
    [NACHBAR, 'gierig', 630, 1 / 6 + 0.03], // 625 → 630
    [NACHBAR, 'verschuldet', 630, 1 / 6 - 0.03],
    [NACHBAR, 'misstrauisch', 750, 1 / 6],
    [NACHBAR, 'fromm', 450, 1 / 6],
    [AM_FUND, 'neutral', 4000, 0.2],
    [AM_FUND, 'gierig', 5000, 0.23],
    [AM_FUND, 'verschuldet', 5000, 0.17],
    [AM_FUND, 'misstrauisch', 6000, 0.2],
    [AM_FUND, 'fromm', 3600, 0.2],
  ];
  it.each(cases)('%s mit Besitzer %s: Bonus %d $, Förderzins %f', (id, owner, bonus, royalty) => {
    const terms = leaseTerms(withOwner(game(), id, owner), balance, id);
    expect(terms.bonus).toBe(bonus);
    expect(terms.royalty).toBeCloseTo(royalty, 5);
    expect(terms.landowner.name).toBe(owner);
  });

  it('Förderzins wird auf höchstens 25 % begrenzt', () => {
    const greedy: Balance = structuredClone(balance);
    greedy.lease.landowners.find((o) => o.name === 'gierig')!.royaltyAdd = 0.1;
    const terms = leaseTerms(withOwner(game(), AM_FUND, 'gierig'), greedy, AM_FUND);
    expect(terms.royalty).toBe(0.25);
  });

  it('Optionsgebühr ist 10 % vom Bonus, auf 10 $ gerundet', () => {
    expect(leaseTerms(withOwner(game(), NACHBAR, 'gierig'), balance, NACHBAR).optionFee).toBe(60); // 63 → 60
    expect(leaseTerms(withOwner(game(), RAND, 'fromm'), balance, RAND).optionFee).toBe(10); // 7 → 10
    expect(leaseTerms(withOwner(game(), AM_FUND, 'neutral'), balance, AM_FUND).optionFee).toBe(400);
  });
});

describe('Pacht kaufen', () => {
  it('zieht den Bonus ab und legt die Pacht an', () => {
    const before = withOwner(game('kauf', 2000), NACHBAR, 'fromm');
    const after = ok(buyLease(before, balance, NACHBAR));
    expect(after.cash).toBe(1550);
    expect(leaseOf(after, NACHBAR)).toMatchObject({
      holder: 'jacob',
      bonus: 450,
      startRound: 1,
      expiresAfterRound: 4,
      drilled: false,
    });
    expect(leaseOf(after, NACHBAR)!.royalty).toBeCloseTo(1 / 6, 5);
  });

  it('Salt Hill selbst ist nicht pachtbar', () => {
    const result = buyLease(game(), balance, SALT_HILL);
    expect(result.ok).toBe(false);
    expect(buyOption(game(), balance, SALT_HILL).ok).toBe(false);
  });

  it('ohne genug Geld kein Kauf', () => {
    const state = withOwner(game('arm', 3999), AM_FUND, 'neutral');
    const result = buyLease(state, balance, AM_FUND);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Nicht genug Geld/);
    expect(ok(buyLease({ ...state, cash: 4000 }, balance, AM_FUND)).cash).toBe(0);
  });

  it('eine Parzelle kann nicht doppelt gepachtet werden', () => {
    const once = ok(buyLease(game(), balance, RAND));
    expect(buyLease(once, balance, RAND).ok).toBe(false);
    expect(buyOption(once, balance, RAND).ok).toBe(false);
  });

  it('nach Kapitelende ist kein Kauf mehr möglich', () => {
    const state = { ...game(), finished: true };
    expect(buyLease(state, balance, RAND).ok).toBe(false);
    expect(buyOption(state, balance, RAND).ok).toBe(false);
  });

  it('verändert den Eingabezustand nicht', () => {
    const before = game();
    const copy = structuredClone(before);
    const leased = ok(buyLease(before, balance, RAND));
    ok(buyOption(before, balance, NACHBAR));
    endRound(leased, balance);
    const optioned = ok(buyOption(before, balance, AM_FUND));
    const optionCopy = structuredClone(optioned);
    ok(exerciseOption(optioned, balance, AM_FUND));
    expect(before).toEqual(copy);
    expect(optioned).toEqual(optionCopy);
  });
});

describe('Laufzeit und Verzögerungszins', () => {
  it('FERTIG-BEDINGUNG: ungenutzte Pacht verfällt genau nach termRounds Runden', () => {
    let state = ok(buyLease(game(), balance, RAND));
    const term = balance.lease.termRounds;
    state = rounds(state, term - 1);
    expect(state.round).toBe(term);
    expect(leaseOf(state, RAND)).toBeDefined();
    expect(roundsLeft(state, leaseOf(state, RAND)!)).toBe(1);

    state = rounds(state, 1);
    expect(leaseOf(state, RAND)).toBeUndefined();
    const name = KARTE.parcels.find((p) => p.id === RAND)!.name;
    expect(state.log.some((l) => l.includes(`Pacht auf ${name} ist ungenutzt abgelaufen`))).toBe(true);
  });

  it('gebohrte Pacht verfällt nicht und kostet keinen Verzögerungszins', () => {
    const bought = ok(buyLease(game(), balance, RAND));
    const drilled = { ...bought, leases: bought.leases.map((l) => ({ ...l, drilled: true })) };
    const state = rounds(drilled, 10);
    expect(leaseOf(state, RAND)).toBeDefined();
    expect(state.cash).toBe(drilled.cash);
  });

  it('Verzögerungszins wird je ungebohrter Pacht und Runde abgezogen', () => {
    let state = ok(buyLease(game(), balance, RAND));
    state = ok(buyLease(state, balance, RAND2));
    const cash = state.cash;
    state = endRound(state, balance);
    expect(state.cash).toBe(cash - 2 * balance.lease.delayRental);
    expect(state.leases.filter(l => l.holder === 'jacob')).toHaveLength(2);
  });

  it('zahlt über die ganze Laufzeit genau termRounds − 1 mal Zins', () => {
    let state = ok(buyLease(game(), balance, RAND));
    const cash = state.cash;
    state = rounds(state, balance.lease.termRounds);
    expect(state.cash).toBe(cash - (balance.lease.termRounds - 1) * balance.lease.delayRental);
  });

  it('Pacht bleibt, wenn das Geld für den Zins gerade reicht', () => {
    let state = ok(buyLease(game(), balance, RAND));
    state = { ...state, cash: balance.lease.delayRental };
    state = endRound(state, balance);
    expect(leaseOf(state, RAND)).toBeDefined();
    expect(state.cash).toBe(0);
  });

  it('bei leerer Kasse verfällt die Pacht sofort', () => {
    let state = ok(buyLease(game(), balance, RAND));
    state = { ...state, cash: balance.lease.delayRental - 1 };
    state = endRound(state, balance);
    expect(leaseOf(state, RAND)).toBeUndefined();
    expect(state.cash).toBe(balance.lease.delayRental - 1);
    expect(state.log.some((l) => /Kein Geld für den Verzögerungszins/.test(l))).toBe(true);
  });

  it('auch in der letzten Runde wird erst abgerechnet, dann endet das Kapitel', () => {
    let state = rounds(game(), balance.start.rounds - 1);
    state = ok(buyLease(state, balance, RAND));
    const cash = state.cash;
    state = endRound(state, balance);
    expect(state.finished).toBe(true);
    expect(state.cash).toBe(cash - balance.lease.delayRental);
    expect(state.log.at(-1)).toMatch(/Kapitel 1 ist zu Ende/);
  });
});

describe('Pachtoptionen', () => {
  it('Option kostet die Gebühr und sichert Bonus und Förderzins', () => {
    const before = withOwner(game('option', 1000), AM_FUND, 'neutral');
    const after = ok(buyOption(before, balance, AM_FUND));
    expect(after.cash).toBe(600);
    expect(optionOf(after, AM_FUND)).toMatchObject({ bonus: 4000, royalty: 0.2, fee: 400, free: false, expiresAfterRound: 2 });
  });

  it('eingelöste Option wird zur Pacht mit gesichertem Bonus, Laufzeit ab Einlöserunde', () => {
    let state = withOwner(game(), AM_FUND, 'neutral');
    state = ok(buyOption(state, balance, AM_FUND));
    state = endRound(state, balance);
    // Besitzer wird nachträglich gierig – der gesicherte Preis bleibt
    state = withOwner(state, AM_FUND, 'gierig');
    const cash = state.cash;
    state = ok(exerciseOption(state, balance, AM_FUND));
    expect(optionOf(state, AM_FUND)).toBeUndefined();
    expect(state.cash).toBe(cash - 4000);
    expect(leaseOf(state, AM_FUND)).toMatchObject({
      bonus: 4000,
      royalty: 0.2,
      startRound: 2,
      expiresAfterRound: 2 + balance.lease.termRounds - 1,
    });
  });

  it('Einlösen ohne genug Geld geht nicht', () => {
    let state = withOwner(game('knapp', 1000), AM_FUND, 'neutral');
    state = ok(buyOption(state, balance, AM_FUND));
    const result = exerciseOption(state, balance, AM_FUND);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Nicht genug Geld/);
  });

  it('ohne Option kann man nichts einlösen', () => {
    expect(exerciseOption(game(), balance, RAND).ok).toBe(false);
  });

  it('nicht eingelöste Option verfällt nach ihrer Laufzeit', () => {
    let state = ok(buyOption(game(), balance, NACHBAR));
    state = rounds(state, balance.lease.option.termRounds - 1);
    expect(optionOf(state, NACHBAR)).toBeDefined();
    state = rounds(state, 1);
    expect(optionOf(state, NACHBAR)).toBeUndefined();
    expect(exerciseOption(state, balance, NACHBAR).ok).toBe(false);
    expect(state.log.some((l) => /Option auf .* ist verfallen/.test(l))).toBe(true);
  });

  it('Optionen kosten keinen Verzögerungszins', () => {
    let state = ok(buyOption(game(), balance, NACHBAR));
    const cash = state.cash;
    state = endRound(state, balance);
    expect(state.cash).toBe(cash);
  });
});

describe('Startoptionen', () => {
  it('Jacob beginnt mit 2 freien Optionen auf verschiedenen Ranches, die übrigen in Randlage', () => {
    for (const seed of ['harlan', 'brandt', 'abc', 'start']) {
      const state = newGame(seed, balance);
      expect(state.options).toHaveLength(balance.lease.startOptions.count);
      expect(new Set(state.options.map((o) => o.parcelId)).size).toBe(state.options.length);
      state.options.forEach((option, i) => {
        const terms = leaseTerms(state, balance, option.parcelId);
        // Die erste liegt auf einer guten Ranch – in Randlage, wenn es dort eine gibt, sonst weiter innen.
        if (i > 0) expect(terms.location.label).toBe('Randlage');
        expect(terms.location.name).not.toBe(balance.lease.locations[0].name);
        expect(option).toMatchObject({ holder: 'jacob', free: true, bonus: 0, fee: 0 });
        expect(option.royalty).toBe(terms.royalty);
        expect(option.expiresAfterRound).toBe(balance.lease.startOptions.termRounds);
      });
      expect(state.cash).toBe(balance.start.cash);
      expect(state.log.some((l) => /freie Pachtoptionen/.test(l))).toBe(true);
    }
  });

  it('gute erste Option (0.4.20+1): über 1000 Seeds mindestens eine Startoption mit wahrer Chance ≥ minChance und Prognose-Mitte ≥ minForecast', () => {
    const { minChance, minForecast } = balance.lease.startOptions;
    const amFund = balance.lease.locations[0].name;
    let ohneKandidat = 0;
    for (let i = 0; i < 1000; i++) {
      const seed = `startoption-${i}`;
      const state = newGame(seed, balance);
      expect(state.options, seed).toHaveLength(balance.lease.startOptions.count);
      expect(new Set(state.options.map((o) => o.parcelId)).size, seed).toBe(state.options.length);
      const werte = state.options.map((o) => {
        const p = state.parcels.find((x) => x.id === o.parcelId)!;
        const f = state.forecasts[o.parcelId];
        return { p, q: trueChance(balance, p), mitte: (f.low + f.high) / 2 };
      });
      for (const w of werte) {
        expect(w.p.discovery, seed).toBeFalsy();
        // Nie direkt am Fund – das wäre geschenkt.
        expect(leaseTerms(state, balance, w.p.id).location.name, seed).not.toBe(amFund);
      }
      const gut = (q: number, mitte: number) => q >= minChance && mitte >= minForecast;
      if (werte.some((w) => gut(w.q, w.mitte))) {
        // Die Regel gilt für die erste Option selbst – die zweite darf schwächer sein.
        expect(gut(werte[0].q, werte[0].mitte), seed).toBe(true);
        continue;
      }
      // Ohne passende Ranch auf der ganzen Karte (außerhalb der Fundlage) die beste verfügbare.
      ohneKandidat++;
      const passende = state.parcels.filter(
        (p) =>
          !p.discovery &&
          leaseTerms(state, balance, p.id).location.name !== amFund &&
          trueChance(balance, p) >= minChance &&
          forecastMid(withStartClues({ ...state, knowledge: {} }, balance, [p.id]), balance, p.id) >= minForecast,
      );
      expect(passende, seed).toEqual([]);
      expect(werte[0].q, seed).toBeGreaterThanOrEqual(minChance);
    }
    // Ganz selten gibt es keine: Ölranches, deren Ritt-Hinweise zu Spielbeginn zufällig schlecht aussehen.
    expect(ohneKandidat).toBeLessThanOrEqual(30);
  });

  it('sind je Seed gleich und je Seed verschieden', () => {
    const ids = (seed: string) => newGame(seed, balance).options.map((o) => o.parcelId);
    expect(ids('harlan')).toEqual(ids('harlan'));
    const many = new Set(Array.from({ length: 20 }, (_, i) => ids(`welt-${i}`).join()));
    expect(many.size).toBeGreaterThan(1);
  });

  it('freie Startoption lässt sich kostenlos einlösen', () => {
    const state = newGame('frei', balance);
    const id = state.options[0].parcelId;
    const after = ok(exerciseOption(state, balance, id));
    expect(after.cash).toBe(state.cash);
    expect(leaseOf(after, id)).toMatchObject({ bonus: 0, startRound: 1 });
  });
});

describe('Welt und Determinismus', () => {
  it('gleicher Seed = gleiche Welt inklusive Besitzer und Optionen', () => {
    const a = newGame('harlan', balance);
    expect(a).toEqual(newGame('harlan', balance));
    expect(a.parcels.map((p) => p.landowner)).toEqual(newGame('harlan', balance).parcels.map((p) => p.landowner));
  });

  it('Besitzer sind je Seed verschieden und alle Arten kommen vor', () => {
    const a = newGame('harlan', balance).parcels.map((p) => p.landowner);
    const b = newGame('brandt', balance).parcels.map((p) => p.landowner);
    expect(a).not.toEqual(b);
    expect(new Set(a).size).toBe(balance.lease.landowners.length);
  });

  it('gleiche Spielzüge = gleicher Zustand', () => {
    const play = () => rounds(ok(buyLease(game('zug'), balance, RAND)), 6);
    expect(play()).toEqual(play());
  });
});
