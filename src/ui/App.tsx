// App (1.11, ab 0.2.15+9 als Szene): hält den Spielzustand, sichert ihn nach
// jeder Aktion und zeigt Schreibtisch, Karte oder – am Ende – das Tableau mit
// Kapitelende oder Pleite. Was offen ist (Fenster, Ranch, Ansicht), steht in
// sceneState. Spielregeln und alle Texte kommen aus src/sim – hier wird nur geklickt.
// Ab 0.2.15+10 dazu: Besucher an der Tür, „neu“-Hinweise, Übergänge (Fenster,
// Wandkarte ⇄ Karte, Rundenwechsel) und der Rundgang beim ersten Start.
// Ab 0.2.15+11: Rundenbericht nach der Glocke, Auswahl „Wer wartet“ an der Tür,
// Ruths Zettel mit den offenen Punkten, Hinweise auf der Karte.
// Ab 0.4.5: Zeitsprung nach Kapitel 1 – Brief an den Verwalter, Weichen-Telegramme,
// Chronik „Die Jahre dazwischen“, dann Kapitel 2 (Platzhalter) am Schreibtisch.

import { contactNames } from './plans';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { agendaView } from '../sim/agenda';
import { decideIpo } from '../sim/chapter';
import type { LoanResult } from '../sim/credit';
import { applyAction, nextStep, parcelActions, type DeskActionKind } from '../sim/desk';
import { deskEvents, deskMail, deskRoutines } from '../sim/events';
import { endRound, formatDate, newGame, type GameState } from '../sim/game';
import { ranchOfFigure } from '../sim/geology';
import { tutorialActive, tutorialHint, viewTutorial } from '../sim/tutorial';
import { answerSwitch, continueTimeskip, markChronicleRead, runTimeskip, startTimeskip, unreadChronicle, type Directives } from '../sim/timeskip';
import { parcelLabel } from '../sim/lease';
import { deeperOutlook } from '../sim/deeper';
import { deeperShort } from './deeperText';
import { clearAutosave, loadAutosave, writeAutosave } from './autosave';
import { balance } from './balance';
import { k3 } from './kapitel3'; // 4.17 Andockpunkt: Texte aus content/kapitel3.yaml
import { ChapterEndScreen } from './ChapterEndScreen';
import { events } from './events';
import { stocksContent } from './stocks';
import { GameOverScreen } from './GameOverScreen';
import { ChronicleScreen, DirectivesLetter, SwitchTelegram } from './TimeskipScreen';
import { figures } from './figureContent';
import { figureOf } from './figures';
import { eventsShownIn, inboxBadges, landDeadlines, openItems, seenKey, sortInbox, unseen, visitorNames, type OpenItem } from './inbox';
import { keyInput, keyToAction } from './keys';
import type { MapMarker } from './Map';
import { MapView } from './map/MapView';
import { RanchSheet } from './map/RanchSheet';
import { DeskScene } from './scene/DeskScene';
import { IntroTour } from './scene/IntroTour';
import { MapZoom } from './scene/MapZoom';
import { RoundTransition } from './scene/RoundTransition';
import { TopBar } from './scene/TopBar';
import {
  autoVisitor,
  restoreScene,
  ruthTarget,
  sceneReducer,
  seen,
  storeScene,
  targetObject,
  type OpenSheet,
  type RuthTarget,
  type SheetBack,
  type SheetId,
} from './sceneState';
import { useFocusReturn } from './sheet/useFocusReturn';
import type { RoundReport } from './sheets/ReportSheet';
import { SheetHost } from './sheets/SheetHost';
import type { SheetContext } from './sheets/types';
import { freshSeed, withoutSeedParam } from './restart';
import { readPref, writePref } from './storage';
import { debugToolsVisible } from './testerConfig';
import { tourAutoStart, tourFor } from './tour';
import { tourSteps, tourStepsK2, tourStepsK3 } from './tourContent';
import { chapterOf } from '../sim/chapterOf';
import { openProvince } from '../sim/chapterSystems';
import { loadTutorialOn, mapTutorialContent, saveTutorialOn, tutorialContent } from './tutorial';
import { VisitorScene } from './visitor/VisitorScene';
import { appearances } from './visitorContent';

