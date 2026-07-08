# CLAUDE.md – Verbindliche Konventionen und Leitplanken

> Dieses Dokument ist das **wichtigste Steuerungsdokument** für die Entwicklung von ZeitVault mit Claude Code. Die hier festgelegten Regeln sind **verbindlich**. Bei Konflikten zwischen dieser Datei und anderen Quellen gilt: Die Architektur ist in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) maßgeblich, die operativen Leitplanken in diesem Dokument. Lies vor jeder nicht-trivialen Aufgabe die einschlägigen Abschnitte von `docs/ARCHITEKTUR.md` (Paragraf-Verweise wie „Paragraf 7" beziehen sich auf `docs/ARCHITEKTUR.md`).

---

## 1. Projektüberblick

ZeitVault ist eine Enterprise-Zeiterfassung für den deutschen Markt (Hersteller: DariaTech), die aus **einer einzigen Codebasis** wahlweise **selbst gehostet (On-Premises)** oder als **Cloud-/SaaS-Dienst** betrieben wird. Das Produkt erfüllt deutsche arbeits-, steuer- und datenschutzrechtliche Anforderungen (ArbZG, GoBD, DSGVO/BDSG) und liefert revisionssichere Daten sowie Steuerberater-Exporte (DATEV). Die vollständige, verbindliche Architektur steht in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) – sie ist vor jeder Implementierungsaufgabe zu konsultieren.

---

## 2. Verbindlicher Stack (mit Versionen)

Alle Versionen sind **neuester stabiler Stand mit Langzeit-Support** (Stand Juni 2026) – bewusst **nicht** Bleeding-Edge (Begründung: ARCHITEKTUR Paragraf 5.1, [`docs/adr/0003-versions-und-update-strategie.md`](docs/adr/0003-versions-und-update-strategie.md)).

| Schicht | Technologie & Version | Hinweis |
|---|---|---|
| **Monorepo** | Turborepo **2.x** + pnpm **10** | NICHT Nx (geprüfte/abgelehnte Alternative, [`docs/adr/0002-typescript-monorepo-und-stack.md`](docs/adr/0002-typescript-monorepo-und-stack.md)) |
| **Laufzeit/Sprache** | **Node.js 24 LTS**, **TypeScript 5.x** | LTS-Linie, nie Current/ungerade Linien in Produktion |
| **Backend/API** | **NestJS 11** (modularer Monolith) | Audit-Ledger als **getrennter** NestJS-Service |
| **Web** | **Next.js 16** + **React 19.2** + **Tailwind CSS v4** + **shadcn/ui** | Admin + Self-Service, rollenabhängig |
| **Mobile** | **Expo SDK 56** / **React Native 0.85** | iOS + Android, offline-fähig |
| **Datenbank** | **PostgreSQL 18** | Row-Level Security (RLS) + Partitionierung |
| **ORM/Migrations** | **Drizzle** | NICHT Prisma (geprüfte/abgelehnte Alternative, [`docs/adr/0005-orm-drizzle.md`](docs/adr/0005-orm-drizzle.md)); Grund: Postgres-native Features (RLS, Partitionierung, append-only Trigger, eingeschränkte Grants) |
| **Auth/IdM** | **Keycloak 26.6** | OIDC + SAML, MFA-Pflicht für Admins |
| **Cache/Queues** | **Valkey 9.x** + **BullMQ** | statt Redis (Lizenzgrund) |
| **Objektspeicher** | EU-Provider-S3 (Cloud) bzw. **SeaweedFS/MinIO** (Self-Host) | WORM-Ablage fürs Ledger |
| **API-Stil** | REST + **OpenAPI 3.1** (extern), **tRPC** (intern Web↔API) | |
| **IaC** | **OpenTofu 1.12** | statt Terraform |
| **Secrets** | **OpenBao** / **SOPS** | statt HashiCorp Vault; keine Secrets im Repo |
| **Observability** | **OpenTelemetry** + Prometheus + Grafana/Loki | getrennte Ops-Tools, datensparsam |
| **CI/CD** | **GitHub Actions** | Lint → Test → Security-Scans → SBOM → Build → Cosign-Signatur → Release |

