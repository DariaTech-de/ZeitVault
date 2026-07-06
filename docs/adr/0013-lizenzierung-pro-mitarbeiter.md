# ADR-0013: Lizenzierung pro Mitarbeiter (signierte Sitzplätze, offline verifizierbar)

**Status:** Akzeptiert - 2026-07-06

## Kontext

ZeitVault soll pro Mitarbeitenden (Sitzplatz/„seat") als Paket verkauft werden
(z. B. 5/10/15/mehr). Daraus ergeben sich mehrere Kräfte:

- **Zwei Betriebsmodelle, ein Code (Paragraf 2, [ADR-0010](0010-eine-codebasis-zwei-betriebsmodelle.md)):**
  Die Lizenzprüfung muss im **Self-Hosted-Betrieb ohne Internetzugang**
  funktionieren. Ein Phone-Home an einen Lizenzserver scheidet damit als
  Pflichtmechanismus aus – Zielkunden mit voller Datenhoheit dürfen für den
  Betrieb keine ausgehende Verbindung benötigen.
- **Manipulationssicherheit (Paragraf 11):** Ein self-hosteter Kunde hat vollen
  Zugriff auf Datenbank und Anwendung. Die Sitzplatzgrenze darf nicht allein aus
  einem DB-Wert stammen, den der Betreiber beliebig hochsetzen kann; die
  Entitlement-Daten müssen **kryptografisch vom Hersteller signiert** und im
  Anwendungscode gegen einen öffentlichen Schlüssel prüfbar sein.
- **Keine Geheimnisse im Repo (Abschnitt 7, [ADR-0007](0007-osi-permissive-bausteine.md)):**
  Der zum Signieren nötige private Schlüssel darf nie im Repository liegen. Der
  öffentliche Schlüssel (kein Geheimnis) wird beim Kunden konfiguriert.
- **Revisionssicherheit (Kern-Invariante 2, [ADR-0006](0006-audit-ledger-append-only.md)):**
  Das Aktivieren einer Lizenz ist eine sicherheitsrelevante Aktion und muss ein
  unveränderliches AuditEvent erzeugen.
- **Mandantentrennung (Kern-Invariante 3, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)):**
  Im Cloud-Betrieb hat jeder Mandant seine eigene Lizenz; die Lizenzdaten liegen
  unter RLS.
- **Ersteinrichtung darf nicht blockieren:** Ohne hinterlegte Lizenz muss eine
  begrenzte Einrichtung/Demo möglich sein, ohne dass gleich alles gesperrt ist.

## Entscheidung

Eine Lizenz ist ein **offline verifizierbares, mit Ed25519 signiertes Token** je
Mandant. Konkret:

- **Token-Format:** `base64url(JSON(payload)).base64url(ed25519-signature)`. Der
  Payload enthält `licenseId`, `tenantId`, `customer`, `tier`, `seats`,
  `issuedAt`, `validUntil`, `features`.
- **Verifikation im Server:** Die API prüft die Signatur mit dem konfigurierten
  öffentlichen Schlüssel (`LICENSE_PUBLIC_KEY`, PEM). Zusätzlich werden Mandant
  (`tenantId` == aktueller Mandant) und Laufzeit (`validUntil` in der Zukunft)
  geprüft. Kein Phone-Home.
- **Speicherung:** Genau eine aktive Lizenz je Mandant in der Tabelle `licenses`
  (Upsert bei erneutem Upload), unter RLS. Das gespeicherte Token wird bei jedem
  Statusaufruf erneut verifiziert (Schutz gegen DB-Manipulation).
- **Sitzplatz-Durchsetzung:** „Belegt" = Anzahl **aktiver** Mitarbeitender
  (`status = 'active'`). Vor dem Anlegen/Aktivieren eines Mitarbeitenden prüft
  der Server, ob noch ein Sitzplatz frei ist; sonst 409. Gesperrte/anonymisierte
  Mitarbeitende zählen nicht (konsistent mit der Retention-Engine,
  Kern-Invariante 4).
- **Testmodus:** Ohne gültige Lizenz gilt ein konfigurierbares Kontingent
  (`LICENSE_GRACE_SEATS`, Default 5), damit Ersteinrichtung und Demo möglich
  sind. Der Status weist „Testmodus" klar aus.
- **Ausstellung nur beim Hersteller:** Der private Schlüssel liegt ausschließlich
  bei DariaTech (OpenBao/SOPS) und nie im Repo. Das Werkzeug
  `apps/api/src/licensing/issue-license.ts` signiert Lizenzen; den öffentlichen
  Schlüssel konfiguriert der Kunde.
- **Audit:** Jede Aktivierung schreibt `license.activate`, jede Anlage eines
  Mitarbeitenden `employee.create` in das Audit-Ledger.

Dies ist eine **Durchsetzungs-/Mechanik-Entscheidung**, keine Wahl des
kommerziellen Lizenzmodells der Software selbst (das bleibt eine offene
DariaTech-Produktentscheidung, Paragraf 19; es wird hier keine Software-Lizenz
festgelegt).

## Begründung

