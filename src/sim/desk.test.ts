import { describe, expect, it } from 'vitest';
import type { Balance } from './balance';
import { takeLoan } from './credit';
import { applyAction, drillBlocker, nextStep, parcelActions, roundLog, sourceRows } from './desk';
import { abandonWell, drillDeeper, fishWell, stageCost, startDrilling, type Well, type WellStatus } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { buyLease, buyOption, exerciseOption, leaseTerms, type Lease } from './lease';
import { loadBalance } from './testBalance';

const balance = loadBalance();

/** Balancen ohne Unfall und ohne klemmendes Werkzeug – für eindeutige Bohrverläufe. */
const sicher: Balance = {
  ...balance,
  drilling: { ...balance.drilling, stages: balance.drilling.stages.map((s) => ({ ...s, accident: 0, stuck: 0 })) },
};

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function kinds(actions: { kind: string }[]): string[] {
  return actions.map((a) => a.kind);
}

/** Kurzer Name einer Parzelle auf der Karte, z. B. "3/5". */
function label(state: GameState, parcelId: string): string {
  const parcel = state.parcels.find((p) => p.id === parcelId)!;
  return parcel.name;
}

function ok(result: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Spiel mit einer eigenen Pacht auf der ersten pachtbaren Parzelle, ohne Zufall. */
function mitPacht(seed: string): GameState {
  const state = { ...newGame(seed, balance), cash: 100000 };
  const parcel = state.parcels.find((p) => !p.discovery)!;
  const lease: Lease = {
    parcelId: parcel.id,
    holder: 'jacob',
    bonus: 1000,
    royalty: 0.1,
    startRound: 1,
    expiresAfterRound: 9,
    drilled: false,
  };
  return { ...state, leases: [...state.leases, lease] };
}

/** Spiel mit einer Bohrung auf der gepachteten Parzelle. */
function mitBohrung(status: WellStatus, patch: Partial<Well> = {}, seed = 'bohrung'): GameState {
  const state = mitPacht(seed);
  const parcelId = state.leases[0].parcelId;
  const well: Well = {
    id: `${parcelId}#1`,
    parcelId,
    stage: 1,
    status,
    roundsLeft: 2,
    spent: 1500,
    oilStage: status === 'dry' ? null : 2,
    startRound: 1,
    ...patch,
  };
  return {
    ...state,
    wells: [well],
    leases: state.leases.map((l) => (l.parcelId === parcelId ? { ...l, drilled: true } : l)),
  };
}

/** Bohrung, die schon Öl gefunden hat und fördert. */
const GEFUNDEN: Partial<Well> = {
  status: 'found',
  production: { initialRate: 1000, roundsProduced: 2, lastRate: 800, total: 1800 },
};

describe('Aktionen auf einer Parzelle (parcelActions)', () => {
  it('eine Startoption aus der freien Hand: nur einlösen, und das geht sofort', () => {
    const state = newGame('schreibtisch', balance);
    const id = state.options[0].parcelId;
    expect(parcelActions(state, balance, id)).toEqual([
      { kind: 'exercise', label: `Option einlösen (${money(state.options[0].bonus)})`, ok: true },
    ]);
  });

  it('nach dem Einlösen ist es eine Pacht: als Nächstes bohren', () => {
    const state = newGame('schreibtisch', balance);
    const id = state.options[0].parcelId;
    const mitPacht = ok(exerciseOption(state, balance, id));
    expect(parcelActions(mitPacht, balance, id)).toEqual([
      { kind: 'drill', label: `Bohren (${money(stageCost(balance, 1))})`, ok: true },
    ]);
  });

  it('mit leerer Kasse geht das Bohren nicht – und der Knopf sagt, warum', () => {
    const state = newGame('schreibtisch', balance);
    const id = state.options[0].parcelId;
    const arm = { ...ok(exerciseOption(state, balance, id)), cash: 0 };
    const [bohren] = parcelActions(arm, balance, id);
    expect(bohren.kind).toBe('drill');
    expect(bohren.ok).toBe(false);
    expect(bohren.reason).toMatch(/Nicht genug Geld/);
  });

  it('auf der Entdeckungsquelle gibt es nichts zu tun', () => {
    const state = newGame('schreibtisch', balance);
    const quelle = state.parcels.find((p) => p.discovery)!;
    expect(parcelActions(state, balance, quelle.id)).toEqual([]);
  });

  it('auf einer freien Parzelle: Pacht und Option, beide mit Preis aus balance.yaml', () => {
    const state = newGame('schreibtisch', balance);
    const id = state.options[0].parcelId;
    const frei = { ...state, options: state.options.filter((o) => o.parcelId !== id), cash: 100000 };
    const terms = leaseTerms(frei, balance, id);
    expect(parcelActions(frei, balance, id)).toEqual([
      { kind: 'lease', label: `Pacht kaufen (${money(terms.bonus)})`, ok: true },
      { kind: 'option', label: `Option kaufen (${money(terms.optionFee)})`, ok: true },
    ]);
  });

  it('auf einer Bohrung mit Status decision: tiefer bohren oder aufgeben', () => {
    const state = mitBohrung('decision');
    const id = state.wells[0].parcelId;
    const actions = parcelActions(state, balance, id);
    expect(kinds(actions)).toEqual(['deeper', 'abandon']);
    expect(actions[0].label).toBe(`Tiefer bohren (${money(stageCost(balance, 2))})`);
    expect(actions.every((a) => a.ok)).toBe(true);
  });

  it('klemmt das Werkzeug: bergen oder aufgeben', () => {
    const state = mitBohrung('stuck');
    const id = state.wells[0].parcelId;
    expect(parcelActions(state, balance, id)).toEqual([
      { kind: 'fish', label: 'Fischen', ok: true },
      { kind: 'abandon', label: 'Aufgeben', ok: true },
    ]);
  });

  it('eine laufende oder abgeschlossene Bohrung lässt keine Aktion zu (Ranch mit nur einem Bohrplatz) – außer der Pumpe an einer Quelle', () => {
    for (const status of ['drilling', 'found', 'dry'] as WellStatus[]) {
      const roh = mitBohrung(status, status === 'found' ? GEFUNDEN : {});
      const id = roh.wells[0].parcelId;
      const state = { ...roh, parcels: roh.parcels.map((p) => (p.id === id ? { ...p, slots: 1 } : p)) };
      const pumpe = { kind: 'pump', label: `Pumpe nachrüsten (${balance.production.pump.cost.toLocaleString('de-DE')} $)`, ok: true };
      expect(parcelActions(state, balance, id)).toEqual(status === 'found' ? [pumpe] : []);
      // Mit Pumpe bleibt nichts mehr zu tun.
      const gepumpt = { ...state, wells: state.wells.map((w) => ({ ...w, pump: true })) };
      expect(parcelActions(gepumpt, balance, id)).toEqual([]);
    }
  });

  it('weitere Bohrlöcher (0.2.15+5): nur auf fündigem Land und solange Bohrplätze frei sind', () => {
    const roh = mitBohrung('found', GEFUNDEN);
    const id = roh.wells[0].parcelId;
    const mitPlaetzen = (slots: number) => ({ ...roh, parcels: roh.parcels.map((p) => (p.id === id ? { ...p, slots } : p)) });
    const kosten = balance.drilling.stages[0].cost.toLocaleString('de-DE');
    const tiefe = balance.drilling.stages[0].depth;
    const ohnePumpe = (s: GameState) => parcelActions(s, balance, id).filter((a) => a.kind !== 'pump');
    expect(ohnePumpe(mitPlaetzen(3))).toEqual([
      { kind: 'drill', label: `Weiteres Bohrloch (${kosten} $, direkt auf ${tiefe} m, noch 2 frei)`, ok: true },
    ]);
    expect(ohnePumpe(mitPlaetzen(1))).toEqual([]);
    // Trocken gebohrt: kein weiteres Loch, auch wenn Platz wäre.
    const trocken = mitBohrung('dry');
    const tid = trocken.wells[0].parcelId;
    expect(parcelActions({ ...trocken, parcels: trocken.parcels.map((p) => (p.id === tid ? { ...p, slots: 3 } : p)) }, balance, tid)).toEqual([]);
  });

  it('eine unbekannte Parzelle bleibt ohne Aktion', () => {
    const state = newGame('schreibtisch', balance);
    expect(parcelActions(state, balance, 'gibtsnicht')).toEqual([]);
  });

  it('gesperrte Knöpfe sagen, woran es liegt: Geld oder Turm (0.2.15+11)', () => {
    const state = newGame('schreibtisch', balance);
    const id = state.options[0].parcelId;
    const pacht = ok(exerciseOption(state, balance, id));
    const [arm] = parcelActions({ ...pacht, cash: 0 }, balance, id);
    expect(arm.reasonKind).toBe('money');
    // Turm schon im Einsatz: Geld hilft nicht – der Weg führt zur Bohrturm-Akte.
    const zweite = state.parcels.find((p) => !p.discovery && p.id !== id && !state.options.some((o) => o.parcelId === p.id))!;
    const reich = { ...pacht, cash: 100000 };
    const beide = ok(buyLease(ok(startDrilling(reich, sicher, id)), balance, zweite.id));
    const [bohren] = parcelActions(beide, balance, zweite.id);
    expect(bohren.ok).toBe(false);
    expect(bohren.reasonKind).toBe('rig');
    // Was geht, hat keinen Grund.
    expect(parcelActions(reich, balance, id)[0].reasonKind).toBeUndefined();
  });
});

describe('Warum kein Bohren-Knopf (drillBlocker, 0.2.15+11)', () => {
  it('trocken aufgegeben: weitere Löcher erst auf fündigem Land', () => {
    const roh = mitBohrung('dry');
    const id = roh.wells[0].parcelId;
    const state = { ...roh, parcels: roh.parcels.map((p) => (p.id === id ? { ...p, slots: 3 } : p)) };
    expect(drillBlocker(state, balance, id)).toMatch(/erst, wenn .* Öl gefunden/);
  });

  it('der Turm bohrt hier schon: mit Restlaufzeit', () => {
    const state = mitBohrung('drilling', { roundsLeft: 2 });
    expect(drillBlocker(state, balance, state.wells[0].parcelId)).toMatch(/bohrt der Turm schon – fertig in 2 Runden/);
  });

  it('alle Plätze belegt; und kein Grund, wenn es einen Knopf gibt oder eine Entscheidung wartet', () => {
    const roh = mitBohrung('found', GEFUNDEN);
    const id = roh.wells[0].parcelId;
    const mit = (slots: number) => ({ ...roh, parcels: roh.parcels.map((p) => (p.id === id ? { ...p, slots } : p)) });
    expect(drillBlocker(mit(1), balance, id)).toMatch(/Bohrplätze .* belegt/);
    expect(drillBlocker(mit(3), balance, id)).toBeNull();
    const wartet = mitBohrung('decision');
    expect(drillBlocker(wartet, balance, wartet.wells[0].parcelId)).toBeNull();
    const frisch = mitPacht('blocker');
    expect(drillBlocker(frisch, balance, frisch.leases[0].parcelId)).toBeNull();
  });
});

describe('Eine Aktion ausführen (applyAction)', () => {
  const state = mitPacht('ausfuehren');
  const id = state.leases[0].parcelId;

  it('jede Aktion macht genau das, was die passende Simulationsfunktion macht', () => {
    expect(applyAction(state, balance, id, 'drill')).toEqual(startDrilling(state, balance, id));
    expect(applyAction(state, balance, id, 'deeper')).toEqual(drillDeeper(state, balance, id));
    expect(applyAction(state, balance, id, 'fish')).toEqual(fishWell(state, balance, id));
    expect(applyAction(state, balance, id, 'abandon')).toEqual(abandonWell(state, balance, id));
  });

  it('Pacht, Option und Einlösen auf derselben freien Parzelle', () => {
    const state = newGame('ausfuehren-frei', balance);
    const frei = state.options[0].parcelId;
    expect(applyAction(state, balance, frei, 'lease')).toEqual(buyLease(state, balance, frei));
    expect(applyAction(state, balance, frei, 'option')).toEqual(buyOption(state, balance, frei));
    expect(applyAction(state, balance, frei, 'exercise')).toEqual(exerciseOption(state, balance, frei));
  });

  it('eine nicht mögliche Aktion ändert nichts und nennt den Grund', () => {
    const ergebnis = applyAction(state, balance, id, 'fish');
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.ok ? '' : ergebnis.reason).toMatch(/Bohrung/);
  });

  it('der Zustand vor der Aktion bleibt unangetastet', () => {
    const kopie = structuredClone(state);
    applyAction(state, balance, id, 'drill');
    expect(state).toEqual(kopie);
  });
});

