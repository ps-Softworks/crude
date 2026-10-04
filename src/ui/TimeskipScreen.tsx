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
  type ChronicleEntry,
  type Directives,
  type FamilyTime,
  type Stance,
  type SwitchId,
  type TimeskipRecord,
} from '../sim/timeskip';
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
  return fillTimeskipText(text, {
    n: String(e.n ?? ''),
    betrag: e.amount !== undefined ? money(e.amount) : '',
    name: e.name ?? '',
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
export function SwitchTelegram({ id, year, onAnswer }: { id: SwitchId; year: number; onAnswer: (choice: string) => void }) {
  const ref = useTitelFokus(id);
  const s = T.switches[id];
  const kosten: Record<string, number> = { invest: balance.timeskip.switches.automobileCost, lease: balance.timeskip.switches.okaraCost };
  return (
    <section ref={ref} className="telegramm" aria-labelledby="telegramm-titel" role="dialog">
      <p className="telegramm-kopf">
        {fillTimeskipText(T.switches.telegram, {})} · {fillTimeskipText(T.chronicle.year, { jahr: String(foederation(year)) })}
      </p>
      <h2 id="telegramm-titel" className="sprung-titel" tabIndex={-1}>
        {fillTimeskipText(s.title, {})}
      </h2>
      <p className="telegramm-text">{fillTimeskipText(s.text, {})}</p>
      <div className="knoepfe">
        {SWITCH_CHOICES[id].map((c) => (
          <button key={c} type="button" onClick={() => onAnswer(c)}>
            {fillTimeskipText(s.choices[c], { betrag: kosten[c] !== undefined ? money(kosten[c]) : '' })}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Die Chronik „Die Jahre dazwischen“: eine Zeitungsspalte je Jahr, unten die Bilanz. */
export function ChronicleScreen({ game, record, onContinue }: { game: GameState; record: TimeskipRecord; onContinue: () => void }) {
  const ref = useTitelFokus(record.number);
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
  return (
    <section ref={ref} className="gameover bogen sprung chronik" aria-labelledby="chronik-titel">
      <div className="bogen-inhalt">
        <p className="zeitung-kopf">{fillTimeskipText(c.paper, {})}</p>
        <h2 id="chronik-titel" className="sprung-titel chronik-titel" tabIndex={-1}>
          {fillTimeskipText(c.title, {})} · {foederation(record.fromYear)}–{foederation(record.toYear)}
        </h2>
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
        <h3>{fillTimeskipText(c.balance, {})}</h3>
        <dl className="terms zweispaltig">
          {zeile('Imperiumswert', money(v.value), money(n.value))}
          {zeile('Kasse', money(v.cash), money(n.cash))}
          {zeile('Schulden', money(v.debt), money(n.debt))}
          {zeile('Fördernde Quellen', String(v.wells), String(n.wells))}
          {zeile('Ruth', wort(v.ruth), wort(n.ruth))}
          {zeile('Kinder', String(v.children), String(n.children))}
        </dl>
      </div>
      <div className="bogen-fuss">
        <span className="stempel-klein">{fillTimeskipText(T.chapter2.badge, {})}</span>
        <button type="button" className="primary" onClick={onContinue}>
          {fillTimeskipText(c.continue, { jahr: formatDate(game).split(' ').pop() ?? '' })}
        </button>
      </div>
    </section>
  );
}
