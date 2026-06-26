# apps/api

**Zweck:** Backend von ZeitVault als modularer Monolith (NestJS 11) – kapselt die fachlichen Domänen-Module (Zeiterfassung, Compliance-/Regel-Engine, Abwesenheit & Konten, Workflow/Genehmigungen, Reporting, Export, Verwaltung & Mandanten) und stellt die externe REST-/OpenAPI-3.1-Schnittstelle sowie internes tRPC für das Web-Frontend bereit.

**Geplanter Tech-Stack:** NestJS 11 (Express 5, SWC) auf Node.js 24 LTS / TypeScript 5.x, PostgreSQL 18 mit Row-Level Security (RLS) und Partitionierung, ORM/Migrations via Drizzle, Auth über Keycloak 26.6 (OIDC/SAML), Valkey 9.x + BullMQ für Cache/Queues.

**Harte MUSS-Invarianten:** `tenant_id` auf jeder Tabelle, RLS erzwingt Mandantentrennung; kein Request ohne gültigen Tenant-Kontext aus dem Auth-Token (Self-Hosted = `tenant_id 'default'`, RLS bleibt aktiv). `TimeEntry` wird niemals überschrieben oder gelöscht – Korrektur = neuer Datensatz mit erhöhter `revision`, `previous_entry_id` und Pflicht-`correction_reason`. Jede lohn-/sicherheitsrelevante Aktion erzeugt ein `AuditEvent` im getrennten Ledger-Service.

**Status:** Platzhalter – Implementierung folgt in Phase 0/1 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 6 – Systemarchitektur](../../docs/ARCHITEKTUR.md#6-systemarchitektur) sowie [ADR-0004 (RLS)](../../docs/adr/0004-mandantenfaehigkeit-postgres-rls.md) und [ADR-0005 (Drizzle)](../../docs/adr/0005-orm-drizzle.md).
