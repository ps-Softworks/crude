// Fernleitungen (4.7, GDD §6, Kapitel 2): große Pipelines vom Feld zum Hafen.
//
// Ablauf einer Fernleitung:
//   1. Route planen   gerade Trasse vom Salzdom eines offenen Gebiets (oder vom Ende
//                     der kleinen Pipeline aus Kapitel 1 am Bahnhof) zu einem Ziel aus
//                     balance.yaml (Hafen, Bahnhof). Die Karte sagt, welche Ranches,
//                     welches Stadtgebiet und ob Thornes Gleise gekreuzt werden.
//   2. Vermessen      kostet je Karteneinheit; danach liegen die Wegerechte auf dem Tisch.
//   3. Wegerechte     je Ranch ein Angebot (niedrig, fair, großzügig) – das Geld liegt
//                     beim Notar, die Antwort kommt mit der Post der nächsten Runde.
//                     Wer zweimal ablehnt (oder ein großzügiges Angebot), stellt sich quer:
//                     Forderung zahlen, Umweg bauen oder – nur mit politischem Einfluss –
//                     enteignen. Thorne verkauft die Kreuzung seiner Gleise nie freiwillig:
//                     Forderung, Klage beim Bezirksrichter oder Enteignung. Eigene Pachten
//                     und Wegerechte aus Kapitel 1 sind schon da.
//   4. Bau            1–4 Runden je nach Länge, danach volle Kapazität: Leitung zum Hafen
//                     auf dem Transportweg „Pipeline“, Leitung zum Bahnhof auf dem Weg
//                     „Bahn“ – deren Öl zahlt weiter Thornes Bahntarif (transport.ts).
//   5. Betrieb        Unterhalt, Sabotage durch Thornes Leute und Rivalen, Wachleute.
//   Thorne            Jede fertige Leitung zum Hafen nimmt seiner Bahn Fracht weg: Er senkt
//                     je Runde den Tarif (bis bigPipelines.thorne.minTariff, dem eigenen
//                     Boden für Kapitel 2) und wagt keine Erhöhung mehr – er schickt
//                     Saboteure und schreibt Jacob einen Brief (Ereignis auf thorne_unter_druck).
//
// Freischaltung: erst ab balance.bigPipelines.fromChapter (Kapitel 2). In Kapitel 1 gibt
// es state.bigPipelines nicht – nichts wird gewürfelt, nichts angezeigt.
// Weltgrößen aus 4.1/4.2/4.3 (Stimmung, Einfluss, Transportpflicht) kommen über die
// kleine Schnittstelle PipelineWorld mit Ersatzwerten.
// Zufall nur aus dem eigenen Strom (Seed + ':fernleitung'). Reine Funktionen.

import type { Balance, LandownerType, TransportMode } from './balance';
import type { Offer } from './bigPipelineBalance';
import { formatDate } from './calendar';
import type { GameState } from './game';
import { withMark } from './logistics';
import { generateWorld } from './ranches';
import type { RanchShape } from './ranches';
import { Rng, seedFromString, type RngState } from './rng';
import { markRound, RIVAL_MARKS } from './trust';
import { landmarkById, regionById, segmentHitsPolygon, type Vec } from './worldMap';

export type { Offer } from './bigPipelineBalance';

// ------------------------------------------------------------ Schnittstelle zur Welt

/**
 * Was die Fernleitungen von Weltmodell (4.1), Politik (4.2), Gesetzen (4.3) und
 * Kapitelwechsel (4.5) brauchen. Bis Block A angedockt ist, gelten die Ersatzwerte.
 */
export interface PipelineWorld {
  /** Aktuelles Kapitel (4.5). */
  chapter: number;
  /** Öffentliche Stimmung 0–100, 50 = neutral (4.1). Bessere Stimmung, willigere Landbesitzer. */
  mood: number;
  /** Politischer Einfluss des Spielers 0–100 (4.2): Enteignung, Gericht. */
  influence: number;
  /** Gilt das Transportpflicht-Gesetz (4.3)? Dann trägt jede Fernleitung fremdes Öl gegen Gebühr. */
  commonCarrier: boolean;
}

export const DEFAULT_PIPELINE_WORLD: PipelineWorld = { chapter: 1, mood: 50, influence: 0, commonCarrier: false };

function zahlOder(v: unknown, ersatz: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : ersatz;
}

/**
 * Liest die Weltgrößen aus dem Zustand, soweit es sie schon gibt. Stimmung: 4.1 liegt
 * auf main als state.worldModel.mood (WorldState aus world.ts); state.world.mood bleibt
 * nur als Rückfall für den alten Entwurfsnamen. Kapitel (4.5): state.chapter. Einfluss
 * (4.2) und Transportpflicht (4.3) sind noch Entwurfsnamen. Fehlt etwas, gilt der
 * Ersatzwert. 4.x Integration: hier die echten Felder eintragen.
 */
export function pipelineWorldOf(state: object): PipelineWorld {
  const s = state as {
    chapter?: unknown;
    worldModel?: { mood?: unknown };
    world?: { mood?: unknown; influence?: unknown };
    politics?: { influence?: unknown };
    laws?: { commonCarrier?: unknown };
  };
  return {
    chapter: zahlOder(s.chapter, DEFAULT_PIPELINE_WORLD.chapter),
    mood: zahlOder(s.worldModel?.mood ?? s.world?.mood, DEFAULT_PIPELINE_WORLD.mood),
    influence: zahlOder(s.politics?.influence ?? s.world?.influence, DEFAULT_PIPELINE_WORLD.influence),
    commonCarrier: s.laws?.commonCarrier === true,
  };
}

// ------------------------------------------------------------------- Zustand

export type RightKind = 'ranch' | 'own' | 'town' | 'rail';
export type RightStatus = 'open' | 'asked' | 'granted' | 'refused' | 'holdout' | 'detour' | 'expropriated' | 'court';
/** Wer verhandelt: Landbesitzer-Art einer Ranch, der Stadtrat oder Thorne. */
export type RightParty = LandownerType | 'stadt' | 'thorne';

export interface WayRight {
  /** Ranch-id, „stadt:<gebiet>“ oder „bahn:<landmarke>“. */
  id: string;
  kind: RightKind;
  label: string;
  labelEn: string;
  owner: string;
  party: RightParty;
  /** Fairer Preis in $. */
  price: number;
  status: RightStatus;
  /** Offenes Angebot (status asked). */
  offer: Offer | null;
  /** Beim Notar hinterlegt – bei Absage zurück. */
  escrow: number;
  refusals: number;
  /** Forderung eines Querkopfs (status holdout) in $. */
  demand: number;
  /** Klage: Urteil am Ende dieser Runde (status court). */
  courtRound: number;
}

export type ProjectStatus = 'rights' | 'building' | 'ready' | 'damaged';

