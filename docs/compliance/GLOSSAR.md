# Compliance- und Fachbegriff-Glossar

> Dieses Glossar erläutert die in ZeitVault verwendeten Compliance-, Rechts- und Technikbegriffe knapp und einheitlich. Es dient als Referenz für Entwicklung, Betrieb und Kommunikation mit Kunden/Steuerberatern.
>
> Verbindliche Quelle für Architektur und Paragrafen-Verweise ist [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md). Die rechtlichen Kurzfassungen ersetzen keine Rechtsberatung; maßgeblich sind die jeweiligen Gesetzestexte, Verwaltungsvorgaben und die offizielle DATEV-Schnittstellenbeschreibung.

---

## A

**ABAC (Attribute-Based Access Control)**
Zugriffssteuerung anhand von Attributen wie Standort, Abteilung oder Beschäftigungsstatus. In ZeitVault ergänzt ABAC das rollenbasierte Modell (siehe RBAC), z. B. damit ein Vorgesetzter nur Daten der eigenen Abteilung sieht (§8, §11).

**ArbZG (Arbeitszeitgesetz)**
Bundesgesetz, das u. a. tägliche Höchstarbeitszeit, Ruhezeiten und Pausen regelt. ZeitVault prüft diese Grenzen live und im Stapellauf über die versionierte Regel-Engine (§3.2, §10).

**Ausfallschlüssel**
DATEV-seitige Kennzeichnung für Zeiten ohne Arbeitsleistung (z. B. Krankheit, Urlaub), die in der Lohnabrechnung gesondert behandelt werden. Interne Abwesenheitskategorien werden je Mandant über die Mapping-Engine auf Ausfallschlüssel abgebildet (§8, §15.1).

**AVV (Auftragsverarbeitungsvertrag)**
Nach Art. 28 DSGVO erforderlicher Vertrag zwischen Verantwortlichem und Auftragsverarbeiter über die weisungsgebundene Datenverarbeitung. Für den SaaS-Betrieb stellt DariaTech eine AVV-Vorlage inkl. Subunternehmerliste bereit (§3.4, §12).

## B

**BAG (Bundesarbeitsgericht)**
Höchstes deutsches Gericht für arbeitsrechtliche Streitigkeiten. Sein Beschluss vom 13.09.2022 (Az. 1 ABR 22/21) bestätigte die Pflicht zur systematischen Arbeitszeiterfassung und ist eine tragende Grundlage des Produkts (§3.1).

**BDSG (Bundesdatenschutzgesetz)**
Ergänzt und konkretisiert die DSGVO im nationalen Recht, u. a. beim Beschäftigtendatenschutz. Es ist neben der DSGVO Maßstab für die Verarbeitung von Mitarbeitenden-Daten in ZeitVault (§3.4).

**BetrVG (Betriebsverfassungsgesetz)**
Regelt die Mitbestimmung des Betriebsrats. Nach § 87 ist die Einführung technischer Überwachungseinrichtungen mitbestimmungspflichtig; deshalb sind GPS/Geofencing in ZeitVault standardmäßig deaktiviert und nur per Betriebsvereinbarung aktivierbar (§3.4, §12).

**BFSG (Barrierefreiheitsstärkungsgesetz)**
Setzt den European Accessibility Act in deutsches Recht um und verpflichtet bestimmte Produkte/Dienste zur Barrierefreiheit. ZeitVault erfüllt dies durch Umsetzung von WCAG 2.1 AA in Web und App (§3.5, §14).

**BSI C5 (Cloud Computing Compliance Criteria Catalogue)**
Anforderungskatalog des BSI für die Sicherheit von Cloud-Diensten, üblicherweise per Prüfbericht (Testat) nachgewiesen. Das Cloud-/SaaS-Angebot von ZeitVault ist auf C5 ausgerichtet (§11).

**BSI IT-Grundschutz**
Methodik und Baustein-Katalog des BSI für ein strukturiertes Informationssicherheits-Managementsystem. Dient ZeitVault als Leitlinie für die Sicherheitsarchitektur (§11).

