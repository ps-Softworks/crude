// Brücke zwischen Spiel und Desktop-Hülle (2.14): Das Spiel bekommt nur drei
// Befehle zum Lesen, Schreiben und Löschen von Spielständen, sonst nichts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crudeDesktop', {
  readSave: (name) => ipcRenderer.sendSync('crude-save-read', name),
  writeSave: (name, text) => ipcRenderer.sendSync('crude-save-write', name, text),
  removeSave: (name) => ipcRenderer.sendSync('crude-save-remove', name),
});