export interface TrunkProject {
  id: string;
  /** Gebiet, aus dem das Öl kommt. */
  origin: string;
  /** Ziel-Landmarke (balance.bigPipelines.destinations). */
  destination: string;
  /** Beginnt am Ende der kleinen Pipeline aus Kapitel 1. */
  fromSmall: boolean;
  /** Trasse auf der Karte: Anfang und Ende. */
  points: Vec[];
  /** Länge in Karteneinheiten, mit Umwegen. */
  length: number;
  /** Umgeht Thornes Bahn (Hafen). */
  bypassesRail: boolean;
  rights: WayRight[];
  status: ProjectStatus;
  /** Im Bau: Runden bis fertig; beschädigt: Runden bis repariert. */
  roundsLeft: number;
  guards: boolean;
  surveyedRound: number;
  /** Fertig seit (0 = noch nicht). */
  readyRound: number;
}

export type LetterKind = 'accepted' | 'refused' | 'holdout' | 'courtWon' | 'courtLost' | 'thorneCut' | 'sabotage' | 'ready' | 'intimidated';

/** Antwort mit der Post – Texte in content/pipelines.yaml. */
export interface PipelineLetter {
  round: number;
  kind: LetterKind;
  projectId: string;
  /** Wegerecht, um das es geht ('' bei Thorne/Bau). */
  rightId: string;
  party: RightParty | 'bau';
  owner: string;
  ranch: string;
  amount: number;
}

export interface BigPipelineState {
  rng: RngState;
  projects: TrunkProject[];
  nextId: number;
  /** Briefe der letzten Runden (ältere fallen weg). */
  letters: PipelineLetter[];
  /** Druck auf Thorne in der letzten Runde (0–1). */
  thornePressure: number;
  /** So viel hat Thorne den Tarif wegen der Fernleitungen schon gesenkt ($ je Barrel). */
  thorneCut: number;
  /** Merkzeichen aus Ereignissen, die schon gewirkt haben. */
  handled: string[];
}

/** Merkzeichen, die die Simulation setzt – Ereignisse in content/events/k2-fernleitung.yaml reagieren darauf. */
export const BIG_PIPELINE_MARKS = {
  /** Eine Fernleitung ist vermessen. */
  surveyed: 'fernleitung_vermessen',
  /** Eine Fernleitung zum Hafen ist vermessen – Thorne wird nervös. */
  harborPlanned: 'fernleitung_hafen_geplant',
  /** Ein Landbesitzer stellt sich quer. */
  holdout: 'fernleitung_querkopf',
  /** Eine Fernleitung ist fertig. */
  built: 'fernleitung_gebaut',
  /** Eine Fernleitung zum Hafen ist fertig (Kapitelprüfung Kapitel 2). */
  harbor: 'fernleitung_hafen',
  /** Sabotage an einer Fernleitung. */
  sabotaged: 'fernleitung_sabotiert',
  /** Thorne senkt den Tarif wegen der Fernleitung. */
  thornePressure: 'thorne_unter_druck',
  /** Jacob hat enteignen lassen. */
  expropriated: 'fernleitung_enteignet',
} as const;

export const BIG_PIPELINE_SIM_MARKS = Object.values(BIG_PIPELINE_MARKS);

/** Merkzeichen aus Ereignissen, die die Simulation liest. */
export const BIG_PIPELINE_READ_MARKS = {
  /** Jacob hat Thornes Unterhändler hinausgeworfen: mehr Sabotage. */
  thorneFeud: 'fernleitung_thorne_feind',
  /** Waffenstillstand mit Thorne: weniger Sabotage. */
  truce: 'fernleitung_thorne_stillhalten',
  /** Jacob gilt als anständiger Verhandler: Landbesitzer sind williger. */
  reputation: 'fernleitung_ruf_gut',
  /** Jacob hat die Querköpfe einschüchtern lassen: alle geben nach – Rache folgt. */
  intimidation: 'fernleitung_einschuechterung',
  /** Abkommen mit Thorne (sein Brief auf thorne_unter_druck): keine weitere Leitung zum Hafen. */
  thorneDeal: 'fernleitung_thorne_abkommen',
} as const;

export const BIG_PIPELINE_READ_MARK_LIST = Object.values(BIG_PIPELINE_READ_MARKS);

/** Eine Karteneinheit ist etwa eine Viertelmeile (content/map.yaml). */
export const MILES_PER_UNIT = 0.25;

export function newBigPipelines(seed: string): BigPipelineState {
  return { rng: seedFromString(`${seed}:fernleitung`), projects: [], nextId: 1, letters: [], thornePressure: 0, thorneCut: 0, handled: [] };
}

// ------------------------------------------------------------------- Helfer

type Lage = Pick<GameState, 'seed' | 'regions' | 'parcels' | 'leases' | 'events' | 'logistics' | 'cash' | 'round' | 'finished'>;

export type PipelineResult = { ok: true; state: GameState } | { ok: false; reason: string };

function cents(v: number): number {
  return Math.round(v * 100) / 100;
}

