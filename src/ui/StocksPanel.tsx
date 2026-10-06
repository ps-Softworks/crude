// 4.8 Aktien, Aufsichtsrat, Anleihen (ab Kapitel 2): drei Reiter im Kassenbuch.
// Alle Regeln stehen in src/sim/stocks.ts – hier wird nur angezeigt und geklickt.
// Jeder Knopf zeigt vorher, was passiert (Probelauf der Simulation).

import { useState } from 'react';
import { chapterContent } from './chapter';
import { fillText, ipoConsequenceText } from '../sim/chapter';
import type { GameState } from '../sim/game';
import {
  acceptDemand,
  boardMajority,
  bondCoupons,
  bondDebt,
  bondOffer,
  buyBack,
  thorneBlocks,
  buybackCost,
  control,
  courtMember,
  dividendCost,
  investigate,
  issueBond,
  canIssueBonds,
  FAMILY_BOND_REASON,
  issueProceeds,
  issueShares,
  lateIpo,
  lateIpoBlocker,
  lateIpoProceeds,
  loyalSeats,
  marketCap,
  maxIssue,
  memberMood,
  ownStake,
  payDividend,
  pressCampaign,
  rejectDemand,
  revealed,
  stocksWorldOf,
  totalShares,
  type StocksResult,
  type StocksState,
} from '../sim/stocks';
import { demandHints, demandText, memberLabel, strawName } from '../sim/stocksContent';
import { localize } from '../sim/i18n';
import { balance } from './balance';
import { money, percent } from './format';
import { stocksContent } from './stocks';

type Props = { game: GameState; onChange: (s: GameState) => void; debug?: boolean };

function Aktion({ result, onDone, children }: { result: StocksResult; onDone: (s: GameState) => void; children: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? undefined : result.reason} onClick={() => result.ok && onDone(result.state)}>
      {children}
    </button>
  );
}

