// Desktop-Hülle (2.14): Electron öffnet das fertig gebaute Spiel aus dist/ in
// einem eigenen Fenster – ganz ohne Internet. Spielstände liegen als Datei im
// Benutzerordner (Windows: %APPDATA%\CRUDE\spielstaende, macOS:
// ~/Library/Application Support/CRUDE/spielstaende). Keine Spielregeln hier.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setName('CRUDE');

/** Nur einfache Namen erlaubt, damit niemand aus dem Ordner herausschreibt. */
function saveFile(name) {
  if (typeof name !== 'string' || !/^[a-z0-9._-]+$/i.test(name)) throw new Error('Ungültiger Name');
  return path.join(app.getPath('userData'), 'spielstaende', name + '.json');
}

ipcMain.on('crude-save-read', (event, name) => {
  try {
    event.returnValue = fs.readFileSync(saveFile(name), 'utf8');
  } catch {
    event.returnValue = null;
  }
});

ipcMain.on('crude-save-write', (event, name, text) => {
  try {
    const ziel = saveFile(name);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    // Erst in eine Hilfsdatei, dann umbenennen: Stürzt der PC mitten im
    // Schreiben ab, bleibt der alte Spielstand heil.
    const tmp = ziel + '.tmp';
    fs.writeFileSync(tmp, String(text), 'utf8');
    fs.renameSync(tmp, ziel);
    event.returnValue = true;
  } catch {
    event.returnValue = false;
  }
});

ipcMain.on('crude-save-remove', (event, name) => {
  try {
    fs.rmSync(saveFile(name), { force: true });
    event.returnValue = true;
  } catch {
    event.returnValue = false;
  }
});

// Vollbild aus den Einstellungen des Spiels.
ipcMain.on('crude-fullscreen-get', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = !!win && win.isFullScreen();
});

ipcMain.on('crude-fullscreen-set', (event, on) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setFullScreen(!!on);
  event.returnValue = !!win;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#efe4cc',
    title: 'CRUDE',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  // Links nach außen (z. B. Feedback) im normalen Browser öffnen, nicht im Spiel.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  // Entwickler-Werkzeuge mit F12 (hilft beim Fehlersuchen auf fremden PCs).
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.CRUDE_SMOKE) runSmokeTest(win);
}

// Selbsttest (CRUDE_SMOKE=1): Lädt das Spiel, prüft Titel und Speicher-Brücke,
// schreibt das Ergebnis in die Konsole und beendet sich wieder.
function runSmokeTest(win) {
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const ergebnis = await win.webContents.executeJavaScript(`(() => {
        const d = window.crudeDesktop;
        if (!d) return 'keine Brücke';
        d.writeSave('crude.selbsttest', 'ok');
        const gelesen = d.readSave('crude.selbsttest');
        d.removeSave('crude.selbsttest');
        const text = document.body.innerText.slice(0, 80).replace(/\\s+/g, ' ');
        return gelesen === 'ok' && d.readSave('crude.selbsttest') === null ? 'OK | ' + text : 'Speicher kaputt';
      })()`);
      console.log('CRUDE-SELBSTTEST: ' + ergebnis);
      console.log('CRUDE-SPIELSTAENDE: ' + path.join(app.getPath('userData'), 'spielstaende'));
    } catch (fehler) {
      console.log('CRUDE-SELBSTTEST: Fehler ' + fehler);
    }
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
