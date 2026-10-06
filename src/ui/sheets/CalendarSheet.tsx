// Fenster „Termine“ (T) – seit 0.4.20+28 ein Adressbuch: links die Stellen, die Jacob
// aufsuchen kann (Bank, Eisenbahn, Geologen …, Zuordnung in content/plans.yaml
// contacts), rechts nur die Angebote der gewählten Stelle. Ein Angebot zeigt zuerst
// Name, Kosten und Knopf; Text, Risiko und Ziel erst aufgeklappt. Oben steht nur noch,
// wie viele Termine frei sind und was gebucht ist (zurücknehmbar). Was eine Karte geht
// und tut, sagt nur planView/bookCard aus src/sim/plans.ts – hier wird nichts gerechnet.

import { useState } from 'react';
import { agendaView } from '../../sim/agenda';
import { formatDate } from '../../sim/game';
import { localize } from '../../sim/i18n';
import { callerCard, dealsRunning } from '../../sim/deals';
import { financingRunning } from '../../sim/financing';
import { chapterOf } from '../../sim/chapterOf';
import { contactOf } from '../../sim/planContent';
import { bookCard, introduce, planView, unbookCard, type PlanCardView, type PlanSlot } from '../../sim/plans';
import { isCold, isKnown, reconcile, relationOf, relationStage } from '../../sim/network';
import { chapterRound, chapterRounds } from '../../sim/timeskip';
import { balance } from '../balance';
import { events } from '../events';
import { money } from '../format';
import { cardText, levelLabel, planContent } from '../plans';
import { Termine } from '../scene/TopBar';
import { readPref, writePref } from '../storage';
import type { SheetContext } from './types';
import './plans.css';

function slotLabel(slot: PlanSlot, game: SheetContext['game']): string {
  if (slot.kind === 'frei') return '';
  if (slot.kind === 'post') return 'Briefe & Besuche';
  const titel = cardText({ id: slot.cardId ?? '', event: events.some((e) => e.id === slot.cardId) ? slot.cardId : undefined }).title;
  const ranch = slot.target ? game.parcels.find((p) => p.id === slot.target)?.name : undefined;
  return ranch ? `${titel} · ${ranch}` : titel;
}

function kosten(card: PlanCardView): string {
  const teile = [card.appointments === 1 ? '1 Termin' : `${card.appointments} Termine`];
  if (card.cash > 0) teile.push(card.id === 'bohrbericht' ? `ab ${money(card.cash)}` : money(card.cash));
  if (card.strength < 0) teile.push('kostet Kraft');
  if (card.strength > 0) teile.push('tut gut');
  return teile.join(' · ');
}

