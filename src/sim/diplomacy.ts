// Rivalen-Diplomatie und Crane-Nachfolge (4.10, GDD §9, §13 Kapitel 2) – Einstieg:
// Start zu Kapitel 2, Rundenschritt, Ansicht für die Oberfläche, Spielstand-Prüfung.
// Den Kern (Zustand, Beziehungen, Welt-Schnittstelle) beschreibt diplomacyCore.ts.
//
// In Kapitel 1 fehlt state.diplomacy – dann tut advanceDiplomacy nichts und nichts
// davon ist zu sehen. startDiplomacy(state, balance, kapitel) legt sie an, sobald
// kapitel ≥ diplomacy.unlockChapter (4.5 Andockpunkt: beim Start von Kapitel 2 aufrufen).
//
// Reihenfolge am Rundenende (advanceDiplomacy, nach Transport und vor der Pleiteprüfung):
//   0. Anlässe der Vorrunde (Briefe/Besuche sind gekommen) werden gelöscht
//   1. Antworten aus content/events/k2-diplomatie.yaml (Merkzeichen) wirken – einmalige
//      genau einmal, wiederholbare (Angebote, Versöhnung, …) sooft sie kommen;
//      verkauft Jacob an Pruett, endet hier die Partie
//   2. Nachfolge: Zerschlagungsdruck, Aufsichtsrat, ggf. Entscheidung
//   3. Absprachen: Ablauf, Bruch durch Rivalen, Spuren unter Kartellgesetz
//   4. Angebote: Verfall, neues Angebot eines Rivalen
//   5. Übernahmen: Gewinn der eigenen Firmen, Pruetts Krisenkäufe, Kaufangebot bei Pleitegefahr
//   6. Verband: Gründung, Wachstum, Beitrag, „zu groß“
//   7. Rache der Rivalen mit großem Groll (GDD §9.5)
//   8. Vertrauen und Groll verblassen; Wirkung für die nächste Runde nach events.timed
// Der Zufall läuft in genau dieser Reihenfolge über einen eigenen Strom.

import { reputationOf } from './reputation';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import {
  antitrustInForce,
  betrayedBy,
  cents,
  changeRelation,
  clearMarks,
  clearPulses,
  DIPLO_MARKS,
  DIPLO_RIVALS,
  DIPLOMACY_READ_MARKS,
  DIPLOMACY_REPEAT_MARKS,
  driftRelations,
  hasDiplomacy,
  HEIRS,
  LOG_NAMES,
  markSet,
  OFFER_KINDS,
  offerAnswerMark,
  personality,
  reconcileMark,
  relationMood,
  remember,
  revengeMark,
  setMark,
  setPulse,
  type DiploGame,
  type DiploReason,
  type DiploRival,
  type DiplomacyState,
  type Heir,
  type OfferKind,
  type PactKind,
  type RelationMood,
  type SuccessionOutcome,
} from './diplomacyCore';
import { diplomacyEffects, diplomacyHeat, guildStrength, isCartel, pactActive, refreshEffects } from './diplomacyEffects';
import { enterGuild, exitGuild, advanceGuild, joinReason, leaveReason, newGuild } from './diplomacyGuild';
import { advanceOffers, advancePacts, answerOffer, proposeReason } from './diplomacyPacts';
import { advanceSuccession, backReason, breakupTalk, margaretSeats, newSuccession, pushReason, type BreakupTalk } from './diplomacySuccession';
import { advanceTakeovers, firmRows, type FirmRow } from './diplomacyTakeovers';
import type { GameState } from './game';
import { bullardStance } from './rival';
import { Rng, seedFromString } from './rng';
import { markRound, RIVAL_MARKS } from './trust';

export * from './diplomacyCore';
export { backHeir, pushBreakup, breakupPressure, successionOutcome } from './diplomacySuccession';
export { proposePact, answerOffer, breakPact, acceptScore, wouldAccept, type ProposeResult } from './diplomacyPacts';
export { buyFirm, firmPrice, buyoutPrice, inDistress } from './diplomacyTakeovers';
export { joinGuild, leaveGuild } from './diplomacyGuild';
export { diplomacyEffects, diplomacyHeat, takeoverShield, diplomacyMoodShift } from './diplomacyEffects';

