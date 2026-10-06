// Deals im Adressbuch (0.4.20+31, Kapitel 1): neue Karten bei Bank, Eisenbahn, Crane,
// Händler, anderen Ölleuten, Grundbesitzern, Zeitung und Sheriff. Jede ist eine echte
// Abwägung – Geld jetzt gegen Pflicht später, Sicherheit gegen Pfand, Ruf gegen Risiko.
//
// Die Karten stehen in balance.yaml plans.cards (handler = Name hier), ihre Zahlen im
// Block deals, die Texte in content/plans.yaml. Der Zustand liegt in state.deals
// (freiwillig – fehlt er, läuft nichts). Andockpunkte: creditLimit/settleLoans
// (credit.ts: Pfand, Stundung), quoteSale/sellOil/buyerCapacityLeft (transport.ts:
// Kontingent, Vorschuss, Großabnahme), settleRigs (rigs.ts: verliehener Turm) und
// settleDeals im Rundenende (game.ts: Fristen, Miete, Öldiebe).

import { relationFactor } from './network';
import type { Balance } from './balance';
import { bankRate, headroom, quarterInterest, takeLoan } from './credit';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { leaseOf } from './lease';
import type { PlanHandler } from './planHandler';
import { recordAct } from './politics';
import { shiftStanding } from './pricing';
import { producingWells, wellRate } from './production';
import { rentRig, rigReady, rigWell } from './rigs';
import { hallsteadOf } from './hallsteadState';
import { politicsUnlocked } from './lobby';
import { ownsRefinery, productDemand, productPrice, refineryWorld } from './refinery';
import type { Product } from './refineryBalance';
import { Rng, seedFromString } from './rng';
import { buyerPrice, tariff } from './transport';

export interface DealsState {
  /** Karte → erste Runde, in der sie wieder geht. */
  cooldown: Record<string, number>;
  /** Stundung: In dieser Runde zahlt Jacob keine Bankzinsen, sie kommen auf die Schuld (0 = nie). */
  deferRound: number;
  /** Turm, den die Bank als Pfand hält (mehr Bankrahmen). */
  pledgedRig: string | null;
  /** Festtarif bei Thorne: kein Aufschlag, dafür Mindestmenge je Runde per Bahn. */
  railFixed: { from: number; until: number } | null;
  /** Frachtkontingent: so viele Barrel fahren noch ohne Fracht (schon bezahlt), bis einschließlich until. */
  railQuota: { left: number; until: number } | null;
  /** Vorschuss von Crane: so viele Barrel schuldet Jacob Crane noch, zum damaligen Preis, bis einschließlich until. */
  advance: { owed: number; price: number; until: number } | null;
  /** Großabnahme: In dieser Runde nimmt der Händler mehr (0 = nie). */
  bulkRound: number;
  /** Verliehener Turm: zurück nach Runde until. */
  lent: { rigId: string; until: number } | null;
  /** Wache des Sheriffs in dieser Runde (0 = nie). */
  guardRound: number;
  /** 0.4.20+34 Telefon: Wer hat in welcher Runde angerufen (die Karte liegt nur dann auf der Hand). */
  call?: { card: string; round: number } | null;
  /** 0.4.20+34 Sonderkredit der Bank (Anruf): bis Runde due getilgt, sonst steigt der Zins. */
  offerLoan?: { loanId: number; due: number } | null;
  /** 0.4.20+35 Lieferverträge für Raffinerie-Produkte (Marine, Großkunden): je Runde qty zum Festpreis. */
  supply?: SupplyContract[];
  /** 0.4.20+36 Feuerversicherung: bis Runde until, Prämie je Runde (steigt nach jedem Schaden). */
  insurance?: { until: number; premium: number } | null;
  /** 0.4.20+36 Lohnerhöhung: Mehrkosten je Runde bis until. */
  wages?: { until: number; perRound: number } | null;
  /** 0.4.20+37 Lohnbohrer: gemietete Türme mit Rabatt bis until (frühe Rückgabe kostet die Restmiete). */
  crew?: { rigIds: string[]; until: number } | null;
  /** 0.4.20+37 Beteiligung an den Motorwagen-Werken: zahlt ab Kapitel 3 (oder scheitert). */
  autoStake?: { round: number; failed: boolean | null } | null;
  /** 0.4.20+37 Der Abgeordnete will seinen Gefallen zurück: In Runde due ruft er an und fordert amount. */
  favorDebt?: { due: number; amount: number } | null;
}

export interface SupplyContract {
  /** Karte, aus der der Vertrag stammt (je Karte höchstens einer). */
  card: string;
  product: Product;
  qty: number;
  price: number;
  /** Gilt von Runde from bis einschließlich until. */
  from: number;
  until: number;
  shortfall: number;
}

export function newDeals(): DealsState {
  return { cooldown: {}, deferRound: 0, pledgedRig: null, railFixed: null, railQuota: null, advance: null, bulkRound: 0, lent: null, guardRound: 0 };
}

/** Klingelt das Telefon in dieser Runde für diese Karte? */
export function ringing(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>, cardId: string): boolean {
  const c = state.deals?.call;
  return !!c && c.card === cardId && c.round === state.round;
}

/** Wer ruft gerade an (Karten-ID) – oder null. */
export function callerCard(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>): string | null {
  const c = state.deals?.call;
  return c && c.round === state.round ? c.card : null;
}

export function dealsOf(state: Partial<Pick<GameState, 'deals'>>): DealsState {
  return state.deals ?? newDeals();
}

function withDeals(state: GameState, patch: Partial<DealsState>): GameState {
  return { ...state, deals: { ...dealsOf(state), ...patch } };
}

function cooldown(state: GameState, card: string, rounds: number): GameState {
  const d = dealsOf(state);
  return withDeals(state, { cooldown: { ...d.cooldown, [card]: state.round + rounds } });
}

function cooling(state: GameState, card: string): string | null {
  const ab = dealsOf(state).cooldown[card] ?? 0;
  if (ab <= state.round) return null;
  const n = ab - state.round;
  return `Erst wieder in ${n === 1 ? '1 Runde' : `${n} Runden`}.`;
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} $`;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function bbl(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} bbl`;
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

function rng(state: Pick<GameState, 'seed' | 'round'>, tag: string): Rng {
  return new Rng(seedFromString(`${state.seed}:deals:${state.round}:${tag}`));
}

function log(state: GameState, text: string): GameState {
  return { ...state, log: [...state.log, `${formatDate(state)}: ${text}`] };
}

function bankLoans(state: Pick<GameState, 'loans'>) {
  return state.loans.filter((l) => l.source === 'bank');
}

// --- Bank ------------------------------------------------------------------------

/** Bankrahmen-Aufschlag für den verpfändeten Turm (0 ohne Pfand oder wenn der Turm nicht mehr Jacob gehört). */
export function pledgeBonus(state: Partial<Pick<GameState, 'deals' | 'rigs'>>, balance: Balance): number {
  const id = state.deals?.pledgedRig;
  if (!id) return 0;
  return state.rigs?.some((r) => r.id === id && r.kind === 'owned') ? balance.deals.bank.pledge.limitBonus : 0;
}

