import { describe, expect, it, vi } from 'vitest';
import { fullscreenAvailable, isFullscreen, toggleFullscreen, type FullscreenHost } from './fullscreen';

describe('Vollbild', () => {
  it('ist ohne Browser-API und ohne Hülle nicht verfügbar', () => {
    expect(fullscreenAvailable({})).toBe(false);
    expect(fullscreenAvailable({ document: { fullscreenElement: null, fullscreenEnabled: false, documentElement: {} } })).toBe(false);
  });

  it('nutzt die Hülle (Electron), wenn sie es kann', () => {
    let an = false;
    const host: FullscreenHost = { crudeDesktop: { isFullScreen: () => an, setFullScreen: vi.fn((x: boolean) => ((an = x), true)) } };
    expect(fullscreenAvailable(host)).toBe(true);
    toggleFullscreen(host);
    expect(isFullscreen(host)).toBe(true);
    toggleFullscreen(host);
    expect(isFullscreen(host)).toBe(false);
  });

  it('nutzt sonst die Fullscreen-API des Browsers', () => {
    const request = vi.fn(() => Promise.resolve());
    const host: FullscreenHost = { document: { fullscreenElement: null, fullscreenEnabled: true, documentElement: { requestFullscreen: request } } };
    expect(fullscreenAvailable(host)).toBe(true);
    toggleFullscreen(host);
    expect(request).toHaveBeenCalled();
  });

  it('schluckt Fehler des Browsers', () => {
    const host: FullscreenHost = {
      document: { fullscreenElement: null, fullscreenEnabled: true, documentElement: { requestFullscreen: () => Promise.reject(new Error('nein')) } },
    };
    expect(() => toggleFullscreen(host)).not.toThrow();
  });
});
