// App (1.11, ab 0.2.15+9 als Szene): hält den Spielzustand, sichert ihn nach
// jeder Aktion und zeigt Schreibtisch, Karte oder – am Ende – das Tableau mit
// Kapitelende oder Pleite. Was offen ist (Fenster, Ranch, Ansicht), steht in
// sceneState. Spielregeln und alle Texte kommen aus src/sim – hier wird nur geklickt.

import { useEffect, useReducer, useRef, useState } from 'react';
import { agendaView } from '../sim/agenda';
import { decideIpo } from '../sim/chapter';
import type { LoanResult } from '../sim/credit';
import { applyAction, nextStep, type DeskActionKind } from '../sim/desk';
import { deskEvents, deskMail, deskRoutines } from '../sim/events';
import { endRound, newGame, type GameState } from '../sim/game';
import { tutorialActive, tutorialHint, viewTutorial } from '../sim/tutorial';
import { clearAutosave, loadAutosave, writeAutosave } from './autosave';
import { balance } from './balance';
import { ChapterEndScreen } from './ChapterEndScreen';
import { events } from './events';
import { GameOverScreen } from './GameOverScreen';
import { inboxBadges, openItems, sortInbox, type OpenItem } from './inbox';
import { keyInput, keyToAction } from './keys';
import { MapView } from './map/MapView';
import { RanchSheet } from './map/RanchSheet';
import { DeskScene } from './scene/DeskScene';
import { TopBar } from './scene/TopBar';
import { initialScene, ruthTarget, sceneReducer, seen, targetObject, type RuthTarget, type SheetBack, type SheetId } from './sceneState';
import { useFocusReturn } from './sheet/useFocusReturn';
import { SheetHost } from './sheets/SheetHost';
import type { SheetContext } from './sheets/types';
import { readPref, writePref } from './storage';
import { debugToolsVisible } from './testerConfig';
import { loadTutorialOn, saveTutorialOn, tutorialContent } from './tutorial';

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Für Tests und Fehlersuche: ?seed=abc&debug=1 in der Adresse.
const params = new URLSearchParams(window.location.search);
// Debug-Bereich: beim Entwickeln immer, im Tester-Build nur mit ?debug=1.
const debugTools = debugToolsVisible(import.meta.env.DEV, window.location.search);

