// Fenster „Personal“ (4.9, GDD §11): die Personalakten ab Kapitel 2. Drei Reiter:
// Leute (Angestellte und Bewerber), Richtlinien (Post, Verkauf, Löhne) und – mit
// Fixer – Aufträge. Hier wird nichts gerechnet und nichts entschieden: Wörter,
// Spannen, Löhne und Gründe kommen aus src/sim (staff.ts, staffContent.ts).

import { useState } from 'react';
import { MAIL_KINDS, type MailKind } from '../../sim/events';
import type { GameState } from '../../sim/game';
import {
  dismissStaff,
  hireStaff,
  MAIL_RULES,
  orderFixer,
  recognizeStaff,
  setMailRule,
  setMailSpendLimit,
  setSalesPolicy,
  setWageLevel,
  type StaffResult,
} from '../../sim/staff';
import { staffView, type StaffMemberView, type StaffPersonView } from '../../sim/staffContent';
import { delegatedMail } from '../../sim/staffRound';
import { events } from '../events';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { BRIEFART } from '../EventCard';
import { money } from '../format';
import { Tabs, activeTab } from '../sheet/Tabs';
import { staffContent } from '../staff';
import type { SheetContext } from './types';
import './staff.css';

/** Knopf für eine Aktion aus src/sim/staff: gesperrt mit Grund, wenn sie nicht geht. */
function Aktion({ result, onDone, children }: { result: StaffResult; onDone: (r: Extract<StaffResult, { ok: true }>) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result)}>
      {children}
    </button>
  );
}

function Merkmale({ p }: { p: StaffPersonView }) {
  return (
    <span className="personal-merkmale">
      {p.traits.map((t) => (
        <span key={t.id} className="personal-merkmal" title={t.text}>
          {t.label}
        </span>
      ))}
    </span>
  );
}

function Kopf({ p }: { p: StaffPersonView }) {
  return (
    <>
      <h3 className="personal-name">
        {p.name} <small className="muted">· {p.roleTitle}</small>
      </h3>
      <p className="personal-bio">{p.bio}</p>
      <p className="personal-werte">
        Kompetenz {p.competence}
        {!p.competenceKnown && <span className="muted"> (ungefähr)</span>} · Lohn {money(p.wage)} je Runde · <Merkmale p={p} />
      </p>
    </>
  );
}

function Akte({ m, game, onGame }: { m: StaffMemberView; game: GameState; onGame: (s: GameState) => void }) {
  return (
    <li className={`personal-akte loyal-${m.loyalty}`}>
      <Kopf p={m} />
      <p className="personal-werte">
        Wirkt <strong>{m.loyaltyText}</strong> · seit {m.rounds === 0 ? 'dieser Runde' : m.rounds === 1 ? 'einer Runde' : `${m.rounds} Runden`} im Dienst
        {m.good + m.bad > 0 && (
          <>
            {' '}
            · Akte: {m.good} gut, {m.bad} schlecht
          </>
        )}
        {m.drunk && <span className="hint"> · fällt diese Runde aus</span>}
      </p>
      <p className="personal-knoepfe">
        <Aktion result={m.recognized ? { ok: false, reason: 'Schon in dieser Runde.' } : recognizeStaff(game, balance, m.role)} onDone={(r) => onGame(r.state)}>
          Anerkennung (1 Termin)
        </Aktion>{' '}
        <Aktion
          result={dismissStaff(game, balance, m.role)}
          onDone={(r) => {
            if (window.confirm(`${m.name} entlassen? Das kostet eine Abfindung, und die anderen nehmen es übel.`)) onGame(r.state);
          }}
        >
          Entlassen
        </Aktion>
      </p>
    </li>
  );
}

