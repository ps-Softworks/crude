// Feldkauf (0.4.20+26, Tester-Wunsch): Jacob kauft der Konkurrenz eine Pacht ab – mit allem, was darauf steht.
// Bullard nennt keinen Preis; Jacob wählt eine Summe und sieht vorher, mit welcher Chance Bullard annimmt.
//
// Bullards Preisvorstellung (Wert):
//   Quelle fördert:  Rate · Nettopreis je bbl · Σ (1 − Rückgang)^t über horizon Runden
//   ungebohrt:       Bullards Fundchance · valuePerFind (wie er beim Pachten rechnet), mindestens der Pachtbonus
//   × Knappheit:     1 + scarcityWeight · (Anteil der guten Ranches, die schon vergeben sind)
//   × Haltung:       Fehde feud, Handschlag pakt, sonst 1; in Kapitel 3 verschuldet × distress
// Annahme-Chance: logistisch um den Wert – bei genau dem Wert 50 %, Breite spread (Anteil des Werts).
// Abgelehnt: auf dieser Ranch erst nach cooldown Runden ein neues Angebot. Der Wurf hängt nur an Seed,
// Ranch und Runde – neu laden und anders bieten ändert ihn nicht.
import type { Balance } from './balance';
import { formatDate } from './calendar';
import { nextWellId, type Well } from './drilling';
import type { GameState } from './game';
import { parcelLabel } from './lease';
import { Rng, seedFromString } from './rng';
import { bullardStance, rivalCandidates, rivalChance, rivalNetPerBarrel } from './rival';

export interface BuyoutBalance {
  /** Runden, die Bullard den Ölfluss einer Quelle in die Zukunft rechnet. */
  horizon: number;
  /** Ab dieser Fundchance (Bullards Bild) zählt eine Ranch als gut. */
  goodChance: number;
  /** Wie stark Knappheit den Preis hebt: 1 + scarcityWeight · Anteil vergebener guter Ranches. */
  scarcityWeight: number;
  /** Haltung: Fehde, Handschlag, Bullard in Kapitel 3 am Ende (verschuldet). */
  feud: number;
  pakt: number;
  distress: number;
  /** Breite der Annahmekurve: bei Wert × (1 + spread) nimmt er mit ~73 % an. */
  spread: number;
  /** Regler: von min bis max × Wert, Schritt in $. */
  sliderMin: number;
  sliderMax: number;
  step: number;
  /** Nach einer Ablehnung so viele Runden kein neues Angebot auf dieselbe Ranch. */
  cooldown: number;
}

export interface BuyoutQuote {
  parcelId: string;
  /** Bullards Preisvorstellung in $ (gerundet auf step). */
  value: number;
  /** Bestandteile für die Anzeige. */
  flow: number;
  /** Aktuelle Förderung der Quelle (0 = ungebohrt). */
  rate: number;
  scarcity: number;
  stance: number;
  /** Warum Bullard mehr oder weniger verlangt: Fehde, Handschlag, verschuldet (leer = nichts davon). */
  stanceReasons: ('fehde' | 'pakt' | 'verschuldet')[];
  /** Reglergrenzen. */
  min: number;
  max: number;
  step: number;
}

/** Gibt es auf dieser Ranch etwas zu kaufen? Grund, warum nicht – oder null (Wartezeit nach Ablehnung zählt hier nicht). */
function landBlocker(state: GameState, parcelId: string): string | null {
  const lease = state.leases.find((l) => l.parcelId === parcelId);
  if (!lease || lease.holder !== 'bullard') return 'Hier gibt es nichts zu kaufen – die Ranch gehört nicht Bullard.';
  const well = state.rival.wells.find((w) => w.parcelId === parcelId);
  if (well?.status === 'drilling') return 'Bullard bohrt hier gerade – erst wenn er weiß, was er hat, redet er über einen Preis.';
  if (well?.status === 'dry' || (lease.drilled && !well)) return 'Bullard hat hier trocken gebohrt – das Land ist nichts wert.';
  return null;
}

/** Warum Jacob jetzt nicht bieten kann – oder null, wenn er bieten darf. */
export function buyoutBlocker(state: GameState, parcelId: string): string | null {
  const land = landBlocker(state, parcelId);
  if (land) return land;
  const zuletzt = state.buyouts?.[parcelId];
  return zuletzt !== undefined && state.round < zuletzt ? `Bullard hat gerade erst abgelehnt – frühestens in Runde ${zuletzt} wieder.` : null;
}

/** Anteil der guten Ranches (Bullards Bild), die schon vergeben sind: 0 = alles frei, 1 = nichts mehr frei. */
export function goodLandScarcity(state: GameState, balance: Balance): number {
  const { goodChance } = balance.buyout;
  const offen = new Set(state.regions);
  const gut = state.parcels.filter((p) => !p.discovery && offen.has(p.region) && rivalChance(state, balance, p) >= goodChance);
  if (gut.length === 0) return 1;
  const frei = new Set(rivalCandidates(state, balance).map((p) => p.id));
  return 1 - gut.filter((p) => frei.has(p.id)).length / gut.length;
}

