import { describe, expect, it } from 'vitest';
import { stageScaleFor } from './stage';

describe('Bühne wächst mit dem Bildschirm (0.2.15+11)', () => {
  it('genau die Arbeitsgröße: 1', () => {
    expect(stageScaleFor(1280, 800)).toBe(1);
  });
  it('etwas weniger Platz (Browserleisten): schrumpft bis 0,85, nie weiter (0.2.15+12)', () => {
    expect(stageScaleFor(1280, 680)).toBe(0.85);
    expect(stageScaleFor(1280, 720)).toBe(0.9);
    expect(stageScaleFor(1366, 650)).toBe(0.85);
    expect(stageScaleFor(1024, 600)).toBe(0.85);
  });
  it('Full HD vergrößert nach der knapperen Seite (16:10-Bühne in 16:9)', () => {
    expect(stageScaleFor(1920, 1080)).toBe(1.35);
    expect(stageScaleFor(1440, 900)).toBe(1.125);
  });
  it('hat eine Obergrenze', () => {
    expect(stageScaleFor(5120, 2880)).toBe(1.6);
  });
});