function Leute({ ctx }: { ctx: SheetContext }) {
  const v = staffView(ctx.game, balance, staffContent)!;
  return (
    <>
      {v.members.length === 0 ? (
        <p className="muted">Noch arbeitet niemand für Jacob – alles liegt auf seinem Tisch.</p>
      ) : (
        <ul className="personal-liste">
          {v.members.map((m) => (
            <Akte key={m.role} m={m} game={ctx.game} onGame={ctx.onGame} />
          ))}
        </ul>
      )}
      {v.payroll > 0 && <p className="muted klein">Löhne zusammen: {money(v.payroll)} je Runde, am Rundenende.</p>}
      {v.candidates.length > 0 && (
        <>
          <h3>Bewerbungen</h3>
          <ul className="personal-liste">
            {v.candidates.map((c, i) => (
              <li key={`${c.role}-${c.index}`} className="personal-akte bewerbung">
                <Kopf p={c} />
                {/* Was die Stelle tut, nur beim ersten Bewerber je Stelle. */}
                {v.candidates.findIndex((x) => x.role === c.role) === i && <p className="muted klein">{localize(staffContent.roles[c.role].text)}</p>}
                <p className="personal-knoepfe">
                  <Aktion result={hireStaff(ctx.game, balance, c.index)} onDone={(r) => ctx.onGame(r.state)}>
                    Einstellen (1 Termin)
                  </Aktion>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {v.vacant.length > 0 && <p className="muted klein">Neue Bewerbungen kommen alle {balance.staff.candidateRefreshRounds} Runden.</p>}
      {v.journal.length > 0 && (
        <>
          <h3>Aus dem Büro</h3>
          <ul className="personal-journal klein">
            {v.journal.map((z, i) => (
              <li key={i}>{z}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Wie viele Briefe im Posteingang das Vorzimmer nach jetzigem Stand übernimmt, wenn ihre Frist abläuft. */
function UebernimmtPost({ game }: { game: GameState }) {
  const n = delegatedMail(game, events).length;
  if (n === 0) return null;
  return <p className="muted klein">Im Posteingang liegen {n === 1 ? 'ein Brief' : `${n} Briefe`}, die das Vorzimmer übernimmt, wenn Jacob sie liegen lässt.</p>;
}

function Richtlinien({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const pol = game.staff!.policies;
  const ohneVorzimmer = !game.staff!.hired.some((m) => m.role === 'secretary');
  const [preis, setPreis] = useState(String(pol.sales.minPrice));
  const [grenze, setGrenze] = useState(String(pol.mailSpendLimit));
  const anwenden = (r: StaffResult) => r.ok && ctx.onGame(r.state);
  return (
    <div className="personal-richtlinien">
      {ohneVorzimmer && <p className="hint">Ohne Kraft im Vorzimmer setzt niemand die Post- und Verkaufsregeln um.</p>}
      {!ohneVorzimmer && <UebernimmtPost game={game} />}
      <h3>Post</h3>
      <p className="muted klein">Läuft die Frist eines Briefs ab, entscheidet das Vorzimmer nach eigenem Urteil – Folgen, die man dem Brief nicht ansieht, kennt es nicht.</p>
      <table className="personal-tabelle">
        <tbody>
          {MAIL_KINDS.map((k: MailKind) => (
            <tr key={k}>
              <th scope="row">{BRIEFART[k]}</th>
              <td>
                <select value={pol.mail[k]} onChange={(e) => anwenden(setMailRule(game, k, e.target.value as (typeof MAIL_RULES)[number]))}>
                  {MAIL_RULES.map((r) => (
                    <option key={r} value={r}>
                      {localize(staffContent.policies.mail[r])}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          anwenden(setMailSpendLimit(game, Number(grenze)));
        }}
      >
        <label>
          Ausgaben bis <input type="number" min={0} step={50} value={grenze} onChange={(e) => setGrenze(e.target.value)} /> $ darf das Vorzimmer selbst
          entscheiden
        </label>{' '}
        <button type="submit">Übernehmen</button>
      </form>

      <h3>Verkauf</h3>
      <label>
        <input type="checkbox" checked={pol.sales.on} onChange={(e) => anwenden(setSalesPolicy(game, { on: e.target.checked }))} /> Das Vorzimmer verkauft am
        Rundenende nach Regel
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          anwenden(setSalesPolicy(game, { minPrice: Number(preis.replace(',', '.')) }));
        }}
      >
        <label>
          Nur ab <input type="text" inputMode="decimal" size={5} value={preis} onChange={(e) => setPreis(e.target.value)} /> $ je Barrel beim Trust
        </label>{' '}
        <button type="submit">Übernehmen</button>
      </form>
      <label>
        Je Runde{' '}
        <select value={String(pol.sales.share)} onChange={(e) => anwenden(setSalesPolicy(game, { share: Number(e.target.value) }))}>
          {[0.25, 0.5, 0.75, 1].map((s) => (
            <option key={s} value={String(s)}>
              {Math.round(s * 100)} % des Tanks
            </option>
          ))}
        </select>
      </label>

      <h3>Löhne</h3>
      <select value={pol.wage} onChange={(e) => anwenden(setWageLevel(game, balance, e.target.value))}>
        {balance.staff.wage.levels.map((l) => (
          <option key={l.id} value={l.id}>
            {localize(staffContent.policies.wage[l.id] ?? { de: l.id, en: l.id })}
          </option>
        ))}
      </select>
      <p className="muted klein">Gute Löhne halten die Leute, Kürzungen kosten sofort Vertrauen.</p>
    </div>
  );
}

function Auftraege({ ctx }: { ctx: SheetContext }) {
  const v = staffView(ctx.game, balance, staffContent)!;
  const [antwort, setAntwort] = useState<string | null>(null);
  return (
    <>
      <p>
        Hitze: <strong>{v.heatLabel}</strong> – {v.heatText}
      </p>
      <ul className="personal-liste">
        {v.orders.map((o) => (
          <li key={o.id} className="personal-akte">
            <h3 className="personal-name">{o.label}</h3>
            <p className="personal-bio">{o.text}</p>
            <p className="personal-knoepfe">
              <Aktion
                result={o.ordered ? { ok: false, reason: 'Läuft schon in dieser Runde.' } : orderFixer(ctx.game, balance, o.id)}
                onDone={(r) => {
                  setAntwort(r.message ?? null);
                  ctx.onGame(r.state);
                }}
              >
                {o.ordered ? 'In Auftrag' : `Beauftragen (${money(o.cost)})`}
              </Aktion>
              {o.chance !== null && <span className="muted klein"> · klappt etwa {o.chance} von 100 Mal</span>}
            </p>
          </li>
        ))}
      </ul>
      {antwort && <p className="hint">{antwort}</p>}
      {v.intel && (
        <p className="personal-bericht">
          <strong>Letzter Bericht{v.intelRound !== null && v.intelRound !== ctx.game.round ? ` (Runde ${v.intelRound})` : ''}:</strong> {v.intel}
        </p>
      )}
    </>
  );
}

export function StaffSheet({ ctx }: { ctx: SheetContext }) {
  const game = ctx.game;
  if (!game.staff) return <p className="muted">Personal gibt es erst ab Kapitel 2.</p>;
  const mitFixer = game.staff.hired.some((m) => m.role === 'fixer');
  const tabs = [
    { id: 'leute', label: 'Leute', badge: game.staff.candidates.length > 0 ? String(game.staff.candidates.length) : undefined },
    { id: 'richtlinien', label: 'Richtlinien' },
    ...(mitFixer ? [{ id: 'auftraege', label: 'Aufträge' }] : []),
  ];
  const tab = activeTab('personal', tabs, ctx.tab);
  return (
    <Tabs sheet="personal" tabs={tabs} active={tab} onChange={ctx.onTab}>
      {tab === 'leute' && <Leute ctx={ctx} />}
      {tab === 'richtlinien' && <Richtlinien ctx={ctx} />}
      {tab === 'auftraege' && <Auftraege ctx={ctx} />}
    </Tabs>
  );
}

/** Gegenstand auf dem Tisch: ein Stapel Personalakten mit Band. */
export function StaffFileShape() {
  return (
    <svg viewBox="0 0 110 80" className="form" aria-hidden="true" focusable="false">
      <rect x="14" y="20" width="84" height="54" rx="2" className="f-papier-dunkel" />
      <path d="M8,14 L36,14 L41,8 L64,8 L69,14 L100,14 L100,70 L8,70 Z" className="f-mappe-gruen" />
      <rect x="12" y="20" width="84" height="46" className="f-papier" />
      <g className="s-tinte">
        <circle cx="30" cy="36" r="7" />
        <path d="M20,54 Q30,44 40,54" />
        <line x1="50" y1="32" x2="88" y2="32" />
        <line x1="50" y1="40" x2="84" y2="40" />
        <line x1="50" y1="48" x2="80" y2="48" />
      </g>
      <rect x="8" y="58" width="92" height="5" className="f-mappe" />
    </svg>
  );
}
