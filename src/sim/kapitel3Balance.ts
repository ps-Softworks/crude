// Spielzahlen für Kapitel 3 (4.17): Seismik, Konsortium, Konsortialprojekte, Stand.
// Eigener Block „kapitel3“ in content/balance.yaml, eigener Prüfer – balance.ts ruft
// parseKapitel3Balance nur auf (4.17 Andockpunkt dort).

import { BalanceError } from './balance';

export interface Kapitel3World {
  tech: number;
  credit: number;
  tension: number;
  mood: number;
}

export interface SizeClass {
  id: string;
  /** Ab so viel förderbarem Öl (bbl) gilt diese Klasse. */
  from: number;
}

export interface SeismikBalance {
  techStages: number[];
  stage: number;
  licenseCost: number;
  surveyCost: number;
  surveyRounds: number;
  crews: number;
  crewCost: number;
  maxCrews: number;
  width: number;
  insight: number;
  rounding: number;
  sizeMiss: number;
  falseTrap: number;
  sizeClasses: SizeClass[];
}

export interface FavorBalance {
  id: string;
  cash: number;
  ansehen: number;
}

export interface KonsortiumBalance {
  inviteRound: number;
  inviteDeadline: number;
  trustStart: number;
  trustValeGeld: number;
  trustValeAbgelehnt: number;
  powerStart: number;
  memberIncome: number;
  doubleIncome: number;
  doubleDetect: number;
  doubleDetectGrowth: number;
  feignDetect: number;
  favorEvery: number;
  favorEveryControlled: number;
  favorDeadline: number;
  complyTrust: number;
  refuseTrust: number;
  expelBelow: number;
  trustWords: [number, number];
  expelledPenalty: number;
  expelledRounds: number;
  power: { join: number; refuse: number; double: number; exposed: number; broken: number };
  rescue: { cash: number; trust: number };
  worldInput: { tension: number; credit: number; mood: number };
  favors: FavorBalance[];
}

export interface ProjectBalance {
  id: string;
  cost: number;
  rounds: number;
  income: number;
  risk: number;
  minRank: number;
  members: boolean;
}

export interface ProjekteBalance {
  offerEvery: number;
  maxOffers: number;
  offerRounds: number;
  shares: number[];
  fraud: number;
  memberRisk: number;
  list: ProjectBalance[];
}

export interface StandBalance {
  start: number;
  ranks: number[];
  decay: number;
  donation: { cost: number; gain: number; falloff: number; cap: number };
  marriage: { cost: number; gain: number; minRank: number; thomas: number };
  breakOrder: { cost: number };
  club: { cost: number; from: number };
  member: number;
  exposed: number;
  rateDiscount: number[];
}

export interface Kapitel3Balance {
  fromChapter: number;
  world: Kapitel3World;
  seismik: SeismikBalance;
  konsortium: KonsortiumBalance;
  projekte: ProjekteBalance;
  stand: StandBalance;
}

const P = 'kapitel3';

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), obj);
}

function fail(path: string, what: string): never {
  throw new BalanceError(`balance.yaml: "${P}.${path}" ${what}`);
}

function num(obj: unknown, path: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
  const value = get(obj, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'fehlt oder ist keine Zahl');
  if (opts.int && !Number.isInteger(value)) fail(path, 'muss eine ganze Zahl sein');
  if (opts.min !== undefined && value < opts.min) fail(path, `muss mindestens ${opts.min} sein`);
  if (opts.max !== undefined && value > opts.max) fail(path, `darf höchstens ${opts.max} sein`);
  return value;
}

const geld = (o: unknown, p: string) => num(o, p, { min: 0 });
const anteil = (o: unknown, p: string) => num(o, p, { min: 0, max: 1 });
const runden = (o: unknown, p: string) => num(o, p, { min: 1, int: true });
const skala = (o: unknown, p: string) => num(o, p, { min: 0, max: 100 });

function liste(obj: unknown, path: string): unknown[] {
  const value = get(obj, path);
  if (!Array.isArray(value) || value.length === 0) fail(path, 'fehlt oder ist leer');
  return value;
}

function id(obj: unknown, path: string): string {
  const value = get(obj, path);
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value)) fail(path, 'braucht eine id aus Kleinbuchstaben');
  return value;
}

function eindeutig(ids: string[], path: string): void {
  const doppelt = ids.find((x, i) => ids.indexOf(x) !== i);
  if (doppelt) fail(path, `enthält die id "${doppelt}" doppelt`);
}

