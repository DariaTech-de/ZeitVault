# Sicherheitsrichtlinie (Security Policy)

Diese Richtlinie beschreibt, wie Sicherheitsschwachstellen in **ZeitVault** (Hersteller: DariaTech) gemeldet werden, welche Versionen Sicherheitsunterstützung erhalten und welche Sicherheitsarchitektur dem Produkt zugrunde liegt. Sie gilt für beide Betriebsmodelle (Self-Hosted On-Premises und Cloud/SaaS) aus der einen gemeinsamen Codebasis.

---

## 1. Meldung von Schwachstellen

Wir nehmen Sicherheitsmeldungen ernst und behandeln sie vertraulich. Bitte melden Sie vermutete Schwachstellen **nicht über öffentliche GitHub-Issues, Pull Requests, Diskussionen oder soziale Medien**, sondern über den vertraulichen Kanal unten.

### 1.1 Kontakt

- **E-Mail:** `security@dariatech.de` *(zu bestätigen)*

> Hinweis: Die obige Adresse ist ein Platzhalter und wird vor dem ersten öffentlichen Release verbindlich bestätigt (inkl. optionalem PGP-Schlüssel für verschlüsselte Meldungen sowie ggf. `security.txt` gemäß RFC 9116).

Bitte geben Sie in Ihrer Meldung möglichst an:

- betroffene Komponente (`apps/api`, `apps/web`, `apps/mobile`, `apps/ledger`, Infrastruktur) und Version/Commit,
- Betriebsmodell (Self-Hosted oder Cloud/SaaS),
- eine reproduzierbare Schritt-für-Schritt-Beschreibung sowie erwartetes vs. tatsächliches Verhalten,
- Einschätzung der Auswirkung (z. B. Mandantentrennung, Audit-Integrität, personenbezogene Daten) und ggf. einen Proof-of-Concept.

### 1.2 Coordinated Disclosure

Wir folgen dem Prinzip der **koordinierten Offenlegung (Coordinated Disclosure)**:

- Es erfolgt **keine öffentliche Offenlegung vor Bereitstellung eines Fixes** (bzw. einer wirksamen Gegenmaßnahme) und einer angemessenen Update-Frist für betroffene Betreiber.
- Wir koordinieren den Zeitpunkt der Veröffentlichung gemeinsam mit der meldenden Person und nennen sie auf Wunsch in den Release Notes (Credit).
- Bitte sehen Sie von Tests ab, die Verfügbarkeit, Integrität oder Vertraulichkeit fremder Daten gefährden (kein Zugriff auf fremde Mandanten/`tenant_id`, keine Exfiltration personenbezogener Daten, keine Denial-of-Service-Tests gegen Produktivsysteme).
- Handeln in gutem Glauben im Rahmen dieser Richtlinie wird nicht als feindlicher Akt gewertet (Safe-Harbor-Grundsatz).

### 1.3 Reaktionsfristen (Richtwerte)

Die folgenden Fristen sind **grobe Zielwerte (Service-Level-Ziele)**, keine vertraglichen Zusagen; die konkrete Behandlung richtet sich nach Schweregrad (CVSS) und Ausnutzbarkeit:

| Schritt | Zielwert |
|---|---|
| Empfangsbestätigung der Meldung | innerhalb von **2 Werktagen** |
| Erste Einschätzung (Triage, Schweregrad) | innerhalb von **5 Werktagen** |
| Fix / Gegenmaßnahme bei kritischer Schwachstelle | so schnell wie möglich, Richtwert **30 Tage** |
| Fix / Gegenmaßnahme bei mittlerer/niedriger Schwere | Richtwert **90 Tage** |
| Koordinierte Veröffentlichung (Advisory) | nach Bereitstellung des Fixes, abgestimmt |

Für das **Cloud/SaaS-Angebot** werden Fixes durch DariaTech kontinuierlich ausgerollt. Für **Self-Hosted-Installationen** stellen wir signierte Releases und ein Security-Advisory bereit; das Einspielen liegt in der Verantwortung des Betreibers (siehe Update-Strategie, [ADR-0003](docs/adr/0003-versions-und-update-strategie.md)).

---

## 2. Unterstützte Versionen

ZeitVault wird nach **SemVer** versioniert; Releases sind signiert (Cosign) und mit einer SBOM versehen (siehe Abschnitt 3).

- Sicherheitsupdates werden grundsätzlich für die **aktuell unterstützten Versionslinien** bereitgestellt – in der Regel die neueste Major-Linie sowie die zuletzt unterstützte (LTS-)Vorgängerlinie.
- **End-of-Life-(EOL-)Linien** des Produkts erhalten **keine Sicherheitsupdates** mehr. Ein Upgrade auf eine unterstützte Linie ist erforderlich.
- Das Produkt enthält **keine EOL-Komponenten** in der Laufzeit (z. B. EOL-Node.js- oder -PostgreSQL-Linien). Die CI bricht ab, wenn eine Laufzeit oder Abhängigkeit ihr End-of-Life erreicht (EOL-Check).
- Versions-, LTS-, Pinning- und EOL-Disziplin sind verbindlich in [ADR-0003 – Versions- und Update-Strategie](docs/adr/0003-versions-und-update-strategie.md) geregelt (Begründung u. a. in [§5.1 der Architektur](docs/ARCHITEKTUR.md)).

