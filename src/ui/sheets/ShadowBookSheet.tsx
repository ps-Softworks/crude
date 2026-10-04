// Fenster „Schattenbuch“ (4.11, GDD §4/§16): das Geheimbuch in der Schreibtischschublade.
// Ab Kapitel 2. Zeigt die Spuren früherer schmutziger Entscheidungen, die Hitze als Wort,
// wo Delaney steht – und die Gegenmittel. Entschieden wird in src/sim/investigation.ts;
// hier wird nur gezeigt und geklickt. Zahlen nur im Debug.

import { localize } from '../../sim/i18n';
import {
  applyPressure,
  buyWitness,
  destroyTrace,
  investigationView,
  pressureChance,
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

export const SHADOW_TABS = [
  { id: 'spuren', label: 'Spuren' },
  { id: 'gegenmittel', label: 'Gegenmittel' },
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
    <span className="spur-punkte" aria-label={`Schwere ${current} von ${severity}`}>
      {'●'.repeat(current)}
      {'○'.repeat(Math.max(0, severity - current))}
    </span>
  );
}

/** Beweislage und Aussichten als Worte – der Spieler sieht keine Prozente. */
function beweisWort(evidence: number): string {
  if (evidence <= 0) return 'Delaney hat nichts in der Hand.';
  if (evidence < balance.investigation.chargeAt / 2) return 'Delaneys Akte ist noch dünn.';
  if (evidence < balance.investigation.chargeAt) return 'Delaneys Akte wird dick.';
  return 'Delaneys Akte ist erdrückend.';
}

function aussichtWort(p: number): string {
  if (p < 0.3) return 'Ashby rechnet mit einem Freispruch.';
  if (p < 0.6) return 'Ashby sagt: Das kann so oder so ausgehen.';
  return 'Ashby sagt: Die Geschworenen werden uns nicht mögen.';
}

export function ShadowBookSheet({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  const v = investigationView(game, balance);
  const T = investigationContent;
  const B = balance.investigation;
  const tab = activeTab('schattenbuch', SHADOW_TABS, ctx.tab);
  const ermittelt = v.stage === 'vorermittlung' || v.stage === 'anklage';
  const offen = v.traces.filter((t) => !t.closed);
  const erledigt = v.traces.filter((t) => t.closed);

  return (
    <div className="schattenbuch">
      <p className="schattenbuch-kopf">
        Hitze: <strong>{localize(T.heat[v.word])}</strong>
        {ctx.debug && <span className="klein"> (Debug: {v.heat}, Beweise {v.evidence})</span>}
      </p>
      <p>{localize(T.stages[v.stage])}</p>
      {v.transferred && <p className="hint">Delaney ist für eine Weile an einen anderen Fall gesetzt.</p>}
      {v.verdict && v.stage === 'abgeschlossen' && <p className="klein">{localize(T.verdicts[v.verdict])}</p>}
      <Tabs sheet="schattenbuch" tabs={SHADOW_TABS} active={tab} onChange={ctx.onTab}>
        {tab === 'spuren' && (
          <>
            {offen.length === 0 && <p className="klein">Keine Spuren, die jemand finden könnte.</p>}
            <ul className="spuren">
              {offen.map((t) => (
                <li key={t.id} className={t.current === 0 ? 'spur verblasst' : 'spur'}>
                  <Punkte current={t.current} severity={t.severity} />
                  <span className="spur-text">
                    {T.traces[t.key] ? localize(T.traces[t.key]) : t.key}
                    {t.witness && <em> – ein Zeuge</em>}
                    {!t.witness && t.current === 0 && <em> – verblasst</em>}
                  </span>
                  {t.current > 0 &&
                    (t.witness ? (
                      <Aktion result={buyWitness(game, balance, t.id)} onDone={ctx.onGame}>
                        {`Zeugen kaufen (${money(B.witness.cost)})`}
                      </Aktion>
                    ) : (
                      <Aktion result={destroyTrace(game, balance, t.id)} onDone={ctx.onGame}>
                        {`Vernichten (${money(B.destroy.cost)})`}
                      </Aktion>
                    ))}
                </li>
              ))}
            </ul>
            {erledigt.length > 0 && <p className="klein">Erledigt: {erledigt.length} {erledigt.length === 1 ? 'Spur' : 'Spuren'} aus einem abgeschlossenen Fall.</p>}
            <p className="klein">Vernichten kann neue Spuren hinterlassen. Gekaufte Zeugen sind selbst eine Spur.</p>
          </>
        )}
        {tab === 'gegenmittel' && (
          <>
            {ermittelt && <p>{beweisWort(v.evidence)}</p>}
            {v.stage === 'anklage' && <p>{aussichtWort(v.conviction)}</p>}
            <h3>Anwalt</h3>
            <p className="klein">
              Stufe {v.lawyer} von {B.lawyer.max} · {money(B.lawyer.costPerLevel)} je Stufe und Runde
            </p>
            <div className="actions zeile">
              {Array.from({ length: B.lawyer.max + 1 }, (_, i) => (
                <Aktion key={i} result={setLawyer(game, balance, i)} onDone={ctx.onGame}>
                  {i === 0 ? 'keiner' : String(i)}
                </Aktion>
              ))}
            </div>
            <h3>Wenn Delaney ermittelt</h3>
            <div className="actions">
              <Aktion result={sacrificeScapegoat(game, balance)} onDone={ctx.onGame}>
                Einen Sündenbock opfern (kostet Kraft)
              </Aktion>
              <Aktion result={applyPressure(game, balance)} onDone={ctx.onGame}>
                {`Freunde in Hallstead anrufen (${money(B.pressure.cost)})`}
              </Aktion>
            </div>
            {ermittelt && (
              <p className="klein">
                {pressureChance(game, balance) >= 0.6
                  ? 'In Hallstead hat Jacob gerade Freunde.'
                  : pressureChance(game, balance) >= 0.4
                    ? 'In Hallstead ist unsicher, wer zuhört.'
                    : 'Die Regierung in Hallstead mag keine Ölmänner.'}
              </p>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
