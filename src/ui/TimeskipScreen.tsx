// Zeitsprung (4.5, GDD §2/§13) im Schreibtisch-Stil: Jacobs Brief an den Verwalter
// (Direktiven), Weichen-Telegramme mitten im Sprung und die Chronik „Die Jahre
// dazwischen“ als Zeitungsseite je Jahr. Regeln in src/sim/timeskip.ts, Texte in
// content/timeskip.yaml – hier wird nur angezeigt und geklickt.

import { useEffect, useRef, useState } from 'react';
import { bondWord } from '../sim/family';
import { formatDate, type GameState } from '../sim/game';
import {
  FAMILY_TIMES,
  fillTimeskipText,
  STANCES,
  SWITCH_CHOICES,
  switchChoice,
  weakStart,
  type ChronicleEntry,
  type Directives,
  type FamilyTime,
  type Stance,
  type SwitchFunds,
  type SwitchId,
  type TimeskipRecord,
  chapterGoalDate,
} from '../sim/timeskip';
import { managerReport } from '../sim/managerReport';
import { regionById } from '../sim/worldMap';
import { balance } from './balance';
import { familyContent } from './family';
import { money, NBSP } from './format';
import { politicsContent } from './politics';
import { Silhouette } from './Silhouette';
import { timeskipContent as T } from './timeskip';

/** Jahr der Föderation zu einem Spieljahr (Jahr 1 = start.year). */
function foederation(year: number): number {
  return balance.start.year + year - 1;
}

function preis(p: number): string {
  return `${p.toFixed(2).replace('.', ',')}${NBSP}$`;
}

/** Eine Zeile der Chronik als Text: Namen, Beträge und Wörter aus den Inhalten. */
export function chronicleLine(e: ChronicleEntry): string {
  const gesetz = e.law ? balance.laws.find((l) => l.id === e.law) : undefined;
  const text = (e.n === 1 ? T.chronicle.one[e.kind] : undefined) ?? T.chronicle.entries[e.kind];
  // Ein erschlossener Bezirk steht mit seiner Kennung in der Chronik – der Name kommt aus der Karte.
  const bezirk = e.kind === 'region_opened' && e.name ? regionById(balance.world, e.name) : undefined;
  return fillTimeskipText(text, {
    n: String(e.n ?? ''),
    betrag: e.amount !== undefined ? money(e.amount) : '',
    name: bezirk ? fillTimeskipText(bezirk.name, {}) : (e.name ?? ''),
    partei: e.party ? fillTimeskipText(politicsContent.parties[e.party].name, {}) : '',
    gesetz: gesetz ? fillTimeskipText(gesetz.name, {}) : (e.law ?? ''),
    preis: e.price !== undefined ? preis(e.price) : '',
    wort: e.word ? fillTimeskipText(familyContent.words[e.word], {}) : '',
  });
}

/** Fokus auf die Überschrift, sobald das Blatt erscheint (wie beim Kapitelende). */
function useTitelFokus(key: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.sprung-titel')?.focus({ preventScroll: true });
  }, [key]);
  return ref;
}

