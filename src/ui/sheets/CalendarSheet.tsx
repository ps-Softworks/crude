// Fenster „Termine“ (T) – seit Etappe 1 das Planungsbrett: oben die Termine der
// Runde als Tagesfelder Mo–Fr und zwei rote Nachtfelder (Überstunden kosten Kraft),
// darunter die Kartenhand mit den Reitern Land · Markt · Fracht · Leute. Jede Karte
// zeigt Termine, Geld, ob sie Kraft kostet, und ihr Risiko in Worten; gesperrte
// Karten nennen ihren Grund. Was eine Karte geht und tut, sagt nur planView/bookCard
// aus src/sim/plans.ts – hier wird nichts gerechnet.

import { useState } from 'react';
import { agendaView } from '../../sim/agenda';
import { formatDate } from '../../sim/game';
import { localize } from '../../sim/i18n';
import { bookCard, planView, unbookCard, type PlanCardView, type PlanSlot } from '../../sim/plans';
import { PLAN_TABS } from '../../sim/plansBalance';
import { chapterRound, chapterRounds } from '../../sim/timeskip';
import { balance } from '../balance';
import { events } from '../events';
import { money } from '../format';
import { cardText, levelLabel, planContent } from '../plans';
import { Termine } from '../scene/TopBar';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './plans.css';

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function slotLabel(slot: PlanSlot, game: SheetContext['game']): string {
  if (slot.kind === 'frei') return '';
  if (slot.kind === 'post') return 'Briefe & Besuche';
  const titel = cardText({ id: slot.cardId ?? '', event: events.some((e) => e.id === slot.cardId) ? slot.cardId : undefined }).title;
  const ranch = slot.target ? game.parcels.find((p) => p.id === slot.target)?.name : undefined;
  return ranch ? `${titel} · ${ranch}` : titel;
}

function Kosten({ card }: { card: PlanCardView }) {
  const teile = [card.appointments === 1 ? '1 Termin' : `${card.appointments} Termine`];
  if (card.cash > 0) teile.push(card.id === 'bohrbericht' ? `ab ${money(card.cash)}` : money(card.cash));
  if (card.strength < 0) teile.push('kostet Kraft');
  if (card.strength > 0) teile.push('tut gut');
  teile.push(card.timing === 'sofort' ? 'wirkt sofort' : 'wirkt am Rundenende');
  return <p className="karte-kosten">{teile.join(' · ')}</p>;
}