describe('Der nächste Schritt (nextStep)', () => {
  it('ist das Kapitel vorbei, gibt es keinen Schritt', () => {
    expect(nextStep({ ...newGame('zuende', balance), finished: true }, balance)).toBeNull();
  });

  it('wartet eine Bohrung auf eine Entscheidung, nennt sie und hebt sie hervor', () => {
    for (const status of ['decision', 'stuck'] as WellStatus[]) {
      const state = mitBohrung(status, {}, `warten-${status}`);
      const id = state.wells[0].parcelId;
      expect(nextStep(state, balance)).toEqual({
        text: `Auf ${label(state, id)} wartet die Bohrung auf deine Entscheidung.`,
        parcelIds: [id],
      });
    }
  });

  it('warten zwei Bohrungen, nennt er beide und hebt beide hervor', () => {
    const state = mitBohrung('decision', {}, 'zwei-warten');
    const zweite = state.parcels.find((p) => !p.discovery && p.id !== state.wells[0].parcelId)!;
    const beide: GameState = {
      ...state,
      wells: [...state.wells, { ...state.wells[0], parcelId: zweite.id }],
    };
    const schritt = nextStep(beide, balance)!;
    expect(schritt.text).toBe(
      `Auf ${label(state, state.wells[0].parcelId)} und ${label(state, zweite.id)} wartet die Bohrung auf deine Entscheidung.`,
    );
    expect(schritt.parcelIds).toEqual([state.wells[0].parcelId, zweite.id]);
  });

  it('bohrt der Turm, hilft nur das Rundenende', () => {
    expect(nextStep(mitBohrung('drilling'), balance)).toEqual({
      text: 'Der Turm bohrt. Beende die Runde, um weiterzukommen.',
      parcelIds: [],
    });
  });

  it('eine ungebohrte Pacht, die es hergibt: bohren', () => {
    const state = mitPacht('bereit');
    const id = state.leases[0].parcelId;
    expect(nextStep(state, balance)).toEqual({
      text: `Deine Pacht auf ${label(state, id)} ist bereit: Ranch anklicken und „Bohren“ wählen.`,
      parcelIds: [id],
    });
  });

  it('eine Pacht, für die das Geld fehlt, ist kein Schritt', () => {
    const arm = { ...mitPacht('arm'), cash: 0, options: [] };
    expect(nextStep(arm, balance)).toEqual({ text: 'Beende die Runde.', parcelIds: [] });
  });

  it('eine Option, die das Geld nicht hergibt, ist kein Schritt', () => {
    const state = newGame('teure-option', balance);
    // Statt der kostenlosen Startoptionen zwei bezahlte mit gesichertem Bonus.
    const teuer = { ...state, options: state.options.map((o) => ({ ...o, bonus: 5000 })) };
    expect(nextStep({ ...teuer, cash: 0 }, balance)).toEqual({ text: 'Beende die Runde.', parcelIds: [] });
  });

  it('im neuen Spiel: die Startoptionen einlösen, dann bohren', () => {
    const state = newGame('startoption', balance);
    const orte = state.options.map((o) => label(state, o.parcelId));
    expect(nextStep(state, balance)).toEqual({
      text: `Du hast Optionen auf ${orte[0]} und ${orte[1]}: Ranch anklicken und „Option einlösen“ wählen, dann bohren.`,
      parcelIds: state.options.map((o) => o.parcelId),
    });
    expect(nextStep({ ...state, options: state.options.slice(0, 1) }, balance)).toEqual({
      text: `Du hast eine Option auf ${orte[0]}: Ranch anklicken und „Option einlösen“ wählen, dann bohren.`,
      parcelIds: [state.options[0].parcelId],
    });
  });

  it('mehrere bereite Pachten werden alle genannt', () => {
    const state = mitPacht('zwei-pachten');
    const zweite = state.parcels.find((p) => !p.discovery && p.id !== state.leases[0].parcelId)!;
    const orte = [label(state, state.leases[0].parcelId), label(state, zweite.id)];
    const mitZweiter: GameState = {
      ...state,
      leases: [...state.leases, { ...state.leases[0], parcelId: zweite.id }],
    };
    expect(nextStep(mitZweiter, balance)).toEqual({
      text: `Deine Pachten auf ${orte[0]} und ${orte[1]} sind bereit: Ranch anklicken und „Bohren“ wählen.`,
      parcelIds: [state.leases[0].parcelId, zweite.id],
    });
  });

  it('ohne Pacht und ohne Option: erst pachten', () => {
    const state = newGame('nichts', balance);
    expect(nextStep({ ...state, leases: [], options: [] }, balance)).toEqual({
      text: 'Pachte eine Ranch auf der Karte, dann kannst du bohren.',
      parcelIds: [],
    });
  });

  it('Pachten und Optionen der Konkurrenz zählen nicht als eigenes Land', () => {
    const state = mitPacht('fremd');
    const fremd: GameState = {
      ...state,
      leases: state.leases.map((l) => ({ ...l, holder: 'rival' as never })),
      options: state.options.map((o) => ({ ...o, holder: 'rival' as never })),
    };
    expect(nextStep(fremd, balance)).toEqual({
      text: 'Pachte eine Ranch auf der Karte, dann kannst du bohren.',
      parcelIds: [],
    });
  });

  it('liegt Öl im Tank, geht der Verkauf vor', () => {
    const state = mitBohrung('found', GEFUNDEN, 'verkauf');
    expect(nextStep({ ...state, options: [], oilStock: 400 }, balance)).toEqual({
      text: 'Öl im Tank: unter „Tank & Verkauf“ verkaufen.',
      parcelIds: [],
    });
  });

  it('sonst bleibt nur: Runde beenden', () => {
    const state = mitBohrung('found', GEFUNDEN, 'warten');
    expect(nextStep({ ...state, options: [], oilStock: 0 }, balance)).toEqual({
      text: 'Beende die Runde.',
      parcelIds: [],
    });
  });

  it('die erste passende Regel gewinnt: eine wartende Bohrung schlägt die Pacht', () => {
    const wartend = mitBohrung('decision', {}, 'schlag');
    const zweite = wartend.parcels.find((p) => !p.discovery && p.id !== wartend.wells[0].parcelId)!;
    const zustand: GameState = {
      ...wartend,
      leases: [
        ...wartend.leases,
        { parcelId: zweite.id, holder: 'jacob', bonus: 0, royalty: 0, startRound: 1, expiresAfterRound: 9, drilled: false },
      ],
    };
    expect(nextStep(zustand, balance)!.parcelIds).toEqual([wartend.wells[0].parcelId]);
  });
});

