// Fenster „Werkstatt“ (4.11, GDD §5/§6): Versuchswerkstatt, Erfindungen, Patente und Lizenzen.
// Ab Kapitel 2. Entschieden wird in src/sim/research.ts; hier wird nur gezeigt und geklickt.

import { localize } from '../../sim/i18n';
import {
  ACTIVE_TECH_EFFECTS,
  buildWorkshop,
  buyLicense,
  researchDirection,
  startResearch,
  stopResearch,
  techViews,
  toggleRefuse,
  type ResearchResult,
  type TechEffectKey,
  type TechView,
} from '../../sim/research';
import { balance } from '../balance';
import { money } from '../format';
import { researchContent } from '../researchContent';
import type { SheetContext } from './types';
import './k2-411.css';

const ROEMISCH = ['', 'I', 'II', 'III', 'IV', 'V'];

function Aktion({ result, onDone, children }: { result: ResearchResult; onDone: (s: SheetContext['game']) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

const D = researchContent.direction;
const text = (t: keyof typeof D, werte: Record<string, string | number> = {}) =>
  Object.entries(werte).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), localize(D[t]));

/** Wert einer Kennzahl lesbar: Anteile in Prozent (Tanklaster: je Gespann), Tiefe in Metern. */
function wirkWert(key: TechEffectKey, v: number): string {
  if (key === 'depth') return ` ${v > 0 ? '+' : '−'}${Math.abs(v)} m`;
  const p = Math.round(Math.abs(v) * 100);
  return key === 'gasolineYield' ? ` +${p} ${localize(D.unitPoints)}` : ` ${v > 0 ? '+' : '−'}${p} %`;
}

function stand(v: TechView): string {
  if (v.source === 'patent') return text('statusPatent');
  if (v.source === 'eigen') return text('statusOwn');
  if (v.source === 'lizenz') return text('statusLicense');
  if (v.status === 'laeuft') return v.progress > 0.66 ? text('statusAlmost') : v.progress > 0.33 ? text('statusHalf') : text('statusWorking');
  if (v.progress > 0) return text('statusParked');
  if (v.status === 'gesperrt') return text('statusBlocked');
  return text('statusOpen');
}

export function WorkshopSheet({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const R = balance.research;
  const T = researchContent;
  const r = game.research;
  const views = techViews(game, balance);
  const name = (id: string) => (T.techs[id] ? localize(T.techs[id].name) : id);
  const dir = researchDirection(game);
  const dirName = dir ? localize(T.domains[dir]) : '';
  const zuschlag = Math.round((R.licenseOffDirection - 1) * 100);

  return (
    <div className="werkstatt">
      {!r?.workshop ? (
        <>
          <p>{text('noWorkshop')}</p>
          <Aktion result={buildWorkshop(game, balance)} onDone={ctx.onGame}>
            {text('build', { cost: money(R.workshop) })}
          </Aktion>
        </>
      ) : (
        <p>
          {r.project
            ? text('running', {
                tech: name(r.project),
                funding: T.funding[r.funding] ? localize(T.funding[r.funding]) : r.funding,
                cost: money(R.funding[r.funding]?.cost ?? 0),
              })
            : text('noProject')}
        </p>
      )}
      <p className="klein">
        <strong>{dir ? text('chosen', { domain: dirName }) : text('free')}</strong>
      </p>
      <ul className="techniken">
        {views.map((v) => (
          <li key={v.id} className={`technik ${v.status}`}>
            <div className="technik-kopf">
              <strong>{name(v.id)}</strong>
              <span className="klein">
                {` · ${text('stageLine', { tier: ROEMISCH[v.tier], domain: localize(T.domains[v.domain]), status: stand(v) })}`}
                {ctx.debug && ` (Debug: ${Math.round(v.progress * 100)} %)`}
              </span>
            </div>
            {T.techs[v.id] && <p className="klein">{localize(T.techs[v.id].text)}</p>}
            <ul className="klein wirkung">
              {Object.entries(R.techs.find((t) => t.id === v.id)?.effects ?? {}).map(([k, wert]) => {
                const key = k as TechEffectKey;
                const wirkt = ACTIVE_TECH_EFFECTS.includes(key);
                return (
                  <li key={k}>
                    {`${localize(T.effects[key])}${wirkWert(key, wert ?? 0)}`}
                    {!wirkt && <em>{` (${localize(T.pending)})`}</em>}
                  </li>
                );
              })}
            </ul>
            {v.status !== 'eigen' && (
              <div className="actions zeile">
                {r?.workshop &&
                  R.funding.map((f, i) => (
                    <Aktion
                      key={i}
                      result={v.directionLocked ? { ok: false, reason: text('locked', { domain: dirName }) } : startResearch(game, balance, v.id, i)}
                      onDone={ctx.onGame}
                    >
                      {text('research', { funding: T.funding[i] ? localize(T.funding[i]) : i, cost: money(f.cost) })}
                    </Aktion>
                  ))}
                {v.status === 'laeuft' && (
                  <Aktion result={stopResearch(game, balance)} onDone={ctx.onGame}>
                    {text('stop')}
                  </Aktion>
                )}
                {v.licensable && (
                  <Aktion result={buyLicense(game, balance, v.id)} onDone={ctx.onGame}>
                    {text('license', { cost: money(v.license) })}
                  </Aktion>
                )}
                {v.licensable && v.surcharge && <span className="klein">{text('surchargeNote', { factor: zuschlag })}</span>}
              </div>
            )}
            {v.source === 'patent' && (
              <p className="klein">
                {v.refused ? text('refusedNote') : v.paying ? text('payingNote', { cost: money(R.patentIncome) }) : text('waitingNote')}
              </p>
            )}
            {v.source === 'patent' && (
              <div className="actions zeile">
                <Aktion result={toggleRefuse(game, balance, v.id)} onDone={ctx.onGame}>
                  {v.refused ? text('allow') : text('refuse')}
                </Aktion>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="klein">{text('footer')}</p>
    </div>
  );
}