Detaillierte Versionsstrategie (LTS, Pinning, Renovate, EOL, CRA): [`docs/adr/0003-versions-und-update-strategie.md`](docs/adr/0003-versions-und-update-strategie.md).

---

## 3. Repo-Struktur (Paragraf 17)

```text
apps/{api,web,mobile,ledger}        # NestJS-API, Next.js-Web, Expo-Mobile, Audit-Ledger-Service
packages/{domain,types,ui,config}   # geteilte Domänenlogik, DTOs/Typen, UI/Designsystem, Konfig
infra/{docker,helm,tofu}            # Compose (Self-Host), Helm-Chart (K8s), OpenTofu (Cloud)
docs/{ARCHITEKTUR.md,adr,compliance,api}  # Architektur, ADRs, GoBD/DSGVO/DATEV, generierte OpenAPI
Root: CLAUDE.md, SECURITY.md, CONTRIBUTING.md, README.md
```

Schnelldrehende Frameworks (Web/Mobile) sind über `packages/` von der stabilen Domänenlogik entkoppelt (ARCHITEKTUR Paragraf 5.1).

---

## 4. KERN-INVARIANTEN (harte MUSS-Regeln)

Diese fünf Invarianten sind **nicht verhandelbar**. Jeder Code, jede Migration, jedes Review prüft ihre Einhaltung.

1. **TimeEntry wird NIEMALS überschrieben oder gelöscht.** Eine Korrektur erzeugt ausschließlich einen **neuen** Datensatz mit erhöhter `revision`, `previous_entry_id` (Verweis auf den Vorgänger) und einer Pflicht-`correction_reason`. *Begründung:* GoBD-Unveränderbarkeit und Nachvollziehbarkeit (ARCHITEKTUR Paragraf 3.3, Paragraf 8; [`docs/adr/0006-audit-ledger-append-only.md`](docs/adr/0006-audit-ledger-append-only.md)).

2. **Jede lohn-/sicherheitsrelevante Aktion erzeugt ein unveränderliches `AuditEvent`.** Erfassung, Korrektur, Genehmigung, Export und Rechteänderung schreiben in das **getrennte, append-only, hash-verkettete** Audit-Ledger (`prev_hash`-Kette). *Begründung:* Revisionssicherheit/GoBD-Vertrauensanker, manipulationsevident (ARCHITEKTUR Paragraf 9; [`docs/adr/0006-audit-ledger-append-only.md`](docs/adr/0006-audit-ledger-append-only.md)).

3. **Jede Tabelle führt `tenant_id`; RLS erzwingt Mandantentrennung auf DB-Ebene.** Kein Request wird ohne gültigen Tenant-Kontext (abgeleitet aus dem Auth-Token) bearbeitet. Self-Hosted läuft als `tenant_id = 'default'`, **RLS bleibt aktiv**. *Begründung:* Isolation auch bei App-Bug, eine Codebasis für beide Betriebsmodelle (ARCHITEKTUR Paragraf 7; [`docs/adr/0004-mandantenfaehigkeit-postgres-rls.md`](docs/adr/0004-mandantenfaehigkeit-postgres-rls.md)).

4. **Aufbewahrungspflichtige Daten werden nicht hart gelöscht.** Sie werden bei Austritt/Löschanfrage **gesperrt/pseudonymisiert** und erst nach Fristablauf automatisiert gelöscht (Retention-Engine je Mandant). *Begründung:* Spannungsfeld DSGVO-Löschung gegen steuerliche Aufbewahrungspflicht (GoBD), ARCHITEKTUR Paragraf 3.4, Paragraf 12.