/** Stundung in dieser Runde: Bankzinsen werden nicht gezahlt, sondern mit Aufschlag auf die Schuld geschlagen. */
export function deferredThisRound(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>): boolean {
  return state.deals?.deferRound === state.round;
}

/**
 * Bank nimmt den Pfandturm nach einer versäumten Zahlung: Er gehört ihr, Jacob mietet ihn
 * weiter (Miete je Runde wie ein Mietturm). Ohne Pfand unverändert.
 */
export function seizePledge(state: GameState): GameState {
  const id = state.deals?.pledgedRig;
  if (!id) return state;
  const rig = state.rigs.find((r) => r.id === id && r.kind === 'owned');
  const ohne = withDeals(state, { pledgedRig: null });
  if (!rig) return ohne;
  return log({ ...ohne, rigs: ohne.rigs.map((r) => (r.id === id ? { ...r, kind: 'rented' as const } : r)) }, 'Zahlung versäumt – die Bank nimmt den verpfändeten Bohrturm. Jacob darf ihn mieten.');
}

const bankZins: PlanHandler = {
  lock(state, balance) {
    if (bankLoans(state).length === 0) return 'Jacob hat keinen Bankkredit.';
    if (balance.deals.bank.rate.chance[state.rating] === 0) return `Mit Rating ${state.rating} verhandelt die Bank nicht.`;
    if (bankLoans(state).every((l) => l.rate <= balance.deals.bank.rate.floor)) return 'Billiger gibt die Bank kein Geld.';
    return cooling(state, 'bank_zins');
  },
  detail(state, balance) {
    const r = balance.deals.bank.rate;
    return `Mit Rating ${state.rating} gibt Mr. Pettibone mit ${percent(r.chance[state.rating])} nach: −${percent(r.cut)} Zins auf alle Bankkredite.`;
  },
  apply(state, balance) {
    const r = balance.deals.bank.rate;
    const ja = rng(state, 'bank_zins').float() < r.chance[state.rating];
    const s = cooldown(state, 'bank_zins', r.cooldown);
    if (!ja) return log(s, 'Mr. Pettibone hört zu, nickt – und bleibt beim Zins.');
    const loans = s.loans.map((l) => (l.source === 'bank' ? { ...l, rate: Math.max(r.floor, Math.round((l.rate - r.cut) * 10000) / 10000) } : l));
    return log({ ...s, loans }, `Die Bank senkt den Zins aller Bankkredite um ${percent(r.cut)}.`);
  },
};

const bankStundung: PlanHandler = {
  lock(state) {
    if (bankLoans(state).length === 0) return 'Jacob hat keinen Bankkredit.';
    if (deferredThisRound(state)) return 'Die Zinsen dieser Runde sind schon gestundet.';
    return cooling(state, 'bank_stundung');
  },
  detail(state, balance) {
    const z = cents(bankLoans(state).reduce((s, l) => s + quarterInterest(l), 0));
    return `Fällig diese Runde: ${money(z)} Bankzinsen – gestundet kommen ${money(z * (1 + balance.deals.bank.defer.surcharge))} auf die Schuld.`;
  },
  apply(state, balance) {
    return log(cooldown(withDeals(state, { deferRound: state.round }), 'bank_stundung', balance.deals.bank.defer.cooldown), 'Die Bank stundet die Zinsen dieser Runde – gegen Aufschlag.');
  },
};

function pledgeable(state: GameState) {
  const d = dealsOf(state);
  return state.rigs.find((r) => r.kind === 'owned' && r.id !== d.lent?.rigId);
}

const bankPfand: PlanHandler = {
  lock(state) {
    if (dealsOf(state).pledgedRig && state.rigs.some((r) => r.id === dealsOf(state).pledgedRig && r.kind === 'owned')) return 'Die Bank hält schon einen Turm als Pfand.';
    if (!pledgeable(state)) return 'Jacob besitzt keinen eigenen Bohrturm (gekauft, nicht geliehen oder gemietet).';
    return null;
  },
  detail(_state, balance) {
    return `Bankrahmen +${money(balance.deals.bank.pledge.limitBonus)}. Versäumt Jacob eine Zahlung, gehört der Turm der Bank.`;
  },
  apply(state) {
    const rig = pledgeable(state);
    if (!rig) return state;
    return log(withDeals(state, { pledgedRig: rig.id }), 'Ein Bohrturm steht jetzt als Pfand bei der Bank – der Kreditrahmen wächst.');
  },
};

// --- Eisenbahn -------------------------------------------------------------------

/** Ist in dieser Runde ein Festtarif mit Mindestmenge fällig? */
export function railFixedActive(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>, round = state.round): boolean {
  const f = state.deals?.railFixed;
  return !!f && round >= f.from && round <= f.until;
}

const bahnFesttarif: PlanHandler = {
  lock(state) {
    const f = dealsOf(state).railFixed;
    if (f && f.until >= state.round) return 'Der Festtarif läuft noch.';
    return null;
  },
  options(_state, balance) {
    const f = balance.deals.rail.fixed;
    return f.rounds.map((r) => ({ id: String(r), label: `${r} Runden fester Tarif · mindestens ${bbl(f.minimum)} je Runde per Bahn`, reason: null }));
  },
  detail(_state, balance) {
    const f = balance.deals.rail.fixed;
    return `Thorne erhöht nicht, solange der Vertrag läuft. Jedes fehlende Barrel unter ${bbl(f.minimum)} kostet ${f.shortfall.toLocaleString('de-DE')} $.`;
  },
  apply(state, balance, target) {
    const r = Number(target ?? balance.deals.rail.fixed.rounds[0]);
    const until = state.round + r;
    const fr = state.freight;
    const s = withDeals({ ...state, freight: { ...fr, freezeUntil: Math.max(fr.freezeUntil, until) } }, { railFixed: { from: state.round + 1, until } });
    return log(s, `Thorne unterschreibt: ${r} Runden fester Tarif, dafür mindestens ${bbl(balance.deals.rail.fixed.minimum)} je Runde per Bahn.`);
  },
};

function quotaCost(state: GameState, balance: Balance, size: number): number {
  return cents(size * tariff(state, balance, 'rail') * (1 - balance.deals.rail.quota.discount));
}

const bahnKontingent: PlanHandler = {
  lock(state) {
    const q = dealsOf(state).railQuota;
    if (q && q.left > 0 && q.until >= state.round) return `Es sind noch ${bbl(q.left)} aus dem letzten Kontingent übrig.`;
    return null;
  },
  options(state, balance) {
    return balance.deals.rail.quota.sizes.map((n) => {
      const preis = quotaCost(state, balance, n);
      return { id: String(n), label: `${bbl(n)} Fracht für ${money(preis)}`, reason: state.cash < preis ? `Nicht genug Geld (${money(preis)}).` : null };
    });
  },
  cost(state, balance, target) {
    return target ? quotaCost(state, balance, Number(target)) : 0;
  },
  detail(_state, balance) {
    const q = balance.deals.rail.quota;
    return `Heute zahlen, ${percent(q.discount)} unter dem Tarif. Gilt ${q.rounds} Runden – was dann nicht gefahren ist, verfällt.`;
  },
  apply(state, balance, target) {
    const n = Number(target ?? balance.deals.rail.quota.sizes[0]);
    return log(withDeals(state, { railQuota: { left: n, until: state.round + balance.deals.rail.quota.rounds - 1 } }), `Frachtkontingent bei Thorne gekauft: ${bbl(n)} fahren ohne weitere Fracht.`);
  },
};

