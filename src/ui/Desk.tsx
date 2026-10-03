// Der Schreibtisch (1.11): das ganze Spielbild auf einen Blick – Zahlenleiste,
// Hinweis auf den nächsten Schritt, Karte, Parzelle, Quellen, Tank & Verkauf,
// Bank und das Protokoll der laufenden Runde. Hier wird nichts gerechnet und
// nichts entschieden: Zahlen, Texte, Preise und Gründe kommen aus src/sim.

import { useState, type ReactNode } from 'react';
import { TRANSPORT_MODES } from '../sim/balance';
import { debt, headroom, creditLimit, type LoanResult } from '../sim/credit';
import type { NextStep } from '../sim/desk';
import { roundLog, sourceRows } from '../sim/desk';
import { formatDate, type GameState } from '../sim/game';
import { capacityLeft, netPrice, sellOil, tariff } from '../sim/transport';
import { balance } from './balance';
import { BankPanel } from './BankPanel';
import { FeedbackLink } from './FeedbackLink';
import { Map } from './Map';

function money(value: number): string {
  return `${value.toLocaleString('de-DE')} $`;
}

function barrels(value: number): string {
  return value.toLocaleString('de-DE');
}

/** Dollarbetrag mit Cent, z. B. für Tarife. */
function price(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

export interface DeskProps {
  game: GameState;
  /** Hinweis auf den nächsten Schritt; null, wenn das Kapitel vorbei ist. */
  step: NextStep | null;
  selected: string | null;
  debug: boolean;
  /** Debug-Bereich zeigen (beim Entwickeln oder mit ?debug=1). */
  debugTools: boolean;
  seed: string;
  /** Abschluss-Kasten nach der letzten Runde; null, solange das Kapitel läuft. */
  chapterEnd: ReactNode;
  /** Angaben und Knöpfe zur gewählten Parzelle. */
  parcelPanel: ReactNode;
  onSelect: (id: string) => void;
  onEndRound: () => void;
  onLoan: (result: LoanResult) => void;
  onSold: (state: GameState) => void;
  onDebug: (debug: boolean) => void;
  onSeed: (seed: string) => void;
  onNewWorld: () => void;
  onRandomWorld: () => void;
  onRestart: () => void;
  /** Spielstand löschen und ohne gespeichertes Spiel neu anfangen. */
  onForget: () => void;
}

export function Desk({
  game,
  step,
  selected,
  debug,
  debugTools,
  seed,
  chapterEnd,
  parcelPanel,
  onSelect,
  onEndRound,
  onLoan,
  onSold,
  onDebug,
  onSeed,
  onNewWorld,
  onRandomWorld,
  onRestart,
  onForget,
}: DeskProps) {
  const heroisch = step?.parcelIds ?? [];
  const leases = game.leases.filter((l) => l.holder === 'jacob').length;
  const options = game.options.filter((o) => o.holder === 'jacob').length;
  const rivalLeases = game.leases.filter((l) => l.holder === 'bullard').length;
  const rivalWells = game.rival.wells.filter((w) => w.status === 'found').length;

  return (
    <div className="desk">
      <header>
        <h1>
          CRUDE <span className="version">v{__APP_VERSION__}</span> <FeedbackLink className="feedback kopf" />
          <button
            type="button"
            className="neustart"
            onClick={() => {
              if (window.confirm('Neues Spiel beginnen? Der aktuelle Stand geht verloren.')) onRestart();
            }}
          >
            Neues Spiel
          </button>
        </h1>
        <div className="status">
          <span>
            Kasse <strong>{money(game.cash)}</strong>
          </span>
          <span>
            Schulden {money(debt(game))} · Rahmen frei {money(headroom(game, balance))} von{' '}
            {money(creditLimit(game, balance))}
          </span>
          <span>Rating {game.rating}</span>
          <span>
            Öl {barrels(game.oilStock)} bbl
          </span>
          <span>
            Pachten {leases} · Optionen {options}
          </span>
          <span>
            Bullard: {rivalLeases} {rivalLeases === 1 ? 'Pacht' : 'Pachten'}, {rivalWells}{' '}
            {rivalWells === 1 ? 'Quelle' : 'Quellen'}
            {debug && <> · Kasse {money(game.rival.cash)}</>}
          </span>
          <span>
            Runde {game.round}/{game.totalRounds} · {formatDate(game)}
          </span>
          {game.bankruptcyDeadline > 0 && (
            <span className="warn">Bankrott droht – Frist bis Runde {game.bankruptcyDeadline}</span>
          )}
        </div>
        <button className="primary runde" onClick={onEndRound} disabled={game.finished}>
          {game.finished ? 'Kapitel beendet' : 'Runde beenden'}
        </button>
      </header>

      {chapterEnd}

      <p className="nextstep">{step?.text ?? 'Das Kapitel ist zu Ende.'}</p>

      <div className="spalten">
        <section className="panel">
          <h2>Karte von Cordova</h2>
          <Map balance={balance} game={game} debug={debug} selected={selected} highlight={heroisch} onSelect={onSelect} />
        </section>

        <section className="panel">
          <h2>Parzelle</h2>
          {parcelPanel}
        </section>

        <section className="panel">
          <h2>Quellen</h2>
          <SourcesPanel game={game} onSelect={onSelect} />
        </section>
      </div>

      <div className="spalten">
        <section className="panel">
          <h2>Tank &amp; Verkauf</h2>
          <SalePanel game={game} onSold={onSold} />
        </section>

        <section className="panel">
          <h2>Bank</h2>
          <BankPanel game={game} onResult={onLoan} />
        </section>

        <section className="panel">
          <h2>Protokoll der Runde</h2>
          <RoundLog game={game} />
        </section>
      </div>

      {debugTools && (
        <section className="debug">
          <h2>Debug</h2>
          <label>
            <input type="checkbox" checked={debug} onChange={(e) => onDebug(e.target.checked)} /> Verdeckte Geologie
            zeigen
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onNewWorld();
            }}
          >
            <label>
              Seed <input value={seed} onChange={(e) => onSeed(e.target.value)} />
            </label>
            <button type="submit">Welt laden</button>
            <button type="button" onClick={onRandomWorld}>
              Zufällige Welt
            </button>
            <button type="button" onClick={onForget}>
              Spielstand löschen
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

/** Alle Bohrungen als Liste: fördernde Quellen zuerst, Text und Zahlen aus src/sim/desk. */
export function SourcesPanel({ game, onSelect }: { game: GameState; onSelect: (id: string) => void }) {
  const rows = sourceRows(game);
  if (rows.length === 0) {
    return <p className="muted">Noch keine Bohrung. Pachte eine Parzelle und leg den Bohrturm auf.</p>;
  }
  return (
    <ul className="sources">
      {rows.map((row) => (
        <li key={row.parcelId} className={row.status}>
          <button className="link" onClick={() => onSelect(row.parcelId)}>
            Parzelle {row.label}
          </button>
          <span className="lage">{row.text}</span>
          {row.status === 'found' && (
            <span className="zahlen">
              {barrels(row.lastRate)} bbl letzte Runde · {barrels(row.total)} bbl gesamt
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Das Protokoll der laufenden Runde; das ganze Protokoll steckt hinter dem Aufklappen. */
function RoundLog({ game }: { game: GameState }) {
  const zeilen = roundLog(game);
  return (
    <>
      {zeilen.length === 0 ? (
        <p className="muted">In dieser Runde ist noch nichts passiert.</p>
      ) : (
        <ul className="log">
          {[...zeilen].reverse().map((line, i) => (
            <li key={zeilen.length - i}>{line}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>Ganzes Protokoll ({game.log.length} Einträge)</summary>
        <ul className="log">
          {[...game.log].reverse().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
    </>
  );
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
  const priceChange =
    prevPrice !== undefined && prevPrice !== game.postedPrice ? (game.postedPrice > prevPrice ? ' ↑' : ' ↓') : '';

  return (
    <div className="sale-panel">
      <p>
        Im Tank: <strong>{barrels(tank)} bbl</strong> · Posted Price {price(game.postedPrice)}
        {priceChange} je Barrel
      </p>
      <dl className="terms">
        {TRANSPORT_MODES.map((mode) => (
          <div key={mode} style={{ display: 'contents' }}>
            <dt>{balance.transport[mode].label}</dt>
            <dd>
              Fracht {price(tariff(game, balance, mode))} · netto {price(netPrice(game, balance, mode))} je Barrel ·
              frei {barrels(capacityLeft(game, balance, mode))} bbl
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