// B3 „Ein Feuer in der Nacht“ (src/sim/feuer.ts): Eskalationsstufe, Warnungen, Deeskalation, Ende, alte Stände.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BalanceError, type Balance } from './balance';
import { openChapterSystems } from './chapterSystems';
import { resolveEvent } from './events';
import {
  attackChance,
  deescalationSteps,
  escalationLevel,
  feuerView,
  FEUER_MARKS,
  parseFeuerBalance,
  parseFeuerContent,
  settleFeuer,
} from './feuer';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame } from './save';
import { STAFF_MARKS } from './staff';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { RIVAL_MARKS } from './trust';

const balance = loadBalance();
const catalog = loadEvents();

function mit(patch: (f: Balance['feuer']) => Balance['feuer']): Balance {
  return { ...balance, feuer: patch(balance.feuer) };
}
/** Anschlag sicher, sobald er möglich ist. */
const sicher = mit((f) => ({ ...f, attack: { ...f.attack, chance: 1 } }));

function marken(s: GameState, m: Record<string, number>): GameState {
  return { ...s, events: { ...s.events, marks: { ...s.events.marks, ...m } } };
}

function start(m: Record<string, number> = {}, round = 10): GameState {
  return marken({ ...newGame('feuer', balance), round, cash: 50000 }, m);
}

describe('Eskalationsstufe (GDD §9.5)', () => {
  it('ohne Fehde und Verrat 0, Fehde 2, Verrat 3', () => {
    expect(escalationLevel(start(), balance)).toBe(0);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardPact]: 2 }), balance)).toBe(0);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardFeud]: 2 }), balance)).toBe(2);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardBetrayed]: 5 }), balance)).toBe(3);
  });

  it('Gegendrohung und Sabotage heben die Stufe, höchstens auf 4', () => {
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardFeud]: 2, [FEUER_MARKS.counterThreat]: 4 }), balance)).toBe(3);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.counterThreat]: 4 }), balance)).toBe(4);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardBetrayed]: 2, [STAFF_MARKS.sabotaged]: 4, [FEUER_MARKS.counterThreat]: 5 }), balance)).toBe(4);
  });

  it('Stufe 3 schwelt nach festerRounds Runden ohne Versöhnung zu Stufe 4', () => {
    const r = 6;
    const s = start({ [RIVAL_MARKS.bullardBetrayed]: 3, [FEUER_MARKS.threat]: r }, r + balance.feuer.festerRounds - 1);
    expect(escalationLevel(s, balance)).toBe(3);
    expect(escalationLevel({ ...s, round: r + balance.feuer.festerRounds }, balance)).toBe(4);
  });

  it('Versöhnung senkt die Stufe und deckelt sie bei 3 – auch die Versöhnung aus der Diplomatie', () => {
    const boese = { [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.counterThreat]: 4, [STAFF_MARKS.sabotaged]: 5 };
    expect(escalationLevel(start({ ...boese, [FEUER_MARKS.reconciled]: 6 }), balance)).toBe(3);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.reconciled]: 6 }), balance)).toBe(1);
    expect(escalationLevel(start({ [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.reconciledK2]: 6 }), balance)).toBe(1);
  });

  it('ab Kapitel 2 zählt Bullards Groll aus der Diplomatie', () => {
    const k2 = openChapterSystems({ ...newGame('feuer-k2', balance), chapter: 2, chapterStart: 41, round: 45 }, balance, {});
    expect(k2.diplomacy).toBeDefined();
    const groll = (g: number): GameState => ({ ...k2, diplomacy: { ...k2.diplomacy!, relations: { ...k2.diplomacy!.relations, bullard: { trust: 0, grudge: g } } } });
    const [g1, g2, g3] = balance.feuer.levels.grudge;
    expect(escalationLevel(groll(g1 - 1), balance)).toBe(0);
    expect(escalationLevel(groll(g1), balance)).toBe(1);
    expect(escalationLevel(groll(g2), balance)).toBe(2);
    expect(escalationLevel(groll(g3), balance)).toBe(3);
  });
});

