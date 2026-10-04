// Transport am Schreibtisch (0.2.15+2): Verkauf mit Wegevergleich, Lager,
// eigene Fuhrwerke, Pipeline und Thorne. Hier wird nichts gerechnet und nichts
// entschieden – Preise, Kosten, Kapazitäten und Gründe kommen aus src/sim.

import { useState } from 'react';
import { BUYERS, TRANSPORT_MODES, type Buyer, type TransportMode } from '../sim/balance';
import type { GameState } from '../sim/game';
import {
  buildPipeline,
  buildTank,
  dismissTeam,
  fixedCosts,
  hireTeam,
  pipelineCredible,
  rightsStatus,
  routePlan,
  sabotageChance,
  setGuards,
  storageCapacity,
  storageOutlook,
  surveyPipeline,
  teamsIdle,
  threatenThorne,
  threatWait,
  type LogisticsResult,
} from '../sim/logistics';
import { jacobSupply } from '../sim/market';
import { buyerCapacityLeft, buyerPrice, capacityLeft, exclusiveSurcharge, modeUnavailable, netPrice, sellOil, tariff } from '../sim/transport';
import { timedEffect, timedRoundsLeft } from '../sim/events';
import { cartelCut, craneCutRoundsLeft, exclusiveActive, grudgeCut, railFrozen, volumeDealActive, volumeObligation } from '../sim/trust';
import { balance } from './balance';
import { barrels, money, NBSP } from './format';

const T = balance.transport;

