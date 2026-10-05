// Spielzustand und Rundenschleife. Alles hier ist reine Logik:
// Funktionen bekommen einen Zustand und geben einen neuen zurück.

import { newAgenda, settleAgenda, type AgendaState } from './agenda';
import type { Balance, Rating, TransportMode } from './balance';
import { formatDate } from './calendar';
// 4.14 Andockpunkt: Marke und Tankstellen (Kapitel 3).
import { settleBrand, type BrandState } from './brand';
import { checkBankruptcy, settleLoans, type Loan } from './credit';
import { applyEarlyEnding, chapterPassed } from './chapter';
import { chapterOf } from './chapterOf';
import { advanceDrilling, type Well } from './drilling';
import { assignFields, buildFields, type Field } from './field';
import { makeForecasts, type Forecast } from './forecast';
import { generateParcels, type Parcel } from './geology';
// Termine als Hauptwerkzeug (Etappe 1): Erkundung und Planungsbrett.
import { initialKnowledge, learnFromWells, newExploration, type ExplorationState, type ParcelKnowledge } from './exploration';
import { appendReport, newPlans, settlePlans, type PlansState } from './plans';
// Termine als Hauptwerkzeug, Etappe 3: gekoppelte Briefe.
import { settleLetters } from './letters';
// Termine als Hauptwerkzeug (Etappe 2): Preis- und Transport-Aktionen.
import { marketMods, newPricing, settlePricingAfterMarket, type PricingState } from './pricing';
import { newFreight, type FreightState } from './freight';
import { initialRegions } from './ranches';
import { openRegions } from './regions';
import { checkBirth, newFamily, settleFamily, type FamilyState } from './family';
import { autoResolve, drawEvents, newEventsState, type EventDef, type EventsState } from './events';
import { parcelLabel, settleLeases, startOptions, type Lease, type LeaseOption } from './lease';
import { advanceProduction } from './production';
import { settleRigs, startRigs, type Rig } from './rigs';
import { Rng, seedFromString, type RngState } from './rng';
import { advanceMarket, computePrice, neighbourSupply, saltHillSupply } from './market';
import { advanceWorld, mergeInput, newWorld, saltHillInput, worldPriceFactor, type WorldState } from './world';
import { newRival, advanceRival, type RivalState } from './rival';
import { advanceLogistics, newLogistics, settleStorage, spillOver, type LogisticsState } from './logistics';
import { advanceTransport, noShipments } from './transport';
// 4.7 Andockpunkt: Fernleitungen (Kapitel 2+).
import { advanceBigPipelines, type BigPipelineState } from './bigPipeline';
import { settleTakeover } from './trust';
import { settleStocks, type StocksState } from './stocks'; // 4.8 Andockpunkt
import { advanceWildcatters, newWildcatters, type WildcattersState } from './wildcatters';
import type { JumpState, TimeskipRecord } from './timeskip';
import { settleVentures, type Ventures } from './ventures';
// 4.6 Andockpunkt: Raffinerie (ab Kapitel 2).
import { advanceRefinery, type RefineryState } from './refinery';
import type { StaffState } from './staff'; // 4.9 Andockpunkt: Personal
import { delegateMail, settleStaff } from './staffRound'; // 4.9 Andockpunkt: Personal
import { advanceDiplomacy, type DiplomacyState } from './diplomacy'; // 4.10 Andockpunkt
// 4.11 Andockpunkt: Ermittler und Forschung (ab Kapitel 2).
import { advanceInvestigation, type InvestigationState } from './investigation';
import { advanceResearch, type ResearchState } from './research';
// 4.15 Andockpunkt: Börse und Kauf auf Kredit (ab Kapitel 3).
import { exchangeWorldInput, readClimate, settleExchange, type ExchangeState } from './exchange';
// 4.16 Andockpunkt: Nebeninvestments und Lobbyist in Hallstead (ab Kapitel 3).
import { hallsteadWorldInput, settleHallstead } from './hallstead';
import type { HallsteadState } from './hallsteadState';
// 4.17 Andockpunkt: Kapitel 3 (Seismik, Konsortium, Projekte, Stand).
import type { Kapitel3State } from './kapitel3';
import type { Reputation } from './reputation';
import { settleEventSystems, type EventConsequences } from './eventSystems';
import type { Kapitel3Content } from './kapitel3Content';
import { advanceKapitel3 } from './kapitel3Runde';
// 4.19 Andockpunkt: Rivalen in Kapitel 3 (Margaret, Thorne, Bullard).
import { settleRivalsK3, type RivalsK3State } from './rivalsK3';
import { konsortiumWorldInput } from './konsortium';

