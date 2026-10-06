import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_SETTINGS_CLASSES,
  applyClasses,
  DEFAULT_SETTINGS,
  SETTINGS_PREF,
  getSettings,
  motionReduced,
  parseSettings,
  resetSettingsForTest,
  serializeSettings,
  settingsClasses,
  subscribeSettings,
  updateSettings,
} from './settings';
import { readPref } from './storage';

describe('Einstellungen', () => {
  beforeEach(() => {
    resetSettingsForTest();
  });

  it('hat ruhige Standardwerte', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.textSize).toBe('normal');
    expect(DEFAULT_SETTINGS.reduceMotion).toBe(false);
    expect(DEFAULT_SETTINGS.colorblindMap).toBe(false);
  });

  it('liest gespeicherte Werte und verwirft Unsinn je Feld', () => {
    const s = parseSettings(JSON.stringify({ textSize: 'gross', soundOn: false, volume: 7, reduceMotion: 'ja', colorblindMap: true }));
    expect(s).toEqual({ ...DEFAULT_SETTINGS, textSize: 'gross', soundOn: false, volume: 1, colorblindMap: true });
    expect(parseSettings('kaputt{')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"text"')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ textSize: 'riesig', volume: -3 })).textSize).toBe('normal');
    expect(parseSettings(JSON.stringify({ volume: -3 })).volume).toBe(0);
  });

  it('übersteht Hin und Zurück', () => {
    const s = { ...DEFAULT_SETTINGS, textSize: 'sehrgross' as const, volume: 0.25 };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('macht aus den Einstellungen CSS-Klassen', () => {
    expect(settingsClasses(DEFAULT_SETTINGS)).toEqual([]);
    expect(settingsClasses({ ...DEFAULT_SETTINGS, textSize: 'gross', reduceMotion: true, colorblindMap: true })).toEqual(['text-gross', 'wenig-bewegung', 'karte-cb']);
    for (const g of ['gross', 'sehrgross'] as const) expect(ALL_SETTINGS_CLASSES).toContain(settingsClasses({ ...DEFAULT_SETTINGS, textSize: g })[0]);
  });

  it('weniger Bewegung gilt bei Systemwunsch oder eigenem Schalter', () => {
    expect(motionReduced({ reduceMotion: false }, false)).toBe(false);
    expect(motionReduced({ reduceMotion: true }, false)).toBe(true);
    expect(motionReduced({ reduceMotion: false }, true)).toBe(true);
  });

  it('setzt und entfernt Klassen am Wurzelelement', () => {
    const klassen = new Set<string>(['text-gross']);
    const root = { classList: { add: (...k: string[]) => k.forEach((x) => klassen.add(x)), remove: (...k: string[]) => k.forEach((x) => klassen.delete(x)) } };
    applyClasses(root, { ...DEFAULT_SETTINGS, reduceMotion: true });
    expect([...klassen]).toEqual(['wenig-bewegung']);
  });

  it('meldet Änderungen und merkt sie sich', () => {
    let gemeldet = 0;
    const ab = subscribeSettings(() => gemeldet++);
    updateSettings({ textSize: 'gross', reduceMotion: true });
    expect(getSettings().textSize).toBe('gross');
    updateSettings({ textSize: 'normal' });
    expect(getSettings().textSize).toBe('normal');
    expect(gemeldet).toBe(2);
    expect(parseSettings(readPref(SETTINGS_PREF)).reduceMotion).toBe(true);
    ab();
  });
});
