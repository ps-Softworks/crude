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
import { letterText, parsePipelineContent, uiText, type UiKey } from '../../sim/bigPipelineContent';
import { formatContentError } from '../../sim/eventContent';
import type { GameState } from '../../sim/game';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { money, NBSP } from '../format';
import { trunkSavings } from '../../sim/trunkSavings';
import type { SheetContext } from './types';
import './trunkPipeline.css';

const geladen = parsePipelineContent('content/pipelines.yaml', pipelinesText);
if (!geladen.content) throw new Error(geladen.errors.map(formatContentError).join('\n'));
const inhalt = geladen.content;

const B = balance.bigPipelines;

/** Text der Oberfläche aus content/pipelines.yaml. */
function t(key: UiKey, vars: Record<string, string | number> = {}): string {
  return uiText(inhalt, key, vars);
}

function runden(n: number): string {
  return t(n === 1 ? 'roundOne' : 'roundMany');
}

/** Soll der Reiter „Fernleitung“ im Fenster Fracht erscheinen? */
export function showTrunkTab(game: GameState): boolean {
  return bigPipelinesUnlocked(game);
}

const STATUS_KEY: Record<RightStatus, UiKey> = {
  open: 'statusOpen',
  asked: 'statusAsked',
  granted: 'statusGranted',
  refused: 'statusRefused',
  holdout: 'statusHoldout',
  detour: 'statusDetour',
  expropriated: 'statusExpropriated',
  court: 'statusCourt',
};

const OFFER_KEY: Record<Offer, UiKey> = { low: 'offerLow', fair: 'offerFair', generous: 'offerGenerous' };