**BYOK (Bring Your Own Key)**
Modell, bei dem der Kunde die kryptografischen Schlüssel selbst verwaltet bzw. einbringt, statt sie dem Anbieter zu überlassen. In ZeitVault optional im Cloud-Betrieb und Teil der Schlüsselverwaltung (§2, §11).

## C

**CRA (Cyber Resilience Act)**
EU-Verordnung mit verpflichtenden Cybersicherheitsanforderungen für Produkte mit digitalen Elementen (u. a. Schwachstellenmanagement, Update-Pflichten, SBOM, Meldewege), wirksam ab Dezember 2027. ZeitVault ist als ausgeliefertes Produkt betroffen; SBOM, signierte Releases und EOL-Disziplin sind die Vorbereitung (§5.1).

## D

**DATEV**
Genossenschaftliches Software- und Rechenzentrumsunternehmen, dessen Lohn-/Buchhaltungslösungen in deutschen Steuerkanzleien Quasi-Standard sind. ZeitVault liefert DATEV-kompatible Exporte; maßgeblich sind ausschließlich die offiziellen DATEV-Schnittstellenbeschreibungen (§15.1).

**DATEV LODAS**
Lohn- und Gehaltsabrechnungsprogramm von DATEV. ZeitVault unterstützt den Datei-Export für LODAS (Bewegungs-, bei Bedarf Stammdaten) zum Import in der Kanzlei (§15.1).

**DATEV Lohn und Gehalt**
Weiteres Lohnabrechnungsprogramm von DATEV. ZeitVault exportiert auch hierfür die abrechnungsrelevanten Daten je Abrechnungszeitraum (§15.1).

**DSFA (Datenschutz-Folgenabschätzung)**
Nach Art. 35 DSGVO erforderliche Risikoanalyse bei voraussichtlich hohem Risiko für Betroffene; Beschäftigten-Zeit-/Standortdaten sind regelmäßig DSFA-pflichtig. ZeitVault liefert vorbereitende Bausteine dafür (§3.4, §12).

**DSGVO (Datenschutz-Grundverordnung)**
EU-Verordnung 2016/679 zum Schutz personenbezogener Daten. Sie steuert in ZeitVault u. a. Rechtsgrundlagen, Betroffenenrechte, Datensparsamkeit sowie das Spannungsfeld Löschung gegen Aufbewahrung (§3.4, §12).

## E

**eAU (elektronische Arbeitsunfähigkeitsbescheinigung)**
Verfahren, bei dem Arbeitsunfähigkeitsdaten elektronisch bei der Krankenkasse abgerufen werden statt per Papier-„gelbem Schein“. ZeitVault bindet die eAU über ein zertifiziertes Gateway als gekapselten Integrationsdienst an (§3.5, §15.3).

**Envelope-Encryption**
Verschlüsselungsverfahren, bei dem Daten mit einem Datenschlüssel verschlüsselt werden, der seinerseits durch einen übergeordneten Schlüssel (KMS/HSM) geschützt („gewrappt“) ist. ZeitVault nutzt Envelope-Encryption für Daten at rest, kombinierbar mit BYOK (§11).

**EuGH (Rs. C-55/18)**
Urteil des Europäischen Gerichtshofs von 2019 („CCOO“), wonach Arbeitgeber ein objektives, verlässliches und zugängliches System zur Arbeitszeiterfassung einrichten müssen. Es ist eine zentrale Begründung der Arbeitszeiterfassungspflicht und damit des Produkts (§3.1).

## F

**Feiertagskalender**
Datengrundlage der je Bundesland gültigen gesetzlichen Feiertage, abgeleitet aus dem Standort. Er steuert Soll-/Arbeitszeitberechnung sowie Zuschlags- und Dokumentationsregeln und liegt als versioniertes Regelpaket vor (§3.2, §4, §10).

## G

**Gleitzeit**
Arbeitszeitmodell mit flexibler Lage der Arbeitszeit innerhalb definierter Rahmen, dessen Saldo über ein Arbeitszeitkonto geführt wird. ZeitVault bildet Gleitzeitregeln als Teil des `WorkTimeModel` ab (§4, §8).