/** Ist die Diplomatie in diesem Kapitel freigeschaltet? */
export function diplomacyUnlocked(balance: Balance, chapter: number): boolean {
  return chapter >= balance.diplomacy.unlockChapter;
}

/**
 * Legt die Diplomatie an (Kapitel ≥ unlockChapter, sonst bleibt alles, wie es ist;
 * läuft sie schon, auch). Startbeziehungen aus Kapitel 1 (Merkzeichen der Rivalen):
 * Handschlag/Fehde/Verrat mit Bullard, Treueerklärung an Crane, Delgados Verband,
 * Frachtvertrag mit Thorne. Setzt das Merkzeichen k2_diplomatie: Damit kommen die
 * Ereignisse aus content/events/k2-diplomatie.yaml.
 */
export function startDiplomacy(state: GameState, balance: Balance, chapter: number): GameState {
  if (!diplomacyUnlocked(balance, chapter) || hasDiplomacy(state)) return state;
  const b = balance.diplomacy;
  const c = b.carryOver;
  const relations = Object.fromEntries(DIPLO_RIVALS.map((r) => [r, { trust: 0, grudge: 0 }])) as DiplomacyState['relations'];
  let d: DiplomacyState = {
    chapter,
    startRound: state.round,
    rng: seedFromString(`${state.seed}:diplomatie`),
    relations,
    respect: b.relations.respectStart,
    memory: [],
    succession: newSuccession(balance, state.round),
    pacts: [],
    offers: [],
    nextId: 1,
    aftermath: [],
    firms: [],
    guild: newGuild(),
    traces: [],
    handled: [],
  };
  const stance = bullardStance(state);
  if (markRound(state, RIVAL_MARKS.bullardBetrayed) !== undefined) {
    d = remember(changeRelation(d, 'bullard', { trust: -b.relations.betrayalTrust, grudge: b.relations.betrayalGrudge }), 'bullard', 'verrat', state.round);
  } else if (stance === 'fehde') d = changeRelation(d, 'bullard', { grudge: c.bullardFeudGrudge });
  else if (stance === 'pakt') d = changeRelation(d, 'bullard', { trust: c.bullardPactTrust });
  if (markRound(state, RIVAL_MARKS.craneLoyal) !== undefined) for (const h of HEIRS) d = changeRelation(d, h, { trust: c.craneLoyalTrust });
  // Schon in Kapitel 1 in Delgados Verband (GDD §9.2): Der Verband besteht, Jacob ist Mitglied –
  // Delgado bittet ihn nicht noch einmal um den Beitritt: k2_verband_uebernommen statt der Gründungs-Bitte.
  // (Eigenes Merkzeichen mit der Runde von jetzt – das alte aus Kapitel 1 trägt eine Runde aus Kapitel 1.)
  const imVerband = markRound(state, RIVAL_MARKS.alliance) !== undefined;
  if (imVerband) {
    d = changeRelation(d, 'delgado', { trust: c.delgadoMemberTrust });
    d = { ...d, guild: { ...d.guild, founded: state.round, members: b.guild.startMembers + 1, member: true, joinedRound: state.round } };
  }
  if (markRound(state, RIVAL_MARKS.thorneContract) !== undefined) d = changeRelation(d, 'thorne', { trust: c.thorneContractTrust });
  if (markRound(state, RIVAL_MARKS.thorneRefused) !== undefined) d = changeRelation(d, 'thorne', { grudge: c.thorneRefusedGrudge });
  const log = [...state.log, `${formatDate(state)}: Cornelius Crane zieht sich zurück. Margaret Crane und Harold Pruett ringen um den Crane Trust.`];
  if (imVerband) log.push(`${formatDate(state)}: Rosa Delgados Verband wird zum Produzentenverband – Harlan Oil ist von Anfang an dabei.`);
  const gestartet = setMark({ ...state, diplomacy: d, log }, DIPLO_MARKS.started);
  return imVerband ? setMark(setMark(gestartet, DIPLO_MARKS.guildFounded), DIPLO_MARKS.guildCarried) : gestartet;
}