| Versionslinie | Status | Sicherheitsupdates |
|---|---|---|
| Aktuelle Major-Linie | Unterstützt | Ja |
| Vorherige (LTS-)Linie | Unterstützt (eingeschränkt) | Ja |
| Ältere Linien | EOL | Nein – Upgrade erforderlich |

> Die konkrete Zuordnung von Versionsnummern zu Status wird mit dem ersten öffentlichen Release in den Release Notes geführt.

---

## 3. Zusammenfassung der Sicherheitsarchitektur

Die folgende Übersicht fasst die in [§11 der Architektur](docs/ARCHITEKTUR.md) festgelegte Sicherheitsarchitektur zusammen. Maßgeblich ist das Architekturdokument.

### 3.1 Rahmenwerke und Standards

- **BSI IT-Grundschutz** als Leitlinie.
- **BSI C5** für das Cloud-/SaaS-Angebot.
- **ISO/IEC 27001**-Readiness (Vorbereitung auf Zertifizierungsfähigkeit).
- Kryptografie nach **BSI TR-02102**.
- TLS-Konfiguration nach **BSI TR-03116**.

### 3.2 Verschlüsselung

- **AES-256 at rest** für Datenbank und Objektspeicher.
- **TLS 1.3 in transit**.
- **Envelope-Encryption** über ein KMS; optional **kundenverwaltete Schlüssel (BYOK)** und **HSM** für On-Premises-Betrieb.
- **Feldverschlüsselung** für besonders sensible Felder (z. B. eAU-Bezug).

### 3.3 Identität und Zugriff

- **OIDC/SAML** über **Keycloak** (siehe [ADR-0008](docs/adr/0008-auth-keycloak-oidc-saml.md)).
- **MFA-Pflicht für Admins**.
- **RBAC + ABAC** (Attribute wie Standort/Abteilung).
- Prinzip der **minimalen Rechte** (least privilege).

### 3.4 Netzwerk

- **Zero-Trust-Segmentierung**.
- **WAF** (Web Application Firewall).
- striktes **Rate-Limiting**.
- **keine direkte Datenbank-Exposition** nach außen.

### 3.5 Secrets

- **OpenBao** / **SOPS** zur Secret-Verwaltung; **automatische Rotation**; **keine Secrets im Repository** (siehe [ADR-0007](docs/adr/0007-osi-permissive-bausteine.md)).

### 3.6 Software-Lieferkette

- **SAST**, **DAST** sowie **Dependency-** und **Container-Scanning** in der CI.
- **SBOM** je Release.
- **signierte Images/Releases** via **Cosign**.
- **reproduzierbare Builds** (Lockfiles committen, Base-Images per Digest pinnen).

### 3.7 Audit und Revisionssicherheit

- **Jeder lesende Zugriff auf personenbezogene Daten wird protokolliert.**
- Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteänderung) erzeugt ein unveränderliches `AuditEvent` im getrennten, append-only, hash-verketteten Audit-Ledger (siehe [§9 der Architektur](docs/ARCHITEKTUR.md) und [ADR-0006](docs/adr/0006-audit-ledger-append-only.md)).
- Mandantentrennung wird auf DB-Ebene über **Row-Level Security (RLS)** mit `tenant_id` erzwungen (siehe [ADR-0004](docs/adr/0004-mandantenfaehigkeit-postgres-rls.md)).

### 3.8 Betrieb

- getestete, verschlüsselte **Backups** nach **3-2-1**.
- dokumentierter **Disaster-Recovery-(DR-)Plan**.
- regelmäßige **Penetrationstests vor Major-Releases**.

---

## 4. Cyber Resilience Act (CRA)

Der EU **Cyber Resilience Act** stellt **ab Dezember 2027** EU-weit verpflichtende Anforderungen an Produkte mit digitalen Elementen (u. a. Schwachstellenmanagement, Update-Pflichten, SBOM, Meldewege). **ZeitVault ist als ausgeliefertes Produkt davon betroffen** – insbesondere im Self-Hosted-Modell, in dem Container-Images und Releases an Betreiber ausgeliefert werden.

Die folgenden, bereits in dieser Richtlinie und in der Architektur verankerten Maßnahmen dienen zugleich der **CRA-Vorbereitung**:

- **SBOM** je Release (Nachvollziehbarkeit der Software-Bestandteile),
- **signierte Releases/Images** (Cosign) für Integrität und Herkunftsnachweis,
- geordneter, dokumentierter **Update- und Schwachstellenmanagement-Prozess** (siehe Abschnitt 1 und [ADR-0003](docs/adr/0003-versions-und-update-strategie.md)),
- **EOL-Disziplin** (keine produktiven EOL-Komponenten, definierte Versionsunterstützung – siehe Abschnitt 2).

---

*Hinweis: Diese Richtlinie fasst sicherheits- und prozessbezogene Festlegungen für die technische Umsetzung zusammen und ersetzt keine Rechtsberatung. Für die verbindliche Auslegung regulatorischer Anforderungen (z. B. CRA, DSGVO) sind die offiziellen Quellen bzw. fachkundige Beratung maßgeblich.*
