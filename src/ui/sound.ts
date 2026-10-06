// Geräusche (B2): keine Tondateien, alles im Programm mit WebAudio erzeugt – kurz, leise,
// nicht nervig. Der AudioContext startet erst nach der ersten Bedienung (Autoplay-Regeln der
// Browser); bis dahin und überall, wo es kein WebAudio gibt (Tests), tut `playSound` nichts.
// Ton an/aus und Lautstärke kommen aus den Einstellungen (src/ui/settings.ts).

import type { Well } from '../sim/drilling';
import { getSettings, type Settings } from './settings';

export const SOUND_KINDS = ['telefon', 'ticker', 'kasse', 'stempel', 'glocke', 'gusher', 'papier'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

/** Grundlautstärke je Geräusch (vor dem Regler): das Telefon ist deutlich, das Papier kaum zu hören. */
export const BASE_GAIN: Record<SoundKind, number> = {
  telefon: 0.5,
  ticker: 0.35,
  kasse: 0.45,
  stempel: 0.7,
  glocke: 0.5,
  gusher: 0.55,
  papier: 0.25,
};

/** Wie laut ein Geräusch bei diesen Einstellungen wird (0 = stumm). Der Regler wirkt quadratisch – leise bleibt fein einstellbar. */
export function soundGain(kind: SoundKind, s: Pick<Settings, 'soundOn' | 'volume'>): number {
  if (!s.soundOn) return 0;
  const v = Math.min(1, Math.max(0, s.volume));
  return BASE_GAIN[kind] * v * v;
}

/** Welches Geräusch gehört zu dem, was an einem Bohrloch über Nacht geschah (null = keines). */
export function soundForWell(vorher: Pick<Well, 'status'> | undefined, nachher: Pick<Well, 'status' | 'result'>): SoundKind | null {
  if (nachher.status !== 'found' || vorher?.status === 'found') return null;
  return nachher.result === 'gusher' ? 'gusher' : 'kasse';
}

/** Das wichtigste Geräusch einer Runde: Gusher vor „Öl gefunden“. */
export function soundForWells(vorher: readonly Well[], nachher: readonly Well[]): SoundKind | null {
  let best: SoundKind | null = null;
  for (const w of nachher) {
    const k = soundForWell(
      vorher.find((v) => v.id === w.id),
      w,
    );
    if (k === 'gusher') return 'gusher';
    if (k) best = k;
  }
  return best;
}

// ---------------------------------------------------------------- WebAudio

let ctx: AudioContext | null = null;
let bereit = false;
let zuhoerer = false;

/** Merkt die erste Bedienung (Klick/Taste); erst danach darf Ton laufen. Einmal beim Start aufrufen. */
export function armSound(): void {
  if (zuhoerer || typeof window === 'undefined') return;
  zuhoerer = true;
  const los = () => {
    bereit = true;
    window.removeEventListener('pointerdown', los, true);
    window.removeEventListener('keydown', los, true);
  };
  window.addEventListener('pointerdown', los, true);
  window.addEventListener('keydown', los, true);
}

function kontext(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const Klasse = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Klasse) return null;
    ctx = new Klasse();
    return ctx;
  } catch {
    return null;
  }
}

/** Ein weicher Ton mit schnellem Anstieg und Abklingen. */
function ton(c: AudioContext, ziel: AudioNode, freq: number, ab: number, dauer: number, pegel: number, art: OscillatorType = 'sine', bis?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = art;
  o.frequency.setValueAtTime(freq, ab);
  if (bis !== undefined) o.frequency.exponentialRampToValueAtTime(bis, ab + dauer);
  g.gain.setValueAtTime(0.0001, ab);
  g.gain.exponentialRampToValueAtTime(pegel, ab + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ab + dauer);
  o.connect(g).connect(ziel);
  o.start(ab);
  o.stop(ab + dauer + 0.02);
}