/** Einmalige Antworten (je genau einmal gelesen); die wiederholbaren verarbeitet handleRepeats. */
const ONCE_MARKS = DIPLOMACY_READ_MARKS.filter((m) => !DIPLOMACY_REPEAT_MARKS.includes(m));

/**
 * Wiederholbare Antworten aus Briefen und Besuchen: Angebote annehmen/ablehnen,
 * Versöhnung nach einer Rache, Hilfe nach Pruetts Krisenkauf, Bruch anprangern.
 * Jede wirkt einmal je Setzen und wird danach gelöscht. Ein Angebot, das schon nicht
 * mehr auf dem Tisch liegt (am Schreibtisch beantwortet), bleibt ohne Wirkung.
 */
function handleRepeats(state: DiploGame, balance: Balance): DiploGame {
  const gesetzt = DIPLOMACY_REPEAT_MARKS.filter((m) => markSet(state, m));
  if (gesetzt.length === 0) return state;
  let out: DiploGame = clearMarks(state, gesetzt);
  const date = formatDate(out);
  for (const rival of DIPLO_RIVALS) {
    for (const kind of OFFER_KINDS) {
      for (const accept of [true, false]) {
        if (!gesetzt.includes(offerAnswerMark(rival, kind, accept)) || out.finished) continue;
        const offer = out.diplomacy.offers.find((o) => o.rival === rival && o.kind === kind);
        const r = offer ? answerOffer(out, balance, offer.id, accept) : null;
        if (r?.ok) out = r.state as DiploGame;
        else out = { ...out, log: [...out.log, `${date}: Das Angebot von ${LOG_NAMES[rival]} liegt nicht mehr auf dem Tisch.`] };
      }
    }
    if (gesetzt.includes(reconcileMark(rival))) {
      out = { ...out, diplomacy: changeRelation(out.diplomacy, rival, { grudge: -balance.diplomacy.relations.reconcileGrudge }) };
    }
  }
  if (gesetzt.includes(DIPLO_MARKS.crisisHelp)) {
    const t = balance.diplomacy.takeovers;
    out = { ...out, diplomacy: changeRelation(changeRelation(out.diplomacy, 'delgado', { trust: t.crisisHelpTrust }), 'pruett', { grudge: t.crisisHelpGrudge }) };
  }
  if (gesetzt.includes(DIPLO_MARKS.exposed)) {
    // Wer zuletzt gebrochen hat, steht jetzt bloß da (Groll + 10); Jacob gewinnt Respekt.
    let d = out.diplomacy;
    const taeter = [...d.memory].reverse().find((m) => m.kind === 'beleidigung')?.rival;
    if (taeter) d = changeRelation(d, taeter, { grudge: 10 });
    out = { ...out, diplomacy: { ...d, respect: Math.min(100, d.respect + balance.diplomacy.relations.betrayalRespect / 3) } };
  }
  return out;
}

