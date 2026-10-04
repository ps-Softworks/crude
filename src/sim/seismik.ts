// Technikstufe III: Reflexionsseismik (4.17, GDD §5 „Informationsquellen“).
// Sehr teuer, braucht einen Spezialtrupp und eine Lizenz beim Patentinhaber –
// dafür eine viel schmalere Bandbreite als beim Geologen und ein Blick auf die
// Größe der Falle. Die Messung sieht die wirkliche Geologie der Ranch (insight),
// nicht nur die Zone – aber nie ganz: Auch eine Seismik irrt.
//
// Ablauf: Lizenz kaufen (Konsortium-Mitglieder bekommen sie umsonst) → Trupp auf
// eine Ranch schicken → nach surveyRounds liegt der Bericht auf dem Tisch
// (Rundenabrechnung in kapitel3Runde.ts). Der Geologe bleibt, wie er ist; der
// Bericht steht daneben (bestForecast für alle, die die beste Schätzung wollen).

import type { Balance } from './balance';
import { trueChance, type Forecast } from './forecast';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { begin, clamp, kapitel3Of, note, withRng, type Kapitel3Reason, type Kapitel3Result, type Kapitel3State, type SeismikReport, worldOf } from './kapitel3';
import type { Rng } from './rng';

/**
 * Technikstufe I–V: aus dem Technikstand der Welt (4.1) oder – wenn höher – aus
 * eigener Forschung (state.research.stage, 4.11).
 */
export function techStage(state: GameState, balance: Balance): number {
  const tech = worldOf(state, balance).tech;
  const stages = balance.kapitel3.seismik.techStages;
  let stage = 1;
  stages.forEach((from, i) => {
    if (tech >= from) stage = i + 1;
  });
  const research = (state as { research?: { stage?: unknown } }).research?.stage;
  return typeof research === 'number' && research > stage ? Math.min(5, research) : stage;
}

/** Konsortium-Mitglieder (auch im Doppelspiel) bekommen die Lizenz umsonst. */
export function licenseCost(k3: Kapitel3State, balance: Balance): number {
  const p = k3.konsortium.path;
  return p === 'mitglied' || p === 'doppelspiel' ? 0 : balance.kapitel3.seismik.licenseCost;
}

/** Trupps, die gerade unterwegs sind. */
export function busyCrews(k3: Kapitel3State): number {
  return k3.seismik.surveys.length;
}

/** Was spricht gegen Seismik überhaupt (Stufe, Lizenz)? */
function seismikBlocker(stage: number, k3: Kapitel3State, balance: Balance): Kapitel3Reason | null {
  if (stage < balance.kapitel3.seismik.stage) return 'technik';
  if (!k3.seismik.license) return 'lizenz_fehlt';
  return null;
}

export function buyLicense(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  if (techStage(state, balance) < balance.kapitel3.seismik.stage) return { ok: false, reason: 'technik' };
  if (k3.seismik.license) return { ok: false, reason: 'lizenz_da' };
  const cost = licenseCost(k3, balance);
  if (state.cash < cost) return { ok: false, reason: 'geld' };
  const next = note({ ...k3, seismik: { ...k3.seismik, license: true } }, { round: state.round, key: 'seismik_lizenz', vars: { betrag: cost } });
  return { ok: true, state: { ...state, cash: state.cash - cost, kapitel3: next } };
}

export function hireCrew(input: GameState, balance: Balance): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const s = balance.kapitel3.seismik;
  if (!k3.seismik.license) return { ok: false, reason: 'lizenz_fehlt' };
  if (k3.seismik.crews >= s.maxCrews) return { ok: false, reason: 'max_trupps' };
  if (state.cash < s.crewCost) return { ok: false, reason: 'geld' };
  const next = note({ ...k3, seismik: { ...k3.seismik, crews: k3.seismik.crews + 1 } }, { round: state.round, key: 'seismik_trupp', vars: { betrag: s.crewCost } });
  return { ok: true, state: { ...state, cash: state.cash - s.crewCost, kapitel3: next } };
}

/** Probelauf für den Knopf „Seismik-Trupp schicken“: null = geht. */
export function surveyBlocker(state: GameState, balance: Balance, parcelId: string): Kapitel3Reason | null {
  const k3 = kapitel3Of(state, balance);
  if (!k3) return 'gesperrt';
  if (state.finished) return 'kapitel_ende';
  const sperre = seismikBlocker(techStage(state, balance), k3, balance);
  if (sperre) return sperre;
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!parcel || parcel.discovery) return 'parzelle';
  if (k3.seismik.surveys.some((x) => x.parcelId === parcelId)) return 'laeuft_schon';
  if (k3.seismik.reports[parcelId]) return 'schon_vermessen';
  if (busyCrews(k3) >= k3.seismik.crews) return 'kein_trupp';
  if (state.cash < balance.kapitel3.seismik.surveyCost) return 'geld';
  return null;
}

