// Fenster „Raffinerie“ (4.6, ab Kapitel 2): Anlage bauen und ausbauen, wie viel
// Rohöl am Rundenende hineingeht, Produktmix, und die Abwägung Rohöl verkaufen
// oder raffinieren. Hier wird nichts entschieden – Preise, Grenzen und Gründe
// kommen aus src/sim/refinery.ts, die Texte aus content/refinery.yaml.

import { useMemo, useState } from 'react';
import {
  adjustMix,
  bestRefinerySetting,
  buildRefinery,
  crudeVsRefined,
  expandRefinery,
  feedCapacity,
  feedLimited,
  normalizeMix,
  planRun,
  plannedCrude,
  productDemand,
  PRODUCTS,
  refineryCapacity,
  refineryExpansion,
  refineryStatus,
  refineryMixBounds,
  refineryTech,
  refineryWorld,
  setRefineryIntake,
  setRefineryMix,
  stationOfftake,
  type ProductMix,
  type RefineryResult,
} from '../../sim/refinery';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { barrels, money, NBSP, percent, rounds } from '../format';
import { refineryContent, rt } from '../refinery';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './refinery.css';

const R = balance.refinery;

export const REFINERY_TABS = [
  { id: 'anlage', label: rt('tabs.plant') },
  { id: 'mix', label: rt('tabs.mix') },
  { id: 'abwaegung', label: rt('tabs.compare') },
];

/** Preis je Barrel mit Cent, z. B. „2,60 $“. */
function price(v: number): string {
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

function name(p: (typeof PRODUCTS)[number]): string {
  return localize(refineryContent.products[p].name);
}

/** Knopf für eine Aktion aus src/sim/refinery: gesperrt mit Grund, wenn sie nicht geht. */
function Aktion({ result, onDone, children }: { result: RefineryResult; onDone: (r: RefineryResult) => void; children: string }) {
  return (
    <>
      <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result)}>
        {children}
      </button>
      {/* 0.4.19+2: Der Grund steht sichtbar daneben, nicht nur im Tooltip. */}
      {!result.ok && <span className="muted klein"> {result.reason}</span>}
    </>
  );
}

export function RefinerySheet({ ctx }: { ctx: SheetContext }) {
  const tab = activeTab('raffinerie', REFINERY_TABS, ctx.tab);
  if (!ctx.game.refinery) return <p className="muted">{rt('status.none')}</p>;
  return (
    <Tabs sheet="raffinerie" tabs={REFINERY_TABS} active={tab} onChange={ctx.onTab}>
      {tab === 'anlage' && <PlantPanel ctx={ctx} />}
      {tab === 'mix' && <MixPanel ctx={ctx} />}
      {tab === 'abwaegung' && <ComparePanel ctx={ctx} />}
    </Tabs>
  );
}

/** Kurzform am Gegenstand, z. B. „läuft · 25.000 bbl“. */
export function refineryObjectStatus(game: SheetContext['game']): string {
  const st = refineryStatus(game);
  if (st === 'locked') return '';
  const kurz = rt(`status.short.${st}`);
  const cap = refineryCapacity(game, balance);
  return cap > 0 ? `${kurz} · ${barrels(cap)}${NBSP}bbl` : kurz;
}