function aufsteigend(values: number[], path: string): void {
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) fail(path, 'muss aufsteigend sortiert sein');
}

function parseSeismik(k: unknown): SeismikBalance {
  const techStages = liste(k, 'seismik.techStages').map((_, i) => skala(k, `seismik.techStages.${i}`));
  if (techStages.length !== 5) fail('seismik.techStages', 'braucht genau fünf Werte (Stufe I–V)');
  aufsteigend(techStages, 'seismik.techStages');
  const sizeClasses = liste(k, 'seismik.sizeClasses').map((_, i) => ({ id: id(k, `seismik.sizeClasses.${i}.id`), from: num(k, `seismik.sizeClasses.${i}.from`, { min: 0 }) }));
  eindeutig(sizeClasses.map((c) => c.id), 'seismik.sizeClasses');
  aufsteigend(sizeClasses.map((c) => c.from), 'seismik.sizeClasses');
  const crews = runden(k, 'seismik.crews');
  const maxCrews = runden(k, 'seismik.maxCrews');
  if (maxCrews < crews) fail('seismik.maxCrews', 'ist kleiner als "crews"');
  return {
    techStages,
    stage: num(k, 'seismik.stage', { min: 1, max: 5, int: true }),
    licenseCost: geld(k, 'seismik.licenseCost'),
    surveyCost: geld(k, 'seismik.surveyCost'),
    surveyRounds: runden(k, 'seismik.surveyRounds'),
    crews,
    crewCost: geld(k, 'seismik.crewCost'),
    maxCrews,
    width: num(k, 'seismik.width', { min: 1, max: 100 }),
    insight: anteil(k, 'seismik.insight'),
    rounding: runden(k, 'seismik.rounding'),
    sizeMiss: anteil(k, 'seismik.sizeMiss'),
    falseTrap: anteil(k, 'seismik.falseTrap'),
    sizeClasses,
  };
}

function trustWords(k: unknown): [number, number] {
  const w = liste(k, 'konsortium.trustWords').map((_, i) => skala(k, `konsortium.trustWords.${i}`));
  if (w.length !== 2) fail('konsortium.trustWords', 'braucht zwei Schwellen');
  aufsteigend(w, 'konsortium.trustWords');
  return [w[0], w[1]];
}

function parseKonsortium(k: unknown): KonsortiumBalance {
  const p = (x: string) => `konsortium.${x}`;
  const favors = liste(k, 'konsortium.favors').map((f, i) => ({
    id: id(k, `konsortium.favors.${i}.id`),
    cash: num(k, `konsortium.favors.${i}.cash`, { min: 0 }),
    ansehen: typeof get(f, 'ansehen') === 'number' ? num(k, `konsortium.favors.${i}.ansehen`, { min: -100, max: 100 }) : 0,
  }));
  eindeutig(favors.map((f) => f.id), p('favors'));
  const zahl = (x: string) => num(k, `konsortium.${x}`, { min: -100, max: 100 });
  return {
    inviteRound: runden(k, 'konsortium.inviteRound'),
    inviteDeadline: runden(k, 'konsortium.inviteDeadline'),
    trustStart: skala(k, 'konsortium.trustStart'),
    trustValeGeld: zahl('trustValeGeld'),
    trustValeAbgelehnt: zahl('trustValeAbgelehnt'),
    powerStart: skala(k, 'konsortium.powerStart'),
    memberIncome: geld(k, 'konsortium.memberIncome'),
    doubleIncome: geld(k, 'konsortium.doubleIncome'),
    doubleDetect: anteil(k, 'konsortium.doubleDetect'),
    doubleDetectGrowth: anteil(k, 'konsortium.doubleDetectGrowth'),
    feignDetect: anteil(k, 'konsortium.feignDetect'),
    favorEvery: runden(k, 'konsortium.favorEvery'),
    favorEveryControlled: runden(k, 'konsortium.favorEveryControlled'),
    favorDeadline: runden(k, 'konsortium.favorDeadline'),
    complyTrust: zahl('complyTrust'),
    refuseTrust: zahl('refuseTrust'),
    expelBelow: skala(k, 'konsortium.expelBelow'),
    trustWords: trustWords(k),
    expelledPenalty: geld(k, 'konsortium.expelledPenalty'),
    expelledRounds: runden(k, 'konsortium.expelledRounds'),
    power: { join: zahl('power.join'), refuse: zahl('power.refuse'), double: zahl('power.double'), exposed: zahl('power.exposed'), broken: zahl('power.broken') },
    rescue: { cash: geld(k, 'konsortium.rescue.cash'), trust: skala(k, 'konsortium.rescue.trust') },
    worldInput: { tension: num(k, 'konsortium.worldInput.tension'), credit: num(k, 'konsortium.worldInput.credit'), mood: num(k, 'konsortium.worldInput.mood') },
    favors,
  };
}