export function orderSurvey(input: GameState, balance: Balance, parcelId: string): Kapitel3Result {
  const sperre = surveyBlocker(input, balance, parcelId);
  if (sperre) return { ok: false, reason: sperre };
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const s = balance.kapitel3.seismik;
  const survey = { parcelId, readyRound: state.round + s.surveyRounds };
  const next = note({ ...k3, seismik: { ...k3.seismik, surveys: [...k3.seismik.surveys, survey] } }, { round: state.round, key: 'seismik_auftrag', vars: { ranch: parcelId, betrag: s.surveyCost } });
  return { ok: true, state: { ...state, cash: state.cash - s.surveyCost, kapitel3: next } };
}

function roundTo(value: number, step: number): number {
  return Math.round(Number((value / step).toFixed(6))) * step;
}

/** Größenklasse (Index) für eine förderbare Menge. */
export function sizeClassOf(balance: Balance, reserves: number): number {
  const classes = balance.kapitel3.seismik.sizeClasses;
  let i = 0;
  classes.forEach((c, j) => {
    if (reserves >= c.from) i = j;
  });
  return i;
}

/**
 * Der Bericht für eine Ranch. Zieht immer genau drei Zufallszahlen (Fehler der
 * Chance, Irrtum der Größe, Richtung des Irrtums), damit die Folge stabil bleibt.
 */
export function makeReport(balance: Balance, parcel: Parcel, round: number, rng: Rng): SeismikReport {
  const s = balance.kapitel3.seismik;
  const uError = rng.float();
  const uMiss = rng.float();
  const uDir = rng.float();
  const zone = 100 * trueChance(balance, parcel);
  const oil = parcel.geology !== 'dry' && parcel.reserves > 0;
  const center = zone * (1 - s.insight) + (oil ? 100 : 0) * s.insight + (uError * 2 - 1) * (s.width / 2);
  let low = clamp(roundTo(clamp(center - s.width / 2, 0, 100), s.rounding), 0, 100);
  let high = clamp(roundTo(clamp(center + s.width / 2, 0, 100), s.rounding), 0, 100);
  if (low === high) {
    if (low + s.rounding <= 100) high = low + s.rounding;
    else low = high - s.rounding;
  }
  const last = s.sizeClasses.length - 1;
  let sizeLow: number | null = null;
  let sizeHigh: number | null = null;
  if (oil) {
    const real = sizeClassOf(balance, parcel.reserves);
    sizeLow = sizeHigh = real;
    // Irrtum: die Spanne reicht eine Klasse daneben – die wahre liegt immer drin.
    if (uMiss < s.sizeMiss) {
      if ((uDir < 0.5 && real > 0) || real === last) sizeLow = real - 1;
      else sizeHigh = real + 1;
    }
  } else if (uMiss < s.falseTrap) {
    // Trockene Ranch, aber eine Struktur im Bild: Die Messung irrt (eine kleine Falle, die es nicht gibt).
    sizeLow = Math.min(last, 1 + (uDir < 0.5 ? 0 : 1)) - 1;
    sizeHigh = sizeLow + 1;
  }
  return { parcelId: parcel.id, round, low, high, sizeLow, sizeHigh };
}

/** Rundenende: Trupps, deren Bericht zur nächsten Runde fertig ist, liefern ab. */
export function settleSurveys(state: GameState, balance: Balance, k3: Kapitel3State): Kapitel3State {
  const next = state.round + 1;
  let out = k3;
  const fertig = k3.seismik.surveys.filter((x) => x.readyRound <= next);
  if (fertig.length === 0) return k3;
  out = { ...out, seismik: { ...out.seismik, surveys: out.seismik.surveys.filter((x) => x.readyRound > next) } };
  for (const survey of fertig) {
    const parcel = state.parcels.find((p) => p.id === survey.parcelId);
    if (!parcel) continue;
    const [report, k] = withRng(out, (rng) => makeReport(balance, parcel, next, rng));
    out = note({ ...k, seismik: { ...k.seismik, reports: { ...k.seismik.reports, [parcel.id]: report } } }, { round: next, key: 'seismik_bericht', vars: { ranch: parcel.id } });
  }
  return out;
}

/** Die beste Schätzung für eine Ranch: der Seismik-Bericht, sonst der Geologe. */
export function bestForecast(state: GameState, parcelId: string): Forecast | undefined {
  const r = state.kapitel3?.seismik.reports[parcelId];
  if (r) return { parcelId, low: r.low, high: r.high, center: (r.low + r.high) / 2 };
  return state.forecasts[parcelId];
}