- **Offline-fähig und manipulationssicher zugleich:** Ed25519-Signaturen sind
  kompakt und schnell; die Prüfung braucht nur den öffentlichen Schlüssel und
  keinen Netzzugang. Ein Betreiber kann die `seats` in der DB nicht erhöhen, ohne
  die Signatur zu brechen – der Statusaufruf verifiziert das Token erneut und
  fällt bei Manipulation in den Testmodus.
- **Konsistent mit den Kern-Invarianten:** Zählung über den
  Mitarbeiter-Lebenszyklus (aktiv/gesperrt/anonymisiert) nutzt dieselbe Wahrheit
  wie die Retention-Engine; Aktivierung und Anlage sind revisionssicher
  protokolliert.
- **Keine Secrets im Repo:** Nur der öffentliche Schlüssel wird ausgeliefert; der
  private Schlüssel bleibt beim Hersteller (Abschnitt 7).
- **Sanfte Einführung:** Der Testmodus verhindert, dass eine frische Installation
  ohne Lizenz sofort unbenutzbar ist, ohne die Durchsetzung aufzuweichen.

## Konsequenzen

### Positiv

- Lizenzprüfung funktioniert im Self-Hosted-Betrieb ohne Internet (Paragraf 2).
- Sitzplatzgrenze ist kryptografisch gegen lokale Manipulation geschützt
  (Paragraf 11).
- Aktivierung und Mitarbeiteranlage sind revisionssicher (Kern-Invariante 2).
- Cloud-tauglich durch RLS je Mandant (Kern-Invariante 3).

### Negativ

- **Schlüsselverwaltung ist kritisch:** Der private Signaturschlüssel muss sicher
  verwahrt werden; ein Verlust bzw. eine Kompromittierung erfordert
  Schlüsselrotation und Neuausstellung aller Lizenzen. Der öffentliche Schlüssel
  muss beim Kunden korrekt konfiguriert werden, sonst bleibt der Mandant im
  Testmodus.
- **Keine Sperrung in Echtzeit:** Ein rein offline signiertes Token kann vor
  Ablauf nicht zentral widerrufen werden. Kurze Laufzeiten (`validUntil`) und –
  optional später – eine signierte Sperrliste mindern das Risiko.
- **Grace-Kontingent ist eine Politik:** Der Default (5) ist eine
  Produktentscheidung und muss betrieblich passend gesetzt werden.

### Neutral

- Das Feature setzt **Durchsetzung** um; das kommerzielle Lizenzmodell der
  Software (proprietär vs. offen) bleibt offen (Paragraf 19). Es wird keine
  `LICENSE`-Datei und keine OSI-Lizenz gewählt.
- Der Zählpunkt „aktiver Mitarbeitender" ist bewusst gewählt; alternative
  Metriken (z. B. Stempelnde im Monat) wären möglich, sind aber schwerer
  nachvollziehbar.
- Die Speicherung des Tokens erlaubt spätere Erweiterungen (Feature-Flags je
  Lizenz über `features`).

## Betrachtete Alternativen

- **Online-Lizenzserver (Phone-Home)** - Abgelehnt. Widerspricht dem
  Self-Hosted-Modell mit voller Datenhoheit und ohne Pflicht-Ausgangsverbindung
  (Paragraf 2). Wäre zudem ein Single Point of Failure für den Kundenbetrieb.
- **Nur ein DB-Feld `seats` ohne Signatur** - Abgelehnt. Ein self-hosteter
  Betreiber mit DB-Zugriff könnte die Grenze beliebig hochsetzen; keine
  Manipulationssicherheit (Paragraf 11).
- **JWT/JWS-Bibliothek (EdDSA)** - Erwogen. Funktional gleichwertig, bringt aber
  eine zusätzliche Abhängigkeit und JWT-spezifische Fallstricke (Alg-Verwirrung).
  Ein schlankes, explizites Ed25519-Detached-Format über Node-`crypto` genügt und
  reduziert Angriffsfläche und Abhängigkeiten.
- **RSA-Signaturen** - Erwogen. Ed25519 wurde wegen kleinerer Schlüssel/Signaturen
  und einfacherer, fehlerarmer Nutzung bevorzugt.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 2 - Betriebsmodelle (Self-Hosted ohne Pflicht-
  Internetzugang, eine Codebasis)
- `../ARCHITEKTUR.md` Paragraf 11 - Sicherheit (Manipulationssicherheit, minimale
  Rechte)
- `../ARCHITEKTUR.md` Paragraf 19 - offenes kommerzielles Lizenzmodell der
  Software (hier NICHT festgelegt)
- [ADR-0004: Mandantenfähigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md)
  - Lizenzdaten je Mandant unter RLS
- [ADR-0006: Audit-Ledger append-only](0006-audit-ledger-append-only.md) -
  license.activate / employee.create als unveränderliche Ereignisse
- [ADR-0007: OSI-/permissive Bausteine](0007-osi-permissive-bausteine.md) - keine
  Geheimnisse im Repo (privater Schlüssel beim Hersteller)
- [ADR-0010: Eine Codebasis, zwei Betriebsmodelle](0010-eine-codebasis-zwei-betriebsmodelle.md)
