// App (1.11): hält den Spielzustand und reicht ihn an den Schreibtisch weiter.
// Spielregeln und alle Texte kommen aus src/sim – hier wird nur geklickt.

import { useEffect, useState } from 'react';
import { applyAction, nextStep, parcelActions, type DeskActionKind } from '../sim/desk';
import { accidentChance, deeperChance, wellOf, type Well } from '../sim/drilling';
import { formatForecast, trueChance } from '../sim/forecast';
import { fieldLabel, fieldOf } from '../sim/field';
import { endRound, newGame, type GameState } from '../sim/game';
import type { Parcel } from '../sim/geology';
import { leaseOf, leaseTerms, optionOf, roundsLeft } from '../sim/lease';
import { fieldStatus } from '../sim/production';
import type { LoanResult } from '../sim/credit';
import { balance } from './balance';
import { events } from './events';
import { clearAutosave, loadAutosave, writeAutosave } from './autosave';
import { Desk } from './Desk';
import { ChapterEndScreen } from './ChapterEndScreen';
import { GameOverScreen } from './GameOverScreen';
import { debugToolsVisible } from './testerConfig';

const GEOLOGY_LABEL = { dry: 'trocken', small: 'klein', gusher: 'Gusher' } as const;

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Barrel-Menge in lesbarer Form. */
function barrels(value: number): string {
  return value.toLocaleString('de-DE');
}

/** Förderzins als Prozent, z. B. 0.125 -> "12,5 %", 1/6 -> "16,7 %". */
function percent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

function rounds(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Für Tests und Fehlersuche: ?seed=abc&debug=1 in der Adresse.
const params = new URLSearchParams(window.location.search);
// Debug-Bereich: beim Entwickeln immer, im Tester-Build nur mit ?debug=1.
const debugTools = debugToolsVisible(import.meta.env.DEV, window.location.search);

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
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Nach jeder Runde und jeder Aktion wird der Spielstand neu geschrieben.
  useEffect(() => writeAutosave(game), [game]);

  // Der Schreibtisch sagt, was als Nächstes dran ist; danach richtet sich die Meldung.
  const step = nextStep(game, balance);
  const parcel = game.parcels.find((p) => p.id === selected);

  function select(id: string) {
    setSelected(id);
    setNotice(null);
  }

  function act(kind: DeskActionKind, parcelId: string) {
    const result = applyAction(game, balance, parcelId, kind);
    if (result.ok) {
      setGame(result.state);
      setNotice(null);
    } else {
      setNotice(result.reason);
    }
  }

  function apply(result: LoanResult) {
    if (result.ok) {
      setGame(result.state);
      setNotice(null);
    } else {
      setNotice(result.reason);
    }
  }

  function end() {
    setGame(endRound(game, balance, events));
    setNotice(null);
  }

  function startNewWorld(neuerSeed: string) {
    setSeed(neuerSeed);
    setGame(newGame(neuerSeed, balance, events));
    setSelected(null);
    setNotice(null);
  }

  // Spielstand weg und neu anfangen: so lässt sich ein alter Stand gezielt prüfen.
  function forget() {
    clearAutosave();
    startNewWorld(randomSeed());
  }

  if (game.ending === 'pleite') {
    return (
      <div className="app">
        <GameOverScreen game={game} onRestart={() => startNewWorld(randomSeed())} />
      </div>
    );
  }

  return (
    <div className="app">
      <Desk
        game={game}
        step={step}
        selected={selected}
        debug={debug}
        debugTools={debugTools}
        seed={seed}
        chapterEnd={
          game.ending === 'kapitel' ? <ChapterEndScreen game={game} onRestart={() => startNewWorld(randomSeed())} /> : null
        }
        parcelPanel={
          parcel ? (
            <ParcelPanel
              game={game}
              parcel={parcel}
              debug={debug}
              notice={notice}
              stepText={step?.text ?? null}
              onAction={act}
            />
          ) : (
            <p className="muted">Klick auf ein Feld der Karte – markierte Felder sind deine.</p>
          )
        }
        onSelect={select}
        onEndRound={end}
        onLoan={apply}
        onSold={(state) => {
          setGame(state);
          setNotice(null);
        }}
        onEvent={(state) => {
          setGame(state);
          setNotice(null);
        }}
        onDebug={setDebug}
        onSeed={setSeed}
        onNewWorld={() => startNewWorld(seed)}
        onRandomWorld={() => startNewWorld(randomSeed())}
        onForget={forget}
        onRestart={forget}
      />
    </div>
  );
}