/** Antworten aus den Ereignissen (Merkzeichen) wirken – jedes Merkzeichen genau einmal. */
function handleMarks(state: DiploGame, balance: Balance): DiploGame {
  const s = balance.diplomacy.succession;
  let out = state;
  for (const mark of ONCE_MARKS) {
    if (!markSet(out, mark) || out.diplomacy.handled.includes(mark)) continue;
    let d: DiplomacyState = { ...out.diplomacy, handled: [...out.diplomacy.handled, mark] };
    out = { ...out, diplomacy: d };
    const offen = d.succession.outcome === null;
    switch (mark) {
      case DIPLO_MARKS.farewell:
        for (const h of HEIRS) d = changeRelation(d, h, { trust: s.farewellTrust });
        out = { ...out, diplomacy: d };
        break;
      case DIPLO_MARKS.backMargaret:
      case DIPLO_MARKS.backPruett: {
        if (!offen) break;
        const heir: Heir = mark === DIPLO_MARKS.backMargaret ? 'margaret' : 'pruett';
        const shift = heir === 'margaret' ? s.visitShift : -s.visitShift;
        const share = Math.round(Math.min(0.98, Math.max(0.02, d.succession.share + shift)) * 100) / 100;
        out = { ...out, diplomacy: { ...d, succession: { ...d.succession, share, backed: { ...d.succession.backed, [heir]: d.succession.backed[heir] + 1 } } } };
        break;
      }
      case DIPLO_MARKS.congrats: {
        const o = d.succession.outcome;
        if (o === 'margaret' || o === 'pruett') d = changeRelation(d, o, { trust: s.congratsTrust });
        else if (o === 'zerschlagen') for (const h of HEIRS) d = changeRelation(d, h, { trust: s.congratsTrust / 2 });
        out = { ...out, diplomacy: d };
        break;
      }
      case DIPLO_MARKS.guildJoin:
        if (d.guild.founded > 0 && !d.guild.member && !d.guild.expelled) out = enterGuild(out, out.round);
        break;
      case DIPLO_MARKS.guildDecline:
        out = { ...out, diplomacy: changeRelation(d, 'delgado', { trust: -balance.diplomacy.guild.leaveTrust }) };
        break;
      case DIPLO_MARKS.guildLeave:
        if (d.guild.member) out = exitGuild(out, balance, 'imGuten');
        break;
      case DIPLO_MARKS.guildFight:
        out = exitGuild(out, balance, 'streit');
        break;
      case DIPLO_MARKS.guildCancel:
        if (d.guild.member) out = exitGuild(out, balance, 'austritt');
        break;
      case DIPLO_MARKS.apology:
        out = { ...out, diplomacy: { ...d, respect: Math.min(100, d.respect + balance.diplomacy.relations.betrayalRespect / 2) } };
        break;
      default:
        break;
    }
  }
  return handleRepeats(out, balance);
}

const REVENGE_LOG: Record<DiploRival, string> = {
  margaret: 'Margaret Crane lässt Jacob spüren, was sie von ihm hält: Ihre Leute zahlen weniger für sein Öl.',
  pruett: 'Harold Pruett kürzt Jacobs Preis – aus Prinzip, sagt er.',
  bullard: 'Bullard bietet Jacob überall die Pachten weg.',
  delgado: 'Rosa Delgado warnt die Farmer vor Harlan Oil. Pachten werden teurer.',
  thorne: 'Thorne erhöht den Bahntarif für Harlan Oil.',
};

/**
 * Rache (GDD §9.5): Jeder Rivale mit Groll ≥ revengeGrudge schlägt mit Chance
 * revengeChance × Aggressivität / 5 zu (ein Zufallswert je solchem Rivalen):
 * Margaret/Pruett zahlen weniger, Bullard/Delgado verteuern Pachten (je revengeRounds
 * Runden ab der nächsten), Thorne erhöht den Bahntarif dauerhaft. Danach sinkt der
 * Groll um revengeRelief. Jede Rache setzt den Anlass k2_rache_<rivale> (Brief).
 */
function advanceRevenge(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const b = balance.diplomacy.relations;
  let d = state.diplomacy;
  let railTariff = state.railTariff;
  const log = [...state.log];
  const anlaesse: string[] = [];
  // 4.12: Furcht der Branche (GDD §4) hält Rivalen zurück – sie schlagen erst bei mehr Groll zu.
  const schwelle = b.revengeGrudge + Math.max(0, reputationOf(state, 'industryFear')) * balance.eventSystems.reputation.revenge;
  for (const rival of DIPLO_RIVALS) {
    if (d.relations[rival].grudge < schwelle) continue;
    if (rng.float() >= (b.revengeChance * personality(balance, rival).aggression) / 5) continue;
    const from = state.round + 1;
    const until = state.round + b.revengeRounds;
    if (rival === 'margaret' || rival === 'pruett') d = { ...d, aftermath: [...d.aftermath, { key: 'price', value: -b.revengePrice, from, until }] };
    else if (rival === 'thorne') railTariff = cents(railTariff + b.revengeRail);
    else d = { ...d, aftermath: [...d.aftermath, { key: 'leaseCost', value: b.revengeLeaseCost, from, until }] };
    d = changeRelation(d, rival, { grudge: -b.revengeRelief });
    log.push(`${formatDate(state)}: ${REVENGE_LOG[rival]}`);
    anlaesse.push(revengeMark(rival));
  }
  // Jede Rache kommt als Brief (content/events/k2-diplomatie.yaml, Anlass k2_rache_<rivale>).
  return anlaesse.reduce<DiploGame>((s, m) => setPulse(s, m), { ...state, railTariff, log, diplomacy: d });
}

