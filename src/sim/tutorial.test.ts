import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hintTurn, playByHints } from './bots';
import { headroom, takeLoan } from './credit';
import { applyAction } from './desk';
import { stageCost, type Well, type WellStatus } from './drilling';
import { endRound, newGame, type GameState } from './game';
import { leaseTerms, parcelLabel, type Lease } from './lease';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { capacityLeft, netPrice } from './transport';
import { knowledgeOf } from './exploration';
import {
  fillVars,
  parseTutorialContent,
  recommendedParcel,
  recommendScore,
  shownChance,
  TUTORIAL_HINT_IDS,
  tutorialActive,
  tutorialHint,
  viewTutorial,
  type TutorialHint,
} from './tutorial';

const balance = loadBalance();
const text = readFileSync(new URL('../../content/tutorial.yaml', import.meta.url), 'utf8');

function ok(result: { ok: true; state: GameState } | { ok: false; reason: string }): GameState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Alle Termine der Runde belegt – ein Ritt ginge nur noch mit Überstunden. */
function ohneZeit(state: GameState): GameState {
  return { ...state, agenda: { ...state.agenda, used: state.agenda.budget } };
}

function hint(state: GameState): TutorialHint {
  const h = tutorialHint(state, balance);
  if (!h) throw new Error('Kein Hinweis');
  return h;
}

/** Spiel mit einer eigenen, ungebohrten Pacht auf der ersten pachtbaren Parzelle. */
function mitPacht(seed = 'einstieg', cash = 100000): GameState {
  const state = { ...newGame(seed, balance), cash };
  const parcel = state.parcels.find((p) => !p.discovery && !state.options.some((o) => o.parcelId === p.id))!;
  const lease: Lease = { parcelId: parcel.id, holder: 'jacob', bonus: 150, royalty: 0.1, startRound: 1, expiresAfterRound: 4, drilled: false };
  return { ...state, leases: [lease] };
}

/** Dazu eine Bohrung im gewünschten Zustand. */
function mitBohrung(status: WellStatus, patch: Partial<Well> = {}, cash = 100000): GameState {
  const state = mitPacht('einstieg', cash);
  const parcelId = state.leases[0].parcelId;
  const well: Well = { id: `${parcelId}#1`, parcelId, stage: 1, status, roundsLeft: 1, spent: 1000, oilStage: 2, startRound: 1, ...patch };
  return { ...state, wells: [well], leases: state.leases.map((l) => ({ ...l, drilled: true })) };
}

/** Die Prognose einer Parzelle auf eine feste Bandbreite setzen. */
function prognose(state: GameState, parcelId: string, low: number, high: number): GameState {
  return { ...state, forecasts: { ...state.forecasts, [parcelId]: { parcelId, low, high, center: (low + high) / 2 } } };
}

describe('Inhalte des Einstiegs (content/tutorial.yaml)', () => {
  it('liefert alle Hinweise, alle Schritte und Deutsch überall', () => {
    const { content, errors } = parseTutorialContent('content/tutorial.yaml', text);
    expect(errors).toEqual([]);
    for (const id of TUTORIAL_HINT_IDS) expect(content!.hints[id].de.trim()).not.toBe('');
    expect(content!.steps.lease.de).toBe('Pacht');
  });

  it('meldet fehlende Hinweise und unbekannte Platzhalter mit Datei', () => {
    const kaputt = text.replace(/ {2}sold:\n(.*\n){2}/, '').replace('Option auf {ort} –', 'Option auf {parzelle} –');
    const { content, errors } = parseTutorialContent('t.yaml', kaputt);
    expect(content).toBeNull();
    expect(errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(['hints.sold fehlt.', expect.stringMatching(/unbekannter Platzhalter \{parzelle\}/)]),
    );
    expect(errors.every((e) => e.file === 't.yaml')).toBe(true);
  });

  it('setzt Platzhalter ein und nummeriert die Schritte', () => {
    const { content } = parseTutorialContent('content/tutorial.yaml', text);
    const state = newGame('einstieg', balance);
    const view = viewTutorial(hint(state), content!);
    expect(view).toMatchObject({ title: 'Einstieg', stepNumber: 1, stepCount: 3, stepLabel: 'Pacht' });
    expect(view.text).not.toMatch(/\{\w+\}/);
    expect(fillVars('Parzelle {ort}, {fremd}', { ort: '3/5' })).toBe('Parzelle 3/5, {fremd}');
  });
});