// --- Crane und Händler -------------------------------------------------------------

/**
 * 0.4.20+42: Kapitel-1-Deals gelten auch später – ihre Mengen wachsen mit dem Kapitel (deals.chapterScale),
 * sonst wären 3.000 bbl Vorschuss in Kapitel 3 ein Witz.
 */
export function dealScale(state: Pick<GameState, 'chapter'>, balance: Balance): number {
  const k = balance.deals.chapterScale;
  return k[Math.min(k.length, Math.max(1, state.chapter ?? 1)) - 1];
}

/** Vorschuss in $: Preis × Menge × (1 − Abschlag), eine gute Beziehung zu Crane drückt den Abschlag (höchstens auf 0). */
function advanceCash(state: GameState, balance: Balance, n: number, preis: number): number {
  const a = balance.deals.crane.advance;
  return cents(n * preis * Math.min(1, (1 - a.discount) * relationFactor(state, balance, 'crane')));
}

const craneVorschuss: PlanHandler = {
  lock(state) {
    if (dealsOf(state).advance) return 'Der letzte Vorschuss ist noch nicht abgeliefert.';
    return null;
  },
  options(state, balance) {
    const a = balance.deals.crane.advance;
    const preis = buyerPrice(state, balance, 'crane');
    return a.sizes.map((x) => x * dealScale(state, balance)).map((n) => ({ id: String(n), label: `${bbl(n)} – sofort ${money(advanceCash(state, balance, n, preis))}`, reason: null }));
  },
  detail(_state, balance) {
    const a = balance.deals.crane.advance;
    return `Crane zahlt ${percent(1 - a.discount)} seines Preises sofort. Liefern bis Ende der ${a.rounds === 1 ? 'Runde' : `${a.rounds}. Runde`} – sonst den Rest mit ${percent(a.penalty)} Aufschlag zurück.`;
  },
  apply(state, balance, target) {
    const a = balance.deals.crane.advance;
    const n = Number(target ?? a.sizes[0] * dealScale(state, balance));
    const preis = buyerPrice(state, balance, 'crane');
    const geld = advanceCash(state, balance, n, preis);
    const s = withDeals({ ...state, cash: cents(state.cash + geld) }, { advance: { owed: n, price: preis, until: state.round + a.rounds - 1 } });
    return log(s, `Crane zahlt ${money(geld)} Vorschuss auf ${bbl(n)}.`);
  },
};

/** Großabnahme: So viel nimmt der Händler in dieser Runde zusätzlich. */
export function bulkExtra(state: Partial<Pick<GameState, 'deals' | 'round'>>, balance: Balance): number {
  return state.round !== undefined && state.deals?.bulkRound === state.round ? balance.deals.trader.bulk.extra * dealScale(state as Pick<GameState, 'chapter'>, balance) : 0;
}

const haendlerGrossabnahme: PlanHandler = {
  lock(state) {
    if (dealsOf(state).bulkRound === state.round) return 'Der Händler nimmt diese Runde schon mehr.';
    return cooling(state, 'haendler_grossabnahme');
  },
  detail(_state, balance) {
    return `Der Händler nimmt diese Runde ${bbl(balance.deals.trader.bulk.extra * dealScale(_state, balance))} mehr – zu seinem Preis. Crane merkt sich jeden Händlerverkauf.`;
  },
  apply(state, balance) {
    const s = cooldown(withDeals(state, { bulkRound: state.round }), 'haendler_grossabnahme', balance.deals.trader.bulk.cooldown);
    return log(s, `Der Händler in Port Ellis nimmt diese Runde ${bbl(balance.deals.trader.bulk.extra * dealScale(state, balance))} mehr.`);
  },
};

// --- Verkauf: Kontingent und Vorschuss ------------------------------------------------

/**
 * Wie ein Verkauf die Deals berührt: Bahn-Barrel aus dem Kontingent zahlen keine Fracht
 * mehr (freight = gesparte Fracht), an Crane gelieferte Vorschuss-Barrel bringen kein Geld
 * mehr (prepaid = schon bezahlter Bruttoerlös).
 */
export function saleAdjust(
  state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>,
  mode: string,
  buyer: string,
  barrels: number,
  price: number,
  freightPerBarrel: number,
): { quota: number; owed: number; freight: number; prepaid: number } {
  const d = state.deals;
  const q = d?.railQuota && mode === 'rail' && d.railQuota.until >= state.round ? Math.min(barrels, d.railQuota.left) : 0;
  const o = d?.advance && buyer === 'crane' ? Math.min(barrels, d.advance.owed) : 0;
  return { quota: q, owed: o, freight: cents(q * freightPerBarrel), prepaid: cents(o * price) };
}

/** Nach einem Verkauf: Kontingent und Vorschuss-Schuld herunterzählen. */
export function afterSale(state: GameState, quota: number, owed: number): GameState {
  if (quota === 0 && owed === 0) return state;
  const d = dealsOf(state);
  return withDeals(state, {
    railQuota: d.railQuota && quota > 0 ? { ...d.railQuota, left: d.railQuota.left - quota } : d.railQuota,
    advance: d.advance && owed > 0 ? { ...d.advance, owed: d.advance.owed - owed } : d.advance,
  });
}

// --- Andere Ölleute: Turm verleihen ----------------------------------------------------

function lendable(state: GameState) {
  const d = dealsOf(state);
  return state.rigs.find((r) => r.kind === 'owned' && rigReady(state, r) && !rigWell(state, r.id) && r.id !== d.pledgedRig);
}

/** Ist dieser Turm gerade verliehen? (settleRigs meldet seine Rückkehr nicht als Lieferung.) */
export function rigLent(state: Partial<Pick<GameState, 'deals'>>, rigId: string): boolean {
  return state.deals?.lent?.rigId === rigId;
}

const turmVerleihen: PlanHandler = {
  lock(state) {
    if (dealsOf(state).lent) return 'Ein Turm ist schon verliehen.';
    if (!lendable(state)) return 'Kein eigener Turm steht gerade still (gekauft, nicht verpfändet).';
    return null;
  },
  options(_state, balance) {
    const l = balance.deals.rig.lend;
    return l.rounds.map((r) => ({ id: String(r), label: `${r} Runden für ${money(r * l.rent)}`, reason: null }));
  },
  detail(_state, balance) {
    const l = balance.deals.rig.lend;
    return `Miete ${money(l.rent)} je Runde. Mit ${percent(l.damage)} kommt der Turm beschädigt zurück (Reparatur ${money(l.repair)}).`;
  },
  apply(state, balance, target) {
    const rig = lendable(state);
    if (!rig) return state;
    const r = Number(target ?? balance.deals.rig.lend.rounds[0]);
    const until = state.round + r - 1;
    const s = withDeals({ ...state, rigs: state.rigs.map((x) => (x.id === rig.id ? { ...x, readyRound: until + 1 } : x)) }, { lent: { rigId: rig.id, until } });
    return log(s, `Ein Bohrturm geht für ${r} Runden an einen Nachbarn.`);
  },
};

// --- Grundbesitzer: Förderzins nachverhandeln --------------------------------------------