/** Der Rundenschritt der Diplomatie (Reihenfolge oben). Ohne Diplomatie: unverändert. */
export function advanceDiplomacy(state: GameState, balance: Balance): GameState {
  if (!hasDiplomacy(state) || state.finished) return state;
  const rng = new Rng(state.diplomacy.rng);
  let s = handleMarks(clearPulses(state), balance);
  // Verkauf an Pruett (Antwort auf seinen Besuch): Die Partie endet hier, game.ts rechnet nicht weiter.
  if (s.finished) return s;
  s = advanceSuccession(s, balance, rng);
  s = advancePacts(s, balance, rng);
  s = advanceOffers(s, balance, rng);
  s = advanceTakeovers(s, balance, rng);
  s = advanceGuild(s, balance, rng);
  s = advanceRevenge(s, balance, rng);
  const d = driftRelations(s.diplomacy, balance);
  s = { ...s, diplomacy: { ...d, rng: rng.state, aftermath: d.aftermath.filter((a) => a.until > state.round) } };
  return refreshEffects(s, balance, state.round + 1);
}

// ---------------------------------------------------------------------------
// Ansicht für die Oberfläche (Zahlen und Gründe; Texte in content/diplomacy.yaml)

export interface DiplomacyView {
  respect: number;
  law: boolean;
  heat: number;
  effects: { price: number; leaseCost: number };
  relations: { rival: DiploRival; mood: RelationMood; trust: number; grudge: number }[];
  succession: {
    outcome: SuccessionOutcome | null;
    seats: number;
    boardSeats: number;
    roundsLeft: number;
    talk: BreakupTalk;
    backed: Record<Heir, number>;
    backCost: number;
    pushCost: number;
    backReason: DiploReason | null;
    pushReason: DiploReason | null;
  };
  pacts: { id: string; rival: DiploRival; kind: PactKind; roundsLeft: number; illegal: boolean }[];
  offers: { id: string; rival: DiploRival; kind: OfferKind; roundsLeft: number; price?: number }[];
  proposals: { rival: DiploRival; kind: PactKind; reason: DiploReason | null }[];
  firms: FirmRow[];
  guild: {
    founded: boolean;
    members: number;
    strength: number;
    member: boolean;
    expelled: boolean;
    dues: number;
    joinReason: DiploReason | null;
    leaveReason: DiploReason | null;
  };
}

export function diplomacyView(state: GameState, balance: Balance): DiplomacyView | null {
  if (!hasDiplomacy(state)) return null;
  const d = state.diplomacy;
  const law = antitrustInForce(state);
  return {
    respect: d.respect,
    law,
    heat: diplomacyHeat(state),
    effects: diplomacyEffects(state, balance, state.round),
    relations: DIPLO_RIVALS.map((rival) => ({ rival, mood: relationMood(d, rival), ...d.relations[rival] })),
    succession: {
      outcome: d.succession.outcome,
      seats: margaretSeats(d, balance),
      boardSeats: balance.diplomacy.succession.boardSeats,
      roundsLeft: Math.max(0, d.succession.endRound - state.round + 1),
      talk: breakupTalk(d),
      backed: d.succession.backed,
      backCost: balance.diplomacy.succession.backCost,
      pushCost: balance.diplomacy.succession.breakup.pushCost,
      backReason: backReason(state, balance),
      pushReason: pushReason(state, balance),
    },
    pacts: d.pacts
      .filter((p) => pactActive(p, state.round))
      .map((p) => ({ id: p.id, rival: p.rival, kind: p.kind, roundsLeft: p.endRound - state.round + 1, illegal: law && isCartel(p) })),
    offers: d.offers
      .filter((o) => o.round < state.round && o.expires >= state.round)
      .map((o) => ({ id: o.id, rival: o.rival, kind: o.kind, roundsLeft: o.expires - state.round + 1, ...(o.price !== undefined ? { price: o.price } : {}) })),
    proposals: DIPLO_RIVALS.flatMap((rival) =>
      balance.diplomacy.rivals[rival].kinds.map((kind) => ({ rival, kind, reason: proposeReason(state, balance, rival, kind) })),
    ),
    firms: firmRows(state, balance),
    guild: {
      founded: d.guild.founded > 0,
      members: d.guild.members,
      strength: guildStrength(d, balance),
      member: d.guild.member,
      expelled: d.guild.expelled,
      dues: balance.diplomacy.guild.dues,
      joinReason: joinReason(state),
      leaveReason: leaveReason(state),
    },
  };
}

