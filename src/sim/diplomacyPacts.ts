// Absprachen unter Rivalen (4.10, GDD §9.4 Kooperation, §9.3 Nutzen-KI):
//
//   price      Preisabsprache – beide halten Öl zurück: pricePremium $ je Barrel mehr
//   territory  Gebietsabsprache – keiner bietet dem anderen Pachten weg: Pachten billiger
//   supply     Exklusiver Liefervertrag mit Crane Eastern (Margaret): supplyPremium mehr,
//              aber Bullard verliert seinen Abnehmer (GDD §9.7) und grollt
//   cross      Kreuzbeteiligung – gegenseitige Aktien (crossCost): Schutz vor Übernahmen
//
// Preis- und Gebietsabsprachen sind Kartelle: Gilt ein Kartellgesetz, hinterlassen sie
// eine Spur der Schwere cartelHeat im Schattenbuch (GDD §4).
//
// Zusage (deterministisch, ohne Würfel):
//   Vertrauen + respectWeight · (Respekt − 50) + loyaltyWeight · (Vertragstreue − 3) − Groll ≥ acceptThreshold
// Wen Jacob einmal verraten hat, der sagt nie wieder zu.
//
// Bruch: Jede Absprache lässt sich brechen. Wer zuerst bricht, kassiert doppelt
// (breakRounds Runden die doppelte Wirkung); der Betrogene verliert sie und vergisst
// es nie. Bricht Jacob: Vertrauen −, Groll +, Gedächtnis „Verrat“, Branchen-Respekt −
// bei allen. Ein Rivale bricht je Runde mit Chance
//   breakChance · (6 − Vertragstreue) + Groll / 1000.

import { spendAppointments } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import {
  betrayedBy,
  changeRelation,
  DIPLO_MARKS,
  DIPLO_RIVALS,
  diplomacyWorld,
  hasDiplomacy,
  LOG_NAMES,
  personality,
  remember,
  setMark,
  takeId,
  type DiploGame,
  type DiploReason,
  type DiploResult,
  type DiploRival,
  type DiplomacyState,
  type Offer,
  type Pact,
  type PactKind,
} from './diplomacyCore';
import { isCartel, pactActive, refreshEffects } from './diplomacyEffects';
import type { GameState } from './game';
import type { Rng } from './rng';

const KIND_LOG: Record<PactKind, string> = {
  price: 'eine Preisabsprache',
  territory: 'eine Gebietsabsprache',
  supply: 'einen exklusiven Liefervertrag',
  cross: 'eine Kreuzbeteiligung',
};

/** Wie gern ein Rivale einer Absprache mit Jacob zustimmt (Formel oben). */
export function acceptScore(d: DiplomacyState, balance: Balance, rival: DiploRival): number {
  const p = balance.diplomacy.pacts;
  const r = d.relations[rival];
  return r.trust + p.respectWeight * (d.respect - 50) + p.loyaltyWeight * (personality(balance, rival).loyalty - 3) - r.grudge;
}

export function wouldAccept(d: DiplomacyState, balance: Balance, rival: DiploRival): boolean {
  return !betrayedBy(d, rival) && acceptScore(d, balance, rival) >= balance.diplomacy.pacts.acceptThreshold;
}

/** Läuft mit diesem Rivalen schon eine Absprache dieser Art (in dieser Runde)? */
export function hasPact(d: DiplomacyState, rival: DiploRival, kind: PactKind, round: number): boolean {
  return d.pacts.some((p) => p.rival === rival && p.kind === kind && pactActive(p, round));
}

/** Warum Jacob diese Absprache nicht vorschlagen kann, oder null. */
export function proposeReason(state: GameState, balance: Balance, rival: DiploRival, kind: PactKind): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const d = state.diplomacy;
  if (!balance.diplomacy.rivals[rival].kinds.includes(kind)) return 'art';
  if (betrayedBy(d, rival)) return 'verraten';
  if (hasPact(d, rival, kind, state.round)) return 'laeuft';
  if (d.offers.some((o) => o.rival === rival && o.kind === kind)) return 'laeuft';
  if (kind === 'cross' && state.cash < balance.diplomacy.pacts.crossCost) return 'geld';
  return null;
}

