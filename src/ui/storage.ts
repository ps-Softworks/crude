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
