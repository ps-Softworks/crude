// Bot-Läufe für Zeitsprung I (4.5): Der Standard-Bot (ausgewogen) spielt Kapitel 1; jedes
// Kapitelende springt mit allen neun Direktiven (Haltung × Familie), einmal mit den ersten und
// einmal mit den zweiten Weichen-Antworten (18 Sprünge je Seed). Gemessen wird, ob die Haltung
// Ertrag und Streuung bestimmt und ob Familienzeit Wachstum kostet (GDD §2), dazu die Bankpanik-
// Weiche sauber (nur diese Antwort wechselt): Verlust- und Pleitequote „weiter auf Pump“ gegen
// „zurückzahlen“ (GDD §15). Nur Kennzahlen, keine Zielwerte – die Zahlen klären sich mit Kapitel 2.

import { FAMILY_TIMES, STANCES, type Balance, type FamilyTime, type Stance } from './balance';
import { playGame } from './bots';
import { canGoPublic, decideIpo } from './chapter';
import { debt } from './credit';
import { empireValue } from './empire';
import type { EventDef } from './events';
import type { GameState } from './game';
import { answerSwitch, roundFlow, runTimeskip, startTimeskip, SWITCH_CHOICES, type Directives, type SwitchId, type TimeskipRecord } from './timeskip';

export interface JumpOutcome {
  value: number;
  bankrupt: boolean;
  record: TimeskipRecord;
  state: GameState;
}

/**
 * Springt von einem Kapitelende mit Direktiven; Weichen nach answer – ist die Antwort zu teuer
 * (gesperrt), nimmt der Bot die andere. Vorher entscheidet er sich gegen die Aktiengesellschaft.
 */
export function jumpWith(end: GameState, balance: Balance, directives: Directives, answer: (id: SwitchId) => string, catalog: readonly EventDef[] = []): JumpOutcome {
  let s = end;
  if (canGoPublic(s, balance) && s.ipo === null) {
    const ipo = decideIpo(s, balance, 0);
    if (ipo.ok) s = ipo.state;
  }
  const start = startTimeskip(s, balance, directives);
  if (!start.ok) throw new Error(start.reason);
  s = start.state;
  for (let i = 0; i < 12; i++) {
    const step = runTimeskip(s, balance, catalog);
    if (step.status === 'done') return { value: empireValue(step.state, balance), bankrupt: step.state.ending === 'pleite', record: step.record, state: step.state };
    const wahl = answer(step.id);
    let a = answerSwitch(s, balance, step.id, wahl, catalog);
    if (!a.ok) a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id].find((c) => c !== wahl)!, catalog);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('jumpWith: zu viele Weichen.');
}

export interface StanceRow {
  stance: Stance;
  jumps: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** Ø Schulden nach dem Sprung. */
  debt: number;
  bankrupt: number;
  /** Anteil der Sprünge mit Kreditkündigung bzw. Notverkauf. */
  crisisCall: number;
  fireSale: number;
  /** Anteil der Sprünge mit erschlossenem Nachbarbezirk. */
  expanded: number;
  /** 0.4.20+2: Ø Kasse nach dem Sprung und Median der Förderung je Runde nachher ÷ vorher (pleite zählt 0). */
  cash: number;
  flow: number;
}

export interface FamilyRow {
  family: FamilyTime;
  mean: number;
  /** Ø Beziehung zu Ruth am Ende, Anteil mit Clara. */
  ruth: number;
  clara: number;
}

export interface PanicRow {
  stance: Stance;
  /** Seeds, in denen die Bankpanik-Weiche kam. */
  seeds: number;
  /** Ø Wert „weiter auf Pump“ minus „zurückzahlen“. */
  meanDiff: number;
  /** Anteil, in dem „weiter auf Pump“ weniger wert ist. */
  rideWorse: number;
  rideBankrupt: number;
  repayBankrupt: number;
  rideFireSale: number;
  repayFireSale: number;
}

export interface TimeskipBotReport {
  ends: number;
  stances: StanceRow[];
  family: FamilyRow[];
  panic: PanicRow[];
}