/** Spur im Schattenbuch, wenn eine Kartellabsprache unter einem Kartellgesetz läuft. */
function trace(state: DiploGame, balance: Balance, pact: Pact): [DiploGame, Pact] {
  if (pact.traced || !isCartel(pact) || !diplomacyWorld(state).antitrustLaw) return [state, pact];
  const d = state.diplomacy;
  const neu = { source: `kartell_${pact.rival}`, severity: balance.diplomacy.pacts.cartelHeat, round: state.round };
  return [{ ...state, diplomacy: { ...d, traces: [...d.traces, neu] } }, { ...pact, traced: true }];
}

/** Schließt eine Absprache ab (nach Zusage oder angenommenem Angebot). */
function conclude(state: DiploGame, balance: Balance, rival: DiploRival, kind: PactKind): DiploGame {
  const p = balance.diplomacy.pacts;
  const [id, d0] = takeId(state.diplomacy, 'a');
  let d = changeRelation(d0, rival, { trust: p.acceptTrust });
  const log = [...state.log];
  const date = formatDate(state);
  let cash = state.cash;
  log.push(`${date}: Jacob schließt mit ${LOG_NAMES[rival]} ${KIND_LOG[kind]}.`);
  if (kind === 'cross') cash -= p.crossCost;
  if (kind === 'supply' && rival !== 'bullard') {
    d = changeRelation(d, 'bullard', { grudge: p.supplyBullardGrudge });
    log.push(`${date}: ${LOG_NAMES[rival]} nimmt Bullards Öl nicht mehr ab. Bullard weiß, wem er das verdankt.`);
  }
  let pact: Pact = { id, rival, kind, startRound: state.round, endRound: state.round + p.rounds - 1, traced: false };
  let out: DiploGame = { ...state, cash, log, diplomacy: d };
  [out, pact] = trace(out, balance, pact);
  out = { ...out, diplomacy: { ...out.diplomacy, pacts: [...out.diplomacy.pacts, pact] } };
  return refreshEffects(out, balance, state.round);
}

export type ProposeResult = { ok: true; state: GameState; accepted: boolean } | { ok: false; reason: DiploReason };

/**
 * Jacob schlägt einem Rivalen eine Absprache vor (kostet pacts.appointments Termine,
 * auch bei einer Absage). Zusage nach acceptScore.
 */
export function proposePact(state: GameState, balance: Balance, rival: DiploRival, kind: PactKind): ProposeResult {
  const reason = proposeReason(state, balance, rival, kind);
  if (reason) return { ok: false, reason };
  const zeit = spendAppointments(state, balance, balance.diplomacy.pacts.appointments);
  if (!zeit.ok) return { ok: false, reason: 'zeit' };
  const s = zeit.state as DiploGame;
  if (!wouldAccept(s.diplomacy, balance, rival)) {
    return {
      ok: true,
      accepted: false,
      state: { ...s, log: [...s.log, `${formatDate(s)}: ${LOG_NAMES[rival]} lehnt ${KIND_LOG[kind]} mit Jacob ab.`] },
    };
  }
  return { ok: true, accepted: true, state: conclude(s, balance, rival, kind) };
}

/** Warum Jacob diese Absprache gerade nicht brechen kann, oder null. */
export function breakReason(state: GameState, pactId: string): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const pact = state.diplomacy.pacts.find((p) => p.id === pactId);
  if (!pact || !pactActive(pact, state.round)) return 'unbekannt';
  return null;
}

/** Wert einer Absprache für Jacob (für die doppelte Nachwirkung beim Bruch). */
function pactValue(balance: Balance, kind: PactKind): { key: 'price' | 'leaseCost'; value: number } | null {
  const p = balance.diplomacy.pacts;
  if (kind === 'price') return { key: 'price', value: p.pricePremium };
  if (kind === 'supply') return { key: 'price', value: p.supplyPremium };
  if (kind === 'territory') return { key: 'leaseCost', value: -p.territoryLeaseCost };
  return null;
}

