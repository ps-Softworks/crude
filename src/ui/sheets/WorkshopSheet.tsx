// Fenster „Werkstatt“ (4.11, GDD §5/§6): Versuchswerkstatt, Erfindungen, Patente und Lizenzen.
// Ab Kapitel 2. Entschieden wird in src/sim/research.ts; hier wird nur gezeigt und geklickt.

import { localize } from '../../sim/i18n';
import {
  ACTIVE_TECH_EFFECTS,
  buildWorkshop,
  buyLicense,
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

/** Wert einer Kennzahl lesbar: Anteile in Prozent, Tiefe in Metern, Tanklaster als Ja. */
function wirkWert(key: TechEffectKey, v: number): string {
  if (key === 'trucks') return '';
  if (key === 'depth') return ` ${v > 0 ? '+' : '−'}${Math.abs(v)} m`;
  const p = Math.round(Math.abs(v) * 100);
  return key === 'gasolineYield' ? ` +${p} Prozentpunkte` : ` ${v > 0 ? '+' : '−'}${p} %`;
}

function stand(v: TechView): string {
  if (v.source === 'patent') return 'Patent bei Jacob';
  if (v.source === 'eigen') return 'selbst entwickelt';
  if (v.source === 'lizenz') return 'Lizenz gekauft';
  if (v.status === 'laeuft') return v.progress > 0.66 ? 'fast fertig' : v.progress > 0.33 ? 'halb fertig' : 'in Arbeit';
  if (v.progress > 0) return 'angefangen, liegt';
  if (v.status === 'gesperrt') return 'braucht erst eine andere Technik';
  return 'offen';
}

export function WorkshopSheet({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const R = balance.research;
  const T = researchContent;
  const r = game.research;
  const views = techViews(game, balance);
  const name = (id: string) => (T.techs[id] ? localize(T.techs[id].name) : id);

  return (
    <div className="werkstatt">
      {!r?.workshop ? (
        <>
          <p>Jacob hat noch keine Werkstatt. Ohne sie bleibt nur, Lizenzen zu kaufen, wenn andere eine Technik schon haben.</p>
          <Aktion result={buildWorkshop(game, balance)} onDone={ctx.onGame}>
            {`Versuchswerkstatt einrichten (${money(R.workshop)})`}
          </Aktion>
        </>
      ) : (
        <p>
          {r.project ? (
            <>
              In der Werkstatt: <strong>{name(r.project)}</strong> ({T.funding[r.funding] ? localize(T.funding[r.funding]) : r.funding}, {money(R.funding[r.funding]?.cost ?? 0)} je Runde).
            </>
          ) : (
            'Die Werkstatt steht still.'
          )}
        </p>
      )}
      <ul className="techniken">
        {views.map((v) => (
          <li key={v.id} className={`technik ${v.status}`}>
            <div className="technik-kopf">
              <strong>{name(v.id)}</strong>
              <span className="klein">
                {` · Stufe ${ROEMISCH[v.tier]} · ${localize(T.domains[v.domain])} · ${stand(v)}`}
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
                    <Aktion key={i} result={startResearch(game, balance, v.id, i)} onDone={ctx.onGame}>
                      {`Forschen: ${T.funding[i] ? localize(T.funding[i]) : i} (${money(f.cost)} je Runde)`}
                    </Aktion>
                  ))}
                {v.status === 'laeuft' && (
                  <Aktion result={stopResearch(game, balance)} onDone={ctx.onGame}>
                    Anhalten
                  </Aktion>
                )}
                {v.licensable && (
                  <Aktion result={buyLicense(game, balance, v.id)} onDone={ctx.onGame}>
                    {`Lizenz kaufen (${money(v.license)})`}
                  </Aktion>
                )}
              </div>
            )}
            {v.source === 'patent' && (
              <p className="klein">
                {v.refused
                  ? 'Jacob verweigert die Lizenz: Die Rivalen haben diese Technik nicht.'
                  : v.paying
                    ? `Die Rivalen zahlen Lizenzgebühren: ${money(R.patentIncome)} je Runde.`
                    : 'Die Rivalen brauchen die Technik noch nicht – noch keine Lizenzgebühren.'}
              </p>
            )}
            {v.source === 'patent' && (
              <div className="actions zeile">
                <Aktion result={toggleRefuse(game, balance, v.id)} onDone={ctx.onGame}>
                  {v.refused ? 'Lizenzen wieder vergeben' : 'Rivalen die Lizenz verweigern'}
                </Aktion>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="klein">Wer eine Technik als Erster entwickelt, hält das Patent. Haben andere sie schon, gibt es Lizenzen zu kaufen.</p>
    </div>
  );
}
