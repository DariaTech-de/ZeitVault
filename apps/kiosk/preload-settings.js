// Preload fuer das lokale Einrichtungsfenster (settings.html): stellt genau
// eine Funktion bereit, um die Server-URL zu speichern. Wird NICHT fuer die
// entfernte Kiosk-Seite verwendet (dort gilt preload-kiosk.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zvKiosk', {
  saveConfig: (serverUrl) => ipcRenderer.send('zeitvault:save-config', String(serverUrl)),
});