function quantil(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function schnitt(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

const hat = (r: TimeskipRecord, kind: TimeskipRecord['entries'][number]['kind']) => r.entries.some((e) => e.kind === kind);

/** Kapitelenden des Standard-Bots (Seeds wie npm run bots), bis ends Stück beisammen sind. */
export function chapterEnds(balance: Balance, ends: number, catalog: readonly EventDef[] = []): GameState[] {
  const out: GameState[] = [];
  for (let i = 0; out.length < ends && i < ends * 4; i++) {
    const g = playGame(`${balance.bots.seedPrefix}-${i}`, balance, 'ausgewogen', catalog);
    if (g.state.ending === 'kapitel') out.push(g.state);
  }
  return out;
}

export function runTimeskipBots(balance: Balance, ends: number, catalog: readonly EventDef[] = []): TimeskipBotReport {
  const kapitelenden = chapterEnds(balance, ends, catalog);
  const alle: { d: Directives; o: JumpOutcome; flow: number }[] = [];
  for (const end of kapitelenden) {
    const vorher = Math.max(1, roundFlow(end));
    for (const stance of STANCES)
      for (const family of FAMILY_TIMES)
        for (const i of [0, 1]) {
          const o = jumpWith(end, balance, { stance, family }, (id) => SWITCH_CHOICES[id][i], catalog);
          alle.push({ d: { stance, family }, o, flow: o.bankrupt ? 0 : roundFlow(o.state) / vorher });
        }
  }
  const stances = STANCES.map((stance): StanceRow => {
    const zeilen = alle.filter((x) => x.d.stance === stance);
    const xs = zeilen.map((x) => x.o);
    const v = xs.map((o) => o.value);
    return {
      stance,
      jumps: xs.length,
      mean: schnitt(v),
      p10: quantil(v, 0.1),
      p50: quantil(v, 0.5),
      p90: quantil(v, 0.9),
      debt: schnitt(xs.map((o) => debt(o.state))),
      bankrupt: schnitt(xs.map((o) => (o.bankrupt ? 1 : 0))),
      crisisCall: schnitt(xs.map((o) => (hat(o.record, 'crisis_call') ? 1 : 0))),
      fireSale: schnitt(xs.map((o) => (hat(o.record, 'fire_sale') ? 1 : 0))),
      expanded: schnitt(xs.map((o) => (hat(o.record, 'region_opened') ? 1 : 0))),
      cash: schnitt(xs.map((o) => (o.bankrupt ? 0 : o.state.cash))),
      flow: quantil(zeilen.map((x) => x.flow), 0.5),
    };
  });
  const family = FAMILY_TIMES.map((f): FamilyRow => {
    const xs = alle.filter((x) => x.d.family === f).map((x) => x.o);
    return {
      family: f,
      mean: schnitt(xs.map((o) => o.value)),
      ruth: schnitt(xs.map((o) => o.state.family.ruth)),
      clara: schnitt(xs.map((o) => ((o.state.family.claraBorn ?? 0) > 0 ? 1 : 0))),
    };
  });
  // Bankpanik sauber: nur diese Antwort wechselt, die übrigen Weichen bekommen die zweite Antwort.
  const panic = (['aggressive', 'balanced'] as const).map((stance): PanicRow => {
    const diffs: number[] = [];
    let rideBankrupt = 0;
    let repayBankrupt = 0;
    let rideFire = 0;
    let repayFire = 0;
    for (const end of kapitelenden) {
      const mit = (c: string) => (id: SwitchId) => (id === 'bank_panic' ? c : SWITCH_CHOICES[id][1]);
      const ride = jumpWith(end, balance, { stance, family: 'some' }, mit('ride'), catalog);
      if (!ride.record.switches.includes('bank_panic')) continue;
      const repay = jumpWith(end, balance, { stance, family: 'some' }, mit('repay'), catalog);
      diffs.push(ride.value - repay.value);
      if (ride.bankrupt) rideBankrupt++;
      if (repay.bankrupt) repayBankrupt++;
      if (hat(ride.record, 'fire_sale')) rideFire++;
      if (hat(repay.record, 'fire_sale')) repayFire++;
    }
    const n = Math.max(1, diffs.length);
    return {
      stance,
      seeds: diffs.length,
      meanDiff: schnitt(diffs),
      rideWorse: diffs.filter((d) => d < 0).length / n,
      rideBankrupt: rideBankrupt / n,
      repayBankrupt: repayBankrupt / n,
      rideFireSale: rideFire / n,
      repayFireSale: repayFire / n,
    };
  });
  return { ends: kapitelenden.length, stances, family, panic };
}

const geld = (x: number) => `${Math.round(x).toLocaleString('de-DE')} $`;
const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const HALTUNG: Record<Stance, string> = { aggressive: 'wagemutig', balanced: 'ausgewogen', cautious: 'vorsichtig' };
const FAMILIE: Record<FamilyTime, string> = { little: 'die Firma zuerst', some: 'wie bisher', much: 'viel Zeit zu Hause' };

/** Die drei Tabellen für die Konsole und docs/botlaeufe.md. */
export function timeskipTables(r: TimeskipBotReport): string {
  const haltung = [
    '| Haltung | Sprünge | Ø Imperium | p10 | Median | p90 | Ø Kasse | Förderung nachher ÷ vorher (Median) | Ø Schulden | pleite | Kreditkündigung | Notverkauf | Nachbarbezirk |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...r.stances.map(
      (s) =>
        `| ${HALTUNG[s.stance]} | ${s.jumps} | ${geld(s.mean)} | ${geld(s.p10)} | ${geld(s.p50)} | ${geld(s.p90)} | ${geld(s.cash)} | ${s.flow.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} | ${geld(s.debt)} | ${prozent(s.bankrupt)} | ${prozent(s.crisisCall)} | ${prozent(s.fireSale)} | ${prozent(s.expanded)} |`,
    ),
  ];
  const familie = [
    '| Familie | Ø Imperium | Ø Ruth | mit Clara |',
    '| --- | ---: | ---: | ---: |',
    ...r.family.map((f) => `| ${FAMILIE[f.family]} | ${geld(f.mean)} | ${Math.round(f.ruth)} | ${prozent(f.clara)} |`),
  ];
  const panik = [
    '| Haltung | Seeds mit Bankpanik-Weiche | Ø Pump − Tilgen | Pump schlechter | pleite Pump / Tilgen | Notverkauf Pump / Tilgen |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...r.panic.map(
      (p) =>
        `| ${HALTUNG[p.stance]} | ${p.seeds} | ${geld(p.meanDiff)} | ${prozent(p.rideWorse)} | ${prozent(p.rideBankrupt)} / ${prozent(p.repayBankrupt)} | ${prozent(p.rideFireSale)} / ${prozent(p.repayFireSale)} |`,
    ),
  ];
  return `${haltung.join('\n')}\n\n${familie.join('\n')}\n\n${panik.join('\n')}`;
}