function price(v: number): string {
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

function meilen(units: number): string {
  return t('miles', { n: (units * MILES_PER_UNIT).toLocaleString('de-DE', { maximumFractionDigits: 1 }) }).replace(' ', NBSP);
}

function ziel(id: string): string {
  const d = pipelineDestinations(balance).find((x) => x.id === id);
  return d ? localize(d.landmark.name) : id;
}

/** Aussicht in Worten statt Prozent. */
function aussicht(chance: number): string {
  if (chance >= 0.7) return t('chanceGood');
  if (chance >= 0.4) return t('chanceUnsure');
  return t('chancePoor');
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
    <svg className="trasse-skizze" viewBox={`${sketch.view.x} ${sketch.view.y} ${sketch.view.width} ${sketch.view.height}`} role="img" aria-label={t('sketchLabel')}>
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

/** Nutzenzeile: was die fertige Leitung bei heutiger Förderung je Runde spart und wann sie bezahlt ist. */
function Nutzen({ game, bypassesRail, length, cost }: { game: GameState; bypassesRail: boolean; length: number; cost: number }) {
  const n = trunkSavings(game, balance, { bypassesRail, length, cost });
  return (
    <p className={n.payback === null ? 'klein' : 'hint'} data-testid="trasse-nutzen">
      {n.payback === null ? t('benefitNone') : t('benefitGain', { gain: money(n.net), n: n.payback, roundWord: runden(n.payback) })}
    </p>
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
      <h3>{t('planTitle')}</h3>
      <div className="zeile">
        <label>
          {t('from')}{' '}
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {herkunft.map((r) => (
              <option key={r!.id} value={r!.id}>
                {localize(r!.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('to')}{' '}
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            {ziele.map((d) => (
              <option key={d.id} value={d.id}>
                {localize(d.landmark.name)}
              </option>
            ))}
          </select>
        </label>
        <label title={kleine ? undefined : t('fromSmallLocked')}>
          <input type="checkbox" disabled={!kleine} checked={fromSmall && kleine} onChange={(e) => setFromSmall(e.target.checked)} /> {t('fromSmall')}
        </label>
      </div>
      {!plan.ok ? (
        <p className="muted">{plan.reason}</p>
      ) : (
        <>
          <Skizze sketch={routeSketch(game, balance, plan.plan)} />
          <p className="klein">
            {t('planSummary', {
              miles: meilen(plan.plan.length),
              survey: money(plan.plan.surveyCost),
              build: money(plan.plan.buildCost),
              rounds: plan.plan.buildRounds,
              roundWord: runden(plan.plan.buildRounds),
              open: plan.plan.rights.filter((r) => !cleared(r)).length,
              rights: money(plan.plan.rightsCost),
            })}
          </p>
          {plan.plan.bypassesRail ? (
            <p className="hint">{t('hintBypass')}</p>
          ) : (
            <p className="klein">{t('hintRail')}</p>
          )}
          <Nutzen game={game} bypassesRail={plan.plan.bypassesRail} length={plan.plan.length} cost={plan.plan.surveyCost + plan.plan.buildCost + plan.plan.rightsCost} />
          <Aktion result={surveyRoute(game, balance, req)} onDone={onChange}>
            {t('survey', { amount: money(plan.plan.surveyCost) })}
          </Aktion>
        </>
      )}
    </section>
  );
}

/** Eine Zeile der Wegerechte mit den Aktionen, die gerade gehen. */
function Recht({ game, project, right, onChange }: { game: GameState; project: TrunkProject; right: WayRight; onChange: (s: GameState) => void }) {
  const welt = pipelineWorldOf(game, balance);
  const verhandeln = project.status === 'rights' && (right.status === 'open' || right.status === 'refused') && right.kind !== 'rail';
  const quer = project.status === 'rights' && right.status === 'holdout';
  return (
    <li className={`trasse-recht ${cleared(right) ? 'klar' : right.status}`}>
      <span className="trasse-recht-name">
        {cleared(right) ? '☑' : '☐'} {right.label}
        {right.kind === 'ranch' && <span className="klein"> · {right.owner}</span>}
      </span>
      <span className="trasse-recht-stand">
        {right.kind === 'own' ? t('ownLand') : t(STATUS_KEY[right.status])}
        {right.status === 'holdout' && t('demands', { amount: money(right.demand) })}
        {right.status === 'court' && t('verdict', { round: right.courtRound })}
      </span>
      {verhandeln && (
        <span className="trasse-recht-aktionen">
          {(['low', 'fair', 'generous'] as const).map((o) => (
            <Aktion key={o} result={askRight(game, balance, project.id, right.id, o)} onDone={onChange}>
              {t(OFFER_KEY[o], { amount: money(offerAmount(balance, right, o)) })}
            </Aktion>
          ))}
          <span className="klein"> {t('chanceAtFair', { chance: aussicht(acceptChance(game, balance, project, right, 'fair', welt)) })}</span>
        </span>
      )}
      {quer && (
        <span className="trasse-recht-aktionen">
          <Aktion result={payDemand(game, project.id, right.id)} onDone={onChange}>
            {t('pay', { amount: money(right.demand) })}
          </Aktion>
          {right.kind === 'ranch' && (
            <Aktion result={detourRight(game, balance, project.id, right.id)} onDone={onChange}>
              {t('detour', { miles: meilen(B.rights.detourLength) })}
            </Aktion>
          )}
          {right.kind === 'rail' && (
            <Aktion result={sueRight(game, balance, project.id, right.id)} onDone={onChange}>
              {t('sue', { amount: money(B.rights.courtCost) })}
            </Aktion>
          )}
          {right.kind !== 'town' && (
            <Aktion result={expropriateRight(game, balance, project.id, right.id, welt)} onDone={onChange}>
              {t('expropriate')}
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
  // Was an offenen Wegerechten noch zu zahlen ist: Forderung bei Querköpfen, sonst der faire Preis.
  const offeneRechte = project.rights.filter((r) => !cleared(r) && r.kind !== 'own').reduce((sum, r) => sum + (r.status === 'holdout' ? r.demand : r.price), 0);
  return (
    <section className="trasse-projekt">
      <h3>
        {t('projectTitle', { destination: ziel(project.destination) })} <span className="klein">({meilen(project.length)})</span>
      </h3>
      <Skizze sketch={routeSketch(game, balance, project)} />
      {project.status === 'rights' && (
        <p>
          {offen > 0 ? t(offen === 1 ? 'rightsOpenOne' : 'rightsOpenMany', { n: offen }) : t('rightsDone')} {t('buildCost', { amount: money(kosten) })}
        </p>
      )}
      {project.status === 'rights' && <Nutzen game={game} bypassesRail={project.bypassesRail} length={project.length} cost={kosten + offeneRechte} />}
      {project.status === 'building' && (
        <p>
          {t('building', { n: project.roundsLeft, roundWord: runden(project.roundsLeft) })}
        </p>
      )}
      {project.status === 'ready' && (
        <p>
          {t(project.bypassesRail ? 'readyHarbor' : 'readyRail', { capacity: B.capacity.toLocaleString('de-DE') })}
        </p>
      )}
      {project.status === 'damaged' && <p className="warn">{t('damaged', { n: project.roundsLeft, roundWord: runden(project.roundsLeft) })}</p>}
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
              {t('startBuild', { amount: money(kosten) })}
            </Aktion>
            <Aktion result={abandonProject(game, project.id)} onDone={onChange}>
              {t('abandon')}
            </Aktion>
          </>
        )}
        {project.status !== 'rights' && (
          <Aktion result={setTrunkGuards(game, project.id, !project.guards)} onDone={onChange}>
            {project.guards ? t('guardsOff') : t('guardsOn', { amount: money(Math.round(project.length * B.sabotage.guardsPerUnit)) })}
          </Aktion>
        )}
      </div>
      {(project.status === 'building' || project.status === 'ready') && (
        <p className="klein">{t('sabotageRisk', { percent: `${Math.round(risiko * 100)}${NBSP}%` })}</p>
      )}
    </section>
  );
}

/** Der Reiter „Fernleitung“ im Fenster Fracht. */
export function TrunkPipelineTab({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const bp = game.bigPipelines;
  if (!bp) return <p className="muted">{t('noProjects')}</p>;
  const druck = thornePressure(game, balance);
  const kosten = bigPipelineCosts(game, balance);
  const briefe = [...bp.letters].reverse();
  return (
    <div className="fernleitung">
      <p className="klein">
        {t('tariffLine', { tariff: price(game.railTariff) })}
        {druck > 0 ? t('pressureLine', { level: t(druck >= 1 ? 'pressureFull' : 'pressurePartial'), cut: price(bp.thorneCut) }) : ''}
        {kosten.total > 0 ? t('fixedCosts', { amount: money(kosten.total) }) : ''}
      </p>
      {briefe.length > 0 && (
        <section className="trasse-post">
          <h3>{t('postTitle')}</h3>
          {briefe.map((l, i) => (
            <p key={`${l.round}-${l.kind}-${l.rightId}-${i}`} className={`trasse-brief${l.round === game.round - 1 ? ' neu' : ''}`}>
              <span className="klein">{t('letterRound', { round: l.round })}</span> {letterText(inhalt, l)}
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
  if (bigPipelinesUnlocked(ctx.game)) return <span className="muted klein">{t('debugOn')}</span>;
  return (
    <button type="button" onClick={() => ctx.onGame(unlockBigPipelines(ctx.game, balance, { force: true }))}>
      {t('debugUnlock')}
    </button>
  );
}
