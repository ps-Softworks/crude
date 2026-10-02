import { describe, expect, it } from 'vitest';
import type { Balance, LandownerType } from './balance';
import { endRound, newGame, type GameState } from './game';
import { generateParcels } from './geology';
import {
  buyLease,
  buyOption,
  chebyshev,
  exerciseOption,
  leaseOf,
  leaseTerms,
  locationFor,
  optionOf,
  roundsLeft,
  type LeaseResult,
} from './lease';
import { Rng, seedFromString } from './rng';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const salt = balance.map.saltHill;

/** Spiel ohne Startoptionen, damit Tests freie Parzellen sicher wählen können. */
function game(seed = 'pacht', cash = 100000): GameState {
  const state = newGame(seed, balance);
  return { ...state, cash, options: [] };
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

// Parzellen in festen Abständen zu Salt Hill (6/4 auf 12×9)
const AM_FUND = `p-${salt.x + 1}-${salt.y + 1}`; // diagonal daneben: Abstand 1
const NACHBAR = `p-${salt.x - 2}-${salt.y}`; // Abstand 2
const RAND = 'p-0-0'; // Abstand 6
const SALT_HILL = `p-${salt.x}-${salt.y}`;

describe('Lage zum nächsten Fund', () => {
  it('misst den Abstand in Feldern, Diagonalen zählen einfach', () => {
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
    expect(chebyshev({ x: 2, y: 2 }, { x: 1, y: 1 })).toBe(1);
  });

  it('Abstand ≤ 1: Am Fund, ≤ 2: Nachbar, sonst Randlage', () => {
    const finds = [salt];
    const at = (dx: number, dy: number) => locationFor(balance, finds, { x: salt.x + dx, y: salt.y + dy }).label;
    expect(at(0, 0)).toBe('Am Fund');
    expect(at(1, 1)).toBe('Am Fund');
    expect(at(-1, 0)).toBe('Am Fund');
    expect(at(2, 0)).toBe('Nachbar eines Funds');
    expect(at(-2, 2)).toBe('Nachbar eines Funds');
    expect(at(3, 0)).toBe('Randlage');
    expect(at(-3, -3)).toBe('Randlage');
  });

  it('nimmt den nächsten von mehreren Funden', () => {
    const finds = [salt, { x: 0, y: 0 }];
    expect(locationFor(balance, finds, { x: 1, y: 1 }).label).toBe('Am Fund');
    expect(locationFor(balance, finds, { x: 2, y: 0 }).label).toBe('Nachbar eines Funds');
  });

  it('ohne bekannte Funde ist alles Randlage', () => {
    expect(locationFor(balance, [], salt).label).toBe('Randlage');
  });

  it('Salt Hill ist die Entdeckungsparzelle, sonst keine', () => {
    const state = newGame('fund', balance);
    const finds = state.parcels.filter((p) => p.discovery);
    expect(finds.map((p) => p.id)).toEqual([SALT_HILL]);
  });
});

describe('Konditionen: Bonus und Förderzins', () => {
  const cases: [string, LandownerType, number, number][] = [
    // Parzelle, Besitzer, Bonus, Förderzins
    [RAND, 'neutral', 150, 0.125],
    [RAND, 'gierig', 190, 0.155], // 187,5 → 190
    [RAND, 'verschuldet', 190, 0.1], // 0,095 → Untergrenze 10 %
    [RAND, 'misstrauisch', 230, 0.125], // 225 → 230
    [RAND, 'fromm', 140, 0.125], // 135 → 140
    [NACHBAR, 'neutral', 2000, 1 / 6],
    [NACHBAR, 'gierig', 2500, 1 / 6 + 0.03],
    [NACHBAR, 'verschuldet', 2500, 1 / 6 - 0.03],
    [NACHBAR, 'misstrauisch', 3000, 1 / 6],
    [NACHBAR, 'fromm', 1800, 1 / 6],
    [AM_FUND, 'neutral', 8000, 0.2],
    [AM_FUND, 'gierig', 10000, 0.23],
    [AM_FUND, 'verschuldet', 10000, 0.17],
    [AM_FUND, 'misstrauisch', 12000, 0.2],
    [AM_FUND, 'fromm', 7200, 0.2],
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
    expect(leaseTerms(withOwner(game(), RAND, 'neutral'), balance, RAND).optionFee).toBe(20); // 15 → 20
    expect(leaseTerms(withOwner(game(), RAND, 'fromm'), balance, RAND).optionFee).toBe(10); // 14 → 10
    expect(leaseTerms(withOwner(game(), AM_FUND, 'neutral'), balance, AM_FUND).optionFee).toBe(800);
  });
});

