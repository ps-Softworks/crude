// Zweiter Anlauf (GDD §8/§14: „Optional einmal pro Spiel ‚Zweiter Anlauf‘: Neustart als Wildcatter mit Kontakten und
// Feinden – wie viele echte Ölmänner, die mehrfach pleitegingen“).
//
// Nach dem Ende „Pleite“ (nicht im Zeitsprung) darf Jacob einmal je Spiel im selben Kapitel neu anfangen:
// - Die Zwangsversteigerung nimmt alles: Pachten mit fördernden Quellen ersteigert Bullard (die Quellen fördern für
//   ihn, je Ranch eine Quelle), ungebohrtes Land und Optionen fallen zurück an die Besitzer; eigene Türme, Tanks,
//   Fuhrwerke und Pipeline, Raffinerie, Fernleitungen, Tankstellen, Börsenkonto und Okara-Anteil sind weg.
// - Die Schulden sind mit der Firma untergegangen; Jacob fängt mit secondChance.cash[Kapitel] $ und Silas'
//   geliehenem Turm an, Rating wie zu Spielbeginn.
// - Was bleibt: Welt und Weltmodell, Ruf, Merkzeichen (Feinde, Gefallen), Rivalen-Groll, Familie, Aktienbuch,
//   Personal, Forschung, Hallstead-Kontakte.
// - Die Rundenzahl läuft weiter (nächste Runde). Bleiben weniger als secondChance.minRounds Runden im Kapitel,
//   verlängert sich das Kapitel auf genau so viele – sonst wäre das Kapitelziel nicht mehr erreichbar.
// Merker state.secondChance: einmal genutzt, nie wieder.
import type { Balance } from './balance';
import { newBigPipelines } from './bigPipeline';
import { brandOf } from './brand';
import { formatDate } from './calendar';
import { chapterOf } from './chapterOf';
import { drawEvents, type EventDef } from './events';
import { newExchange } from './exchange';
import { checkBirth } from './family';
import type { GameState } from './game';
import { newLogistics } from './logistics';
import { ringPhone } from './plans';
import { newRefinery } from './refinery';
import type { RivalWell } from './rival';
import { startRigs } from './rigs';

export interface SecondChanceBalance {
  /** Startgeld je Kapitel (Index 0 = Kapitel 1). */
  cash: number[];
  /** So viele Runden bleiben mindestens bis zum Kapitelende (sonst wird verlängert). */
  minRounds: number;
}

/** Warum es keinen zweiten Anlauf gibt – oder null. */
export function secondChanceBlocker(state: GameState): string | null {
  if (state.ending !== 'pleite') return 'Einen zweiten Anlauf gibt es nur nach der Pleite.';
  if (state.secondChance) return 'Den zweiten Anlauf hat Jacob schon gehabt.';
  if (state.timeskips.at(-1)?.bankrupt) return 'Im Zeitsprung gibt es keinen zweiten Anlauf.';
  return null;
}

export function secondChanceCash(state: Pick<GameState, 'chapter'>, balance: Balance): number {
  const liste = balance.secondChance.cash;
  return liste[Math.min(liste.length, chapterOf(state)) - 1];
}

/** Bis zu welcher Runde das Kapitel nach dem Neuanfang läuft. */
export function secondChanceEnd(state: Pick<GameState, 'round' | 'totalRounds'>, balance: Balance): number {
  const naechste = state.round + 1;
  return Math.max(state.totalRounds, naechste + balance.secondChance.minRounds - 1);
}

export type SecondChanceResult = { ok: true; state: GameState } | { ok: false; reason: string };

/** Jacob fängt nach der Pleite neu an (siehe oben). catalog: Ereignisse für die neue Runde. */
export function startSecondChance(input: GameState, balance: Balance, catalog: readonly EventDef[] = []): SecondChanceResult {
  const blocker = secondChanceBlocker(input);
  if (blocker) return { ok: false, reason: blocker };
  const seed = input.seed;
  // Zwangsversteigerung: Bullard ersteigert die fördernden Pachten, der Rest fällt an die Besitzer zurück.
  const neueRivalWells: RivalWell[] = [];
  const leases = input.leases.flatMap((l) => {
    if (l.holder !== 'jacob') return [l];
    const found = input.wells.filter((w) => w.parcelId === l.parcelId && w.status === 'found');
    if (found.length === 0) return [];
    const rate = Math.round(found.reduce((s, w) => s + (w.production?.lastRate || w.production?.initialRate || 0), 0));
    neueRivalWells.push({ parcelId: l.parcelId, startRound: Math.min(...found.map((w) => w.startRound)), roundsLeft: 0, status: 'found', rate, royalty: l.royalty });
    return [{ ...l, holder: 'bullard' as const }];
  });
  const versteigert = new Set(neueRivalWells.map((w) => w.parcelId));
  const okara = input.ventures?.okara;
  const totalRounds = secondChanceEnd(input, balance);
  const cash = secondChanceCash(input, balance);
  const date = formatDate(input);
  const verlaengert = totalRounds > input.totalRounds ? ` Das Kapitel läuft für ihn bis Runde ${totalRounds}.` : '';
  let s: GameState = {
    ...input,
    finished: false,
    ending: null,
    cash,
    loans: [],
    rating: balance.credit.startRating,
    missedPayments: 0,
    bankruptcyDeadline: 0,
    leases,
    options: input.options.filter((o) => o.holder !== 'jacob'),
    wells: [],
    rigs: startRigs(balance),
    oilStock: 0,
    royaltyOil: 0,
    logistics: newLogistics(seed),
    rival: { ...input.rival, wells: [...input.rival.wells.filter((w) => !versteigert.has(w.parcelId)), ...neueRivalWells] },
    ventures: okara?.holder === 'jacob' ? { okara: { ...okara, holder: 'bullard' } } : okara ? { okara } : undefined,
    refinery: input.refinery ? newRefinery(seed, balance) : undefined,
    bigPipelines: input.bigPipelines ? newBigPipelines(seed) : undefined,
    exchange: input.exchange ? newExchange(seed, input.round, balance.exchange) : undefined,
    deals: undefined,
    hotOil: undefined,
    feldzug: undefined,
    totalRounds,
    secondChance: { round: input.round + 1 },
    log: [
      ...input.log,
      `${date}: Die Bank versteigert, was von Harlan Oil übrig ist${versteigert.size > 0 ? ` – Bullard ersteigert ${versteigert.size === 1 ? 'eine fördernde Pacht' : `${versteigert.size} fördernde Pachten`}` : ''}.`,
      `${date}: Jacob fängt noch einmal an: ${cash.toLocaleString('de-DE')} $, Silas' alter Turm und ein Name, den in Salt Hill jeder kennt.${verlaengert}`,
    ],
  };
  const { insolvency: _weg, ...ohneFrist } = s;
  s = ohneFrist;
  // Tankstellen gehen mit der Firma unter: die Marke beginnt neu (Bekanntheit bleibt bei den Leuten nicht hängen).
  if (input.brand) s = { ...s, brand: brandOf({ seed, brand: undefined }, balance) };
  // Die nächste Runde beginnt – wie am Ende von endRound.
  const next: GameState = { ...s, round: s.round + 1, taxBase: { cash, debt: 0 }, log: [...s.log, `${formatDate({ ...s, round: s.round + 1 })}: Eine neue Runde beginnt.`] };
  return { ok: true, state: ringPhone(drawEvents(checkBirth(next, balance), balance, catalog), balance, catalog) };
}