/** Jacobs Brief an den Verwalter: Haltung und Familie. */
export function DirectivesLetter({ game, onSend, onBack }: { game: GameState; onSend: (d: Directives) => void; onBack: () => void }) {
  const [stance, setStance] = useState<Stance>('balanced');
  const [family, setFamily] = useState<FamilyTime>('some');
  const ref = useTitelFokus('brief');
  const d = T.directives;
  return (
    <section ref={ref} className="gameover bogen sprung sprung-brief" aria-labelledby="sprung-brief-titel">
      <div className="bogen-inhalt">
        <div className="ergebnis-kopf">
          <Silhouette id="jacob" name="Jacob Harlan" size={44} />
          <div>
            <h2 id="sprung-brief-titel" className="sprung-titel" tabIndex={-1}>
              {fillTimeskipText(d.title, {})}
            </h2>
            <p className="bogen-text brief-anrede">{fillTimeskipText(d.text, { jahr: String(foederation(Math.floor((game.round - 1) / 4) + 1)) })}</p>
          </div>
        </div>
        <div className="bogen-spalten">
          <fieldset className="direktive">
            <legend>{fillTimeskipText(d.stance.label, {})}</legend>
            {STANCES.map((s) => (
              <label key={s} className={stance === s ? 'gewaehlt' : ''}>
                <input type="radio" name="haltung" value={s} checked={stance === s} onChange={() => setStance(s)} />
                <strong>{fillTimeskipText(d.stance[s].label, {})}</strong>
                <span>{fillTimeskipText(d.stance[s].text, {})}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="direktive">
            <legend>{fillTimeskipText(d.family.label, {})}</legend>
            {FAMILY_TIMES.map((f) => (
              <label key={f} className={family === f ? 'gewaehlt' : ''}>
                <input type="radio" name="familie" value={f} checked={family === f} onChange={() => setFamily(f)} />
                <strong>{fillTimeskipText(d.family[f].label, {})}</strong>
                <span>{fillTimeskipText(d.family[f].text, {})}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <p className="brief-gruss">– J. Harlan</p>
      </div>
      <div className="bogen-fuss">
        <button type="button" className="link" onClick={onBack}>
          {fillTimeskipText(d.back, {})}
        </button>
        <button type="button" className="primary" onClick={() => onSend({ stance, family })}>
          {fillTimeskipText(d.send, {})}
        </button>
      </div>
    </section>
  );
}

/** Ein Weichen-Telegramm mitten im Sprung. */
export function SwitchTelegram({ id, year, funds, onAnswer }: { id: SwitchId; year: number; funds: SwitchFunds; onAnswer: (choice: string) => void }) {
  const ref = useTitelFokus(id);
  const s = T.switches[id];
  return (
    <section ref={ref} className="telegramm" aria-labelledby="telegramm-titel" role="dialog">
      <p className="telegramm-kopf">
        {fillTimeskipText(T.switches.telegram, {})} · {fillTimeskipText(T.chronicle.year, { jahr: String(foederation(year)) })}
      </p>
      <h2 id="telegramm-titel" className="sprung-titel" tabIndex={-1}>
        {fillTimeskipText(s.title, {})}
      </h2>
      <p className="telegramm-text">{fillTimeskipText(s.text, {})}</p>
      {/* Kasse und Schulden im Blick (4.5): Was kostet, ist gegen das Geld zu sehen; reicht es nicht, ist die Antwort gesperrt. */}
      <p className="telegramm-kasse muted">
        {fillTimeskipText(T.switches.funds, { kasse: money(funds.cash), schulden: money(funds.debt), rahmen: money(funds.credit) })}
      </p>
      <div className="knoepfe">
        {SWITCH_CHOICES[id].map((c) => {
          const w = switchChoice(funds, balance, id, c);
          const zusatz = w.blocked ? fillTimeskipText(T.switches.blocked, {}) : w.onCredit ? fillTimeskipText(T.switches.onCredit, {}) : null;
          return (
            <button key={c} type="button" onClick={() => onAnswer(c)} disabled={w.blocked !== null} title={w.blocked ?? undefined}>
              {fillTimeskipText(s.choices[c], { betrag: w.cost > 0 ? money(w.cost) : '' })}
              {zusatz && <span className="knopf-zusatz"> – {zusatz}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Die Chronik „Die Jahre dazwischen“: eine Zeitungsspalte je Jahr, unten die Bilanz. */
export function ChronicleScreen({ game, record, onContinue }: { game: GameState; record: TimeskipRecord; onContinue: () => void }) {
  // 0.4.20+2: zwei Seiten – erst die Jahre, dann Bilanz, Bericht des Verwalters und Kapitelziel (passte nicht auf eine).
  const [seite, setSeite] = useState<1 | 2>(1);
  const ref = useTitelFokus(`${record.number}:${seite}`);
  const c = T.chronicle;
  const jahre: number[] = [];
  for (let y = record.fromYear; y <= record.toYear; y++) jahre.push(y);
  const { before: v, after: n } = record;
  const zeile = (label: string, a: string, b: string) => (
    <>
      <dt>{label}</dt>
      <dd>
        {a} → <strong>{b}</strong>
      </dd>
    </>
  );
  const wort = (x: number) => fillTimeskipText(familyContent.words[bondWord(x, balance)], {});
  // Nach Zeitsprung I beginnt Kapitel 2, nach Zeitsprung II Kapitel 3 (4.19).
  const kapitel = record.number >= 2 ? T.chapter3 : T.chapter2;
  const bericht = managerReport(game, record, balance);
  const bbl = (x: number) => Math.round(x).toLocaleString('de-DE');
  const titel = (
    <>
      <p className="zeitung-kopf">{fillTimeskipText(c.paper, {})}</p>
      <h2 id="chronik-titel" className="sprung-titel chronik-titel" tabIndex={-1}>
        {fillTimeskipText(c.title, {})} · {foederation(record.fromYear)}–{foederation(record.toYear)}
      </h2>
    </>
  );
  if (seite === 1) {
    return (
      <section ref={ref} className="gameover bogen sprung chronik" aria-labelledby="chronik-titel">
        <div className="bogen-inhalt">
          {titel}
          <div className="chronik-jahre">
            {jahre.map((y) => {
              const zeilen = record.entries.filter((e) => e.year === y);
              return (
                <article key={y} className="chronik-jahr">
                  <h3>{fillTimeskipText(c.year, { jahr: String(foederation(y)) })}</h3>
                  {zeilen.length === 0 ? (
                    <p className="muted">{fillTimeskipText(c.quiet, {})}</p>
                  ) : (
                    <ul>
                      {zeilen.map((e, i) => (
                        <li key={i} className={`chronik-${e.kind.split('_')[0]}`}>
                          {chronicleLine(e)}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </div>
        <div className="bogen-fuss">
          <span className="muted klein">{fillTimeskipText(T.report.page, { seite: '1' })}</span>
          <button type="button" className="primary" onClick={() => setSeite(2)}>
            {fillTimeskipText(bericht ? T.report.next : T.report.nextBalance, {})}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section ref={ref} className="gameover bogen sprung chronik" aria-labelledby="chronik-titel">
      <div className="bogen-inhalt">
        {titel}
        <h3>{fillTimeskipText(c.balance, {})}</h3>
        <dl className="terms zweispaltig">
          {zeile('Imperiumswert', money(v.value), money(n.value))}
          {zeile('Kasse', money(v.cash), money(n.cash))}
          {zeile('Schulden', money(v.debt), money(n.debt))}
          {zeile('Fördernde Quellen', String(v.wells), String(n.wells))}
          {v.flow !== undefined && n.flow !== undefined && zeile(fillTimeskipText(T.report.flowLabel, {}), `${bbl(v.flow)} bbl`, `${bbl(n.flow)} bbl`)}
          {zeile('Ruth', wort(v.ruth), wort(n.ruth))}
          {zeile('Kinder', String(v.children), String(n.children))}
          {/* 0.4.19+3: Schwächung nach verfehltem Kapitelziel – sonst verschwand Geld ohne Grund. */}
          {record.penalty && (
            <>
              <dt>{fillTimeskipText(c.penaltyLabel, {})}</dt>
              <dd>
                {fillTimeskipText(c.penalty, { betrag: money(record.penalty.cash), kraft: String(record.penalty.strength), voll: String(record.penalty.strengthMax) })}
              </dd>
            </>
          )}
        </dl>
        {/* 0.4.20+2: Bericht des Verwalters – warum die Förderung so ist und was das Geld jetzt kauft. */}
        {bericht && (
          <div className="sprung-bericht">
            <h3>{fillTimeskipText(T.report.title, {})}</h3>
            <p className="bogen-text">{fillTimeskipText(bericht.fell ? T.report.flowFell : T.report.flowHeld, { vorher: bbl(bericht.flowBefore), nachher: bbl(bericht.flowAfter) })}</p>
            {bericht.ideas.length > 0 && (
              <>
                <p className="bogen-text">{fillTimeskipText(T.report.ideas, {})}</p>
                <ul className="sprung-ideen">
                  {bericht.ideas.map((i) => (
                    <li key={i.id} className={i.affordable ? undefined : 'muted'}>
                      {fillTimeskipText(T.report[i.id], { kosten: money(i.cost), n: String(i.count ?? 0) })}
                      {!i.affordable && <em> ({fillTimeskipText(T.report.tooExpensive, {})})</em>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {/* 4.12/4.19: Ausgangslage und Ziel des nächsten Kapitels – der Spieler weiß vor der ersten Runde, worum es geht. */}
        {game.ending !== 'pleite' && <p className="bogen-text sprung-ziel">{fillTimeskipText(weakStart(record, balance) ? kapitel.textWeak : kapitel.text, { ziel: money(balance.chapter.chapter2.goalValue), bis: chapterGoalDate(record, game, balance) })}</p>}
      </div>
      <div className="bogen-fuss">
        <button type="button" onClick={() => setSeite(1)}>
          {fillTimeskipText(T.report.back, {})}
        </button>
        {game.ending === 'pleite' ? (
          <button type="button" className="primary" onClick={onContinue}>
            {fillTimeskipText(c.end, {})}
          </button>
        ) : (
          <>
            <span className="stempel-klein">{fillTimeskipText(kapitel.badge, {})}</span>
            <button type="button" className="primary" onClick={onContinue}>
              {fillTimeskipText(c.continue, { jahr: formatDate(game).split(' ').pop() ?? '' })}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
