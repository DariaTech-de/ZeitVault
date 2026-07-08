# ZeitVault Terminal – Kiosk-Geräte einrichten (Tablet, Windows, Fingerprint)

Dieses Runbook beschreibt, wie Zeiterfassungs-Terminals am Eingang eingerichtet
werden. Mitarbeitende stempeln per **NFC-Chip**, **Personalnummer** oder
**Fingerabdruck**; nach dem Stempeln erscheinen Foto und eine persönliche
Begrüßung.

**Datenschutz-Grundsatz (ADR-0015):** Fingerabdrücke werden ausschließlich
**lokal auf dem Gerät** registriert und abgeglichen. Der Server erhält niemals
biometrische Daten – nur NFC-UIDs, Personalnummern oder die vom Gerät
aufgelöste Mitarbeiter-ID. Mitarbeiterfotos sind einfache Anzeigebilder, keine
Biometrie.

---

## 1. Terminal registrieren (einmalig, Verwaltung)

1. Als Administrator anmelden → **Verwaltung → Terminals**.
2. **Terminal registrieren** (z. B. „Eingang Haupttor") → das **Geräte-Token**
   wird **einmalig** angezeigt – sicher notieren.
3. Auf dem Terminal-Gerät `https://<server>/kiosk` öffnen und das Token
   hinterlegen (wird lokal auf dem Gerät gespeichert).

Kompromittierte Geräte lassen sich dort jederzeit **deaktivieren**.

## 2. NFC-Chips zuordnen (Verwaltung)

**Verwaltung → Terminals → NFC-Chip zuordnen:** UID eintragen (oder auf
Android-Geräten **Scannen** antippen und den Chip auflegen) und Mitarbeiter/in
wählen. UIDs werden automatisch normalisiert (Hex, Kleinbuchstaben, ohne
Trennzeichen) – Zuordnung und Scan verwenden damit dasselbe Format.

Empfohlene Chips: **NTAG213/215** (günstig) oder **MIFARE DESFire EV3**
(höhere Sicherheit). Hinweis: Ein Chip identifiziert den Chip, nicht zwingend
die Person (übertragbar) – für höhere Anforderungen Fingerprint-Terminal
ergänzen (Abschnitt 5).

## 3. Android-Tablet als Kiosk (empfohlen, keine Zusatzhardware)

1. Tablet mit NFC (z. B. Samsung Galaxy Tab A-Serie), Chrome.
2. `https://<server>/kiosk` öffnen, Geräte-Token hinterlegen.
3. NFC ist automatisch aktiv (**Web NFC**): Chip ans Tablet halten →
   Person erscheint mit Foto → Aktion antippen → Begrüßung.
4. Kiosk-Betrieb absichern: Chrome-Seite „Zum Startbildschirm hinzufügen" und
   Android **App-Pinning** (Einstellungen → Sicherheit → App-Pinning)
   aktivieren; Tablet an Strom, Display-Timeout hoch.

> Web NFC erfordert HTTPS (im Tunnel-/Domain-Modus gegeben) und Chrome auf
> Android. iPads unterstützen Web NFC nicht – dort Personalnummer nutzen oder
> die Windows-/Hardware-Variante wählen.

## 4. Windows-PC als Kiosk (Kiosk-App + USB-NFC-Leser)

Die Electron-Kiosk-App unter [`apps/kiosk`](../apps/kiosk/README.md) lädt die
Kiosk-Ansicht im Vollbild-Kiosk-Modus und bindet USB-NFC-Leser an:

- **Keyboard-Wedge-Leser** (tippen die UID als Tastatureingabe): funktionieren
  ohne weitere Einrichtung – das Eingabefeld ist automatisch fokussiert.
- **PC/SC-Leser** (ACR122U, ACR1252U, …): vor dem Paketieren
  `npm install nfc-pcsc` – der integrierte Agent meldet gelesene UIDs direkt an
  die Oberfläche.

Bauen/Installieren: siehe [`apps/kiosk/README.md`](../apps/kiosk/README.md)
(`npm run dist:win` erzeugt einen Windows-Installer). Für unbeaufsichtigten
Betrieb Autostart oder Windows Assigned Access verwenden.
Wartungs-Tastenkürzel: `Strg+Umschalt+K` (Einrichtung), `Strg+Umschalt+Q`
(beenden).

## 5. Fingerprint-Terminals (gerätelokal, ADR-0015)

Geeignet sind Geräte, die **on-device** enrollen und matchen (z. B.
**ZKTeco**- oder **Suprema**-Klasse) und nach erfolgreicher Erkennung einen
HTTP-Aufruf absetzen können. Integrationsvertrag:

```
POST https://<server>/api/kiosk/stamp
Header:  x-terminal-token: <Geräte-Token aus der Verwaltung>
         content-type: application/json
Body:    {"employeeId": "<Mitarbeiter-UUID>"}
   oder: {"personnelNumber": "<Personalnummer>"}
   optional zusätzlich: "kind": "clock_in" | "break_start" | "break_end" | "clock_out"
```

Ohne `kind` wählt der Server automatisch die nächste sinnvolle Aktion. Die
Antwort enthält Name, Personalnummer und den neuen Status (für die Anzeige am
Gerät). Zur Anzeige VOR dem Stempeln gibt es `POST /api/kiosk/identify`
(gleiche Authentifizierung/Payload ohne `kind`).

Enrollment der Fingerabdrücke erfolgt **am Gerät** nach Herstelleranleitung;
im Gerät wird der Person die ZeitVault-**Personalnummer** (oder Mitarbeiter-ID)
zugeordnet. Es gibt bewusst keine Fingerabdruck-Registrierung am Server.

## 6. Störungsbehebung

| Symptom | Ursache/Lösung |
|---|---|
| „Unbekannter NFC-Chip" | UID nicht zugeordnet → Verwaltung → Terminals → zuordnen. Formatabweichung ist ausgeschlossen (Normalisierung beidseitig). |
| Scan reagiert nicht (Android) | HTTPS erforderlich; Chrome verwenden; NFC in den Android-Einstellungen aktiv? |
| PC/SC-Leser wird nicht erkannt | `nfc-pcsc` beim Paketieren installiert? Windows-Dienst „Smart Card" läuft? Linux: `pcscd` aktiv? |
| „Terminal nicht bekannt oder deaktiviert" | Geräte-Token falsch/deaktiviert → neues Terminal registrieren, Token neu hinterlegen. |
| Foto erscheint nicht | Kein Foto hochgeladen (Verwaltung → Mitarbeitende) oder Format > 2 MiB. |

> Rechtlicher Hinweis: Dieses Dokument ersetzt keine Rechtsberatung. Einsatz
> biometrischer Verfahren und technischer Überwachungseinrichtungen ist
> mitbestimmungspflichtig (BetrVG Paragraf 87) und mit dem Datenschutz
> abzustimmen.
