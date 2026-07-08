# ZeitVault Terminal – Kiosk-App (Electron)

Installierbare Kiosk-App für **Windows** (und Linux) am Eingangs-Terminal. Sie
lädt die Kiosk-Ansicht (`/kiosk`) des konfigurierten ZeitVault-Servers im
Vollbild-Kiosk-Modus und bindet optional einen **lokalen NFC-Agenten** (PC/SC,
USB-Leser der ACR122U/ACR1252U-Klasse) an. Gelesene Chip-UIDs werden als
DOM-Event an die Web-Oberfläche durchgereicht, die daraufhin die Person
identifiziert (Foto + Begrüßung).

**Datenschutz (ADR-0015):** Diese App verarbeitet keine biometrischen Daten.
Fingerabdruck-Terminals gleichen ausschließlich gerätelokal ab; an den Server
gehen nur NFC-UIDs, Personalnummern bzw. aufgelöste Mitarbeiter-IDs.

> Dieses Paket ist bewusst **kein** pnpm-Workspace-Mitglied: Es wird auf dem
> Terminal-Gerät eigenständig installiert und hält Electron aus den
> Server-Builds heraus (`pnpm-workspace.yaml` schließt `apps/kiosk` aus).

## Entwicklung / Test

```bash
cd apps/kiosk
npm install
npm start
```

Beim ersten Start fragt die App die **Server-URL** ab (z. B.
`https://zeit.example.com`), danach öffnet sich die Kiosk-Ansicht; dort das
**Geräte-Token** aus *Verwaltung → Terminals* hinterlegen (wird lokal
gespeichert).

**Tastenkürzel (Wartung):** `Strg+Umschalt+K` = Einrichtung öffnen,
`Strg+Umschalt+Q` = App beenden.

## NFC-Leser

| Leser-Typ | Einrichtung |
|---|---|
| **Keyboard-Wedge** (tippt UID als Tastatur) | Keine – das Eingabefeld der Kiosk-Ansicht ist automatisch fokussiert. |
| **PC/SC** (ACR122U, ACR1252U, …) | Vor dem Paketieren `npm install nfc-pcsc` ausführen; die App erkennt das Paket automatisch (ohne bleibt der Agent still inaktiv). Windows: PC/SC-Dienst läuft ab Werk; Linux: `pcscd` installieren. |

UIDs werden überall auf **Hex, Kleinbuchstaben, ohne Trennzeichen** normalisiert
(gleiches Format in Verwaltung und Scan).

## Windows-Installer bauen

Auf einem Windows-Rechner (Node.js 24 LTS):

```powershell
cd apps\kiosk
npm install
npm install nfc-pcsc        # optional: nur fuer PC/SC-Leser
npm run dist:win            # erzeugt dist\ZeitVault Terminal Setup <version>.exe
```

Installer auf dem Terminal-PC ausführen; die App startet nach der Installation.
Für unbeaufsichtigten Betrieb: App in den **Autostart** legen (Startup-Ordner)
oder Windows **Assigned Access/Kiosk-Modus** mit dieser App konfigurieren.

## Android-Tablets

Für Android-Tablets ist **keine** App nötig: Chrome öffnen →
`https://<server>/kiosk` → das eingebaute NFC liest Chips direkt (Web NFC),
Vollbild über „Zum Startbildschirm hinzufügen" und Android-App-Pinning.
Details: [`docs/TERMINAL-KIOSK.md`](../../docs/TERMINAL-KIOSK.md).
