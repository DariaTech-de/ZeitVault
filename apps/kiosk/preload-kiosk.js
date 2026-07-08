// Bruecke Kiosk-App -> Web-Kiosk: vom lokalen PC/SC-Agenten gelesene NFC-UIDs
// als DOM-Event `zeitvault:nfc` an die Web-Oberflaeche durchreichen (die
// Kiosk-Ansicht in apps/web lauscht darauf). Es werden keine Node-APIs an die
// Seite exponiert.
const { ipcRenderer } = require('electron');

ipcRenderer.on('zeitvault-nfc', (_event, uid) => {
  window.dispatchEvent(new CustomEvent('zeitvault:nfc', { detail: { uid: String(uid) } }));
});
