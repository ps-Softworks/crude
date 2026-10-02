import { useState } from 'react';
import { endRound, formatDate, newGame, type GameState } from '../sim/game';
import { formatForecast, trueChance } from '../sim/forecast';
import type { Parcel } from '../sim/geology';
import {
  buyLease,
  buyOption,
  exerciseOption,
  leaseOf,
  leaseTerms,
  optionOf,
  roundsLeft,
  type LeaseResult,
} from '../sim/lease';
import { balance } from './balance';
import { Map } from './Map';

const GEOLOGY_LABEL = { dry: 'trocken', small: 'klein', gusher: 'Gusher' } as const;

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Förderzins als Prozent, z. B. 0.125 -> "12,5 %", 1/6 -> "16,7 %". */
function percent(value: number) {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

function rounds(n: number) {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

// Für Tests und Fehlersuche: ?seed=abc&debug=1 in der Adresse.
const params = new URLSearchParams(window.location.search);

export function App() {
  const [seedInput, setSeedInput] = useState(() => params.get('seed') ?? randomSeed());
  const [game, setGame] = useState(() => newGame(seedInput, balance));
  const [debug, setDebug] = useState(params.get('debug') === '1');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parcel = game.parcels.find((p) => p.id === selected);
  const leaseCount = game.leases.filter((l) => l.holder === 'jacob').length;
  const optionCount = game.options.filter((o) => o.holder === 'jacob').length;

  function select(id: string) {
    setSelected(id);
    setNotice(null);
  }

  function apply(result: LeaseResult) {
    if (result.ok) {
      setGame(result.state);
      setNotice(null);
    } else {
      setNotice(result.reason);
    }
  }

  function startNewWorld(seed: string) {
    setSeedInput(seed);
    setGame(newGame(seed, balance));
    setSelected(null);
    setNotice(null);
  }

  return (
    <div className="app">
      <header>
        <h1>
          CRUDE <span className="version">v{__APP_VERSION__}</span>
        </h1>
        <div className="status">
          <span>
            Runde {game.round}/{game.totalRounds}
          </span>
          <span>{formatDate(game)}</span>
          <span>Kasse: {money(game.cash)}</span>
          <span>
            Pachten: {leaseCount} · Optionen: {optionCount}
          </span>
        </div>
      </header>

      <main>
        <Map balance={balance} game={game} debug={debug} selected={selected} onSelect={select} />

        <aside>
          <section>
            <button
              className="primary"
              disabled={game.finished}
              onClick={() => {
                setGame(endRound(game, balance));
                setNotice(null);
              }}
            >
              {game.finished ? 'Kapitel beendet' : 'Runde beenden'}
            </button>
          </section>

          <section>
            <h2>Parzelle</h2>
            {parcel ? (
              <ParcelPanel game={game} parcel={parcel} debug={debug} notice={notice} onResult={apply} />
            ) : (
              <p className="muted">Klick auf ein Feld der Karte.</p>
            )}
          </section>

          <section>
            <h2>Protokoll</h2>
            <ul className="log">
              {[...game.log].reverse().map((line, i) => (
                <li key={game.log.length - i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="debug">
            <h2>Debug</h2>
            <label>
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Verdeckte
              Geologie zeigen
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startNewWorld(seedInput);
              }}
            >
              <label>
                Seed <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} />
              </label>
              <button type="submit">Welt laden</button>
              <button type="button" onClick={() => startNewWorld(randomSeed())}>
                Zufällige Welt
              </button>
            </form>
          </section>
        </aside>
      </main>
    </div>
  );
}

interface PanelProps {
  game: GameState;
  parcel: Parcel;
  debug: boolean;
  notice: string | null;
  onResult: (result: LeaseResult) => void;
}

/** Angaben und Knöpfe zur gewählten Parzelle. Alle Regeln kommen aus src/sim/lease. */
function ParcelPanel({ game, parcel, debug, notice, onResult }: PanelProps) {
  const id = parcel.id;
  const lease = leaseOf(game, id);
  const option = optionOf(game, id);
  const terms = parcel.discovery ? undefined : leaseTerms(game, balance, id);
  const forecast = parcel.discovery ? undefined : game.forecasts[id];

  // Probelauf: Die Simulation sagt, ob die Aktion gerade geht und warum nicht.
  const tryLease = !lease && !option && terms ? buyLease(game, balance, id) : undefined;
  const tryOption = !lease && !option && terms ? buyOption(game, balance, id) : undefined;
  const tryExercise = option ? exerciseOption(game, balance, id) : undefined;
  const firstReason = [tryLease, tryOption, tryExercise].find((r) => r && !r.ok);
  const hint = notice ?? (firstReason && !firstReason.ok ? firstReason.reason : null);

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
          {lease ? (
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

      <div className="actions">
        {tryLease && terms && (
          <button disabled={!tryLease.ok} onClick={() => onResult(buyLease(game, balance, id))}>
            Pachten ({money(terms.bonus)})
          </button>
        )}
        {tryOption && terms && (
          <button disabled={!tryOption.ok} onClick={() => onResult(buyOption(game, balance, id))}>
            Option kaufen ({money(terms.optionFee)})
          </button>
        )}
        {tryExercise && option && (
          <button disabled={!tryExercise.ok} onClick={() => onResult(exerciseOption(game, balance, id))}>
            Option einlösen ({money(option.bonus)})
          </button>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}

      {debug && (
        <p className="muted">
          Geologie: {GEOLOGY_LABEL[parcel.geology]}, {parcel.reserves.toLocaleString('de-DE')} Barrel
        </p>
      )}
    </div>
  );
}