/** Bullards Preisvorstellung für eine seiner Pachten – null, wenn es nichts zu kaufen gibt. */
export function buyoutQuote(state: GameState, balance: Balance, parcelId: string): BuyoutQuote | null {
  if (landBlocker(state, parcelId) !== null) return null;
  const lease = state.leases.find((l) => l.parcelId === parcelId && l.holder === 'bullard');
  const parcel = state.parcels.find((p) => p.id === parcelId);
  if (!lease || !parcel) return null;
  const k = balance.buyout;
  const b = balance.rivals.bullard;
  const well = state.rival.wells.find((w) => w.parcelId === parcelId && w.status === 'found');
  const rate = well ? (well.rate ?? b.ratePerWell) : 0;
  let flow: number;
  if (well) {
    const net = rivalNetPerBarrel(state.postedPrice, well.royalty ?? lease.royalty, b.transportPerBarrel);
    const d = balance.production.decline;
    flow = rate * net * ((1 - (1 - d) ** k.horizon) / d);
  } else {
    flow = Math.max(lease.bonus, rivalChance(state, balance, parcel) * b.valuePerFind);
  }
  const scarcity = 1 + k.scarcityWeight * goodLandScarcity(state, balance);
  const haltung = bullardStance(state);
  const verschuldet = state.rivalsK3 !== undefined && state.rivalsK3.bullardDebt >= balance.rivalsK3.bullard.distressAt;
  const stance = (haltung === 'fehde' ? k.feud : haltung === 'pakt' ? k.pakt : 1) * (verschuldet ? k.distress : 1);
  const runde = (x: number) => Math.max(k.step, Math.round(x / k.step) * k.step);
  const value = runde(flow * scarcity * stance);
  const stanceReasons: BuyoutQuote['stanceReasons'] = [...(haltung === 'neutral' ? [] : [haltung]), ...(verschuldet ? (['verschuldet'] as const) : [])];
  return { parcelId, value, flow: Math.round(flow), rate: Math.round(rate), scarcity, stance, stanceReasons, min: runde(value * k.sliderMin), max: runde(value * k.sliderMax), step: k.step };
}

/** Chance (0–1), dass Bullard ein Angebot über amount $ annimmt. */
export function acceptChance(balance: Balance, quote: Pick<BuyoutQuote, 'value'>, amount: number): number {
  if (amount <= 0 || quote.value <= 0) return 0;
  const x = (amount / quote.value - 1) / balance.buyout.spread;
  return 1 / (1 + Math.exp(-x));
}

/** Der Wurf für ein Angebot: fest je Seed, Ranch und Runde. */
function buyoutRoll(state: GameState, parcelId: string): number {
  return new Rng(seedFromString(`${state.seed}:feldkauf:${parcelId}:${state.round}`)).float();
}

export type BuyoutResult = { ok: true; accepted: boolean; chance: number; state: GameState } | { ok: false; reason: string };

/**
 * Jacob bietet amount $ für Bullards Pacht. Angenommen: Geld an Bullard, die Pacht geht mit ihrem
 * Förderzins an Jacob, eine fördernde Quelle fördert ab jetzt für Jacob (Rate wie zuletzt bei Bullard).
 * Abgelehnt: kein Geld fließt, auf dieser Ranch erst nach cooldown Runden wieder.
 */
export function offerBuyout(state: GameState, balance: Balance, parcelId: string, amount: number): BuyoutResult {
  const blocker = buyoutBlocker(state, parcelId);
  if (blocker) return { ok: false, reason: blocker };
  const quote = buyoutQuote(state, balance, parcelId);
  if (!quote) return { ok: false, reason: 'Hier gibt es nichts zu kaufen.' };
  if (!Number.isFinite(amount) || amount < quote.min || amount > quote.max) {
    return { ok: false, reason: `Das Angebot muss zwischen ${quote.min} $ und ${quote.max} $ liegen.` };
  }
  if (amount > state.cash) return { ok: false, reason: `Nicht genug Geld: ${amount} $ geboten, in der Kasse sind ${Math.floor(state.cash)} $.` };
  const parcel = state.parcels.find((p) => p.id === parcelId)!;
  const chance = acceptChance(balance, quote, amount);
  const date = formatDate(state);
  const geld = `${Math.round(amount).toLocaleString('de-DE')} $`;
  if (buyoutRoll(state, parcelId) >= chance) {
    return {
      ok: true,
      accepted: false,
      chance,
      state: {
        ...state,
        buyouts: { ...state.buyouts, [parcelId]: state.round + balance.buyout.cooldown },
        log: [...state.log, `${date}: Bullard lehnt dein Angebot für ${parcelLabel(parcel)} ab (${geld}) – „Dafür nicht.“`],
      },
    };
  }
  const rivalWell = state.rival.wells.find((w) => w.parcelId === parcelId && w.status === 'found');
  const wells: Well[] = [...state.wells];
  if (rivalWell) {
    const rate = Math.round(rivalWell.rate ?? balance.rivals.bullard.ratePerWell);
    wells.push({
      id: nextWellId(state, parcelId),
      parcelId,
      stage: 1,
      status: 'found',
      roundsLeft: 0,
      spent: 0,
      oilStage: 1,
      result: parcel.geology === 'gusher' ? 'gusher' : 'small',
      // Fördert weiter, wie sie bei Bullard zuletzt förderte; der Rückgang läuft ab hier.
      production: { initialRate: rate, roundsProduced: 0, lastRate: 0, total: 0 },
      startRound: rivalWell.startRound,
    });
  }
  const leases = state.leases.map((l) => (l.parcelId === parcelId && l.holder === 'bullard' ? { ...l, holder: 'jacob' as const } : l));
  const buyouts = { ...state.buyouts };
  delete buyouts[parcelId];
  return {
    ok: true,
    accepted: true,
    chance,
    state: {
      ...state,
      cash: state.cash - amount,
      leases,
      wells,
      buyouts,
      rival: { ...state.rival, cash: state.rival.cash + amount, wells: state.rival.wells.filter((w) => w.parcelId !== parcelId) },
      log: [
        ...state.log,
        `${date}: Bullard verkauft dir ${parcelLabel(parcel)} für ${geld}${rivalWell ? ' – die Quelle fördert ab jetzt für dich' : ''}.`,
      ],
    },
  };
}
