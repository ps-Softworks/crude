// Vollbild (Einstellungen): im Browser über die Fullscreen-API, in der Desktop-Hülle (Electron)
// über den Befehl setFullScreen der Brücke (electron/preload.cjs). Der Knopf erscheint nur,
// wenn eines von beidem da ist. `host` ist austauschbar, damit es sich ohne Browser prüfen lässt.

import type { DesktopBridge } from './storage';

export interface FullscreenHost {
  crudeDesktop?: Partial<DesktopBridge>;
  document?: {
    fullscreenElement: unknown;
    fullscreenEnabled: boolean;
    documentElement: { requestFullscreen?: () => Promise<void> };
    exitFullscreen?: () => Promise<void>;
  };
}

function hostOf(): FullscreenHost {
  return window as unknown as FullscreenHost;
}

export function fullscreenAvailable(host: FullscreenHost = hostOf()): boolean {
  if (host.crudeDesktop?.setFullScreen) return true;
  const d = host.document;
  return !!d && d.fullscreenEnabled === true && typeof d.documentElement.requestFullscreen === 'function';
}

export function isFullscreen(host: FullscreenHost = hostOf()): boolean {
  try {
    if (host.crudeDesktop?.isFullScreen) return !!host.crudeDesktop.isFullScreen();
    return !!host.document?.fullscreenElement;
  } catch {
    return false;
  }
}

/** Schaltet das Vollbild um; Fehler (z. B. vom Browser abgelehnt) bleiben folgenlos. */
export function toggleFullscreen(host: FullscreenHost = hostOf()): void {
  try {
    const an = !isFullscreen(host);
    if (host.crudeDesktop?.setFullScreen) {
      host.crudeDesktop.setFullScreen(an);
      return;
    }
    const d = host.document;
    if (!d) return;
    const fertig = an ? d.documentElement.requestFullscreen?.() : d.exitFullscreen?.();
    void fertig?.catch(() => undefined);
  } catch {
    /* Kein Vollbild möglich – dann bleibt es beim Fenster. */
  }
}
