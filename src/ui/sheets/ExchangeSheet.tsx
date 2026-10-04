// Fenster „Börsenticker“ (4.15, ab Kapitel 3): Kurse mit Kauf auf Kredit und das
// Depot mit Nachschuss und Verkauf. Oben liegen die Telegramme des Maklers.
// Alle Regeln stehen in src/sim/exchange.ts – hier wird nur angezeigt und geklickt.

import { useState } from 'react';
import {
  buyStock,
  marginDebt,
  marginRate,
  maxStake,
  positionEquity,
  positionLeverage,
  positionValue,
  priceChange,
  readClimate,
  sellPosition,
  topUpPosition,
  type ExchangeResult,
  type ExchangeState,
} from '../../sim/exchange';
import { exchangeLetters, stockName, topUpNeeded } from '../../sim/exchangeContent';
import type { GameState } from '../../sim/game';
import { balance } from '../balance';
import { exchangeContent } from '../exchange';
import { money, NBSP } from '../format';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './exchange.css';

export const EXCHANGE_TABS = [
  { id: 'kurse', label: 'Kurse' },
  { id: 'depot', label: 'Depot' },
];

const EB = balance.exchange;

function prozent(value: number): string {
  return `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}${NBSP}%`;
}

function kurs(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

/** Kleine Kurskurve aus den letzten Kursen. */
function Kurve({ values }: { values: readonly number[] }) {
  if (values.length < 2) return <svg className="boerse-kurve" viewBox="0 0 60 18" aria-hidden="true" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 58 + 1).toFixed(1)},${(17 - ((v - lo) / span) * 16).toFixed(1)}`).join(' ');
  const fallend = values[values.length - 1] < values[0];
  return (
    <svg className={`boerse-kurve${fallend ? ' fallend' : ''}`} viewBox="0 0 60 18" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

function Aenderung({ value }: { value: number }) {
  if (Math.abs(value) < 0.0005) return <span className="boerse-aenderung">±0</span>;
  return <span className={`boerse-aenderung ${value < 0 ? 'ab' : 'auf'}`}>{`${value < 0 ? '▼' : '▲'}${NBSP}${prozent(Math.abs(value))}`}</span>;
}

function Kurse({ game, ex, onResult }: { game: GameState; ex: ExchangeState; onResult: (r: ExchangeResult) => void }) {
  const [aktie, setAktie] = useState(EB.stocks[0].id);
  const [einsatz, setEinsatz] = useState(EB.margin.minBuy);
  const [hebel, setHebel] = useState(EB.margin.leverages[0]);
  const hoechstens = maxStake(game);
  const volumen = einsatz * hebel;
  const kredit = volumen - einsatz;
  const zins = (kredit * marginRate(EB, readClimate(game))) / 4;
  const probe = buyStock(game, balance, aktie, einsatz, hebel);
  return (
    <>
      <table className="boerse-tafel">
        <thead>
          <tr>
            <th scope="col">Aktie</th>
            <th scope="col">Kurs</th>
            <th scope="col">Runde</th>
            <th scope="col">
              <span className="boerse-sr">Verlauf</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {EB.stocks.map((s) => (
            <tr key={s.id} className={s.id === aktie ? 'gewaehlt' : undefined} onClick={() => setAktie(s.id)}>
              <th scope="row">
                <label title={exchangeContent.stocks[s.id]?.note.de}>
                  <input type="radio" name="boerse-aktie" checked={s.id === aktie} onChange={() => setAktie(s.id)} /> {stockName(exchangeContent, s.id)}
                </label>
              </th>
              <td>{kurs(ex.prices[s.id])}</td>
              <td>
                <Aenderung value={priceChange(ex, s.id)} />
              </td>
              <td>
                <Kurve values={ex.history[s.id] ?? []} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted klein">{exchangeContent.stocks[aktie]?.note.de}</p>

      <form
        className="boerse-auftrag"
        onSubmit={(e) => {
          e.preventDefault();
          onResult(buyStock(game, balance, aktie, einsatz, hebel));
        }}
      >
        <label>
          Einsatz{' '}
          <input
            type="number"
            min={EB.margin.minBuy}
            max={Math.max(EB.margin.minBuy, hoechstens)}
            step={100}
            value={einsatz}
            onChange={(e) => setEinsatz(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />{' '}
          $
        </label>
        <fieldset className="boerse-hebel">
          <legend>Hebel</legend>
          {EB.margin.leverages.map((l) => (
            <label key={l} className={l === hebel ? 'gewaehlt' : undefined}>
              <input type="radio" name="boerse-hebel" checked={l === hebel} onChange={() => setHebel(l)} />
              {l === 1 ? 'ohne Kredit' : `${l}×`}
            </label>
          ))}
        </fieldset>
        <p className="klein">
          Aktien für <strong>{money(volumen)}</strong>
          {kredit > 0 ? (
            <>
              {' '}
              – der Makler leiht {money(kredit)}, Zins etwa {money(zins)} je Runde. Fällt der Kurs um {prozent(((1 - EB.margin.liquidate) * einsatz) / Math.max(1, volumen))}, verkauft
              er zwangsweise.
            </>
          ) : (
            ' – ganz aus eigenem Geld.'
          )}
        </p>
        <button type="submit" className="primary" disabled={!probe.ok}>
          Kaufen
        </button>
        {!probe.ok && <span className="muted klein"> {probe.reason}</span>}
      </form>
    </>
  );
}

function Depot({ game, ex, onResult }: { game: GameState; ex: ExchangeState; onResult: (r: ExchangeResult) => void }) {
  if (ex.positions.length === 0) return <p className="muted">Noch keine Aktien im Depot.</p>;
  const schuld = marginDebt(game);
  return (
    <>
      <p className="klein">
        Maklerkredit {money(schuld)} · Zins {prozent(marginRate(EB, readClimate(game)))} im Jahr
      </p>
      <ul className="boerse-depot">
        {ex.positions.map((p) => {
          const wert = positionValue(ex, p);
          const eigen = positionEquity(ex, p);
          const hebelJetzt = positionLeverage(ex, p);
          const nach = topUpNeeded(ex, EB, p);
          return (
            <li key={p.id} className={p.called ? 'gerufen' : undefined}>
              <strong>{stockName(exchangeContent, p.stock)}</strong>
              <dl className="terms">
                <dt>Wert</dt>
                <dd>
                  {money(wert)} ({p.shares.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Stück zu {kurs(ex.prices[p.stock])})
                </dd>
                <dt>Eingesetzt</dt>
                <dd>{money(p.stake)}</dd>
                {p.loan > 0 && (
                  <>
                    <dt>Maklerkredit</dt>
                    <dd>{money(p.loan)}</dd>
                  </>
                )}
                <dt>Eigenkapital</dt>
                <dd>
                  {money(eigen)}
                  {p.loan > 0 && Number.isFinite(hebelJetzt) && ` · Hebel jetzt ${hebelJetzt.toLocaleString('de-DE', { maximumFractionDigits: 1 })}×`}
                </dd>
              </dl>
              <div className="boerse-knoepfe">
                <button type="button" onClick={() => onResult(sellPosition(game, balance, p.id))}>
                  Verkaufen ({money(wert * (1 - EB.margin.fee) - p.loan)})
                </button>
                {p.called && nach > 0 && (
                  <button type="button" disabled={nach > game.cash} onClick={() => onResult(topUpPosition(game, balance, p.id, nach))}>
                    {money(nach)} nachschießen
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ExchangeSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const ex = game.exchange;
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ex) return <p className="muted">Jacob hat noch kein Konto an der Börse.</p>;
  const tab = activeTab('boerse', EXCHANGE_TABS, ctx.tab);
  const briefe = exchangeLetters(ex, EB, exchangeContent, money);
  const onResult = (r: ExchangeResult) => {
    if (r.ok) {
      setFehler(null);
      ctx.onGame(r.state);
    } else setFehler(r.reason);
  };
  const gerufen = ex.positions.filter((p) => p.called).length;
  const tabs = EXCHANGE_TABS.map((t) => (t.id === 'depot' && ex.positions.length > 0 ? { ...t, badge: gerufen > 0 ? `${gerufen}!` : String(ex.positions.length) } : t));
  return (
    <>
      {briefe.map((b, i) => (
        <div key={`${b.id}-${i}`} className="boerse-telegramm" role="note">
          <strong>{b.title}:</strong> {b.text}
        </div>
      ))}
      <p className="kassenbuch-kopf">
        Kasse <strong>{money(game.cash)}</strong>
        {ctx.debug && (
          <span className="muted">
            {' '}
            · Fieber {ex.fever.toFixed(0)} · Warnungen {ex.warned} · Crashs {ex.crashes}
          </span>
        )}
      </p>
      <Tabs sheet="boerse" tabs={tabs} active={tab} onChange={ctx.onTab}>
        {tab === 'kurse' && <Kurse game={game} ex={ex} onResult={onResult} />}
        {tab === 'depot' && <Depot game={game} ex={ex} onResult={onResult} />}
      </Tabs>
      {fehler && <p className="state pleite">{fehler}</p>}
    </>
  );
}