const ZEITUNG_PREF = 'crude.zeitung';

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
  if (gespeichert) return { seed: gespeichert.seed, game: gespeichert };
  const seed = randomSeed();
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
  const [ui, dispatch] = useReducer(sceneReducer, initialScene);
  // Zählt neue Spiele, damit auch ein neues Spiel in Runde 1 die Zeitung aufschlägt.
  const [spielNr, setSpielNr] = useState(0);

  // Nach jeder Runde und jeder Aktion wird der Spielstand neu geschrieben.
  useEffect(() => setSaved(writeAutosave(game)), [game]);

  // Neue Runde: „schon gesehen“ vergessen, die Zeitung schlägt sich auf.
  // Nur beim Rundenwechsel (oder neuen Spiel) – die Vorliebe allein öffnet nichts.
  useEffect(() => {
    dispatch({ type: 'round', round: game.round, autoNewspaper: autoNewspaper && !game.finished });
  }, [game.round, spielNr]);

  // Fenster zu: Fokus zurück zum Gegenstand.
  useFocusReturn(ui.sheet?.id ?? null);

  // Ein Fenster wechselt: die alte Rückmeldung gehört nicht mehr dazu.
  useEffect(() => setNotice(null), [ui.sheet?.id, ui.ranch]);

  // Was auf dem Tisch liegt – nur gefiltert und gezählt aus src/sim.
  const inbox = sortInbox(deskEvents(game, balance, events), deskMail(game, balance, events), deskRoutines(game, balance, events));
  const badges = inboxBadges(inbox);
  const offen = openItems(inbox, agendaView(game, balance));

  // Der Schreibtisch sagt, was als Nächstes dran ist; danach richtet sich Ruths Zettel.
  const step = nextStep(game, balance);
  const hint = tutorialOn ? tutorialHint(game, balance) : null;
  const tutorialView = hint ? viewTutorial(hint, tutorialContent) : null;
  const ziel = ruthTarget({
    tutorial: hint ? { kind: hint.action.kind, parcelId: 'parcelId' in hint.action ? hint.action.parcelId : undefined } : null,
    stepParcelIds: step?.parcelIds ?? [],
    openTargets: offen.map((o) => o.target),
    finished: game.finished,
  });
  const heroisch = hint?.parcelIds ?? step?.parcelIds ?? [];

  const tableau = (game.ending === 'pleite' || game.ending === 'kapitel' || game.ending === 'verkauft') && !(peek && game.ending !== 'pleite');

  function open(sheet: SheetId, opts: { tab?: string; back?: SheetBack } = {}) {
    dispatch({ type: 'open', sheet, ...opts });
  }

  function goTo(target: RuthTarget) {
    if (target.kind === 'ranch') dispatch({ type: 'showOnMap', id: target.parcelId });
    else open(target.sheet, { tab: target.tab });
  }

  function goToItem(item: OpenItem) {
    // Ab Etappe 2 kommt hier der Besucher herein; bis dahin liegen alle Besuche am Notizspieß.
    open(item.target === 'tuer' ? 'vorfaelle' : item.target, { back: { sheet: 'glocke' } });
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
    if (result.ok) onGame(result.state);
    else setNotice(result.reason);
  }

  function apply(result: LoanResult) {
    if (result.ok) onGame(result.state);
    else setNotice(result.reason);
  }

  function end() {
    if (game.finished) return;
    setGame(endRound(game, balance, events));
    setNotice(null);
    dispatch({ type: 'close' });
  }

  // Entscheidung zur Aktiengesellschaft am Kapitelende (2.11).
  function ipo(share: number) {
    const result = decideIpo(game, balance, share);
    if (result.ok) setGame(result.state);
    else setNotice(result.reason);
  }

  function startNewWorld(neuerSeed: string) {
    setSeed(neuerSeed);
    setGame(newGame(neuerSeed, balance, events));
    setNotice(null);
    setPeek(false);
    dispatch({ type: 'reset' });
    setSpielNr((n) => n + 1);
  }

  // Spielstand weg und neu anfangen: so lässt sich ein alter Stand gezielt prüfen.
  function forget() {
    clearAutosave();
    startNewWorld(randomSeed());
  }

  // Tastatur: Kürzel am Schreibtisch, Esc in fester Reihenfolge (sceneState.escape).
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (tableau) return;
      if (e.key === 'Escape') {
        // Was ein Fenster oder die Karte schon behandelt hat, bleibt behandelt.
        if (e.defaultPrevented) return;
        dispatch({ type: 'escape' });
        return;
      }
      if (e.defaultPrevented) return;
      const action = keyToAction(keyInput(e), { view: ui.view, sheetOpen: ui.sheet !== null, visitorOpen: ui.visitor !== null, debugTools });
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
          // Besucher kommen mit Etappe 2; bis dahin wartet niemand vor der Tür.
          {
            const tuer = offen.find((o) => o.target === 'tuer');
            if (tuer) goToItem(tuer);
          }
          break;
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  });

  // Zurück von der Karte: Fokus auf die Wandkarte (nicht beim ersten Aufbau).
  const letzteAnsicht = useRef(ui.view);
  useEffect(() => {
    if (letzteAnsicht.current === 'map' && ui.view === 'desk') document.querySelector<HTMLElement>('.objekt-karte')?.focus({ preventScroll: true });
    letzteAnsicht.current = ui.view;
  }, [ui.view]);

  const ctx: SheetContext = {
    game,
    inbox,
    debug,
    debugTools,
    onGame,
    onLoan: apply,
    tab: ui.sheet?.tab,
    onTab: (tab) => dispatch({ type: 'tab', tab }),
    open,
    showOnMap: (id) => dispatch({ type: 'showOnMap', id }),
  };

  const topBar = <TopBar game={game} debug={debug} saved={saved} onMenu={() => open('menu')} onLedger={() => open('kassenbuch')} />;

  const sheets = ui.sheet && (
    <SheetHost
      open={ui.sheet}
      ctx={ctx}
      notice={notice}
      onClose={() => dispatch({ type: 'close' })}
      onBack={() => dispatch({ type: 'back' })}
      onEndRound={end}
      onGo={goToItem}
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
        onRestart: forget,
        onDebug: setDebug,
        onSeed: setSeed,
        onNewWorld: () => startNewWorld(seed),
        onRandomWorld: () => startNewWorld(randomSeed()),
        onForget: forget,
      }}
    />
  );

  if (tableau) {
    return (
      <div className="buehne">
        <div className="tableau">
          {topBar}
          <div className="tableau-flaeche">
            {game.ending === 'pleite' ? (
              <GameOverScreen game={game} onRestart={() => startNewWorld(randomSeed())} />
            ) : (
              <>
                <ChapterEndScreen game={game} onRestart={() => startNewWorld(randomSeed())} onIpo={ipo} />
                {notice && <p className="randnotiz warn">{notice}</p>}
                <p>
                  <button type="button" className="link" onClick={() => setPeek(true)}>
                    Noch einmal auf den Schreibtisch schauen
                  </button>
                </p>
              </>
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

  return (
    <div className={erschoepft ? 'buehne erschoepft' : 'buehne'}>
      {ui.view === 'map' ? (
        <MapView
          game={game}
          debug={debug}
          ranch={ui.ranch}
          highlight={heroisch}
          topBar={topBar}
          ranchSheet={
            parcel ? (
              <RanchSheet
                game={game}
                parcel={parcel}
                debug={debug}
                notice={notice}
                stepText={tutorialView?.text ?? step?.text ?? null}
                onAction={act}
                onClose={() => dispatch({ type: 'ranch', id: null })}
                onLedger={() => open('kassenbuch')}
              />
            ) : null
          }
          onSelect={(id) => dispatch({ type: 'ranch', id })}
          onCloseRanch={() => dispatch({ type: 'ranch', id: null })}
          onDesk={() => dispatch({ type: 'view', view: 'desk' })}
          onPipeline={() => open('fracht', { tab: 'pipeline' })}
          onBell={() => open('glocke')}
        />
      ) : (
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
          glow={targetObject(ziel)}
          onRuth={ziel ? () => goTo(ziel) : null}
          onOpen={(sheet, tab) => open(sheet, { tab })}
          onMap={() => dispatch({ type: 'view', view: 'map' })}
        />
      )}
      {sheets}
    </div>
  );
}
