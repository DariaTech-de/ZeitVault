# apps/ledger

**Zweck:** Getrennter Audit-Ledger-Service von ZeitVault – der Vertrauensanker des Systems. Er ist von Anfang an als eigener Dienst getrennt, weil Revisionssicherheit eine harte Vertrauensgrenze braucht. Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteänderung) schreibt hier ein unveränderliches `AuditEvent`.

**Geplanter Tech-Stack:** eigener NestJS-Service auf Node.js 24 LTS / TypeScript 5.x (optional Go für hohen Durchsatz), PostgreSQL 18 mit append-only Triggern und eingeschränkten Grants via Drizzle, WORM-Ablage der periodischen Versiegelung in S3 (EU-Provider bzw. SeaweedFS/MinIO).

**Harte MUSS-Invarianten:** append-only (kein Update/Delete), Hash-Verkettung über `prev_hash` (manipulationsevidente Kette), periodische signierte Versiegelung in WORM-S3, getrennte Schreibrechte (Anwendungs-DB-User darf nur einfügen). Jeder Eintrag führt `tenant_id`; RLS bleibt aktiv.

**Status:** Phase-0-Gerüst vorhanden und verifiziert (9 Tests grün): append-only Drizzle-Schema + Migration [`src/db/migrations/0000_init.sql`](src/db/migrations/0000_init.sql) mit Append-only-Trigger und RLS, SHA-256-Hash-Verkettung (`src/ledger/hash.ts`) und Ketten-Verifikation (`src/ledger/chain.ts`, `GET /audit/verify`), Append-Endpunkt `POST /audit/events`. Periodische signierte WORM-Versiegelung und der optionale qualifizierte Zeitstempel folgen.

**Architektur:** siehe [Paragraf 9 – Revisionssicherheit & Audit](../../docs/ARCHITEKTUR.md#9-revisionssicherheit--audit-gobd-kern) und [ADR-0006 (Audit-Ledger)](../../docs/adr/0006-audit-ledger-append-only.md).