/** Rauschen, durch einen Filter geschickt; `huellkurve` bestimmt Anschwellen und Abklingen. */
function rauschen(c: AudioContext, ziel: AudioNode, ab: number, dauer: number, filter: BiquadFilterType, freq: number, pegel: number, anschwellen = 0.01, freqBis?: number) {
  const n = Math.max(1, Math.floor(c.sampleRate * dauer));
  const puffer = c.createBuffer(1, n, c.sampleRate);
  const daten = puffer.getChannelData(0);
  for (let i = 0; i < n; i++) daten[i] = Math.random() * 2 - 1;
  const quelle = c.createBufferSource();
  quelle.buffer = puffer;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, ab);
  if (freqBis !== undefined) f.frequency.exponentialRampToValueAtTime(freqBis, ab + dauer);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, ab);
  g.gain.exponentialRampToValueAtTime(pegel, ab + anschwellen);
  g.gain.exponentialRampToValueAtTime(0.0001, ab + dauer);
  quelle.connect(f).connect(g).connect(ziel);
  quelle.start(ab);
}

const REZEPT: Record<SoundKind, (c: AudioContext, aus: AudioNode, t: number) => void> = {
  // Zwei Glocken im Wechsel, zweimal angeschlagen.
  telefon: (c, aus, t) => {
    for (const block of [0, 0.75]) {
      for (let i = 0; i < 8; i++) {
        const f = i % 2 === 0 ? 1318 : 1568;
        ton(c, aus, f, t + block + i * 0.055, 0.12, 0.5, 'triangle');
        ton(c, aus, f * 2.4, t + block + i * 0.055, 0.06, 0.12);
      }
    }
  },
  // Kurze Klicks wie ein Morse-Ticker.
  ticker: (c, aus, t) => {
    const muster = [0, 0.07, 0.14, 0.26, 0.33, 0.47, 0.54];
    for (const m of muster) rauschen(c, aus, t + m, 0.03, 'bandpass', 3200, 0.7, 0.002);
  },
  // Kassenklingel: zwei helle Töne.
  kasse: (c, aus, t) => {
    ton(c, aus, 2093, t, 0.5, 0.45);
    ton(c, aus, 3136, t + 0.09, 0.7, 0.35);
    rauschen(c, aus, t, 0.05, 'highpass', 5000, 0.2, 0.002);
  },
  // Dumpfer Schlag.
  stempel: (c, aus, t) => {
    ton(c, aus, 130, t, 0.18, 0.9, 'sine', 55);
    rauschen(c, aus, t, 0.07, 'lowpass', 900, 0.5, 0.002);
  },
  // Glocke mit Obertönen.
  glocke: (c, aus, t) => {
    for (const [mal, pegel] of [
      [1, 0.4],
      [2.76, 0.18],
      [5.4, 0.08],
    ] as const) {
      ton(c, aus, 660 * mal, t, 1.5 / Math.sqrt(mal), pegel);
    }
  },
  // Rauschen, das anschwillt.
  gusher: (c, aus, t) => {
    rauschen(c, aus, t, 1.5, 'lowpass', 300, 0.8, 0.9, 2200);
    ton(c, aus, 80, t + 0.3, 1.0, 0.25, 'sine', 140);
  },
  // Papierrascheln.
  papier: (c, aus, t) => {
    rauschen(c, aus, t, 0.14, 'highpass', 2500, 0.4, 0.03);
    rauschen(c, aus, t + 0.07, 0.1, 'bandpass', 4200, 0.3, 0.02);
  },
};

/** Spielt ein Geräusch – leise, wenn der Ton aus ist oder noch niemand etwas bedient hat; nie ein Fehler. */
export function playSound(kind: SoundKind): void {
  try {
    if (!bereit) return;
    const gain = soundGain(kind, getSettings());
    if (gain <= 0) return;
    const c = kontext();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const aus = c.createGain();
    aus.gain.value = gain;
    aus.connect(c.destination);
    REZEPT[kind](c, aus, c.currentTime + 0.01);
  } catch {
    /* Ohne Ton läuft das Spiel genauso. */
  }
}

/** Für die Einstellungen: ein kurzer Probeton, der auch ohne vorherigen Klick erlaubt ist (der Klick ist ja da). */
export function previewSound(): void {
  bereit = true;
  playSound('kasse');
}
