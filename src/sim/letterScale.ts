// Briefe mit Gewicht (Spielspaß-Durchgang, Kapitel 1): Die Geldbeträge in den Antworten der Ereignisse
// wachsen mit Jacobs Geschäft. Ein Brief über 120 $ ist zu Beginn viel Geld, zur Kapitelmitte aber egal –
// darum rechnet die Simulation jeden Betrag mit einem Faktor hoch:
//
//   Faktor = Erlös je Runde ÷ events.scale.ref, mindestens 1, höchstens events.scale.max
//   Erlös je Runde = Förderung der letzten Runde ohne Förderzins-Öl × Ø Posted Price der letzten Runden
//
// Der Faktor hängt nur an abgeschlossenen Runden (lastRate, priceHistory) und bleibt so die ganze Runde
// über gleich: Was der Schreibtisch zeigt, ist genau das, was die Antwort kostet. Er gilt nur in Kapitel 1
// (Kapitel 2/3 haben eigene Beträge) und nicht für Antworten mit fixedCash (echte feste Preise, Kredite
// mit fester Rückzahlung, Tausch Öl gegen Geld). Skaliert werden cash und die Geldbedingung minCash der
// Antwort, nicht die Bedingungen ganzer Ereignisse.
//
// Texte zeigen den echten Betrag über Platzhalter: {cash} in label und result einer Antwort, {cash:wahl}
// im Text des Ereignisses (Betrag der Antwort „wahl“). fillCash setzt den Betrag ein.

import type { Balance } from './balance';
import { chapterOf } from './chapterOf';
import type { EventChoice, EventDef } from './events';
import type { GameState } from './game';
import type { Lang } from './i18n';
import { leaseOf } from './lease';

type Lage = Pick<GameState, 'wells' | 'leases' | 'priceHistory' | 'postedPrice'> & Partial<Pick<GameState, 'chapter'>>;

/** Erlös je Runde in $: Förderung der letzten Runde (ohne Förderzins-Öl) × Ø Posted Price der letzten Runden. */
export function roundRevenue(state: Lage, balance: Balance): number {
  const barrel = state.wells.reduce((sum, w) => {
    if (w.status !== 'found' || !w.production) return sum;
    return sum + w.production.lastRate * (1 - (leaseOf(state, w.parcelId)?.royalty ?? 0));
  }, 0);
  if (barrel <= 0) return 0;
  const preise = state.priceHistory.slice(-balance.events.scale.rounds);
  const preis = preise.length > 0 ? preise.reduce((a, b) => a + b, 0) / preise.length : state.postedPrice;
  return barrel * preis;
}

/** Faktor für die Geldbeträge der Ereignisse: in Kapitel 1 Erlös ÷ ref zwischen 1 und max, sonst 1. */
export function letterScale(state: Lage, balance: Balance): number {
  if (chapterOf(state) !== 1) return 1;
  const { ref, max } = balance.events.scale;
  return Math.min(max, Math.max(1, roundRevenue(state, balance) / ref));
}

/** Betrag hochrechnen und glatt runden: unter 1.000 $ auf 10 $, unter 10.000 $ auf 50 $, darüber auf 100 $. */
export function scaleAmount(amount: number, factor: number): number {
  if (factor === 1 || amount === 0) return amount;
  const roh = Math.abs(amount) * factor;
  const schritt = roh < 1000 ? 10 : roh < 10000 ? 50 : 100;
  return Math.sign(amount) * Math.round(roh / schritt) * schritt;
}

/** Die Antwort, wie sie jetzt gilt: cash und minCash mit dem Faktor, außer bei fixedCash. */
export function scaleChoice(state: Lage, balance: Balance | undefined, choice: EventChoice): EventChoice {
  if (!balance || choice.fixedCash || (choice.effects.cash === undefined && choice.requires.minCash === undefined)) return choice;
  const f = letterScale(state, balance);
  if (f === 1) return choice;
  const effects = choice.effects.cash === undefined ? choice.effects : { ...choice.effects, cash: scaleAmount(choice.effects.cash, f) };
  const requires = choice.requires.minCash === undefined ? choice.requires : { ...choice.requires, minCash: scaleAmount(choice.requires.minCash, f) };
  return { ...choice, effects, requires };
}

/** Geld, das eine Antwort jetzt bewegt (undefined = kein cash-Effekt). */
export function scaledCash(state: Lage, balance: Balance | undefined, choice: EventChoice): number | undefined {
  return scaleChoice(state, balance, choice).effects.cash;
}

/** Betrag für Texte: „1.200 $“ (deutsch) bzw. „1,200 $“ (englisch), ohne Vorzeichen. */
export function cashText(amount: number, lang: Lang): string {
  return `${Math.abs(amount).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE')} $`;
}

/**
 * Platzhalter füllen: {cash} = Betrag der Antwort choice, {cash:wahl} = Betrag der Antwort „wahl“ des
 * Ereignisses. Unbekannte Platzhalter bleiben stehen (check:content meldet sie).
 */
export function fillCash(text: string, state: Lage, balance: Balance | undefined, event: Pick<EventDef, 'choices'>, choice: EventChoice | undefined, lang: Lang): string {
  if (!text.includes('{cash')) return text;
  return text.replace(/\{cash(?::([a-z0-9_]+))?\}/g, (ganz, id: string | undefined) => {
    const c = id === undefined ? choice : event.choices.find((x) => x.id === id);
    const betrag = c ? scaledCash(state, balance, c) : undefined;
    return betrag === undefined ? ganz : cashText(betrag, lang);
  });
}

/** Alle Platzhalter in einem Text, die auf keine Antwort mit cash zeigen – für check:content. */
export function brokenCashPlaceholders(text: string, event: Pick<EventDef, 'choices'>, choice: EventChoice | undefined): string[] {
  return [...text.matchAll(/\{cash(?::([a-z0-9_]+))?\}/g)]
    .filter((m) => {
      const c = m[1] === undefined ? choice : event.choices.find((x) => x.id === m[1]);
      return c?.effects.cash === undefined;
    })
    .map((m) => m[0]);
}
