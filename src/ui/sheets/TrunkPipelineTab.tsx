// Fernleitungen (4.7, Kapitel 2) – Reiter „Fernleitung“ im Fenster Fracht:
// Trasse auf der Karte planen, vermessen, Wegerechte verhandeln, bauen, bewachen;
// die Antworten der Landbesitzer liegen als Briefe darunter. Erscheint erst, wenn
// die Simulation die Fernleitungen freigeschaltet hat (ab Kapitel 2).
// Hier wird nichts entschieden: Preise, Chancen, Gründe kommen aus src/sim/bigPipeline.ts.

import { useState } from 'react';
import pipelinesText from '../../../content/pipelines.yaml?raw';
import {
  abandonProject,
  acceptChance,
  askRight,
  bigPipelineCosts,
  bigPipelinesUnlocked,
  cleared,
  detourRight,
  expropriateRight,
  MILES_PER_UNIT,
  offerAmount,
  payDemand,
  pipelineDestinations,
  pipelineOrigins,
  pipelineWorldOf,
  planRoute,
  projectBuildCost,
  routeSketch,
  sabotageChanceOf,
  setTrunkGuards,
  startConstruction,
  sueRight,
  surveyRoute,
  thornePressure,
  unlockBigPipelines,
  type Offer,
  type PipelineResult,
  type RightStatus,
  type RouteSketch,
  type TrunkProject,
  type WayRight,
} from '../../sim/bigPipeline';
import { letterText, parsePipelineContent } from '../../sim/bigPipelineContent';
import { formatContentError } from '../../sim/eventContent';
import type { GameState } from '../../sim/game';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { money, NBSP } from '../format';
import type { SheetContext } from './types';
import './trunkPipeline.css';

const geladen = parsePipelineContent('content/pipelines.yaml', pipelinesText);
if (!geladen.content) throw new Error(geladen.errors.map(formatContentError).join('\n'));
const inhalt = geladen.content;

const B = balance.bigPipelines;

/** Soll der Reiter „Fernleitung“ im Fenster Fracht erscheinen? */
export function showTrunkTab(game: GameState): boolean {
  return bigPipelinesUnlocked(game);
}

const STATUS: Record<RightStatus, string> = {
  open: 'offen',
  asked: 'Angebot beim Notar',
  granted: 'unterschrieben',
  refused: 'abgelehnt',
  holdout: 'stellt sich quer',
  detour: 'Umweg',
  expropriated: 'enteignet',
  court: 'vor Gericht',
};

const OFFER_LABEL: Record<Offer, string> = { low: 'niedrig', fair: 'fair', generous: 'großzügig' };