/** Einmalzahlung für die Senkung des Förderzinses auf dieser Ranch (0, wenn dort nichts fördert). */
export function royaltyPrice(state: GameState, balance: Balance, parcelId: string): number {
  const r = balance.deals.royalty;
  const rate = producingWells(state)
    .filter((w) => w.parcelId === parcelId)
    .reduce((s, w) => s + wellRate(balance, w, state.wells.length), 0);
  return Math.round(rate * r.horizon * r.cut * state.postedPrice * r.priceShare);
}

const foerderzins: PlanHandler = {
  lock(state, balance, target) {
    const c = cooling(state, 'foerderzins');
    if (c) return c;
    if (!target) return null;
    const l = leaseOf(state, target);
    if (!l || l.holder !== 'jacob') return 'Keine eigene Pacht.';
    if (l.royalty - balance.deals.royalty.cut < balance.deals.royalty.floor) return 'Der Förderzins ist schon niedrig.';
    const preis = royaltyPrice(state, balance, target);
    if (preis <= 0) return 'Auf dieser Ranch fördert noch nichts.';
    if (state.cash < preis) return `Nicht genug Geld: Der Besitzer will ${money(preis)}.`;
    return null;
  },
  detail(state, balance) {
    const r = balance.deals.royalty;
    const teile = state.leases
      .filter((l) => l.holder === 'jacob' && royaltyPrice(state, balance, l.parcelId) > 0)
      .map((l) => `${state.parcels.find((p) => p.id === l.parcelId)?.name ?? l.parcelId}: ${percent(l.royalty)} → ${percent(l.royalty - r.cut)} für ${money(royaltyPrice(state, balance, l.parcelId))}`);
    return teile.length > 0 ? `Gezahlt wird nur, wenn er annimmt (Chance ${percent(r.chance)}). ${teile.join(' · ')}` : null;
  },
  apply(state, balance, target) {
    const r = balance.deals.royalty;
    if (!target) return state;
    const preis = royaltyPrice(state, balance, target);
    const s = cooldown(state, 'foerderzins', r.cooldown);
    const name = state.parcels.find((p) => p.id === target)?.name ?? target;
    const chance = Math.max(0, Math.min(1, r.chance + state.wildcatterStanding));
    if (preis <= 0 || s.cash < preis || rng(state, `foerderzins:${target}`).float() >= chance) return log(s, `Der Besitzer von ${name} will vom Förderzins nichts abgeben.`);
    const leases = s.leases.map((l) => (l.parcelId === target ? { ...l, royalty: Math.round((l.royalty - r.cut) * 1000) / 1000 } : l));
    return log({ ...s, leases, cash: cents(s.cash - preis) }, `Der Besitzer von ${name} nimmt ${money(preis)} und senkt den Förderzins um ${percent(r.cut)}.`);
  },
};

// --- Zeitung und Sheriff ------------------------------------------------------------

const interview: PlanHandler = {
  lock(state) {
    return cooling(state, 'interview');
  },
  detail(state, balance) {
    const i = balance.deals.interview;
    const gerede = (state.pricing?.rumours.count ?? 0) > 0;
    return `Gute Presse mit ${percent(i.chance - (gerede ? i.rumourPenalty : 0))}${gerede ? ' – die Gerüchte von neulich hat Nora nicht vergessen' : ''}.`;
  },
  apply(state, balance) {
    const i = balance.deals.interview;
    const chance = i.chance - ((state.pricing?.rumours.count ?? 0) > 0 ? i.rumourPenalty : 0);
    const gut = rng(state, 'interview').float() < chance;
    const s = cooldown(shiftStanding(state, balance, gut ? i.shift : -i.shift), 'interview', i.cooldown);
    return log(s, gut ? 'Der Courier druckt das Gespräch – die anderen Ölleute lesen es gern.' : 'Nora Whitlock schreibt, was sie gesehen hat. Die anderen Ölleute rümpfen die Nase.');
  },
};

const wache: PlanHandler = {
  lock(state) {
    return dealsOf(state).guardRound === state.round ? 'Die Wache steht schon.' : null;
  },
  detail(_state, balance) {
    const t = balance.deals.theft;
    return `Ab ${bbl(t.minStock)} im Tank kommen Öldiebe mit ${percent(t.chance)} je Runde und nehmen ${percent(t.loss)}. Die Wache hält sie diese Runde fern.`;
  },
  apply(state) {
    return log(withDeals(state, { guardRound: state.round }), 'Sheriff Tatum stellt diese Runde einen Mann an die Tanks.');
  },
};

// --- Telefon: Anrufe (ab Kapitel 2) -------------------------------------------------------

const bankAngebot: PlanHandler = {
  lock(state, balance) {
    if (dealsOf(state).offerLoan) return 'Der letzte Sonderkredit läuft noch.';
    if (headroom(state, balance) < balance.deals.bank.offer.sizes[0]) return 'Der Kreditrahmen reicht dafür nicht.';
    return null;
  },
  options(state, balance) {
    const o = balance.deals.bank.offer;
    const zins = Math.max(o.floor, bankRate(state, balance, false) - o.discount);
    const frei = headroom(state, balance);
    return o.sizes.map((n) => ({ id: String(n), label: `${money(n)} zu ${percent(zins)}, zurück in ${o.rounds} Runden`, reason: n > frei ? `Rahmen frei: ${money(frei)}.` : null }));
  },
  detail(_state, balance) {
    const o = balance.deals.bank.offer;
    return `Vorzugszins nur heute. Ist der Kredit nach ${o.rounds} Runden nicht getilgt, kostet er ${percent(o.penalty)} mehr Zins.`;
  },
  apply(state, balance, target) {
    const o = balance.deals.bank.offer;
    const n = Number(target ?? o.sizes[0]);
    const zins = Math.max(o.floor, bankRate(state, balance, false) - o.discount);
    const r = takeLoan(state, balance, n);
    if (!r.ok) return log(state, `Die Bank kann den Sonderkredit doch nicht geben: ${r.reason}`);
    const loans = r.state.loans.map((l) => (l.id === r.loan.id ? { ...l, rate: zins } : l));
    return log(withDeals({ ...r.state, loans }, { offerLoan: { loanId: r.loan.id, due: state.round + o.rounds } }), `Sonderkredit der Bank: ${money(n)} zu ${percent(zins)}.`);
  },
};

// --- Raffinerie: Lieferverträge (Marine, Großkunden) ----------------------------------------

const PRODUKT: Record<Product, string> = { kerosene: 'Kerosin', lubricant: 'Schmieröl', fuelOil: 'Heizöl', gasoline: 'Benzin' };

/** Laufende Lieferverträge in dieser Runde. */
export function activeSupply(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>, round = state.round): SupplyContract[] {
  return (state.deals?.supply ?? []).filter((c) => round >= c.from && round <= c.until);
}

/** Festpreis eines neuen Vertrags: der heutige Großhandelspreis bei normaler Abnahme × (1 + Aufschlag). */
export function supplyPrice(state: GameState, balance: Balance, product: Product, premium: number): number {
  const world = refineryWorld(state, balance);
  return cents(productPrice(product, productDemand(product, world, balance), state.postedPrice, world, balance) * (1 + premium));
}

