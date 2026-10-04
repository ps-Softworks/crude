// Ranch-Fenster (0.2.15+9, vorher ParcelPanel in App.tsx): rechts neben der Karte
// angedockt. Oben Kopf und Hauptknöpfe, darunter Prognose und Konditionen,
// Bohrungen, Ausbau zum Aufklappen und die Randnotiz. Welche Knöpfe es gibt,
// entscheidet parcelActions aus src/sim – hier steht keine einzige Spielregel.

import { useEffect, useRef } from 'react';
import { drillBlocker, parcelActions, parcelOutlooks, paybackText, type DeskActionKind, type ParcelOutlook } from '../../sim/desk';
import { deeperChance, deeperQuote, wellOf, wellsOn, type Well } from '../../sim/drilling';
import { fieldLabel, fieldOf } from '../../sim/field';
import { formatForecast, trueChance } from '../../sim/forecast';
import type { GameState } from '../../sim/game';
import type { Parcel } from '../../sim/geology';
import { leaseOf, leaseTerms, optionOf, roundsLeft } from '../../sim/lease';
import { fieldStatus } from '../../sim/production';
import { findRig, rigLabel } from '../../sim/rigs';
import { balance } from '../balance';
import { barrels, money, percent, rounds, units } from '../format';
import { STATUS_LABEL, ranchStatus } from '../mapShapes';

const GEOLOGY_LABEL = { dry: 'trocken', small: 'klein', gusher: 'Gusher' } as const;

export interface RanchSheetProps {
  game: GameState;
  parcel: Parcel;
  debug: boolean;
  /** Grund der letzten gescheiterten Aktion. */
  notice: string | null;
  /** Der nächste Schritt vom Schreibtisch (oder der Einstieg). */
  stepText: string | null;
  onAction: (kind: DeskActionKind, parcelId: string) => void;
  onClose: () => void;
  onLedger: () => void;
  /** Zur Bohrturm-Akte (Turm kaufen oder mieten). */
  onRigs: () => void;
}