function Angebot({
  card,
  ctx,
  offen,
  onToggle,
  onFehler,
}: {
  card: PlanCardView;
  ctx: SheetContext;
  offen: boolean;
  onToggle: () => void;
  onFehler: (text: string | null) => void;
}) {
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
  const mitWahl = card.target === 'ranch' || card.target === 'option';
  function buchen() {
    const r = bookCard(ctx.game, balance, events, card.id, gewaehlt || undefined);
    if (r.ok) {
      onFehler(null);
      ctx.onGame(r.state);
    } else onFehler(r.reason);
  }
  const knopf = (
    <button type="button" onClick={buchen} disabled={mitWahl && !gewaehlt}>
      {card.timing === 'sofort' ? 'Hingehen' : 'Vereinbaren'}
    </button>
  );
  return (
    <li className={`angebot${gesperrt ? ' gesperrt' : ''}${offen ? ' offen' : ''}`}>
      <div className="angebot-zeile">
        <button type="button" className="angebot-name" aria-expanded={offen} onClick={onToggle}>
          <span className="pfeil" aria-hidden>
            {offen ? '▾' : '▸'}
          </span>
          {text.title}
        </button>
        <span className="angebot-kosten">{kosten(card)}</span>
        {!gesperrt && !mitWahl && !offen && knopf}
      </div>
      {gesperrt && <p className="angebot-grund">{card.reason}</p>}
      {!gesperrt && card.warning && <p className="karte-warnung">{card.warning}</p>}
      {offen && (
        <div className="angebot-mehr">
          {text.text && <p>{text.text}</p>}
          {text.risk && <p className="karte-risiko">Risiko: {text.risk}</p>}
          {card.detail && <p className="karte-lage">{card.detail}</p>}
          <p className="karte-lage">{card.timing === 'sofort' ? 'Wirkt sofort.' : 'Ergebnis am Rundenende.'}</p>
          {!gesperrt && (
            <div className="karte-buchen">
              {card.target === 'ranch' && (
                <label>
                  Ranch{' '}
                  <select value={gewaehlt} onChange={(e) => setZiel(e.target.value)}>
                    {card.targets.map((t) => (
                      <option key={t.parcelId} value={t.parcelId} disabled={!t.ok} title={t.reason}>
                        {t.label} ({levelLabel(t.level as 0 | 1 | 2 | 3)} · {t.detail})
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
              {knopf}
              {card.target === 'ranch' && gewaehlt && (
                <button type="button" className="link" onClick={() => ctx.showOnMap(gewaehlt)}>
                  auf der Karte zeigen
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!offen && !gesperrt && mitWahl && (
        <button type="button" className="link angebot-waehlen" onClick={onToggle}>
          {card.target === 'ranch' ? 'Ranch wählen …' : 'Bedingungen wählen …'}
        </button>
      )}
    </li>
  );
}

export function CalendarSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const t = agendaView(game, balance);
  const v = planView(game, balance, events);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const stelleVon = new Map(v.cards.map((c) => [c.id, contactOf(planContent, c)]));
  // Nur Stellen, bei denen gerade überhaupt etwas liegt (ab Kapitel 2 fallen Markt und Fracht weg).
  const stellen = planContent.contacts
    .filter((k) => isKnown(game, k.id) && v.cards.some((c) => stelleVon.get(c.id) === k.id))
    .map((k) => ({ ...k, frei: v.cards.filter((c) => stelleVon.get(c.id) === k.id && c.reason === null).length }));
  // Verlangt (ctx.tab), sonst zuletzt gewählt, sonst die erste Stelle, bei der etwas geht.
  const gibt = (id: string | null | undefined): id is string => !!id && stellen.some((k) => k.id === id);
  const gemerkt = readPref('crude.reiter.termine');
  // 0.4.20+34: Klingelt das Telefon, ist die Stelle des Anrufers zuerst offen.
  const anruf = callerCard(game);
  const anrufStelle = anruf ? (stelleVon.get(anruf) ?? null) : null;
  const [abgenommen, setAbgenommen] = useState(false);
  const aktiv = gibt(ctx.tab)
    ? ctx.tab
    : anrufStelle && !abgenommen && gibt(anrufStelle)
      ? anrufStelle
      : gibt(gemerkt)
        ? gemerkt
        : ((stellen.find((k) => k.frei > 0) ?? stellen[0])?.id ?? null);
  const telefon = chapterOf(game) >= 2;
  const stelle = stellen.find((k) => k.id === aktiv);
  const hand = v.cards
    .filter((c) => stelleVon.get(c.id) === aktiv)
    .sort((a, b) => Number(a.reason !== null) - Number(b.reason !== null));
  const laufend = [...dealsRunning(game, balance), ...financingRunning(game)];
  const gebucht = v.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'frei');
  const stellenName = (id: string) => localize(planContent.contacts.find((k) => k.id === id)?.name ?? planContent.title);
  // Neu kennengelernt: in dieser oder der letzten Runde.
  const neuSeit = (id: string) => {
    const k = game.network?.known[id];
    return !!k && k.since > 1 && game.round - k.since <= 1;
  };
  function waehle(id: string) {
    setAbgenommen(true);
    writePref('crude.reiter.termine', id);
    ctx.onTab(id);
    setOffen(null);
  }
  return (
    <>
      <div className="adress-kopf">
        <strong>
          {formatDate(game)} · Runde {chapterRound(game)} von {chapterRounds(game)}
        </strong>
        <Termine game={game} debug={ctx.debug} />
      </div>
      {gebucht.length > 0 && (
        <ul className="gebucht" aria-label="Diese Woche gebucht">
          {gebucht.map(({ s, i }) => {
            const label = slotLabel(s, game);
            return (
              <li key={i} className={`gebucht-eintrag ${s.kind}${s.overtime ? ' nacht' : ''}`}>
                {s.overtime && <span title="Überstunde – kostet Kraft">Nacht: </span>}
                {label}
                {s.undo !== undefined && (
                  <button
                    type="button"
                    className="link"
                    aria-label={`${label} zurücknehmen`}
                    title="zurücknehmen"
                    onClick={() => {
                      const r = unbookCard(game, balance, s.undo!);
                      if (r.ok) ctx.onGame(r.state);
                      else setFehler(r.reason);
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {anrufStelle && (
        <p className="anruf" role="status">
          ☎ Es klingelt: {localize(planContent.contacts.find((k) => k.id === anrufStelle)!.name)} – das Angebot gilt nur diese Runde.
        </p>
      )}
      {laufend.length > 0 && (
        <p className="laufend">
          <strong>Läuft:</strong> {laufend.join(' · ')}
        </p>
      )}
      {!game.finished && t.sickRounds > 0 && (
        <p className="krankmeldung">
          Jacob liegt krank im Bett{t.sickRounds > 1 ? ` – noch ${t.sickRounds} Runden` : ' – diese Runde noch'}. Keine Termine: Ereignisse
          und Briefe bekommen ihre Standardantwort.
        </p>
      )}
      {fehler && (
        <p className="fehler" role="alert">
          {fehler}
        </p>
      )}
      {/* Ergebnisse der Sofort-Karten gleich sehen (0.4.19+3); der volle Wochenbericht steht im Rundenbericht. */}
      {v.report.length > 0 && <Wochenbericht report={v.report} />}
      {(game.network?.referrals ?? []).length > 0 && !game.finished && (
        <ul className="empfehlungen" aria-label="Empfehlungen">
          {game.network!.referrals.map((r) => (
            <li key={r.to}>
              <span>
                <strong>{stellenName(r.from)}</strong> empfiehlt dir: <strong>{stellenName(r.to)}</strong>
                <span className="muted"> – {localize(planContent.contacts.find((k) => k.id === r.to)?.who ?? planContent.title)}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const x = introduce(game, balance, r.to);
                  if (!x.ok) setFehler(x.reason);
                  else {
                    ctx.onGame(x.state);
                    waehle(r.to);
                  }
                }}
              >
                Vorstellen lassen ({balance.network.relation.introAppointments} Termin)
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="adressbuch">
        <nav className="stellen" aria-label={telefon ? 'Fräulein, verbinden Sie mich mit …' : 'Wen aufsuchen?'}>
          {telefon && <p className="stellen-kopf">Fräulein, verbinden Sie mich mit …</p>}
          {stellen.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`stelle-knopf${k.id === aktiv ? ' aktiv' : ''}${k.frei === 0 ? ' leer' : ''}`}
              aria-current={k.id === aktiv ? 'true' : undefined}
              onClick={() => waehle(k.id)}
            >
              <span className="stelle-name">
                {k.id === anrufStelle && <span aria-label="ruft an">☎ </span>}
                {localize(k.name)}
                {neuSeit(k.id) && <span className="stelle-neu"> neu</span>}
              </span>
              <Beziehung game={game} id={k.id} />
              {k.frei > 0 && <span className="stelle-zahl">{k.frei}</span>}
            </button>
          ))}
        </nav>
        <section className="stelle-seite" aria-label={stelle ? localize(stelle.name) : undefined}>
          {stelle ? (
            <>
              <h3>{localize(stelle.name)}</h3>
              <p className="stelle-wer">{localize(stelle.who)}</p>
              <BeziehungZeile game={game} id={stelle.id} onGame={ctx.onGame} onFehler={setFehler} />
              {stelle.id === 'geologen' && <GeologenAkte game={game} />}
              <ul className="angebote">
                {hand.map((c) => (
                  <Angebot
                    key={c.id}
                    card={c}
                    ctx={ctx}
                    offen={offen === c.id}
                    onToggle={() => setOffen(offen === c.id ? null : c.id)}
                    onFehler={setFehler}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="muted leer">Gerade gibt es niemanden aufzusuchen.</p>
          )}
        </section>
      </div>
    </>
  );
}

/** 0.4.20+42: Beziehung zur Stelle als kleiner Balken (5 Stufen). Ohne Netzwerk (alter Stand) nichts. */
function Beziehung({ game, id }: { game: SheetContext['game']; id: string }) {
  if (!game.network?.known[id]) return null;
  const rel = relationOf(game, id);
  const stufe = relationStage(balance, rel);
  return (
    <span className={`beziehung b-${stufe}`} title={`Beziehung: ${stufe}`} aria-label={`Beziehung ${stufe}`}>
      <span style={{ width: `${rel}%` }} />
    </span>
  );
}

/** Beziehung in Worten, was sie bringt – und Versöhnen, wenn die Stelle verärgert ist. */
function BeziehungZeile({ game, id, onGame, onFehler }: { game: SheetContext['game']; id: string; onGame: SheetContext['onGame']; onFehler: (t: string) => void }) {
  if (!game.network?.known[id]) return null;
  const rel = relationOf(game, id);
  const r = balance.network.relation;
  const stufe = relationStage(balance, rel);
  const empfiehlt = rel >= r.referralAt;
  return (
    <p className="beziehung-zeile klein">
      Beziehung: <strong>{stufe}</strong>
      {!isCold(game, balance, id) && (
        <span className="muted">
          {' '}
          · jedes Geschäft hier pflegt sie{empfiehlt ? ' · empfiehlt dich weiter' : ''}
        </span>
      )}
      {isCold(game, balance, id) && !game.finished && (
        <>
          {' '}
          – hier macht man keine Geschäfte mehr mit dir.{' '}
          <button
            type="button"
            onClick={() => {
              const x = reconcile(game, balance, id);
              if (x.ok) onGame(x.state);
              else onFehler(x.reason);
            }}
          >
            Versöhnen ({money(r.reconcileCash)})
          </button>
        </>
      )}
    </p>
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
