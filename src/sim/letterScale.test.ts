// Briefe mit Gewicht (Spielspaß-Durchgang, Kapitel 1): Geld in Ereignis-Antworten wächst mit Jacobs Geschäft.
import { describe, expect, it } from 'vitest';
import { choiceValue, eventPolicy } from './bots';
import { parseEventFile } from './eventContent';
import { relevanceScale, relevanceThreshold, immediateImpact } from './eventRelevance';
import { autoResolve, choiceReason, deskEvents, resolveEvent, type EventChoice, type EventDef } from './events';
import { newGame, type GameState } from './game';
import { brokenCashPlaceholders, cashText, fillCash, letterScale, roundRevenue, scaleAmount, scaleChoice, scaledCash } from './letterScale';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const { ref, max, rounds } = balance.events.scale;

const t = (de: string, en = '') => ({ de, en });
function wahl(id: string, extra: Partial<EventChoice> = {}): EventChoice {
  return { id, label: t(id), result: t(`Ergebnis ${id}`), requires: {}, effects: {}, default: false, marks: [], ...extra };
}
function ereignis(id: string, choices: EventChoice[], extra: Partial<EventDef> = {}): EventDef {
  return { id, title: t(`Titel ${id}`), text: t('Text'), conditions: {}, marked: [], notMarked: [], delay: 1, chance: 1, once: true, routine: false, appointments: 1, choices, ...extra };
}

/** Partie mit einer Quelle, die letzte Runde `rate` Barrel gefördert hat, und festem Preis. */
function mitErloes(rate: number, preis = 1, royalty = 0): GameState {
  const state = newGame('briefgewicht', balance);
  const p = state.parcels[0];
  const lease = { parcelId: p.id, royalty, bonus: 0, round: 1 } as unknown as GameState['leases'][number];
  const well = {
    id: `${p.id}#1`,
    parcelId: p.id,
    stage: 1,
    status: 'found' as const,
    roundsLeft: 0,
    spent: 1000,
    oilStage: 1,
    result: 'small' as const,
    production: { initialRate: rate, roundsProduced: 1, lastRate: rate, total: rate },
    startRound: 1,
  };
  return { ...state, round: 6, wells: [well], leases: [lease], priceHistory: Array(rounds + 2).fill(preis), postedPrice: preis, cash: 100_000 };
}

/** Partie mit genau diesem Faktor (Erlös = Faktor × ref bei Preis 1). */
const mitFaktor = (f: number) => mitErloes(f * ref);

describe('Briefe mit Gewicht: Faktor', () => {
  it('Erlös je Runde = Förderung der letzten Runde ohne Förderzins-Öl × Ø Preis der letzten rounds Runden', () => {
    const s = mitErloes(2000, 1, 0.25);
    expect(roundRevenue(s, balance)).toBeCloseTo(1500, 6);
    // Nur die letzten rounds Preise zählen, ältere nicht.
    const preise = [...Array(5).fill(9), ...Array(rounds).fill(2)];
    expect(roundRevenue({ ...s, priceHistory: preise }, balance)).toBeCloseTo(3000, 6);
    // Trockene oder noch bohrende Löcher zählen nicht.
    expect(roundRevenue({ ...s, wells: s.wells.map((w) => ({ ...w, status: 'dry' as const })) }, balance)).toBe(0);
  });

  it('Faktor = Erlös ÷ ref, mindestens 1, höchstens max', () => {
    expect(letterScale(newGame('leer', balance), balance)).toBe(1);
    expect(letterScale(mitErloes(ref / 2), balance)).toBe(1);
    expect(letterScale(mitErloes(ref * 3), balance)).toBeCloseTo(Math.min(max, 3), 6);
    expect(letterScale(mitErloes(ref * (max + 10)), balance)).toBe(max);
  });

  it('nur in Kapitel 1 – danach haben die Ereignisse eigene Beträge (Faktor 1)', () => {
    expect(letterScale({ ...mitFaktor(3), chapter: 2 }, balance)).toBe(1);
    expect(letterScale({ ...mitFaktor(3), chapter: 3 }, balance)).toBe(1);
  });

  it('Beträge werden glatt gerundet und behalten ihr Vorzeichen', () => {
    expect(scaleAmount(120, 1)).toBe(120);
    expect(scaleAmount(-123, 2)).toBe(-250);
    expect(scaleAmount(150, 2.53)).toBe(380);
    expect(scaleAmount(400, 6.4)).toBe(2550);
    expect(scaleAmount(-1500, 7.77)).toBe(-11700);
    expect(scaleAmount(0, 5)).toBe(0);
  });
});

