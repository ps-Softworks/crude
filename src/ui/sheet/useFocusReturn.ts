// Fokus zurück (0.2.15+9): Wer ein Fenster öffnet, landet nach dem Schließen
// wieder dort, wo er war – auf dem Gegenstand am Schreibtisch. Wurde das Fenster
// über ein Kürzel geöffnet, springt der Fokus zum Gegenstand mit data-sheet.

import { useLayoutEffect, useRef } from 'react';

export function useFocusReturn(openId: string | null): void {
  const vorher = useRef<HTMLElement | null>(null);
  const erstes = useRef<string | null>(null);
  const zuletzt = useRef<string | null>(null);

  // Layout-Effekt: läuft, bevor das Fenster den Fokus an sich zieht – so stimmt „wer hatte ihn vorher“.
  useLayoutEffect(() => {
    const war = zuletzt.current;
    zuletzt.current = openId;
    if (war === null && openId !== null) {
      // Gerade aufgegangen: merken, wer den Fokus hatte und welches Fenster zuerst aufging.
      const aktiv = document.activeElement as HTMLElement | null;
      vorher.current = aktiv && aktiv !== document.body ? aktiv : null;
      erstes.current = openId;
    } else if (war !== null && openId === null) {
      // Gerade zugegangen. Lag der Fokus nur zufällig auf einem anderen Gegenstand
      // (Fenster per Kürzel geöffnet), gehört er dem Gegenstand dieses Fensters.
      const opener = vorher.current?.isConnected ? vorher.current : null;
      const gegenstand = document.querySelector<HTMLElement>(`.objekt[data-sheet="${erstes.current}"]`);
      const ziel = opener && !opener.classList.contains('objekt') ? opener : (gegenstand ?? opener);
      vorher.current = null;
      erstes.current = null;
      ziel?.focus({ preventScroll: true });
    }
  }, [openId]);
}