export { SEASONS, dateOf, formatDate, type Season } from './calendar';

/**
 * Wie das Spiel ausgeht: gar nicht, mit Ende des Kapitels, mit Pleite oder mit dem Verkauf an den Crane Trust (2.8)
 * bzw. an Pruett (4.10). Ab Kapitel 2 die frühen Enden aus GDD §14 (4.12): abgesetzt (Stellvertreterkampf verloren),
 * geschluckt (feindliche Übernahme durch Thorne), haft (Verurteilung zu langer Haft).
 */
export type Ending = 'kapitel' | 'pleite' | 'verkauft' | 'abgesetzt' | 'geschluckt' | 'haft' | null;

/** Alle Enden außer null – für Spielstand und Oberfläche. */
export const ENDINGS = ['kapitel', 'pleite', 'verkauft', 'abgesetzt', 'geschluckt', 'haft'] as const;

export interface GameState {
  seed: string;
  rng: RngState;
  /** Aktuelle Runde, beginnt bei 1. */
  round: number;
  totalRounds: number;
  startYear: number;
  cash: number;
  /** Offene Gebiete aus content/map.yaml (0.2.15+5); nur dort gibt es Ranches. */
  regions: string[];
  /** Ranches und Farmen der offenen Gebiete (ohne Umrisse – die kommen aus dem Seed). */
  parcels: Parcel[];
  /** Lagerstätten: verbundene ölführende Ranches mit ihren Reserven. */
  fields: Field[];
  /** Öl in den Tanks in Barrel (Jacobs Anteil plus Förderzins-Öl). */
  oilStock: number;
  /** Barrel im Tank, die den Landbesitzern gehören (Förderzins); beim Verkauf ausgezahlt. */
  royaltyOil: number;
  /** Aktueller Bahntarif in $ je Barrel – Thorne kann ihn erhöhen. */
  railTariff: number;
  /** In dieser Runde verschickte Barrel je Transportmittel. */
  shipped: Record<TransportMode, number>;
  /** Lager, eigene Fuhrwerke, Pipeline, Händler (0.2.15+2). */
  logistics: LogisticsState;
  leases: Lease[];
  options: LeaseOption[];
  /** Prognose je Parzelle – nur, wo Jacob etwas weiß (Wissensstufe ab 1, src/sim/exploration.ts); für die Entdeckungsquelle gibt es keine. */
  forecasts: Record<string, Forecast>;
  /** Wissensstand je Ranch (Etappe 1): Stufe und Hinweise. Fehlt eine Ranch, weiß Jacob nur, was alle wissen. */
  knowledge: Record<string, ParcelKnowledge>;
  /** Erkundung (Etappe 1): eingestellter Geologe und seine Trefferbilanz. */
  exploration: ExplorationState;
  /** Planungsbrett (Etappe 1): gebuchte Karten der Runde und Wochenbericht. */
  plans: PlansState;
  /** Preis-Aktionen (Etappe 2): Verkauf der Runde, Förderbremse, Liefervertrag, Gerüchte, Crane. */
  pricing: PricingState;
  /** Transport-Aktionen (Etappe 2): Thorne, Brennan, Transportgemeinschaft. */
  freight: FreightState;
  /** Ruf bei den kleinen Wildcattern (Etappe 2, −0,3 bis +0,3): gilt für Förderbremse und Transportgemeinschaft. */
  wildcatterStanding: number;
  /** Bohrungen, auch abgeschlossene. */
  wells: Well[];
  /** Bohrtürme (0.2.15+7): Silas' geliehener, gekaufte und gemietete. */
  rigs: Rig[];
  /** Aktueller Posted Price in $ je Barrel (Market). */
  postedPrice: number;
  /** Preishistorie: postedPrice je Runde (Index 0 = Runde 1). */
  priceHistory: number[];
  /** Offene Kredite bei der Bank und beim Geldverleiher. */
  loans: Loan[];
  /** Kreditwürdigkeit der Bank A–D. */
  rating: Rating;
  /** Rundenenden, für die der Geldverleiher einspringen musste. */
  missedPayments: number;
  /** Letzte Runde, in der die Kasse negativ sein darf; 0 = keine Frist läuft. */
  bankruptcyDeadline: number;
  finished: boolean;
  /** Wie das Spiel endet, oder null, solange es weitergeht. */
  ending: Ending;
  /** Börsengang am Kapitelende (2.11): null = noch nicht entschieden; share 0 = Familienfirma, sonst verkaufter Anteil und Erlös in $. */
  ipo: { share: number; proceeds: number } | null;
  /** Rivale Bullard: Pachten, Bohrungen, Einkommen. */
  rival: RivalState;
  /** Kleine Wildcatter im Hintergrund (2.8): Namen für die Nachbarquellen. */
  wildcatters: WildcattersState;
  /** Ereignisse: eigener Zufall, offene und schon gekommene (2.1). */
  events: EventsState;
  /** Termine der laufenden Runde (2.3). */
  agenda: AgendaState;
  /** Kraft 0–strengthMax: Gesundheit und Belastbarkeit, für den Spieler nie als Zahl sichtbar (2.3). */
  strength: number;
  /** Höchste Kraft in diesem Lebensabschnitt (Kapitel 1: 100). */
  strengthMax: number;
  /** Runden, die Jacob noch krank im Bett liegt (2.7); 0 = gesund. */
  sick: number;
  /** Ruth und Thomas (2.7). */
  family: FamilyState;
  /** 4.16 Andockpunkt: Hallstead (Beteiligungen, Lobbyist) – erst da, wenn Jacob dort etwas tut (ab Kapitel 3). */
  hallstead?: HallsteadState;
  /** Weltmodell (4.1): die neun Weltgrößen, je Runde fortgeschrieben. */
  worldModel: WorldState;
  /**
   * Kapitel (4.5): 1, nach Zeitsprung I 2. Alle Systeme lesen es über den gemeinsamen Helfer
   * chapterOf (stocks.ts; fehlt es in einem Teilzustand, gilt Kapitel 1); Ereignisse fragen es mit
   * minChapter/maxChapter ab (events.ts, chapterMet).
   */
  chapter: number;
  /** Erste Runde des laufenden Kapitels (Kapitel 1: 1). Runden zählen über Kapitel hinweg weiter. */
  chapterStart: number;
  /** Nachbarquellen am Salt Hill mehr (+) oder weniger (−) als nach der Kapitel-1-Formel (4.5: nach dem Zeitsprung). */
  neighbourOffset: number;
  /** Laufender Zeitsprung (4.5): Direktiven und beantwortete Weichen; null = keiner. */
  jump: JumpState | null;
  /** Abgeschlossene Zeitsprünge mit Chronik „Die Jahre dazwischen“. */
  timeskips: TimeskipRecord[];
  /** Beteiligungen aus dem Zeitsprung (4.5): Benzinanlage, Okara. Fehlt = keine. */
  ventures?: Ventures;
  /** 4.7 Andockpunkt: Fernleitungen – fehlt in Kapitel 1 (erst ab balance.bigPipelines.fromChapter). */
  bigPipelines?: BigPipelineState;
  /** 4.9 Andockpunkt: Personal (Sekretärin, Fixer, Richtlinien) – erst ab Kapitel 2, in Kapitel 1 undefined. */
  staff?: StaffState;
  /** 4.17 Andockpunkt: Kapitel 3 (src/sim/kapitel3.ts) – fehlt, bis Kapitel 3 beginnt. */
  kapitel3?: Kapitel3State;
  /** 4.19 Andockpunkt: Rivalen in Kapitel 3 (src/sim/rivalsK3.ts) – fehlt vor Kapitel 3. */
  rivalsK3?: RivalsK3State;
  /** Ruf (4.12, GDD §4, src/sim/reputation.ts): fehlt, bis ein Ereignis ihn ändert (dann −100…100 je Achse). */
  reputation?: Partial<Reputation>;
  /** 4.12: Was Systemwirkungen der Ereignisse dauerhaft hinterlassen (Durchleitungsgebühr, Rating, Termine, Erben). */
  consequences?: EventConsequences;
  log: string[];
  /** Rivalen-Diplomatie und Crane-Nachfolge (4.10): erst ab Kapitel 2, in Kapitel 1 fehlt sie. */
  diplomacy?: DiplomacyState; // 4.10 Andockpunkt
  /** Länge von log beim letzten Rundenende: alles danach gehört zum Protokoll der laufenden Runde. */
  roundLogStart: number;
  /** 4.6 Andockpunkt: Raffinerie und Produktmix; undefined = noch nicht freigeschaltet (Kapitel 1). */
  refinery?: RefineryState;
  /** 4.8 Andockpunkt: Aktien, Aufsichtsrat, Anleihen ab Kapitel 2 (startStocks); fehlt in Kapitel 1. */
  stocks?: StocksState;
  // 4.11 Andockpunkt: entstehen erst ab Kapitel 2 (fehlen in Kapitel 1 und in älteren Spielständen).
  /** Delaneys Ermittlungen, Spuren und Gegenmittel (src/sim/investigation.ts). */
  investigation?: InvestigationState;
  /** Versuchswerkstatt, Techniken, Patente (src/sim/research.ts). */
  research?: ResearchState;
  /** 4.14 Andockpunkt: Marke und Tankstellen – erst ab Kapitel 3 da, vorher undefined. */
  brand?: BrandState;
  // 4.15 Andockpunkt: Börse und Depot; erst ab Kapitel 3 da (in Kapitel 1 und 2 undefined).
  exchange?: ExchangeState;
}