function Karte({ card, ctx, onFehler }: { card: PlanCardView; ctx: SheetContext; onFehler: (text: string | null) => void }) {
  const text = cardText(card);
  const moeglich = card.targets.filter((t) => t.ok);
  const optionen = card.options.filter((o) => o.ok);
  const [ziel, setZiel] = useState<string>('');
  const gewaehlt =
    card.target === 'ranch'
      ? moeglich.some((t) => t.parcelId === ziel)
        ? ziel
        : (moeglich[0]?.parcelId ?? '')
      : card.target === 'option'
        ? optionen.some((o) => o.id === ziel)
          ? ziel
          : (optionen[0]?.id ?? '')
        : undefined;
  const gesperrt = card.reason !== null;
  function buchen() {
    const r = bookCard(ctx.game, balance, events, card.id, gewaehlt || undefined);
    if (r.ok) {
      onFehler(null);
      ctx.onGame(r.state);
    } else onFehler(r.reason);
  }
  return (
    <article className={`planskarte${gesperrt ? ' gesperrt' : ''}`} aria-disabled={gesperrt}>
      <h4>{text.title}</h4>
      <Kosten card={card} />
      {text.text && <p className="karte-text">{text.text}</p>}
      {text.risk && <p className="karte-risiko">Risiko: {text.risk}</p>}
      {card.detail && <p className="karte-lage">{card.detail}</p>}
      {card.warning && <p className="karte-warnung">{card.warning}</p>}
      {gesperrt ? (
        <p className="karte-grund">{card.reason}</p>
      ) : (
        <div className="karte-buchen">
          {card.target === 'ranch' && (
            <label>
              Ranch{' '}
              <select value={gewaehlt} onChange={(e) => setZiel(e.target.value)}>
                {card.targets.map((t) => (
                  <option key={t.parcelId} value={t.parcelId} disabled={!t.ok} title={t.reason}>
                    {t.label} ({levelLabel(t.level as 0 | 1 | 2 | 3)})
                  </option>
                ))}
              </select>
            </label>
          )}
          {card.target === 'option' && (
            <label>
              <select value={gewaehlt} onChange={(e) => setZiel(e.target.value)} aria-label="Möglichkeit">
                {card.options.map((o) => (
                  <option key={o.id} value={o.id} disabled={!o.ok} title={o.reason}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={buchen} disabled={(card.target === 'ranch' || card.target === 'option') && !gewaehlt}>
            Buchen
          </button>
          {card.target === 'ranch' && gewaehlt && (
            <button type="button" className="link" onClick={() => ctx.showOnMap(gewaehlt)}>
              auf der Karte zeigen
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function CalendarSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const t = agendaView(game, balance);
  const v = planView(game, balance, events);
  const [fehler, setFehler] = useState<string | null>(null);
  const tabs = PLAN_TABS.map((id) => {
    const n = v.cards.filter((c) => c.tab === id && c.reason === null).length;
    return { id, label: localize(planContent.tabs[id]), badge: n > 0 ? String(n) : undefined };
  });
  const tab = activeTab('termine', tabs, ctx.tab);
  const hand = v.cards.filter((c) => c.tab === tab).sort((a, b) => Number(a.reason !== null) - Number(b.reason !== null));
  let tag = 0;
  return (
    <>
      <p className="kalender-kopf">
        <strong>
          {formatDate(game)} · Runde {chapterRound(game)} von {chapterRounds(game)}
        </strong>
        <br />
        <Termine game={game} debug={ctx.debug} lang />
      </p>
      {!game.finished && t.sickRounds > 0 && (
        <p className="krankmeldung">
          Jacob liegt krank im Bett{t.sickRounds > 1 ? ` – noch ${t.sickRounds} Runden` : ' – diese Runde noch'}. Keine Termine: Ereignisse
          und Briefe bekommen ihre Standardantwort.
        </p>
      )}
      <ol className="brett-tage" aria-label="Termine dieser Runde">
        {v.slots.map((s, i) => {
          const name = s.overtime ? 'Nacht' : (TAGE[tag++] ?? '');
          const label = slotLabel(s, game);
          return (
            <li key={i} className={`brett-feld ${s.kind}${s.overtime ? ' nacht' : ''}`} title={s.overtime ? 'Überstunde – kostet Kraft' : undefined}>
              <span className="brett-tag">{name}</span>
              <span className="brett-inhalt">{label || (s.overtime ? 'frei (kostet Kraft)' : 'frei')}</span>
              {s.undo !== undefined && (
                <button
                  type="button"
                  className="link"
                  aria-label={`${label} zurücknehmen`}
                  onClick={() => {
                    const r = unbookCard(game, balance, s.undo!);
                    if (r.ok) ctx.onGame(r.state);
                    else setFehler(r.reason);
                  }}
                >
                  zurücknehmen
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {fehler && (
        <p className="fehler" role="alert">
          {fehler}
        </p>
      )}
      <Tabs sheet="termine" tabs={tabs} active={tab} onChange={ctx.onTab}>
        {tab === 'land' && <GeologenAkte game={game} />}
        {hand.length === 0 ? (
          <p className="muted leer">In diesem Reiter liegt gerade keine Karte.</p>
        ) : (
          <div className="brett-hand">
            {hand.map((c) => (
              <Karte key={c.id} card={c} ctx={ctx} onFehler={setFehler} />
            ))}
          </div>
        )}
      </Tabs>
      <Wochenbericht report={v.report} />
    </>
  );
}

/** Akte des Geologen: Genauigkeit und Lohn sieht man, die Verzerrung nur an der Trefferbilanz. */
function GeologenAkte({ game }: { game: SheetContext['game'] }) {
  const g = game.exploration?.geologist;
  if (!g) return <p className="muted klein">Kein Geologe unter Vertrag – kartieren geht erst mit einem.</p>;
  const { hits, misses } = game.exploration.record;
  return (
    <p className="klein">
      {localize(planContent.geologists[g.id])}: Genauigkeit {g.accuracy} von 5 · Lohn {money(g.wage)} je Runde · Trefferbilanz{' '}
      {hits + misses === 0 ? 'noch keine Bohrung auf seinen Karten' : `${hits} von ${hits + misses} Karten bestätigt`}
    </p>
  );
}

/** Wochenbericht: Ergebnisse vom letzten Rundenende und den Karten dieser Runde. */
export function Wochenbericht({ report }: { report: readonly string[] }) {
  return (
    <section className="wochenbericht" aria-label={localize(planContent.report.title)}>
      <h4>{localize(planContent.report.title)}</h4>
      {report.length === 0 ? (
        <p className="muted">{localize(planContent.report.empty)}</p>
      ) : (
        <ul>
          {report.map((r, i) => (
            <li key={i}>{r.replace(/^[^:]+: /, '')}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
