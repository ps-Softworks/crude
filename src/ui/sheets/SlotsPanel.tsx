// Menü-Reiter „Speichern“ und „Laden“ (0.4.20+42): drei Speicherplätze neben dem Autosave.
// Die Logik (Schlüssel, Kurzangaben, Liste) steht in saveSlots.ts; hier nur die Liste mit Knöpfen.

import { useState } from 'react';
import type { GameState } from '../../sim/game';
import { ConfirmButton } from '../ConfirmButton';
import { money } from '../format';
import { clearSlot, listSlots, readSlot, writeSlot, type SlotInfo } from '../saveSlots';
import { saveStore } from '../storage';
import './slots.css';

function stamp(info: SlotInfo): string {
  if (info.savedAt === null) return '';
  try {
    return new Date(info.savedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function einlesen(): (SlotInfo | null)[] {
  try {
    return listSlots(saveStore());
  } catch {
    return [null, null, null];
  }
}

export function SlotsPanel({ mode, game, onLoad }: { mode: 'save' | 'load'; game: GameState; onLoad: (state: GameState) => void }) {
  const [slots, setSlots] = useState(einlesen);
  const [note, setNote] = useState<string | null>(null);

  function speichern(slot: number) {
    try {
      writeSlot(saveStore(), slot, game, __APP_VERSION__, Date.now());
      setNote(`Gespeichert auf Platz ${slot}.`);
    } catch {
      setNote('Das Speichern hat nicht geklappt – kein Platz im Speicher?');
    }
    setSlots(einlesen());
  }

  function laden(slot: number) {
    let geladen;
    try {
      geladen = readSlot(saveStore(), slot);
    } catch {
      setNote('Der Speicher ist nicht lesbar.');
      return;
    }
    if (!geladen.ok) {
      setNote(geladen.reason);
      return;
    }
    onLoad(geladen.state);
  }

  function leeren(slot: number) {
    try {
      clearSlot(saveStore(), slot);
    } catch {
      setNote('Der Platz ließ sich nicht leeren.');
    }
    setSlots(einlesen());
  }

  return (
    <div className="speicherplaetze">
      <ol className="plaetze">
        {slots.map((info, i) => {
          const slot = i + 1;
          return (
            <li key={slot} className={info ? 'platz belegt' : 'platz leer'}>
              <strong className="platz-name">Platz {slot}</strong>
              {info ? (
                <span className="platz-angaben">
                  Kapitel {info.chapter} · Runde {info.round} von {info.rounds} · {info.date} · Kasse {money(info.cash)}
                  {stamp(info) && <span className="muted klein"> · gespeichert {stamp(info)}</span>}
                </span>
              ) : (
                <span className="platz-angaben muted">leer</span>
              )}
              <span className="platz-knoepfe">
                {mode === 'save' &&
                  (info ? (
                    <ConfirmButton question={`Platz ${slot} überschreiben? Der alte Stand geht verloren.`} confirmLabel="Ja, überschreiben" onConfirm={() => speichern(slot)}>
                      Überschreiben
                    </ConfirmButton>
                  ) : (
                    <button type="button" onClick={() => speichern(slot)}>
                      Speichern
                    </button>
                  ))}
                {mode === 'load' && info && (
                  <ConfirmButton question="Diesen Stand laden? Der laufende Stand wird ersetzt (der Autosave auch)." confirmLabel="Ja, laden" onConfirm={() => laden(slot)}>
                    Laden
                  </ConfirmButton>
                )}
                {mode === 'load' && info && (
                  <ConfirmButton question={`Platz ${slot} leeren?`} confirmLabel="Ja, leeren" onConfirm={() => leeren(slot)}>
                    Leeren
                  </ConfirmButton>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {note && (
        <p className="klein" role="status">
          {note}
        </p>
      )}
      <p className="muted klein">
        {mode === 'save'
          ? 'Außerdem sichert das Spiel nach jeder Aktion von selbst (Autosave) – die drei Plätze sind für Stände, die man behalten will.'
          : 'Der Autosave bleibt davon unberührt, wird aber mit dem geladenen Stand weitergeschrieben.'}
      </p>
    </div>
  );
}