/**
 * Neue Partie. catalog sind die Ereignisse aus content/events/; ohne Katalog
 * (Bots, ältere Tests) gibt es keine Ereignisse. Ereignisse würfeln mit eigenem
 * Zufall, die Welt ist mit und ohne Katalog dieselbe.
 */
export function newGame(seed: string, balance: Balance, catalog: readonly EventDef[] = []): GameState {
  const rng = new Rng(seedFromString(seed));
  const regions = initialRegions(balance.world);
  const geologie = generateParcels(balance, seed, regions);
  const fields = buildFields(geologie);
  const parcels = assignFields(geologie, fields);
  const worldModel = newWorld(seed, balance.worldModel);
  const startPrice = computePrice(balance.market, neighbourSupply(balance.market, 1, 0), worldPriceFactor(worldModel, balance.worldModel));
  const state: GameState = {
    seed,
    rng: rng.state,
    round: 1,
    totalRounds: balance.start.rounds,
    startYear: balance.start.year,
    cash: balance.start.cash,
    regions,
    parcels,
    fields,
    oilStock: 0,
    royaltyOil: 0,
    railTariff: balance.transport.rail.costPerBarrel,
    shipped: noShipments(),
    logistics: newLogistics(seed),
    leases: [],
    options: [],
    forecasts: {},
    knowledge: {},
    exploration: newExploration(),
    plans: newPlans(1),
    pricing: newPricing(),
    freight: newFreight(),
    wildcatterStanding: 0,
    wells: [],
    rigs: startRigs(balance),
    postedPrice: startPrice,
    priceHistory: [startPrice],
    loans: [],
    rating: balance.credit.startRating,
    missedPayments: 0,
    bankruptcyDeadline: 0,
    finished: false,
    ending: null,
    ipo: null,
    log: [],
    roundLogStart: 0,
    rival: newRival(seed, balance),
    wildcatters: newWildcatters(seed, balance),
    events: newEventsState(seed),
    agenda: newAgenda(balance.agenda.strengthStart, balance),
    strength: balance.agenda.strengthStart,
    strengthMax: balance.agenda.strengthMax,
    sick: 0,
    family: newFamily(balance),
    worldModel,
    chapter: 1,
    chapterStart: 1,
    neighbourOffset: 0,
    jump: null,
    timeskips: [],
  };
  // Erst die Startoptionen, dann die Prognosen: so bleiben Karte und Startoptionen
  // bei gleichem Seed so, wie sie es vor der Prognose waren.
  state.options = startOptions(state, balance, rng);
  // Etappe 1: Keine Gratis-Prognosen mehr für die ganze Karte. Die alten Prognosen werden nur
  // noch gewürfelt, damit der Weltzufall danach (Bohrungen …) bei gleichem Seed derselbe bleibt.
  makeForecasts(balance, parcels, balance.forecast.geologist, rng);
  state.rng = rng.state;
  // Wissen zu Spielbeginn: Startoptionen und die Nachbarn des Salt-Hill-Funds sind beritten.
  Object.assign(state, initialKnowledge(state, balance));
  const date = formatDate(state);
  state.log = [`${date}: Jacob Harlan kommt in Port Ellis an.`];
  if (state.options.length > 0) {
    const labels = state.options.map((o) => parcelLabel(state.parcels.find((p) => p.id === o.parcelId)!));
    state.log.push(`${date}: Jacob hat freie Pachtoptionen auf ${labels.join(' und ')}.`);
  }
  return drawEvents(checkBirth(state, balance), balance, catalog);
}