function PlantPanel({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const r = game.refinery!;
  const st = refineryStatus(game);
  const cap = refineryCapacity(game, balance);
  const tech = refineryTech(balance, r.tech).label;
  const werte = { capacity: barrels(cap), level: String(r.level), tech, rounds: rounds(st === 'damaged' ? r.repairLeft : r.projectLeft) };
  const geplant = plannedCrude(game, balance);
  const done = (res: RefineryResult) => res.ok && ctx.onGame(res.state);
  return (
    <div className="raffinerie">
      <p className="muted">{rt('intro')}</p>
      {st !== 'locked' && <p className="raffinerie-status">{rt(`status.${st}`, werte)}</p>}
      <div className="raffinerie-knoepfe">
        {r.level === 0 && !r.project && (
          <Aktion result={buildRefinery(game, balance)} onDone={done}>
            {rt('actions.build', { cost: money(R.buildCost), rounds: rounds(R.buildRounds) })}
          </Aktion>
        )}
        {r.level > 0 && r.level < R.maxLevel && (
          <Aktion result={expandRefinery(game, balance)} onDone={done}>
            {rt('actions.expand', { capacity: barrels(R.unitCapacity), cost: money(R.expandCost), rounds: rounds(R.expandRounds) })}
          </Aktion>
        )}
      </div>
      {r.level > 0 && r.level < R.maxLevel && !r.project && <ExpansionHint ctx={ctx} />}
      {r.level > 0 && (
        <>
          <label className="raffinerie-regler">
            {rt('actions.intake')}: <strong>{percent(r.intake)}</strong>
            <input
              type="range"
              className="regler"
              min={0}
              max={100}
              step={5}
              value={Math.round(r.intake * 100)}
              onChange={(e) => done(setRefineryIntake(game, Number(e.target.value) / 100))}
            />
          </label>
          <p className="klein">{rt('hints.intake')}</p>
          <p>{geplant > 0 ? rt('hints.planned', { crude: barrels(geplant) }) : rt('hints.noCrude')}</p>
          {feedLimited(game, balance) && <p className="klein">{rt('hints.feedLimited', { crude: barrels(feedCapacity(game, balance)) })}</p>}
        </>
      )}
      {r.last && (
        <p className="klein">
          {rt('hints.lastRun', { crude: barrels(r.last.crude), revenue: money(r.last.revenue), net: money(r.last.net) })}
        </p>
      )}
    </div>
  );
}

/** 0.4.20+18: Was der nächste Ausbau bei der heutigen Nachfrage bringt (beide Stufen bestmöglich eingestellt). */
function ExpansionHint({ ctx }: { ctx: SheetContext }) {
  const aus = useMemo(() => refineryExpansion(ctx.game, balance), [ctx.game]);
  if (!aus) return null;
  return (
    <p className="klein">
      {aus.payback !== null ? rt('hints.expandPays', { gain: money(aus.gain), rounds: rounds(aus.payback) }) : rt('hints.expandNot')}
    </p>
  );
}

function MixPanel({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const r = game.refinery!;
  const bounds = refineryMixBounds(game, balance, r.tech); // 0.4.20+9: mit Cracken mehr Benzin
  const [wunsch, setWunsch] = useState<ProductMix>(r.mix);
  const vorschau = normalizeMix(wunsch, bounds);
  const welt = refineryWorld(game, balance);
  const menge = plannedCrude(game, balance) || Math.max(refineryCapacity(game, balance), R.unitCapacity);
  const lauf = planRun({ ...game, refinery: { ...r, mix: vorschau } }, balance, menge, { world: welt });
  const geaendert = PRODUCTS.some((p) => vorschau[p] !== r.mix[p]);
  return (
    <div className="raffinerie">
      <p className="klein">{rt('hints.mix')}</p>
      <table className="wege raffinerie-mix">
        <thead>
          <tr>
            <th>{rt('columns.product')}</th>
            <th>{rt('columns.share')}</th>
            <th>{rt('columns.output')}</th>
            <th>{rt('columns.demand')}</th>
            <th>{rt('columns.price')}</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr key={p}>
              <td title={localize(refineryContent.products[p].text)}>{name(p)}</td>
              <td>
                <input
                  type="range"
                  className="regler"
                  aria-label={name(p)}
                  min={Math.round(bounds[p].min * 100)}
                  max={Math.round(bounds[p].max * 100)}
                  step={1}
                  disabled={bounds[p].min === bounds[p].max}
                  value={Math.round(vorschau[p] * 100)}
                  onChange={(e) => setWunsch(adjustMix(vorschau, p, Number(e.target.value) / 100, bounds))}
                />{' '}
                {percent(vorschau[p])}
              </td>
              <td>{barrels(lauf.output[p])}</td>
              <td>{barrels(productDemand(p, welt, balance))}</td>
              <td>{price(lauf.prices[p])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" disabled={!geaendert} onClick={() => {
        const res = setRefineryMix(game, balance, vorschau);
        if (res.ok) ctx.onGame(res.state);
      }}>
        {rt('actions.apply')}
      </button>
    </div>
  );
}

function ComparePanel({ ctx }: { ctx: SheetContext }) {
  const v = crudeVsRefined(ctx.game, balance);
  const diff = price(Math.abs(v.advantage));
  const best = useMemo(() => (ctx.game.refinery!.level > 0 ? bestRefinerySetting(ctx.game, balance) : null), [ctx.game]);
  const benzin = stationOfftake(ctx.game);
  return (
    <div className="raffinerie">
      <table className="wege raffinerie-vergleich">
        <thead>
          <tr>
            <th>{rt('columns.sellCrude')}</th>
            <th>{rt('columns.refine')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={v.advantage < 0 ? 'besser' : undefined}>{price(v.crudeNet)}</td>
            <td className={v.advantage > 0 ? 'besser' : undefined}>{price(v.refinedNet)}</td>
          </tr>
        </tbody>
      </table>
      <p>{v.advantage >= 0 ? rt('hints.refineBetter', { diff }) : rt('hints.sellBetter', { diff })}</p>
      {v.advantage >= 0 && v.marginalNet < v.crudeNet && (
        <p>{rt('hints.lessIntake', { marginal: price(v.marginalNet), crude: price(v.crudeNet) })}</p>
      )}
      {best && <p>{rt('hints.bestGain', { now: money(Math.round(v.advantage * v.crude)), best: money(best.gain) })}</p>}
      {benzin > 0 && <p className="klein">{rt('hints.stations', { gasoline: barrels(benzin) })}</p>}
      <p className="klein">{rt('hints.compare')}</p>
    </div>
  );
}