function stueck(n: number): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? 'Aktie' : 'Aktien'}`;
}

function Abgesetzt({ s }: { s: StocksState }) {
  return s.ousted > 0 ? <p className="state pleite">Seit Runde {s.ousted} führt der Aufsichtsrat Harlan Oil ohne Jacob.</p> : null;
}

/** Familienfirma im Aktienbuch: später Börsengang (Regel: lateIpo in sim/stocks.ts). Die Folgen der Wahl stehen unter Maus/Fokus. */
function LateIpo({ game, onChange }: { game: GameState; onChange: (s: GameState) => void }) {
  const [blick, setBlick] = useState<number | null>(null);
  const ipo = chapterContent.ipo;
  const prozent = (x: number) => `${Math.round(x * 100)} %`;
  return (
    <div className="ipo">
      <p className="muted">Harlan Oil ist eine Familienfirma: Es gibt keine Aktien. Geld bringen Bank und – nach einem Börsengang – Anleihen.</p>
      <h3>{fillText(ipo.lateTitle, {})}</h3>
      <p className={blick === null ? 'ipo-text' : 'ipo-text klein'} aria-live="polite">
        {blick === null ? fillText(ipo.lateText, {}) : ipoConsequenceText(game, balance, ipo, blick, undefined, true)}
      </p>
      <div className="knoepfe">
        {balance.chapter.ipo.shares.map((share) => {
          const probe = lateIpo(game, balance, stocksContent.board, share);
          return (
            <button
              key={share}
              type="button"
              disabled={!probe.ok}
              title={probe.ok ? undefined : probe.reason}
              onClick={() => probe.ok && onChange(probe.state)}
              onMouseEnter={() => setBlick(share)}
              onFocus={() => setBlick(share)}
            >
              {fillText(ipo.sell, { anteil: prozent(share), preis: money(lateIpoProceeds(game, balance, share)) })}
            </button>
          );
        })}
      </div>
      {lateIpoBlocker(game, balance, balance.chapter.ipo.shares[0]) !== null && <p className="hint">{lateIpoBlocker(game, balance, balance.chapter.ipo.shares[0])}</p>}
    </div>
  );
}

/** Reiter „Aktienbuch“: Kurs, wer welche Aktien hält, Ausgabe, Rückkauf, Dividende, Detektei. */
export function SharesPanel({ game, onChange, debug = false }: Props) {
  const s = game.stocks;
  if (!s) return null;
  if (!s.public) return <LateIpo game={game} onChange={onChange} />;
  const total = totalShares(s);
  const vorher = s.priceHistory.at(-2);
  const pfeil = vorher === undefined || vorher === s.price ? '' : s.price > vorher ? ' ↑' : ' ↓';
  const kontrolle = control(s, balance);
  const D = balance.stocks.dividend;
  const ohneDividende = game.round - s.dividendRound;

  // Strohmänner nach Namen zusammengefasst.
  const bloecke = new Map<string, { shares: number; enttarnt: boolean }>();
  for (const b of s.blocks) {
    const name = strawName(stocksContent, b);
    const alt = bloecke.get(name) ?? { shares: 0, enttarnt: true };
    bloecke.set(name, { shares: alt.shares + b.shares, enttarnt: alt.enttarnt && revealed(s, b.since) });
  }

  const ausgabe = [Math.round(total * 0.05), Math.round(total * 0.1), maxIssue(s, balance)].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
  const rueckkauf = [Math.round(total * 0.02), Math.round(total * 0.05)].filter((n, i, a) => n > 0 && a.indexOf(n) === i);

  return (
    <div className="aktien-panel">
      <Abgesetzt s={s} />
      <dl className="terms">
        <dt>Kurs</dt>
        <dd>
          {money(s.price)} je Aktie{pfeil} · Börsenwert {money(marketCap(s))}
        </dd>
        <dt>Jacobs Anteil</dt>
        <dd>{percent(ownStake(s))}</dd>
        <dt>Kontrolle</dt>
        <dd>
          {percent(kontrolle)} {kontrolle < 0.5 ? <strong>– unter 50 %: Der Aufsichtsrat kann Jacob absetzen.</strong> : '(eigene Aktien + loyale Räte)'}
        </dd>
      </dl>

      <h3>Aktienbuch</h3>
      <ul className="loans">
        <li>
          Jacob Harlan: {stueck(s.jacob)} ({percent(s.jacob / total)})
        </li>
        <li>
          Kleinaktionäre: {stueck(s.float)} ({percent(s.float / total)})
        </li>
        {[...bloecke].map(([name, b]) => (
          <li key={name}>
            {name}: {stueck(b.shares)} ({percent(b.shares / total)})
            {b.enttarnt ? <strong> – Strohmann von Augustus Thorne</strong> : debug && <span className="muted"> (Debug: Thorne)</span>}
          </li>
        ))}
      </ul>
      <Aktion result={investigate(game, balance)} onDone={onChange}>
        {`Detektei auf das Aktienbuch ansetzen (${money(balance.stocks.thorne.investigateCost)})`}
      </Aktion>

      <h3>Neue Aktien ausgeben</h3>
      <p className="klein">Bringt Geld, verwässert aber Jacobs Anteil. Braucht die Mehrheit im Aufsichtsrat.</p>
      <div className="actions zeile">
        {ausgabe.map((n) => (
          <Aktion key={n} result={issueShares(game, balance, n)} onDone={onChange}>
            {`${stueck(n)} (+${money(issueProceeds(s, balance, n))}, Jacob dann ${percent(s.jacob / (total + n))})`}
          </Aktion>
        ))}
      </div>

      <h3>Aktien zurückkaufen</h3>
      <p className="klein">Von den Kleinaktionären, mit Aufschlag. Hebt Jacobs Anteil und stützt den Kurs. Strohmänner verkaufen nicht.</p>
      {thorneBlocks(s, balance) && <p className="hint">Ein Block von Aktionären stimmt in der Hauptversammlung gegen jeden Rückkauf (Sperrminorität).</p>}
      <div className="actions zeile">
        {rueckkauf.map((n) => (
          <Aktion key={n} result={buyBack(game, balance, n)} onDone={onChange}>
            {`${stueck(n)} (${money(buybackCost(s, balance, n))})`}
          </Aktion>
        ))}
      </div>

      <h3>Dividende</h3>
      <p className="klein">
        {s.dividendsTotal > 0 ? `Letzte Dividende in Runde ${s.dividendRound}.` : 'Noch keine Dividende gezahlt.'}{' '}
        {ohneDividende >= D.graceRounds ? 'Die Anleger werden ungeduldig – der Kurs leidet.' : 'Jacobs eigener Anteil bleibt in der Familie.'}
      </p>
      <div className="actions zeile">
        {D.rates.map((rate, i) => {
          const d = dividendCost(game, balance, i);
          return (
            <Aktion key={rate} result={payDividend(game, balance, i)} onDone={onChange}>
              {`${i === 0 ? 'Kleine' : 'Große'} Dividende: ${money(d?.amount ?? 0)} (aus der Kasse ${money(d?.cost ?? 0)})`}
            </Aktion>
          );
        })}
      </div>
    </div>
  );
}

/** Reiter „Aufsichtsrat“: Räte mit Agenda, Forderung, Stellvertreterkampf. */
export function BoardPanel({ game, onChange, debug = false }: Props) {
  const s = game.stocks;
  if (!s) return null;
  if (!s.public) return <p className="muted">Eine Familienfirma hat keinen Aufsichtsrat.</p>;
  const loyal = loyalSeats(s, balance);
  const forderer = s.demand ? s.board.find((m) => m.id === s.demand!.member) : undefined;
  const hinweise = demandHints(stocksContent, balance, forderer?.agenda === 'spy');
  return (
    <div className="rat-panel">
      <Abgesetzt s={s} />
      <p className={boardMajority(s, balance) ? 'state' : 'state pleite'}>
        {loyal} von {s.board.length} Räten auf Jacobs Seite – {boardMajority(s, balance) ? 'Jacob hat die Mehrheit.' : 'Jacob fehlt die Mehrheit.'}
      </p>

      {s.proxy && (
        <div className="hint">
          <strong>Stellvertreterkampf bis Runde {s.proxy.until}.</strong> Jacob braucht wieder 50 % Kontrolle (jetzt {percent(control(s, balance))}): Aktien
          zurückkaufen, Räte umstimmen, Kleinaktionäre über die Presse gewinnen.
          <div className="actions zeile">
            <Aktion result={pressCampaign(game, balance)} onDone={onChange}>
              {`Anzeigen in allen Zeitungen (${money(balance.stocks.vote.pressCost)})`}
            </Aktion>
          </div>
        </div>
      )}

      {s.demand && forderer && (
        <div className="hint">
          <p>{demandText(stocksContent, s.demand, memberLabel(stocksContent, forderer, revealed(s, forderer.since)).name)}</p>
          {s.demand.accepted ? (
            <div className="actions zeile">
              <span className="klein">Jacob hat zugesagt. {hinweise.accept} {hinweise.withdraw}</span>
              <Aktion result={rejectDemand(game, balance)} onDone={onChange}>
                Zusage zurückziehen (Wortbruch)
              </Aktion>
            </div>
          ) : (
            <div className="actions zeile">
              <Aktion result={acceptDemand(game)} onDone={onChange}>
                Zusagen
              </Aktion>
              <Aktion result={rejectDemand(game, balance)} onDone={onChange}>
                Ablehnen
              </Aktion>
              <span className="klein">
                {hinweise.accept} {hinweise.reject}
              </span>
            </div>
          )}
        </div>
      )}

      <ul className="loans">
        {s.board.map((m) => {
          const l = memberLabel(stocksContent, m, revealed(s, m.since));
          return (
            <li key={m.id}>
              <strong>{l.name}</strong>, {l.role} · {l.agenda} · {localize(stocksContent.moods[memberMood(m, balance)])}
              {debug && <span className="muted"> · Treue {m.loyalty}</span>}
            </li>
          );
        })}
      </ul>
      <CourtForm game={game} onChange={onChange} hint={hinweise.court} />
    </div>
  );
}

/** Ein Knopf „zum Essen ausführen“ mit Auswahl des Rats (die Regel: höchstens einmal je Runde, nie Thornes Leute). */
function CourtForm({ game, onChange, hint }: Props & { hint: string }) {
  const s = game.stocks;
  const kandidaten = s ? s.board.filter((m) => m.agenda !== 'spy') : [];
  const [wahl, setWahl] = useState('');
  if (!s || kandidaten.length === 0) return null;
  const id = kandidaten.some((m) => m.id === wahl) ? wahl : kandidaten[0].id;
  return (
    <div className="regler-zeile">
      <label>
        <strong>Rat umstimmen</strong>{' '}
        <select value={id} onChange={(e) => setWahl(e.target.value)}>
          {kandidaten.map((m) => (
            <option key={m.id} value={m.id}>
              {memberLabel(stocksContent, m, revealed(s, m.since)).name}
            </option>
          ))}
        </select>
      </label>{' '}
      <Aktion result={courtMember(game, balance, id)} onDone={onChange}>
        {`zum Essen ausführen (${money(balance.stocks.board.courtCost)})`}
      </Aktion>
      <p className="klein">{hint}</p>
    </div>
  );
}

/** Reiter „Anleihen“: laufende Anleihen und neue ausgeben. */
export function BondsPanel({ game, onChange }: Props) {
  const B = balance.stocks.bonds;
  const [summe, setSumme] = useState(B.sizes[0]);
  const [laufzeit, setLaufzeit] = useState(B.terms[0]);
  const s = game.stocks;
  if (!s) return null;
  const angebot = bondOffer(game, balance, summe, stocksWorldOf(game));
  const zins = angebot.rate;
  const probe = issueBond(game, balance, summe, laufzeit);
  return (
    <div className="anleihen-panel">
      <p className="klein">
        Große Summen zu festem Zins. Der Zins läuft jede Runde weiter – auch in der Krise –, und am Ende ist die ganze Summe auf einmal fällig.
      </p>
      <dl className="terms">
        <dt>Zins heute</dt>
        <dd>{zins === null ? 'Mit Rating D zeichnet niemand.' : `${percent(zins)} pro Jahr für ${money(summe)} (Rating ${game.rating}, Kreditklima, laufende Anleihen)`}</dd>
        <dt>Rahmen</dt>
        <dd>{`${money(bondDebt(s))} von höchstens ${money(angebot.limit)} · eine neue Anleihe je Runde`}</dd>
        <dt>Zins je Quartal</dt>
        <dd>{money(bondCoupons(s))}</dd>
      </dl>
      {s.bonds.length === 0 ? (
        <p className="muted">Keine Anleihen.</p>
      ) : (
        <ul className="loans">
          {s.bonds.map((b) => (
            <li key={b.id}>
              Nr. {b.id} · {money(b.principal)} · {percent(b.rate)} pro Jahr · {money((b.principal * b.rate) / 4)} je Quartal · fällig am Ende von Runde {b.maturity}
            </li>
          ))}
        </ul>
      )}
      {!canIssueBonds(game) ? (
        <p className="hint">{FAMILY_BOND_REASON} Oder die Firma geht an die Börse (Reiter Aktienbuch).</p>
      ) : (
      <div className="regler-zeile">
        <strong>Neue Anleihe</strong>
        <label>
          Summe{' '}
          <select value={summe} onChange={(e) => setSumme(Number(e.target.value))}>
            {B.sizes.map((x) => (
              <option key={x} value={x}>
                {money(x)}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Laufzeit{' '}
          <select value={laufzeit} onChange={(e) => setLaufzeit(Number(e.target.value))}>
            {B.terms.map((x) => (
              <option key={x} value={x}>
                {x} Runden
              </option>
            ))}
          </select>
        </label>{' '}
        <Aktion result={probe} onDone={onChange}>
          {`Ausgeben (+${money(Math.round(summe * (1 - B.fee)))})`}
        </Aktion>
        {!probe.ok && <p className="hint">{probe.reason}</p>}
      </div>
      )}
    </div>
  );
}
