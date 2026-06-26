# Verfahrensdokumentation (GoBD)

Diese Verfahrensdokumentation beschreibt das datenverarbeitende Verfahren von ZeitVault gemäß den Grundsätzen ordnungsmäßiger Buchführung (GoBD, vgl. [`GoBD.md`](GoBD.md), [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.3/9). Sie dokumentiert Inhalt, Aufbau, Ablauf und Kontrollen der Verarbeitung steuerlich relevanter Zeitdaten. Sie ist versioniert und wird mit dem Code geführt.

> Ersetzt keine Rechtsberatung; maßgeblich sind die offiziellen GoBD sowie fachkundige Beratung.

## 1. Überblick und Zweck

ZeitVault erfasst Arbeitszeiten revisionssicher und erzeugt steuerberater-/prüfungstaugliche Auswertungen und Exporte. Eine Codebasis bedient Self-Hosted und Cloud ([ADR-0010](../adr/0010-eine-codebasis-zwei-betriebsmodelle.md)); die Kontrollen sind in beiden Modellen identisch aktiv.

## 2. Belegfluss und Datenarten

- **Stempelungen (`stamp_events`)**: Roh-Ereignisse Kommen/Gehen/Pausen, append-only.
- **Zeiteinträge (`time_entries`)**: revisionierte Zeitsätze (Korrektur = neue Revision mit `previous_entry_id` und Begründung).
- **Abwesenheiten (`absence_requests`)**: Workflow mit Genehmigung.
- **Arbeitszeitkonten (`account_transactions`)** und **Projektzeit (`project_time_entries`)**: append-only Buchungen; Korrektur per Gegenbuchung.
- **Audit-Ledger (`audit_events`)**: hash-verkettetes, append-only Protokoll lohn-/sicherheitsrelevanter Aktionen.
- **Exporte (`export_jobs`)**: protokollierte, prüfsummengesicherte Auswertungs-/Lohnexporte.

## 3. Unveränderbarkeit und Nachvollziehbarkeit (Kern-Invarianten 1 & 2)

- **Append-only auf DB-Ebene:** `time_entries`, `stamp_events`, `account_transactions`, `project_time_entries` und `audit_events` werden per `BEFORE UPDATE/DELETE`-Trigger (`zeitvault_forbid_mutation`/`zeitvault_append_only`) gegen Veränderung gesperrt (Migrationen `0000`–`0011`). Tests erzwingen, dass UPDATE/DELETE fehlschlagen.
- **Korrekturen statt Überschreiben:** Eine Korrektur erzeugt einen neuen Datensatz (neue Revision bzw. Gegenbuchung); der Vorgänger bleibt erhalten.
- **Hash-Kette:** Jedes `audit_event` trägt `prev_hash`/`hash` (SHA-256) und eine je Mandant fortlaufende `sequence`; der getrennte Ledger-Dienst prüft die Kettenintegrität (`GET /audit/verify`).
- **Trennung der Schreibrechte:** Der Anwendungs-DB-User ist NICHT Superuser/BYPASSRLS; Audit-Events werden über die Dienstgrenze (HTTP) geschrieben, nicht direkt manipulierbar.

## 4. Mandantentrennung (Kern-Invariante 3)

Jede Tabelle führt `tenant_id`; Row-Level Security ist mit `ENABLE` **und** `FORCE ROW LEVEL SECURITY` aktiv. Der Tenant-Kontext wird je Transaktion über `set_config('app.tenant_id', …, true)` gesetzt; Policies vergleichen `tenant_id` mit `current_setting`. Integrationstests weisen die Cross-Tenant-Isolation und die `WITH CHECK`-Abweisung nach.

## 5. Verarbeitung und Kontrollen

- **Erfassung:** Stempelungen validieren den Statuswechsel (deklarative Folge Kommen/Pause/Gehen); ungültige Übergänge werden abgewiesen.
- **Bewertung:** Die versionierte ArbZG-/Zuschlags-Regel-Engine ([ADR-0009](../adr/0009-compliance-regel-engine.md)) bewertet Höchst-/Ruhezeiten, Pausen und Zuschläge deterministisch (Property-/Snapshot-Tests).
- **Genehmigung:** Abwesenheiten durchlaufen einen RBAC-geschützten Genehmigungs-Workflow.
- **Export:** GoBD-Prüfexport und generischer Lohnexport sind reproduzierbar (stabile Sortierung + SHA-256-Prüfsumme) und werden als `export_jobs` protokolliert; jeder Lauf erzeugt ein `export.run`-AuditEvent.

## 6. Aufbewahrung und Löschung

Aufbewahrungspflichtige Daten werden nicht hart gelöscht (Kern-Invariante 4): Bei Austritt/Löschanfrage werden Beschäftigte gesperrt und personenbezogene Stammdaten pseudonymisiert; das Löschdatum ergibt sich aus der Aufbewahrungsklasse (Retention-Engine, E3). Die harte Löschung GoBD-gebundener Daten erfolgt erst nach Fristablauf über ein kontrolliertes, protokolliertes Wartungsverfahren.

## 7. Zugriffskontrolle und Protokollierung

Authentifizierung über Keycloak/OIDC ([ADR-0008](../adr/0008-auth-keycloak-oidc-saml.md)); Autorisierung über RBAC (`@Roles`). Lohn-/sicherheitsrelevante Aktionen (Erfassung, Korrektur, Genehmigung, Buchung, Export, Sperrung/Pseudonymisierung) erzeugen ein AuditEvent.

## 8. Änderungswesen

Code und diese Dokumentation werden versioniert (Git, PR-Pflicht, grüne CI). Regeländerungen werden als neue, datierte Regelpakete eingepflegt; Architekturentscheidungen als ADRs.

## Verweise

- [`GoBD.md`](GoBD.md), [`DSGVO.md`](DSGVO.md), [`ARBZG.md`](ARBZG.md)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.3, 8, 9, 12
- [ADR-0004](../adr/0004-mandantenfaehigkeit-postgres-rls.md), [ADR-0006](../adr/0006-audit-ledger-append-only.md), [ADR-0009](../adr/0009-compliance-regel-engine.md)