describe('Briefe mit Gewicht: Antworten', () => {
  const zahlen = wahl('zahlen', { label: t('Zahlen ({cash})', 'Pay ({cash})'), result: t('Weg sind {cash}.'), requires: { minCash: 200 }, effects: { cash: -200, strength: 3 } });
  const fest = wahl('fest', { requires: { minCash: 200 }, effects: { cash: -200 }, fixedCash: true });
  const nimm = wahl('nimm', { effects: { cash: 300 }, default: true });
  const ev = ereignis('test_brief', [zahlen, fest, nimm], { text: t('Er will {cash:zahlen} oder {cash:fest}.', 'He wants {cash:zahlen}.') });

  it('cash und minCash wachsen mit dem Faktor, fixedCash nicht, andere Effekte bleiben', () => {
    const s = mitFaktor(3);
    const f = letterScale(s, balance);
    const neu = scaleChoice(s, balance, zahlen);
    expect(neu.effects.cash).toBe(scaleAmount(-200, f));
    expect(neu.requires.minCash).toBe(scaleAmount(200, f));
    expect(neu.effects.strength).toBe(3);
    expect(scaleChoice(s, balance, fest)).toBe(fest);
    expect(scaledCash(s, balance, nimm)).toBe(scaleAmount(300, f));
    // Ohne Spielzahlen (alte Aufrufe) bleibt alles, wie es dasteht.
    expect(scaleChoice(s, undefined, zahlen)).toBe(zahlen);
  });

  it('Platzhalter: {cash} in Antworten, {cash:wahl} im Text, Zahlen je Sprache', () => {
    const s = mitFaktor(5);
    const betrag = Math.abs(scaledCash(s, balance, zahlen)!);
    expect(fillCash('Zahlen ({cash})', s, balance, ev, zahlen, 'de')).toBe(`Zahlen (${betrag.toLocaleString('de-DE')} $)`);
    expect(fillCash('Er will {cash:zahlen} oder {cash:fest}.', s, balance, ev, undefined, 'de')).toBe(`Er will ${betrag.toLocaleString('de-DE')} $ oder 200 $.`);
    expect(cashText(-12500, 'en')).toBe('12,500 $');
    expect(cashText(12500, 'de')).toBe('12.500 $');
    expect(fillCash('{cash:gibtsnicht} bleibt', s, balance, ev, undefined, 'de')).toBe('{cash:gibtsnicht} bleibt');
    expect(brokenCashPlaceholders('{cash} und {cash:zahlen} und {cash:x}', ev, wahl('ohne'))).toEqual(['{cash}', '{cash:x}']);
  });

  it('Schreibtisch zeigt den echten Betrag, resolveEvent bucht genau ihn ab', () => {
    const s = { ...mitFaktor(4), events: { ...newGame('x', balance).events, pending: ['test_brief'], due: { test_brief: 9 } } };
    const betrag = scaledCash(s, balance, zahlen)!;
    const [d] = deskEvents(s, balance, [ev]);
    expect(d.text).toBe(`Er will ${Math.abs(betrag).toLocaleString('de-DE')} $ oder 200 $.`);
    expect(d.choices[0].label).toBe(`Zahlen (${Math.abs(betrag).toLocaleString('de-DE')} $)`);
    const r = resolveEvent(s, balance, [ev], 'test_brief', 'zahlen');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.cash).toBe(s.cash + betrag);
    expect(r.state.log.at(-1)).toContain(`Weg sind ${Math.abs(betrag).toLocaleString('de-DE')} $.`);
  });

  it('die Geldbedingung gilt mit dem Faktor', () => {
    const s = mitFaktor(4);
    const noetig = scaleAmount(200, letterScale(s, balance));
    expect(choiceReason({ ...s, cash: noetig - 1 }, balance, ev, zahlen)).toContain('Geld');
    expect(choiceReason({ ...s, cash: noetig - 1 }, balance, ev, fest)).toBeNull();
  });

  it('ohne Antwort gilt die Standardwahl ebenfalls mit dem Faktor', () => {
    const s = { ...mitFaktor(4), events: { ...newGame('x', balance).events, pending: ['test_brief'], due: { test_brief: 6 } } };
    const nach = autoResolve(s, [ev], 'de', balance.events.timedRounds, balance);
    expect(nach.cash).toBe(s.cash + scaledCash(s, balance, nimm)!);
  });

  it('Bots rechnen mit dem echten Betrag', () => {
    const policy = eventPolicy(balance, 'ausgewogen');
    const nurGeld = ereignis('geld', [wahl('a', { effects: { cash: 300 } })], { appointments: 0 });
    const s1 = mitFaktor(1);
    const s4 = mitFaktor(4);
    const v1 = choiceValue(s1, balance, nurGeld, nurGeld.choices[0], policy)!;
    const v4 = choiceValue(s4, balance, nurGeld, nurGeld.choices[0], policy)!;
    expect(v1).toBe(300);
    expect(v4).toBe(scaledCash(s4, balance, nurGeld.choices[0]));
    // Kraft und Familie wiegt der Bot im selben Maß wie das Geld.
    const muede = ereignis('muede', [wahl('a', { effects: { strength: -5, ruth: 2 } })], { appointments: 0 });
    const f = letterScale(s4, balance);
    expect(choiceValue(s4, balance, muede, muede.choices[0], policy)).toBeCloseTo((-5 * policy.strength + 2 * policy.family) * f, 6);
  });
});