interface PanelProps {
  game: GameState;
  parcel: Parcel;
  debug: boolean;
  /** Grund der letzten gescheiterten Aktion. */
  notice: string | null;
  /** Der nächste Schritt vom Schreibtisch. */
  stepText: string | null;
  onAction: (kind: DeskActionKind, parcelId: string) => void;
}

/**
 * Angaben und Knöpfe zur gewählten Parzelle. Welche Knöpfe es gibt, entscheidet
 * parcelActions aus src/sim – hier steht keine einzige Spielregel.
 */
function ParcelPanel({ game, parcel, debug, notice, stepText, onAction }: PanelProps) {
  const id = parcel.id;
  const lease = leaseOf(game, id);
  const option = optionOf(game, id);
  const terms = parcel.discovery ? undefined : leaseTerms(game, balance, id);
  const forecast = parcel.discovery ? undefined : game.forecasts[id];
  const well = wellOf(game, id);

  // Probelauf aus der Simulation: sie sagt, welche Knöpfe es gibt und ob sie gehen.
  const actions = parcelActions(game, balance, id);
  // Was der Spieler liest: der Fehler der letzten Aktion, sonst der Grund, warum
  // ein Knopf gesperrt ist, sonst der nächste Schritt.
  const hinweis = notice ?? actions.find((a) => !a.ok)?.reason ?? stepText;

  return (
    <div className="parcel-panel">
      <p>
        <strong>Parzelle {parcel.x + 1}/{parcel.y + 1}</strong> · Zone {parcel.zone}
      </p>

      {parcel.discovery ? (
        <p className="state discovery">Entdeckungsquelle – hier wurde zuerst Öl gefunden. Nicht pachtbar.</p>
      ) : (
        terms && (
          <dl className="terms">
            <dt>Geologe</dt>
            <dd>
              {forecast ? formatForecast(forecast) : '–'}
              {debug && ` · wirklich ${percent(trueChance(balance, parcel))}`}
            </dd>
            <dt>Lage</dt>
            <dd>{terms.location.label}</dd>
            <dt>Landbesitzer</dt>
            <dd>{terms.landowner.label}</dd>
            <dt>Bonus</dt>
            <dd>{money(terms.bonus)}</dd>
            <dt>Förderzins</dt>
            <dd>{percent(terms.royalty)}</dd>
            <dt>Optionsgebühr</dt>
            <dd>{money(terms.optionFee)}</dd>
          </dl>
        )
      )}

      {!parcel.discovery && (
        <p className={`state ${lease ? 'lease' : option ? 'option' : ''}`}>
          {lease?.holder === 'bullard' ? (
            <>
              Pacht von {balance.rivals.bullard.name}
              {lease.drilled ? ' · er bohrt hier' : <> · noch {rounds(roundsLeft(game, lease))}</>}
            </>
          ) : lease ? (
            <>
              Deine Pacht
              {lease.drilled ? ' (gebohrt, läuft unbefristet)' : <> · noch {rounds(roundsLeft(game, lease))}</>}
              <br />
              Bonus {money(lease.bonus)} gezahlt · Förderzins {percent(lease.royalty)}
              {!lease.drilled && (
                <>
                  <br />
                  Verzögerungszins {money(balance.lease.delayRental)} je Runde, solange ungebohrt
                </>
              )}
            </>
          ) : option ? (
            <>
              Deine Option{option.free && ' (kostenlos)'} · noch {rounds(roundsLeft(game, option))}
              <br />
              Gesichert: Bonus {money(option.bonus)} · Förderzins {percent(option.royalty)}
            </>
          ) : (
            'Frei'
          )}
        </p>
      )}

      {well && (
        <p className={`state well ${well.status}`}>
          <WellInfo well={well} />
          {debug && (
            <>
              <br />
              Debug: Öl in Stufe {well.oilStage ?? '– (trocken)'}
              {well.status === 'decision' && ` · Chance nächste Stufe ${percent(deeperChance(balance, parcel, well.stage))}`}
            </>
          )}
        </p>
      )}

      {well?.status === 'found' && <SourceInfo game={game} well={well} debug={debug} />}

      {actions.length > 0 && (
        <div className="actions">
          {actions.map((action) => (
            <button
              key={action.kind}
              disabled={!action.ok}
              title={action.reason}
              onClick={() => onAction(action.kind, id)}
            >
              {action.label}
              {action.kind === 'deeper' && well && (
                <>
                  {' '}
                  auf {balance.drilling.stages[well.stage].depth} m, Unfallrisiko{' '}
                  {percent(accidentChance(balance, well.stage + 1))}
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {hinweis && <p className="hint">{hinweis}</p>}

      {debug && (
        <p className="muted">
          Geologie: {GEOLOGY_LABEL[parcel.geology]}, {parcel.reserves.toLocaleString('de-DE')} Barrel
        </p>
      )}
    </div>
  );
}

/** Bohrstatus in Worten. */
function WellInfo({ well }: { well: Well }) {
  const depth = balance.drilling.stages[well.stage - 1].depth;
  const head = `Bohrung · Stufe ${well.stage}/${balance.drilling.stages.length} (${depth} m) · bisher ${money(well.spent)}`;
  switch (well.status) {
    case 'drilling':
      return (
        <>
          {head}
          <br />
          Der Turm bohrt – fertig in {rounds(well.roundsLeft)}.
        </>
      );
    case 'decision':
      return (
        <>
          {head}
          <br />In {depth} m trocken. Tiefer bohren oder aufgeben?
        </>
      );
    case 'stuck':
      return (
        <>
          {head}
          <br />Das Werkzeug klemmt in {depth} m.
        </>
      );
    case 'found':
      return (
        <>
          {head}
          <br />
          {well.result === 'gusher' ? 'GUSHER! Ein gewaltiger Fund.' : 'Öl gefunden – eine kleine Quelle.'}
        </>
      );
    case 'dry':
      return (
        <>
          {head}
          <br />Trocken – kein Öl.
        </>
      );
  }
}

/**
 * Zahlen zur fördernden Quelle: Rate, Ertrag und Druck im Feld. Reserve und
 * Restmenge sind verdeckt und erscheinen nur in der Debug-Ansicht.
 * Alle Regeln kommen aus src/sim/production.
 */
function SourceInfo({ game, well, debug }: { game: GameState; well: Well; debug: boolean }) {
  const field = fieldOf(game, well.parcelId);
  const p = well.production;
  if (!field || !p) return <p className="muted">Diese Quelle liegt in keinem Feld – sie fördert nichts.</p>;
  const lage = fieldStatus(game, balance, field);
  return (
    <dl className="terms quelle">
      <dt>Förderung</dt>
      <dd>
        letzte Runde: {barrels(p.lastRate)} bbl
        {debug && ` · anfangs ${barrels(p.initialRate)}`}
      </dd>
      <dt>Gesamt</dt>
      <dd>
        {barrels(p.total)} bbl in {rounds(p.roundsProduced)}
      </dd>
      <dt>Feld</dt>
      <dd>
        {fieldLabel(field)}: {lage.wells} {lage.wells === 1 ? 'Quelle' : 'Quellen'} · Druck{' '}
        {percent(lage.pressure)}
      </dd>
      {debug && (
        <>
          <dt>Debug</dt>
          <dd>
            {field.parcelIds.length} Parzellen · {barrels(field.reserves)} bbl im Boden · noch{' '}
            {barrels(lage.remaining)} von {barrels(lage.recoverable)} bbl förderbar
          </dd>
        </>
      )}
    </dl>
  );
}