describe('Warnungen vor dem Anschlag', () => {
  it('Stufe 3 setzt den Drohbrief, kein Anschlag', () => {
    const s = settleFeuer(start({ [RIVAL_MARKS.bullardBetrayed]: 3 }), sicher);
    expect(s.events.marks[FEUER_MARKS.threat]).toBe(10);
    expect(s.finished).toBe(false);
    expect(attackChance(s, sicher)).toBe(0);
  });

  it('Stufe 4: erst Ruths Bitte, dann graceRounds Runden Schonfrist, dann der Anschlag', () => {
    let s = start({ [RIVAL_MARKS.bullardBetrayed]: 3, [FEUER_MARKS.threat]: 4, [FEUER_MARKS.counterThreat]: 5 }, 10);
    s = settleFeuer(s, sicher);
    expect(s.events.marks[FEUER_MARKS.violence]).toBe(10);
    expect(s.finished).toBe(false);
    for (let r = 11; r < 10 + balance.feuer.graceRounds; r++) {
      s = settleFeuer({ ...s, round: r }, sicher);
      expect(s.finished).toBe(false);
    }
    const ende = settleFeuer({ ...s, round: 10 + balance.feuer.graceRounds }, sicher);
    expect(ende.finished).toBe(true);
    expect(ende.ending).toBe('feuer');
    expect(ende.log.at(-1)).toContain('brennen');
  });

  it('im echten Spiel kommen Drohbrief und Ruth als Ereignisse, bevor es brennt', () => {
    // Verrat in Runde 3, Bullard verliert sofort die Geduld (festerRounds 1), Anschlag sicher.
    const schnell = mit((f) => ({ ...f, festerRounds: 1, attack: { ...f.attack, chance: 1 } }));
    let s = marken({ ...newGame('feuer-spiel', schnell), cash: 100000 }, { [RIVAL_MARKS.bullardBetrayed]: 1 });
    const gesehen: string[] = [];
    for (let i = 0; i < 20 && !s.finished; i++) {
      gesehen.push(...s.events.pending.filter((id) => id.startsWith('feuer_')));
      s = endRound(s, schnell, catalog);
    }
    expect(s.ending).toBe('feuer');
    expect(gesehen).toContain('feuer_drohbrief');
    expect(gesehen).toContain('feuer_ruth');
    expect(gesehen.indexOf('feuer_drohbrief')).toBeLessThan(gesehen.indexOf('feuer_ruth'));
  });

  it('wer Bullard nie verrät oder bedroht, erlebt weder Drohbrief noch Feuer', () => {
    let s: GameState = { ...newGame('feuer-ruhig', sicher), cash: 100000 };
    s = marken(s, { [RIVAL_MARKS.bullardFeud]: 1 });
    while (!s.finished) s = endRound(s, sicher, catalog);
    expect(s.ending).not.toBe('feuer');
    expect(s.events.marks[FEUER_MARKS.threat]).toBeUndefined();
  });
});

