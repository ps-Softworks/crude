// Lobbyist in Hallstead (4.16, GDD §10 „Einfluss als Währung“, §11 Lobbyist).
//
// Regeln (Zahlen in balance.yaml → hallstead.lobby):
// - Einstellen: einer der Kandidaten (candidates) gegen hireCost; jede Runde
//   kostet er salary. Entlassen geht jederzeit.
// - Gefallen: Am Rundenende bringt der Lobbyist Kompetenz × favorsPerCompetence ×
//   Regierungsfaktor (government; die Handelspartei hört Ölmännern lieber zu).
//   Trinker: mit drunkChance eine Runde ohne Gefallen. Genie: ± genieSpread je
//   nach Laune. Mehr als maxFavors schuldet einem niemand.
// - Gesetze: Mit Lobbyist kostet Fordern oder Verhindern pushCost Gefallen und
//   verschiebt den Druck um pushStep (−100 bis +100); Verwässern kostet waterCost
//   und nimmt dem Gesetz waterStep seiner Wirkung (höchstens maxWater). Druck und
//   Verwässerung verlieren je Runde decay. lobbyLawShift übersetzt den Druck in
//   eine Änderung der Chance (± maxShift) – das liest das Gesetzessystem (4.3).
// - Umschlag (Bestechung): bribe.cost $ gegen bribe.favors Gefallen und bribe.heat
//   Hitze. Ein gewissenhafter Lobbyist weigert sich.
// - Wahlkampfspende (GDD §8 „Politiker“): ab donation.min $ an eine Partei. Bei der
//   nächsten Wahl: Regiert danach diese Partei, bringt jede perFavor $ winMultiplier
//   Gefallen, sonst ist das Geld weg. Geht auch ohne Lobbyisten.
// - Gefallen ausgeben (spendFavors) können auch andere Systeme (Genehmigungen,
//   Ermittler, Staatsaufträge – Andockpunkt 4.11).
// Zufall nur über den Hallstead-Rng.

import type { Balance } from './balance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import type { LobbyCandidateBalance, PartyId } from './hallsteadBalance';
import {
  hallsteadOf,
  hallsteadUnlocked,
  worldView,
  type HallsteadNews,
  type HallsteadResult,
  type HallsteadState,
  type LobbyState,
} from './hallsteadState';
import { Rng } from './rng';
import { chapterOf } from './stocks';

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mitLobby(state: GameState, h: HallsteadState, lobby: LobbyState, cashDelta: number, logLine: string): GameState {
  return { ...state, cash: cents(state.cash + cashDelta), hallstead: { ...h, lobby }, log: [...state.log, `${formatDate(state)}: ${logLine}`] };
}

/** Der eingestellte Lobbyist mit seinen Zahlen, oder null. */
export function currentLobbyist(state: GameState, balance: Balance): ({ id: string } & LobbyCandidateBalance) | null {
  const l = state.hallstead?.lobby.lobbyist;
  if (!l) return null;
  const c = balance.hallstead.lobby.candidates[l.id];
  return c ? { id: l.id, ...c } : null;
}

export function hireLobbyist(state: GameState, balance: Balance, id: string): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const c = balance.hallstead.lobby.candidates[id];
  if (!c) return { ok: false, reason: 'unknown' };
  const h = hallsteadOf(state, balance);
  if (h.lobby.lobbyist) return { ok: false, reason: 'hasLobbyist' };
  if (state.cash < c.hireCost) return { ok: false, reason: 'cash' };
  const lobby = { ...h.lobby, lobbyist: { id, since: state.round } };
  return { ok: true, state: mitLobby(state, h, lobby, -c.hireCost, 'Jacob stellt einen Lobbyisten in Hallstead ein.') };
}

export function fireLobbyist(state: GameState, balance: Balance): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const h = hallsteadOf(state, balance);
  if (!h.lobby.lobbyist) return { ok: false, reason: 'noLobbyist' };
  return { ok: true, state: mitLobby(state, h, { ...h.lobby, lobbyist: null }, 0, 'Jacob entlässt seinen Lobbyisten in Hallstead.') };
}