function dollars(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function logged(state: GameState, text: string): string[] {
  return [...state.log, `${formatDate(state)}: ${text}`];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Schneiden sich die Strecken a–b und c–d (echt, nicht nur berührend)? */
function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r: Vec = [b[0] - a[0], b[1] - a[1]];
  const s: Vec = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

const shapeCache = new Map<string, RanchShape[]>();

/** Umrisse der Ranches (aus dem Seed, nie im Spielstand) – gemerkt je Seed und offenen Gebieten. */
function ranchShapes(state: Pick<GameState, 'seed' | 'regions'>, balance: Balance): RanchShape[] {
  const key = `${state.seed}|${state.regions.join(',')}`;
  let shapes = shapeCache.get(key);
  if (!shapes) {
    shapes = generateWorld(balance.world, balance.ranches, state.seed, state.regions);
    if (shapeCache.size > 8) shapeCache.clear();
    shapeCache.set(key, shapes);
  }
  return shapes;
}

/** Fairer Preis eines Wegerechts über eine Ranch dieser Fläche. */
export function rightPrice(balance: Balance, area: number): number {
  const r = balance.bigPipelines.rights;
  return Math.round(Math.max(r.minPrice, area * r.pricePerArea) / 10) * 10;
}

/** Bauzeit in Runden (GDD §6: 1–4). */
export function buildRounds(balance: Balance, length: number): number {
  const b = balance.bigPipelines;
  return clamp(Math.ceil(length / b.unitsPerRound), b.minRounds, b.maxRounds);
}

/** Baukosten einer Trasse dieser Länge (mit Aufweiten der kleinen Pipeline beim Anschluss). */
export function buildCost(balance: Balance, length: number, fromSmall: boolean): number {
  const b = balance.bigPipelines;
  return Math.round(length * b.costPerUnit + (fromSmall ? b.smallUpgradeCost : 0));
}

function projectCost(balance: Balance, p: Pick<TrunkProject, 'length' | 'fromSmall'>): number {
  return buildCost(balance, p.length, p.fromSmall);
}

export function cleared(right: Pick<WayRight, 'status'>): boolean {
  return right.status === 'granted' || right.status === 'detour' || right.status === 'expropriated';
}

function smallPipelineBuilt(state: Pick<GameState, 'logistics'>): boolean {
  return state.logistics.pipeline === 'ready' || state.logistics.pipeline === 'damaged';
}

// ---------------------------------------------------------------- Freischaltung

export function bigPipelinesUnlocked(state: Partial<Pick<GameState, 'bigPipelines'>>): boolean {
  return state.bigPipelines !== undefined;
}

/**
 * Schaltet die Fernleitungen frei, sobald das Kapitel reicht (oder force, für die
 * Debug-Ansicht). Ohne Freischaltung bleibt der Zustand unverändert.
 */
export function unlockBigPipelines(state: GameState, balance: Balance, opts: { force?: boolean; world?: PipelineWorld } = {}): GameState {
  if (state.bigPipelines) return state;
  const world = opts.world ?? pipelineWorldOf(state);
  if (!opts.force && world.chapter < balance.bigPipelines.fromChapter) return state;
  return {
    ...state,
    bigPipelines: newBigPipelines(state.seed),
    log: logged(state, 'Ingenieure aus dem Osten bieten an, eine Fernleitung zu bauen – bis zum Hafen, an Thornes Bahn vorbei.'),
  };
}

// ---------------------------------------------------------------- Route planen

export interface RouteRequest {
  /** Gebiet (Salzdom als Anfang). */
  origin: string;
  /** Ziel-Landmarke. */
  destination: string;
  /** Am Ende der kleinen Pipeline anschließen (Bahnhof des Gebiets). */
  fromSmall?: boolean;
}

export interface RoutePlan {
  origin: string;
  destination: string;
  fromSmall: boolean;
  points: Vec[];
  length: number;
  bypassesRail: boolean;
  rights: WayRight[];
  surveyCost: number;
  buildCost: number;
  buildRounds: number;
  /** Summe der fairen Preise der Wegerechte, die noch fehlen. */
  rightsCost: number;
}

export type PlanResult = { ok: true; plan: RoutePlan } | { ok: false; reason: string };

/** Ziele, die eine Fernleitung haben kann (Name aus der Karte). */
export function pipelineDestinations(balance: Balance) {
  return balance.bigPipelines.destinations.map((d) => ({ ...d, landmark: landmarkById(balance.world, d.id)! }));
}

/** Gebiete, aus denen eine Fernleitung starten kann: offen und bohrbar. */
export function pipelineOrigins(state: Pick<GameState, 'regions'>, balance: Balance) {
  return state.regions.map((id) => regionById(balance.world, id)).filter((r) => r !== undefined && r.kind === 'drillable' && r.geology);
}

function neuesRecht(id: string, kind: RightKind, label: string, labelEn: string, owner: string, party: RightParty, price: number, status: RightStatus = 'open', demand = 0): WayRight {
  return { id, kind, label, labelEn, owner, party, price, status, offer: null, escrow: 0, refusals: 0, demand, courtRound: 0 };
}

/**
 * Plant eine Trasse, ohne etwas zu ändern: Anfang, Ziel, Länge, Kosten, Bauzeit und
 * die Wegerechte in der Reihenfolge entlang der Trasse.
 */
export function planRoute(state: Lage & Partial<Pick<GameState, 'bigPipelines'>>, balance: Balance, req: RouteRequest): PlanResult {
  const b = balance.bigPipelines;
  const region = regionById(balance.world, req.origin);
  if (!region || region.kind !== 'drillable' || !region.geology || !state.regions.includes(req.origin)) {
    return { ok: false, reason: 'Aus diesem Gebiet kann keine Fernleitung starten.' };
  }
  const ziel = b.destinations.find((d) => d.id === req.destination);
  const zielMark = ziel ? landmarkById(balance.world, ziel.id) : undefined;
  if (!ziel || !zielMark?.at) return { ok: false, reason: 'Dieses Ziel gibt es nicht.' };
  let start: Vec = region.geology.center;
  const fromSmall = req.fromSmall === true;
  if (fromSmall) {
    if (!smallPipelineBuilt(state)) return { ok: false, reason: 'Es gibt keine kleine Pipeline zum Anschließen.' };
    const station = region.pipelineTo ? landmarkById(balance.world, region.pipelineTo)?.at : undefined;
    if (!station) return { ok: false, reason: 'Die kleine Pipeline führt nicht aus diesem Gebiet.' };
    start = station;
  }
  const end = zielMark.at;
  const length = Math.round(dist(start, end) * 10) / 10;
  if (length < 0.5) return { ok: false, reason: 'Anfang und Ziel liegen zu nah beieinander.' };

  // Entlang der Trasse: Ranches, deren Umriss sie schneidet – nach Abstand vom Anfang.
  const t = (p: Vec) => ((p[0] - start[0]) * (end[0] - start[0]) + (p[1] - start[1]) * (end[1] - start[1])) / (length * length || 1);
  const eigene = new Set(state.leases.filter((l) => l.holder === 'jacob').map((l) => l.parcelId));
  const rechteAlt = balance.transport.pipeline.rights.filter((r) => r.figure && state.events.marks[r.mark] !== undefined).map((r) => r.figure!);
  const getroffen = ranchShapes(state, balance)
    .filter((r) => segmentHitsPolygon(start, end, r.polygon))
    .sort((x, y) => t(x.center) - t(y.center));
  const rechte: { at: number; right: WayRight }[] = getroffen.map((shape) => {
    const parcel = state.parcels.find((p) => p.id === shape.id);
    const name = parcel?.name ?? shape.name.de;
    const nameEn = parcel?.nameEn ?? (shape.name.en || shape.name.de);
    const owner = parcel?.owner ?? shape.owner;
    const party: RightParty = parcel?.landowner ?? 'neutral';
    const preis = rightPrice(balance, shape.area);
    const right = eigene.has(shape.id)
      ? neuesRecht(shape.id, 'own', name, nameEn, 'Jacob Harlan', party, 0, 'granted')
      : neuesRecht(shape.id, 'ranch', name, nameEn, owner, party, preis, shape.figure && rechteAlt.includes(shape.figure) ? 'granted' : 'open');
    return { at: t(shape.center), right };
  });
  // Stadtgebiete: der Stadtrat muss zustimmen.
  for (const town of balance.world.regions.filter((r) => r.kind === 'town')) {
    if (!segmentHitsPolygon(start, end, town.outline)) continue;
    rechte.push({
      at: 0.95,
      right: neuesRecht(`stadt:${town.id}`, 'town', `Stadtrat ${town.name.de}`, `${town.name.en || town.name.de} Town Council`, `Stadtrat ${town.name.de}`, 'stadt', b.rights.townPrice),
    });
  }
  // Bahnlinien: Kreuzung nur mit Thornes Erlaubnis – Endpunkte (Bahnhöfe) zählen nicht.
  const eps = 0.3;
  for (const rail of balance.world.landmarks.filter((l) => l.kind === 'rail' && l.points)) {
    const pts = rail.points!;
    for (let i = 0; i + 1 < pts.length; i++) {
      const x = segmentsCross(start, end, pts[i], pts[i + 1]);
      if (!x || dist(x, start) < eps || dist(x, end) < eps) continue;
      rechte.push({
        at: t(x),
        right: neuesRecht(`bahn:${rail.id}`, 'rail', `Kreuzung ${rail.name.de}`, `Crossing ${rail.name.en || rail.name.de}`, 'Augustus Thorne', 'thorne', b.rights.railDemand, 'holdout', b.rights.railDemand),
      });
      break;
    }
  }
  const rights = rechte.sort((x, y) => x.at - y.at).map((r) => r.right);
  const plan: RoutePlan = {
    origin: req.origin,
    destination: ziel.id,
    fromSmall,
    points: [start, end],
    length,
    bypassesRail: ziel.bypassesRail,
    rights,
    surveyCost: Math.round(length * b.surveyPerUnit),
    buildCost: buildCost(balance, length, fromSmall),
    buildRounds: buildRounds(balance, length),
    rightsCost: rights.filter((r) => !cleared(r)).reduce((s, r) => s + (r.status === 'holdout' ? r.demand : r.price), 0),
  };
  return { ok: true, plan };
}

// -------------------------------------------------------------- Aktionen

function guardState(state: GameState): string | null {
  if (state.finished) return 'Das Kapitel ist beendet.';
  if (!state.bigPipelines) return 'Fernleitungen gibt es erst ab Kapitel 2.';
  return null;
}

function withProject(state: GameState, project: TrunkProject, extra: Partial<BigPipelineState> = {}): GameState {
  const bp = state.bigPipelines!;
  return { ...state, bigPipelines: { ...bp, ...extra, projects: bp.projects.map((p) => (p.id === project.id ? project : p)) } };
}

function findProject(state: GameState, projectId: string): TrunkProject | undefined {
  return state.bigPipelines?.projects.find((p) => p.id === projectId);
}

function withRight(project: TrunkProject, right: WayRight): TrunkProject {
  return { ...project, rights: project.rights.map((r) => (r.id === right.id ? right : r)) };
}

/** Vermisst die geplante Trasse: Danach liegen die Wegerechte auf dem Tisch. */
export function surveyRoute(state: GameState, balance: Balance, req: RouteRequest): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const bp = state.bigPipelines!;
  if (bp.projects.length >= balance.bigPipelines.maxProjects) return { ok: false, reason: `Mehr als ${balance.bigPipelines.maxProjects} Fernleitungen kann Jacob nicht stemmen.` };
  if (bp.projects.some((p) => p.origin === req.origin && p.destination === req.destination)) {
    return { ok: false, reason: 'Diese Trasse ist schon vermessen.' };
  }
  const geplant = planRoute(state, balance, req);
  if (!geplant.ok) return geplant;
  const plan = geplant.plan;
  if (plan.bypassesRail && markRound(state, BIG_PIPELINE_READ_MARKS.thorneDeal) !== undefined && bp.projects.some((p) => p.bypassesRail)) {
    return { ok: false, reason: 'Jacob hat Thorne sein Wort gegeben: keine weitere Leitung zum Hafen.' };
  }
  if (plan.surveyCost > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(plan.surveyCost)} $ nötig).` };
  const project: TrunkProject = {
    id: `fl${bp.nextId}`,
    origin: plan.origin,
    destination: plan.destination,
    fromSmall: plan.fromSmall,
    points: plan.points,
    length: plan.length,
    bypassesRail: plan.bypassesRail,
    rights: plan.rights,
    status: 'rights',
    roundsLeft: 0,
    guards: false,
    surveyedRound: state.round,
    readyRound: 0,
  };
  const ziel = landmarkById(balance.world, plan.destination)!.name.de;
  let out: GameState = {
    ...state,
    cash: cents(state.cash - plan.surveyCost),
    bigPipelines: { ...bp, nextId: bp.nextId + 1, projects: [...bp.projects, project] },
    log: logged(state, `Landvermesser stecken die Trasse zum ${ziel} ab (${dollars(plan.surveyCost)} $, ${(plan.length * MILES_PER_UNIT).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Meilen). ${plan.rights.filter((r) => !cleared(r)).length} Wegerechte fehlen.`),
  };
  out = withMark(out, BIG_PIPELINE_MARKS.surveyed);
  return { ok: true, state: plan.bypassesRail ? withMark(out, BIG_PIPELINE_MARKS.harborPlanned) : out };
}

/** Gibt eine Trasse vor dem Bau auf: hinterlegtes Geld kommt zurück, Vermessung und gezahlte Rechte nicht. */
export function abandonProject(state: GameState, projectId: string): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  if (!p) return { ok: false, reason: 'Diese Fernleitung gibt es nicht.' };
  if (p.status !== 'rights') return { ok: false, reason: 'Was gebaut wird, gibt Jacob nicht mehr auf.' };
  const zurueck = p.rights.reduce((s, r) => s + r.escrow, 0);
  const bp = state.bigPipelines!;
  return {
    ok: true,
    state: {
      ...state,
      cash: cents(state.cash + zurueck),
      bigPipelines: { ...bp, projects: bp.projects.filter((x) => x.id !== projectId) },
      log: logged(state, `Jacob gibt die Trasse auf.${zurueck > 0 ? ` Der Notar zahlt ${dollars(zurueck)} $ zurück.` : ''}`),
    },
  };
}

/** Preis eines Angebots in $. */
export function offerAmount(balance: Balance, right: Pick<WayRight, 'price'>, offer: Offer): number {
  return Math.round((right.price * balance.bigPipelines.rights.offerFactor[offer]) / 10) * 10;
}

/** Chance, dass das Angebot angenommen wird (0–1). Die Oberfläche zeigt nur Worte. */
export function acceptChance(
  state: Pick<GameState, 'events'>,
  balance: Balance,
  project: Pick<TrunkProject, 'bypassesRail'>,
  right: Pick<WayRight, 'kind' | 'party'>,
  offer: Offer,
  world: PipelineWorld = DEFAULT_PIPELINE_WORLD,
): number {
  const r = balance.bigPipelines.rights;
  if (right.kind === 'rail') return 0;
  if (right.kind === 'own') return 1;
  const basis = right.kind === 'town' ? r.townAccept : r.acceptBase + (r.landowner[right.party] ?? 0);
  const ruf = markRound(state, BIG_PIPELINE_READ_MARKS.reputation) !== undefined ? r.reputationBonus : 0;
  const thorne = project.bypassesRail && right.kind === 'ranch' && markRound(state, BIG_PIPELINE_READ_MARKS.truce) === undefined ? r.thorneMeddling : 0;
  return clamp(basis + r.offerBonus[offer] + (world.mood - 50) * r.moodWeight + ruf - thorne, 0, 1);
}

/** Schickt dem Landbesitzer (oder Stadtrat) ein Angebot; das Geld liegt beim Notar, die Antwort kommt zum Rundenende. */
export function askRight(state: GameState, balance: Balance, projectId: string, rightId: string, offer: Offer): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  const right = p?.rights.find((r) => r.id === rightId);
  if (!p || !right) return { ok: false, reason: 'Dieses Wegerecht gibt es nicht.' };
  if (p.status !== 'rights') return { ok: false, reason: 'Die Wegerechte sind schon geklärt.' };
  if (right.kind === 'rail') return { ok: false, reason: 'Thorne verkauft die Kreuzung nicht – nur zu seinem Preis, vor Gericht oder per Enteignung.' };
  if (right.status !== 'open' && right.status !== 'refused') {
    return { ok: false, reason: right.status === 'asked' ? 'Das Angebot liegt schon beim Notar.' : 'Hier gibt es nichts mehr anzubieten.' };
  }
  const betrag = offerAmount(balance, right, offer);
  if (betrag > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(betrag)} $ nötig).` };
  const neu: WayRight = { ...right, status: 'asked', offer, escrow: betrag };
  return {
    ok: true,
    state: {
      ...withProject(state, withRight(p, neu)),
      cash: cents(state.cash - betrag),
      log: logged(state, `Jacob bietet ${right.owner} ${dollars(betrag)} $ für das Wegerecht über ${right.label}. Das Geld liegt beim Notar.`),
    },
  };
}