function price(v: number): string {
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

function meilen(units: number): string {
  return `${(units * MILES_PER_UNIT).toLocaleString('de-DE', { maximumFractionDigits: 1 })}${NBSP}Meilen`;
}

function ziel(id: string): string {
  const d = pipelineDestinations(balance).find((x) => x.id === id);
  return d ? localize(d.landmark.name) : id;
}

/** Aussicht in Worten statt Prozent. */
function aussicht(chance: number): string {
  if (chance >= 0.7) return 'gute Aussicht';
  if (chance >= 0.4) return 'ungewiss';
  return 'kaum Aussicht';
}

/** Knopf für eine Aktion der Simulation: gesperrt mit Grund, wenn sie nicht geht. */
function Aktion({ result, onDone, children, primary = false }: { result: PipelineResult; onDone: (s: GameState) => void; children: string; primary?: boolean }) {
  return (
    <button type="button" className={primary ? 'primary' : undefined} disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

/** Skizze der Trasse: Gebiete, Meer, Thornes Bahn, Ranches an der Trasse nach Stand ihres Wegerechts. */
function Skizze({ sketch }: { sketch: RouteSketch }) {
  const pts = (p: readonly (readonly [number, number])[]) => p.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <svg className="trasse-skizze" viewBox={`${sketch.view.x} ${sketch.view.y} ${sketch.view.width} ${sketch.view.height}`} role="img" aria-label="Skizze der Trasse">
      <rect x={0} y={0} width={sketch.size.width} height={sketch.size.height} className="trasse-land" />
      {sketch.sea.map((s, i) => (
        <polygon key={`m${i}`} points={pts(s)} className="trasse-meer" />
      ))}
      {sketch.regions.map((r) => (
        <polygon key={r.id} points={pts(r.outline)} className={r.town ? 'trasse-stadt' : 'trasse-gebiet'} />
      ))}
      {sketch.ranches.map((r) => (
        <polygon key={r.id} points={pts(r.polygon)} className={`trasse-ranch ${cleared(r) ? 'klar' : r.status === 'holdout' ? 'quer' : 'offen'}`} />
      ))}
      {sketch.rails.map((r, i) => (
        <polyline key={`b${i}`} points={pts(r)} className="trasse-bahn" />
      ))}
      <polyline points={pts(sketch.route)} className="trasse-linie" />
      {sketch.places.map((p) => (
        <circle key={p.id} cx={p.at[0]} cy={p.at[1]} r={p.harbor ? 0.7 : 0.5} className={p.harbor ? 'trasse-hafen' : 'trasse-bahnhof'} />
      ))}
    </svg>
  );
}

/** Neue Trasse planen und vermessen. */
function Planer({ game, onChange }: { game: GameState; onChange: (s: GameState) => void }) {
  const herkunft = pipelineOrigins(game, balance);
  const [origin, setOrigin] = useState(herkunft[0]?.id ?? '');
  // Schon vermessene Trassen stehen oben – hier nur, was noch fehlt.
  const vermessen = (game.bigPipelines?.projects ?? []).filter((p) => p.origin === origin).map((p) => p.destination);
  const ziele = pipelineDestinations(balance).filter((d) => !vermessen.includes(d.id));
  const [gewaehlt, setDestination] = useState(ziele[0]?.id ?? '');
  const destination = ziele.some((d) => d.id === gewaehlt) ? gewaehlt : (ziele[0]?.id ?? '');
  if (ziele.length === 0) return null;
  const [fromSmall, setFromSmall] = useState(false);
  const kleine = game.logistics.pipeline === 'ready' || game.logistics.pipeline === 'damaged';
  const req = { origin, destination, fromSmall: fromSmall && kleine };
  const plan = planRoute(game, balance, req);
  return (
    <section className="trasse-planer">
      <h3>Neue Trasse planen</h3>
      <div className="zeile">
        <label>
          Von{' '}
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {herkunft.map((r) => (
              <option key={r!.id} value={r!.id}>
                {localize(r!.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          nach{' '}
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            {ziele.map((d) => (
              <option key={d.id} value={d.id}>
                {localize(d.landmark.name)}
              </option>
            ))}
          </select>
        </label>
        <label title={kleine ? undefined : 'Erst mit der kleinen Pipeline aus Kapitel 1.'}>
          <input type="checkbox" disabled={!kleine} checked={fromSmall && kleine} onChange={(e) => setFromSmall(e.target.checked)} /> an die kleine Pipeline anschließen
        </label>
      </div>
      {!plan.ok ? (
        <p className="muted">{plan.reason}</p>
      ) : (
        <>
          <Skizze sketch={routeSketch(game, balance, plan.plan)} />
          <p className="klein">
            {meilen(plan.plan.length)} · Vermessung {money(plan.plan.surveyCost)} · Bau {money(plan.plan.buildCost)} in {plan.plan.buildRounds}{' '}
            {plan.plan.buildRounds === 1 ? 'Runde' : 'Runden'} · {plan.plan.rights.filter((r) => !cleared(r)).length} Wegerechte offen (fair etwa {money(plan.plan.rightsCost)})
          </p>
          {plan.plan.bypassesRail ? (
            <p className="hint">Am Hafen vorbei an Thornes Bahn: billig durch die eigene Leitung. Thorne wird den Tarif senken müssen – und sich wehren.</p>
          ) : (
            <p className="klein">Das Öl bleibt auf Thornes Gleisen: mehr Platz auf der Bahn, aber jedes Barrel zahlt seinen Tarif. Er hat keinen Grund, nachzugeben.</p>
          )}
          <Aktion result={surveyRoute(game, balance, req)} onDone={onChange}>
            {`Trasse vermessen (${money(plan.plan.surveyCost)})`}
          </Aktion>
        </>
      )}
    </section>
  );
}

/** Eine Zeile der Wegerechte mit den Aktionen, die gerade gehen. */
function Recht({ game, project, right, onChange }: { game: GameState; project: TrunkProject; right: WayRight; onChange: (s: GameState) => void }) {
  const welt = pipelineWorldOf(game);
  const verhandeln = project.status === 'rights' && (right.status === 'open' || right.status === 'refused') && right.kind !== 'rail';
  const quer = project.status === 'rights' && right.status === 'holdout';
  return (
    <li className={`trasse-recht ${cleared(right) ? 'klar' : right.status}`}>
      <span className="trasse-recht-name">
        {cleared(right) ? '☑' : '☐'} {right.label}
        {right.kind === 'ranch' && <span className="klein"> · {right.owner}</span>}
      </span>
      <span className="trasse-recht-stand">
        {right.kind === 'own' ? 'eigenes Land' : STATUS[right.status]}
        {right.status === 'holdout' && ` – verlangt ${money(right.demand)}`}
        {right.status === 'court' && ` – Urteil Ende Runde ${right.courtRound}`}
      </span>
      {verhandeln && (
        <span className="trasse-recht-aktionen">
          {(['low', 'fair', 'generous'] as const).map((o) => (
            <Aktion key={o} result={askRight(game, balance, project.id, right.id, o)} onDone={onChange}>
              {`${OFFER_LABEL[o]} ${money(offerAmount(balance, right, o))}`}
            </Aktion>
          ))}
          <span className="klein"> {aussicht(acceptChance(game, balance, project, right, 'fair', welt))} bei fairem Angebot</span>
        </span>
      )}
      {quer && (
        <span className="trasse-recht-aktionen">
          <Aktion result={payDemand(game, project.id, right.id)} onDone={onChange}>
            {`Zahlen (${money(right.demand)})`}
          </Aktion>
          {right.kind === 'ranch' && (
            <Aktion result={detourRight(game, balance, project.id, right.id)} onDone={onChange}>
              {`Umweg (+${meilen(B.rights.detourLength)})`}
            </Aktion>
          )}
          {right.kind === 'rail' && (
            <Aktion result={sueRight(game, balance, project.id, right.id)} onDone={onChange}>
              {`Klagen (${money(B.rights.courtCost)})`}
            </Aktion>
          )}
          {right.kind !== 'town' && (
            <Aktion result={expropriateRight(game, balance, project.id, right.id, welt)} onDone={onChange}>
              Enteignen lassen
            </Aktion>
          )}
        </span>
      )}
    </li>
  );
}

function Projekt({ game, project, onChange }: { game: GameState; project: TrunkProject; onChange: (s: GameState) => void }) {
  const offen = project.rights.filter((r) => !cleared(r)).length;
  const kosten = projectBuildCost(balance, project);
  const risiko = sabotageChanceOf(game, balance, project);
  return (
    <section className="trasse-projekt">
      <h3>
        Fernleitung zum {ziel(project.destination)} <span className="klein">({meilen(project.length)})</span>
      </h3>
      <Skizze sketch={routeSketch(game, balance, project)} />
      {project.status === 'rights' && (
        <p>
          {offen > 0 ? `Noch ${offen} Wegerecht${offen === 1 ? '' : 'e'} offen.` : 'Alle Wegerechte sind geklärt.'} Bau {money(kosten)}.
        </p>
      )}
      {project.status === 'building' && (
        <p>
          Im Bau – noch {project.roundsLeft} {project.roundsLeft === 1 ? 'Runde' : 'Runden'}.
        </p>
      )}
      {project.status === 'ready' && (
        <p>
          {project.bypassesRail
            ? `Läuft: bis ${B.capacity.toLocaleString('de-DE')} Barrel je Runde über den Weg „Pipeline“.`
            : `Läuft: bis ${B.capacity.toLocaleString('de-DE')} Barrel je Runde mehr auf dem Weg „Bahn“ – zu Thornes Tarif.`}
        </p>
      )}
      {project.status === 'damaged' && <p className="warn">Sabotiert – wird repariert, noch {project.roundsLeft} {project.roundsLeft === 1 ? 'Runde' : 'Runden'}.</p>}
      {project.status === 'rights' && (
        <ul className="trasse-rechte">
          {project.rights.map((r) => (
            <Recht key={r.id} game={game} project={project} right={r} onChange={onChange} />
          ))}
        </ul>
      )}
      <div className="actions zeile">
        {project.status === 'rights' && (
          <>
            <Aktion primary result={startConstruction(game, balance, project.id)} onDone={onChange}>
              {`Bau beginnen (${money(kosten)})`}
            </Aktion>
            <Aktion result={abandonProject(game, project.id)} onDone={onChange}>
              Trasse aufgeben
            </Aktion>
          </>
        )}
        {project.status !== 'rights' && (
          <Aktion result={setTrunkGuards(game, project.id, !project.guards)} onDone={onChange}>
            {project.guards ? 'Wachleute abziehen' : `Wachleute anstellen (${money(Math.round(project.length * B.sabotage.guardsPerUnit))} je Runde)`}
          </Aktion>
        )}
      </div>
      {(project.status === 'building' || project.status === 'ready') && (
        <p className="klein">Sabotage-Risiko je Runde: {Math.round(risiko * 100)}{NBSP}%.</p>
      )}
    </section>
  );
}

/** Der Reiter „Fernleitung“ im Fenster Fracht. */
export function TrunkPipelineTab({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const bp = game.bigPipelines;
  if (!bp) return <p className="muted">Fernleitungen gibt es erst ab Kapitel 2.</p>;
  const druck = thornePressure(game, balance);
  const kosten = bigPipelineCosts(game, balance);
  const briefe = [...bp.letters].reverse();
  return (
    <div className="fernleitung">
      <p className="klein">
        Thornes Bahntarif {price(game.railTariff)} je bbl
        {druck > 0 ? ` · Thorne steht unter Druck (${druck >= 1 ? 'voll' : 'teilweise'}) und hat schon ${price(bp.thorneCut)} nachgelassen` : ''}
        {kosten.total > 0 ? ` · Fixkosten ${money(kosten.total)} je Runde` : ''}
      </p>
      {briefe.length > 0 && (
        <section className="trasse-post">
          <h3>Post zur Fernleitung</h3>
          {briefe.map((l, i) => (
            <p key={`${l.round}-${l.kind}-${l.rightId}-${i}`} className={`trasse-brief${l.round === game.round - 1 ? ' neu' : ''}`}>
              <span className="klein">Runde {l.round}</span> {letterText(inhalt, l)}
            </p>
          ))}
        </section>
      )}
      {bp.projects.map((p) => (
        <Projekt key={p.id} game={game} project={p} onChange={ctx.onGame} />
      ))}
      {bp.projects.length < B.maxProjects && !game.finished && <Planer game={game} onChange={ctx.onGame} />}
    </div>
  );
}

/** Debug-Ansicht: Fernleitungen schon in Kapitel 1 freischalten (zum Ausprobieren von Kapitel 2). */
export function TrunkDebugButton({ ctx }: { ctx: SheetContext }) {
  if (bigPipelinesUnlocked(ctx.game)) return <p className="klein">Fernleitungen sind freigeschaltet (Fracht → Fernleitung).</p>;
  return (
    <button type="button" onClick={() => ctx.onGame(unlockBigPipelines(ctx.game, balance, { force: true }))}>
      Fernleitungen freischalten (Kapitel 2 testen)
    </button>
  );
}
