import { describe, expect, it } from 'vitest';
import type { Well } from '../sim/drilling';
import { BASE_GAIN, SOUND_KINDS, playSound, previewSound, soundForWell, soundForWells, soundGain } from './sound';

const loch = (id: string, status: Well['status'], result?: Well['result']) => ({ id, status, result }) as unknown as Well;

describe('Geräusche', () => {
  it('Lautstärke: aus ist stumm, der Regler wirkt leiser als linear', () => {
    for (const k of SOUND_KINDS) expect(soundGain(k, { soundOn: false, volume: 1 })).toBe(0);
    expect(soundGain('kasse', { soundOn: true, volume: 0 })).toBe(0);
    expect(soundGain('kasse', { soundOn: true, volume: 1 })).toBe(BASE_GAIN.kasse);
    expect(soundGain('kasse', { soundOn: true, volume: 0.5 })).toBeLessThan(BASE_GAIN.kasse * 0.5);
    expect(soundGain('kasse', { soundOn: true, volume: 7 })).toBe(BASE_GAIN.kasse);
  });

  it('jedes Geräusch ist leise genug', () => {
    for (const k of SOUND_KINDS) expect(BASE_GAIN[k]).toBeLessThanOrEqual(0.75);
  });

  it('Fund: Gusher und normales Öl klingen verschieden, nur beim neuen Fund', () => {
    expect(soundForWell(undefined, { status: 'found', result: 'gusher' })).toBe('gusher');
    expect(soundForWell({ status: 'drilling' }, { status: 'found', result: 'small' })).toBe('kasse');
    expect(soundForWell({ status: 'found' }, { status: 'found', result: 'gusher' })).toBeNull();
    expect(soundForWell({ status: 'drilling' }, { status: 'dry' })).toBeNull();
  });

  it('eine Runde: Gusher geht vor Öl gefunden', () => {
    const vorher = [loch('a', 'drilling'), loch('b', 'drilling')];
    expect(soundForWells(vorher, [loch('a', 'found', 'small'), loch('b', 'found', 'gusher')])).toBe('gusher');
    expect(soundForWells(vorher, [loch('a', 'found', 'small'), loch('b', 'drilling')])).toBe('kasse');
    expect(soundForWells(vorher, vorher)).toBeNull();
  });

  it('bricht ohne WebAudio (Test) nie', () => {
    expect(() => {
      for (const k of SOUND_KINDS) playSound(k);
      previewSound();
    }).not.toThrow();
  });
});