/** Die Welt ein Quartal weiter; ohne Weltmodell (alte Teststände) bleibt alles, wie es ist. */
function advanceWorldInGame(state: GameState, vorMarkt: GameState, balance: Balance): GameState {
  if (!state.worldModel) return state;
  const angebot = saltHillSupply(vorMarkt, balance.market, balance.rivals.bullard.ratePerWell);
  // Gesetze (4.3): Das Parlament tagt mit dem Katalog aus content/laws/.
  // 4.15 Andockpunkt: Jacobs Kauf auf Kredit heizt das Kreditklima (ohne Börse unverändert).
  const salzHuegel = exchangeWorldInput(state, saltHillInput(angebot, balance.market.demand, balance.worldModel));
  // 4.16 Andockpunkt: Die Kampagne von Jacobs eigener Zeitung in Hallstead stößt die Stimmung einmalig an (sonst 0).
  const lobby = { ...salzHuegel, moodKick: (salzHuegel.moodKick ?? 0) + hallsteadWorldInput(state, balance).moodKick };
  // 4.17 Andockpunkt: Die Macht des Konsortiums verschiebt Spannung, Kreditklima und Stimmung (ohne Kapitel 3 alles 0).
  const input = mergeInput(lobby, konsortiumWorldInput(state, balance));
  return { ...state, worldModel: advanceWorld(state.worldModel, balance.worldModel, input, balance.laws) };
}