function parseProjekte(k: unknown): ProjekteBalance {
  const list = liste(k, 'projekte.list').map((x, i) => {
    const members = get(x, 'members');
    if (typeof members !== 'boolean') fail(`projekte.list.${i}.members`, 'muss true oder false sein');
    return {
      id: id(k, `projekte.list.${i}.id`),
      cost: num(k, `projekte.list.${i}.cost`, { min: 1 }),
      rounds: runden(k, `projekte.list.${i}.rounds`),
      income: geld(k, `projekte.list.${i}.income`),
      risk: anteil(k, `projekte.list.${i}.risk`),
      minRank: num(k, `projekte.list.${i}.minRank`, { min: 0, max: 3, int: true }),
      members,
    };
  });
  eindeutig(list.map((x) => x.id), 'projekte.list');
  const shares = liste(k, 'projekte.shares').map((_, i) => num(k, `projekte.shares.${i}`, { min: 0.01, max: 1 }));
  aufsteigend(shares, 'projekte.shares');
  return {
    offerEvery: runden(k, 'projekte.offerEvery'),
    maxOffers: runden(k, 'projekte.maxOffers'),
    offerRounds: runden(k, 'projekte.offerRounds'),
    shares,
    fraud: anteil(k, 'projekte.fraud'),
    memberRisk: num(k, 'projekte.memberRisk', { min: 0 }),
    list,
  };
}

function parseStand(k: unknown): StandBalance {
  const ranks = liste(k, 'stand.ranks').map((_, i) => skala(k, `stand.ranks.${i}`));
  if (ranks.length !== 3 || ranks[0] !== 0) fail('stand.ranks', 'braucht drei Schwellen, die erste 0 (Emporkömmling, geduldet, anerkannt)');
  aufsteigend(ranks, 'stand.ranks');
  const rateDiscount = liste(k, 'stand.rateDiscount').map((_, i) => num(k, `stand.rateDiscount.${i}`, { min: 0, max: 0.1 }));
  if (rateDiscount.length !== 4) fail('stand.rateDiscount', 'braucht vier Werte (Emporkömmling … aufgenommen)');
  const club = { cost: geld(k, 'stand.club.cost'), from: skala(k, 'stand.club.from') };
  if (club.from <= ranks[2]) fail('stand.club.from', 'muss über der Schwelle für „anerkannt“ liegen');
  return {
    start: skala(k, 'stand.start'),
    ranks,
    decay: num(k, 'stand.decay', { min: 0, max: 100 }),
    donation: { cost: geld(k, 'stand.donation.cost'), gain: skala(k, 'stand.donation.gain'), falloff: anteil(k, 'stand.donation.falloff'), cap: skala(k, 'stand.donation.cap') },
    marriage: {
      cost: geld(k, 'stand.marriage.cost'),
      gain: skala(k, 'stand.marriage.gain'),
      minRank: num(k, 'stand.marriage.minRank', { min: 0, max: 2, int: true }),
      thomas: num(k, 'stand.marriage.thomas', { min: -100, max: 100 }),
    },
    breakOrder: { cost: geld(k, 'stand.breakOrder.cost') },
    club,
    member: num(k, 'stand.member', { min: -100, max: 100 }),
    exposed: num(k, 'stand.exposed', { min: -100, max: 100 }),
    rateDiscount,
  };
}

/** Liest den Block „kapitel3“ aus den rohen balance.yaml-Daten. */
export function parseKapitel3Balance(raw: unknown): Kapitel3Balance {
  const k = get(raw, P);
  if (!k || typeof k !== 'object') throw new BalanceError(`balance.yaml: Block "${P}" fehlt`);
  return {
    fromChapter: num(k, 'fromChapter', { min: 1, max: 7, int: true }),
    world: { tech: skala(k, 'world.tech'), credit: skala(k, 'world.credit'), tension: skala(k, 'world.tension'), mood: skala(k, 'world.mood') },
    seismik: parseSeismik(k),
    konsortium: parseKonsortium(k),
    projekte: parseProjekte(k),
    stand: parseStand(k),
  };
}