/**
 * Jacob bricht eine Absprache (Verrat, GDD §9.4): Er kassiert breakRounds Runden
 * doppelt (ab sofort), der Rivale vergisst es nie, und alle Rivalen trauen Jacobs Wort
 * weniger (Branchen-Respekt). Kreuzbeteiligung: Jacob verkauft die Aktien zurück (crossCost).
 */
export function breakPact(state: GameState, balance: Balance, pactId: string): DiploResult {
  const reason = breakReason(state, pactId);
  if (reason) return { ok: false, reason };
  const s = state as DiploGame;
  const r = balance.diplomacy.relations;
  const p = balance.diplomacy.pacts;
  const pact = s.diplomacy.pacts.find((x) => x.id === pactId)!;
  let d: DiplomacyState = { ...s.diplomacy, pacts: s.diplomacy.pacts.filter((x) => x.id !== pactId) };
  d = changeRelation(d, pact.rival, { trust: -r.betrayalTrust, grudge: r.betrayalGrudge });
  d = remember(d, pact.rival, 'verrat', s.round);
  d = { ...d, respect: Math.max(0, d.respect - r.betrayalRespect) };
  const wert = pactValue(balance, pact.kind);
  if (wert) d = { ...d, aftermath: [...d.aftermath, { key: wert.key, value: wert.value * 2, from: s.round, until: s.round + p.breakRounds - 1 }] };
  const cash = pact.kind === 'cross' ? s.cash + p.crossCost : s.cash;
  const log = [...s.log, `${formatDate(s)}: Jacob bricht ${KIND_LOG[pact.kind]} mit ${LOG_NAMES[pact.rival]}. Das vergisst man in der Branche nicht.`];
  const out = setMark({ ...s, cash, log, diplomacy: d }, DIPLO_MARKS.betrayer);
  return { ok: true, state: refreshEffects(out, balance, s.round) };
}

/** Warum Jacob auf dieses Angebot nicht (mehr) antworten kann, oder null. */
export function offerReason(state: GameState, balance: Balance, offerId: string, accept: boolean): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const offer = state.diplomacy.offers.find((o) => o.id === offerId);
  if (!offer || offer.expires < state.round || offer.round >= state.round) return 'unbekannt';
  if (accept && offer.kind === 'cross' && state.cash < balance.diplomacy.pacts.crossCost) return 'geld';
  return null;
}

/**
 * Jacob antwortet auf ein Angebot (ohne Termin – es ist ein Brief). Annehmen schließt
 * die Absprache; das Kaufangebot (buyout) beendet das Spiel mit dem Verkauf an Pruett.
 * Ablehnen kränkt (Groll + declineGrudge).
 */
export function answerOffer(state: GameState, balance: Balance, offerId: string, accept: boolean): DiploResult {
  const reason = offerReason(state, balance, offerId, accept);
  if (reason) return { ok: false, reason };
  const s = state as DiploGame;
  const offer = s.diplomacy.offers.find((o) => o.id === offerId)!;
  const ohne: DiploGame = { ...s, diplomacy: { ...s.diplomacy, offers: s.diplomacy.offers.filter((o) => o.id !== offerId) } };
  const date = formatDate(s);
  if (!accept) {
    const d = changeRelation(ohne.diplomacy, offer.rival, { grudge: balance.diplomacy.pacts.declineGrudge });
    return { ok: true, state: { ...ohne, diplomacy: d, log: [...ohne.log, `${date}: Jacob lehnt das Angebot von ${LOG_NAMES[offer.rival]} ab.`] } };
  }
  if (offer.kind === 'buyout') {
    const preis = offer.price ?? 0;
    return {
      ok: true,
      state: {
        ...ohne,
        cash: preis,
        loans: [],
        oilStock: 0,
        royaltyOil: 0,
        bankruptcyDeadline: 0,
        finished: true,
        ending: 'verkauft',
        log: [...ohne.log, `${date}: Jacob verkauft seine Firma für ${preis.toLocaleString('de-DE')} $ an Harold Pruett.`],
      },
    };
  }
  return { ok: true, state: conclude(ohne, balance, offer.rival, offer.kind) };
}