/** Zahlt die Forderung eines Querkopfs (oder Thornes Preis für die Kreuzung). */
export function payDemand(state: GameState, projectId: string, rightId: string): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  const right = p?.rights.find((r) => r.id === rightId);
  if (!p || !right) return { ok: false, reason: 'Dieses Wegerecht gibt es nicht.' };
  if (right.status !== 'holdout') return { ok: false, reason: 'Hier gibt es keine Forderung.' };
  if (right.demand > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(right.demand)} $ nötig).` };
  return {
    ok: true,
    state: {
      ...withProject(state, withRight(p, { ...right, status: 'granted' })),
      cash: cents(state.cash - right.demand),
      log: logged(state, `Jacob zahlt ${right.owner} ${dollars(right.demand)} $ – das Wegerecht über ${right.label} ist da.`),
    },
  };
}

/** Baut einen Umweg um die Ranch eines Querkopfs: längere Trasse, höhere Baukosten. */
export function detourRight(state: GameState, balance: Balance, projectId: string, rightId: string): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  const right = p?.rights.find((r) => r.id === rightId);
  if (!p || !right) return { ok: false, reason: 'Dieses Wegerecht gibt es nicht.' };
  if (right.kind !== 'ranch') return { ok: false, reason: 'Um eine Stadt oder eine Bahnlinie führt kein Umweg.' };
  if (right.status !== 'holdout') return { ok: false, reason: 'Ein Umweg lohnt nur um einen Querkopf.' };
  const laenger = { ...withRight(p, { ...right, status: 'detour' as const }), length: Math.round((p.length + balance.bigPipelines.rights.detourLength) * 10) / 10 };
  return {
    ok: true,
    state: {
      ...withProject(state, laenger),
      log: logged(state, `Die Trasse macht einen Bogen um ${right.label} – ${(balance.bigPipelines.rights.detourLength * MILES_PER_UNIT).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Meilen mehr, Bau jetzt ${dollars(projectCost(balance, laenger))} $.`),
    },
  };
}

/** Enteignung (GDD §6): nur mit politischem Einfluss; Entschädigung ein Anteil des fairen Preises. */
export function expropriateRight(state: GameState, balance: Balance, projectId: string, rightId: string, world: PipelineWorld = pipelineWorldOf(state)): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const r = balance.bigPipelines.rights;
  const p = findProject(state, projectId);
  const right = p?.rights.find((x) => x.id === rightId);
  if (!p || !right) return { ok: false, reason: 'Dieses Wegerecht gibt es nicht.' };
  if (right.kind === 'town') return { ok: false, reason: 'Die Stadt enteignet niemand.' };
  if (right.status !== 'holdout') return { ok: false, reason: 'Enteignen geht nur, wenn sich jemand querstellt.' };
  if (world.influence < r.expropriateInfluence) return { ok: false, reason: 'Dafür fehlt Jacob der politische Einfluss.' };
  const entschaedigung = Math.round(right.price * r.expropriateShare);
  if (entschaedigung > state.cash) return { ok: false, reason: `Die Entschädigung fehlt (${dollars(entschaedigung)} $).` };
  const out: GameState = {
    ...withProject(state, withRight(p, { ...right, status: 'expropriated' })),
    cash: cents(state.cash - entschaedigung),
    log: logged(state, `Die Ölkommission ordnet die Durchleitung über ${right.label} an. ${right.owner} bekommt ${dollars(entschaedigung)} $ Entschädigung – und vergisst es nicht.`),
  };
  return { ok: true, state: withMark(out, BIG_PIPELINE_MARKS.expropriated) };
}

/** Klage auf Kreuzungsrecht beim Bezirksrichter (nur Bahnkreuzung). Urteil nach rights.courtRounds Runden. */
export function sueRight(state: GameState, balance: Balance, projectId: string, rightId: string): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const r = balance.bigPipelines.rights;
  const p = findProject(state, projectId);
  const right = p?.rights.find((x) => x.id === rightId);
  if (!p || !right) return { ok: false, reason: 'Dieses Wegerecht gibt es nicht.' };
  if (right.kind !== 'rail') return { ok: false, reason: 'Klagen lohnt nur gegen Thorne.' };
  if (right.status !== 'holdout') return { ok: false, reason: right.status === 'court' ? 'Die Klage läuft schon.' : 'Hier gibt es nichts zu klagen.' };
  if (r.courtCost > state.cash) return { ok: false, reason: `Die Anwälte wollen ${dollars(r.courtCost)} $ vorab.` };
  const urteil = state.round + r.courtRounds - 1;
  return {
    ok: true,
    state: {
      ...withProject(state, withRight(p, { ...right, status: 'court', courtRound: urteil })),
      cash: cents(state.cash - r.courtCost),
      log: logged(state, `Jacobs Anwälte klagen beim Bezirksrichter auf das Recht, Thornes Gleise zu kreuzen (${dollars(r.courtCost)} $).`),
    },
  };
}

/** Beginnt den Bau – erst, wenn alle Wegerechte geklärt sind. */
export function startConstruction(state: GameState, balance: Balance, projectId: string): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  if (!p) return { ok: false, reason: 'Diese Fernleitung gibt es nicht.' };
  if (p.status !== 'rights') return { ok: false, reason: 'Die Fernleitung wird schon gebaut.' };
  const fehlen = p.rights.filter((r) => !cleared(r)).length;
  if (fehlen > 0) return { ok: false, reason: `Es fehlen noch ${fehlen} Wegerecht${fehlen === 1 ? '' : 'e'}.` };
  const kosten = projectCost(balance, p);
  if (kosten > state.cash) return { ok: false, reason: `Dafür fehlt das Geld (${dollars(kosten)} $ nötig).` };
  const runden = buildRounds(balance, p.length);
  return {
    ok: true,
    state: {
      ...withProject(state, { ...p, status: 'building', roundsLeft: runden }),
      cash: cents(state.cash - kosten),
      log: logged(state, `Der Bau der Fernleitung beginnt (${dollars(kosten)} $, ${runden} ${runden === 1 ? 'Runde' : 'Runden'}).`),
    },
  };
}

/** Wachleute an einer Fernleitung an- oder abstellen. */
export function setTrunkGuards(state: GameState, projectId: string, on: boolean): PipelineResult {
  const nein = guardState(state);
  if (nein) return { ok: false, reason: nein };
  const p = findProject(state, projectId);
  if (!p) return { ok: false, reason: 'Diese Fernleitung gibt es nicht.' };
  if (p.status === 'rights') return { ok: false, reason: 'Noch gibt es nichts zu bewachen.' };
  if (p.guards === on) return { ok: false, reason: on ? 'Die Wachleute sind schon da.' : 'Es gibt keine Wachleute.' };
  return {
    ok: true,
    state: { ...withProject(state, { ...p, guards: on }), log: logged(state, on ? 'Jacob stellt Wachleute an die Fernleitung.' : 'Jacob zieht die Wachleute von der Fernleitung ab.') },
  };
}

// ------------------------------------------------------------- Kennzahlen

/** Chance je Runde, dass diese Fernleitung sabotiert wird (im Bau oder im Betrieb). */
export function sabotageChanceOf(state: Pick<GameState, 'events'>, balance: Balance, project: TrunkProject): number {
  const s = balance.bigPipelines.sabotage;
  if (project.status !== 'building' && project.status !== 'ready') return 0;
  let chance = (project.status === 'building' ? s.building : s.ready) + project.length * s.perUnit;
  if (project.bypassesRail) {
    if (markRound(state, BIG_PIPELINE_READ_MARKS.truce) !== undefined) chance *= s.truceFactor;
    else {
      chance *= s.thorneFactor;
      if (markRound(state, BIG_PIPELINE_READ_MARKS.thorneFeud) !== undefined) chance *= s.thorneFeudFactor;
    }
  }
  if (markRound(state, RIVAL_MARKS.bullardFeud) !== undefined || markRound(state, RIVAL_MARKS.bullardBetrayed) !== undefined) chance *= s.rivalFactor;
  if (markRound(state, BIG_PIPELINE_READ_MARKS.intimidation) !== undefined) chance *= s.revengeFactor;
  if (project.guards) chance *= s.guardsFactor;
  return Math.min(s.maxChance, chance);
}

/** Auf welchem Transportweg das Öl einer Fernleitung verkauft wird: Hafen → „Pipeline“, Bahnhof → „Bahn“ (Thornes Tarif). */
export function trunkMode(project: Pick<TrunkProject, 'bypassesRail'>): TransportMode {
  return project.bypassesRail ? 'pipeline' : 'rail';
}

/**
 * Kapazität der laufenden Fernleitungen (bbl je Runde) für einen Transportweg. Leitungen
 * zum Hafen geben dem Weg „Pipeline“ Kapazität, Leitungen zum Bahnhof dem Weg „Bahn“ –
 * dort zahlt jedes Barrel weiter Thornes Bahntarif. Ohne Weg: alle laufenden Leitungen.
 */
export function bigPipelineCapacity(state: Partial<Pick<GameState, 'bigPipelines'>>, balance: Balance, mode?: TransportMode): number {
  return (state.bigPipelines?.projects ?? []).filter((p) => p.status === 'ready' && (mode === undefined || trunkMode(p) === mode)).length * balance.bigPipelines.capacity;
}

/** Läuft eine Fernleitung zum Hafen? Dann geht der Weg „Pipeline“ auch ohne kleine Pipeline. */
export function harborTrunkRunning(state: Partial<Pick<GameState, 'bigPipelines'>>): boolean {
  return (state.bigPipelines?.projects ?? []).some((p) => p.status === 'ready' && p.bypassesRail);
}

/** Druck auf Thorne (0–1): fertige Kapazität zum Hafen im Verhältnis zu thorne.fullPressureCapacity. */
export function thornePressure(state: Partial<Pick<GameState, 'bigPipelines'>>, balance: Balance): number {
  const b = balance.bigPipelines;
  const kap = (state.bigPipelines?.projects ?? []).filter((p) => p.status === 'ready' && p.bypassesRail).length * b.capacity;
  return Math.min(1, kap / b.thorne.fullPressureCapacity);
}

/** Läuft eine eigene Fernleitung zum Hafen (auch beschädigt)? Für die Kapitelprüfung von Kapitel 2. */
export function ownsHarborPipeline(state: Partial<Pick<GameState, 'bigPipelines'>>): boolean {
  return (state.bigPipelines?.projects ?? []).some((p) => p.bypassesRail && (p.status === 'ready' || p.status === 'damaged'));
}

/** Fixkosten je Runde: Streckenwärter und Wachleute. */
export function bigPipelineCosts(state: Partial<Pick<GameState, 'bigPipelines'>>, balance: Balance) {
  const b = balance.bigPipelines;
  let upkeep = 0;
  let guards = 0;
  for (const p of state.bigPipelines?.projects ?? []) {
    if (p.status === 'ready' || p.status === 'damaged') upkeep += p.length * b.upkeepPerUnit;
    if (p.status !== 'rights' && p.guards) guards += p.length * b.sabotage.guardsPerUnit;
  }
  return { upkeep: Math.round(upkeep), guards: Math.round(guards), total: Math.round(upkeep) + Math.round(guards) };
}

/** Was die Fernleitungen zum Imperiumswert beitragen (gebaut oder im Bau). */
export function bigPipelineAssets(state: Partial<Pick<GameState, 'bigPipelines'>>, balance: Balance): number {
  return cents(
    (state.bigPipelines?.projects ?? []).filter((p) => p.status !== 'rights').reduce((s, p) => s + projectCost(balance, p), 0) * balance.bigPipelines.assetShare,
  );
}

/** Kosten eines Projekts (für die Oberfläche). */
export function projectBuildCost(balance: Balance, project: TrunkProject): number {
  return projectCost(balance, project);
}

/** Was die Trassenskizze im Fenster zeigt – nur Geometrie aus Karte und Seed. */
export interface RouteSketch {
  size: { width: number; height: number };
  /** Ausschnitt um die Trasse (4:3, mit Rand), in Karteneinheiten. */
  view: { x: number; y: number; width: number; height: number };
  regions: { id: string; town: boolean; outline: readonly Vec[] }[];
  sea: readonly Vec[][];
  rails: readonly Vec[][];
  places: { id: string; at: Vec; harbor: boolean }[];
  route: Vec[];
  /** Ranches an der Trasse mit dem Stand ihres Wegerechts. */
  ranches: { id: string; polygon: readonly Vec[]; status: RightStatus }[];
}

export function routeSketch(state: Pick<GameState, 'seed' | 'regions'>, balance: Balance, route: Pick<RoutePlan, 'points' | 'rights'>): RouteSketch {
  const w = balance.world;
  const shapes = ranchShapes(state, balance);
  const ranches = route.rights.flatMap((r) => {
    const s = shapes.find((x) => x.id === r.id);
    return s ? [{ id: r.id, polygon: s.polygon, status: r.status }] : [];
  });
  // Ausschnitt: Trasse und Ranches mit Rand, auf 4:3 erweitert, innerhalb der Karte.
  const alle = [...route.points, ...ranches.flatMap((r) => r.polygon)];
  const rand = 2;
  let x0 = Math.min(...alle.map((p) => p[0])) - rand;
  let x1 = Math.max(...alle.map((p) => p[0])) + rand;
  let y0 = Math.min(...alle.map((p) => p[1])) - rand;
  let y1 = Math.max(...alle.map((p) => p[1])) + rand;
  if ((x1 - x0) * 3 < (y1 - y0) * 4) {
    const mehr = ((y1 - y0) * 4) / 3 - (x1 - x0);
    x0 -= mehr / 2;
    x1 += mehr / 2;
  } else {
    const mehr = ((x1 - x0) * 3) / 4 - (y1 - y0);
    y0 -= mehr / 2;
    y1 += mehr / 2;
  }
  const breite = Math.min(w.size.width, x1 - x0);
  const hoehe = Math.min(w.size.height, y1 - y0);
  const view = { x: clamp(x0, 0, w.size.width - breite), y: clamp(y0, 0, w.size.height - hoehe), width: breite, height: hoehe };
  return {
    size: w.size,
    view,
    regions: w.regions.filter((r) => r.kind === 'town' || state.regions.includes(r.id)).map((r) => ({ id: r.id, town: r.kind === 'town', outline: r.outline })),
    sea: w.landmarks.filter((l) => l.kind === 'sea' && l.outline).map((l) => l.outline as Vec[]),
    rails: w.landmarks.filter((l) => l.kind === 'rail' && l.points).map((l) => l.points as Vec[]),
    places: w.landmarks.filter((l) => l.at).map((l) => ({ id: l.id, at: l.at!, harbor: l.kind === 'harbor' })),
    route: route.points,
    ranches,
  };
}

// ------------------------------------------------------------- Rundenende

function letter(state: GameState, kind: LetterKind, project: TrunkProject, right: WayRight | null, amount = 0): PipelineLetter {
  return {
    round: state.round,
    kind,
    projectId: project.id,
    rightId: right?.id ?? '',
    party: right?.party ?? (kind === 'thorneCut' ? 'thorne' : 'bau'),
    owner: right?.owner ?? (kind === 'thorneCut' ? 'Augustus Thorne' : ''),
    ranch: right?.label ?? '',
    amount,
  };
}

/** So viele Runden bleiben Briefe im Zustand. */
const LETTER_ROUNDS = 4;

export interface AdvanceOptions {
  /** Bahntarif vor der Abrechnung des Transports: Hat Thorne trotz Druck erhöht, nimmt er es zurück. */
  railTariffBefore?: number;
  world?: PipelineWorld;
}

/**
 * Rundenende (nach dem Transport): Freischaltung ab Kapitel 2; Ereignisfolgen;
 * Antworten auf Angebote und Urteile; Unterhalt und Wachleute; Baufortschritt,
 * Sabotage und Reparatur; Thornes Reaktion; Gebühren für fremdes Öl.
 * Ohne Freischaltung kommt der Zustand unverändert zurück.
 */
export function advanceBigPipelines(input: GameState, balance: Balance, opts: AdvanceOptions = {}): GameState {
  const world = opts.world ?? pipelineWorldOf(input);
  let state = unlockBigPipelines(input, balance, { world });
  if (!state.bigPipelines || state.finished) return state;
  const b = balance.bigPipelines;
  const rng = new Rng(state.bigPipelines.rng);
  let letters: PipelineLetter[] = state.bigPipelines.letters.filter((l) => l.round > state.round - LETTER_ROUNDS);
  let handled = state.bigPipelines.handled;
  let cash = state.cash;
  const log: string[] = [];
  const marks: string[] = [];

  // Ereignis „Querkopf“: Einschüchterung – alle Querköpfe an Ranches geben nach (einmal).
  const druck = BIG_PIPELINE_READ_MARKS.intimidation;
  const einschuechtern = markRound(state, druck) !== undefined && !handled.includes(druck);
  if (einschuechtern) handled = [...handled, druck];

  const projects = state.bigPipelines.projects.map((original) => {
    let p = original;
    // 1. Wegerechte: Antworten, Urteile, Einschüchterung.
    if (p.status === 'rights') {
      const rights = p.rights.map((r): WayRight => {
        if (einschuechtern && r.kind === 'ranch' && r.status === 'holdout') {
          letters = [...letters, letter(state, 'intimidated', p, r)];
          log.push(`${r.owner} gibt nach – das Wegerecht über ${r.label} ist unterschrieben.`);
          return { ...r, status: 'granted' };
        }
        if (r.status === 'asked' && r.offer) {
          const ja = rng.float() < acceptChance(state, balance, p, r, r.offer, world);
          if (ja) {
            letters = [...letters, letter(state, 'accepted', p, r, r.escrow)];
            log.push(`Wegerecht über ${r.label}: ${r.owner} unterschreibt.`);
            return { ...r, status: 'granted', escrow: 0, offer: null };
          }
          cash += r.escrow;
          const absagen = r.refusals + 1;
          const quer = absagen >= b.rights.holdoutAfter || r.offer === 'generous';
          if (quer) {
            const demand = Math.round((r.price * b.rights.holdoutDemand) / 10) * 10;
            letters = [...letters, letter(state, 'holdout', p, r, demand)];
            log.push(`Wegerecht über ${r.label}: ${r.owner} stellt sich quer und verlangt ${dollars(demand)} $.`);
            marks.push(BIG_PIPELINE_MARKS.holdout);
            return { ...r, status: 'holdout', escrow: 0, offer: null, refusals: absagen, demand };
          }
          letters = [...letters, letter(state, 'refused', p, r, r.escrow)];
          log.push(`Wegerecht über ${r.label}: ${r.owner} lehnt ab, der Notar zahlt ${dollars(r.escrow)} $ zurück.`);
          return { ...r, status: 'refused', escrow: 0, offer: null, refusals: absagen };
        }
        if (r.status === 'court' && state.round >= r.courtRound) {
          const sieg = rng.float() < clamp(b.rights.courtChance + world.influence / 200, 0, 1);
          letters = [...letters, letter(state, sieg ? 'courtWon' : 'courtLost', p, r, r.demand)];
          log.push(sieg ? 'Der Bezirksrichter erlaubt die Kreuzung von Thornes Gleisen.' : 'Der Bezirksrichter weist die Klage gegen Thorne ab.');
          return sieg ? { ...r, status: 'granted' } : { ...r, status: 'holdout' };
        }
        return r;
      });
      p = { ...p, rights };
    }
    // 2. Bau, Betrieb, Sabotage, Reparatur. Gewürfelt wird nur im Bau und im Betrieb.
    if (p.status === 'building' || p.status === 'ready') {
      const chance = sabotageChanceOf(state, balance, p);
      const getroffen = rng.float() < chance;
      const reparatur = Math.round(projectCost(balance, p) * b.sabotage.repairShare);
      if (getroffen) {
        cash -= reparatur;
        marks.push(BIG_PIPELINE_MARKS.sabotaged);
        letters = [...letters, letter(state, 'sabotage', p, null, reparatur)];
        log.push(
          p.status === 'building'
            ? `Sabotage an der Baustelle der Fernleitung! Rohre gesprengt – ${dollars(reparatur)} $ und eine Runde Verzug.`
            : `Sabotage! Die Fernleitung ist in der Nacht aufgesprengt worden. Reparatur ${dollars(reparatur)} $, ${b.sabotage.repairRounds === 1 ? 'eine Runde' : `${b.sabotage.repairRounds} Runden`} Stillstand.`,
        );
      }
      if (p.status === 'building') {
        const rest = p.roundsLeft - 1 + (getroffen ? 1 : 0);
        if (rest <= 0) {
          p = { ...p, status: 'ready', roundsLeft: 0, readyRound: state.round };
          marks.push(BIG_PIPELINE_MARKS.built);
          if (p.bypassesRail) marks.push(BIG_PIPELINE_MARKS.harbor);
          letters = [...letters, letter(state, 'ready', p, null)];
          log.push(`Die Fernleitung zum ${landmarkById(balance.world, p.destination)?.name.de ?? p.destination} ist fertig. Ab jetzt fließen bis zu ${b.capacity.toLocaleString('de-DE')} Barrel je Runde.`);
        } else p = { ...p, roundsLeft: rest };
      } else if (getroffen) p = { ...p, status: 'damaged', roundsLeft: b.sabotage.repairRounds };
    } else if (p.status === 'damaged') {
      const rest = p.roundsLeft - 1;
      if (rest <= 0) {
        p = { ...p, status: 'ready', roundsLeft: 0 };
        log.push('Die Fernleitung ist repariert.');
      } else p = { ...p, roundsLeft: rest };
    }
    return p;
  });

  // 3. Unterhalt und Wachleute (Stand nach dem Bau dieser Runde).
  const kosten = bigPipelineCosts({ bigPipelines: { ...state.bigPipelines, projects } }, balance);
  if (kosten.total > 0) {
    cash -= kosten.total;
    log.push(`Fernleitung: Streckenwärter ${dollars(kosten.upkeep)} $${kosten.guards > 0 ? `, Wachleute ${dollars(kosten.guards)} $` : ''}.`);
  }
  // 4. Transportpflicht (4.3): fremdes Öl gegen Gebühr – und Jacob sieht die Mengen.
  const laufend = projects.filter((p) => p.status === 'ready').length;
  if (world.commonCarrier && laufend > 0) {
    const gebuehr = Math.round(laufend * b.carrier.volume * b.carrier.fee);
    cash += gebuehr;
    log.push(`Transportpflicht: ${(laufend * b.carrier.volume).toLocaleString('de-DE')} Barrel fremdes Öl durch Jacobs Leitung – ${dollars(gebuehr)} $ Gebühr.`);
  }

  // 5. Thorne: Druck durch fertige Leitungen zum Hafen.
  const bpNeu: BigPipelineState = { ...state.bigPipelines, projects };
  const pressure = thornePressure({ bigPipelines: bpNeu }, balance);
  let railTariff = state.railTariff;
  let thorneCut = state.bigPipelines.thorneCut;
  if (pressure > 0) {
    // Kapitel 2 hat einen eigenen, tieferen Boden: die Senkung wirkt über mehrere Runden.
    const minTariff = b.thorne.minTariff;
    const vorher = opts.railTariffBefore;
    if (vorher !== undefined && railTariff > vorher) {
      railTariff = vorher;
      log.push('Thorne nimmt seine Tariferhöhung zurück – mit Jacobs Fernleitung am Hafen wagt er das nicht.');
    }
    const neu = Math.max(minTariff, cents(railTariff - b.thorne.cut * pressure));
    if (neu < railTariff) {
      thorneCut = cents(thorneCut + (railTariff - neu));
      railTariff = neu;
      marks.push(BIG_PIPELINE_MARKS.thornePressure);
      const erste = projects.find((p) => p.bypassesRail && p.status === 'ready')!;
      letters = [...letters, letter(state, 'thorneCut', erste, null, neu)];
      log.push(`Thornes Kesselwagen fahren halb leer. Er senkt den Bahntarif auf ${neu.toFixed(2).replace('.', ',')} $ je Barrel.`);
    }
  }

  state = {
    ...state,
    cash: cents(cash),
    railTariff,
    bigPipelines: { ...bpNeu, rng: rng.state, letters, handled, thornePressure: pressure, thorneCut },
    log: [...state.log, ...log.map((l) => `${formatDate(state)}: ${l}`)],
  };
  for (const m of marks) state = withMark(state, m);
  return state;
}

// ------------------------------------------------------------- Spielstand

const RIGHT_STATUS: readonly string[] = ['open', 'asked', 'granted', 'refused', 'holdout', 'detour', 'expropriated', 'court'];
const PROJECT_STATUS: readonly string[] = ['rights', 'building', 'ready', 'damaged'];

function istObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function istZahl(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Prüft state.bigPipelines eines geladenen Spielstands (fehlt es, ist das in Ordnung: Kapitel 1). */
export function validBigPipelines(value: unknown): boolean {
  if (value === undefined) return true;
  if (!istObj(value) || !istZahl(value.rng) || !istZahl(value.nextId) || !istZahl(value.thornePressure) || !istZahl(value.thorneCut)) return false;
  if (!Array.isArray(value.letters) || !Array.isArray(value.handled) || !Array.isArray(value.projects)) return false;
  return value.projects.every(
    (p) =>
      istObj(p) &&
      typeof p.id === 'string' &&
      PROJECT_STATUS.includes(p.status as string) &&
      istZahl(p.length) &&
      istZahl(p.roundsLeft) &&
      typeof p.guards === 'boolean' &&
      Array.isArray(p.rights) &&
      p.rights.every((r) => istObj(r) && typeof r.id === 'string' && RIGHT_STATUS.includes(r.status as string) && istZahl(r.price) && istZahl(r.escrow)),
  );
}