/** Gefallen, die Jacob jetzt ausgeben kann (ganze). */
export function availableFavors(state: GameState): number {
  return Math.floor((state.hallstead?.lobby.favors ?? 0) + 1e-9);
}

/** Gefallen ausgeben – für Gesetze hier und für andere Systeme (Andockpunkt). */
export function spendFavors(state: GameState, balance: Balance, n: number): HallsteadResult {
  // 0.4.20+17: Gefallen gibt es ab der Provinzpolitik (Kapitel 2), nicht erst mit Hallstead.
  if (!politicsUnlocked(state, balance)) return { ok: false, reason: 'locked' };
  if (!Number.isInteger(n) || n < 0) return { ok: false, reason: 'amount' };
  const h = hallsteadOf(state, balance);
  if (availableFavors({ ...state, hallstead: h }) < n) return { ok: false, reason: 'favors' };
  return { ok: true, state: { ...state, hallstead: { ...h, lobby: { ...h.lobby, favors: Math.max(0, h.lobby.favors - n) } } } };
}

/**
 * 0.4.20+17 Provinzpolitik: Ab hallstead.lobby.politicsChapter (Kapitel 2) kann Jacob Gesetze fordern oder bremsen
 * und spenden – mit eigenen Kontakten, ohne Lobbyist. Lobbyist, Umschlag und Verwässern gibt es erst mit Hallstead.
 */
export function politicsUnlocked(state: GameState, balance: Balance): boolean {
  return chapterOf(state) >= balance.hallstead.lobby.politicsChapter || hallsteadUnlocked(state, balance);
}

/** 0.4.20+17: Wie viel Jacobs Wort in der Politik wiegt – nach Firmengröße (Imperiumswert ÷ weight.fullAt, min … 1). */
export function politicalWeight(empire: number, balance: Balance): number {
  const w = balance.hallstead.lobby.weight;
  return clamp(w.fullAt > 0 ? empire / w.fullAt : 1, w.min, 1);
}

/**
 * 0.4.20+17 (Andockpunkt Gesetze 4.3): Jacobs Einfluss je Gesetz für das Parlament – Druck (−100 … +100) ÷ 100 ×
 * Gewicht – und die Verwässerung. Ohne Politik (Kapitel 1) leer.
 */
export function lawInfluence(state: GameState, balance: Balance, empire: number): { lawInfluence: Record<string, number>; lawWater: Record<string, number> } {
  if (!politicsUnlocked(state, balance) || !state.hallstead) return { lawInfluence: {}, lawWater: {} };
  const gewicht = politicalWeight(empire, balance);
  const lawInfluence: Record<string, number> = {};
  for (const [id, p] of Object.entries(state.hallstead.lobby.pressure)) lawInfluence[id] = Math.round((clamp(p, -100, 100) / 100) * gewicht * 1000) / 1000;
  return { lawInfluence, lawWater: { ...state.hallstead.lobby.water } };
}