/**
 * Am Rundenende: abgelaufene Absprachen enden, Rivalen brechen vielleicht (ein
 * Zufallswert je laufender Absprache außer Kreuzbeteiligungen, in Reihenfolge der
 * Liste), und Kartelle unter einem neuen Kartellgesetz hinterlassen ihre Spur.
 */
export function advancePacts(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const p = balance.diplomacy.pacts;
  const date = formatDate(state);
  const log = [...state.log];
  let out: DiploGame = state;
  let d = state.diplomacy;
  const behalten: Pact[] = [];
  let gebrochen = false;
  for (const pact0 of d.pacts) {
    let pact = pact0;
    if (pact.endRound <= state.round) {
      log.push(`${date}: Die Absprache mit ${LOG_NAMES[pact.rival]} läuft aus.`);
      continue;
    }
    if (pact.kind !== 'cross') {
      const chance = p.breakChance * (6 - personality(balance, pact.rival).loyalty) + d.relations[pact.rival].grudge / 1000;
      if (rng.float() < chance) {
        log.push(`${date}: ${LOG_NAMES[pact.rival]} bricht ${KIND_LOG[pact.kind]} mit Jacob.`);
        const wert = pactValue(balance, pact.kind);
        if (wert) {
          d = { ...d, aftermath: [...d.aftermath, { key: wert.key, value: -wert.value, from: state.round + 1, until: state.round + p.breakRounds }] };
        }
        d = remember(d, pact.rival, 'beleidigung', state.round);
        gebrochen = true;
        continue;
      }
    }
    out = { ...out, diplomacy: d };
    [out, pact] = trace(out, balance, pact);
    d = out.diplomacy;
    behalten.push(pact);
  }
  out = { ...out, log, diplomacy: { ...d, pacts: behalten } };
  return gebrochen ? setMark(out, DIPLO_MARKS.betrayed) : out;
}

/** Offene Absprachen, die ein Rivale anbieten könnte: seine Arten ohne laufende Absprache und ohne offenes Angebot. */
function offenFuer(d: DiplomacyState, balance: Balance, rival: DiploRival, round: number): PactKind[] {
  return balance.diplomacy.rivals[rival].kinds.filter((k) => !hasPact(d, rival, k, round + 1) && !d.offers.some((o) => o.rival === rival && o.kind === k));
}

/**
 * Am Rundenende: abgelaufene Angebote verfallen; dann schlägt mit offerChance ein
 * Rivale etwas vor (Vertrauen ≥ 0, Groll unter offerMaxGrudge, nicht verraten). Das
 * Angebot liegt ab der nächsten Runde offerRounds Runden auf dem Tisch.
 * Zufall: ein Wert für die Chance, dann je einer für Rivale und Art.
 */
export function advanceOffers(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const p = balance.diplomacy.pacts;
  const date = formatDate(state);
  const log = [...state.log];
  let d = state.diplomacy;
  const verfallen = d.offers.filter((o) => o.expires <= state.round);
  for (const o of verfallen) log.push(`${date}: Das Angebot von ${LOG_NAMES[o.rival]} ist verfallen.`);
  d = { ...d, offers: d.offers.filter((o) => o.expires > state.round) };
  if (rng.float() < p.offerChance) {
    const kandidaten = DIPLO_RIVALS.filter(
      (r) => !betrayedBy(d, r) && d.relations[r].trust >= 0 && d.relations[r].grudge < p.offerMaxGrudge && offenFuer(d, balance, r, state.round).length > 0,
    );
    if (kandidaten.length > 0) {
      const rival = rng.pick(kandidaten);
      const kind = rng.pick(offenFuer(d, balance, rival, state.round));
      const [id, d2] = takeId(d, 'o');
      const offer: Offer = { id, rival, kind, round: state.round, expires: state.round + p.offerRounds };
      d = { ...d2, offers: [...d2.offers, offer] };
      log.push(`${date}: ${LOG_NAMES[rival]} schlägt Jacob ${KIND_LOG[kind]} vor.`);
    }
  }
  return { ...state, log, diplomacy: d };
}
