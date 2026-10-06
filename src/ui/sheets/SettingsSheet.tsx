// Fenster „Einstellungen“ (Menü ☰ → Einstellungen): Textgröße, Ton und Lautstärke, Vollbild,
// weniger Animation, farbenblind-freundliche Karte. Alles wirkt sofort und wird gemerkt
// (src/ui/settings.ts); keine Spielregel.

import { useState } from 'react';
import { fullscreenAvailable, isFullscreen, toggleFullscreen } from '../fullscreen';
import { TEXT_SIZES, TEXT_SIZE_LABEL, systemReducesMotion, updateSettings } from '../settings';
import { previewSound } from '../sound';
import { useSettings } from '../useSettings';

export function SettingsSheet() {
  const s = useSettings();
  const [vollbild, setVollbild] = useState(isFullscreen);
  const systemRuhig = systemReducesMotion();
  return (
    <div className="einstellungen">
      <fieldset>
        <legend>Textgröße</legend>
        <div className="einstellungen-reihe" role="radiogroup" aria-label="Textgröße">
          {TEXT_SIZES.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={s.textSize === g} onClick={() => updateSettings({ textSize: g })}>
              {TEXT_SIZE_LABEL[g]}
            </button>
          ))}
        </div>
        <p className="muted klein">Gilt für den Text in Fenstern, Besuchen und Kapitelbögen.</p>
      </fieldset>

      <fieldset>
        <legend>Ton</legend>
        <label>
          <input type="checkbox" checked={s.soundOn} onChange={(e) => updateSettings({ soundOn: e.target.checked })} /> Geräusche (Telefon, Glocke, Kasse …)
        </label>
        <label className="einstellungen-regler">
          Lautstärke {Math.round(s.volume * 100)} %
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(s.volume * 100)}
            disabled={!s.soundOn}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })}
            onPointerUp={previewSound}
            onKeyUp={previewSound}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Anzeige</legend>
        {fullscreenAvailable() && (
          <p>
            <button
              type="button"
              onClick={() => {
                toggleFullscreen();
                window.setTimeout(() => setVollbild(isFullscreen()), 300);
              }}
            >
              {vollbild ? 'Vollbild verlassen' : 'Vollbild'}
            </button>
          </p>
        )}
        <label>
          <input type="checkbox" checked={s.reduceMotion} onChange={(e) => updateSettings({ reduceMotion: e.target.checked })} /> Weniger Animation
          {systemRuhig && <span className="muted klein"> (Ihr System wünscht das ohnehin)</span>}
        </label>
        <label>
          <input type="checkbox" checked={s.colorblindMap} onChange={(e) => updateSettings({ colorblindMap: e.target.checked })} /> Karte farbenblind-freundlich
          (Blau/Orange mit Mustern statt Grün/Rot)
        </label>
      </fieldset>
    </div>
  );
}