/**
 * Schließt die aktuelle Runde ab: erst die Förderung, dann der Ölpreis (Markt),
 * dann die Bohrungen, dann die Pacht-Abrechnung (Verfall, Verzögerungszins), dann
 * der Rivale Bullard (direkt danach, damit gerade verfallene Optionen und Pachten
 * Jacobs für ihn frei sind), dann die Zinsen (mit Notkredit, wenn eine Rate nicht zu zahlen ist), dann der
 * Transport (Thorne und der Bahntarif, Kapazitäten wieder frei) und zuletzt die
 * Pleiteprüfung. Die Förderung kommt zuerst, damit eine Quelle, die gerade ihren
 * Abschlussbohrung hinter sich hat, erst in der nächsten Runde Öl liefert. Bei
 * Pleite ist sofort Schluss: keine neue Runde und keine Kapitelprüfung. Nach der
 * letzten Runde ist das Kapitel beendet und die Kapitelprüfung (2.11) kommt ins Protokoll. Was ab hier ins Protokoll kommt, gehört
 * zur Abrechnung: roundLogStart merkt sich, wie lang das Protokoll davor war.
 * Ereignisse (2.1): Offene bekommen vorher ihre Standard-Antwort, zur neuen
 * Runde werden neue gewürfelt. Termine (2.3): Direkt danach wird die Kraft
 * abgerechnet und die Termine der nächsten Runde stehen fest. Familie (2.7):
 * Vor den Terminen gibt Familienzeit Kraft (oder Vernachlässigung kostet
 * Beziehung), danach kann Jacob krank werden. Zu Beginn der neuen Runde kann
 * Thomas zur Welt kommen – vor den Ereignissen, damit sie darauf reagieren.
 * Rivalen (2.8): Hat Jacob das Übernahmeangebot des Crane Trust angenommen,
 * endet die Partie direkt nach den Antworten; zur neuen Runde bekommen die
 * neuen Nachbarquellen ihre Wildcatter.
 */