describe('Die Quellenliste (sourceRows)', () => {
  /** Drei pachtbare Parzellen für die Bohrungen. */
  function drei(state: GameState): string[] {
    return state.parcels.filter((p) => !p.discovery).slice(0, 3).map((p) => p.id);
  }

  it('gefundene Quellen zuerst, dann die Bohrungen, zuletzt die trockenen', () => {
    const state = newGame('quellen', balance);
    const [trocken, laufend, quelle] = drei(state);
    const wells: Well[] = [
      { id: `${trocken}#1`, parcelId: trocken, stage: 1, status: 'dry', roundsLeft: 0, spent: 1500, oilStage: null, startRound: 1 },
      { id: `${laufend}#1`, parcelId: laufend, stage: 1, status: 'drilling', roundsLeft: 2, spent: 1500, oilStage: 2, startRound: 3 },
      { id: `${quelle}#1`, parcelId: quelle, stage: 1, roundsLeft: 0, spent: 1500, oilStage: 1, startRound: 5, ...GEFUNDEN } as Well,
    ];
    expect(sourceRows({ ...state, wells }).map((r) => r.status)).toEqual(['found', 'drilling', 'dry']);
  });

  it('innerhalb einer Gruppe kommt die ältere Bohrung zuerst', () => {
    const state = newGame('quellen-alt', balance);
    const [erste, zweite] = drei(state);
    const wells: Well[] = [
      { id: `${zweite}#1`, parcelId: zweite, stage: 1, status: 'drilling', roundsLeft: 1, spent: 1500, oilStage: 2, startRound: 4 },
      { id: `${erste}#1`, parcelId: erste, stage: 1, status: 'drilling', roundsLeft: 1, spent: 1500, oilStage: 2, startRound: 2 },
    ];
    expect(sourceRows({ ...state, wells }).map((r) => r.parcelId)).toEqual([erste, zweite]);
  });

  it('jede Zeile sagt, was los ist, und wie viel die Quelle gebracht hat', () => {
    const state = newGame('quellen-text', balance);
    const [erste, zweite, dritte, vierte] = drei(state).concat(state.parcels.filter((p) => !p.discovery)[3].id);
    const wells: Well[] = [
      { id: `${erste}#1`, parcelId: erste, stage: 1, status: 'drilling', roundsLeft: 1, spent: 1500, oilStage: 2, startRound: 1 },
      { id: `${zweite}#1`, parcelId: zweite, stage: 2, status: 'drilling', roundsLeft: 3, spent: 3900, oilStage: 3, startRound: 2 },
      { id: `${dritte}#1`, parcelId: dritte, stage: 1, status: 'decision', roundsLeft: 0, spent: 1500, oilStage: 2, startRound: 3 },
      { id: `${vierte}#1`, parcelId: vierte, stage: 1, status: 'stuck', roundsLeft: 0, spent: 1500, oilStage: 2, startRound: 4 },
    ];
    const rows = sourceRows({ ...state, wells });
    expect(rows.map((r) => r.text)).toEqual([
      'bohrt, fertig in 1 Runde',
      'bohrt, fertig in 3 Runden',
      'trocken – tiefer?',
      'Werkzeug klemmt',
    ]);
    expect(rows.map((r) => r.lastRate)).toEqual([0, 0, 0, 0]);
    expect(rows.map((r) => r.total)).toEqual([0, 0, 0, 0]);

    const mitQuelle = sourceRows({ ...state, wells: [{ ...wells[0], ...GEFUNDEN }] });
    expect(mitQuelle[0]).toMatchObject({ text: 'fördert', lastRate: 800, total: 1800 });
    expect(sourceRows({ ...state, wells: [{ ...wells[0], status: 'dry' }] })[0]).toMatchObject({
      text: 'trocken',
      lastRate: 0,
      total: 0,
    });
  });

  it('die Zeile nennt die Parzelle so, wie sie auf der Karte heißt', () => {
    const state = newGame('quellen-label', balance);
    const parcel = state.parcels[0];
    const rows = sourceRows({
      ...state,
      wells: [{ id: `${parcel.id}#1`, parcelId: parcel.id, stage: 1, status: 'dry', roundsLeft: 0, spent: 1500, oilStage: null, startRound: 1 }],
    });
    expect(rows[0].label).toBe(parcel.name);
    expect(rows[0].parcelId).toBe(parcel.id);
  });

  it('ohne Bohrunge ist die Liste leer', () => {
    expect(sourceRows(newGame('leer', balance))).toEqual([]);
  });
});