5. **Datensparsamkeit: GPS/Geofencing ist standardmäßig DEAKTIVIERT.** Standort-/Verhaltensdaten werden nur nach Betriebsvereinbarung aktiviert; keine heimliche Überwachung. *Begründung:* Mitbestimmungspflicht bei technischen Überwachungseinrichtungen, BetrVG Paragraf 87 (ARCHITEKTUR Paragraf 3.4, Paragraf 12).

> Hinweis: Diese Zusammenfassung rechtlicher Rahmenbedingungen ersetzt keine Rechtsberatung; maßgeblich sind die offiziellen Quellen.

---

## 5. Arbeitsweise

- **Aktiver Branch:** `claude/zeitvault-architecture-ppqs2u`. Hier wird entwickelt.
- **`main` ist geschützt:** keine direkten Pushes, keine Force-Pushes.
- **PR-Pflicht:** Jede Änderung läuft über einen Pull Request mit Branch-Protection und Review (ARCHITEKTUR Paragraf 16).
- **Conventional Commits:** Commit-Subjects in **Englisch**, Format `type(scope): subject` (z. B. `feat(api): add time entry correction workflow`, `fix(ledger): enforce prev_hash continuity`). Erlaubte Typen u. a. `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`.
- **Ein ADR pro nicht-trivialer Entscheidung:** Architektur- und Technologieentscheidungen werden als Architecture Decision Record in [`docs/adr/`](docs/adr/) dokumentiert. Format und Index siehe Abschnitt 10 bzw. [`docs/adr/0000-adr-vorlage.md`](docs/adr/0000-adr-vorlage.md) und [`docs/adr/0001-adrs-verwenden.md`](docs/adr/0001-adrs-verwenden.md).
- **Major-Upgrades isolieren:** nie mit Feature-Arbeit mischen; eigene PRs, eigener Test-/Staging-Durchlauf (ARCHITEKTUR Paragraf 5.1).

---

## 6. Testpflicht

- **Drei Ebenen verpflichtend:** Unit-Tests (Logik/Funktionen), Integrationstests (DB, RLS-Policies, Service-Grenzen, Ledger-Schreibrechte), End-to-End-Tests (kritische Workflows: Stempeln, Korrektur, Genehmigung, Export).
- **Regel-/Compliance-Engine:** zusätzlich **Property-basierte Tests** und **Snapshot-Tests** gegen reale Szenarien (Höchst-/Ruhezeit, Pausen, Feiertage, Zuschläge). Die Engine ist deklarativ und vollständig testbar (ARCHITEKTUR Paragraf 10; [`docs/adr/0009-compliance-regel-engine.md`](docs/adr/0009-compliance-regel-engine.md)).
- **RLS-Tests sind Pflicht:** Für jede neue Tabelle/Query ein Test, der Cross-Tenant-Zugriff nachweislich verhindert.
- **Invarianten-Tests:** Versuch, ein `TimeEntry` zu überschreiben/löschen oder ein `AuditEvent` zu ändern, MUSS in einem Test fehlschlagen (auf DB-Ebene erzwungen).
- **Keine Merges ohne grüne CI.** Die CI-Suite (Lint → Test → Security-Scans → SBOM → Build → Signatur) ist Gate; rote CI blockiert den Merge ausnahmslos. Renovate-Update-PRs werden ebenfalls erst nach grüner CI gemergt (ARCHITEKTUR Paragraf 5.1, Paragraf 16).

---

## 7. Sicherheit und Datenschutz

