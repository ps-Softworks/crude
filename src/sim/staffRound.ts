// Personal am Rundenende (4.9, GDD §11): Was Sekretärin und Fixer tun, während
// Jacob schläft. Zwei Andockpunkte in endRound (game.ts):
//
//   delegateMail – vor den Standard-Antworten: Briefe, deren Frist abläuft und
//     deren Briefart laut Richtlinie das Vorzimmer erledigt, beantwortet die
//     Sekretärin selbst – nach eigenem Urteil (Wert der Wirkungen in $, mit
//     einem Schätzfehler, der mit der Kompetenz schrumpft) und nie teurer als
//     mailSpendLimit, und nur mit Antworten ohne Termin (was Jacob persönlich
//     tun müsste, kann sie nicht für ihn tun). Verdeckte Folgen (Merkzeichen)
//     kennt sie nicht – das ist das Risiko der Delegation.
//
//   settleStaff – nach den Terminen: Verkauf nach Regel, Aufträge des Fixers,
//     Löhne, Loyalität, Abwerben und Verrat, Hitze und Skandal; dann die neue
//     Runde (Aussetzer der Trinker, Extra-Termine, neue Bewerbungen).
//     In Kapitel 1 passiert hier nichts; ab staff.unlockChapter wird das Personal
//     beim ersten Rundenende freigeschaltet.
//
// Zufall nur aus staff.rng.