/** Fordern (+1) oder verhindern (−1): Druck auf ein Gesetz. 0.4.20+17: ab Kapitel 2, auch ohne Lobbyist. */
export function pushLaw(state: GameState, balance: Balance, lawId: string, direction: 1 | -1): HallsteadResult {
  if (!politicsUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  if (lawId.trim() === '') return { ok: false, reason: 'unknown' };
  const lb = balance.hallstead.lobby;
  const alt = state.hallstead?.lobby.pressure[lawId] ?? 0;
  if (alt * direction >= 100) return { ok: false, reason: 'maxed' };
  const bezahlt = spendFavors(state, balance, lb.pushCost);
  if (!bezahlt.ok) return bezahlt;
  const h = bezahlt.state.hallstead!;
  const pressure = { ...h.lobby.pressure, [lawId]: clamp(alt + direction * lb.pushStep, -100, 100) };
  const was = direction > 0 ? 'fordert' : 'bremst';
  const wer = h.lobby.lobbyist ? 'Jacobs Lobbyist' : 'Jacob';
  return { ok: true, state: mitLobby(bezahlt.state, h, { ...h.lobby, pressure }, 0, `${wer} ${was} bei den Abgeordneten ein Gesetz (${lawId}).`) };
}

/** Verwässern: weniger Wirkung, falls das Gesetz kommt. Braucht den Lobbyisten. */
export function waterDownLaw(state: GameState, balance: Balance, lawId: string): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  if (lawId.trim() === '') return { ok: false, reason: 'unknown' };
  if (!state.hallstead?.lobby.lobbyist) return { ok: false, reason: 'noLobbyist' };
  const lb = balance.hallstead.lobby;
  const alt = state.hallstead.lobby.water[lawId] ?? 0;
  if (alt >= lb.maxWater - 1e-9) return { ok: false, reason: 'maxed' };
  const bezahlt = spendFavors(state, balance, lb.waterCost);
  if (!bezahlt.ok) return bezahlt;
  const h = bezahlt.state.hallstead!;
  const water = { ...h.lobby.water, [lawId]: Math.min(lb.maxWater, alt + lb.waterStep) };
  return { ok: true, state: mitLobby(bezahlt.state, h, { ...h.lobby, water }, 0, `Jacobs Lobbyist verwässert in Hallstead ein Gesetz (${lawId}).`) };
}

/** Umschlag: Geld gegen Gefallen, macht Hitze. Nicht mit einem gewissenhaften Lobbyisten. */
export function bribe(state: GameState, balance: Balance): HallsteadResult {
  if (!hallsteadUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  const wer = currentLobbyist(state, balance);
  if (!wer) return { ok: false, reason: 'noLobbyist' };
  if (wer.trait === 'gewissenhaft') return { ok: false, reason: 'refuses' };
  const b = balance.hallstead.lobby.bribe;
  if (state.cash < b.cost) return { ok: false, reason: 'cash' };
  const h = hallsteadOf(state, balance);
  const lobby = { ...h.lobby, favors: Math.min(balance.hallstead.lobby.maxFavors, h.lobby.favors + b.favors), heat: h.lobby.heat + b.heat };
  return { ok: true, state: mitLobby(state, h, lobby, -b.cost, 'In Hallstead wechselt ein Umschlag den Besitzer.') };
}

/** Wahlkampfspende an eine Partei für die nächste Wahl. */
export function donate(state: GameState, balance: Balance, party: PartyId, amount: number): HallsteadResult {
  if (!politicsUnlocked(state, balance) || state.finished) return { ok: false, reason: 'locked' };
  if (!Number.isFinite(amount) || amount < balance.hallstead.lobby.donation.min) return { ok: false, reason: 'amount' };
  if (state.cash < amount) return { ok: false, reason: 'cash' };
  const h = hallsteadOf(state, balance);
  const electionRound = state.round + worldView(state, balance).electionIn - 1;
  const donations = [...h.lobby.donations, { party, amount, electionRound }];
  return { ok: true, state: mitLobby(state, h, { ...h.lobby, donations }, -amount, `Jacob spendet ${Math.round(amount)} $ für den Wahlkampf.`) };
}

/**
 * Liest ein Gesetzessystem lobbyLawShift und lobbyWaterDown? Solange nicht, zeigt
 * die Mappe einen Hinweis, dass der Druck nur vorgemerkt ist.
 * 4.3 Andockpunkt: auf true setzen, sobald 4.3 beides auf Beschlusschance und Wirkung anwendet.
 */
export const LAWS_CONNECTED = true;

/** Änderung der Chance eines Gesetzes durch Jacobs Druck, −maxShift bis +maxShift (Andockpunkt 4.3). */
export function lobbyLawShift(state: Pick<GameState, 'hallstead'>, balance: Balance, lawId: string): number {
  const p = state.hallstead?.lobby.pressure[lawId] ?? 0;
  return (clamp(p, -100, 100) / 100) * balance.hallstead.lobby.maxShift;
}

/** Anteil weniger Wirkung, falls das Gesetz kommt, 0 bis maxWater (Andockpunkt 4.3). */
export function lobbyWaterDown(state: Pick<GameState, 'hallstead'>, lawId: string): number {
  return state.hallstead?.lobby.water[lawId] ?? 0;
}

/** Hitze aus Umschlägen (Andockpunkt Ermittler 4.11). */
export function lobbyHeat(state: Pick<GameState, 'hallstead'>): number {
  return state.hallstead?.lobby.heat ?? 0;
}

function verblasseHitze(hitze: number, decay: number): number {
  const neu = Math.round(hitze * (1 - decay) * 100) / 100;
  return neu < 0.5 ? 0 : neu;
}

function verblassen(werte: Record<string, number>, decay: number, schwelle: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(werte)) {
    const neu = v * (1 - decay);
    if (Math.abs(neu) >= schwelle) out[k] = Math.round(neu * 1000) / 1000;
  }
  return out;
}