export function RanchSheet({ game, parcel, debug, notice, stepText, onAction, onClose, onLedger, onRigs }: RanchSheetProps) {
  const id = parcel.id;
  const lease = leaseOf(game, id);
  const option = optionOf(game, id);
  const terms = parcel.discovery ? undefined : leaseTerms(game, balance, id);
  const forecast = parcel.discovery ? undefined : game.forecasts[id];
  const well = wellOf(game, id);
  const wells = wellsOn(game, id);
  const outlooks = lease?.holder === 'jacob' ? parcelOutlooks(game, balance, id) : [];

  // Probelauf aus der Simulation: sie sagt, welche Knöpfe es gibt und ob sie gehen.
  const actions = parcelActions(game, balance, id);
  const sperre = actions.find((a) => !a.ok);
  const gesperrt = sperre?.reason;
  // Kein Bohren-Knopf? Dann ein gesperrter mit Grund, damit niemand denkt, das Spiel hängt (0.2.15+11).
  const ohneBohren = drillBlocker(game, balance, id);
  // Was der Spieler liest: der Fehler der letzten Aktion, sonst der Grund, warum
  // ein Knopf gesperrt ist, sonst der nächste Schritt.
  const hinweis = notice ?? gesperrt ?? stepText;
  // Der Weg zur Abhilfe – nur, wenn die Simulation sagt, woran es liegt.
  const weg = notice ? null : sperre?.reasonKind;

  const ref = useRef<HTMLElement>(null);
  // Neue Ranch gewählt: Fokus ins Fenster, damit es mit der Tastatur weitergeht.
  useEffect(() => {
    const root = ref.current;
    (root?.querySelector<HTMLElement>('.ranch-aktionen button:not(:disabled)') ?? root?.querySelector<HTMLElement>('.sheet-zu'))?.focus({ preventScroll: true });
  }, [id]);
  // Nach einer Aktion verschwindet oft der Knopf mit dem Fokus (Pachten → Bohren): Fokus bleibt im Fenster.
  useEffect(() => {
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body) return;
    const root = ref.current;
    (root?.querySelector<HTMLElement>('.ranch-aktionen button:not(:disabled)') ?? root?.querySelector<HTMLElement>('.sheet-zu'))?.focus({ preventScroll: true });
  });

  return (
    <aside ref={ref} className="ranch-fenster" aria-labelledby="ranch-titel">
      <div className="ranch-kopf">
        <h2 id="ranch-titel">{parcel.name}</h2>
        <button type="button" className="sheet-zu" onClick={onClose} aria-label="Ranch-Fenster schließen (Esc)" title="Schließen (Esc)">
          ×
        </button>
      </div>
      <div className="ranch-inhalt">
        <p className="ranch-unterzeile">
          {parcel.owner} · {parcel.slots} {parcel.slots === 1 ? 'Bohrplatz' : 'Bohrplätze'}
          {wells.length > 0 && <> ({wells.length} belegt)</>} · Zone {parcel.zone}
          <br />
          <span className="muted">
            {units(parcel.area)} Land ·{' '}
            {parcel.discovery ? 'Entdeckungsquelle' : STATUS_LABEL[ranchStatus(game, id)]}
          </span>
        </p>

        {parcel.discovery ? (
          <p className="state discovery">Entdeckungsquelle – hier wurde zuerst Öl gefunden. Nicht pachtbar.</p>
        ) : (
          <p className={`state ${lease ? 'lease' : option ? 'option' : ''}`}>
            {lease?.holder === 'bullard' ? (
              <>
                Pacht von {balance.rivals.bullard.name}
                {lease.drilled ? ' · er bohrt hier' : <> · noch {rounds(roundsLeft(game, lease))}</>}
              </>
            ) : lease ? (
              <>
                Deine Pacht
                {lease.drilled ? ' (gebohrt, läuft unbefristet)' : <> · noch {rounds(roundsLeft(game, lease))}</>}
                <br />
                Bonus {money(lease.bonus)} gezahlt · Förderzins {percent(lease.royalty)}
                {!lease.drilled && (
                  <>
                    <br />
                    Verzögerungszins {money(balance.lease.delayRental)} je Runde, solange ungebohrt
                  </>
                )}
              </>
            ) : option ? (
              <>
                Deine Option{option.free && ' (kostenlos)'} · noch {rounds(roundsLeft(game, option))}
                <br />
                Gesichert: Bonus {money(option.bonus)} · Förderzins {percent(option.royalty)}
              </>
            ) : (
              'Frei'
            )}
          </p>
        )}

        {(actions.length > 0 || ohneBohren) && (
          <div className="actions ranch-aktionen">
            {actions.map((action) => (
              <button key={action.kind} disabled={!action.ok} title={action.reason} onClick={() => onAction(action.kind, id)}>
                {action.label}
                {action.kind === 'deeper' && well && deeperQuote(game, balance, well) && (
                  <>
                    {' '}
                    auf {balance.drilling.stages[well.stage].depth} m, Unfallrisiko {percent(deeperQuote(game, balance, well)!.accident)}
                  </>
                )}
              </button>
            ))}
            {ohneBohren && (
              <>
                <button type="button" disabled aria-describedby="ohne-bohren">
                  Bohren
                </button>
                <span className="weg-grund" id="ohne-bohren">
                  {ohneBohren}
                </span>
              </>
            )}
          </div>
        )}

        {terms && (
          <section>
            <h3>Prognose und Konditionen</h3>
            <dl className="terms">
              <dt>Geologe</dt>
              <dd>
                {forecast ? formatForecast(forecast) : '–'}
                {debug && ` · wirklich ${percent(trueChance(balance, parcel))}`}
              </dd>
              <dt>Lage</dt>
              <dd>{terms.location.label}</dd>
              <dt>Landbesitzer</dt>
              <dd>{terms.landowner.label}</dd>
              <dt>Bonus</dt>
              <dd>{money(terms.bonus)}</dd>
              <dt>Förderzins</dt>
              <dd>{percent(terms.royalty)}</dd>
              <dt>Optionsgebühr</dt>
              <dd>{money(terms.optionFee)}</dd>
            </dl>
          </section>
        )}

        {wells.length > 0 && (
          <section>
            <h3>Bohrungen</h3>
            {wells
              .filter((w) => w !== well)
              .map((w) => (
                <p key={w.id} className={`state well ${w.status}`}>
                  <WellInfo game={game} well={w} />
                </p>
              ))}
            {well && (
              <p className={`state well ${well.status}`}>
                <WellInfo game={game} well={well} />
                {debug && (
                  <>
                    <br />
                    Debug: Öl in Stufe {well.oilStage ?? '– (trocken)'}
                    {well.status === 'decision' && ` · Chance nächste Stufe ${percent(deeperChance(balance, parcel, well.stage))}`}
                  </>
                )}
              </p>
            )}
            {well?.status === 'found' && <SourceInfo game={game} well={well} debug={debug} />}
          </section>
        )}

        {outlooks.length > 0 && (
          <details className="ausbau-klappe">
            <summary>Ausbau – was ein weiteres Bohrloch oder eine Pumpe bringt</summary>
            <OutlookInfo outlooks={outlooks} />
          </details>
        )}

        {debug && (
          <p className="muted">
            Geologie: {GEOLOGY_LABEL[parcel.geology]}, {parcel.reserves.toLocaleString('de-DE')} Barrel
          </p>
        )}
      </div>
      {hinweis && (
        <p className={notice || gesperrt ? 'randnotiz warn' : 'randnotiz'} role="status">
          {hinweis}
          {weg === 'money' && (
            <>
              {' '}
              <button type="button" className="link" onClick={onLedger}>
                zum Kassenbuch (G)
              </button>
            </>
          )}
          {weg === 'rig' && (
            <>
              {' '}
              <button type="button" className="link" onClick={onRigs}>
                zur Bohrturm-Akte – Turm kaufen oder mieten
              </button>
            </>
          )}
        </p>
      )}
    </aside>
  );
}

