import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { debugToolsVisible, parseTesterConfig } from './testerConfig';

describe('Tester-Konfiguration', () => {
  it('content/tester.yaml lässt sich lesen', () => {
    const text = readFileSync(new URL('../../content/tester.yaml', import.meta.url), 'utf8');
    const config = parseTesterConfig(parse(text));
    expect(config.feedbackUrl === null || config.feedbackUrl.startsWith('http')).toBe(true);
  });

  it('leere oder fehlende Adresse: kein Feedback-Knopf', () => {
    expect(parseTesterConfig({ feedbackUrl: '' }).feedbackUrl).toBeNull();
    expect(parseTesterConfig({ feedbackUrl: '   ' }).feedbackUrl).toBeNull();
    expect(parseTesterConfig({}).feedbackUrl).toBeNull();
    expect(parseTesterConfig(null).feedbackUrl).toBeNull();
    expect(parseTesterConfig(undefined).feedbackUrl).toBeNull();
    expect(parseTesterConfig({ feedbackUrl: 42 }).feedbackUrl).toBeNull();
  });

  it('nur echte Web-Adressen zählen', () => {
    expect(parseTesterConfig({ feedbackUrl: 'kein link' }).feedbackUrl).toBeNull();
    expect(parseTesterConfig({ feedbackUrl: 'javascript:alert(1)' }).feedbackUrl).toBeNull();
    expect(parseTesterConfig({ feedbackUrl: 'ftp://example.com/x' }).feedbackUrl).toBeNull();
  });

  it('gültige Adresse wird übernommen (ohne Leerzeichen am Rand)', () => {
    expect(parseTesterConfig({ feedbackUrl: ' https://forms.gle/abc ' }).feedbackUrl).toBe('https://forms.gle/abc');
    expect(parseTesterConfig({ feedbackUrl: 'http://example.com/f?x=1' }).feedbackUrl).toBe('http://example.com/f?x=1');
  });
});

describe('Debug-Werkzeuge', () => {
  it('beim Entwickeln immer sichtbar', () => {
    expect(debugToolsVisible(true, '')).toBe(true);
  });

  it('im Build nur mit ?debug=1', () => {
    expect(debugToolsVisible(false, '')).toBe(false);
    expect(debugToolsVisible(false, '?seed=abc')).toBe(false);
    expect(debugToolsVisible(false, '?debug=0')).toBe(false);
    expect(debugToolsVisible(false, '?debug=1')).toBe(true);
    expect(debugToolsVisible(false, '?seed=abc&debug=1')).toBe(true);
  });
});