describe('Briefe mit Gewicht: Inhalte und Prüfung', () => {
  it('fixedCash liest der Ereignis-Leser, kaputte Platzhalter meldet er', () => {
    const gut = parseEventFile('t.yaml', `- id: a\n  title: { de: A, en: "" }\n  text: { de: "Für {cash:x}", en: "" }\n  chance: 1\n  choices:\n    - id: x\n      label: { de: "X ({cash})", en: "" }\n      result: { de: R, en: "" }\n      effects: { cash: -10 }\n      fixedCash: true\n`);
    expect(gut.errors).toEqual([]);
    expect(gut.events[0].choices[0].fixedCash).toBe(true);
    const kaputt = parseEventFile('t.yaml', `- id: a\n  title: { de: A, en: "" }\n  text: { de: "Für {cash:y}", en: "" }\n  chance: 1\n  choices:\n    - id: x\n      label: { de: "X ({cash})", en: "" }\n      result: { de: R, en: "" }\n`);
    expect(kaputt.errors.map((e) => e.message).join(' ')).toMatch(/\{cash:y\}.*keine Wahl/);
    expect(kaputt.errors.map((e) => e.message).join(' ')).toMatch(/\{cash\}.*braucht „cash“/);
  });

  it('Prüfung: Kapitel 1 rechnet Geld, Kraft und Familie mit dem typischen Faktor, spätere Kapitel nicht', () => {
    const k1 = ereignis('k1', [wahl('a', { effects: { cash: -100 } })]);
    const k2 = ereignis('k2', [wahl('a', { effects: { cash: -100 } })], { conditions: { minChapter: 2 } });
    const r = balance.events.relevance;
    expect(relevanceScale(k1, balance)).toBe(r.letterScale);
    expect(relevanceScale(k2, balance)).toBe(1);
    expect(immediateImpact(k1.choices[0], balance, relevanceScale(k1, balance))).toBe(100 * r.letterScale);
    expect(immediateImpact({ ...k1.choices[0], fixedCash: true }, balance, r.letterScale)).toBe(100);
    expect(relevanceThreshold(balance)).toBe(Math.round(r.chapterMoney * r.minShare));
    expect(relevanceThreshold(balance, false)).toBe(Math.round(r.laterChapterMoney * r.minShare));
  });

  it('alle Kapitel-1-Texte mit Geldbetrag nutzen Platzhalter oder fixedCash', () => {
    // Steht der Betrag einer wachsenden Antwort fest im Text, zeigt das Spiel später den falschen Preis.
    const fest: string[] = [];
    for (const e of loadEvents().filter((x) => x.conditions.minChapter === undefined)) {
      for (const c of e.choices) {
        if (c.effects.cash === undefined || c.fixedCash) continue;
        const n = Math.abs(c.effects.cash);
        const muster = new RegExp(`(?<![\\d.,])(${n.toLocaleString('de-DE').replace('.', '\\.')}|${n.toLocaleString('en-US')}) \\$`);
        for (const text of [c.label.de, c.label.en, c.result.de, c.result.en]) if (muster.test(text)) fest.push(`${e.id}/${c.id}: ${text}`);
      }
    }
    expect(fest).toEqual([]);
  });
});
