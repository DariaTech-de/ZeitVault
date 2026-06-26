# Abnahmebericht – „Die Große Prüfung" (Stufe G)

Dieser Bericht dokumentiert die Abnahme von ZeitVault gegen die Checkliste in [`UMSETZUNGSPLAN.md`](UMSETZUNGSPLAN.md) (Abschnitt „Die Große Prüfung"). Die Stufen A–F (Phasen 0–5) sind umgesetzt; die Abnahme wurde gegen einen frisch migrierten Datenbankstand und über den vollständigen Dienst-Stack (API + getrennter Audit-Ledger) ausgeführt.

> Stand: 2026-06-26. Rechtliche Zusammenfassungen ersetzen keine Rechtsberatung.

## Zusammenfassung

| # | Prüfpunkt | Ergebnis |
|---|---|---|
| 1 | Alle Tests grün (Unit/Integration/Property/Snapshot) | **bestanden** – 131 Tests grün |
| 2 | Invarianten erzwungen (DB-Nachweis) | **bestanden** |
| 3 | Ledger-Integrität (Hash-Kette verifizierbar) | **bestanden** |
| 4 | Kritische Workflows E2E über den Stack | **bestanden** |
| 5 | Sicherheit/Lieferkette (Scans, SBOM, Signatur, keine Secrets, keine EOL) | **bestanden** |
| 6 | Compliance (ArbZG, GoBD-Retention, DSGVO-Funktionen, Disclaimer) | **bestanden** |
| 7 | Betrieb (Self-Hosted + Cloud aus identischen Images, Health/Readiness) | **bestanden** |

## 1. Tests

- **Unit/Property/Snapshot:** `@zeitvault/domain` 86, `@zeitvault/api` 14, `@zeitvault/ledger` 9 – alle grün.
- **Integration (echtes Postgres, frische DB):** 22 grün – RLS-Trennung, `WITH CHECK`, Append-only (UPDATE/DELETE schlagen fehl) für `time_entries`, `stamp_events`, `account_transactions`, `project_time_entries`, `export_jobs`.
- **Build/Typecheck/Lint:** vollständig grün.
- Alle 13 API-Migrationen sowie die Ledger-Migration wurden auf einer **frisch angelegten, nicht-Superuser-eigenen** Datenbank fehlerfrei angewandt (RLS damit autoritativ).

## 2. Invarianten (DB-Nachweis)

- **Invariante 1 (Unveränderbarkeit):** Korrektur einer Stempelung erzeugt einen neuen Datensatz; der Vorgänger bleibt erhalten (nachgewiesen: zwei `clock_in`-Zeilen, davon eine als Korrektur mit Begründung). UPDATE/DELETE auf append-only Tabellen schlagen per Trigger fehl (Integrationstests).
- **Invariante 2 (Audit):** Jede relevante Aktion erzeugt ein `AuditEvent` – nachgewiesen für `time.clock_in/break_start/break_end/clock_out/correct`, `absence.request/approve`, `account.post`, `project_time.book`, `eau.request`, `export.run`, `retention.block/anonymize`.
- **Invariante 3 (Mandantentrennung):** RLS `ENABLE`+`FORCE` je Tabelle; Cross-Tenant-Zugriff und Fremd-Insert nachweislich verhindert.
- **Invariante 4 (Aufbewahrung):** Sperren + Pseudonymisierung statt Hartlöschung; Löschdatum aus Aufbewahrungsklasse.
- **Invariante 5 (Datensparsamkeit):** GPS/Geofencing standardmäßig deaktiviert; eAU ohne Diagnoseinhalt.

## 3. Ledger-Integrität

`GET /audit/verify?tenantId=default` liefert über den gesamten E2E-Lauf `{"valid":true,"brokenAtSequence":null}`. Die Hash-Kette (`prev_hash`/`hash`, SHA-256) ist durchgängig konsistent; die WORM-/Objektspeicher-Ablage ist infrastrukturseitig vorgesehen.

## 4. Kritische Workflows (E2E über den vollständigen Stack)

Stempeln (Kommen/Pause/Gehen), Korrektur (neue Revision), Abwesenheitsantrag + Genehmigung (inkl. RBAC: Mitarbeiter-Genehmigung → 403), Kontobuchung, Projektzeit, eAU-Abruf (Gateway gekapselt/Platzhalter), GoBD-Export (reproduzierbare Prüfsumme über zwei Läufe), generischer Lohnexport, Retention (Sperren/Pseudonymisieren), Reporting (Verstoßreport/Saldenliste) – alle erfolgreich. Anmeldung produktiv über OIDC; lokal/Abnahme im `AUTH_MODE=dev` mit header-basiertem Kontext.

## 5. Sicherheit / Lieferkette

- Keine `.env`-, Schlüssel- oder Zertifikatsdateien und kein privates Schlüsselmaterial im Repo.
- CI-Workflows vorhanden: `ci.yml` (Lint/Typecheck/Test/Build + SBOM), `release.yml` (Build → Trivy-Scan → SBOM (SPDX) → Cosign-Signatur/Attestation → Release), `codeql.yml`, `dependency-review.yml`, `integration.yml`.
- Versionen LTS/aktuell: Node 24, PostgreSQL 18 (keine EOL-Komponenten).

## 6. Compliance

- ArbZG-Regelwerk und Zuschläge durch Unit-/Property-/Snapshot-Tests abgesichert.
- GoBD-Aufbewahrung über die Retention-Engine; DSGVO-Betroffenenrechte als Funktionen (Sperren, Pseudonymisieren, Fälligkeitsliste).
- Verfahrensdokumentation, VVT/RoPA, DSFA und Readiness-Mapping vorhanden; 8 Dokumente tragen den Rechtsberatungs-Disclaimer.

## 7. Betrieb

- Self-Hosted (Docker Compose) und Cloud (Helm) nutzen **dieselben** Images (`Dockerfile.api`/`Dockerfile.ledger`); Unterschiede nur über Konfiguration/Values (ADR-0010).
- Health-/Readiness-Endpunkte (`/api/health`, `/health`) und Probes im Helm-Chart vorhanden; gehärteter Security-Context.
- Observability-Stack (OpenTelemetry/Prometheus/Loki/Grafana) als Overlay; Datenresidenz EU/DE in OpenTofu erzwungen; Backup-Retention parametrisiert.

## Organisatorisch blockierte Punkte (außerhalb des Codes)

Im Code nur **vorbereitet**, nicht „fertiggestellt": offizielle DATEV-Schnittstellenbeschreibung + Registrierung, zertifiziertes eAU-Gateway, Cloud-Zugänge/KMS/Domains/Lizenzmodell, formale Pentests und C5-/ISO-27001-Zertifizierungen durch Dritte (siehe [`compliance/ZERTIFIZIERUNG-READINESS.md`](compliance/ZERTIFIZIERUNG-READINESS.md)).

## Ergebnis

Die Checkliste der Großen Prüfung ist – im Rahmen des im Code Umsetzbaren – **vollständig erfüllt**. Offene Punkte sind ausschließlich organisatorisch/extern und als Schnittstellen, Gerüste und Readiness-Checklisten vorbereitet.