import { TRANSPORT_MODES, type Balance } from './balance';
import { immediateValue } from './eventRelevance';
import { choiceCost, choicePossible, dueRound, resolveDelegated, type EventChoice, type EventDef } from './events';
import type { GameState } from './game';
import { Rng } from './rng';
import { buyerPrice, capacityLeft, modeUnavailable, netPrice, sellOil } from './transport';
import {
  clampLoyalty,
  extraAppointments,
  hasTrait,
  markStaff,
  memberOf,
  onDuty,
  openStaff,
  orderSuccess,
  payroll,
  refreshCandidates,
  staffLog,
  staffUnlocked,
  STAFF_EVENT_MARKS,
  STAFF_MARKS,
  syncStaffMarks,
  wageLevel,
  type StaffMember,
  type StaffRole,
  type StaffState,
} from './staff';
import { RIVAL_MARKS } from './trust';

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dollars(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function mitStaff(state: GameState, staff: StaffState): GameState {
  return { ...state, staff };
}

function aendern(state: GameState, role: StaffRole, f: (m: StaffMember) => StaffMember): GameState {
  const staff = state.staff!;
  return mitStaff(state, { ...staff, hired: staff.hired.map((m) => (m.role === role ? f(m) : m)) });
}

/** Personalakte: eine Entscheidung ging gut (true) oder schlecht aus. */
function bilanz(state: GameState, role: StaffRole, gut: boolean): GameState {
  return aendern(state, role, (m) => (gut ? { ...m, good: m.good + 1 } : { ...m, bad: m.bad + 1 }));
}

/** Zufall des Personals ziehen und zurückschreiben. */
function mitRng<T>(state: GameState, f: (rng: Rng) => T): [T, GameState] {
  const rng = new Rng(state.staff!.rng);
  const wert = f(rng);
  return [wert, mitStaff(state, { ...state.staff!, rng: rng.state })];
}

// --- Post nach Richtlinie ------------------------------------------------------------

/**
 * Was eine Antwort in $ wert ist, so wie das Vorzimmer es sieht: die sofortigen
 * Wirkungen (Geld, Öl, Kraft, Familie – wie bei der Wirkungsprüfung) plus die
 * befristeten und dauerhaften mit Vorzeichen. Merkzeichen zählen nicht.
 */
export function choiceWorth(choice: Pick<EventChoice, 'effects'>, balance: Balance): number {
  const e = choice.effects;
  const r = balance.events.relevance;
  const t = balance.transport;
  const runden = balance.events.timedRounds;
  const halbesKapitel = Math.ceil(balance.start.rounds / 2);
  return (
    immediateValue(choice, balance) -
    (e.railTariff ?? 0) * r.refBarrels * halbesKapitel +
    (e.price ?? 0) * r.refBarrels * runden +
    (e.production ?? 0) * r.refBarrels * runden * balance.market.basePrice -
    (e.leaseCost ?? 0) * r.refLeaseSpend +
    (e.teams ?? 0) * t.teams.hireCost -
    Math.max(0, e.teamsIdle ?? 0) * t.teams.capacity * (t.wagon.costPerBarrel - t.teams.costPerBarrel)
  );
}

/**
 * Darf das Vorzimmer diese Antwort selbst geben? Möglich, nicht teurer als die
 * Richtlinie erlaubt – und ohne Jacob: Antworten, die einen Termin kosten
 * (Jacob muss selbst schreiben, empfangen, hinfahren), gibt nur er (GDD §3).
 * Sonst schenkte die Delegation Kraft und Familie ohne Termin.
 */
export function delegable(state: GameState, event: EventDef, choice: EventChoice): boolean {
  const kosten = Math.max(0, -(choice.effects.cash ?? 0));
  return choiceCost(event, choice) === 0 && choicePossible(state, event, choice) && kosten <= (state.staff?.policies.mailSpendLimit ?? 0);
}

/** Die Briefe, die das Vorzimmer am Rundenende nach Richtlinie erledigen würde (für die Anzeige im Posteingang). */
export function delegatedMail(state: GameState, catalog: readonly EventDef[]): string[] {
  if (!state.staff || !onDuty(state, 'secretary')) return [];
  return state.events.pending.filter((id) => {
    const event = catalog.find((e) => e.id === id);
    return !!event?.mail && state.staff!.policies.mail[event.mail] === 'staff' && event.choices.some((c) => delegable(state, event, c));
  });
}

/**
 * 4.9 Andockpunkt (endRound, vor autoResolve): Das Vorzimmer erledigt Briefe,
 * deren Frist abläuft, wenn die Richtlinie es für ihre Briefart sagt. Es wählt
 * die Antwort, die ihm am meisten wert scheint (Schätzfehler: judgementNoise ×
 * (5 − Kompetenz)/4 je Antwort). Die Personalakte zählt, ob es die wirklich
 * beste unter den erlaubten Antworten war.
 */
export function delegateMail(state: GameState, balance: Balance, catalog: readonly EventDef[]): GameState {
  if (!state.staff || state.finished) return state;
  const m = onDuty(state, 'secretary');
  if (!m) return state;
  const fehler = (balance.staff.secretary.judgementNoise * (5 - m.competence)) / 4;
  let out = state;
  for (const id of state.events.pending) {
    const event = catalog.find((e) => e.id === id);
    if (!event?.mail || dueRound(out, id) > out.round) continue;
    if (out.staff!.policies.mail[event.mail] !== 'staff') continue;
    const moeglich = event.choices.filter((c) => delegable(out, event, c));
    if (moeglich.length === 0) continue;
    const [bewertet, nach] = mitRng(out, (rng) =>
      moeglich.map((c) => {
        const wahr = choiceWorth(c, balance);
        return { c, wahr, geschaetzt: fehler > 0 ? wahr + (rng.float() * 2 - 1) * fehler : wahr };
      }),
    );
    const wahl = bewertet.reduce((a, b) => (b.geschaetzt > a.geschaetzt ? b : a));
    const beste = Math.max(...bewertet.map((b) => b.wahr));
    const r = resolveDelegated(nach, balance, catalog, id, wahl.c.id, 'Das Vorzimmer nach Richtlinie: ');
    if (!r.ok) continue;
    out = bilanz(r.state, 'secretary', wahl.wahr >= beste - 0.005);
  }
  return out;
}

// --- Verkauf nach Regel ---------------------------------------------------------------

/**
 * Verkauf nach Regel (GDD §11): Zahlt der Trust mindestens minPrice, verkauft
 * das Vorzimmer share des Tanks über die Wege mit dem besten Nettopreis (nur an
 * den Trust, nur mit Gewinn nach Fracht). Wer schlecht ist, hält sich nicht
 * immer an die Regel (misjudgeChance × (5 − Kompetenz)/4, der Spieler doppelt):
 * dann verkauft er unter dem Mindestpreis oder hält zurück, obwohl der Preis
 * stimmt. Der Charmante holt etwas mehr heraus, beim Gierigen verschwindet etwas.
 */
export function autoSell(state: GameState, balance: Balance): GameState {
  const staff = state.staff;
  const m = onDuty(state, 'secretary');
  if (!staff || !m || !staff.policies.sales.on) return state;
  const pol = staff.policies.sales;
  const menge = Math.floor(Math.floor(state.oilStock) * pol.share);
  if (menge <= 0) return state;
  const s = balance.staff;
  const preis = buyerPrice(state, balance, 'crane');
  const irrtum = Math.min(1, ((s.sales.misjudgeChance * (5 - m.competence)) / 4) * (hasTrait(m, 'spieler') ? 2 : 1));
  const [[falsch, gier], gewuerfelt] = mitRng(state, (rng) => [rng.float() < irrtum, hasTrait(m, 'gierig') && rng.float() < s.secretary.greedChance] as const);
  const regel = preis >= pol.minPrice;
  const verkaufen = falsch ? !regel : regel;
  if (!verkaufen) {
    if (!falsch) return gewuerfelt;
    return bilanz(staffLog(gewuerfelt, `Das Vorzimmer hält das Öl zurück, obwohl der Trust ${dollars(preis)} $ zahlt – die Regel sagt anderes.`), 'secretary', false);
  }
  let out = gewuerfelt;
  let rest = menge;
  let verkauft = 0;
  let erloes = 0;
  const wege = TRANSPORT_MODES.filter((mode) => modeUnavailable(out, mode) === null && netPrice(out, balance, mode) > 0).sort(
    (a, b) => netPrice(out, balance, b) - netPrice(out, balance, a),
  );
  for (const mode of wege) {
    const n = Math.min(rest, capacityLeft(out, balance, mode));
    if (n <= 0) continue;
    const r = sellOil(out, balance, mode, n, 'crane');
    if (!r.ok) continue;
    out = r.state;
    rest -= n;
    verkauft += n;
    erloes += r.quote.net;
    if (rest <= 0) break;
  }
  if (verkauft === 0) return staffLog(gewuerfelt, 'Das Vorzimmer wollte nach Regel verkaufen, aber kein Weg zum Käufer war frei.');
  const charme = hasTrait(m, 'charmant') ? cents(verkauft * s.secretary.charmBonus) : 0;
  const schwund = gier ? cents(erloes * s.secretary.greedSkim) : 0;
  out = { ...out, cash: cents(out.cash + charme - schwund) };
  const unter = falsch && !regel ? ` – unter dem Mindestpreis von ${dollars(pol.minPrice)} $` : '';
  out = staffLog(out, `Das Vorzimmer verkauft nach Regel ${verkauft.toLocaleString('de-DE')} Barrel für ${dollars(cents(erloes + charme))} $${unter}.`);
  if (schwund > 0) out = staffLog(out, 'Die Abrechnung des Vorzimmers ist dünner, als sie sein sollte.');
  return bilanz(out, 'secretary', !falsch && schwund === 0);
}

// --- Aufträge des Fixers ---------------------------------------------------------------

/**
 * Führt die Aufträge dieser Runde aus (bezahlt sind sie schon). Jeder Auftrag
 * bringt Hitze (der Verschwiegene die Hälfte). Spionage: ein Bericht über
 * Bullard. Sabotage: Bullard verliert Geld und Zeit – misslingt sie, ahnt er,
 * wer dahintersteckt (Fehde) und es wird heißer. Ein betrunkener Fixer
 * vermasselt alles.
 */
export function runOrders(state: GameState, balance: Balance): GameState {
  const staff = state.staff;
  if (!staff || staff.orders.length === 0) return state;
  const m = memberOf(state, 'fixer');
  let out: GameState = mitStaff(state, { ...staff, orders: [] });
  if (!m) return out;
  if (staff.drunk.includes('fixer')) return bilanz(staffLog(out, 'Der Sicherheitschef war die ganze Runde betrunken. Das Geld für den Auftrag ist weg.'), 'fixer', false);
  const f = balance.staff.fixer;
  for (const order of staff.orders) {
    const o = f.orders[order];
    const hitze = o.heat * (hasTrait(m, 'verschwiegen') ? 0.5 : 1);
    const [klappt, gewuerfelt] = mitRng(out, (rng) => rng.float() < orderSuccess(order, m.competence, balance));
    out = mitStaff(gewuerfelt, { ...gewuerfelt.staff!, heat: Math.min(100, gewuerfelt.staff!.heat + hitze) });
    if (order === 'spy') {
      if (klappt) {
        const r = out.rival;
        const leases = out.leases.filter((l) => l.holder === 'bullard').length;
        const intel = {
          round: out.round,
          cash: Math.round(r.cash / 100) * 100,
          drilling: r.wells.filter((w) => w.status === 'drilling').length,
          found: r.wells.filter((w) => w.status === 'found').length,
          leases,
        };
        out = markStaff(staffLog(mitStaff(out, { ...out.staff!, intel }), 'Der Sicherheitschef bringt einen Bericht über Bullards Geschäfte.'), STAFF_MARKS.spied);
      } else {
        out = staffLog(out, 'Der Sicherheitschef kommt ohne Bericht zurück. Bullards Leute haben dichtgehalten.');
      }
    } else {
      if (klappt) {
        const rival = {
          ...out.rival,
          cash: Math.max(0, out.rival.cash - (o.rivalCash ?? 0)),
          wells: out.rival.wells.map((w) => (w.status === 'drilling' ? { ...w, roundsLeft: w.roundsLeft + (o.delay ?? 0) } : w)),
        };
        out = markStaff(staffLog({ ...out, rival }, 'Auf Bullards Bohrplatz brennt nachts ein Schuppen. Niemand hat etwas gesehen.'), STAFF_MARKS.sabotaged);
      } else {
        out = mitStaff(out, { ...out.staff!, heat: Math.min(100, out.staff!.heat + (o.caughtHeat ?? 0)) });
        out = markStaff(staffLog(out, 'Die Sabotage bei Bullard fliegt auf – seine Leute haben einen Mann erkannt. Bullard ahnt, wer dahintersteckt.'), RIVAL_MARKS.bullardFeud);
      }
    }
    out = bilanz(out, 'fixer', klappt);
  }
  return out;
}

// --- Löhne, Loyalität, Abgänge -----------------------------------------------------------

/** Zahlt die Löhne dieser Runde. */
function payWages(state: GameState, balance: Balance): GameState {
  const summe = payroll(state, balance);
  if (summe <= 0) return state;
  return staffLog({ ...state, cash: cents(state.cash - summe) }, `Löhne für das Personal: ${dollars(summe)} $.`);
}

/**
 * Loyalität je Runde (GDD §11): Lohnstufe, Ehrgeiz ohne Beförderung (je Stufe
 * über 3 minus ambitionDrift), Launen des Genies, Gewissen bei hoher Hitze.
 * „Treu bis zum Tod“ fällt nie unter loyalFloor.
 */
function driftLoyalty(state: GameState, balance: Balance): GameState {
  const l = balance.staff.loyalty;
  const stufe = wageLevel(balance, state.staff!.policies.wage);
  const heiss = state.staff!.heat >= balance.staff.fixer.scandalFrom;
  let out = state;
  for (const m of state.staff!.hired) {
    let delta = stufe.loyalty - l.ambitionDrift * Math.max(0, m.ambition - 3);
    if (hasTrait(m, 'gewissenhaft') && heiss) delta -= l.conscience;
    if (hasTrait(m, 'genie')) {
      const [laune, nach] = mitRng(out, (rng) => rng.int(-l.genieSwing, l.genieSwing));
      out = nach;
      delta += laune;
    }
    out = aendern(out, m.role, (x) => ({ ...x, loyalty: clampLoyalty(x, x.loyalty + delta, balance) }));
  }
  return out;
}

function gehen(state: GameState, role: StaffRole): GameState {
  const staff = state.staff!;
  return mitStaff(state, {
    ...staff,
    hired: staff.hired.filter((m) => m.role !== role),
    orders: role === 'fixer' ? [] : staff.orders,
    drunk: staff.drunk.filter((r) => r !== role),
  });
}

const WER: Record<StaffRole, string> = { secretary: 'Die Kraft im Vorzimmer', fixer: 'Der Sicherheitschef' };

/**
 * Abwerben und Verrat (GDD §11): Unter poachBelow wirbt ein Rivale ab (Gierige
 * doppelt so leicht). Unter betrayBelow und mit Ehrgeiz ab betrayAmbition – oder
 * gewissenhaft bei Hitze (Whistleblower) – verrät jemand Jacob: Der Ehrgeizige
 * gründet eine eigene Firma, der Fixer geht zur Presse (Hitze), die Sekretärin
 * kopiert die Bücher. Wer geht, kommt nicht wieder.
 */
function departures(state: GameState, balance: Balance): GameState {
  const l = balance.staff.loyalty;
  let out = state;
  for (const m of state.staff!.hired) {
    const [[abwerben, verrat], nach] = mitRng(out, (rng) => [rng.float(), rng.float()] as const);
    out = nach;
    if (m.loyalty < l.poachBelow && abwerben < Math.min(1, l.poachChance * (hasTrait(m, 'gierig') ? 2 : 1))) {
      out = markStaff(staffLog(gehen(out, m.role), `${WER[m.role]} kündigt – Bullard zahlt besser.`), STAFF_MARKS.poached);
      continue;
    }
    const whistleblower = hasTrait(m, 'gewissenhaft') && out.staff!.heat > 0;
    if (m.loyalty < l.betrayBelow && (m.ambition >= l.betrayAmbition || whistleblower) && verrat < l.betrayChance) {
      out = gehen(out, m.role);
      if (hasTrait(m, 'ehrgeizig')) {
        out = markStaff(staffLog(out, `${WER[m.role]} geht – und gründet mit Jacobs Kunden eine eigene Firma.`), STAFF_MARKS.ownFirm);
      } else if (m.role === 'fixer' || whistleblower) {
        out = mitStaff(out, { ...out.staff!, heat: Math.min(100, out.staff!.heat + balance.staff.fixer.leakHeat) });
        out = markStaff(staffLog(out, `${WER[m.role]} verschwindet – und packt bei der Presse aus.`), STAFF_MARKS.betrayal);
      } else {
        out = markStaff(staffLog(out, `${WER[m.role]} verschwindet über Nacht. Im Schrank fehlen die Kopien der Bücher.`), STAFF_MARKS.betrayal);
      }
    }
  }
  return out;
}

/**
 * Hitze (GDD §11): sinkt je Runde (beim Verschwiegenen schneller). Ab
 * scandalFrom droht ein Skandal: Strafe und Schweigegeld, danach ist es kühler –
 * oder ein treuer Fixer nimmt die Schuld auf sich und geht dafür ins Gefängnis.
 */
function settleHeat(state: GameState, balance: Balance): GameState {
  const f = balance.staff.fixer;
  const fixer = memberOf(state, 'fixer');
  const abkuehlen = fixer && hasTrait(fixer, 'verschwiegen') ? f.heatDecayDiscreet : f.heatDecay;
  let out = mitStaff(state, { ...state.staff!, heat: Math.max(0, state.staff!.heat - abkuehlen) });
  if (out.staff!.heat < f.scandalFrom) return out;
  const [skandal, nach] = mitRng(out, (rng) => rng.float() < f.scandalChance);
  out = nach;
  if (!skandal) return out;
  out = markStaff(out, STAFF_MARKS.scandal);
  if (fixer && hasTrait(fixer, 'treu')) {
    const weg = gehen(out, 'fixer');
    out = mitStaff(weg, { ...weg.staff!, heat: 0 });
    return staffLog(out, 'Skandal! Der Sicherheitschef nimmt alle Schuld auf sich und geht ins Gefängnis. Jacobs Name fällt nicht.');
  }
  out = mitStaff({ ...out, cash: cents(out.cash - f.scandalFine) }, { ...out.staff!, heat: Math.max(0, out.staff!.heat - f.scandalCool) });
  return staffLog(out, `Skandal! Die Zeitungen schreiben über Jacobs Sicherheitschef. Strafe und Schweigegeld: ${dollars(f.scandalFine)} $.`);
}

/**
 * Briefe zum Personal (STAFF_EVENT_MARKS): Eine Wahl in dieser Runde lobt das
 * Vorzimmer oder den Fixer (Loyalität wie eine Anerkennung) oder schickt den
 * Fixer los (Hitze plus fixer.eventHeat).
 */
function eventHooks(state: GameState, balance: Balance): GameState {
  const jetzt = (m: string) => state.events.marks[m] === state.round;
  let out = state;
  const lob: [string, StaffRole][] = [
    [STAFF_EVENT_MARKS.praiseSecretary, 'secretary'],
    [STAFF_EVENT_MARKS.praiseFixer, 'fixer'],
  ];
  for (const [mark, role] of lob) {
    if (jetzt(mark) && memberOf(out, role)) {
      out = aendern(out, role, (m) => ({ ...m, loyalty: clampLoyalty(m, m.loyalty + balance.staff.loyalty.recognition, balance) }));
    }
  }
  if (jetzt(STAFF_EVENT_MARKS.heat)) out = mitStaff(out, { ...out.staff!, heat: Math.min(100, out.staff!.heat + balance.staff.fixer.eventHeat) });
  return out;
}

/** Neue Runde: Aufträge und Anerkennung sind verbraucht, Trinker fallen vielleicht aus, das Vorzimmer schafft Extra-Termine. */
function nextRound(state: GameState, balance: Balance): GameState {
  const [drunk, nach] = mitRng(state, (rng) =>
    state.staff!.hired.filter((m) => hasTrait(m, 'trinker') && rng.float() < balance.staff.secretary.drunkChance).map((m) => m.role),
  );
  let out = mitStaff(nach, { ...nach.staff!, drunk, recognized: [], orders: [] });
  out = mitStaff(out, refreshCandidates(out.staff!, out.round + 1, balance));
  // Termine (GDD §3): Das Vorzimmer schafft Luft – nicht, wenn Jacob krank im Bett liegt.
  const extra = out.sick > 0 ? 0 : extraAppointments(out, balance);
  if (extra > 0) out = { ...out, agenda: { ...out.agenda, budget: out.agenda.budget + extra } };
  return out;
}

/**
 * 4.9 Andockpunkt (endRound, nach settleAgenda): Das Personal am Rundenende.
 * Ohne Personal und vor staff.unlockChapter passiert nichts; danach wird es
 * freigeschaltet (erste Bewerbungen). Sonst: Verkauf nach Regel, Aufträge,
 * Hitze, Löhne, Loyalität, Abgänge – und die neue Runde.
 */
export function settleStaff(state: GameState, balance: Balance): GameState {
  if (state.finished) return state;
  if (!state.staff) return staffUnlocked(state, balance) ? openStaff(state, balance) : state;
  let out = autoSell(state, balance);
  out = runOrders(out, balance);
  out = eventHooks(out, balance);
  out = payWages(out, balance);
  out = driftLoyalty(out, balance);
  out = departures(out, balance);
  out = settleHeat(out, balance);
  out = nextRound(out, balance);
  return syncStaffMarks(out, balance);
}