function supplyDeal(card: string, key: keyof Balance['deals']['supply']): PlanHandler {
  return {
    lock(state) {
      if (!ownsRefinery(state) || (state.refinery?.level ?? 0) < 1) return 'Erst braucht Jacob eine laufende Raffinerie.';
      if ((state.deals?.supply ?? []).some((c) => c.card === card && c.until >= state.round)) return 'Der Vertrag läuft noch.';
      return null;
    },
    options(state, balance) {
      const c = balance.deals.supply[key];
      const preis = supplyPrice(state, balance, c.product, c.premium);
      return c.sizes.map((n) => ({ id: String(n), label: `${bbl(n)} ${PRODUKT[c.product]} je Runde zu ${preis.toLocaleString('de-DE')} $ · ${c.rounds} Runden`, reason: null }));
    },
    detail(_state, balance) {
      const c = balance.deals.supply[key];
      return `Fester Preis, egal wohin der Ölpreis geht. Die Vertragsmenge drückt den Großhandel nicht. Jedes fehlende Barrel kostet ${c.shortfall.toLocaleString('de-DE')} $.`;
    },
    apply(state, balance, target) {
      const c = balance.deals.supply[key];
      const qty = Number(target ?? c.sizes[0]);
      const price = supplyPrice(state, balance, c.product, c.premium);
      const neu: SupplyContract = { card, product: c.product, qty, price, from: state.round, until: state.round + c.rounds - 1, shortfall: c.shortfall };
      const alt = (state.deals?.supply ?? []).filter((x) => x.card !== card && x.until >= state.round);
      return log(withDeals(state, { supply: [...alt, neu] }), `Liefervertrag: ${bbl(qty)} ${PRODUKT[c.product]} je Runde zu ${price.toLocaleString('de-DE')} $, ${c.rounds} Runden.`);
    },
  };
}

/**
 * Für den Lauf der Raffinerie: wie viel eines Produkts an Verträge geht und was es bringt. Die Raffinerie
 * verkauft davon nur den Rest an den Großhandel (planRun).
 */
export function contractedOutput(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>, product: Product, output: number): { qty: number; revenue: number } {
  let rest = output;
  let revenue = 0;
  let qty = 0;
  for (const c of activeSupply(state).filter((x) => x.product === product)) {
    const n = Math.min(rest, c.qty);
    rest -= n;
    qty += n;
    revenue += n * c.price;
  }
  return { qty, revenue: cents(revenue) };
}

/** Nach dem Lauf der Raffinerie: Strafe für fehlende Vertragsmengen (auch bei Stillstand). */
export function supplyShortfall(state: GameState, output: Partial<Record<Product, number>>): GameState {
  let s = state;
  const rest: Partial<Record<Product, number>> = { ...output };
  for (const c of activeSupply(state)) {
    const da = Math.min(rest[c.product] ?? 0, c.qty);
    rest[c.product] = (rest[c.product] ?? 0) - da;
    const fehlt = c.qty - da;
    if (fehlt > 0) s = log({ ...s, cash: cents(s.cash - fehlt * c.shortfall) }, `Liefervertrag: ${bbl(fehlt)} ${PRODUKT[c.product]} fehlen – Vertragsstrafe ${money(fehlt * c.shortfall)}.`);
  }
  return s;
}

// --- Versicherung, Arbeiter, Presse (Kapitel 2) ---------------------------------------------

/** Prämie je Runde: Grundbetrag + Anteil am Wert von Raffinerie und Tanks. */
export function insurancePremium(state: GameState, balance: Balance): number {
  const i = balance.deals.insurance;
  const tanks = state.logistics.tanks * balance.transport.storage.tankCost;
  const raff = state.refinery && (state.refinery.level > 0 || state.refinery.project) ? balance.refinery.buildCost + Math.max(0, state.refinery.level - 1) * balance.refinery.expandCost : 0;
  return Math.round(i.base + i.share * (tanks + raff));
}

/** Ist Jacob in dieser Runde versichert? */
export function insured(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>): boolean {
  const v = state.deals?.insurance;
  return !!v && v.until >= state.round;
}

/** Schaden melden: Mit Versicherung zahlt sie (Anteil cover), die Prämie steigt danach. Ohne Versicherung unverändert. */
export function insuranceClaim(state: GameState, balance: Balance, schaden: number, was: string): GameState {
  if (!insured(state) || schaden <= 0) return state;
  const i = balance.deals.insurance;
  const zahlt = cents(schaden * i.cover);
  const v = state.deals!.insurance!;
  return log(withDeals({ ...state, cash: cents(state.cash + zahlt) }, { insurance: { ...v, premium: Math.round(v.premium * (1 + i.claimRaise)) } }), `Die Versicherung zahlt ${money(zahlt)} für ${was} – die Prämie steigt.`);
}

const versicherung: PlanHandler = {
  lock(state) {
    if (insured(state)) return 'Die Versicherung läuft noch.';
    return null;
  },
  options(state, balance) {
    const p = insurancePremium(state, balance);
    return balance.deals.insurance.rounds.map((r) => ({ id: String(r), label: `${r} Runden · ${money(p)} je Runde`, reason: null }));
  },
  detail(_state, balance) {
    const i = balance.deals.insurance;
    return `Zahlt ${percent(i.cover)} bei Feuer in Raffinerie oder Tanks. Nach jedem Schaden steigt die Prämie um ${percent(i.claimRaise)}.`;
  },
  apply(state, balance, target) {
    const r = Number(target ?? balance.deals.insurance.rounds[0]);
    const p = insurancePremium(state, balance);
    return log(withDeals(state, { insurance: { until: state.round + r - 1, premium: p } }), `Feuerversicherung abgeschlossen: ${r} Runden, ${money(p)} je Runde.`);
  },
};

function lohnJeRunde(state: GameState, balance: Balance): number {
  return Math.round(balance.deals.workers.raise.perWell * Math.max(1, producingWells(state).length));
}

function arbeiterRuf(state: GameState, delta: number): GameState {
  const r = state.reputation;
  const alt = r?.workers ?? 0;
  return { ...state, reputation: { ...(r ?? { public: 0, politics: 0, workers: 0, industryRespect: 0, industryFear: 0, standing: 0 }), workers: Math.max(-100, Math.min(100, alt + delta)) } };
}

function oeffentlich(state: GameState, delta: number): GameState {
  const r = state.reputation;
  return { ...state, reputation: { ...(r ?? { public: 0, politics: 0, workers: 0, industryRespect: 0, industryFear: 0, standing: 0 }), public: Math.max(-100, Math.min(100, (r?.public ?? 0) + delta)) } };
}

const lohnerhoehung: PlanHandler = {
  lock(state) {
    const w = state.deals?.wages;
    if (w && w.until >= state.round) return 'Die Lohnerhöhung läuft noch.';
    return null;
  },
  detail(state, balance) {
    const w = balance.deals.workers.raise;
    return `${money(lohnJeRunde(state, balance))} mehr Lohn je Runde, ${w.rounds} Runden. Die Bohrtrupps danken es mit Arbeit (Ruf bei den Arbeitern +${w.reputation}).`;
  },
  apply(state, balance) {
    const w = balance.deals.workers.raise;
    const s = withDeals(arbeiterRuf(state, w.reputation), { wages: { until: state.round + w.rounds - 1, perRound: lohnJeRunde(state, balance) } });
    return log(s, 'Jacob sagt den Bohrtrupps mehr Lohn zu.');
  },
};