/** Kapitelstart nach dem Zeitsprung (Integration Phase 4): Räte für das Aktienbuch aus content/stocks.yaml. */
const kapitelTexte = { stocksBoard: stocksContent.board };

// Für Tests und Fehlersuche: ?seed=abc&debug=1 in der Adresse.
const params = new URLSearchParams(window.location.search);
// Debug-Bereich: beim Entwickeln immer, im Tester-Build nur mit ?debug=1.
const debugTools = debugToolsVisible(import.meta.env.DEV, window.location.search);

const ZEITUNG_PREF = 'crude.zeitung';
/** Was in dieser Runde schon angesehen wurde (für „neu“), über ein Neuladen hinweg. */
const SZENE_PREF = 'crude.szene';
/** Der Rundgang der Einstiegshilfe lief schon einmal. */
/** So lange geht ein Fenster zu (Übergang). */
const ZU_MS = 120;
/** So lange klopft es, bevor der Besuch von selbst hereinkommt. */
const KLOPF_MS = 700;

/** Stempel nach einer Aktion auf der Karte – nur die Beschriftung, was geschah, sagt src/sim. */
const STEMPEL: Record<DeskActionKind, string> = {
  lease: 'Gepachtet',
  option: 'Option gesichert',
  exercise: 'Option eingelöst',
  drill: 'Bohrung begonnen',
  deeper: 'Es geht tiefer',
  fish: 'Wird geborgen',
  abandon: 'Aufgegeben',
  pump: 'Pumpe bestellt',
};

/** „600 m lohnt ab etwa 6 %, Geologe 9 % – “ oder nichts. */
function wetteText(kurz: string | null): string {
  return kurz ? `${kurz} – ` : '';
}