/**
 * Rundenende für die Lobby: Gehalt, Gefallen des Lobbyisten, Wahlausgang der
 * Spenden, Druck und Verwässerung verblassen.
 */
export function settleLobby(state: GameState, balance: Balance, h: HallsteadState, weight = 1): { state: GameState; h: HallsteadState; news: HallsteadNews[] } {
  const lb = balance.hallstead.lobby;
  const welt = worldView(state, balance);
  const rng = new Rng(h.rng);
  const news: HallsteadNews[] = [];
  const log: string[] = [];
  let favors = h.lobby.favors;
  let cash = state.cash;
  const wer = currentLobbyist({ ...state, hallstead: h }, balance);
  if (wer) {
    cash -= wer.salary;
    news.push({ key: 'salary', amount: wer.salary });
    // Ein Würfel je Runde, immer gezogen.
    const u = rng.float();
    let neu = wer.competence * lb.favorsPerCompetence * lb.government[welt.government];
    if (wer.trait === 'trinker' && u < lb.drunkChance) {
      neu = 0;
      news.push({ key: 'lobbyDrunk' });
      log.push('Jacobs Lobbyist hat die Runde im Club verschlafen.');
    } else {
      if (wer.trait === 'genie') neu *= 1 + lb.genieSpread * (2 * u - 1);
      neu = Math.round(neu * 100) / 100;
      news.push({ key: 'lobbyFavors', favors: neu });
    }
    favors += neu;
  }
  // 0.4.20+17: Jacobs eigene Kontakte – je größer die Firma, desto mehr schuldet man ihm.
  favors += Math.round(lb.ownFavors * weight * 100) / 100;
  const offen = [];
  for (const d of h.lobby.donations) {
    if (d.electionRound > state.round) {
      offen.push(d);
      continue;
    }
    if (welt.government === d.party) {
      const gewonnen = Math.round(((d.amount / lb.donation.perFavor) * lb.donation.winMultiplier) * 100) / 100;
      favors += gewonnen;
      news.push({ key: 'donationWon', party: d.party, favors: gewonnen });
      log.push('Die Partei, die Jacob unterstützt hat, regiert. Man schuldet ihm etwas.');
    } else {
      news.push({ key: 'donationLost', party: d.party, amount: d.amount });
      log.push('Die Partei, die Jacob unterstützt hat, hat verloren. Das Geld ist weg.');
    }
  }
  const lobby: LobbyState = {
    ...h.lobby,
    favors: Math.round(clamp(favors, 0, lb.maxFavors) * 100) / 100,
    donations: offen,
    pressure: verblassen(h.lobby.pressure, lb.decay, 1),
    water: verblassen(h.lobby.water, lb.decay, 0.01),
    // 0.4.20+16: Die Hitze der Umschläge verblasst langsam (zählt bei Delaney, investigation.lobbyHeatPoints).
    heat: verblasseHitze(h.lobby.heat, lb.bribe.heatDecay),
  };
  const datum = formatDate(state);
  return {
    state: { ...state, cash: cents(cash), log: [...state.log, ...log.map((l) => `${datum}: ${l}`)] },
    h: { ...h, rng: rng.state, lobby },
    news,
  };
}
