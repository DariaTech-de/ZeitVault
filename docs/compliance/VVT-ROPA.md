# Verzeichnis von Verarbeitungstätigkeiten (VVT / RoPA, Art. 30 DSGVO)

Dieses Verzeichnis dokumentiert die Verarbeitungstätigkeiten von ZeitVault gemäß Art. 30 DSGVO. Es ist eine ausfüllbare Vorlage je Mandant/Verantwortlichem; die folgenden Einträge spiegeln die im System umgesetzten Verarbeitungen wider (vgl. [`DSGVO.md`](DSGVO.md), [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 12).

> Ersetzt keine Rechtsberatung. Verantwortlicher, Kontaktdaten des DSB, konkrete Empfänger und Drittlandbezüge sind je Einsatz zu ergänzen.

## Allgemeine Angaben (je Mandant zu ergänzen)

- **Verantwortlicher:** _<Name, Anschrift>_
- **Datenschutzbeauftragte:r:** _<Kontakt>_
- **Auftragsverarbeiter (SaaS):** Hosting (EU/DE), KMS, ggf. eAU-Gateway — siehe AVV/Subunternehmerliste.
- **Datenresidenz:** EU/DE (technisch erzwungen, vgl. `infra/tofu` Variable `data_residency`).

## V1 — Arbeitszeiterfassung

- **Zweck:** Erfassung/Bewertung der Arbeitszeit (gesetzliche Aufzeichnungspflicht).
- **Rechtsgrundlage:** Art. 6 (1) c (rechtliche Verpflichtung, ArbZG/Nachweispflicht) i. V. m. § 26 BDSG.
- **Betroffene/Datenarten:** Beschäftigte; Stempel-/Zeitdaten, Personalnummer, Anzeigename.
- **Empfänger:** intern (Vorgesetzte/Administration), Steuerberatung über Export.
- **Löschfrist:** GoBD-Aufbewahrung (Retention-Engine, Sperren/Pseudonymisieren, dann Löschung).
- **TOMs:** RLS, append-only, Audit-Ledger, RBAC, Verschlüsselung im Transport.

## V2 — Abwesenheits- und Genehmigungsverwaltung

- **Zweck:** Urlaub/Sonderurlaub/Krankheit (ohne Diagnose), Genehmigungs-Workflow.
- **Rechtsgrundlage:** Art. 6 (1) b/c i. V. m. § 26 BDSG.
- **Datenarten:** Abwesenheitsart, Zeitraum, Status; **keine Diagnosedaten**.

## V3 — Lohnrelevante Auswertung und Export (inkl. DATEV-Mapping)

- **Zweck:** Stundenzettel, Salden, Verstoßreport, GoBD-/Lohnexport.
- **Rechtsgrundlage:** Art. 6 (1) c (steuerliche Pflichten).
- **Empfänger:** Steuerberatung/Lohnabrechnung (Export); DATEV-Format blockiert bis offizielle Schnittstellenbeschreibung.
- **Besonderheit:** Exporte protokolliert (`export_jobs`) mit Prüfsumme.

## V4 — eAU-Abruf (Gesundheitsdaten)

- **Zweck:** elektronische Arbeitsunfähigkeitsbescheinigung (Status/Referenz).
- **Rechtsgrundlage:** Art. 9 (2) b DSGVO i. V. m. § 26 (3) BDSG (Sozialrecht).
- **Datenarten:** Zeitraum, Status, externe Referenz — **kein Diagnoseinhalt** (Datensparsamkeit).
- **Besonderheit:** besonders schützenswerte Daten (Art. 9); Übertragung über zertifiziertes externes Gateway (organisatorisch zu beschaffen).

## V5 — Audit-Protokollierung

- **Zweck:** Revisionssicherheit/Manipulationsevidenz lohn-/sicherheitsrelevanter Aktionen.
- **Rechtsgrundlage:** Art. 6 (1) c/f (Nachweis-/Kontrollpflichten).
- **Datenarten:** Aktion, Akteur-ID, Subjektbezug, Zeitstempel, Hash-Kette.

## V6 — Identitäts- und Zugriffsverwaltung

- **Zweck:** Authentifizierung/Autorisierung (Keycloak/OIDC), RBAC/ABAC.
- **Rechtsgrundlage:** Art. 6 (1) b/c/f.

## Nicht standardmäßig aktiv

- **Standort-/Geofencing-Daten:** standardmäßig DEAKTIVIERT (Kern-Invariante 5); Aktivierung nur nach Betriebsvereinbarung (BetrVG § 87), dann eigener VVT-Eintrag.

## Verweise

- [`DSGVO.md`](DSGVO.md), [`DSFA.md`](DSFA.md), [`VERFAHRENSDOKUMENTATION.md`](VERFAHRENSDOKUMENTATION.md)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 12