describe('Wann der Einstieg läuft (tutorialActive)', () => {
  it('am Anfang ja, nach der letzten Tutorial-Runde und nach dem Kapitel nicht mehr', () => {
    const state = newGame('einstieg', balance);
    expect(tutorialActive(state, balance)).toBe(true);
    expect(tutorialActive({ ...state, round: balance.tutorial.lastRound }, balance)).toBe(true);
    expect(tutorialActive({ ...state, round: balance.tutorial.lastRound + 1 }, balance)).toBe(false);
    expect(tutorialActive({ ...state, finished: true }, balance)).toBe(false);
    expect(tutorialHint({ ...state, finished: true }, balance)).toBeNull();
  });

  it('endet, wenn die erste Quelle so lange gefördert hat, dass schon eine Verkaufsrunde war', () => {
    const n = balance.tutorial.endAfterProducedRounds;
    const quelle = (roundsProduced: number) =>
      mitBohrung('found', { result: 'small', production: { initialRate: 1000, roundsProduced, lastRate: 900, total: 900 } });
    expect(tutorialActive(quelle(n - 1), balance)).toBe(true);
    expect(tutorialActive(quelle(n), balance)).toBe(false);
  });

  it('ändert den Zustand nicht und würfelt nicht', () => {
    const state = newGame('einstieg', balance);
    const kopie = structuredClone(state);
    tutorialHint(state, balance);
    expect(state).toEqual(kopie);
  });
});

describe('Schritt 1: Pacht', () => {
  it('Etappe 1: sieht nichts Bezahlbares gut aus, rät er erst zum Ritt übers Land – ohne Überstunden', () => {
    const state = newGame('einstieg', balance);
    const ziel = recommendedParcel(state, balance);
    expect(ziel === null || shownChance(state, ziel.parcelId) < balance.tutorial.exploreBelow).toBe(true);
    const h = hint(state);
    expect(h).toMatchObject({ id: 'explore', step: 'lease', action: { kind: 'plan', cardId: 'ritt' } });
    if (h.action.kind !== 'plan') throw new Error('kein Ritt');
    expect(h.parcelIds).toEqual([h.action.parcelId]);
    const geritten = hintTurn(state, balance, 1);
    expect(geritten.knowledge[h.action.parcelId].level).toBeGreaterThanOrEqual(1);
    expect(geritten.agenda.used).toBe(balance.plans.cards.ritt.appointments);
    // Ist die Runde schon voll, rät er nicht zu Überstunden, sondern zur Pacht.
    expect(hint(ohneZeit(state)).id).not.toBe('explore');
  });

  it('empfiehlt die beste bezahlbare Wertung (Schätzung minus Pachtkosten) und zeigt auf sie', () => {
    const state = ohneZeit(newGame('einstieg', balance));
    const h = hint(state);
    expect(h.step).toBe('lease');
    expect(['lease_option', 'lease_buy']).toContain(h.id);
    const ziel = recommendedParcel(state, balance)!;
    expect(h.parcelIds).toEqual([ziel.parcelId]);
    expect(h.action).toEqual({ kind: ziel.kind, parcelId: ziel.parcelId });
    // Keine bezahlbare Parzelle hat eine bessere Wertung.
    const drill = stageCost(balance, 1);
    for (const p of state.parcels) {
      if (p.discovery || state.leases.some((l) => l.parcelId === p.id) || state.options.some((o) => o.parcelId === p.id)) continue;
      const bonus = leaseTerms(state, balance, p.id).bonus;
      if (bonus + drill <= state.cash) {
        expect(recommendScore(state, balance, p.id, bonus)).toBeLessThanOrEqual(recommendScore(state, balance, ziel.parcelId, ziel.cost));
      }
    }
  });

  it('nimmt die kostenlose Startoption, wenn der Geologe sie am besten findet', () => {
    let state = newGame('einstieg', balance);
    const option = state.options[0].parcelId;
    state = prognose(state, option, 99, 100);
    const h = hint(state);
    expect(h).toMatchObject({ id: 'lease_option', action: { kind: 'exercise', parcelId: option } });
    expect(h.vars.chance).toBe('99–100 % Fundchance');
    expect(h.vars.ort).toBe(parcelLabel(state.parcels.find((p) => p.id === option)!));
    // 0.4.19+2: Der Text sagt, woher die Zahl stammt – ohne Ritt kein „der Geologe schätzt“.
    const text = parseTutorialContent('content/tutorial.yaml', readFileSync(new URL('../../content/tutorial.yaml', import.meta.url), 'utf8')).content!;
    const wissen = knowledgeOf(state, option).level;
    const erwartet = ['nach dem, was man sich erzählt', 'nach deinem eigenen Ritt', 'nach der Karte des Geologen', 'nach dem Bohrbericht'][wissen];
    expect(viewTutorial(h, text).text).toContain(erwartet);
    expect(viewTutorial(h, text).text).not.toContain('Geologe schätzt');
  });

  it('Frühes Öl: eine teure Pacht, die kaum besser aussieht, verliert gegen eine billige', () => {
    let state: GameState = { ...newGame('einstieg', balance), options: [] };
    const drill = stageCost(balance, 1);
    const frei = state.parcels.filter((p) => !p.discovery && leaseTerms(state, balance, p.id).bonus + drill <= state.cash);
    const nachBonus = [...frei].sort((a, b) => leaseTerms(state, balance, a.id).bonus - leaseTerms(state, balance, b.id).bonus);
    const billig = nachBonus[0];
    const teuer = nachBonus[nachBonus.length - 1];
    const differenz = leaseTerms(state, balance, teuer.id).bonus - leaseTerms(state, balance, billig.id).bonus;
    expect(differenz).toBeGreaterThan(balance.tutorial.dollarsPerPoint * 10);
    // Alle anderen schlecht, die teure 5 Punkte besser als die billige.
    state = { ...state, forecasts: Object.fromEntries(Object.entries(state.forecasts).map(([id, f]) => [id, { ...f, low: 0, high: 5 }])) };
    state = prognose(prognose(state, billig.id, 60, 70), teuer.id, 65, 75);
    expect(recommendedParcel(state, balance)!.parcelId).toBe(billig.id);
    // Sieht die teure um mehr als ihren Aufpreis besser aus, lohnt sie sich.
    const punkte = Math.ceil(differenz / balance.tutorial.dollarsPerPoint / 5) * 5 + 5;
    state = prognose(prognose(state, billig.id, 0, 10), teuer.id, Math.min(95, punkte), Math.min(100, punkte + 5));
    expect(recommendedParcel(state, balance)!.parcelId).toBe(punkte <= 95 ? teuer.id : billig.id);
  });

  it('eine Parzelle, deren Pacht die Bohrung unbezahlbar macht, wird nicht empfohlen', () => {
    let state = newGame('einstieg', balance);
    const teuer = state.parcels.find((p) => !p.discovery && leaseTerms(state, balance, p.id).bonus > state.cash - stageCost(balance, 1))!;
    state = prognose(state, teuer.id, 99, 100);
    expect(recommendedParcel(state, balance)!.parcelId).not.toBe(teuer.id);
  });

  it('ohne Geld rät er zu einem Kredit, aufgerundet und mindestens so groß wie der kleinste Bankkredit', () => {
    const state = ohneZeit({ ...newGame('einstieg', balance), cash: 0, options: [] });
    const h = hint(state);
    expect(h.id).toBe('loan_lease');
    if (h.action.kind !== 'loan') throw new Error('kein Kredit');
    expect(h.action.amount).toBeGreaterThanOrEqual(balance.credit.minLoan);
    expect(h.action.amount % balance.tutorial.loanRounding).toBe(0);
    const geliehen = ok(takeLoan(state, balance, h.action.amount));
    // Mit dem Kredit geht die empfohlene Pacht samt Bohrung.
    expect(hint(geliehen).action).toMatchObject({ kind: 'lease', parcelId: h.parcelIds[0] });
  });

  it('gibt auch die Bank nichts mehr, bleibt nur die Runde', () => {
    const state = { ...newGame('einstieg', balance), cash: 0, options: [] };
    const voll = ok(takeLoan(state, balance, headroom(state, balance)));
    expect(hint({ ...voll, cash: 0 })).toMatchObject({ id: 'lease_none', action: { kind: 'endRound' } });
  });
});