/** Preis je Barrel mit Cent, z. B. „0,76 $“. */
function price(value: number): string {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

const BUYER_LABEL: Record<Buyer, string> = { crane: 'Crane Trust', trader: T.trader.label };

/** Knopf für eine Aktion aus src/sim/logistics: gesperrt mit Grund, wenn sie nicht geht. */
function Aktion({ result, onDone, children }: { result: LogisticsResult; onDone: (s: GameState) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

/** Öl verkaufen: Käufer wählen, Menge eingeben, alle Wege nebeneinander mit Kosten und Erlös. */
export function SalePanel({ game, onSold }: { game: GameState; onSold: (state: GameState) => void }) {
  const [amount, setAmount] = useState<string>('');
  const [buyer, setBuyer] = useState<Buyer>('crane');
  // Quittung des letzten Verkaufs (0.2.15+11): steht im Fenster, nicht nur auf Ruths Zettel.
  const [quittung, setQuittung] = useState<string | null>(null);
  const tank = Math.floor(game.oilStock);
  const nimmt = buyerCapacityLeft(game, balance, buyer);
  const vorschlag = Math.min(nimmt, Math.max(0, ...TRANSPORT_MODES.map((m) => Math.min(tank, capacityLeft(game, balance, m)))));
  const menge = amount === '' ? vorschlag : Number(amount);

  const prevPrice = game.priceHistory[game.priceHistory.length - 2];
  const priceChange =
    prevPrice !== undefined && prevPrice !== game.postedPrice ? (game.postedPrice > prevPrice ? ' ↑' : ' ↓') : '';
  const abschlag = cartelCut(game, balance);
  const groll = grudgeCut(game, balance);
  const nachwirkung = timedEffect(game, 'price');
  const nachwirkungRunden = timedRoundsLeft(game, 'price');

  return (
    <div className="sale-panel">
      <p>
        Im Tank: <strong>{barrels(tank)}</strong> von {barrels(storageCapacity(game, balance))} bbl · Posted Price{' '}
        {price(game.postedPrice)}
        {priceChange} je Barrel
      </p>
      {abschlag > 0 && (
        <p className="hint">
          Crane-Abschlag: {price(abschlag)} je Barrel weniger (noch {craneCutRoundsLeft(game, balance)}{' '}
          {craneCutRoundsLeft(game, balance) === 1 ? 'Runde' : 'Runden'}).
        </p>
      )}
      {nachwirkung !== 0 && (
        <p className="hint">
          Folge einer Entscheidung: Der Trust zahlt dir {price(Math.abs(nachwirkung))} je Barrel {nachwirkung > 0 ? 'mehr' : 'weniger'} (noch{' '}
          {nachwirkungRunden} {nachwirkungRunden === 1 ? 'Runde' : 'Runden'}).
        </p>
      )}
      {groll > 0 && <p className="hint">Crane ist verärgert, weil du an den Händler verkauft hast: {price(groll)} je Barrel weniger.</p>}
      <fieldset className="kaeufer">
        <legend>Käufer</legend>
        {BUYERS.map((b) => (
          <label key={b}>
            <input type="radio" name="kaeufer" checked={buyer === b} onChange={() => setBuyer(b)} /> {BUYER_LABEL[b]} –{' '}
            {price(buyerPrice(game, balance, b))} je Barrel
            {b === 'trader' && <> (nimmt noch {barrels(buyerCapacityLeft(game, balance, b))} bbl; Crane merkt es sich)</>}
          </label>
        ))}
      </fieldset>
      <label>
        Menge (bbl){' '}
        <input type="number" min={1} step={1} value={amount === '' ? vorschlag : amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {!(menge >= 1) && (
        <p className="weg-grund">{tank < 1 ? 'Der Tank ist leer – nach der nächsten Förderung gibt es wieder etwas zu verkaufen.' : 'Gib eine Menge ein.'}</p>
      )}
      <table className="wege verkauf">
        <thead>
          <tr>
            <th>Weg</th>
            <th>Fracht je bbl</th>
            <th>netto je bbl</th>
            <th>frei</th>
            <th>Verkaufen ({barrels(menge || 0)} bbl)</th>
          </tr>
        </thead>
        <tbody>
          {TRANSPORT_MODES.map((mode) => (
            <WegZeile
              key={mode}
              game={game}
              mode={mode}
              buyer={buyer}
              menge={menge}
              onSold={(s, text) => {
                onSold(s);
                setAmount('');
                setQuittung(text);
              }}
            />
          ))}
        </tbody>
      </table>
      {quittung && (
        <p className="quittung" role="status">
          {quittung}
        </p>
      )}
    </div>
  );
}

function WegZeile({
  game,
  mode,
  buyer,
  menge,
  onSold,
}: {
  game: GameState;
  mode: TransportMode;
  buyer: Buyer;
  menge: number;
  /** Neuer Stand und die Quittung in Worten. */
  onSold: (s: GameState, text: string) => void;
}) {
  const fehlt = modeUnavailable(game, mode);
  const probe = sellOil(game, balance, mode, menge, buyer);
  const strafe = exclusiveSurcharge(game, balance, mode);
  const fracht = tariff(game, balance, mode);
  const name = T[mode].label;
  return (
    <tr className={probe.ok ? undefined : 'gesperrt'}>
      <th scope="row">{name}</th>
      <td>
        {price(fracht)}
        {strafe > 0 && <span className="klein"> (inkl. {price(strafe)} Strafe)</span>}
      </td>
      <td>{fehlt ? '–' : price(netPrice(game, balance, mode, buyer))}</td>
      <td>{fehlt ? '–' : barrels(capacityLeft(game, balance, mode))}</td>
      <td>
        {probe.ok ? (
          <button
            type="button"
            className="verkaufen"
            onClick={() => onSold(probe.state, `${barrels(menge)} bbl per ${name} verkauft für ${money(probe.quote.net)} (nach Fracht und Förderzins).`)}
          >
            Per {name} verkaufen ({money(probe.quote.net)})
          </button>
        ) : (
          <>
            <button type="button" className="verkaufen" disabled aria-describedby={menge >= 1 ? `grund-${mode}` : undefined}>
              Per {name} verkaufen
            </button>
            {menge >= 1 && (
              <span className="weg-grund" id={`grund-${mode}`}>
                {probe.reason}
              </span>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

/** Lager und eigene Fuhrwerke. */
export function StoragePanel({ game, onChange }: { game: GameState; onChange: (s: GameState) => void }) {
  const lg = game.logistics;
  const aussicht = storageOutlook(game, balance);
  const fix = fixedCosts(game, balance);
  return (
    <div className="lager">
      <h3>Lager</h3>
      <p>
        {barrels(game.oilStock)} von {barrels(storageCapacity(game, balance))} bbl belegt · {lg.tanks} Zusatztank{lg.tanks === 1 ? '' : 's'}
        {lg.tanksBuilding > 0 && <> (+{lg.tanksBuilding} im Bau)</>}
      </p>
      <p className="klein">
        Bis zum Rundenende: {money(aussicht.cost)} Lagerkosten, rund {barrels(aussicht.shrink)} bbl Schwund, Brandrisiko ≈{' '}
        {barrels(aussicht.fireRisk)} bbl – zusammen etwa {price(aussicht.perBarrel)} je gelagertem Barrel. Was über die Tanks
        hinaus gefördert wird, läuft aus.
      </p>
      <Aktion result={buildTank(game, balance)} onDone={onChange}>
        {`Tank bauen (${money(T.storage.tankCost)}, +${barrels(T.storage.tankCapacity)} bbl, fertig zum Rundenende)`}
      </Aktion>

      <h3>Eigene Fuhrwerke</h3>
      <p>
        {lg.teams} Gespann{lg.teams === 1 ? '' : 'e'} · schaffen {barrels(lg.teams * T.teams.capacity)} bbl je Runde zu{' '}
        {price(T.teams.costPerBarrel)} je bbl · Lohn {money(fix.wages)} je Runde
        {teamsIdle(game) && <strong> · stehen still bis Runde {lg.teamsIdleUntil}</strong>}
      </p>
      <p className="klein">
        Lohnt erst ab Menge: Ein Gespann kostet {money(T.teams.wagePerRound)} Lohn je Runde, auch wenn es steht.
      </p>
      <div className="actions zeile">
        <Aktion result={hireTeam(game, balance)} onDone={onChange}>
          {`Gespann kaufen (${money(T.teams.hireCost)})`}
        </Aktion>
        <Aktion result={dismissTeam(game, balance)} onDone={onChange}>
          {`Gespann abgeben (+${money(T.teams.hireCost * T.teams.resale)})`}
        </Aktion>
      </div>
    </div>
  );
}

const PIPELINE_TEXT: Record<GameState['logistics']['pipeline'], string> = {
  none: 'Noch keine Route.',
  surveyed: 'Route vermessen – es fehlen die Wegerechte.',
  building: 'Im Bau.',
  ready: 'Läuft.',
  damaged: 'Sabotiert – wird repariert.',
};

/** Pipeline und Thorne: Bau, Wegerechte, Wachleute, Verträge, Drohung. */
export function PipelinePanel({ game, onChange }: { game: GameState; onChange: (s: GameState) => void }) {
  const lg = game.logistics;
  const P = T.pipeline;
  const rechte = rightsStatus(game, balance);
  const laeuft = lg.pipeline === 'ready' || lg.pipeline === 'damaged';
  const warten = threatWait(game, balance);
  const glaubwuerdig = pipelineCredible(game, balance);
  const pflicht = volumeObligation(game, balance);
  return (
    <div className="pipeline">
      <h3>Pipeline zum Bahnhof</h3>
      <p>
        {PIPELINE_TEXT[lg.pipeline]}
        {lg.pipeline === 'building' && <> Noch {lg.pipelineRounds} {lg.pipelineRounds === 1 ? 'Runde' : 'Runden'}.</>}
        {lg.pipeline === 'damaged' && <> Noch {lg.pipelineRounds} {lg.pipelineRounds === 1 ? 'Runde' : 'Runden'}.</>}
      </p>
      <p className="klein">
        {price(P.costPerBarrel)} je bbl, bis {barrels(P.capacity)} bbl je Runde · Bau {money(P.buildCost)}, {P.buildRounds} Runden ·
        Unterhalt {money(P.upkeepPerRound)} je Runde
      </p>
      {lg.pipeline !== 'none' && (
        <ul className="rechte">
          {rechte.map((r) => (
            <li key={r.mark}>
              {r.held ? '☑' : '☐'} Wegerecht {r.label}
            </li>
          ))}
        </ul>
      )}
      <div className="actions zeile">
        {lg.pipeline === 'none' && (
          <Aktion result={surveyPipeline(game, balance)} onDone={onChange}>
            {`Route vermessen (${money(P.surveyCost)})`}
          </Aktion>
        )}
        {lg.pipeline === 'surveyed' && (
          <Aktion result={buildPipeline(game, balance)} onDone={onChange}>
            {`Pipeline bauen (${money(P.buildCost)})`}
          </Aktion>
        )}
        {laeuft && (
          <Aktion result={setGuards(game, !lg.guards)} onDone={onChange}>
            {lg.guards ? 'Wachleute entlassen' : `Wachleute anstellen (${money(P.guardsPerRound)} je Runde)`}
          </Aktion>
        )}
      </div>
      {laeuft && <p className="klein">Sabotage-Risiko je Runde: {Math.round(sabotageChance(game, balance) * 100)}{NBSP}%.</p>}

      <h3>Thorne Rail</h3>
      <p>Bahntarif {price(game.railTariff)} je bbl.</p>
      {railFrozen(game, balance) && exclusiveActive(game, balance) && (
        <p className="hint">Exklusivvertrag: Tarif fest – jedes Barrel über einen anderen Weg kostet {price(T.thorne.exclusivePenalty)} Strafe.</p>
      )}
      {railFrozen(game, balance) && !exclusiveActive(game, balance) && <p className="hint">Frachtvertrag: Der Bahntarif bleibt fest.</p>}
      {volumeDealActive(game, balance) && (
        <p className="hint">
          Mengenrabatt: {price(T.thorne.volumeDiscount)} je bbl weniger.
          {pflicht > 0 && (
            <>
              {' '}
              Mindestens {barrels(pflicht)} bbl per Bahn in dieser Runde (bisher {barrels(game.shipped.rail)}), sonst{' '}
              {price(T.thorne.shortfallPenalty)} Strafe je fehlendem Barrel.
            </>
          )}
        </p>
      )}
      <Aktion result={threatenThorne(game, balance)} onDone={onChange}>
        {warten > 0 ? `Mit Pipeline drohen (in ${warten} ${warten === 1 ? 'Runde' : 'Runden'})` : 'Thorne mit der Pipeline drohen'}
      </Aktion>
      <p className="klein">
        {glaubwuerdig
          ? `Thorne nimmt die Drohung ernst – er senkt den Tarif um ${price(T.thorne.threatCut)}.`
          : 'Ohne Wegerechte oder das Geld für den Bau wäre es ein Bluff: Thorne lacht und erhöht danach öfter.'}
      </p>
    </div>
  );
}

/** Wege im Vergleich: Kosten je Barrel bei der aktuellen Förderung über die restlichen Runden. */
export function RoutePlanPanel({ game }: { game: GameState }) {
  const foerderung = jacobSupply(game);
  const [eigen, setEigen] = useState<string>('');
  const volume = eigen === '' ? foerderung : Math.max(0, Number(eigen) || 0);
  const { scenario, routes } = routePlan(game, balance, volume);
  return (
    <div className="plan">
      <p className="klein">
        Was kostet ein Barrel auf jedem Weg – mit Lohn, Unterhalt und Anschaffung, verteilt auf die restlichen{' '}
        {scenario.rounds} Runden? Bei viel Öl lohnen eigene Anlagen, bei wenig nicht.
      </p>
      <label>
        Barrel je Runde{' '}
        <input type="number" min={0} step={500} value={eigen === '' ? foerderung : eigen} onChange={(e) => setEigen(e.target.value)} />
      </label>
      {volume <= 0 ? (
        <p className="muted">Noch keine Förderung – gib eine Menge ein.</p>
      ) : (
        <table className="wege">
          <thead>
            <tr>
              <th>Weg</th>
              <th>je bbl</th>
              <th>schafft je Runde</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r, i) => (
              <tr key={r.mode} className={i === 0 ? 'bester' : undefined}>
                <td>
                  {T[r.mode].label}
                  {r.teams !== undefined && <span className="klein"> ({r.teams} Gespanne)</span>}
                </td>
                <td>{Number.isFinite(r.perBarrel) ? price(r.perBarrel) : 'zu spät'}</td>
                <td className={r.capacity < volume ? 'warn' : undefined}>{barrels(r.capacity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