describe('Das Protokoll der Runde (roundLog)', () => {
  it('im neuen Spiel ist das ganze Startprotokoll die Runde', () => {
    const state = newGame('protokoll', balance);
    expect(state.roundLogStart).toBe(0);
    expect(roundLog(state)).toEqual(state.log);
    expect(roundLog(state).length).toBeGreaterThan(0);
  });

  it('nach dem Rundenende beginnt es mit dem ersten Eintrag der Abrechnung', () => {
    const state = mitBohrung('drilling', { roundsLeft: 1 }, 'abrechnung');
    const vorher = state.log.length;
    const nachher = endRound(state, sicher);
    expect(nachher.roundLogStart).toBe(vorher);
    expect(roundLog(nachher)[0]).toBe(nachher.log[vorher]);
    expect(roundLog(nachher)[0]).toMatch(/ist in 300 m trocken/);
    expect(roundLog(nachher)).not.toContain(state.log[0]);
  });

  it('eine Aktion in der Runde hängt hinten an', () => {
    const state = newGame('kredit', balance);
    const vorher = roundLog(state);
    const geliehen = ok(takeLoan(state, balance, 500));
    expect(roundLog(geliehen)).toEqual([...vorher, geliehen.log.at(-1)!]);
    expect(roundLog(geliehen).at(-1)).toMatch(/500 \$ bei der Bank geliehen/);
  });

  it('die Runde danach zeigt nur, was seitdem passiert ist', () => {
    const state = endRound(newGame('sauber', balance), balance);
    expect(roundLog(state)).not.toEqual([]);
    const gekauft = ok(buyLease(state, balance, state.parcels.find((p) => !p.discovery && !state.options.some((o) => o.parcelId === p.id))!.id));
    expect(roundLog(gekauft)).toHaveLength(roundLog(state).length + 1);
    expect(roundLog(gekauft).at(-1)).toMatch(/Pacht auf .* abgeschlossen/);
  });

  it('auch bei Pleite gilt der Schnitt: das Protokoll der Runde bleibt sichtbar', () => {
    const state: GameState = {
      ...newGame('pleite-protokoll', balance),
      cash: -500,
      rating: 'D',
      loans: [
        { id: 1, source: 'bank', principal: 3000, rate: 0.15, takenRound: 1, collateral: null },
        {
          id: 2,
          source: 'lender',
          principal: balance.credit.emergency.limit,
          rate: balance.credit.emergency.rate,
          takenRound: 1,
          collateral: null,
        },
      ],
    };
    // Die erste Runde setzt die Frist, die folgenden verstreichen sie.
    let lauf = endRound(state, balance);
    expect(lauf.ending).toBeNull();
    for (let i = 0; i < balance.bankruptcy.graceRounds; i++) lauf = endRound(lauf, balance);
    expect(lauf.ending).toBe('pleite');
    expect(lauf.roundLogStart).toBeGreaterThan(0);
    expect(roundLog(lauf)).toEqual(lauf.log.slice(lauf.roundLogStart));
    expect(roundLog(lauf).at(-1)).toMatch(/pleite/);
  });
});

