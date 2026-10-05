// Speicherort für Spielstände (2.14): Im Browser liegt der Spielstand im
// localStorage, in der Desktop-Fassung (Electron) als Datei im Benutzerordner.
// Das Spiel merkt davon nichts – es spricht nur mit diesem kleinen Speicher.

export interface SaveStore {
  read(name: string): string | null;
  write(name: string, text: string): void;
  remove(name: string): void;
}

/** Was die Desktop-Hülle (electron/preload.cjs) dem Spiel anbietet. */
export interface DesktopBridge {
  readSave(name: string): string | null;
  writeSave(name: string, text: string): boolean;
  removeSave(name: string): boolean;
}

interface StoreHost {
  crudeDesktop?: DesktopBridge;
  localStorage?: Storage;
}

/**
 * Wählt den Speicher: Desktop-Datei, wenn die Hülle da ist, sonst localStorage.
 * Fehler werden nicht verschluckt – das tun die Aufrufer.
 */
export function pickSaveStore(host: StoreHost): SaveStore {
  const desktop = host.crudeDesktop;
  if (desktop) {
    return {
      read: (name) => desktop.readSave(name),
      write: (name, text) => {
        if (!desktop.writeSave(name, text)) throw new Error('Spielstand konnte nicht geschrieben werden.');
      },
      remove: (name) => {
        desktop.removeSave(name);
      },
    };
  }
  return {
    read: (name) => host.localStorage!.getItem(name),
    write: (name, text) => host.localStorage!.setItem(name, text),
    remove: (name) => host.localStorage!.removeItem(name),
  };
}

/** Der Speicher dieses Fensters; erst beim ersten Gebrauch gewählt. */
export function saveStore(): SaveStore {
  return pickSaveStore(window as unknown as StoreHost);
}

/**
 * Kleine Vorlieben der Oberfläche (0.2.15+9), z. B. der zuletzt benutzte Reiter
 * eines Fensters. Kein Teil des Spielstands; ohne Speicher gilt die Wahl nur bis
 * zum Neuladen – darum schluckt dieser Zugriff jeden Fehler. 0.4.20+1: Bis zum Neuladen
 * merkt sich das Fenster die Wahl selbst. Im abgeschotteten iframe (Claude-Artefakt) ist
 * der localStorage gesperrt – vorher fing der Rundgang dort nach jedem Ende von vorn an.
 */
const merker = new Map<string, string>();

export function readPref(name: string): string | null {
  try {
    const value = saveStore().read(name);
    if (value !== null) return value;
  } catch {
    /* Kein Speicher – dann gilt, was sich das Fenster gemerkt hat. */
  }
  return merker.get(name) ?? null;
}

export function writePref(name: string, value: string): void {
  merker.set(name, value);
  try {
    saveStore().write(name, value);
  } catch {
    /* Kein Speicher – dann eben nur bis zum Neuladen. */
  }
}
