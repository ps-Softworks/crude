// Kartenansicht (0.2.15+9): die Karte von Cordova groß, darüber die Kartenleiste
// („‹ Schreibtisch“, Lage im Revier, Pipeline, Legende, Runde beenden) und rechts
// angedockt das Ranch-Fenster. Die Kopfleiste bleibt stehen.
//
// Esc-Reihenfolge: Ein offenes Ranch-Fenster schließt zuerst (hier, noch bevor
// die Karte das Esc sieht); hat der Spieler selbst gezoomt oder verschoben, fährt
// die Karte zurück; sonst geht es zurück zum Schreibtisch (App, nur für ein Esc,
// das niemand behandelt hat). Ohne Ranch-Fenster steht unten der nächste Schritt.

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { GameState } from '../../sim/game';
import { balance } from '../balance';
import { Map, type MapMarker } from '../Map';
import { rivalsLines } from '../sheets/RivalsSheet';

export function MapView({
  game,
  debug,
  ranch,
  highlight,
  topBar,
  ranchSheet,
  onSelect,
  onCloseRanch,
  onDesk,
  onPipeline,
  onBell,
  markers,
  onMarker,
  stamp,
  hint = null,
}: {
  game: GameState;
  debug: boolean;
  ranch: string | null;
  highlight: string[];
  topBar: ReactNode;
  /** Das Ranch-Fenster zur gewählten Ranch (oder null). */
  ranchSheet: ReactNode;
  onSelect: (id: string) => void;
  onCloseRanch: () => void;
  onDesk: () => void;
  onPipeline: () => void;
  onBell: () => void;
  /** Pflöcke und Briefe auf den Ranches (0.2.15+10). */
  markers: readonly MapMarker[];
  onMarker: (marker: MapMarker) => void;
  /** Stempel nach einer Ranch-Aktion („Gepachtet“), kurz über der Karte. */
  stamp: { text: string; n: number } | null;
  /** Einstieg bzw. nächster Schritt (Kartenfassung) – steht unten, solange kein Ranch-Fenster offen ist. */
  hint?: string | null;
}) {
  const [legende, setLegende] = useState(false);
  const kartenRef = useRef<HTMLDivElement>(null);
  const lage = rivalsLines(game);

  // Beim Öffnen der Karte bekommt sie den Fokus: Pfeile, Plus/Minus und Esc wirken sofort.
  // Kommt man mit gewählter Ranch (Ruths Zettel, Akte), hat das Ranch-Fenster den Fokus schon.
  useEffect(() => {
    if (ranch === null) kartenRef.current?.querySelector<SVGSVGElement>('.karte-bild')?.focus({ preventScroll: true });
    // Nur beim Öffnen der Karte.
  }, []);

  // Ranch-Fenster zu: Fokus zurück auf die Karte.
  const vorher = useRef(ranch);
  useEffect(() => {
    if (vorher.current !== null && ranch === null) kartenRef.current?.querySelector<SVGSVGElement>('.karte-bild')?.focus({ preventScroll: true });
    vorher.current = ranch;
  }, [ranch]);

  function escZuerst(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && ranch !== null) {
      e.preventDefault();
      e.stopPropagation();
      onCloseRanch();
    }
  }

  // Klick auf leere Karte (nicht auf Ranch, Gebiet oder Knopf) schließt das Ranch-Fenster.
  function klickDaneben(e: MouseEvent<HTMLDivElement>) {
    if (ranch === null) return;
    const t = e.target as Element;
    if (t.closest('.karte-ranch, .karte-gebiet, .karte-marke, button, .karte-legende')) return;
    onCloseRanch();
  }

  return (
    <div className="kartenansicht">
      {topBar}
      <div className="kartenleiste">
        <button type="button" onClick={onDesk} title="Zurück zum Schreibtisch (Esc – ist ein Ranch-Fenster offen, schließt das erste Esc dieses)">
          ‹ Schreibtisch <span className="taste-hinweis">(Esc)</span>
        </button>
        <span className="lage-revier" aria-label="Lage im Revier">
          <span>{lage.jacob}</span>
          <span>
            {lage.bullard}
            {debug && ` · Kasse ${game.rival.cash.toLocaleString('de-DE')} $`}
          </span>
          {lage.wildcatter && <span>{lage.wildcatter}</span>}
        </span>
        <span className="kartenleiste-rechts">
          <button type="button" onClick={onPipeline}>
            Pipeline &amp; Wegerechte
          </button>
          <button type="button" aria-pressed={legende} onClick={() => setLegende(!legende)}>
            Legende
          </button>
          <button type="button" className="primary klein-primary" onClick={onBell} disabled={game.finished}>
            Runde beenden
          </button>
        </span>
      </div>
      <div className="kartenansicht-koerper">
        <div
          ref={kartenRef}
          className={legende ? 'kartenflaeche' : 'kartenflaeche legende-zu'}
          onKeyDownCapture={escZuerst}
          onClick={klickDaneben}
        >
          <Map balance={balance} game={game} debug={debug} selected={ranch} highlight={highlight} onSelect={onSelect} markers={markers} onMarker={onMarker} />
          {stamp && (
            <span key={stamp.n} className="stempel" role="status">
              {stamp.text}
            </span>
          )}
          {ranch === null && hint && (
            <p className="karte-hinweis" role="status">
              <span className="karte-hinweis-kopf">Ruths Zettel</span> {hint}
            </p>
          )}
        </div>
        {ranchSheet}
      </div>
    </div>
  );
}