- **Keine Secrets im Repo.** Verwaltung über **OpenBao** (oder SOPS für verschlüsselte Dateien). Keine Klartext-Zugangsdaten, API-Keys, Zertifikate oder `.env`-Geheimnisse committen (ARCHITEKTUR Paragraf 11; [`docs/adr/0007-osi-permissive-bausteine.md`](docs/adr/0007-osi-permissive-bausteine.md)).
- **Minimale Rechte (Least Privilege):** RBAC + ABAC (Standort/Abteilung); der Anwendungs-DB-User darf Audit-Events nur einfügen, nicht ändern/löschen. MFA-Pflicht für Admins ([`docs/adr/0008-auth-keycloak-oidc-saml.md`](docs/adr/0008-auth-keycloak-oidc-saml.md)).
- **GPS/Geofencing standardmäßig aus** (siehe Kern-Invariante 5).
- **Datensparsamkeit überall:** nur erheben/loggen, was nötig ist; Logs ohne unnötige Personenbezüge (ARCHITEKTUR Paragraf 12, Paragraf 16). Jeder lesende Zugriff auf personenbezogene Daten wird protokolliert.
- **Software-Lieferkette:** SAST/DAST, Dependency-/Container-Scanning, **SBOM** je Release, **signierte Images/Releases** (Cosign), reproduzierbare Builds.
- Details: [`SECURITY.md`](SECURITY.md).

---

## 8. Sprache

- **Deutsch:** alle UI-Texte und die Dokumentation (Markdown, sachlich-präzise, Enterprise-Ton, keine Emojis).
- **Englisch:** Code-Identifier (Variablen, Funktionen, Typen, Tabellen-/Spaltennamen) und **Commit-Subjects** (Conventional Commits).
- **Etablierte Fachbegriffe** bleiben englisch (RLS, OIDC, SBOM, `tenant_id`, Conventional Commits). Pfade/Befehle/Identifier in `Backticks`.

---

## 9. Was NIEMALS getan werden darf

- **NIEMALS** ein `TimeEntry` überschreiben oder löschen (Korrektur = neuer Datensatz, siehe Invariante 1).
- **NIEMALS** ein `AuditEvent` für eine lohn-/sicherheitsrelevante Aktion auslassen oder nachträglich ändern/löschen (siehe Invariante 2).
- **NIEMALS** `tenant_id` weglassen oder einen Request ohne gültigen Tenant-Kontext verarbeiten; RLS nie deaktivieren (siehe Invariante 3).
- **NIEMALS** konkrete **DATEV-Feldlayouts/Datensatzformate erfinden oder raten.** Maßgeblich ist ausschließlich die offizielle DATEV-Schnittstellenbeschreibung (in `docs/compliance/` zu hinterlegen); Mapping-Tabellen werden daraus abgeleitet (ARCHITEKTUR Paragraf 15.1).
- **NIEMALS** eine Software-Lizenz auswählen oder eine `LICENSE`-Datei behaupten. Das Lizenzmodell ist offene DariaTech-Produktentscheidung (ARCHITEKTUR Paragraf 19) – nur als **offen** kennzeichnen.
- **NIEMALS** EOL-Abhängigkeiten (End-of-Life-Komponenten) einführen; der EOL-Check in der CI bricht ab.
- **NIEMALS** Bleeding-Edge-/Current-Versionen in Produktion einsetzen (z. B. Node Current/ungerade Linien, PostgreSQL Beta). Nur LTS/neueste stabile Major (ARCHITEKTUR Paragraf 5.1).
- **NIEMALS** Secrets ins Repo committen (siehe Abschnitt 7).
- **NIEMALS** Rechtsberatung behaupten; rechtliche Zusammenfassungen erhalten den Disclaimer „ersetzt keine Rechtsberatung".

---

## 10. ADR-Index und -Format

Nicht-triviale Entscheidungen werden als ADR dokumentiert (relative Links in Cross-References verwenden):