describe('Deeskalation', () => {
  it('Versöhnung auf den Drohbrief: Stufe sinkt, nie ein Anschlag', () => {
    let s = settleFeuer(start({ [RIVAL_MARKS.bullardBetrayed]: 3 }), sicher);
    s = endRound(s, sicher, catalog);
    expect(s.events.pending).toContain('feuer_drohbrief');
    const r = resolveEvent(s, sicher, catalog, 'feuer_drohbrief', 'versoehnen');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(escalationLevel(r.state, sicher)).toBe(1);
    let t = r.state;
    for (let i = 0; i < 25 && !t.finished; i++) t = endRound(t, sicher, catalog);
    expect(t.ending).not.toBe('feuer');
  });

  it('Nachtwache und Sheriff-Wache senken die Chance; die Nachtwache kostet Lohn', () => {
    const vier = { [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.counterThreat]: 3, [FEUER_MARKS.threat]: 3, [FEUER_MARKS.violence]: 4 };
    const s = start(vier, 10);
    const b = balance.feuer;
    expect(attackChance(s, balance)).toBeCloseTo(b.attack.chance);
    const wache = start({ ...vier, [FEUER_MARKS.guard]: 5 }, 10);
    expect(attackChance(wache, balance)).toBeCloseTo(b.attack.chance * b.attack.guardFactor);
    const sheriff: GameState = { ...s, deals: { ...s.deals!, guardRound: 10 } };
    expect(attackChance(sheriff, balance)).toBeCloseTo(b.attack.chance * b.attack.guardFactor);
    const nachher = settleFeuer(wache, mit((f) => ({ ...f, attack: { ...f.attack, chance: 0 } })));
    expect(nachher.cash).toBe(wache.cash - b.guard.costPerRound);
  });

  it('Bots: Versöhnung und Wache beruhigen, Gegendrohung nicht', () => {
    const s = start({ [RIVAL_MARKS.bullardBetrayed]: 3, [FEUER_MARKS.threat]: 9 });
    expect(deescalationSteps(s, balance, [FEUER_MARKS.reconciled])).toBe(balance.feuer.reconcile);
    expect(deescalationSteps(s, balance, [FEUER_MARKS.guard])).toBe(1);
    expect(deescalationSteps(s, balance, [FEUER_MARKS.counterThreat])).toBe(-1);
    expect(deescalationSteps(s, balance, [FEUER_MARKS.familyAway])).toBe(0);
  });
});

describe('Ende und Texte', () => {
  const text = readFileSync(new URL('../../content/feuer.yaml', import.meta.url), 'utf8');
  const { content, errors } = parseFeuerContent('content/feuer.yaml', text);

  it('content/feuer.yaml ist vollständig (de/en)', () => {
    expect(errors).toEqual([]);
    expect(content).not.toBeNull();
  });

  it('Text je Kapitel; „Was aus ihnen wurde“ hängt an Thomas und an der fortgeschickten Familie', () => {
    const s = start();
    const k1 = feuerView(s, content!);
    expect(k1.text).toBe(content!.text.k1.de);
    expect(k1.fates).toEqual([content!.fate.ruth.de, content!.fate.company.de]);
    const geboren = { ...s, family: { ...s.family, thomasBorn: 4 } };
    expect(feuerView({ ...geboren, chapter: 3 }, content!).text).toBe(content!.text.k3.de);
    const fort = feuerView(marken(geboren, { [FEUER_MARKS.familyAway]: 8 }), content!);
    expect(fort.fates).toEqual([content!.fate.ruthAway.de, content!.fate.thomasAway.de, content!.fate.company.de]);
    expect(feuerView({ ...geboren, chapter: 2 }, content!, 'en').text).toBe(content!.text.k2.en);
  });

  it('fehlende Texte sind Fehler', () => {
    expect(parseFeuerContent('x.yaml', 'title: { de: A }\n').errors.length).toBeGreaterThan(0);
  });

  it('Balance wird geprüft', () => {
    expect(() => parseFeuerBalance({})).toThrow(BalanceError);
    expect(() => parseFeuerBalance({ feuer: { ...balance.feuer, levels: { grudge: [60, 40, 20] } } })).toThrow(BalanceError);
  });
});

describe('Spielstand', () => {
  it('das Ende „feuer“ übersteht Speichern und Laden', () => {
    const ende = settleFeuer(start({ [RIVAL_MARKS.bullardBetrayed]: 2, [FEUER_MARKS.counterThreat]: 3, [FEUER_MARKS.threat]: 3, [FEUER_MARKS.violence]: 4 }), sicher);
    expect(ende.ending).toBe('feuer');
    const r = deserializeGame(serializeGame(ende, 'test'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.ending).toBe('feuer');
  });

  it('alte Stände ohne Feuer-Merkzeichen laden mit Stufe 0 und ohne neues Feld', () => {
    const r = deserializeGame(serializeGame(start(), 'test'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(escalationLevel(r.state, balance)).toBe(0);
    expect(attackChance(r.state, balance)).toBe(0);
  });
});
