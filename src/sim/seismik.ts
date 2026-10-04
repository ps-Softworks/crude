// Technikstufe III: Reflexionsseismik (4.17, GDD §5 „Informationsquellen“).
// Sehr teuer, braucht einen Spezialtrupp und eine Lizenz beim Patentinhaber –
// dafür eine viel schmalere Bandbreite als beim Geologen und ein Blick auf die
// Größe der Falle. Die Messung sieht die wirkliche Geologie der Ranch zum Teil
// (insight), den Rest schätzt sie aus der Zone – und sie kann sich täuschen
// (falseTrap, missTrap). GDD §5: „gut“, nicht „sehr gut“ – das Bohrrisiko bleibt.
//
// Ablauf: Lizenz kaufen (Konsortium-Mitglieder bekommen sie umsonst) → Trupp auf
// eine Ranch schicken → nach surveyRounds liegt der Bericht auf dem Tisch
// (Rundenabrechnung in kapitel3Runde.ts). Der Geologe bleibt, wie er ist; der
// Bericht steht daneben (bestForecast für alle, die die beste Schätzung wollen).

import type { Balance } from './balance';
import { trueChance, type Forecast } from './forecast';
import type { GameState } from './game';
import type { Parcel } from './geology';
import { begin, chapterOf, clamp, kapitel3Of, note, withRng, type Kapitel3Reason, type Kapitel3Result, type Kapitel3State, type SeismikReport, worldOf } from './kapitel3';
import type { Rng } from './rng';

/** Stufe I–V allein aus dem Technikstand der Welt (4.1, sonst Ersatzwert). */
export function worldTechStage(state: GameState, balance: Balance): number {
  const tech = worldOf(state, balance).tech;
  let stage = 1;
  balance.kapitel3.seismik.techStages.forEach((from, i) => {
    if (tech >= from) stage = i + 1;
  });
  return stage;
}

/**
 * Mindeststufe des Kapitels (GDD §13: Kapitel 3 bringt Stufe III). Die Debug-Probe
 * zählt als Kapitel 3, damit man die Seismik auch in Kapitel 1 ausprobieren kann.
 */
export function chapterTechStage(state: GameState, balance: Balance): number {
  const k = balance.kapitel3;
  const chapter = state.kapitel3?.preview ? Math.max(chapterOf(state), k.fromChapter) : chapterOf(state);
  const stages = k.seismik.chapterStages;
  return stages[clamp(Math.floor(chapter), 1, stages.length) - 1];
}

/**
 * Technikstufe I–V: das Höchste aus dem Technikstand der Welt (4.1), der
 * Mindeststufe des Kapitels und eigener Forschung (state.research.stage, 4.11).
 * Die Weltkurve kann eine Stufe früher bringen, das Kapitel garantiert sie –
 * so hängt die Kernmechanik nicht davon ab, wie schnell eine Welt forscht.
 */
export function techStage(state: GameState, balance: Balance): number {
  const stage = Math.max(worldTechStage(state, balance), chapterTechStage(state, balance));
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
 * Der Bericht für eine Ranch. Die Messung sieht die wirkliche Falle nur zum Teil
 * (insight), der Rest kommt aus der Zone – eine bessere Prognose, kein Orakel.
 * Sie kann sich auch täuschen: Eine trockene Ranch zeigt mit falseTrap eine
 * Struktur (Chance und Falle wie bei Öl), eine Falle mit Öl bleibt mit missTrap
 * unsichtbar (Chance wie trocken, keine Falle). Zieht immer genau vier
 * Zufallszahlen (Fehler der Chance, Fehlmessung, Irrtum der Größe, Richtung),
 * damit die Folge stabil bleibt.
 */
export function makeReport(balance: Balance, parcel: Parcel, round: number, rng: Rng): SeismikReport {
  const s = balance.kapitel3.seismik;
  const uError = rng.float();
  const uRead = rng.float();
  const uMiss = rng.float();
  const uDir = rng.float();
  const zone = 100 * trueChance(balance, parcel);
  const oil = parcel.geology !== 'dry' && parcel.reserves > 0;
  // Was die Messung zu sehen glaubt.
  const falseTrap = !oil && uRead < s.falseTrap;
  const seen = oil ? uRead >= s.missTrap : falseTrap;
  const center = zone * (1 - s.insight) + (seen ? 100 : 0) * s.insight + (uError * 2 - 1) * (s.width / 2);
  let low = clamp(roundTo(clamp(center - s.width / 2, 0, 100), s.rounding), 0, 100);
  let high = clamp(roundTo(clamp(center + s.width / 2, 0, 100), s.rounding), 0, 100);
  if (low === high) {
    if (low + s.rounding <= 100) high = low + s.rounding;
    else low = high - s.rounding;
  }
  const last = s.sizeClasses.length - 1;
  let sizeLow: number | null = null;
  let sizeHigh: number | null = null;
  if (oil && seen) {
    const real = sizeClassOf(balance, parcel.reserves);
    sizeLow = sizeHigh = real;
    // Irrtum: die Spanne reicht eine Klasse daneben – die wahre liegt immer drin.
    if (uMiss < s.sizeMiss) {
      if ((uDir < 0.5 && real > 0) || real === last) sizeLow = real - 1;
      else sizeHigh = real + 1;
    }
  } else if (falseTrap) {
    // Trockene Ranch, aber eine Struktur im Bild: eine kleine Falle, die es nicht gibt.
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
