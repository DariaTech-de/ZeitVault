# ZeitVault – Bedienungshandbuch für Administratoren

> Dieses Handbuch erklärt Schritt für Schritt, wie ZeitVault im Alltag bedient
> und verwaltet wird. Es richtet sich an **Administratoren** und **Vorgesetzte**
> (Manager) und beschreibt ausschließlich Funktionen, die tatsächlich im Produkt
> umgesetzt sind. Die verbindliche technische Architektur steht in
> [`ARCHITEKTUR.md`](ARCHITEKTUR.md); die Inbetriebnahme in
> [`INBETRIEBNAHME.md`](INBETRIEBNAHME.md).
>
> **Rechtlicher Hinweis:** Die Zusammenfassungen arbeits-, steuer- und
> datenschutzrechtlicher Anforderungen dienen der Orientierung und **ersetzen
> keine Rechtsberatung**. Maßgeblich sind die offiziellen Quellen (ArbZG, GoBD,
> DSGVO/BDSG, DATEV-Schnittstellenbeschreibung).

---

## Inhaltsverzeichnis

1. [Einführung und Zielgruppe](#1-einführung-und-zielgruppe)
2. [Anmeldung, Rollen und Rechte](#2-anmeldung-rollen-und-rechte)
3. [Das Launchpad (Startseite)](#3-das-launchpad-startseite)
4. [Zeiterfassung – Stempeln](#4-zeiterfassung--stempeln)
5. [Zeitkorrektur – Anpassungsanträge](#5-zeitkorrektur--anpassungsanträge)
6. [Abwesenheiten](#6-abwesenheiten)
7. [Konten (Überstunden, Gleitzeit, Urlaub)](#7-konten-überstunden-gleitzeit-urlaub)
8. [Stammdaten und Arbeitszeitmodelle](#8-stammdaten-und-arbeitszeitmodelle)
9. [Auswertungen und Reports](#9-auswertungen-und-reports)
10. [Exporte (GoBD, Lohn/DATEV)](#10-exporte-gobd-lohndatev)
11. [Compliance und Aufbewahrung](#11-compliance-und-aufbewahrung)
12. [Sicherheit](#12-sicherheit)
13. [Betriebsmodelle und Funktionsschalter](#13-betriebsmodelle-und-funktionsschalter)
14. [Häufige Aufgaben (Schritt für Schritt)](#14-häufige-aufgaben-schritt-für-schritt)
15. [Fehlerbehebung und FAQ](#15-fehlerbehebung-und-faq)

---

## 1. Einführung und Zielgruppe

ZeitVault ist eine Enterprise-Zeiterfassung für den deutschen Markt. Aus einer
einzigen Codebasis wird das Produkt wahlweise **selbst gehostet (On-Premises)**
oder als **Cloud-/SaaS-Dienst** betrieben. Es erfüllt arbeits-, steuer- und
datenschutzrechtliche Anforderungen und liefert revisionssichere Daten sowie
Steuerberater-Exporte.

Dieses Handbuch begleitet zwei Rollen:

- **Administrator:** verwaltet Stammdaten, Arbeitszeitmodelle, Rechte, Exporte,
  Aufbewahrung und Betrieb.
- **Vorgesetzte/r (Manager):** genehmigt Abwesenheiten und Anpassungsanträge,
  bucht Kontenkorrekturen und sieht Auswertungen des eigenen Bereichs.

Mitarbeitende nutzen dieselbe Anwendung im Self-Service (Stempeln, eigene
Anträge, eigene Salden).

---

## 2. Anmeldung, Rollen und Rechte

### 2.1 Anmeldung

Die Anmeldung erfolgt über den zentralen Identitätsanbieter (Keycloak, OIDC).
Nach erfolgreicher Anmeldung wird der angemeldete Nutzer automatisch dem
richtigen Mitarbeiterdatensatz und Mandanten zugeordnet. Für Administratoren ist
**Mehrfaktor-Authentifizierung (MFA) Pflicht**.

### 2.1.1 Anmeldung per Passkey (passwortlos)

Zusätzlich zum Passwort ist die Anmeldung per **Passkey** (WebAuthn/FIDO2)
möglich. Ein Passkey ist ein gerätegebundenes Schlüsselpaar (z. B. Windows
Hello, Touch ID/Face ID, Android oder ein Sicherheitsschlüssel); der private
Schlüssel verlässt das Gerät nie und ist phishing-resistent. Biometrische
Merkmale bleiben ausschließlich lokal auf dem Gerät – der Server speichert nur
den öffentlichen Schlüssel (Datensparsamkeit).

**Passkey registrieren:** In der Konto-Konsole des Identitätsanbieters
(`/realms/zeitvault/account`, Bereich „Anmeldung") den Punkt „Passkey"/„Sicherheitsschlüssel"
hinzufügen und der Aufforderung des Geräts folgen.

**Mit Passkey anmelden:** Auf der Anmeldeseite den Benutzernamen eingeben und
statt des Passworts den Passkey wählen. Die Passwort-Anmeldung bleibt als
Alternative erhalten (Wiederherstellung bei Geräteverlust). In Produktion muss
die Anmeldeseite über HTTPS erreichbar sein (Voraussetzung von WebAuthn).

> Details: [`adr/0012-passkey-webauthn-login.md`](adr/0012-passkey-webauthn-login.md).

> Details zur Auth-Strecke: [`adr/0008-auth-keycloak-oidc-saml.md`](adr/0008-auth-keycloak-oidc-saml.md).

### 2.2 Rollenmodell (RBAC)

Es gibt drei Kernrollen. Jede Aktion in der Anwendung ist an eine Rolle
gebunden:

| Rolle | Darf insbesondere |
|---|---|
| `employee` | Eigene Zeit stempeln, eigene Anpassungs- und Abwesenheitsanträge stellen, eigene Salden und den eigenen Kontoauszug sehen |
| `manager` | Zusätzlich: Anpassungsanträge und Abwesenheiten freigeben/ablehnen, Kontenbuchungen vornehmen, Bereichs-Auswertungen (Verstöße, Salden) sehen, Exporte anstoßen |
| `admin` | Zusätzlich: Stammdaten und Arbeitszeitmodelle verwalten, Rechte ändern, Aufbewahrung/Anonymisierung steuern, Systemübersicht sehen |

Die Rollen werden im Identitätsanbieter gepflegt und im Zugriffstoken
mitgeführt. Ein Request ohne gültigen Mandantenkontext wird abgelehnt; die
Mandantentrennung wird zusätzlich auf Datenbankebene erzwungen (Row-Level
Security). Das gilt auch im Self-Hosted-Betrieb (dort läuft alles unter dem
Mandanten `default`).

> Hintergrund: [`adr/0004-mandantenfaehigkeit-postgres-rls.md`](adr/0004-mandantenfaehigkeit-postgres-rls.md).

---

## 3. Das Launchpad (Startseite)

Nach der Anmeldung öffnet sich das **Launchpad** (Menüpunkt „Start"). Es zeigt
rollenabhängig Kacheln und Kennzahlen:

- **Heute:** aktueller Stempelstatus (abwesend / anwesend / Pause), gearbeitete
  Zeit und Pausen des laufenden Tages.
- **Meine Salden:** Überstunden-, Gleitzeit- und Urlaubskonto.
- **Abwesenheiten:** offene und genehmigte Anträge.
- **Für Vorgesetzte/Admins:** zusätzliche Kacheln für offene Genehmigungen,
  Verstöße und Salden des Bereichs.

Über die Kopfzeile (ShellBar) erreichen Sie jederzeit die Bereiche, die
Suchfunktion, den Wechsel zwischen hellem und dunklem Design sowie das
Abmelden.

---

## 4. Zeiterfassung – Stempeln

### 4.1 Stempelaktionen

Die Zeiterfassung kennt vier Aktionen: **Kommen**, **Pause Beginn**,
**Pause Ende**, **Gehen**. Sie erzeugen Stempelereignisse in einer gültigen
Tagesfolge. Ungültige Übergänge (z. B. „Gehen" ohne vorheriges „Kommen") werden
abgelehnt.

### 4.2 Unveränderbarkeit (Kern-Invariante 1)

Ein einmal erfasstes Stempelereignis (`TimeEntry`) wird **niemals überschrieben
oder gelöscht**. Eine Korrektur erzeugt stets einen **neuen** Datensatz mit
erhöhter Revision, einem Verweis auf den Vorgänger und einer Pflicht-Begründung.
So bleibt jede Änderung nachvollziehbar (GoBD-Unveränderbarkeit).

### 4.3 Hinweise und Verstöße

Bei der Erfassung prüft die Compliance-Engine Regeln (z. B. Höchstarbeitszeit,
Ruhezeiten, Pausen). Auffälligkeiten erscheinen als **Hinweis** (`warning`) oder
**Verstoß** (`violation`) und fließen in den Verstoßreport ein (siehe
[Abschnitt 9](#9-auswertungen-und-reports)).

---

## 5. Zeitkorrektur – Anpassungsanträge

Menüpunkt **„Zeitkorrektur"**. Dieser Bereich bildet den Fall „Stempel
vergessen" vollständig ab.

### 5.1 Ablauf aus Sicht der Mitarbeitenden

1. Bereich „Zeitkorrektur" öffnen.
2. Im Formular **Stempelart** (Kommen / Pause Beginn / Pause Ende / Gehen),
   **Zeitpunkt** und eine **Begründung** angeben.
3. **„Antrag senden"**. Der Antrag erscheint mit Status **„Beantragt"** in der
   Liste. Es wird **noch kein** Stempel erzeugt.

### 5.2 Ablauf aus Sicht der Vorgesetzten

1. In der Liste die offenen Anträge prüfen (Status „Beantragt").
2. **„Freigeben"** erzeugt den Stempel als neue Revision (append-only) nach
   Prüfung der Tagesfolge. Ergibt der Nachtrag keine gültige Tagesfolge, wird
   die Freigabe abgelehnt und der Antrag bleibt offen.
3. **„Ablehnen"** schließt den Antrag ohne Stempeländerung.

### 5.3 Revisionssicherheit

Sowohl der Antrag als auch der bei Freigabe erzeugte Stempel werden
revisionssicher protokolliert: Es entstehen unveränderliche Audit-Ereignisse
(`time.correction_request`, `time.correct` bzw. `time.correction_reject`). Der
Vorgänger-Stempel bleibt erhalten – nichts wird überschrieben.

---

## 6. Abwesenheiten

Menüpunkt **„Abwesenheit"**. Unterstützt werden die Typen **Urlaub**,
**Krankheit** und **Sonderurlaub**.

### 6.1 Antrag stellen (Mitarbeitende)

1. Typ, Von-/Bis-Datum und optional eine Begründung angeben.
2. Antrag senden. Status ist zunächst **„Beantragt"**.

### 6.2 Entscheiden (Vorgesetzte)

- **Genehmigen** oder **Ablehnen** eines offenen Antrags.
- Mitarbeitende können eigene Anträge **stornieren**, solange sie offen sind.

Jede Entscheidung wird protokolliert. Genehmigte Urlaubsanträge wirken auf das
Urlaubskonto (siehe [Abschnitt 7](#7-konten-überstunden-gleitzeit-urlaub)).

---

## 7. Konten (Überstunden, Gleitzeit, Urlaub)

Menüpunkt **„Konten"**. Es werden drei Kontoarten geführt: **Überstunden**
(`overtime`), **Gleitzeit** (`flextime`) und **Urlaub** (`vacation`).

- **Salden:** aktueller Stand je Konto.
- **Kontoauszug:** chronologische Buchungen mit laufendem Saldo, Stichtag und
  Grund.
- **Buchung erfassen (nur Vorgesetzte/Admins):** manuelle Korrekturbuchung mit
  Konto, Betrag, Stichtag und Grund. Buchungen werden protokolliert.

---

## 8. Stammdaten und Arbeitszeitmodelle

Menüpunkt **„Verwaltung"** (nur Vorgesetzte/Admins).

### 8.1 Mitarbeitende

- **Übersicht** aller Mitarbeitenden mit Personalnummer und Anzeigename.
- Auswahl einer Person zeigt deren Tagesereignisse (Master-Detail-Ansicht) und
  ermöglicht die Prüfung der Stempel.

### 8.2 Arbeitszeitmodelle (Admin)

Arbeitszeitmodelle definieren die **Sollzeit je Wochentag** (in Minuten) und
sind **versioniert**. Änderungen erzeugen eine neue Version; bestehende
Auswertungen bleiben reproduzierbar.

### 8.3 Feiertage und Zuschläge

- **Feiertage** werden je Region geführt und in die Regelprüfung einbezogen.
- **Zuschläge** (z. B. Nacht, Sonn-/Feiertag) werden als Regeln gepflegt.

> Die Regel-/Compliance-Engine ist deklarativ und versioniert:
> [`adr/0009-compliance-regel-engine.md`](adr/0009-compliance-regel-engine.md).

---

## 9. Auswertungen und Reports

Menüpunkt **„Auswertungen"** (nur Vorgesetzte/Admins).

- **Arbeitszeitnachweis (Timesheet):** Stempel und Zeiten je Mitarbeitenden im
  gewählten Zeitraum.
- **Verstoßreport:** alle Hinweise und Verstöße im Zeitraum (Von/Bis), gruppiert
  je Mitarbeitenden und Tag. Grundlage für die arbeitszeitrechtliche Prüfung.
- **Saldenliste:** Überstunden-, Gleitzeit- und Urlaubssalden aller
  Mitarbeitenden auf einen Blick.

---

## 10. Exporte (GoBD, Lohn/DATEV)

Menüpunkt „Auswertungen" bzw. Exportfunktion (nur Vorgesetzte/Admins).

### 10.1 GoBD-Export

Erzeugt einen revisionssicheren Datenexport für die steuerliche Aufbewahrung.
Der Export ist nachvollziehbar und wird als Export-Auftrag protokolliert.

### 10.2 Lohn-/DATEV-Export

Erzeugt die Grundlage für die Lohnabrechnung bzw. den Steuerberater-Export.

> **Wichtig:** Konkrete DATEV-Feldlayouts werden **nicht erfunden**. Maßgeblich
> ist ausschließlich die offizielle DATEV-Schnittstellenbeschreibung; die
> Mapping-Tabellen werden daraus abgeleitet. Siehe
> [`compliance/DATEV-REFERENZ.md`](compliance/DATEV-REFERENZ.md) und
> [`adr/0011-datev-mapping-geruest-generischer-export.md`](adr/0011-datev-mapping-geruest-generischer-export.md).

### 10.3 Export-Historie

Alle Export-Aufträge werden mit Zeitpunkt und Umfang aufgelistet, sodass
nachvollziehbar bleibt, wer wann was exportiert hat.

---

## 11. Compliance und Aufbewahrung

Menüpunkt „Verwaltung" (nur Admins).

### 11.1 Aufbewahrung statt Löschung (Kern-Invariante 4)

Aufbewahrungspflichtige Daten werden **nicht hart gelöscht**. Bei Austritt oder
Löschanfrage werden sie **gesperrt/pseudonymisiert** und erst nach Ablauf der
gesetzlichen Aufbewahrungsfrist automatisiert gelöscht. So wird das
Spannungsfeld zwischen DSGVO-Löschung und steuerlicher Aufbewahrung (GoBD)
aufgelöst.

### 11.2 Vorgänge

- **Mitarbeitenden sperren:** Zugriff und Verarbeitung werden eingeschränkt, die
  Daten bleiben für die Aufbewahrung erhalten.
- **Mitarbeitenden anonymisieren/pseudonymisieren:** personenbezogene Merkmale
  werden ersetzt; revisionssichere Fakten bleiben erhalten.
- **Fällige Löschungen:** Übersicht der Datensätze, deren Aufbewahrungsfrist
  abgelaufen ist.

> Hintergrund: [`compliance/DSGVO.md`](compliance/DSGVO.md),
> [`compliance/GoBD.md`](compliance/GoBD.md).

---

## 12. Sicherheit

Sicherheit hat in ZeitVault oberste Priorität. Die wichtigsten Prinzipien:

- **Manipulationsevidentes Audit-Ledger:** Jede lohn-/sicherheitsrelevante
  Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteänderung) schreibt
  ein unveränderliches, hash-verkettetes Audit-Ereignis in ein **getrenntes,
  append-only** Ledger. Eine Manipulation älterer Einträge bricht die Hash-Kette
  und ist sofort erkennbar.
- **Mandantentrennung auf DB-Ebene (RLS):** auch bei einem Anwendungsfehler
  bleiben Mandanten isoliert.
- **Minimale Rechte (Least Privilege):** der Anwendungs-Datenbankbenutzer darf
  Audit-Ereignisse nur einfügen, nicht ändern oder löschen. MFA-Pflicht für
  Administratoren.
- **Datensparsamkeit:** es wird nur erhoben und protokolliert, was nötig ist.
  Jeder lesende Zugriff auf personenbezogene Daten wird protokolliert.
- **GPS/Geofencing standardmäßig deaktiviert (Kern-Invariante 5):** Standort-
  daten werden nur nach Betriebsvereinbarung aktiviert – keine heimliche
  Überwachung (Mitbestimmung nach BetrVG § 87).

> Details: [`../SECURITY.md`](../SECURITY.md),
> [`adr/0006-audit-ledger-append-only.md`](adr/0006-audit-ledger-append-only.md).

---

## 13. Betriebsmodelle und Funktionsschalter

ZeitVault läuft aus einer Codebasis in zwei Betriebsmodellen:

- **Self-Hosted (On-Premises):** ein Mandant (`default`), volle Datenhoheit.
- **Cloud/SaaS:** mehrere Mandanten, zusätzliche Funktionen wie Registrierung
  und Abrechnung.

Der Betriebsmodus und einzelne **Funktionsschalter** (z. B. Registrierung,
Abrechnung, Telemetrie) werden über die Konfiguration gesteuert und sind aus
Gründen der Datensparsamkeit standardmäßig **deaktiviert**. Die aktuell aktiven
Funktionen lassen sich über die System-/Info-Ansicht einsehen.

> Hintergrund: [`adr/0010-eine-codebasis-zwei-betriebsmodelle.md`](adr/0010-eine-codebasis-zwei-betriebsmodelle.md).

### 13.1 Lizenzierung und Sitzplätze

ZeitVault wird **pro Mitarbeitenden (Sitzplatz)** als Paket lizenziert (z. B.
5/10/15 oder mehr). Menüpunkt **„Lizenz"** (nur Vorgesetzte/Admins) zeigt den
Status: Paket, belegte/verfügbare Sitzplätze und Gültigkeit.

- **Sitzplatzzählung:** „Belegt" ist die Anzahl **aktiver** Mitarbeitender.
  Gesperrte oder pseudonymisierte Mitarbeitende zählen nicht.
- **Durchsetzung:** Ist das Kontingent erschöpft, lehnt das System das Anlegen
  weiterer Mitarbeitender ab. Für mehr Sitzplätze eine größere Lizenz aktivieren.
- **Lizenz aktivieren (Admin):** Das vom Hersteller ausgestellte, **signierte
  Lizenz-Token** im Feld „Lizenz aktivieren" einfügen. Der Server prüft Signatur,
  Mandant und Laufzeit **offline** (kein Phone-Home) und protokolliert die
  Aktivierung revisionssicher.
- **Testmodus:** Ohne gültige Lizenz gilt ein kleines Sitzplatz-Kontingent, damit
  Ersteinrichtung und Demo möglich bleiben; der Status weist dies als „Testmodus"
  aus.

> Der private Signaturschlüssel liegt ausschließlich beim Hersteller; beim Kunden
> wird nur der öffentliche Schlüssel konfiguriert. Details:
> [`adr/0013-lizenzierung-pro-mitarbeiter.md`](adr/0013-lizenzierung-pro-mitarbeiter.md).

### 13.2 Standort-Prüfung (Geofencing)

Menüpunkt **„Standort"** (nur Vorgesetzte/Admins). Optional kann beim Stempeln
geprüft werden, ob sich Mitarbeitende an einem hinterlegten Betriebsstandort
befinden.

- **Standardmäßig deaktiviert (Kern-Invariante 5):** Die Prüfung ist aus und darf
  **nur nach Betriebsvereinbarung** aktiviert werden (Mitbestimmung, BetrVG § 87).
  Ist sie aus, werden keinerlei Standortdaten erhoben oder ausgewertet.
- **Standorte:** Je Standort werden Mittelpunkt (Breite/Länge) und Radius in
  Metern hinterlegt.
- **Prüfergebnis:** Beim Stempeln wird die Position (sofern die App sie sendet)
  gegen die Standorte geprüft. Gespeichert wird nur das Ergebnis (im Standort /
  außerhalb / ohne Signal), der getroffene Standort und die gerundete Distanz –
  **keine rohen Koordinaten** (Datensparsamkeit).
- **Kennzeichnen („blinken"):** Auffällige Stempel (außerhalb / ohne Signal)
  werden hervorgehoben. Die Administration kann einen Stempel zur Nachverfolgung
  kennzeichnen; der Stempel selbst bleibt unverändert (append-only).

> Aktivierung und Kennzeichnung werden revisionssicher protokolliert. Details:
> [`adr/0014-standort-pruefung-geofence-opt-in.md`](adr/0014-standort-pruefung-geofence-opt-in.md).

---

## 14. Häufige Aufgaben (Schritt für Schritt)

**Einen vergessenen Stempel nachtragen lassen (als Vorgesetzte/r):**
Bereich „Zeitkorrektur" → offenen Antrag prüfen → „Freigeben". Der Stempel wird
append-only erzeugt und protokolliert.

**Einen Urlaubsantrag genehmigen:**
Bereich „Abwesenheit" → Antrag mit Status „Beantragt" öffnen → „Genehmigen".

**Eine Kontenkorrektur buchen:**
Bereich „Konten" → „Buchung erfassen" → Konto, Betrag, Stichtag und Grund
angeben → speichern.

**Einen Verstoßreport erstellen:**
Bereich „Auswertungen" → „Verstoßreport" → Zeitraum (Von/Bis) wählen.

**Einen GoBD- oder Lohn-Export anstoßen:**
Bereich „Auswertungen"/Export → gewünschten Export wählen → Zeitraum bestätigen.
Der Auftrag erscheint in der Export-Historie.

**Einen ausgetretenen Mitarbeitenden datenschutzkonform behandeln:**
Bereich „Verwaltung" → Mitarbeitenden „sperren", bei Bedarf
„anonymisieren/pseudonymisieren". Die Daten bleiben bis zum Fristablauf
aufbewahrt und werden dann automatisiert gelöscht.

**Ein Arbeitszeitmodell anpassen:**
Bereich „Verwaltung" → Arbeitszeitmodelle → neue Version mit geänderten
Sollzeiten anlegen. Die alte Version bleibt für Auswertungen erhalten.

**Eine Lizenz aktivieren und Sitzplätze belegen:**
Bereich „Lizenz" → signiertes Lizenz-Token einfügen → „Lizenz aktivieren". Danach
unter „Mitarbeitende/n anlegen" neue Personen hinzufügen; jede belegt einen
Sitzplatz. Ist das Kontingent voll, eine größere Lizenz aktivieren.

---

## 15. Fehlerbehebung und FAQ

**Ich kann einen Antrag nicht freigeben.**
Freigeben/Ablehnen ist nur für die Rollen `manager` und `admin` sichtbar. Prüfen
Sie Ihre Rolle. Führt der Nachtrag zu einer ungültigen Tagesfolge, wird die
Freigabe abgelehnt – prüfen Sie die bereits vorhandenen Stempel des Tages.

**Warum sehe ich manche Bereiche nicht?**
Die Navigation ist rollenabhängig. „Verwaltung" und „Auswertungen" sind nur für
Vorgesetzte/Admins sichtbar.

**Kann ich einen falschen Stempel löschen?**
Nein. Stempel werden nie gelöscht oder überschrieben. Korrigieren Sie über eine
neue Revision (Anpassungsantrag mit Freigabe).

**Kann ich ein Audit-Ereignis nachträglich ändern?**
Nein. Das Audit-Ledger ist append-only und hash-verkettet. Änderungen sind
technisch ausgeschlossen und würden die Kette sichtbar brechen.

**Wo sehe ich, ob GPS/Standort aktiv ist?**
Im Bereich „Standort" zeigt der Status, ob die Prüfung aktiv ist. GPS/Geofencing
ist standardmäßig deaktiviert und wird nur nach Betriebsvereinbarung
eingeschaltet.

---

*Stand: 2026-07-06 · Dieses Handbuch beschreibt den implementierten
Funktionsumfang. Bei Abweichungen zwischen Handbuch und Architektur ist
[`ARCHITEKTUR.md`](ARCHITEKTUR.md) maßgeblich.*