describe('Fertig-Kriterium 1.11: jemand ohne Erklärung fängt eine Bohrung an', () => {
  it('in höchstens zwei Schritten aus dem Hinweis heraus – über 20 Welten', () => {
    for (let i = 0; i < 20; i++) {
      let state = newGame(`schreibtisch-${i}`, balance);
      let aktionen = 0;

      for (let schritt = 0; schritt < 5 && !state.wells.some((w) => w.status === 'drilling'); schritt++) {
        const hinweis = nextStep(state, balance);
        expect(hinweis, `Seed ${i}, Schritt ${schritt}: kein Hinweis`).not.toBeNull();
        const parzelle = hinweis!.parcelIds[0];
        // Der Hinweis meint keine Parzelle: dann hilft nur die nächste Runde.
        if (parzelle === undefined) break;

        // Nur, was der Hinweis vorgeschlagen hat: eine andere Aktion wurde nie gebraucht.
        const moeglich = parcelActions(state, balance, parzelle).filter((a) => a.ok);
        expect(moeglich.length, `Seed ${i}: auf ${parzelle} ging nichts`).toBeGreaterThan(0);

        const ergebnis = applyAction(state, balance, parzelle, moeglich[0].kind);
        expect(ergebnis.ok, `Seed ${i}: ${ergebnis.ok ? '' : ergebnis.reason}`).toBe(true);
        state = ok(ergebnis);
        aktionen++;
      }

      expect(aktionen, `Seed ${i}: zu viele Schritte`).toBeLessThanOrEqual(2);
      expect(state.wells.some((w) => w.status === 'drilling'), `Seed ${i}: kein Bohrturm`).toBe(true);
    }
  });
});