/** Offene Angebote, auf die Jacob jetzt antworten kann (für die Pinnwand). */
export function openOffers(state: GameState): number {
  if (!hasDiplomacy(state)) return 0;
  return state.diplomacy.offers.filter((o) => o.round < state.round && o.expires >= state.round).length;
}

/** Ein Rivale, den Jacob je verraten hat – für die Anzeige. */
export function everBetrayed(state: GameState, rival: DiploRival): boolean {
  return hasDiplomacy(state) && betrayedBy(state.diplomacy, rival);
}

// ---------------------------------------------------------------------------
// Spielstand (save.ts ruft das auf, wenn state.diplomacy da ist – 4.10 Andockpunkt)

function zahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function objekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const OUTCOMES = [null, 'margaret', 'pruett', 'zerschlagen'];

/** Ist der Diplomatie-Zustand vollständig? */
export function validDiplomacy(v: unknown): boolean {
  if (!objekt(v)) return false;
  if (!['chapter', 'startRound', 'rng', 'respect', 'nextId'].every((k) => zahl(v[k]))) return false;
  if (!['memory', 'pacts', 'offers', 'aftermath', 'firms', 'traces', 'handled'].every((k) => Array.isArray(v[k]))) return false;
  const rel = v.relations;
  if (!objekt(rel) || !DIPLO_RIVALS.every((r) => objekt(rel[r]) && zahl(rel[r].trust) && zahl(rel[r].grudge))) return false;
  const s = v.succession;
  if (
    !objekt(s) ||
    !['share', 'endRound', 'lastBack', 'breakup', 'pushedFor', 'pushedAgainst', 'lastPush', 'decidedRound'].every((k) => zahl(s[k])) ||
    !objekt(s.backed) ||
    !zahl(s.backed.margaret) ||
    !zahl(s.backed.pruett) ||
    !OUTCOMES.includes(s.outcome as string | null)
  ) {
    return false;
  }
  const g = v.guild;
  if (!objekt(g) || !['founded', 'members', 'joinedRound', 'warned'].every((k) => zahl(g[k])) || typeof g.member !== 'boolean' || typeof g.expelled !== 'boolean') {
    return false;
  }
  const pacts = v.pacts as unknown[];
  if (!pacts.every((p) => objekt(p) && typeof p.id === 'string' && typeof p.rival === 'string' && typeof p.kind === 'string' && zahl(p.startRound) && zahl(p.endRound))) {
    return false;
  }
  const offers = v.offers as unknown[];
  if (!offers.every((o) => objekt(o) && typeof o.id === 'string' && typeof o.rival === 'string' && typeof o.kind === 'string' && zahl(o.round) && zahl(o.expires))) {
    return false;
  }
  const after = v.aftermath as unknown[];
  if (!after.every((a) => objekt(a) && (a.key === 'price' || a.key === 'leaseCost') && zahl(a.value) && zahl(a.from) && zahl(a.until))) return false;
  return (v.handled as unknown[]).every((h) => typeof h === 'string');
}