describe('Pacht kaufen', () => {
  it('zieht den Bonus ab und legt die Pacht an', () => {
    const before = withOwner(game('kauf', 2000), NACHBAR, 'fromm');
    const after = ok(buyLease(before, balance, NACHBAR));
    expect(after.cash).toBe(200);
    expect(leaseOf(after, NACHBAR)).toMatchObject({
      holder: 'jacob',
      bonus: 1800,
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
    const state = withOwner(game('arm', 7999), AM_FUND, 'neutral');
    const result = buyLease(state, balance, AM_FUND);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Nicht genug Geld/);
    expect(ok(buyLease({ ...state, cash: 8000 }, balance, AM_FUND)).cash).toBe(0);
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
    expect(state.log.some((l) => /Pacht auf Parzelle 1\/1 ist ungenutzt abgelaufen/.test(l))).toBe(true);
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
    state = ok(buyLease(state, balance, 'p-11-8'));
    const cash = state.cash;
    state = endRound(state, balance);
    expect(state.cash).toBe(cash - 2 * balance.lease.delayRental);
    expect(state.leases).toHaveLength(2);
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
    expect(after.cash).toBe(200);
    expect(optionOf(after, AM_FUND)).toMatchObject({ bonus: 8000, royalty: 0.2, fee: 800, free: false, expiresAfterRound: 2 });
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
    expect(state.cash).toBe(cash - 8000);
    expect(leaseOf(state, AM_FUND)).toMatchObject({
      bonus: 8000,
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
    expect(state.log.some((l) => /Option auf Parzelle .* ist verfallen/.test(l))).toBe(true);
  });

  it('Optionen kosten keinen Verzögerungszins', () => {
    let state = ok(buyOption(game(), balance, NACHBAR));
    const cash = state.cash;
    state = endRound(state, balance);
    expect(state.cash).toBe(cash);
  });
});

describe('Startoptionen', () => {
  it('Jacob beginnt mit 2 freien Optionen auf verschiedenen Randlage-Parzellen', () => {
    for (const seed of ['harlan', 'brandt', 'abc', 'start']) {
      const state = newGame(seed, balance);
      expect(state.options).toHaveLength(balance.lease.startOptions.count);
      expect(new Set(state.options.map((o) => o.parcelId)).size).toBe(state.options.length);
      for (const option of state.options) {
        const terms = leaseTerms(state, balance, option.parcelId);
        expect(terms.location.label).toBe('Randlage');
        expect(option).toMatchObject({ holder: 'jacob', free: true, bonus: 0, fee: 0 });
        expect(option.royalty).toBe(terms.royalty);
        expect(option.expiresAfterRound).toBe(balance.lease.startOptions.termRounds);
      }
      expect(state.cash).toBe(balance.start.cash);
      expect(state.log.some((l) => /freie Pachtoptionen/.test(l))).toBe(true);
    }
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

  it('die Geologie je Seed ist dieselbe wie vor Schritt 1.4', () => {
    // Fingerabdrücke wurden vor dem Einbau der Landbesitzer aufgenommen.
    const fingerprint = (seed: string) => {
      const parcels = generateParcels(balance, new Rng(seedFromString(seed)));
      const text = parcels.map((p) => `${p.geology}:${p.reserves}`).join(',');
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
      return h;
    };
    expect(fingerprint('harlan')).toBe(3553528969);
    expect(fingerprint('brandt')).toBe(1378583280);
  });
});
