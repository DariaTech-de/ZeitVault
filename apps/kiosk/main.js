// ZeitVault Terminal - Kiosk-App (Electron).
//
// Laedt die Kiosk-Ansicht (/kiosk) des konfigurierten ZeitVault-Servers im
// Vollbild-Kiosk-Modus und bindet optional einen lokalen PC/SC-NFC-Agenten an
// (USB-Leser der ACR122U-Klasse; gelesene UIDs gehen als DOM-Event
// `zeitvault:nfc` an die Web-Oberflaeche). Fingerabdruecke werden gemaess
// ADR-0015 ausschliesslich geraetelokal verarbeitet - diese App sendet nur
// UIDs bzw. aufgeloeste IDs, niemals biometrische Daten.
//
// Wartung: Strg+Umschalt+K oeffnet die Einrichtung, Strg+Umschalt+Q beendet.

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let win = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (typeof cfg.serverUrl === 'string' && /^https?:\/\//.test(cfg.serverUrl)) {
      return cfg;
    }
  } catch {
    /* keine/ungueltige Konfiguration -> Einrichtungsfenster anzeigen */
  }
  return null;
}

function saveConfig(cfg) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function createSettingsWindow() {
  const w = new BrowserWindow({
    width: 560,
    height: 500,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.loadFile(path.join(__dirname, 'settings.html'));
  return w;
}

function createKioskWindow(serverUrl) {
  const target = new URL('/kiosk', serverUrl);
  const w = new BrowserWindow({
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload-kiosk.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Navigation nur innerhalb des konfigurierten Ursprungs; keine Popups.
  w.webContents.on('will-navigate', (event, url) => {
    let origin = '';
    try {
      origin = new URL(url).origin;
    } catch {
      /* ungueltige URL -> blockieren */
    }
    if (origin !== target.origin) event.preventDefault();
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.loadURL(target.toString());
  return w;
}

/**
 * Optionaler PC/SC-NFC-Agent: aktiv, wenn das Paket `nfc-pcsc` installiert ist
 * (siehe README). Ohne das Paket bleibt die App voll funktionsfaehig -
 * USB-Leser im Tastatur-Modus (Keyboard-Wedge) tippen die UID direkt in das
 * fokussierte Eingabefeld der Kiosk-Ansicht.
 */
function startNfcAgent() {
  let NFC;
  try {
    ({ NFC } = require('nfc-pcsc'));
  } catch {
    console.log(
      '[kiosk] nfc-pcsc nicht installiert - PC/SC-Agent inaktiv (Keyboard-Wedge-Leser funktionieren trotzdem).',
    );
    return;
  }
  const nfc = new NFC();
  nfc.on('reader', (reader) => {
    console.log(`[kiosk] NFC-Leser verbunden: ${reader.reader.name}`);
    reader.on('card', (card) => {
      const uid = String(card.uid || '');
      if (uid && win && !win.isDestroyed()) {
        win.webContents.send('zeitvault-nfc', uid);
      }
    });
    reader.on('error', (err) => console.error('[kiosk] NFC-Leser-Fehler:', err.message));
    reader.on('end', () => console.log('[kiosk] NFC-Leser getrennt.'));
  });
  nfc.on('error', (err) => console.error('[kiosk] PC/SC-Fehler:', err.message));
}

app.whenReady().then(() => {
  ipcMain.on('zeitvault:save-config', (_event, serverUrl) => {
    if (typeof serverUrl !== 'string' || !/^https?:\/\//.test(serverUrl)) return;
    const normalized = serverUrl.replace(/\/+$/, '');
    saveConfig({ serverUrl: normalized });
    const old = win;
    win = createKioskWindow(normalized);
    if (old && !old.isDestroyed()) old.close();
  });

  // Wartungs-Ausstieg fuer Administratoren (Kiosk verlassen bzw. beenden).
  globalShortcut.register('Control+Shift+K', () => {
    const old = win;
    win = createSettingsWindow();
    if (old && !old.isDestroyed()) old.close();
  });
  globalShortcut.register('Control+Shift+Q', () => app.quit());

  const cfg = loadConfig();
  win = cfg ? createKioskWindow(cfg.serverUrl) : createSettingsWindow();
  startNfcAgent();
});

app.on('window-all-closed', () => {
  // Kiosk-Betrieb: alle Fenster zu = App beenden (Neustart via Autostart).
  app.quit();
});