/**
 * Ausbau der Ranch (0.2.15+7): Kosten, erwartete Mehrförderung und Amortisation
 * für ein weiteres Bohrloch und eine Pumpe – gerechnet in src/sim/invest.ts.
 */
function OutlookInfo({ outlooks }: { outlooks: ParcelOutlook[] }) {
  return (
    <div className="ausbau">
      <p className="muted">Gerechnet bis Kapitelende mit Felddruck und Ölpreis:</p>
      <dl className="terms">
        {outlooks.map(({ kind, label, outlook: o }) => (
          <div key={kind}>
            <dt>{label}</dt>
            <dd className={o.payback === null ? 'schlecht' : 'gut'}>
              {money(o.cost)}
              {o.upkeep > 0 && ` + ${money(o.upkeep)} je Runde`} · {o.extraFirst >= 0 ? '+' : '−'}
              {barrels(Math.abs(o.extraFirst))} bbl je Runde
              {o.delay > 0 && ` (ab ${rounds(o.delay)})`}
              {o.priceDrop > 0 && `, drückt den Preis um ${o.priceDrop.toLocaleString('de-DE', { minimumFractionDigits: 2 })} $`} ·{' '}
              <strong>{paybackText(o)}</strong>
              {o.payback !== null && ` · bis Kapitelende ${o.profit >= 0 ? '+' : '−'}${money(Math.abs(Math.round(o.profit)))}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Bohrstatus in Worten. */
function WellInfo({ game, well }: { game: GameState; well: Well }) {
  const depth = balance.drilling.stages[well.stage - 1].depth;
  const turm = game.rigs.length > 1 && well.status !== 'found' && well.status !== 'dry' ? findRig(game, well.rigId) : undefined;
  const head = `Stufe ${well.stage}/${balance.drilling.stages.length} (${depth} m) · bisher ${money(well.spent)}${turm ? ` · ${rigLabel(turm)}` : ''}${well.pump ? ' · mit Pumpe' : ''}`;
  switch (well.status) {
    case 'drilling':
      return (
        <>
          {head}
          <br />
          Der Turm bohrt – fertig in {rounds(well.roundsLeft)}.
        </>
      );
    case 'decision':
      return (
        <>
          {head}
          <br />
          In {depth} m trocken. Tiefer bohren oder aufgeben?
        </>
      );
    case 'stuck':
      return (
        <>
          {head}
          <br />
          Das Werkzeug klemmt in {depth} m.
        </>
      );
    case 'found':
      return (
        <>
          {head}
          <br />
          {well.result === 'gusher' ? 'GUSHER! Ein gewaltiger Fund.' : 'Öl gefunden – eine kleine Quelle.'}
        </>
      );
    case 'dry':
      return (
        <>
          {head}
          <br />
          Trocken – kein Öl.
        </>
      );
  }
}

/**
 * Zahlen zur fördernden Quelle: Rate, Ertrag und Druck im Feld. Reserve und
 * Restmenge sind verdeckt und erscheinen nur in der Debug-Ansicht.
 */
function SourceInfo({ game, well, debug }: { game: GameState; well: Well; debug: boolean }) {
  const field = fieldOf(game, well.parcelId);
  const p = well.production;
  if (!field || !p) return <p className="muted">Diese Quelle liegt in keinem Feld – sie fördert nichts.</p>;
  const lage = fieldStatus(game, balance, field);
  return (
    <dl className="terms quelle">
      <dt>Förderung</dt>
      <dd>
        letzte Runde: {barrels(p.lastRate)} bbl
        {debug && ` · anfangs ${barrels(p.initialRate)}`}
      </dd>
      <dt>Gesamt</dt>
      <dd>
        {barrels(p.total)} bbl in {rounds(p.roundsProduced)}
      </dd>
      <dt>Feld</dt>
      <dd>
        {fieldLabel(field)}: {lage.wells} {lage.wells === 1 ? 'Quelle' : 'Quellen'} · Druck {percent(lage.pressure)}
      </dd>
      {debug && (
        <>
          <dt>Debug</dt>
          <dd>
            {field.parcelIds.length} Ranches · {barrels(field.reserves)} bbl im Boden · noch {barrels(lage.remaining)} von{' '}
            {barrels(lage.recoverable)} bbl förderbar
          </dd>
        </>
      )}
    </dl>
  );
}