**GoBD (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und Unterlagen in elektronischer Form)**
Verwaltungsvorgabe des BMF zu Unveränderbarkeit, Nachvollziehbarkeit, Vollständigkeit und Aufbewahrung steuerrelevanter elektronischer Daten. Sie begründet das Korrekturprinzip (kein Überschreiben) und die Revisionssicherheit von ZeitVault (§3.3, §9).

## H

**HSM (Hardware Security Module)**
Manipulationsgeschützte Hardware zur Erzeugung, Speicherung und Nutzung kryptografischer Schlüssel. In ZeitVault optional für die Schlüsselverwaltung, insbesondere im On-Premises-Betrieb (§2, §11).

## I

**ISO/IEC 27001**
Internationaler Standard für Informationssicherheits-Managementsysteme (ISMS) mit Zertifizierungsmöglichkeit. ZeitVault ist auf ISO/IEC-27001-Readiness ausgelegt (§11).

## J

**JArbSchG (Jugendarbeitsschutzgesetz)**
Gesetz mit besonderen Schutzregeln für die Arbeitszeit von Jugendlichen (z. B. engere Höchst- und Ruhezeiten). In ZeitVault als optionales Regelpaket der Compliance-Engine abbildbar (§3.2, §10).

## K

**Kostenstelle**
Betriebswirtschaftliche Einheit, der Kosten (auch Personalkosten/Arbeitszeit) zugerechnet werden. ZeitVault führt Kostenstellen je Abteilung und bildet sie für Auswertungen sowie DATEV-Export ab (§4, §8, §15.1).

## L

**Lohnart**
DATEV-/abrechnungsseitiger Schlüssel, der eine Vergütungs- oder Abzugsart kennzeichnet (z. B. Grundlohn, Überstunden, Zuschlag). Interne Kategorien werden je Mandant über die Mapping-Engine auf DATEV-Lohnarten abgebildet (§8, §15.1).

## M

**MFA (Multi-Faktor-Authentifizierung)**
Anmeldung mit mindestens zwei unabhängigen Faktoren (z. B. Passwort plus Einmalcode/Passkey). In ZeitVault über Keycloak umgesetzt und für Admins verpflichtend (§5, §11).

**MiLoG (Mindestlohngesetz)**
Gesetz zum gesetzlichen Mindestlohn mit besonderen Aufzeichnungspflichten in bestimmten Branchen (Zoll-Prüfung). ZeitVault erfasst mindestlohnrelevante Stunden automatisch (§3.5).

## O

**OIDC (OpenID Connect)**
Auf OAuth 2.0 aufbauendes Authentifizierungsprotokoll zur Anmeldung und zum Austausch von Identitätsinformationen. ZeitVault nutzt OIDC über Keycloak; der Tenant-Kontext wird aus dem Token abgeleitet (§5, §7, §11).

## P

**Partitionierung**
Aufteilung großer Datenbanktabellen in physische Teilbereiche (z. B. nach Zeitraum), um Performance und Wartbarkeit zu verbessern. ZeitVault setzt PostgreSQL-Partitionierung u. a. für umfangreiche Zeit- und Audit-Daten ein (§5, §7).

**Pseudonymisierung**
Verarbeitung personenbezogener Daten so, dass sie ohne zusätzliche Informationen keiner Person mehr zugeordnet werden können. ZeitVault pseudonymisiert aufbewahrungspflichtige Daten bei Austritt, statt sie hart zu löschen, bis die Frist abläuft (§3.4, §12).

## R

**RBAC (Role-Based Access Control)**
Zugriffssteuerung über Rollen, denen Berechtigungen zugeordnet sind. In ZeitVault Basis des Rechtemodells, ergänzt um ABAC-Attribute (§8, §11).

**Revisionssicherheit**
Eigenschaft eines Systems, Aufzeichnungen unveränderbar, vollständig und nachvollziehbar aufzubewahren. ZeitVault erreicht sie durch das nie überschriebene `TimeEntry`, versionierte Korrekturen und den append-only, hash-verketteten Audit-Ledger (§3.3, §9).

**RLS (Row-Level Security)**
PostgreSQL-Mechanismus, der den Zeilenzugriff über Policies auf DB-Ebene einschränkt. ZeitVault erzwingt damit die Mandantentrennung anhand der `tenant_id`; RLS bleibt auch im Self-Hosted-Betrieb (`tenant_id = default`) aktiv (§7).

