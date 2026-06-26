# Zertifizierungs- und Prüf-Readiness (Pentest, BSI C5, ISO 27001)

Diese Übersicht ordnet die im System umgesetzten Kontrollen den gängigen Prüf-/Zertifizierungsrahmen zu und benennt offene, organisatorisch zu beschaffende Punkte. Sie ist eine Readiness-Hilfe, keine Zertifizierungsaussage.

> Ersetzt keine Zertifizierung oder Rechtsberatung. BSI C5 und ISO/IEC 27001 erfordern eine unabhängige Prüfung/Auditierung.

## 1. Umgesetzte Kontrollen (Auszug)

| Bereich | Umsetzung | Nachweis |
|---|---|---|
| Mandantentrennung | RLS `ENABLE`+`FORCE` je Tabelle, Tenant-Kontext je Transaktion | Integrationstests (`rls.itest` u. a.) |
| Integrität/Revisionssicherheit | append-only Trigger, hash-verkettetes Audit-Ledger (`/audit/verify`) | `append-only.itest`, Ledger-Tests |
| Korrekturkonzept | neue Revision/Gegenbuchung statt Überschreiben | Domain-/Integrationstests |
| Authentifizierung | Keycloak/OIDC, MFA-Pflicht für Admins | [ADR-0008](../adr/0008-auth-keycloak-oidc-saml.md) |
| Autorisierung | RBAC (`@Roles`), least privilege (kein BYPASSRLS) | RolesGuard, CI-Setup |
| Lieferkette | SBOM (SPDX), Trivy-Scan, Cosign-Signatur/Attestation | `.github/workflows/release.yml`, `ci.yml` |
| Härtung Laufzeit | non-root, read-only FS, dropped capabilities | `infra/helm` Security-Context |
| Datenresidenz | EU/DE technisch erzwungen | `infra/tofu` `data_residency` |
| Aufbewahrung/Löschung | Retention-Engine (Sperren/Pseudonymisieren/Frist) | Migration `0010`, RetentionModule |
| Datensparsamkeit | GPS/Geofencing standardmäßig aus; eAU ohne Diagnose | Kern-Invariante 5, eAU-Gerüst |
| Beobachtbarkeit | OpenTelemetry/Prometheus/Loki/Grafana (datensparsam) | `infra/docker/docker-compose.observability.yml` |

## 2. Zuordnung zu Rahmenwerken (Mapping-Hinweise)

- **BSI C5:** Kriterien u. a. zu Identitäts-/Zugriffsmanagement, Kryptografie, Betrieb, Portabilität, Compliance — adressiert durch OIDC/RBAC, Transportverschlüsselung, SBOM/Signatur, EU-Residenz, Audit-Ledger.
- **ISO/IEC 27001 (Annex A / 2022):** Zugriffssteuerung (A.5/A.8), Protokollierung (A.8.15), Kryptografie (A.8.24), Lieferkette/Entwicklung (A.8.25 ff.), Datenschutz/PII (A.5.34).
- **Pentest-Readiness:** definierte Angriffsfläche (REST/tRPC, Auth-Grenzen), Tenant-Isolationstests, Eingabevalidierung (zentraler Zod-Filter → HTTP 400), Secrets außerhalb des Repos.

## 3. Offene / organisatorisch zu beschaffende Punkte

- **Feldverschlüsselung sensibler Felder / BYOK:** vorgesehen (E3), Schlüsselverwaltung über OpenBao/KMS noch zu finalisieren.
- **eAU-Gateway:** zertifizierter externer Dienst (SV-Meldeverfahren) zu beauftragen; Adapter ist vorbereitet.
- **DATEV-Format:** offizielle Schnittstellenbeschreibung zu beschaffen (siehe [`DATEV-REFERENZ.md`](DATEV-REFERENZ.md)).
- **AVV/Subunternehmerliste, externer Pentest, C5-/27001-Audit:** organisatorisch durchzuführen.
- **GHAS/Dependency-Graph:** für Dependency-Review zu aktivieren.

## Verweise

- [`VERFAHRENSDOKUMENTATION.md`](VERFAHRENSDOKUMENTATION.md), [`DSFA.md`](DSFA.md), [`VVT-ROPA.md`](VVT-ROPA.md)
- [`../../SECURITY.md`](../../SECURITY.md), [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 11, 16