const streikDroht: PlanHandler = {
  options(state, balance) {
    const s = balance.deals.workers.strike;
    const zahl = Math.round(s.dealPerWell * Math.max(1, producingWells(state).length));
    return [
      { id: 'verhandeln', label: `Verhandeln – ${money(zahl)} mehr Lohn, einmalig`, reason: state.cash < zahl ? `Nicht genug Geld (${money(zahl)}).` : null },
      { id: 'streikbrecher', label: `Streikbrecher holen – ${money(s.breakerCost)}, die Zeitungen schreiben darüber`, reason: state.cash < s.breakerCost ? `Nicht genug Geld (${money(s.breakerCost)}).` : null },
    ];
  },
  cost(state, balance, target) {
    const s = balance.deals.workers.strike;
    return target === 'streikbrecher' ? s.breakerCost : target === 'verhandeln' ? Math.round(s.dealPerWell * Math.max(1, producingWells(state).length)) : 0;
  },
  detail(_state, balance) {
    const s = balance.deals.workers.strike;
    return `Wer nicht reagiert, hat am Rundenende einen Streik: ${percent(s.loss)} weniger Förderung.`;
  },
  apply(state, balance, target) {
    const s = balance.deals.workers.strike;
    if (target === 'streikbrecher') return log(recordAct(arbeiterRuf(state, -s.breakerReputation), 'strike_break'), 'Streikbrecher aus Port Ellis halten die Bohrtürme in Gang. Die Zeitungen sind voll davon.');
    return log(arbeiterRuf(state, s.dealReputation), 'Jacob einigt sich mit dem Vormann – kein Streik.');
  },
};

const anzeigen: PlanHandler = {
  cost(_state, balance) {
    return balance.deals.press.ads.cost;
  },
  lock(state) {
    return cooling(state, 'anzeigen');
  },
  detail(_state, balance) {
    const a = balance.deals.press.ads;
    return `Ganzseitige Anzeigen in Hallstead: öffentlicher Ruf +${a.reputation}. Mit ${percent(a.backlash)} wittern die Leser Bestechung.`;
  },
  apply(state, balance) {
    const a = balance.deals.press.ads;
    const s = cooldown(state, 'anzeigen', a.cooldown);
    if (rng(state, 'anzeigen').float() < a.backlash) return log(recordAct(oeffentlich(s, -a.reputation), 'press_scandal'), 'Die Anzeigen gehen nach hinten los – „Was hat Harlan zu verbergen?“');
    return log(recordAct(oeffentlich(s, a.reputation), 'press_praise'), 'Die Anzeigen wirken: Harlan Oil steht gut da.');
  },
};

const interviewPresse: PlanHandler = {
  lock(state) {
    return cooling(state, 'interview_presse');
  },
  detail(_state, balance) {
    const i = balance.deals.press.interview;
    return `Nora Whitlock fragt nach. Gute Presse mit ${percent(i.chance)}: öffentlicher Ruf ±${i.reputation}.`;
  },
  apply(state, balance) {
    const i = balance.deals.press.interview;
    const gut = rng(state, 'interview_presse').float() < i.chance;
    const s = cooldown(oeffentlich(state, gut ? i.reputation : -i.reputation), 'interview_presse', i.cooldown);
    return log(gut ? recordAct(s, 'press_praise') : s, gut ? 'Noras Artikel ist fair – die Leser mögen Jacob.' : 'Nora schreibt, was sie gesehen hat. Es ist nicht schmeichelhaft.');
  },
};

// --- Lohnbohrer, Ausrüster, Motorwagen, Abgeordneter (Kapitel 2) --------------------------------

const ausruesterSammel: PlanHandler = {
  options(state, balance) {
    const a = balance.deals.outfitter;
    return a.rigs.map((n) => {
      const preis = Math.round(n * balance.drilling.rigs.buy.cost * (1 - a.discount));
      return { id: String(n), label: `${n} Bohrtürme für ${money(preis)} · Lieferung in ${a.delivery} Runden`, reason: state.cash < preis ? `Nicht genug Geld (${money(preis)}).` : null };
    });
  },
  cost(_state, balance, target) {
    const a = balance.deals.outfitter;
    return target ? Math.round(Number(target) * balance.drilling.rigs.buy.cost * (1 - a.discount)) : 0;
  },
  detail(_state, balance) {
    const a = balance.deals.outfitter;
    return `${percent(a.discount)} unter dem Einzelpreis, dafür ${a.delivery} statt ${balance.drilling.rigs.buy.deliveryRounds} Runde Lieferzeit.`;
  },
  apply(state, balance, target) {
    const a = balance.deals.outfitter;
    const n = Number(target ?? a.rigs[0]);
    const rigs = [...state.rigs];
    for (let i = 0; i < n; i++) {
      const id = `t${Math.max(0, ...rigs.map((r) => Number(r.id.replace(/\D/g, '')) || 0)) + 1}`;
      rigs.push({ id, kind: 'owned', readyRound: state.round + a.delivery, steam: false, rods: false });
    }
    return log({ ...state, rigs }, `Sammelbestellung beim Ausrüster: ${n} Bohrtürme, Lieferung in ${a.delivery} Runden.`);
  },
};

function crewRent(balance: Balance): number {
  return balance.drilling.rigs.rent.costPerRound * (1 - balance.deals.crew.discount);
}

/** Lohnbohrer-Turm vor Vertragsende zurückgeben: Restmiete (mit Rabatt) ist fällig. 0 ohne Vertrag. */
export function crewReturnCost(state: Pick<GameState, 'round'> & Partial<Pick<GameState, 'deals'>>, balance: Balance, rigId: string): number {
  const c = state.deals?.crew;
  if (!c || !c.rigIds.includes(rigId) || c.until <= state.round) return 0;
  return Math.round((c.until - state.round) * crewRent(balance));
}

const lohnbohrer: PlanHandler = {
  lock(state) {
    const c = state.deals?.crew;
    if (c && c.until >= state.round) return 'Der Vertrag mit den Lohnbohrern läuft noch.';
    return null;
  },
  detail(_state, balance) {
    const c = balance.deals.crew;
    return `${c.rigs} Mietürme für ${c.rounds} Runden, je ${money(crewRent(balance))} statt ${money(balance.drilling.rigs.rent.costPerRound)}. Wer früher zurückgibt, zahlt die Restmiete.`;
  },
  apply(state, balance) {
    const c = balance.deals.crew;
    let s = state;
    const ids: string[] = [];
    for (let i = 0; i < c.rigs; i++) {
      const r = rentRig(s, balance);
      if (!r.ok) break;
      ids.push(r.state.rigs[r.state.rigs.length - 1].id);
      s = r.state;
    }
    if (ids.length === 0) return log(state, 'Die Lohnbohrer haben gerade keinen Turm frei.');
    return log(withDeals(s, { crew: { rigIds: ids, until: state.round + c.rounds - 1 } }), `Lohnbohrer unter Vertrag: ${ids.length} Türme für ${c.rounds} Runden.`);
  },
};

