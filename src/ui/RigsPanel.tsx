// Bohrtürme am Schreibtisch (0.2.15+7): welche Türme Jacob hat, was sie gerade
// tun, nachrüsten, kaufen, mieten, zurückgeben. Kosten, Ersparnis und Gründe
// kommen aus src/sim/rigs – hier wird nichts gerechnet und nichts entschieden.

import type { GameState } from '../sim/game';
import { parcelLabel } from '../sim/lease';
import {
  buyRig,
  buyVsRentRounds,
  equipmentCosts,
  rentRig,
  returnRig,
  rigLabel,
  rigReady,
  rigWell,
  rodsPayback,
  steamPayback,
  upgradeRig,
  type Rig,
  type RigResult,
} from '../sim/rigs';
import { balance } from './balance';
import { money, NBSP } from './format';

const R = balance.drilling.rigs;
const ERSTE = `${balance.drilling.stages[0].depth} m`;


function runden(n: number): string {
  return n === 1 ? '1 Runde' : `${n} Runden`;
}

function Aktion({ result, onDone, children }: { result: RigResult; onDone: (s: GameState) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

/** Was ein Turm gerade tut, in wenigen Worten. */
function lage(game: GameState, rig: Rig): string {
  if (!rigReady(game, rig)) return `Lieferung in ${runden(rig.readyRound - game.round)}`;
  const well = rigWell(game, rig.id);
  if (!well) return 'frei';
  const parcel = game.parcels.find((p) => p.id === well.parcelId);
  const ort = parcel ? parcelLabel(parcel) : well.parcelId;
  if (well.status === 'decision') return `wartet auf ${ort}: trocken – tiefer bohren oder aufgeben?`;
  if (well.status === 'stuck') return `wartet auf ${ort}: Werkzeug klemmt`;
  return `bohrt auf ${ort}`;
}

export function RigsPanel({ game, onChange }: { game: GameState; onChange: (s: GameState) => void }) {
  const dampf = steamPayback(balance);
  const gestaenge = rodsPayback(balance);
  const kaufAb = buyVsRentRounds(balance);
  const kosten = equipmentCosts(game, balance);

  return (
    <div className="rigs-panel">
      <ul className="rigs">
        {game.rigs.map((rig) => (
          <li key={rig.id}>
            <strong>{rigLabel(rig)}</strong> · {lage(game, rig)}
            {(rig.steam || rig.rods) && (
              <span className="muted">
                {' '}
                · {[rig.steam && 'Dampfmaschine', rig.rods && 'Stahlgestänge'].filter(Boolean).join(', ')}
              </span>
            )}
            <div className="actions">
              {rig.kind !== 'rented' && !rig.steam && (
                <Aktion result={upgradeRig(game, balance, rig.id, 'steam')} onDone={onChange}>
                  {`Dampfmaschine (${money(R.steam.cost)})`}
                </Aktion>
              )}
              {rig.kind !== 'rented' && !rig.rods && (
                <Aktion result={upgradeRig(game, balance, rig.id, 'rods')} onDone={onChange}>
                  {`Stahlgestänge (${money(R.rods.cost)})`}
                </Aktion>
              )}
              {rig.kind === 'rented' && (
                <Aktion result={returnRig(game, balance, rig.id)} onDone={onChange}>
                  Zurückgeben
                </Aktion>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="erklaerung">
        Dampfmaschine: jede Bohrstufe {Math.round((1 - R.steam.costFactor) * 100)}{NBSP}% billiger
        {R.steam.roundsLess > 0 && ' und eine Runde schneller (mindestens eine)'} – spart {money(dampf.savingPerStage)} auf {ERSTE},
        {dampf.stages !== null ? ` bezahlt nach etwa ${dampf.stages} Bohrstufen.` : ' spart nichts.'}
        <br />
        Stahlgestänge: {Math.round((1 - R.rods.riskFactor) * 100)}{NBSP}% weniger Unfälle und klemmendes Werkzeug – spart im Schnitt{' '}
        {money(gestaenge.savingPerStage)} je Stufe auf {ERSTE}, in der Tiefe mehr
        {gestaenge.stages !== null ? ` (bezahlt nach etwa ${gestaenge.stages} Stufen auf ${ERSTE}).` : '.'}
      </p>
      <div className="actions">
        <Aktion result={buyRig(game, balance)} onDone={onChange}>
          {`Turm kaufen (${money(R.buy.cost)}, ${R.buy.deliveryRounds === 0 ? 'sofort' : `Lieferung ${runden(R.buy.deliveryRounds)}`})`}
        </Aktion>
        <Aktion result={rentRig(game, balance)} onDone={onChange}>
          {`Turm mieten (${money(R.rent.costPerRound)} je Runde)`}
        </Aktion>
      </div>
      <p className="muted">
        Je Turm läuft eine Bohrung zugleich. Ein gekaufter Turm zählt mit {Math.round(R.assetShare * 100)}{NBSP}% des Preises zum Firmenwert
        {kaufAb !== null && ` und ist ab ${runden(kaufAb)} Nutzung billiger als die Miete`}.
        {(kosten.rent > 0 || kosten.pumps > 0) && (
          <>
            {' '}
            Laufende Kosten je Runde: {kosten.rent > 0 && `Miete ${money(kosten.rent)}`}
            {kosten.rent > 0 && kosten.pumps > 0 && ', '}
            {kosten.pumps > 0 && `Pumpen ${money(kosten.pumps)}`}.
          </>
        )}
      </p>
    </div>
  );
}
