// Fenster „Schattenbuch“ (4.11, GDD §4/§16): das Geheimbuch in der Schreibtischschublade.
// Ab Kapitel 2. Zeigt die Spuren früherer schmutziger Entscheidungen, die Hitze als Wort,
// wo Delaney steht – und die Gegenmittel. Entschieden wird in src/sim/investigation.ts;
// hier wird nur gezeigt und geklickt. Zahlen nur im Debug.

import { fillText, localize } from '../../sim/i18n';
import {
  applyPressure,
  buyWitness,
  destroyTrace,
  investigationView,
  pressureChance,
  pressurePaysWithFavors,
  sacrificeScapegoat,
  setLawyer,
  type InvestigationResult,
} from '../../sim/investigation';
import { balance } from '../balance';
import { money } from '../format';
import { investigationContent } from '../investigationContent';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './k2-411.css';

const T = investigationContent;
const tx = (key: keyof typeof T.texts, values?: Record<string, string | number>) => fillText(T.texts[key], values);

export const SHADOW_TABS = [
  { id: 'spuren', label: tx('tab_traces') },
  { id: 'gegenmittel', label: tx('tab_remedies') },
];

function Aktion({ result, onDone, children }: { result: InvestigationResult; onDone: (s: SheetContext['game']) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

/** Schwere als Punkte: gefüllt, was noch zählt; leer, was verblasst oder vernichtet ist. */
function Punkte({ current, severity }: { current: number; severity: number }) {
  return (
    <span className="spur-punkte" aria-label={tx('severity_aria', { current, severity })}>
      {'●'.repeat(current)}
      {'○'.repeat(Math.max(0, severity - current))}
    </span>
  );
}

/** Beweislage und Aussichten als Worte – der Spieler sieht keine Prozente. */
function beweisWort(evidence: number): string {
  if (evidence <= 0) return tx('evidence_none');
  if (evidence < balance.investigation.chargeAt / 2) return tx('evidence_thin');
  if (evidence < balance.investigation.chargeAt) return tx('evidence_thick');
  return tx('evidence_crushing');
}

function aussichtWort(p: number): string {
  if (p < 0.3) return tx('outlook_low');
  if (p < 0.6) return tx('outlook_mid');
  return tx('outlook_high');
}

export function ShadowBookSheet({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const v = investigationView(game, balance);
  const B = balance.investigation;
  const tab = activeTab('schattenbuch', SHADOW_TABS, ctx.tab);
  const ermittelt = v.stage === 'vorermittlung' || v.stage === 'anklage';
  const offen = v.traces.filter((t) => !t.closed);
  const erledigt = v.traces.filter((t) => t.closed);

  return (
    <div className="schattenbuch">
      <p className="schattenbuch-kopf">
        {tx('heat_label')} <strong>{localize(T.heat[v.word])}</strong>
        {ctx.debug && <span className="klein"> (Debug: {v.heat}, Beweise {v.evidence})</span>}
      </p>
      <p>{localize(T.stages[v.stage])}</p>
      {v.transferred && <p className="hint">{tx('transferred')}</p>}
      {v.verdict && v.stage === 'abgeschlossen' && <p className="klein">{localize(T.verdicts[v.verdict])}</p>}
      <Tabs sheet="schattenbuch" tabs={SHADOW_TABS} active={tab} onChange={ctx.onTab}>
        {tab === 'spuren' && (
          <>
            {offen.length === 0 && <p className="klein">{tx('no_traces')}</p>}
            <ul className="spuren">
              {offen.map((t) => (
                <li key={t.id} className={t.current === 0 ? 'spur verblasst' : 'spur'}>
                  <Punkte current={t.current} severity={t.severity} />
                  <span className="spur-text">
                    {t.label ? t.label : T.traces[t.key] ? localize(T.traces[t.key]) : t.key}
                    {t.witness && <em>{tx('witness_tag')}</em>}
                    {!t.witness && t.current === 0 && <em>{tx('faded_tag')}</em>}
                  </span>
                  {t.current > 0 &&
                    (t.witness ? (
                      <Aktion result={buyWitness(game, balance, t.id)} onDone={ctx.onGame}>
                        {tx('buy_witness', { kosten: money(B.witness.cost) })}
                      </Aktion>
                    ) : (
                      <Aktion result={destroyTrace(game, balance, t.id)} onDone={ctx.onGame}>
                        {tx('destroy', { kosten: money(B.destroy.cost) })}
                      </Aktion>
                    ))}
                </li>
              ))}
            </ul>
            {erledigt.length > 0 && <p className="klein">{tx(erledigt.length === 1 ? 'closed_one' : 'closed_many', { n: erledigt.length })}</p>}
            <p className="klein">{tx('destroy_hint')}</p>
          </>
        )}
        {tab === 'gegenmittel' && (
          <>
            {ermittelt && <p>{beweisWort(v.evidence)}</p>}
            {v.stage === 'anklage' && <p>{aussichtWort(v.conviction)}</p>}
            <h3>{tx('lawyer_title')}</h3>
            <p className="klein">
              {tx('lawyer_line', { stufe: v.lawyer, max: B.lawyer.max, kosten: money(B.lawyer.costPerLevel) })}
            </p>
            <div className="actions zeile">
              {Array.from({ length: B.lawyer.max + 1 }, (_, i) => (
                <Aktion key={i} result={setLawyer(game, balance, i)} onDone={ctx.onGame}>
                  {i === 0 ? tx('lawyer_none') : String(i)}
                </Aktion>
              ))}
            </div>
            <h3>{tx('delaney_title')}</h3>
            <div className="actions">
              <Aktion result={sacrificeScapegoat(game, balance)} onDone={ctx.onGame}>
                {tx('scapegoat')}
              </Aktion>
              <Aktion result={applyPressure(game, balance)} onDone={ctx.onGame}>
                {tx('pressure', { preis: pressurePaysWithFavors(game, balance) ? tx('pressure_favors', { n: B.pressure.favors }) : money(B.pressure.cost) })}
              </Aktion>
            </div>
            {ermittelt && (
              <p className="klein">
                {pressureChance(game, balance) >= 0.6
                  ? tx('friends_good')
                  : pressureChance(game, balance) >= 0.4
                    ? tx('friends_unsure')
                    : tx('friends_bad')}
              </p>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