const motorwagenBeteiligung: PlanHandler = {
  lock(state, balance) {
    if (state.deals?.autoStake) return 'Jacob ist schon beteiligt.';
    if (state.cash < balance.deals.motor.stake.cost) return `Nicht genug Geld (${money(balance.deals.motor.stake.cost)}).`;
    return null;
  },
  cost(_state, balance) {
    return balance.deals.motor.stake.cost;
  },
  detail(_state, balance) {
    const m = balance.deals.motor.stake;
    return `Ab Kapitel 3 ${money(m.income)} je Runde – wenn die Fabrik nicht scheitert (${percent(m.fail)}).`;
  },
  apply(state, balance) {
    return log(withDeals(state, { autoStake: { round: state.round, failed: null } }), `Jacob beteiligt sich mit ${money(balance.deals.motor.stake.cost)} an den Föderalen Motorwagen-Werken.`);
  },
};

const abgeordneterStimme: PlanHandler = {
  visible(state, balance) {
    return politicsUnlocked(state, balance);
  },
  lock(state) {
    if (state.deals?.favorDebt) return 'Der Abgeordnete wartet noch auf seinen Gefallen.';
    return null;
  },
  cost(_state, balance) {
    return balance.deals.deputy.donation;
  },
  detail(_state, balance) {
    const d = balance.deals.deputy;
    return `${d.favors} Gefallen sofort. In ${d.rounds} Runden ruft er wieder an und will ${money(d.demand)} – wer ablehnt, verliert Ansehen in der Politik.`;
  },
  apply(state, balance) {
    const d = balance.deals.deputy;
    const h = hallsteadOf(state, balance);
    const s = { ...state, hallstead: { ...h, lobby: { ...h.lobby, favors: h.lobby.favors + d.favors } } };
    return log(withDeals(s, { favorDebt: { due: state.round + d.rounds, amount: d.demand } }), `Der Abgeordnete nimmt die Spende. Man schuldet Jacob ${d.favors} Gefallen – und er Jacob bald einen.`);
  },
};

function politikRuf(state: GameState, delta: number): GameState {
  const r = state.reputation;
  return { ...state, reputation: { ...(r ?? { public: 0, politics: 0, workers: 0, industryRespect: 0, industryFear: 0, standing: 0 }), politics: Math.max(-100, Math.min(100, (r?.politics ?? 0) + delta)) } };
}

const abgeordneterGefallen: PlanHandler = {
  // Nur, wenn der Abgeordnete seinen Gefallen einfordert (ringPhone ruft ihn dann sicher an).
  visible(state) {
    const f = state.deals?.favorDebt;
    return !!f && state.round >= f.due;
  },
  options(state) {
    const n = state.deals?.favorDebt?.amount ?? 0;
    return [
      { id: 'zahlen', label: `Zahlen – ${money(n)}`, reason: state.cash < n ? `Nicht genug Geld (${money(n)}).` : null },
      { id: 'ablehnen', label: 'Ablehnen – er wird es nicht vergessen', reason: null },
    ];
  },
  cost(state, _balance, target) {
    return target === 'zahlen' ? (state.deals?.favorDebt?.amount ?? 0) : 0;
  },
  detail(_state, balance) {
    return `Wer nicht reagiert, hat abgelehnt: Ansehen in der Politik −${balance.deals.deputy.refuse}.`;
  },
  apply(state, balance, target) {
    const s = withDeals(state, { favorDebt: null });
    if (target === 'zahlen') return log(s, 'Jacob begleicht seine Schuld beim Abgeordneten.');
    return log(politikRuf(s, -balance.deals.deputy.refuse), 'Jacob lässt den Abgeordneten abblitzen. In Hallstead spricht sich das herum.');
  },
};

export const DEAL_HANDLERS: Record<string, PlanHandler> = {
  ausruester_sammel: ausruesterSammel,
  lohnbohrer,
  motorwagen_benzin: supplyDeal('motorwagen_benzin', 'gasoline'),
  motorwagen_beteiligung: motorwagenBeteiligung,
  abgeordneter_stimme: abgeordneterStimme,
  abgeordneter_gefallen: abgeordneterGefallen,
  versicherung,
  lohnerhoehung,
  streik_droht: streikDroht,
  anzeigen,
  interview_presse: interviewPresse,
  bank_angebot: bankAngebot,
  marine_heizoel: supplyDeal('marine_heizoel', 'marine'),
  fabrik_schmieroel: supplyDeal('fabrik_schmieroel', 'lubricant'),
  lampenoel_kerosin: supplyDeal('lampenoel_kerosin', 'kerosene'),
  bank_zins: bankZins,
  bank_stundung: bankStundung,
  bank_pfand: bankPfand,
  bahn_festtarif: bahnFesttarif,
  bahn_kontingent: bahnKontingent,
  crane_vorschuss: craneVorschuss,
  haendler_grossabnahme: haendlerGrossabnahme,
  turm_verleihen: turmVerleihen,
  foerderzins,
  interview,
  wache,
};

// --- Rundenende ------------------------------------------------------------------

/**
 * Rundenende der Deals (nach den Plänen, vor Lager und Zinsen): Öldiebe, Mindestmenge
 * des Festtarifs, Fristen von Kontingent und Vorschuss, Miete und Rückgabe des Turms.
 */