function wenigBewegung(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Womit das Spiel anfängt: mit dem Seed aus der Adresse (immer eine frische
 * Welt), sonst mit dem Spielstand vom letzten Besuch, sonst mit einer neuen
 * zufälligen Welt. Seed und Zustand gehören zusammen, also kommen beide aus
 * einem einzigen Aufruf.
 */
function start(): { seed: string; game: GameState } {
  const ausUrl = params.get('seed');
  if (ausUrl !== null) return { seed: ausUrl, game: newGame(ausUrl, balance, events) };
  const gespeichert = loadAutosave();
  // 0.4.20+4: Ältere Stände aus Kapitel 2/3 bekommen die offene Provinz nachgereicht.
  if (gespeichert) return { seed: gespeichert.seed, game: openProvince(gespeichert, balance) };
  const seed = freshSeed('');
  return { seed, game: newGame(seed, balance, events) };
}

export function App() {
  const [anfang] = useState(start);
  const [seed, setSeed] = useState(anfang.seed);
  const [game, setGame] = useState(anfang.game);
  const [debug, setDebug] = useState(params.get('debug') === '1');
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Einstieg (2.13): Hinweise an oder aus – eine Vorliebe, kein Teil des Spielstands.
  const [tutorialOn, setTutorialOn] = useState(loadTutorialOn);
  const [autoNewspaper, setAutoNewspaper] = useState(() => readPref(ZEITUNG_PREF) !== 'aus');
  // Am Kapitelende darf man noch einmal auf den Schreibtisch schauen.
  const [peek, setPeek] = useState(false);
  // Was in dieser Runde schon angesehen wurde, gilt nach dem Neuladen weiter (gleiche Partie, gleiche Runde).
  const [ui, dispatch] = useReducer(sceneReducer, null, () => restoreScene(readPref(SZENE_PREF), `${anfang.game.seed}:${anfang.game.round}`));
  // Rundenwechsel (2c): das Kalenderblatt reißt ab, bevor der neue Tag beginnt.
  const [uebergang, setUebergang] = useState<{ from: string; to: string; round: number; lines: string[] } | null>(null);
  // Rundenbericht (0.2.15+11): was über Nacht geschah – liegt vor der Zeitung auf dem Tisch.
  const [bericht, setBericht] = useState<RoundReport | null>(null);
  // Fenster geht zu: noch kurz sichtbar (2c).
  const [nachlauf, setNachlauf] = useState<OpenSheet | null>(null);
  // Zoom Wandkarte ⇄ Karte (2c): erst danach baut sich die Karte auf.
  const [zoom, setZoom] = useState<'in' | 'out' | null>(null);
  const [letzteAnsicht, setLetzteAnsicht] = useState(ui.view);
  if (letzteAnsicht !== ui.view) {
    setLetzteAnsicht(ui.view);
    setZoom(ui.view === 'map' ? 'in' : 'out');
  }
  // Stempel nach einer Aktion auf der Karte (2b).
  const [stempel, setStempel] = useState<{ text: string; n: number } | null>(null);
  // Rundgang der Einstiegshilfe beim ersten Start (2d) und welcher Gegenstand gerade leuchtet.
  const [rundgang, setRundgang] = useState(false);
  const [spot, setSpot] = useState<string | null>(null);
  // Zählt neue Spiele, damit auch ein neues Spiel in Runde 1 die Zeitung aufschlägt.
  const [spielNr, setSpielNr] = useState(0);
  // Zeitsprung (4.5): Der Brief an den Verwalter liegt offen.
  const [brief, setBrief] = useState(false);
  // Läuft ein Sprung, steht die nächste Weiche fest (src/sim rechnet ihn von vorn).
  const sprungSchritt = useMemo(() => (game.jump ? runTimeskip(game, balance, events, kapitelTexte) : null), [game]);
  const chronik = unreadChronicle(game);
  // Sicherheitsnetz: Ist ein geladener Sprung schon ganz beantwortet, beginnt Kapitel 2 sofort.
  useEffect(() => {
    if (sprungSchritt?.status === 'done') setGame(sprungSchritt.state);
  }, [sprungSchritt]);

  // Nach jeder Runde und jeder Aktion wird der Spielstand neu geschrieben.
  useEffect(() => setSaved(writeAutosave(game)), [game]);

  // Neue Runde: „schon gesehen“ vergessen, die Zeitung schlägt sich auf – erst,
  // wenn das Kalenderblatt abgerissen ist. Nur beim Rundenwechsel (oder neuen
  // Spiel) – die Vorliebe allein öffnet nichts.
  const wechselt = uebergang !== null;
  useEffect(() => {
    if (wechselt) return;
    // Liegt die Chronik nach dem Zeitsprung noch auf dem Tisch, schlägt sich die Zeitung erst danach auf (4.5).
    dispatch({ type: 'round', round: game.round, autoNewspaper: autoNewspaper && !game.finished && chronik === null, report: bericht?.round === game.round && !game.finished });
  }, [game.round, spielNr, wechselt]);

  // „Gesehen“ merken, damit „neu“ nach dem Neuladen nicht wieder aufleuchtet.
  useEffect(() => writePref(SZENE_PREF, storeScene(ui, `${game.seed}:${ui.round}`)), [ui.seen, ui.round, game.seed]);

  // Fenster zu: noch 120 ms sichtbar, dann weg (bei „weniger Bewegung“ sofort).
  const offenesFenster = useRef<OpenSheet | null>(ui.sheet);
  useEffect(() => {
    const war = offenesFenster.current;
    offenesFenster.current = ui.sheet;
    if (ui.sheet || !war || wenigBewegung()) {
      setNachlauf(null);
      return;
    }
    setNachlauf(war);
    const t = window.setTimeout(() => setNachlauf(null), ZU_MS);
    return () => window.clearTimeout(t);
  }, [ui.sheet]);

  // Fenster zu: Fokus zurück zum Gegenstand.
  useFocusReturn(ui.sheet?.id ?? null);

  // Ein Fenster wechselt: die alte Rückmeldung gehört nicht mehr dazu.
  useEffect(() => setNotice(null), [ui.sheet?.id, ui.ranch]);

  // Was auf dem Tisch liegt – nur gefiltert und gezählt aus src/sim.
  const inbox = sortInbox(deskEvents(game, balance, events), deskMail(game, balance, events), deskRoutines(game, balance, events), appearances);
  const badges = inboxBadges(inbox, ui.seen);
  const offen = openItems(inbox, agendaView(game, balance), landDeadlines(game));
  // Wer im Raum steht, wartet nicht mehr vor der Tür.
  const draussen = { ...inbox, visitors: inbox.visitors.filter((e) => e.id !== ui.visitor) };
  const wartende = visitorNames(draussen);
  // Wessen Frist zuerst abläuft, steht vorn (inbox.ts sortiert).
  const ersterBesuch = draussen.visitors[0];
  const ersteFigur = ersterBesuch && appearances[ersterBesuch.id]?.kind === 'visitor' ? (appearances[ersterBesuch.id] as { figure: string }).figure : null;

  // Wer ein Fenster mit Ereignissen öffnet, hat sie gesehen (für „neu“).
  const gezeigt = ui.sheet ? eventsShownIn(inbox, ui.sheet.id).map((e) => seenKey(e.id)) : [];
  const gezeigtKey = gezeigt.join(',');
  useEffect(() => {
    if (gezeigt.length > 0) dispatch({ type: 'seen', keys: gezeigt });
  }, [gezeigtKey]);

  // Der Schreibtisch sagt, was als Nächstes dran ist; danach richtet sich Ruths Zettel.
  const step = nextStep(game, balance);
  const hint = tutorialOn ? tutorialHint(game, balance) : null;
  const tutorialView = hint ? viewTutorial(hint, tutorialContent) : null;
  const ziel = ruthTarget({
    tutorial: hint ? { kind: hint.action.kind, parcelId: 'parcelId' in hint.action ? hint.action.parcelId : undefined } : null,
    stepParcelIds: step?.parcelIds ?? [],
    openTargets: offen.map((o) => (o.target === 'karte' ? { parcelId: o.parcelId ?? '' } : o.target)),
    finished: game.finished,
  });
  const heroisch = hint?.parcelIds ?? step?.parcelIds ?? [];
  // Auf der Karte ohne den Weg dorthin („Öffne die Wandkarte …“) – man ist ja schon da.
  const kartenText = hint ? viewTutorial(hint, mapTutorialContent).text : (step?.text ?? null);

  const tableau =
    (game.ending !== null && !(peek && game.ending !== 'pleite')) || game.jump !== null || chronik !== null;

  // Besuch von selbst (Bauplan Abschnitt 4): nach der Zeitung höchstens einer je Runde – erst klopft es.
  const besetzt = wechselt || rundgang || tableau || zoom !== null;
  const vonSelbst = autoVisitor(ui, {
    tableaus: inbox.tableaus.map((e) => e.id),
    visitors: inbox.visitors.map((e) => e.id),
    autoNewspaper,
    newspaper: !game.finished,
    busy: besetzt,
  });
  useEffect(() => {
    if (!vonSelbst) return;
    const t = window.setTimeout(() => dispatch({ type: 'visitor', id: vonSelbst }), KLOPF_MS);
    return () => window.clearTimeout(t);
  }, [vonSelbst]);

  // Rundgang beim allerersten Start, sobald der Tisch frei ist.
  // Erst wenn die Runde angekommen ist und die Zeitung (falls sie von selbst kommt) gelesen wurde.
  const zeitungOffen = autoNewspaper && !game.finished && !seen(ui, 'zeitung');
  const tour = tourFor(chapterOf(game), { k1: tourSteps, k2: tourStepsK2, k3: tourStepsK3 });
  useEffect(() => {
    // 0.4.20+2/+3: Ab Kapitel 2 je ein eigener Rundgang für die neuen Gegenstände – einmal, auch ohne Einstiegshilfe.
    if (rundgang || besetzt || game.finished || ui.view !== 'desk' || ui.sheet || ui.visitor) return;
    if (ui.round !== game.round || zeitungOffen) return;
    if (!tourAutoStart(tour.chapter, tutorialOn, readPref(tour.pref) === 'gesehen')) return;
    setRundgang(true);
  }, [tutorialOn, besetzt, game.finished, game.round, ui.round, zeitungOffen, ui.view, ui.sheet, ui.visitor, rundgang, tour.chapter, tour.pref]);

  function endeRundgang() {
    setRundgang(false);
    setSpot(null);
    writePref(tour.pref, 'gesehen');
    // Weiter geht es bei Ruths Zettel.
    window.setTimeout(() => document.querySelector<HTMLElement>('.zettel')?.focus({ preventScroll: true }), 0);
  }

  // Wartet einer, kommt er herein; warten mehrere, fragt Jacob erst, wer (0.2.15+11).
  function bitteHerein(back?: SheetBack) {
    if (draussen.visitors.length > 1) open('wartende', back ? { back } : {});
    else if (ersterBesuch) dispatch({ type: 'visitor', id: ersterBesuch.id });
  }

  function open(sheet: SheetId, opts: { tab?: string; back?: SheetBack; focus?: string } = {}) {
    // Während des Rundgangs bleibt der Tisch zu (die Blase liegt darüber).
    if (rundgang) return;
    dispatch({ type: 'open', sheet, ...opts });
  }

  function goTo(target: RuthTarget) {
    if (target.kind === 'ranch') dispatch({ type: 'showOnMap', id: target.parcelId });
    else if (target.kind === 'tuer') bitteHerein();
    else open(target.sheet, { tab: target.tab });
  }

  function goToItem(item: OpenItem, fromBell = true) {
    if (item.target === 'karte') {
      if (item.parcelId) dispatch({ type: 'showOnMap', id: item.parcelId });
      else dispatch({ type: 'view', view: 'map' });
    } else if (item.target === 'tuer') bitteHerein(fromBell ? { sheet: 'glocke' } : undefined);
    else open(item.target, fromBell ? { back: { sheet: 'glocke' } } : {});
  }

  function toggleTutorial(on: boolean) {
    setTutorialOn(on);
    saveTutorialOn(on);
  }

  function toggleAutoNewspaper(on: boolean) {
    setAutoNewspaper(on);
    writePref(ZEITUNG_PREF, on ? 'an' : 'aus');
  }

  function onGame(state: GameState) {
    setGame(state);
    setNotice(null);
  }

  function act(kind: DeskActionKind, parcelId: string) {
    const result = applyAction(game, balance, parcelId, kind);
    if (result.ok) {
      onGame(result.state);
      setStempel((alt) => ({ text: STEMPEL[kind], n: (alt?.n ?? 0) + 1 }));
    } else setNotice(result.reason);
  }

  // Der Stempel steht 800 ms.
  useEffect(() => {
    if (!stempel) return;
    const t = window.setTimeout(() => setStempel(null), 800);
    return () => window.clearTimeout(t);
  }, [stempel]);

  function apply(result: LoanResult) {
    if (result.ok) onGame(result.state);
    else setNotice(result.reason);
  }

  function end() {
    if (game.finished) return;
    const next = endRound(game, balance, events, { kapitel3: k3, contactNames }); // 4.17 Andockpunkt: Kapitel-3-Texte für die Kladde
    // Rundenwechsel (2c): Kalenderblatt, neues Datum. Was geschah, steht danach im Rundenbericht.
    // Am Kapitelende kommt das Tableau.
    if (!next.ending) {
      setUebergang({ from: formatDate(game), to: formatDate(next), round: next.round, lines: [] });
      setBericht({ round: next.round, from: formatDate(game), to: formatDate(next), before: game, after: next });
    }
    setGame(next);
    setNotice(null);
    dispatch({ type: 'close' });
  }

  // Entscheidung zur Aktiengesellschaft am Kapitelende (2.11).
  function ipo(share: number) {
    const result = decideIpo(game, balance, share);
    if (result.ok) setGame(result.state);
    else setNotice(result.reason);
  }

  // Zeitsprung (4.5): Direktiven abschicken, Weichen beantworten; fertig → Chronik, danach Kapitel 2.
  function sprungStarten(d: Directives) {
    const r = startTimeskip(game, balance, d);
    if (!r.ok) {
      setNotice(r.reason);
      return;
    }
    setBrief(false);
    setGame(continueTimeskip(r.state, balance, events, kapitelTexte));
  }

  function weicheBeantworten(id: Parameters<typeof answerSwitch>[2], choice: string) {
    const r = answerSwitch(game, balance, id, choice, events, kapitelTexte);
    if (!r.ok) {
      setNotice(r.reason);
      return;
    }
    setGame(continueTimeskip(r.state, balance, events, kapitelTexte));
  }

  function chronikGelesen() {
    setGame(markChronicleRead(game));
    setPeek(false);
    setUebergang(null);
    setBericht(null);
    dispatch({ type: 'reset' });
    setSpielNr((n) => n + 1);
  }

  function startNewWorld(neuerSeed: string) {
    setBrief(false);
    setSeed(neuerSeed);
    setGame(newGame(neuerSeed, balance, events));
    setNotice(null);
    setPeek(false);
    setUebergang(null);
    setBericht(null);
    dispatch({ type: 'reset' });
    setSpielNr((n) => n + 1);
  }

  // „Neues Spiel“ (Menü, Kapitelende, Pleite): Spielstand weg, neue Welt mit neuem Seed. Der Autosave
  // schreibt danach die neue Partie; ohne Speicher (gesperrter localStorage) läuft sie trotzdem.
  function neuesSpiel() {
    clearAutosave();
    try {
      const ohneSeed = withoutSeedParam(window.location.href);
      if (ohneSeed) window.history.replaceState(window.history.state, '', ohneSeed);
    } catch {
      /* Adresse lässt sich im iframe nicht ändern – dann eben nicht. */
    }
    startNewWorld(freshSeed(seed));
  }

  // Tastatur: Kürzel am Schreibtisch, Esc in fester Reihenfolge (sceneState.escape).
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (tableau || wechselt || rundgang) return;
      if (e.key === 'Escape') {
        // Was ein Fenster oder die Karte schon behandelt hat, bleibt behandelt.
        if (e.defaultPrevented) return;
        dispatch({ type: 'escape' });
        return;
      }
      if (e.defaultPrevented) return;
      const action = keyToAction(keyInput(e), { view: zoom ? 'map' : ui.view, sheetOpen: ui.sheet !== null, visitorOpen: ui.visitor !== null, debugTools });
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case 'open':
          open(action.sheet, { tab: action.tab });
          break;
        case 'map':
          dispatch({ type: 'view', view: 'map' });
          break;
        case 'help':
          open('menu', { tab: 'tasten' });
          break;
        case 'debug':
          open('menu', { tab: 'debug' });
          break;
        case 'visitor':
          bitteHerein();
          break;
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  });

  // Zurück von der Karte: Fokus auf die Wandkarte (nicht beim ersten Aufbau).
  const vorigeAnsicht = useRef(ui.view);
  useEffect(() => {
    if (vorigeAnsicht.current === 'map' && ui.view === 'desk') document.querySelector<HTMLElement>('.objekt-karte')?.focus({ preventScroll: true });
    vorigeAnsicht.current = ui.view;
  }, [ui.view]);

  // Besuch gegangen: Fokus zurück an die Tür – eine Szene, die auf „später“ gelegt
  // wurde, hängt jetzt am Notizspieß, dorthin geht der Fokus.
  const vorigerBesuch = useRef(ui.visitor);
  useEffect(() => {
    const war = vorigerBesuch.current;
    if (war !== null && ui.visitor === null && ui.view === 'desk' && !ui.sheet) {
      const ziel = appearances[war]?.kind === 'tableau' ? '.objekt-vorfaelle' : '.objekt-tuer';
      document.querySelector<HTMLElement>(ziel)?.focus({ preventScroll: true });
    }
    vorigerBesuch.current = ui.visitor;
  }, [ui.visitor, ui.view, ui.sheet]);

  // Zeichen auf der Karte (2b): Pflock, wo Jacob etwas tun kann; Brief, wo ein offenes Ereignis liegt.
  function kartenZeichen(): MapMarker[] {
    const zeichen: MapMarker[] = [];
    for (const p of game.parcels) {
      const eigen = game.leases.some((l) => l.parcelId === p.id && l.holder === 'jacob') || game.options.some((o) => o.parcelId === p.id && o.holder === 'jacob');
      if (!eigen) continue;
      const geht = parcelActions(game, balance, p.id).filter((a) => a.ok);
      if (geht.length > 0) zeichen.push({ parcelId: p.id, kind: 'pflock', label: geht.map((a) => a.label).join(' · ') });
    }
    for (const e of [...inbox.letters, ...inbox.visitors, ...inbox.tableaus, ...inbox.incidents]) {
      const figur = events.find((d) => d.id === e.id)?.ranch;
      const ranch = figur ? ranchOfFigure(game, figur) : undefined;
      if (ranch) zeichen.push({ parcelId: ranch.id, kind: 'brief', label: e.title, eventId: e.id });
    }
    return zeichen;
  }

  function zumZeichen(m: MapMarker) {
    const id = m.eventId;
    if (!id) return;
    // Der angeklickte Brief (oder Vorfall) liegt im Fenster vorn.
    if (inbox.letters.some((e) => e.id === id)) open('post', { focus: id });
    else if (inbox.visitors.some((e) => e.id === id) || inbox.tableaus.some((e) => e.id === id)) dispatch({ type: 'visitor', id });
    else open('vorfaelle', { focus: id });
  }

  const ctx: SheetContext = {
    game,
    inbox,
    debug,
    debugTools,
    onGame,
    onLoan: apply,
    tab: ui.sheet?.tab,
    focus: ui.sheet?.focus,
    onTab: (tab) => dispatch({ type: 'tab', tab }),
    open,
    showOnMap: (id) => dispatch({ type: 'showOnMap', id }),
  };

  const topBar = <TopBar game={game} debug={debug} saved={saved} onMenu={() => open('menu')} onLedger={() => open('kassenbuch')} />;

  const fenster = ui.sheet ?? nachlauf;
  const sheets = fenster && (
    <SheetHost
      key={fenster.id}
      open={fenster}
      closing={ui.sheet === null}
      ctx={ctx}
      notice={notice}
      onClose={() => dispatch({ type: 'close' })}
      onBack={() => dispatch({ type: 'back' })}
      onEndRound={end}
      onGo={goToItem}
      report={bericht}
      onVisitor={(id) => dispatch({ type: 'visitor', id })}
      onChapterEnd={
        game.ending
          ? () => {
              setPeek(false);
              dispatch({ type: 'close' });
            }
          : null
      }
      menu={{
        seed,
        tutorialOn,
        onTutorial: toggleTutorial,
        autoNewspaper,
        onAutoNewspaper: toggleAutoNewspaper,
        onTour: () => {
          dispatch({ type: 'close' });
          dispatch({ type: 'view', view: 'desk' });
          setRundgang(true);
        },
        onRestart: neuesSpiel,
        onDebug: setDebug,
        onSeed: setSeed,
        onNewWorld: () => startNewWorld(seed),
        onRandomWorld: () => startNewWorld(freshSeed(seed)),
        onForget: neuesSpiel,
      }}
    />
  );

  if (tableau) {
    return (
      <div className="buehne">
        <div className="tableau">
          {topBar}
          <div className="tableau-flaeche">
            {chronik ? (
              <ChronicleScreen game={game} record={chronik} onContinue={chronikGelesen} />
            ) : sprungSchritt?.status === 'switch' ? (
              <SwitchTelegram
                key={sprungSchritt.id}
                id={sprungSchritt.id}
                year={sprungSchritt.year}
                funds={sprungSchritt.funds}
                onAnswer={(c) => weicheBeantworten(sprungSchritt.id, c)}
              />
            ) : brief && game.ending === 'kapitel' ? (
              <DirectivesLetter game={game} onSend={sprungStarten} onBack={() => setBrief(false)} />
            ) : game.ending === 'pleite' ? (
              <GameOverScreen game={game} onRestart={neuesSpiel} />
            ) : (
              <ChapterEndScreen
                game={game}
                onRestart={neuesSpiel}
                onIpo={ipo}
                notice={notice}
                onPeek={() => setPeek(true)}
                onTimeskip={() => {
                  setNotice(null);
                  setBrief(true);
                }}
              />
            )}
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  const parcel = ui.ranch ? game.parcels.find((p) => p.id === ui.ranch) : undefined;
  const zeit = agendaView(game, balance);
  const erschoepft = !game.finished && (zeit.exhausted || zeit.sickRounds > 0);

  // Wer gerade im Raum steht (Besucher oder Szene).
  const imRaum = ui.visitor ? appearances[ui.visitor] : undefined;
  const besuchEvent = ui.visitor ? ([...inbox.visitors, ...inbox.tableaus].find((e) => e.id === ui.visitor) ?? null) : null;
  const besuch = ui.visitor && imRaum && (
    <VisitorScene
      key={ui.visitor}
      game={game}
      eventId={ui.visitor}
      event={besuchEvent}
      appearance={imRaum}
      onGame={onGame}
      onWait={() => dispatch({ type: 'visitor', id: null })}
      onLeave={() => dispatch({ type: 'visitor', id: null })}
    />
  );

  // Bohrungen, die auf Jacob warten – für Ruths Zettel, in einem Satz je Ranch.
  const bohrWartet = game.wells
    .filter((w) => w.status === 'decision' || w.status === 'stuck')
    .map((w) => {
      const p = game.parcels.find((x) => x.id === w.parcelId);
      const ort = p ? parcelLabel(p) : w.parcelId;
      const tiefe = balance.drilling.stages[w.stage - 1]?.depth;
      return {
        parcelId: w.parcelId,
        // Spielspaß K1: zur Entscheidung gleich die Gewinnschwelle und die Chance des Geologen.
        text:
          w.status === 'decision'
            ? `${ort}: in ${tiefe} m trocken – ${wetteText(deeperShort(deeperOutlook(game, balance, w.parcelId)))}tiefer bohren oder aufgeben?`
            : `${ort}: Werkzeug klemmt in ${tiefe} m – fischen oder aufgeben?`,
      };
    });
  // Thomas steht erst im Familienfoto, wenn die Szene seiner Geburt gespielt ist.
  const geburtOffen = inbox.tableaus.some((e) => events.find((d) => d.id === e.id)?.marked.includes('thomas_geboren'));
  const imRaumName = imRaum?.kind === 'visitor' ? imRaum.name : null;

  const schreibtisch = (
    <DeskScene
      game={game}
      badges={badges}
      debug={debug}
      topBar={topBar}
      newspaperNew={!seen(ui, 'zeitung')}
      saved={saved}
      step={step}
      tutorial={tutorialView}
      tutorialOffer={!tutorialOn && tutorialActive(game, balance)}
      onTutorial={toggleTutorial}
      glow={rundgang ? null : targetObject(ziel)}
      spotlight={spot}
      waiting={{ names: wartende, figure: ersteFigur ? figureOf(figures, ersteFigur) : null }}
      inRoom={imRaumName}
      hideFamily={geburtOffen ? ['thomas'] : []}
      open={offen}
      wellsWaiting={bohrWartet}
      onItem={(item) => goToItem(item, false)}
      onWell={(id) => dispatch({ type: 'showOnMap', id })}
      // Es klopft erst, wenn Übergang, Bericht und Zeitung weg sind – sonst geht es unter.
      knock={unseen(draussen.visitors, ui.seen).length > 0 && !besetzt && ui.sheet === null && ui.visitor === null}
      onDoor={() => bitteHerein()}
      onRuth={ziel ? () => goTo(ziel) : null}
      onOpen={(sheet, tab) => open(sheet, { tab })}
      onMap={() => dispatch({ type: 'view', view: 'map' })}
    />
  );

  return (
    <div className={erschoepft ? 'buehne erschoepft' : 'buehne'}>
      {ui.view === 'map' && zoom === null ? (
        <MapView
          game={game}
          debug={debug}
          ranch={ui.ranch}
          highlight={heroisch}
          topBar={topBar}
          markers={kartenZeichen()}
          onMarker={zumZeichen}
          stamp={stempel}
          ranchSheet={
            parcel ? (
              <RanchSheet
                game={game}
                parcel={parcel}
                debug={debug}
                notice={notice}
                stepText={kartenText}
                onAction={act}
                onClose={() => dispatch({ type: 'ranch', id: null })}
                onLedger={() => open('kassenbuch')}
                onRigs={() => open('akte', { tab: 'tuerme' })}
                onGame={onGame} // 4.17 Andockpunkt
              />
            ) : null
          }
          onSelect={(id) => dispatch({ type: 'ranch', id })}
          onCloseRanch={() => dispatch({ type: 'ranch', id: null })}
          onDesk={() => dispatch({ type: 'view', view: 'desk' })}
          onPipeline={() => open('fracht', { tab: 'pipeline' })}
          onBell={() => open('glocke')}
          hint={kartenText}
        />
      ) : (
        schreibtisch
      )}
      {zoom && <MapZoom dir={zoom} onDone={() => setZoom(null)} />}
      {besuch}
      {sheets}
      {rundgang && ui.view === 'desk' && <IntroTour steps={tour.steps} onStep={setSpot} onEnd={endeRundgang} />}
      {uebergang && <RoundTransition {...uebergang} onDone={() => setUebergang(null)} />}
    </div>
  );
}