**RoPA/VVT (Records of Processing Activities / Verzeichnis von Verarbeitungstätigkeiten)**
Nach Art. 30 DSGVO geführtes Verzeichnis aller Verarbeitungstätigkeiten; RoPA ist die englische Bezeichnung des VVT. ZeitVault stellt ein generierbares VVT/RoPA bereit (§3.4, §12).

**Ruhezeit**
Zusammenhängende Mindestpause zwischen zwei Arbeitseinsätzen, nach ArbZG grundsätzlich 11 Stunden. ZeitVault prüft die Einhaltung live und protokolliert Verstöße (§3.2, §10).

## S

**SAML (Security Assertion Markup Language)**
XML-basiertes Protokoll für Single Sign-On und Föderation von Identitäten, häufig im Enterprise-Umfeld. ZeitVault unterstützt SAML neben OIDC über Keycloak (§5, §11).

**SBOM (Software Bill of Materials)**
Maschinenlesbares Inventar aller Softwarekomponenten und Abhängigkeiten eines Produkts. ZeitVault erzeugt je Release eine SBOM in der CI/CD-Pipeline, auch als CRA-Vorbereitung (§5.1, §16).

**SemVer (Semantic Versioning)**
Versionsschema `MAJOR.MINOR.PATCH`, das die Art der Änderung (inkompatibel/funktional/Fehlerkorrektur) signalisiert. ZeitVault-Releases sind nach SemVer versioniert und signiert (§16).

**Sollzeit**
Die im Arbeitszeitmodell hinterlegte vertraglich geschuldete Arbeitszeit, gegen die Ist-Zeiten und Salden berechnet werden. Sie ist Teil des versionierten `WorkTimeModel` (§4, §8).

## T

**TR-02102**
Technische Richtlinie des BSI mit Empfehlungen zu kryptografischen Verfahren und Schlüssellängen. ZeitVault richtet seine Kryptografie an TR-02102 aus (§11).

**TR-03116**
Technische Richtlinie des BSI zu kryptografischen Vorgaben, u. a. für TLS-Konfigurationen. ZeitVault konfiguriert TLS gemäß TR-03116 (§11).

## U

**Überstunden**
Über die Sollzeit hinaus geleistete Arbeitszeit, die in einem Arbeitszeitkonto auf-/abgebaut wird. ZeitVault führt den Überstundensaldo und kann ihn als eigene Lohnart/Zuschlag exportieren (§4, §8, §15.1).

## V

**Vertrauensarbeitszeit**
Arbeitszeitmodell ohne feste Kontrolle der Lage der Arbeitszeit, das aber nicht von der Dokumentationspflicht entbindet. ZeitVault erfasst auch hier Zeiten, sodass Verstöße gegen Höchst-/Ruhezeiten erkennbar bleiben (§3.1, §4).

## W

**WCAG 2.1 AA (Web Content Accessibility Guidelines)**
International anerkannter Standard für barrierefreie Webinhalte; die Konformitätsstufe AA ist der übliche rechtliche Maßstab. Web und App von ZeitVault erfüllen WCAG 2.1 AA, auch zur Umsetzung des BFSG (§3.5, §14).

**WORM (Write Once, Read Many)**
Speicherprinzip, bei dem Daten nach dem Schreiben nicht mehr verändert oder gelöscht werden können. ZeitVault legt die periodischen Versiegelungs-Anker des Audit-Ledgers in WORM-Objektspeicher ab (§9, §11).

## Z

**Zuschlag**
Erhöhter Vergütungsanteil für besondere Arbeitszeiten (z. B. Nacht-, Sonn- und Feiertagsarbeit). ZeitVault bewertet zuschlagsrelevante Zeiten über die Regel-Engine und bildet sie als Lohnart für den DATEV-Export ab (§3.2, §10, §15.1).

---

*Hinweis: Die rechtlichen Erläuterungen in diesem Glossar fassen Rahmenbedingungen für die technische Planung zusammen und ersetzen keine Rechtsberatung. Verbindlich sind die jeweiligen Gesetzestexte, Verwaltungsvorgaben sowie die offizielle DATEV-Schnittstellenbeschreibung.*