// 4.17 Andockpunkt: kapitel3 = Texte aus content/kapitel3.yaml, damit Kapitel 3 seine Ereignisse in die Kladde schreibt.
export function endRound(input: GameState, balance: Balance, catalog: readonly EventDef[] = [], texts: { kapitel3?: Kapitel3Content } = {}): GameState {
  if (input.finished) return input;
  // Offene Ereignisse bekommen ihre Standard-Antwort, bevor die Runde abgerechnet wird.
  // Gebiete (0.2.15+5): Hat eine Antwort ein Gebiet freigeschaltet, bekommt es jetzt seine Ranches.
  // 4.9 Andockpunkt: Das Vorzimmer erledigt ablaufende Briefe nach Richtlinie, bevor die Standard-Antworten gelten.
  const beantwortet = openRegions(autoResolve(delegateMail(input, balance, catalog), catalog, undefined, balance.events.timedRounds, balance), balance);
  const roundLogStart = beantwortet.log.length;
  // Crane-Übernahme (2.8): Hat Jacob verkauft, endet die Partie hier – ohne weitere Abrechnung.
  const verkauft = settleTakeover(beantwortet, balance);
  if (verkauft.ending === 'verkauft') return { ...verkauft, roundLogStart };
  // Familie (2.7): Familienzeit gibt Kraft, Vernachlässigung kostet Beziehung.
  const familie = settleFamily(beantwortet, balance);
  // Planungsbrett (Etappe 1): Karten mit Wirkung am Rundenende, Lohn des Geologen, Wochenbericht.
  // Etappe 2: dazu Förderbremse, Liefervertrag und Fracht-Verträge (die Verkäufe der Runde stehen fest).
  // Etappe 3: Merkzeichen aus Jacobs Plänen für die gekoppelten Briefe, Antworten aus Briefen wirken (letters.ts).
  const nachBrett = settlePlans(familie, balance);
  const geplant = appendReport(settleLetters(familie, nachBrett, balance), nachBrett.log.length);
  // Termine (2.3): Krankheit (2.7), ruhige Runde gibt Kraft zurück, die nächste beginnt mit frischen Terminen.
  const terminiert = settleAgenda(geplant, balance);
  // 4.9 Andockpunkt: Personal – Verkauf nach Regel, Aufträge, Löhne, Loyalität, Hitze, Extra-Termine der nächsten Runde.
  // 4.12 Andockpunkt: Folgen der Ereignisse – Durchleitungsgebühr, Termine der nächsten Runde (nach dem Personal).
  const besetzt = settleEventSystems(settleStaff(terminiert, balance));
  // 4.6 Andockpunkt: Die Raffinerie nimmt, was nach den Verkäufen (auch denen des Vorzimmers) noch im Tank steht (ohne Raffinerie: unverändert).
  const ausgeruht = advanceRefinery(besetzt, balance);
  // Lager (0.2.15+2): Kosten, Schwund und Brand für das Öl, das noch im Tank steht; neue Tanks sind fertig.
  // Nach der Förderung läuft aus, was nicht mehr in die Tanks passt.
  const gefoerdert = spillOver(advanceProduction(settleStorage(ausgeruht, balance), balance), balance);
  // Weltmodell (4.1): Der Preis dieser Runde folgt dem Welttrend von heute, danach rückt die Welt ein Quartal weiter.
  // Salt Hill fließt mit seinem Über- oder Unterangebot (winzig) in die Welt ein.
  const rivalRate = balance.rivals.bullard.ratePerWell;
  // Etappe 2: Kapitel 1 rechnet mit Jacobs Verkauf statt seiner Förderung, dazu Förderbremse und Gerüchte (pricing.ts).
  const trend = worldPriceFactor(gefoerdert.worldModel, balance.worldModel);
  const mods = marketMods(gefoerdert, balance);
  const bepreist = advanceMarket(gefoerdert, balance.market, rivalRate, trend, mods);
  const markt = advanceWorldInGame(appendReport(settlePricingAfterMarket(bepreist, balance, mods, trend), bepreist.log.length), gefoerdert, balance);
  // Erkundung (Etappe 1): Was die eigene Bohrung zeigt, wird zum Bohrbericht der Ranch.
  const gebohrt = learnFromWells(advanceDrilling(markt, balance), balance);
  const gepachtet = settleLeases(gebohrt, balance);
  // Beteiligungen aus dem Zeitsprung (4.5): Okara zahlt an Jacob oder Bullard.
  const rivale = settleVentures(advanceRival(gepachtet, balance, gebohrt, input.postedPrice), balance);
  // Eigene Fuhrwerke und Pipeline (0.2.15+2): Löhne, Unterhalt, Baufortschritt, Sabotage – vor den Zinsen.
  // Türme und Pumpen (0.2.15+7): Turmmiete und Pumpenunterhalt, ebenfalls vor den Zinsen.
  // 4.8 Andockpunkt: Anleihen, Kurs, Aufsichtsrat, Thorne – vor den Bankzinsen (ohne state.stocks wirkungslos).
  // 4.14 Andockpunkt: Tankstellen rechnen ab (vor den Zinsen); vor Kapitel 3 unverändert.
  const vertrieb = settleBrand(rivale, balance);
  const verzinst = settleLoans(settleStocks(settleRigs(advanceLogistics(vertrieb, balance), balance), balance), balance);
  // 4.15 Andockpunkt: Börse (ab Kapitel 3) – Kurse, Maklerzinsen, Zwangsverkäufe vor der Pleiteprüfung.
  // Warnungen und Maklerzins zählen mit dem Kreditklima vom Rundenbeginn (das stand in der Zeitung).
  const gehandelt = settleExchange(verzinst, balance, readClimate(input));
  // 4.17 Andockpunkt: Kapitel 3 – Seismik-Berichte, Konsortium, Projekte, Stand (vor Kapitel 3 unverändert).
  // 4.19 Andockpunkt: Rivalen in Kapitel 3 – Margarets Tankstellen, Thornes Aktien, Bullards Schulden (vor Kapitel 3 unverändert).
  const konzern = settleRivalsK3(advanceKapitel3(gehandelt, balance, texts.kapitel3), balance);
  // Der neue Preis gilt für die Verkäufe der nächsten Runde.
  // 4.7 Andockpunkt: Fernleitungen nach dem Transport – Thorne nimmt unter Druck eine Erhöhung zurück und senkt den Tarif.
  const gefahren = advanceBigPipelines(advanceTransport(konzern, balance), balance, { railTariffBefore: konzern.railTariff });
  // Rivalen-Diplomatie (4.10): ohne state.diplomacy (Kapitel 1) passiert nichts. // 4.10 Andockpunkt
  const diplomatie = advanceDiplomacy(gefahren, balance);
  // 4.10 Andockpunkt: Verkauf an Pruett (Antwort auf seinen Besuch) beendet die Partie ohne weitere Abrechnung.
  if (diplomatie.finished) return { ...diplomatie, roundLogStart };
  // 4.11 Andockpunkt: Ermittler und Forschung – in Kapitel 1 kommt derselbe Zustand zurück.
  const ermittelt = advanceResearch(advanceInvestigation(diplomatie, balance), balance);
  // 4.16 Andockpunkt: Beteiligungen und Lobby in Hallstead (ohne Hallstead-Zustand unverändert) – vor der Pleiteprüfung.
  const hallstead = settleHallstead(ermittelt, balance);
  const state = { ...checkBankruptcy(hallstead, balance), roundLogStart };
  if (state.ending === 'pleite') return state;
  // 4.12 Andockpunkt: frühe Enden ab Kapitel 2 (abgesetzt, geschluckt, hinter Gittern – GDD §14).
  const frueh = applyEarlyEnding(state, balance);
  if (frueh.finished) return frueh;
  if (state.round >= state.totalRounds) {
    // Kapitelprüfung (2.11, Kapitel 2: 4.12): steht im Protokoll, der Ergebnisbildschirm zeigt die Einzelheiten.
    const ende: GameState = { ...state, finished: true, ending: 'kapitel' };
    const kapitel = chapterOf(state);
    const pruefung = chapterPassed(ende, balance) ? 'Das Ziel ist erreicht.' : 'Das Ziel ist verfehlt.';
    return { ...ende, log: [...state.log, `${formatDate(state)}: Kapitel ${kapitel} ist zu Ende. ${pruefung}`] };
  }
  const next = { ...state, round: state.round + 1 };
  // Zur neuen Runde kommen neue Ereignisse auf den Schreibtisch – nach einer Geburt (2.7).
  // Wildcatter (2.8): Die neuen Nachbarquellen der Runde bekommen ihre Besitzer.
  const begonnen = advanceWildcatters(
    checkBirth({ ...next, log: [...state.log, `${formatDate(next)}: Eine neue Runde beginnt.`] }, balance),
    balance,
  );
  return drawEvents(begonnen, balance, catalog);
}
