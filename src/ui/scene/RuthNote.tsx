// Ruths Zettel (0.2.15+9) auf der Schreibunterlage: der nächste Schritt oder der
// Hinweis des Einstiegs (Text aus content/tutorial.yaml), bei Krankheit die
// Krankmeldung. Ein Klick (oder Enter) führt dorthin, wo es weitergeht.
// Ab 0.2.15+11 wird der Zettel konkret: Liegt mehr als eine Sache offen, steht
// jede einzeln da – mit eigenem Weg dorthin (Bohrung, Besuch, Briefe …).

import type { NextStep } from '../../sim/desk';
import type { TutorialView } from '../../sim/tutorial';
import type { OpenItem } from '../inbox';

/** Höchstens so viele Punkte passen auf den Zettel. */
const MAX_PUNKTE = 4;

type Punkt = { key: string; text: string; urgent: boolean; go: () => void };

export function RuthNote({
  step,
  tutorial,
  sickRounds,
  exhausted,
  finished,
  tutorialOffer,
  open,
  wellsWaiting,
  onGo,
  onItem,
  onWell,
  onTutorial,
}: {
  step: NextStep | null;
  tutorial: TutorialView | null;
  /** Jacob ist krank: noch so viele Runden (0 = gesund). */
  sickRounds: number;
  exhausted: boolean;
  finished: boolean;
  tutorialOffer: boolean;
  /** Was auf dem Tisch offen liegt (wie an der Glocke). */
  open: readonly OpenItem[];
  /** Bohrungen, die auf Jacob warten. */
  wellsWaiting: readonly { parcelId: string; text: string }[];
  /** Zum Ziel des Hinweises; null, wenn es keins gibt. */
  onGo: (() => void) | null;
  onItem: (item: OpenItem) => void;
  onWell: (parcelId: string) => void;
  onTutorial: (on: boolean) => void;
}) {
  const krank = !finished && sickRounds > 0;
  const kopf = krank ? 'Jacob liegt krank im Bett' : tutorial ? `${tutorial.title} · Schritt ${tutorial.stepNumber} von ${tutorial.stepCount}` : 'Ruths Zettel';

  // Konkrete Punkte: erst die Bohrungen, dann was am Tisch liegt. Nur ohne Einstieg und gesund.
  const punkte: Punkt[] =
    krank || tutorial || finished
      ? []
      : [
          ...wellsWaiting.map((w) => ({ key: `bohrung-${w.parcelId}`, text: w.text, urgent: false, go: () => onWell(w.parcelId) })),
          // Feste Termine sind freiwillig – die nennt die Glocke, nicht der Zettel.
          ...open.filter((o) => o.target !== 'termine').map((o) => ({ key: `offen-${o.target}`, text: o.text, urgent: o.urgent, go: () => onItem(o) })),
        ];
  // Ein Schritt auf der Karte, den die Liste nicht schon nennt (z. B. „Pacht bereit zum Bohren“).
  if (punkte.length > 0 && step && step.parcelIds.length > 0 && wellsWaiting.length === 0 && onGo) {
    punkte.unshift({ key: 'schritt', text: step.text, urgent: false, go: onGo });
  }

  const ps = exhausted && !krank && <span className="zettel-ps">PS: Du siehst erschöpft aus. Fehler schleichen sich ein.</span>;
  const links = (
    <span className="unterlage-links">
      {tutorial ? (
        <button type="button" className="link" onClick={() => onTutorial(false)}>
          Hinweise ausblenden
        </button>
      ) : (
        tutorialOffer && (
          <button type="button" className="link" onClick={() => onTutorial(true)}>
            Einstiegshilfe zeigen
          </button>
        )
      )}
    </span>
  );

  // Mehrere Sachen offen: eine Liste, jeder Punkt mit eigenem Weg.
  if (punkte.length > 0) {
    const sichtbar = punkte.slice(0, MAX_PUNKTE);
    return (
      <div className="unterlage">
        <div className="zettel zettel-liste" role="group" aria-label="Ruths Zettel: Das wartet auf dich">
          <span className="zettel-kopf">{kopf}</span>
          <span className="zettel-text">Das wartet auf dich:</span>
          <ul className="zettel-punkte">
            {sichtbar.map((pk) => (
              <li key={pk.key}>
                <button type="button" className={pk.urgent ? 'zettel-punkt dringend' : 'zettel-punkt'} onClick={pk.go}>
                  {pk.urgent && <span className="siegel" aria-hidden="true" />}
                  <span>{pk.text}</span>
                  <span className="zettel-pfeil" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {punkte.length > MAX_PUNKTE && <span className="muted klein">… und {punkte.length - MAX_PUNKTE} weitere an der Glocke (E).</span>}
          {ps}
        </div>
        {links}
      </div>
    );
  }

  const text = krank
    ? `${sickRounds > 1 ? `Noch ${sickRounds} Runden.` : 'Diese Runde noch.'} Keine Termine: Ereignisse und Briefe bekommen ihre Standardantwort.`
    : tutorial
      ? tutorial.text
      : (step?.text ?? 'Das Kapitel ist zu Ende.');

  return (
    <div className="unterlage">
      <button
        type="button"
        className={`zettel${krank ? ' krank' : ''}${onGo ? '' : ' ohne-ziel'}`}
        onClick={() => onGo?.()}
        aria-disabled={onGo ? undefined : true}
        aria-label={`Ruths Zettel: ${kopf}. ${text}${onGo ? ' – Enter führt hin.' : ''}`}
      >
        <span className="zettel-kopf">
          {kopf}
          {tutorial && !krank && <span className="zettel-schritt"> – {tutorial.stepLabel}</span>}
        </span>
        <span className="zettel-text">{text}</span>
        {ps}
        {onGo && <span className="zettel-hin">Hingehen →</span>}
      </button>
      {links}
    </div>
  );
}
