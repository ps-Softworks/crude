import { useState } from 'react';
import { fieldLabel, fieldOf } from '../sim/field';
import { endRound, formatDate, newGame, type GameState } from '../sim/game';
import {
  abandonWell,
  accidentChance,
  deeperChance,
  drillDeeper,
  fishWell,
  stageCost,
  startDrilling,
  wellOf,
  type Well,
} from '../sim/drilling';
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
import { fieldStatus } from '../sim/production';
import { TRANSPORT_MODES } from '../sim/balance';
import { creditLimit, debt, headroom, type LoanResult } from '../sim/credit';
import { capacityLeft, netPrice, sellOil, tariff } from '../sim/transport';
import { balance } from './balance';
import { BankPanel } from './BankPanel';
import { GameOverScreen } from './GameOverScreen';
import { Map } from './Map';

const GEOLOGY_LABEL = { dry: 'trocken', small: 'klein', gusher: 'Gusher' } as const;

function money(value: number) {
  return `${value.toLocaleString('de-DE')} $`;
}

/** Barrel-Menge in lesbarer Form. */
function barrels(value: number) {
  return value.toLocaleString('de-DE');
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

  function apply(result: LeaseResult | LoanResult) {
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
          <span>Öl im Tank: {barrels(game.oilStock)} bbl</span>
          <span>
            Pachten: {leaseCount} · Optionen: {optionCount}
          </span>
          <span>
            Rating {game.rating} · Schulden {money(debt(game))} · Rahmen frei {money(headroom(game, balance))} von{' '}
            {money(creditLimit(game, balance))}
          </span>
          {game.bankruptcyDeadline > 0 && (
            <span className="warn">Bankrott droht – Frist bis Runde {game.bankruptcyDeadline}</span>
          )}
        </div>
      </header>

      {game.ending === 'pleite' ? (
        <GameOverScreen game={game} onRestart={() => startNewWorld(randomSeed())} />
      ) : (
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
              <h2>Tank &amp; Verkauf</h2>
              <SalePanel game={game} onSold={(state) => setGame(state)} />
            </section>

            <section>
              <h2>Bank</h2>
              <BankPanel game={game} onResult={apply} />
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
      )}
    </div>
  );
}

/** Dollarbetrag mit Cent, z. B. für Tarife. */
function price(value: number) {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/**
 * Öl aus dem Tank verkaufen: per Fuhrwerk oder Bahn. Tarife, Kapazität und ob ein
 * Verkauf geht, kommen alle aus src/sim/transport.
 */
function SalePanel({ game, onSold }: { game: GameState; onSold: (state: GameState) => void }) {
  const [amount, setAmount] = useState<string>('');
  const tank = Math.floor(game.oilStock);
  const vorschlag = Math.max(...TRANSPORT_MODES.map((m) => Math.min(tank, capacityLeft(game, balance, m))));
  const menge = amount === '' ? vorschlag : Number(amount);

  const prevPrice = game.priceHistory[game.priceHistory.length - 2];
  const priceChange = prevPrice !== undefined && prevPrice !== game.postedPrice
    ? game.postedPrice > prevPrice
      ? ' ↑'
      : ' ↓'
    : '';

  return (
    <div className="sale-panel">
      <p>
        Im Tank: <strong>{barrels(tank)} bbl</strong> · Posted Price {price(game.postedPrice)}{priceChange} je Barrel
      </p>
      <dl className="terms">
        {TRANSPORT_MODES.map((mode) => (
          <div key={mode} style={{ display: 'contents' }}>
            <dt>{balance.transport[mode].label}</dt>
            <dd>
              Fracht {price(tariff(game, balance, mode))} · netto {price(netPrice(game, balance, mode))} je Barrel · frei{' '}
              {barrels(capacityLeft(game, balance, mode))} bbl
            </dd>
          </div>
        ))}
      </dl>
      <label>
        Menge (bbl){' '}
        <input
          type="number"
          min={1}
          step={1}
          value={amount === '' ? vorschlag : amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <div className="actions">
        {TRANSPORT_MODES.map((mode) => {
          const probe = sellOil(game, balance, mode, menge);
          return (
            <button
              key={mode}
              disabled={!probe.ok}
              title={probe.ok ? `Netto ${price(probe.quote.net)}` : probe.reason}
              onClick={() => {
                if (probe.ok) {
                  onSold(probe.state);
                  setAmount('');
                }
              }}
            >
              Per {balance.transport[mode].label} verkaufen
            </button>
          );
        })}
      </div>
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
  const well = wellOf(game, id);
  const tryDrill = lease && lease.holder === 'jacob' && !well ? startDrilling(game, balance, id) : undefined;
  const tryDeeper = well?.status === 'decision' ? drillDeeper(game, balance, id) : undefined;
  const tryFish = well?.status === 'stuck' ? fishWell(game, balance, id) : undefined;
  const firstReason = [tryLease, tryOption, tryExercise, tryDrill, tryDeeper, tryFish].find((r) => r && !r.ok);
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

      <div className="actions">
        {tryDrill && (
          <button disabled={!tryDrill.ok} onClick={() => onResult(startDrilling(game, balance, id))}>
            Bohren ({money(stageCost(balance, 1))})
          </button>
        )}
        {tryDeeper && well && (
          <button disabled={!tryDeeper.ok} onClick={() => onResult(drillDeeper(game, balance, id))}>
            Tiefer bohren auf {balance.drilling.stages[well.stage].depth} m ({money(stageCost(balance, well.stage + 1))},
            Unfallrisiko {percent(accidentChance(balance, well.stage + 1))})
          </button>
        )}
        {tryFish && (
          <button disabled={!tryFish.ok} onClick={() => onResult(fishWell(game, balance, id))}>
            Werkzeug bergen ({money(balance.drilling.fishingCost)})
          </button>
        )}
        {(tryDeeper || tryFish) && (
          <button onClick={() => onResult(abandonWell(game, balance, id))}>Aufgeben</button>
        )}
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

/** Bohrstatus in Worten. */
function WellInfo({ well }: { well: Well }) {
  const depth = balance.drilling.stages[well.stage - 1].depth;
  const head = `Bohrung · Stufe ${well.stage}/${balance.drilling.stages.length} (${depth} m) · bisher ${money(well.spent)}`;
  switch (well.status) {
    case 'drilling':
      return <>{head}<br />Der Turm bohrt – fertig in {rounds(well.roundsLeft)}.</>;
    case 'decision':
      return <>{head}<br />In {depth} m trocken. Tiefer bohren oder aufgeben?</>;
    case 'stuck':
      return <>{head}<br />Das Werkzeug klemmt in {depth} m.</>;
    case 'found':
      return <>{head}<br />{well.result === 'gusher' ? 'GUSHER! Ein gewaltiger Fund.' : 'Öl gefunden – eine kleine Quelle.'}</>;
    case 'dry':
      return <>{head}<br />Trocken – kein Öl.</>;
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
        {fieldLabel(field)}: {lage.wells} {lage.wells === 1 ? 'Quelle' : 'Quellen'} · Druck {percent(lage.pressure)}
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
