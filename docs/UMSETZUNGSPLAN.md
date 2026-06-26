# ZeitVault – Umsetzungsplan (sequenziert bis zur Vollständigkeit)

> Verbindliche Build-Reihenfolge von „Gerüst" zu „funktional vollständigem MVP/Beta".
> Jede Stufe ist ein eigenständiges, **verifizierbares** Inkrement (Commit + grüne CI).
> Architektur-Grundlage: [`ARCHITEKTUR.md`](ARCHITEKTUR.md); Leitplanken: [`../CLAUDE.md`](../CLAUDE.md).
> Am Ende steht die **Große Prüfung** (Abschnitt „Abnahme").

> **Umsetzungsstand (2026-06-26):** Stufen A–F (Phasen 0–5) sind umgesetzt und je Inkrement verifiziert; die **Große Prüfung (Stufe G)** wurde gegen einen frisch migrierten Stand über den vollständigen Stack durchgeführt und ist – im Rahmen des im Code Umsetzbaren – bestanden. Bericht: [`ABNAHME.md`](ABNAHME.md). Verbleibende offene Punkte sind ausschließlich organisatorisch/extern (siehe „Organisatorisch blockierte Punkte").

## Vorgehensprinzipien (warum diese Reihenfolge)

1. **Sicherheit zuerst.** Echte Authentifizierung/Autorisierung kommt vor jedem weiteren Feature – alles Spätere hängt am Tenant-/Rollen-Kontext.
2. **Tests als Gate früh.** Automatisierte Integrationstests (RLS, Append-only, Ledger) wandern in die CI, bevor neue Fachlogik darauf aufbaut.
3. **Fachlogik in Abhängigkeitsreihenfolge.** Stammdaten → Erfassung → Korrektur → Abwesenheit/Konten → Reporting/Export.
4. **Infrastruktur/Härtung nach den Features**, die sie betreiben soll.
5. **Externe Integrationen zuletzt** – viele sind organisatorisch blockiert (siehe unten) und können hier nur vorbereitet werden.
6. **Invarianten in jedem Schritt** (CLAUDE.md §4): TimeEntry/Stamp append-only, AuditEvent-Pflicht, `tenant_id`+RLS, Sperren statt Löschen, GPS standardmäßig aus.

## Ist-Stand (Basis)

- `apps/api` (NestJS): Stempel-Backend, Drizzle-Schema + RLS-Migrationen, Audit-Anbindung – **real gegen Postgres verifiziert**.
- `apps/ledger` (NestJS): append-only, hash-verkettet – verifiziert.
- `packages/domain`: ArbZG-Regel-Engine + Stamping-Logik (37 Unit-Tests).
- `apps/web` (Next.js): Self-Service-Stempeln + Live-ArbZG – gebaut/gerendert.
- `apps/mobile`: **nur Platzhalter**.
- Auth: **Stub über HTTP-Header** (nicht produktionssicher).
- CI: Unit-Tests + Lint/Typecheck/Build/SBOM/CodeQL; **keine** Integrationstests.

---

## Stufe A – Fundament absichern (Phase 0 abschließen)

- **A1 Echte Auth (Keycloak/OIDC).** API verifiziert OIDC-Zugriffstokens (JWKS), leitet `tenant_id`, `userId`, Rollen aus den Claims ab; Header-Stub entfällt. Web-Login via OIDC (PKCE). Keycloak-Realm-Import in Compose.
  - *DoD:* unautorisierte Requests → 401; gültiges Token → Stempeln möglich; Rollen im `TenantContext`; Tests für Token-/Claim-Verarbeitung.
- **A2 Integrationstests in CI.** RLS-Cross-Tenant, Append-only-Trigger, Ledger-Hash-Kette und Stempel-E2E gegen echtes Postgres (Service-Container in GitHub Actions).
  - *DoD:* CI-Job „integration" grün; schlägt fehl, wenn RLS/Trigger fehlen.
- **A3 Stammdaten-Bootstrap & Migrations-Hygiene.** Tenant/Employee/WorkTimeModel-Seed, RBAC-Rollen/Permissions-Tabellen, sauberes Migrations-/Seed-Vorgehen.
  - *DoD:* `pnpm seed` legt Demo-Mandant + Mitarbeitende an; Login + Stempeln Ende-zu-Ende.

## Stufe B – Phase 1 (MVP Zeiterfassung) vervollständigen

- **B1 Korrektur-Workflow.** Korrektur von Stempelungen/Zeiteinträgen als append-only Korrekturereignis mit Pflicht-Begründung; im Web sichtbar; Tages-/Zeitraumansicht.
- **B2 Admin-Konsole (Web).** Mitarbeitende/Abteilungen/Standorte, Stempelungen einsehen, Verstoßreport; rollenbasierte Sichtbarkeit (RBAC/ABAC).
- **B3 Mobile-App (Expo).** Ein-Tap-Stempeln, Tagesübersicht, **Offline-Queue + idempotenter Sync**, OIDC-Login, biometrisches Entsperren. (Verifikation hier per Build/Typecheck + Expo-Web-Target.)
- **B4 Arbeitszeitmodelle & Feiertage.** WorkTimeModel (Sollzeiten/Gleitzeit/Pausenregeln, versioniert), Feiertagskalender je Bundesland; Anbindung an die Regel-Engine.

## Stufe C – Phase 2 (Abwesenheit & Konten)

- **C1 Abwesenheiten + Genehmigungs-Workflow** (Urlaub/Krankheit/Sonderurlaub, mehrstufig, Vertretung).
- **C2 Arbeitszeitkonten** (Überstunden/Gleitzeit/Urlaubssaldo) + Kontoauszug + Buchungstransaktionen.
- **C3 Zuschläge/Feiertage in der Regel-Engine** inkl. Property-/Snapshot-Tests gegen reale Szenarien.

## Stufe D – Phase 3 (Export & Reporting)

- **D1 Reporting.** Stundenzettel-PDF, Saldenliste, Verstoßreport, Auswertungen je Abteilung/Kostenstelle.
- **D2 GoBD-Prüfexport.** Maschinell auswertbarer Export; jeder Export als `ExportJob` mit Prüfsumme, reproduzierbar/protokolliert.
- **D3 DATEV-Mapping-Engine (Gerüst) + generisches CSV/Excel.** Mapping interne Kategorie → Lohnart/Ausfallschlüssel/Kostenstelle.
  - **Blockiert:** konkrete DATEV-Feldlayouts erst mit offizieller Schnittstellenbeschreibung (CLAUDE.md §9). Bis dahin nur Struktur + generischer Export.

## Stufe E – Phase 4 (Cloud-Härtung)

- **E1 Deployment real.** Helm-Chart (Deployments/Probes/Secrets via OpenBao), OpenTofu-Module; CD-Pipeline Build→Scan→SBOM→Cosign→Release.
- **E2 SaaS & Observability.** Registrierungs-/Abrechnungs-Feature-Flags; OpenTelemetry/Prometheus/Grafana/Loki verdrahtet.
- **E3 Sicherheitshärtung.** Feldverschlüsselung sensibler Felder, Rate-Limiting/WAF-Konfiguration, BYOK-Vorbereitung, Retention-/Lösch-Engine (sperren/pseudonymisieren).

## Stufe F – Phase 5 (Zertifizierung & Ausbau)

- **F1 eAU-Integrationsdienst (Gerüst).** Gekapselte, asynchrone Schnittstelle. **Blockiert:** zertifiziertes Gateway extern.
- **F2 Erweiterungsmodule.** Dienst-/Schichtplanung, Projektzeit.
- **F3 Compliance-Dokumentation.** Generierte Verfahrensdokumentation, VVT/RoPA/DSFA ausgefüllt; Readiness für Pentest/BSI C5/ISO 27001.

---

## Organisatorisch blockierte Punkte (von außen, nicht im Code lösbar)

- Offizielle **DATEV-Schnittstellenbeschreibung** + Registrierung (Berater-/Mandantennummer).
- Zertifiziertes **eAU-Gateway**/Provider.
- **Cloud-Provider-Zugänge**, KMS/HSM, Domains, Markenrecherche (DPMA/EUIPO), **Lizenzmodell**.
- Formale **Penetrationstests** und **Zertifizierungen** (C5/ISO) durch Dritte.

Diese werden im Code nur **vorbereitet** (Schnittstellen, Mappings-Gerüst, Readiness-Checklisten), nicht „fertiggestellt".

---

## Abnahme – „Die Große Prüfung"

Abgenommen wird gegen diese Checkliste (Stufe G):

1. **Alle Tests grün:** Unit + Integration + E2E + Property/Snapshot; CI vollständig grün.
2. **Invarianten erzwungen (DB-Nachweis):** TimeEntry/Stamp append-only (UPDATE/DELETE schlägt fehl), AuditEvent je relevanter Aktion, RLS verhindert Cross-Tenant nachweislich.
3. **Ledger-Integrität:** Hash-Kette verifizierbar, periodische Versiegelung in WORM.
4. **Kritische Workflows manuell abgenommen:** Anmeldung (OIDC), Stempeln, Korrektur, Genehmigung, Export – über den vollständigen Compose-Stack.
5. **Sicherheit/Lieferkette:** Security-Scans + SBOM + signierte Releases; keine Secrets im Repo; keine EOL-Abhängigkeiten.
6. **Compliance:** ArbZG-Regelwerk getestet; GoBD-Aufbewahrung/Retention; DSGVO-Betroffenenrechte als Funktionen; Disclaimer vorhanden.
7. **Betrieb:** Self-Hosted (Compose) und Cloud (Helm) aus identischen Images; Health/Readiness; Backups/DR dokumentiert.

> Hinweis: Diese Datei wird im Projektverlauf gepflegt; erledigte Stufen werden markiert. Rechtliche Zusammenfassungen ersetzen keine Rechtsberatung.