export function settleDeals(input: GameState, balance: Balance): GameState {
  const b = balance.deals;
  let s = input;
  const d0 = dealsOf(s);

  // Öldiebe (nur Kapitel 1, solange der Sheriff keine Wache stellt).
  if ((s.chapter ?? 1) === 1 && d0.guardRound !== s.round && s.oilStock >= b.theft.minStock && rng(s, 'diebe').float() < b.theft.chance) {
    const weg = Math.floor(s.oilStock * b.theft.loss);
    const anteil = s.oilStock > 0 ? weg / s.oilStock : 0;
    s = log({ ...s, oilStock: s.oilStock - weg, royaltyOil: Math.max(0, s.royaltyOil * (1 - anteil)) }, `Öldiebe in der Nacht: ${bbl(weg)} aus den Tanks sind weg.`);
  }
  if (!s.deals) return s;
  let d = dealsOf(s);

  // Festtarif: Mindestmenge per Bahn.
  if (railFixedActive(s)) {
    const fehlt = Math.max(0, b.rail.fixed.minimum - (s.shipped.rail ?? 0));
    if (fehlt > 0) s = log({ ...s, cash: cents(s.cash - fehlt * b.rail.fixed.shortfall) }, `Festtarif: ${bbl(fehlt)} zu wenig per Bahn – Thorne berechnet ${money(fehlt * b.rail.fixed.shortfall)}.`);
  }
  if (d.railFixed && d.railFixed.until <= s.round) s = withDeals(s, { railFixed: null });

  // Kontingent verfällt.
  d = dealsOf(s);
  if (d.railQuota && (d.railQuota.until <= s.round || d.railQuota.left <= 0)) {
    if (d.railQuota.left > 0) s = log(s, `Das Frachtkontingent ist abgelaufen – ${bbl(d.railQuota.left)} verfallen.`);
    s = withDeals(s, { railQuota: null });
  }

  // Vorschuss: geliefert oder Frist um.
  d = dealsOf(s);
  if (d.advance && d.advance.owed <= 0) s = log(withDeals(s, { advance: null }), 'Der Vorschuss an Crane ist abgeliefert.');
  else if (d.advance && d.advance.until <= s.round) {
    const strafe = cents(d.advance.owed * d.advance.price * (1 + b.crane.advance.penalty));
    s = log(withDeals({ ...s, cash: cents(s.cash - strafe) }, { advance: null }), `Vorschuss nicht abgeliefert: Crane fordert für ${bbl(d.advance.owed)} ${money(strafe)} zurück.`);
  }

  // Sonderkredit (Anruf der Bank): nach der Frist ohne Tilgung teurer.
  d = dealsOf(s);
  if (d.offerLoan && d.offerLoan.due <= s.round) {
    const id = d.offerLoan.loanId;
    const offen = s.loans.find((l) => l.id === id && l.principal > 0);
    s = withDeals(s, { offerLoan: null });
    if (offen) {
      s = log({ ...s, loans: s.loans.map((l) => (l.id === id ? { ...l, rate: Math.round((l.rate + b.bank.offer.penalty) * 10000) / 10000 } : l)) }, `Der Sonderkredit ist nicht getilgt – die Bank verlangt ${percent(b.bank.offer.penalty)} mehr Zins.`);
    }
  }

  // Versicherungsprämie und Lohnerhöhung je Runde.
  d = dealsOf(s);
  if (d.insurance && d.insurance.until >= s.round) s = { ...s, cash: cents(s.cash - d.insurance.premium) };
  if (d.wages && d.wages.until >= s.round) s = { ...s, cash: cents(s.cash - d.wages.perRound) };
  // Streik: Wer beim Anruf nicht reagiert hat, hat nächste Runde weniger Förderung.
  if (d.call?.card === 'streik_droht' && d.call.round === s.round && !(s.plans?.booked ?? []).some((x) => x.cardId === 'streik_droht')) {
    const loss = b.workers.strike.loss;
    s = recordAct({ ...s, events: { ...s.events, timed: [...s.events.timed, { key: 'production' as const, value: -loss, until: s.round, source: 'streik' }] } }, 'strike');
    s = log(s, `Die Bohrtrupps streiken – ${percent(loss)} weniger Förderung in dieser Runde.`);
  }

  // Lohnbohrer: Rabatt auf die Miete der Vertragstürme (settleRigs berechnet den vollen Preis).
  d = dealsOf(s);
  if (d.crew && d.crew.until >= s.round) {
    const da = d.crew.rigIds.filter((id) => s.rigs.some((r) => r.id === id && r.kind === 'rented')).length;
    s = { ...s, cash: cents(s.cash + da * (balance.drilling.rigs.rent.costPerRound - crewRent(balance))) };
  }
  if (d.crew && d.crew.until <= s.round) s = withDeals(s, { crew: null });
  // Motorwagen-Beteiligung: ab Kapitel 3 entscheidet sich, ob die Fabrik läuft; dann Einnahmen je Runde.
  d = dealsOf(s);
  if (d.autoStake && (s.chapter ?? 1) >= 3) {
    if (d.autoStake.failed === null) {
      const scheitert = rng(s, 'motorwagen').float() < b.motor.stake.fail;
      s = log(withDeals(s, { autoStake: { ...d.autoStake, failed: scheitert } }), scheitert ? 'Die Motorwagen-Fabrik ist pleite – Jacobs Anteil ist nichts mehr wert.' : 'Die Motorwagen-Fabrik läuft – Jacobs Anteil bringt Geld.');
    }
    if (dealsOf(s).autoStake?.failed === false) s = { ...s, cash: cents(s.cash + b.motor.stake.income) };
  }
  // Abgeordneter: Wer beim Anruf nicht reagiert, hat abgelehnt.
  d = dealsOf(s);
  if (d.favorDebt && d.call?.card === 'abgeordneter_gefallen' && d.call.round === s.round && !(s.plans?.booked ?? []).some((x) => x.cardId === 'abgeordneter_gefallen')) {
    s = log(politikRuf(withDeals(s, { favorDebt: null }), -b.deputy.refuse), 'Jacob hat den Abgeordneten nicht zurückgerufen. In Hallstead spricht sich das herum.');
  }

  // Verliehener Turm: Miete, Rückgabe, vielleicht beschädigt.
  d = dealsOf(s);
  if (d.lent) {
    s = { ...s, cash: cents(s.cash + b.rig.lend.rent) };
    if (d.lent.until <= s.round) {
      const kaputt = rng(s, 'turm').float() < b.rig.lend.damage;
      s = withDeals(kaputt ? { ...s, cash: cents(s.cash - b.rig.lend.repair) } : s, { lent: null });
      s = log(s, kaputt ? `Der verliehene Turm kommt beschädigt zurück – Reparatur ${money(b.rig.lend.repair)}.` : 'Der verliehene Turm ist zurück, heil.');
    }
  }
  return s;
}

/** Laufende Abmachungen in je einem Satz – für das Adressbuch (reine Lesehilfe). */
export function dealsRunning(state: GameState, balance: Balance): string[] {
  const d = state.deals;
  if (!d) return [];
  const out: string[] = [];
  if (d.pledgedRig && pledgeBonus(state, balance) > 0) out.push(`Bohrturm als Pfand bei der Bank (+${money(balance.deals.bank.pledge.limitBonus)} Rahmen)`);
  if (d.deferRound === state.round) out.push('Bankzinsen dieser Runde gestundet');
  if (d.railFixed && d.railFixed.until >= state.round) out.push(`Festtarif bis Runde ${d.railFixed.until} – mind. ${bbl(balance.deals.rail.fixed.minimum)} je Runde per Bahn`);
  if (d.railQuota && d.railQuota.left > 0 && d.railQuota.until >= state.round) out.push(`Frachtkontingent: noch ${bbl(d.railQuota.left)} bis Runde ${d.railQuota.until}`);
  if (d.advance) out.push(`Vorschuss: noch ${bbl(d.advance.owed)} an Crane bis Ende Runde ${d.advance.until}`);
  if (d.bulkRound === state.round) out.push(`Händler nimmt diese Runde ${bbl(bulkExtra(state, balance))} mehr`);
  if (d.lent) out.push(`Bohrturm verliehen bis Ende Runde ${d.lent.until}`);
  if (d.guardRound === state.round) out.push('Wache an den Tanks');
  if (d.insurance && d.insurance.until >= state.round) out.push(`Feuerversicherung bis Runde ${d.insurance.until} (${money(d.insurance.premium)} je Runde)`);
  if (d.wages && d.wages.until >= state.round) out.push(`Lohnerhöhung bis Runde ${d.wages.until} (${money(d.wages.perRound)} je Runde)`);
  if (d.crew && d.crew.until >= state.round) out.push(`Lohnbohrer-Vertrag bis Runde ${d.crew.until} (${d.crew.rigIds.length} Türme)`);
  if (d.autoStake && d.autoStake.failed !== true) out.push('Beteiligung an den Motorwagen-Werken');
  if (d.favorDebt) out.push(`Der Abgeordnete will um Runde ${d.favorDebt.due} seinen Gefallen`);
  for (const c of activeSupply(state)) out.push(`Liefervertrag: ${bbl(c.qty)} ${PRODUKT[c.product]} je Runde zu ${c.price.toLocaleString('de-DE')} $ bis Runde ${c.until}`);
  return out;
}