describe('Schritt 2: Bohrung', () => {
  it('eine eigene Pacht: bohren', () => {
    const state = mitPacht();
    const id = state.leases[0].parcelId;
    expect(hint(state)).toMatchObject({ id: 'drill', step: 'drill', action: { kind: 'drill', parcelId: id }, parcelIds: [id] });
  });

  it('fehlt das Geld für die Bohrung: Kredit', () => {
    const state = mitPacht('einstieg', 100);
    expect(hint(state)).toMatchObject({ id: 'loan_drill', action: { kind: 'loan' } });
  });

  it('der Turm bohrt: Runde beenden', () => {
    expect(hint(mitBohrung('drilling'))).toMatchObject({ id: 'drill_wait', action: { kind: 'endRound' } });
  });

  it('trocken in dieser Stufe: tiefer nur bei guter Schätzung, sonst aufgeben', () => {
    const state = mitBohrung('decision');
    const id = state.wells[0].parcelId;
    const min = balance.tutorial.deeperMinChance;
    expect(hint(prognose(state, id, min, min))).toMatchObject({ id: 'deeper', action: { kind: 'deeper', parcelId: id } });
    expect(hint(prognose(state, id, min - 10, min - 2))).toMatchObject({ id: 'abandon', action: { kind: 'abandon', parcelId: id } });
    // Ohne Geld für die nächste Stufe: aufgeben.
    expect(hint({ ...prognose(state, id, 90, 100), cash: 0 }).id).toBe('abandon');
  });

  it('in der letzten Stufe geht es nicht tiefer', () => {
    const state = mitBohrung('decision', { stage: balance.drilling.stages.length });
    expect(hint(prognose(state, state.wells[0].parcelId, 90, 100)).id).toBe('abandon');
  });

  it('klemmendes Werkzeug: fischen, wenn das Geld reicht, sonst aufgeben', () => {
    expect(hint(mitBohrung('stuck')).action.kind).toBe('fish');
    expect(hint(mitBohrung('stuck', {}, 0))).toMatchObject({ id: 'fish_abandon', action: { kind: 'abandon' } });
  });

  it('Öl gefunden, noch nichts im Tank: Runde beenden', () => {
    const state = mitBohrung('found', { result: 'small', production: { initialRate: 1000, roundsProduced: 0, lastRate: 0, total: 0 } });
    expect(hint(state)).toMatchObject({ id: 'found_wait', step: 'drill', action: { kind: 'endRound' } });
  });
});