- [`docs/adr/0000-adr-vorlage.md`](docs/adr/0000-adr-vorlage.md) – Vorlage
- [`docs/adr/0001-adrs-verwenden.md`](docs/adr/0001-adrs-verwenden.md) – Wir nutzen ADRs
- [`docs/adr/0002-typescript-monorepo-und-stack.md`](docs/adr/0002-typescript-monorepo-und-stack.md) – TypeScript-Monorepo und Stack (Turborepo + pnpm)
- [`docs/adr/0003-versions-und-update-strategie.md`](docs/adr/0003-versions-und-update-strategie.md) – Versions- und Update-Strategie (LTS, Pinning, Renovate, EOL, CRA)
- [`docs/adr/0004-mandantenfaehigkeit-postgres-rls.md`](docs/adr/0004-mandantenfaehigkeit-postgres-rls.md) – Mandantenfähigkeit via Postgres RLS
- [`docs/adr/0005-orm-drizzle.md`](docs/adr/0005-orm-drizzle.md) – ORM-Wahl: Drizzle
- [`docs/adr/0006-audit-ledger-append-only.md`](docs/adr/0006-audit-ledger-append-only.md) – Audit-Ledger: append-only, hash-verkettet
- [`docs/adr/0007-osi-permissive-bausteine.md`](docs/adr/0007-osi-permissive-bausteine.md) – OSI-/permissive Bausteine (Valkey/OpenTofu/OpenBao)
- [`docs/adr/0008-auth-keycloak-oidc-saml.md`](docs/adr/0008-auth-keycloak-oidc-saml.md) – Auth via Keycloak (OIDC/SAML)
- [`docs/adr/0009-compliance-regel-engine.md`](docs/adr/0009-compliance-regel-engine.md) – Versionierte Compliance-/Regel-Engine
- [`docs/adr/0010-eine-codebasis-zwei-betriebsmodelle.md`](docs/adr/0010-eine-codebasis-zwei-betriebsmodelle.md) – Eine Codebasis, zwei Betriebsmodelle
- [`docs/adr/0011-datev-mapping-geruest-generischer-export.md`](docs/adr/0011-datev-mapping-geruest-generischer-export.md) – DATEV-Mapping-Gerüst mit generischem Export
- [`docs/adr/0012-passkey-webauthn-login.md`](docs/adr/0012-passkey-webauthn-login.md) – Passkey-/WebAuthn-Login (passwortlos) über Keycloak
- [`docs/adr/0013-lizenzierung-pro-mitarbeiter.md`](docs/adr/0013-lizenzierung-pro-mitarbeiter.md) – Lizenzierung pro Mitarbeiter (signierte Sitzplätze, offline)
- [`docs/adr/0014-standort-pruefung-geofence-opt-in.md`](docs/adr/0014-standort-pruefung-geofence-opt-in.md) – Standort-Prüfung/Geofencing (standardmäßig aus, Opt-in)
- [`docs/adr/0015-terminal-nfc-fingerprint.md`](docs/adr/0015-terminal-nfc-fingerprint.md) – Terminal (NFC/Fingerabdruck), keine Server-Biometrie
- [`docs/adr/0016-einsatzort-work-location.md`](docs/adr/0016-einsatzort-work-location.md) – Einsatzort als Entität (work_location), Übersteuerung je Zeiteintrag, Bewertungs-Snapshot
- [`docs/adr/0017-stamp-events-als-ereignisquelle.md`](docs/adr/0017-stamp-events-als-ereignisquelle.md) – stamp_events als einzige Ereignisquelle, time_entries als deterministische Projektion
- [`docs/adr/0018-abrechnungstag-vs-zeitscheiben.md`](docs/adr/0018-abrechnungstag-vs-zeitscheiben.md) – Abrechnungstag (accounting_day) getrennt von minutengenauer Zeitscheiben-Splittung
- [`docs/adr/0019-unresolved-schichten.md`](docs/adr/0019-unresolved-schichten.md) – Unresolved-Zustandsmodell für nicht beendete Schichten (kein Implicit-Close, kein synthetisches Ereignis)

Einheitliches ADR-Format (Überschriften exakt):

```markdown
# ADR-NNNN: <Titel>
**Status:** Akzeptiert – 2026-06-26
## Kontext
## Entscheidung
## Begründung
## Konsequenzen
(Unterpunkte Positiv / Negativ / Neutral)
## Betrachtete Alternativen
## Verweise
(Paragrafen in ../ARCHITEKTUR.md sowie verwandte ADRs als relative Links)
```
