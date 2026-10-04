// Spielzustand und Rundenschleife. Alles hier ist reine Logik:
// Funktionen bekommen einen Zustand und geben einen neuen zurück.

import { newAgenda, settleAgenda, type AgendaState } from './agenda';
import type { Balance, Rating, TransportMode } from './balance';
import { formatDate } from './calendar';
import { checkBankruptcy, settleLoans, type Loan } from './credit';
import { chapterCheck } from './chapter';
import { advanceDrilling, type Well } from './drilling';
import { assignFields, buildFields, type Field } from './field';
import { makeForecasts, type Forecast } from './forecast';
import { generateParcels, type Parcel } from './geology';
import { initialRegions } from './ranches';
import { openRegions } from './regions';
import { checkBirth, newFamily, settleFamily, type FamilyState } from './family';
import { autoResolve, drawEvents, newEventsState, type EventDef, type EventsState } from './events';
import { parcelLabel, settleLeases, startOptions, type Lease, type LeaseOption } from './lease';
import { advanceProduction } from './production';
import { settleRigs, startRigs, type Rig } from './rigs';
import { Rng, seedFromString, type RngState } from './rng';
import { advanceMarket, computePrice, neighbourSupply, saltHillSupply } from './market';
import { advanceWorld, newWorld, saltHillInput, worldPriceFactor, type WorldState } from './world';
import { newRival, advanceRival, type RivalState } from './rival';
import { advanceLogistics, newLogistics, settleStorage, spillOver, type LogisticsState } from './logistics';
import { advanceTransport, noShipments } from './transport';
import { settleTakeover } from './trust';
import { advanceWildcatters, newWildcatters, type WildcattersState } from './wildcatters';
// 4.16 Andockpunkt: Nebeninvestments und Lobbyist in Hallstead (ab Kapitel 3).
import { settleHallstead } from './hallstead';
import type { HallsteadState } from './hallsteadState';

export { SEASONS, dateOf, formatDate, type Season } from './calendar';

/** Wie das Spiel ausgeht: gar nicht, mit Ende des Kapitels, mit Pleite oder mit dem Verkauf an den Crane Trust (2.8). */
export type Ending = 'kapitel' | 'pleite' | 'verkauft' | null;

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
  /** Geologen-Prognose je Parzelle; für die Entdeckungsquelle gibt es keine. */
  forecasts: Record<string, Forecast>;
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
  log: string[];
  /** Länge von log beim letzten Rundenende: alles danach gehört zum Protokoll der laufenden Runde. */
  roundLogStart: number;
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
  const startPrice = computePrice(balance.market, neighbourSupply(balance.market, 1), worldPriceFactor(worldModel, balance.worldModel));
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
  };
  // Erst die Startoptionen, dann die Prognosen: so bleiben Karte und Startoptionen
  // bei gleichem Seed so, wie sie es vor der Prognose waren.
  state.options = startOptions(state, balance, rng);
  state.forecasts = makeForecasts(balance, parcels, balance.forecast.geologist, rng);
  state.rng = rng.state;
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
  const input = saltHillInput(angebot, balance.market.demand, balance.worldModel);
  return { ...state, worldModel: advanceWorld(state.worldModel, balance.worldModel, input) };
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
export function endRound(input: GameState, balance: Balance, catalog: readonly EventDef[] = []): GameState {
  if (input.finished) return input;
  // Offene Ereignisse bekommen ihre Standard-Antwort, bevor die Runde abgerechnet wird.
  // Gebiete (0.2.15+5): Hat eine Antwort ein Gebiet freigeschaltet, bekommt es jetzt seine Ranches.
  const beantwortet = openRegions(autoResolve(input, catalog, undefined, balance.events.timedRounds), balance);
  const roundLogStart = beantwortet.log.length;
  // Crane-Übernahme (2.8): Hat Jacob verkauft, endet die Partie hier – ohne weitere Abrechnung.
  const verkauft = settleTakeover(beantwortet, balance);
  if (verkauft.ending === 'verkauft') return { ...verkauft, roundLogStart };
  // Familie (2.7): Familienzeit gibt Kraft, Vernachlässigung kostet Beziehung.
  const familie = settleFamily(beantwortet, balance);
  // Termine (2.3): Krankheit (2.7), ruhige Runde gibt Kraft zurück, die nächste beginnt mit frischen Terminen.
  const ausgeruht = settleAgenda(familie, balance);
  // Lager (0.2.15+2): Kosten, Schwund und Brand für das Öl, das noch im Tank steht; neue Tanks sind fertig.
  // Nach der Förderung läuft aus, was nicht mehr in die Tanks passt.
  const gefoerdert = spillOver(advanceProduction(settleStorage(ausgeruht, balance), balance), balance);
  // Weltmodell (4.1): Der Preis dieser Runde folgt dem Welttrend von heute, danach rückt die Welt ein Quartal weiter.
  // Salt Hill fließt mit seinem Über- oder Unterangebot (winzig) in die Welt ein.
  const rivalRate = balance.rivals.bullard.ratePerWell;
  const markt = advanceWorldInGame(
    advanceMarket(gefoerdert, balance.market, rivalRate, worldPriceFactor(gefoerdert.worldModel, balance.worldModel)),
    gefoerdert,
    balance,
  );
  const gebohrt = advanceDrilling(markt, balance);
  const gepachtet = settleLeases(gebohrt, balance);
  const rivale = advanceRival(gepachtet, balance, gebohrt, input.postedPrice);
  // Eigene Fuhrwerke und Pipeline (0.2.15+2): Löhne, Unterhalt, Baufortschritt, Sabotage – vor den Zinsen.
  // Türme und Pumpen (0.2.15+7): Turmmiete und Pumpenunterhalt, ebenfalls vor den Zinsen.
  const verzinst = settleLoans(settleRigs(advanceLogistics(rivale, balance), balance), balance);
  // Der neue Preis gilt für die Verkäufe der nächsten Runde.
  const gefahren = advanceTransport(verzinst, balance);
  // 4.16 Andockpunkt: Beteiligungen und Lobby in Hallstead (ohne Hallstead-Zustand unverändert) – vor der Pleiteprüfung.
  const hallstead = settleHallstead(gefahren, balance);
  const state = { ...checkBankruptcy(hallstead, balance), roundLogStart };
  if (state.ending === 'pleite') return state;
  if (state.round >= state.totalRounds) {
    // Kapitelprüfung (2.11): steht im Protokoll, der Ergebnisbildschirm zeigt die Einzelheiten.
    const ende: GameState = { ...state, finished: true, ending: 'kapitel' };
    const pruefung = chapterCheck(ende, balance).passed ? 'Das Ziel ist erreicht.' : 'Das Ziel ist verfehlt.';
    return { ...ende, log: [...state.log, `${formatDate(state)}: Kapitel 1 ist zu Ende. ${pruefung}`] };
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