describe('Schritt 3: Verkauf', () => {
  const quelle = mitBohrung('found', { result: 'small', production: { initialRate: 1000, roundsProduced: 1, lastRate: 1000, total: 1000 } });

  it('Öl im Tank: verkaufen, über den Weg mit dem besten Nettopreis', () => {
    const state = { ...quelle, oilStock: 1000 };
    const h = hint(state);
    expect(h.id).toBe('sell');
    if (h.action.kind !== 'sell') throw new Error('kein Verkauf');
    const besterPreis = Math.max(...(['wagon', 'rail'] as const).map((m) => netPrice(state, balance, m)));
    expect(netPrice(state, balance, h.action.mode)).toBe(besterPreis);
    expect(h.action.barrels).toBe(Math.min(1000, capacityLeft(state, balance, h.action.mode)));
    expect(h.vars.weg).toBe(balance.transport[h.action.mode].label);
  });

  it('nach dem Verkauf: geschafft, Runde beenden', () => {
    const state = { ...quelle, oilStock: 0, shipped: { wagon: 0, rail: 500, teams: 0, pipeline: 0 } };
    expect(hint(state)).toMatchObject({ id: 'sold', step: 'sell', action: { kind: 'endRound' } });
  });
});

describe('Ein Bot, der nur den Hinweisen folgt (Fertig-Kriterium 2.13)', () => {
  it('führt jede Empfehlung erfolgreich aus – kein Hinweis zeigt auf eine Aktion, die nicht geht', () => {
    for (let i = 0; i < 40; i++) {
      let state = newGame(`schritt-${i}`, balance);
      while (!state.finished && tutorialHint(state, balance)) {
        for (let n = 0; n < 20; n++) {
          const h = tutorialHint(state, balance);
          if (!h || h.action.kind === 'endRound') break;
          const a = h.action;
          const r =
            a.kind === 'sell' || a.kind === 'loan' || a.kind === 'plan'
              ? hintTurn(state, balance, 1)
              : ok(applyAction(state, balance, a.parcelId, a.kind));
          expect(r).not.toBe(state);
          state = r;
        }
        state = endRound(state, balance);
      }
    }
  });

  it('findet in den meisten Seeds eine Quelle – und verkauft dann auch', () => {
    const n = 150;
    const spiele = Array.from({ length: n }, (_, i) => playByHints(`einstieg-${i}`, balance));
    const gefunden = spiele.filter((s) => s.found).length / n;
    expect(gefunden).toBeGreaterThanOrEqual(0.75);
    expect(spiele.filter((s) => s.found && !s.sold).length).toBe(0);
    // In den ersten drei Runden schafft es ein guter Teil schon.
    expect(spiele.filter((s) => s.foundRound !== null && s.foundRound <= 3).length / n).toBeGreaterThan(0.4);
    expect(spiele.some((s) => s.state.ending === 'pleite')).toBe(false);
  });

  it('Frühes Öl: wer nur dem Einstieg folgt, hat in mindestens 90 % der Seeds bis Runde 6 eine Quelle', () => {
    const n = 200;
    const bisSechs = Array.from({ length: n }, (_, i) => playByHints(`frueh-${i}`, balance)).filter(
      (s) => s.foundRound !== null && s.foundRound <= 6,
    ).length;
    expect(bisSechs / n).toBeGreaterThanOrEqual(0.9);
  }, 60_000);

  it('auch mit allen Ereignissen aus content/events', () => {
    const events = loadEvents();
    const n = 60;
    const gefunden = Array.from({ length: n }, (_, i) => playByHints(`einstieg-ev-${i}`, balance, events)).filter((s) => s.found).length;
    expect(gefunden / n).toBeGreaterThanOrEqual(0.7);
  });

  it('ist deterministisch', () => {
    expect(playByHints('gleich', balance).state).toEqual(playByHints('gleich', balance).state);
  });
});
